// Sales orders (FR-SAL-010..014, FR-INV-004): register with quantity tracking, form, document page.
import { useEffect, useMemo, useState } from 'react';
import { db, C, engine, nav, useCollection, useRecord, useSession } from '../../../store';
import type { ApprovalRequest, Item, DocLine } from '../../../store';
import { RegisterPage, Badge, TwoLine, Identifier, Money, ConfirmDialog, useToast, DocumentPage, RailSection, ActivityTab, ApprovalsTab, EmptyState, Button, PageHeader, Card, DateField, TextField, SelectField, TextArea, LineItemGrid, TotalsLadder, TaxBreakup, Banner, ActionMenu, Meter, Modal, NumberField, SummaryBlock, KV, useWarehouseOptions, AttachmentsPanel, ReasonField } from '../../../components/ui';
import type { Column, MenuAction } from '../../../components/ui';
import { fmtDate, fmtMoney, fmtQty, stateNameOf, addDays, today } from '../../../lib/format';
import type { SalesOrder } from '../types';
import { useCompanyDocs, useDocDraft, CustomerField, PlaceOfSupplyField, CurrencyRateFields, DimensionsFields, ChargesEditor, FormFooter, ErrorSummary, usePaymentTermOptions, useSalespersonOptions, usePriceListOptions, DocDetailsTab, docHeaderRows, SalesRail, PdfPreviewModal, EmailDialog, ReservationsPanel, useSalesSettings } from '../common';
import { newSalesOrder, saveSalesOrder, validateOrder, submitOrder, confirmOrder, reserveOrderLine, releaseOrderReservations, amendOrder, cancelOrder, shortCloseOrder, shortCloseImpact, deleteDraftOrder, orderQuantities, orderLineQuantities, recompute } from '../actions';

const STATUSES = ['Draft', 'Submitted', 'Confirmed', 'Partially Delivered', 'Delivered', 'Closed', 'Short Closed', 'Cancelled'];

export function OrderRegister() {
  const rows = useCompanyDocs<SalesOrder>(C.salesOrders);
  const s = useSession();
  const toast = useToast();
  const [confirm, setConfirm] = useState<{ kind: 'cancel' | 'delete'; so: SalesOrder } | null>(null);
  const q = useMemo(() => new Map(rows.map((r) => [r.id, orderQuantities(r)])), [rows]);
  const columns: Column<SalesOrder>[] = [
    { key: 'number', label: 'Order #', sortable: true, render: (r) => <Identifier link onClick={(e) => { e.stopPropagation(); nav.go(`sales/orders/${r.id}`); }}>{r.number}</Identifier>, value: (r) => r.number },
    { key: 'date', label: 'Date', sortable: true, render: (r) => fmtDate(r.date), value: (r) => r.date },
    { key: 'partyName', label: 'Customer', sortable: true, render: (r) => <TwoLine primary={r.partyName} secondary={r.partySnapshot?.gstin} mono />, value: (r) => r.partyName },
    { key: 'ordered', label: 'Ordered', align: 'right', sortable: true, render: (r) => <Money value={q.get(r.id)!.orderedValue} currency={r.currency} />, value: (r) => q.get(r.id)!.orderedValue, total: (rs) => <span className="money" style={{ fontWeight: 600 }}>{fmtMoney(rs.filter((x) => x.currency === s.currency).reduce((a, x) => a + q.get(x.id)!.orderedValue, 0), s.currency)}</span> },
    { key: 'reserved', label: 'Reserved', align: 'right', render: (r) => <span className="money">{q.get(r.id)!.reserved ? fmtQty(q.get(r.id)!.reserved) : '—'}</span>, value: (r) => q.get(r.id)!.reserved },
    { key: 'delivered', label: 'Delivered', align: 'right', render: (r) => <TwoLine primary={<span className="money">{fmtMoney(q.get(r.id)!.deliveredValue, r.currency)}</span>} secondary={`${fmtQty(q.get(r.id)!.delivered)} of ${fmtQty(q.get(r.id)!.ordered)}`} />, value: (r) => q.get(r.id)!.deliveredValue },
    { key: 'invoiced', label: 'Invoiced', align: 'right', render: (r) => <Money value={q.get(r.id)!.invoicedValue} currency={r.currency} />, value: (r) => q.get(r.id)!.invoicedValue },
    { key: 'pending', label: 'Pending', align: 'right', render: (r) => <Money value={q.get(r.id)!.pendingValue} currency={r.currency} tone={q.get(r.id)!.pendingValue > 0 ? 'negative' : 'none'} />, value: (r) => q.get(r.id)!.pendingValue },
    { key: 'status', label: 'Status', render: (r) => <Badge status={r.status} />, value: (r) => r.status },
    { key: 'wh', label: 'Warehouse', render: (r) => db.find<any>(C.warehouses, r.warehouseId)?.name ?? '—' },
  ];
  const rowActions = (r: SalesOrder): MenuAction[] => [
    { label: 'Open', onClick: () => nav.go(`sales/orders/${r.id}`) },
    ...(r.status === 'Draft' ? [{ label: 'Edit', onClick: () => nav.go(`sales/orders/${r.id}`, { edit: 1 }) }, { label: 'Submit', onClick: () => { try { const res = submitOrder(r.id); toast.success(res.request ? 'Submitted for approval' : `Order ${res.order.number} ${res.order.status.toLowerCase()}`); } catch (e: any) { toast.error(e.message); } } }] : []),
    ...(['Confirmed', 'Partially Delivered'].includes(r.status) ? [{ label: 'Create delivery', onClick: () => nav.go('sales/deliveries/new', { order: r.id }) }] : []),
    ...(['Confirmed', 'Partially Delivered', 'Delivered'].includes(r.status) ? [{ label: 'Create invoice', onClick: () => nav.go('sales/invoices/new', { order: r.id }) }] : []),
    ...(r.status === 'Draft' ? [{ label: 'Delete draft', danger: true, onClick: () => setConfirm({ kind: 'delete', so: r }) }] : ['Submitted', 'Approved', 'Confirmed'].includes(r.status) && q.get(r.id)!.delivered === 0 ? [{ label: 'Cancel', danger: true, onClick: () => setConfirm({ kind: 'cancel', so: r }) }] : []),
  ];
  const open = rows.filter((r) => ['Confirmed', 'Partially Delivered', 'Delivered'].includes(r.status));
  return (
    <>
      <RegisterPage<SalesOrder> title="Sales orders" subtitle={<>{open.length} open · <span className="money">{fmtMoney(open.filter((r) => r.currency === s.currency).reduce((a, r) => a + q.get(r.id)!.pendingValue, 0), s.currency)}</span> pending fulfilment · {s.branch?.name}</>} rows={rows} columns={columns} entity="sales orders" searchKeys={['number', 'partyName', 'reference']} searchPlaceholder="SO number, customer…"
        tabs={[{ id: 'all', label: 'All' }, { id: 'open', label: 'Open', filter: (r: SalesOrder) => ['Confirmed', 'Partially Delivered', 'Delivered'].includes(r.status) }, ...STATUSES.map((t) => ({ id: t, label: t, filter: (r: SalesOrder) => r.status === t }))]}
        filters={[{ key: 'wh', label: 'Warehouse', type: 'select', options: db.get<any>(C.warehouses).map((w) => ({ value: w.id, label: w.name })) }]} applyFilter={(r, f) => !f.wh || r.warehouseId === f.wh}
        primaryAction={{ label: 'New order', onClick: () => nav.go('sales/orders/new'), disabled: !s.can('sales.order.create') && !s.can('sales.order.*'), reason: 'Requires sales.order.create' }}
        onRowClick={(r) => nav.go(`sales/orders/${r.id}`)} rowActions={rowActions} />
      <ConfirmDialog open={!!confirm} onClose={() => setConfirm(null)} title={confirm?.kind === 'delete' ? 'Delete this draft?' : `Cancel order ${confirm?.so.number}?`} statement={confirm?.kind === 'delete' ? 'This cannot be undone.' : 'Reservations are released; the order stays in the register for audit.'} confirmLabel={confirm?.kind === 'delete' ? 'Delete draft' : 'Cancel order'} cancelLabel="Keep order" danger reasonRequired={confirm?.kind === 'cancel'} onConfirm={(reason) => { if (!confirm) return; if (confirm.kind === 'delete') deleteDraftOrder(confirm.so.id); else cancelOrder(confirm.so.id, reason); toast.success(confirm.kind === 'delete' ? 'Draft deleted' : 'Order cancelled'); }} />
    </>
  );
}

export function OrderForm({ id }: { id?: string }) {
  const s = useSession();
  const toast = useToast();
  const settings = useSalesSettings();
  const termOpts = usePaymentTermOptions();
  const spOpts = useSalespersonOptions();
  const plOpts = usePriceListOptions();
  const whOpts = useWarehouseOptions();
  const draft = useDocDraft<SalesOrder>(() => { if (id) { const ex = db.find<SalesOrder>(C.salesOrders, id); if (ex) return recompute(ex); } return newSalesOrder(); }, { collection: C.salesOrders, save: (d, v) => saveSalesOrder(d, { expectedVersion: v }), autosave: true });
  const { doc, set, setLines, setCustomer } = draft;
  const v = useMemo(() => validateOrder(doc), [doc]);
  const editable = ['Draft', 'Returned', 'Rejected'].includes(doc.status);
  useEffect(() => { if (!editable) nav.replace(`sales/orders/${doc.id}`); }, [editable, doc.id]);
  const maxDisc = Math.max(0, ...doc.lines.map((l) => l.discountPct || 0));
  const save = () => { try { const o = draft.save(); if (o) toast.success(`Order ${o.number} saved`); return o; } catch (e: any) { toast.error(e.message); return undefined; } };
  const submit = () => { if (v.errors.length) { draft.setErrors(v.errors.map((m) => ({ message: m }))); toast.error('Fix the highlighted issues'); return; } const o = save(); if (!o) return; try { const r = submitOrder(o.id); toast.success(r.request ? `Submitted for approval · ${r.request.ruleName}` : `Order ${r.order.number} ${r.order.status === 'Confirmed' ? 'confirmed' : 'submitted'}`); nav.go(`sales/orders/${o.id}`); } catch (e: any) { toast.error(e.message); } };
  return (
    <div className="page" style={{ maxWidth: 1180 }}>
      <PageHeader back={{ label: 'Sales orders', path: 'sales/orders' }} title={<span style={{ display: 'flex', gap: 10, alignItems: 'center' }}>{id ? doc.number : 'New sales order'} <Badge status={doc.status} /></span>} subtitle={<>{doc.number.includes('DRAFT') ? `Will be numbered ${engine.previewNumber('Sales Order')} on save` : doc.number}{doc.sourceNumber ? ` · from ${doc.sourceType} ${doc.sourceNumber}` : ''} · {s.branch?.name}</>} />
      {draft.conflict && <Banner tone="danger" action={<Button variant="link" onClick={draft.reload}>Reload</Button>}>Someone else changed this draft — reload to see their changes.</Banner>}
      {draft.errors.length > 0 && <ErrorSummary errors={draft.errors} />}
      {v.credit?.message && <Banner tone={v.credit.ok ? 'warning' : 'danger'}>{v.credit.message}{v.credit.needsApproval ? ' — submitting routes to approval as a credit exception (Override policy).' : v.credit.mode === 'Block' && !v.credit.ok ? ' — Block policy: submission is not permitted.' : ''}</Banner>}
      {v.discountBlocked && <Banner tone="warning">{v.discountBlocked}</Banner>}
      {v.warnings.filter((w) => !w.startsWith('Credit')).map((w) => <Banner key={w} tone="warning">{w}</Banner>)}
      <Card title="Customer & terms">
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr', gap: 16, alignItems: 'start' }}>
          <CustomerField doc={doc} onChange={setCustomer} />
          <PlaceOfSupplyField doc={doc} onChange={(code) => set({ placeOfSupplyCode: code, placeOfSupply: stateNameOf(code) })} />
          <SelectField label="Default warehouse" value={doc.warehouseId ?? ''} onChange={(w) => set({ warehouseId: w || undefined, lines: doc.lines.map((l) => ({ ...l, warehouseId: w || l.warehouseId })) })} options={whOpts.map((w) => ({ value: w.id, label: w.primary }))} />
          <DateField label="Order date" required value={doc.date} onChange={(d) => set({ date: d })} />
          <DateField label="Expected delivery" value={doc.expectedDate} onChange={(d) => set({ expectedDate: d })} min={doc.date} />
          <SelectField label="Payment terms" value={doc.paymentTerms ?? ''} onChange={(t) => set({ paymentTerms: t })} options={termOpts} />
          <SelectField label="Price list" value={doc.priceListId ?? ''} onChange={(p) => set({ priceListId: p || undefined })} options={plOpts} placeholder="Company default" />
          <SelectField label="Salesperson" value={doc.salespersonId ?? ''} onChange={(p) => set({ salespersonId: p || undefined })} options={spOpts} placeholder="—" />
          <TextField label="Customer PO / reference" value={doc.reference ?? ''} onChange={(r) => set({ reference: r })} />
          <CurrencyRateFields doc={doc} onChange={(p) => set(p as Partial<SalesOrder>)} />
        </div>
      </Card>
      <section>
        <div className="section-title">Lines {maxDisc > settings.salesDiscountThresholdPct && <span style={{ fontSize: 12, fontWeight: 400, color: '#8A4B0F' }}>· discount above {settings.salesDiscountThresholdPct}% needs sales.order.discount</span>}</div>
        <LineItemGrid lines={doc.lines} onChange={setLines} partyId={doc.partyId} priceListId={doc.priceListId} currency={doc.currency} totals={doc.totals} showWarehouse showBatch={false} />
      </section>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 24, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <Card title="Charges" padding={16}><ChargesEditor charges={doc.charges} onChange={(c) => set({ charges: c })} currency={doc.currency} /></Card>
          <Card title="Terms, notes & dimensions" padding={16}><div className="grid-2" style={{ marginBottom: 12 }}><TextArea label="Terms" value={doc.terms ?? ''} onChange={(t) => set({ terms: t })} rows={2} /><TextArea label="Notes" value={doc.notes ?? ''} onChange={(n) => set({ notes: n })} rows={2} /></div><DimensionsFields value={doc.dimensions} onChange={(d) => set({ dimensions: d })} /></Card>
          {draft.persisted && <Card title="Attachments" padding={16}><AttachmentsPanel objectType="Sales Order" objectId={doc.id} /></Card>}
        </div>
        <div style={{ position: 'sticky', top: 16 }}><div className="section-title">Totals</div><TotalsLadder totals={doc.totals} currency={doc.currency} baseCurrency={s.currency} rate={doc.rate} showPaid={false} /><div style={{ marginTop: 16 }}><div className="section-title">Tax breakup</div><TaxBreakup totals={doc.totals} currency={doc.currency} /></div></div>
      </div>
      <FormFooter savedAt={draft.savedAt} dirty={draft.dirty} conflict={draft.conflict} onReload={draft.reload} left={v.errors.length ? <span style={{ color: '#C0393F' }}>{v.errors.length} issue(s)</span> : undefined}>
        <Button variant="ghost" onClick={() => nav.go(id ? `sales/orders/${id}` : 'sales/orders')}>Discard changes</Button>
        <Button variant="secondary" onClick={save}>Save draft</Button>
        <Button variant="primary" onClick={submit} disabled={!!v.discountBlocked || (v.credit ? !v.credit.ok : false)} reason={v.discountBlocked ?? (v.credit && !v.credit.ok ? v.credit.message : undefined)} data-testid="submit-order">Submit order</Button>
      </FormFooter>
    </div>
  );
}

export function OrderDetail({ id }: { id: string }) {
  const so = useRecord<SalesOrder>(C.salesOrders, id);
  const s = useSession();
  const toast = useToast();
  const approvals = useCollection<ApprovalRequest>(C.approvals);
  useCollection(C.reservations); useCollection(C.stockMovements);
  const [dialog, setDialog] = useState<null | 'confirm' | 'cancel' | 'short' | 'delete' | 'release' | 'approve' | 'reject' | 'return' | 'recall'>(null);
  const [reserve, setReserve] = useState<{ line: DocLine } | null>(null);
  const [amend, setAmend] = useState(false);
  const [pdf, setPdf] = useState(false);
  const [email, setEmail] = useState(false);
  if (!so) return <EmptyState title="Order not found" action={<Button variant="primary" onClick={() => nav.go('sales/orders')}>Back</Button>} />;
  const q = orderQuantities(so);
  const req = approvals.find((a) => a.id === so.approvalId) ?? [...approvals].reverse().find((a) => a.docId === so.id);
  const canAct = req && req.status === 'Pending' ? engine.canActOnApproval(req) : { ok: false, reason: '' };
  const isRequester = req?.requesterId === s.user?.id;
  const run = (fn: () => void, ok: string) => { try { fn(); toast.success(ok); } catch (e: any) { toast.error(e.message); } };
  const act = (action: 'Approve' | 'Reject' | 'Return' | 'Recall', comment: string) => { if (!req) return; engine.actOnApproval(req.id, action, { comment }); if (action === 'Approve' && db.find<SalesOrder>(C.salesOrders, so.id)?.status === 'Approved') confirmOrder(so.id); toast.success(`${action} recorded`); };
  const open = ['Confirmed', 'Partially Delivered', 'Delivered'].includes(so.status);
  const impact = shortCloseImpact(so);
  const overflow: MenuAction[] = [];
  if (['Confirmed', 'Partially Delivered'].includes(so.status)) overflow.push({ label: 'Amend quantities / prices', onClick: () => setAmend(true), disabled: !s.can('sales.order.edit') && !s.can('sales.order.*'), reason: 'Requires sales.order.edit' });
  if (open && q.reserved > 0) overflow.push({ label: 'Release all reservations', onClick: () => setDialog('release') });
  if (open && q.delivered > 0) overflow.push({ label: 'Short-close', danger: true, onClick: () => setDialog('short'), disabled: !impact.lines.length, reason: !impact.lines.length ? 'Nothing pending' : undefined });
  if (['Submitted', 'Approved', 'Confirmed'].includes(so.status) && q.delivered === 0 && q.invoiced === 0) overflow.push({ label: 'Cancel order', danger: true, onClick: () => setDialog('cancel') });
  if (so.status === 'Draft') overflow.push({ label: 'Delete draft', danger: true, onClick: () => setDialog('delete') });
  let footer: React.ReactNode;
  if (['Draft', 'Returned', 'Rejected'].includes(so.status)) footer = <><ActionMenu actions={overflow} trigger={<Button variant="secondary">⋮</Button>} /><Button variant="secondary" onClick={() => nav.go(`sales/orders/${so.id}`, { edit: 1 })}>Edit</Button><Button variant="primary" onClick={() => run(() => { const r = submitOrder(so.id); if (r.request) toast.info(`Routed to ${r.request.ruleName}`); }, 'Order submitted')} data-testid="submit-order">Submit order</Button></>;
  else if (so.status === 'Submitted') footer = <>{isRequester && !req && <Button variant="secondary" onClick={() => run(() => db.update<SalesOrder>(C.salesOrders, so.id, { status: 'Draft' }), 'Recalled')}>Recall</Button>}{isRequester && req && <Button variant="secondary" onClick={() => setDialog('recall')}>Recall</Button>}{req && canAct.ok ? <><Button variant="secondary" onClick={() => setDialog('return')}>Return</Button><Button variant="danger" onClick={() => setDialog('reject')}>Reject</Button><Button variant="primary" onClick={() => setDialog('approve')}>Approve</Button></> : !req ? <Button variant="primary" onClick={() => setDialog('confirm')} disabled={!s.can('sales.order.approve') && !s.can('sales.order.*')} reason="Credit override needs a Sales Manager">Confirm with credit override</Button> : <span style={{ fontSize: 12, color: '#5F6368' }}>Awaiting {req.steps.find((x) => x.order === req.currentStep)?.approverLabel}</span>}</>;
  else if (so.status === 'Approved') footer = <><ActionMenu actions={overflow} trigger={<Button variant="secondary">⋮</Button>} /><Button variant="primary" onClick={() => setDialog('confirm')} data-testid="confirm-order">Confirm & reserve</Button></>;
  else if (open) footer = <><ActionMenu actions={overflow} trigger={<Button variant="secondary">⋮</Button>} /><Button variant="secondary" onClick={() => setPdf(true)}>Download PDF</Button><Button variant="secondary" onClick={() => setEmail(true)}>Send</Button>{q.pending > 0 && so.lines.some((l) => db.find<Item>(C.items, l.itemId)?.isStock) && <Button variant="secondary" onClick={() => nav.go('sales/deliveries/new', { order: so.id })} data-testid="create-delivery">Create delivery</Button>}{so.lines.some((l) => l.qty - (l.invoicedQty ?? 0) > 0.0005) && <Button variant="primary" onClick={() => nav.go('sales/invoices/new', { order: so.id })}>Create invoice</Button>}</>;
  else footer = <><Button variant="secondary" onClick={() => setPdf(true)}>Download PDF</Button></>;
  const lineCols = [
    { key: 'qty', label: 'Reserved / Delivered / Invoiced', width: 220, render: (l: DocLine) => { const lq = orderLineQuantities(l, db.find<Item>(C.items, l.itemId)); return <div style={{ fontSize: 12 }}><div>{fmtQty(lq.reserved)} · {fmtQty(lq.delivered)} · {fmtQty(lq.invoiced)}{lq.returned ? ` · ret ${fmtQty(lq.returned)}` : ''}</div><Meter value={lq.delivered} max={l.qty} tone={lq.delivered >= l.qty ? 'good' : undefined} /></div>; } },
    ...(open ? [{ key: 'res', label: '', width: 90, render: (l: DocLine) => (db.find<Item>(C.items, l.itemId)?.isStock ? <Button size="sm" variant="ghost" onClick={() => setReserve({ line: l })}>Reserve</Button> : null) }] : []),
  ];
  return (
    <>
      <DocumentPage backLabel="Sales orders" onBack={() => nav.go('sales/orders')} number={so.number} badges={<><Badge status={so.status} />{so.creditCheck?.message && <Badge status="Returned">Credit exception</Badge>}</>}
        amount={{ label: 'Order value', value: so.totals.total, currency: so.currency, base: so.currency !== s.currency ? so.totals.baseTotal : undefined, baseCurrency: s.currency, rate: so.rate }}
        rail={<SalesRail doc={so}>
          <RailSection label="Fulfilment"><div style={{ fontSize: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>{[['Reserved', q.reserved], ['Delivered', q.delivered], ['Invoiced', q.invoiced]].map(([k, v]) => <div key={String(k)}><div style={{ display: 'flex', justifyContent: 'space-between' }}><span>{k}</span><span className="money">{fmtQty(v as number)} / {fmtQty(q.ordered)}</span></div><Meter value={v as number} max={q.ordered} tone={(v as number) >= q.ordered && q.ordered > 0 ? 'good' : undefined} /></div>)}<div style={{ color: q.pending > 0 ? '#8A4B0F' : '#12784E' }}>Pending {fmtQty(q.pending)} · {fmtMoney(q.pendingValue, so.currency)}</div>{so.reservationExpiry && q.reserved > 0 && <div style={{ color: '#6E6E71' }}>Reservations expire {fmtDate(so.reservationExpiry)}</div>}</div></RailSection>
          {so.creditCheck && <RailSection label="Credit check"><div style={{ fontSize: 12, color: '#5F6368' }}>{so.creditCheck.mode} · exposure {fmtMoney(so.creditCheck.exposure)} / limit {fmtMoney(so.creditCheck.limit)}{so.creditCheck.message ? <div style={{ color: '#8A4B0F' }}>{so.creditCheck.message}</div> : null}</div></RailSection>}
        </SalesRail>}
        banner={so.status === 'Cancelled' ? <Banner tone="warning" full>Cancelled: {so.cancelReason}</Banner> : so.status === 'Short Closed' ? <Banner tone="warning" full>Short-closed: {so.shortCloseReason}</Banner> : so.status === 'Returned' && req ? <Banner tone="warning" full>Returned for changes: {req.steps.find((x) => x.status === 'Returned')?.comment}</Banner> : undefined}
        tabs={[
          { id: 'details', label: 'Details', content: <DocDetailsTab doc={so} header={[...docHeaderRows(so), { k: 'Expected delivery', v: fmtDate(so.expectedDate) }]} showWarehouse lineExtraColumns={lineCols} extra={<><ReservationsPanel sourceId={so.id} />{(so.amendments?.length ?? 0) > 0 && <section><div className="section-title">Amendments</div><Card padding={0}><table className="data-table dense"><thead><tr><th>When</th><th>By</th><th>Changes</th><th>Reason</th></tr></thead><tbody>{so.amendments!.map((a, i) => <tr key={i}><td>{fmtDate(a.at)}</td><td>{a.by}</td><td>{a.changes}</td><td>{a.reason}</td></tr>)}</tbody></table></Card></section>}</>} /> },
          { id: 'approvals', label: 'Approvals', content: <ApprovalsTab approvalId={so.approvalId} docId={so.id} /> },
          { id: 'activity', label: 'Activity', content: <ActivityTab objectId={so.id} correlationId={so.correlationId} /> },
        ]}
        footer={footer} />
      <PdfPreviewModal open={pdf} onClose={() => setPdf(false)} doc={so} title="Sales order confirmation" partyLabel="Ordered by" />
      <EmailDialog open={email} onClose={() => setEmail(false)} doc={so} collection={C.salesOrders} />
      <ConfirmDialog open={dialog === 'confirm'} onClose={() => setDialog(null)} title={`Confirm order ${so.number}?`} statement="Stock is reserved per line where available; the order becomes ready for delivery." confirmLabel="Confirm order" cancelLabel="Not yet" consequences={[{ engine: 'Stock', text: `Reservations for ${so.lines.filter((l) => db.find<Item>(C.items, l.itemId)?.isStock).length} stock line(s) · expire ${fmtDate(addDays(today(), 14))}` }, ...(so.creditCheck?.message ? [{ engine: 'Workflow', text: `Credit override: ${so.creditCheck.message}`, tone: 'warning' as const }] : [])]} onConfirm={() => run(() => confirmOrder(so.id), 'Order confirmed')} />
      <ConfirmDialog open={dialog === 'cancel'} onClose={() => setDialog(null)} title={`Cancel order ${so.number}?`} statement="Reservations are released. The order stays for audit." confirmLabel="Cancel order" cancelLabel="Keep order" danger reasonRequired consequences={[{ engine: 'Stock', text: `${fmtQty(q.reserved)} reserved units released` }]} onConfirm={(r) => run(() => cancelOrder(so.id, r), 'Order cancelled')} />
      <ConfirmDialog open={dialog === 'short'} onClose={() => setDialog(null)} title={`Short-close ${so.number}?`} statement="Pending quantities are cancelled; delivered and invoiced quantities stay as they are." confirmLabel="Short-close order" cancelLabel="Keep order open" danger reasonRequired consequences={[{ engine: 'Open items', text: `${impact.lines.length} line(s) · ${fmtMoney(impact.value, so.currency)} of pending value cancelled: ${impact.lines.map((x) => `${x.line.itemName} ${fmtQty(x.pending)}`).join(', ')}` }, { engine: 'Stock', text: `${fmtQty(impact.reserved)} reserved units released` }]} onConfirm={(r) => run(() => shortCloseOrder(so.id, r), 'Order short-closed')} />
      <ConfirmDialog open={dialog === 'release'} onClose={() => setDialog(null)} title="Release all reservations?" confirmLabel="Release reservations" cancelLabel="Keep reservations" reasonRequired onConfirm={(r) => run(() => releaseOrderReservations(so.id, r), 'Reservations released')} />
      <ConfirmDialog open={dialog === 'delete'} onClose={() => setDialog(null)} title="Delete this draft?" confirmLabel="Delete draft" cancelLabel="Keep draft" danger onConfirm={() => { deleteDraftOrder(so.id); nav.go('sales/orders'); }} />
      <ConfirmDialog open={dialog === 'approve'} onClose={() => setDialog(null)} title={`Approve ${so.number}?`} statement="The order is confirmed and stock reserved on approval." confirmLabel="Approve order" cancelLabel="Not now" reasonRequired={!!req?.steps.find((x) => x.order === req.currentStep)?.commentRequired} onConfirm={(c) => act('Approve', c)} />
      <ConfirmDialog open={dialog === 'reject'} onClose={() => setDialog(null)} title="Reject this order?" confirmLabel="Reject order" cancelLabel="Keep pending" danger reasonRequired onConfirm={(c) => act('Reject', c)} />
      <ConfirmDialog open={dialog === 'return'} onClose={() => setDialog(null)} title="Return for changes?" confirmLabel="Return order" cancelLabel="Keep pending" reasonRequired onConfirm={(c) => act('Return', c)} />
      <ConfirmDialog open={dialog === 'recall'} onClose={() => setDialog(null)} title="Recall this submission?" confirmLabel="Recall order" cancelLabel="Keep pending" onConfirm={(c) => act('Recall', c)} />
      {reserve && <ReserveLineModal so={so} line={reserve.line} onClose={() => setReserve(null)} />}
      {amend && <AmendModal so={so} onClose={() => setAmend(false)} />}
    </>
  );
}

function ReserveLineModal({ so, line, onClose }: { so: SalesOrder; line: DocLine; onClose: () => void }) {
  const toast = useToast();
  const whOpts = useWarehouseOptions();
  const [wh, setWh] = useState(line.warehouseId ?? so.warehouseId ?? '');
  const [qty, setQty] = useState(Math.max(0, line.qty - (line.deliveredQty ?? 0)));
  const [expires, setExpires] = useState(so.reservationExpiry ?? addDays(today(), 14));
  const pos = line.itemId && wh ? engine.stockPosition(line.itemId, wh) : undefined;
  const already = line.reservedQty ?? 0;
  const available = (pos?.available ?? 0) + already;
  return (
    <Modal open onClose={onClose} title={`Reserve ${line.itemName}`} description={`Ordered ${fmtQty(line.qty)} · delivered ${fmtQty(line.deliveredQty ?? 0)} · currently reserved ${fmtQty(already)}`} footer={<><Button variant="secondary" onClick={onClose}>Keep as is</Button>{already > 0 && <Button variant="danger" onClick={() => { try { reserveOrderLine(so.id, line.id, 0, wh); toast.success('Reservation released'); onClose(); } catch (e: any) { toast.error(e.message); } }}>Release</Button>}<Button variant="primary" onClick={() => { try { reserveOrderLine(so.id, line.id, qty, wh, expires); toast.success(`${fmtQty(qty)} reserved`); onClose(); } catch (e: any) { toast.error(e.message); } }} disabled={!wh || qty <= 0 || qty > available + 0.0005} reason={qty > available ? `Only ${fmtQty(available)} available` : undefined}>Reserve stock</Button></>}>
      <div className="grid-3">
        <SelectField label="Warehouse" value={wh} onChange={setWh} options={whOpts.map((w) => ({ value: w.id, label: w.primary }))} />
        <NumberField label="Quantity" value={qty} onChange={setQty} decimals={3} min={0} help={pos ? `${fmtQty(pos.onHand)} on hand · ${fmtQty(available)} available` : undefined} />
        <DateField label="Expires" value={expires} onChange={setExpires} min={today()} />
      </div>
    </Modal>
  );
}

function AmendModal({ so, onClose }: { so: SalesOrder; onClose: () => void }) {
  const toast = useToast();
  const [lines, setLines] = useState<DocLine[]>(so.lines);
  const [reason, setReason] = useState('');
  const preview = recompute({ ...so, lines });
  return (
    <Modal open onClose={onClose} title={`Amend ${so.number}`} description="Only unfulfilled quantities can change; delivered or invoiced quantities set the floor." width={900} footer={<><Button variant="secondary" onClick={onClose}>Discard</Button><Button variant="primary" onClick={() => { try { amendOrder(so.id, lines, reason); toast.success('Order amended'); onClose(); } catch (e: any) { toast.error(e.message); } }} disabled={reason.trim().length < 10}>Record amendment</Button></>}>
      <LineItemGrid lines={lines} onChange={setLines} partyId={so.partyId} priceListId={so.priceListId} currency={so.currency} totals={preview.totals} showWarehouse extraColumns={[{ key: 'floor', label: 'Fulfilled', render: (l) => <span style={{ fontSize: 12 }}>{fmtQty(Math.max(l.deliveredQty ?? 0, l.invoicedQty ?? 0))}</span>, width: 80 }]} />
      <div style={{ marginTop: 12 }}><SummaryBlock items={[{ label: 'Before', value: fmtMoney(so.totals.total, so.currency) }, { label: 'After', value: fmtMoney(preview.totals.total, so.currency), tone: preview.totals.total !== so.totals.total ? 'warn' : undefined }]} /></div>
      <div style={{ marginTop: 12 }}><ReasonField value={reason} onChange={setReason} /></div>
    </Modal>
  );
}

export { KV };
