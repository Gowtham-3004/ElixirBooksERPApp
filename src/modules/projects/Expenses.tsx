// Billable expenses: approved claim lines (read defensively from C.expenseClaims) flagged
// billable to a project at a markup; list with invoiced status (FR-SRV-003).
import { useMemo, useState } from 'react';
import { C, nav, useCollection, useSession } from '../../store';
import { PageHeader, ScopeLine, Tabs, DataTable, Badge, Money, Button, Drawer, EntityPicker, PercentField, useToast, ConfirmDialog, KpiTile } from '../../components/ui';
import type { Column, MenuAction } from '../../components/ui';
import { fmtDate, fmtMoney } from '../../lib/format';
import type { BillableExpense } from './types';
import { useRows, useSettings, projectOf } from './data';
import { useProjectOptions, ProjectLink, InvoiceLink, Muted } from './shared';
import { claimLines, flagBillable, excludeBillable, type ClaimLineView } from './actions';

export default function Expenses() {
  const s = useSession();
  const toast = useToast();
  const settings = useSettings();
  useCollection(C.expenseClaims);
  const flagged = useRows<BillableExpense>(C.billableExpenses, (a, b) => b.date.localeCompare(a.date));
  const lines = useMemo(() => claimLines(), [flagged, s.state.companyId]);
  const [tab, setTab] = useState<'candidates' | 'ready' | 'invoiced' | 'excluded'>('candidates');
  const [flag, setFlag] = useState<{ line: ClaimLineView; projectId?: string; markupPct: number } | null>(null);
  const [exclude, setExclude] = useState<string | null>(null);
  const projects = useProjectOptions((p) => p.status === 'Active' || p.status === 'Planned');
  const candidates = lines.filter((l) => !l.billable || l.billable.status === 'Excluded');
  const ready = flagged.filter((b) => b.status === 'Ready');
  const invoiced = flagged.filter((b) => b.status === 'Invoiced');
  const excluded = flagged.filter((b) => b.status === 'Excluded');
  const candCols: Column<ClaimLineView>[] = [
    { key: 'claimNumber', label: 'Claim', render: (l) => <div><span className="identifier link" onClick={() => nav.go(`budgets/expenses/${l.claimId}`)}>{l.claimNumber}</span><div><Muted>{l.employeeName} · <Badge status={l.claimStatus} /></Muted></div></div> },
    { key: 'date', label: 'Date', render: (l) => fmtDate(l.date) },
    { key: 'description', label: 'Line' },
    { key: 'project', label: 'Project dimension', render: (l) => l.projectId ? <ProjectLink id={l.projectId} /> : <Muted>{l.projectDim ? 'Unknown project' : 'No project'}</Muted> },
    { key: 'amount', label: 'Amount', align: 'right', render: (l) => <Money value={l.amount} currency={s.currency} /> },
    { key: 'action', label: '', render: (l) => <Button size="sm" variant="tinted" onClick={() => setFlag({ line: l, projectId: l.projectId, markupPct: settings.prjExpenseMarkupPct })}>Mark billable</Button> },
  ];
  const billCols: Column<BillableExpense>[] = [
    { key: 'claimNumber', label: 'Claim', render: (b) => <div><span className="identifier link" onClick={() => nav.go(`budgets/expenses/${b.claimId}`)}>{b.claimNumber}</span><div><Muted>{b.employeeName}</Muted></div></div> },
    { key: 'date', label: 'Date', render: (b) => fmtDate(b.date), sortable: true },
    { key: 'description', label: 'Line' },
    { key: 'projectId', label: 'Project', render: (b) => <div><ProjectLink id={b.projectId} /> <Muted>{projectOf(b.projectId)?.name}</Muted></div> },
    { key: 'amount', label: 'Cost', align: 'right', render: (b) => <Money value={b.amount} currency={s.currency} /> },
    { key: 'markupPct', label: 'Markup', align: 'right', render: (b) => `${b.markupPct}%` },
    { key: 'billAmount', label: 'Billable', align: 'right', render: (b) => <Money value={b.billAmount} currency={s.currency} />, total: (rs) => <span className="money" style={{ fontWeight: 600 }}>{fmtMoney(rs.reduce((a, b) => a + b.billAmount, 0), s.currency)}</span> },
    { key: 'status', label: 'Status', render: (b) => b.invoiceId ? <InvoiceLink id={b.invoiceId} number={b.invoiceNumber} /> : <Badge status={b.status === 'Ready' ? 'Unbilled' : b.status}>{b.status === 'Ready' ? 'Ready to bill' : b.status}</Badge> },
  ];
  const billActions = (b: BillableExpense): MenuAction[] => {
    const a: MenuAction[] = [{ label: 'Open claim', onClick: () => nav.go(`budgets/expenses/${b.claimId}`) }];
    if (b.status === 'Ready') { a.push({ label: 'Bill now', onClick: () => nav.go('projects/billing') }); a.push({ label: 'Change markup', onClick: () => { const l = lines.find((x) => x.claimId === b.claimId && x.lineId === b.lineId); if (l) setFlag({ line: l, projectId: b.projectId, markupPct: b.markupPct }); } }); a.push({ label: 'Exclude from billing', danger: true, separator: true, onClick: () => setExclude(b.id) }); }
    if (b.invoiceId) a.push({ label: 'Open invoice', onClick: () => nav.go(`sales/invoices/${b.invoiceId}`) });
    return a;
  };
  return (
    <div className="page">
      <PageHeader title="Expenses (billable)" subtitle={<ScopeLine extra="approved claim lines re-billed to customers" />} actions={<Button variant="secondary" onClick={() => nav.go('budgets/expenses')}>Open expense claims</Button>} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        <KpiTile label="Ready to bill" amount={ready.reduce((a, b) => a + b.billAmount, 0)} currency={s.currency} sub={`${ready.length} line(s)`} onClick={() => setTab('ready')} />
        <KpiTile label="Candidates" value={candidates.length} sub="approved claim lines not yet flagged" onClick={() => setTab('candidates')} />
        <KpiTile label="Invoiced" amount={invoiced.reduce((a, b) => a + b.billAmount, 0)} currency={s.currency} sub={`${invoiced.length} line(s)`} onClick={() => setTab('invoiced')} />
      </div>
      <Tabs variant="filter" value={tab} onChange={setTab} tabs={[{ id: 'candidates', label: 'Candidates', count: candidates.length }, { id: 'ready', label: 'Ready to bill', count: ready.length }, { id: 'invoiced', label: 'Invoiced', count: invoiced.length }, { id: 'excluded', label: 'Excluded', count: excluded.length }]} />
      {tab === 'candidates' && <DataTable rows={candidates} columns={candCols} rowKey={(l) => `${l.claimId}:${l.lineId}`} dense emptyTitle="No approved claim lines" emptyDescription="Approved or reimbursed expense claims appear here; flag lines to a project to re-bill them." />}
      {tab === 'ready' && <DataTable rows={ready} columns={billCols} rowActions={billActions} dense emptyTitle="Nothing ready to bill" emptyDescription="Flag candidate lines as billable to a project." />}
      {tab === 'invoiced' && <DataTable rows={invoiced} columns={billCols} rowActions={billActions} dense emptyTitle="No invoiced expenses yet" />}
      {tab === 'excluded' && <DataTable rows={excluded} columns={billCols} dense emptyTitle="Nothing excluded" />}
      <Muted>Expense claims are owned by Budgets & Expenses; this view never edits the claim. Cost stays in project profitability; the marked-up amount is what the customer is billed.</Muted>
      {flag && (
        <Drawer open onClose={() => setFlag(null)} title="Mark expense billable" subtitle={`${flag.line.claimNumber} · ${flag.line.description} · ${fmtMoney(flag.line.amount, s.currency)}`} width={520} footer={<><Button variant="ghost" onClick={() => setFlag(null)}>Cancel</Button><Button variant="primary" onClick={() => { try { const b = flagBillable(flag.line, flag.projectId ?? '', flag.markupPct); toast.success(`Ready to bill · ${fmtMoney(b.billAmount, s.currency)}`); setFlag(null); setTab('ready'); } catch (e: any) { toast.error(e.message); } }}>Mark billable</Button></>}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <EntityPicker label="Bill to project" required value={flag.projectId} onChange={(pid) => setFlag({ ...flag, projectId: pid })} options={projects} help="The project's contract picks this up in the next T&M / cost-plus billing run" />
            <PercentField label="Markup" value={flag.markupPct} onChange={(v) => setFlag({ ...flag, markupPct: v })} help={`Customer is billed ${fmtMoney(flag.line.amount * (1 + flag.markupPct / 100), s.currency)}`} />
          </div>
        </Drawer>
      )}
      <ConfirmDialog open={!!exclude} onClose={() => setExclude(null)} title="Exclude from billing?" statement="The expense stays in project cost but will not be re-billed." reasonRequired danger confirmLabel="Exclude expense" cancelLabel="Keep billable" onConfirm={(r) => { if (exclude) excludeBillable(exclude, r); toast.success('Expense excluded'); }} />
    </div>
  );
}
