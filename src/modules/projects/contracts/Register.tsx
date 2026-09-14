// Contracts register (FR-SRV-002) — tabs by status, customer summary strip.
import { useMemo, useState } from 'react';
import { C, nav, useSession } from '../../../store';
import { RegisterPage, Badge, TwoLine, Identifier, Money, useToast, ConfirmDialog } from '../../../components/ui';
import type { Column, MenuAction } from '../../../components/ui';
import { fmtDate, fmtMoney } from '../../../lib/format';
import type { Contract } from '../types';
import { BILLING_METHODS } from '../types';
import { useRows, contractSummary } from '../data';
import { MethodPill, ProjectLink } from '../shared';
import { submitContract, activateContract, cancelContract } from '../actions';

const ALL_TABS: { id: string; label: string; filter?: (r: Contract) => boolean }[] = [
  { id: 'all', label: 'All' },
  { id: 'draft', label: 'Draft', filter: (r) => ['Draft', 'Returned', 'Rejected'].includes(r.status) },
  { id: 'awaiting', label: 'Awaiting activation', filter: (r) => r.status === 'Submitted' || r.status === 'Approved' },
  { id: 'active', label: 'Active', filter: (r) => r.status === 'Active' },
  { id: 'closed', label: 'Completed / cancelled', filter: (r) => r.status === 'Completed' || r.status === 'Cancelled' },
];

export default function ContractRegister({ tab }: { tab?: string }) {
  const rows = useRows<Contract>(C.contracts, (a, b) => (b.date + b.number).localeCompare(a.date + a.number));
  const s = useSession();
  const toast = useToast();
  const [confirm, setConfirm] = useState<{ kind: 'activate' | 'cancel'; id: string } | null>(null);
  const can = s.can('projects.contract.edit') || s.can('projects.*');
  const summaries = useMemo(() => Object.fromEntries(rows.map((c) => [c.id, contractSummary(c)])), [rows]);
  const TABS = tab && ALL_TABS.some((t) => t.id === tab) ? [ALL_TABS.find((t) => t.id === tab)!, ...ALL_TABS.filter((t) => t.id !== tab)] : ALL_TABS;
  const active = rows.filter((r) => r.status === 'Active');
  const value = active.reduce((sum, c) => sum + (c.totals?.baseTotal ?? c.amount), 0);
  const unbilled = active.reduce((sum, c) => sum + (summaries[c.id]?.unbilledValue ?? 0), 0);
  const columns: Column<Contract>[] = [
    { key: 'number', label: 'Contract', sortable: true, render: (r) => <div><Identifier link onClick={(e) => { e.stopPropagation(); nav.go(`projects/contracts/${r.id}`); }}>{r.number}</Identifier><div className="cell-secondary">{r.title}</div></div>, value: (r) => r.number },
    { key: 'partyName', label: 'Customer', sortable: true, render: (r) => <TwoLine primary={r.partyName} secondary={<ProjectLink id={r.projectId} />} /> },
    { key: 'billingMethod', label: 'Method', sortable: true, render: (r) => <MethodPill method={r.billingMethod} /> },
    { key: 'dates', label: 'Term', render: (r) => <span style={{ fontSize: 12 }}>{fmtDate(r.start)} → {r.end ? fmtDate(r.end) : 'open'}</span>, value: (r) => r.start },
    { key: 'status', label: 'Status', sortable: true, render: (r) => <Badge status={r.status} /> },
    { key: 'amount', label: 'Value', align: 'right', sortable: true, render: (r) => <Money value={r.billingMethod === 'Recurring' ? (r.recurrence?.amount ?? 0) : r.amount} currency={r.currency} code={r.currency !== s.currency} />, value: (r) => r.amount, total: (rs) => <span className="money" style={{ fontWeight: 600 }}>{fmtMoney(rs.filter((x) => x.currency === s.currency && x.status !== 'Cancelled').reduce((a, x) => a + (x.billingMethod === 'Recurring' ? (x.recurrence?.amount ?? 0) : x.amount), 0), s.currency)}</span> },
    { key: 'billed', label: 'Billed', align: 'right', render: (r) => <Money value={summaries[r.id]?.billed ?? 0} currency={r.currency} />, value: (r) => summaries[r.id]?.billed ?? 0 },
    { key: 'unbilled', label: 'Unbilled', align: 'right', render: (r) => (summaries[r.id]?.unbilledValue ?? 0) > 0 ? <span className="money" style={{ color: 'var(--warn)' }}>{fmtMoney(summaries[r.id].unbilledValue, s.currency)}</span> : <span style={{ color: 'var(--ink-5)' }}>—</span>, value: (r) => summaries[r.id]?.unbilledValue ?? 0 },
  ];
  const run = (fn: () => void, ok: string) => { try { fn(); toast.success(ok); } catch (e: any) { toast.error(e.message); } };
  const rowActions = (r: Contract): MenuAction[] => {
    const a: MenuAction[] = [{ label: 'Open', onClick: () => nav.go(`projects/contracts/${r.id}`) }];
    if (['Draft', 'Returned', 'Rejected'].includes(r.status)) {
      a.push({ label: 'Edit', onClick: () => nav.go(`projects/contracts/${r.id}`, { edit: 1 }), disabled: !can, reason: can ? undefined : 'Requires projects.contract.edit' });
      a.push({ label: 'Submit for approval', onClick: () => run(() => { const x = submitContract(r.id); toast.info(x.request ? `Routed to ${x.request.ruleName}` : 'No Contract workflow — auto-approved'); }, `${r.number} submitted`), disabled: !can });
    }
    if (r.status === 'Approved') a.push({ label: 'Activate', onClick: () => setConfirm({ kind: 'activate', id: r.id }), disabled: !can });
    if (r.status === 'Active') {
      a.push({ label: 'Run billing', onClick: () => nav.go('projects/billing', { contract: r.id }) });
      a.push({ label: 'Log time', onClick: () => nav.go('projects/timesheets/new') });
    }
    if (r.status !== 'Completed' && r.status !== 'Cancelled') a.push({ label: 'Cancel contract', danger: true, separator: true, onClick: () => setConfirm({ kind: 'cancel', id: r.id }), disabled: !can });
    return a;
  };
  return (
    <>
      <RegisterPage<Contract>
        title="Customers & contracts"
        subtitle={<>{active.length} active · <span className="money">{fmtMoney(value, s.currency)}</span> contracted · <span className="money">{fmtMoney(unbilled, s.currency)}</span> unbilled · {s.company?.tradeName} · FY {s.state.fy}</>}
        rows={rows}
        columns={columns}
        entity="contracts"
        searchKeys={['number', 'title', 'partyName']}
        searchPlaceholder="Number, title, customer…"
        tabs={TABS}
        filters={[
          { key: 'method', label: 'Billing method', type: 'select', options: BILLING_METHODS.map((m) => ({ value: m, label: m })) },
          { key: 'customer', label: 'Customer', type: 'select', options: Array.from(new Map(rows.map((r) => [r.customerId, r.partyName ?? ''])).entries()).map(([value, label]) => ({ value, label })) },
          { key: 'currency', label: 'Currency', type: 'select', options: Array.from(new Set(rows.map((r) => r.currency))).map((v) => ({ value: v, label: v })) },
        ]}
        applyFilter={(r, f) => (!f.method || r.billingMethod === f.method) && (!f.customer || r.customerId === f.customer) && (!f.currency || r.currency === f.currency)}
        primaryAction={{ label: 'New contract', onClick: () => nav.go('projects/contracts/new'), disabled: !can, reason: can ? undefined : 'Requires projects.contract.edit' }}
        onRowClick={(r) => nav.go(`projects/contracts/${r.id}`)}
        rowActions={rowActions}
        rowClass={(r) => (r.status === 'Cancelled' ? 'muted' : undefined)}
      />
      <ConfirmDialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        title={confirm?.kind === 'activate' ? 'Activate contract?' : 'Cancel contract?'}
        statement={confirm?.kind === 'activate' ? 'Active contracts accept timesheets, milestones and usage, and are picked up by billing runs and revenue recognition.' : 'Cancelled contracts stop billing and recognition. Posted invoices are unaffected.'}
        consequences={confirm?.kind === 'activate' ? [{ engine: 'Workflow', text: 'Linked projects move from Planned to Active' }, { engine: 'Notification', text: 'Project manager is notified' }] : [{ engine: 'Workflow', text: 'Any pending approval request is closed', tone: 'warning' }]}
        reasonRequired={confirm?.kind === 'cancel'}
        confirmLabel={confirm?.kind === 'activate' ? 'Activate contract' : 'Cancel contract'}
        cancelLabel="Keep as is"
        danger={confirm?.kind === 'cancel'}
        onConfirm={(reason) => { if (!confirm) return; if (confirm.kind === 'activate') { const c = activateContract(confirm.id); toast.success(`${c.number} is active`); } else { cancelContract(confirm.id, reason); toast.success('Contract cancelled'); } }}
      />
    </>
  );
}
