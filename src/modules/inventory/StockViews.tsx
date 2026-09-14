// Stock on hand, stock ledger, batches & serials, reservations (FR-INV-001/002/004).
import { useMemo, useState } from 'react';
import { db, C, engine, nav, useCollection, useSession } from '../../store';
import type { Item, StockMovement, Reservation, Warehouse } from '../../store';
import { RegisterPage, Button, Badge, TwoLine, Pill, Drawer, ScopeLine, SummaryBlock, Tabs, EmptyState, useToast, SelectField, type Column } from '../../components/ui';
import { fmtDate, fmtMoney, fmtQty, daysBetween, today, fmtDateTime } from '../../lib/format';
import * as A from './actions';
import { useConfirm, ItemLink, DocLink } from '../purchase/shared';

const sourceLink = (m: StockMovement) => {
  const map: Record<string, string> = { GRN: 'purchase/grn', 'Purchase Return': 'purchase/debit-notes', 'Vendor Invoice': 'purchase/vendor-invoices', 'Stock Adjustment': 'inventory/adjustments', 'Stock Transfer': 'inventory/transfers', 'Landed Cost': 'inventory/landed-cost', Delivery: 'sales/deliveries', 'Sales Return': 'sales/returns', 'Sales Invoice': 'sales/invoices', 'POS Bill': 'pos/bills', 'Production Order': 'production/orders', 'Material Issue': 'production/issues', 'Production Receipt': 'production/receipts' };
  if (m.sourceType === 'Purchase Return') { const prt = db.find<any>(C.purchaseReturns, m.sourceId); return prt ? `purchase/debit-notes/${prt.debitNoteId}` : undefined; }
  const base = map[m.sourceType] ?? map[m.sourceType.replace(' Reversal', '')];
  return base ? `${base}/${m.sourceId}` : undefined;
};

const TYPE_COLOR: Record<string, string> = { GRN: '#12784E', Delivery: '#C0393F', Adjustment: '#8A4B0F', 'Transfer Out': '#3E5BA5', 'Transfer In': '#3E5BA5', Opening: '#5F6368', 'Purchase Return': '#C0393F', 'Sales Return': '#12784E', 'Landed Cost': '#A855F7', Scrap: '#9B1B21', 'POS Sale': '#C0393F', 'POS Return': '#12784E' }; // no-token
export function TypeChip({ type }: { type: string }) { return <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 6px', borderRadius: 4, background: `${TYPE_COLOR[type] ?? '#5F6368'}18`, color: TYPE_COLOR[type] ?? '#5F6368', whiteSpace: 'nowrap' }}>{type}</span>; } // no-token

interface Row { key: string; item: Item; warehouseId?: string; warehouseName: string; onHand: number; reserved: number; available: number; inTransit: number; committed: number; projected: number; avgRate: number; value: number; low: boolean }

export function StockOnHand({ itemId }: { itemId?: string }) {
  const moves = useCollection<StockMovement>(C.stockMovements);
  const reservations = useCollection<Reservation>(C.reservations);
  const items = useCollection<Item>(C.items);
  const [wh, setWh] = useState('');
  const [drill, setDrill] = useState<string | undefined>(itemId);
  const whs = A.activeWarehouses().filter((w) => w.type !== 'Transit');
  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    A.stockItems().forEach((item) => {
      const targets = wh ? [whs.find((w) => w.id === wh)!].filter(Boolean) : [undefined];
      targets.forEach((w) => {
        const pos = engine.stockPosition(item.id, w?.id);
        const val = A.valuation(item.id, w?.id);
        if (pos.onHand === 0 && pos.reserved === 0 && pos.inTransit === 0 && pos.committed === 0) return;
        out.push({ key: `${item.id}|${w?.id ?? 'all'}`, item, warehouseId: w?.id, warehouseName: w?.name ?? 'All warehouses', onHand: pos.onHand, reserved: pos.reserved, available: pos.available, inTransit: pos.inTransit, committed: pos.committed, projected: pos.projected, avgRate: val.avgRate || pos.avgRate, value: val.value || pos.value, low: pos.available < item.reorderLevel });
      });
    });
    return out;
  }, [moves, reservations, items, wh]);
  const totalValue = rows.reduce((x, r) => x + r.value, 0);
  const lowCount = rows.filter((r) => r.low).length;
  const columns: Column<Row>[] = [
    { key: 'sku', label: 'SKU', sortable: true, value: (r) => r.item.code, render: (r) => <span className="identifier link" style={{ fontSize: 12 }}>{r.item.code}</span> },
    { key: 'name', label: 'Item', sortable: true, value: (r) => r.item.name, render: (r) => <TwoLine primary={r.item.name} secondary={`HSN ${r.item.hsn ?? '—'}${r.item.tracking !== 'None' ? ' · ' + r.item.tracking : ''}`} /> },
    { key: 'group', label: 'Group', sortable: true, value: (r) => r.item.group, render: (r) => <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{r.item.group}</span> },
    ...(wh ? [] : [{ key: 'wh', label: 'Warehouses', render: (r: Row) => <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{whs.filter((w) => engine.stockPosition(r.item.id, w.id).onHand !== 0).map((w) => `${w.name} ${fmtQty(engine.stockPosition(r.item.id, w.id).onHand)}`).join(' · ') || '—'}</span> }]),
    { key: 'uom', label: 'UOM', render: (r) => <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{r.item.baseUom}</span> },
    { key: 'onHand', label: 'On hand', align: 'right', sortable: true, render: (r) => <span className="money" style={{ fontWeight: 500 }}>{fmtQty(r.onHand)}</span> },
    { key: 'reserved', label: 'Reserved', align: 'right', render: (r) => <span className="money" style={{ color: 'var(--ink-3)' }}>{fmtQty(r.reserved)}</span> },
    { key: 'available', label: 'Available', align: 'right', sortable: true, render: (r) => <span className="money" style={{ fontWeight: 600, color: r.low ? 'var(--danger)' : 'var(--good)' }}>{fmtQty(r.available)}{r.low && <Pill tone="warning">Low</Pill>}</span> },
    { key: 'committed', label: 'On order', align: 'right', render: (r) => <span className="money" style={{ color: r.committed ? 'var(--accent)' : 'var(--ink-5)' }}>{r.committed ? fmtQty(r.committed) : '—'}</span> },
    { key: 'inTransit', label: 'In transit', align: 'right', render: (r) => <span className="money" style={{ color: r.inTransit ? 'var(--accent)' : 'var(--ink-5)' }}>{r.inTransit ? fmtQty(r.inTransit) : '—'}</span> },
    { key: 'projected', label: 'Projected', align: 'right', render: (r) => <span className="money">{fmtQty(r.projected)}</span> },
    { key: 'reorder', label: 'Reorder lvl', align: 'right', render: (r) => <span className="money" style={{ fontSize: 12, color: 'var(--ink-3)' }}>{fmtQty(r.item.reorderLevel)}</span> },
    { key: 'avgRate', label: 'Avg rate', align: 'right', render: (r) => <span className="money">{fmtMoney(r.avgRate)}</span> },
    { key: 'value', label: 'Value', align: 'right', sortable: true, render: (r) => <span className="money" style={{ fontWeight: 600 }}>{fmtMoney(r.value)}</span>, total: (rs) => fmtMoney(rs.reduce((x, r) => x + r.value, 0)) },
  ];
  return (
    <>
      <RegisterPage<Row> title="Stock on hand" subtitle={<ScopeLine extra={`${rows.length} items · ${fmtMoney(totalValue)} inventory value · ${wh ? whs.find((w) => w.id === wh)?.name : 'all warehouses'}`} />} entity="stock items" rows={rows} columns={columns} rowKey={(r) => r.key} searchKeys={['item.code', 'item.name', 'item.hsn', 'item.group']}
        headerExtra={<div style={{ display: 'flex', gap: 12, alignItems: 'center' }}><SelectField size="sm" value={wh} onChange={setWh} options={[{ value: '', label: 'All warehouses' }, ...whs.map((w) => ({ value: w.id, label: w.name }))]} style={{ width: 220 }} />{lowCount > 0 && <span className="pill pill-warning">{lowCount} item(s) below reorder level</span>}<span style={{ flex: 1 }} /><Button size="sm" onClick={() => nav.go('inventory/replenishment')}>Replenishment</Button><Button size="sm" onClick={() => nav.go('inventory/valuation')}>Valuation</Button></div>}
        tabs={[{ id: 'all', label: 'All' }, { id: 'low', label: 'Below reorder', filter: (r) => r.low }, { id: 'reserved', label: 'With reservations', filter: (r) => r.reserved > 0 }, ...Array.from(new Set(rows.map((r) => r.item.group))).filter(Boolean).map((g) => ({ id: `g_${g}`, label: g!, filter: (r: Row) => r.item.group === g }))]}
        onRowClick={(r) => setDrill(r.item.id)} rowActions={(r) => [{ label: 'Movements & batches', onClick: () => setDrill(r.item.id) }, { label: 'Stock ledger', onClick: () => nav.go(`inventory/ledger?item=${r.item.id}`) }, { label: 'Item master', onClick: () => nav.go(`masters/items/${r.item.id}`) }, { label: 'New adjustment', onClick: () => nav.go(`inventory/adjustments/new?item=${r.item.id}`) }, { label: 'New transfer', onClick: () => nav.go(`inventory/transfers/new?item=${r.item.id}`) }]} />
      {drill && <ItemDrill itemId={drill} onClose={() => { setDrill(undefined); if (itemId) nav.go('inventory/stock'); }} />}
    </>
  );
}

function ItemDrill({ itemId, onClose }: { itemId: string; onClose: () => void }) {
  const item = db.find<Item>(C.items, itemId);
  const moves = useCollection<StockMovement>(C.stockMovements).filter((m) => m.itemId === itemId).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  const [tab, setTab] = useState<'moves' | 'batches' | 'wh'>('moves');
  if (!item) return null;
  const pos = engine.stockPosition(itemId);
  const whs = A.activeWarehouses();
  const batches = A.batchBalances(itemId).filter((b) => b.qty !== 0);
  return (
    <Drawer open onClose={onClose} title={item.name} subtitle={`${item.code} · ${item.group} · ${item.tracking === 'None' ? 'no tracking' : item.tracking + '-tracked'}`} width={820} headerRight={<Button size="sm" onClick={() => nav.go(`masters/items/${itemId}`)}>Item master</Button>}>
      <SummaryBlock items={[{ label: 'On hand', value: fmtQty(pos.onHand, item.baseUom) }, { label: 'Reserved', value: fmtQty(pos.reserved) }, { label: 'Available', value: fmtQty(pos.available), tone: pos.available < item.reorderLevel ? 'danger' : 'good' }, { label: 'On order', value: fmtQty(pos.committed) }, { label: 'In transit', value: fmtQty(pos.inTransit) }, { label: 'Projected', value: fmtQty(pos.projected) }, { label: 'Avg rate', value: fmtMoney(A.valuation(itemId).avgRate) }, { label: 'Value', value: fmtMoney(A.valuation(itemId).value) }]} />
      <div style={{ marginTop: 14 }}><Tabs variant="filter" value={tab} onChange={setTab} tabs={[{ id: 'moves', label: 'Movements', count: moves.length }, { id: 'batches', label: item.tracking === 'Serial' ? 'Serials' : 'Batches', count: item.tracking === 'Serial' ? A.serialLocations(itemId).length : batches.length }, { id: 'wh', label: 'By warehouse' }]} /></div>
      {tab === 'moves' && <div className="card" style={{ marginTop: 12, overflow: 'auto', maxHeight: 460 }}><table className="data-table dense"><thead><tr><th>Date</th><th>Type</th><th>Reference</th><th>Warehouse</th><th>Batch</th><th className="right">In</th><th className="right">Out</th><th className="right">Rate</th><th className="right">Value</th></tr></thead><tbody>{moves.map((m) => <tr key={m.id} className="clickable" onClick={() => { const l = sourceLink(m); if (l) nav.go(l); }}><td>{fmtDate(m.date)}</td><td><TypeChip type={m.type} /></td><td className="identifier link">{m.sourceNumber}</td><td>{m.warehouseName}{m.bin ? ` · ${m.bin}` : ''}</td><td className="identifier">{m.batch ?? (m.serials?.length ? `${m.serials.length} sn` : '—')}</td><td className="right money" style={{ color: 'var(--good)' }}>{m.baseQty > 0 ? fmtQty(m.baseQty) : '—'}</td><td className="right money" style={{ color: 'var(--danger)' }}>{m.baseQty < 0 ? fmtQty(-m.baseQty) : '—'}</td><td className="right money">{fmtMoney(m.rate)}</td><td className="right money">{fmtMoney(m.value)}</td></tr>)}</tbody></table></div>}
      {tab === 'batches' && (item.tracking === 'Serial' ? <div className="card" style={{ marginTop: 12, overflow: 'auto', maxHeight: 460 }}><table className="data-table dense"><thead><tr><th>Serial</th><th>Warehouse</th><th>Status</th><th>Since</th><th>Last document</th></tr></thead><tbody>{A.serialLocations(itemId).map((sn) => <tr key={sn.serial}><td className="identifier">{sn.serial}</td><td>{sn.warehouseName ?? '—'}</td><td><Badge status={sn.status === 'In stock' ? 'Active' : 'Delivered'}>{sn.status}</Badge></td><td>{fmtDate(sn.since)}</td><td className="identifier">{sn.sourceNumber}</td></tr>)}</tbody></table></div> : batches.length === 0 ? <EmptyState compact title="No batch balances" /> : <div className="card" style={{ marginTop: 12, overflow: 'hidden' }}><table className="data-table dense"><thead><tr><th>Batch</th><th>Warehouse</th><th className="right">Qty</th><th className="right">Value</th><th>Expiry</th></tr></thead><tbody>{batches.map((b) => { const exp = b.expiryDate ? daysBetween(today(), b.expiryDate) : null; return <tr key={b.batch + b.warehouseId}><td className="identifier">{b.batch}</td><td>{b.warehouseName}</td><td className="right money">{fmtQty(b.qty, item.baseUom)}</td><td className="right money">{fmtMoney(b.value)}</td><td>{b.expiryDate ? <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: 12 }}>{fmtDate(b.expiryDate)}{exp !== null && exp < 0 ? <Pill tone="critical">Expired</Pill> : exp !== null && exp <= 90 ? <Pill tone="warning">{exp} d</Pill> : null}</span> : '—'}</td></tr>; })}</tbody></table></div>)}
      {tab === 'wh' && <div className="card" style={{ marginTop: 12, overflow: 'hidden' }}><table className="data-table dense"><thead><tr><th>Warehouse</th><th className="right">On hand</th><th className="right">Reserved</th><th className="right">Available</th><th className="right">Avg rate</th><th className="right">Value</th></tr></thead><tbody>{whs.map((w) => { const p = engine.stockPosition(itemId, w.id); const v = A.valuation(itemId, w.id); if (!p.onHand && !p.reserved) return null; return <tr key={w.id}><td>{w.name} <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>{w.type !== 'Standard' ? w.type : ''}</span></td><td className="right money">{fmtQty(p.onHand)}</td><td className="right money">{fmtQty(p.reserved)}</td><td className="right money">{fmtQty(p.available)}</td><td className="right money">{fmtMoney(v.avgRate)}</td><td className="right money">{fmtMoney(v.value)}</td></tr>; })}</tbody></table></div>}
    </Drawer>
  );
}

export function StockLedger({ params }: { params: Record<string, string> }) {
  const moves = useCollection<StockMovement>(C.stockMovements);
  const s = useSession();
  const [item, setItem] = useState(params.item ?? '');
  const [wh, setWh] = useState('');
  const [type, setType] = useState('');
  const items = A.stockItems();
  const whs = A.activeWarehouses();
  const rows = useMemo(() => {
    const list = moves.filter((m) => m.companyId === s.state.companyId && (!item || m.itemId === item) && (!wh || m.warehouseId === wh) && (!type || m.type === type)).sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
    const bal = new Map<string, number>();
    const out = list.map((m) => { const k = `${m.itemId}|${m.warehouseId}`; const b = (bal.get(k) ?? 0) + m.baseQty; bal.set(k, Math.round(b * 1000) / 1000); return { ...m, running: bal.get(k)! }; });
    return out.reverse();
  }, [moves, item, wh, type, s.state.companyId]);
  const types = Array.from(new Set(moves.map((m) => m.type)));
  return (
    <RegisterPage<StockMovement & { running: number }> title="Stock ledger" subtitle={<ScopeLine extra={`${rows.length} movements · immutable · FR-INV-001`} />} entity="movements" rows={rows} searchKeys={['itemName', 'itemCode', 'sourceNumber', 'batch', 'warehouseName']} pageSize={50}
      headerExtra={<div style={{ display: 'flex', gap: 10, alignItems: 'center' }}><SelectField size="sm" value={item} onChange={setItem} options={[{ value: '', label: 'All items' }, ...items.map((i) => ({ value: i.id, label: `${i.code} · ${i.name}` }))]} style={{ width: 260 }} /><SelectField size="sm" value={wh} onChange={setWh} options={[{ value: '', label: 'All warehouses' }, ...whs.map((w) => ({ value: w.id, label: w.name }))]} style={{ width: 180 }} /><SelectField size="sm" value={type} onChange={setType} options={[{ value: '', label: 'All types' }, ...types.map((t) => ({ value: t, label: t }))]} style={{ width: 160 }} /></div>}
      filters={[{ key: 'date', label: 'Date', type: 'date-range' }]} applyFilter={(r, v) => (!v.dateFrom || r.date >= v.dateFrom) && (!v.dateTo || r.date <= v.dateTo)}
      columns={[
        { key: 'date', label: 'Date', sortable: true, render: (m) => <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{fmtDate(m.date)}</span> },
        { key: 'type', label: 'Type', render: (m) => <TypeChip type={m.type} /> },
        { key: 'sourceNumber', label: 'Reference', render: (m) => <DocLink path={sourceLink(m)} number={m.sourceNumber} /> },
        { key: 'itemName', label: 'Item', sortable: true, render: (m) => <TwoLine primary={m.itemName} secondary={m.itemCode} mono /> },
        { key: 'warehouseName', label: 'Warehouse', render: (m) => <span style={{ fontSize: 12 }}>{m.warehouseName}{m.bin ? ` · ${m.bin}` : ''}</span> },
        { key: 'batch', label: 'Batch / serial', render: (m) => <span className="identifier" style={{ fontSize: 12 }}>{m.batch ?? (m.serials?.length ? `${m.serials.length} sn` : '—')}</span> },
        { key: 'in', label: 'In', align: 'right', render: (m) => <span className="money" style={{ color: m.baseQty > 0 ? 'var(--good)' : 'var(--ink-5)' }}>{m.baseQty > 0 ? fmtQty(m.baseQty) : '—'}</span> },
        { key: 'out', label: 'Out', align: 'right', render: (m) => <span className="money" style={{ color: m.baseQty < 0 ? 'var(--danger)' : 'var(--ink-5)' }}>{m.baseQty < 0 ? fmtQty(-m.baseQty) : '—'}</span> },
        { key: 'running', label: 'Balance', align: 'right', render: (m) => <span className="money" style={{ fontWeight: 600 }}>{fmtQty(m.running)}</span> },
        { key: 'rate', label: 'Rate', align: 'right', render: (m) => <span className="money">{m.baseQty ? fmtMoney(m.rate) : '—'}</span> },
        { key: 'value', label: 'Value', align: 'right', render: (m) => <span className="money">{fmtMoney(m.value)}</span> },
        { key: 'sourceType', label: 'Source', render: (m) => <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{m.sourceType}{m.reversalOfId ? ' (reversal)' : ''}</span> },
      ]}
      onRowClick={(m) => { const l = sourceLink(m); if (l) nav.go(l); }} />
  );
}

export function BatchesSerials({ itemId }: { itemId?: string }) {
  const moves = useCollection<StockMovement>(C.stockMovements);
  const items = A.stockItems().filter((i) => i.tracking !== 'None');
  const [sel, setSel] = useState(itemId ?? '');
  const rows = useMemo(() => items.filter((i) => !sel || i.id === sel).flatMap((i) => (i.tracking === 'Batch' ? A.batchBalances(i.id).filter((b) => b.qty !== 0).map((b) => ({ key: `${i.id}|${b.batch}|${b.warehouseId}`, item: i, kind: 'Batch', ref: b.batch, warehouseName: b.warehouseName ?? '', qty: b.qty, value: b.value, expiryDate: b.expiryDate, since: b.lastMove })) : A.serialLocations(i.id).filter((sn) => sn.status === 'In stock').map((sn) => ({ key: `${i.id}|${sn.serial}`, item: i, kind: 'Serial', ref: sn.serial, warehouseName: sn.warehouseName ?? '', qty: 1, value: A.valuation(i.id).avgRate, expiryDate: undefined as string | undefined, since: sn.since })))), [moves, sel]);
  const expiring = rows.filter((r) => r.expiryDate && daysBetween(today(), r.expiryDate) <= 90);
  return (
    <RegisterPage title="Batches & serials" subtitle={<ScopeLine extra={`${rows.length} balances · ${expiring.length} expiring within 90 days`} />} entity="batches" rows={rows} rowKey={(r) => r.key} searchKeys={['ref', 'item.name', 'item.code', 'warehouseName']}
      headerExtra={<div style={{ display: 'flex', gap: 10, alignItems: 'center' }}><SelectField size="sm" value={sel} onChange={setSel} options={[{ value: '', label: 'All tracked items' }, ...items.map((i) => ({ value: i.id, label: `${i.code} · ${i.name} (${i.tracking})` }))]} style={{ width: 320 }} />{expiring.length > 0 && <span className="pill pill-warning">{expiring.length} batch(es) expiring ≤ 90 d</span>}</div>}
      tabs={[{ id: 'all', label: 'All' }, { id: 'batch', label: 'Batches', filter: (r: any) => r.kind === 'Batch' }, { id: 'serial', label: 'Serials', filter: (r: any) => r.kind === 'Serial' }, { id: 'exp', label: 'Expiring / expired', filter: (r: any) => !!r.expiryDate && daysBetween(today(), r.expiryDate) <= 90 }]}
      columns={[
        { key: 'item', label: 'Item', render: (r: any) => <TwoLine primary={<ItemLink id={r.item.id} name={r.item.name} />} secondary={r.item.code} mono /> },
        { key: 'kind', label: 'Type', render: (r: any) => <Badge status={r.kind === 'Batch' ? 'Active' : 'Reserved'}>{r.kind}</Badge> },
        { key: 'ref', label: 'Batch / serial', render: (r: any) => <span className="identifier">{r.ref}</span> },
        { key: 'warehouseName', label: 'Warehouse' },
        { key: 'qty', label: 'Qty', align: 'right', render: (r: any) => <span className="money">{fmtQty(r.qty, r.item.baseUom)}</span> },
        { key: 'value', label: 'Value', align: 'right', render: (r: any) => <span className="money">{fmtMoney(r.value)}</span>, total: (rs: any[]) => fmtMoney(rs.reduce((x, r) => x + r.value, 0)) },
        { key: 'expiryDate', label: 'Expiry', render: (r: any) => { if (!r.expiryDate) return <span style={{ color: 'var(--ink-5)' }}>—</span>; const d = daysBetween(today(), r.expiryDate); return <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: 12 }}>{fmtDate(r.expiryDate)}{d < 0 ? <Pill tone="critical">Expired</Pill> : d <= 90 ? <Pill tone="warning">{d} d</Pill> : <Pill tone="good">OK</Pill>}</span>; } },
        { key: 'since', label: 'Last movement', render: (r: any) => fmtDate(r.since) },
      ]} onRowClick={(r: any) => nav.go(`inventory/stock/${r.item.id}`)} />
  );
}

export function ReservationsPage() {
  const rows = useCollection<Reservation>(C.reservations);
  const s = useSession();
  const toast = useToast();
  const confirm = useConfirm();
  const mine = rows.filter((r) => r.companyId === s.state.companyId || !r.companyId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const act = (r: Reservation, action: 'Release' | 'Expire' | 'Cancel') => confirm.open({ title: `${action} reservation on ${r.sourceNumber}?`, statement: `${fmtQty(r.qty - r.fulfilledQty)} of ${db.find<Item>(C.items, r.itemId)?.name} in ${db.find<Warehouse>(C.warehouses, r.warehouseId)?.name} becomes available again.`, consequences: [{ engine: 'Stock', text: 'Available quantity increases; the source order line loses its allocation' }], reasonRequired: true, confirmLabel: `${action} reservation`, cancelLabel: 'Keep reservation', danger: action === 'Cancel', onConfirm: (reason) => { A.reservationActions(r.id, action, reason); toast.success(`Reservation ${action.toLowerCase()}d`); } });
  return (
    <>
      <RegisterPage<Reservation> title="Reservations" subtitle={<ScopeLine extra={`${mine.filter((r) => r.status === 'Reserved' || r.status === 'Partially Fulfilled').length} active · FR-INV-004`} />} entity="reservations" rows={mine} searchKeys={['sourceNumber']}
        tabs={[{ id: 'active', label: 'Active', filter: (r) => r.status === 'Reserved' || r.status === 'Partially Fulfilled' }, { id: 'expiring', label: 'Expiring ≤ 7 d', filter: (r) => (r.status === 'Reserved' || r.status === 'Partially Fulfilled') && !!r.expiresAt && daysBetween(today(), r.expiresAt.slice(0, 10)) <= 7 }, { id: 'fulfilled', label: 'Fulfilled', filter: (r) => r.status === 'Fulfilled' }, { id: 'released', label: 'Released / expired', filter: (r) => ['Released', 'Expired', 'Cancelled'].includes(r.status) }, { id: 'all', label: 'All' }]}
        columns={[
          { key: 'sourceNumber', label: 'Source', render: (r) => <DocLink path={r.sourceType === 'Sales Order' ? `sales/orders/${r.sourceId}` : undefined} number={r.sourceNumber} /> },
          { key: 'item', label: 'Item', render: (r) => <TwoLine primary={db.find<Item>(C.items, r.itemId)?.name ?? r.itemId} secondary={db.find<Item>(C.items, r.itemId)?.code} mono /> },
          { key: 'warehouse', label: 'Warehouse', render: (r) => db.find<Warehouse>(C.warehouses, r.warehouseId)?.name ?? '—' },
          { key: 'qty', label: 'Reserved', align: 'right', render: (r) => <span className="money">{fmtQty(r.qty)}</span> },
          { key: 'fulfilledQty', label: 'Fulfilled', align: 'right', render: (r) => <span className="money">{fmtQty(r.fulfilledQty)}</span> },
          { key: 'open', label: 'Open', align: 'right', render: (r) => <span className="money" style={{ fontWeight: 600 }}>{fmtQty(r.qty - r.fulfilledQty)}</span> },
          { key: 'available', label: 'Available now', align: 'right', render: (r) => { const p = engine.stockPosition(r.itemId, r.warehouseId); return <span className="money" style={{ color: p.onHand < r.qty - r.fulfilledQty ? 'var(--danger)' : 'var(--good)' }}>{fmtQty(p.onHand)} on hand</span>; } },
          { key: 'expiresAt', label: 'Expires', render: (r) => r.expiresAt ? <span style={{ fontSize: 12, color: daysBetween(today(), r.expiresAt.slice(0, 10)) < 0 ? 'var(--danger)' : undefined }}>{fmtDateTime(r.expiresAt)}</span> : <span style={{ color: 'var(--ink-5)' }}>—</span> },
          { key: 'status', label: 'Status', render: (r) => <Badge status={r.status} /> },
        ]}
        rowActions={(r) => (r.status === 'Reserved' || r.status === 'Partially Fulfilled' ? [{ label: 'Release', onClick: () => act(r, 'Release') }, { label: 'Expire', onClick: () => act(r, 'Expire') }, { label: 'Cancel', danger: true, onClick: () => act(r, 'Cancel') }] : [])}
        emptyTitle="No reservations" emptyDescription="Sales orders reserve stock when confirmed; reservations appear here." />
      {confirm.dialog}
    </>
  );
}

