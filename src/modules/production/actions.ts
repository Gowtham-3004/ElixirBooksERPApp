// Production order lifecycle (FR-MFG-007/008/010/011/016).
import { db, C, engine, ValidationError } from '../../store';
import type { Item, ID } from '../../store';
import { correlationId, fiscalYearOf, periodCodeOf, round, today, uid } from '../../lib/format';
import type { Bom, OrderComponent, OrderOperation, ProductionOrder, ProductionOrderStatus, Routing, SourceDemand } from './types';
import { activeBomFor, computeOrderCosts, emptyCosts, item, mfgSettings, opStdCost, refreshCosts, rollupBom, scheduleEnd, wipBalanceOf, wipEntry, workCentre } from './core';

export interface NewOrderInput {
  itemId: string;
  bomId?: string;
  routingId?: string;
  qty: number;
  plannedStart: string;
  plannedEnd?: string;
  warehouseId?: string;
  wipWarehouseId?: string;
  rmWarehouseId?: string;
  serialPrefix?: string;
  sourceDemand?: SourceDemand;
  mrpRunId?: string;
  priority?: ProductionOrder['priority'];
  dimensions?: Record<string, string>;
  notes?: string;
  status?: 'Draft' | 'Planned';
  date?: string;
}

export function buildComponents(bom: Bom, qty: number, rmWarehouseId: string): OrderComponent[] {
  const factor = qty / (bom.outputQty || 1);
  return bom.components.map((c) => {
    const it = item(c.itemId);
    return { id: uid('oc'), bomComponentId: c.id, itemId: c.itemId, itemCode: c.itemCode, itemName: c.itemName, uom: c.uom, qtyPer: round(c.qty / (bom.outputQty || 1), 6), scrapPct: c.scrapPct, plannedQty: round(c.qty * factor * (1 + c.scrapPct / 100), 3), issuedQty: 0, returnedQty: 0, consumedQty: 0, isPhantom: c.isPhantom, substitutes: c.substitutes, tracking: it?.tracking ?? 'None', warehouseId: rmWarehouseId };
  });
}

export function buildOperations(routing: Routing | undefined): OrderOperation[] {
  return (routing?.operations ?? []).slice().sort((a, b) => a.seq - b.seq).map((op) => {
    const wc = workCentre(op.workCentreId);
    return { id: uid('oop'), seq: op.seq, name: op.name, workCentreId: op.workCentreId, workCentreName: wc?.name ?? '—', setupMin: op.setupMin, runMinPerUnit: op.runMinPerUnit, labourRate: op.labourRate ?? wc?.costRateLabour ?? 0, machineRate: op.machineRate ?? wc?.costRateMachine ?? 0, overheadRate: wc?.overheadRate ?? 0, yieldPct: op.yieldPct, parallel: op.parallel, subcontract: op.subcontract, supplierId: op.supplierId, serviceItemId: op.serviceItemId, subcontractRate: op.subcontractRate, status: 'Pending', actualSetupMin: 0, actualRunMin: 0, labourCost: 0, machineCost: 0, overheadCost: 0, subcontractCost: 0, completedQty: 0, scrapQty: 0 };
  });
}

/** Create a production order (Draft or Planned). Number is allocated on save. */
export function createOrder(input: NewOrderInput): ProductionOrder {
  const c = engine.ctx();
  const s = mfgSettings();
  const it = item(input.itemId);
  if (!it) throw new ValidationError('Choose an item to produce', 'VALIDATION', 'itemId');
  if (!(input.qty > 0)) throw new ValidationError('Quantity must be positive', 'VALIDATION', 'qty');
  const bom = input.bomId ? db.find<Bom>(C.boms, input.bomId) : activeBomFor(it.id, input.plannedStart);
  if (!bom) throw new ValidationError(`${it.name} has no active bill of material`, 'NO_BOM', 'bomId');
  if (bom.status === 'Superseded') throw new ValidationError(`${bom.code} v${bom.version} is superseded — pick the current version`, 'BOM_SUPERSEDED', 'bomId');
  const routing = db.find<Routing>(C.routings, input.routingId ?? bom.routingId);
  const date = input.date ?? today();
  const rm = input.rmWarehouseId ?? s.rmWarehouseId;
  const sched = scheduleEnd(input.plannedStart, routing, input.qty);
  const roll = rollupBom(bom, routing);
  const status: ProductionOrderStatus = input.status ?? 'Draft';
  const number = engine.allocateNumber('Production Order', { date, branchId: c.branchId });
  const order = db.insert<ProductionOrder>(C.productionOrders, {
    number, docType: 'Production Order', date, branchId: c.branchId, status,
    itemId: it.id, itemCode: it.code, itemName: it.name, uom: it.baseUom, tracking: it.tracking,
    bomId: bom.id, bomCode: bom.code, bomVersion: bom.version, routingId: routing?.id, routingCode: routing?.code,
    qty: input.qty, plannedStart: input.plannedStart, plannedEnd: input.plannedEnd ?? sched.end,
    warehouseId: input.warehouseId ?? s.fgWarehouseId, wipWarehouseId: input.wipWarehouseId ?? s.wipWarehouseId, rmWarehouseId: rm, scrapWarehouseId: s.scrapWarehouseId,
    lotNumber: it.tracking === 'Batch' ? `LOT-${number.replace(/\//g, '-').replace(/^PRD-26-27-/, 'PRD-')}-1` : undefined,
    serialPrefix: it.tracking === 'Serial' ? (input.serialPrefix || `SER-${it.code.split('-').pop()}`) : undefined,
    sourceDemand: input.sourceDemand, mrpRunId: input.mrpRunId,
    components: buildComponents(bom, input.qty, rm), operations: buildOperations(routing),
    costs: emptyCosts(), costingMethod: s.costingMethod, stdUnitCost: bom.stdCost ?? it.standardCost ?? roll.perUnit,
    receivedQty: 0, scrapQty: 0, byProductsReceived: [], journalIds: [], priority: input.priority ?? 'Normal', dimensions: input.dimensions, notes: input.notes,
    correlationId: correlationId(), fy: fiscalYearOf(date, c.fyStartMonth), period: periodCodeOf(date),
  });
  const withCosts = db.update<ProductionOrder>(C.productionOrders, order.id, { costs: computeOrderCosts(order) });
  engine.audit({ action: status === 'Planned' ? 'production_order.planned' : 'production_order.created', objectType: 'Production Order', objectId: order.id, objectNumber: number, detail: `${it.name} × ${input.qty} · BOM ${bom.code} v${bom.version}`, correlationId: order.correlationId });
  return withCosts;
}

/** Update an editable (Draft/Planned) order; rebuilds components/operations when BOM/qty change. */
export function updateOrder(id: string, patch: Partial<NewOrderInput>, expectedVersion?: number): ProductionOrder {
  const o = get(id);
  if (!['Draft', 'Planned', 'Returned', 'Rejected'].includes(o.status)) throw new ValidationError(`A ${o.status} order cannot be edited`, 'INVALID_STATE');
  const bom = patch.bomId ? db.find<Bom>(C.boms, patch.bomId) : db.find<Bom>(C.boms, o.bomId);
  if (!bom) throw new ValidationError('BOM not found', 'NOT_FOUND', 'bomId');
  const routing = db.find<Routing>(C.routings, patch.routingId ?? o.routingId);
  const qty = patch.qty ?? o.qty;
  const rm = patch.rmWarehouseId ?? o.rmWarehouseId;
  const rebuild = (patch.bomId && patch.bomId !== o.bomId) || (patch.qty !== undefined && patch.qty !== o.qty) || (patch.routingId !== undefined && patch.routingId !== o.routingId);
  const plannedStart = patch.plannedStart ?? o.plannedStart;
  const next: Partial<ProductionOrder> = {
    bomId: bom.id, bomCode: bom.code, bomVersion: bom.version, routingId: routing?.id, routingCode: routing?.code, qty, plannedStart,
    plannedEnd: patch.plannedEnd ?? (rebuild || patch.plannedStart ? scheduleEnd(plannedStart, routing, qty).end : o.plannedEnd),
    warehouseId: patch.warehouseId ?? o.warehouseId, wipWarehouseId: patch.wipWarehouseId ?? o.wipWarehouseId, rmWarehouseId: rm,
    serialPrefix: patch.serialPrefix ?? o.serialPrefix, sourceDemand: patch.sourceDemand === undefined ? o.sourceDemand : patch.sourceDemand, priority: patch.priority ?? o.priority, dimensions: patch.dimensions ?? o.dimensions, notes: patch.notes ?? o.notes,
    components: rebuild ? buildComponents(bom, qty, rm) : o.components.map((cmp) => ({ ...cmp, warehouseId: rm })), operations: rebuild ? buildOperations(routing) : o.operations,
  };
  if (o.status === 'Rejected' || o.status === 'Returned') next.status = 'Planned';
  const out = db.update<ProductionOrder>(C.productionOrders, id, next, { expectedVersion });
  engine.audit({ action: 'production_order.updated', objectType: 'Production Order', objectId: id, objectNumber: o.number, correlationId: o.correlationId });
  return refreshCosts(id);
}

export function get(id: string): ProductionOrder {
  const o = db.find<ProductionOrder>(C.productionOrders, id);
  if (!o) throw new ValidationError('Production order not found', 'NOT_FOUND');
  return o;
}

function transition(o: ProductionOrder, status: ProductionOrderStatus, extra: Partial<ProductionOrder>, action: string, detail?: string) {
  const out = db.update<ProductionOrder>(C.productionOrders, o.id, { status, ...extra });
  engine.audit({ action: `production_order.${action}`, objectType: 'Production Order', objectId: o.id, objectNumber: o.number, detail, correlationId: o.correlationId });
  return out;
}

export function planOrder(id: string) {
  const o = get(id);
  if (o.status !== 'Draft') throw new ValidationError(`Only Draft orders can be planned (is ${o.status})`, 'INVALID_STATE');
  return transition(o, 'Planned', {}, 'planned');
}

export function deleteDraft(id: string) {
  const o = get(id);
  if (o.status !== 'Draft') throw new ValidationError('Only Draft orders can be deleted — cancel instead', 'INVALID_STATE');
  engine.voidNumber('Production Order', o.number, 'Draft deleted');
  db.remove(C.productionOrders, id);
  engine.audit({ action: 'production_order.deleted', objectType: 'Production Order', objectId: id, objectNumber: o.number, correlationId: o.correlationId });
}

export interface AvailabilityLine { componentId: string; itemName: string; required: number; available: number; shortfall: number; uom: string; warehouse: string }

/** Component availability in the RM warehouse for the remaining planned quantity. */
export function componentAvailability(o: ProductionOrder): AvailabilityLine[] {
  return o.components.filter((c) => !c.isPhantom).map((c) => {
    const whId = c.warehouseId ?? o.rmWarehouseId;
    const pos = engine.stockPosition(c.itemId, whId);
    const required = round(c.plannedQty - c.issuedQty + c.returnedQty, 3);
    return { componentId: c.id, itemName: c.itemName, required, available: pos.available, shortfall: round(Math.max(0, required - pos.available), 3), uom: c.uom, warehouse: db.find<any>(C.warehouses, whId)?.name ?? '—' };
  });
}

/** Release: availability check + workflow (docType 'Production Order'). Returns the approval request when a rule applies. */
export function releaseOrder(id: string, opts: { acknowledgeShortfall?: boolean } = {}) {
  const o = get(id);
  if (!['Planned', 'Approved', 'Draft'].includes(o.status)) throw new ValidationError(`Cannot release a ${o.status} order`, 'INVALID_STATE');
  const short = componentAvailability(o).filter((l) => l.shortfall > 0);
  if (short.length && !opts.acknowledgeShortfall) throw new ValidationError(`Component shortfall: ${short.map((l) => `${l.itemName} short ${l.shortfall} ${l.uom}`).join('; ')}`, 'SHORTFALL');
  if (o.status !== 'Approved') {
    const amount = o.costs.totalStd || rollupBom(db.find<Bom>(C.boms, o.bomId)!).perUnit * o.qty;
    const req = engine.submitForApproval({ docType: 'Production Order', collection: C.productionOrders, docId: o.id, docNumber: o.number, amount, summary: `${o.itemName} × ${o.qty}`, skipStatusUpdate: true });
    if (req) {
      const out = db.update<ProductionOrder>(C.productionOrders, o.id, { status: 'Submitted', approvalId: req.id, submittedAt: new Date().toISOString(), submittedBy: engine.ctx().userName });
      engine.audit({ action: 'production_order.submitted', objectType: 'Production Order', objectId: o.id, objectNumber: o.number, detail: `Awaiting ${req.steps.find((s) => s.order === req.currentStep)?.approverLabel}`, correlationId: o.correlationId });
      return { order: out, approval: req };
    }
  }
  const out = transition(o, 'Released', { releasedAt: new Date().toISOString(), releasedBy: engine.ctx().userName, approvalId: o.approvalId }, 'released', short.length ? `Released with shortfall acknowledged: ${short.map((l) => l.itemName).join(', ')}` : undefined);
  engine.notify({ type: 'system', title: `${o.number} released to shop floor`, body: `${o.itemName} × ${o.qty} · start ${o.plannedStart}`, link: `production/orders/${o.id}` });
  return { order: out, approval: null };
}

export function startOrder(id: string) {
  const o = get(id);
  if (o.status !== 'Released') throw new ValidationError(`Only Released orders can be started (is ${o.status})`, 'INVALID_STATE');
  return transition(o, 'In Progress', { actualStart: today(), startedAt: new Date().toISOString() }, 'started');
}

export function hasIssues(o: ProductionOrder) {
  return db.count(C.materialIssues, (i) => i.orderId === o.id && i.status === 'Posted') > 0;
}
export function hasReceipts(o: ProductionOrder) {
  return db.count(C.productionReceipts, (r) => r.orderId === o.id && r.status !== 'Reversed') > 0;
}

export function cancelOrder(id: string, reason: string) {
  const o = get(id);
  if (!['Draft', 'Planned', 'Released', 'Submitted', 'Approved', 'Returned', 'Rejected', 'In Progress'].includes(o.status)) throw new ValidationError(`Cannot cancel a ${o.status} order`, 'INVALID_STATE');
  if (hasIssues(o)) throw new ValidationError('Materials have been issued — return them first, or complete and close the order', 'HAS_ISSUES');
  if (hasReceipts(o)) throw new ValidationError('Output has been received — the order cannot be cancelled', 'HAS_RECEIPTS');
  if (!reason || reason.trim().length < 10) throw new ValidationError('A cancellation reason (10+ characters) is required', 'VALIDATION', 'reason');
  const pending = db.findBy<any>(C.approvals, (a) => a.docId === o.id && a.status === 'Pending');
  if (pending) db.update(C.approvals, pending.id, { status: 'Cancelled' } as any);
  const out = transition(o, 'Cancelled', { reasonForCancel: reason, cancelledAt: new Date().toISOString() }, 'cancelled', reason);
  engine.notify({ type: 'system', title: `${o.number} cancelled`, body: reason, link: `production/orders/${o.id}` });
  return out;
}

/** Complete: allowed when received + scrap ≥ qty, or with a short-close reason. Re-derives status from receipts. */
export function completeOrder(id: string, reason?: string) {
  const o = get(id);
  if (!['In Progress', 'Partially Completed', 'Released'].includes(o.status)) throw new ValidationError(`Cannot complete a ${o.status} order`, 'INVALID_STATE');
  const done = o.receivedQty + o.scrapQty >= o.qty - 0.0005;
  if (!done && (!reason || reason.trim().length < 10)) throw new ValidationError(`Only ${o.receivedQty + o.scrapQty} of ${o.qty} produced — give a short-close reason to complete anyway`, 'SHORT', 'reason');
  const held = db.count(C.productionReceipts, (r) => r.orderId === o.id && r.status === 'Hold');
  if (held) throw new ValidationError(`${held} receipt(s) are on QC hold — complete the inspection first`, 'QC_HOLD');
  const ops = o.operations.map((op) => (op.status === 'Pending' && !done ? { ...op, status: 'Skipped' as const } : op));
  return transition(o, 'Completed', { operations: ops, actualEnd: today(), completedAt: new Date().toISOString(), shortCloseReason: done ? undefined : reason }, 'completed', done ? undefined : `Short-closed: ${reason}`);
}

/** Close: posts the variance journal so WIP for the order nets to zero (FR-MFG-011/012). */
export function closeOrder(id: string) {
  const o = get(id);
  if (o.status !== 'Completed') throw new ValidationError(`Only Completed orders can be closed (is ${o.status})`, 'INVALID_STATE');
  const open = db.count(C.subcontractOrders, (s) => s.orderId === o.id && ['Sent', 'Partially Received'].includes(s.status));
  if (open) throw new ValidationError('A subcontract order for this production order is still open', 'SUBCONTRACT_OPEN');
  const date = today();
  engine.assertPostable(date);
  return db.transaction(() => {
    const balance = wipBalanceOf(o.id);
    let closeJournalId: string | undefined;
    let closeVariance = 0;
    if (Math.abs(balance) >= 0.01) {
      const abs = Math.abs(balance);
      const j = engine.postJournal({
        date, sourceType: 'Production Order', sourceId: o.id, sourceNumber: o.number, idempotencyKey: `${o.id}:close:${o.journalIds.length}`,
        narration: `Production variance on close of ${o.number} (${o.itemName} × ${o.qty})`,
        lines: balance > 0 ? [{ accountId: 'acc_5710', dr: abs }, { accountId: 'acc_1220', cr: abs }] : [{ accountId: 'acc_1220', dr: abs }, { accountId: 'acc_5710', cr: abs }],
      });
      closeJournalId = j.id;
      closeVariance = balance;
      wipEntry(o, { date, type: 'Variance', amount: -balance, journalId: j.id, journalNumber: j.number, sourceType: 'Production Order', sourceId: o.id, sourceNumber: o.number, description: `Close variance ${balance > 0 ? 'under-absorbed' : 'over-absorbed'}` });
    }
    const out = transition(o, 'Closed', { closedAt: new Date().toISOString(), closedBy: engine.ctx().userName, closeJournalId, journalIds: closeJournalId ? [...o.journalIds, closeJournalId] : o.journalIds, costs: { ...computeOrderCosts(o), closeVariance } }, 'closed', closeJournalId ? `Variance ${round(closeVariance)} posted` : 'No variance');
    return refreshCosts(out.id);
  });
}

export function reopenOrder(id: string, reason: string) {
  const o = get(id);
  if (o.status !== 'Completed' && o.status !== 'Closed') throw new ValidationError(`Cannot reopen a ${o.status} order`, 'INVALID_STATE');
  if (!reason || reason.trim().length < 10) throw new ValidationError('A reopen reason is required', 'VALIDATION', 'reason');
  return db.transaction(() => {
    let journalIds = o.journalIds;
    if (o.status === 'Closed' && o.closeJournalId) {
      const rev = engine.reverseJournal(o.closeJournalId, { reason: `Reopen ${o.number}: ${reason}` });
      journalIds = [...journalIds, rev.id];
      wipEntry(o, { date: today(), type: 'Reversal', amount: o.costs.closeVariance, journalId: rev.id, journalNumber: rev.number, sourceType: 'Production Order', sourceId: o.id, sourceNumber: o.number, description: 'Close variance reversed on reopen' });
    }
    const out = transition(o, o.receivedQty > 0 ? 'Partially Completed' : 'In Progress', { reopenReason: reason, closeJournalId: undefined, closedAt: undefined, closedBy: undefined, completedAt: undefined, actualEnd: undefined, journalIds, costs: { ...o.costs, closeVariance: 0 } }, 'reopened', reason);
    return refreshCosts(out.id);
  });
}

/** Status after a receipt: Partially Completed / Completed(auto when full). */
export function deriveStatusAfterOutput(o: ProductionOrder): ProductionOrderStatus {
  if (o.receivedQty + o.scrapQty >= o.qty - 0.0005) return 'Completed';
  if (o.receivedQty > 0) return 'Partially Completed';
  return o.status === 'Released' ? 'In Progress' : o.status;
}

// ── Operations (FR-MFG-010) ────────────────────────────────────────────────

function opCost(op: OrderOperation) {
  const minutes = op.actualSetupMin + op.actualRunMin;
  const hrs = minutes / 60;
  return { labourCost: round(hrs * op.labourRate), machineCost: round(hrs * op.machineRate), overheadCost: round(hrs * op.overheadRate) };
}

export function startOperation(orderId: string, opId: string) {
  const o = get(orderId);
  if (!['Released', 'In Progress', 'Partially Completed'].includes(o.status)) throw new ValidationError(`Order is ${o.status} — release it first`, 'INVALID_STATE');
  const ops = o.operations.map((op) => (op.id === opId ? { ...op, status: 'In Progress' as const, startedAt: new Date().toISOString() } : op));
  const extra: Partial<ProductionOrder> = { operations: ops };
  if (o.status === 'Released') { extra.status = 'In Progress'; extra.actualStart = today(); extra.startedAt = new Date().toISOString(); }
  const out = db.update<ProductionOrder>(C.productionOrders, o.id, extra);
  engine.audit({ action: 'operation.started', objectType: 'Production Order', objectId: o.id, objectNumber: o.number, detail: ops.find((x) => x.id === opId)?.name, correlationId: o.correlationId });
  return out;
}

/** Record actual times / quantities on an operation (no journal until Done). */
export function recordOperation(orderId: string, opId: string, input: { actualSetupMin?: number; actualRunMin?: number; completedQty?: number; scrapQty?: number; scrapReason?: string; addMinutes?: number }) {
  const o = get(orderId);
  const op = o.operations.find((x) => x.id === opId);
  if (!op) throw new ValidationError('Operation not found', 'NOT_FOUND');
  if (op.status === 'Done') throw new ValidationError('Operation is done — reopen the order to change it', 'INVALID_STATE');
  const next: OrderOperation = { ...op, status: op.status === 'Pending' ? 'In Progress' : op.status, actualSetupMin: input.actualSetupMin ?? op.actualSetupMin, actualRunMin: (input.actualRunMin ?? op.actualRunMin) + (input.addMinutes ?? 0), completedQty: input.completedQty ?? op.completedQty, scrapQty: input.scrapQty ?? op.scrapQty, scrapReason: input.scrapReason ?? op.scrapReason };
  if (next.scrapQty > 0 && !next.scrapReason) throw new ValidationError('Scrap quantity needs a reason', 'VALIDATION', 'scrapReason');
  if (next.completedQty + next.scrapQty > o.qty + 0.0005) throw new ValidationError(`Completed + scrap (${next.completedQty + next.scrapQty}) exceeds order qty ${o.qty}`, 'OVER_QTY');
  Object.assign(next, opCost(next));
  const ops = o.operations.map((x) => (x.id === opId ? next : x));
  const extra: Partial<ProductionOrder> = { operations: ops };
  if (o.status === 'Released') { extra.status = 'In Progress'; extra.actualStart = today(); }
  db.update<ProductionOrder>(C.productionOrders, o.id, extra);
  engine.audit({ action: 'operation.recorded', objectType: 'Production Order', objectId: o.id, objectNumber: o.number, detail: `${op.name}: setup ${next.actualSetupMin} min · run ${next.actualRunMin} min · done ${next.completedQty} · scrap ${next.scrapQty}`, correlationId: o.correlationId });
  return refreshCosts(o.id);
}

/** Complete an operation: freezes times and posts conversion cost Dr WIP / Cr absorbed accounts. */
export function completeOperation(orderId: string, opId: string, input: { actualSetupMin?: number; actualRunMin?: number; completedQty?: number; scrapQty?: number; scrapReason?: string } = {}) {
  const o = recordOperation(orderId, opId, input);
  const op = o.operations.find((x) => x.id === opId)!;
  if (op.subcontract && !op.subcontractOrderId) throw new ValidationError('Subcontract operation — receive the subcontract order to complete it', 'SUBCONTRACT');
  const s = mfgSettings();
  const date = today();
  return db.transaction(() => {
    let journalId: string | undefined;
    const conv = round(op.labourCost + op.machineCost + op.overheadCost);
    if (conv > 0) {
      engine.assertPostable(date);
      const lines = [{ accountId: 'acc_1220', dr: conv }];
      if (op.labourCost > 0) lines.push({ accountId: s.labourAbsorbedAccountId, cr: op.labourCost } as any);
      if (op.machineCost + op.overheadCost > 0) lines.push({ accountId: s.overheadAbsorbedAccountId, cr: round(op.machineCost + op.overheadCost) } as any);
      const j = engine.postJournal({ date, sourceType: 'Production Order', sourceId: o.id, sourceNumber: o.number, idempotencyKey: `${o.id}:op:${op.id}:conv`, narration: `Conversion cost · ${o.number} · ${op.name} (${op.actualSetupMin + op.actualRunMin} min)`, lines });
      journalId = j.id;
      wipEntry(o, { date, type: 'Conversion', amount: conv, journalId: j.id, journalNumber: j.number, sourceType: 'Production Order', sourceId: o.id, sourceNumber: o.number, description: `${op.name} · labour ${op.labourCost} · machine ${op.machineCost} · overhead ${op.overheadCost}` });
    }
    const ops = o.operations.map((x) => (x.id === opId ? { ...x, status: 'Done' as const, stoppedAt: new Date().toISOString(), completedAt: new Date().toISOString(), completedBy: engine.ctx().userName, journalId, completedQty: x.completedQty || o.qty - x.scrapQty } : x));
    db.update<ProductionOrder>(C.productionOrders, o.id, { operations: ops, journalIds: journalId ? [...o.journalIds, journalId] : o.journalIds });
    engine.audit({ action: 'operation.completed', objectType: 'Production Order', objectId: o.id, objectNumber: o.number, detail: `${op.name} · conversion ${conv}`, correlationId: o.correlationId });
    return refreshCosts(o.id);
  });
}

export function addReworkOperation(orderId: string, name: string, workCentreId: string, reason: string) {
  const o = get(orderId);
  const wc = workCentre(workCentreId);
  const seq = Math.max(0, ...o.operations.map((x) => x.seq)) + 10;
  const op: OrderOperation = { id: uid('oop'), seq, name, workCentreId, workCentreName: wc?.name ?? '—', setupMin: 0, runMinPerUnit: 0, labourRate: wc?.costRateLabour ?? 0, machineRate: wc?.costRateMachine ?? 0, overheadRate: wc?.overheadRate ?? 0, yieldPct: 100, parallel: false, subcontract: false, status: 'Pending', actualSetupMin: 0, actualRunMin: 0, labourCost: 0, machineCost: 0, overheadCost: 0, subcontractCost: 0, completedQty: 0, scrapQty: 0, isRework: true };
  const out = db.update<ProductionOrder>(C.productionOrders, o.id, { operations: [...o.operations, op], status: o.status === 'Completed' ? 'Partially Completed' : o.status });
  engine.audit({ action: 'operation.rework_added', objectType: 'Production Order', objectId: o.id, objectNumber: o.number, detail: `${name}: ${reason}`, correlationId: o.correlationId });
  return out;
}

/** Standard cost per unit for an order's item (BOM roll-up incl. routing). */
export function stdCostForItem(it: Item, bom?: Bom): number {
  const b = bom ?? activeBomFor(it.id);
  if (!b) return it.standardCost ?? 0;
  return rollupBom(b).perUnit;
}

export function opStd(op: OrderOperation, qty: number) { return opStdCost(op, qty); }

export type { ID };
