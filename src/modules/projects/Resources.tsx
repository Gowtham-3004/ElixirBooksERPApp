// Resources register (cost / bill rates, capacity), rate cards editor, weekly capacity & utilisation view.
import { useMemo, useState } from 'react';
import { C, nav, useSession, useCollection } from '../../store';
import { PageHeader, Tabs, Card, Button, Drawer, TextField, NumberField, MoneyField, SelectField, DateField, EntityPicker, useEmployeeOptions, useToast, DataTable, Badge, Money, Meter, Segmented, ScopeLine, EmptyState } from '../../components/ui';
import type { Column, MenuAction } from '../../components/ui';
import { fmtMoney, fmtDate, fmtPct, addDays, today } from '../../lib/format';
import type { Resource, RateCard, RateRow, Timesheet } from './types';
import { ROLES } from './types';
import { useRows, weekStartOf, hourEntries, employeeName, useSettings, projectOf } from './data';
import { Muted } from './shared';
import { saveResource, saveRateCard } from './actions';

export default function Resources({ tab }: { tab?: string }) {
  const [t, setT] = useState<'resources' | 'ratecards' | 'capacity'>((tab as any) ?? 'resources');
  return (
    <div className="page">
      <PageHeader title="Resources & rate cards" subtitle={<ScopeLine extra="cost rates feed profitability · bill rates feed T&M billing" />} />
      <Tabs variant="filter" tabs={[{ id: 'resources', label: 'Resources' }, { id: 'ratecards', label: 'Rate cards' }, { id: 'capacity', label: 'Capacity & utilisation' }]} value={t} onChange={(v) => { setT(v); nav.replace(`projects/resources?tab=${v}`); }} />
      {t === 'resources' && <ResourceList />}
      {t === 'ratecards' && <RateCards />}
      {t === 'capacity' && <Capacity />}
    </div>
  );
}

function ResourceList() {
  const rows = useRows<Resource>(C.resources, (a, b) => a.employeeName.localeCompare(b.employeeName));
  const s = useSession();
  const toast = useToast();
  const [open, setOpen] = useState<Partial<Resource> | null>(null);
  const employees = useEmployeeOptions();
  const can = s.can('projects.resource.edit') || s.can('projects.*');
  const columns: Column<Resource>[] = [
    { key: 'employeeName', label: 'Resource', sortable: true, render: (r) => <div><div className="cell-primary">{r.employeeName}</div><Muted>{employees.find((e) => e.id === r.employeeId)?.secondary}</Muted></div> },
    { key: 'role', label: 'Role', sortable: true },
    { key: 'costRate', label: 'Cost / h', align: 'right', sortable: true, render: (r) => <Money value={r.costRate} currency={s.currency} /> },
    { key: 'billRate', label: 'Bill / h', align: 'right', sortable: true, render: (r) => <Money value={r.billRate} currency={s.currency} /> },
    { key: 'margin', label: 'Margin', align: 'right', render: (r) => <span className="money" style={{ color: r.billRate > r.costRate ? '#12784E' : '#C0393F' }}>{r.billRate ? fmtPct(((r.billRate - r.costRate) / r.billRate) * 100) : '—'}</span> },
    { key: 'capacityHoursPerWeek', label: 'Capacity', align: 'right', render: (r) => <span className="money">{r.capacityHoursPerWeek} h/wk</span> },
    { key: 'status', label: 'Status', render: (r) => <Badge status={r.status} /> },
  ];
  const actions = (r: Resource): MenuAction[] => [{ label: 'Edit', onClick: () => setOpen(r), disabled: !can }, { label: 'Timesheets', onClick: () => nav.go('projects/timesheets', { employee: r.employeeId }) }, { label: r.status === 'Active' ? 'Deactivate' : 'Reactivate', separator: true, danger: r.status === 'Active', onClick: () => { saveResource({ ...r, status: r.status === 'Active' ? 'Inactive' : 'Active' }); toast.success('Resource updated'); }, disabled: !can }];
  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}><Button variant="primary" onClick={() => setOpen({ role: 'Consultant', costRate: 0, billRate: 0, capacityHoursPerWeek: 40, status: 'Active' })} disabled={!can} reason={can ? undefined : 'Requires projects.resource.edit'}>+ Add resource</Button></div>
      <DataTable rows={rows} columns={columns} rowActions={actions} onRowClick={(r) => setOpen(r)} emptyTitle="No resources yet" emptyDescription="Add employees as billable resources with cost and bill rates." />
      {open && (
        <ResourceDrawer value={open} onClose={() => setOpen(null)} />
      )}
    </>
  );
}

function ResourceDrawer({ value, onClose }: { value: Partial<Resource>; onClose: () => void }) {
  const [f, setF] = useState(value);
  const [err, setErr] = useState<string | null>(null);
  const toast = useToast();
  const s = useSession();
  const employees = useEmployeeOptions();
  const set = (p: Partial<Resource>) => setF((x) => ({ ...x, ...p }));
  return (
    <Drawer open onClose={onClose} title={value.id ? `Edit ${value.employeeName}` : 'Add resource'} width={560} footer={<><Button variant="ghost" onClick={onClose}>Discard changes</Button><Button variant="primary" onClick={() => { try { saveResource({ ...f, employeeId: f.employeeId ?? '', role: f.role ?? '', costRate: f.costRate ?? 0, billRate: f.billRate ?? 0, capacityHoursPerWeek: f.capacityHoursPerWeek ?? 40 }); toast.success('Resource saved'); onClose(); } catch (e: any) { setErr(e.message); } }}>Save resource</Button></>}>
      {err && <div className="banner danger" style={{ marginBottom: 12 }}>{err}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <EntityPicker label="Employee" required value={f.employeeId} onChange={(id) => set({ employeeId: id })} options={employees} style={{ gridColumn: '1 / -1' }} disabled={!!value.id} />
        <SelectField label="Role" value={f.role} onChange={(v) => set({ role: v })} options={ROLES} help="Matches rate card rows" />
        <NumberField label="Capacity (h / week)" value={f.capacityHoursPerWeek} onChange={(v) => set({ capacityHoursPerWeek: v })} decimals={0} suffix="h" />
        <MoneyField label="Cost rate / h" value={f.costRate} onChange={(v) => set({ costRate: v })} currency={s.currency} help="Loaded cost used in profitability" />
        <MoneyField label="Bill rate / h" value={f.billRate} onChange={(v) => set({ billRate: v })} currency={s.currency} help="Fallback when no contract / rate card rate" />
        <SelectField label="Status" value={f.status ?? 'Active'} onChange={(v) => set({ status: v as Resource['status'] })} options={['Active', 'Inactive']} />
      </div>
    </Drawer>
  );
}

function RateCards() {
  const rows = useRows<RateCard>(C.rateCards, (a, b) => a.name.localeCompare(b.name));
  const s = useSession();
  const settings = useSettings();
  const [open, setOpen] = useState<Partial<RateCard> | null>(null);
  const can = s.can('projects.resource.edit') || s.can('projects.*');
  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}><Button variant="primary" onClick={() => setOpen({ name: '', currency: s.currency, rows: ROLES.map((r) => ({ role: r, rate: 0 })), status: 'Active', validFrom: today() })} disabled={!can}>+ New rate card</Button></div>
      {rows.length === 0 ? <EmptyState title="No rate cards" description="Create a rate card with a rate per role; contracts pick one for T&M billing." /> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 16 }}>
          {rows.map((rc) => (
            <Card key={rc.id} title={<>{rc.name} <span className="currency-tag" style={{ marginLeft: 6 }}>{rc.currency}</span>{settings.prjDefaultRateCardId === rc.id && <Badge status="Active" style={{ marginLeft: 6 }}>Default</Badge>}</>} actions={<><Badge status={rc.status} /><Button size="sm" variant="secondary" onClick={() => setOpen(rc)} disabled={!can}>Edit</Button></>}>
              <table className="data-table dense"><thead><tr><th>Role</th><th className="right">Rate / h</th></tr></thead><tbody>{rc.rows.map((r) => <tr key={r.role}><td>{r.role}</td><td className="right money">{fmtMoney(r.rate, rc.currency)}</td></tr>)}</tbody></table>
              <Muted>{rc.code} · valid {rc.validFrom ? `from ${fmtDate(rc.validFrom)}` : 'always'}{rc.validTo ? ` to ${fmtDate(rc.validTo)}` : ''}</Muted>
            </Card>
          ))}
        </div>
      )}
      {open && <RateCardDrawer value={open} onClose={() => setOpen(null)} />}
    </>
  );
}

function RateCardDrawer({ value, onClose }: { value: Partial<RateCard>; onClose: () => void }) {
  const [f, setF] = useState(value);
  const [err, setErr] = useState<string | null>(null);
  const toast = useToast();
  const s = useSession();
  const set = (p: Partial<RateCard>) => setF((x) => ({ ...x, ...p }));
  const rows: RateRow[] = f.rows ?? [];
  const upd = (i: number, p: Partial<RateRow>) => set({ rows: rows.map((r, j) => (j === i ? { ...r, ...p } : r)) });
  return (
    <Drawer open onClose={onClose} title={value.id ? `Edit ${value.name}` : 'New rate card'} width={600} footer={<><Button variant="ghost" onClick={onClose}>Discard changes</Button><Button variant="primary" onClick={() => { try { saveRateCard({ ...f, name: f.name ?? '', currency: f.currency ?? s.currency, rows }); toast.success('Rate card saved'); onClose(); } catch (e: any) { setErr(e.message); } }}>Save rate card</Button></>}>
      {err && <div className="banner danger" style={{ marginBottom: 12 }}>{err}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
        <TextField label="Name" required value={f.name} onChange={(v) => set({ name: v })} autoFocus />
        <SelectField label="Currency" value={f.currency} onChange={(v) => set({ currency: v })} options={(s.company?.permittedCurrencies ?? ['INR']).map((c) => ({ value: c, label: c }))} />
        <DateField label="Valid from" value={f.validFrom} onChange={(v) => set({ validFrom: v || undefined })} />
        <DateField label="Valid to" value={f.validTo} onChange={(v) => set({ validTo: v || undefined })} />
        <TextField label="Code" value={f.code} onChange={(v) => set({ code: v })} uppercase help="Blank = generated" />
        <SelectField label="Status" value={f.status ?? 'Active'} onChange={(v) => set({ status: v as RateCard['status'] })} options={['Active', 'Inactive']} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}><span className="field-label" style={{ marginBottom: 0 }}>Role rates ({f.currency}/h)</span><Button size="sm" variant="secondary" onClick={() => set({ rows: [...rows, { role: ROLES.find((r) => !rows.some((x) => x.role === r)) ?? 'Role', rate: 0 }] })}>+ Add role</Button></div>
      <div className="card" style={{ overflow: 'hidden' }}>
        <table className="data-table dense"><thead><tr><th>Role</th><th className="right" style={{ width: 160 }}>Rate</th><th style={{ width: 40 }} /></tr></thead><tbody>
          {rows.map((r, i) => <tr key={i}><td><input className="field-input grid" value={r.role} onChange={(e) => upd(i, { role: e.target.value })} /></td><td><input className="field-input grid num" value={r.rate} onChange={(e) => upd(i, { rate: Number(e.target.value.replace(/[^0-9.]/g, '')) || 0 })} /></td><td><button type="button" className="btn-icon" onClick={() => set({ rows: rows.filter((_, j) => j !== i) })}>✕</button></td></tr>)}
        </tbody></table>
      </div>
    </Drawer>
  );
}

function Capacity() {
  const resources = useRows<Resource>(C.resources).filter((r) => r.status === 'Active');
  useCollection<Timesheet>(C.timesheets);
  const [weekStart, setWeekStart] = useState(weekStartOf(today()));
  const [view, setView] = useState<'week' | '4weeks'>('week');
  const weeks = useMemo(() => (view === 'week' ? [weekStart] : [-3, -2, -1, 0].map((i) => addDays(weekStart, i * 7))), [weekStart, view]);
  const from = weeks[0], to = addDays(weeks[weeks.length - 1], 6);
  const rows = resources.map((r) => {
    const entries = hourEntries({ employeeId: r.employeeId, from, to, statuses: ['Approved', 'Invoiced', 'Submitted', 'Draft'] });
    const logged = entries.reduce((a, e) => a + e.hours, 0);
    const billable = entries.filter((e) => e.row.billable).reduce((a, e) => a + e.hours, 0);
    const approved = entries.filter((e) => e.timesheet.status === 'Approved' || e.timesheet.status === 'Invoiced').reduce((a, e) => a + e.hours, 0);
    const capacity = r.capacityHoursPerWeek * weeks.length;
    const byProject = new Map<string, number>();
    entries.forEach((e) => byProject.set(e.row.projectId, (byProject.get(e.row.projectId) ?? 0) + e.hours));
    return { ...r, logged, billable, approved, capacity, pct: capacity ? (logged / capacity) * 100 : 0, projects: Array.from(byProject.entries()) };
  });
  const totals = rows.reduce((a, r) => ({ logged: a.logged + r.logged, billable: a.billable + r.billable, capacity: a.capacity + r.capacity }), { logged: 0, billable: 0, capacity: 0 });
  return (
    <>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <DateField label="Week starting" value={weekStart} onChange={(v) => v && setWeekStart(weekStartOf(v))} size="sm" />
        <Segmented value={view} onChange={setView} options={[{ value: 'week', label: 'This week' }, { value: '4weeks', label: 'Last 4 weeks' }]} />
        <div style={{ display: 'flex', gap: 4 }}><Button size="sm" variant="secondary" onClick={() => setWeekStart(addDays(weekStart, -7))}>‹ Prev</Button><Button size="sm" variant="secondary" onClick={() => setWeekStart(weekStartOf(today()))}>Today</Button><Button size="sm" variant="secondary" onClick={() => setWeekStart(addDays(weekStart, 7))}>Next ›</Button></div>
        <div style={{ flex: 1 }} />
        <Muted>{fmtDate(from)} – {fmtDate(to)} · planned capacity {totals.capacity} h · logged {totals.logged.toFixed(1)} h ({totals.capacity ? fmtPct((totals.logged / totals.capacity) * 100) : '—'}) · billable {totals.capacity ? fmtPct((totals.billable / totals.capacity) * 100) : '—'}</Muted>
      </div>
      <div className="card" style={{ overflow: 'hidden' }}>
        <table className="data-table dense">
          <thead><tr><th>Resource</th><th>Role</th><th className="right">Capacity</th><th className="right">Logged</th><th className="right">Approved</th><th className="right">Billable</th><th style={{ width: 200 }}>Utilisation</th><th>Projects</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="clickable" onClick={() => nav.go('projects/timesheets', { employee: r.employeeId })}>
                <td className="cell-primary">{r.employeeName}</td><td>{r.role}</td>
                <td className="right money">{r.capacity} h</td><td className="right money">{r.logged.toFixed(1)} h</td><td className="right money">{r.approved.toFixed(1)} h</td><td className="right money">{r.billable.toFixed(1)} h</td>
                <td><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><div style={{ flex: 1 }}><Meter value={r.logged} max={r.capacity || 1} tone={r.pct > 100 ? 'danger' : r.pct < 60 ? 'warn' : 'good'} /></div><span className="money" style={{ fontSize: 12, width: 44, textAlign: 'right' }}>{fmtPct(r.pct)}</span></div></td>
                <td><div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>{r.projects.map(([pid, h]) => <span key={pid} className="dim-chip" title={employeeName(r.employeeId)}>{projectOf(pid)?.code ?? pid} · {h.toFixed(0)} h</span>)}{!r.projects.length && <Muted>—</Muted>}</div></td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={8} style={{ textAlign: 'center', color: '#5F6368', padding: 24 }}>No active resources</td></tr>}
          </tbody>
        </table>
      </div>
      <Muted>Utilisation = logged hours (draft, submitted, approved) ÷ capacity × weeks. Bench = under 60%, overloaded = above 100%.</Muted>
    </>
  );
}
