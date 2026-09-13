// Milestone board per contract (Achieve → ready to bill) and usage records entry / import.
import { useMemo, useState } from 'react';
import { C, nav, useCollection, useSession } from '../../store';
import { PageHeader, ScopeLine, Tabs, Card, Button, Badge, Money, ConfirmDialog, Drawer, EntityPicker, NumberField, TextField, DateField, TextArea, useToast, ImportWizard, DataTable, EmptyState, Pill, SelectField } from '../../components/ui';
import type { Column, MenuAction } from '../../components/ui';
import { fmtDate, fmtMoney, fmtPeriod, today, daysBetween } from '../../lib/format';
import type { Contract, Milestone, UsageRecord } from './types';
import { useRows, contractOf, milestonesOf, currentPeriod } from './data';
import { useContractOptions, ContractLink, ProjectLink, InvoiceLink, Muted, MethodPill } from './shared';
import { achieveMilestone, reopenMilestone, saveUsage, removeUsage, tierRate } from './actions';

export default function Milestones({ tab, contractId }: { tab?: string; contractId?: string }) {
  const [t, setT] = useState<'board' | 'usage'>(tab === 'usage' ? 'usage' : 'board');
  return (
    <div className="page">
      <PageHeader title="Milestones & usage" subtitle={<ScopeLine extra="deliverables and metered usage feed the billing engine" />} />
      <Tabs variant="filter" value={t} onChange={(v) => { setT(v); nav.replace(`projects/milestones?tab=${v}${contractId ? '&contract=' + contractId : ''}`); }} tabs={[{ id: 'board', label: 'Milestone board' }, { id: 'usage', label: 'Usage records' }]} />
      {t === 'board' ? <Board contractId={contractId} /> : <Usage contractId={contractId} />}
    </div>
  );
}

function Board({ contractId }: { contractId?: string }) {
  const contracts = useRows<Contract>(C.contracts).filter((c) => (c.billingMethod === 'Milestone' || c.billingMethod === 'Fixed price') && c.status !== 'Cancelled' && c.status !== 'Draft');
  useCollection<Milestone>(C.milestones);
  const s = useSession();
  const toast = useToast();
  const [filter, setFilter] = useState(contractId ?? '');
  const [dialog, setDialog] = useState<{ kind: 'achieve' | 'reopen'; m: Milestone } | null>(null);
  const visible = filter ? contracts.filter((c) => c.id === filter) : contracts;
  const cols: Milestone['status'][] = ['Pending', 'Achieved', 'Invoiced'];
  const all = visible.flatMap((c) => milestonesOf(c.id).map((m) => ({ m, c })));
  return (
    <>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <SelectField label="Contract" value={filter} onChange={setFilter} options={contracts.map((c) => ({ value: c.id, label: `${c.number} · ${c.title}` }))} placeholder="All milestone / fixed-price contracts" size="sm" style={{ minWidth: 320 }} />
        <div style={{ flex: 1 }} />
        <Muted>{all.filter((x) => x.m.status === 'Achieved').length} ready to bill · {all.filter((x) => x.m.status === 'Pending' && x.m.due < today()).length} overdue</Muted>
        <Button variant="primary" onClick={() => nav.go('projects/billing', filter ? { contract: filter } : undefined)} disabled={!all.some((x) => x.m.status === 'Achieved')}>Bill achieved milestones</Button>
      </div>
      {!all.length ? <EmptyState title="No milestones" description="Milestones come from Milestone and Fixed price contracts." action={<Button variant="primary" onClick={() => nav.go('projects/contracts/new', { method: 'Milestone' })}>New milestone contract</Button>} /> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, alignItems: 'start' }}>
          {cols.map((col) => (
            <div key={col} style={{ background: '#F9FBFC', borderRadius: 12, padding: 12, minHeight: 200 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}><span className="section-title" style={{ marginBottom: 0 }}>{col === 'Achieved' ? 'Ready to bill' : col}</span><Muted>{all.filter((x) => x.m.status === col).length}</Muted></div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {all.filter((x) => x.m.status === col).sort((a, b) => a.m.due.localeCompare(b.m.due)).map(({ m, c }) => {
                  const late = m.status === 'Pending' && m.due < today();
                  const actions: MenuAction[] = [];
                  if (m.status === 'Pending' && c.billingMethod === 'Milestone') actions.push({ label: 'Mark achieved', onClick: () => setDialog({ kind: 'achieve', m }), disabled: c.status !== 'Active', reason: c.status !== 'Active' ? `Contract ${c.status}` : undefined });
                  if (m.status === 'Achieved') actions.push({ label: 'Reopen', onClick: () => setDialog({ kind: 'reopen', m }) });
                  return (
                    <div key={m.id} className="card" style={{ padding: 12, borderLeft: `3px solid ${late ? '#C0393F' : m.status === 'Achieved' ? '#12784E' : m.status === 'Invoiced' ? '#325CFF' : '#DADCE0'}` }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{m.name}</div>
                        <Money value={m.amount} currency={c.currency} code={c.currency !== s.currency} />
                      </div>
                      <div style={{ fontSize: 12, color: '#5F6368', marginTop: 4 }}><ContractLink id={c.id} /> · {c.partyName} · <ProjectLink id={m.projectId} /></div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, fontSize: 12 }}>
                        <span style={{ color: late ? '#C0393F' : '#5F6368' }}>{m.kind === 'Instalment' ? 'Due' : m.status === 'Pending' ? 'Due' : 'Achieved'} {fmtDate(m.status === 'Pending' ? m.due : m.achievedAt ?? m.due)}{late ? ` · ${daysBetween(m.due, today())} d late` : ''}</span>
                        {m.status === 'Invoiced' ? <InvoiceLink id={m.invoiceId} number={m.invoiceNumber} /> : m.kind === 'Instalment' ? <Pill tone="neutral">Instalment</Pill> : m.status === 'Achieved' ? <Pill tone="good">Ready</Pill> : null}
                      </div>
                      {m.deliverable && <div style={{ fontSize: 11, color: '#6E6E71', marginTop: 4 }}>{m.deliverable}</div>}
                      {actions.length > 0 && <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>{actions.map((a) => <Button key={a.label} size="sm" variant={a.label === 'Reopen' ? 'ghost' : 'tinted'} onClick={a.onClick} disabled={a.disabled} reason={a.reason}>{a.label}</Button>)}</div>}
                      {m.status === 'Pending' && m.kind === 'Instalment' && m.due <= today() && c.status === 'Active' && <div style={{ marginTop: 8 }}><Button size="sm" variant="tinted" onClick={() => nav.go('projects/billing', { contract: c.id })}>Bill instalment</Button></div>}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
      <ConfirmDialog open={dialog?.kind === 'achieve'} onClose={() => setDialog(null)} title={`Mark "${dialog?.m.name}" achieved?`} statement="The milestone becomes ready to bill and its revenue is recognised in the period of achievement." consequences={[{ engine: 'Workflow', text: 'Status → Achieved (ready to bill)' }, { engine: 'Journal', text: 'Recognised when revenue recognition runs for this period' }]} confirmLabel="Mark achieved" cancelLabel="Not yet" onConfirm={(note) => { if (dialog) achieveMilestone(dialog.m.id, today(), note || undefined); toast.success('Milestone ready to bill'); }} />
      <ConfirmDialog open={dialog?.kind === 'reopen'} onClose={() => setDialog(null)} title="Reopen milestone?" statement="Returns to Pending and drops out of the next billing run." reasonRequired confirmLabel="Reopen milestone" cancelLabel="Keep achieved" onConfirm={(r) => { if (dialog) reopenMilestone(dialog.m.id, r); toast.success('Milestone reopened'); }} />
    </>
  );
}

function Usage({ contractId }: { contractId?: string }) {
  const rows = useRows<UsageRecord>(C.usageRecords, (a, b) => b.period.localeCompare(a.period));
  const s = useSession();
  const toast = useToast();
  const contracts = useContractOptions((c) => c.billingMethod === 'Usage' && c.status === 'Active');
  const [filter, setFilter] = useState(contractId ?? '');
  const [form, setForm] = useState<Partial<UsageRecord> | null>(null);
  const [imp, setImp] = useState(false);
  const [remove, setRemove] = useState<string | null>(null);
  const visible = filter ? rows.filter((r) => r.contractId === filter) : rows;
  const cols: Column<UsageRecord>[] = [
    { key: 'period', label: 'Period', sortable: true, render: (u) => fmtPeriod(u.period) },
    { key: 'contractId', label: 'Contract', render: (u) => <div><ContractLink id={u.contractId} /><div><Muted>{contractOf(u.contractId)?.partyName}</Muted></div></div> },
    { key: 'metric', label: 'Metric' },
    { key: 'qty', label: 'Quantity', align: 'right', render: (u) => <span className="money">{u.qty} {contractOf(u.contractId)?.usage?.unit ?? ''}</span>, total: (rs) => <span className="money" style={{ fontWeight: 600 }}>{rs.reduce((a, u) => a + u.qty, 0).toFixed(1)}</span> },
    { key: 'rate', label: 'Rate', align: 'right', render: (u) => <Money value={u.rate} currency={contractOf(u.contractId)?.currency ?? s.currency} /> },
    { key: 'amount', label: 'Amount', align: 'right', render: (u) => <Money value={u.amount} currency={contractOf(u.contractId)?.currency ?? s.currency} />, total: (rs) => <span className="money" style={{ fontWeight: 600 }}>{fmtMoney(rs.reduce((a, u) => a + u.amount, 0), s.currency)}</span> },
    { key: 'source', label: 'Source', render: (u) => <Muted>{u.source}{u.notes ? ` · ${u.notes}` : ''}</Muted> },
    { key: 'invoiced', label: 'Status', render: (u) => u.invoiceId ? <InvoiceLink id={u.invoiceId} number={u.invoiceNumber} /> : <Badge status="Unbilled" /> },
  ];
  const actions = (u: UsageRecord): MenuAction[] => u.invoiced ? [{ label: 'Open invoice', onClick: () => nav.go(`sales/invoices/${u.invoiceId}`) }] : [{ label: 'Edit', onClick: () => setForm(u) }, { label: 'Bill now', onClick: () => nav.go('projects/billing', { contract: u.contractId }) }, { label: 'Remove', danger: true, separator: true, onClick: () => setRemove(u.id) }];
  const unbilled = useMemo(() => visible.filter((u) => !u.invoiced).reduce((a, u) => a + u.amount, 0), [visible]);
  const fc = contractOf(form?.contractId);
  return (
    <>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <SelectField label="Contract" value={filter} onChange={setFilter} options={contracts.map((c) => ({ value: c.id, label: c.primary }))} placeholder="All usage contracts" size="sm" style={{ minWidth: 320 }} />
        <div style={{ flex: 1 }} />
        <Muted>{fmtMoney(unbilled, s.currency)} uninvoiced</Muted>
        <Button variant="secondary" onClick={() => setImp(true)}>Import usage</Button>
        <Button variant="primary" onClick={() => setForm({ contractId: filter || contracts[0]?.id, period: currentPeriod(), qty: 0 })} disabled={!contracts.length} reason={contracts.length ? undefined : 'No active usage contracts'}>Record usage</Button>
      </div>
      <DataTable rows={visible} columns={cols} rowActions={actions} dense emptyTitle="No usage recorded" emptyDescription="Record metered usage per period; billing runs bill everything not yet invoiced." />
      {form && (
        <Drawer open onClose={() => setForm(null)} title={form.id ? 'Edit usage' : 'Record usage'} width={520} footer={<><Button variant="ghost" onClick={() => setForm(null)}>Cancel</Button><Button variant="primary" onClick={() => { try { const u = saveUsage({ ...form, contractId: form.contractId ?? '', qty: form.qty ?? 0, period: form.period ?? currentPeriod() }); toast.success(`Usage recorded · ${fmtMoney(u.amount, fc?.currency)}`); setForm(null); } catch (e: any) { toast.error(e.message); } }}>Save usage</Button></>}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <EntityPicker label="Contract" required value={form.contractId} onChange={(cid) => setForm({ ...form, contractId: cid, rate: undefined })} options={contracts} disabled={!!form.id} />
            {fc && <Card padding={12}><MethodPill method={fc.billingMethod} /> <span style={{ fontSize: 12 }}>{fc.usage?.metric} · {fmtMoney(fc.usage?.unitRate ?? 0, fc.currency)} per {fc.usage?.unit}{fc.usage?.tiers?.length ? ` · tiers: ${fc.usage.tiers.map((t) => `≤${t.upTo} @ ${t.rate}`).join(', ')}` : ''}</span></Card>}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <TextField label="Period (yyyy-mm)" required value={form.period} onChange={(v) => setForm({ ...form, period: v })} />
              <DateField label="Usage date" value={form.date ?? `${form.period ?? currentPeriod()}-01`} onChange={(v) => setForm({ ...form, date: v })} />
              <NumberField label={`Quantity (${fc?.usage?.unit ?? 'units'})`} required value={form.qty} onChange={(v) => setForm({ ...form, qty: v })} decimals={3} />
              <NumberField label="Rate (blank = contract)" value={form.rate} onChange={(v) => setForm({ ...form, rate: v || undefined })} decimals={4} help={fc && form.qty ? `Contract rate ${fmtMoney(tierRate(fc, form.qty), fc.currency)} → ${fmtMoney((form.rate ?? tierRate(fc, form.qty)) * form.qty, fc.currency)}` : undefined} />
            </div>
            <TextArea label="Notes" value={form.notes} onChange={(v) => setForm({ ...form, notes: v })} rows={2} />
          </div>
        </Drawer>
      )}
      <ConfirmDialog open={!!remove} onClose={() => setRemove(null)} title="Remove usage record?" statement="Only uninvoiced usage can be removed." danger confirmLabel="Remove usage" cancelLabel="Keep record" onConfirm={() => { if (remove) removeUsage(remove); toast.success('Usage removed'); }} />
      <ImportWizard open={imp} onClose={() => setImp(false)} entity="Usage records" fields={[{ key: 'contract', label: 'Contract number', required: true, validate: (v) => (contracts.some((c) => (c.raw as Contract).number === v) ? null : `No active usage contract ${v}`) }, { key: 'period', label: 'Period (yyyy-mm)', required: true, validate: (v) => (/^\d{4}-\d{2}$/.test(v) ? null : 'Use yyyy-mm') }, { key: 'metric', label: 'Metric' }, { key: 'qty', label: 'Quantity', required: true, type: 'number' }, { key: 'rate', label: 'Rate', type: 'number' }, { key: 'notes', label: 'Notes' }]}
        sampleRows={[{ 'Contract number': (contracts[0]?.raw as Contract | undefined)?.number ?? 'CON/26-27/0005', 'Period (yyyy-mm)': currentPeriod(), Metric: 'API calls', Quantity: '48.2', Rate: '', Notes: 'Gateway export' }]}
        onCommit={(rows) => { let n = 0; rows.forEach((r) => { const c = contracts.find((x) => (x.raw as Contract).number === r.contract); if (!c) return; try { saveUsage({ contractId: c.id, period: r.period, metric: r.metric || undefined, qty: Number(r.qty), rate: r.rate ? Number(r.rate) : undefined, notes: r.notes, source: 'Import' }); n++; } catch { /* row skipped */ } }); toast.success(`${n} usage record(s) imported`); return n; }} />
    </>
  );
}
