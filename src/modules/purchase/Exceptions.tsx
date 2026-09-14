// Matching exceptions workbench (FR-PUR-032/033): register + side-by-side detail with assign / resolve / approve.
import { useState } from 'react';
import { db, C, nav, useCollection, useRecord, useSession } from '../../store';
import { RegisterPage, Button, Badge, TwoLine, Drawer, EntityPicker, useUserOptions, RadioCards, ReasonField, useToast, EmptyState, Banner, KV, SummaryBlock, ActivityTab, type Column } from '../../components/ui';
import { fmtDateTime, fmtMoney, fmtDate } from '../../lib/format';
import type { MatchException, ExceptionResolution, VendorInvoice, PurchaseOrder, Grn } from './types';
import * as A from './actions';
import { useConfirm, DocLink } from './shared';

export function ExceptionsWorkbench({ id }: { id?: string }) {
  const rows = useCollection<MatchException>(C.matchExceptions);
  const s = useSession();
  const mine = rows.filter((r) => r.companyId === s.state.companyId).sort((a, b) => b.raisedAt.localeCompare(a.raisedAt));
  const columns: Column<MatchException>[] = [
    { key: 'invoiceNumber', label: 'Invoice', sortable: true, render: (r) => <TwoLine primary={<span className="identifier link">{r.invoiceNumber === 'VINV/DRAFT' ? db.find<VendorInvoice>(C.vendorInvoices, r.invoiceId)?.supplierInvoiceNumber ?? 'Draft' : r.invoiceNumber}</span>} secondary={r.supplierName} /> },
    { key: 'type', label: 'Exception', sortable: true, render: (r) => <TwoLine primary={r.type} secondary={r.itemName ?? 'Charges'} /> },
    { key: 'poNumber', label: 'PO / GRN', render: (r) => <span style={{ fontSize: 12 }}><DocLink path={`purchase/orders/${r.poId}`} number={r.poNumber} />{r.grnNumber ? <> · <DocLink path={`purchase/grn/${r.grnId}`} number={r.grnNumber} /></> : null}</span> },
    { key: 'poValue', label: 'PO', align: 'right', render: (r) => r.poValue !== undefined ? fmtMoney(r.poValue) : '—' },
    { key: 'invoiceValue', label: 'Invoice', align: 'right', render: (r) => fmtMoney(r.invoiceValue) },
    { key: 'variance', label: 'Variance', align: 'right', sortable: true, render: (r) => <span className="money" style={{ color: 'var(--danger)', fontWeight: 600 }}>{fmtMoney(r.variance)} <span style={{ fontWeight: 400 }}>({r.variancePct}%)</span></span>, total: (rs) => fmtMoney(rs.reduce((x, r) => x + r.variance, 0)) },
    { key: 'tolerance', label: 'Tolerance', render: (r) => <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{r.tolerance}</span> },
    { key: 'assignedToName', label: 'Assigned to', sortable: true, render: (r) => r.assignedToName ?? <span style={{ color: 'var(--ink-5)' }}>Unassigned</span> },
    { key: 'raisedAt', label: 'Raised', sortable: true, render: (r) => fmtDateTime(r.raisedAt) },
    { key: 'status', label: 'Status', sortable: true, render: (r) => <Badge status={r.status} /> },
  ];
  const selected = id ? mine.find((r) => r.id === id) : undefined;
  return (
    <>
      <RegisterPage<MatchException> title="Matching exceptions" subtitle={`${mine.filter((r) => r.status === 'Open' || r.status === 'Assigned').length} open · policy: ${A.purchaseSettings().blockOnException ? 'block posting until resolved' : 'warn only'} · ${A.purchaseSettings().matchingMode} · tolerance ${A.purchaseSettings().matchTolerancePct}% / ₹${A.purchaseSettings().matchToleranceAmt}`} entity="exceptions" rows={mine} columns={columns} searchKeys={['invoiceNumber', 'supplierName', 'itemName', 'type']}
        tabs={[{ id: 'open', label: 'Open', filter: (r) => r.status === 'Open' || r.status === 'Assigned' }, { id: 'unassigned', label: 'Unassigned', filter: (r) => r.status === 'Open' }, { id: 'mine', label: 'Assigned to me', filter: (r) => r.assignedToId === s.user?.id && r.status === 'Assigned' }, { id: 'resolved', label: 'Resolved (awaiting approval)', filter: (r) => r.status === 'Resolved' }, { id: 'approved', label: 'Approved', filter: (r) => r.status === 'Approved' }, { id: 'all', label: 'All' }]}
        onRowClick={(r) => nav.go(`purchase/exceptions/${r.id}`)} rowActions={(r) => [{ label: 'Open', onClick: () => nav.go(`purchase/exceptions/${r.id}`) }, { label: 'Open invoice', onClick: () => nav.go(`purchase/vendor-invoices/${r.invoiceId}`) }]} />
      {selected && <ExceptionDrawer x={selected} onClose={() => nav.go('purchase/exceptions')} />}
      {id && !selected && <EmptyState title="Exception not found" />}
    </>
  );
}

function ExceptionDrawer({ x, onClose }: { x: MatchException; onClose: () => void }) {
  const live = useRecord<MatchException>(C.matchExceptions, x.id) ?? x;
  const inv = db.find<VendorInvoice>(C.vendorInvoices, live.invoiceId);
  const po = db.find<PurchaseOrder>(C.purchaseOrders, live.poId);
  const grn = db.find<Grn>(C.grns, live.grnId);
  const il = inv?.lines.find((l) => l.id === live.lineId);
  const pl = po?.lines.find((l) => l.id === il?.poLineId);
  const gl = grn?.lines.find((l) => l.id === il?.grnLineId);
  const users = useUserOptions();
  const s = useSession();
  const toast = useToast();
  const confirm = useConfirm();
  const [assignTo, setAssignTo] = useState<string | undefined>(live.assignedToId);
  const [resolution, setResolution] = useState<ExceptionResolution>('Accept invoice value');
  const [reason, setReason] = useState('');
  const canResolve = s.can('purchase.exception.resolve') || s.can('purchase.invoice.edit') || s.can('purchase.*');
  const canApprove = s.can('purchase.exception.approve') || s.can('purchase.invoice.post');
  const run = (fn: () => void, msg: string) => { try { fn(); toast.success(msg); } catch (e: any) { toast.error(e.message); } };
  const cell = (label: string, v: any) => ({ k: label, v: v ?? '—' });
  return (
    <>
      <Drawer open onClose={onClose} title={`${live.type} · ${live.itemName ?? 'Charges'}`} subtitle={`${live.invoiceNumber === 'VINV/DRAFT' ? inv?.supplierInvoiceNumber : live.invoiceNumber} · ${live.supplierName} · raised ${fmtDateTime(live.raisedAt)}`} width={860} headerRight={<Badge status={live.status} />}
        footer={<>
          <Button variant="ghost" onClick={onClose}>Close</Button>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button onClick={() => nav.go(`purchase/vendor-invoices/${live.invoiceId}`)}>Open invoice</Button>
            {live.status === 'Resolved' && <Button variant="primary" tone="good" disabled={!canApprove} reason={!canApprove ? 'Requires approver' : undefined} onClick={() => confirm.open({ title: 'Approve this resolution?', statement: `${live.resolution} — ${live.resolutionReason}`, consequences: [{ engine: 'Workflow', text: 'Invoice becomes postable once all exceptions are approved' }], confirmLabel: 'Approve exception', onConfirm: (r) => { A.approveException(live.id, r); toast.success('Exception approved'); } })}>Approve</Button>}
            {(live.status === 'Open' || live.status === 'Assigned') && <Button variant="primary" disabled={!canResolve || reason.trim().length < 10} reason={!canResolve ? 'Requires purchase manager' : reason.trim().length < 10 ? 'Enter a resolution reason' : undefined} onClick={() => run(() => A.resolveException(live.id, resolution, reason), `Resolved: ${resolution}`)}>Resolve exception</Button>}
          </div>
        </>}>
        <SummaryBlock items={[{ label: 'PO value', value: live.poValue !== undefined ? fmtMoney(live.poValue) : '—' }, { label: 'GRN value', value: live.grnValue !== undefined ? fmtMoney(live.grnValue) : '—' }, { label: 'Invoice value', value: fmtMoney(live.invoiceValue) }, { label: 'Variance', value: `${fmtMoney(live.variance)} (${live.variancePct}%)`, tone: 'danger' }, { label: 'Tolerance', value: live.tolerance, tone: 'warn' }]} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginTop: 16 }}>
          <div className="card" style={{ padding: 12 }}><div className="section-label" style={{ marginBottom: 6 }}>Purchase order {po ? <DocLink path={`purchase/orders/${po.id}`} number={po.number} /> : ''}</div><KV items={[cell('Item', pl?.itemName ?? live.itemName), cell('Qty', pl?.qty), cell('Rate', pl ? fmtMoney(pl.rate) : undefined), cell('Tax', pl ? `${pl.taxRate}%` : undefined), cell('Charges', po ? fmtMoney(po.totals.charges) : undefined), cell('Status', po?.status)]} /></div>
          <div className="card" style={{ padding: 12 }}><div className="section-label" style={{ marginBottom: 6 }}>Goods receipt {grn ? <DocLink path={`purchase/grn/${grn.id}`} number={grn.number} /> : ''}</div>{grn ? <KV items={[cell('Received', gl?.receivedQty), cell('Accepted', gl?.acceptedQty), cell('Rejected', gl?.rejectedQty), cell('Invoiced', gl?.invoicedQty ?? 0), cell('QC', grn.qcStatus), cell('Date', fmtDate(grn.date))]} /> : <div style={{ fontSize: 12, color: 'var(--danger)' }}>No GRN — {A.purchaseSettings().matchingMode} matching needs a posted receipt.</div>}</div>
          <div className="card" style={{ padding: 12, borderColor: '#F97316' }}><div className="section-label" style={{ marginBottom: 6 }}>Vendor invoice <DocLink path={`purchase/vendor-invoices/${live.invoiceId}`} number={inv?.supplierInvoiceNumber} /></div><KV items={[cell('Item', il?.itemName ?? live.itemName), cell('Qty', il?.qty), cell('Rate', il ? fmtMoney(il.rate) : undefined), cell('Tax', il ? `${il.taxRate}%` : undefined), cell('Charges', inv ? fmtMoney(inv.totals.charges) : undefined), cell('Total', inv ? fmtMoney(inv.totals.total) : undefined)]} /></div>
        </div>
        {(live.status === 'Open' || live.status === 'Assigned') && (
          <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 16, marginTop: 16 }}>
            <div className="card" style={{ padding: 12 }}>
              <div className="section-title">Assign</div>
              <EntityPicker label="Assignee" value={assignTo} onChange={setAssignTo} options={users} />
              <Button size="sm" style={{ marginTop: 8 }} disabled={!assignTo || assignTo === live.assignedToId} onClick={() => run(() => A.assignException(live.id, assignTo!), 'Assigned')}>Assign</Button>
              <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 8 }}>Currently: {live.assignedToName ?? 'unassigned'}</div>
            </div>
            <div className="card" style={{ padding: 12 }}>
              <div className="section-title">Resolve</div>
              <RadioCards value={resolution} onChange={setResolution} columns={3} options={[{ value: 'Accept invoice value', label: 'Accept invoice value', description: 'Post as billed; variance goes to purchase price variance' }, { value: 'Adjust to PO', label: 'Adjust to PO', description: 'Invoice line is corrected to the PO price / quantity / tax' }, { value: 'Request debit note', label: 'Request debit note', description: 'Post as billed and raise a debit note for the difference' }]} />
              <ReasonField label="Resolution reason" value={reason} onChange={setReason} style={{ marginTop: 10 }} />
              {!canApprove && <Banner tone="info" style={{ marginTop: 8 }}>Your resolution will await approval by a purchase / finance approver.</Banner>}
            </div>
          </div>
        )}
        {(live.status === 'Resolved' || live.status === 'Approved') && <div className="card" style={{ padding: 12, marginTop: 16 }}><KV items={[cell('Resolution', live.resolution), cell('Reason', live.resolutionReason), cell('Resolved by', live.resolvedBy ? `${live.resolvedBy} · ${fmtDateTime(live.resolvedAt)}` : undefined), cell('Approved by', live.approvedBy ? `${live.approvedBy} · ${fmtDateTime(live.approvedAt)}` : 'Awaiting approval')]} /></div>}
        <div style={{ marginTop: 16 }}><ActivityTab objectId={live.id} /></div>
      </Drawer>
      {confirm.dialog}
    </>
  );
}
