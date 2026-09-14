// Purchase requisitions (FR-PUR-001): register, form, detail with approve / convert / RFQ actions.
import { useState } from 'react';
import { db, C, engine, nav, useCollection, useRecord, useSession } from '../../store';
import type { DocLine, Dimension } from '../../store';
import { RegisterPage, DocumentPage, Button, Badge, Money, TwoLine, DateField, TextField, TextArea, EntityPicker, useSupplierOptions, useDimensionOptions, useItemOptions, useWarehouseOptions, NumberField, ActivityTab, ApprovalsTab, AttachmentsPanel, RailSection, KV, useToast, Modal, Banner, EmptyState, type Column } from '../../components/ui';
import { fmtDate, fmtMoney, fmtQty } from '../../lib/format';
import type { Requisition } from './types';
import * as A from './actions';
import { useConfirm, ItemLink, whName, DocLink } from './shared';

export function Requisitions({ id }: { id?: string }) {
  if (id === 'new') return <RequisitionForm />;
  if (id) return <RequisitionDetail id={id} />;
  return <RequisitionRegister />;
}

function RequisitionRegister() {
  const rows = useCollection<Requisition>(C.requisitions);
  const s = useSession();
  const mine = rows.filter((r) => r.companyId === s.state.companyId).sort((a, b) => b.date.localeCompare(a.date));
  const columns: Column<Requisition>[] = [
    { key: 'number', label: 'PR #', sortable: true, render: (r) => <span className="identifier link">{r.number}</span> },
    { key: 'date', label: 'Date', sortable: true, render: (r) => fmtDate(r.date) },
    { key: 'requesterName', label: 'Requester', sortable: true, render: (r) => <TwoLine primary={r.requesterName} secondary={db.find<Dimension>(C.dimensions, r.department)?.name ?? '—'} /> },
    { key: 'lines', label: 'Items', align: 'right', value: (r) => r.lines.length, render: (r) => r.lines.length },
    { key: 'amount', label: 'Est. amount', align: 'right', sortable: true, value: (r) => r.totals.total, render: (r) => <Money value={r.totals.total} />, total: (rs) => fmtMoney(rs.reduce((x, r) => x + r.totals.total, 0)) },
    { key: 'needByDate', label: 'Need by', sortable: true, render: (r) => fmtDate(r.needByDate) },
    { key: 'status', label: 'Status', render: (r) => <Badge status={r.status === 'Submitted' ? 'Pending Approval' : r.status}>{r.status === 'Submitted' ? 'Pending Approval' : r.status}</Badge> },
    { key: 'po', label: 'PO created', render: (r) => <DocLink path={r.convertedToId ? `purchase/orders/${r.convertedToId}` : undefined} number={r.convertedToNumber ?? (r.rfqNumber ? `RFQ ${r.rfqNumber}` : undefined)} /> },
  ];
  return (
    <RegisterPage<Requisition>
      title="Purchase requisitions" subtitle={`${mine.length} requisitions · ${s.company?.tradeName} · FY ${s.state.fy}`} entity="requisitions" rows={mine} columns={columns} searchKeys={['number', 'requesterName', 'purpose']}
      tabs={[{ id: 'all', label: 'All' }, { id: 'draft', label: 'Draft', filter: (r) => r.status === 'Draft' }, { id: 'pending', label: 'Pending approval', filter: (r) => r.status === 'Submitted' }, { id: 'approved', label: 'Approved', filter: (r) => r.status === 'Approved' }, { id: 'converted', label: 'Converted', filter: (r) => r.status === 'Converted' }, { id: 'rejected', label: 'Rejected', filter: (r) => r.status === 'Rejected' || r.status === 'Cancelled' }]}
      primaryAction={{ label: 'New requisition', onClick: () => nav.go('purchase/requisitions/new'), disabled: !s.can('purchase.requisition.create'), reason: !s.can('purchase.requisition.create') ? 'Requires purchase.requisition.create' : undefined }}
      onRowClick={(r) => nav.go(`purchase/requisitions/${r.id}`)}
      rowActions={(r) => [{ label: 'Open', onClick: () => nav.go(`purchase/requisitions/${r.id}`) }, ...(r.status === 'Draft' ? [{ label: 'Edit', onClick: () => nav.go(`purchase/requisitions/${r.id}?edit=1`) }] : []), ...(r.status === 'Approved' ? [{ label: 'Convert to PO', onClick: () => nav.go(`purchase/requisitions/${r.id}?convert=1`) }] : [])]}
    />
  );
}

function RequisitionForm({ existing }: { existing?: Requisition }) {
  const toast = useToast();
  const s = useSession();
  const [doc, setDoc] = useState<Requisition>(() => existing ?? A.newRequisition());
  const [errors, setErrors] = useState<string | null>(null);
  const items = useItemOptions();
  const whs = useWarehouseOptions();
  const depts = useDimensionOptions('Department');
  const update = (p: Partial<Requisition>) => setDoc((d) => ({ ...d, ...p }));
  const updLine = (lid: string, p: Partial<DocLine>) => update({ lines: doc.lines.map((l) => (l.id === lid ? { ...l, ...p } : l)) });
  const addLine = () => update({ lines: [...doc.lines, engine.newLine({ warehouseId: s.company?.defaults.warehouseId, uom: 'Nos' })] });
  const total = doc.lines.reduce((x, l) => x + l.qty * l.rate, 0);
  const save = (submit: boolean) => {
    try {
      const saved = A.saveRequisition({ ...doc, totals: A.requisitionTotals(doc.lines) });
      if (submit) { A.submitRequisition(saved.id); toast.success(`${saved.number} submitted`); } else toast.success(`${saved.number} saved as draft`);
      nav.go(`purchase/requisitions/${saved.id}`);
    } catch (e: any) { setErrors(e.message); }
  };
  return (
    <div className="page">
      <div className="page-header">
        <div><button type="button" className="btn-link" style={{ color: 'var(--ink-3)' }} onClick={() => nav.back('purchase/requisitions')}>← Requisitions</button><h1 className="page-title">{existing ? `Edit ${existing.number}` : 'New purchase requisition'}</h1><div className="page-subtitle">Requester {doc.requesterName} · {fmtDate(doc.date)}</div></div>
        <div style={{ display: 'flex', gap: 8 }}><Button onClick={() => save(false)}>Save draft</Button><Button variant="primary" onClick={() => save(true)}>Submit requisition</Button></div>
      </div>
      {errors && <Banner tone="danger" onDismiss={() => setErrors(null)}>{errors}</Banner>}
      <div className="card" style={{ padding: 20, display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 14 }}>
        <DateField label="Date" value={doc.date} onChange={(v) => update({ date: v })} required />
        <DateField label="Need by" value={doc.needByDate} onChange={(v) => update({ needByDate: v })} required min={doc.date} />
        <EntityPicker label="Department" value={doc.department} onChange={(v) => update({ department: v, dimensions: { ...doc.dimensions, Department: v ?? '' } })} options={depts} placeholder="Department dimension" />
        <TextField label="Requester" value={doc.requesterName} onChange={() => {}} disabled help="Current user" />
        <TextArea label="Purpose" value={doc.purpose} onChange={(v) => update({ purpose: v })} style={{ gridColumn: 'span 4' }} rows={2} placeholder="Why is this needed? Shown to the approver." />
      </div>
      <div className="card" style={{ overflow: 'visible' }}>
        <table className="data-table dense">
          <thead><tr><th style={{ width: 36 }}>#</th><th style={{ minWidth: 240 }}>Item / service</th><th className="right" style={{ width: 110 }}>Qty</th><th style={{ width: 70 }}>UOM</th><th className="right" style={{ width: 130 }}>Expected price</th><th style={{ width: 160 }}>Warehouse</th><th>Purpose / note</th><th className="right" style={{ width: 130 }}>Amount</th><th style={{ width: 40 }} /></tr></thead>
          <tbody>
            {doc.lines.map((l, i) => (
              <tr key={l.id}>
                <td style={{ color: 'var(--ink-3)' }}>{i + 1}</td>
                <td><EntityPicker size="grid" value={l.itemId} onChange={(iid) => { if (!iid) return updLine(l.id, { itemId: undefined, itemName: '' }); const fresh = A.purchaseLine(iid, { qty: l.qty || 1, warehouseId: l.warehouseId }); updLine(l.id, { ...fresh, id: l.id }); }} options={items} placeholder="Search item…" recentKey="items" /></td>
                <td><NumberField size="grid" value={l.qty} onChange={(v) => updLine(l.id, { qty: v })} decimals={3} min={0} /></td>
                <td style={{ fontSize: 12 }}>{l.uom}</td>
                <td><NumberField size="grid" value={l.rate} onChange={(v) => updLine(l.id, { rate: v })} decimals={2} min={0} /></td>
                <td><select className="field-input grid" value={l.warehouseId ?? ''} onChange={(e) => updLine(l.id, { warehouseId: e.target.value || undefined })}><option value="">—</option>{whs.map((w) => <option key={w.id} value={w.id}>{w.primary}</option>)}</select></td>
                <td><input className="field-input grid" value={(l as any).purpose ?? ''} onChange={(e) => updLine(l.id, { purpose: e.target.value } as any)} placeholder="Optional" /></td>
                <td className="right money">{fmtMoney(l.qty * l.rate)}</td>
                <td><button type="button" className="btn-icon" onClick={() => update({ lines: doc.lines.filter((x) => x.id !== l.id) })}>✕</button></td>
              </tr>
            ))}
            {doc.lines.length === 0 && <tr><td colSpan={9} style={{ textAlign: 'center', color: 'var(--ink-3)', height: 64 }}>No lines yet — add one below</td></tr>}
          </tbody>
        </table>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 16px', borderTop: '1px solid var(--line)', background: 'var(--surface-2)', fontSize: 12, color: 'var(--ink-3)' }}>
          <button type="button" className="btn-link" onClick={addLine}>+ Add line</button>
          <span>Estimated total <strong style={{ color: 'var(--ink)' }}>{fmtMoney(total)}</strong></span>
        </div>
      </div>
      <div className="card" style={{ padding: 16 }}><div className="section-title">Attachments</div><AttachmentsPanel objectType="Requisition" objectId={doc.id} /></div>
    </div>
  );
}

function RequisitionDetail({ id }: { id: string }) {
  const doc = useRecord<Requisition>(C.requisitions, id);
  const s = useSession();
  const toast = useToast();
  const confirm = useConfirm();
  const suppliers = useSupplierOptions();
  const params = nav.get().params;
  const [convertOpen, setConvertOpen] = useState(!!params.convert);
  const [rfqOpen, setRfqOpen] = useState(false);
  const [supplierId, setSupplierId] = useState<string | undefined>(() => doc?.lines.find((l) => db.find<any>(C.items, l.itemId)?.preferredSupplierId)?.itemId ? db.find<any>(C.items, doc?.lines[0]?.itemId)?.preferredSupplierId : undefined);
  const [rfqSuppliers, setRfqSuppliers] = useState<string[]>([]);
  if (!doc) return <EmptyState title="Requisition not found" action={<Button onClick={() => nav.go('purchase/requisitions')}>Back to requisitions</Button>} />;
  if (nav.get().params.edit && doc.status === 'Draft') return <RequisitionForm existing={doc} />;
  const canApprove = s.can('purchase.requisition.approve') || s.can('approvals.act');
  const run = (fn: () => void, msg: string) => { try { fn(); toast.success(msg); } catch (e: any) { toast.error(e.message); } };
  const footer = (
    <>
      <div style={{ flex: 1, fontSize: 12, color: 'var(--ink-3)' }}>{doc.status === 'Submitted' ? 'Awaiting approval' : doc.status === 'Approved' ? 'Ready to convert' : ''}</div>
      {doc.status === 'Draft' && <Button onClick={() => nav.go(`purchase/requisitions/${id}?edit=1`)}>Edit</Button>}
      {doc.status === 'Draft' && <Button variant="primary" onClick={() => run(() => A.submitRequisition(id), 'Submitted')}>Submit requisition</Button>}
      {doc.status === 'Submitted' && <Button variant="danger" disabled={!canApprove} reason={!canApprove ? 'Requires approver role' : undefined} onClick={() => confirm.open({ title: `Reject ${doc.number}?`, reasonRequired: true, confirmLabel: 'Reject requisition', danger: true, onConfirm: (r) => A.decideRequisition(id, 'Rejected', r) })}>Reject</Button>}
      {doc.status === 'Submitted' && <Button variant="primary" disabled={!canApprove} reason={!canApprove ? 'Requires approver role' : undefined} onClick={() => confirm.open({ title: `Approve ${doc.number}?`, statement: `${doc.requesterName} · ${fmtMoney(doc.totals.total)} · need by ${fmtDate(doc.needByDate)}`, consequences: [{ engine: 'Workflow', text: 'Requisition becomes Approved and can be converted to a PO or RFQ' }], confirmLabel: 'Approve requisition', onConfirm: (r) => A.decideRequisition(id, 'Approved', r) })}>Approve</Button>}
      {doc.status === 'Approved' && <Button onClick={() => setRfqOpen(true)}>Create RFQ</Button>}
      {doc.status === 'Approved' && <Button variant="primary" onClick={() => setConvertOpen(true)}>Convert to PO</Button>}
      {(doc.status === 'Draft' || doc.status === 'Approved' || doc.status === 'Submitted') && <Button variant="ghost" onClick={() => confirm.open({ title: `Cancel ${doc.number}?`, reasonRequired: true, confirmLabel: 'Cancel requisition', cancelLabel: 'Keep requisition', danger: true, onConfirm: (r) => A.cancelRequisition(id, r) })}>Cancel</Button>}
    </>
  );
  return (
    <>
      <DocumentPage backLabel="Requisitions" onBack={() => nav.go('purchase/requisitions')} number={doc.number} badges={<><Badge status={doc.status === 'Submitted' ? 'Pending Approval' : doc.status}>{doc.status === 'Submitted' ? 'Pending Approval' : doc.status}</Badge>{doc.convertedToNumber && <Badge status="Converted">→ {doc.convertedToNumber}</Badge>}</>}
        amount={{ label: 'Estimated', value: doc.totals.total, currency: doc.currency }}
        rail={<><RailSection label="Request"><KV items={[{ k: 'Requester', v: doc.requesterName }, { k: 'Department', v: db.find<Dimension>(C.dimensions, doc.department)?.name ?? '—' }, { k: 'Date', v: fmtDate(doc.date) }, { k: 'Need by', v: fmtDate(doc.needByDate) }, { k: 'Purpose', v: doc.purpose ?? '—' }]} /></RailSection>
          {(doc.convertedToNumber || doc.rfqNumber) && <RailSection label="Linked"><KV items={[...(doc.convertedToNumber ? [{ k: 'PO', v: <DocLink path={`purchase/orders/${doc.convertedToId}`} number={doc.convertedToNumber} /> }] : []), ...(doc.rfqNumber ? [{ k: 'RFQ', v: <DocLink path={`purchase/rfqs/${doc.rfqId}`} number={doc.rfqNumber} /> }] : [])]} /></RailSection>}
          <RailSection label="Attachments"><AttachmentsPanel objectType="Requisition" objectId={doc.id} readOnly={doc.status !== 'Draft'} /></RailSection></>}
        tabs={[
          { id: 'lines', label: 'Lines', content: (
            <div className="card" style={{ overflow: 'hidden' }}><table className="data-table dense"><thead><tr><th>#</th><th>Item</th><th className="right">Qty</th><th>UOM</th><th className="right">Expected price</th><th>Warehouse</th><th>Purpose</th><th className="right">Amount</th></tr></thead>
              <tbody>{doc.lines.map((l, i) => <tr key={l.id}><td>{i + 1}</td><td><ItemLink id={l.itemId} name={l.itemName} /></td><td className="right money">{fmtQty(l.qty)}</td><td>{l.uom}</td><td className="right money">{fmtMoney(l.rate)}</td><td>{whName(l.warehouseId)}</td><td style={{ color: 'var(--ink-3)' }}>{(l as any).purpose ?? '—'}</td><td className="right money">{fmtMoney(l.qty * l.rate)}</td></tr>)}</tbody>
              <tfoot><tr><td colSpan={7}>Estimated total</td><td className="right money">{fmtMoney(doc.totals.total)}</td></tr></tfoot></table></div>) },
          { id: 'approvals', label: 'Approvals', content: <ApprovalsTab approvalId={doc.approvalId} docId={doc.id} /> },
          { id: 'activity', label: 'Activity', content: <ActivityTab objectId={doc.id} correlationId={doc.correlationId} /> },
        ]}
        footer={footer}
      />
      {confirm.dialog}
      <Modal open={convertOpen} onClose={() => setConvertOpen(false)} title={`Convert ${doc.number} to purchase order`} description="Lines are copied with source links; prices resolve from the supplier's purchase price list." footer={<><Button onClick={() => setConvertOpen(false)}>Keep requisition</Button><Button variant="primary" disabled={!supplierId} onClick={() => run(() => { const po = A.convertRequisitionToPo(id, supplierId!); setConvertOpen(false); nav.go(`purchase/orders/${po.id}/edit`); }, 'Draft PO created')}>Create PO</Button></>}>
        <EntityPicker label="Supplier" required value={supplierId} onChange={setSupplierId} options={suppliers} recentKey="suppliers" />
      </Modal>
      <Modal open={rfqOpen} onClose={() => setRfqOpen(false)} title={`Create RFQ from ${doc.number}`} description="Select the suppliers to invite. You can add more on the RFQ." footer={<><Button onClick={() => setRfqOpen(false)}>Cancel</Button><Button variant="primary" disabled={!rfqSuppliers.length} onClick={() => run(() => { const r = A.saveRfq({ ...A.newRfq(doc), supplierIds: rfqSuppliers }); setRfqOpen(false); nav.go(`purchase/rfqs/${r.id}`); }, 'RFQ created')}>Create RFQ</Button></>}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 320, overflow: 'auto' }}>
          {suppliers.filter((o) => !o.disabled).map((o) => <label key={o.id} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, padding: '6px 8px', border: '1px solid var(--line)', borderRadius: 8 }}><input type="checkbox" className="checkbox" checked={rfqSuppliers.includes(o.id)} onChange={() => setRfqSuppliers((x) => (x.includes(o.id) ? x.filter((y) => y !== o.id) : [...x, o.id]))} /><TwoLine primary={o.primary} secondary={o.secondary} /></label>)}
        </div>
      </Modal>
    </>
  );
}

export { RequisitionForm };
