// Subcontracting: send materials, service PO, receive processed goods, consumption variance, charges (FR-MFG-014).
import { db, C, engine, IDS, ValidationError } from '../../store';
import type { DocHeader, Item } from '../../store';
import { addDays, correlationId, round, today, uid } from '../../lib/format';
import type { ProductionOrder, SentItem, SubcontractOrder } from './types';
import { inventoryAccountOf, item, mfgSettings, refreshCosts, supplierName, wipEntry } from './core';
import { get as getOrder } from './actions';

export interface NewSubcontractInput {
  supplierId: string;
  orderId?: string;
  operationId?: string;
  operationName: string;
  serviceItemId: string;
  rate: number;
  qty: number;
  expectedDate?: string;
  sendWarehouseId?: string;
  items: { itemId: string; qty: number; batch?: string }[];
  notes?: string;
  date?: string;
}

export function createSubcontract(input: NewSubcontractInput): SubcontractOrder {
  if (!input.supplierId) throw new ValidationError('Choose a supplier', 'VALIDATION', 'supplierId');
  if (!input.serviceItemId) throw new ValidationError('Choose the service item', 'VALIDATION', 'serviceItemId');
  if (!(input.qty > 0)) throw new ValidationError('Quantity to process must be positive', 'VALIDATION', 'qty');
  if (!input.items.length) throw new ValidationError('Add at least one material to send', 'VALIDATION', 'items');
  const s = mfgSettings();
  const c = engine.ctx();
  const date = input.date ?? today();
  const svc = item(input.serviceItemId)!;
  const order = input.orderId ? getOrder(input.orderId) : undefined;
  const number = engine.allocateNumber('Subcontract Order', { date, branchId: c.branchId });
  const sendWh = input.sendWarehouseId ?? order?.rmWarehouseId ?? s.rmWarehouseId;
  const itemsSent: SentItem[] = input.items.map((l) => { const it = item(l.itemId)!; return { id: uid('si'), itemId: it.id, itemCode: it.code, itemName: it.name, qty: l.qty, uom: it.baseUom, batch: l.batch, rate: engine.stockPosition(it.id, sendWh).avgRate, warehouseId: sendWh }; });
  const sc = db.insert<SubcontractOrder>(C.subcontractOrders, {
    number, docType: 'Subcontract Order', date, branchId: c.branchId, supplierId: input.supplierId, supplierName: supplierName(input.supplierId), orderId: order?.id, orderNumber: order?.number, operationId: input.operationId, operationName: input.operationName,
    serviceItemId: svc.id, serviceItemName: svc.name, rate: input.rate, qty: input.qty, expectedDate: input.expectedDate ?? addDays(date, 7), sendWarehouseId: sendWh, subWarehouseId: s.subcontractWarehouseId,
    itemsSent, received: [], receivedQty: 0, charges: 0, consumptionVariance: [], status: 'Draft', journalIds: [], notes: input.notes, correlationId: order?.correlationId ?? correlationId(),
  });
  if (order && input.operationId) db.update<ProductionOrder>(C.productionOrders, order.id, { operations: order.operations.map((op) => (op.id === input.operationId ? { ...op, subcontractOrderId: sc.id } : op)) });
  engine.audit({ action: 'subcontract.created', objectType: 'Subcontract Order', objectId: sc.id, objectNumber: number, detail: `${sc.supplierName} · ${input.operationName} × ${input.qty}`, correlationId: sc.correlationId });
  return sc;
}

function getSc(id: string): SubcontractOrder {
  const sc = db.find<SubcontractOrder>(C.subcontractOrders, id);
  if (!sc) throw new ValidationError('Subcontract order not found', 'NOT_FOUND');
  return sc;
}

/** Send materials: −send warehouse, +'At Subcontractor' (Subcontract Out). */
export function sendMaterials(id: string, date = today()): SubcontractOrder {
  const sc = getSc(id);
  if (sc.status !== 'Draft') throw new ValidationError(`Materials already sent (${sc.status})`, 'INVALID_STATE');
  engine.assertPostable(date);
  return db.transaction(() => {
    const itemsSent = sc.itemsSent.map((l) => {
      const out = engine.moveStock({ date, itemId: l.itemId, warehouseId: l.warehouseId, qty: -l.qty, type: 'Subcontract Out', sourceType: 'Subcontract Order', sourceId: sc.id, sourceNumber: sc.number, batch: l.batch });
      engine.moveStock({ date, itemId: l.itemId, warehouseId: sc.subWarehouseId, qty: l.qty, rate: out.rate, type: 'Subcontract Out', sourceType: 'Subcontract Order', sourceId: sc.id, sourceNumber: sc.number, batch: l.batch });
      return { ...l, rate: out.rate, movementId: out.id, sentAt: new Date().toISOString() };
    });
    const out = db.update<SubcontractOrder>(C.subcontractOrders, sc.id, { itemsSent, status: 'Sent', sentAt: new Date().toISOString() });
    engine.audit({ action: 'subcontract.sent', objectType: 'Subcontract Order', objectId: sc.id, objectNumber: sc.number, detail: `${itemsSent.length} line(s) sent to ${sc.supplierName}`, correlationId: sc.correlationId });
    engine.notify({ type: 'system', title: `${sc.number}: materials sent to ${sc.supplierName}`, link: `production/subcontracting/${sc.id}` });
    return out;
  });
}

/** Draft purchase order for the service item (purchase module document shape). */
export function createServicePo(id: string): DocHeader {
  const sc = getSc(id);
  if (sc.poId) throw new ValidationError(`PO ${sc.poNumber} already exists`, 'DUPLICATE');
  const line = engine.lineFromItem(sc.serviceItemId, { qty: sc.qty, supplierId: sc.supplierId, direction: 'purchase' });
  line.rate = sc.rate;
  line.description = `${sc.operationName} · ${sc.orderNumber ?? sc.number}`;
  const tc = engine.taxContextFor('Supplier', sc.supplierId, 'purchase');
  const { lines, totals } = engine.computeDocument([line], tc);
  const po = engine.newDocHeader('Purchase Order', { partyType: 'Supplier', partyId: sc.supplierId, partyName: sc.supplierName, partySnapshot: engine.partySnapshotFor('Supplier', sc.supplierId), lines, totals, reference: sc.number, sourceType: 'Subcontract Order', sourceId: sc.id, sourceNumber: sc.number, paymentTerms: db.find<any>(C.suppliers, sc.supplierId)?.purchaseTerms, notes: `Subcontract service for ${sc.operationName}${sc.orderNumber ? ' on ' + sc.orderNumber : ''}` });
  const saved = db.insert<DocHeader>(C.purchaseOrders, { ...po, expectedDate: sc.expectedDate, amendments: [] } as any);
  db.update<SubcontractOrder>(C.subcontractOrders, sc.id, { poId: saved.id, poNumber: saved.number });
  engine.audit({ action: 'subcontract.po_created', objectType: 'Subcontract Order', objectId: sc.id, objectNumber: sc.number, detail: `Draft PO ${saved.number} · ${totals.total}`, correlationId: sc.correlationId });
  return saved;
}

export interface SubReceiveInput { qty: number; consumed: { itemId: string; qty: number }[]; returned: { itemId: string; qty: number }[]; date?: string; postCharges?: boolean }

/** Receive processed goods: consumed → WIP (Dr WIP / Cr inventory), returned → send warehouse, variance → Production Variances, charges Dr WIP / Cr AP. */
export function receiveProcessed(id: string, input: SubReceiveInput): SubcontractOrder {
  const sc = getSc(id);
  if (sc.status !== 'Sent' && sc.status !== 'Partially Received') throw new ValidationError(`Cannot receive on a ${sc.status} subcontract order`, 'INVALID_STATE');
  const qty = round(input.qty, 3);
  if (!(qty > 0)) throw new ValidationError('Received quantity must be positive', 'VALIDATION', 'qty');
  if (sc.receivedQty + qty > sc.qty + 0.0005) throw new ValidationError(`Only ${round(sc.qty - sc.receivedQty, 3)} remain to receive`, 'OVER_RECEIPT', 'qty');
  const date = input.date ?? today();
  engine.assertPostable(date);
  const c = engine.ctx();
  const order = sc.orderId ? getOrder(sc.orderId) : undefined;
  const atSupplier = (itemId: string) => round(sc.itemsSent.filter((l) => l.itemId === itemId).reduce((s, l) => s + l.qty, 0) - sc.received.reduce((s, r) => s + r.consumed.filter((x) => x.itemId === itemId).reduce((a, x) => a + x.qty, 0) + r.returned.filter((x) => x.itemId === itemId).reduce((a, x) => a + x.qty, 0), 0) - sc.consumptionVariance.filter((v) => v.itemId === itemId).reduce((s, v) => s + v.variance, 0), 3);
  [...input.consumed, ...input.returned].forEach((l) => { const at = atSupplier(l.itemId); const tot = (input.consumed.find((x) => x.itemId === l.itemId)?.qty ?? 0) + (input.returned.find((x) => x.itemId === l.itemId)?.qty ?? 0); if (tot > at + 0.0005) throw new ValidationError(`${item(l.itemId)?.name}: consumed + returned (${tot}) exceeds ${at} at the subcontractor`, 'OVER_CONSUMPTION'); });
  return db.transaction(() => {
    const movementIds: string[] = [];
    const journalIds: string[] = [];
    const rec = { id: uid('sr'), date, qty, consumed: input.consumed.filter((x) => x.qty > 0), returned: input.returned.filter((x) => x.qty > 0), charge: round(sc.rate * qty), movementIds, by: c.userName } as SubcontractOrder['received'][number];
    // consumed materials → WIP warehouse (becomes floor stock for the order) with Dr WIP / Cr inventory
    const gl = new Map<string, number>();
    let consumedValue = 0;
    rec.consumed.forEach((l) => {
      const sent = sc.itemsSent.find((x) => x.itemId === l.itemId);
      const out = engine.moveStock({ date, itemId: l.itemId, warehouseId: sc.subWarehouseId, qty: -l.qty, type: 'Subcontract In', sourceType: 'Subcontract Order', sourceId: sc.id, sourceNumber: sc.number, batch: sent?.batch });
      movementIds.push(out.id);
      if (order) { const inn = engine.moveStock({ date, itemId: l.itemId, warehouseId: order.wipWarehouseId, qty: l.qty, rate: out.rate, type: 'Subcontract In', sourceType: 'Subcontract Order', sourceId: sc.id, sourceNumber: sc.number, batch: sent?.batch }); movementIds.push(inn.id); }
      const acc = inventoryAccountOf(item(l.itemId));
      if (order) { gl.set(acc, round((gl.get(acc) ?? 0) + out.value)); consumedValue = round(consumedValue + out.value); }
    });
    rec.returned.forEach((l) => {
      const sent = sc.itemsSent.find((x) => x.itemId === l.itemId);
      const out = engine.moveStock({ date, itemId: l.itemId, warehouseId: sc.subWarehouseId, qty: -l.qty, type: 'Subcontract In', sourceType: 'Subcontract Order', sourceId: sc.id, sourceNumber: sc.number, batch: sent?.batch });
      const inn = engine.moveStock({ date, itemId: l.itemId, warehouseId: sent?.warehouseId ?? sc.sendWarehouseId, qty: l.qty, rate: out.rate, type: 'Subcontract In', sourceType: 'Subcontract Order', sourceId: sc.id, sourceNumber: sc.number, batch: sent?.batch });
      movementIds.push(out.id, inn.id);
    });
    const lines: { accountId: string; dr?: number; cr?: number; partyType?: 'Supplier'; partyId?: string; partyName?: string }[] = [];
    if (consumedValue > 0) { lines.push({ accountId: 'acc_1220', dr: consumedValue }); gl.forEach((cr, accountId) => lines.push({ accountId, cr })); }
    const charge = rec.charge;
    if (charge > 0 && input.postCharges !== false) lines.push({ accountId: order ? 'acc_1220' : 'acc_5720', dr: charge }, { accountId: IDS.accAP, cr: charge, partyType: 'Supplier', partyId: sc.supplierId, partyName: sc.supplierName });
    if (lines.length) {
      const j = engine.postJournal({ date, sourceType: 'Subcontract Order', sourceId: sc.id, sourceNumber: sc.number, idempotencyKey: `${sc.id}:receive:${rec.id}`, narration: `Subcontract receipt ${sc.number} · ${sc.operationName} × ${qty} from ${sc.supplierName}`, lines });
      rec.journalId = j.id; journalIds.push(j.id);
      if (order) {
        if (consumedValue > 0) wipEntry(order, { date, type: 'Material In', amount: consumedValue, journalId: j.id, journalNumber: j.number, sourceType: 'Subcontract Order', sourceId: sc.id, sourceNumber: sc.number, description: 'Materials consumed at subcontractor' });
        if (charge > 0 && input.postCharges !== false) wipEntry(order, { date, type: 'Subcontract', amount: charge, journalId: j.id, journalNumber: j.number, sourceType: 'Subcontract Order', sourceId: sc.id, sourceNumber: sc.number, description: `${sc.operationName} × ${qty} @ ${sc.rate}` });
      }
      if (charge > 0 && input.postCharges !== false) {
        const oi = engine.createOpenItem({ partyType: 'Supplier', partyId: sc.supplierId, partyName: sc.supplierName, docType: 'Subcontract Order', docId: sc.id, docNumber: sc.number, date, dueDate: engine.dueDateFor(date, db.find<any>(C.suppliers, sc.supplierId)?.purchaseTerms), currency: c.currency, originalAmount: charge, baseAmount: charge, rate: 1, direction: 'Debit', branchId: c.branchId });
        void oi;
      }
    }
    const receivedQty = round(sc.receivedQty + qty, 3);
    const complete = receivedQty >= sc.qty - 0.0005;
    // consumption variance is computed on the final receipt: anything still at the subcontractor is lost
    let consumptionVariance = sc.consumptionVariance;
    if (complete) {
      const vLines: { accountId: string; dr?: number; cr?: number }[] = [];
      let vTotal = 0;
      consumptionVariance = sc.itemsSent.reduce<SubcontractOrder['consumptionVariance']>((acc, l) => {
        if (acc.some((x) => x.itemId === l.itemId)) return acc;
        const sentQ = round(sc.itemsSent.filter((x) => x.itemId === l.itemId).reduce((s, x) => s + x.qty, 0), 3);
        const cons = round([...sc.received, rec].reduce((s, r) => s + r.consumed.filter((x) => x.itemId === l.itemId).reduce((a, x) => a + x.qty, 0), 0), 3);
        const ret = round([...sc.received, rec].reduce((s, r) => s + r.returned.filter((x) => x.itemId === l.itemId).reduce((a, x) => a + x.qty, 0), 0), 3);
        const variance = round(sentQ - cons - ret, 3);
        let value = 0;
        if (variance > 0) {
          const out = engine.moveStock({ date, itemId: l.itemId, warehouseId: sc.subWarehouseId, qty: -variance, type: 'Subcontract In', sourceType: 'Subcontract Order', sourceId: sc.id, sourceNumber: sc.number, batch: l.batch });
          movementIds.push(out.id);
          value = out.value;
          if (value > 0) { vLines.push({ accountId: inventoryAccountOf(item(l.itemId)), cr: value }); vTotal = round(vTotal + value); }
        }
        acc.push({ itemId: l.itemId, itemName: l.itemName, sent: sentQ, consumed: cons, returned: ret, variance, value });
        return acc;
      }, []);
      if (vTotal > 0) {
        const vj = engine.postJournal({ date, sourceType: 'Subcontract Order', sourceId: sc.id, sourceNumber: sc.number, idempotencyKey: `${sc.id}:variance`, narration: `Subcontract consumption variance · ${sc.number} · ${sc.supplierName}`, lines: [{ accountId: 'acc_5710', dr: vTotal }, ...vLines] });
        journalIds.push(vj.id);
      }
    }
    const out = db.update<SubcontractOrder>(C.subcontractOrders, sc.id, { received: [...sc.received, rec], receivedQty, charges: round(sc.charges + (input.postCharges === false ? 0 : charge)), consumptionVariance, status: complete ? 'Received' : 'Partially Received', journalIds: [...sc.journalIds, ...journalIds] });
    if (order) {
      const fresh = getOrder(order.id);
      const comps = fresh.components.map((cmp) => { const q = rec.consumed.filter((x) => x.itemId === cmp.itemId).reduce((s, x) => s + x.qty, 0); return q ? { ...cmp, issuedQty: round(cmp.issuedQty + q, 3) } : cmp; });
      const ops = fresh.operations.map((op) => (op.id === sc.operationId ? { ...op, subcontractOrderId: sc.id, subcontractCost: round(op.subcontractCost + (input.postCharges === false ? 0 : charge)), completedQty: round(op.completedQty + qty, 3), status: complete ? ('Done' as const) : ('In Progress' as const), completedAt: complete ? new Date().toISOString() : undefined, completedBy: complete ? c.userName : undefined } : op));
      db.update<ProductionOrder>(C.productionOrders, order.id, { components: comps, operations: ops, status: fresh.status === 'Released' ? 'In Progress' : fresh.status, journalIds: [...fresh.journalIds, ...journalIds] });
      refreshCosts(order.id);
    }
    engine.audit({ action: 'subcontract.received', objectType: 'Subcontract Order', objectId: sc.id, objectNumber: sc.number, detail: `${qty} processed · charge ${charge} · consumed ${rec.consumed.length} line(s)`, correlationId: sc.correlationId });
    return out;
  });
}

export function closeSubcontract(id: string): SubcontractOrder {
  const sc = getSc(id);
  if (sc.status !== 'Received') throw new ValidationError('Receive all processed goods before closing', 'INVALID_STATE');
  const out = db.update<SubcontractOrder>(C.subcontractOrders, sc.id, { status: 'Closed', closedAt: new Date().toISOString() });
  engine.audit({ action: 'subcontract.closed', objectType: 'Subcontract Order', objectId: sc.id, objectNumber: sc.number, correlationId: sc.correlationId });
  return out;
}

export function cancelSubcontract(id: string, reason: string): SubcontractOrder {
  const sc = getSc(id);
  if (sc.status !== 'Draft') throw new ValidationError('Materials already sent — receive/return them instead', 'INVALID_STATE');
  if (!reason || reason.trim().length < 10) throw new ValidationError('A reason is required', 'VALIDATION', 'reason');
  const out = db.update<SubcontractOrder>(C.subcontractOrders, sc.id, { status: 'Cancelled', cancelReason: reason });
  if (sc.orderId && sc.operationId) { const o = getOrder(sc.orderId); db.update<ProductionOrder>(C.productionOrders, o.id, { operations: o.operations.map((op) => (op.id === sc.operationId ? { ...op, subcontractOrderId: undefined } : op)) }); }
  engine.audit({ action: 'subcontract.cancelled', objectType: 'Subcontract Order', objectId: sc.id, objectNumber: sc.number, detail: reason, correlationId: sc.correlationId });
  return out;
}

export function serviceItems(): Item[] {
  return db.where<Item>(C.items, (i) => i.type === 'Service' && i.status === 'Active');
}
