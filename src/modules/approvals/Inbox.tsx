// Approvals inbox (FR-WFL-004..008, design §6.10): register of pending requests with inline actions,
// row drawer (summary · steps · comments), delegate / recall, bulk approve and escalation indicators.
import { useEffect, useMemo, useState } from 'react';
import { db, C, engine, nav, useCollection, useSession } from '../../store';
import type { ApprovalRequest, Branch } from '../../store';
import { fmtDate, fmtDateTime, fmtMoney } from '../../lib/format';
import { RegisterPage, Badge, Button, Pill, Identifier, TwoLine, Money, Drawer, ConfirmDialog, Modal, EntityPicker, useUserOptions, TextArea, ApprovalsTab, KV, useToast, ChipGroup, Banner } from '../../components/ui';
import type { Column, MenuAction } from '../../components/ui';
import { ageing, applyPostApproval, consequencesFor, currentStep, docPath, escalation, TYPE_ICON } from './shared';

type Act = 'Approve' | 'Reject' | 'Return';

export default function Inbox({ openId }: { openId?: string }) {
  const s = useSession();
  const toast = useToast();
  const all = useCollection<ApprovalRequest>(C.approvals);
  const branches = useCollection<Branch>(C.branches);
  const users = useUserOptions();
  const me = s.user?.id;
  const rows = useMemo(() => all.filter((a) => a.companyId === s.state.companyId || !a.companyId).sort((a, b) => b.submittedAt.localeCompare(a.submittedAt)), [all, s.state.companyId]);
  const [typeFilter, setTypeFilter] = useState<string[]>([]);
  const [open, setOpen] = useState<string | undefined>(openId);
  const [act, setAct] = useState<{ ids: string[]; action: Act } | null>(null);
  const [delegate, setDelegate] = useState<{ id: string; to?: string; comment: string } | null>(null);
  const [recall, setRecall] = useState<string | null>(null);
  useEffect(() => { if (openId) setOpen(openId); }, [openId]);

  const canAct = (r: ApprovalRequest) => engine.canActOnApproval(r);
  const types = Array.from(new Set(rows.map((r) => r.docType)));
  const filtered = typeFilter.length ? rows.filter((r) => typeFilter.includes(r.docType)) : rows;
  const branchName = (id: string) => branches.find((b) => b.id === id)?.name ?? 'All branches';

  const run = (ids: string[], action: Act, comment: string) => {
    let done = 0;
    db.transaction(() => {
      ids.forEach((id) => {
        const req = db.find<ApprovalRequest>(C.approvals, id);
        if (!req) return;
        const out = engine.actOnApproval(id, action, { comment });
        applyPostApproval(out);
        done++;
      });
    });
    toast.success(`${done} request${done === 1 ? '' : 's'} ${action === 'Approve' ? 'approved' : action === 'Reject' ? 'rejected' : 'returned'}`);
    setAct(null);
    if (ids.length === 1 && open === ids[0] && action !== 'Approve') setOpen(undefined);
  };

  const actions = (r: ApprovalRequest, size: 'sm' | undefined = 'sm') => {
    const chk = canAct(r);
    const reason = chk.ok ? undefined : chk.reason;
    return (
      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
        <Button size={size} variant="tinted" tone="danger" disabled={!chk.ok} reason={reason} onClick={() => setAct({ ids: [r.id], action: 'Reject' })}>Reject</Button>
        <Button size={size} variant="secondary" disabled={!chk.ok} reason={reason} onClick={() => setAct({ ids: [r.id], action: 'Return' })}>Return</Button>
        <Button size={size} variant="primary" tone="good" disabled={!chk.ok} reason={reason} onClick={() => setAct({ ids: [r.id], action: 'Approve' })}>Approve</Button>
      </div>
    );
  };

  const rowActions = (r: ApprovalRequest): MenuAction[] => {
    const chk = canAct(r);
    const step = currentStep(r);
    const isRequester = r.requesterId === me;
    return [
      { label: 'Open document', onClick: () => nav.go(docPath(r)) },
      { label: 'View details', onClick: () => setOpen(r.id) },
      { label: 'Delegate…', onClick: () => setDelegate({ id: r.id, comment: '' }), disabled: !chk.ok || step?.approverType === 'User' && false, reason: chk.ok ? undefined : chk.reason, separator: true },
      { label: 'Recall request', onClick: () => setRecall(r.id), disabled: r.status !== 'Pending' || (!isRequester && !s.isTenantOwner), reason: r.status !== 'Pending' ? `Request is ${r.status.toLowerCase()}` : !isRequester && !s.isTenantOwner ? 'Only the requester can recall' : undefined, danger: true },
    ];
  };

  const columns: Column<ApprovalRequest>[] = [
    { key: 'docNumber', label: 'Document', sortable: true, render: (r) => (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--surface-3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0 }}>{TYPE_ICON[r.docType] ?? '📄'}</div>
        <TwoLine primary={<Identifier link onClick={(e) => { e.stopPropagation(); nav.go(docPath(r)); }}>{r.docNumber}</Identifier>} secondary={`${r.docType} · ${r.requesterName}`} />
      </div>
    ) },
    { key: 'step', label: 'Awaiting', render: (r) => { const st = currentStep(r); const esc = escalation(r); return r.status === 'Pending' ? <TwoLine primary={st?.approverLabel ?? '—'} secondary={esc ? <span style={{ color: 'var(--danger)' }}>Escalated to {esc.toRole} · after {esc.afterHours} h</span> : `Step ${r.currentStep} of ${r.steps.length}`} /> : <Badge status={r.status} />; } },
    { key: 'amount', label: 'Amount', align: 'right', sortable: true, value: (r) => r.amount, render: (r) => <Money value={r.amount} currency={r.currency} code={r.currency !== s.currency} />, total: (rs) => <Money value={rs.reduce((a, r) => a + r.amount, 0)} currency={s.currency} /> },
    { key: 'branchId', label: 'Branch', render: (r) => <span style={{ color: 'var(--ink-3)' }}>{branchName(r.branchId)}</span> },
    { key: 'submittedAt', label: 'Submitted', sortable: true, render: (r) => <span style={{ color: 'var(--ink-3)' }}>{fmtDate(r.submittedAt)}</span> },
    { key: 'age', label: 'Ageing', value: (r) => ageing(r).days, sortable: true, render: (r) => { const a = ageing(r); const esc = escalation(r); return r.status === 'Pending' ? <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><Pill tone={a.tone} title={a.overdue ? `SLA breached by ${a.hoursOver} h` : `Due ${fmtDateTime(currentStep(r)?.dueAt)}`}>{a.label}</Pill>{esc && <Badge status="Escalated" />}</span> : <span style={{ color: 'var(--ink-3)', fontSize: 12 }}>{fmtDate(r.completedAt)}</span>; } },
    { key: 'actions', label: '', render: (r) => (r.status === 'Pending' ? actions(r) : <Button size="sm" variant="ghost" onClick={() => setOpen(r.id)}>View</Button>) },
  ];

  const openReq = open ? all.find((a) => a.id === open) : undefined;
  const actReqs = act ? act.ids.map((id) => all.find((a) => a.id === id)).filter(Boolean) as ApprovalRequest[] : [];
  const needsComment = actReqs.some((r) => currentStep(r)?.commentRequired) || (act?.action !== 'Approve');
  const awaitingCount = rows.filter((r) => r.status === 'Pending' && canAct(r).ok).length;

  return (
    <>
      <RegisterPage<ApprovalRequest>
        title="Approvals inbox"
        subtitle={`${awaitingCount} pending for you · ${s.branch?.name ?? 'All branches'} · FY ${s.state.fy}`}
        rows={filtered}
        entity="approval requests"
        columns={columns}
        searchKeys={['docNumber', 'docType', 'requesterName', 'summary']}
        tabs={[
          { id: 'mine', label: 'Awaiting me', filter: (r) => r.status === 'Pending' && canAct(r).ok },
          { id: 'requests', label: 'My requests', filter: (r) => r.requesterId === me },
          { id: 'all', label: 'All pending', filter: (r) => r.status === 'Pending' },
          { id: 'done', label: 'Completed', filter: (r) => r.status !== 'Pending' },
        ]}
        headerExtra={<ChipGroup multiple value={typeFilter} onChange={setTypeFilter} options={types.map((t) => ({ value: t, label: `${TYPE_ICON[t] ?? ''} ${t}` }))} />}
        onRowClick={(r) => setOpen(r.id)}
        rowActions={rowActions}
        bulkActions={(ids, selectedRows) => {
          const allOk = selectedRows.length > 0 && selectedRows.every((r) => r.status === 'Pending' && canAct(r).ok);
          const bad = selectedRows.find((r) => r.status !== 'Pending' || !canAct(r).ok);
          return [{ label: `Approve ${ids.size} selected`, onClick: () => setAct({ ids: Array.from(ids), action: 'Approve' }), disabled: !allOk, reason: allOk ? undefined : bad ? `${bad.docNumber}: ${bad.status !== 'Pending' ? bad.status.toLowerCase() : canAct(bad).reason}` : 'Select rows' }];
        }}
        emptyTitle="Nothing to approve"
        emptyDescription="You are all caught up — requests routed to your role or to you directly appear here."
        emptyIllustration="all-done"
        emptyAnimated
      />

      {/* Row detail drawer */}
      <Drawer open={!!openReq} onClose={() => setOpen(undefined)} title={openReq ? `${openReq.docType} ${openReq.docNumber}` : ''} subtitle={openReq ? `${openReq.ruleName} v${openReq.ruleVersion} · requested by ${openReq.requesterName} · ${fmtDateTime(openReq.submittedAt)}` : ''} width={680}
        headerRight={openReq && <Badge status={openReq.status === 'Pending' ? 'Submitted' : openReq.status}>{openReq.status}</Badge>}
        footer={openReq && openReq.status === 'Pending' ? (
          <>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button variant="ghost" onClick={() => nav.go(docPath(openReq))}>Open document</Button>
              {canAct(openReq).ok && <Button variant="ghost" onClick={() => setDelegate({ id: openReq.id, comment: '' })}>Delegate…</Button>}
              {(openReq.requesterId === me || s.isTenantOwner) && <Button variant="ghost" onClick={() => setRecall(openReq.id)}>Recall</Button>}
            </div>
            {actions(openReq, undefined)}
          </>
        ) : openReq ? <><span /><Button variant="secondary" onClick={() => nav.go(docPath(openReq))}>Open document</Button></> : undefined}
      >
        {openReq && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {!canAct(openReq).ok && openReq.status === 'Pending' && <Banner tone="info">{canAct(openReq).reason}</Banner>}
            {escalation(openReq) && <Banner tone="warning">SLA breached by {ageing(openReq).hoursOver} h — escalated to {escalation(openReq)!.toRole} (after {escalation(openReq)!.afterHours} h). Reminders were sent to the assigned approver.</Banner>}
            <div className="card" style={{ padding: 14, background: 'var(--surface-2)' }}>
              <KV columns={2} items={[
                { k: 'Amount', v: <Money value={openReq.amount} currency={openReq.currency} code /> },
                { k: 'Branch', v: branchName(openReq.branchId) },
                { k: 'Requester', v: openReq.requesterName },
                { k: 'Ageing', v: <Pill tone={ageing(openReq).tone}>{ageing(openReq).label}</Pill> },
                { k: 'Summary', v: openReq.summary ?? '—' },
                { k: 'Document', v: <Identifier link onClick={() => nav.go(docPath(openReq))}>{openReq.docNumber}</Identifier> },
              ]} />
            </div>
            <ApprovalsTab approvalId={openReq.id} />
          </div>
        )}
      </Drawer>

      {/* Approve / reject / return confirmation */}
      <ConfirmDialog
        open={!!act && actReqs.length > 0}
        onClose={() => setAct(null)}
        title={act && actReqs.length === 1 ? `${act.action} ${actReqs[0].docType} ${actReqs[0].docNumber}?` : `${act?.action} ${actReqs.length} requests?`}
        statement={act?.action === 'Approve' ? (actReqs.length === 1 ? `Approving ${fmtMoney(actReqs[0].amount, actReqs[0].currency)} · step ${actReqs[0].currentStep} of ${actReqs[0].steps.length}. Approval history is immutable.` : `Approving ${fmtMoney(actReqs.reduce((a, r) => a + r.amount, 0), s.currency)} across ${actReqs.length} requests. The same comment is recorded on each.`) : act?.action === 'Reject' ? 'The request is closed and the document returns to Draft for the requester.' : 'The requester can edit the document and resubmit; material changes restart the workflow.'}
        consequences={actReqs.length === 1 && act ? consequencesFor(actReqs[0], act.action) : act ? [{ engine: 'Workflow', text: `${actReqs.length} requests advance or complete their workflow` }, { engine: 'Notification', text: 'Each requester is notified' }] : []}
        reasonRequired={needsComment}
        confirmLabel={act ? `${act.action} ${actReqs.length === 1 ? actReqs[0].docType.toLowerCase() : 'requests'}` : ''}
        cancelLabel="Keep pending"
        danger={act?.action !== 'Approve'}
        onConfirm={(reason) => { if (act) run(act.ids, act.action, reason); }}
      />

      {/* Delegate */}
      <Modal open={!!delegate} onClose={() => setDelegate(null)} title="Delegate this approval" description="The delegate acts on the current step in your place; the delegation is recorded in the approval history." width={480}
        footer={<><Button variant="secondary" onClick={() => setDelegate(null)}>Keep with me</Button><Button variant="primary" disabled={!delegate?.to} onClick={() => {
          if (!delegate?.to) return;
          try { const out = engine.actOnApproval(delegate.id, 'Delegate', { delegateToUserId: delegate.to, comment: delegate.comment }); applyPostApproval(out); toast.success('Delegated'); setDelegate(null); } catch (e: any) { toast.error(e.message); }
        }}>Delegate approval</Button></>}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <EntityPicker label="Delegate to" required value={delegate?.to} onChange={(id) => setDelegate((d) => (d ? { ...d, to: id } : d))} options={users.filter((u) => u.id !== me)} placeholder="Search users…" />
          <TextArea label="Note (optional)" value={delegate?.comment ?? ''} onChange={(v) => setDelegate((d) => (d ? { ...d, comment: v } : d))} rows={2} />
        </div>
      </Modal>

      {/* Recall */}
      <ConfirmDialog open={!!recall} onClose={() => setRecall(null)} title={`Recall ${all.find((a) => a.id === recall)?.docNumber ?? 'request'}?`} statement="The document returns to Draft and the approval request is closed as Recalled." consequences={[{ engine: 'Workflow', text: 'Pending approvers are released; a fresh submission starts a new request', tone: 'warning' }]} reasonRequired confirmLabel="Recall request" cancelLabel="Keep pending" danger onConfirm={(reason) => { if (!recall) return; engine.actOnApproval(recall, 'Recall', { comment: reason }); toast.success('Request recalled'); setRecall(null); setOpen(undefined); }} />
    </>
  );
}
