// Storyset (Rafiki) illustrations. <Storyset> inlines a token-coloured SVG from src/assets/storyset so the art
// follows the theme; <StorysetAnimated> shows the hand-exported GIF of the same name where one exists and falls
// back to the SVG under reduced motion or on the dark theme (transparent GIFs halo on dark surfaces).
import { useEffect, useState, type CSSProperties } from 'react';
import { STORYSET_DARK_OK, type StorysetName } from '../../assets/storyset/names';
import { useMediaQuery } from '../../lib/useMedia';
import { useResolvedTheme } from '../../lib/theme';

export type { StorysetName };

// one lazy chunk per illustration; the URL map is eager because it only holds strings (the GIF bytes load on <img>)
const SVGS = import.meta.glob<string>('/src/assets/storyset/*.svg', { query: '?raw', import: 'default' });
const GIFS = import.meta.glob<string>('/src/assets/storyset/animated/*.gif', { query: '?url', import: 'default', eager: true });
const svgKey = (name: string) => `/src/assets/storyset/${name}.svg`;
const gifKey = (name: string, dark?: boolean) => `/src/assets/storyset/animated/${name}${dark ? '.dark' : ''}.gif`;

const cache = new Map<string, string>();
const pending = new Map<string, Promise<string>>();
function load(name: string): Promise<string> {
  const hit = cache.get(name);
  if (hit !== undefined) return Promise.resolve(hit);
  let p = pending.get(name);
  if (!p) {
    const loader = SVGS[svgKey(name)];
    if (!loader) {
      if (import.meta.env.DEV) console.warn(`[storyset] no illustration named "${name}" — add it to scripts/storyset.manifest.json and run pnpm storyset`);
      return Promise.resolve('');
    }
    p = loader().then((svg) => { cache.set(name, svg); pending.delete(name); return svg; });
    pending.set(name, p);
  }
  return p;
}

export interface StorysetProps {
  name: StorysetName;
  /** Rendered box (square — every Storyset scene is 500×500). */
  width?: number | string;
  /** Keep the soft background blob behind the scene. Off for compact and decorative uses. */
  bg?: boolean;
  /** Present when the art carries meaning (hero images); decorative art stays aria-hidden. */
  label?: string;
  className?: string;
  style?: CSSProperties;
}

export function Storyset({ name, width = 200, bg = true, label, className = '', style }: StorysetProps) {
  const [svg, setSvg] = useState(() => cache.get(name));
  useEffect(() => {
    let live = true;
    load(name).then((s) => { if (live) setSvg(s); });
    return () => { live = false; };
  }, [name]);
  return (
    <span
      className={`storyset ${bg ? '' : 'storyset--no-bg'} ${className}`.trim()}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      style={{ width, height: width, ...style }}
      dangerouslySetInnerHTML={svg ? { __html: svg } : undefined}
    />
  );
}

/** The GIF export of `name` when it exists and motion is welcome; otherwise the static SVG. */
export function StorysetAnimated({ name, width = 240, bg = true, label, className = '', style, darkOk }: StorysetProps & { darkOk?: boolean }) {
  const reduced = useMediaQuery('(prefers-reduced-motion: reduce)');
  const dark = useResolvedTheme() === 'dark';
  const url = dark
    ? GIFS[gifKey(name, true)] ?? ((darkOk || STORYSET_DARK_OK.has(name)) ? GIFS[gifKey(name)] : undefined)
    : GIFS[gifKey(name)];
  if (reduced || !url) return <Storyset name={name} width={width} bg={bg} label={label} className={className} style={style} />;
  return (
    <img
      src={url}
      width={typeof width === 'number' ? width : undefined}
      height={typeof width === 'number' ? width : undefined}
      alt={label ?? ''}
      aria-hidden={label ? undefined : true}
      loading="lazy"
      decoding="async"
      className={`storyset-gif ${className}`.trim()}
      style={{ width, height: width, ...style }}
    />
  );
}

/** True when a GIF export exists for `name` (any theme). Lets callers size a slot before choosing static/animated. */
export const hasAnimated = (name: StorysetName) => !!GIFS[gifKey(name)] || !!GIFS[gifKey(name, true)];
