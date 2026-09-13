// Purchase order detail page — purchase/orders/<id> (FR-PUR-010/011).
import { useState } from 'react';
import { db, C, engine, nav, useCollection, useRecord, useSession } from '../../store';
import type { ApprovalRequest } from '../../store';
import { DocumentPage, Button, Badge, Meter, RailSection, ActivityTab, ApprovalsTab, AttachmentsPanel, PrintSheet, LineItemGrid, TotalsLadder, TaxBreakup, useToast, ActionMenu, EmptyState, SummaryBlock, Pill } from '../../components/ui';
import { fmtDate, fmtMoney, fmtQty, daysBetween, today } from '../../lib/format';
import type { PurchaseOrder, Grn, VendorInvoice } from './types';
import * as A from './actions';
import { useConfirm, StandardRail, DocLink } from './shared';

export function OrderDetail({ id }: { id: string }) {
  const po = useRecord<PurchaseOrder>(C.purchaseOrders, id);
  const grns = useCollection<Grn>(C.grns).filter((g) => g.poId === id);
  const invoices = useCollection<VendorInvoice>(C.vendorInvoices).filter((v) => v.poId === id);
  const approvals = useCollection<ApprovalRequest>(C.approvals);
  const s = useSession();
  const toast = useToast();
  const confirm = useConfirm();
  const [tab, setTab] = useState(nav.get().params.tab ?? 'lines');
  if (!po) return <EmptyState title="Purchase order not found" description="It may have been deleted or belongs to another company." action={<Button onClick={() => nav.go('purchase/orders')}>Back to orders</Button>} />;
  const f = A.poFulfilment(po);
  const pending = approvals.find((a) => a.docId === id && a.status === 'Pending');
  const canAct = pending ? engine.canActOnApproval(pending) : { ok: false, reason: 'No pending approval' };
  const run = (fn: () => void, msg: string) => { try { fn(); toast.success(msg); } catch (e: any) { toast.error(e.message); } };
  const canReceive = ['Approved', 'Partially Received'].includes(po.status) && f.pending > 0;
  const canInvoice = ['Approved', 'Partially Received', 'Received'].includes(po.status) && f.invoiced < f.ordered;
  const lateDays = po.expectedDate && f.pending > 0 ? daysBetween(po.expectedDate, today()) : 0;
  const printDoc = { ...po, lines: po.lines.map((l) => ({ ...l })) };
  const footer = (
    <>
      <div style={{ flex: 1, fontSize: 12, color: '#5F6368' }}>{pending ? `Awaiting ${pending.steps.find((x) => x.order === pending.currentStep)?.approverLabel}` : po.status === 'Approved' ? 'Approved — ready for receipt' : ''}</div>
      {(po.status === 'Draft' || po.status === 'Returned') && <Button onClick={() => nav.go(`purchase/orders/${id}/edit`)}>Edit</Button>}
      {(po.status === 'Draft' || po.status === 'Returned') && <Button variant="primary" onClick={() => run(() => A.submitPo(id), 'Submitted')}>Submit for approval</Button>}
      {pending && <Button variant="danger" disabled={!canAct.ok} reason={canAct.reason} onClick={() => confirm.open({ title: `Reject ${po.number}?`, reasonRequired: true, confirmLabel: 'Reject PO', danger: true, onConfirm: (r) => engine.actOnApproval(pending.id, 'Reject', { comment: r }) })}>Reject</Button>}
      {pending && <Button disabled={!canAct.ok} reason={canAct.reason} onClick={() => confirm.open({ title: `Return ${po.number} to requester?`, reasonRequired: true, confirmLabel: 'Return for changes', onConfirm: (r) => engine.actOnApproval(pending.id, 'Return', { comment: r }) })}>Return</Button>}
      {pending && <Button variant="primary" disabled={!canAct.ok} reason={canAct.reason} onClick={() => confirm.open({ title: `Approve ${po.number}?`, statement: `${po.partyName} · ${fmtMoney(po.totals.total, po.currency)} · step ${pending.currentStep} of ${pending.steps.length}`, consequences: [{ engine: 'Workflow', text: pending.steps.filter((x) => x.status === 'Pending').length > 1 ? 'Moves to the next approver' : 'PO becomes Approved; goods can be received and invoiced' }, { engine: 'Notification', text: `${po.createdBy} is notified` }], confirmLabel: 'Approve PO', onConfirm: (r) => engine.actOnApproval(pending.id, 'Approve', { comment: r }) })}>Approve</Button>}
      {canReceive && <Button variant="primary" onClick={() => nav.go(`purchase/grn/new?po=${id}`)}>Receive goods</Button>}
      {canInvoice && <Button onClick={() => nav.go(`purchase/vendor-invoices/new?po=${id}`)}>Book vendor invoice</Button>}
      <ActionMenu align="right" trigger={<Button>More ▾</Button>} actions={[
        { label: 'Print PO', onClick: () => { setTab('print'); setTimeout(() => window.print(), 200); } },
        { label: 'Email to supplier', onClick: () => run(() => A.markPoEmailed(id), `Emailed to ${po.partyName}`) },
        { label: 'Amend (revision)', onClick: () => nav.go(`purchase/orders/${id}/edit`), disabled: !['Approved', 'Partially Received'].includes(po.status), reason: !['Approved', 'Partially Received'].includes(po.status) ? `Not amendable while ${po.status}` : undefined },
        { label: 'Short-close', onClick: () => confirm.open({ title: `Short-close ${po.number}?`, statement: `${f.pending} unit(s) still pending will be cancelled; received quantities are kept.`, reasonRequired: true, confirmLabel: 'Short-close PO', cancelLabel: 'Keep open', onConfirm: (r) => A.shortClosePo(id, r) }), disabled: !['Approved', 'Partially Received', 'Received'].includes(po.status), reason: !['Approved', 'Partially Received', 'Received'].includes(po.status) ? `Cannot short-close a ${po.status} PO` : undefined },
        { label: 'Cancel PO', danger: true, onClick: () => confirm.open({ title: `Cancel ${po.number}?`, statement: 'Nothing has been received. The number stays allocated and the cancellation is audited.', reasonRequired: true, confirmLabel: 'Cancel PO', cancelLabel: 'Keep PO', danger: true, onConfirm: (r) => A.cancelPo(id, r) }), disabled: f.received > 0 || ['Closed', 'Cancelled', 'Short Closed'].includes(po.status), reason: f.received > 0 ? 'Goods received — short-close instead' : ['Closed', 'Cancelled', 'Short Closed'].includes(po.status) ? `Already ${po.status}` : undefined },
      ]} />
    </>
  );
  return (
    <>
      <DocumentPage backLabel="Purchase orders" onBack={() => nav.go('purchase/orders')} number={po.number} activeTab={tab} onTab={setTab}
        badges={<><Badge status={po.status === 'Submitted' ? 'Awaiting Approval' : po.status}>{po.status === 'Submitted' ? 'Awaiting approval' : po.status}</Badge>{po.revision ? <Badge status="Draft">rev {po.revision}</Badge> : null}{lateDays > 0 && <Pill tone="critical">Late {lateDays} d</Pill>}{po.emailedAt && <Pill tone="neutral">Emailed</Pill>}</>}
        amount={{ label: 'Order value', value: po.totals.total, currency: po.currency, base: po.totals.baseTotal, baseCurrency: s.currency, rate: po.rate }}
        rail={<StandardRail doc={po} facts={[{ k: 'Expected', v: fmtDate(po.expectedDate) }, { k: 'Terms', v: po.paymentTerms ?? '—' }, ...(po.requisitionNumber ? [{ k: 'Requisition', v: <DocLink path={`purchase/requisitions/${po.requisitionId}`} number={po.requisitionNumber} /> }] : []), ...(po.rfqNumber ? [{ k: 'RFQ', v: <DocLink path={`purchase/rfqs/${po.rfqId}`} number={po.rfqNumber} /> }] : []), ...(po.dimensions?.Department ? [{ k: 'Department', v: db.find<any>(C.dimensions, po.dimensions.Department)?.name }] : []), ...(po.dimensions?.Project ? [{ k: 'Project', v: db.find<any>(C.dimensions, po.dimensions.Project)?.name }] : [])]}>
          <RailSection label="Fulfilment">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12 }}>
              <div><div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Received</span><span className="money">{f.accepted} / {f.ordered} · {f.receivedPct}%</span></div><Meter value={f.receivedPct} tone={f.receivedPct >= 100 ? 'good' : undefined} /></div>
              <div><div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Invoiced</span><span className="money">{f.invoiced} / {f.ordered} · {f.invoicedPct}%</span></div><Meter value={f.invoicedPct} tone={f.invoicedPct >= 100 ? 'good' : undefined} /></div>
              {f.rejected > 0 && <div style={{ color: '#C0393F' }}>Rejected at QC: {f.rejected}</div>}
              {f.returned > 0 && <div style={{ color: '#8A4B0F' }}>Returned: {f.returned}</div>}
            </div>
          </RailSection>
          <RailSection label="Attachments"><AttachmentsPanel objectType="Purchase Order" objectId={po.id} readOnly={po.status !== 'Draft'} /></RailSection>
        </StandardRail>}
        tabs={[
          { id: 'lines', label: 'Lines', content: (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <LineItemGrid lines={po.lines} readOnly direction="purchase" currency={po.currency} showWarehouse showDiscount showTax totals={po.totals} extraColumns={[{ key: 'expected', label: 'Expected', width: 100, render: (l) => <span style={{ fontSize: 12 }}>{fmtDate((l as any).expectedDate ?? po.expectedDate)}</span> }, { key: 'recv', label: 'Recv / Acc / Rej', width: 130, render: (l) => <span className="money" style={{ fontSize: 12 }}>{fmtQty(l.receivedQty ?? 0)} / <span style={{ color: '#12784E' }}>{fmtQty(l.acceptedQty ?? 0)}</span> / <span style={{ color: (l.rejectedQty ?? 0) > 0 ? '#C0393F' : '#B0B5BF' }}>{fmtQty(l.rejectedQty ?? 0)}</span></span> }, { key: 'inv', label: 'Invoiced', width: 80, render: (l) => <span className="money" style={{ fontSize: 12 }}>{fmtQty(l.invoicedQty ?? 0)}</span> }, { key: 'pend', label: 'Pending', width: 80, render: (l) => { const p = Math.max(0, l.qty - (l.acceptedQty ?? 0) - ((l as any).cancelledQty ?? 0)); return <span className="money" style={{ fontSize: 12, color: p > 0 ? '#8A4B0F' : '#B0B5BF' }}>{fmtQty(p)}</span>; } }]} />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
                <div className="card" style={{ padding: 16 }}><div className="section-title">Tax breakup</div><TaxBreakup totals={po.totals} currency={po.currency} />{po.terms && <div style={{ marginTop: 12, fontSize: 12, color: '#5F6368' }}><strong>Terms:</strong> {po.terms}</div>}{po.notes && <div style={{ marginTop: 6, fontSize: 12, color: '#5F6368' }}><strong>Notes:</strong> {po.notes}</div>}</div>
                <div className="card" style={{ padding: 16 }}><div className="section-title">Totals</div><TotalsLadder totals={po.totals} currency={po.currency} baseCurrency={s.currency} rate={po.rate} showPaid={false} /></div>
              </div>
            </div>) },
          { id: 'related', label: `Receipts & invoices (${grns.length + invoices.length})`, content: (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <SummaryBlock items={[{ label: 'Ordered', value: fmtMoney(po.totals.total, po.currency) }, { label: 'Received (accepted)', value: fmtMoney(f.receivedValue, po.currency), tone: 'good' }, { label: 'Invoiced', value: fmtMoney(f.invoicedValue, po.currency) }, { label: 'Pending qty', value: fmtQty(f.pending), tone: f.pending ? 'warn' : undefined }]} />
              <div className="card" style={{ overflow: 'hidden' }}><div style={{ padding: '10px 16px', borderBottom: '1px solid #EAEAEA', fontWeight: 600, fontSize: 13 }}>Goods receipts</div>
                {grns.length === 0 ? <div style={{ padding: 16, fontSize: 13, color: '#5F6368' }}>No receipts yet.{canReceive && <> <button type="button" className="btn-link" onClick={() => nav.go(`purchase/grn/new?po=${id}`)}>Receive goods</button></>}</div> : <table className="data-table dense"><thead><tr><th>GRN</th><th>Date</th><th className="right">Received</th><th className="right">Accepted</th><th className="right">Rejected</th><th>QC</th><th>Status</th></tr></thead><tbody>{grns.map((g) => <tr key={g.id} className="clickable" onClick={() => nav.go(`purchase/grn/${g.id}`)}><td className="identifier link">{g.number}</td><td>{fmtDate(g.date)}</td><td className="right money">{g.lines.reduce((x, l) => x + l.receivedQty, 0)}</td><td className="right money">{g.lines.reduce((x, l) => x + l.acceptedQty, 0)}</td><td className="right money">{g.lines.reduce((x, l) => x + l.rejectedQty, 0)}</td><td><Badge status={g.qcStatus} /></td><td><Badge status={g.status} /></td></tr>)}</tbody></table>}</div>
              <div className="card" style={{ overflow: 'hidden' }}><div style={{ padding: '10px 16px', borderBottom: '1px solid #EAEAEA', fontWeight: 600, fontSize: 13 }}>Vendor invoices</div>
                {invoices.length === 0 ? <div style={{ padding: 16, fontSize: 13, color: '#5F6368' }}>No invoices booked.{canInvoice && <> <button type="button" className="btn-link" onClick={() => nav.go(`purchase/vendor-invoices/new?po=${id}`)}>Book vendor invoice</button></>}</div> : <table className="data-table dense"><thead><tr><th>Invoice</th><th>Supplier ref</th><th>Date</th><th className="right">Total</th><th>Match</th><th>Status</th></tr></thead><tbody>{invoices.map((v) => <tr key={v.id} className="clickable" onClick={() => nav.go(`purchase/vendor-invoices/${v.id}`)}><td className="identifier link">{v.number}</td><td className="identifier">{v.supplierInvoiceNumber}</td><td>{fmtDate(v.date)}</td><td className="right money">{fmtMoney(v.totals.total, v.currency)}</td><td><Badge status={v.matchStatus} /></td><td><Badge status={v.status} /></td></tr>)}</tbody></table>}</div>
              {po.amendments.length > 0 && <div className="card" style={{ padding: 16 }}><div className="section-title">Amendments</div>{po.amendments.map((a) => <div key={a.revision} style={{ fontSize: 12, marginBottom: 8 }}><strong>Rev {a.revision}</strong> · {fmtDate(a.at)} · {a.by} — {a.summary}<div style={{ color: '#5F6368' }}>{a.reason}</div></div>)}</div>}
            </div>) },
          { id: 'approvals', label: 'Approvals', content: <ApprovalsTab approvalId={po.approvalId} docId={po.id} /> },
          { id: 'activity', label: 'Activity', content: <ActivityTab objectId={po.id} correlationId={po.correlationId} /> },
          { id: 'print', label: 'Print', content: <div><div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}><Button variant="primary" onClick={() => window.print()}>Print / Save PDF</Button></div><PrintSheet doc={printDoc} title="Purchase order" partyLabel="Supplier" extraHeader={po.expectedDate ? <div>Deliver by {fmtDate(po.expectedDate)}</div> : undefined} /></div> },
        ]}
        footer={footer}
        banner={po.status === 'Returned' ? <div className="banner warning full">Returned by approver — edit and resubmit. {approvals.filter((a) => a.docId === id).slice(-1)[0]?.history.slice(-1)[0]?.comment}</div> : po.status === 'Rejected' ? <div className="banner danger full">Rejected: {approvals.filter((a) => a.docId === id).slice(-1)[0]?.history.slice(-1)[0]?.comment ?? '—'}</div> : undefined}
      />
      {confirm.dialog}
    </>
  );
}
