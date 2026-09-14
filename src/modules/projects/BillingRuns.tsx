// Billing engine page (FR-SRV-004): pick period + eligible contracts → preview what each
// method would bill → Generate creates Draft Sales Invoices in C.salesInvoices (posted in
// Sales › Invoices) and flags every source so nothing bills twice. Past runs are listed.
import { useMemo, useState } from 'react';
import { C, nav, useCollection, useRecord, useSession } from '../../store';
import type { DocHeader } from '../../store';
import { PageHeader, ScopeLine, Card, Button, Badge, Money, DataTable, ConfirmDialog, CheckboxField, DateField, EmptyState, KpiTile, SummaryBlock, useToast, Tabs, Banner, Pill, KV } from '../../components/ui';
import type { Column } from '../../components/ui';
import { fmtDate, fmtMoney, fmtPeriod, today } from '../../lib/format';
import type { BillingRun, Contract } from './types';
import { useRows, periodBounds, currentPeriod, companyRows, contractOf } from './data';
import { PeriodSelect, ContractLink, InvoiceLink, MethodPill, Muted } from './shared';
import { previewBilling, generateBilling, cancelBillingRun, type BillingPreview } from './billing';

export default function BillingRuns({ runId, period: periodParam }: { runId?: string; period?: string }) {
  if (runId) return <RunDetail id={runId} />;
  return <NewRun period={periodParam} />;
}

function NewRun({ period: periodParam }: { period?: string }) {
  const s = useSession();
  const toast = useToast();
  const contracts = useRows<Contract>(C.contracts).filter((c) => c.status === 'Active');
  const runs = useRows<BillingRun>(C.billingRuns, (a, b) => (b.date + b.number).localeCompare(a.date + a.number));
  useCollection(C.timesheets); useCollection(C.milestones); useCollection(C.usageRecords); useCollection(C.billableExpenses); useCollection(C.retainers);
  const params = new URLSearchParams(window.location.hash.split('?')[1] ?? '');
  const preselect = params.get('contract') ?? undefined;
  const [period, setPeriod] = useState(periodParam ?? currentPeriod());
  const [date, setDate] = useState(today());
  const [applyRetainer, setApplyRetainer] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set(preselect ? [preselect] : contracts.map((c) => c.id)));
  const [confirm, setConfirm] = useState(false);
  const [tab, setTab] = useState<'preview' | 'history'>('preview');
  const bounds = periodBounds(period);
  const previews = useMemo(() => previewBilling(bounds, contracts.map((c) => c.id)), [period, contracts, s.state.companyId, bounds.from, bounds.to]);
  const chosen = previews.filter((p) => selected.has(p.contract.id));
  const billable = chosen.filter((p) => !p.skipReason && p.lines.length);
  const totalValue = billable.reduce((a, p) => a + p.total * p.rate, 0);
  const can = s.can('projects.billing.run') || s.can('projects.*') || s.can('sales.invoice.create');
  const periodOk = true;

  const cols: Column<BillingPreview>[] = [
    { key: 'contract', label: 'Contract', render: (p) => <div><ContractLink id={p.contract.id} /><div className="cell-secondary">{p.contract.title} · {p.contract.partyName}</div></div> },
    { key: 'method', label: 'Method', render: (p) => <MethodPill method={p.method} /> },
    { key: 'sources', label: 'What will be billed', render: (p) => p.skipReason ? <Muted>{p.skipReason}</Muted> : <div style={{ fontSize: 12 }}>{summarise(p)}</div> },
    { key: 'taxable', label: 'Taxable', align: 'right', render: (p) => p.skipReason ? <span style={{ color: 'var(--ink-5)' }}>—</span> : <Money value={p.taxable} currency={p.currency} code={p.currency !== s.currency} /> },
    { key: 'total', label: 'Invoice total', align: 'right', render: (p) => p.skipReason ? <span style={{ color: 'var(--ink-5)' }}>—</span> : <Money value={p.total} currency={p.currency} code={p.currency !== s.currency} />, total: () => <span className="money" style={{ fontWeight: 600 }}>{fmtMoney(totalValue, s.currency)}</span> },
    { key: 'retainer', label: 'Retainer', align: 'right', render: (p) => p.retainerAvailable > 0 && applyRetainer && !p.skipReason ? <span className="money" style={{ color: 'var(--good)' }}>−{fmtMoney(Math.min(p.retainerAvailable, p.total), p.currency)}</span> : <span style={{ color: 'var(--ink-5)' }}>—</span> },
    { key: 'warnings', label: '', render: (p) => p.warnings.length ? <Pill tone="warning" title={p.warnings.join(' · ')}>{p.warnings.length} warning</Pill> : null },
  ];

  const generate = () => {
    try {
      const run = generateBilling(chosen, { date, period, from: bounds.from, to: bounds.to, applyRetainer });
      toast.success(`${run.number}: ${run.invoiceIds.length} draft invoice(s) created`, { label: 'Open run', path: `projects/billing/${run.id}` });
      nav.go(`projects/billing/${run.id}`);
    } catch (e: any) { toast.error(e.message); }
  };

  return (
    <div className="page">
      <PageHeader title="Billing run" subtitle={<ScopeLine extra={`${contracts.length} active contracts · period ${fmtPeriod(period)}`} />} actions={<Button variant="secondary" onClick={() => nav.go('sales/invoices')}>Sales › Invoices</Button>} />
      <Tabs variant="filter" value={tab} onChange={setTab} tabs={[{ id: 'preview', label: 'New run' }, { id: 'history', label: 'Run history', count: runs.length }]} />
      {tab === 'preview' ? (
        <>
          <Card>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 14, alignItems: 'end' }}>
              <PeriodSelect label="Billing period" value={period} onChange={setPeriod} size="sm" />
              <DateField label="Invoice date" value={date} onChange={setDate} checkPeriod size="sm" help={`Covers ${fmtDate(bounds.from)} – ${fmtDate(bounds.to)}`} />
              <CheckboxField checked={applyRetainer} onChange={setApplyRetainer} label="Apply available retainers" help="Reduces the amount due on the generated invoice; settles when the invoice posts" />
              <div style={{ display: 'flex', gap: 8 }}>
                <Button size="sm" variant="secondary" onClick={() => setSelected(new Set(contracts.map((c) => c.id)))}>Select all</Button>
                <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
              </div>
            </div>
          </Card>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 12 }}>
            <KpiTile label="Contracts selected" value={`${chosen.length} / ${previews.length}`} sub={`${billable.length} will bill`} />
            <KpiTile label="Invoice value" value={fmtMoney(totalValue, s.currency)} sub="incl. tax, base equivalent" />
            <KpiTile label="Sources" value={billable.reduce((a, p) => a + p.sources.length, 0)} sub="timesheet rows, milestones, usage, expenses" />
            <KpiTile label="Skipped" value={chosen.length - billable.length} sub="nothing to bill or blocked" />
          </div>
          <div className="card" style={{ overflow: 'hidden' }}>
            <table className="data-table">
              <thead><tr><th style={{ width: 40 }}><input type="checkbox" className="checkbox" checked={chosen.length === previews.length && previews.length > 0} onChange={() => setSelected(chosen.length === previews.length ? new Set() : new Set(previews.map((p) => p.contract.id)))} /></th>{cols.map((c) => <th key={c.key} className={c.align === 'right' ? 'right' : ''}>{c.label}</th>)}</tr></thead>
              <tbody>
                {previews.map((p) => (
                  <tr key={p.contract.id} className={p.skipReason ? 'muted' : ''}>
                    <td onClick={(e) => e.stopPropagation()}><input type="checkbox" className="checkbox" checked={selected.has(p.contract.id)} onChange={() => { const n = new Set(selected); if (n.has(p.contract.id)) n.delete(p.contract.id); else n.add(p.contract.id); setSelected(n); }} /></td>
                    {cols.map((c) => <td key={c.key} className={c.align === 'right' ? 'right' : ''}>{c.render!(p, 0)}</td>)}
                  </tr>
                ))}
                {!previews.length && <tr><td colSpan={8}><EmptyState compact title="No active contracts" description="Activate a contract to bill it." action={<Button variant="primary" onClick={() => nav.go('projects/contracts')}>Open contracts</Button>} /></td></tr>}
              </tbody>
            </table>
          </div>
          {billable.some((p) => p.warnings.length) && <Banner tone="warning">{billable.flatMap((p) => p.warnings).join(' · ')}</Banner>}
          {billable.length > 0 && (
            <Card title="Preview detail">
              {billable.map((p) => (
                <div key={p.contract.id} style={{ marginBottom: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}><ContractLink id={p.contract.id} /> · {p.contract.title} <MethodPill method={p.method} /></div>
                    <Money value={p.total} currency={p.currency} code={p.currency !== s.currency} />
                  </div>
                  <table className="data-table dense">
                    <thead><tr><th>Line</th><th className="right">Qty</th><th className="right">Rate</th><th className="right">Taxable</th><th className="right">Tax</th><th className="right">Amount</th></tr></thead>
                    <tbody>{p.lines.map((l) => <tr key={l.id}><td><div className="cell-primary">{l.itemName}</div><Muted>{l.description}</Muted></td><td className="right money">{l.qty} {l.uom}</td><td className="right money">{fmtMoney(l.rate, p.currency)}</td><td className="right money">{fmtMoney(l.taxable, p.currency)}</td><td className="right money">{fmtMoney(l.taxAmt, p.currency)}</td><td className="right money">{fmtMoney(l.amount, p.currency)}</td></tr>)}</tbody>
                    <tfoot><tr><td colSpan={3}>{p.sources.length} source(s) · {p.contract.partyName}</td><td className="right money">{fmtMoney(p.taxable, p.currency)}</td><td className="right money">{fmtMoney(p.taxAmt, p.currency)}</td><td className="right money" style={{ fontWeight: 600 }}>{fmtMoney(p.total, p.currency)}</td></tr></tfoot>
                  </table>
                </div>
              ))}
            </Card>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button variant="secondary" onClick={() => nav.go('projects/overview')}>Cancel</Button>
            <Button variant="primary" onClick={() => setConfirm(true)} disabled={!billable.length || !can || !periodOk} reason={!can ? 'Requires billing or invoice-create permission' : !billable.length ? 'Nothing to bill for this selection' : undefined} data-testid="generate-invoices">Generate {billable.length} draft invoice(s)</Button>
          </div>
        </>
      ) : <History runs={runs} />}
      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        title={`Generate ${billable.length} draft invoice(s) for ${fmtPeriod(period)}?`}
        statement="Draft invoices are created in Sales › Invoices. Nothing posts to the ledger until you post them there."
        consequences={[
          { engine: 'Numbering', text: 'Draft numbers only — the invoice series allocates on posting' },
          { engine: 'Workflow', text: `${billable.reduce((a, p) => a + p.sources.length, 0)} source record(s) are marked Invoiced so they never bill twice` },
          ...(applyRetainer && billable.some((p) => p.retainerAvailable > 0) ? [{ engine: 'Open items' as const, text: 'Available retainers reduce the amount due; the liability settles when the invoice posts', tone: 'warning' as const }] : []),
          { engine: 'Tax', text: 'Totals computed with the contract tax rate and place of supply' },
        ]}
        confirmLabel="Generate invoices"
        cancelLabel="Keep reviewing"
        onConfirm={generate}
      />
    </div>
  );
}

function summarise(p: BillingPreview): string {
  const byType = new Map<string, { n: number; qty: number }>();
  p.sources.forEach((sx) => { const g = byType.get(sx.type) ?? { n: 0, qty: 0 }; g.n++; g.qty += sx.qty; byType.set(sx.type, g); });
  const parts: string[] = [];
  byType.forEach((g, t) => parts.push(t === 'Timesheet' ? `${g.qty.toFixed(1)} approved h` : t === 'Expense' ? `${g.n} expense(s)` : t === 'Usage' ? `${g.qty.toFixed(1)} units` : t === 'Recurring' ? 'period fee' : `${g.n} ${t.toLowerCase()}(s)`));
  return parts.join(' · ') || 'Nothing';
}

function History({ runs }: { runs: BillingRun[] }) {
  const s = useSession();
  const cols: Column<BillingRun>[] = [
    { key: 'number', label: 'Run', render: (r) => <span className="identifier link" onClick={() => nav.go(`projects/billing/${r.id}`)}>{r.number}</span> },
    { key: 'period', label: 'Period', render: (r) => fmtPeriod(r.period) },
    { key: 'date', label: 'Invoice date', render: (r) => fmtDate(r.date) },
    { key: 'contracts', label: 'Contracts', render: (r) => `${r.results.filter((x) => !x.skipped).length} billed / ${r.contractIds.length} considered` },
    { key: 'invoices', label: 'Invoices', render: (r) => <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{r.invoiceIds.map((i) => <InvoiceLink key={i} id={i} />)}{!r.invoiceIds.length && <Muted>None</Muted>}</div> },
    { key: 'value', label: 'Value', align: 'right', render: (r) => <span className="money">{fmtMoney(r.results.reduce((a, x) => a + x.amount, 0), s.currency)}</span> },
    { key: 'status', label: 'Status', render: (r) => <Badge status={r.status === 'Generated' ? 'Posted' : 'Cancelled'}>{r.status}</Badge> },
    { key: 'by', label: 'By', render: (r) => <Muted>{r.by}</Muted> },
  ];
  return <DataTable rows={runs} columns={cols} dense onRowClick={(r) => nav.go(`projects/billing/${r.id}`)} emptyTitle="No billing runs yet" emptyDescription="Run billing to generate draft invoices from approved work." />;
}

function RunDetail({ id }: { id: string }) {
  const run = useRecord<BillingRun>(C.billingRuns, id);
  const s = useSession();
  const toast = useToast();
  useCollection<DocHeader>(C.salesInvoices);
  const [cancel, setCancel] = useState(false);
  if (!run) return <EmptyState icon="🧾" title="Billing run not found" action={<Button variant="primary" onClick={() => nav.go('projects/billing')}>Back to billing</Button>} />;
  const invoices = run.invoiceIds.map((i) => companyRows<DocHeader>(C.salesInvoices).find((x) => x.id === i)).filter(Boolean) as DocHeader[];
  const drafts = invoices.filter((i) => i.status === 'Draft');
  const posted = invoices.filter((i) => i.status === 'Posted' || i.status === 'Settled');
  const cols: Column<BillingRun['results'][number]>[] = [
    { key: 'contract', label: 'Contract', render: (r) => <div><ContractLink id={r.contractId} number={r.contractNumber} /><div className="cell-secondary">{r.customerName}</div></div> },
    { key: 'method', label: 'Method', render: (r) => <MethodPill method={r.method} /> },
    { key: 'sources', label: 'Sources', render: (r) => r.skipped ? <Muted>Skipped · {r.skipped}</Muted> : `${r.sources} source(s)` },
    { key: 'invoice', label: 'Invoice', render: (r) => r.invoiceId ? <InvoiceLink id={r.invoiceId} number={r.invoiceNumber} /> : <Muted>—</Muted> },
    { key: 'retainer', label: 'Retainer applied', align: 'right', render: (r) => r.retainerApplied ? <span className="money" style={{ color: 'var(--good)' }}>−{fmtMoney(r.retainerApplied, r.currency)}</span> : <Muted>—</Muted> },
    { key: 'amount', label: 'Amount', align: 'right', render: (r) => r.skipped ? <Muted>—</Muted> : <Money value={r.amount} currency={r.currency} code={r.currency !== s.currency} /> },
  ];
  return (
    <div className="page">
      <PageHeader title={`Billing run ${run.number}`} subtitle={<>{fmtPeriod(run.period)} ({fmtDate(run.from)} – {fmtDate(run.to)}) · invoice date {fmtDate(run.date)} · by {run.by} · <Badge status={run.status === 'Generated' ? 'Posted' : 'Cancelled'}>{run.status}</Badge></>} back={{ label: 'Billing', path: 'projects/billing' }}
        actions={<>{drafts.length > 0 && run.status === 'Generated' && <Button variant="secondary" onClick={() => setCancel(true)}>Cancel run</Button>}<Button variant="primary" onClick={() => nav.go('sales/invoices')}>Post invoices in Sales</Button></>} />
      {run.status === 'Cancelled' && <Banner tone="warning">This run was cancelled. Draft invoices were deleted and their sources released back to the unbilled pool.</Banner>}
      {drafts.length > 0 && <Banner tone="info" action={<Button variant="link" onClick={() => nav.go('sales/invoices')}>Open Sales › Invoices</Button>}>{drafts.length} invoice(s) are still Draft — post them in Sales to create the receivable, revenue and tax journals.</Banner>}
      <SummaryBlock items={[{ label: 'Invoices', value: invoices.length }, { label: 'Draft', value: drafts.length, tone: drafts.length ? 'warn' : undefined }, { label: 'Posted', value: posted.length, tone: 'good' }, { label: 'Value', value: fmtMoney(run.results.reduce((a, r) => a + r.amount, 0), s.currency) }, { label: 'Retainers applied', value: fmtMoney(run.results.reduce((a, r) => a + (r.retainerApplied ?? 0), 0), s.currency) }, { label: 'Skipped', value: run.results.filter((r) => r.skipped).length }]} />
      <DataTable rows={run.results} columns={cols} rowKey={(r) => r.contractId} dense />
      <Card title="Run details"><KV columns={2} items={[{ k: 'Period', v: `${fmtPeriod(run.period)} · ${fmtDate(run.from)} – ${fmtDate(run.to)}` }, { k: 'Invoice date', v: fmtDate(run.date) }, { k: 'Retainers', v: run.applyRetainer ? 'Applied where available' : 'Not applied' }, { k: 'Run by', v: `${run.by} · ${fmtDate(run.createdAt)}` }, { k: 'Contracts considered', v: run.contractIds.map((c) => contractOf(c)?.number ?? c).join(', ') }, { k: 'Notes', v: run.notes ?? '—' }]} /></Card>
      <ConfirmDialog open={cancel} onClose={() => setCancel(false)} title={`Cancel billing run ${run.number}?`} statement="Draft invoices generated by this run are deleted and their timesheets, milestones, usage and expenses return to the unbilled pool." consequences={[{ engine: 'Workflow', text: `${drafts.length} draft invoice(s) deleted`, tone: 'warning' }, { engine: 'Open items', text: 'Pending retainer allocations are released' }]} reasonRequired danger confirmLabel="Cancel run" cancelLabel="Keep run" onConfirm={(r) => { try { cancelBillingRun(run.id, r); toast.success('Billing run cancelled'); } catch (e: any) { toast.error(e.message); } }} />
    </div>
  );
}
