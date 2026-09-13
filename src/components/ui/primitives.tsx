import type { CSSProperties, ReactNode } from 'react';
import { fmtMoney, fmtMoneyCompact, fmtDate, fmtDateTime } from '../../lib/format';

// ── Status badge (design-system §8 taxonomy → badge class) ─────────────────

const BADGE_MAP: Record<string, string> = {
  Draft: 'badge-draft', Ready: 'badge-ready', Future: 'badge-draft', New: 'badge-submitted', Pending: 'badge-submitted', 'Pending Approval': 'badge-submitted', 'Awaiting Approval': 'badge-submitted',
  Submitted: 'badge-submitted', Confirmed: 'badge-submitted', Queued: 'badge-queued', 'In Progress': 'badge-in-progress', 'In Transit': 'badge-in-progress', Running: 'badge-in-progress', Planned: 'badge-submitted', Released: 'badge-in-progress', Sent: 'badge-submitted', Invited: 'badge-submitted', Probation: 'badge-submitted', Generated: 'badge-submitted', Scanning: 'badge-submitted', Trial: 'badge-trial', 'Dry-run': 'badge-submitted',
  Returned: 'badge-returned', Partial: 'badge-partial', 'Partially Delivered': 'badge-partial', 'Partially Received': 'badge-partial', 'Partially Fulfilled': 'badge-partial', 'Partial GRN': 'badge-partial', 'Partial Accept': 'badge-partial', 'Partially Settled': 'badge-partial', 'Partially Completed': 'badge-partial', 'Soft Closed': 'badge-returned', Reopened: 'badge-reopened', Exception: 'badge-returned', Unallocated: 'badge-returned', Unmatched: 'badge-returned', Variance: 'badge-returned', Hold: 'badge-returned', 'On Hold': 'badge-returned', Grace: 'badge-grace', 'Pending review': 'badge-returned', Stale: 'badge-returned', Suspended: 'badge-returned', Escalated: 'badge-returned', Overdue: 'badge-overdue', Unbilled: 'badge-returned', Blocked: 'badge-rejected',
  Approved: 'badge-approved', Posted: 'badge-posted', Settled: 'badge-settled', Active: 'badge-active', Open: 'badge-open', Matched: 'badge-matched', Accepted: 'badge-posted', Completed: 'badge-posted', Allocated: 'badge-posted', Reconciled: 'badge-posted', Delivered: 'badge-posted', Fulfilled: 'badge-posted', Filed: 'badge-posted', Deducted: 'badge-posted', Converted: 'badge-matched', Paid: 'badge-posted', Received: 'badge-posted', Clean: 'badge-posted', Success: 'badge-posted', Committed: 'badge-posted', Reserved: 'badge-approved', Passed: 'badge-posted', Recognized: 'badge-posted', Billed: 'badge-posted', Invoiced: 'badge-posted',
  Rejected: 'badge-rejected', Failed: 'badge-rejected', Declined: 'badge-rejected', Denied: 'badge-rejected', 'Dead-letter': 'badge-rejected', Timeout: 'badge-rejected', Revoked: 'badge-rejected',
  'Sent to bank': 'badge-submitted', Quoted: 'badge-submitted', Awarded: 'badge-matched', Assigned: 'badge-submitted', Resolved: 'badge-approved', Dispatched: 'badge-in-progress', 'In Progress ': 'badge-in-progress', Counted: 'badge-submitted', Held: 'badge-returned', 'Short Supply': 'badge-returned',
  Cancelled: 'badge-cancelled', Reversed: 'badge-reversed', Closed: 'badge-closed', Locked: 'badge-locked', Expired: 'badge-expired', Inactive: 'badge-cancelled', Retired: 'badge-cancelled', Deactivated: 'badge-cancelled', Resigned: 'badge-cancelled', Terminated: 'badge-cancelled', 'Short Closed': 'badge-closed', 'Fully Depreciated': 'badge-cancelled', Disposed: 'badge-closed', Written: 'badge-closed', 'Written Off': 'badge-closed', Deprecated: 'badge-cancelled', Recalled: 'badge-cancelled', Released2: 'badge-cancelled', Skipped: 'badge-cancelled', 'N/A': 'badge-cancelled', 'Not Applicable': 'badge-cancelled', Superseded: 'badge-cancelled',
};

export function badgeClass(status?: string): string {
  if (!status) return 'badge-draft';
  return BADGE_MAP[status] ?? 'badge-draft';
}

export function Badge({ status, children, className = '', style }: { status?: string; children?: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <span className={`badge ${badgeClass(status ?? (typeof children === 'string' ? children : ''))} ${className}`} style={style}>
      {children ?? status}
    </span>
  );
}

export function Pill({ tone = 'neutral', children, title }: { tone?: 'critical' | 'warning' | 'good' | 'neutral'; children: ReactNode; title?: string }) {
  return <span className={`pill pill-${tone}`} title={title}>{children}</span>;
}

export function CountBadge({ n }: { n: number }) {
  return <span style={{ background: '#F3F3F5', borderRadius: 9999, padding: '0 6px', fontSize: 11, color: '#5F6368', minWidth: 18, textAlign: 'center', lineHeight: '18px', display: 'inline-block', fontFeatureSettings: 'normal' }}>{n}</span>;
}

export function DimChip({ label, color }: { label: string; color?: string }) {
  return <span className="dim-chip" style={{ ['--dot' as string]: color ?? '#325CFF' }}>{label}</span>;
}

export function CurrencyTag({ code }: { code: string }) {
  return <span className="currency-tag">{code}</span>;
}

export function SnapshotTag({ label = 'snapshot' }: { label?: string }) {
  return (
    <span className="snapshot-tag" title="Value frozen at posting — master edits do not change it">
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0110 0v4" /></svg>
      {label}
    </span>
  );
}

// ── Money ──────────────────────────────────────────────────────────────────

export function Money({ value, currency = 'INR', base, baseCurrency, rate, compact, tone, code, style, decimals }: { value: number; currency?: string; base?: number; baseCurrency?: string; rate?: number; compact?: boolean; tone?: 'auto' | 'positive' | 'negative' | 'none'; code?: boolean; style?: CSSProperties; decimals?: number }) {
  const cls = tone === 'positive' ? 'money money-positive' : tone === 'negative' ? 'money money-negative' : tone === 'auto' ? (value < 0 ? 'money money-negative' : value > 0 ? 'money money-positive' : 'money') : 'money';
  const text = compact ? fmtMoneyCompact(value, currency) : fmtMoney(value, currency, { code, decimals });
  if (base !== undefined && baseCurrency && baseCurrency !== currency) {
    return (
      <span className={cls} style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end', lineHeight: 1.2, ...style }} title={rate ? `Rate ${rate}` : undefined}>
        <span>{fmtMoney(value, currency, { code: true })}</span>
        <span style={{ fontSize: 11, color: '#6E6E71' }}>≈ {fmtMoney(base, baseCurrency)}{rate ? ` @ ${rate}` : ''}</span>
      </span>
    );
  }
  return <span className={cls} style={style}>{text}</span>;
}

export function DateText({ value, time }: { value?: string; time?: boolean }) {
  return <span>{time ? fmtDateTime(value) : fmtDate(value)}</span>;
}

// ── Buttons ────────────────────────────────────────────────────────────────

export type ButtonVariant = 'primary' | 'secondary' | 'tinted' | 'ghost' | 'danger' | 'link';

export function Button({ variant = 'secondary', size, loading, icon, children, className = '', disabled, title, reason, type = 'button', ...rest }: { variant?: ButtonVariant; size?: 'sm'; loading?: boolean; icon?: ReactNode; reason?: string } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const base = variant === 'link' ? 'btn-link' : `btn-${variant}`;
  return (
    <button type={type} className={`${base} ${size === 'sm' ? 'btn-sm' : ''} ${className}`} disabled={disabled || loading} title={reason ?? title} {...rest}>
      {loading ? <Spinner /> : icon}
      {children}
    </button>
  );
}

export function IconButton({ children, title, onClick, className = '', style }: { children: ReactNode; title?: string; onClick?: (e: React.MouseEvent) => void; className?: string; style?: CSSProperties }) {
  return (
    <button type="button" className={`btn-icon ${className}`} title={title} onClick={onClick} style={style}>
      {children}
    </button>
  );
}

export function Spinner({ size = 14, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
      <circle cx="12" cy="12" r="10" stroke={color} strokeOpacity="0.25" strokeWidth="3" />
      <path d="M12 2a10 10 0 0110 10" stroke={color} strokeWidth="3" strokeLinecap="round">
        <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="0.8s" repeatCount="indefinite" />
      </path>
    </svg>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <span className="kbd">{children}</span>;
}

// ── Layout helpers ─────────────────────────────────────────────────────────

export function Card({ children, style, className = '', padding = 20, title, actions }: { children: ReactNode; style?: CSSProperties; className?: string; padding?: number | string; title?: ReactNode; actions?: ReactNode }) {
  return (
    <div className={`card ${className}`} style={{ padding, ...style }}>
      {(title || actions) && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, gap: 12 }}>
          {title && <div className="section-title" style={{ marginBottom: 0 }}>{title}</div>}
          {actions && <div style={{ display: 'flex', gap: 8 }}>{actions}</div>}
        </div>
      )}
      {children}
    </div>
  );
}

export function Row({ children, gap = 8, align = 'center', justify, wrap, style }: { children: ReactNode; gap?: number; align?: CSSProperties['alignItems']; justify?: CSSProperties['justifyContent']; wrap?: boolean; style?: CSSProperties }) {
  return <div style={{ display: 'flex', gap, alignItems: align, justifyContent: justify, flexWrap: wrap ? 'wrap' : undefined, ...style }}>{children}</div>;
}

export function Stack({ children, gap = 12, style }: { children: ReactNode; gap?: number; style?: CSSProperties }) {
  return <div style={{ display: 'flex', flexDirection: 'column', gap, ...style }}>{children}</div>;
}

export function SectionLabel({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <div className="section-label" style={style}>{children}</div>;
}

export function Divider({ style }: { style?: CSSProperties }) {
  return <div style={{ height: 1, background: '#EFEFEF', ...style }} />;
}

export function KV({ items, columns = 1 }: { items: { k: ReactNode; v: ReactNode }[]; columns?: 1 | 2 }) {
  return (
    <div className="kv" style={columns === 2 ? { gridTemplateColumns: '140px 1fr 140px 1fr' } : undefined}>
      {items.map((it, i) => (
        <div key={i} style={{ display: 'contents' }}>
          <span className="k">{it.k}</span>
          <span className="v">{it.v ?? '—'}</span>
        </div>
      ))}
    </div>
  );
}

export function SummaryBlock({ items, style }: { items: { label: string; value: ReactNode; tone?: 'warn' | 'good' | 'danger' }[]; style?: CSSProperties }) {
  return (
    <div className="summary-block" style={{ display: 'flex', gap: 28, flexWrap: 'wrap', ...style }}>
      {items.map((it) => (
        <div key={it.label}>
          <div className="section-label" style={{ marginBottom: 2 }}>{it.label}</div>
          <div style={{ fontSize: 15, fontWeight: 600, fontFeatureSettings: '"tnum" 1', color: it.tone === 'warn' ? '#8A4B0F' : it.tone === 'danger' ? '#C0393F' : it.tone === 'good' ? '#12784E' : '#0A0A0A' }}>{it.value}</div>
        </div>
      ))}
    </div>
  );
}

export function Meter({ value, max = 100, tone }: { value: number; max?: number; tone?: 'warn' | 'danger' | 'good' }) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  const auto = tone ?? (pct >= 100 ? 'danger' : pct >= 80 ? 'warn' : undefined);
  return (
    <div className={`meter ${auto ?? ''}`}>
      <div style={{ width: `${pct}%` }} />
    </div>
  );
}

export function KpiTile({ label, value, delta, deltaTone = 'good', sub, meta, onClick, stale }: { label: string; value: ReactNode; delta?: ReactNode; deltaTone?: 'good' | 'bad' | 'neutral'; sub?: ReactNode; meta?: ReactNode; onClick?: () => void; stale?: boolean }) {
  return (
    <div className="kpi-tile" style={{ cursor: onClick ? 'pointer' : undefined, display: 'flex', flexDirection: 'column', gap: 4 }} onClick={onClick}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="section-label">{label}</span>
        {stale && <Pill tone="warning">Stale</Pill>}
      </div>
      <div style={{ fontSize: 24, fontWeight: 600, lineHeight: '32px', fontFeatureSettings: '"tnum" 1', color: '#0A0A0A' }}>{value}</div>
      {(delta || sub) && (
        <div style={{ fontSize: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
          {delta && <span style={{ color: deltaTone === 'good' ? '#12784E' : deltaTone === 'bad' ? '#C0393F' : '#5F6368', fontWeight: 500 }}>{delta}</span>}
          {sub && <span style={{ color: '#5F6368' }}>{sub}</span>}
        </div>
      )}
      {meta && <div style={{ fontSize: 11, color: '#6E6E71', marginTop: 6, borderTop: '1px solid #F3F5F5', paddingTop: 8, fontFeatureSettings: 'normal' }}>{meta}</div>}
    </div>
  );
}

export function EmptyState({ title, description, action, icon = '📋', compact }: { title: string; description?: string; action?: ReactNode; icon?: ReactNode; compact?: boolean }) {
  return (
    <div className="empty-state" style={compact ? { padding: '24px 16px' } : undefined}>
      <div style={{ width: 44, height: 44, borderRadius: 12, background: '#F3F5F5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>{icon}</div>
      <h3>{title}</h3>
      {description && <p style={{ fontSize: 13, maxWidth: 380 }}>{description}</p>}
      {action && <div style={{ marginTop: 4, display: 'flex', gap: 8 }}>{action}</div>}
    </div>
  );
}

export function NoPermission({ what }: { what: string }) {
  return <EmptyState icon="🔒" title={`You don't have access to ${what}`} description="Ask your company administrator to grant access." action={<Button variant="link">Request access</Button>} />;
}

export function Skeleton({ rows = 5, height = 44 }: { rows?: number; height?: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 16 }}>
      {Array.from({ length: rows }).map((_, i) => <div key={i} className="skeleton" style={{ height }} />)}
    </div>
  );
}

export function Banner({ tone = 'info', children, action, onDismiss, full, style }: { tone?: 'info' | 'warning' | 'danger' | 'success'; children: ReactNode; action?: ReactNode; onDismiss?: () => void; full?: boolean; style?: CSSProperties }) {
  const icon = tone === 'danger' ? '⚠' : tone === 'warning' ? '⚠' : tone === 'success' ? '✓' : 'ⓘ';
  return (
    <div className={`banner ${tone} ${full ? 'full' : ''}`} style={style}>
      <span style={{ fontWeight: 600 }}>{icon}</span>
      <span style={{ flex: 1 }}>{children}</span>
      {action}
      {onDismiss && <button className="btn-icon" onClick={onDismiss} style={{ width: 24, height: 24, color: 'inherit' }}>✕</button>}
    </div>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange, counts, variant = 'doc' }: { tabs: { id: T; label: string; count?: number }[]; value: T; onChange: (v: T) => void; counts?: Partial<Record<T, number>>; variant?: 'doc' | 'filter' }) {
  const cls = variant === 'doc' ? 'doc-tab' : 'filter-tab';
  return (
    <div style={{ display: 'flex', gap: variant === 'doc' ? 20 : 0, borderBottom: '1px solid #EFEFEF' }}>
      {tabs.map((t) => (
        <button key={t.id} type="button" className={`${cls} ${value === t.id ? 'active' : ''}`} onClick={() => onChange(t.id)}>
          {t.label}
          {(t.count ?? counts?.[t.id]) !== undefined && <CountBadge n={(t.count ?? counts?.[t.id]) as number} />}
        </button>
      ))}
    </div>
  );
}

export function Avatar({ name, size = 28, color = '#325CFF' }: { name: string; size?: number; color?: string }) {
  const ini = name.split(' ').filter(Boolean).map((n) => n[0]).join('').slice(0, 2).toUpperCase();
  return <div style={{ width: size, height: size, borderRadius: '50%', background: color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.4, fontWeight: 600, flexShrink: 0, fontFeatureSettings: 'normal' }}>{ini}</div>;
}

export function TwoLine({ primary, secondary, mono }: { primary: ReactNode; secondary?: ReactNode; mono?: boolean }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div className="cell-primary" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{primary}</div>
      {secondary !== undefined && secondary !== null && secondary !== '' && <div className={`cell-secondary ${mono ? 'identifier' : ''}`} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{secondary}</div>}
    </div>
  );
}

export function Identifier({ children, link, onClick, style }: { children: ReactNode; link?: boolean; onClick?: (e: React.MouseEvent) => void; style?: CSSProperties }) {
  return (
    <span className={`identifier ${link || onClick ? 'link' : ''}`} onClick={onClick} style={{ fontWeight: 500, ...style }}>
      {children}
    </span>
  );
}
