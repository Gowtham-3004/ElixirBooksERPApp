// Small SVG charts for dashboards: a sparkline for KPI tiles and a grouped bar chart with hairline
// gridlines and a hover tooltip. Both measure their container so they render at real pixel sizes.
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(el.clientWidth);
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

/** Catmull-Rom → cubic bezier so a handful of points reads as a curve rather than a zig-zag. */
function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return '';
  let d = `M${pts[0].x},${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) / 6, c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6, c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C${c1x},${c1y} ${c2x},${c2y} ${p2.x},${p2.y}`;
  }
  return d;
}

/** A trend line for a KPI tile. Accent by default; pass `auto` to colour by first→last direction. */
export function Sparkline({ values, width: widthProp = 88, height = 28, tone = 'accent', title }: { values: number[]; /** a number, or 'auto' to fill the container */ width?: number | 'auto'; height?: number; tone?: 'auto' | 'accent' | 'good' | 'bad' | 'neutral'; title?: string }) {
  const id = useRef(`sp${Math.random().toString(36).slice(2, 8)}`).current;
  const [ref, measured] = useWidth<HTMLDivElement>();
  const vals = values.filter((v) => Number.isFinite(v));
  const width = widthProp === 'auto' ? measured : widthProp;
  if (vals.length < 2) return null;
  if (widthProp === 'auto' && width === 0) return <div ref={ref} style={{ width: '100%', height }} />;
  const min = Math.min(...vals), max = Math.max(...vals);
  const span = max - min || Math.abs(max) || 1;
  const pad = 2;
  const pts = vals.map((v, i) => ({ x: pad + (i / (vals.length - 1)) * (width - pad * 2), y: pad + (1 - (v - min) / span) * (height - pad * 2) }));
  const t = tone === 'auto' ? (vals[vals.length - 1] >= vals[0] ? 'good' : 'bad') : tone;
  const color = t === 'good' ? 'var(--good)' : t === 'bad' ? 'var(--danger)' : t === 'neutral' ? 'var(--ink-4)' : 'var(--accent)';
  const line = smoothPath(pts);
  const last = pts[pts.length - 1];
  const svg = (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="sparkline" aria-hidden={title ? undefined : true} role={title ? 'img' : undefined}>
      {title && <title>{title}</title>}
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity=".18" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line} L${last.x},${height} L${pts[0].x},${height} Z`} fill={`url(#${id})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last.x} cy={last.y} r="2.25" fill={color} />
    </svg>
  );
  return widthProp === 'auto' ? <div ref={ref} style={{ width: '100%', height, lineHeight: 0 }}>{svg}</div> : svg;
}

export interface BarSeries { label: string; values: number[]; color?: string; /** highlight only the last category in full colour */ emphasizeLast?: boolean }

/** Grouped bars over hairline gridlines. Values are formatted with `format` for the axis and tooltip. */
export function BarChart({ categories, series, height = 180, format, onSelect, legend = true }: { categories: string[]; series: BarSeries[]; height?: number; format: (v: number) => string; onSelect?: (index: number) => void; legend?: boolean }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  useEffect(() => { setHover(null); }, [categories.length]);
  const padL = 44, padR = 8, padT = 10, padB = 24;
  const innerW = Math.max(0, width - padL - padR), innerH = height - padT - padB;
  const max = Math.max(1, ...series.flatMap((s) => s.values));
  const ticks = 4;
  const step = niceStep(max / ticks);
  const top = Math.ceil(max / step) * step;
  const y = (v: number) => padT + innerH - (v / top) * innerH;
  const groupW = categories.length ? innerW / categories.length : 0;
  const barGap = 3;
  const barW = Math.max(4, Math.min(28, (groupW * 0.62 - barGap * (series.length - 1)) / series.length));
  const groupInner = barW * series.length + barGap * (series.length - 1);
  const palette = ['var(--accent)', 'var(--warn-line)', 'var(--good-line)', 'var(--ink-4)'];
  return (
    <div ref={ref} style={{ position: 'relative', width: '100%' }}>
      {legend && (
        <div style={{ display: 'flex', gap: 14, fontSize: 12, color: 'var(--ink-3)', marginBottom: 6, justifyContent: 'flex-end' }}>
          {series.map((s, i) => <span key={s.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: s.color ?? palette[i % palette.length] }} />{s.label}</span>)}
        </div>
      )}
      {width > 0 && (
        <svg width={width} height={height} style={{ display: 'block', overflow: 'visible' }} onMouseLeave={() => setHover(null)}>
          {Array.from({ length: ticks + 1 }).map((_, i) => {
            const v = (top / ticks) * i;
            return (
              <g key={i}>
                <line x1={padL} x2={width - padR} y1={y(v)} y2={y(v)} stroke="var(--hairline)" />
                <text x={padL - 8} y={y(v)} textAnchor="end" dominantBaseline="middle" fontSize="10" fill="var(--ink-4)" style={{ fontVariantNumeric: 'tabular-nums' }}>{format(v)}</text>
              </g>
            );
          })}
          {categories.map((c, ci) => {
            const gx = padL + ci * groupW + (groupW - groupInner) / 2;
            const active = hover === ci;
            return (
              <g key={c} style={{ cursor: onSelect ? 'pointer' : undefined }} onMouseEnter={() => setHover(ci)} onClick={() => onSelect?.(ci)}>
                <rect x={padL + ci * groupW} y={padT} width={groupW} height={innerH} fill={active ? 'var(--surface-3)' : 'transparent'} rx="4" />
                {series.map((s, si) => {
                  const v = s.values[ci] ?? 0;
                  const h = Math.max(v > 0 ? 2 : 0, (v / top) * innerH);
                  const isLast = ci === categories.length - 1;
                  const fill = s.color ?? palette[si % palette.length];
                  const dim = s.emphasizeLast && !isLast && !active;
                  return <rect key={s.label} x={gx + si * (barW + barGap)} y={padT + innerH - h} width={barW} height={h} rx="2" fill={fill} opacity={dim ? 0.4 : 1} style={{ transition: 'opacity var(--dur-fast) var(--ease)' }} />;
                })}
                <text x={padL + ci * groupW + groupW / 2} y={height - 6} textAnchor="middle" fontSize="11" fill={active ? 'var(--ink)' : 'var(--ink-3)'}>{c}</text>
              </g>
            );
          })}
        </svg>
      )}
      {hover !== null && width > 0 && (
        <div className="chart-tip" style={{ left: Math.min(width - 160, Math.max(0, padL + hover * groupW + groupW / 2 - 80)) }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>{categories[hover]}</div>
          {series.map((s, i) => (
            <div key={s.label} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--ink-3)' }}><span style={{ width: 8, height: 8, borderRadius: 2, background: s.color ?? palette[i % palette.length] }} />{s.label}</span>
              <span className="money">{format(s.values[hover] ?? 0)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function niceStep(raw: number): number {
  const p = Math.pow(10, Math.floor(Math.log10(raw || 1)));
  const n = raw / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
}

/** Layout helper: a chart card header with title/subtitle and an optional right slot. */
export function ChartHeader({ title, sub, right }: { title: ReactNode; sub?: ReactNode; right?: ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
      <div style={{ minWidth: 0 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink)', marginBottom: 2 }}>{title}</h3>
        {sub && <p style={{ fontSize: 12, color: 'var(--ink-4)' }}>{sub}</p>}
      </div>
      {right}
    </div>
  );
}
