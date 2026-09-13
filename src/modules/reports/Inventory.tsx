// Inventory reports (FR-RPT-003): stock ledger, on-hand/available, valuation, movement, ageing, reorder, count variance.
import { useMemo } from 'react';
import { C, engine, nav, useSession, useCollection, db } from '../../store';
import type { StockMovement, Item, Warehouse } from '../../store';
import { DataTable, KpiTile, Badge, Pill, type Column } from '../../components/ui';
import { fmtMoney, fmtDate, fmtQty, today } from '../../lib/format';
import { ReportFrame, useReportFilters, RangeBar, useRange, rangeLabel } from './ReportFrame';
import { stockValuation, stockAgeing, stockItems, type ValuationRow, type AgeingStockRow } from './compute';

function WarehousePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const whs = useCollection<Warehouse>(C.warehouses);
  return <div><label className="field-label">Warehouse</label><select className="field-input sm" value={value} onChange={(e) => onChange(e.target.value)}><option value="">All warehouses</option>{whs.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select></div>;
}

function ItemPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const items = useCollection<Item>(C.items).filter((i) => i.isStock);
  return <div><label className="field-label">Item</label><select className="field-input sm" value={value} onChange={(e) => onChange(e.target.value)} style={{ minWidth: 200 }}><option value="">All items</option>{items.map((i) => <option key={i.id} value={i.id}>{i.code} · {i.name}</option>)}</select></div>;
}

export function StockLedger() {
  const s = useSession();
  const [f, set] = useReportFilters({ preset: 'MTD', period: s.state.periodCode ?? '', from: '', to: '', warehouseId: '', itemId: '', type: '' });
  const range = useRange(f);
  const moves = useCollection<StockMovement>(C.stockMovements);
  const rows = useMemo(() => moves.filter((m) => m.date >= range.from && m.date <= range.to && (!f.warehouseId || m.warehouseId === f.warehouseId) && (!f.itemId || m.itemId === f.itemId) && (!f.type || m.type === f.type)).sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt)), [moves, range, f]);
  const types = Array.from(new Set(moves.map((m) => m.type))).sort();
  let running = 0;
  const withBal = rows.map((m) => { running += m.baseQty; return { ...m, running: f.itemId ? running : undefined }; });
  const cols: Column<(typeof withBal)[number]>[] = [
    { key: 'date', label: 'Date', render: (m) => fmtDate(m.date), sortable: true },
    { key: 'itemName', label: 'Item', render: (m) => <div><div className="cell-primary">{m.itemName}</div><div className="cell-secondary identifier">{m.itemCode}{m.batch ? ' · ' + m.batch : ''}</div></div> },
    { key: 'warehouseName', label: 'Warehouse', render: (m) => m.warehouseName ?? m.warehouseId },
    { key: 'type', label: 'Type', render: (m) => <Badge status="Draft">{m.type}</Badge> },
    { key: 'sourceNumber', label: 'Source', render: (m) => <span className="identifier link">{m.sourceNumber}</span> },
    { key: 'in', label: 'In', align: 'right', render: (m) => <span className="money" style={{ color: '#12784E' }}>{m.baseQty > 0 ? fmtQty(m.baseQty, m.uom) : '—'}</span>, total: (r) => <span className="money">{fmtQty(r.reduce((x, m) => x + Math.max(0, m.baseQty), 0))}</span> },
    { key: 'out', label: 'Out', align: 'right', render: (m) => <span className="money" style={{ color: '#C0393F' }}>{m.baseQty < 0 ? fmtQty(-m.baseQty, m.uom) : '—'}</span>, total: (r) => <span className="money">{fmtQty(r.reduce((x, m) => x + Math.max(0, -m.baseQty), 0))}</span> },
    { key: 'rate', label: 'Rate', align: 'right', render: (m) => <span className="money">{fmtMoney(m.rate, s.currency)}</span> },
    { key: 'value', label: 'Value', align: 'right', render: (m) => <span className="money">{fmtMoney(m.value * Math.sign(m.baseQty || 1), s.currency)}</span>, total: (r) => <span className="money" style={{ fontWeight: 700 }}>{fmtMoney(r.reduce((x, m) => x + m.value * Math.sign(m.baseQty || 1), 0), s.currency)}</span> },
    { key: 'running', label: 'Balance', align: 'right', render: (m) => <span className="money" style={{ fontWeight: 600 }}>{m.running !== undefined ? fmtQty(m.running) : (m.balanceAfter !== undefined ? fmtQty(m.balanceAfter) : '—')}</span> },
  ];
  return (
    <ReportFrame id="stock-ledger" title="Stock ledger" rangeLabel={rangeLabel(range)} filterState={f}
      exportColumns={[{ key: 'date', label: 'Date' }, { key: 'itemCode', label: 'Item' }, { key: 'warehouseName', label: 'Warehouse' }, { key: 'type', label: 'Type' }, { key: 'sourceNumber', label: 'Source' }, { key: 'baseQty', label: 'Qty' }, { key: 'rate', label: 'Rate' }, { key: 'value', label: 'Value' }]} exportRows={() => rows as any}
      filters={<><RangeBar f={f} set={set} /><WarehousePicker value={f.warehouseId} onChange={(v) => set({ warehouseId: v })} /><ItemPicker value={f.itemId} onChange={(v) => set({ itemId: v })} /><div><label className="field-label">Type</label><select className="field-input sm" value={f.type} onChange={(e) => set({ type: e.target.value })}><option value="">All types</option>{types.map((t) => <option key={t}>{t}</option>)}</select></div></>}>
      <DataTable rows={withBal} columns={cols} dense showTotals onRowClick={(m) => nav.go(`inventory/ledger?item=${m.itemId}`)} emptyTitle="No stock movements in this range" emptyDescription="Movements are recorded by GRN, delivery, POS, adjustments and production." />
    </ReportFrame>
  );
}

export function OnHandReport() {
  const s = useSession();
  const [f, set] = useReportFilters({ warehouseId: '', group: '' });
  const moves = useCollection<StockMovement>(C.stockMovements);
  const reservations = useCollection<any>(C.reservations);
  const items = stockItems();
  const whs = useCollection<Warehouse>(C.warehouses).filter((w) => !f.warehouseId || w.id === f.warehouseId);
  const rows = useMemo(() => items.filter((i) => !f.group || i.group === f.group).flatMap((i) => whs.map((w) => ({ item: i, wh: w, pos: engine.stockPosition(i.id, w.id) })).filter((r) => r.pos.onHand !== 0 || r.pos.reserved !== 0 || r.pos.committed !== 0)).map((r) => ({ id: r.item.id + r.wh.id, code: r.item.code, name: r.item.name, uom: r.item.baseUom, warehouse: r.wh.name, itemId: r.item.id, ...r.pos, reorderLevel: r.item.reorderLevel })), [items, whs, f.group, moves, reservations]);
  const groups = Array.from(new Set(items.map((i) => i.group).filter(Boolean))) as string[];
  const cols: Column<(typeof rows)[number]>[] = [
    { key: 'code', label: 'Item', render: (r) => <div><div className="cell-primary">{r.name}</div><div className="cell-secondary identifier">{r.code}</div></div>, sortable: true },
    { key: 'warehouse', label: 'Warehouse', sortable: true },
    { key: 'onHand', label: 'On hand', align: 'right', render: (r) => <span className="money" style={{ fontWeight: 600 }}>{fmtQty(r.onHand, r.uom)}</span>, sortable: true },
    { key: 'reserved', label: 'Reserved', align: 'right', render: (r) => <span className="money">{r.reserved ? fmtQty(r.reserved) : '—'}</span> },
    { key: 'available', label: 'Available', align: 'right', render: (r) => <span className="money" style={{ color: r.available < 0 ? '#C0393F' : '#12784E', fontWeight: 600 }}>{fmtQty(r.available)}</span> },
    { key: 'inTransit', label: 'In transit', align: 'right', render: (r) => <span className="money">{r.inTransit ? fmtQty(r.inTransit) : '—'}</span> },
    { key: 'committed', label: 'On order', align: 'right', render: (r) => <span className="money">{r.committed ? fmtQty(r.committed) : '—'}</span> },
    { key: 'projected', label: 'Projected', align: 'right', render: (r) => <span className="money">{fmtQty(r.projected)}</span> },
    { key: 'value', label: 'Value', align: 'right', render: (r) => <span className="money">{fmtMoney(r.value, s.currency)}</span>, total: (rs) => <span className="money" style={{ fontWeight: 700 }}>{fmtMoney(rs.reduce((x, r) => x + r.value, 0), s.currency)}</span> },
  ];
  return (
    <ReportFrame id="stock-onhand" title="Stock on hand & available" rangeLabel={`As at ${fmtDate(today())}`} filterState={f} exportColumns={cols.map((c) => ({ key: c.key, label: String(c.label) }))} exportRows={() => rows as any}
      filters={<><WarehousePicker value={f.warehouseId} onChange={(v) => set({ warehouseId: v })} /><div><label className="field-label">Group</label><select className="field-input sm" value={f.group} onChange={(e) => set({ group: e.target.value })}><option value="">All groups</option>{groups.map((g) => <option key={g}>{g}</option>)}</select></div></>}>
      <DataTable rows={rows} columns={cols} dense showTotals onRowClick={(r) => nav.go(`inventory/stock?item=${r.itemId}`)} emptyTitle="No stock on hand" emptyDescription="Stock positions build from posted GRNs, adjustments and opening stock." />
    </ReportFrame>
  );
}

export function ValuationReport() {
  const s = useSession();
  const [f, set] = useReportFilters({ warehouseId: '', asOf: today() });
  const moves = useCollection<StockMovement>(C.stockMovements);
  const rows = useMemo(() => stockValuation({ warehouseId: f.warehouseId || undefined, asOf: f.asOf }), [f, moves]);
  const total = rows.reduce((x, r) => x + r.value, 0);
  const cols: Column<ValuationRow>[] = [
    { key: 'code', label: 'SKU', render: (r) => <span className="identifier link">{r.code}</span>, sortable: true },
    { key: 'name', label: 'Item', sortable: true },
    { key: 'uom', label: 'UOM' },
    { key: 'qty', label: 'Qty on hand', align: 'right', render: (r) => <span className="money" style={{ fontWeight: 600 }}>{fmtQty(r.qty)}</span> },
    { key: 'avgRate', label: 'Avg cost', align: 'right', render: (r) => <span className="money">{fmtMoney(r.avgRate, s.currency)}</span> },
    { key: 'value', label: 'Stock value', align: 'right', render: (r) => <span className="money" style={{ fontWeight: 600 }}>{fmtMoney(r.value, s.currency)}</span>, total: () => <span className="money" style={{ fontWeight: 700, color: '#12784E' }}>{fmtMoney(total, s.currency)}</span>, sortable: true },
    { key: 'warehouse', label: 'Warehouse' },
    { key: 'method', label: 'Method', render: () => <Badge status="Draft">{s.company?.defaults.valuationMethod ?? 'AVCO'}</Badge> },
  ];
  // The valuation covers every warehouse, shop-floor WIP included, so the GL side must carry WIP
  // (1220) alongside finished goods (1200) and raw materials (1210) — FR-INV-008 / FR-RPT-009.
  const ledgerInv = (['acc_1200', 'acc_1210', 'acc_1220'] as string[]).reduce((x, id) => x + engine.accountBalance(id, { to: f.asOf }).net, 0);
  return (
    <ReportFrame id="stock-valuation" title="Stock valuation" rangeLabel={`As at ${fmtDate(f.asOf)} · ${s.company?.defaults.valuationMethod ?? 'AVCO'}`} filterState={f} exportColumns={cols.filter((c) => c.key !== 'method').map((c) => ({ key: c.key, label: String(c.label) }))} exportRows={() => rows as any}
      filters={<><div><label className="field-label">As at</label><input type="date" className="field-input sm" value={f.asOf} onChange={(e) => set({ asOf: e.target.value })} /></div><WarehousePicker value={f.warehouseId} onChange={(v) => set({ warehouseId: v })} /></>}>
      <div className="grid-3">
        <KpiTile label="Stock value (sub-ledger)" value={fmtMoney(total, s.currency)} sub={`${rows.length} item-warehouse lines`} />
        <KpiTile label="Inventory GL balance" value={fmtMoney(ledgerInv, s.currency)} sub="1200 + 1210 + 1220 as at date" onClick={() => nav.go('accounting/ledger?account=acc_1200')} />
        <KpiTile label="Difference" value={fmtMoney(Math.round((total - ledgerInv) * 100) / 100, s.currency)} deltaTone={Math.abs(total - ledgerInv) < 1 ? 'good' : 'bad'} delta={Math.abs(total - ledgerInv) < 1 ? 'Reconciled' : 'Sub-ledger ≠ GL'} sub="FR-RPT-009 exception if non-zero" />
      </div>
      <DataTable rows={rows} rowKey={(r) => r.itemId + r.warehouseId} columns={cols} dense showTotals onRowClick={(r) => nav.go(`inventory/ledger?item=${r.itemId}`)} emptyTitle="No stock to value" />
    </ReportFrame>
  );
}

export function MovementReport() {
  const s = useSession();
  const [f, set] = useReportFilters({ preset: 'QTD', period: s.state.periodCode ?? '', from: '', to: '', warehouseId: '', by: 'type' });
  const range = useRange(f);
  const moves = useCollection<StockMovement>(C.stockMovements);
  const rows = useMemo(() => {
    const map = new Map<string, { key: string; label: string; count: number; inQty: number; outQty: number; inValue: number; outValue: number }>();
    moves.filter((m) => m.date >= range.from && m.date <= range.to && (!f.warehouseId || m.warehouseId === f.warehouseId)).forEach((m) => {
      const key = f.by === 'type' ? m.type : f.by === 'period' ? m.date.slice(0, 7) : f.by === 'warehouse' ? (m.warehouseName ?? m.warehouseId) : m.itemName;
      const r = map.get(key) ?? { key, label: key, count: 0, inQty: 0, outQty: 0, inValue: 0, outValue: 0 };
      r.count++;
      if (m.baseQty > 0) { r.inQty += m.baseQty; r.inValue += m.value; } else { r.outQty += -m.baseQty; r.outValue += m.value; }
      map.set(key, r);
    });
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [moves, range, f]);
  const cols: Column<(typeof rows)[number]>[] = [
    { key: 'label', label: f.by === 'type' ? 'Movement type' : f.by === 'period' ? 'Period' : f.by === 'warehouse' ? 'Warehouse' : 'Item', sortable: true },
    { key: 'count', label: 'Movements', align: 'right' },
    { key: 'inQty', label: 'Qty in', align: 'right', render: (r) => <span className="money" style={{ color: '#12784E' }}>{fmtQty(r.inQty)}</span> },
    { key: 'inValue', label: 'Value in', align: 'right', render: (r) => <span className="money">{fmtMoney(r.inValue, s.currency)}</span>, total: (rs) => <span className="money">{fmtMoney(rs.reduce((x, r) => x + r.inValue, 0), s.currency)}</span> },
    { key: 'outQty', label: 'Qty out', align: 'right', render: (r) => <span className="money" style={{ color: '#C0393F' }}>{fmtQty(r.outQty)}</span> },
    { key: 'outValue', label: 'Value out', align: 'right', render: (r) => <span className="money">{fmtMoney(r.outValue, s.currency)}</span>, total: (rs) => <span className="money">{fmtMoney(rs.reduce((x, r) => x + r.outValue, 0), s.currency)}</span> },
    { key: 'net', label: 'Net value', align: 'right', render: (r) => <span className="money" style={{ fontWeight: 600 }}>{fmtMoney(r.inValue - r.outValue, s.currency)}</span> },
  ];
  return (
    <ReportFrame id="stock-movement" title="Stock movement analysis" rangeLabel={rangeLabel(range)} filterState={f} exportColumns={cols.map((c) => ({ key: c.key, label: String(c.label) }))} exportRows={() => rows as any}
      filters={<><RangeBar f={f} set={set} /><WarehousePicker value={f.warehouseId} onChange={(v) => set({ warehouseId: v })} /><div><label className="field-label">Group by</label><select className="field-input sm" value={f.by} onChange={(e) => set({ by: e.target.value })}><option value="type">Movement type</option><option value="period">Period</option><option value="warehouse">Warehouse</option><option value="item">Item</option></select></div></>}>
      <DataTable rows={rows} rowKey={(r) => r.key} columns={cols} dense showTotals emptyTitle="No movements in this range" />
    </ReportFrame>
  );
}

export function StockAgeingReport() {
  const s = useSession();
  const [f, set] = useReportFilters({ asOf: today() });
  const moves = useCollection<StockMovement>(C.stockMovements);
  const rows = useMemo(() => stockAgeing(f.asOf), [f.asOf, moves]);
  const cols: Column<AgeingStockRow>[] = [
    { key: 'code', label: 'Item', render: (r) => <div><div className="cell-primary">{r.name}</div><div className="cell-secondary identifier">{r.code}</div></div> },
    { key: 'warehouse', label: 'Warehouse' },
    { key: 'd030', label: '0–30 d', align: 'right', render: (r) => <span className="money">{r.d030 ? fmtQty(r.d030) : '—'}</span> },
    { key: 'd3160', label: '31–60 d', align: 'right', render: (r) => <span className="money" style={{ color: '#F97316' }}>{r.d3160 ? fmtQty(r.d3160) : '—'}</span> },
    { key: 'd6190', label: '61–90 d', align: 'right', render: (r) => <span className="money" style={{ color: '#EF4444' }}>{r.d6190 ? fmtQty(r.d6190) : '—'}</span> },
    { key: 'd90p', label: '> 90 d', align: 'right', render: (r) => <span className="money" style={{ color: '#C0393F', fontWeight: 600 }}>{r.d90p ? fmtQty(r.d90p) : '—'}</span> },
    { key: 'total', label: 'On hand', align: 'right', render: (r) => <span className="money" style={{ fontWeight: 600 }}>{fmtQty(r.total)}</span> },
    { key: 'value', label: 'Value (FIFO)', align: 'right', render: (r) => <span className="money">{fmtMoney(r.value, s.currency)}</span>, total: (rs) => <span className="money" style={{ fontWeight: 700 }}>{fmtMoney(rs.reduce((x, r) => x + r.value, 0), s.currency)}</span> },
  ];
  return (
    <ReportFrame id="stock-ageing" title="Stock ageing" subtitle="FIFO buckets by receipt date — on-hand quantity allocated to the newest receipts first" rangeLabel={`As at ${fmtDate(f.asOf)}`} filterState={f} exportColumns={cols.map((c) => ({ key: c.key, label: String(c.label) }))} exportRows={() => rows as any}
      filters={<div><label className="field-label">As at</label><input type="date" className="field-input sm" value={f.asOf} onChange={(e) => set({ asOf: e.target.value })} /></div>}>
      <DataTable rows={rows} rowKey={(r) => r.itemId + r.warehouse} columns={cols} dense showTotals emptyTitle="No stock to age" />
    </ReportFrame>
  );
}

export function ReorderReport() {
  const s = useSession();
  const moves = useCollection<StockMovement>(C.stockMovements);
  const rows = useMemo(() => stockItems().map((i) => { const p = engine.stockPosition(i.id); return { id: i.id, code: i.code, name: i.name, uom: i.baseUom, onHand: p.onHand, available: p.available, onOrder: p.committed, projected: p.projected, reorderLevel: i.reorderLevel, reorderQty: i.reorderQty, safetyStock: i.safetyStock, leadTimeDays: i.leadTimeDays, supplier: db.find<any>(C.suppliers, i.preferredSupplierId)?.name ?? '—', shortfall: Math.max(0, i.reorderLevel - p.projected) }; }).filter((r) => r.reorderLevel > 0 && r.projected <= r.reorderLevel).sort((a, b) => b.shortfall - a.shortfall), [moves]);
  const cols: Column<(typeof rows)[number]>[] = [
    { key: 'code', label: 'Item', render: (r) => <div><div className="cell-primary">{r.name}</div><div className="cell-secondary identifier">{r.code}</div></div> },
    { key: 'onHand', label: 'On hand', align: 'right', render: (r) => <span className="money">{fmtQty(r.onHand, r.uom)}</span> },
    { key: 'onOrder', label: 'On order', align: 'right', render: (r) => <span className="money">{r.onOrder ? fmtQty(r.onOrder) : '—'}</span> },
    { key: 'projected', label: 'Projected', align: 'right', render: (r) => <span className="money" style={{ color: r.projected < r.safetyStock ? '#C0393F' : '#0A0A0A' }}>{fmtQty(r.projected)}</span> },
    { key: 'reorderLevel', label: 'Reorder level', align: 'right', render: (r) => <span className="money">{fmtQty(r.reorderLevel)}</span> },
    { key: 'shortfall', label: 'Shortfall', align: 'right', render: (r) => <Pill tone={r.projected < r.safetyStock ? 'critical' : 'warning'}>{fmtQty(r.shortfall)}</Pill> },
    { key: 'reorderQty', label: 'Suggested qty', align: 'right', render: (r) => <span className="money" style={{ fontWeight: 600 }}>{fmtQty(Math.max(r.reorderQty, r.shortfall), r.uom)}</span> },
    { key: 'supplier', label: 'Preferred supplier' },
    { key: 'leadTimeDays', label: 'Lead time', render: (r) => `${r.leadTimeDays} d` },
  ];
  return (
    <ReportFrame id="reorder" title="Reorder report" subtitle="Items whose projected stock (on hand − reserved + on order + in transit) is at or below reorder level" rangeLabel={`As at ${fmtDate(today())}`} exportColumns={cols.map((c) => ({ key: c.key, label: String(c.label) }))} exportRows={() => rows as any}>
      <DataTable rows={rows} columns={cols} dense onRowClick={(r) => nav.go(`inventory/replenishment?item=${r.id}`)} emptyTitle="Nothing to reorder" emptyDescription="All items are above their reorder level." />
    </ReportFrame>
  );
}

export function CountVarianceReport() {
  const s = useSession();
  const counts = useCollection<any>(C.stockCounts);
  const rows = useMemo(() => counts.flatMap((c) => (c.lines ?? []).map((l: any) => ({ id: `${c.id}_${l.id ?? l.itemId}`, count: c.number, date: c.date, warehouse: db.find<any>(C.warehouses, c.warehouseId)?.name ?? c.warehouseId, status: c.status, itemName: l.itemName, itemCode: l.itemCode, system: l.systemQty ?? l.expectedQty ?? 0, counted: l.countedQty ?? l.qty ?? 0, variance: (l.countedQty ?? l.qty ?? 0) - (l.systemQty ?? l.expectedQty ?? 0), rate: l.rate ?? 0 }))), [counts]);
  const cols: Column<(typeof rows)[number]>[] = [
    { key: 'count', label: 'Count', render: (r) => <span className="identifier link">{r.count}</span> },
    { key: 'date', label: 'Date', render: (r) => fmtDate(r.date) },
    { key: 'warehouse', label: 'Warehouse' },
    { key: 'itemName', label: 'Item', render: (r) => <div><div className="cell-primary">{r.itemName}</div><div className="cell-secondary identifier">{r.itemCode}</div></div> },
    { key: 'system', label: 'System', align: 'right', render: (r) => <span className="money">{fmtQty(r.system)}</span> },
    { key: 'counted', label: 'Counted', align: 'right', render: (r) => <span className="money">{fmtQty(r.counted)}</span> },
    { key: 'variance', label: 'Variance', align: 'right', render: (r) => <span className="money" style={{ color: r.variance < 0 ? '#C0393F' : r.variance > 0 ? '#12784E' : '#5F6368', fontWeight: 600 }}>{r.variance === 0 ? '—' : fmtQty(r.variance)}</span> },
    { key: 'value', label: 'Variance value', align: 'right', render: (r) => <span className="money">{fmtMoney(r.variance * r.rate, s.currency)}</span>, total: (rs) => <span className="money" style={{ fontWeight: 700 }}>{fmtMoney(rs.reduce((x, r) => x + r.variance * r.rate, 0), s.currency)}</span> },
    { key: 'status', label: 'Status', render: (r) => <Badge status={r.status} /> },
  ];
  return (
    <ReportFrame id="count-variance" title="Stock count variance" rangeLabel="All counts" exportColumns={cols.map((c) => ({ key: c.key, label: String(c.label) }))} exportRows={() => rows as any}>
      <DataTable rows={rows} columns={cols} dense showTotals onRowClick={() => nav.go('inventory/counts')} emptyTitle="No stock counts recorded" emptyDescription="Variances appear once a physical count is entered under Inventory › Counts." />
    </ReportFrame>
  );
}
