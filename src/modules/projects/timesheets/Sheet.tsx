// Weekly timesheet grid (FR-SRV-003): employee (self by default, managers can pick), rows
// project / task with 7 day cells + billable toggle, totals, save draft, submit, approve /
// reject, locked after approval, source + approver retained. Also hosts the CSV import.
import { useMemo, useState } from 'react';
import { db, C, engine, nav, useRecord, useSession, useCollection } from '../../../store';
import type { ApprovalRequest, Employee } from '../../../store';
import { PageHeader, Card, Button, DateField, EntityPicker, useEmployeeOptions, useToast, Badge, ConfirmDialog, ApprovalsTab, ActivityTab, Tabs, EmptyState, Banner, ImportWizard, KV, Pill } from '../../../components/ui';
import { fmtDate, fmtMoney, fmtDateTime, addDays, today, round } from '../../../lib/format';
import type { Timesheet, TimesheetRow, Project } from '../types';
import { weekStartOf, weekDays, weekLabels, rowHours, sheetTotals, currentEmployee, projectOf, contractOfProject, billRateFor, useSettings, employeeOf } from '../data';
import { useProjectOptions, ProjectLink, InvoiceLink, Muted } from '../shared';
import { newTimesheet, newTimesheetRow, saveTimesheet, submitTimesheet, actOnTimesheet, deleteDraftTimesheet, timesheetValue, validateTimesheet } from '../actions';

export default function TimesheetPage({ id, employeeId, week }: { id?: string; employeeId?: string; week?: string }) {
  const existing = useRecord<Timesheet>(C.timesheets, id);
  const s = useSession();
  const toast = useToast();
  const settings = useSettings();
  const approvals = useCollection<ApprovalRequest>(C.approvals);
  const [t, setT] = useState<Timesheet>(() => existing ? { ...existing, rows: existing.rows.map((r) => ({ ...r, hours: [...r.hours] })) } : newTimesheet({ employeeId: employeeId ?? currentEmployee()?.id, weekStart: week ? weekStartOf(week) : weekStartOf(today()) }));
  const [dialog, setDialog] = useState<null | 'submit' | 'approve' | 'reject' | 'return' | 'delete' | 'recall'>(null);
  const [tab, setTab] = useState<'grid' | 'approvals' | 'activity'>('grid');
  const [importOpen, setImportOpen] = useState(new URLSearchParams(window.location.hash.split('?')[1] ?? '').get('import') === '1');
  const [errs, setErrs] = useState<{ field?: string; message: string }[]>([]);
  const employees = useEmployeeOptions();
  const projectOpts = useProjectOptions((p) => p.status === 'Active' || p.status === 'Planned');
  const me = currentEmployee();
  const isManager = s.can('projects.timesheet.approve') || s.can('projects.*') || db.get<Employee>(C.employees).some((e) => e.managerId === me?.id) || db.get<Project>(C.projects).some((p) => p.managerEmployeeId === me?.id);
  const locked = !!existing && !['Draft', 'Returned', 'Rejected'].includes(existing.status);
  const days = useMemo(() => weekDays(t.weekStart), [t.weekStart]);
  const labels = weekLabels(settings.prjWeekStart);
  const totals = sheetTotals(t.rows);
  const dayTotals = days.map((_, i) => round(t.rows.reduce((a, r) => a + (Number(r.hours[i]) || 0), 0), 2));
  const value = timesheetValue(t);
  const req = existing ? (approvals.find((a) => a.id === existing.approvalId) ?? [...approvals].reverse().find((a) => a.docId === existing.id)) : undefined;
  const canAct = req && req.status === 'Pending' ? engine.canActOnApproval(req) : { ok: false, reason: '' };
  if (id && !existing) return <EmptyState icon="⏱️" title="Timesheet not found" action={<Button variant="primary" onClick={() => nav.go('projects/timesheets')}>Back to timesheets</Button>} />;

  const setRow = (rid: string, p: Partial<TimesheetRow>) => setT((x) => ({ ...x, rows: x.rows.map((r) => (r.id === rid ? { ...r, ...p } : r)) }));
  const setHour = (rid: string, i: number, v: string) => { const n = Math.max(0, Math.min(24, Number(v.replace(/[^0-9.]/g, '')) || 0)); setT((x) => ({ ...x, rows: x.rows.map((r) => (r.id === rid ? { ...r, hours: r.hours.map((h, j) => (j === i ? n : h)) } : r)) })); };
  const persist = (): Timesheet | undefined => {
    const v = validateTimesheet(t);
    setErrs(v);
    if (v.length) { toast.error(v[0].message); return undefined; }
    try { const out = saveTimesheet(t, { expectedVersion: existing?.version }); setT({ ...out, rows: out.rows.map((r) => ({ ...r, hours: [...r.hours] })) }); if (!id) nav.replace(`projects/timesheets/${out.id}`); return out; } catch (e: any) { toast.error(e.message); return undefined; }
  };
  const submit = () => {
    const out = persist();
    if (!out) return;
    try { const r = submitTimesheet(out.id); toast.success(r.request ? `${out.number} submitted · awaiting ${r.request.steps.find((x) => x.status === 'Pending')?.approverLabel ?? 'approver'}` : `${out.number} approved (no workflow)`); nav.go(`projects/timesheets/${out.id}`); } catch (e: any) { toast.error(e.message); }
  };
  const act = (action: 'Approve' | 'Reject' | 'Return' | 'Recall', comment?: string) => { try { actOnTimesheet(existing!.id, action, comment); toast.success(`${existing!.number} ${action === 'Recall' ? 'recalled' : action.toLowerCase() + (action.endsWith('e') ? 'd' : 'ed')}`); } catch (e: any) { toast.error(e.message); } };
  const err = (f: string) => errs.find((e) => e.field === f)?.message ?? null;
  const status = existing?.status ?? 'Draft';
  const empName = employeeOf(t.employeeId)?.name ?? t.employeeName;

  const footer = (
    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center' }}>
      {!locked && (
        <>
          {existing?.status === 'Draft' && <Button variant="ghost" onClick={() => setDialog('delete')}>Delete draft</Button>}
          <Button variant="secondary" onClick={() => { const o = persist(); if (o) toast.success(`${o.number} saved`); }} data-testid="save-timesheet">Save draft</Button>
          <Button variant="primary" onClick={() => setDialog('submit')} disabled={totals.total === 0} reason={totals.total === 0 ? 'Log at least one hour' : undefined} data-testid="submit-timesheet">Submit for approval</Button>
        </>
      )}
      {status === 'Submitted' && (
        <>
          {req?.requesterId === s.user?.id && <Button variant="secondary" onClick={() => setDialog('recall')}>Recall</Button>}
          {canAct.ok ? (
            <>
              <Button variant="secondary" onClick={() => setDialog('return')}>Return for changes</Button>
              <Button variant="tinted" tone="danger" onClick={() => setDialog('reject')}>Reject</Button>
              <Button variant="primary" tone="good" onClick={() => setDialog('approve')} data-testid="approve-timesheet">Approve</Button>
            </>
          ) : <Muted>Awaiting {req?.steps.find((x) => x.order === req.currentStep)?.approverLabel ?? 'approver'}{canAct.reason ? ` · ${canAct.reason}` : ''}</Muted>}
        </>
      )}
      {(status === 'Approved') && <Button variant="primary" onClick={() => nav.go('projects/billing')}>Run billing</Button>}
      {status === 'Invoiced' && existing?.invoicedInvoiceId && <Button variant="secondary" onClick={() => nav.go(`sales/invoices/${existing.invoicedInvoiceId}`)}>Open invoice</Button>}
      <Button variant="secondary" onClick={() => nav.go('projects/timesheets/new', { employee: t.employeeId, week: addDays(t.weekStart, 7) })}>Next week →</Button>
    </div>
  );

  return (
    <div className="page">
      <PageHeader title={existing ? existing.number : 'Log time'} subtitle={<>{empName} · week of {fmtDate(t.weekStart)} · <Badge status={status} />{existing?.approvedBy ? <> · approved by {existing.approvedBy} {fmtDateTime(existing.approvedAt)}</> : null}{existing?.source === 'Import' ? ' · imported' : ''}</>} back={{ label: 'Timesheets', path: 'projects/timesheets' }} actions={footer} />
      {existing?.status === 'Rejected' && <Banner tone="danger">Rejected{existing.rejectionReason ? `: ${existing.rejectionReason}` : ''} — correct and resubmit.</Banner>}
      {existing?.status === 'Returned' && req && <Banner tone="warning">Returned for changes: {req.steps.find((x) => x.status === 'Returned')?.comment ?? '—'}</Banner>}
      {locked && status !== 'Submitted' && <Banner tone="info">This timesheet is {status.toLowerCase()} and locked. Approver and submission time are retained for audit.</Banner>}
      {errs.length > 0 && <Banner tone="danger">{errs.map((e) => e.message).join(' · ')}</Banner>}
      {existing && <Tabs tabs={[{ id: 'grid', label: 'Hours' }, { id: 'approvals', label: 'Approvals' }, { id: 'activity', label: 'Activity' }]} value={tab} onChange={setTab} />}
      {tab === 'grid' && (
        <>
          <Card>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr', gap: 14, alignItems: 'end' }}>
              <EntityPicker label="Employee" required value={t.employeeId || undefined} onChange={(eid) => setT({ ...t, employeeId: eid ?? '', employeeName: employeeOf(eid)?.name ?? '' })} options={employees} disabled={locked || (!isManager && !!me)} error={err('employeeId')} help={!isManager ? 'Managers can log on behalf of their team' : undefined} />
              <DateField label="Week starting" required value={t.weekStart} onChange={(v) => v && setT({ ...t, weekStart: weekStartOf(v) })} disabled={locked} error={err('weekStart')} />
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 6 }}>
                {!locked && <><Button size="sm" variant="secondary" onClick={() => setT({ ...t, weekStart: addDays(t.weekStart, -7) })}>‹ Prev week</Button><Button size="sm" variant="secondary" onClick={() => setT({ ...t, weekStart: addDays(t.weekStart, 7) })}>Next week ›</Button></>}
                {!locked && !id && <Button size="sm" variant="secondary" onClick={() => setImportOpen(true)}>Import CSV</Button>}
              </div>
            </div>
          </Card>
          <div className="card" style={{ overflow: 'auto' }}>
            <table className="data-table dense" style={{ minWidth: 980 }}>
              <thead>
                <tr>
                  <th style={{ width: 240 }}>Project</th>
                  <th style={{ width: 200 }}>Task</th>
                  {days.map((d, i) => <th key={d} className="right" style={{ width: 72 }}><div>{labels[i]}</div><div style={{ fontWeight: 400, fontSize: 11, color: d === today() ? 'var(--accent)' : 'var(--ink-4)' }}>{d.slice(8)}/{d.slice(5, 7)}</div></th>)}
                  <th className="right" style={{ width: 80 }}>Total</th>
                  <th style={{ width: 90 }}>Billable</th>
                  <th style={{ width: 120 }}>Rate</th>
                  {!locked && <th style={{ width: 40 }} />}
                </tr>
              </thead>
              <tbody>
                {t.rows.map((r) => {
                  const p = projectOf(r.projectId);
                  const c = r.projectId ? contractOfProject(r.projectId) : undefined;
                  const rate = t.employeeId && r.projectId ? billRateFor(c, t.employeeId, r.serviceId) : undefined;
                  const invoiced = !!r.invoiceId;
                  return (
                    <tr key={r.id} style={invoiced ? { background: 'var(--surface-2)' } : undefined}>
                      <td>{locked ? <div><ProjectLink id={r.projectId} /> <span style={{ fontSize: 12 }}>{p?.name}</span></div> : <EntityPicker value={r.projectId || undefined} onChange={(pid) => setRow(r.id, { projectId: pid ?? '' })} options={projectOpts} size="grid" placeholder="Project" />}</td>
                      <td>{locked ? r.task || <Muted>—</Muted> : <input className="field-input grid" value={r.task} onChange={(e) => setRow(r.id, { task: e.target.value })} placeholder="Task / deliverable" />}</td>
                      {r.hours.map((h, i) => <td key={i} className="right">{locked ? <span className="money">{h ? h : <span style={{ color: 'var(--line-strong)' }}>·</span>}</span> : <input className="field-input grid num" value={h || ''} placeholder="0" onChange={(e) => setHour(r.id, i, e.target.value)} onFocus={(e) => e.target.select()} style={{ width: 60, textAlign: 'right' }} />}</td>)}
                      <td className="right money" style={{ fontWeight: 600 }}>{rowHours(r)}</td>
                      <td>{locked ? (r.billable ? <Pill tone="good">Billable</Pill> : <Pill tone="neutral">Internal</Pill>) : <button type="button" className={`toggle ${r.billable ? 'on' : ''}`} onClick={() => setRow(r.id, { billable: !r.billable })} aria-pressed={r.billable} title={r.billable ? 'Billable' : 'Non-billable'} />}</td>
                      <td>{invoiced ? <InvoiceLink id={r.invoiceId} number={r.invoiceNumber} /> : r.billable && rate ? <span className="money" style={{ fontSize: 12 }} title={rate.source}>{fmtMoney(rate.rate, c?.currency ?? s.currency)}/h</span> : <Muted>—</Muted>}</td>
                      {!locked && <td><button type="button" className="btn-icon" onClick={() => setT({ ...t, rows: t.rows.filter((x) => x.id !== r.id) })} title="Remove row">✕</button></td>}
                    </tr>
                  );
                })}
                {!t.rows.length && <tr><td colSpan={13} style={{ textAlign: 'center', color: 'var(--ink-3)', padding: 16 }}>No rows — add a project row below.</td></tr>}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={2} style={{ fontWeight: 600 }}>{!locked && <Button size="sm" variant="secondary" onClick={() => setT({ ...t, rows: [...t.rows, newTimesheetRow()] })}>+ Add row</Button>} <span style={{ marginLeft: 8 }}>Day totals</span></td>
                  {dayTotals.map((d, i) => <td key={i} className="right money" style={{ color: d > 12 ? 'var(--danger)' : undefined }}>{d || ''}</td>)}
                  <td className="right money" style={{ fontWeight: 700 }}>{totals.total} h</td>
                  <td className="money">{totals.billable} h</td>
                  <td className="money" style={{ fontSize: 12 }}>{fmtMoney(value, s.currency)}</td>
                  {!locked && <td />}
                </tr>
              </tfoot>
            </table>
          </div>
          {existing && <Card title="Source & approval"><KV columns={2} items={[{ k: 'Source', v: existing.source }, { k: 'Created by', v: `${existing.createdBy ?? '—'} · ${fmtDateTime(existing.createdAt)}` }, { k: 'Submitted', v: existing.submittedAt ? `${existing.submittedBy} · ${fmtDateTime(existing.submittedAt)}` : '—' }, { k: 'Approved', v: existing.approvedAt ? `${existing.approvedBy} · ${fmtDateTime(existing.approvedAt)}` : '—' }, { k: 'Invoiced', v: existing.invoicedInvoiceId ? <InvoiceLink id={existing.invoicedInvoiceId} /> : existing.rows.some((r) => r.invoiceId) ? 'Partially' : '—' }, { k: 'Billable value', v: fmtMoney(value, s.currency) }]} /></Card>}
        </>
      )}
      {tab === 'approvals' && existing && <Card><ApprovalsTab approvalId={existing.approvalId} docId={existing.id} /></Card>}
      {tab === 'activity' && existing && <Card><ActivityTab objectId={existing.id} correlationId={existing.correlationId} /></Card>}
      <ConfirmDialog open={dialog === 'submit'} onClose={() => setDialog(null)} title="Submit timesheet for approval?" statement={`${totals.total} h (${totals.billable} billable · ${fmtMoney(value, s.currency)}) for the week of ${fmtDate(t.weekStart)}.`} consequences={[{ engine: 'Workflow', text: settings.prjTimesheetApproval ? 'Routed to the project manager (Timesheet Approval workflow)' : 'Approval disabled — auto-approved' }, { engine: 'Notification', text: 'Approver is notified' }]} confirmLabel="Submit timesheet" cancelLabel="Keep editing" onConfirm={() => submit()} />
      <ConfirmDialog open={dialog === 'approve'} onClose={() => setDialog(null)} title={`Approve ${existing?.number}?`} statement="Approved hours are locked, join the unbilled pool for T&M billing and count in revenue and cost." consequences={[{ engine: 'Workflow', text: 'Timesheet locked · your name is retained as approver' }, { engine: 'Open items', text: `${totals.billable} billable h become billable` }]} confirmLabel="Approve timesheet" cancelLabel="Keep pending" onConfirm={(c) => act('Approve', c || undefined)} />
      <ConfirmDialog open={dialog === 'reject'} onClose={() => setDialog(null)} title="Reject timesheet?" statement="The employee is notified and can correct and resubmit." reasonRequired danger confirmLabel="Reject timesheet" cancelLabel="Keep pending" onConfirm={(c) => act('Reject', c)} />
      <ConfirmDialog open={dialog === 'return'} onClose={() => setDialog(null)} title="Return for changes?" statement="The timesheet goes back to the employee as a draft with your comment." reasonRequired confirmLabel="Return timesheet" cancelLabel="Keep pending" onConfirm={(c) => act('Return', c)} />
      <ConfirmDialog open={dialog === 'recall'} onClose={() => setDialog(null)} title="Recall submission?" statement="The timesheet returns to draft; the approval request closes as Recalled." reasonRequired confirmLabel="Recall" cancelLabel="Keep submitted" onConfirm={(c) => act('Recall', c)} />
      <ConfirmDialog open={dialog === 'delete'} onClose={() => setDialog(null)} title="Delete this draft?" statement="This cannot be undone." danger confirmLabel="Delete draft" cancelLabel="Keep draft" onConfirm={() => { deleteDraftTimesheet(existing!.id); toast.success('Draft deleted'); nav.go('projects/timesheets'); }} />
      <ImportWizard open={importOpen} onClose={() => setImportOpen(false)} entity="Timesheet rows" fields={[{ key: 'project', label: 'Project code', required: true, validate: (v) => (db.findBy<Project>(C.projects, (p) => p.code === v) ? null : `Unknown project ${v}`) }, { key: 'task', label: 'Task' }, { key: 'date', label: 'Date', required: true, type: 'date', validate: (v) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? null : 'Use yyyy-mm-dd') }, { key: 'hours', label: 'Hours', required: true, type: 'number' }, { key: 'billable', label: 'Billable (Y/N)' }]}
        sampleRows={[{ 'Project code': 'PRJ-051', Task: 'Workshops', Date: t.weekStart, Hours: '8', 'Billable (Y/N)': 'Y' }, { 'Project code': 'PRJ-051', Task: 'Workshops', Date: addDays(t.weekStart, 1), Hours: '6', 'Billable (Y/N)': 'Y' }]}
        onCommit={(rows) => {
          const week = weekStartOf(rows[0]?.date ?? t.weekStart);
          const dayIdx = (d: string) => Math.round((new Date(d).getTime() - new Date(week).getTime()) / 86400000);
          const map = new Map<string, TimesheetRow>();
          let skipped = 0;
          rows.forEach((r) => {
            const p = db.findBy<Project>(C.projects, (x) => x.code === r.project);
            const i = dayIdx(r.date);
            if (!p || i < 0 || i > 6) { skipped++; return; }
            const key = `${p.id}|${r.task}`;
            const row = map.get(key) ?? newTimesheetRow({ projectId: p.id, task: r.task, billable: !/^n/i.test(r.billable ?? 'Y') });
            row.hours[i] = round(row.hours[i] + Number(r.hours), 2);
            map.set(key, row);
          });
          setT({ ...t, weekStart: week, rows: Array.from(map.values()), source: 'Import' });
          if (skipped) toast.error(`${skipped} row(s) outside the week of ${fmtDate(week)} were skipped`);
          return rows.length - skipped;
        }} />
    </div>
  );
}
