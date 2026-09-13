// Timesheet register (FR-SRV-003): filters employee / project / status / week; Unbilled tab; inline approve.
import { useState } from 'react';
import { C, engine, nav, useSession, useCollection } from '../../../store';
import type { ApprovalRequest } from '../../../store';
import { RegisterPage, Badge, TwoLine, Identifier, useToast, ConfirmDialog } from '../../../components/ui';
import type { Column, MenuAction } from '../../../components/ui';
import { fmtDate, downloadText, toCSV, today } from '../../../lib/format';
import type { Timesheet } from '../types';
import { useRows, projectOf, employeeName, currentEmployee, weekStartOf } from '../data';
import { Muted } from '../shared';
import { submitTimesheet, actOnTimesheet, deleteDraftTimesheet } from '../actions';

export default function TimesheetRegister({ tab, employeeId, projectId }: { tab?: string; employeeId?: string; projectId?: string }) {
  const all = useRows<Timesheet>(C.timesheets, (a, b) => (b.weekStart + b.number).localeCompare(a.weekStart + a.number));
  const approvals = useCollection<ApprovalRequest>(C.approvals);
  const s = useSession();
  const toast = useToast();
  const [confirm, setConfirm] = useState<{ kind: 'approve' | 'reject' | 'delete' | 'bulk-approve'; ids: string[] } | null>(null);
  const rows = all.filter((t) => (!employeeId || t.employeeId === employeeId) && (!projectId || t.rows.some((r) => r.projectId === projectId)));
  const me = currentEmployee();
  const canApprove = (t: Timesheet) => { const req = approvals.find((a) => a.id === t.approvalId) ?? [...approvals].reverse().find((a) => a.docId === t.id && a.status === 'Pending'); return req ? engine.canActOnApproval(req) : { ok: false, reason: 'No approval request' }; };
  const unbilledHours = (t: Timesheet) => t.rows.filter((r) => r.billable && !r.invoiceId).reduce((a, r) => a + r.hours.reduce((x, y) => x + y, 0), 0);
  const columns: Column<Timesheet>[] = [
    { key: 'number', label: 'Timesheet', sortable: true, render: (t) => <div><Identifier link onClick={(e) => { e.stopPropagation(); nav.go(`projects/timesheets/${t.id}`); }}>{t.number}</Identifier><div className="cell-secondary">{t.source === 'Import' ? 'Imported' : 'Web'}{t.approvedBy ? ` · approved by ${t.approvedBy}` : ''}</div></div> },
    { key: 'employeeName', label: 'Employee', sortable: true, render: (t) => <TwoLine primary={t.employeeName} secondary={employeeName(t.employeeId) !== t.employeeName ? employeeName(t.employeeId) : undefined} /> },
    { key: 'weekStart', label: 'Week', sortable: true, render: (t) => fmtDate(t.weekStart) },
    { key: 'projects', label: 'Projects', render: (t) => <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>{Array.from(new Set(t.rows.map((r) => r.projectId))).map((p) => <span key={p} className="dim-chip">{projectOf(p)?.code ?? '—'}</span>)}</div> },
    { key: 'totalHours', label: 'Hours', align: 'right', sortable: true, render: (t) => <span className="money">{t.totalHours} h</span>, total: (rs) => <span className="money" style={{ fontWeight: 600 }}>{rs.reduce((a, t) => a + t.totalHours, 0).toFixed(1)} h</span> },
    { key: 'billableHours', label: 'Billable', align: 'right', render: (t) => <span className="money">{t.billableHours} h</span>, total: (rs) => <span className="money" style={{ fontWeight: 600 }}>{rs.reduce((a, t) => a + t.billableHours, 0).toFixed(1)} h</span> },
    { key: 'unbilled', label: 'Unbilled', align: 'right', render: (t) => (t.status === 'Approved' || t.status === 'Invoiced') && unbilledHours(t) > 0 ? <span className="money" style={{ color: '#8A4B0F' }}>{unbilledHours(t)} h</span> : <span style={{ color: '#B0B5BF' }}>—</span> },
    { key: 'status', label: 'Status', sortable: true, render: (t) => <div><Badge status={t.status} />{t.status === 'Submitted' && <div><Muted>Awaiting {(approvals.find((a) => a.id === t.approvalId)?.steps[0]?.approverLabel) ?? 'manager'}</Muted></div>}</div> },
  ];
  const rowActions = (t: Timesheet): MenuAction[] => {
    const a: MenuAction[] = [{ label: 'Open', onClick: () => nav.go(`projects/timesheets/${t.id}`) }];
    if (['Draft', 'Returned', 'Rejected'].includes(t.status)) a.push({ label: 'Submit for approval', onClick: () => { try { const r = submitTimesheet(t.id); toast.success(r.request ? `Submitted · awaiting ${r.request.steps[0]?.approverLabel}` : 'Approved (no workflow)'); } catch (e: any) { toast.error(e.message); } } });
    if (t.status === 'Submitted') { const c = canApprove(t); a.push({ label: 'Approve', onClick: () => setConfirm({ kind: 'approve', ids: [t.id] }), disabled: !c.ok, reason: c.reason }); a.push({ label: 'Reject', onClick: () => setConfirm({ kind: 'reject', ids: [t.id] }), disabled: !c.ok, reason: c.reason }); }
    if (t.status === 'Approved' && unbilledHours(t) > 0) a.push({ label: 'Bill now', onClick: () => nav.go('projects/billing') });
    if (t.invoicedInvoiceId) a.push({ label: 'Open invoice', onClick: () => nav.go(`sales/invoices/${t.invoicedInvoiceId}`) });
    if (t.status === 'Draft') a.push({ label: 'Delete draft', danger: true, separator: true, onClick: () => setConfirm({ kind: 'delete', ids: [t.id] }) });
    return a;
  };
  const bulk = (ids: Set<string>, sel: Timesheet[]): MenuAction[] => {
    const allSubmitted = sel.every((t) => t.status === 'Submitted' && canApprove(t).ok);
    return [
      { label: 'Approve', onClick: () => setConfirm({ kind: 'bulk-approve', ids: Array.from(ids) }), disabled: !allSubmitted, reason: allSubmitted ? undefined : 'Only submitted timesheets you can approve' },
      { label: 'Export', onClick: () => downloadText(`timesheets-${today()}.csv`, toCSV(sel.map((t) => ({ number: t.number, employee: t.employeeName, week: t.weekStart, hours: t.totalHours, billable: t.billableHours, status: t.status, approver: t.approvedBy ?? '' })))) },
    ];
  };
  const employees = Array.from(new Map(all.map((t) => [t.employeeId, t.employeeName])).entries());
  const projects = Array.from(new Set(all.flatMap((t) => t.rows.map((r) => r.projectId)))).map((p) => ({ value: p, label: projectOf(p)?.code ?? p }));
  const initialTab = tab && ['all', 'mine', 'draft', 'submitted', 'approved', 'unbilled', 'invoiced', 'rejected'].includes(tab) ? tab : 'all';
  return (
    <>
      <RegisterPage<Timesheet>
        key={initialTab}
        title="Timesheets"
        subtitle={<>{rows.filter((t) => t.status === 'Submitted').length} awaiting approval · {rows.filter((t) => t.status === 'Approved').reduce((a, t) => a + unbilledHours(t), 0).toFixed(1)} h approved & unbilled · week starts {fmtDate(weekStartOf(today()))}{employeeId ? ` · ${employeeName(employeeId)}` : ''}{projectId ? ` · ${projectOf(projectId)?.code}` : ''}</>}
        rows={rows}
        columns={columns}
        entity="timesheets"
        searchKeys={['number', 'employeeName']}
        tabs={[
          ...(initialTab === 'all' ? [] : [{ id: initialTab, label: initialTab === 'mine' ? 'Mine' : initialTab.charAt(0).toUpperCase() + initialTab.slice(1), filter: tabFilter(initialTab, me?.id, unbilledHours) }]),
          { id: 'all', label: 'All' },
          ...(initialTab === 'mine' ? [] : [{ id: 'mine', label: 'Mine', filter: (t: Timesheet) => t.employeeId === me?.id }]),
          ...['draft', 'submitted', 'approved', 'unbilled', 'invoiced', 'rejected'].filter((x) => x !== initialTab).map((x) => ({ id: x, label: x === 'unbilled' ? 'Unbilled' : x.charAt(0).toUpperCase() + x.slice(1), filter: tabFilter(x, me?.id, unbilledHours) })),
        ]}
        filters={[
          { key: 'employee', label: 'Employee', type: 'select', options: employees.map(([value, label]) => ({ value, label })) },
          { key: 'project', label: 'Project', type: 'select', options: projects },
          { key: 'status', label: 'Status', type: 'select', options: ['Draft', 'Submitted', 'Approved', 'Invoiced', 'Rejected', 'Returned'].map((v) => ({ value: v, label: v })) },
          { key: 'week', label: 'Week', type: 'date-range' },
        ]}
        applyFilter={(t, f) => (!f.employee || t.employeeId === f.employee) && (!f.project || t.rows.some((r) => r.projectId === f.project)) && (!f.status || t.status === f.status) && (!f.weekFrom || t.weekStart >= f.weekFrom) && (!f.weekTo || t.weekStart <= f.weekTo)}
        primaryAction={{ label: 'Log time', onClick: () => nav.go('projects/timesheets/new') }}
        importAction={() => nav.go('projects/timesheets/new', { import: 1 })}
        onRowClick={(t) => nav.go(`projects/timesheets/${t.id}`)}
        rowActions={rowActions}
        bulkActions={bulk}
      />
      <ConfirmDialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        title={confirm?.kind === 'reject' ? 'Reject timesheet?' : confirm?.kind === 'delete' ? 'Delete draft?' : `Approve ${confirm?.ids.length === 1 ? 'timesheet' : `${confirm?.ids.length} timesheets`}?`}
        statement={confirm?.kind === 'reject' ? 'The employee is notified and can correct and resubmit.' : confirm?.kind === 'delete' ? 'Drafts are the only timesheets that can be deleted.' : 'Approved hours are locked, become billable in the next billing run and count towards revenue recognition and cost.'}
        consequences={confirm?.kind === 'approve' || confirm?.kind === 'bulk-approve' ? [{ engine: 'Workflow', text: 'Timesheet locked · approver and time retained' }, { engine: 'Open items', text: 'Billable hours join the unbilled pool' }] : []}
        reasonRequired={confirm?.kind === 'reject'}
        danger={confirm?.kind === 'reject' || confirm?.kind === 'delete'}
        confirmLabel={confirm?.kind === 'reject' ? 'Reject timesheet' : confirm?.kind === 'delete' ? 'Delete draft' : 'Approve'}
        cancelLabel="Keep as is"
        onConfirm={(reason) => {
          if (!confirm) return;
          if (confirm.kind === 'delete') { deleteDraftTimesheet(confirm.ids[0]); toast.success('Draft deleted'); return; }
          let ok = 0; const errs: string[] = [];
          confirm.ids.forEach((id) => { try { actOnTimesheet(id, confirm.kind === 'reject' ? 'Reject' : 'Approve', reason || undefined); ok++; } catch (e: any) { errs.push(e.message); } });
          if (ok) toast.success(`${ok} timesheet(s) ${confirm.kind === 'reject' ? 'rejected' : 'approved'}`);
          errs.slice(0, 2).forEach((m) => toast.error(m));
        }}
      />
    </>
  );
}

function tabFilter(id: string, meId: string | undefined, unbilled: (t: Timesheet) => number): ((t: Timesheet) => boolean) | undefined {
  switch (id) {
    case 'mine': return (t) => t.employeeId === meId;
    case 'draft': return (t) => t.status === 'Draft' || t.status === 'Returned';
    case 'submitted': return (t) => t.status === 'Submitted';
    case 'approved': return (t) => t.status === 'Approved';
    case 'unbilled': return (t) => (t.status === 'Approved' || t.status === 'Invoiced') && unbilled(t) > 0;
    case 'invoiced': return (t) => t.status === 'Invoiced';
    case 'rejected': return (t) => t.status === 'Rejected';
    default: return undefined;
  }
}
