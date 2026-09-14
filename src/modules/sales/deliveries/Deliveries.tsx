// Deliveries (FR-SAL-020..023): register, form (from order or direct), document page.
import { useEffect, useMemo, useState } from 'react';
import { db, C, engine, nav, useRecord, useSession, useCollection } from '../../../store';
import type { Item } from '../../../store';
import { RegisterPage, Badge, TwoLine, Identifier, ConfirmDialog, useToast, DocumentPage, RailSection, ActivityTab, EmptyState, Button, PageHeader, Card, DateField, TextField, SelectField, TextArea, LineItemGrid, Banner, Modal, useWarehouseOptions, AttachmentsPanel } from '../../../components/ui';
import type { Column, MenuAction } from '../../../components/ui';
import { fmtDate, fmtQty } from '../../../lib/format';
import type { Delivery, SalesOrder } from '../types';
import { useCompanyDocs, useDocDraft, CustomerField, FormFooter, ErrorSummary, DocDetailsTab, docHeaderRows, SalesRail, PdfPreviewModal, StockMovesPanel, EmailDialog } from '../common';
import { newDelivery, saveDelivery, deliveryFromOrder, ordersEligibleForDelivery, validateDelivery, postDelivery, reverseDelivery, deliveryReverseBlock, deleteDraftDelivery, recompute } from '../actions';

export function DeliveryRegister() {
  const rows = useCompanyDocs<Delivery>(C.deliveries);
  const s = useSession();
  const toast = useToast();
  const [confirm, setConfirm] = useState<{ kind: 'post' | 'reverse' | 'delete'; d: Delivery } | null>(null);
  const columns: Column<Delivery>[] = [
    { key: 'number', label: 'Delivery #', sortable: true, render: (r) => <Identifier link onClick={(e) => { e.stopPropagation(); nav.go(`sales/deliveries/${r.id}`); }}>{r.number}</Identifier>, value: (r) => r.number },
    { key: 'date', label: 'Date', sortable: true, render: (r) => fmtDate(r.date), value: (r) => r.date },
    { key: 'sourceNumber', label: 'Sales order', render: (r) => r.sourceNumber ? <Identifier link onClick={(e) => { e.stopPropagation(); nav.go(`sales/orders/${r.sourceId}`); }}>{r.sourceNumber}</Identifier> : <span style={{ color: '#B0B5BF' }}>—</span>, value: (r) => r.sourceNumber },
    { key: 'partyName', label: 'Customer', sortable: true, render: (r) => <TwoLine primary={r.partyName} secondary={r.partySnapshot?.gstin} mono />, value: (r) => r.partyName },
    { key: 'wh', label: 'Warehouse', render: (r) => db.find<any>(C.warehouses, r.warehouseId ?? r.lines[0]?.warehouseId)?.name ?? '—' },
    { key: 'lines', label: 'Lines', align: 'right', render: (r) => r.lines.length, value: (r) => r.lines.length },
    { key: 'qty', label: 'Qty', align: 'right', render: (r) => <span className="money">{fmtQty(r.lines.reduce((a, l) => a + l.qty, 0))}</span>, value: (r) => r.lines.reduce((a, l) => a + l.qty, 0) },
    { key: 'status', label: 'Status', render: (r) => <Badge status={r.status} />, value: (r) => r.status },
    { key: 'invoiced', label: 'Invoiced', render: (r) => (r.status !== 'Posted' ? '—' : r.invoiced ? <Badge status="Invoiced" /> : r.lines.some((l) => (l.invoicedQty ?? 0) > 0) ? <Badge status="Partial" /> : <Badge status="Pending">Not yet</Badge>) },
  ];
  const rowActions = (r: Delivery): MenuAction[] => [
    { label: 'Open', onClick: () => nav.go(`sales/deliveries/${r.id}`) },
    ...(r.status === 'Draft' ? [{ label: 'Edit', onClick: () => nav.go(`sales/deliveries/${r.id}`, { edit: 1 }) }, { label: 'Post', onClick: () => setConfirm({ kind: 'post', d: r }) }, { label: 'Delete draft', danger: true, onClick: () => setConfirm({ kind: 'delete', d: r }) }] : []),
    ...(r.status === 'Posted' && !r.invoiced ? [{ label: 'Create invoice', onClick: () => nav.go('sales/invoices/new', { delivery: r.id }) }] : []),
    ...(r.status === 'Posted' ? [{ label: 'Reverse', danger: true, onClick: () => setConfirm({ kind: 'reverse', d: r }), disabled: !!deliveryReverseBlock(r), reason: deliveryReverseBlock(r) }] : []),
  ];
  return (
    <>
      <RegisterPage<Delivery> title="Deliveries" subtitle={<>{rows.filter((r) => r.status === 'Posted').length} posted · {rows.filter((r) => r.status === 'Posted' && !r.invoiced).length} awaiting invoice · {s.branch?.name}</>} rows={rows} columns={columns} entity="deliveries" searchKeys={['number', 'partyName', 'sourceNumber']} searchPlaceholder="DC number, order, customer…"
        tabs={[{ id: 'all', label: 'All' }, { id: 'draft', label: 'Draft', filter: (r) => r.status === 'Draft' }, { id: 'posted', label: 'Posted', filter: (r) => r.status === 'Posted' }, { id: 'uninvoiced', label: 'Awaiting invoice', filter: (r) => r.status === 'Posted' && !r.invoiced }, { id: 'reversed', label: 'Reversed', filter: (r) => r.status === 'Reversed' }]}
        primaryAction={{ label: 'New delivery', onClick: () => nav.go('sales/deliveries/new'), disabled: !s.can('sales.delivery.create') && !s.can('sales.delivery.*'), reason: 'Requires sales.delivery.create' }}
        onRowClick={(r) => nav.go(`sales/deliveries/${r.id}`)} rowActions={rowActions} />
      <ConfirmDialog open={!!confirm} onClose={() => setConfirm(null)} title={confirm?.kind === 'post' ? `Post delivery for ${confirm.d.partyName}?` : confirm?.kind === 'delete' ? 'Delete this draft?' : `Reverse delivery ${confirm?.d.number}?`} statement={confirm?.kind === 'post' ? 'Stock is issued and the order fulfilment updated.' : confirm?.kind === 'reverse' ? 'Stock is restored and the order returns to its previous fulfilment state.' : 'This cannot be undone.'} confirmLabel={confirm?.kind === 'post' ? 'Post delivery' : confirm?.kind === 'delete' ? 'Delete draft' : 'Reverse delivery'} cancelLabel="Keep delivery" danger={confirm?.kind !== 'post'} reasonRequired={confirm?.kind === 'reverse'}
        consequences={confirm?.kind === 'reverse' ? [{ engine: 'Stock', text: `${confirm.d.lines.length} line(s) returned to the warehouse` }, { engine: 'Workflow', text: `${confirm.d.sourceNumber ?? 'Order'} fulfilment reduced` }] : confirm?.kind === 'post' ? [{ engine: 'Stock', text: `${confirm.d.lines.length} line(s) issued` }] : []}
        onConfirm={(reason) => { if (!confirm) return; if (confirm.kind === 'post') { const o = postDelivery(confirm.d.id); toast.success(`Delivery ${o.number} posted`); } else if (confirm.kind === 'delete') { deleteDraftDelivery(confirm.d.id); } else { reverseDelivery(confirm.d.id, reason); toast.success('Delivery reversed'); } }} />
    </>
  );
}

export function DeliveryForm({ id, orderId }: { id?: string; orderId?: string }) {
  const s = useSession();
  const toast = useToast();
  const whOpts = useWarehouseOptions();
  const [picker, setPicker] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const draft = useDocDraft<Delivery>(() => {
    if (id) { const ex = db.find<Delivery>(C.deliveries, id); if (ex) return recompute(ex); }
    if (orderId) { const so = db.find<SalesOrder>(C.salesOrders, orderId); if (so) return deliveryFromOrder(so); }
    return newDelivery();
  }, { collection: C.deliveries, save: (d, v) => saveDelivery(d, { expectedVersion: v }), autosave: true });
  const { doc, set, setLines, setCustomer } = draft;
  const errors = useMemo(() => validateDelivery(doc), [doc]);
  useEffect(() => { if (doc.status !== 'Draft') nav.replace(`sales/deliveries/${doc.id}`); }, [doc.status, doc.id]);
  const useOrder = (soId: string) => { const so = db.find<SalesOrder>(C.salesOrders, soId); if (!so) return; const fresh = deliveryFromOrder(so); set({ ...fresh, id: doc.id, number: doc.number, version: doc.version, createdAt: doc.createdAt }); setPicker(false); };
  const save = () => { try { const o = draft.save(); if (o) toast.success('Delivery saved'); return o; } catch (e: any) { toast.error(e.message); return undefined; } };
  const post = () => { const o = save(); if (!o) return; try { const out = postDelivery(o.id); toast.success(`Delivery ${out.number} posted`, { label: 'Open', path: `sales/deliveries/${out.id}` }); nav.go(`sales/deliveries/${out.id}`); } catch (e: any) { toast.error(e.message); throw e; } };
  const needsBatch = doc.lines.some((l) => db.find<Item>(C.items, l.itemId)?.tracking !== 'None');
  return (
    <div className="page">
      <PageHeader back={{ label: 'Deliveries', path: 'sales/deliveries' }} title={<span style={{ display: 'flex', gap: 10, alignItems: 'center' }}>{id ? doc.number : 'New delivery'} <Badge status={doc.status} /></span>} subtitle={<>{doc.number.includes('DRAFT') ? `Will be numbered ${engine.previewNumber('Delivery')} on post` : doc.number}{doc.sourceNumber ? ` · from ${doc.sourceNumber}` : ' · direct delivery'} · {s.branch?.name}</>} actions={!doc.sourceId ? <Button variant="secondary" onClick={() => setPicker(true)}>From sales order</Button> : <Button variant="ghost" onClick={() => set({ sourceId: undefined, sourceNumber: undefined, sourceType: undefined, lines: [] })}>Detach order</Button>} />
      {draft.conflict && <Banner tone="danger" action={<Button variant="link" onClick={draft.reload}>Reload</Button>}>Someone else changed this draft — reload to see their changes.</Banner>}
      {draft.errors.length > 0 && <ErrorSummary errors={draft.errors} />}
      <Card title="Customer & dispatch">
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr', gap: 16, alignItems: 'start' }}>
          <CustomerField doc={doc} onChange={setCustomer} disabled={!!doc.sourceId} />
          <DateField label="Delivery date" required value={doc.date} onChange={(v) => set({ date: v })} checkPeriod />
          <SelectField label="Default warehouse" value={doc.warehouseId ?? ''} onChange={(w) => set({ warehouseId: w || undefined, lines: doc.lines.map((l) => ({ ...l, warehouseId: w || l.warehouseId })) })} options={whOpts.map((w) => ({ value: w.id, label: w.primary }))} />
          <TextField label="Vehicle number" value={doc.vehicleNo ?? ''} onChange={(v) => set({ vehicleNo: v })} uppercase placeholder="MH02AB1234" />
          <TextField label="Transporter" value={doc.transporter ?? ''} onChange={(v) => set({ transporter: v })} placeholder="Speedway Logistics" />
          <TextField label="Reference" value={doc.reference ?? ''} onChange={(v) => set({ reference: v })} />
        </div>
      </Card>
      <section>
        <div className="section-title">Lines {doc.sourceNumber && <span style={{ fontSize: 12, fontWeight: 400, color: '#5F6368' }}>· capped at remaining order quantity</span>}</div>
        <LineItemGrid lines={doc.lines} onChange={setLines} partyId={doc.partyId} currency={doc.currency} showDiscount={false} showTax={false} showWarehouse showBatch={needsBatch || !doc.sourceId} sourceLinked={!!doc.sourceId} itemFilter={(i: Item) => i.isStock && i.status === 'Active'} />
        {errors.length > 0 && doc.lines.length > 0 && <div style={{ fontSize: 12, color: '#C0393F', marginTop: 6 }}>{errors[0]}{errors.length > 1 ? ` (+${errors.length - 1} more)` : ''}</div>}
      </section>
      <Card title="Notes" padding={16}><TextArea value={doc.notes ?? ''} onChange={(v) => set({ notes: v })} rows={2} placeholder="Delivery instructions, gate pass…" /></Card>
      {draft.persisted && <Card title="Attachments" padding={16}><AttachmentsPanel objectType="Delivery" objectId={doc.id} /></Card>}
      <FormFooter savedAt={draft.savedAt} dirty={draft.dirty} conflict={draft.conflict} onReload={draft.reload}>
        <Button variant="ghost" onClick={() => nav.go(id ? `sales/deliveries/${id}` : 'sales/deliveries')}>Discard changes</Button>
        <Button variant="secondary" onClick={save}>Save draft</Button>
        <Button variant="primary" onClick={() => { if (errors.length) { draft.setErrors(errors.map((m) => ({ message: m }))); toast.error('Fix the highlighted issues'); return; } setConfirm(true); }} disabled={!s.can('sales.delivery.post') && !s.can('sales.delivery.*')} reason="Requires sales.delivery.post" data-testid="post-delivery">Post delivery</Button>
      </FormFooter>
      <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} title="Post this delivery?" statement="Stock is issued from the selected warehouse and the order fulfilment updated. Reverse to undo." confirmLabel="Post delivery" cancelLabel="Keep as draft" consequences={[{ engine: 'Numbering', text: `Number ${engine.previewNumber('Delivery')} will be allocated` }, { engine: 'Stock', text: doc.lines.map((l) => `−${fmtQty(l.qty)} ${l.itemName} @ ${db.find<any>(C.warehouses, l.warehouseId ?? doc.warehouseId)?.name ?? '—'}`).join(' · ') }, ...(doc.sourceNumber ? [{ engine: 'Workflow', text: `${doc.sourceNumber} delivered quantity and reservations updated` }] : [])]} onConfirm={() => post()} />
      <Modal open={picker} onClose={() => setPicker(false)} title="Deliver against a sales order" description="Only confirmed orders with undelivered stock lines are listed." width={700}>
        <div className="card" style={{ overflow: 'auto', maxHeight: 400 }}><table className="data-table dense"><thead><tr><th>Order</th><th>Date</th><th>Customer</th><th className="right">Pending lines</th><th /></tr></thead><tbody>{ordersEligibleForDelivery().map((so) => <tr key={so.id}><td className="identifier">{so.number}</td><td>{fmtDate(so.date)}</td><td>{so.partyName}</td><td className="right">{so.lines.filter((l) => l.qty - (l.deliveredQty ?? 0) > 0.0005).length}</td><td><Button size="sm" variant="primary" onClick={() => useOrder(so.id)}>Use</Button></td></tr>)}{ordersEligibleForDelivery().length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', color: '#5F6368' }}>No orders awaiting delivery</td></tr>}</tbody></table></div>
      </Modal>
    </div>
  );
}

export function DeliveryDetail({ id }: { id: string }) {
  const d = useRecord<Delivery>(C.deliveries, id);
  const s = useSession();
  const toast = useToast();
  useCollection(C.salesInvoices);
  const [dialog, setDialog] = useState<null | 'post' | 'reverse' | 'delete'>(null);
  const [pdf, setPdf] = useState(false);
  const [email, setEmail] = useState(false);
  if (!d) return <EmptyState title="Delivery not found" action={<Button variant="primary" onClick={() => nav.go('sales/deliveries')}>Back</Button>} />;
  const block = d.status === 'Posted' ? deliveryReverseBlock(d) : undefined;
  const footer = d.status === 'Draft' ? <><Button variant="danger" onClick={() => setDialog('delete')}>Delete draft</Button><Button variant="secondary" onClick={() => nav.go(`sales/deliveries/${d.id}`, { edit: 1 })}>Edit</Button><Button variant="primary" onClick={() => setDialog('post')} disabled={!s.can('sales.delivery.post') && !s.can('sales.delivery.*')} reason="Requires sales.delivery.post">Post delivery</Button></>
    : d.status === 'Posted' ? <><Button variant="secondary" onClick={() => setDialog('reverse')} disabled={!!block} reason={block}>Reverse</Button><Button variant="secondary" onClick={() => setPdf(true)}>Print challan</Button><Button variant="secondary" onClick={() => setEmail(true)}>Send</Button>{!d.invoiced && <Button variant="primary" onClick={() => nav.go('sales/invoices/new', { delivery: d.id })} data-testid="invoice-from-delivery">Create invoice</Button>}</>
    : <Button variant="secondary" onClick={() => setPdf(true)}>Print challan</Button>;
  return (
    <>
      <DocumentPage backLabel="Deliveries" onBack={() => nav.go('sales/deliveries')} number={d.number} badges={<><Badge status={d.status} />{d.status === 'Posted' && (d.invoiced ? <Badge status="Invoiced" /> : <Badge status="Pending">Awaiting invoice</Badge>)}</>}
        rail={<SalesRail doc={d}><RailSection label="Dispatch"><div style={{ fontSize: 12, color: '#5F6368' }}>{db.find<any>(C.warehouses, d.warehouseId ?? d.lines[0]?.warehouseId)?.name ?? '—'}{d.vehicleNo ? ` · ${d.vehicleNo}` : ''}{d.transporter ? ` · ${d.transporter}` : ''}</div></RailSection></SalesRail>}
        banner={d.status === 'Reversed' ? <Banner tone="warning" full>Reversed: {d.reversalReason}</Banner> : undefined}
        tabs={[{ id: 'details', label: 'Details', content: <DocDetailsTab doc={d} header={[...docHeaderRows(d), { k: 'Vehicle', v: d.vehicleNo ?? '—' }, { k: 'Transporter', v: d.transporter ?? '—' }]} showTax={false} showCharges={false} showLadder={false} showWarehouse showBatch sourceLinked={!!d.sourceId} lineExtraColumns={[{ key: 'inv', label: 'Invoiced', render: (l: any) => fmtQty(l.invoicedQty ?? 0) }]} extra={<StockMovesPanel sourceId={d.id} />} /> }, { id: 'activity', label: 'Activity', content: <ActivityTab objectId={d.id} correlationId={d.correlationId} /> }]}
        footer={footer} />
      <PdfPreviewModal open={pdf} onClose={() => setPdf(false)} doc={d} title="Delivery challan" partyLabel="Deliver to" />
      <EmailDialog open={email} onClose={() => setEmail(false)} doc={d} collection={C.deliveries} />
      <ConfirmDialog open={dialog === 'post'} onClose={() => setDialog(null)} title="Post this delivery?" statement="Stock is issued and the order fulfilment updated." confirmLabel="Post delivery" cancelLabel="Keep as draft" consequences={[{ engine: 'Stock', text: `${d.lines.length} line(s) issued` }]} onConfirm={() => { const o = postDelivery(d.id); toast.success(`Delivery ${o.number} posted`); }} />
      <ConfirmDialog open={dialog === 'reverse'} onClose={() => setDialog(null)} title={`Reverse delivery ${d.number}?`} statement="Stock is restored to the warehouse and the order returns to its previous fulfilment state." confirmLabel="Reverse delivery" cancelLabel="Keep delivery" danger reasonRequired consequences={[{ engine: 'Stock', text: d.lines.map((l) => `+${fmtQty(l.qty)} ${l.itemName}`).join(' · ') }, { engine: 'Workflow', text: `${d.sourceNumber ?? 'Order'} delivered quantity reduced; reservations reinstated` }]} onConfirm={(r) => { reverseDelivery(d.id, r); toast.success('Delivery reversed'); }} />
      <ConfirmDialog open={dialog === 'delete'} onClose={() => setDialog(null)} title="Delete this draft?" confirmLabel="Delete draft" cancelLabel="Keep draft" danger onConfirm={() => { deleteDraftDelivery(d.id); nav.go('sales/deliveries'); }} />
    </>
  );
}
