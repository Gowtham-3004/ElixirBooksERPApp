// Contract document page: rail (customer, value, billed / unbilled / deferred),
// tabs Terms · Milestones · Billing history · Revenue · Approvals · Activity.
import { useMemo, useState } from 'react';
import { db, C, engine, nav, useRecord, useSession, useCollection } from '../../../store';
import type { DocHeader, ApprovalRequest, Journal } from '../../../store';
import { DocumentPage, RailSection, PartyRail, Badge, Button, ActionMenu, ConfirmDialog, Modal, ApprovalsTab, ActivityTab, EmptyState, useToast, KV, Card, DataTable, Money, Banner, Pill, NumberField, TextField } from '../../../components/ui';
import type { MenuAction, Column } from '../../../components/ui';
import { fmtDate, fmtMoney, fmtPeriod, today, amountInWords } from '../../../lib/format';
import { PrintIcon } from '../../../components/Icons';
import type { Contract, Milestone, RevenueSchedule, BillingRun } from '../types';
import { contractSummary, milestonesOf, usageOf, invoicesOfContract, projectsOfContract, billingRunsOf, currentPeriod, billRateFor, resourceOf } from '../data';
import { MethodPill, ProjectLink, InvoiceLink, Muted } from '../shared';
import { submitContract, activateContract, completeContract, cancelContract, achieveMilestone, reopenMilestone, updateProgress, contractNeedsWorkflow } from '../actions';
import { schedulePreview, recognizedFor } from '../revenue';

export default function ContractDetail({ id, tab, onTab }: { id: string; tab?: string; onTab?: (t: string) => void }) {
  const c = useRecord<Contract>(C.contracts, id);
  const s = useSession();
  const toast = useToast();
  const approvals = useCollection<ApprovalRequest>(C.approvals);
  useCollection<Milestone>(C.milestones);
  useCollection<DocHeader>(C.salesInvoices);
  useCollection<RevenueSchedule>(C.revenueSchedules);
  useCollection(C.timesheets);
  const [dialog, setDialog] = useState<null | 'activate' | 'complete' | 'cancel' | 'achieve' | 'reopen'>(null);
  const [msId, setMsId] = useState<string | null>(null);
  const [print, setPrint] = useState(false);
  const [progress, setProgress] = useState<{ period: string; pct: number; note: string } | null>(null);
  const summary = useMemo(() => (c ? contractSummary(c) : null), [c, approvals]);
  if (!c || !summary) return <EmptyState icon="📄" title="Contract not found" action={<Button variant="primary" onClick={() => nav.go('projects/contracts')}>Back to contracts</Button>} />;
  const can = s.can('projects.contract.edit') || s.can('projects.*');
  const req = approvals.find((a) => a.id === c.approvalId) ?? [...approvals].reverse().find((a) => a.docId === c.id);
  const canAct = req && req.status === 'Pending' ? engine.canActOnApproval(req) : { ok: false, reason: '' };
  const ms = milestonesOf(c.id);
  const projects = projectsOfContract(c.id);
  const invoices = invoicesOfContract(c.id).sort((a, b) => b.date.localeCompare(a.date));
  const runs = billingRunsOf(c.id);
  const sched = schedulePreview(c, currentPeriod());
  const run = (fn: () => void, ok?: string) => { try { fn(); if (ok) toast.success(ok); } catch (e: any) { toast.error(e.message); } };

  let footer: React.ReactNode;
  const overflow: MenuAction[] = [{ label: 'Print SOW summary', onClick: () => setPrint(true), icon: <PrintIcon size={13} /> }];
  if (['Draft', 'Returned', 'Rejected'].includes(c.status)) {
    overflow.push({ label: 'Cancel contract', danger: true, separator: true, onClick: () => setDialog('cancel'), disabled: !can });
    footer = (
      <>
        <ActionMenu actions={overflow} trigger={<Button variant="secondary">⋮</Button>} />
        <Button variant="secondary" onClick={() => nav.go(`projects/contracts/${c.id}`, { edit: 1 })} disabled={!can} reason={can ? undefined : 'Requires projects.contract.edit'}>Edit</Button>
        <Button variant="primary" onClick={() => run(() => { const r = submitContract(c.id); toast.success(r.request ? `Submitted · ${r.request.ruleName}` : 'Approved — no Contract workflow rule applies'); })} disabled={!can} reason={can ? undefined : 'Requires projects.contract.edit'} data-testid="submit-contract">{contractNeedsWorkflow(c) ? 'Submit for approval' : 'Approve contract'}</Button>
      </>
    );
  } else if (c.status === 'Submitted') {
    footer = canAct.ok ? (
      <>
        <Button variant="danger" onClick={() => run(() => engine.actOnApproval(req!.id, 'Reject', { comment: 'Rejected from contract page' }), 'Rejected')}>Reject</Button>
        <Button variant="primary" onClick={() => run(() => engine.actOnApproval(req!.id, 'Approve'), 'Approved')}>Approve</Button>
      </>
    ) : <span style={{ fontSize: 12, color: '#5F6368' }}>Awaiting {req?.steps.find((x) => x.order === req.currentStep)?.approverLabel ?? 'approver'}{canAct.reason ? ` · ${canAct.reason}` : ''}</span>;
  } else if (c.status === 'Approved') {
    overflow.push({ label: 'Cancel contract', danger: true, separator: true, onClick: () => setDialog('cancel'), disabled: !can });
    footer = (
      <>
        <ActionMenu actions={overflow} trigger={<Button variant="secondary">⋮</Button>} />
        <Button variant="secondary" onClick={() => nav.go(`projects/contracts/${c.id}`, { edit: 1 })} disabled={!can}>Edit</Button>
        <Button variant="primary" onClick={() => setDialog('activate')} disabled={!can} reason={can ? undefined : 'Requires projects.contract.edit'} data-testid="activate-contract">Activate contract</Button>
      </>
    );
  } else if (c.status === 'Active') {
    overflow.push({ label: 'Edit terms', onClick: () => nav.go(`projects/contracts/${c.id}`, { edit: 1 }), disabled: !can });
    overflow.push({ label: 'Run revenue recognition', onClick: () => nav.go('projects/revenue', { contract: c.id }) });
    overflow.push({ label: 'Mark completed', onClick: () => setDialog('complete'), disabled: !can });
    overflow.push({ label: 'Cancel contract', danger: true, separator: true, onClick: () => setDialog('cancel'), disabled: !can });
    footer = (
      <>
        <Button variant="secondary" icon={<PrintIcon size={14} />} onClick={() => setPrint(true)}>Print SOW</Button>
        {(c.billingMethod === 'Time & material' || c.billingMethod === 'Cost plus') && <Button variant="secondary" onClick={() => nav.go('projects/timesheets/new')}>Log time</Button>}
        {!projects.length && <Button variant="secondary" onClick={() => nav.go('projects/projects/new', { contract: c.id, customer: c.customerId })}>Create project</Button>}
        <Button variant="primary" onClick={() => nav.go('projects/billing', { contract: c.id })} data-testid="run-billing">Run billing</Button>
        <ActionMenu actions={overflow} trigger={<Button variant="secondary">⋮ More</Button>} />
      </>
    );
  } else {
    footer = <Button variant="secondary" icon={<PrintIcon size={14} />} onClick={() => setPrint(true)}>Print SOW</Button>;
  }

  const msCols: Column<Milestone>[] = [
    { key: 'order', label: '#', width: 40 },
    { key: 'name', label: c.billingMethod === 'Fixed price' ? 'Instalment' : 'Milestone', render: (m) => <div><div className="cell-primary">{m.name}</div>{m.deliverable && <Muted>{m.deliverable}</Muted>}</div> },
    { key: 'due', label: 'Due', render: (m) => <span style={{ color: m.status === 'Pending' && m.due < today() ? '#C0393F' : undefined }}>{fmtDate(m.due)}</span> },
    { key: 'status', label: 'Status', render: (m) => <div><Badge status={m.status === 'Achieved' ? 'Ready' : m.status}>{m.status === 'Achieved' ? 'Ready to bill' : m.status}</Badge>{m.achievedAt && <div><Muted>Achieved {fmtDate(m.achievedAt)} · {m.achievedBy}</Muted></div>}</div> },
    { key: 'invoice', label: 'Invoice', render: (m) => m.invoiceId ? <InvoiceLink id={m.invoiceId} number={m.invoiceNumber} /> : <span style={{ color: '#B0B5BF' }}>—</span> },
    { key: 'amount', label: 'Amount', align: 'right', render: (m) => <Money value={m.amount} currency={c.currency} code={c.currency !== s.currency} />, total: (rs) => <span className="money" style={{ fontWeight: 600 }}>{fmtMoney(rs.reduce((a, m) => a + m.amount, 0), c.currency)}</span> },
  ];
  const msActions = (m: Milestone): MenuAction[] => {
    const a: MenuAction[] = [];
    if (m.status === 'Pending' && c.billingMethod === 'Milestone') a.push({ label: 'Mark achieved', onClick: () => { setMsId(m.id); setDialog('achieve'); }, disabled: c.status !== 'Active', reason: c.status !== 'Active' ? 'Activate the contract first' : undefined });
    if (m.status === 'Achieved') a.push({ label: 'Reopen', onClick: () => { setMsId(m.id); setDialog('reopen'); } });
    if (m.status !== 'Invoiced') a.push({ label: 'Bill now', onClick: () => nav.go('projects/billing', { contract: c.id }), disabled: c.status !== 'Active' || (m.status === 'Pending' && c.billingMethod === 'Milestone'), reason: m.status === 'Pending' && c.billingMethod === 'Milestone' ? 'Mark achieved first' : undefined });
    if (m.invoiceId) a.push({ label: 'Open invoice', onClick: () => nav.go(`sales/invoices/${m.invoiceId}`) });
    return a;
  };
  const invCols: Column<DocHeader>[] = [
    { key: 'number', label: 'Invoice', render: (i) => <InvoiceLink id={i.id} /> },
    { key: 'date', label: 'Date', render: (i) => fmtDate(i.date) },
    { key: 'reference', label: 'Period / ref', render: (i) => <Muted>{i.reference ?? '—'}</Muted> },
    { key: 'taxable', label: 'Taxable', align: 'right', render: (i) => <Money value={i.totals?.taxable ?? 0} currency={i.currency} /> },
    { key: 'total', label: 'Total', align: 'right', render: (i) => <Money value={i.totals?.total ?? 0} currency={i.currency} code={i.currency !== s.currency} />, total: (rs) => <span className="money" style={{ fontWeight: 600 }}>{fmtMoney(rs.filter((x) => x.status !== 'Cancelled').reduce((a, x) => a + (x.totals?.total ?? 0), 0), c.currency)}</span> },
    { key: 'due', label: 'Due', align: 'right', render: (i) => i.status === 'Posted' || i.status === 'Settled' ? <Money value={i.totals?.due ?? 0} currency={i.currency} /> : <span style={{ color: '#B0B5BF' }}>—</span> },
  ];
  const usage = usageOf(c.id);
  const banner = c.status === 'Cancelled' ? <Banner tone="warning" full>Cancelled: {c.cancelReason}</Banner>
    : c.status === 'Approved' ? <Banner tone="info" full action={can ? <Button variant="link" onClick={() => setDialog('activate')}>Activate now</Button> : undefined}>Approved {fmtDate(c.approvedAt)} by {c.approvedBy}. Activate once the customer has signed — billing and recognition start then.</Banner>
    : c.status === 'Active' && c.capHours && summary.unbilledHours > 0 && c.capHours > 0 ? null : null;

  return (
    <>
      <DocumentPage
        backLabel="Contracts"
        onBack={() => nav.back('projects/contracts')}
        number={c.number}
        badges={<><Badge status={c.status} /><MethodPill method={c.billingMethod} />{c.currency !== s.currency && <Pill tone="neutral">{c.currency}</Pill>}</>}
        amount={{ label: c.billingMethod === 'Recurring' ? `${c.recurrence?.frequency ?? 'Monthly'} fee` : c.billingMethod === 'Time & material' || c.billingMethod === 'Cost plus' || c.billingMethod === 'Usage' ? 'Estimated value' : 'Contract value', value: c.billingMethod === 'Recurring' ? (c.recurrence?.amount ?? 0) : c.amount, currency: c.currency, base: c.currency !== s.currency ? c.totals?.baseTotal : undefined, baseCurrency: s.currency, rate: c.rate }}
        rail={
          <>
            <RailSection label="Customer" snapshot={c.status !== 'Draft'}><PartyRail snapshot={c.partySnapshot} name={c.partyName} link={`crm/customers/${c.customerId}`} /></RailSection>
            <RailSection label="Position">
              <div className="summary-block" style={{ padding: '10px 12px' }}>
                {[{ k: 'Billed (excl. tax)', v: fmtMoney(summary.billed, c.currency) }, { k: 'Unbilled work', v: fmtMoney(summary.unbilledValue, s.currency), tone: summary.unbilledValue > 0 ? '#8A4B0F' : undefined }, { k: 'Recognised to date', v: fmtMoney(summary.recognized, s.currency) }, { k: 'Accrued (unbilled)', v: fmtMoney(summary.unbilled, s.currency) }, { k: 'Deferred', v: fmtMoney(summary.deferred, s.currency) }, { k: 'Retainer available', v: fmtMoney(summary.retainerRemaining, c.currency) }].map((r) => (
                  <div key={r.k} className="ladder-row"><span className="ladder-label">{r.k}</span><span className="ladder-value" style={{ color: r.tone }}>{r.v}</span></div>
                ))}
              </div>
            </RailSection>
            <RailSection label="Projects">
              {projects.length ? projects.map((p) => <div key={p.id} style={{ fontSize: 13 }}><ProjectLink id={p.id} /> · {p.name} <Badge status={p.status} /></div>) : <Muted>No project linked</Muted>}
            </RailSection>
            <RailSection label="Term"><div style={{ fontSize: 13 }}>{fmtDate(c.start)} → {c.end ? fmtDate(c.end) : 'open-ended'}</div><Muted>{c.paymentTerms} · {db.find<any>(C.taxRates, c.taxRateId)?.name ?? 'No tax'}</Muted></RailSection>
            {c.dimensions && Object.keys(c.dimensions).length > 0 && <RailSection label="Dimensions"><div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>{Object.entries(c.dimensions).map(([k, v]) => <span key={k} className="dim-chip">{k}: {db.find<any>(C.dimensions, v)?.code ?? v}</span>)}</div></RailSection>}
          </>
        }
        activeTab={tab}
        onTab={onTab}
        banner={banner}
        footer={footer}
        tabs={[
          { id: 'terms', label: 'Terms', content: (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <Card title="Commercial terms">
                <KV columns={2} items={[
                  { k: 'Title', v: c.title }, { k: 'Billing method', v: c.billingMethod },
                  { k: 'Start', v: fmtDate(c.start) }, { k: 'End', v: c.end ? fmtDate(c.end) : 'Open-ended' },
                  { k: 'Currency', v: `${c.currency}${c.rate !== 1 ? ` @ ${c.rate}` : ''}` }, { k: 'Payment terms', v: c.paymentTerms },
                  { k: 'Tax rate', v: db.find<any>(C.taxRates, c.taxRateId)?.name ?? '—' }, { k: 'Revenue method', v: c.revenueMethod },
                  { k: 'Default service', v: db.find<any>(C.items, c.serviceItemId)?.name ?? '—' }, { k: 'Customer reference', v: c.reference ?? '—' },
                  ...(c.billingMethod === 'Time & material' ? [{ k: 'Rate card', v: db.find<any>(C.rateCards, c.rateCardId)?.name ?? 'Per-role rates' }, { k: 'Cap', v: [c.capHours ? `${c.capHours} h` : null, c.capAmount ? fmtMoney(c.capAmount, c.currency) : null].filter(Boolean).join(' · ') || 'None' }] : []),
                  ...(c.billingMethod === 'Recurring' && c.recurrence ? [{ k: 'Frequency', v: c.recurrence.frequency }, { k: 'Next bill date', v: fmtDate(c.recurrence.nextBillDate) }] : []),
                  ...(c.billingMethod === 'Usage' && c.usage ? [{ k: 'Metric', v: `${c.usage.metric} (${c.usage.unit})` }, { k: 'Unit rate', v: fmtMoney(c.usage.unitRate, c.currency) + (c.usage.tiers?.length ? ` · ${c.usage.tiers.length} tier(s)` : '') }] : []),
                  ...(c.billingMethod === 'Cost plus' ? [{ k: 'Markup', v: `${c.markupPct ?? 0}%` }] : []),
                ]} />
              </Card>
              {c.rates && c.rates.length > 0 && <Card title="Per-role rates"><table className="data-table dense"><thead><tr><th>Role</th><th className="right">Rate / h</th></tr></thead><tbody>{c.rates.map((r) => <tr key={r.role}><td>{r.role}</td><td className="right money">{fmtMoney(r.rate, c.currency)}</td></tr>)}</tbody></table></Card>}
              {(c.billingMethod === 'Time & material' || c.billingMethod === 'Cost plus') && projects.length > 0 && <Card title="Effective bill rates (team)"><table className="data-table dense"><thead><tr><th>Resource</th><th>Role</th><th className="right">Bill rate</th><th>Source</th></tr></thead><tbody>{Array.from(new Set(projects.flatMap((p) => p.teamEmployeeIds))).map((e) => { const r = billRateFor(c, e); return <tr key={e}><td>{db.find<any>(C.employees, e)?.name}</td><td>{resourceOf(e)?.role ?? '—'}</td><td className="right money">{fmtMoney(r.rate, c.currency)}</td><td><Muted>{r.source}</Muted></td></tr>; })}</tbody></table></Card>}
              {(c.terms || c.notes) && <Card title="Terms & notes"><div style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{c.terms}{c.terms && c.notes ? '\n\n' : ''}<span style={{ color: '#5F6368' }}>{c.notes}</span></div></Card>}
            </div>
          ) },
          { id: 'milestones', label: c.billingMethod === 'Usage' ? 'Usage' : 'Milestones', content: (
            c.billingMethod === 'Usage' ? (
              <Card title="Usage records" actions={<Button size="sm" variant="secondary" onClick={() => nav.go('projects/milestones', { tab: 'usage', contract: c.id })}>Record usage</Button>}>
                <table className="data-table dense"><thead><tr><th>Period</th><th>Metric</th><th className="right">Qty</th><th className="right">Rate</th><th className="right">Amount</th><th>Invoice</th></tr></thead><tbody>{usage.map((u) => <tr key={u.id}><td>{fmtPeriod(u.period)}</td><td>{u.metric}</td><td className="right money">{u.qty}</td><td className="right money">{fmtMoney(u.rate, c.currency)}</td><td className="right money">{fmtMoney(u.amount, c.currency)}</td><td>{u.invoiceId ? <InvoiceLink id={u.invoiceId} /> : <Badge status="Unbilled" />}</td></tr>)}{!usage.length && <tr><td colSpan={6} style={{ textAlign: 'center', color: '#5F6368', padding: 16 }}>No usage recorded yet</td></tr>}</tbody></table>
              </Card>
            ) : (c.billingMethod === 'Fixed price' || c.billingMethod === 'Milestone') ? (
              <DataTable rows={ms} columns={msCols} rowActions={msActions} dense emptyTitle="No schedule" emptyDescription="Edit the contract to add milestones or instalments." />
            ) : <EmptyState compact title={`${c.billingMethod} contracts have no milestone schedule`} description="Billing is driven by approved timesheets, expenses or the recurrence." />
          ) },
          { id: 'billing', label: 'Billing history', content: (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <DataTable rows={invoices} columns={invCols} dense onRowClick={(i) => nav.go(`sales/invoices/${i.id}`)} emptyTitle="No invoices yet" emptyDescription="Run billing to generate draft invoices from approved work." emptyAction={c.status === 'Active' ? <Button variant="primary" onClick={() => nav.go('projects/billing', { contract: c.id })}>Run billing</Button> : undefined} />
              {runs.length > 0 && <Card title="Billing runs"><table className="data-table dense"><thead><tr><th>Run</th><th>Period</th><th>Date</th><th>Result</th><th className="right">Amount</th></tr></thead><tbody>{runs.map((r: BillingRun) => { const res = r.results.find((x) => x.contractId === c.id); return <tr key={r.id} className="clickable" onClick={() => nav.go(`projects/billing/${r.id}`)}><td className="identifier">{r.number}</td><td>{fmtPeriod(r.period)}</td><td>{fmtDate(r.date)}</td><td>{res?.skipped ? <Muted>Skipped · {res.skipped}</Muted> : res?.invoiceNumber ? <InvoiceLink id={res.invoiceId} number={res.invoiceNumber} /> : '—'}</td><td className="right money">{res && !res.skipped ? fmtMoney(res.amount, res.currency) : '—'}</td></tr>; })}</tbody></table></Card>}
            </div>
          ) },
          { id: 'revenue', label: 'Revenue', content: (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {c.billingMethod === 'Fixed price' && (
                <Card title="% complete" actions={<Button size="sm" variant="secondary" onClick={() => setProgress({ period: currentPeriod(), pct: c.progress?.slice(-1)[0]?.pct ?? 0, note: '' })} disabled={c.status !== 'Active'}>Update % complete</Button>}>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{(c.progress ?? []).map((p) => <span key={p.period} className="chip selected" title={p.note}>{fmtPeriod(p.period)} · {p.pct}%</span>)}{!(c.progress?.length) && <Muted>No progress recorded — straight-line over the term applies until you do.</Muted>}</div>
                </Card>
              )}
              <Card title="Schedule (billed vs recognised)" actions={<Button size="sm" variant="primary" onClick={() => nav.go('projects/revenue', { contract: c.id })} disabled={c.status !== 'Active' && c.status !== 'Completed'}>Run recognition</Button>}>
                <table className="data-table dense">
                  <thead><tr><th>Period</th><th className="right">Billed</th><th className="right">Recognised</th><th>Basis</th><th className="right">Accrued</th><th className="right">Deferred</th><th>Journal</th></tr></thead>
                  <tbody>
                    {sched.map((p) => (
                      <tr key={p.period} className={p.posted ? '' : 'muted'}>
                        <td>{fmtPeriod(p.period)} {p.posted ? <Badge status="Posted" /> : <Badge status="Draft">Projected</Badge>}</td>
                        <td className="right money">{fmtMoney(p.billed, s.currency)}</td>
                        <td className="right money">{fmtMoney(p.recognized, s.currency)}</td>
                        <td><Muted>{p.basis}</Muted></td>
                        <td className="right money">{p.unbilled ? fmtMoney(p.unbilled, s.currency) : '—'}</td>
                        <td className="right money">{p.deferred ? fmtMoney(p.deferred, s.currency) : '—'}</td>
                        <td>{p.posted?.journalId ? <span className="identifier link" onClick={() => nav.go(`accounting/journals/${p.posted!.journalId}`)}>{p.posted.journalNumber}</span> : <Muted>{p.adjustmentType === 'None' ? 'No adjustment' : '—'}</Muted>}</td>
                      </tr>
                    ))}
                    {!sched.length && <tr><td colSpan={7} style={{ textAlign: 'center', color: '#5F6368', padding: 16 }}>Contract has not started</td></tr>}
                  </tbody>
                </table>
                <Muted>Current period recognised so far: {fmtMoney(recognizedFor(c, currentPeriod()).amount, s.currency)} · {recognizedFor(c, currentPeriod()).basis}</Muted>
              </Card>
            </div>
          ) },
          { id: 'approvals', label: 'Approvals', content: <ApprovalsTab approvalId={c.approvalId} docId={c.id} /> },
          { id: 'activity', label: 'Activity', content: <ActivityTab objectId={c.id} correlationId={c.correlationId} /> },
        ]}
      />
      <ConfirmDialog open={dialog === 'activate'} onClose={() => setDialog(null)} title={`Activate ${c.number}?`} statement="Active contracts accept timesheets, milestones and usage and are included in billing runs and revenue recognition." consequences={[{ engine: 'Workflow', text: `${projects.length} linked project(s) move to Active` }, { engine: 'Notification', text: 'Project team is notified' }]} confirmLabel="Activate contract" cancelLabel="Keep approved" onConfirm={() => { activateContract(c.id); toast.success(`${c.number} is now active`); }} />
      <ConfirmDialog open={dialog === 'complete'} onClose={() => setDialog(null)} title={`Mark ${c.number} completed?`} statement="Completed contracts stop accepting time and usage. Unbilled work can still be billed and revenue recognised for past periods." reasonRequired confirmLabel="Mark completed" cancelLabel="Keep active" onConfirm={(r) => { completeContract(c.id, r); toast.success('Contract completed'); }} />
      <ConfirmDialog open={dialog === 'cancel'} onClose={() => setDialog(null)} title={`Cancel ${c.number}?`} statement="Cancelled contracts are kept for audit. Posted invoices and journals are unaffected." consequences={[{ engine: 'Workflow', text: 'Pending approvals are closed', tone: 'warning' }]} reasonRequired danger confirmLabel="Cancel contract" cancelLabel="Keep contract" onConfirm={(r) => { cancelContract(c.id, r); toast.success('Contract cancelled'); }} />
      <ConfirmDialog open={dialog === 'achieve'} onClose={() => setDialog(null)} title="Mark milestone achieved?" statement={`${ms.find((m) => m.id === msId)?.name ?? ''} becomes ready to bill; revenue is recognised in the period of achievement.`} consequences={[{ engine: 'Workflow', text: 'Milestone status → Achieved (ready to bill)' }, { engine: 'Journal', text: 'Recognised when revenue recognition runs for this period' }]} confirmLabel="Mark achieved" cancelLabel="Not yet" onConfirm={(note) => { if (msId) achieveMilestone(msId, today(), note || undefined); toast.success('Milestone achieved — ready to bill'); }} />
      <ConfirmDialog open={dialog === 'reopen'} onClose={() => setDialog(null)} title="Reopen milestone?" statement="The milestone returns to Pending and drops out of the next billing run." reasonRequired confirmLabel="Reopen milestone" cancelLabel="Keep achieved" onConfirm={(r) => { if (msId) reopenMilestone(msId, r); toast.success('Milestone reopened'); }} />
      <Modal open={!!progress} onClose={() => setProgress(null)} title="Update % complete" description="Cumulative completion at the end of the period. Revenue for the period = contract value × (this − previous)." footer={<><Button variant="secondary" onClick={() => setProgress(null)}>Cancel</Button><Button variant="primary" onClick={() => { if (!progress) return; run(() => updateProgress(c.id, progress.period, progress.pct, progress.note || undefined), 'Progress recorded'); setProgress(null); }}>Save progress</Button></>}>
        {progress && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <TextField label="Period (yyyy-mm)" value={progress.period} onChange={(v) => setProgress({ ...progress, period: v })} />
            <NumberField label="% complete (cumulative)" value={progress.pct} onChange={(v) => setProgress({ ...progress, pct: v })} suffix="%" min={0} max={100} decimals={1} />
            <TextField label="Note" value={progress.note} onChange={(v) => setProgress({ ...progress, note: v })} style={{ gridColumn: '1 / -1' }} placeholder="Evidence of completion" />
          </div>
        )}
      </Modal>
      <Modal open={print} onClose={() => setPrint(false)} title="Statement of work — summary" width={860} footer={<><Button variant="secondary" onClick={() => setPrint(false)}>Close</Button><Button variant="primary" onClick={() => window.print()}>Print / PDF</Button></>}>
        <SowSheet c={c} milestones={ms} />
      </Modal>
    </>
  );
}

function SowSheet({ c, milestones }: { c: Contract; milestones: Milestone[] }) {
  const s = useSession();
  const co = s.company;
  const value = c.billingMethod === 'Recurring' ? (c.recurrence?.amount ?? 0) : c.amount;
  return (
    <div className="print-sheet" style={{ width: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '2px solid #0A0A0A', paddingBottom: 12, marginBottom: 12 }}>
        <div><div style={{ fontSize: 18, fontWeight: 700 }}>{co?.legalName}</div><div>{co?.address.line1}, {co?.address.city} {co?.address.pin}</div><div>{co?.email}</div></div>
        <div style={{ textAlign: 'right' }}><div style={{ fontSize: 16, fontWeight: 700 }}>STATEMENT OF WORK</div><div>{c.number}</div><div>Dated {fmtDate(c.date)} · {c.status}</div></div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
        <div><div style={{ fontWeight: 700, fontSize: 10, textTransform: 'uppercase' }}>Client</div><div>{c.partySnapshot?.name ?? c.partyName}</div>{c.partySnapshot?.billingAddress && <div>{c.partySnapshot.billingAddress.line1}, {c.partySnapshot.billingAddress.city}</div>}{c.partySnapshot?.gstin && <div>GSTIN {c.partySnapshot.gstin}</div>}</div>
        <div><div style={{ fontWeight: 700, fontSize: 10, textTransform: 'uppercase' }}>Engagement</div><div>{c.title}</div><div>{fmtDate(c.start)} → {c.end ? fmtDate(c.end) : 'open-ended'}</div><div>{c.billingMethod} · {c.currency} · {c.paymentTerms}</div></div>
      </div>
      <table><thead><tr><th style={{ textAlign: 'left' }}>Commercial term</th><th style={{ textAlign: 'left' }}>Value</th></tr></thead><tbody>
        <tr><td>Contract value</td><td>{fmtMoney(value, c.currency)} ({amountInWords(value, c.currency)})</td></tr>
        {c.billingMethod === 'Time & material' && <tr><td>Rates</td><td>{db.find<any>(C.rateCards, c.rateCardId)?.name ?? 'Per-role'}{c.rates?.length ? ' · ' + c.rates.map((r) => `${r.role} ${fmtMoney(r.rate, c.currency)}/h`).join(', ') : ''}{c.capHours ? ` · cap ${c.capHours} h` : ''}</td></tr>}
        {c.billingMethod === 'Recurring' && c.recurrence && <tr><td>Recurrence</td><td>{c.recurrence.frequency} from {fmtDate(c.recurrence.nextBillDate)}</td></tr>}
        {c.billingMethod === 'Usage' && c.usage && <tr><td>Usage pricing</td><td>{c.usage.metric}: {fmtMoney(c.usage.unitRate, c.currency)} per {c.usage.unit}{c.usage.tiers?.length ? '; tiers ' + c.usage.tiers.map((t) => `≤${t.upTo}: ${fmtMoney(t.rate, c.currency)}`).join(', ') : ''}</td></tr>}
        {c.billingMethod === 'Cost plus' && <tr><td>Markup</td><td>Cost + {c.markupPct}%</td></tr>}
        <tr><td>Taxes</td><td>{db.find<any>(C.taxRates, c.taxRateId)?.name ?? 'As applicable'}</td></tr>
        <tr><td>Payment terms</td><td>{c.paymentTerms}</td></tr>
      </tbody></table>
      {milestones.length > 0 && <table style={{ marginTop: 12 }}><thead><tr><th>#</th><th style={{ textAlign: 'left' }}>{c.billingMethod === 'Fixed price' ? 'Instalment' : 'Milestone'}</th><th>Due</th><th style={{ textAlign: 'right' }}>Amount</th></tr></thead><tbody>{milestones.map((m) => <tr key={m.id}><td>{m.order}</td><td>{m.name}{m.deliverable ? ` — ${m.deliverable}` : ''}</td><td>{fmtDate(m.due)}</td><td style={{ textAlign: 'right' }}>{fmtMoney(m.amount, c.currency)}</td></tr>)}</tbody></table>}
      {c.terms && <div style={{ marginTop: 12, whiteSpace: 'pre-wrap' }}>{c.terms}</div>}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 32, fontSize: 10 }}><div>For {co?.legalName}<div style={{ marginTop: 28 }}>Authorised signatory</div></div><div style={{ textAlign: 'right' }}>For {c.partyName}<div style={{ marginTop: 28 }}>Authorised signatory</div></div></div>
    </div>
  );
}

export { SowSheet };
export type { Journal };
