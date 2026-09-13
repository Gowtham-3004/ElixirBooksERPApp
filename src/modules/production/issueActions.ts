// Material issue / return / backflush and reversal (FR-MFG-009/016).
import { db, C, engine, ValidationError } from '../../store';
import type { StockMovement } from '../../store';
import { correlationId, round, today, uid } from '../../lib/format';
import type { IssueLine, MaterialIssue, ProductionOrder } from './types';
import { batchesOnHand, inventoryAccountOf, item, mfgSettings, refreshCosts, serialsOnHand, wipEntry } from './core';
import { get, hasReceipts } from './actions';

export interface IssueLineInput { componentId?: string; itemId: string; qty: number; batch?: string; serials?: string[]; warehouseId?: string }

/** Default lines: remaining planned qty per component, FIFO batch pre-selected. */
export function defaultIssueLines(o: ProductionOrder): IssueLineInput[] {
  return o.components.filter((c) => !c.isPhantom).map((c) => {
    const remaining = round(Math.max(0, c.plannedQty - c.issuedQty + c.returnedQty), 3);
    const whId = c.warehouseId ?? o.rmWarehouseId;
    const batches = c.tracking === 'Batch' ? batchesOnHand(c.itemId, whId) : [];
    const first = batches.find((b) => b.qty >= remaining) ?? batches[0];
    return { componentId: c.id, itemId: c.itemId, qty: remaining, batch: first?.batch, warehouseId: whId, serials: c.tracking === 'Serial' ? serialsOnHand(c.itemId, whId).slice(0, remaining) : undefined };
  });
}

function validateLines(o: ProductionOrder, lines: IssueLineInput[], type: MaterialIssue['type']) {
  const s = mfgSettings();
  if (!lines.length) throw new ValidationError('Add at least one line', 'EMPTY');
  lines.forEach((l) => {
    const it = item(l.itemId);
    if (!it) throw new ValidationError('Item not found', 'NOT_FOUND', 'itemId');
    if (!(l.qty > 0)) throw new ValidationError(`${it.name}: quantity must be positive`, 'VALIDATION', 'qty');
    const cmp = o.components.find((c) => c.id === l.componentId) ?? o.components.find((c) => c.itemId === l.itemId);
    if (type !== 'Return') {
      if (cmp) {
        const tol = 1 + s.overIssueTolerancePct / 100;
        const allowed = round(cmp.plannedQty * tol - cmp.issuedQty + cmp.returnedQty, 3);
        if (l.qty > allowed + 0.0005) throw new ValidationError(`${it.name}: over-issue blocked — ${l.qty} ${cmp.uom} exceeds remaining ${allowed} (planned ${cmp.plannedQty} + ${s.overIssueTolerancePct}% tolerance)`, 'OVER_ISSUE', 'qty');
      }
      if (it.tracking === 'Batch' && !l.batch) throw new ValidationError(`${it.name} is batch-tracked — pick a batch`, 'BATCH_REQUIRED', 'batch');
      if (it.tracking === 'Serial' && (l.serials?.length ?? 0) !== l.qty) throw new ValidationError(`${it.name} is serial-tracked — select ${l.qty} serial number(s)`, 'SERIAL_REQUIRED', 'serials');
    } else if (cmp && l.qty > cmp.issuedQty - cmp.returnedQty - cmp.consumedQty + 0.0005) {
      throw new ValidationError(`${it.name}: only ${round(cmp.issuedQty - cmp.returnedQty - cmp.consumedQty, 3)} ${cmp.uom} on the floor can be returned`, 'OVER_RETURN', 'qty');
    }
  });
}

function idemKey(o: ProductionOrder, lines: IssueLineInput[], type: string, stamp: string) {
  return `${o.id}:${type}:${lines.map((l) => `${l.itemId}:${l.qty}:${l.batch ?? ''}`).sort().join('|')}:${stamp}`;
}

/** Post an issue: −RM warehouse, +WIP warehouse, Dr WIP / Cr inventory at average rate. */
export function postIssue(orderId: string, lines: IssueLineInput[], opts: { type?: 'Issue' | 'Backflush'; date?: string; notes?: string; receiptId?: string; stamp?: string } = {}): MaterialIssue {
  const o = get(orderId);
  const type = opts.type ?? 'Issue';
  if (!['Released', 'In Progress', 'Partially Completed'].includes(o.status)) throw new ValidationError(`Materials can only be issued to a Released / In Progress order (is ${o.status})`, 'INVALID_STATE');
  validateLines(o, lines, type);
  const date = opts.date ?? today();
  engine.assertPostable(date);
  const key = idemKey(o, lines, type, opts.stamp ?? new Date().toISOString().slice(0, 16));
  const dup = db.findBy<MaterialIssue>(C.materialIssues, (i) => i.idempotencyKey === key && i.status === 'Posted');
  if (dup) throw new ValidationError(`Duplicate issue blocked — ${dup.number} already posted these lines a moment ago`, 'DUPLICATE');
  const c = engine.ctx();
  return db.transaction(() => {
    const id = uid('mi');
    const number = engine.allocateNumber('Material Issue', { date, branchId: c.branchId });
    const outLines: IssueLine[] = [];
    const movementIds: string[] = [];
    const glLines = new Map<string, number>();
    lines.forEach((l) => {
      const it = item(l.itemId)!;
      const whId = l.warehouseId ?? o.rmWarehouseId;
      const out = engine.moveStock({ date, itemId: l.itemId, warehouseId: whId, qty: -l.qty, type: 'Production Issue', sourceType: 'Material Issue', sourceId: id, sourceNumber: number, batch: l.batch, serials: l.serials });
      const inn = engine.moveStock({ date, itemId: l.itemId, warehouseId: o.wipWarehouseId, qty: l.qty, rate: out.rate, type: 'Production Issue', sourceType: 'Material Issue', sourceId: id, sourceNumber: number, batch: l.batch, serials: l.serials });
      movementIds.push(out.id, inn.id);
      outLines.push({ id: uid('il'), componentId: l.componentId, itemId: it.id, itemCode: it.code, itemName: it.name, qty: l.qty, uom: it.baseUom, batch: l.batch, serials: l.serials, warehouseId: whId, rate: out.rate, value: out.value });
      const acc = inventoryAccountOf(it);
      glLines.set(acc, round((glLines.get(acc) ?? 0) + out.value));
    });
    const totalValue = round(outLines.reduce((s, l) => s + l.value, 0));
    let journalId: string | undefined, journalNumber: string | undefined;
    if (totalValue > 0) {
      const j = engine.postJournal({ date, sourceType: 'Material Issue', sourceId: id, sourceNumber: number, idempotencyKey: `${id}:post`, narration: `${type === 'Backflush' ? 'Backflush' : 'Material issue'} ${number} to ${o.number} (${o.itemName})`, lines: [{ accountId: 'acc_1220', dr: totalValue }, ...Array.from(glLines.entries()).map(([accountId, cr]) => ({ accountId, cr }))] });
      journalId = j.id; journalNumber = j.number;
      movementIds.forEach((mid) => db.patchSilent<StockMovement>(C.stockMovements, mid, { journalId }));
    }
    const issue = db.insert<MaterialIssue>(C.materialIssues, { id, number, docType: 'Material Issue', date, branchId: c.branchId, orderId: o.id, orderNumber: o.number, type, lines: outLines, status: 'Posted', totalValue, journalId, journalNumber, movementIds, idempotencyKey: key, postedAt: new Date().toISOString(), postedBy: c.userName, notes: opts.notes, receiptId: opts.receiptId, correlationId: o.correlationId ?? correlationId() });
    const components = o.components.map((cmp) => {
      const q = outLines.filter((l) => (l.componentId ? l.componentId === cmp.id : l.itemId === cmp.itemId)).reduce((s, l) => s + l.qty, 0);
      return q ? { ...cmp, issuedQty: round(cmp.issuedQty + q, 3) } : cmp;
    });
    db.update<ProductionOrder>(C.productionOrders, o.id, { components, status: o.status === 'Released' ? 'In Progress' : o.status, actualStart: o.actualStart ?? date, journalIds: journalId ? [...o.journalIds, journalId] : o.journalIds });
    if (journalId) wipEntry(o, { date, type: 'Material In', amount: totalValue, journalId, journalNumber, sourceType: 'Material Issue', sourceId: id, sourceNumber: number, description: `${outLines.length} line(s) ${type.toLowerCase()}` });
    engine.audit({ action: type === 'Backflush' ? 'material_issue.backflushed' : 'material_issue.posted', objectType: 'Material Issue', objectId: id, objectNumber: number, detail: `${o.number} · ${outLines.length} line(s) · ${totalValue}`, correlationId: o.correlationId });
    refreshCosts(o.id);
    return issue;
  });
}

/** Return unused floor stock: +RM warehouse, −WIP warehouse, Dr inventory / Cr WIP. */
export function postReturn(orderId: string, lines: IssueLineInput[], opts: { date?: string; notes?: string } = {}): MaterialIssue {
  const o = get(orderId);
  if (!['In Progress', 'Partially Completed', 'Released', 'Completed'].includes(o.status)) throw new ValidationError(`Cannot return materials on a ${o.status} order`, 'INVALID_STATE');
  validateLines(o, lines, 'Return');
  const date = opts.date ?? today();
  engine.assertPostable(date);
  const c = engine.ctx();
  return db.transaction(() => {
    const id = uid('mi');
    const number = engine.allocateNumber('Material Issue', { date, branchId: c.branchId });
    const outLines: IssueLine[] = [];
    const movementIds: string[] = [];
    const glLines = new Map<string, number>();
    lines.forEach((l) => {
      const it = item(l.itemId)!;
      const whId = l.warehouseId ?? o.rmWarehouseId;
      const out = engine.moveStock({ date, itemId: l.itemId, warehouseId: o.wipWarehouseId, qty: -l.qty, type: 'Production Issue', sourceType: 'Material Issue', sourceId: id, sourceNumber: number, batch: l.batch, serials: l.serials });
      const inn = engine.moveStock({ date, itemId: l.itemId, warehouseId: whId, qty: l.qty, rate: out.rate, type: 'Production Issue', sourceType: 'Material Issue', sourceId: id, sourceNumber: number, batch: l.batch, serials: l.serials });
      movementIds.push(out.id, inn.id);
      outLines.push({ id: uid('il'), componentId: l.componentId, itemId: it.id, itemCode: it.code, itemName: it.name, qty: l.qty, uom: it.baseUom, batch: l.batch, serials: l.serials, warehouseId: whId, rate: out.rate, value: out.value });
      const acc = inventoryAccountOf(it);
      glLines.set(acc, round((glLines.get(acc) ?? 0) + out.value));
    });
    const totalValue = round(outLines.reduce((s, l) => s + l.value, 0));
    let journalId: string | undefined, journalNumber: string | undefined;
    if (totalValue > 0) {
      const j = engine.postJournal({ date, sourceType: 'Material Issue', sourceId: id, sourceNumber: number, idempotencyKey: `${id}:post`, narration: `Material return ${number} from ${o.number}`, lines: [...Array.from(glLines.entries()).map(([accountId, dr]) => ({ accountId, dr })), { accountId: 'acc_1220', cr: totalValue }] });
      journalId = j.id; journalNumber = j.number;
    }
    const issue = db.insert<MaterialIssue>(C.materialIssues, { id, number, docType: 'Material Issue', date, branchId: c.branchId, orderId: o.id, orderNumber: o.number, type: 'Return', lines: outLines, status: 'Posted', totalValue, journalId, journalNumber, movementIds, idempotencyKey: `${id}:return`, postedAt: new Date().toISOString(), postedBy: c.userName, notes: opts.notes, correlationId: o.correlationId });
    const components = o.components.map((cmp) => { const q = outLines.filter((l) => (l.componentId ? l.componentId === cmp.id : l.itemId === cmp.itemId)).reduce((s, l) => s + l.qty, 0); return q ? { ...cmp, returnedQty: round(cmp.returnedQty + q, 3) } : cmp; });
    db.update<ProductionOrder>(C.productionOrders, o.id, { components, journalIds: journalId ? [...o.journalIds, journalId] : o.journalIds });
    if (journalId) wipEntry(o, { date, type: 'Material Return', amount: -totalValue, journalId, journalNumber, sourceType: 'Material Issue', sourceId: id, sourceNumber: number });
    engine.audit({ action: 'material_return.posted', objectType: 'Material Issue', objectId: id, objectNumber: number, detail: `${o.number} · ${totalValue}`, correlationId: o.correlationId });
    refreshCosts(o.id);
    return issue;
  });
}

/** Backflush: auto-issue per BOM for a received quantity (capped at remaining planned). */
export function backflushLines(o: ProductionOrder, receivedQty: number): IssueLineInput[] {
  const lines: IssueLineInput[] = [];
  o.components.filter((c) => !c.isPhantom).forEach((c) => {
    const need = round(c.qtyPer * (1 + c.scrapPct / 100) * receivedQty, 3);
    const onFloor = round(c.issuedQty - c.returnedQty - c.consumedQty, 3);
    let qty = round(Math.max(0, need - onFloor), 3);
    const remainingPlanned = round(c.plannedQty * (1 + mfgSettings().overIssueTolerancePct / 100) - c.issuedQty + c.returnedQty, 3);
    qty = Math.min(qty, Math.max(0, remainingPlanned));
    if (qty <= 0) return;
    const whId = c.warehouseId ?? o.rmWarehouseId;
    if (c.tracking === 'Batch') {
      let left = qty;
      for (const b of batchesOnHand(c.itemId, whId)) {
        if (left <= 0) break;
        const take = round(Math.min(left, b.qty), 3);
        lines.push({ componentId: c.id, itemId: c.itemId, qty: take, batch: b.batch, warehouseId: whId });
        left = round(left - take, 3);
      }
      if (left > 0) lines.push({ componentId: c.id, itemId: c.itemId, qty: left, warehouseId: whId });
    } else if (c.tracking === 'Serial') {
      lines.push({ componentId: c.id, itemId: c.itemId, qty, serials: serialsOnHand(c.itemId, whId).slice(0, qty), warehouseId: whId });
    } else lines.push({ componentId: c.id, itemId: c.itemId, qty, warehouseId: whId });
  });
  return lines;
}

/** Reverse an issue (blocked once output has been received — FR-MFG-016). */
export function reverseIssue(issueId: string, reason: string): MaterialIssue {
  const i = db.find<MaterialIssue>(C.materialIssues, issueId);
  if (!i) throw new ValidationError('Issue not found', 'NOT_FOUND');
  if (i.status !== 'Posted') throw new ValidationError('Already reversed', 'INVALID_STATE');
  const o = get(i.orderId);
  if (i.type !== 'Return' && hasReceipts(o)) throw new ValidationError(`${o.number} has received output — return unused material instead of reversing the issue`, 'HAS_OUTPUT');
  if (!reason || reason.trim().length < 10) throw new ValidationError('A reversal reason is required', 'VALIDATION', 'reason');
  const date = today();
  engine.assertPostable(date);
  const c = engine.ctx();
  return db.transaction(() => {
    const number = engine.allocateNumber('Material Issue', { date, branchId: c.branchId });
    const revId = uid('mi');
    const moves = engine.reverseStockMovements(i.id, { date, reason, sourceType: 'Material Issue', sourceNumber: number });
    let journalId: string | undefined, journalNumber: string | undefined;
    if (i.journalId) { const rj = engine.reverseJournal(i.journalId, { reason }); journalId = rj.id; journalNumber = rj.number; }
    const sign = i.type === 'Return' ? -1 : 1;
    const rev = db.insert<MaterialIssue>(C.materialIssues, { id: revId, number, docType: 'Material Issue', date, branchId: c.branchId, orderId: o.id, orderNumber: o.number, type: i.type, lines: i.lines.map((l) => ({ ...l, id: uid('il'), qty: -l.qty, value: -l.value })), status: 'Posted', totalValue: -i.totalValue, journalId, journalNumber, movementIds: moves.map((m) => m.id), idempotencyKey: `${revId}:reversal`, reversalOfId: i.id, reversalReason: reason, postedAt: new Date().toISOString(), postedBy: c.userName, correlationId: i.correlationId });
    db.update<MaterialIssue>(C.materialIssues, i.id, { status: 'Reversed', reversedById: revId, reversalReason: reason });
    const components = o.components.map((cmp) => { const q = i.lines.filter((l) => (l.componentId ? l.componentId === cmp.id : l.itemId === cmp.itemId)).reduce((s, l) => s + l.qty, 0); if (!q) return cmp; return i.type === 'Return' ? { ...cmp, returnedQty: round(cmp.returnedQty - q, 3) } : { ...cmp, issuedQty: round(cmp.issuedQty - q, 3) }; });
    db.update<ProductionOrder>(C.productionOrders, o.id, { components, journalIds: journalId ? [...o.journalIds, journalId] : o.journalIds });
    if (journalId) wipEntry(o, { date, type: 'Reversal', amount: -sign * i.totalValue, journalId, journalNumber, sourceType: 'Material Issue', sourceId: revId, sourceNumber: number, description: `Reversal of ${i.number}: ${reason}` });
    engine.audit({ action: 'material_issue.reversed', objectType: 'Material Issue', objectId: i.id, objectNumber: i.number, detail: `Reversed by ${number}: ${reason}`, correlationId: i.correlationId });
    refreshCosts(o.id);
    return rev;
  });
}
