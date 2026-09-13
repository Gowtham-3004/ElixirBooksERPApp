// Core helpers for the production module: settings, lookups, batch/serial
// availability, BOM cost roll-up, scheduling and WIP ledger writes.
import { db, C, engine, IDS } from '../../store';
import type { Company, Item, StockMovement, Warehouse, Supplier } from '../../store';
import { addDays, round, today, uid } from '../../lib/format';
import type { Bom, MfgSettings, OrderOperation, ProductionCosts, ProductionOrder, Routing, RoutingOperation, WipEntry, WipEntryType, WorkCentre } from './types';

export const ACC_LABOUR_ABSORBED = 'acc_5730';
export const ACC_OVERHEAD_ABSORBED = 'acc_5740';
export const WH_SUBCONTRACT = 'wh_subcon';

export const ORDER_STATUSES: ProductionOrder['status'][] = ['Draft', 'Planned', 'Submitted', 'Approved', 'Released', 'In Progress', 'Partially Completed', 'Completed', 'Closed', 'Cancelled'];
export const OPEN_ORDER_STATUSES: ProductionOrder['status'][] = ['Planned', 'Submitted', 'Approved', 'Released', 'In Progress', 'Partially Completed'];
export const ACTIVE_ORDER_STATUSES: ProductionOrder['status'][] = ['Released', 'In Progress', 'Partially Completed'];

export function mfgSettings(companyId?: string): MfgSettings {
  const co = engine.companyOf(companyId);
  const d = (co?.defaults as any)?.production as Partial<MfgSettings> | undefined;
  return {
    mode: 'discrete',
    planning: 'MTS',
    overIssueTolerancePct: 5,
    backflushDefault: false,
    qcRequiredForFG: true,
    costingMethod: 'Actual',
    autoReleaseThreshold: 0,
    wipWarehouseId: 'wh_wip',
    scrapWarehouseId: 'wh_scrap',
    subcontractWarehouseId: WH_SUBCONTRACT,
    fgWarehouseId: IDS.whAndheri,
    rmWarehouseId: IDS.whMain,
    labourAbsorbedAccountId: ACC_LABOUR_ABSORBED,
    overheadAbsorbedAccountId: ACC_OVERHEAD_ABSORBED,
    ...(d ?? {}),
  };
}

export function saveMfgSettings(patch: Partial<MfgSettings>) {
  const c = engine.ctx();
  const co = c.company;
  if (!co) return;
  const current = mfgSettings();
  db.update<Company>(C.companies, co.id, { defaults: { ...co.defaults, production: { ...current, ...patch } } as any });
  engine.audit({ action: 'production.settings.updated', objectType: 'Company', objectId: co.id, detail: Object.keys(patch).join(', ') });
}

export function item(id?: string): Item | undefined {
  return db.find<Item>(C.items, id);
}
export function wh(id?: string): Warehouse | undefined {
  return db.find<Warehouse>(C.warehouses, id);
}
export function whName(id?: string): string {
  return wh(id)?.name ?? '—';
}
export function supplierName(id?: string): string {
  return db.find<Supplier>(C.suppliers, id)?.name ?? '—';
}
export function workCentre(id?: string): WorkCentre | undefined {
  return db.find<WorkCentre>(C.workCentres, id);
}

/** Inventory account for an item (falls back to the RM / FG control accounts). */
export function inventoryAccountOf(it: Item | undefined): string {
  if (it?.inventoryAccountId) return it.inventoryAccountId;
  return it?.type === 'Raw Material' ? IDS.accInvRM : IDS.accInvFG;
}

/** Active BOM for an item as of a date (latest effective version). */
export function activeBomFor(itemId: string, asOf = today()): Bom | undefined {
  const cid = engine.ctx().companyId;
  return db
    .where<Bom>(C.boms, (b) => b.companyId === cid && b.itemId === itemId && b.status === 'Active' && b.effectiveFrom <= asOf && (!b.effectiveTo || b.effectiveTo >= asOf))
    .sort((a, b) => b.version - a.version)[0];
}

export function bomsFor(itemId: string): Bom[] {
  const cid = engine.ctx().companyId;
  return db.where<Bom>(C.boms, (b) => b.companyId === cid && b.itemId === itemId).sort((a, b) => b.version - a.version);
}

export function itemsWithActiveBom(): Item[] {
  const cid = engine.ctx().companyId;
  const ids = new Set(db.where<Bom>(C.boms, (b) => b.companyId === cid && b.status === 'Active').map((b) => b.itemId));
  return db.where<Item>(C.items, (i) => ids.has(i.id) && i.status === 'Active');
}

/** Unit cost used for standard costing of a component: item standard cost, else purchase price. */
export function componentUnitCost(it: Item | undefined): number {
  if (!it) return 0;
  return it.standardCost ?? it.purchasePrice ?? 0;
}

export interface CostRollup {
  material: number;
  labour: number;
  machine: number;
  overhead: number;
  subcontract: number;
  byProductCredit: number;
  total: number;
  perUnit: number;
  lines: { itemId: string; itemName: string; qty: number; unitCost: number; scrapPct: number; extended: number; source: string }[];
  ops: { name: string; minutes: number; labour: number; machine: number; overhead: number; subcontract: number }[];
}

/** Standard cost roll-up for a BOM (per BOM output qty; perUnit = ÷ outputQty). */
export function rollupBom(bom: Bom, routing?: Routing): CostRollup {
  const lines = bom.components.filter((c) => !c.isPhantom).map((c) => {
    const it = item(c.itemId);
    const unitCost = componentUnitCost(it);
    const qty = round(c.qty * (1 + c.scrapPct / 100), 4);
    return { itemId: c.itemId, itemName: c.itemName, qty, unitCost, scrapPct: c.scrapPct, extended: round(qty * unitCost), source: it?.standardCost !== undefined ? 'Standard cost' : 'Purchase price' };
  });
  const material = round(lines.reduce((s, l) => s + l.extended, 0));
  const r = routing ?? db.find<Routing>(C.routings, bom.routingId);
  // setup time is amortised over a standard lot (reorder qty, else 50) and scaled to the BOM output qty
  const lot = Math.max(bom.outputQty, item(bom.itemId)?.reorderQty || 50);
  const f = bom.outputQty / lot;
  const ops = (r?.operations ?? []).map((op) => { const c = opStdCost(op, lot); return { name: c.name, minutes: round(c.minutes * f, 2), labour: round(c.labour * f), machine: round(c.machine * f), overhead: round(c.overhead * f), subcontract: round(c.subcontract * f) }; });
  const labour = round(ops.reduce((s, o) => s + o.labour, 0));
  const machine = round(ops.reduce((s, o) => s + o.machine, 0));
  const overhead = round(ops.reduce((s, o) => s + o.overhead, 0));
  const subcontract = round(ops.reduce((s, o) => s + o.subcontract, 0));
  const byProductCredit = round(bom.byProducts.reduce((s, b) => s + byProductValue(b.itemId, b.qty, b.costSharePct, material), 0));
  const total = round(material + labour + machine + overhead + subcontract - byProductCredit);
  return { material, labour, machine, overhead, subcontract, byProductCredit, total, perUnit: bom.outputQty > 0 ? round(total / bom.outputQty) : total, lines, ops };
}

/** By-product credit: cost-share % of the material cost when set, else qty × the by-product item's own unit cost. */
export function byProductValue(itemId: string, qty: number, costSharePct: number, materialBase: number): number {
  if (costSharePct > 0) return round((materialBase * costSharePct) / 100);
  return round(qty * componentUnitCost(item(itemId)));
}

export function opStdCost(op: RoutingOperation | OrderOperation, qty: number) {
  const wc = workCentre(op.workCentreId);
  const minutes = op.setupMin + op.runMinPerUnit * qty;
  const hrs = minutes / 60;
  if (op.subcontract) return { name: op.name, minutes, labour: 0, machine: 0, overhead: 0, subcontract: round((op.subcontractRate ?? 0) * qty) };
  const labourRate = op.labourRate ?? wc?.costRateLabour ?? 0;
  const machineRate = op.machineRate ?? wc?.costRateMachine ?? 0;
  const overheadRate = (op as OrderOperation).overheadRate ?? wc?.overheadRate ?? 0;
  return { name: op.name, minutes, labour: round(hrs * labourRate), machine: round(hrs * machineRate), overhead: round(hrs * overheadRate), subcontract: 0 };
}

/** Working-day aware schedule: returns planned end from routing time ÷ work-centre capacity. */
export function scheduleEnd(start: string, routing: Routing | undefined, qty: number): { end: string; hours: number; days: number } {
  if (!routing || !routing.operations.length) return { end: addDays(start, 1), hours: 0, days: 1 };
  let days = 0;
  let hours = 0;
  let parallelMax = 0;
  routing.operations.slice().sort((a, b) => a.seq - b.seq).forEach((op) => {
    const wc = workCentre(op.workCentreId);
    const eff = (wc?.efficiencyPct ?? 100) / 100 || 1;
    const opHrs = op.subcontract ? 0 : (op.setupMin + op.runMinPerUnit * qty) / 60 / eff;
    hours += opHrs;
    const cap = wc?.capacityHrsPerDay ?? 8;
    const opDays = op.subcontract ? 3 : opHrs / cap;
    if (op.parallel) parallelMax = Math.max(parallelMax, opDays);
    else { days += parallelMax; parallelMax = 0; days += opDays; }
  });
  days += parallelMax;
  const nDays = Math.max(1, Math.ceil(days));
  // skip weekends
  let end = start;
  let added = 0;
  while (added < nDays) {
    end = addDays(end, 1);
    const dow = new Date(end + 'T00:00:00').getDay();
    if (dow !== 0) added += 1;
  }
  return { end, hours: round(hours, 1), days: nDays };
}

/** Batches on hand for an item in a warehouse (from the stock ledger). */
export function batchesOnHand(itemId: string, warehouseId: string): { batch: string; qty: number; rate: number; expiryDate?: string }[] {
  const map = new Map<string, { batch: string; qty: number; value: number; inQty: number; expiryDate?: string }>();
  db.where<StockMovement>(C.stockMovements, (m) => m.itemId === itemId && m.warehouseId === warehouseId).forEach((m) => {
    const key = m.batch ?? '';
    const e = map.get(key) ?? { batch: key, qty: 0, value: 0, inQty: 0, expiryDate: m.expiryDate };
    e.qty = round(e.qty + m.baseQty, 3);
    if (m.baseQty > 0) { e.inQty += m.baseQty; e.value += m.value; }
    if (m.expiryDate) e.expiryDate = m.expiryDate;
    map.set(key, e);
  });
  return Array.from(map.values()).filter((b) => b.qty > 0.0005).map((b) => ({ batch: b.batch, qty: b.qty, rate: b.inQty > 0 ? round(b.value / b.inQty) : 0, expiryDate: b.expiryDate })).sort((a, b) => (a.expiryDate ?? '9').localeCompare(b.expiryDate ?? '9') || a.batch.localeCompare(b.batch));
}

/** Serial numbers currently on hand for an item in a warehouse. */
export function serialsOnHand(itemId: string, warehouseId: string): string[] {
  const set = new Set<string>();
  db.where<StockMovement>(C.stockMovements, (m) => m.itemId === itemId && m.warehouseId === warehouseId).sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt)).forEach((m) => {
    (m.serials ?? []).forEach((s) => { if (m.baseQty > 0) set.add(s); else set.delete(s); });
  });
  return Array.from(set);
}

/** Batches of an item sitting in the WIP warehouse that were issued for a given order (FIFO order). */
export function wipBatchesForOrder(order: ProductionOrder, itemId: string): { batch?: string; qty: number; rate: number; serials: string[] }[] {
  const moves = db.where<StockMovement>(C.stockMovements, (m) => m.itemId === itemId && m.warehouseId === order.wipWarehouseId && ((m.sourceType === 'Material Issue' && issueBelongsTo(m.sourceId, order.id)) || (m.sourceType === 'Production Receipt' && receiptBelongsTo(m.sourceId, order.id)) || (m.sourceType === 'Subcontract Order' && subBelongsTo(m.sourceId, order.id)))).sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
  const map = new Map<string, { batch?: string; qty: number; rate: number; serials: Set<string>; inQty: number; inValue: number }>();
  moves.forEach((m) => {
    const key = m.batch ?? '';
    const e = map.get(key) ?? { batch: m.batch, qty: 0, rate: 0, serials: new Set<string>(), inQty: 0, inValue: 0 };
    e.qty = round(e.qty + m.baseQty, 3);
    if (m.baseQty > 0) { e.inQty += m.baseQty; e.inValue += m.value; (m.serials ?? []).forEach((s) => e.serials.add(s)); } else (m.serials ?? []).forEach((s) => e.serials.delete(s));
    map.set(key, e);
  });
  return Array.from(map.values()).filter((b) => b.qty > 0.0005).map((b) => ({ batch: b.batch, qty: b.qty, rate: b.inQty ? round(b.inValue / b.inQty) : 0, serials: Array.from(b.serials) }));
}

function issueBelongsTo(issueId: string, orderId: string) { return db.find<any>(C.materialIssues, issueId)?.orderId === orderId; }
function receiptBelongsTo(receiptId: string, orderId: string) { return db.find<any>(C.productionReceipts, receiptId)?.orderId === orderId; }
function subBelongsTo(subId: string, orderId: string) { return db.find<any>(C.subcontractOrders, subId)?.orderId === orderId; }

/** Later outbound movements for a batch/serial after a given receipt (sold / consumed / transferred). */
export function downstreamMovements(itemId: string, opts: { batch?: string; serials?: string[]; excludeSourceId: string; after: string }): StockMovement[] {
  return db.where<StockMovement>(C.stockMovements, (m) => m.itemId === itemId && m.sourceId !== opts.excludeSourceId && m.baseQty < 0 && !m.reversalOfId && (m.date > opts.after || (m.date === opts.after && true)) && ((opts.batch && m.batch === opts.batch) || (!!opts.serials?.length && !!m.serials?.some((s) => opts.serials!.includes(s)))));
}

// ── WIP ledger ─────────────────────────────────────────────────────────────

export function wipEntry(order: ProductionOrder, e: { date: string; type: WipEntryType; amount: number; journalId?: string; journalNumber?: string; sourceType: string; sourceId: string; sourceNumber: string; description?: string }): WipEntry {
  return db.insert<WipEntry>(C.wipEntries, { orderId: order.id, orderNumber: order.number, ...e, amount: round(e.amount) });
}

export function wipBalanceOf(orderId: string): number {
  return round(db.where<WipEntry>(C.wipEntries, (w) => w.orderId === orderId).reduce((s, w) => s + w.amount, 0));
}

// ── Cost recomputation ─────────────────────────────────────────────────────

export function emptyCosts(): ProductionCosts {
  return { materialStd: 0, materialActual: 0, labourStd: 0, labourActual: 0, machineStd: 0, machineActual: 0, overheadStd: 0, overheadActual: 0, subcontractStd: 0, subcontractActual: 0, scrap: 0, byProductCredit: 0, outputValue: 0, totalStd: 0, totalActual: 0, variance: 0, variancePct: 0, wipBalance: 0, closeVariance: 0 };
}

/** Recompute the order's cost block from its components, operations, issues, receipts and WIP ledger. */
export function computeOrderCosts(order: ProductionOrder): ProductionCosts {
  const materialStd = round(order.components.filter((c) => !c.isPhantom).reduce((s, c) => s + c.plannedQty * componentUnitCost(item(c.itemId)), 0));
  const issues = db.where<any>(C.materialIssues, (i) => i.orderId === order.id && i.status === 'Posted');
  const materialActual = round(issues.reduce((s, i) => s + (i.type === 'Return' ? -i.totalValue : i.totalValue), 0) + db.where<WipEntry>(C.wipEntries, (w) => w.orderId === order.id && w.type === 'Material In' && w.sourceType === 'Subcontract Order').reduce((s, w) => s + w.amount, 0));
  const std = order.operations.filter((o) => !o.isRework).map((o) => opStdCost(o, order.qty));
  const labourStd = round(std.reduce((s, o) => s + o.labour, 0));
  const machineStd = round(std.reduce((s, o) => s + o.machine, 0));
  const overheadStd = round(std.reduce((s, o) => s + o.overhead, 0));
  const subcontractStd = round(std.reduce((s, o) => s + o.subcontract, 0));
  const labourActual = round(order.operations.reduce((s, o) => s + (o.labourCost ?? 0), 0));
  const machineActual = round(order.operations.reduce((s, o) => s + (o.machineCost ?? 0), 0));
  const overheadActual = round(order.operations.reduce((s, o) => s + (o.overheadCost ?? 0), 0));
  const subcontractActual = round(order.operations.reduce((s, o) => s + (o.subcontractCost ?? 0), 0));
  const receipts = db.where<any>(C.productionReceipts, (r) => r.orderId === order.id && (r.status === 'Posted' || r.status === 'Rejected'));
  const scrap = round(receipts.reduce((s, r) => s + (r.scrapValue ?? 0), 0));
  const byProductCredit = round(receipts.reduce((s, r) => s + (r.byProducts ?? []).reduce((x: number, b: any) => x + (b.value ?? 0), 0), 0));
  const outputValue = round(receipts.filter((r) => r.status === 'Posted').reduce((s, r) => s + (r.value ?? 0), 0));
  const totalStd = round(materialStd + labourStd + machineStd + overheadStd + subcontractStd);
  const totalActual = round(materialActual + labourActual + machineActual + overheadActual + subcontractActual + scrap - byProductCredit);
  const variance = round(totalActual - totalStd);
  const wipBalance = wipBalanceOf(order.id);
  return { materialStd, materialActual, labourStd, labourActual, machineStd, machineActual, overheadStd, overheadActual, subcontractStd, subcontractActual, scrap, byProductCredit, outputValue, totalStd, totalActual, variance, variancePct: totalStd ? round((variance / totalStd) * 100, 1) : 0, wipBalance, closeVariance: order.costs?.closeVariance ?? 0 };
}

export function refreshCosts(orderId: string): ProductionOrder {
  const o = db.find<ProductionOrder>(C.productionOrders, orderId);
  if (!o) throw new Error('Order not found');
  return db.update<ProductionOrder>(C.productionOrders, o.id, { costs: computeOrderCosts(o) });
}

/** Unit cost for a receipt: standard, or actual costs to date ÷ (output to date + this qty + scrap). */
export function receiptUnitCost(order: ProductionOrder, goodQty: number, scrapQty: number): { unitCost: number; basis: 'Standard' | 'Actual'; explanation: string } {
  if (order.costingMethod === 'Standard') return { unitCost: order.stdUnitCost, basis: 'Standard', explanation: `Standard cost ${order.stdUnitCost} per ${order.uom} (variance posts at close)` };
  const c = computeOrderCosts(order);
  const incurred = round(c.materialActual + c.labourActual + c.machineActual + c.overheadActual + c.subcontractActual - c.byProductCredit);
  const denom = order.receivedQty + order.scrapQty + goodQty + scrapQty;
  const unitCost = denom > 0 ? round(incurred / denom) : order.stdUnitCost;
  return { unitCost, basis: 'Actual', explanation: `Actual: costs to date ${incurred.toLocaleString('en-IN')} ÷ ${denom} units (received ${order.receivedQty} + scrap ${order.scrapQty} + this ${goodQty + scrapQty})` };
}

export function nextLotNumber(order: ProductionOrder): string {
  const n = db.count(C.productionReceipts, (r) => r.orderId === order.id) + 1;
  return `LOT-${order.number.replace(/\//g, '-').replace(/^PRD-26-27-/, 'PRD-')}-${n}`;
}

export function nextSerials(order: ProductionOrder, qty: number): string[] {
  const prefix = order.serialPrefix ?? 'SER';
  const existing = db.where<StockMovement>(C.stockMovements, (m) => m.itemId === order.itemId && !!m.serials?.length).flatMap((m) => m.serials ?? []).filter((s) => s.startsWith(prefix + '-'));
  const max = existing.reduce((m, s) => Math.max(m, parseInt(s.slice(prefix.length + 1), 10) || 0), 0);
  return Array.from({ length: qty }, (_, i) => `${prefix}-${String(max + i + 1).padStart(4, '0')}`);
}

export function newId(prefix: string) { return uid(prefix); }

/** Late = planned end passed and not yet completed. */
export function isLate(o: ProductionOrder): boolean {
  return ACTIVE_ORDER_STATUSES.includes(o.status) && o.plannedEnd < today();
}

export function statusTone(status: string): 'good' | 'warning' | 'critical' | 'neutral' {
  if (status === 'Completed' || status === 'Closed') return 'good';
  if (status === 'Cancelled') return 'neutral';
  if (status === 'In Progress' || status === 'Partially Completed') return 'warning';
  return 'neutral';
}
