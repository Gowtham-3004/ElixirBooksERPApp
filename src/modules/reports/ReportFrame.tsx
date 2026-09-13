// Standard report frame (FR-RPT-001/004/006/007/008): title, scope line, filter bar, export CSV / print,
// save as report (savedViews), schedule (exportJobs) and a masking note for sensitive data.
import { useMemo, useState, type ReactNode } from 'react';
import { db, C, engine, nav, useRoute, useSession, useCollection } from '../../store';
import type { Branch, Dimension, Period } from '../../store';
import { Button, ScopeLine, Modal, TextField, SelectField, useToast, Pill, Banner, CheckboxField, Segmented } from '../../components/ui';
import { DownloadIcon, PrintIcon } from '../../components/Icons';
import { toCSV, downloadText, fmtPeriod } from '../../lib/format';
import { presetRange, type Range } from './compute';

export interface ExportColumn { key: string; label: string }

export interface ReportFrameProps {
  id: string;
  title: string;
  subtitle?: ReactNode;
  filters?: ReactNode;
  actions?: ReactNode;
  /** rows + columns for CSV export */
  exportRows?: () => Record<string, unknown>[];
  exportColumns?: ExportColumn[];
  /** current filter state stored with "Save as report" */
  filterState?: Record<string, unknown>;
  sensitive?: string;
  rangeLabel?: string;
  children: ReactNode;
  asOf?: string;
  onRefresh?: () => void;
  stale?: boolean;
}

export function ReportFrame({ id, title, subtitle, filters, actions, exportRows, exportColumns, filterState, sensitive, rangeLabel, children, asOf, onRefresh, stale }: ReportFrameProps) {
  const s = useSession();
  const toast = useToast();
  const [saveOpen, setSaveOpen] = useState(false);
  const [schedOpen, setSchedOpen] = useState(false);
  const [name, setName] = useState('');
  const [shared, setShared] = useState(true);
  const [format, setFormat] = useState<'CSV' | 'XLSX' | 'PDF'>('CSV');
  const [freq, setFreq] = useState('Monthly');
  const masked = !!sensitive && !s.can(sensitive);
  const doExport = () => {
    const rows = exportRows?.() ?? [];
    if (!rows.length) { toast.info('Nothing to export for this scope'); return; }
    if (rows.length > 500) {
      db.insert(C.exportJobs, { name: `${id}-${new Date().toISOString().slice(0, 10)}`, entity: title, format: 'CSV', filters: filterState ?? {}, scope: `${s.company?.tradeName} · ${s.branch?.name ?? 'All branches'}`, status: 'Queued', rows: rows.length, requestedBy: s.user?.name ?? 'system', masked, expiresAt: new Date(Date.now() + 7 * 86400000).toISOString() });
      engine.notify({ type: 'export', title: `Export queued: ${title}`, body: `${rows.length} rows · you will be notified when ready`, link: 'admin/jobs' });
      toast.success('Large export queued — you will be notified when it is ready');
      return;
    }
    engine.audit({ action: 'report.export', objectType: 'Report', objectNumber: id, detail: `CSV · ${rows.length} rows · ${JSON.stringify(filterState ?? {})}${masked ? ' · masked' : ''}` });
    downloadText(`${id}-${new Date().toISOString().slice(0, 10)}.csv`, toCSV(rows, exportColumns));
  };
  const save = () => {
    if (!name.trim()) return;
    db.insert(C.savedViews, { module: 'reports', register: id, name: name.trim(), filters: filterState ?? {}, isDefault: false, ownerId: s.user?.id, shared });
    engine.audit({ action: 'report.saved', objectType: 'Saved report', objectNumber: name, detail: JSON.stringify(filterState ?? {}) });
    toast.success(`Saved "${name.trim()}" under Saved reports`, { label: 'Open', path: 'reports/saved' });
    setSaveOpen(false); setName('');
  };
  const schedule = () => {
    db.insert(C.exportJobs, { name: `${title} · ${freq}`, entity: title, format, filters: { ...(filterState ?? {}), schedule: freq, report: id }, scope: `${s.company?.tradeName} · ${s.branch?.name ?? 'All branches'}`, status: 'Queued', rows: 0, requestedBy: s.user?.name ?? 'system', masked, expiresAt: new Date(Date.now() + 30 * 86400000).toISOString() });
    engine.notify({ type: 'export', title: `Scheduled: ${title} (${freq})`, body: `${format} · delivered to ${s.user?.email}`, link: 'admin/jobs' });
    toast.success(`${title} scheduled ${freq.toLowerCase()} as ${format}`);
    setSchedOpen(false);
  };
  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">{title}</h1>
          <div className="page-subtitle" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <ScopeLine extra={rangeLabel} asOf={asOf} />
            {stale && <Pill tone="warning">Stale</Pill>}
            {stale && onRefresh && <button type="button" className="btn-link" style={{ fontSize: 12 }} onClick={onRefresh}>Refresh</button>}
          </div>
          {subtitle && <div className="page-subtitle">{subtitle}</div>}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }} className="no-print">
          {actions}
          <Button variant="secondary" size="sm" onClick={() => setSaveOpen(true)}>Save as report</Button>
          <Button variant="secondary" size="sm" onClick={() => setSchedOpen(true)}>Schedule</Button>
          <Button variant="secondary" size="sm" icon={<PrintIcon size={13} />} onClick={() => window.print()}>Print / PDF</Button>
          {exportRows && <Button variant="secondary" size="sm" icon={<DownloadIcon size={13} />} onClick={doExport}>Export CSV</Button>}
        </div>
      </div>
      {filters && <div className="card toolbar no-print" style={{ padding: '10px 14px', gap: 12, alignItems: 'flex-end' }}>{filters}</div>}
      {masked && <Banner tone="info">Sensitive figures are masked in view and export — requires <span className="identifier">{sensitive}</span> permission (FR-RPT-007).</Banner>}
      {children}
      <Modal open={saveOpen} onClose={() => setSaveOpen(false)} title="Save as report" description="Stores the current filters so you (or your team) can reopen this exact view." footer={<><Button variant="secondary" onClick={() => setSaveOpen(false)}>Keep unsaved</Button><Button variant="primary" onClick={save} disabled={!name.trim()}>Save report</Button></>}>
        <TextField label="Report name" required value={name} onChange={setName} placeholder={`${title} — ${rangeLabel ?? 'current filters'}`} autoFocus />
        <div style={{ marginTop: 12 }}><CheckboxField checked={shared} onChange={setShared} label="Share with everyone in this company" help="A shared report never widens data scope — viewers see only what their role permits." /></div>
        <div style={{ marginTop: 12, fontSize: 12, color: '#5F6368' }}>Filters: <span className="identifier">{JSON.stringify(filterState ?? {})}</span></div>
      </Modal>
      <Modal open={schedOpen} onClose={() => setSchedOpen(false)} title="Schedule this report" description="Runs in the background and is delivered to your email with the current filters and scope." footer={<><Button variant="secondary" onClick={() => setSchedOpen(false)}>Cancel</Button><Button variant="primary" onClick={schedule}>Schedule report</Button></>}>
        <div className="grid-2">
          <SelectField label="Frequency" value={freq} onChange={setFreq} options={['Daily', 'Weekly', 'Monthly', 'Quarterly']} />
          <SelectField label="Format" value={format} onChange={(v) => setFormat(v as any)} options={['CSV', 'XLSX', 'PDF']} />
        </div>
        <div style={{ marginTop: 12, fontSize: 12, color: '#5F6368' }}>Recipient: {s.user?.email} · scope {s.company?.tradeName} · {s.branch?.name ?? 'All branches'}{masked ? ' · sensitive fields masked' : ''}</div>
      </Modal>
    </div>
  );
}

// ── Filter helpers ─────────────────────────────────────────────────────────

/** Filter state initialised from route params (so saved reports deep-link) with defaults. */
export function useReportFilters<T extends Record<string, string>>(defaults: T): [T, (patch: Partial<T>) => void] {
  const route = useRoute();
  const [state, setState] = useState<T>(() => ({ ...defaults, ...Object.fromEntries(Object.entries(route.params).filter(([k]) => k in defaults)) }) as T);
  return [state, (patch) => setState((prev) => ({ ...prev, ...patch }))];
}

export function usePeriods(): Period[] {
  const s = useSession();
  const periods = useCollection<Period>(C.periods);
  return useMemo(() => periods.filter((p) => p.companyId === s.state.companyId).sort((a, b) => a.code.localeCompare(b.code)), [periods, s.state.companyId]);
}

export function PeriodPicker({ value, onChange, label = 'Period', size = 'sm', allowAll }: { value: string; onChange: (v: string) => void; label?: string; size?: 'sm' | 'md'; allowAll?: boolean }) {
  const periods = usePeriods();
  const opts = periods.map((p) => ({ value: p.code, label: `${p.label}${p.status !== 'Open' ? ' · ' + p.status : ''}` }));
  return <SelectField label={label} size={size === 'sm' ? 'sm' : undefined} value={value} onChange={onChange} options={allowAll ? [{ value: '', label: 'All periods' }, ...opts] : opts} style={{ minWidth: 170 }} />;
}

export function BranchPicker({ value, onChange, size = 'sm' }: { value: string; onChange: (v: string) => void; size?: 'sm' | 'md' }) {
  const s = useSession();
  const branches = useCollection<Branch>(C.branches).filter((b) => b.companyId === s.state.companyId);
  return <SelectField label="Branch" size={size === 'sm' ? 'sm' : undefined} value={value} onChange={onChange} options={[{ value: '', label: 'All branches' }, ...branches.map((b) => ({ value: b.id, label: b.name }))]} style={{ minWidth: 160 }} />;
}

export function DimensionPicker({ type, value, onChange, label }: { type: string; value: string; onChange: (v: string) => void; label?: string }) {
  const dims = useCollection<Dimension>(C.dimensions).filter((d) => d.type === type && d.status === 'Active');
  return <SelectField label={label ?? type} size="sm" value={value} onChange={onChange} options={[{ value: '', label: `All ${type.toLowerCase()}s` }, ...dims.map((d) => ({ value: d.id, label: `${d.code} · ${d.name}` }))]} style={{ minWidth: 170 }} />;
}

/** Range bar: preset (MTD/QTD/YTD/FY/Custom) + period + custom dates; returns resolved range. */
export function useRange(f: { preset: string; period: string; from: string; to: string }): Range {
  const s = useSession();
  return useMemo(() => presetRange(f.preset, f.period || s.state.periodCode || new Date().toISOString().slice(0, 7), s.company?.fiscalYearStartMonth ?? 4, { from: f.from, to: f.to }), [f.preset, f.period, f.from, f.to, s.state.periodCode, s.company?.fiscalYearStartMonth]);
}

export function RangeBar({ f, set, presets = ['MTD', 'QTD', 'YTD', 'FY', 'Custom'] }: { f: { preset: string; period: string; from: string; to: string }; set: (p: Partial<{ preset: string; period: string; from: string; to: string }>) => void; presets?: string[] }) {
  return (
    <>
      <div>
        <label className="field-label">Range</label>
        <Segmented value={f.preset} onChange={(v) => set({ preset: v })} options={presets} />
      </div>
      {f.preset !== 'Custom' && <PeriodPicker value={f.period} onChange={(v) => set({ period: v })} label={f.preset === 'MTD' ? 'Period' : 'As of period'} />}
      {f.preset === 'Custom' && (
        <>
          <div><label className="field-label">From</label><input type="date" className="field-input sm" value={f.from} onChange={(e) => set({ from: e.target.value })} /></div>
          <div><label className="field-label">To</label><input type="date" className="field-input sm" value={f.to} onChange={(e) => set({ to: e.target.value })} /></div>
        </>
      )}
    </>
  );
}

export function rangeLabel(r: Range): string {
  if (r.from.slice(0, 7) === r.to.slice(0, 7)) return fmtPeriod(r.from.slice(0, 7));
  return `${fmtPeriod(r.from.slice(0, 7))} – ${fmtPeriod(r.to.slice(0, 7))}`;
}

/** Statement table for P&L / BS style rows. */
export function StatementTable({ rows, currency, compareLabel, valueLabel, onDrill }: { rows: { label: string; amount: number; compare?: number; level: number; kind: string; accountId?: string; code?: string }[]; currency: string; compareLabel?: string; valueLabel: string; onDrill?: (accountId: string) => void }) {
  const fmt = (n: number) => (n === 0 ? '—' : new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(n)).replace(/^/, n < 0 ? '−' : ''));
  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      <table className="data-table dense">
        <thead><tr><th>Particulars</th><th className="right" style={{ width: 180 }}>{valueLabel} ({currency})</th>{compareLabel && <th className="right" style={{ width: 180 }}>{compareLabel} ({currency})</th>}{compareLabel && <th className="right" style={{ width: 120 }}>Change</th>}</tr></thead>
        <tbody>
          {rows.map((r, i) => {
            const isTotal = r.kind === 'total' || r.kind === 'net';
            const isGroup = r.kind === 'group';
            return (
              <tr key={i} style={{ background: isTotal ? '#F9FBFC' : undefined, cursor: r.accountId && onDrill ? 'pointer' : undefined }} onClick={() => r.accountId && onDrill?.(r.accountId)}>
                <td style={{ paddingLeft: 12 + r.level * 20, fontWeight: isTotal || isGroup ? 600 : 400, fontSize: isGroup ? 11 : 13, textTransform: isGroup ? 'uppercase' : undefined, letterSpacing: isGroup ? '0.04em' : undefined, color: isGroup ? '#5F6368' : '#0A0A0A' }}>
                  {r.code && <span className="identifier" style={{ color: '#6E6E71', marginRight: 8, fontSize: 11 }}>{r.code}</span>}{r.label}
                </td>
                <td className="right money" style={{ fontWeight: isTotal ? 700 : isGroup ? 600 : 400, fontSize: r.kind === 'net' ? 14 : 13, color: r.amount < 0 ? '#C0393F' : '#0A0A0A' }}>{fmt(r.amount)}</td>
                {compareLabel && <td className="right money" style={{ color: '#5F6368', fontWeight: isTotal ? 600 : 400 }}>{r.compare === undefined ? '—' : fmt(r.compare)}</td>}
                {compareLabel && <td className="right money" style={{ color: (r.amount - (r.compare ?? 0)) >= 0 ? '#12784E' : '#C0393F', fontSize: 12 }}>{r.compare === undefined ? '—' : fmt(r.amount - r.compare)}</td>}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function drillToLedger(accountId: string, range?: Range) {
  nav.go('accounting/ledger', { account: accountId, from: range?.from, to: range?.to });
}
