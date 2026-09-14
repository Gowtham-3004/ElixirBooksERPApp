// Production receipts — register, output form (lots/serials, by-products, scrap, QC hold), detail (FR-MFG-009/010).
import { useMemo, useState } from 'react';
import { db, C, nav, useCollection, useRecord, useSession } from '../../store';
import type { Item } from '../../store';
import { RegisterPage, PageHeader, Button, Badge, Pill, NumberField, DateField, SelectField, TextField, TextArea, Toggle, CheckboxField, EntityPicker, useWarehouseOptions, ScopeLine, SummaryBlock, DataTable, KV, useToast, PeriodBanner, EmptyState, ActivityTab, AccountingTab, Explain, type Column } from '../../components/ui';
import { fmtDate, fmtDateTime, fmtMoney, fmtQty, today } from '../../lib/format';
import type { Bom, ProductionOrder, ProductionReceipt } from './types';
import { mfgSettings, nextLotNumber, nextSerials, receiptUnitCost, whName } from './core';
import { backflushLines } from './issueActions';
import { postReceipt, receiptReversalCheck, remainingQty, reverseReceipt } from './receiptActions';
import { useConfirm, SectionCard, OrderLink, ItemLink, JournalLink, SCRAP_REASONS } from './shared';

export function ReceiptsPage({ id, params }: { id?: string; params: Record<string, string> }) {
  if (id === 'new') return <ReceiptForm orderId={params.order} backflush={params.backflush === '1'} />;
  if (id) return <ReceiptDetail id={id} />;
  return <ReceiptRegister />;
}

function ReceiptRegister() {
  const s = useSession();
  const cid = s.state.companyId;
  const receipts = useCollection<ProductionReceipt>(C.productionReceipts).filter((r) => r.companyId === cid);
  const orders = useCollection<ProductionOrder>(C.productionOrders);
  const toast = useToast();
  const confirm = useConfirm();
  const rows = useMemo(() => receipts.slice().sort((a, b) => b.date.localeCompare(a.date) || b.number.localeCompare(a.number)), [receipts]);
  const open = orders.filter((o) => o.companyId === cid && ['Released', 'In Progress', 'Partially Completed'].includes(o.status));
  const columns: Column<ProductionReceipt>[] = [
    { key: 'number', label: 'Receipt', sortable: true, render: (r) => <span className="identifier link" style={{ fontWeight: 500 }}>{r.number}</span> },
    { key: 'date', label: 'Date', sortable: true, render: (r) => fmtDate(r.date) },
    { key: 'orderNumber', label: 'Order', render: (r) => <OrderLink id={r.orderId} number={r.orderNumber} /> },
    { key: 'itemName', label: 'Item', render: (r) => <div><div>{r.itemName}</div><div className="cell-secondary identifier">{r.itemCode}</div></div> },
    { key: 'qty', label: 'Good qty', align: 'right', sortable: true, render: (r) => <span className="money">{fmtQty(r.qty, r.uom, 3)}</span>, total: (rs) => <span className="money">{fmtQty(rs.filter((x) => x.status === 'Posted').reduce((a, x) => a + x.qty, 0), undefined, 3)}</span> },
    { key: 'scrapQty', label: 'Scrap', align: 'right', render: (r) => <span className="money" style={{ color: r.scrapQty ? 'var(--danger)' : undefined }}>{r.scrapQty || '—'}</span> },
    { key: 'batch', label: 'Lot / serials', render: (r) => <span className="identifier" style={{ fontSize: 12 }}>{r.batch ?? (r.serials?.length ? `${r.serials.length} serial(s)` : '—')}</span> },
    { key: 'warehouseId', label: 'Warehouse', render: (r) => whName(r.warehouseId) },
    { key: 'unitCost', label: 'Unit cost', align: 'right', render: (r) => <span className="money">{fmtMoney(r.unitCost, s.currency)}<div className="cell-secondary">{r.costBasis}</div></span> },
    { key: 'value', label: 'Value', align: 'right', render: (r) => <span className="money">{fmtMoney(r.value, s.currency)}</span>, total: (rs) => <span className="money">{fmtMoney(rs.filter((x) => x.status === 'Posted').reduce((a, x) => a + x.value, 0), s.currency)}</span> },
    { key: 'status', label: 'Status', render: (r) => <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><Badge status={r.status} />{r.qcRequired && r.status === 'Hold' && <Pill tone="warning">QC</Pill>}</span> },
  ];
  return (
    <>
      <RegisterPage title="Production receipts" subtitle={<ScopeLine extra={`${receipts.filter((r) => r.status === 'Hold').length} on QC hold · ${fmtMoney(receipts.filter((r) => r.status === 'Posted').reduce((a, r) => a + r.value, 0), s.currency)} output value`} />}
        rows={rows} columns={columns} entity="receipts" searchKeys={['number', 'orderNumber', 'itemName', 'batch']}
        tabs={[{ id: 'all', label: 'All' }, { id: 'hold', label: 'QC hold', filter: (r) => r.status === 'Hold' }, { id: 'posted', label: 'Posted', filter: (r) => r.status === 'Posted' }, { id: 'scrap', label: 'With scrap', filter: (r) => r.scrapQty > 0 }, { id: 'reversed', label: 'Reversed', filter: (r) => r.status === 'Reversed' }]}
        primaryAction={{ label: 'Record output', onClick: () => nav.go('production/receipts/new'), disabled: open.length === 0, reason: open.length === 0 ? 'No released production orders' : undefined }}
        onRowClick={(r) => nav.go(`production/receipts/${r.id}`)}
        rowActions={(r) => [{ label: 'Open order', onClick: () => nav.go(`production/orders/${r.orderId}`) }, { label: 'Open inspection', onClick: () => nav.go(`production/quality/${r.inspectionId}`), disabled: !r.inspectionId, reason: !r.inspectionId ? 'No inspection' : undefined }, { label: 'Genealogy', onClick: () => nav.go('production/genealogy', { q: r.batch ?? r.serials?.[0] ?? '' }), disabled: !r.batch && !r.serials?.length }, { label: 'Reverse receipt', danger: true, onClick: () => confirm.open({ title: `Reverse ${r.number}?`, reasonRequired: true, danger: true, confirmLabel: 'Reverse receipt', consequences: [{ engine: 'Stock', text: 'Output removed from stock, components returned to WIP' }, { engine: 'Journal', text: 'Linked reversal journals' }], onConfirm: (reason) => { reverseReceipt(r.id, reason); toast.success(`${r.number} reversed`); } }), disabled: !receiptReversalCheck(r).ok, reason: receiptReversalCheck(r).reason }]} />
      {confirm.dialog}
    </>
  );
}

function ReceiptForm({ orderId, backflush }: { orderId?: string; backflush?: boolean }) {
  const s = useSession();
  const toast = useToast();
  const cid = s.state.companyId;
  const settings = mfgSettings();
  const orders = useCollection<ProductionOrder>(C.productionOrders).filter((o) => o.companyId === cid && ['Released', 'In Progress', 'Partially Completed'].includes(o.status));
  const whs = useWarehouseOptions().filter((w) => w.raw?.type === 'Standard');
  const [oid, setOid] = useState(orderId ?? orders[0]?.id ?? '');
  const order = useRecord<ProductionOrder>(C.productionOrders, oid);
  const [date, setDate] = useState(today());
  const [qty, setQty] = useState(0);
  const [scrapQty, setScrapQty] = useState(0);
  const [scrapReason, setScrapReason] = useState('');
  const [batch, setBatch] = useState('');
  const [serials, setSerials] = useState('');
  const [whId, setWhId] = useState('');
  const [qc, setQc] = useState(settings.qcRequiredForFG);
  const [bf, setBf] = useState(!!backflush || settings.backflushDefault);
  const [byProducts, setByProducts] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [loadedFor, setLoadedFor] = useState('');
  const remaining = order ? remainingQty(order) : 0;
  const bom = db.find<Bom>(C.boms, order?.bomId);
  if (order && loadedFor !== order.id) {
    setLoadedFor(order.id);
    setQty(remaining);
    setWhId(order.warehouseId);
    setBatch(order.tracking === 'Batch' ? nextLotNumber(order) : '');
    setSerials(order.tracking === 'Serial' ? nextSerials(order, remaining).join(', ') : '');
    setByProducts(Object.fromEntries((bom?.byProducts ?? []).map((b) => [b.itemId, Math.round(b.qty * remaining * 1000) / 1000])));
  }
  const total = qty + scrapQty;
  const uc = order ? receiptUnitCost(order, qty, scrapQty) : { unitCost: 0, basis: 'Actual' as const, explanation: '' };
  const bfLines = order && bf ? backflushLines(order, total) : [];
  const submit = () => {
    if (!order) { setErr('Choose a production order'); return; }
    try {
      const r = postReceipt(order.id, { qty, scrapQty, scrapReason: scrapReason || undefined, batch: batch || undefined, serials: serials ? serials.split(',').map((x) => x.trim()).filter(Boolean) : undefined, warehouseId: whId, byProducts: Object.entries(byProducts).map(([itemId, q]) => ({ itemId, qty: q })), qcRequired: qc, backflush: bf, date, notes });
      toast.success(r.status === 'Hold' ? `${r.number} recorded and held for QC (${r.inspectionNumber})` : `${r.number} posted · ${fmtQty(r.qty, r.uom, 3)} into ${whName(r.warehouseId)}`, { label: 'Open', path: `production/receipts/${r.id}` });
      nav.go(r.status === 'Hold' && r.inspectionId ? `production/quality/${r.inspectionId}` : `production/orders/${order.id}?tab=receipts`);
    } catch (e: any) { setErr(e.message); }
  };
  return (
    <div className="page">
      <PageHeader title="Record production output" subtitle={order ? `${order.number} · ${order.itemName} · ${fmtQty(remaining, order.uom, 3)} remaining of ${order.qty}` : 'Pick a released production order'} back={{ label: order ? order.number : 'Receipts', path: order ? `production/orders/${order.id}` : 'production/receipts' }}
        actions={<><Button onClick={() => nav.go('production/receipts')}>Cancel</Button><Button variant="primary" onClick={submit} disabled={!order || total <= 0} reason={!order ? 'Choose an order' : total <= 0 ? 'Enter a quantity' : undefined}>{qc ? 'Record & send to QC' : 'Post receipt'}</Button></>} />
      <PeriodBanner date={date} />
      {err && <div className="banner danger">{err}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 16, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <SectionCard title="Output">
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 12 }}>
              <SelectField label="Production order" required value={oid} onChange={setOid} options={orders.map((o) => ({ value: o.id, label: `${o.number} · ${o.itemName} · ${fmtQty(remainingQty(o), o.uom, 3)} remaining` }))} placeholder="Pick an order" allowEmpty />
              <DateField label="Date" value={date} onChange={setDate} checkPeriod />
              <EntityPicker label="Finished goods warehouse" value={whId} onChange={(v) => setWhId(v ?? '')} options={whs} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr', gap: 12, marginTop: 12 }}>
              <NumberField label="Good quantity" required value={qty} onChange={setQty} decimals={order?.uom === 'Nos' ? 0 : 3} suffix={order?.uom} max={remaining} help={`Max ${fmtQty(remaining, order?.uom, 3)}`} />
              <NumberField label="Scrap quantity" value={scrapQty} onChange={setScrapQty} decimals={order?.uom === 'Nos' ? 0 : 3} suffix={order?.uom} />
              {scrapQty > 0 && <SelectField label="Scrap reason" required value={scrapReason} onChange={setScrapReason} options={SCRAP_REASONS} placeholder="Pick a reason code" allowEmpty help={`Scrap moves to ${whName(order?.scrapWarehouseId)} and posts Dr 5700 Scrap / Cr 1220 WIP`} />}
            </div>
            {order?.tracking === 'Batch' && <div style={{ marginTop: 12 }}><TextField label="Lot / batch number" required value={batch} onChange={setBatch} help="Auto-generated from the order number; edit if your labels differ" /></div>}
            {order?.tracking === 'Serial' && <div style={{ marginTop: 12 }}><TextArea label={`Serial numbers (${total} required)`} value={serials} onChange={setSerials} rows={2} help={`Auto-generated with prefix ${order.serialPrefix}; comma-separated`} /></div>}
          </SectionCard>
          {(bom?.byProducts.length ?? 0) > 0 && (
            <SectionCard title="By-products">
              <table className="data-table dense"><thead><tr><th>Item</th><th className="right">Standard / output</th><th className="right" style={{ width: 140 }}>Qty received</th><th className="right">Credit to WIP</th></tr></thead><tbody>
                {bom!.byProducts.map((b) => { const it = db.find<Item>(C.items, b.itemId); const q = byProducts[b.itemId] ?? 0; const val = b.costSharePct > 0 ? 0 : q * (it?.standardCost ?? it?.purchasePrice ?? 0); return (
                  <tr key={b.id}><td><ItemLink id={b.itemId} name={b.itemName} /></td><td className="right money">{fmtQty(b.qty, b.uom, 3)} / unit</td><td><NumberField value={q} onChange={(v) => setByProducts({ ...byProducts, [b.itemId]: v })} decimals={3} size="grid" /></td><td className="right money">{b.costSharePct > 0 ? `${b.costSharePct}% of material` : fmtMoney(val, s.currency)}</td></tr>); })}
              </tbody></table>
            </SectionCard>
          )}
          {bf && order && (
            <SectionCard title={`Backflush preview (${bfLines.length} line(s))`} padding={0}>
              <table className="data-table dense"><thead><tr><th>Component</th><th className="right">Qty</th><th>Batch</th></tr></thead><tbody>
                {bfLines.map((l, i) => <tr key={i}><td>{db.find<Item>(C.items, l.itemId)?.name}</td><td className="right money">{fmtQty(l.qty, undefined, 3)}</td><td className="identifier" style={{ fontSize: 12 }}>{l.batch ?? '—'}</td></tr>)}
                {bfLines.length === 0 && <tr><td colSpan={3} style={{ padding: 12, color: 'var(--ink-3)' }}>Nothing to backflush — the floor already holds enough material.</td></tr>}
              </tbody></table>
            </SectionCard>
          )}
          <SectionCard title="Notes"><TextArea value={notes} onChange={setNotes} rows={2} /></SectionCard>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <SectionCard title="Options">
            <Toggle on={qc} onChange={setQc} label="QC required before stock is available" help="Creates a finished-goods inspection and holds the receipt" />
            <div style={{ height: 10 }} />
            <Toggle on={bf} onChange={setBf} label="Backflush components on post" help="Auto-issues per BOM for the received quantity" />
          </SectionCard>
          <SectionCard title="Unit cost">
            <SummaryBlock style={{ flexDirection: 'column', gap: 6 }} items={[{ label: `Basis (${uc.basis})`, value: fmtMoney(uc.unitCost, s.currency) }, { label: 'Good value', value: fmtMoney(uc.unitCost * qty, s.currency) }, { label: 'Scrap value', value: fmtMoney(uc.unitCost * scrapQty, s.currency), tone: scrapQty ? 'danger' : undefined }]} />
            <div style={{ marginTop: 8 }}><Explain title="Unit cost calculation" rows={[{ k: 'Method', v: order?.costingMethod ?? '—' }, { k: 'Basis', v: uc.explanation }]} note="Standard costing books at the standard rate and posts the difference as variance when the order closes." /></div>
          </SectionCard>
          <SectionCard title="Projected journal">
            <SummaryBlock style={{ flexDirection: 'column', gap: 6 }} items={[{ label: 'Dr 1200 Inventory — FG', value: fmtMoney(uc.unitCost * qty, s.currency) }, ...(scrapQty > 0 ? [{ label: 'Dr 5700 Scrap & Rework', value: fmtMoney(uc.unitCost * scrapQty, s.currency) }] : []), { label: 'Cr 1220 Work in Progress', value: fmtMoney(uc.unitCost * total, s.currency) }]} />
          </SectionCard>
        </div>
      </div>
    </div>
  );
}

function ReceiptDetail({ id }: { id: string }) {
  const s = useSession();
  const r = useRecord<ProductionReceipt>(C.productionReceipts, id);
  const toast = useToast();
  const confirm = useConfirm();
  if (!r) return <EmptyState title="Receipt not found" action={<Button onClick={() => nav.go('production/receipts')}>Back</Button>} />;
  const chk = receiptReversalCheck(r);
  return (
    <div className="page">
      <PageHeader title={r.number} subtitle={`${fmtDate(r.date)} · ${r.orderNumber} · ${r.itemName}${r.postedAt ? ` · posted ${fmtDateTime(r.postedAt)} by ${r.postedBy}` : ''}`} back={{ label: 'Production receipts', path: 'production/receipts' }}
        actions={<><Badge status={r.status} />{r.inspectionNumber && <Button onClick={() => nav.go(`production/quality/${r.inspectionId}`)}>Open inspection {r.inspectionNumber}</Button>}<Button onClick={() => nav.go(`production/orders/${r.orderId}?tab=receipts`)}>Open order</Button><Button variant="tinted" tone="danger" disabled={!chk.ok} reason={chk.reason} onClick={() => confirm.open({ title: `Reverse ${r.number}?`, reasonRequired: true, danger: true, confirmLabel: 'Reverse receipt', consequences: [{ engine: 'Stock', text: `${r.qty} ${r.uom} removed from ${whName(r.warehouseId)}; components return to WIP` }, { engine: 'Journal', text: 'Output and scrap journals reversed' }], onConfirm: (reason) => { reverseReceipt(r.id, reason); toast.success('Reversed'); } })}>Reverse</Button></>} />
      {r.status === 'Hold' && <div className="banner warning">On QC hold — stock is not available until the finished-goods inspection {r.inspectionNumber} is completed.</div>}
      {r.status === 'Reversed' && <div className="banner warning">Reversed: {r.reversalReason}</div>}
      {r.reversalOfId && <div className="banner info">Reversal of {db.find<ProductionReceipt>(C.productionReceipts, r.reversalOfId)?.number}: {r.reversalReason}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 16, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <SectionCard title="Output">
            <SummaryBlock items={[{ label: 'Good qty', value: fmtQty(r.qty, r.uom, 3) }, { label: 'Scrap', value: fmtQty(r.scrapQty, r.uom, 3), tone: r.scrapQty ? 'danger' : undefined }, { label: 'Unit cost', value: fmtMoney(r.unitCost, s.currency) }, { label: 'Value', value: fmtMoney(r.value, s.currency) }, { label: 'Basis', value: r.costBasis }]} />
            <div style={{ marginTop: 12 }}><KV items={[{ k: 'Lot / batch', v: r.batch ?? '—' }, { k: 'Serials', v: r.serials?.length ? r.serials.join(', ') : '—' }, { k: 'Warehouse', v: whName(r.warehouseId) }, { k: 'Scrap reason', v: r.scrapReason ?? '—' }, { k: 'Backflush', v: r.backflush ? `Yes · ${db.find<any>(C.materialIssues, r.backflushIssueId)?.number ?? ''}` : 'No' }, { k: 'Notes', v: r.notes ?? '—' }]} /></div>
          </SectionCard>
          {r.byProducts.length > 0 && (
            <SectionCard title="By-products" padding={0}>
              <DataTable rows={r.byProducts} columns={[{ key: 'itemName', label: 'Item', render: (b) => <ItemLink id={b.itemId} name={b.itemName} /> }, { key: 'qty', label: 'Qty', align: 'right', render: (b) => <span className="money">{fmtQty(b.qty, b.uom, 3)}</span> }, { key: 'value', label: 'Credit to WIP', align: 'right', render: (b) => <span className="money">{fmtMoney(b.value, s.currency)}</span> }] as Column<ProductionReceipt['byProducts'][number]>[]} rowKey={(b) => b.itemId} />
            </SectionCard>
          )}
          <SectionCard title="Accounting"><AccountingTab journalId={r.journalId} currency={s.currency} />{r.scrapJournalId && <div style={{ marginTop: 16 }}><AccountingTab journalId={r.scrapJournalId} currency={s.currency} title="Scrap journal" /></div>}</SectionCard>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <SectionCard title="Links"><KV items={[{ k: 'Order', v: <OrderLink id={r.orderId} number={r.orderNumber} /> }, { k: 'Item', v: <ItemLink id={r.itemId} name={r.itemName} /> }, { k: 'Inspection', v: r.inspectionNumber ? <span className="link" onClick={() => nav.go(`production/quality/${r.inspectionId}`)}>{r.inspectionNumber}</span> : '—' }, { k: 'Journal', v: <JournalLink id={r.journalId} /> }, { k: 'Movements', v: `${r.movementIds.length}` }, { k: 'Genealogy', v: <span className="link" onClick={() => nav.go('production/genealogy', { q: r.batch ?? r.serials?.[0] ?? '' })}>Trace this lot</span> }]} /></SectionCard>
          <SectionCard title="Activity"><ActivityTab objectId={r.id} correlationId={r.correlationId} /></SectionCard>
        </div>
      </div>
      {confirm.dialog}
    </div>
  );
}
