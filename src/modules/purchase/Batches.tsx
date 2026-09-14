// Payment batches (FR-PMT-002/003): register + lifecycle page (maker-checker, bank file, UTR results, completion).
import { useState } from 'react';
import { db, C, engine, nav, useCollection, useRecord, useSession } from '../../store';
import type { ApprovalRequest, OpenItem } from '../../store';
import { RegisterPage, Button, Badge, TwoLine, useToast, EmptyState, Banner, KV, SummaryBlock, ApprovalsTab, ActivityTab, Tabs, NumberField, TextField, MaskedValue, ActionMenu, Money } from '../../components/ui';
import { fmtDate, fmtDateTime, fmtMoney } from '../../lib/format';
import type { PaymentBatch, PaymentBatchLine } from './types';
import * as A from './actions';
import { useConfirm, DocLink, SupplierLink } from './shared';

const STEPS: PaymentBatch['status'][] = ['Created', 'Submitted', 'Approved', 'Sent to bank', 'Accepted', 'Completed'];

export function BatchRegister() {
  const rows = useCollection<PaymentBatch>(C.paymentBatches);
  const s = useSession();
  const mine = rows.filter((r) => r.companyId === s.state.companyId).sort((a, b) => b.number.localeCompare(a.number));
  return (
    <RegisterPage<PaymentBatch> title="Payment batches" subtitle={`${mine.length} batches · maker-checker · ${s.company?.tradeName}`} entity="payment batches" rows={mine} searchKeys={['number', 'makerName', 'bankAccountName']}
      columns={[
        { key: 'number', label: 'Batch', sortable: true, render: (r) => <TwoLine primary={<span className="identifier link">{r.number}</span>} secondary={`${r.bankAccountName} · ${r.method}`} /> },
        { key: 'date', label: 'Date', sortable: true, render: (r) => fmtDate(r.date) },
        { key: 'lines', label: 'Suppliers', align: 'right', value: (r) => r.lines.length, render: (r) => r.lines.length },
        { key: 'total', label: 'Total', align: 'right', sortable: true, value: (r) => r.total, render: (r) => <Money value={r.total} currency={r.currency} style={{ fontWeight: 600 }} />, total: (rs) => fmtMoney(rs.reduce((x, r) => x + r.total, 0)) },
        { key: 'makerName', label: 'Maker', render: (r) => r.makerName },
        { key: 'checkerName', label: 'Checker', render: (r) => r.checkerName ?? '—' },
        { key: 'results', label: 'Results', render: (r) => { const a = r.lines.filter((l) => l.status === 'Accepted' || l.status === 'Completed').length; const f = r.lines.filter((l) => l.status === 'Failed').length; return <span style={{ fontSize: 12 }}>{a ? <span style={{ color: 'var(--good)' }}>{a} ok</span> : null}{a && f ? ' · ' : ''}{f ? <span style={{ color: 'var(--danger)' }}>{f} failed</span> : null}{!a && !f ? '—' : ''}</span>; } },
        { key: 'status', label: 'Status', sortable: true, render: (r) => <Badge status={r.status === 'Submitted' ? 'Pending Approval' : r.status}>{r.status === 'Submitted' ? 'Awaiting approval' : r.status}</Badge> },
      ]}
      tabs={[{ id: 'all', label: 'All' }, { id: 'open', label: 'In progress', filter: (r) => !['Completed', 'Cancelled', 'Rejected', 'Reversed', 'Failed', 'Partially Completed'].includes(r.status) }, { id: 'approval', label: 'Awaiting approval', filter: (r) => r.status === 'Submitted' }, { id: 'done', label: 'Completed', filter: (r) => r.status === 'Completed' || r.status === 'Partially Completed' }, { id: 'failed', label: 'Failed / reversed', filter: (r) => ['Failed', 'Reversed', 'Cancelled', 'Rejected'].includes(r.status) }]}
      primaryAction={{ label: 'Create payment proposal', onClick: () => nav.go('purchase/ageing') }} onRowClick={(r) => nav.go(`purchase/batches/${r.id}`)} rowActions={(r) => [{ label: 'Open', onClick: () => nav.go(`purchase/batches/${r.id}`) }]} />
  );
}

export function BatchDetail({ id }: { id: string }) {
  const b = useRecord<PaymentBatch>(C.paymentBatches, id);
  const approvals = useCollection<ApprovalRequest>(C.approvals);
  const s = useSession();
  const toast = useToast();
  const confirm = useConfirm();
  const [tab, setTab] = useState<'lines' | 'approvals' | 'activity'>('lines');
  const [edits, setEdits] = useState<Record<string, number>>({});
  const [results, setResults] = useState<Record<string, string>>({});
  if (!b) return <EmptyState title="Batch not found" action={<Button onClick={() => nav.go('purchase/batches')}>Back</Button>} />;
  const pending = approvals.find((a) => a.docId === id && a.status === 'Pending');
  const canAct = pending ? engine.canActOnApproval(pending) : { ok: b.status === 'Submitted' && b.makerId !== s.user?.id && (s.can('purchase.batch.approve') || s.can('approvals.act')), reason: b.makerId === s.user?.id ? 'Self-approval is not permitted' : 'Requires Treasury approver' };
  const run = (fn: () => void, msg: string) => { try { fn(); toast.success(msg); } catch (e: any) { toast.error(e.message); } };
  const editable = b.status === 'Created' || b.status === 'Returned';
  const stepIdx = STEPS.indexOf(b.status === 'Failed' || b.status === 'Partially Completed' ? 'Accepted' : b.status);
  const saveLines = () => run(() => { A.updateBatchLines(id, b.lines.map((l) => ({ ...l, amount: edits[l.id] ?? l.amount }))); setEdits({}); }, 'Lines updated');
  const removeLine = (l: PaymentBatchLine) => run(() => A.updateBatchLines(id, b.lines.filter((x) => x.id !== l.id)), `${l.supplierName} removed`);
  return (
    <>
      <div className="page">
        <div className="page-header">
          <div><button type="button" className="btn-link" style={{ color: 'var(--ink-3)' }} onClick={() => nav.go('purchase/batches')}>← Payment batches</button><h1 className="page-title" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>{b.number} <Badge status={b.status === 'Submitted' ? 'Pending Approval' : b.status}>{b.status === 'Submitted' ? 'Awaiting approval' : b.status}</Badge></h1><div className="page-subtitle">{b.bankAccountName} · {b.method} · {fmtDate(b.date)} · maker {b.makerName}{b.checkerName ? ` · checker ${b.checkerName}` : ''}</div></div>
          <div style={{ display: 'flex', gap: 8 }}>
            {editable && Object.keys(edits).length > 0 && <Button onClick={saveLines}>Save line changes</Button>}
            {editable && <Button variant="primary" disabled={!b.lines.length} onClick={() => confirm.open({ title: `Submit ${b.number} for approval?`, statement: `${b.lines.length} supplier(s) · ${fmtMoney(b.total)} from ${b.bankAccountName}`, consequences: [{ engine: 'Workflow', text: 'Treasury approver must approve (self-approval blocked)' }], confirmLabel: 'Submit batch', onConfirm: () => { A.submitBatch(id); toast.success('Submitted for approval'); } })}>Submit for approval</Button>}
            {b.status === 'Submitted' && <><Button variant="tinted" tone="danger" disabled={!canAct.ok} reason={canAct.reason} onClick={() => confirm.open({ title: 'Reject batch?', reasonRequired: true, confirmLabel: 'Reject batch', danger: true, onConfirm: (r) => A.decideBatch(id, 'Reject', r) })}>Reject</Button><Button disabled={!canAct.ok} reason={canAct.reason} onClick={() => confirm.open({ title: 'Return to maker?', reasonRequired: true, confirmLabel: 'Return batch', onConfirm: (r) => A.decideBatch(id, 'Return', r) })}>Return</Button><Button variant="primary" tone="good" disabled={!canAct.ok} reason={canAct.reason} onClick={() => confirm.open({ title: `Approve ${b.number}?`, statement: `${fmtMoney(b.total)} will be released from ${b.bankAccountName} once the bank file is generated and sent.`, consequences: [{ engine: 'Workflow', text: 'Batch becomes Approved; bank file can be generated' }, { engine: 'Notification', text: `${b.makerName} is notified` }], confirmLabel: 'Approve batch', onConfirm: (r) => { A.decideBatch(id, 'Approve', r); toast.success('Batch approved'); } })}>Approve</Button></>}
            {b.status === 'Approved' && <Button variant={b.fileGeneratedAt ? 'secondary' : 'primary'} onClick={() => run(() => A.generateBankFile(id), 'Bank file downloaded (accounts masked)')}>{b.fileGeneratedAt ? 'Re-generate bank file' : 'Generate bank file'}</Button>}
            {b.status === 'Approved' && b.fileGeneratedAt && <Button variant="primary" onClick={() => confirm.open({ title: 'Mark as sent to bank?', statement: `${b.fileName} uploaded to the bank portal`, consequences: [{ engine: 'Statutory', text: 'Integration log entry created; lines await Accepted / Failed with UTR' }], confirmLabel: 'Mark sent to bank', onConfirm: () => A.markBatchSent(id) })}>Mark sent to bank</Button>}
            {['Sent to bank', 'Accepted', 'Failed'].includes(b.status) && <Button variant="primary" disabled={b.lines.some((l) => l.status === 'Pending')} reason={b.lines.some((l) => l.status === 'Pending') ? 'Record a result for every line' : undefined} onClick={() => confirm.open({ title: `Complete ${b.number}?`, statement: `${b.lines.filter((l) => l.status === 'Accepted').length} accepted line(s) become posted payments; ${b.lines.filter((l) => l.status === 'Failed').length} failed line(s) stay open.`, consequences: [{ engine: 'Journal', text: 'One payment journal per accepted line (Dr AP · Cr bank)' }, { engine: 'Open items', text: 'Invoices settled with the batch UTRs' }], confirmLabel: 'Complete batch', onConfirm: () => { const out = A.completeBatch(id); toast.success(`Batch ${out.status.toLowerCase()}`); } })}>Complete batch</Button>}
            <ActionMenu trigger={<Button>More ▾</Button>} actions={[{ label: 'Open AP ageing', onClick: () => nav.go('purchase/ageing') }, { label: 'Cancel batch', danger: true, disabled: ['Completed', 'Partially Completed', 'Sent to bank', 'Cancelled', 'Reversed'].includes(b.status), reason: ['Completed', 'Partially Completed', 'Sent to bank'].includes(b.status) ? `Cannot cancel while ${b.status}` : undefined, onClick: () => confirm.open({ title: `Cancel ${b.number}?`, reasonRequired: true, confirmLabel: 'Cancel batch', cancelLabel: 'Keep batch', danger: true, onConfirm: (r) => A.cancelBatch(id, r) }) }, { label: 'Reverse batch', danger: true, disabled: !['Completed', 'Partially Completed'].includes(b.status), reason: !['Completed', 'Partially Completed'].includes(b.status) ? 'Only completed batches' : undefined, onClick: () => confirm.open({ title: `Reverse all payments in ${b.number}?`, reasonRequired: true, confirmLabel: 'Reverse batch', danger: true, onConfirm: (r) => A.reverseBatch(id, r) }) }]} />
          </div>
        </div>
        <div className="card" style={{ padding: '12px 20px', display: 'flex', gap: 0, alignItems: 'center' }}>
          {STEPS.map((st, i) => <div key={st} style={{ display: 'flex', alignItems: 'center', flex: i < STEPS.length - 1 ? 1 : undefined }}><div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: i <= stepIdx ? 'var(--ink)' : 'var(--ink-5)', fontWeight: i === stepIdx ? 600 : 400 }}><span style={{ width: 20, height: 20, borderRadius: '50%', background: i < stepIdx ? 'var(--good)' : i === stepIdx ? 'var(--accent)' : 'var(--surface-3)', color: i <= stepIdx ? '#fff' : 'var(--ink-3)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 10 }}>{i < stepIdx ? '✓' : i + 1}</span>{st}</div>{i < STEPS.length - 1 && <div style={{ flex: 1, height: 1, background: i < stepIdx ? 'var(--good)' : 'var(--line)', margin: '0 10px' }} />}</div>)}
          {['Rejected', 'Returned', 'Cancelled', 'Reversed', 'Failed', 'Partially Completed'].includes(b.status) && <Badge status={b.status} style={{ marginLeft: 12 }} />}
        </div>
        {b.status === 'Returned' && <Banner tone="warning">Returned by checker: {approvals.filter((a) => a.docId === id).slice(-1)[0]?.history.slice(-1)[0]?.comment ?? '—'}. Edit lines and resubmit.</Banner>}
        {b.status === 'Submitted' && b.makerId === s.user?.id && <Banner tone="info">You are the maker of this batch — a different user with the Treasury approver role must check it (segregation of duties).</Banner>}
        <SummaryBlock items={[{ label: 'Lines', value: b.lines.length }, { label: 'Gross', value: fmtMoney(b.lines.reduce((x, l) => x + l.amount, 0)) }, { label: 'TDS at payment', value: fmtMoney(b.lines.reduce((x, l) => x + l.tds, 0)) }, { label: 'Net outflow', value: fmtMoney(b.lines.reduce((x, l) => x + l.net, 0)), tone: 'warn' }, { label: 'Bank file', value: b.fileName ?? '—' }, { label: 'Completed', value: b.completedAt ? fmtDateTime(b.completedAt) : '—' }]} />
        <Tabs variant="filter" value={tab} onChange={setTab} tabs={[{ id: 'lines', label: 'Lines' }, { id: 'approvals', label: 'Approvals' }, { id: 'activity', label: 'Activity' }]} />
        {tab === 'lines' && (
          <div className="card" style={{ overflow: 'auto' }}>
            <table className="data-table dense">
              <thead><tr><th>Supplier</th><th>Invoices</th><th>Beneficiary bank</th><th className="right" style={{ width: 150 }}>Amount</th><th className="right">TDS</th><th className="right">Net</th><th>Note</th><th style={{ minWidth: 220 }}>Bank result · UTR / error</th><th>Payment</th><th>Status</th>{editable && <th />}</tr></thead>
              <tbody>{b.lines.map((l) => {
                const outstanding = l.openItemIds.reduce((x, oid) => x + (db.find<OpenItem>(C.openItems, oid)?.outstanding ?? 0), 0);
                const canResult = ['Sent to bank', 'Accepted', 'Failed'].includes(b.status) && l.status === 'Pending';
                return (
                  <tr key={l.id} className={l.status === 'Failed' ? 'error-row' : ''}>
                    <td><SupplierLink id={l.supplierId} name={l.supplierName} /></td>
                    <td style={{ fontSize: 12 }}>{l.docNumbers.map((n, i) => <DocLink key={n} path={`purchase/vendor-invoices/${db.find<OpenItem>(C.openItems, l.openItemIds[i])?.docId ?? ''}`} number={n} />).reduce<any[]>((acc, el, i) => (i ? [...acc, ', ', el] : [el]), [])}<div style={{ color: 'var(--ink-3)' }}>outstanding {fmtMoney(outstanding)}</div></td>
                    <td style={{ fontSize: 12 }}>{l.accountNumber ? <>{l.bankName} · <MaskedValue value={l.accountNumber} canReveal={s.can('purchase.batch.approve') || s.can('banking.*')} onReveal={() => engine.audit({ action: 'bank_detail.revealed', objectType: 'Payment Batch', objectId: b.id, objectNumber: b.number, detail: l.supplierName, sensitive: true })} /> · {l.ifsc}</> : <span style={{ color: 'var(--danger)' }}>No bank details</span>}</td>
                    <td className="right">{editable ? <NumberField size="grid" value={edits[l.id] ?? l.amount} onChange={(v) => setEdits({ ...edits, [l.id]: v })} decimals={2} min={0} max={outstanding} /> : <span className="money">{fmtMoney(l.amount)}</span>}</td>
                    <td className="right money">{l.tds ? fmtMoney(l.tds) : '—'}</td>
                    <td className="right money" style={{ fontWeight: 600 }}>{fmtMoney(l.net)}</td>
                    <td style={{ fontSize: 12, color: 'var(--ink-3)' }}>{l.note ?? '—'}</td>
                    <td>{canResult ? <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}><TextField size="sm" value={results[l.id] ?? ''} onChange={(v) => setResults({ ...results, [l.id]: v })} placeholder="UTR or bank error" /><Button size="sm" variant="primary" onClick={() => run(() => A.setBatchLineResult(id, l.id, 'Accepted', results[l.id] ?? ''), 'Accepted')}>Accepted</Button><Button size="sm" variant="tinted" tone="danger" onClick={() => run(() => A.setBatchLineResult(id, l.id, 'Failed', results[l.id] ?? ''), 'Marked failed')}>Failed</Button></div> : l.utr ? <span className="identifier" style={{ fontSize: 12 }}>{l.utr}</span> : l.error ? <span style={{ fontSize: 12, color: 'var(--danger)' }}>{l.error}</span> : '—'}</td>
                    <td>{l.paymentNumber ? <DocLink path={`purchase/payments/${l.paymentId}`} number={l.paymentNumber} /> : '—'}</td>
                    <td><Badge status={l.status} /></td>
                    {editable && <td><button type="button" className="btn-icon" title="Remove line" onClick={() => removeLine(l)}>✕</button></td>}
                  </tr>);
              })}</tbody>
              <tfoot><tr><td colSpan={3}>Totals</td><td className="right money">{fmtMoney(b.lines.reduce((x, l) => x + (edits[l.id] ?? l.amount), 0))}</td><td className="right money">{fmtMoney(b.lines.reduce((x, l) => x + l.tds, 0))}</td><td className="right money">{fmtMoney(b.lines.reduce((x, l) => x + l.net, 0))}</td><td colSpan={editable ? 5 : 4} /></tr></tfoot>
            </table>
          </div>)}
        {tab === 'approvals' && <div className="card" style={{ padding: 16 }}><ApprovalsTab approvalId={b.approvalId} docId={b.id} /><div style={{ marginTop: 16 }}><KV items={[{ k: 'Submitted', v: b.submittedAt ? fmtDateTime(b.submittedAt) : '—' }, { k: 'Approved', v: b.approvedAt ? `${fmtDateTime(b.approvedAt)} · ${b.checkerName ?? ''}` : '—' }, { k: 'Bank file', v: b.fileGeneratedAt ? `${b.fileName} · ${fmtDateTime(b.fileGeneratedAt)}` : '—' }, { k: 'Sent', v: b.sentAt ? fmtDateTime(b.sentAt) : '—' }]} /></div></div>}
        {tab === 'activity' && <div className="card" style={{ padding: 16 }}><ActivityTab objectId={b.id} correlationId={b.correlationId} /></div>}
      </div>
      {confirm.dialog}
    </>
  );
}
