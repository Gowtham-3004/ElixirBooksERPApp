// Journal document page (FR-ACC-015/016): rail + Lines / Approvals / Activity tabs, state-driven footer.
import { useState } from 'react';
import { db, C, engine, nav, useCollection, useRecord, useSession } from '../../store';
import { AlertTriangleIcon, CheckCircleIcon } from '../../components/Icons';
import type { ApprovalRequest, Branch, Journal } from '../../store';
import { ActivityTab, ApprovalsTab, AttachmentsPanel, Badge, Button, ConfirmDialog, DimChip, DocumentPage, EmptyState, Modal, RailSection, ReasonField, useToast } from '../../components/ui';
import { fmtDate, fmtDateTime, fmtMoney, fmtPeriod } from '../../lib/format';
import { journalLink, sourceLink } from './lib';

export function JournalPage({ id }: { id: string }) {
  const s = useSession();
  const toast = useToast();
  const j = useRecord<Journal>(C.journals, id);
  const branches = useCollection<Branch>(C.branches);
  const approvals = useCollection<ApprovalRequest>(C.approvals);
  const [reverse, setReverse] = useState(false);
  const [post, setPost] = useState(false);
  const [del, setDel] = useState(false);
  const [submit, setSubmit] = useState(false);
  const [decide, setDecide] = useState<'Approve' | 'Reject' | 'Return' | null>(null);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  if (!j) return <EmptyState icon="🧭" title="Journal not found" action={<Button variant="primary" onClick={() => nav.go('accounting/journals')}>Back to journals</Button>} />;
  const branch = branches.find((b) => b.id === j.branchId);
  const canPost = s.can('accounting.journal.post');
  const canEdit = s.can('accounting.journal.edit') || s.can('accounting.journal.create');
  const canSubmit = s.can('accounting.journal.submit') || canEdit;
  const period = engine.postingCheck(j.date);
  const req = approvals.find((a) => a.id === j.approvalId) ?? [...approvals].reverse().find((a) => a.docId === j.id);
  const canAct = req && req.status === 'Pending' ? engine.canActOnApproval(req) : { ok: false, reason: 'No pending request' };
  const workflow = engine.resolveWorkflow('Journal', { amount: j.totalDr, branchId: j.branchId });
  const reversal = db.find<Journal>(C.journals, j.reversedById);
  const original = db.find<Journal>(C.journals, j.reversalOfId);
  const src = sourceLink(j);
  const run = async (fn: () => void, ok: string) => { if (busy) return; setBusy(true); try { fn(); toast.success(ok); } catch (e: any) { toast.error(e?.message ?? 'Action failed'); } finally { setBusy(false); } };

  const lines = (
    <div>
      <div className="card" style={{ overflow: 'auto' }}>
        <table className="data-table dense">
          <thead><tr><th>#</th><th>Account</th><th>Party</th><th>Dimensions</th><th>Narration</th>{j.currency !== s.currency && <><th className="right">Dr ({j.currency})</th><th className="right">Cr ({j.currency})</th></>}<th className="right">Dr ({s.currency})</th><th className="right">Cr ({s.currency})</th></tr></thead>
          <tbody>
            {j.lines.map((l, i) => (
              <tr key={l.id}>
                <td style={{ color: 'var(--ink-3)' }}>{i + 1}</td>
                <td><span className="identifier link" style={{ fontWeight: 500 }} onClick={() => nav.go(`accounting/ledger?account=${l.accountId}`)}>{l.accountCode}</span> · {l.accountName}</td>
                <td>{l.partyName ? <span className="link" onClick={() => nav.go(l.partyType === 'Customer' ? `masters/customers/${l.partyId}` : l.partyType === 'Supplier' ? `masters/suppliers/${l.partyId}` : `masters/employees/${l.partyId}`)}>{l.partyName}</span> : '—'}</td>
                <td><span style={{ display: 'inline-flex', gap: 4, flexWrap: 'wrap' }}>{Object.entries(l.dimensions ?? {}).filter(([k]) => k !== 'Branch').map(([k, v]) => { const d = db.find<any>(C.dimensions, v); return <DimChip key={k} label={d ? `${d.code}` : v} color={d?.color} />; })}{!Object.keys(l.dimensions ?? {}).filter((k) => k !== 'Branch').length && '—'}</span></td>
                <td style={{ color: 'var(--ink-2)', maxWidth: 260 }}>{l.narration ?? '—'}</td>
                {j.currency !== s.currency && <><td className="right money">{l.dr ? fmtMoney(l.dr, j.currency, { code: true }) : '—'}</td><td className="right money">{l.cr ? fmtMoney(l.cr, j.currency, { code: true }) : '—'}</td></>}
                <td className="right money">{l.drBase ? fmtMoney(l.drBase, s.currency) : '—'}</td>
                <td className="right money">{l.crBase ? fmtMoney(l.crBase, s.currency) : '—'}</td>
              </tr>
            ))}
          </tbody>
          <tfoot><tr><td colSpan={j.currency !== s.currency ? 7 : 5}>Totals · {j.lines.length} lines</td><td className="right money">{fmtMoney(j.totalDr, s.currency)}</td><td className="right money">{fmtMoney(j.totalCr, s.currency)}</td></tr></tfoot>
        </table>
      </div>
      <div style={{ marginTop: 10, fontSize: 12, display: 'flex', alignItems: 'center', gap: 6, color: Math.abs(j.totalDr - j.totalCr) < 0.01 ? 'var(--good)' : 'var(--danger)' }}>{Math.abs(j.totalDr - j.totalCr) < 0.01 ? <CheckCircleIcon size={13} /> : <AlertTriangleIcon size={13} />}<span>{Math.abs(j.totalDr - j.totalCr) < 0.01 ? `Balanced in ${s.currency}` : 'Unbalanced'}{j.currency !== s.currency ? ` · ${j.currency} @ ${j.rate}` : ''}{j.idempotencyKey ? ` · idempotency key ${j.idempotencyKey}` : ''}</span></div>
      <div style={{ marginTop: 18 }}><div className="section-title">Attachments</div><AttachmentsPanel objectType="Journal" objectId={j.id} readOnly={j.status !== 'Draft'} /></div>
    </div>
  );

  const footer = (
    <>
      {j.status === 'Draft' && <>
        <Button variant="danger" onClick={() => setDel(true)} disabled={!canEdit}>Delete draft</Button>
        <Button variant="secondary" onClick={() => nav.go(`accounting/journals/${j.id}?edit=1`)} disabled={!canEdit} reason={canEdit ? undefined : 'Requires journal edit permission'}>Edit</Button>
        {workflow ? <Button variant="primary" onClick={() => setSubmit(true)} disabled={!canSubmit} reason={canSubmit ? undefined : 'Requires submit permission'}>Submit for approval</Button> : <Button variant="primary" onClick={() => setPost(true)} disabled={!canPost || !period.ok} reason={!canPost ? 'Requires post permission' : !period.ok ? period.reason : undefined}>Post journal</Button>}
      </>}
      {j.status === 'Submitted' && <>
        {canAct.ok ? <>
          <Button variant="secondary" onClick={() => { setDecide('Return'); setComment(''); }}>Return for changes</Button>
          <Button variant="danger" onClick={() => { setDecide('Reject'); setComment(''); }}>Reject</Button>
          <Button variant="primary" onClick={() => { setDecide('Approve'); setComment(''); }}>Approve</Button>
        </> : <>
          <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{canAct.reason ?? 'Awaiting approval'}</span>
          {req?.requesterId === s.user?.id && <Button variant="secondary" onClick={() => run(() => engine.actOnApproval(req!.id, 'Recall', { comment: 'Recalled by requester' }), 'Recalled to draft')}>Recall</Button>}
        </>}
      </>}
      {(j.status === 'Returned' as string || j.status === 'Rejected') && <Button variant="secondary" onClick={() => nav.go(`accounting/journals/${j.id}?edit=1`)} disabled={!canEdit}>Edit and resubmit</Button>}
      {j.status === 'Approved' && <Button variant="primary" onClick={() => setPost(true)} disabled={!canPost || !period.ok} reason={!canPost ? 'Requires post permission' : !period.ok ? period.reason : undefined}>Post journal</Button>}
      {j.status === 'Posted' && <>
        <Button variant="secondary" onClick={() => nav.go(`accounting/journals/new?from=${j.id}`)} disabled={!canEdit}>Duplicate</Button>
        <Button variant="danger" onClick={() => setReverse(true)} disabled={!canPost || !period.ok} reason={!canPost ? 'Requires post permission' : !period.ok ? period.reason : undefined}>Reverse</Button>
      </>}
      {j.status === 'Reversed' && reversal && <Button variant="secondary" onClick={() => nav.go(journalLink(reversal.id))}>View reversal {reversal.number}</Button>}
    </>
  );

  return (
    <>
      <DocumentPage backLabel="Journals" onBack={() => nav.go('accounting/journals')} number={j.number}
        badges={<><Badge status={j.status} /><Badge status="Draft">{j.type}</Badge>{j.currency !== s.currency && <span className="currency-tag">{j.currency} @ {j.rate}</span>}</>}
        amount={{ label: 'Total (Dr = Cr)', value: j.totalDr, currency: s.currency }}
        banner={j.status === 'Reversed' && reversal ? <div className="banner warning full">Reversed by <span className="link identifier" onClick={() => nav.go(journalLink(reversal.id))}>{reversal.number}</span> on {fmtDate(reversal.date)} — {j.reversalReason}</div> : j.type === 'Reversal' && original ? <div className="banner info full">Reversal of <span className="link identifier" onClick={() => nav.go(journalLink(original.id))}>{original.number}</span> · {j.reversalReason}</div> : !period.ok && j.status !== 'Posted' && j.status !== 'Reversed' ? <div className="banner warning full">{period.reason}</div> : undefined}
        rail={<>
          <RailSection label="Details">
            <div className="kv" style={{ gridTemplateColumns: '90px 1fr', fontSize: 12 }}>
              <span className="k">Date</span><span className="v">{fmtDate(j.date)}</span>
              <span className="k">Period</span><span className="v">{fmtPeriod(j.period)} · {j.fy}</span>
              <span className="k">Branch</span><span className="v">{branch?.name ?? '—'}</span>
              <span className="k">Source</span><span className="v">{src ? <span className="link" onClick={() => nav.go(src)}>{j.sourceType} {j.sourceNumber ?? ''}</span> : <>{j.sourceType}{j.sourceNumber ? ` ${j.sourceNumber}` : ''}</>}</span>
              <span className="k">Created</span><span className="v">{j.createdBy} · {fmtDateTime(j.createdAt)}</span>
              {j.postedAt && <><span className="k">Posted</span><span className="v">{j.postedBy} · {fmtDateTime(j.postedAt)}</span></>}
              {j.recurringId && <><span className="k">Recurring</span><span className="v link" onClick={() => nav.go('accounting/recurring')}>Generated from definition</span></>}
            </div>
          </RailSection>
          <RailSection label="Narration"><div style={{ fontSize: 13, color: 'var(--ink-2)' }}>{j.narration}</div></RailSection>
          {req && <RailSection label="Approval"><div style={{ fontSize: 12 }}><Badge status={req.status === 'Pending' ? 'Submitted' : req.status} /> {req.ruleName} · step {req.currentStep}/{req.steps.length}</div></RailSection>}
        </>}
        tabs={[{ id: 'lines', label: 'Lines', content: lines }, { id: 'approvals', label: 'Approvals', content: <ApprovalsTab approvalId={j.approvalId} docId={j.id} /> }, { id: 'activity', label: 'Activity', content: <ActivityTab objectId={j.id} correlationId={j.correlationId} /> }]}
        footer={footer}
      />
      <ConfirmDialog open={post} onClose={() => setPost(false)} title={`Post journal ${j.number}?`} statement="Posting is irreversible — a number is allocated and the ledger is updated. Use Reverse to undo." confirmLabel="Post journal" cancelLabel="Keep as draft"
        consequences={[{ engine: 'Journal', text: `${j.lines.length} lines · Dr ${fmtMoney(j.totalDr, s.currency)} / Cr ${fmtMoney(j.totalCr, s.currency)} in ${fmtPeriod(j.period)}` }, { engine: 'Numbering', text: `Next number ${engine.previewNumber('Journal', { date: j.date, branchId: j.branchId })} is allocated` }, ...(j.lines.some((l) => l.partyId) ? [{ engine: 'Open items', text: 'Party balances on control accounts change; no open item is created by a manual journal', tone: 'warning' as const }] : [])]}
        onConfirm={() => { engine.postDraftJournal(j.id); toast.success(`${j.number} posted`); }} />
      <ConfirmDialog open={reverse} onClose={() => setReverse(false)} title={`Reverse journal ${j.number}?`} statement="This creates a linked reversal journal dated today and cannot be undone. The original stays in the ledger." danger reasonRequired confirmLabel="Reverse journal" cancelLabel="Keep journal"
        consequences={[{ engine: 'Journal', text: `Opposite entries for ${j.lines.length} lines · Dr ${fmtMoney(j.totalCr, s.currency)} / Cr ${fmtMoney(j.totalDr, s.currency)}` }, { engine: 'Numbering', text: 'Next journal number is allocated to the reversal' }, ...(j.sourceId ? [{ engine: 'Open items', text: `Source ${j.sourceType} ${j.sourceNumber ?? ''} keeps its link — settle or cancel it separately`, tone: 'warning' as const }] : [])]}
        onConfirm={(reason) => { const rev = engine.reverseJournal(j.id, { reason }); toast.success(`${j.number} reversed by ${rev.number}`); nav.go(journalLink(rev.id)); }} />
      <ConfirmDialog open={submit} onClose={() => setSubmit(false)} title={`Submit ${j.number} for approval?`} statement="Fields are frozen while the journal is with the approver. You can recall it before a decision." confirmLabel="Submit for approval" cancelLabel="Keep as draft"
        consequences={[{ engine: 'Workflow', text: `${workflow?.name ?? 'Journal approval'} · ${workflow?.steps.map((st) => st.approverLabel).join(' → ')}` }, { engine: 'Notification', text: 'Approver is notified; you are notified on decision' }]}
        onConfirm={() => { const r = engine.submitForApproval({ docType: 'Journal', collection: C.journals, docId: j.id, docNumber: j.number, amount: j.totalDr, branchId: j.branchId, summary: j.narration }); if (!r) { engine.postDraftJournal(j.id); toast.success('No workflow applies — journal posted'); } else toast.success('Submitted for approval'); }} />
      <ConfirmDialog open={del} onClose={() => setDel(false)} title={`Delete draft ${j.number}?`} statement="Drafts are the only journals that can be deleted. This is recorded in the audit trail." danger reasonRequired confirmLabel="Delete draft" cancelLabel="Keep draft"
        onConfirm={(reason) => { engine.audit({ action: 'journal.deleted', objectType: 'Journal', objectId: j.id, objectNumber: j.number, detail: reason, before: { narration: j.narration, totalDr: j.totalDr } }); db.remove(C.journals, j.id); toast.success('Draft deleted'); nav.go('accounting/journals'); }} />
      <Modal open={!!decide} onClose={() => setDecide(null)} title={`${decide} journal ${j.number}`} description={req ? `${req.ruleName} · step ${req.currentStep}: ${req.steps.find((st) => st.order === req.currentStep)?.name}` : undefined}
        footer={<><Button variant="secondary" onClick={() => setDecide(null)}>Keep pending</Button><Button variant={decide === 'Reject' ? 'danger' : 'primary'} loading={busy} onClick={() => run(() => { engine.actOnApproval(req!.id, decide!, { comment }); setDecide(null); }, decide === 'Approve' ? 'Approved — ready to post' : `${decide}ed`)}>{decide === 'Approve' ? 'Approve journal' : decide === 'Reject' ? 'Reject journal' : 'Return for changes'}</Button></>}>
        <ReasonField label={req?.steps.find((st) => st.order === req.currentStep)?.commentRequired || decide !== 'Approve' ? 'Comment (required)' : 'Comment'} value={comment} onChange={setComment} minLength={req?.steps.find((st) => st.order === req.currentStep)?.commentRequired || decide !== 'Approve' ? 10 : 0} placeholder="Recorded on the approval step" />
      </Modal>
    </>
  );
}
