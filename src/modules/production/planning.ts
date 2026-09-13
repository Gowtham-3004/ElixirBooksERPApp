// MRP net-requirements engine + capacity load (FR-MFG-005/006, FR-MFG-004).
import { db, C, engine, IDS } from '../../store';
import type { DocHeader, Item, Warehouse } from '../../store';
import { addDays, round, today, uid } from '../../lib/format';
import type { Bom, DemandRef, MrpItemDetail, MrpParams, MrpRun, MrpSuggestion, ProductionOrder, WorkCentre } from './types';
import { activeBomFor, item, mfgSettings, OPEN_ORDER_STATUSES, rollupBom, supplierName } from './core';
import { createOrder } from './actions';

const OPEN_SO = new Set(['Confirmed', 'Approved', 'Partially Delivered', 'Submitted']);
const OPEN_PO = new Set(['Approved', 'Partially Received', 'Submitted']);

interface Demand { itemId: string; qty: number; date: string; ref: DemandRef }

function planningWarehouses(p: MrpParams): Warehouse[] {
  const cid = engine.ctx().companyId;
  const all = db.where<Warehouse>(C.warehouses, (w) => w.companyId === cid && w.status === 'Active' && w.type === 'Standard');
  return p.warehouseId ? all.filter((w) => w.id === p.warehouseId) : all;
}

function onHandIn(itemId: string, whs: Warehouse[]) {
  let onHand = 0, reserved = 0;
  whs.forEach((w) => { const p = engine.stockPosition(itemId, w.id); onHand += p.onHand; reserved += p.reserved; });
  return { onHand: round(onHand, 3), reserved: round(reserved, 3) };
}

/** Independent demand: open sales-order lines not yet delivered (read defensively — sales module owns the shape). */
function salesDemand(p: MrpParams, horizonEnd: string): Demand[] {
  const cid = engine.ctx().companyId;
  const out: Demand[] = [];
  (db.get<any>(C.salesOrders) ?? []).forEach((so: any) => {
    if (!so || so.companyId !== cid) return;
    if (!OPEN_SO.has(so.status) && !(p.includeDrafts && so.status === 'Draft')) return;
    const date: string = so.expectedDate ?? so.dueDate ?? so.date ?? today();
    if (date > horizonEnd) return;
    (so.lines ?? []).forEach((l: any) => {
      if (!l?.itemId) return;
      const remaining = round((l.qty ?? 0) - (l.deliveredQty ?? 0), 3);
      if (remaining <= 0) return;
      out.push({ itemId: l.itemId, qty: remaining, date, ref: { type: 'Sales Order', id: so.id, number: so.number, qty: remaining, date } });
    });
  });
  return out;
}

/** Dependent demand from open production orders' unissued components. */
function productionDemand(horizonEnd: string): Demand[] {
  const cid = engine.ctx().companyId;
  const out: Demand[] = [];
  db.where<ProductionOrder>(C.productionOrders, (o) => o.companyId === cid && OPEN_ORDER_STATUSES.includes(o.status) && o.plannedStart <= horizonEnd).forEach((o) => {
    o.components.filter((c) => !c.isPhantom).forEach((c) => {
      const remaining = round(c.plannedQty - c.issuedQty + c.returnedQty, 3);
      if (remaining > 0) out.push({ itemId: c.itemId, qty: remaining, date: o.plannedStart, ref: { type: 'Production Order', id: o.id, number: o.number, qty: remaining, date: o.plannedStart } });
    });
  });
  return out;
}

function openPoQty(itemId: string, horizonEnd: string): number {
  return round((db.get<any>(C.purchaseOrders) ?? []).filter((po: any) => po && OPEN_PO.has(po.status) && (po.expectedDate ?? po.date ?? '') <= horizonEnd).reduce((s: number, po: any) => s + (po.lines ?? []).filter((l: any) => l?.itemId === itemId).reduce((x: number, l: any) => x + Math.max(0, (l.qty ?? 0) - (l.receivedQty ?? 0) - (l.cancelledQty ?? 0)), 0), 0), 3);
}

function plannedReceiptQty(itemId: string, horizonEnd: string): number {
  const cid = engine.ctx().companyId;
  return round(db.where<ProductionOrder>(C.productionOrders, (o) => o.companyId === cid && OPEN_ORDER_STATUSES.includes(o.status) && o.itemId === itemId && o.plannedEnd <= horizonEnd).reduce((s, o) => s + Math.max(0, o.qty - o.receivedQty - o.scrapQty), 0), 3);
}

function lotSize(it: Item, shortfall: number, p: MrpParams): number {
  if (p.lotSizing === 'Fixed qty' && it.reorderQty > 0) return round(Math.ceil(shortfall / it.reorderQty) * it.reorderQty, 3);
  if (p.lotSizing === 'Min order') return round(Math.max(shortfall, it.minOrderQty ?? it.reorderQty ?? 0), 3);
  return round(shortfall, 3);
}

/** Depth-first BOM level: FG = 0, its components = 1 … so items are planned top-down. */
function bomLevel(itemId: string, seen = new Set<string>()): number {
  if (seen.has(itemId)) return 0;
  seen.add(itemId);
  const bom = activeBomFor(itemId);
  if (!bom) return 0;
  return 1 + Math.max(0, ...bom.components.map((c) => bomLevel(c.itemId, seen)));
}

export interface MrpResult { details: MrpItemDetail[]; suggestions: MrpSuggestion[] }

export function runMrp(p: MrpParams): MrpResult {
  const cid = engine.ctx().companyId;
  const horizonEnd = addDays(today(), p.horizonDays);
  const whs = planningWarehouses(p);
  const allWhs = db.where<Warehouse>(C.warehouses, (w) => w.companyId === cid && w.status === 'Active' && w.type === 'Standard');
  const items = db.where<Item>(C.items, (i) => i.companyId === cid && i.isStock && i.status === 'Active');
  const demands: Demand[] = [...salesDemand(p, horizonEnd), ...productionDemand(horizonEnd)];
  // plan top-down by BOM level so production suggestions cascade into component demand
  const ordered = items.map((it) => ({ it, level: bomLevel(it.id) })).sort((a, b) => b.level - a.level);
  const details: MrpItemDetail[] = [];
  const suggestions: MrpSuggestion[] = [];
  const extraDemand: Demand[] = [];
  ordered.forEach(({ it }) => {
    const mine = [...demands, ...extraDemand].filter((d) => d.itemId === it.id);
    const independent = round(mine.filter((d) => d.ref.type === 'Sales Order').reduce((s, d) => s + d.qty, 0), 3);
    const dependent = round(mine.filter((d) => d.ref.type !== 'Sales Order').reduce((s, d) => s + d.qty, 0), 3);
    const { onHand, reserved } = onHandIn(it.id, whs);
    const openPo = openPoQty(it.id, horizonEnd);
    const planned = plannedReceiptQty(it.id, horizonEnd);
    const safety = p.includeSafetyStock ? it.safetyStock : 0;
    const bom = activeBomFor(it.id);
    // reservations already back sales-order demand: available = on hand − reserved, demand counts the full open line
    const supply = round(onHand - reserved + openPo + planned, 3);
    const net = round(independent + dependent + safety - supply, 3);
    const shortfall = Math.max(0, net);
    const hasDemandOrShortfall = mine.length > 0 || shortfall > 0;
    if (!hasDemandOrShortfall && !bom) return;
    details.push({ itemId: it.id, itemCode: it.code, itemName: it.name, uom: it.baseUom, onHand, reserved, openPo, plannedReceipts: planned, safetyStock: safety, independentDemand: independent, dependentDemand: dependent, netRequirement: net, shortfall, hasBom: !!bom });
    if (shortfall <= 0) return;
    const qty = lotSize(it, shortfall, p);
    const needBy = mine.length ? mine.map((d) => d.date).sort()[0] : addDays(today(), it.leadTimeDays);
    const refs = mine.map((d) => d.ref);
    const reasonBits = [independent ? `sales demand ${independent}` : '', dependent ? `production demand ${dependent}` : '', safety ? `safety stock ${safety}` : '', `on hand ${onHand}`, reserved ? `reserved ${reserved}` : '', openPo ? `open PO ${openPo}` : '', planned ? `planned receipts ${planned}` : ''].filter(Boolean).join(' · ');
    if (bom) {
      const perUnit = rollupBom(bom).perUnit;
      const orderBy = addDays(needBy, -Math.max(1, it.leadTimeDays));
      suggestions.push({ id: uid('sug'), type: 'Production', itemId: it.id, itemCode: it.code, itemName: it.name, qty, uom: it.baseUom, needBy, orderBy, reason: `Shortfall ${shortfall} ${it.baseUom} (${reasonBits}) · BOM ${bom.code} v${bom.version} · lead ${it.leadTimeDays} d`, demandRefs: refs, bomId: bom.id, estValue: round(qty * perUnit), status: 'Suggested' });
      // cascade component demand for the suggested production
      const factor = qty / (bom.outputQty || 1);
      bom.components.filter((c) => !c.isPhantom).forEach((c) => extraDemand.push({ itemId: c.itemId, qty: round(c.qty * factor * (1 + c.scrapPct / 100), 3), date: orderBy, ref: { type: 'MRP Production', id: it.id, number: `Planned ${it.code} × ${qty}`, qty: round(c.qty * factor * (1 + c.scrapPct / 100), 3), date: orderBy } }));
      return;
    }
    // transfer when another warehouse holds enough available stock (only meaningful for a single planning warehouse)
    if (p.warehouseId) {
      const other = allWhs.filter((w) => w.id !== p.warehouseId).map((w) => ({ w, pos: engine.stockPosition(it.id, w.id) })).filter((x) => x.pos.available >= shortfall).sort((a, b) => b.pos.available - a.pos.available)[0];
      if (other) {
        suggestions.push({ id: uid('sug'), type: 'Transfer', itemId: it.id, itemCode: it.code, itemName: it.name, qty: round(shortfall, 3), uom: it.baseUom, needBy, orderBy: addDays(needBy, -2), reason: `Shortfall ${shortfall} ${it.baseUom} (${reasonBits}) · ${other.w.name} has ${other.pos.available} available`, demandRefs: refs, fromWarehouseId: other.w.id, toWarehouseId: p.warehouseId, estValue: round(shortfall * (it.standardCost ?? it.purchasePrice)), status: 'Suggested' });
        return;
      }
    }
    const supplierId = it.preferredSupplierId;
    suggestions.push({ id: uid('sug'), type: 'Purchase', itemId: it.id, itemCode: it.code, itemName: it.name, qty, uom: it.baseUom, needBy, orderBy: addDays(needBy, -it.leadTimeDays), reason: `Shortfall ${shortfall} ${it.baseUom} (${reasonBits}) · lead time ${it.leadTimeDays} d${p.lotSizing !== 'Lot-for-lot' ? ` · ${p.lotSizing}` : ''}`, demandRefs: refs, supplierId, supplierName: supplierId ? supplierName(supplierId) : undefined, estValue: round(qty * it.purchasePrice), status: 'Suggested' });
  });
  return { details, suggestions: suggestions.sort((a, b) => a.needBy.localeCompare(b.needBy)) };
}

export function saveRun(p: MrpParams, r: MrpResult): MrpRun {
  const c = engine.ctx();
  const date = today();
  const number = engine.allocateNumber('MRP Run', { date, branchId: c.branchId });
  const run = db.insert<MrpRun>(C.mrpRuns, { number, date, branchId: c.branchId, params: p, suggestions: r.suggestions, details: r.details, status: 'Completed', runBy: c.userName, summary: { itemsPlanned: r.details.length, shortfalls: r.details.filter((d) => d.shortfall > 0).length, purchase: r.suggestions.filter((s) => s.type === 'Purchase').length, production: r.suggestions.filter((s) => s.type === 'Production').length, transfer: r.suggestions.filter((s) => s.type === 'Transfer').length, value: round(r.suggestions.reduce((s, x) => s + x.estValue, 0)) } });
  engine.audit({ action: 'mrp.run', objectType: 'MRP Run', objectId: run.id, objectNumber: number, detail: `${r.details.length} items · ${r.suggestions.length} suggestions · horizon ${p.horizonDays} d` });
  return run;
}

export function setSuggestionStatus(runId: string, ids: string[], status: 'Accepted' | 'Rejected' | 'Suggested') {
  const run = db.find<MrpRun>(C.mrpRuns, runId);
  if (!run) return;
  db.update<MrpRun>(C.mrpRuns, runId, { suggestions: run.suggestions.map((s) => (ids.includes(s.id) && s.status !== 'Converted' ? { ...s, status } : s)) });
}

/** Convert accepted suggestions: Purchase → Draft POs grouped by supplier; Production → Planned orders (auto-release under policy). */
export function convertAccepted(runId: string): { pos: DocHeader[]; orders: ProductionOrder[]; skipped: string[] } {
  const run = db.find<MrpRun>(C.mrpRuns, runId);
  if (!run) throw new Error('Run not found');
  const s = mfgSettings();
  const c = engine.ctx();
  const accepted = run.suggestions.filter((x) => x.status === 'Accepted');
  const pos: DocHeader[] = [];
  const orders: ProductionOrder[] = [];
  const skipped: string[] = [];
  const converted = new Map<string, { id: string; number: string; type: string }>();
  db.transaction(() => {
    const bySupplier = new Map<string, MrpSuggestion[]>();
    accepted.filter((x) => x.type === 'Purchase').forEach((x) => { const k = x.supplierId ?? 'none'; bySupplier.set(k, [...(bySupplier.get(k) ?? []), x]); });
    bySupplier.forEach((sugs, supplierId) => {
      const sid = supplierId === 'none' ? IDS.sNational : supplierId;
      const sup = db.find<any>(C.suppliers, sid);
      const tc = engine.taxContextFor('Supplier', sid, 'purchase');
      const raw = sugs.map((x) => { const l = engine.lineFromItem(x.itemId, { qty: x.qty, supplierId: sid, direction: 'purchase', warehouseId: run.params.warehouseId ?? c.company?.defaults.warehouseId }); l.description = `MRP ${run.number}: ${x.reason.split(' · ')[0]}`; (l as any).expectedDate = x.needBy; return l; });
      const { lines, totals } = engine.computeDocument(raw, tc);
      const po = engine.newDocHeader('Purchase Order', { partyType: 'Supplier', partyId: sid, partyName: sup?.name, partySnapshot: engine.partySnapshotFor('Supplier', sid), lines, totals, reference: run.number, sourceType: 'MRP Run', sourceId: run.id, sourceNumber: run.number, paymentTerms: sup?.purchaseTerms, notes: `Generated from ${run.number} — review and submit for approval` });
      const saved = db.insert<DocHeader>(C.purchaseOrders, { ...po, expectedDate: sugs.map((x) => x.needBy).sort()[0], amendments: [] } as any);
      pos.push(saved);
      sugs.forEach((x) => converted.set(x.id, { id: saved.id, number: saved.number, type: 'Purchase Order' }));
      engine.audit({ action: 'mrp.converted', objectType: 'MRP Run', objectId: run.id, objectNumber: run.number, detail: `Draft PO ${saved.number} for ${sup?.name} · ${sugs.length} line(s)` });
    });
    accepted.filter((x) => x.type === 'Production').forEach((x) => {
      const bom = x.bomId ? db.find<Bom>(C.boms, x.bomId) : activeBomFor(x.itemId);
      if (!bom) { skipped.push(`${x.itemName}: no active BOM`); return; }
      const autoRelease = s.autoReleaseThreshold > 0 && x.estValue <= s.autoReleaseThreshold;
      const o = createOrder({ itemId: x.itemId, bomId: bom.id, qty: x.qty, plannedStart: x.orderBy < today() ? today() : x.orderBy, mrpRunId: run.id, status: 'Planned', sourceDemand: x.demandRefs[0] ? { type: x.demandRefs[0].type, id: x.demandRefs[0].id, number: x.demandRefs[0].number } : undefined, notes: `From ${run.number}: ${x.reason}` });
      let final = o;
      if (autoRelease) {
        final = db.update<ProductionOrder>(C.productionOrders, o.id, { status: 'Released', releasedAt: new Date().toISOString(), releasedBy: 'MRP policy', autoReleased: true });
        engine.audit({ action: 'production_order.auto_released', objectType: 'Production Order', objectId: o.id, objectNumber: o.number, detail: `Auto-released: value ${x.estValue} ≤ threshold ${s.autoReleaseThreshold}` });
      }
      orders.push(final);
      converted.set(x.id, { id: o.id, number: o.number, type: 'Production Order' });
    });
    accepted.filter((x) => x.type === 'Transfer').forEach((x) => { skipped.push(`${x.itemName}: create the transfer under Inventory › Transfers (${x.qty} ${x.uom} from ${db.find<any>(C.warehouses, x.fromWarehouseId)?.name})`); converted.set(x.id, { id: '', number: 'Manual transfer', type: 'Stock Transfer' }); });
    const suggestions = run.suggestions.map((x) => { const cv = converted.get(x.id); return cv ? { ...x, status: 'Converted' as const, convertedDocId: cv.id || undefined, convertedDocNumber: cv.number, convertedDocType: cv.type } : x; });
    const allDone = suggestions.every((x) => x.status === 'Converted' || x.status === 'Rejected');
    db.update<MrpRun>(C.mrpRuns, run.id, { suggestions, status: allDone ? 'Converted' : suggestions.some((x) => x.status === 'Converted') ? 'Partially Converted' : run.status });
  });
  if (pos.length || orders.length) engine.notify({ type: 'system', title: `${run.number} converted`, body: `${pos.length} draft PO(s) · ${orders.length} production order(s)`, link: `production/mrp/${run.id}` });
  return { pos, orders, skipped };
}

// ── Capacity (FR-MFG-004) ──────────────────────────────────────────────────

export interface WeekLoad { weekStart: string; weekEnd: string; label: string; capacity: number; load: number; orders: { number: string; id: string; hours: number }[] }

function weekStartOf(date: string): string {
  const d = new Date(date + 'T00:00:00');
  const dow = (d.getDay() + 6) % 7; // Monday = 0
  return addDays(date, -dow);
}

/** Planned load (remaining hours) vs capacity for the next N weeks per work centre. */
export function capacityBoard(wc: WorkCentre, weeks = 4, from = today()): WeekLoad[] {
  const cid = engine.ctx().companyId;
  const start = weekStartOf(from);
  const out: WeekLoad[] = Array.from({ length: weeks }, (_, i) => { const ws = addDays(start, i * 7); const we = addDays(ws, 6); const workingDays = Array.from({ length: 7 }, (_, d) => new Date(addDays(ws, d) + 'T00:00:00').getDay()).filter((dow) => wc.workingDays.includes(dow)).length; return { weekStart: ws, weekEnd: we, label: `${ws.slice(8)}/${ws.slice(5, 7)} – ${we.slice(8)}/${we.slice(5, 7)}`, capacity: round(workingDays * wc.capacityHrsPerDay * (wc.efficiencyPct / 100), 1), load: 0, orders: [] }; });
  const orders = db.where<ProductionOrder>(C.productionOrders, (o) => o.companyId === cid && OPEN_ORDER_STATUSES.includes(o.status));
  orders.forEach((o) => {
    const hrs = o.operations.filter((op) => op.workCentreId === wc.id && op.status !== 'Done' && op.status !== 'Skipped' && !op.subcontract).reduce((s, op) => { const remaining = Math.max(0, o.qty - op.completedQty - op.scrapQty); return s + (op.status === 'Pending' ? op.setupMin : 0) / 60 + (op.runMinPerUnit * remaining) / 60; }, 0);
    if (hrs <= 0) return;
    const s = o.plannedStart < from ? from : o.plannedStart;
    const e = o.plannedEnd < s ? s : o.plannedEnd;
    const days = Math.max(1, Math.round((new Date(e + 'T00:00:00').getTime() - new Date(s + 'T00:00:00').getTime()) / 86400000) + 1);
    const perDay = hrs / days;
    out.forEach((w) => {
      let overlap = 0;
      for (let d = 0; d < 7; d += 1) { const day = addDays(w.weekStart, d); if (day >= s && day <= e) overlap += 1; }
      if (overlap > 0) { const h = round(perDay * overlap, 1); w.load = round(w.load + h, 1); w.orders.push({ number: o.number, id: o.id, hours: h }); }
    });
  });
  return out;
}

export function itemHasBom(itemId: string) { return !!activeBomFor(itemId); }
export function itemOf(id: string) { return item(id); }
