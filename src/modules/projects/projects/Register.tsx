// Projects register — budget vs actual meters, status tabs.
import { useMemo, useState } from 'react';
import { C, nav, useSession, useCollection } from '../../../store';
import { RegisterPage, Badge, TwoLine, Identifier, Money, Meter, ConfirmDialog, useToast } from '../../../components/ui';
import type { Column, MenuAction } from '../../../components/ui';
import { fmtDate, fmtMoney } from '../../../lib/format';
import type { Project } from '../types';
import { useRows, projectActuals, employeeName } from '../data';
import { ContractLink, Muted } from '../shared';
import { setProjectStatus } from '../actions';

export default function ProjectRegister() {
  const rows = useRows<Project>(C.projects, (a, b) => a.code.localeCompare(b.code));
  useCollection(C.timesheets);
  const s = useSession();
  const toast = useToast();
  const [confirm, setConfirm] = useState<{ id: string; status: Project['status'] } | null>(null);
  const can = s.can('projects.project.edit') || s.can('projects.*');
  const actuals = useMemo(() => Object.fromEntries(rows.map((p) => [p.id, projectActuals(p)])), [rows]);
  const active = rows.filter((p) => p.status === 'Active');
  const columns: Column<Project>[] = [
    { key: 'code', label: 'Project', sortable: true, render: (p) => <div><Identifier link onClick={(e) => { e.stopPropagation(); nav.go(`projects/projects/${p.id}`); }}>{p.code}</Identifier><div className="cell-secondary">{p.name}</div></div> },
    { key: 'customerName', label: 'Customer', sortable: true, render: (p) => <TwoLine primary={p.customerName} secondary={<ContractLink id={p.contractId} />} /> },
    { key: 'manager', label: 'Manager', render: (p) => employeeName(p.managerEmployeeId), value: (p) => employeeName(p.managerEmployeeId) },
    { key: 'dates', label: 'Dates', render: (p) => <span style={{ fontSize: 12 }}>{fmtDate(p.start)} → {p.end ? fmtDate(p.end) : 'open'}</span>, value: (p) => p.start },
    { key: 'status', label: 'Status', sortable: true, render: (p) => <Badge status={p.status} /> },
    { key: 'hours', label: 'Hours vs budget', render: (p) => { const a = actuals[p.id]; return <div style={{ minWidth: 140 }}><div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}><span className="money">{a.hours} h</span><Muted>of {p.budgetHours || '—'}</Muted></div><Meter value={a.hours} max={p.budgetHours || a.hours || 1} /></div>; }, value: (p) => actuals[p.id].hours },
    { key: 'cost', label: 'Cost vs budget', render: (p) => { const a = actuals[p.id]; return <div style={{ minWidth: 140 }}><div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}><span className="money">{fmtMoney(a.cost, s.currency)}</span><Muted>of {p.budgetAmount ? fmtMoney(p.budgetAmount, s.currency) : '—'}</Muted></div><Meter value={a.cost} max={p.budgetAmount || a.cost || 1} /></div>; }, value: (p) => actuals[p.id].cost },
    { key: 'billed', label: 'Billed', align: 'right', render: (p) => <Money value={actuals[p.id].billedValue} currency={s.currency} />, value: (p) => actuals[p.id].billedValue, total: (rs) => <span className="money" style={{ fontWeight: 600 }}>{fmtMoney(rs.reduce((a, p) => a + actuals[p.id].billedValue, 0), s.currency)}</span> },
  ];
  const rowActions = (p: Project): MenuAction[] => {
    const a: MenuAction[] = [{ label: 'Open', onClick: () => nav.go(`projects/projects/${p.id}`) }, { label: 'Edit', onClick: () => nav.go(`projects/projects/${p.id}`, { edit: 1 }), disabled: !can, reason: can ? undefined : 'Requires projects.project.edit' }];
    if (p.status === 'Active') { a.push({ label: 'Log time', onClick: () => nav.go('projects/timesheets/new') }); a.push({ label: 'Put on hold', onClick: () => setConfirm({ id: p.id, status: 'On Hold' }), disabled: !can }); a.push({ label: 'Mark completed', onClick: () => setConfirm({ id: p.id, status: 'Completed' }), disabled: !can }); }
    if (p.status === 'Planned' || p.status === 'On Hold') a.push({ label: 'Activate', onClick: () => setConfirm({ id: p.id, status: 'Active' }), disabled: !can });
    if (!p.contractId) a.push({ label: 'Create contract', onClick: () => nav.go('projects/contracts/new', { customer: p.customerId, project: p.id }) });
    a.push({ label: 'Profitability', onClick: () => nav.go('projects/profitability', { project: p.id }) });
    if (p.status !== 'Cancelled' && p.status !== 'Completed') a.push({ label: 'Cancel project', danger: true, separator: true, onClick: () => setConfirm({ id: p.id, status: 'Cancelled' }), disabled: !can });
    return a;
  };
  return (
    <>
      <RegisterPage<Project>
        title="Projects"
        subtitle={<>{active.length} active · {rows.reduce((a, p) => a + actuals[p.id].hours, 0).toFixed(0)} h logged · each project carries a Project dimension for journals · {s.company?.tradeName}</>}
        rows={rows}
        columns={columns}
        entity="projects"
        searchKeys={['code', 'name', 'customerName']}
        tabs={[
          { id: 'all', label: 'All' },
          { id: 'active', label: 'Active', filter: (p) => p.status === 'Active' },
          { id: 'planned', label: 'Planned', filter: (p) => p.status === 'Planned' },
          { id: 'hold', label: 'On hold', filter: (p) => p.status === 'On Hold' },
          { id: 'closed', label: 'Completed / cancelled', filter: (p) => p.status === 'Completed' || p.status === 'Cancelled' },
        ]}
        filters={[{ key: 'customer', label: 'Customer', type: 'select', options: Array.from(new Map(rows.map((r) => [r.customerId, r.customerName ?? ''])).entries()).map(([value, label]) => ({ value, label })) }, { key: 'manager', label: 'Manager', type: 'select', options: Array.from(new Set(rows.map((r) => r.managerEmployeeId).filter(Boolean))).map((v) => ({ value: v!, label: employeeName(v) })) }]}
        applyFilter={(r, f) => (!f.customer || r.customerId === f.customer) && (!f.manager || r.managerEmployeeId === f.manager)}
        primaryAction={{ label: 'New project', onClick: () => nav.go('projects/projects/new'), disabled: !can, reason: can ? undefined : 'Requires projects.project.edit' }}
        onRowClick={(p) => nav.go(`projects/projects/${p.id}`)}
        rowActions={rowActions}
        rowClass={(p) => (p.status === 'Cancelled' ? 'muted' : undefined)}
      />
      <ConfirmDialog open={!!confirm} onClose={() => setConfirm(null)} title={`${confirm?.status === 'Cancelled' ? 'Cancel' : confirm?.status === 'Completed' ? 'Complete' : confirm?.status === 'On Hold' ? 'Hold' : 'Activate'} project?`} statement={confirm?.status === 'Cancelled' || confirm?.status === 'Completed' ? 'The Project dimension is deactivated; timesheets can no longer be logged against it.' : confirm?.status === 'On Hold' ? 'Time logging is blocked while on hold; billing of already-approved work continues.' : 'The project accepts timesheets and appears in capacity planning.'} reasonRequired={confirm?.status === 'Cancelled' || confirm?.status === 'On Hold'} danger={confirm?.status === 'Cancelled'} confirmLabel={`${confirm?.status === 'Cancelled' ? 'Cancel' : confirm?.status === 'Completed' ? 'Complete' : confirm?.status === 'On Hold' ? 'Put on hold' : 'Activate'} project`} cancelLabel="Keep as is" onConfirm={(r) => { if (!confirm) return; setProjectStatus(confirm.id, confirm.status, r); toast.success(`Project ${confirm.status.toLowerCase()}`); }} />
    </>
  );
}
