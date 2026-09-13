// Project detail: budget vs actual meters, team, timesheets, expenses, invoices, profitability, status changes.
import { useMemo, useState } from 'react';
import { db, C, nav, useRecord, useSession, useCollection } from '../../../store';
import type { DocHeader } from '../../../store';
import { DocumentPage, RailSection, Badge, Button, ActionMenu, ConfirmDialog, ActivityTab, EmptyState, useToast, KV, Card, DataTable, Money, Meter, SummaryBlock, Pill } from '../../../components/ui';
import type { MenuAction, Column } from '../../../components/ui';
import { fmtDate, fmtMoney, fmtPct, today, addDays } from '../../../lib/format';
import type { Project, Timesheet, BillableExpense } from '../types';
import { projectActuals, employeeName, resourceOf, costRateFor, invoicesOfProject, billableExpenses, hourEntries, useSettings, currentPeriod, periodBounds } from '../data';
import { ContractLink, InvoiceLink, Muted } from '../shared';
import { setProjectStatus } from '../actions';
import { projectProfit } from '../revenue';

export default function ProjectDetail({ id, tab, onTab }: { id: string; tab?: string; onTab?: (t: string) => void }) {
  const p = useRecord<Project>(C.projects, id);
  const s = useSession();
  const toast = useToast();
  const ts = useCollection<Timesheet>(C.timesheets);
  useCollection<DocHeader>(C.salesInvoices);
  useCollection<BillableExpense>(C.billableExpenses);
  const settings = useSettings();
  const [confirm, setConfirm] = useState<Project['status'] | null>(null);
  const actuals = useMemo(() => (p ? projectActuals(p) : null), [p, ts]);
  const fyFrom = `${s.state.fy?.slice(0, 4) ?? '2026'}-04-01`;
  const profit = useMemo(() => (p ? projectProfit(p, fyFrom, periodBounds(currentPeriod()).to) : null), [p, ts, fyFrom]);
  if (!p || !actuals || !profit) return <EmptyState icon="📁" title="Project not found" action={<Button variant="primary" onClick={() => nav.go('projects/projects')}>Back to projects</Button>} />;
  const can = s.can('projects.project.edit') || s.can('projects.*');
  const sheets = ts.filter((t) => t.rows.some((r) => r.projectId === p.id)).sort((a, b) => b.weekStart.localeCompare(a.weekStart));
  const invoices = invoicesOfProject(p.id).sort((a, b) => b.date.localeCompare(a.date));
  const expenses = billableExpenses().filter((b) => b.projectId === p.id);
  const team = Array.from(new Set([...(p.teamEmployeeIds ?? []), ...sheets.map((t) => t.employeeId)]));
  const overflow: MenuAction[] = [{ label: 'Edit', onClick: () => nav.go(`projects/projects/${p.id}`, { edit: 1 }), disabled: !can }];
  if (p.status === 'Active') { overflow.push({ label: 'Put on hold', onClick: () => setConfirm('On Hold'), disabled: !can }); overflow.push({ label: 'Mark completed', onClick: () => setConfirm('Completed'), disabled: !can }); }
  if (p.status === 'Planned' || p.status === 'On Hold') overflow.push({ label: 'Activate', onClick: () => setConfirm('Active'), disabled: !can });
  if (p.status !== 'Cancelled' && p.status !== 'Completed') overflow.push({ label: 'Cancel project', danger: true, separator: true, onClick: () => setConfirm('Cancelled'), disabled: !can });
  const tsCols: Column<Timesheet>[] = [
    { key: 'number', label: 'Timesheet', render: (t) => <span className="identifier link" onClick={(e) => { e.stopPropagation(); nav.go(`projects/timesheets/${t.id}`); }}>{t.number}</span> },
    { key: 'employeeName', label: 'Employee' },
    { key: 'weekStart', label: 'Week', render: (t) => fmtDate(t.weekStart) },
    { key: 'hours', label: 'Hours (this project)', align: 'right', render: (t) => <span className="money">{t.rows.filter((r) => r.projectId === p.id).reduce((a, r) => a + r.hours.reduce((x, y) => x + y, 0), 0)} h</span> },
    { key: 'status', label: 'Status', render: (t) => <Badge status={t.status} /> },
    { key: 'approvedBy', label: 'Approver', render: (t) => <Muted>{t.approvedBy ?? '—'}</Muted> },
  ];
  const teamRows = team.map((e) => { const r = resourceOf(e); const h = hourEntries({ projectId: p.id, employeeId: e, statuses: ['Approved', 'Invoiced', 'Submitted'] }).reduce((a, x) => a + x.hours, 0); return { id: e, name: employeeName(e), role: r?.role ?? '—', costRate: costRateFor(e), billRate: r?.billRate ?? 0, hours: Math.round(h * 10) / 10, capacity: r?.capacityHoursPerWeek ?? 0 }; });
  const teamCols: Column<(typeof teamRows)[number]>[] = [
    { key: 'name', label: 'Resource', render: (r) => <div><div className="cell-primary">{r.name}</div><Muted>{r.role}</Muted></div> },
    { key: 'hours', label: 'Hours logged', align: 'right', render: (r) => <span className="money">{r.hours} h</span> },
    { key: 'costRate', label: 'Cost / h', align: 'right', render: (r) => <Money value={r.costRate} currency={s.currency} /> },
    { key: 'billRate', label: 'Bill / h', align: 'right', render: (r) => <Money value={r.billRate} currency={s.currency} /> },
    { key: 'capacity', label: 'Capacity', align: 'right', render: (r) => <Muted>{r.capacity} h/wk</Muted> },
  ];
  const expCols: Column<BillableExpense>[] = [
    { key: 'claimNumber', label: 'Claim', render: (b) => <span className="identifier link" onClick={() => nav.go(`budgets/expenses/${b.claimId}`)}>{b.claimNumber}</span> },
    { key: 'employeeName', label: 'Employee' }, { key: 'date', label: 'Date', render: (b) => fmtDate(b.date) }, { key: 'description', label: 'Description' },
    { key: 'amount', label: 'Cost', align: 'right', render: (b) => <Money value={b.amount} currency={s.currency} /> },
    { key: 'billAmount', label: 'Billable', align: 'right', render: (b) => <Money value={b.billAmount} currency={s.currency} /> },
    { key: 'status', label: 'Status', render: (b) => b.invoiceId ? <InvoiceLink id={b.invoiceId} number={b.invoiceNumber} /> : <Badge status={b.status === 'Ready' ? 'Unbilled' : b.status}>{b.status === 'Ready' ? 'Ready to bill' : b.status}</Badge> },
  ];
  const invCols: Column<DocHeader>[] = [
    { key: 'number', label: 'Invoice', render: (i) => <InvoiceLink id={i.id} /> }, { key: 'date', label: 'Date', render: (i) => fmtDate(i.date) }, { key: 'partyName', label: 'Customer' },
    { key: 'taxable', label: 'Taxable', align: 'right', render: (i) => <Money value={i.totals?.taxable ?? 0} currency={i.currency} code={i.currency !== s.currency} /> },
    { key: 'total', label: 'Total', align: 'right', render: (i) => <Money value={i.totals?.total ?? 0} currency={i.currency} code={i.currency !== s.currency} /> },
    { key: 'due', label: 'Due', align: 'right', render: (i) => i.status === 'Posted' ? <Money value={i.totals?.due ?? 0} currency={i.currency} /> : <span style={{ color: '#B0B5BF' }}>—</span> },
  ];
  const dim = db.find<any>(C.dimensions, p.dimensionId);
  const lastWeeks = { from: addDays(today(), -27), to: today() };
  const recentHours = hourEntries({ projectId: p.id, from: lastWeeks.from, to: lastWeeks.to, statuses: ['Approved', 'Invoiced', 'Submitted'] }).reduce((a, e) => a + e.hours, 0);

  return (
    <>
      <DocumentPage
        backLabel="Projects"
        onBack={() => nav.back('projects/projects')}
        number={p.code}
        badges={<><Badge status={p.status} />{dim && <span className="dim-chip">● {dim.code}</span>}</>}
        rail={
          <>
            <RailSection label="Project"><div style={{ fontSize: 14, fontWeight: 600 }}>{p.name}</div><Muted>{p.description}</Muted></RailSection>
            <RailSection label="Customer & contract"><div style={{ fontSize: 13 }}><span className="link" onClick={() => nav.go(`crm/customers/${p.customerId}`)}>{p.customerName}</span></div><div style={{ fontSize: 13 }}><ContractLink id={p.contractId} /> {p.contractId && <Muted>{db.find<any>(C.contracts, p.contractId)?.billingMethod}</Muted>}</div></RailSection>
            <RailSection label="Manager"><div style={{ fontSize: 13 }}>{employeeName(p.managerEmployeeId)}</div><Muted>Approves timesheets for this project</Muted></RailSection>
            <RailSection label="Budget vs actual">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div><div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}><span>Hours</span><span className="money">{actuals.hours} / {p.budgetHours || '—'} h · {fmtPct(actuals.pctHours)}</span></div><Meter value={actuals.hours} max={p.budgetHours || actuals.hours || 1} /></div>
                <div><div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}><span>Cost</span><span className="money">{fmtMoney(actuals.cost, s.currency)} / {p.budgetAmount ? fmtMoney(p.budgetAmount, s.currency) : '—'}</span></div><Meter value={actuals.cost} max={p.budgetAmount || actuals.cost || 1} /></div>
                <Muted>{recentHours} h in the last 4 weeks · {fmtDate(p.start)} → {p.end ? fmtDate(p.end) : 'open'}</Muted>
              </div>
            </RailSection>
          </>
        }
        activeTab={tab}
        onTab={onTab}
        footer={
          <>
            {p.status === 'Active' && <Button variant="secondary" onClick={() => nav.go('projects/timesheets/new')}>Log time</Button>}
            <Button variant="secondary" onClick={() => nav.go('projects/profitability', { project: p.id })}>Profitability report</Button>
            {p.contractId && <Button variant="primary" onClick={() => nav.go('projects/billing', { contract: p.contractId })}>Run billing</Button>}
            {!p.contractId && <Button variant="primary" onClick={() => nav.go('projects/contracts/new', { customer: p.customerId, project: p.id })}>Create contract</Button>}
            <ActionMenu actions={overflow} trigger={<Button variant="secondary">⋮ More</Button>} />
          </>
        }
        tabs={[
          { id: 'summary', label: 'Summary', content: (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <SummaryBlock items={[{ label: 'Hours logged', value: `${actuals.hours} h` }, { label: 'Approved', value: `${actuals.approvedHours} h` }, { label: 'Billable', value: `${actuals.billableHours} h` }, { label: 'Resource cost', value: fmtMoney(actuals.cost, s.currency) }, { label: 'Billed (excl. tax)', value: fmtMoney(actuals.billedValue, s.currency), tone: 'good' }, { label: 'Margin FY', value: `${fmtMoney(profit.margin, s.currency)} (${fmtPct(profit.marginPct)})`, tone: profit.margin >= 0 ? 'good' : 'danger' }]} />
              <Card title="Details"><KV columns={2} items={[{ k: 'Code', v: p.code }, { k: 'Dimension', v: dim ? `${dim.code} · ${dim.name} (${dim.status})` : '—' }, { k: 'Customer', v: p.customerName }, { k: 'Contract', v: <ContractLink id={p.contractId} /> }, { k: 'Manager', v: employeeName(p.managerEmployeeId) }, { k: 'Team', v: team.map(employeeName).join(', ') || '—' }, { k: 'Start', v: fmtDate(p.start) }, { k: 'End', v: p.end ? fmtDate(p.end) : '—' }, { k: 'Budget hours', v: p.budgetHours || '—' }, { k: 'Budget cost', v: p.budgetAmount ? fmtMoney(p.budgetAmount, s.currency) : '—' }]} /></Card>
              {p.statusHistory && p.statusHistory.length > 0 && <Card title="Status history"><table className="data-table dense"><thead><tr><th>When</th><th>By</th><th>Change</th><th>Reason</th></tr></thead><tbody>{p.statusHistory.slice().reverse().map((h, i) => <tr key={i}><td>{fmtDate(h.at)}</td><td>{h.by}</td><td>{h.from} → {h.to}</td><td><Muted>{h.reason ?? '—'}</Muted></td></tr>)}</tbody></table></Card>}
            </div>
          ) },
          { id: 'team', label: 'Team', content: <DataTable rows={teamRows} columns={teamCols} dense emptyTitle="No resources assigned" emptyAction={<Button variant="secondary" onClick={() => nav.go(`projects/projects/${p.id}`, { edit: 1 })}>Assign team</Button>} /> },
          { id: 'timesheets', label: `Timesheets (${sheets.length})`, content: <DataTable rows={sheets} columns={tsCols} dense onRowClick={(t) => nav.go(`projects/timesheets/${t.id}`)} emptyTitle="No time logged yet" emptyAction={<Button variant="primary" onClick={() => nav.go('projects/timesheets/new')}>Log time</Button>} /> },
          { id: 'expenses', label: `Expenses (${expenses.length})`, content: <DataTable rows={expenses} columns={expCols} dense emptyTitle="No billable expenses" emptyDescription="Flag approved claim lines to this project under Expenses (billable)." emptyAction={<Button variant="secondary" onClick={() => nav.go('projects/expenses')}>Open expenses</Button>} /> },
          { id: 'invoices', label: `Invoices (${invoices.length})`, content: <DataTable rows={invoices} columns={invCols} dense onRowClick={(i) => nav.go(`sales/invoices/${i.id}`)} emptyTitle="No invoices carry this project" /> },
          { id: 'profit', label: 'Profitability', content: (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <Muted>FY to date ({fmtDate(fyFrom)} → {fmtDate(periodBounds(currentPeriod()).to)}) · overhead {settings.prjOverheadPct}% of resource cost · <span className="link" onClick={() => nav.go('projects/profitability', { project: p.id })}>full report →</span></Muted>
              <SummaryBlock items={[{ label: 'Revenue (recognised)', value: fmtMoney(profit.revenue, s.currency), tone: 'good' }, { label: 'Resource cost', value: fmtMoney(profit.resourceCost, s.currency) }, { label: 'Purchases', value: fmtMoney(profit.purchases, s.currency) }, { label: 'Expenses', value: fmtMoney(profit.expenses, s.currency) }, { label: 'Overhead', value: fmtMoney(profit.overhead, s.currency) }, { label: 'Margin', value: `${fmtMoney(profit.margin, s.currency)} · ${fmtPct(profit.marginPct)}`, tone: profit.margin >= 0 ? 'good' : 'danger' }]} />
              <Card title="Sources"><table className="data-table dense"><thead><tr><th>Type</th><th>Source</th><th className="right">Amount</th></tr></thead><tbody>{profit.sources.map((x, i) => <tr key={i} className={x.link ? 'clickable' : ''} onClick={() => x.link && nav.go(x.link)}><td><Pill tone={x.type === 'Revenue' || x.type === 'Invoice' ? 'good' : 'neutral'}>{x.type}</Pill></td><td>{x.label}</td><td className="right money">{fmtMoney(x.amount, s.currency)}</td></tr>)}{!profit.sources.length && <tr><td colSpan={3} style={{ textAlign: 'center', color: '#5F6368', padding: 16 }}>Nothing recorded for this window</td></tr>}</tbody></table></Card>
            </div>
          ) },
          { id: 'activity', label: 'Activity', content: <ActivityTab objectId={p.id} /> },
        ]}
      />
      <ConfirmDialog open={!!confirm} onClose={() => setConfirm(null)} title={`${confirm === 'Cancelled' ? 'Cancel' : confirm === 'Completed' ? 'Complete' : confirm === 'On Hold' ? 'Hold' : 'Activate'} ${p.code}?`} statement={confirm === 'Cancelled' || confirm === 'Completed' ? 'The Project dimension is deactivated; no more time can be logged.' : confirm === 'On Hold' ? 'Time logging is blocked while on hold.' : 'The project accepts timesheets and appears in capacity planning.'} reasonRequired={confirm === 'Cancelled' || confirm === 'On Hold'} danger={confirm === 'Cancelled'} confirmLabel={`${confirm === 'Cancelled' ? 'Cancel' : confirm === 'Completed' ? 'Complete' : confirm === 'On Hold' ? 'Put on hold' : 'Activate'} project`} cancelLabel="Keep as is" onConfirm={(r) => { if (!confirm) return; setProjectStatus(p.id, confirm, r); toast.success(`Project ${confirm.toLowerCase()}`); }} />
    </>
  );
}
