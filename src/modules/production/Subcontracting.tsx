// Subcontracting — register, order form, detail with send / PO / receive / close (FR-MFG-014).
import { useMemo, useState } from 'react';
import { db, C, engine, nav, useCollection, useRecord, useSession } from '../../store';
import type { Item } from '../../store';
import { RegisterPage, PageHeader, Button, Badge, Pill, NumberField, DateField, SelectField, TextArea, EntityPicker, useSupplierOptions, ScopeLine, SummaryBlock, DataTable, KV, useToast, PeriodBanner, EmptyState, ActivityTab, Modal, type Column } from '../../components/ui';
import { fmtDate, fmtDateTime, fmtMoney, fmtQty, today, addDays } from '../../lib/format';
import type { ProductionOrder, SubcontractOrder } from './types';
import { batchesOnHand, mfgSettings, whName } from './core';
import { cancelSubcontract, closeSubcontract, createSubcontract, createServicePo, receiveProcessed, sendMaterials, serviceItems } from './subcontractActions';
import { useConfirm, SectionCard, OrderLink, ItemLink, JournalLink, DocLink } from './shared';

export function SubcontractingPage({ id, params }: { id?: string; params: Record<string, string> }) {
  if (id === 'new') return <SubcontractForm orderId={params.order} opId={params.op} />;
  if (id) return <SubcontractDetail id={id} />;
  return <SubcontractRegister />;
}

function SubcontractRegister() {
  const s = useSession();
  const cid = s.state.companyId;
  const subs = useCollection<SubcontractOrder>(C.subcontractOrders).filter((x) => x.companyId === cid);
  const toast = useToast();
  const confirm = useConfirm();
  const rows = useMemo(() => subs.slice().sort((a, b) => b.date.localeCompare(a.date) || b.number.localeCompare(a.number)), [subs]);
  const columns: Column<SubcontractOrder>[] = [
    { key: 'number', label: 'Order', sortable: true, render: (x) => <span className="identifier link" style={{ fontWeight: 500 }}>{x.number}</span> },
    { key: 'date', label: 'Date', sortable: true, render: (x) => fmtDate(x.date) },
    { key: 'supplierName', label: 'Subcontractor', sortable: true, render: (x) => <div><div>{x.supplierName}</div><div className="cell-secondary">{x.operationName}</div></div> },
    { key: 'orderNumber', label: 'Production order', render: (x) => x.orderNumber ? <OrderLink id={x.orderId} number={x.orderNumber} /> : <span style={{ color: 'var(--ink-3)' }}>Standalone</span> },
    { key: 'qty', label: 'Qty', align: 'right', render: (x) => <span className="money">{fmtQty(x.receivedQty, undefined, 3)} / {fmtQty(x.qty, undefined, 3)}</span> },
    { key: 'itemsSent', label: 'Materials sent', render: (x) => <span style={{ fontSize: 12 }}>{x.itemsSent.map((l) => `${l.itemName} ${fmtQty(l.qty, l.uom, 3)}`).join(', ') || '—'}</span> },
    { key: 'rate', label: 'Rate', align: 'right', render: (x) => <span className="money">{fmtMoney(x.rate, s.currency)}</span> },
    { key: 'charges', label: 'Charges', align: 'right', render: (x) => <span className="money">{fmtMoney(x.charges, s.currency)}</span>, total: (r) => <span className="money">{fmtMoney(r.reduce((a, x) => a + x.charges, 0), s.currency)}</span> },
    { key: 'variance', label: 'Consumption variance', align: 'right', render: (x) => { const v = x.consumptionVariance.reduce((a, y) => a + y.value, 0); return <span className="money" style={{ color: v > 0 ? 'var(--danger)' : undefined }}>{v ? fmtMoney(v, s.currency) : '—'}</span>; } },
    { key: 'expectedDate', label: 'Expected', render: (x) => <span style={{ fontSize: 12 }}>{fmtDate(x.expectedDate)}{x.status === 'Sent' && x.expectedDate < today() && <Pill tone="critical">Late</Pill>}</span> },
    { key: 'status', label: 'Status', render: (x) => <Badge status={x.status === 'Sent' ? 'In Transit' : x.status} /> },
  ];
  return (
    <>
      <RegisterPage title="Subcontracting" subtitle={<ScopeLine extra={`${subs.filter((x) => x.status === 'Sent' || x.status === 'Partially Received').length} open at subcontractors · ${fmtMoney(subs.reduce((a, x) => a + x.charges, 0), s.currency)} charges`} />}
        rows={rows} columns={columns} entity="subcontract orders" searchKeys={['number', 'supplierName', 'operationName', 'orderNumber']}
        tabs={[{ id: 'all', label: 'All' }, { id: 'draft', label: 'Draft', filter: (x) => x.status === 'Draft' }, { id: 'sent', label: 'At subcontractor', filter: (x) => x.status === 'Sent' || x.status === 'Partially Received' }, { id: 'received', label: 'Received', filter: (x) => x.status === 'Received' }, { id: 'closed', label: 'Closed', filter: (x) => x.status === 'Closed' }]}
        primaryAction={{ label: 'New subcontract order', onClick: () => nav.go('production/subcontracting/new') }}
        onRowClick={(x) => nav.go(`production/subcontracting/${x.id}`)}
        rowActions={(x) => [{ label: 'Open', onClick: () => nav.go(`production/subcontracting/${x.id}`) }, { label: 'Open production order', onClick: () => nav.go(`production/orders/${x.orderId}`), disabled: !x.orderId }, { label: 'Cancel', danger: true, onClick: () => confirm.open({ title: `Cancel ${x.number}?`, reasonRequired: true, confirmLabel: 'Cancel order', danger: true, onConfirm: (r) => { cancelSubcontract(x.id, r); toast.success('Cancelled'); } }), disabled: x.status !== 'Draft', reason: x.status !== 'Draft' ? 'Materials already sent' : undefined }]} />
      {confirm.dialog}
    </>
  );
}

function SubcontractForm({ orderId, opId }: { orderId?: string; opId?: string }) {
  const s = useSession();
  const toast = useToast();
  const cid = s.state.companyId;
  const orders = useCollection<ProductionOrder>(C.productionOrders).filter((o) => o.companyId === cid && ['Released', 'In Progress', 'Partially Completed'].includes(o.status));
  const suppliers = useSupplierOptions();
  const services = serviceItems();
  const settings = mfgSettings();
  const [oid, setOid] = useState(orderId ?? '');
  const [op, setOp] = useState(opId ?? '');
  const order = orders.find((o) => o.id === oid);
  const operation = order?.operations.find((x) => x.id === op);
  const [supplierId, setSupplierId] = useState('');
  const [serviceItemId, setServiceItemId] = useState('');
  const [rate, setRate] = useState(0);
  const [qty, setQty] = useState(0);
  const [expectedDate, setExpectedDate] = useState(addDays(today(), 7));
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<{ itemId: string; qty: number; batch?: string }[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loadedFor, setLoadedFor] = useState('');
  const key = `${oid}:${op}`;
  if (order && loadedFor !== key) {
    setLoadedFor(key);
    const o = operation ?? order.operations.find((x) => x.subcontract);
    if (o) { setOp(o.id); setSupplierId(o.supplierId ?? supplierId); setServiceItemId(o.serviceItemId ?? serviceItemId); setRate(o.subcontractRate ?? rate); }
    setQty(order.qty - order.receivedQty - order.scrapQty);
    setLines(order.components.filter((c) => !c.isPhantom && c.issuedQty - c.returnedQty - c.consumedQty < c.plannedQty).slice(0, 2).map((c) => { const whId = c.warehouseId ?? order.rmWarehouseId; const b = batchesOnHand(c.itemId, whId); return { itemId: c.itemId, qty: Math.round((c.plannedQty - c.issuedQty) * 1000) / 1000, batch: b[0]?.batch }; }));
  }
  const setLine = (i: number, patch: Partial<{ itemId: string; qty: number; batch?: string }>) => setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const submit = () => {
    try {
      const sc = createSubcontract({ supplierId, orderId: oid || undefined, operationId: op || undefined, operationName: operation?.name ?? 'Job work', serviceItemId, rate, qty, expectedDate, items: lines.filter((l) => l.itemId && l.qty > 0), notes });
      toast.success(`${sc.number} created — send materials next`);
      nav.go(`production/subcontracting/${sc.id}`);
    } catch (e: any) { setErr(e.message); }
  };
  return (
    <div className="page">
      <PageHeader title="New subcontract order" subtitle="Send materials to a subcontractor for an outsourced operation" back={{ label: 'Subcontracting', path: 'production/subcontracting' }}
        actions={<><Button onClick={() => nav.go('production/subcontracting')}>Cancel</Button><Button variant="primary" onClick={submit}>Create subcontract order</Button></>} />
      {err && <div className="banner danger">{err}</div>}
      <SectionCard title="Order">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          <SelectField label="Production order" value={oid} onChange={setOid} options={[{ value: '', label: '— standalone job work —' }, ...orders.map((o) => ({ value: o.id, label: `${o.number} · ${o.itemName}` }))]} />
          <SelectField label="Operation" value={op} onChange={(v) => { setOp(v); const o = order?.operations.find((x) => x.id === v); if (o) { setSupplierId(o.supplierId ?? supplierId); setServiceItemId(o.serviceItemId ?? serviceItemId); setRate(o.subcontractRate ?? rate); } }} options={[{ value: '', label: '— none —' }, ...(order?.operations ?? []).map((x) => ({ value: x.id, label: `${x.seq} · ${x.name}${x.subcontract ? ' (subcontract)' : ''}` }))]} disabled={!order} />
          <EntityPicker label="Subcontractor" required value={supplierId || undefined} onChange={(v) => setSupplierId(v ?? '')} options={suppliers} />
          <DateField label="Expected back" value={expectedDate} onChange={setExpectedDate} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginTop: 12 }}>
          <SelectField label="Service item" required value={serviceItemId} onChange={(v) => { setServiceItemId(v); setRate(services.find((x) => x.id === v)?.purchasePrice ?? rate); }} options={services.map((x) => ({ value: x.id, label: `${x.name} · ${x.code}` }))} placeholder="Pick a service" allowEmpty />
          <NumberField label="Rate per unit" value={rate} onChange={setRate} decimals={2} prefix="₹" />
          <NumberField label="Quantity to process" value={qty} onChange={setQty} decimals={3} suffix={order?.uom} />
          <div><label className="field-label">Charge value</label><div style={{ fontSize: 15, fontWeight: 600, paddingTop: 6 }} className="money">{fmtMoney(rate * qty, s.currency)}</div></div>
        </div>
      </SectionCard>
      <SectionCard title="Materials to send" padding={0}>
        <table className="data-table dense"><thead><tr><th style={{ width: 300 }}>Item</th><th className="right" style={{ width: 120 }}>Qty</th><th style={{ width: 200 }}>Batch</th><th>From</th><th className="right">Value</th><th style={{ width: 40 }} /></tr></thead><tbody>
          {lines.map((l, i) => { const it = db.find<Item>(C.items, l.itemId); const whId = order?.rmWarehouseId ?? settings.rmWarehouseId; const pos = engine.stockPosition(l.itemId, whId, { batch: l.batch }); return (
            <tr key={i}>
              <td><EntityPicker value={l.itemId || undefined} onChange={(v) => setLine(i, { itemId: v ?? '' })} options={db.where<Item>(C.items, (x) => x.isStock && x.status === 'Active').map((x) => ({ id: x.id, primary: x.name, secondary: x.code, raw: x }))} size="grid" /></td>
              <td><NumberField value={l.qty} onChange={(v) => setLine(i, { qty: v })} decimals={3} size="grid" /></td>
              <td>{it?.tracking === 'Batch' ? <SelectField value={l.batch ?? ''} onChange={(v) => setLine(i, { batch: v || undefined })} options={[{ value: '', label: 'Pick batch…' }, ...batchesOnHand(l.itemId, whId).map((b) => ({ value: b.batch, label: `${b.batch} · ${fmtQty(b.qty, undefined, 3)}` }))]} size="grid" /> : <span style={{ fontSize: 12, color: 'var(--ink-5)' }}>Not tracked</span>}</td>
              <td style={{ fontSize: 12 }}>{whName(whId)}<div className="cell-secondary">{fmtQty(pos.available, undefined, 3)} available</div></td>
              <td className="right money">{fmtMoney(l.qty * pos.avgRate, s.currency)}</td>
              <td><button type="button" className="btn-icon" onClick={() => setLines(lines.filter((_, j) => j !== i))}>✕</button></td>
            </tr>); })}
          {lines.length === 0 && <tr><td colSpan={6} style={{ padding: 16, color: 'var(--ink-3)' }}>Add the materials the subcontractor will process.</td></tr>}
        </tbody></table>
        <div style={{ padding: 10 }}><Button size="sm" onClick={() => setLines([...lines, { itemId: '', qty: 0 }])}>+ Add material</Button></div>
      </SectionCard>
      <SectionCard title="Notes"><TextArea value={notes} onChange={setNotes} rows={2} /></SectionCard>
    </div>
  );
}

function SubcontractDetail({ id }: { id: string }) {
  const s = useSession();
  const sc = useRecord<SubcontractOrder>(C.subcontractOrders, id);
  const toast = useToast();
  const confirm = useConfirm();
  const [receiving, setReceiving] = useState(false);
  if (!sc) return <EmptyState title="Subcontract order not found" action={<Button onClick={() => nav.go('production/subcontracting')}>Back</Button>} />;
  const order = db.find<ProductionOrder>(C.productionOrders, sc.orderId);
  const run = (fn: () => unknown, msg: string) => { try { fn(); toast.success(msg); } catch (e: any) { toast.error(e.message); } };
  const atSupplier = sc.itemsSent.map((l) => { const consumed = sc.received.reduce((a, r) => a + r.consumed.filter((x) => x.itemId === l.itemId).reduce((b, x) => b + x.qty, 0), 0); const returned = sc.received.reduce((a, r) => a + r.returned.filter((x) => x.itemId === l.itemId).reduce((b, x) => b + x.qty, 0), 0); const written = sc.consumptionVariance.filter((v) => v.itemId === l.itemId).reduce((a, v) => a + v.variance, 0); return { ...l, consumed, returned, remaining: Math.round((l.qty - consumed - returned - written) * 1000) / 1000 }; });
  const varianceValue = sc.consumptionVariance.reduce((a, v) => a + v.value, 0);
  return (
    <div className="page">
      <PageHeader title={sc.number} subtitle={`${sc.supplierName} · ${sc.operationName} · ${fmtQty(sc.receivedQty, undefined, 3)} of ${fmtQty(sc.qty, undefined, 3)} received${sc.orderNumber ? ` · ${sc.orderNumber}` : ''}`} back={{ label: 'Subcontracting', path: 'production/subcontracting' }}
        actions={<>
          <Badge status={sc.status === 'Sent' ? 'In Transit' : sc.status} />
          {sc.status === 'Draft' && <Button variant="primary" onClick={() => confirm.open({ title: `Send materials for ${sc.number}?`, statement: `${sc.itemsSent.length} line(s) move to "At Subcontractor" and stay on your books.`, consequences: [{ engine: 'Stock', text: `Subcontract Out movements from ${whName(sc.sendWarehouseId)} to At Subcontractor` }], confirmLabel: 'Send materials', onConfirm: () => { sendMaterials(sc.id); toast.success('Materials sent'); } })}>Send materials</Button>}
          <Button disabled={!!sc.poId} reason={sc.poId ? `PO ${sc.poNumber} exists` : undefined} onClick={() => run(() => { const po = createServicePo(sc.id); toast.success(`Draft PO ${po.number} created`); }, 'PO created')}>Create service PO</Button>
          {(sc.status === 'Sent' || sc.status === 'Partially Received') && <Button variant="primary" onClick={() => setReceiving(true)}>Receive processed</Button>}
          {sc.status === 'Received' && <Button variant="primary" onClick={() => run(() => closeSubcontract(sc.id), `${sc.number} closed`)}>Close</Button>}
        </>} />
      {sc.status === 'Sent' && sc.expectedDate < today() && <div className="banner warning">Overdue — expected back {fmtDate(sc.expectedDate)}.</div>}
      {sc.status === 'Cancelled' && <div className="banner danger">Cancelled: {sc.cancelReason}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 16, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <SectionCard title="Materials at the subcontractor" padding={0}>
            <table className="data-table dense"><thead><tr><th>Item</th><th className="right">Sent</th><th className="right">Consumed</th><th className="right">Returned</th><th className="right">Still there</th><th>Batch</th><th className="right">Rate</th><th className="right">Value sent</th></tr></thead><tbody>
              {atSupplier.map((l) => <tr key={l.id}><td><ItemLink id={l.itemId} name={l.itemName} /></td><td className="right money">{fmtQty(l.qty, l.uom, 3)}</td><td className="right money">{fmtQty(l.consumed, undefined, 3)}</td><td className="right money">{l.returned ? fmtQty(l.returned, undefined, 3) : '—'}</td><td className="right money">{fmtQty(l.remaining, undefined, 3)}</td><td className="identifier" style={{ fontSize: 12 }}>{l.batch ?? '—'}</td><td className="right money">{fmtMoney(l.rate, s.currency)}</td><td className="right money">{fmtMoney(l.qty * l.rate, s.currency)}</td></tr>)}
            </tbody></table>
          </SectionCard>
          {sc.received.length > 0 && (
            <SectionCard title={`Receipts (${sc.received.length})`} padding={0}>
              <table className="data-table dense"><thead><tr><th>Date</th><th className="right">Qty processed</th><th>Consumed</th><th>Returned</th><th className="right">Charge</th><th>Journal</th><th>By</th></tr></thead><tbody>
                {sc.received.map((r) => <tr key={r.id}><td>{fmtDate(r.date)}</td><td className="right money">{fmtQty(r.qty, undefined, 3)}</td><td style={{ fontSize: 12 }}>{r.consumed.map((x) => `${db.find<Item>(C.items, x.itemId)?.name} ${fmtQty(x.qty, undefined, 3)}`).join(', ') || '—'}</td><td style={{ fontSize: 12 }}>{r.returned.map((x) => `${db.find<Item>(C.items, x.itemId)?.name} ${fmtQty(x.qty, undefined, 3)}`).join(', ') || '—'}</td><td className="right money">{fmtMoney(r.charge, s.currency)}</td><td><JournalLink id={r.journalId} /></td><td>{r.by}</td></tr>)}
              </tbody></table>
            </SectionCard>
          )}
          {sc.consumptionVariance.length > 0 && (
            <SectionCard title="Consumption variance" padding={0}>
              <table className="data-table dense"><thead><tr><th>Item</th><th className="right">Sent</th><th className="right">Consumed</th><th className="right">Returned</th><th className="right">Variance</th><th className="right">Value</th></tr></thead><tbody>
                {sc.consumptionVariance.map((v) => <tr key={v.itemId}><td><ItemLink id={v.itemId} name={v.itemName} /></td><td className="right money">{fmtQty(v.sent, undefined, 3)}</td><td className="right money">{fmtQty(v.consumed, undefined, 3)}</td><td className="right money">{fmtQty(v.returned, undefined, 3)}</td><td className="right money" style={{ color: v.variance > 0 ? 'var(--danger)' : 'var(--good)' }}>{fmtQty(v.variance, undefined, 3)}</td><td className="right money">{fmtMoney(v.value, s.currency)}</td></tr>)}
              </tbody><tfoot><tr><td colSpan={5}>Written off to Production Variances 5710</td><td className="right money">{fmtMoney(varianceValue, s.currency)}</td></tr></tfoot></table>
            </SectionCard>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <SectionCard title="Order">
            <KV items={[{ k: 'Subcontractor', v: <span className="link" onClick={() => nav.go(`masters/suppliers/${sc.supplierId}`)}>{sc.supplierName}</span> }, { k: 'Operation', v: sc.operationName }, { k: 'Production order', v: sc.orderNumber ? <OrderLink id={sc.orderId} number={sc.orderNumber} /> : '—' }, { k: 'Service item', v: sc.serviceItemName }, { k: 'Rate', v: fmtMoney(sc.rate, s.currency) }, { k: 'Qty', v: `${fmtQty(sc.receivedQty, undefined, 3)} / ${fmtQty(sc.qty, undefined, 3)}` }, { k: 'Expected', v: fmtDate(sc.expectedDate) }, { k: 'Sent', v: sc.sentAt ? fmtDateTime(sc.sentAt) : 'Not sent' }, { k: 'Service PO', v: sc.poNumber ? <DocLink path={`purchase/orders/${sc.poId}`} number={sc.poNumber} /> : '—' }, { k: 'Notes', v: sc.notes ?? '—' }]} />
          </SectionCard>
          <SectionCard title="Cost effect">
            <SummaryBlock style={{ flexDirection: 'column', gap: 6 }} items={[{ label: 'Charges (Dr WIP / Cr AP)', value: fmtMoney(sc.charges, s.currency) }, { label: 'Materials consumed to WIP', value: fmtMoney(sc.received.reduce((a, r) => a + r.consumed.reduce((b, x) => b + x.qty * (sc.itemsSent.find((l) => l.itemId === x.itemId)?.rate ?? 0), 0), 0), s.currency) }, { label: 'Consumption variance', value: fmtMoney(varianceValue, s.currency), tone: varianceValue ? 'danger' : undefined }]} />
            {order && <div style={{ marginTop: 8, fontSize: 12, color: 'var(--ink-4)' }}>Reflected in {order.number} costing under Subcontract.</div>}
          </SectionCard>
          <SectionCard title="Activity"><ActivityTab objectId={sc.id} correlationId={sc.correlationId} /></SectionCard>
        </div>
      </div>
      {receiving && <ReceiveModal sc={sc} atSupplier={atSupplier} onClose={() => setReceiving(false)} />}
      {confirm.dialog}
    </div>
  );
}

function ReceiveModal({ sc, atSupplier, onClose }: { sc: SubcontractOrder; atSupplier: { itemId: string; itemName: string; uom: string; remaining: number }[]; onClose: () => void }) {
  const s = useSession();
  const toast = useToast();
  const remaining = Math.round((sc.qty - sc.receivedQty) * 1000) / 1000;
  const [qty, setQty] = useState(remaining);
  const [date, setDate] = useState(today());
  const [consumed, setConsumed] = useState<Record<string, number>>(Object.fromEntries(atSupplier.map((l) => [l.itemId, l.remaining])));
  const [returned, setReturned] = useState<Record<string, number>>({});
  const [err, setErr] = useState<string | null>(null);
  const submit = () => {
    try {
      receiveProcessed(sc.id, { qty, date, consumed: Object.entries(consumed).map(([itemId, q]) => ({ itemId, qty: q })).filter((x) => x.qty > 0), returned: Object.entries(returned).map(([itemId, q]) => ({ itemId, qty: q })).filter((x) => x.qty > 0) });
      toast.success(`${fmtQty(qty, undefined, 3)} received · charge ${fmtMoney(sc.rate * qty, s.currency)} posted to WIP`);
      onClose();
    } catch (e: any) { setErr(e.message); }
  };
  return (
    <Modal open onClose={onClose} title={`Receive processed goods · ${sc.number}`} description={`${sc.supplierName} · ${sc.operationName} · ${fmtQty(remaining, undefined, 3)} still due`} width={720}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" tone="good" onClick={submit}>Receive & post charges</Button></>}>
      {err && <div className="banner danger" style={{ marginBottom: 12 }}>{err}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
        <NumberField label="Quantity processed" value={qty} onChange={setQty} decimals={3} max={remaining} />
        <DateField label="Date" value={date} onChange={setDate} checkPeriod />
        <div><label className="field-label">Charge</label><div className="money" style={{ fontSize: 15, fontWeight: 600, paddingTop: 6 }}>{fmtMoney(sc.rate * qty, s.currency)}</div></div>
      </div>
      <div style={{ marginTop: 14 }}>
        <div className="section-title">Material reconciliation</div>
        <table className="data-table dense"><thead><tr><th>Item</th><th className="right">At subcontractor</th><th className="right" style={{ width: 120 }}>Consumed</th><th className="right" style={{ width: 120 }}>Returned</th><th className="right">Variance</th></tr></thead><tbody>
          {atSupplier.map((l) => { const c = consumed[l.itemId] ?? 0; const r = returned[l.itemId] ?? 0; const v = Math.round((l.remaining - c - r) * 1000) / 1000; return (
            <tr key={l.itemId}><td>{l.itemName}</td><td className="right money">{fmtQty(l.remaining, l.uom, 3)}</td>
              <td><NumberField value={c} onChange={(x) => setConsumed({ ...consumed, [l.itemId]: x })} decimals={3} size="grid" /></td>
              <td><NumberField value={r} onChange={(x) => setReturned({ ...returned, [l.itemId]: x })} decimals={3} size="grid" /></td>
              <td className="right money" style={{ color: v > 0 ? 'var(--danger)' : undefined }}>{fmtQty(v, undefined, 3)}</td></tr>); })}
        </tbody></table>
        <div style={{ marginTop: 8, fontSize: 12, color: 'var(--ink-4)' }}>Consumed material moves into WIP; returned material goes back to your warehouse. On the final receipt any remaining quantity is written off to Production Variances.</div>
      </div>
    </Modal>
  );
}
