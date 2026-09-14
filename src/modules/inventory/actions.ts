// Inventory posting logic: adjustments, transfers, counts, replenishment, landed cost, valuation.
import { db, C, engine, ValidationError, IDS } from '../../store';
import type { Company, Item, StockMovement, Warehouse, Reservation, Supplier } from '../../store';
import { round, today, uid, addDays } from '../../lib/format';
import type { InventorySettings, StockAdjustment, AdjustmentLine, StockTransfer, TransferLine, StockCount, CountLine, LandedCost, LandedCostAllocation, LandedCostBasis } from './types';
import type { Grn, PurchaseOrder } from '../purchase/types';

const r2 = (n: number) => round(n);
const r3 = (n: number) => round(n, 3);

export function inventorySettings(company?: Company): InventorySettings {
  const d = (company ?? engine.ctx().company)?.defaults as (Company['defaults'] & Partial<InventorySettings>) | undefined;
  const transit = db.findBy<Warehouse>(C.warehouses, (w) => w.type === 'Transit' && w.status === 'Active');
  const scrap = db.findBy<Warehouse>(C.warehouses, (w) => w.type === 'Scrap' && w.status === 'Active');
  return { negativeStockPolicy: d?.negativeStockPolicy ?? (d?.allowNegativeStock ? 'Allow' : 'Block'), valuationMethod: d?.valuationMethod ?? 'AVCO', transitWarehouseId: d?.transitWarehouseId ?? transit?.id ?? IDS.whTransit, scrapWarehouseId: d?.scrapWarehouseId ?? scrap?.id ?? 'wh_scrap', countTolerancePct: d?.countTolerancePct ?? 2 };
}

export function saveInventorySettings(patch: Partial<InventorySettings>) {
  const c = engine.ctx();
  if (!c.company) return;
  db.update<Company>(C.companies, c.company.id, { defaults: { ...c.company.defaults, ...patch, allowNegativeStock: (patch.negativeStockPolicy ?? inventorySettings().negativeStockPolicy) === 'Allow' } as Company['defaults'] });
  engine.audit({ action: 'inventory.settings.updated', objectType: 'Company', objectId: c.company.id, detail: JSON.stringify(patch) });
}

export function stockItems(): Item[] {
  const cid = engine.ctx().companyId;
  return db.where<Item>(C.items, (i) => i.companyId === cid && i.isStock && i.type !== 'Service');
}

export function activeWarehouses(): Warehouse[] {
  const cid = engine.ctx().companyId;
  return db.where<Warehouse>(C.warehouses, (w) => w.companyId === cid && w.status === 'Active');
}

/** AVCO valuation including value-only (landed cost) movements. */
/**
 * AVCO valuation for an item (optionally one warehouse, optionally as at a date).
 *
 * There is one valuation engine in the app: `engine.stockPosition`, whose `value` is the moving
 * average stock-ledger balance (receipts + landed cost − issues). That is exactly what the
 * inventory control accounts carry, so this must never recompute it — a second implementation is
 * how the stock-valuation report and this page came to disagree (FR-INV-008, FR-RPT-009).
 */
export function valuation(itemId: string, warehouseId?: string, asOf?: string) {
  const p = engine.stockPosition(itemId, warehouseId, { asOf });
  return p.onHand > 0 ? { qty: p.onHand, value: p.value, avgRate: p.avgRate } : { qty: p.onHand, value: 0, avgRate: 0 };
}

// ── Adjustments (FR-INV-005) ───────────────────────────────────────────────

export function newAdjustment(): StockAdjustment {
  const c = engine.ctx();
  const base = engine.newDocHeader('Stock Adjustment');
  const wh = c.company?.defaults.warehouseId ?? activeWarehouses()[0]?.id ?? '';
  return { ...base, docType: 'Stock Adjustment', status: 'Draft', warehouseId: wh, warehouseName: db.find<Warehouse>(C.warehouses, wh)?.name, adjustmentType: 'Count variance', reasonCode: '', reason: '', lines: [], totalValue: 0 } as StockAdjustment;
}

export function adjustmentLine(itemId: string, warehouseId: string, qty = 0): AdjustmentLine {
  const item = db.find<Item>(C.items, itemId);
  const pos = engine.stockPosition(itemId, warehouseId);
  const rate = pos.avgRate || item?.purchasePrice || item?.standardCost || 0;
  return { ...engine.newLine({ itemId, itemCode: item?.code, itemName: item?.name ?? '', uom: item?.baseUom ?? 'Nos', qty, rate, warehouseId }), value: r2(Math.abs(qty) * rate) } as AdjustmentLine;
}

export function computeAdjustment(a: StockAdjustment): StockAdjustment {
  const lines = a.lines.map((l) => ({ ...l, warehouseId: a.warehouseId, value: r2(Math.abs(l.qty) * l.rate), amount: r2(Math.abs(l.qty) * l.rate), taxable: 0, taxAmt: 0 }));
  const totalValue = r2(lines.reduce((s, l) => s + l.value, 0));
  return { ...a, lines, totalValue, warehouseName: db.find<Warehouse>(C.warehouses, a.warehouseId)?.name, totals: { ...engine.emptyTotals(), subtotal: totalValue, total: totalValue, baseTotal: totalValue } };
}

export function validateAdjustment(a: StockAdjustment): string[] {
  const e: string[] = [];
  if (!a.warehouseId) e.push('Warehouse is required');
  if (!a.reasonCode) e.push('Reason code is required');
  if (!a.reason || a.reason.trim().length < 10) e.push('Reason (10+ characters) is required — FR-INV-005');
  if (!a.lines.length) e.push('Add at least one line');
  a.lines.forEach((l, i) => {
    if (!l.itemId) e.push(`Line ${i + 1}: choose an item`);
    else if (!l.qty) e.push(`Line ${i + 1}: quantity cannot be zero (use − for write-off)`);
    else if (l.qty < 0 && inventorySettings().negativeStockPolicy === 'Block') { const pos = engine.stockPosition(l.itemId, a.warehouseId, { batch: l.batch }); if (pos.onHand + l.qty < -0.0005) e.push(`Line ${i + 1}: only ${pos.onHand} on hand${l.batch ? ' in batch ' + l.batch : ''}`); }
    const item = db.find<Item>(C.items, l.itemId);
    if (item?.tracking === 'Serial' && (l.serials?.length ?? 0) !== Math.abs(Math.round(l.qty))) e.push(`Line ${i + 1}: ${Math.abs(l.qty)} serial number(s) required`);
  });
  return e;
}

export function saveAdjustment(input: StockAdjustment): StockAdjustment {
  const a = computeAdjustment(input);
  const existing = db.find<StockAdjustment>(C.stockAdjustments, a.id);
  if (existing) { if (!['Draft', 'Returned'].includes(existing.status)) throw new ValidationError(`Adjustment is ${existing.status}`, 'INVALID_STATE'); return db.update<StockAdjustment>(C.stockAdjustments, a.id, { ...a }, { expectedVersion: existing.version }); }
  return db.insert<StockAdjustment>(C.stockAdjustments, { ...a, number: 'ADJ/DRAFT' });
}

/** Submit: workflow 'Stock Adjustment' (seeded rule > ₹5,000) else post directly. */
export function submitAdjustment(input: StockAdjustment): StockAdjustment {
  const errs = validateAdjustment(input);
  if (errs.length) throw new ValidationError(errs.join(' · '), 'VALIDATION');
  const saved = saveAdjustment(input);
  return db.transaction(() => {
    const req = engine.submitForApproval({ docType: 'Stock Adjustment', collection: C.stockAdjustments, docId: saved.id, docNumber: saved.number, amount: saved.totalValue, summary: `${saved.adjustmentType} · ${saved.warehouseName} · ${saved.lines.length} line(s)` });
    if (!req) return postAdjustment(saved.id);
    return db.find<StockAdjustment>(C.stockAdjustments, saved.id)!;
  });
}

export function postAdjustment(id: string): StockAdjustment {
  const a = db.find<StockAdjustment>(C.stockAdjustments, id);
  if (!a) throw new ValidationError('Adjustment not found', 'NOT_FOUND');
  if (!['Draft', 'Approved', 'Returned'].includes(a.status)) throw new ValidationError(`Adjustment is ${a.status}`, 'INVALID_STATE');
  if (a.status === 'Draft' && engine.resolveWorkflow('Stock Adjustment', { amount: a.totalValue, branchId: a.branchId })) throw new ValidationError('This adjustment needs approval — submit it first', 'APPROVAL_REQUIRED');
  const errs = validateAdjustment(a);
  if (errs.length) throw new ValidationError(errs.join(' · '), 'VALIDATION');
  return db.transaction(() => {
    engine.assertPostable(a.date);
    const c = engine.ctx();
    const number = a.number.includes('DRAFT') ? engine.allocateNumber('Stock Adjustment', { date: a.date, branchId: a.branchId }) : a.number;
    const byAcc: Record<string, number> = {};
    a.lines.forEach((l) => {
      const item = db.find<Item>(C.items, l.itemId)!;
      engine.moveStock({ date: a.date, itemId: l.itemId!, warehouseId: a.warehouseId, qty: l.qty, uom: l.uom, rate: l.rate, type: 'Adjustment', sourceType: 'Stock Adjustment', sourceId: a.id, sourceNumber: number, batch: l.batch, serials: l.serials, allowNegative: inventorySettings().negativeStockPolicy !== 'Block' });
      const acc = item.inventoryAccountId ?? IDS.accInvFG;
      byAcc[acc] = r2((byAcc[acc] ?? 0) + l.qty * l.rate);
    });
    const lines: engine.PostLine[] = [];
    Object.entries(byAcc).forEach(([acc, v]) => { if (v > 0) lines.push({ accountId: acc, dr: v }); else if (v < 0) lines.push({ accountId: acc, cr: -v }); });
    const net = r2(Object.values(byAcc).reduce((s, v) => s + v, 0));
    if (net > 0) lines.push({ accountId: IDS.accInvAdj, cr: net }); else if (net < 0) lines.push({ accountId: IDS.accInvAdj, dr: -net });
    const j = lines.length ? engine.postJournal({ date: a.date, branchId: a.branchId, sourceType: 'Stock Adjustment', sourceId: a.id, sourceNumber: number, narration: `${a.adjustmentType} · ${number} · ${a.reason}`, idempotencyKey: `${a.id}:post`, lines }) : undefined;
    const out = db.update<StockAdjustment>(C.stockAdjustments, id, { status: 'Posted', number, journalId: j?.id, journalNumber: j?.number, postedAt: new Date().toISOString(), postedBy: c.userName, approverName: a.approverName ?? (a.status === 'Approved' ? db.findBy<any>(C.approvals, (x) => x.docId === id)?.steps.find((s: any) => s.status === 'Approved')?.actedBy : undefined) });
    engine.audit({ action: 'stock_adjustment.posted', objectType: 'Stock Adjustment', objectId: id, objectNumber: number, detail: `${a.adjustmentType} · ${a.lines.length} line(s) · ${a.totalValue}`, correlationId: a.correlationId });
    return out;
  });
}

export function reverseAdjustment(id: string, reason: string) {
  const a = db.find<StockAdjustment>(C.stockAdjustments, id);
  if (!a || a.status !== 'Posted') throw new ValidationError('Only posted adjustments can be reversed', 'INVALID_STATE');
  db.transaction(() => {
    const date = today();
    engine.assertPostable(date);
    engine.reverseStockMovements(a.id, { date, reason, sourceType: 'Stock Adjustment Reversal', sourceNumber: a.number });
    if (a.journalId) engine.reverseJournal(a.journalId, { reason, date });
    db.update<StockAdjustment>(C.stockAdjustments, id, { status: 'Reversed', reversalReason: reason });
    engine.audit({ action: 'stock_adjustment.reversed', objectType: 'Stock Adjustment', objectId: id, objectNumber: a.number, detail: reason });
  });
}

// ── Transfers (FR-INV-006) ─────────────────────────────────────────────────

export function newTransfer(): StockTransfer {
  const c = engine.ctx();
  const base = engine.newDocHeader('Stock Transfer');
  const whs = activeWarehouses().filter((w) => w.type === 'Standard');
  const from = c.company?.defaults.warehouseId ?? whs[0]?.id ?? '';
  const to = whs.find((w) => w.id !== from)?.id ?? '';
  return { ...base, docType: 'Stock Transfer', status: 'Draft', fromWarehouseId: from, toWarehouseId: to, lines: [], totalValue: 0 } as StockTransfer;
}

export function transferLine(itemId: string, fromWh: string, qty = 1): TransferLine {
  const item = db.find<Item>(C.items, itemId);
  const pos = engine.stockPosition(itemId, fromWh);
  return { ...engine.newLine({ itemId, itemCode: item?.code, itemName: item?.name ?? '', uom: item?.baseUom ?? 'Nos', qty, rate: pos.avgRate || item?.purchasePrice || 0, warehouseId: fromWh }) } as TransferLine;
}

export function computeTransfer(t: StockTransfer): StockTransfer {
  const lines = t.lines.map((l) => ({ ...l, amount: r2(l.qty * l.rate), taxable: r2(l.qty * l.rate) }));
  const totalValue = r2(lines.reduce((s, l) => s + l.amount, 0));
  return { ...t, lines, totalValue, fromWarehouseName: db.find<Warehouse>(C.warehouses, t.fromWarehouseId)?.name, toWarehouseName: db.find<Warehouse>(C.warehouses, t.toWarehouseId)?.name, totals: { ...engine.emptyTotals(), subtotal: totalValue, total: totalValue, baseTotal: totalValue } };
}

export function validateTransfer(t: StockTransfer): string[] {
  const e: string[] = [];
  if (!t.fromWarehouseId || !t.toWarehouseId) e.push('Choose both warehouses');
  if (t.fromWarehouseId === t.toWarehouseId) e.push('Source and destination must differ');
  if (!t.lines.length) e.push('Add at least one line');
  t.lines.forEach((l, i) => { if (!l.itemId) e.push(`Line ${i + 1}: choose an item`); else if (l.qty <= 0) e.push(`Line ${i + 1}: quantity must be positive`); else { const pos = engine.stockPosition(l.itemId, t.fromWarehouseId, { batch: l.batch }); if (l.qty > pos.available + 0.0005) e.push(`Line ${i + 1}: only ${pos.available} available in ${t.fromWarehouseName ?? 'source'}${l.batch ? ' (batch ' + l.batch + ')' : ''}`); } const item = db.find<Item>(C.items, l.itemId); if (item?.tracking === 'Serial' && (l.serials?.length ?? 0) !== Math.round(l.qty)) e.push(`Line ${i + 1}: ${l.qty} serial numbers required`); });
  return e;
}

export function saveTransfer(input: StockTransfer): StockTransfer {
  const t = computeTransfer(input);
  const existing = db.find<StockTransfer>(C.stockTransfers, t.id);
  if (existing) { if (existing.status !== 'Draft') throw new ValidationError(`Transfer is ${existing.status}`, 'INVALID_STATE'); return db.update<StockTransfer>(C.stockTransfers, t.id, { ...t }, { expectedVersion: existing.version }); }
  const number = engine.allocateNumber('Stock Transfer', { date: t.date, branchId: t.branchId });
  const out = db.insert<StockTransfer>(C.stockTransfers, { ...t, number });
  engine.audit({ action: 'stock_transfer.created', objectType: 'Stock Transfer', objectId: out.id, objectNumber: number });
  return out;
}

/** Dispatch: source → transit warehouse. */
export function dispatchTransfer(id: string): StockTransfer {
  const t = db.find<StockTransfer>(C.stockTransfers, id);
  if (!t) throw new ValidationError('Transfer not found', 'NOT_FOUND');
  if (t.status !== 'Draft') throw new ValidationError(`Transfer is ${t.status}`, 'INVALID_STATE');
  const errs = validateTransfer(t);
  if (errs.length) throw new ValidationError(errs.join(' · '), 'VALIDATION');
  const transit = inventorySettings().transitWarehouseId;
  return db.transaction(() => {
    const date = today();
    engine.assertPostable(date);
    t.lines.forEach((l) => {
      const out = engine.moveStock({ date, itemId: l.itemId!, warehouseId: t.fromWarehouseId, qty: -l.qty, uom: l.uom, type: 'Transfer Out', sourceType: 'Stock Transfer', sourceId: t.id, sourceNumber: t.number, batch: l.batch, serials: l.serials });
      engine.moveStock({ date, itemId: l.itemId!, warehouseId: transit, qty: l.qty, uom: l.uom, rate: out.rate, type: 'Transfer In', sourceType: 'Stock Transfer', sourceId: t.id, sourceNumber: t.number, batch: l.batch, serials: l.serials });
    });
    const res = db.update<StockTransfer>(C.stockTransfers, id, { status: 'In Transit', dispatchedAt: new Date().toISOString(), dispatchedBy: engine.ctx().userName });
    engine.audit({ action: 'stock_transfer.dispatched', objectType: 'Stock Transfer', objectId: id, objectNumber: t.number, detail: `${t.fromWarehouseName} → transit · ${t.lines.length} line(s)` });
    return res;
  });
}

/** Receive: transit → destination; shortage / damage goes to scrap with reason. */
export function receiveTransfer(id: string, received: { lineId: string; receivedQty: number; damageQty: number; reason?: string }[]): StockTransfer {
  const t = db.find<StockTransfer>(C.stockTransfers, id);
  if (!t) throw new ValidationError('Transfer not found', 'NOT_FOUND');
  if (t.status !== 'In Transit') throw new ValidationError(`Transfer is ${t.status}`, 'INVALID_STATE');
  const s = inventorySettings();
  const lines = t.lines.map((l) => { const r = received.find((x) => x.lineId === l.id); const rq = r?.receivedQty ?? l.qty; const dq = r?.damageQty ?? 0; if (rq + dq > l.qty + 0.0005) throw new ValidationError(`${l.itemName}: received + damaged exceeds dispatched ${l.qty}`, 'VALIDATION'); const short = r3(l.qty - rq - dq); if ((short > 0 || dq > 0) && !r?.reason?.trim()) throw new ValidationError(`${l.itemName}: reason required for shortage / damage`, 'VALIDATION'); return { ...l, receivedQty: rq, damageQty: dq, shortageQty: short, shortageReason: r?.reason }; });
  return db.transaction(() => {
    const date = today();
    engine.assertPostable(date);
    let lossValue = 0;
    const lossByAcc: Record<string, number> = {};
    lines.forEach((l) => {
      // carry the cost the goods actually left transit at, so destination + loss tie to the transit relief
      const out = engine.moveStock({ date, itemId: l.itemId!, warehouseId: s.transitWarehouseId, qty: -l.qty, uom: l.uom, type: 'Transfer Out', sourceType: 'Stock Transfer', sourceId: t.id, sourceNumber: t.number, batch: l.batch, serials: l.serials, allowNegative: true });
      if (l.receivedQty! > 0) engine.moveStock({ date, itemId: l.itemId!, warehouseId: t.toWarehouseId, qty: l.receivedQty!, uom: l.uom, rate: out.rate, type: 'Transfer In', sourceType: 'Stock Transfer', sourceId: t.id, sourceNumber: t.number, batch: l.batch, serials: l.serials?.slice(0, Math.round(l.receivedQty!)) });
      const lost = r3((l.damageQty ?? 0) + (l.shortageQty ?? 0));
      if (lost > 0) {
        // damaged / short goods are written off: the scrap yard holds quantity only (zero value), the
        // item's own inventory account is relieved — valuation and GL move together (FR-INV-008)
        engine.moveStock({ date, itemId: l.itemId!, warehouseId: s.scrapWarehouseId, qty: lost, uom: l.uom, rate: 0, type: 'Scrap', sourceType: 'Stock Transfer', sourceId: t.id, sourceNumber: t.number, batch: l.batch });
        const value = r2(lost * out.rate);
        const acc = db.find<Item>(C.items, l.itemId)?.inventoryAccountId ?? IDS.accInvFG;
        lossByAcc[acc] = r2((lossByAcc[acc] ?? 0) + value);
        lossValue = r2(lossValue + value);
      }
    });
    let journalId: string | undefined;
    if (lossValue > 0) {
      const j = engine.postJournal({ date, branchId: t.branchId, sourceType: 'Stock Transfer', sourceId: t.id, sourceNumber: t.number, narration: `Transit shortage / damage on ${t.number}`, idempotencyKey: `${t.id}:loss`, lines: [{ accountId: IDS.accScrap, dr: lossValue }, ...Object.entries(lossByAcc).map(([accountId, cr]) => ({ accountId, cr }))] });
      journalId = j.id;
    }
    const res = db.update<StockTransfer>(C.stockTransfers, id, { lines, status: 'Completed', receivedAt: new Date().toISOString(), receivedBy: engine.ctx().userName, journalId });
    engine.audit({ action: 'stock_transfer.received', objectType: 'Stock Transfer', objectId: id, objectNumber: t.number, detail: `→ ${t.toWarehouseName}${lossValue ? ` · loss ${lossValue}` : ''}` });
    return res;
  });
}

export function reverseTransfer(id: string, reason: string) {
  const t = db.find<StockTransfer>(C.stockTransfers, id);
  if (!t) throw new ValidationError('Transfer not found', 'NOT_FOUND');
  if (t.status !== 'Completed' && t.status !== 'In Transit') throw new ValidationError(`Transfer is ${t.status}`, 'INVALID_STATE');
  db.transaction(() => {
    const date = today();
    engine.assertPostable(date);
    engine.reverseStockMovements(t.id, { date, reason, sourceType: 'Stock Transfer Reversal', sourceNumber: t.number });
    if (t.journalId) engine.reverseJournal(t.journalId, { reason, date });
    db.update<StockTransfer>(C.stockTransfers, id, { status: 'Reversed', reversalReason: reason });
    engine.audit({ action: 'stock_transfer.reversed', objectType: 'Stock Transfer', objectId: id, objectNumber: t.number, detail: reason });
  });
}

export function cancelTransfer(id: string, reason: string) {
  const t = db.find<StockTransfer>(C.stockTransfers, id);
  if (!t || t.status !== 'Draft') throw new ValidationError('Only draft transfers can be cancelled', 'INVALID_STATE');
  db.update<StockTransfer>(C.stockTransfers, id, { status: 'Cancelled', cancelReason: reason });
  engine.audit({ action: 'stock_transfer.cancelled', objectType: 'Stock Transfer', objectId: id, objectNumber: t.number, detail: reason });
}

// ── Stock counts (FR-INV-007) ──────────────────────────────────────────────

export function createCount(input: { warehouseId: string; group?: string; itemIds?: string[]; date?: string; notes?: string }): StockCount {
  const wh = db.find<Warehouse>(C.warehouses, input.warehouseId);
  if (!wh) throw new ValidationError('Warehouse is required', 'VALIDATION', 'warehouseId');
  const items = stockItems().filter((i) => (!input.group || i.group === input.group) && (!input.itemIds?.length || input.itemIds.includes(i.id)));
  const countLines: CountLine[] = [];
  items.forEach((i) => {
    if (i.tracking === 'Batch') {
      const batches = Array.from(new Set(db.where<StockMovement>(C.stockMovements, (m) => m.itemId === i.id && m.warehouseId === wh.id && !!m.batch).map((m) => m.batch!)));
      const rows = batches.map((b) => ({ b, pos: engine.stockPosition(i.id, wh.id, { batch: b }) })).filter((x) => x.pos.onHand !== 0);
      if (rows.length) { rows.forEach((x) => countLines.push({ id: uid('cl'), itemId: i.id, itemCode: i.code, itemName: i.name, uom: i.baseUom, batch: x.b, systemQty: x.pos.onHand, countedQty: null, rate: x.pos.avgRate })); return; }
    }
    const pos = engine.stockPosition(i.id, wh.id);
    if (pos.onHand !== 0 || input.itemIds?.includes(i.id)) countLines.push({ id: uid('cl'), itemId: i.id, itemCode: i.code, itemName: i.name, uom: i.baseUom, systemQty: pos.onHand, countedQty: null, rate: pos.avgRate });
  });
  if (!countLines.length) throw new ValidationError('No stock items found for this warehouse / group', 'VALIDATION');
  const base = engine.newDocHeader('Stock Count', { date: input.date });
  const number = engine.allocateNumber('Stock Count', { date: base.date, branchId: base.branchId });
  const sc = db.insert<StockCount>(C.stockCounts, { ...base, number, docType: 'Stock Count', status: 'In Progress', warehouseId: wh.id, warehouseName: wh.name, itemGroup: input.group, frozenAt: new Date().toISOString(), countLines, notes: input.notes } as StockCount);
  engine.audit({ action: 'stock_count.created', objectType: 'Stock Count', objectId: sc.id, objectNumber: number, detail: `${wh.name} · ${countLines.length} line(s) frozen` });
  return sc;
}

export function saveCountProgress(id: string, counted: Record<string, number | null>): StockCount {
  const sc = db.find<StockCount>(C.stockCounts, id);
  if (!sc) throw new ValidationError('Count not found', 'NOT_FOUND');
  if (sc.status !== 'In Progress' && sc.status !== 'Draft' && sc.status !== 'Rejected') throw new ValidationError(`Count is ${sc.status}`, 'INVALID_STATE');
  const c = engine.ctx();
  const countLines = sc.countLines.map((l) => (counted[l.id] !== undefined && counted[l.id] !== l.countedQty ? { ...l, countedQty: counted[l.id], countedBy: counted[l.id] === null ? undefined : c.userName, countedAt: counted[l.id] === null ? undefined : new Date().toISOString() } : l));
  return db.update<StockCount>(C.stockCounts, id, { countLines, status: 'In Progress' });
}

export function countVariance(sc: StockCount) {
  const rows = sc.countLines.map((l) => ({ ...l, variance: l.countedQty === null ? null : r3(l.countedQty - l.systemQty), varianceValue: l.countedQty === null ? 0 : r2((l.countedQty - l.systemQty) * l.rate) }));
  return { rows, matched: rows.filter((r) => r.variance === 0).length, variances: rows.filter((r) => r.variance !== null && r.variance !== 0).length, pending: rows.filter((r) => r.variance === null).length, netValue: r2(rows.reduce((s, r) => s + r.varianceValue, 0)), absValue: r2(rows.reduce((s, r) => s + Math.abs(r.varianceValue), 0)) };
}

export function submitCount(id: string): StockCount {
  const sc = db.find<StockCount>(C.stockCounts, id);
  if (!sc) throw new ValidationError('Count not found', 'NOT_FOUND');
  const v = countVariance(sc);
  if (v.pending) throw new ValidationError(`${v.pending} line(s) not counted yet`, 'VALIDATION');
  return db.transaction(() => {
    const req = engine.submitForApproval({ docType: 'Stock Adjustment', collection: C.stockCounts, docId: sc.id, docNumber: sc.number, amount: v.absValue, summary: `Stock count ${sc.warehouseName} · ${v.variances} variance(s) · net ${v.netValue}` });
    if (!req) { db.update<StockCount>(C.stockCounts, id, { status: 'Approved', submittedAt: new Date().toISOString(), submittedBy: engine.ctx().userName }); }
    engine.audit({ action: 'stock_count.submitted', objectType: 'Stock Count', objectId: id, objectNumber: sc.number, detail: `${v.variances} variance(s) · ${v.absValue}` });
    return db.find<StockCount>(C.stockCounts, id)!;
  });
}

/** After approval: create + post the variance adjustment. */
export function postCountVariance(id: string): { count: StockCount; adjustment?: StockAdjustment } {
  const sc = db.find<StockCount>(C.stockCounts, id);
  if (!sc) throw new ValidationError('Count not found', 'NOT_FOUND');
  if (sc.status !== 'Approved') throw new ValidationError(`Count is ${sc.status} — approval required before posting`, 'INVALID_STATE');
  const v = countVariance(sc);
  return db.transaction(() => {
    const varRows = v.rows.filter((r) => r.variance !== null && r.variance !== 0);
    if (!varRows.length) { const count = db.update<StockCount>(C.stockCounts, id, { status: 'Posted', postedAt: new Date().toISOString(), postedBy: engine.ctx().userName }); engine.audit({ action: 'stock_count.posted', objectType: 'Stock Count', objectId: id, objectNumber: sc.number, detail: 'No variances' }); return { count }; }
    const adj = computeAdjustment({ ...newAdjustment(), warehouseId: sc.warehouseId, adjustmentType: 'Count variance', reasonCode: 'COUNTVAR', reason: `Physical count variance per ${sc.number} (${sc.warehouseName})`, countId: sc.id, countNumber: sc.number, lines: varRows.map((r) => ({ ...adjustmentLine(r.itemId, sc.warehouseId, r.variance!), rate: r.rate, batch: r.batch, reasonCode: 'COUNTVAR' })) });
    const saved = db.insert<StockAdjustment>(C.stockAdjustments, { ...adj, number: 'ADJ/DRAFT', status: 'Approved', approverName: db.findBy<any>(C.approvals, (x) => x.docId === id)?.steps.find((s: any) => s.status === 'Approved')?.actedBy });
    const posted = postAdjustment(saved.id);
    const count = db.update<StockCount>(C.stockCounts, id, { status: 'Posted', adjustmentId: posted.id, adjustmentNumber: posted.number, postedAt: new Date().toISOString(), postedBy: engine.ctx().userName });
    engine.audit({ action: 'stock_count.posted', objectType: 'Stock Count', objectId: id, objectNumber: sc.number, detail: `Variance adjustment ${posted.number} · ${v.netValue}` });
    return { count, adjustment: posted };
  });
}

export function approveCountDirect(id: string, decision: 'Approved' | 'Rejected', comment: string) {
  const sc = db.find<StockCount>(C.stockCounts, id);
  if (!sc) throw new ValidationError('Count not found', 'NOT_FOUND');
  const req = db.findBy<any>(C.approvals, (a) => a.docId === id && a.status === 'Pending');
  if (req) { engine.actOnApproval(req.id, decision === 'Approved' ? 'Approve' : 'Reject', { comment }); return; }
  db.update<StockCount>(C.stockCounts, id, { status: decision });
  engine.audit({ action: `stock_count.${decision.toLowerCase()}`, objectType: 'Stock Count', objectId: id, objectNumber: sc.number, detail: comment });
}

// ── Replenishment (FR-TRD-002) ─────────────────────────────────────────────

export interface Suggestion { item: Item; onHand: number; available: number; reserved: number; committed: number; inTransit: number; projected: number; reorderLevel: number; safetyStock: number; shortfall: number; suggestedQty: number; supplierId?: string; supplierName?: string; leadTimeDays: number; needBy: string; trigger: 'Below reorder level' | 'Below safety stock' | 'Out of stock' }

export function replenishmentSuggestions(): Suggestion[] {
  const out: Suggestion[] = [];
  stockItems().forEach((item) => {
    if (!item.reorderLevel && !item.safetyStock) return;
    const pos = engine.stockPosition(item.id);
    const target = Math.max(item.reorderLevel, item.safetyStock);
    if (pos.projected >= target) return;
    const shortfall = r3(target - pos.projected);
    const suggestedQty = Math.max(item.reorderQty || 0, shortfall, item.minOrderQty ?? 0);
    const sup = db.find<Supplier>(C.suppliers, item.preferredSupplierId);
    out.push({ item, onHand: pos.onHand, available: pos.available, reserved: pos.reserved, committed: pos.committed, inTransit: pos.inTransit, projected: pos.projected, reorderLevel: item.reorderLevel, safetyStock: item.safetyStock, shortfall, suggestedQty, supplierId: sup?.id, supplierName: sup?.name, leadTimeDays: item.leadTimeDays, needBy: addDays(today(), item.leadTimeDays), trigger: pos.onHand <= 0 ? 'Out of stock' : pos.projected < item.safetyStock ? 'Below safety stock' : 'Below reorder level' });
  });
  return out.sort((a, b) => (a.trigger === 'Out of stock' ? -1 : 1) - (b.trigger === 'Out of stock' ? -1 : 1) || b.shortfall * (b.item.purchasePrice || 1) - a.shortfall * (a.item.purchasePrice || 1));
}

/** Create requisition(s) (one) or PO drafts (grouped by supplier) from selected suggestions. */
export function createFromSuggestions(sugs: Suggestion[], mode: 'requisition' | 'po', qtys: Record<string, number>): { ids: string[]; numbers: string[] } {
  if (!sugs.length) throw new ValidationError('Select at least one suggestion', 'VALIDATION');
  const c = engine.ctx();
  const wh = c.company?.defaults.warehouseId;
  if (mode === 'requisition') {
    const base = engine.newDocHeader('Requisition', { number: engine.allocateNumber('Requisition') });
    const lines = sugs.map((s) => ({ ...engine.newLine({ itemId: s.item.id, itemCode: s.item.code, itemName: s.item.name, qty: qtys[s.item.id] ?? s.suggestedQty, uom: s.item.baseUom, rate: s.item.purchasePrice, warehouseId: wh }), purpose: s.trigger }));
    const total = r2(lines.reduce((x, l) => x + l.qty * l.rate, 0));
    const req = db.insert<any>(C.requisitions, { ...base, docType: 'Requisition', status: 'Draft', requesterId: c.userId, requesterName: c.userName, needByDate: addDays(today(), Math.max(...sugs.map((s) => s.leadTimeDays))), purpose: 'Replenishment suggestion', lines, totals: { ...engine.emptyTotals(), subtotal: total, taxable: total, total, baseTotal: total, due: total }, dimensions: {} });
    engine.audit({ action: 'replenishment.requisition', objectType: 'Requisition', objectId: req.id, objectNumber: req.number, detail: `${lines.length} item(s)` });
    return { ids: [req.id], numbers: [req.number] };
  }
  const bySup = new Map<string, Suggestion[]>();
  sugs.forEach((s) => { if (!s.supplierId) throw new ValidationError(`${s.item.name} has no preferred supplier — create a requisition instead`, 'VALIDATION'); bySup.set(s.supplierId, [...(bySup.get(s.supplierId) ?? []), s]); });
  const ids: string[] = []; const numbers: string[] = [];
  db.transaction(() => {
    bySup.forEach((rows, supId) => {
      const sup = db.find<Supplier>(C.suppliers, supId)!;
      const base = engine.newDocHeader('Purchase Order', { number: engine.allocateNumber('Purchase Order'), currency: sup.currency });
      const tc = engine.taxContextFor('Supplier', supId, 'purchase', base.branchId);
      const lines = rows.map((s) => ({ ...engine.lineFromItem(s.item.id, { qty: qtys[s.item.id] ?? s.suggestedQty, supplierId: supId, direction: 'purchase', warehouseId: wh }), expectedDate: s.needBy, accountId: s.item.inventoryAccountId ?? IDS.accInvFG }));
      const { lines: cl, totals } = engine.computeDocument(lines, tc, { roundTotal: true });
      const po = db.insert<PurchaseOrder>(C.purchaseOrders, { ...base, docType: 'Purchase Order', status: 'Draft', partyType: 'Supplier', partyId: supId, partyName: sup.name, partySnapshot: engine.partySnapshotFor('Supplier', supId), paymentTerms: sup.purchaseTerms, lines: cl as any, totals, charges: [], amendments: [], expectedDate: rows[0].needBy, notes: 'Created from replenishment suggestions', dimensions: {}, templateId: IDS.tplPO, templateVersion: 2 } as PurchaseOrder);
      ids.push(po.id); numbers.push(po.number);
      engine.audit({ action: 'replenishment.po', objectType: 'Purchase Order', objectId: po.id, objectNumber: po.number, detail: `${rows.length} item(s) · ${sup.name}` });
    });
  });
  return { ids, numbers };
}

// ── Landed cost (FR-TRD-003) ───────────────────────────────────────────────

export function newLandedCost(grnIds: string[] = []): LandedCost {
  const base = engine.newDocHeader('Landed Cost');
  const grns = grnIds.map((g) => db.find<Grn>(C.grns, g)).filter((g): g is Grn => !!g);
  return { ...base, docType: 'Landed Cost', status: 'Draft', grnIds: grns.map((g) => g.id), grnNumbers: grns.map((g) => g.number), basis: 'Value', costs: [], allocations: [], totalCost: 0, lines: [] } as LandedCost;
}

export function computeLandedCost(lc: LandedCost): LandedCost {
  const grns = lc.grnIds.map((g) => db.find<Grn>(C.grns, g)).filter((g): g is Grn => !!g);
  const totalCost = r2(lc.costs.reduce((s, c) => s + (c.amount || 0), 0));
  const bases = grns.flatMap((g) => g.lines.filter((l) => l.acceptedQty > 0 && db.find<Item>(C.items, l.itemId)?.isStock).map((l) => ({ grn: g, line: l, value: l.taxable, qty: l.acceptedQty, weight: (db.find<Item>(C.items, l.itemId)?.altUoms.find((u) => u.uom === 'Kg')?.factor ? l.acceptedQty / (db.find<Item>(C.items, l.itemId)!.altUoms.find((u) => u.uom === 'Kg')!.factor) : l.acceptedQty) })));
  const key = (b: (typeof bases)[number]) => (lc.basis === 'Value' ? b.value : lc.basis === 'Qty' ? b.qty : b.weight);
  const sum = bases.reduce((s, b) => s + key(b), 0);
  let allocatedSoFar = 0;
  const allocations: LandedCostAllocation[] = bases.map((b, i) => {
    const allocated = i === bases.length - 1 ? r2(totalCost - allocatedSoFar) : sum ? r2((totalCost * key(b)) / sum) : 0;
    allocatedSoFar = r2(allocatedSoFar + allocated);
    return { id: `la_${b.grn.id}_${b.line.id}`, grnId: b.grn.id, grnNumber: b.grn.number, lineId: b.line.id, itemId: b.line.itemId!, itemName: b.line.itemName, warehouseId: b.line.warehouseId!, qty: b.qty, baseValue: b.value, weight: r3(b.weight), allocated, newRate: b.qty ? r2((b.value + allocated) / b.qty) : 0 };
  });
  return { ...lc, allocations, totalCost, grnNumbers: grns.map((g) => g.number), totals: { ...engine.emptyTotals(), subtotal: totalCost, total: totalCost, baseTotal: totalCost } };
}

export function postLandedCost(input: LandedCost): LandedCost {
  const lc = computeLandedCost(input);
  if (!lc.grnIds.length) throw new ValidationError('Select at least one posted GRN', 'VALIDATION');
  if (!lc.costs.length || lc.totalCost <= 0) throw new ValidationError('Add at least one cost line', 'VALIDATION');
  if (lc.costs.some((c) => !c.name || c.amount <= 0)) throw new ValidationError('Every cost line needs a name and a positive amount', 'VALIDATION');
  if (!lc.allocations.length) throw new ValidationError('No stock lines to allocate to', 'VALIDATION');
  return db.transaction(() => {
    engine.assertPostable(lc.date);
    const c = engine.ctx();
    const number = engine.allocateNumber('Landed Cost', { date: lc.date, branchId: lc.branchId });
    const saved = db.find<LandedCost>(C.landedCosts, lc.id) ? db.update<LandedCost>(C.landedCosts, lc.id, { ...lc, number }) : db.insert<LandedCost>(C.landedCosts, { ...lc, number });
    const byAcc: Record<string, number> = {};
    lc.allocations.forEach((a) => {
      const item = db.find<Item>(C.items, a.itemId)!;
      db.insert<StockMovement>(C.stockMovements, { date: lc.date, itemId: item.id, itemCode: item.code, itemName: item.name, warehouseId: a.warehouseId, warehouseName: db.find<Warehouse>(C.warehouses, a.warehouseId)?.name, qty: 0, uom: item.baseUom, baseQty: 0, rate: 0, value: a.allocated, type: 'Landed Cost', sourceType: 'Landed Cost', sourceId: saved.id, sourceNumber: number, balanceAfter: engine.stockPosition(item.id, a.warehouseId).onHand });
      const acc = item.inventoryAccountId ?? IDS.accInvFG;
      byAcc[acc] = r2((byAcc[acc] ?? 0) + a.allocated);
    });
    const byCost: Record<string, number> = {};
    lc.costs.forEach((x) => { const acc = x.accountId ?? IDS.accFreight; byCost[acc] = r2((byCost[acc] ?? 0) + x.amount); });
    const j = engine.postJournal({ date: lc.date, branchId: lc.branchId, sourceType: 'Landed Cost', sourceId: saved.id, sourceNumber: number, narration: `Landed cost ${number} capitalised on ${lc.grnNumbers.join(', ')}`, idempotencyKey: `${saved.id}:post`, lines: [...Object.entries(byAcc).map(([accountId, dr]) => ({ accountId, dr })), ...Object.entries(byCost).map(([accountId, cr]) => ({ accountId, cr }))] });
    lc.grnIds.forEach((gid) => { const g = db.find<Grn>(C.grns, gid); if (g) db.update<Grn>(C.grns, gid, { landedCostIds: [...(g.landedCostIds ?? []), saved.id] }); });
    const out = db.update<LandedCost>(C.landedCosts, saved.id, { status: 'Posted', number, journalId: j.id, journalNumber: j.number, postedAt: new Date().toISOString(), postedBy: c.userName });
    engine.audit({ action: 'landed_cost.posted', objectType: 'Landed Cost', objectId: out.id, objectNumber: number, detail: `${lc.totalCost} over ${lc.allocations.length} line(s) by ${lc.basis}` });
    return out;
  });
}

export function reverseLandedCost(id: string, reason: string) {
  const lc = db.find<LandedCost>(C.landedCosts, id);
  if (!lc || lc.status !== 'Posted') throw new ValidationError('Only posted landed costs can be reversed', 'INVALID_STATE');
  db.transaction(() => {
    const date = today();
    engine.assertPostable(date);
    db.where<StockMovement>(C.stockMovements, (m) => m.sourceId === id && !m.reversalOfId).forEach((m) => db.insert<StockMovement>(C.stockMovements, { ...m, id: undefined, date, value: -m.value, reversalOfId: m.id, sourceType: 'Landed Cost Reversal', createdAt: undefined, updatedAt: undefined, version: undefined } as any));
    if (lc.journalId) engine.reverseJournal(lc.journalId, { reason, date });
    db.update<LandedCost>(C.landedCosts, id, { status: 'Reversed', reversalReason: reason });
    engine.audit({ action: 'landed_cost.reversed', objectType: 'Landed Cost', objectId: id, objectNumber: lc.number, detail: reason });
  });
}

export function batchBalances(itemId: string, warehouseId?: string) {
  const moves = db.where<StockMovement>(C.stockMovements, (m) => m.itemId === itemId && (!warehouseId || m.warehouseId === warehouseId) && !!m.batch);
  const map = new Map<string, { batch: string; warehouseId: string; warehouseName?: string; qty: number; value: number; expiryDate?: string; lastMove: string }>();
  moves.forEach((m) => { const k = `${m.batch}|${m.warehouseId}`; const row = map.get(k) ?? { batch: m.batch!, warehouseId: m.warehouseId, warehouseName: m.warehouseName, qty: 0, value: 0, expiryDate: m.expiryDate, lastMove: m.date }; row.qty = r3(row.qty + m.baseQty); row.value = r2(row.value + m.value * Math.sign(m.baseQty || 1)); if (m.expiryDate) row.expiryDate = m.expiryDate; if (m.date > row.lastMove) row.lastMove = m.date; map.set(k, row); });
  return Array.from(map.values());
}

export function serialLocations(itemId: string) {
  const moves = db.where<StockMovement>(C.stockMovements, (m) => m.itemId === itemId && !!m.serials?.length).sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
  const loc = new Map<string, { serial: string; warehouseId?: string; warehouseName?: string; status: 'In stock' | 'Issued'; since: string; sourceNumber: string }>();
  moves.forEach((m) => m.serials!.forEach((sn) => loc.set(sn, { serial: sn, warehouseId: m.baseQty > 0 ? m.warehouseId : undefined, warehouseName: m.baseQty > 0 ? m.warehouseName : undefined, status: m.baseQty > 0 ? 'In stock' : 'Issued', since: m.date, sourceNumber: m.sourceNumber })));
  return Array.from(loc.values());
}

export function reservationActions(id: string, action: 'Release' | 'Expire' | 'Cancel', reason: string) {
  const r = db.find<Reservation>(C.reservations, id);
  if (!r) throw new ValidationError('Reservation not found', 'NOT_FOUND');
  if (r.status !== 'Reserved' && r.status !== 'Partially Fulfilled') throw new ValidationError(`Reservation is ${r.status}`, 'INVALID_STATE');
  db.update<Reservation>(C.reservations, id, { status: action === 'Release' ? 'Released' : action === 'Expire' ? 'Expired' : 'Cancelled' });
  engine.audit({ action: `stock.reservation_${action.toLowerCase()}d`, objectType: 'Reservation', objectId: id, objectNumber: r.sourceNumber, detail: reason });
}
