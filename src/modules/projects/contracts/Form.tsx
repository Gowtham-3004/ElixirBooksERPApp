// Contract form (FR-SRV-002): customer → project → billing method cards with
// method-specific terms → tax / payment terms / dimensions → save / submit.
import { useMemo, useState } from 'react';
import { db, C, nav, useRecord, useSession, engine } from '../../../store';
import type { Customer } from '../../../store';
import { PageHeader, Card, Button, TextField, NumberField, MoneyField, PercentField, SelectField, DateField, TextArea, RadioCards, EntityPicker, CheckboxField, useToast, useCustomerOptions, useDimensionOptions, useTaxRateOptions, useItemOptions, Banner, EmptyState } from '../../../components/ui';
import { fmtMoney, uid } from '../../../lib/format';
import type { Contract, BillingMethod, Milestone, RateRow, RecurrenceFrequency, RevenueMethod } from '../types';
import { BILLING_METHODS, ROLES } from '../types';
import { useRows, milestonesOf, addMonths } from '../data';
import { useProjectOptions } from '../shared';
import { newContract, saveContract, submitContract, validateContract, saveProject } from '../actions';
import type { RateCard } from '../types';

const METHOD_HELP: Record<BillingMethod, string> = {
  'Fixed price': 'Agreed total billed on a schedule of instalments; revenue by % complete.',
  'Time & material': 'Approved hours × rate card / role rates, plus billable expenses; cap optional.',
  Milestone: 'Bill each milestone when achieved; revenue on achievement.',
  Recurring: 'Same fee every month / quarter / year from the next bill date; straight-line revenue.',
  Usage: 'Metered quantity × unit rate (tiered); billed for recorded, uninvoiced usage.',
  'Cost plus': 'Resource cost + expenses marked up by a percentage.',
};

export default function ContractForm({ id, customerId, projectId, method }: { id?: string; customerId?: string; projectId?: string; method?: string }) {
  const existing = useRecord<Contract>(C.contracts, id);
  const s = useSession();
  const toast = useToast();
  const [c, setC] = useState<Contract>(() => existing ? { ...existing } : newContract({ customerId, projectId, billingMethod: (BILLING_METHODS.includes(method as BillingMethod) ? method : 'Time & material') as BillingMethod, currency: customerId ? (db.find<Customer>(C.customers, customerId)?.currency ?? s.currency) : s.currency }));
  const initialMs = useMemo(() => (id ? milestonesOf(id).map((m) => ({ ...m })) : []), [id]);
  const [ms, setMs] = useState<Partial<Milestone>[]>(initialMs);
  const [createProject, setCreateProject] = useState(!id && !projectId);
  const [errs, setErrs] = useState<{ field?: string; message: string }[]>([]);
  const customers = useCustomerOptions();
  const projects = useProjectOptions((p) => p.status !== 'Cancelled' && p.status !== 'Completed' && (!c.customerId || p.customerId === c.customerId));
  const rateCards = useRows<RateCard>(C.rateCards);
  const dims = useDimensionOptions('Department');
  const taxOpts = useTaxRateOptions();
  const items = useItemOptions((i) => i.type === 'Service' && i.status === 'Active');
  const set = (p: Partial<Contract>) => setC((x) => ({ ...x, ...p }));
  const err = (f: string) => errs.find((e) => e.field === f)?.message ?? null;
  if (id && !existing) return <EmptyState icon="📄" title="Contract not found" action={<Button variant="primary" onClick={() => nav.go('projects/contracts')}>Back to contracts</Button>} />;
  if (existing && !['Draft', 'Returned', 'Rejected', 'Approved', 'Active'].includes(existing.status)) return <EmptyState icon="🔒" title={`${existing.number} is ${existing.status}`} description="Only draft, approved or active contracts can be edited." action={<Button variant="primary" onClick={() => nav.go(`projects/contracts/${existing.id}`)}>Open contract</Button>} />;

  const onCustomer = (cid?: string) => {
    const cust = db.find<Customer>(C.customers, cid);
    set({ customerId: cid ?? '', partyId: cid, partyName: cust?.name, currency: cust?.currency ?? s.currency, paymentTerms: cust?.paymentTerms ?? c.paymentTerms, projectId: undefined });
  };
  const scheduleTotal = ms.reduce((sum, m) => sum + (m.amount ?? 0), 0);
  const persist = (submit: boolean) => {
    const v = validateContract(c);
    if ((c.billingMethod === 'Fixed price' || c.billingMethod === 'Milestone') && ms.filter((m) => (m.amount ?? 0) > 0).length === 0) v.push({ field: 'milestones', message: c.billingMethod === 'Fixed price' ? 'Add at least one instalment to the schedule' : 'Add at least one milestone' });
    if ((c.billingMethod === 'Fixed price' || c.billingMethod === 'Milestone') && Math.abs(scheduleTotal - c.amount) > 0.5) v.push({ field: 'milestones', message: `Schedule total ${fmtMoney(scheduleTotal, c.currency)} must equal the contract value ${fmtMoney(c.amount, c.currency)}` });
    setErrs(v);
    if (v.length) { toast.error(v[0].message); return; }
    try {
      let doc = c;
      if (createProject && !c.projectId) {
        const p = saveProject({ name: c.title, customerId: c.customerId, start: c.start, end: c.end, status: 'Planned', budgetHours: c.capHours ?? 0, budgetAmount: c.totals?.baseTotal ?? c.amount, contractId: c.id, managerEmployeeId: undefined });
        doc = { ...c, projectId: p.id };
      }
      const out = saveContract(doc, ms);
      if (submit) {
        const r = submitContract(out.id);
        toast.success(r.request ? `${out.number} submitted · ${r.request.ruleName}` : `${out.number} approved (no Contract workflow rule) — activate it when signed`);
      } else toast.success(`${out.number} saved as ${out.status.toLowerCase()}`);
      nav.go(`projects/contracts/${out.id}`);
    } catch (e: any) { toast.error(e.message); }
  };
  const addMs = () => setMs((x) => [...x, { id: uid('ms'), name: '', amount: 0, due: x.length ? addMonths(x[x.length - 1].due ?? c.start, 1) : c.start, status: 'Pending' }]);
  const splitEven = (n: number) => { const each = Math.floor((c.amount / n) * 100) / 100; setMs(Array.from({ length: n }, (_, i) => ({ id: uid('ms'), name: c.billingMethod === 'Fixed price' ? `Instalment ${i + 1}` : `Milestone ${i + 1}`, amount: i === n - 1 ? Math.round((c.amount - each * (n - 1)) * 100) / 100 : each, due: addMonths(c.start, Math.round(((i + 1) * (c.end ? Math.max(1, (new Date(c.end).getTime() - new Date(c.start).getTime()) / (30 * 86400000)) : n)) / n)), status: 'Pending' }))); };
  const isFx = c.currency !== s.currency;

  return (
    <div className="page">
      <PageHeader title={id ? `Edit ${existing?.number}` : 'New contract'} subtitle={<>{c.partyName ?? 'Choose a customer'} · {c.billingMethod} · {c.currency}{isFx ? ` @ ${engine.resolveRate(c.currency, s.currency, c.start).rate}` : ''}</>} back={{ label: 'Contracts', path: id ? `projects/contracts/${id}` : 'projects/contracts' }}
        actions={<><Button variant="ghost" onClick={() => nav.back('projects/contracts')}>Discard</Button><Button variant="secondary" onClick={() => persist(false)}>Save draft</Button><Button variant="primary" onClick={() => persist(true)} data-testid="submit-contract">Save & submit</Button></>} />
      {errs.length > 0 && <Banner tone="danger">{errs.length} thing(s) to fix: {errs.map((e) => e.message).join(' · ')}</Banner>}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card title="Parties & scope">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <EntityPicker label="Customer" required value={c.customerId || undefined} onChange={onCustomer} options={customers} error={err('customerId')} recentKey="contract-customer" onCreate={() => nav.go('masters/customers/new')} createLabel="Create customer" />
              <TextField label="Contract title" required value={c.title} onChange={(v) => set({ title: v })} error={err('title')} placeholder="ERP advisory — time & material" />
              <div>
                <EntityPicker label="Project" value={c.projectId} onChange={(pid) => set({ projectId: pid })} options={projects} placeholder={createProject ? 'Will be created from this contract' : 'Link an existing project'} disabled={createProject} help="Journals and invoices carry the project dimension" />
                {!id && <CheckboxField checked={createProject} onChange={(v) => { setCreateProject(v); if (v) set({ projectId: undefined }); }} label="Create a project from this contract" style={{ marginTop: 6 }} />}
              </div>
              <EntityPicker label="Default service (invoice line item)" value={c.serviceItemId} onChange={(iid) => set({ serviceItemId: iid })} options={items} help="Catalog item used on generated invoices" />
              <DateField label="Start" required value={c.start} onChange={(v) => set({ start: v })} error={err('start')} />
              <DateField label="End" value={c.end} onChange={(v) => set({ end: v || undefined })} error={err('end')} help="Leave blank for open-ended" />
              <SelectField label="Currency" value={c.currency} onChange={(v) => set({ currency: v })} options={(s.company?.permittedCurrencies ?? ['INR']).map((x) => ({ value: x, label: x }))} help={isFx ? `Invoices post at the spot rate on the billing date` : undefined} />
              <SelectField label="Revenue recognition" value={c.revenueMethod} onChange={(v) => set({ revenueMethod: v as RevenueMethod })} options={[{ value: 'Auto', label: `Auto (${autoLabel(c.billingMethod)})` }, { value: 'Hours', label: 'Approved hours × rate' }, { value: 'Percent complete', label: '% complete' }, { value: 'Milestone', label: 'On milestone achievement' }, { value: 'Straight-line', label: 'Straight-line over term' }, { value: 'Usage', label: 'Recorded usage' }]} />
            </div>
          </Card>
          <Card title="Billing method">
            <RadioCards value={c.billingMethod} onChange={(m) => { set({ billingMethod: m as BillingMethod, recurrence: m === 'Recurring' ? (c.recurrence ?? { amount: c.amount, frequency: 'Monthly', nextBillDate: c.start }) : c.recurrence, usage: m === 'Usage' ? (c.usage ?? { metric: '', unit: 'Nos', unitRate: 0, tiers: [] }) : c.usage, markupPct: m === 'Cost plus' ? (c.markupPct ?? 15) : c.markupPct }); if ((m === 'Fixed price' || m === 'Milestone') && !ms.length) setMs([]); }} columns={3}
              options={BILLING_METHODS.map((m) => ({ value: m, label: m, description: METHOD_HELP[m] }))} />
            <div style={{ marginTop: 16 }}>
              {c.billingMethod === 'Fixed price' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  <MoneyField label="Contract value" required value={c.amount} onChange={(v) => set({ amount: v })} currency={c.currency} error={err('amount')} baseEquivalent={isFx ? { amount: Math.round(c.amount * (engine.resolveRate(c.currency, s.currency, c.start).rate || 1)), currency: s.currency, rate: engine.resolveRate(c.currency, s.currency, c.start).rate } : undefined} />
                  <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>{[2, 3, 4].map((n) => <Button key={n} size="sm" variant="secondary" onClick={() => splitEven(n)} disabled={!c.amount}>Split into {n}</Button>)}</div>
                  <div style={{ gridColumn: '1 / -1' }}><ScheduleEditor rows={ms} onChange={setMs} currency={c.currency} label="Instalment schedule" total={c.amount} onAdd={addMs} error={err('milestones')} /></div>
                </div>
              )}
              {c.billingMethod === 'Milestone' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  <MoneyField label="Total contract value" required value={c.amount} onChange={(v) => set({ amount: v })} currency={c.currency} error={err('amount')} />
                  <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>{[3, 4, 5].map((n) => <Button key={n} size="sm" variant="secondary" onClick={() => splitEven(n)} disabled={!c.amount}>{n} equal milestones</Button>)}</div>
                  <div style={{ gridColumn: '1 / -1' }}><ScheduleEditor rows={ms} onChange={setMs} currency={c.currency} label="Milestones" total={c.amount} onAdd={addMs} deliverable error={err('milestones')} /></div>
                </div>
              )}
              {c.billingMethod === 'Time & material' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  <SelectField label="Rate card" value={c.rateCardId ?? ''} onChange={(v) => set({ rateCardId: v || undefined })} options={rateCards.filter((r) => r.status === 'Active').map((r) => ({ value: r.id, label: `${r.name} (${r.currency})`, disabled: r.currency !== c.currency }))} allowEmpty placeholder="— Per-role rates below —" error={err('rateCardId')} help="Role rates below override the card for matching roles" />
                  <NumberField label="Cap (hours)" value={c.capHours} onChange={(v) => set({ capHours: v || undefined })} decimals={0} suffix="h" help="Warn when approved hours exceed" />
                  <MoneyField label="Cap (amount)" value={c.capAmount} onChange={(v) => set({ capAmount: v || undefined })} currency={c.currency} help="Warn when billed value exceeds" />
                  <MoneyField label="Estimated value" value={c.amount} onChange={(v) => set({ amount: v })} currency={c.currency} help="For reporting only — billing uses actual hours" />
                  <div style={{ gridColumn: '1 / -1' }}><RatesEditor rows={c.rates ?? []} onChange={(rows) => set({ rates: rows })} currency={c.currency} /></div>
                </div>
              )}
              {c.billingMethod === 'Recurring' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
                  <MoneyField label="Fee per period" required value={c.recurrence?.amount} onChange={(v) => set({ recurrence: { ...(c.recurrence ?? { frequency: 'Monthly', nextBillDate: c.start }), amount: v } })} currency={c.currency} error={err('recurrence')} />
                  <SelectField label="Frequency" value={c.recurrence?.frequency ?? 'Monthly'} onChange={(v) => set({ recurrence: { ...(c.recurrence ?? { amount: 0, nextBillDate: c.start }), frequency: v as RecurrenceFrequency } })} options={['Monthly', 'Quarterly', 'Yearly']} />
                  <DateField label="Next bill date" required value={c.recurrence?.nextBillDate ?? c.start} onChange={(v) => set({ recurrence: { ...(c.recurrence ?? { amount: 0, frequency: 'Monthly' }), nextBillDate: v } })} help="Advances automatically after each billing run" />
                  <DateField label="Recurrence ends" value={c.recurrence?.endDate ?? c.end} onChange={(v) => set({ recurrence: { ...(c.recurrence ?? { amount: 0, frequency: 'Monthly', nextBillDate: c.start }), endDate: v || undefined } })} />
                </div>
              )}
              {c.billingMethod === 'Usage' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
                  <TextField label="Metric" required value={c.usage?.metric} onChange={(v) => set({ usage: { ...(c.usage ?? { unit: 'Nos', unitRate: 0 }), metric: v } })} placeholder="API calls" error={err('usage')} />
                  <TextField label="Unit" value={c.usage?.unit} onChange={(v) => set({ usage: { ...(c.usage ?? { metric: '', unitRate: 0 }), unit: v } })} placeholder="k calls" />
                  <MoneyField label="Unit rate" required value={c.usage?.unitRate} onChange={(v) => set({ usage: { ...(c.usage ?? { metric: '', unit: 'Nos' }), unitRate: v } })} currency={c.currency} />
                  <div style={{ gridColumn: '1 / -1' }}><TiersEditor tiers={c.usage?.tiers ?? []} onChange={(tiers) => set({ usage: { ...(c.usage ?? { metric: '', unit: 'Nos', unitRate: 0 }), tiers } })} currency={c.currency} unit={c.usage?.unit} /></div>
                </div>
              )}
              {c.billingMethod === 'Cost plus' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
                  <PercentField label="Markup on cost" required value={c.markupPct} onChange={(v) => set({ markupPct: v })} error={err('markupPct')} help="Applied to resource cost rate × hours and to expenses" />
                  <MoneyField label="Estimated value" value={c.amount} onChange={(v) => set({ amount: v })} currency={c.currency} />
                  <MoneyField label="Cap (amount)" value={c.capAmount} onChange={(v) => set({ capAmount: v || undefined })} currency={c.currency} />
                </div>
              )}
            </div>
          </Card>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card title="Tax, terms & dimensions">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <SelectField label="Tax rate" value={c.taxRateId ?? ''} onChange={(v) => set({ taxRateId: v || undefined })} options={taxOpts} allowEmpty help="Applied to every generated invoice line" />
              <SelectField label="Payment terms" value={c.paymentTerms ?? ''} onChange={(v) => set({ paymentTerms: v })} options={db.get<any>(C.paymentTerms).map((t) => ({ value: t.name, label: t.name }))} />
              <EntityPicker label="Department" value={c.dimensions?.Department} onChange={(d) => set({ dimensions: { ...(c.dimensions ?? {}), ...(d ? { Department: d } : {}) } })} options={dims} allowClear />
              <TextField label="Customer reference / PO" value={c.reference} onChange={(v) => set({ reference: v })} />
              <TextArea label="Terms (printed on SOW)" value={c.terms} onChange={(v) => set({ terms: v })} rows={3} />
              <TextArea label="Internal notes" value={c.notes} onChange={(v) => set({ notes: v })} rows={2} />
            </div>
          </Card>
          <Card title="What happens next">
            <ol style={{ fontSize: 12, color: 'var(--ink-2)', paddingLeft: 18, margin: 0, lineHeight: 1.7 }}>
              <li>Save & submit routes to a <strong>Contract</strong> workflow when one exists; otherwise the contract is auto-approved.</li>
              <li><strong>Activate</strong> the approved contract — timesheets, milestones, usage and billing runs then apply.</li>
              <li>Billing runs create <strong>Draft sales invoices</strong>; post them in Sales › Invoices.</li>
              <li>Revenue recognition posts accruals / deferrals per period against the project dimension.</li>
            </ol>
          </Card>
        </div>
      </div>
    </div>
  );
}

function autoLabel(m: BillingMethod) {
  return m === 'Time & material' || m === 'Cost plus' ? 'approved hours' : m === 'Fixed price' ? '% complete' : m === 'Milestone' ? 'milestones' : m === 'Recurring' ? 'straight-line' : 'usage';
}

export function ScheduleEditor({ rows, onChange, currency, label, total, onAdd, deliverable, error }: { rows: Partial<Milestone>[]; onChange: (r: Partial<Milestone>[]) => void; currency: string; label: string; total: number; onAdd: () => void; deliverable?: boolean; error?: string | null }) {
  const sum = rows.reduce((a, m) => a + (m.amount ?? 0), 0);
  const upd = (i: number, p: Partial<Milestone>) => onChange(rows.map((m, j) => (j === i ? { ...m, ...p } : m)));
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span className="field-label" style={{ marginBottom: 0 }}>{label}</span>
        <Button size="sm" variant="secondary" onClick={onAdd}>+ Add row</Button>
      </div>
      <div className="card" style={{ overflow: 'hidden' }}>
        <table className="data-table dense">
          <thead><tr><th style={{ width: 32 }}>#</th><th>Name</th>{deliverable && <th>Deliverable</th>}<th style={{ width: 150 }}>Due</th><th className="right" style={{ width: 160 }}>Amount</th><th style={{ width: 90 }}>Status</th><th style={{ width: 40 }} /></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={7} style={{ color: 'var(--ink-3)', textAlign: 'center', padding: 16 }}>No rows yet — add instalments or split the value evenly.</td></tr>}
            {rows.map((m, i) => {
              const locked = m.status === 'Invoiced';
              return (
                <tr key={m.id ?? i}>
                  <td>{i + 1}</td>
                  <td><input className="field-input grid" value={m.name ?? ''} onChange={(e) => upd(i, { name: e.target.value })} disabled={locked} placeholder="Milestone name" /></td>
                  {deliverable && <td><input className="field-input grid" value={m.deliverable ?? ''} onChange={(e) => upd(i, { deliverable: e.target.value })} disabled={locked} placeholder="Acceptance criteria" /></td>}
                  <td><input type="date" className="field-input grid" value={m.due ?? ''} onChange={(e) => upd(i, { due: e.target.value })} disabled={locked} /></td>
                  <td><input className="field-input grid num" value={m.amount ?? 0} onChange={(e) => upd(i, { amount: Number(e.target.value.replace(/[^0-9.]/g, '')) || 0 })} disabled={locked} /></td>
                  <td><span className={`badge badge-${m.status === 'Invoiced' ? 'posted' : m.status === 'Achieved' ? 'approved' : 'draft'}`}>{m.status ?? 'Pending'}</span></td>
                  <td>{!locked && <button type="button" className="btn-icon" onClick={() => onChange(rows.filter((_, j) => j !== i))} title="Remove">✕</button>}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot><tr><td colSpan={deliverable ? 4 : 3}>Schedule total</td><td className="right money" style={{ color: Math.abs(sum - total) > 0.5 ? 'var(--danger)' : 'var(--good)' }}>{fmtMoney(sum, currency)}</td><td colSpan={2} style={{ fontSize: 11, color: 'var(--ink-3)' }}>{Math.abs(sum - total) > 0.5 ? `≠ ${fmtMoney(total, currency)}` : '= contract value'}</td></tr></tfoot>
        </table>
      </div>
      {error && <div className="field-error">{error}</div>}
    </div>
  );
}

function RatesEditor({ rows, onChange, currency }: { rows: RateRow[]; onChange: (r: RateRow[]) => void; currency: string }) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span className="field-label" style={{ marginBottom: 0 }}>Per-role rates ({currency}/h)</span>
        <Button size="sm" variant="secondary" onClick={() => onChange([...rows, { role: ROLES.find((r) => !rows.some((x) => x.role === r)) ?? '', rate: 0 }])}>+ Add role</Button>
      </div>
      {rows.length === 0 ? <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>None — the rate card applies to every role.</div> : (
        <div className="card" style={{ overflow: 'hidden' }}>
          <table className="data-table dense">
            <thead><tr><th>Role</th><th className="right" style={{ width: 160 }}>Rate / h</th><th style={{ width: 40 }} /></tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td><select className="field-input grid" value={r.role} onChange={(e) => onChange(rows.map((x, j) => (j === i ? { ...x, role: e.target.value } : x)))}>{[r.role, ...ROLES.filter((x) => x !== r.role)].map((x) => <option key={x} value={x}>{x || '— Role —'}</option>)}</select></td>
                  <td><input className="field-input grid num" value={r.rate} onChange={(e) => onChange(rows.map((x, j) => (j === i ? { ...x, rate: Number(e.target.value.replace(/[^0-9.]/g, '')) || 0 } : x)))} /></td>
                  <td><button type="button" className="btn-icon" onClick={() => onChange(rows.filter((_, j) => j !== i))}>✕</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function TiersEditor({ tiers, onChange, currency, unit }: { tiers: { upTo: number; rate: number }[]; onChange: (t: { upTo: number; rate: number }[]) => void; currency: string; unit?: string }) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span className="field-label" style={{ marginBottom: 0 }}>Volume tiers (optional)</span>
        <Button size="sm" variant="secondary" onClick={() => onChange([...tiers, { upTo: (tiers[tiers.length - 1]?.upTo ?? 0) + 100, rate: 0 }])}>+ Add tier</Button>
      </div>
      {tiers.length === 0 ? <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>No tiers — the unit rate applies to all volumes.</div> : (
        <div className="card" style={{ overflow: 'hidden' }}>
          <table className="data-table dense">
            <thead><tr><th>Up to ({unit || 'units'})</th><th className="right">Rate ({currency})</th><th style={{ width: 40 }} /></tr></thead>
            <tbody>
              {tiers.map((t, i) => (
                <tr key={i}>
                  <td><input className="field-input grid num" value={t.upTo} onChange={(e) => onChange(tiers.map((x, j) => (j === i ? { ...x, upTo: Number(e.target.value) || 0 } : x)))} /></td>
                  <td><input className="field-input grid num" value={t.rate} onChange={(e) => onChange(tiers.map((x, j) => (j === i ? { ...x, rate: Number(e.target.value) || 0 } : x)))} /></td>
                  <td><button type="button" className="btn-icon" onClick={() => onChange(tiers.filter((_, j) => j !== i))}>✕</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div style={{ fontSize: 11, color: 'var(--ink-4)', marginTop: 4 }}>Quantities above the last tier bill at the unit rate.</div>
    </div>
  );
}
