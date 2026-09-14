// Shared UI helpers for the production module.
import { useState, type ReactNode } from 'react';
import { db, C, nav } from '../../store';
import type { Item, Journal } from '../../store';
import { Badge, ConfirmDialog, Pill, type Consequence } from '../../components/ui';
import { fmtDate, fmtMoney } from '../../lib/format';
import type { ProductionOrder } from './types';
import { isLate } from './core';

/** Declarative financial confirmation: `const confirm = useConfirm(); confirm.open({...})` + `{confirm.dialog}` */
export function useConfirm() {
  const [state, setState] = useState<null | { title: ReactNode; statement?: ReactNode; consequences?: Consequence[]; reasonRequired?: boolean; confirmLabel: string; cancelLabel?: string; danger?: boolean; onConfirm: (reason: string) => unknown; body?: ReactNode }>(null);
  const dialog = state ? <ConfirmDialog open onClose={() => setState(null)} onConfirm={async (r) => { await state.onConfirm(r); }} title={state.title} statement={state.statement} consequences={state.consequences} reasonRequired={state.reasonRequired} confirmLabel={state.confirmLabel} cancelLabel={state.cancelLabel} danger={state.danger}>{state.body}</ConfirmDialog> : null;
  return { open: (s: NonNullable<typeof state>) => setState(s), close: () => setState(null), dialog };
}

export function ItemLink({ id, name }: { id?: string; name?: string }) {
  const it = db.find<Item>(C.items, id);
  if (!id) return <span>{name ?? '—'}</span>;
  return <span className="link" onClick={(e) => { e.stopPropagation(); nav.go(`masters/items/${id}`); }}>{it?.name ?? name ?? id}</span>;
}

export function DocLink({ path, number, style }: { path?: string; number?: string; style?: React.CSSProperties }) {
  if (!number) return <span style={{ color: 'var(--ink-5)' }}>—</span>;
  return <span className="identifier link" style={{ fontSize: 12, ...style }} onClick={(e) => { e.stopPropagation(); if (path) nav.go(path); }}>{number}</span>;
}

export function OrderLink({ id, number }: { id?: string; number?: string }) {
  return <DocLink path={id ? `production/orders/${id}` : undefined} number={number} />;
}

export function JournalLink({ id }: { id?: string }) {
  const j = db.find<Journal>(C.journals, id);
  if (!j) return <span style={{ color: 'var(--ink-5)' }}>—</span>;
  return <DocLink path={`accounting/journals/${j.id}`} number={j.number} />;
}

export function StatusBadge({ order }: { order: ProductionOrder }) {
  return (
    <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
      <Badge status={order.status === 'Submitted' ? 'Awaiting Approval' : order.status}>{order.status === 'Submitted' ? 'Awaiting approval' : order.status}</Badge>
      {isLate(order) && <Pill tone="critical">Late</Pill>}
      {order.priority === 'High' && <Pill tone="warning">High</Pill>}
    </span>
  );
}

export function Progress({ done, total, label }: { done: number; total: number; label?: string }) {
  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
  return (
    <div style={{ minWidth: 120 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--ink-3)', marginBottom: 2 }}><span>{label ?? 'Received'}</span><span className="money">{done} / {total} · {pct}%</span></div>
      <div className={`meter ${pct >= 100 ? 'good' : ''}`}><div style={{ width: `${pct}%` }} /></div>
    </div>
  );
}

export function VarianceCell({ std, actual, currency = 'INR' }: { std: number; actual: number; currency?: string }) {
  const v = actual - std;
  const pct = std ? (v / std) * 100 : 0;
  return <span className={`money ${v > 0 ? 'money-negative' : v < 0 ? 'money-positive' : ''}`}>{fmtMoney(v, currency)}{std ? <span style={{ fontSize: 11, color: 'var(--ink-4)' }}> ({pct > 0 ? '+' : ''}{pct.toFixed(1)}%)</span> : null}</span>;
}

export function SectionCard({ title, children, actions, padding = 16 }: { title?: ReactNode; children: ReactNode; actions?: ReactNode; padding?: number }) {
  return (
    <div className="card" style={{ padding, overflow: 'hidden' }}>
      {(title || actions) && <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}><div className="section-title" style={{ marginBottom: 0 }}>{title}</div>{actions}</div>}
      {children}
    </div>
  );
}

export function dateRange(a?: string, b?: string) {
  return `${fmtDate(a)} → ${fmtDate(b)}`;
}

export const SCRAP_REASONS = ['Weld porosity', 'Dimensional out of tolerance', 'Material defect', 'Machine fault', 'Operator error', 'Coating defect', 'Handling damage', 'Other'];
