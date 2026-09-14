// Item detail: stock by warehouse (engine.stockPosition), price list entries, recent movements, change history.
import { useMemo, useState } from 'react';
import { db, C, engine, nav, useCollection, useRecord, useSession } from '../../store';
import type { Item, PriceList, PriceListEntry, StockMovement, Warehouse } from '../../store';
import { Badge, Button, DataTable, EmptyState, KV, KpiTile, Money, PageHeader, Tabs } from '../../components/ui';
import { fmtDate, fmtQty } from '../../lib/format';
import { ChangeHistory, UsagePill, setStatus } from './shared';
import { ItemForm } from './items';

export default function ItemDetail({ id }: { id: string }) {
  const s = useSession();
  const item = useRecord<Item>(C.items, id);
  const warehouses = useCollection<Warehouse>(C.warehouses).filter((w) => w.companyId === s.state.companyId);
  const moves = useCollection<StockMovement>(C.stockMovements);
  const entries = useCollection<PriceListEntry>(C.priceListEntries);
  const priceLists = useCollection<PriceList>(C.priceLists);
  const [editing, setEditing] = useState(false);
  const [tab, setTab] = useState<'stock' | 'prices' | 'moves' | 'history'>('stock');
  const stock = useMemo(() => (item?.isStock ? warehouses.map((w) => ({ w, pos: engine.stockPosition(id, w.id) })).filter((r) => r.pos.onHand !== 0 || r.pos.reserved !== 0 || r.w.type === 'Standard') : []), [item, warehouses, moves, id]);
  if (!item) return <EmptyState icon="🧭" title="Item not found" action={<Button variant="primary" onClick={() => nav.go('masters/items')}>Back to items</Button>} />;
  const total = engine.stockPosition(id);
  const myMoves = moves.filter((m) => m.itemId === id).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)).slice(0, 30);
  const myPrices = entries.filter((e) => e.itemId === id);
  const canEdit = s.can('masters.items.edit');
  const tax = db.find<any>(C.taxRates, item.taxRateId);
  const acc = (i?: string) => { const a = db.find<any>(C.accounts, i); return a ? `${a.code} · ${a.name}` : undefined; };
  const sup = db.find<any>(C.suppliers, item.preferredSupplierId);
  return (
    <div className="page">
      <PageHeader back={{ label: 'Items & services', path: 'masters/items' }}
        title={<span style={{ display: 'inline-flex', gap: 10, alignItems: 'center' }}>{item.name} <Badge status={item.status} /> <Badge status="Draft">{item.type}</Badge>{item.tracking !== 'None' && <span className="pill pill-neutral">{item.tracking}-tracked</span>}</span>}
        subtitle={<span style={{ display: 'inline-flex', gap: 10, alignItems: 'center' }}><span className="identifier">{item.code}</span>{item.hsn && <span>HSN/SAC {item.hsn}</span>}{item.group && <span>{item.group}</span>}<UsagePill id={id} collection={C.items} /></span>}
        actions={<>
          {item.isStock && <Button variant="secondary" onClick={() => nav.go(`inventory/ledger?item=${id}`)}>Stock ledger</Button>}
          {item.status === 'Active' ? <Button variant="secondary" disabled={!canEdit} onClick={() => setStatus(C.items, 'Item', id, 'Inactive')}>Deactivate</Button> : <Button variant="secondary" disabled={!canEdit} onClick={() => setStatus(C.items, 'Item', id, 'Active')}>Activate</Button>}
          <Button variant="primary" onClick={() => setEditing(true)} disabled={!canEdit} reason={canEdit ? undefined : 'Requires item edit permission'}>Edit item</Button>
        </>} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12 }}>
        <KpiTile label="On hand" value={item.isStock ? fmtQty(total.onHand, item.baseUom) : 'Service'} sub={item.isStock ? `${fmtQty(total.reserved)} reserved · ${fmtQty(total.available)} available` : 'No stock movements'} />
        <KpiTile label="Stock value" value={item.isStock ? <Money value={total.value} currency={s.currency} /> : '—'} sub={item.isStock ? `Avg rate ${fmtQty(total.avgRate)} / ${item.baseUom} (${s.company?.defaults.valuationMethod})` : undefined} />
        <KpiTile label="Sales price" value={<Money value={item.salesPrice} currency={s.currency} />} sub={`${myPrices.length} price list entr${myPrices.length === 1 ? 'y' : 'ies'}`} onClick={() => setTab('prices')} />
        <KpiTile label="Reorder" value={item.isStock ? fmtQty(item.reorderLevel, item.baseUom) : '—'} sub={item.isStock ? (total.onHand < item.reorderLevel && item.reorderLevel > 0 ? `Below level — order ${fmtQty(item.reorderQty, item.baseUom)}` : `Safety ${fmtQty(item.safetyStock)} · lead ${item.leadTimeDays} d`) : undefined} deltaTone={item.isStock && item.reorderLevel > 0 && total.onHand < item.reorderLevel ? 'bad' : 'neutral'} />
      </div>
      <div className="card" style={{ padding: 18 }}>
        <div className="section-title">Tax & accounts</div>
        <KV columns={2} items={[{ k: 'Tax rate', v: tax ? `${tax.name} (${tax.ruleVersion})` : undefined }, { k: 'Base UOM', v: `${item.baseUom}${item.altUoms.length ? ' · ' + item.altUoms.map((u) => `1 ${u.uom} = ${u.factor} ${item.baseUom}`).join(', ') : ''}` }, { k: 'Sales account', v: acc(item.salesAccountId) }, { k: 'Purchase account', v: acc(item.purchaseAccountId) }, { k: 'Inventory account', v: acc(item.inventoryAccountId) }, { k: 'Preferred supplier', v: sup ? <span className="link" onClick={() => nav.go(`masters/suppliers/${sup.id}`)}>{sup.name}</span> : undefined }, { k: 'Purchase price', v: <Money value={item.purchasePrice} currency={s.currency} /> }, { k: 'Barcode', v: item.barcode ? <span className="identifier">{item.barcode}</span> : undefined }]} />
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'stock', label: 'Stock by warehouse' }, { id: 'prices', label: 'Price list entries' }, { id: 'moves', label: 'Recent movements' }, { id: 'history', label: 'Change history' }]} />
      {tab === 'stock' && (item.isStock ? (
        <DataTable rows={stock} rowKey={(r) => r.w.id} dense emptyTitle="No stock yet" columns={[
          { key: 'w', label: 'Warehouse', render: (r) => <span>{r.w.name} <span style={{ color: 'var(--ink-3)', fontSize: 12 }}>{r.w.code}{r.w.type !== 'Standard' ? ` · ${r.w.type}` : ''}</span></span> },
          { key: 'onHand', label: 'On hand', align: 'right', render: (r) => fmtQty(r.pos.onHand, item.baseUom), total: (rows) => fmtQty(rows.reduce((a, r) => a + r.pos.onHand, 0), item.baseUom) },
          { key: 'reserved', label: 'Reserved', align: 'right', render: (r) => fmtQty(r.pos.reserved) },
          { key: 'available', label: 'Available', align: 'right', render: (r) => <strong>{fmtQty(r.pos.available)}</strong> },
          { key: 'avgRate', label: 'Avg rate', align: 'right', render: (r) => <Money value={r.pos.avgRate} currency={s.currency} /> },
          { key: 'value', label: 'Value', align: 'right', render: (r) => <Money value={r.pos.value} currency={s.currency} />, total: (rows) => <Money value={rows.reduce((a, r) => a + r.pos.value, 0)} currency={s.currency} /> },
        ]} />
      ) : <EmptyState compact title="Service item" description="Services never produce stock movements (FR-ITM-002)." />)}
      {tab === 'prices' && (
        <DataTable rows={myPrices} dense emptyTitle="No price list entries" emptyDescription="Add entries from Masters › Price lists." onRowClick={(e) => nav.go(`masters/price-lists/${e.priceListId}`)} columns={[
          { key: 'priceListId', label: 'Price list', render: (e) => { const pl = priceLists.find((p) => p.id === e.priceListId); return <span className="link">{pl?.name ?? e.priceListId}</span>; } },
          { key: 'uom', label: 'UOM' },
          { key: 'minQty', label: 'Min qty', align: 'right' },
          { key: 'rate', label: 'Rate', align: 'right', render: (e) => <Money value={e.rate} currency={priceLists.find((p) => p.id === e.priceListId)?.currency ?? s.currency} code /> },
          { key: 'partyId', label: 'Party', render: (e) => (e.partyId ? db.find<any>(C.customers, e.partyId)?.name ?? db.find<any>(C.suppliers, e.partyId)?.name ?? e.partyId : 'All') },
          { key: 'effectiveFrom', label: 'Effective', render: (e) => `${fmtDate(e.effectiveFrom)} → ${e.effectiveTo ? fmtDate(e.effectiveTo) : 'open'}` },
        ]} />
      )}
      {tab === 'moves' && (
        <DataTable rows={myMoves} dense emptyTitle="No movements yet" columns={[
          { key: 'date', label: 'Date', render: (m) => fmtDate(m.date) },
          { key: 'type', label: 'Type', render: (m) => <Badge status={m.baseQty >= 0 ? 'Received' : 'Delivered'}>{m.type}</Badge> },
          { key: 'sourceNumber', label: 'Source', render: (m) => <span className="identifier">{m.sourceNumber}</span> },
          { key: 'warehouseName', label: 'Warehouse' },
          { key: 'batch', label: 'Batch / serial', render: (m) => m.batch ?? (m.serials?.length ? `${m.serials.length} serials` : '—') },
          { key: 'baseQty', label: 'Qty', align: 'right', render: (m) => <span className="money" style={{ color: m.baseQty < 0 ? 'var(--danger)' : 'var(--good)' }}>{m.baseQty > 0 ? '+' : ''}{fmtQty(m.baseQty, item.baseUom)}</span> },
          { key: 'rate', label: 'Rate', align: 'right', render: (m) => <Money value={m.rate} currency={s.currency} /> },
          { key: 'balanceAfter', label: 'Balance', align: 'right', render: (m) => (m.balanceAfter !== undefined ? fmtQty(m.balanceAfter) : '—') },
        ]} />
      )}
      {tab === 'history' && <ChangeHistory objectId={id} />}
      {editing && <ItemForm item={item} onClose={() => setEditing(false)} onSaved={() => setEditing(false)} />}
    </div>
  );
}
