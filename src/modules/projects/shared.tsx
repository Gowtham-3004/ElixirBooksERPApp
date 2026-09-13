// Small presentational helpers shared by the projects pages.
import { useMemo, type ReactNode } from 'react';
import { db, C, nav, useCollection, useSession } from '../../store';
import type { DocHeader } from '../../store';
import { Identifier, Badge, SelectField, Pill } from '../../components/ui';
import type { PickerOption } from '../../components/ui';
import { fmtDate, fmtPeriod } from '../../lib/format';
import type { Contract, Project } from './types';
import { periodsBetween, currentPeriod } from './data';

export function ContractLink({ id, number }: { id?: string; number?: string }) {
  const c = db.find<Contract>(C.contracts, id);
  if (!c) return <span style={{ color: '#B0B5BF' }}>{number ?? '—'}</span>;
  return <Identifier link onClick={(e) => { e.stopPropagation(); nav.go(`projects/contracts/${c.id}`); }}>{c.number}</Identifier>;
}

export function ProjectLink({ id }: { id?: string }) {
  const p = db.find<Project>(C.projects, id);
  if (!p) return <span style={{ color: '#B0B5BF' }}>—</span>;
  return <Identifier link onClick={(e) => { e.stopPropagation(); nav.go(`projects/projects/${p.id}`); }}>{p.code}</Identifier>;
}

export function InvoiceLink({ id, number }: { id?: string; number?: string }) {
  const inv = db.find<DocHeader>(C.salesInvoices, id);
  if (!inv) return <span style={{ color: '#B0B5BF' }}>{number ?? '—'}</span>;
  return (
    <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
      <Identifier link onClick={(e) => { e.stopPropagation(); nav.go(`sales/invoices/${inv.id}`); }}>{inv.number}</Identifier>
      <Badge status={inv.status} />
    </span>
  );
}

export function MethodPill({ method }: { method: Contract['billingMethod'] }) {
  const tone = method === 'Time & material' ? 'good' : method === 'Fixed price' ? 'neutral' : method === 'Milestone' ? 'warning' : 'neutral';
  return <Pill tone={tone}>{method}</Pill>;
}

export function useContractOptions(filter?: (c: Contract) => boolean): PickerOption[] {
  const rows = useCollection<Contract>(C.contracts);
  const s = useSession();
  return useMemo(() => rows.filter((c) => (!c.companyId || c.companyId === s.state.companyId) && (!filter || filter(c))).map((c) => ({ id: c.id, primary: `${c.number} · ${c.title}`, secondary: `${c.partyName} · ${c.billingMethod} · ${c.status}`, keywords: c.partyName, raw: c })), [rows, s.state.companyId, filter]);
}

export function useProjectOptions(filter?: (p: Project) => boolean): PickerOption[] {
  const rows = useCollection<Project>(C.projects);
  const s = useSession();
  return useMemo(() => rows.filter((p) => (!p.companyId || p.companyId === s.state.companyId) && (!filter || filter(p))).map((p) => ({ id: p.id, primary: `${p.code} · ${p.name}`, secondary: `${p.customerName ?? ''} · ${p.status}`, keywords: p.customerName, disabled: p.status === 'Cancelled', raw: p })), [rows, s.state.companyId, filter]);
}

/** Period selector across company periods (yyyy-mm). */
export function PeriodSelect({ value, onChange, label = 'Period', from = '2026-04', size, style }: { value: string; onChange: (v: string) => void; label?: string; from?: string; size?: 'sm'; style?: React.CSSProperties }) {
  const cur = currentPeriod();
  const opts = periodsBetween(from, cur > '2026-12' ? cur : '2027-03').map((p) => ({ value: p, label: fmtPeriod(p) }));
  return <SelectField label={label} value={value} onChange={onChange} options={opts} size={size} style={style} />;
}

export function Section({ title, children, actions, style }: { title: ReactNode; children: ReactNode; actions?: ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={style}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div className="section-title" style={{ marginBottom: 0 }}>{title}</div>
        {actions}
      </div>
      {children}
    </div>
  );
}

export function DateRange({ from, to }: { from?: string; to?: string }) {
  return <span>{fmtDate(from)} → {to ? fmtDate(to) : 'open'}</span>;
}

export function Muted({ children }: { children: ReactNode }) {
  return <span style={{ color: '#5F6368', fontSize: 12 }}>{children}</span>;
}
