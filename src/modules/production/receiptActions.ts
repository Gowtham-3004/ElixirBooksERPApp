// Production receipts: output, by-products, scrap, QC hold, reversal (FR-MFG-009/010/016).
import { db, C, engine, ValidationError } from '../../store';
import type { StockMovement } from '../../store';
import { round, today, uid } from '../../lib/format';
import type { Bom, ProductionOrder, ProductionReceipt, QualityInspection } from './types';
import { byProductValue, downstreamMovements, inventoryAccountOf, item, nextLotNumber, nextSerials, receiptUnitCost, refreshCosts, wipBatchesForOrder, wipEntry } from './core';
import { deriveStatusAfterOutput, get } from './actions';
import { backflushLines, postIssue } from './issueActions';
import { createInspection } from './qualityActions';

export interface ReceiptInput {
  qty: number;
  batch?: string;
  serials?: string[];
  warehouseId?: string;
  byProducts?: { itemId: string; qty: number }[];
  scrapQty?: number;
  scrapReason?: string;
  qcRequired?: boolean;
  backflush?: boolean;
  date?: string;
  notes?: string;
}

export function remainingQty(o: ProductionOrder): number {
  const held = db.where<ProductionReceipt>(C.productionReceipts, (r) => r.orderId === o.id && r.status === 'Hold').reduce((s, r) => s + r.qty + r.scrapQty, 0);
  return round(o.qty - o.receivedQty - o.scrapQty - held, 3);
}

/** Record output. With QC required the receipt goes on Hold and an FG inspection is created. */
export function postReceipt(orderId: string, input: ReceiptInput): ProductionReceipt {
  const o = get(orderId);
  if (!['Released', 'In Progress', 'Partially Completed'].includes(o.status)) throw new ValidationError(`Output can only be recorded on a Released / In Progress order (is ${o.status})`, 'INVALID_STATE');
  const qty = round(input.qty ?? 0, 3);
  const scrapQty = round(input.scrapQty ?? 0, 3);
  if (qty <= 0 && scrapQty <= 0) throw new ValidationError('Enter a good quantity and/or scrap quantity', 'VALIDATION', 'qty');
  if (qty + scrapQty > remainingQty(o) + 0.0005) throw new ValidationError(`Only ${remainingQty(o)} ${o.uom} remain to be received on ${o.number}`, 'OVER_RECEIPT', 'qty');
  if (scrapQty > 0 && !input.scrapReason) throw new ValidationError('Scrap needs a reason code', 'VALIDATION', 'scrapReason');
  const date = input.date ?? today();
  engine.assertPostable(date);
  const batch = o.tracking === 'Batch' ? (input.batch || nextLotNumber(o)) : undefined;
  const serials = o.tracking === 'Serial' ? (input.serials?.length ? input.serials : nextSerials(o, qty + scrapQty)) : undefined;
  if (o.tracking === 'Serial' && (serials?.length ?? 0) !== qty + scrapQty) throw new ValidationError(`${qty + scrapQty} serial number(s) required`, 'SERIAL_REQUIRED', 'serials');
  if (serials?.length && new Set(serials).size !== serials.length) throw new ValidationError('Serial numbers must be unique', 'SERIAL_DUP', 'serials');
  const c = engine.ctx();
  return db.transaction(() => {
    const id = uid('prc');
    const number = engine.allocateNumber('Production Receipt', { date, branchId: c.branchId });
    let backflushIssueId: string | undefined;
    if (input.backflush) {
      const lines = backflushLines(o, qty + scrapQty);
      if (lines.length) backflushIssueId = postIssue(o.id, lines, { type: 'Backflush', date, receiptId: id, stamp: id }).id;
    }
    const fresh = get(o.id);
    const uc = receiptUnitCost(fresh, qty, scrapQty);
    const bom = db.find<Bom>(C.boms, o.bomId);
    const byProducts = (input.byProducts ?? []).filter((b) => b.qty > 0).map((b) => { const it = item(b.itemId)!; const bp = bom?.byProducts.find((x) => x.itemId === b.itemId); return { itemId: it.id, itemName: it.name, qty: b.qty, uom: it.baseUom, value: byProductValue(it.id, b.qty, bp?.costSharePct ?? 0, round(fresh.costs.materialActual * ((qty + scrapQty) / (o.qty || 1)))) }; });
    const receipt = db.insert<ProductionReceipt>(C.productionReceipts, {
      id, number, docType: 'Production Receipt', date, branchId: c.branchId, orderId: o.id, orderNumber: o.number, itemId: o.itemId, itemCode: o.itemCode, itemName: o.itemName, qty, uom: o.uom, batch, serials,
      warehouseId: input.warehouseId ?? o.warehouseId, byProducts, scrapQty, scrapReason: input.scrapReason, scrapValue: round(uc.unitCost * scrapQty), qcRequired: !!input.qcRequired, status: input.qcRequired ? 'Hold' : 'Posted',
      unitCost: uc.unitCost, costBasis: uc.basis, value: round(uc.unitCost * qty), backflush: !!input.backflush, backflushIssueId, movementIds: [], notes: input.notes, correlationId: o.correlationId, idempotencyKey: `${id}:post`,
    });
    if (input.qcRequired) {
      const insp = createInspection({ type: 'Finished goods', itemId: o.itemId, refType: 'Production Receipt', refId: id, refNumber: number, lotQty: qty, batch, serials, date, notes: `FG inspection for ${o.number} · ${number}` });
      db.update<ProductionReceipt>(C.productionReceipts, id, { inspectionId: insp.id, inspectionNumber: insp.number });
      engine.audit({ action: 'production_receipt.held', objectType: 'Production Receipt', objectId: id, objectNumber: number, detail: `${o.number} · ${qty} ${o.uom} on QC hold · ${insp.number}`, correlationId: o.correlationId });
      engine.notify({ type: 'system', title: `${number} awaits QC`, body: `${o.itemName} × ${qty} · ${insp.number}`, link: `production/quality/${insp.id}` });
      refreshCosts(o.id);
      return db.find<ProductionReceipt>(C.productionReceipts, id)!;
    }
    return postReceiptStock(id);
  });
}

/** Physical + financial posting of a (non-held or QC-accepted) receipt. */
export function postReceiptStock(receiptId: string): ProductionReceipt {
  const r = db.find<ProductionReceipt>(C.productionReceipts, receiptId);
  if (!r) throw new ValidationError('Receipt not found', 'NOT_FOUND');
  const o = get(r.orderId);
  const date = r.date;
  return db.transaction(() => {
    const movementIds: string[] = [];
    const total = round(r.qty + r.scrapQty, 3);
    // consume floor stock from WIP proportionally (FIFO by batch)
    const components = o.components.map((cmp) => {
      if (cmp.isPhantom) return cmp;
      const onFloor = round(cmp.issuedQty - cmp.returnedQty - cmp.consumedQty, 3);
      const need = round(cmp.qtyPer * (1 + cmp.scrapPct / 100) * total, 3);
      let left = round(Math.min(onFloor, need), 3);
      if (left <= 0) return cmp;
      const consumed = left;
      for (const b of wipBatchesForOrder(o, cmp.itemId)) {
        if (left <= 0) break;
        const take = round(Math.min(left, b.qty), 3);
        const m = engine.moveStock({ date, itemId: cmp.itemId, warehouseId: o.wipWarehouseId, qty: -take, rate: b.rate, type: 'Production Receipt', sourceType: 'Production Receipt', sourceId: r.id, sourceNumber: r.number, batch: b.batch, serials: cmp.tracking === 'Serial' ? b.serials.slice(0, take) : undefined, allowNegative: true });
        movementIds.push(m.id);
        left = round(left - take, 3);
      }
      return { ...cmp, consumedQty: round(cmp.consumedQty + consumed, 3) };
    });
    const fgItem = item(o.itemId)!;
    const glLines: { accountId: string; dr?: number; cr?: number }[] = [];
    const goodSerials = r.serials?.slice(0, r.qty);
    const scrapSerials = r.serials?.slice(r.qty);
    if (r.qty > 0) {
      const m = engine.moveStock({ date, itemId: o.itemId, warehouseId: r.warehouseId, qty: r.qty, rate: r.unitCost, type: 'Production Receipt', sourceType: 'Production Receipt', sourceId: r.id, sourceNumber: r.number, batch: r.batch, serials: goodSerials });
      movementIds.push(m.id);
      glLines.push({ accountId: inventoryAccountOf(fgItem), dr: r.value });
    }
    r.byProducts.forEach((b) => {
      const m = engine.moveStock({ date, itemId: b.itemId, warehouseId: r.warehouseId, qty: b.qty, rate: b.qty ? round(b.value / b.qty) : 0, type: 'Production Receipt', sourceType: 'Production Receipt', sourceId: r.id, sourceNumber: r.number });
      movementIds.push(m.id);
      if (b.value > 0) glLines.push({ accountId: inventoryAccountOf(item(b.itemId)), dr: b.value });
    });
    let journalId: string | undefined, journalNumber: string | undefined, scrapJournalId: string | undefined;
    const outValue = round(r.value + r.byProducts.reduce((s, b) => s + b.value, 0));
    if (outValue > 0) {
      const j = engine.postJournal({ date, sourceType: 'Production Receipt', sourceId: r.id, sourceNumber: r.number, idempotencyKey: `${r.id}:post`, narration: `Production receipt ${r.number} · ${o.number} · ${o.itemName} × ${r.qty} @ ${r.unitCost} (${r.costBasis})`, lines: [...glLines, { accountId: 'acc_1220', cr: outValue }] });
      journalId = j.id; journalNumber = j.number;
      if (r.value > 0) wipEntry(o, { date, type: 'Output', amount: -r.value, journalId, journalNumber, sourceType: 'Production Receipt', sourceId: r.id, sourceNumber: r.number, description: `${r.qty} ${o.uom} @ ${r.unitCost}` });
      r.byProducts.forEach((b) => b.value > 0 && wipEntry(o, { date, type: 'By-product', amount: -b.value, journalId, journalNumber, sourceType: 'Production Receipt', sourceId: r.id, sourceNumber: r.number, description: `${b.itemName} × ${b.qty}` }));
    }
    if (r.scrapQty > 0) {
      const m = engine.moveStock({ date, itemId: o.itemId, warehouseId: o.scrapWarehouseId, qty: r.scrapQty, rate: 0, type: 'Scrap', sourceType: 'Production Receipt', sourceId: r.id, sourceNumber: r.number, batch: r.batch, serials: scrapSerials });
      movementIds.push(m.id);
      if (r.scrapValue > 0) {
        const sj = engine.postJournal({ date, sourceType: 'Production Receipt', sourceId: r.id, sourceNumber: r.number, idempotencyKey: `${r.id}:scrap`, narration: `Scrap ${r.scrapQty} ${o.uom} on ${o.number} · ${r.scrapReason}`, lines: [{ accountId: 'acc_5700', dr: r.scrapValue }, { accountId: 'acc_1220', cr: r.scrapValue }] });
        scrapJournalId = sj.id;
        wipEntry(o, { date, type: 'Scrap', amount: -r.scrapValue, journalId: sj.id, journalNumber: sj.number, sourceType: 'Production Receipt', sourceId: r.id, sourceNumber: r.number, description: `${r.scrapQty} ${o.uom} · ${r.scrapReason}` });
      }
    }
    movementIds.forEach((mid) => db.patchSilent<StockMovement>(C.stockMovements, mid, { journalId }));
    const c = engine.ctx();
    const posted = db.update<ProductionReceipt>(C.productionReceipts, r.id, { status: 'Posted', journalId, journalNumber, scrapJournalId, movementIds, postedAt: new Date().toISOString(), postedBy: c.userName });
    const byProductsReceived = [...o.byProductsReceived];
    r.byProducts.forEach((b) => { const e = byProductsReceived.find((x) => x.itemId === b.itemId); if (e) { e.qty = round(e.qty + b.qty, 3); e.value = round(e.value + b.value); } else byProductsReceived.push({ itemId: b.itemId, itemName: b.itemName, qty: b.qty, value: b.value }); });
    const updated: Partial<ProductionOrder> = { components, receivedQty: round(o.receivedQty + r.qty, 3), scrapQty: round(o.scrapQty + r.scrapQty, 3), byProductsReceived, journalIds: [...o.journalIds, ...([journalId, scrapJournalId].filter(Boolean) as string[])], actualStart: o.actualStart ?? date };
    const tmp = { ...o, ...updated } as ProductionOrder;
    updated.status = deriveStatusAfterOutput(tmp);
    if (updated.status === 'Completed') { updated.actualEnd = date; updated.completedAt = new Date().toISOString(); }
    db.update<ProductionOrder>(C.productionOrders, o.id, updated);
    engine.audit({ action: 'production_receipt.posted', objectType: 'Production Receipt', objectId: r.id, objectNumber: r.number, detail: `${o.number} · ${r.qty} ${o.uom} @ ${r.unitCost}${r.scrapQty ? ` · scrap ${r.scrapQty}` : ''}${r.batch ? ` · ${r.batch}` : ''}`, correlationId: o.correlationId });
    refreshCosts(o.id);
    return posted;
  });
}

/** QC outcome on a held receipt: accepted qty posts, rejected qty becomes scrap. */
export function resolveHeldReceipt(receiptId: string, outcome: { acceptedQty: number; rejectedQty: number; reason?: string; inspection?: QualityInspection }): ProductionReceipt {
  const r = db.find<ProductionReceipt>(C.productionReceipts, receiptId);
  if (!r) throw new ValidationError('Receipt not found', 'NOT_FOUND');
  if (r.status !== 'Hold') throw new ValidationError(`Receipt is ${r.status}, not on hold`, 'INVALID_STATE');
  const accepted = round(outcome.acceptedQty, 3);
  const rejected = round(outcome.rejectedQty, 3);
  if (accepted + rejected > r.qty + 0.0005) throw new ValidationError(`Accepted + rejected exceeds the held quantity ${r.qty}`, 'VALIDATION');
  const o = get(r.orderId);
  const uc = receiptUnitCost(o, accepted, r.scrapQty + rejected);
  return db.transaction(() => {
    db.update<ProductionReceipt>(C.productionReceipts, r.id, { qty: accepted, scrapQty: round(r.scrapQty + rejected, 3), scrapReason: rejected > 0 ? (outcome.reason ?? r.scrapReason ?? 'QC rejection') : r.scrapReason, unitCost: uc.unitCost, costBasis: uc.basis, value: round(uc.unitCost * accepted), scrapValue: round(uc.unitCost * (r.scrapQty + rejected)), notes: [r.notes, outcome.inspection ? `QC ${outcome.inspection.number}: ${outcome.inspection.disposition ?? ''}` : ''].filter(Boolean).join(' · ') });
    if (accepted + rejected + r.scrapQty <= 0) {
      const rej = db.update<ProductionReceipt>(C.productionReceipts, r.id, { status: 'Rejected', postedAt: new Date().toISOString(), postedBy: engine.ctx().userName });
      engine.audit({ action: 'production_receipt.rejected', objectType: 'Production Receipt', objectId: r.id, objectNumber: r.number, detail: outcome.reason, correlationId: o.correlationId });
      return rej;
    }
    const posted = postReceiptStock(r.id);
    engine.audit({ action: 'production_receipt.released', objectType: 'Production Receipt', objectId: r.id, objectNumber: r.number, detail: `QC hold released · accepted ${accepted} · rejected ${rejected}`, correlationId: o.correlationId });
    return posted;
  });
}

/** Reversal blocked when the output batch/serial has moved on (sold / consumed / transferred). */
export function receiptReversalCheck(r: ProductionReceipt): { ok: boolean; reason?: string } {
  if (r.status !== 'Posted') return { ok: false, reason: `Receipt is ${r.status}` };
  const later = downstreamMovements(r.itemId, { batch: r.batch, serials: r.serials, excludeSourceId: r.id, after: r.date }).filter((m) => m.sourceType !== 'Production Receipt' || db.find<ProductionReceipt>(C.productionReceipts, m.sourceId)?.orderId !== r.orderId);
  if (later.length) return { ok: false, reason: `${r.batch ?? 'Serials'} already moved: ${Array.from(new Set(later.map((m) => `${m.sourceType} ${m.sourceNumber}`))).slice(0, 3).join(', ')}` };
  const o = get(r.orderId);
  if (o.status === 'Closed') return { ok: false, reason: 'Order is closed — reopen it first' };
  return { ok: true };
}

export function reverseReceipt(receiptId: string, reason: string): ProductionReceipt {
  const r = db.find<ProductionReceipt>(C.productionReceipts, receiptId);
  if (!r) throw new ValidationError('Receipt not found', 'NOT_FOUND');
  const chk = receiptReversalCheck(r);
  if (!chk.ok) throw new ValidationError(chk.reason ?? 'Cannot reverse', 'BLOCKED');
  if (!reason || reason.trim().length < 10) throw new ValidationError('A reversal reason is required', 'VALIDATION', 'reason');
  const o = get(r.orderId);
  const date = today();
  engine.assertPostable(date);
  const c = engine.ctx();
  return db.transaction(() => {
    const number = engine.allocateNumber('Production Receipt', { date, branchId: c.branchId });
    const moves = engine.reverseStockMovements(r.id, { date, reason, sourceType: 'Production Receipt', sourceNumber: number });
    const journalIds: string[] = [];
    let journalId: string | undefined, journalNumber: string | undefined;
    if (r.journalId) { const rj = engine.reverseJournal(r.journalId, { reason }); journalId = rj.id; journalNumber = rj.number; journalIds.push(rj.id); }
    let scrapJournalId: string | undefined;
    if (r.scrapJournalId) { const sj = engine.reverseJournal(r.scrapJournalId, { reason }); scrapJournalId = sj.id; journalIds.push(sj.id); }
    const revId = uid('prc');
    const rev = db.insert<ProductionReceipt>(C.productionReceipts, { ...r, id: revId, number, date, qty: -r.qty, scrapQty: -r.scrapQty, value: -r.value, scrapValue: -r.scrapValue, byProducts: r.byProducts.map((b) => ({ ...b, qty: -b.qty, value: -b.value })), status: 'Posted', journalId, journalNumber, scrapJournalId, movementIds: moves.map((m) => m.id), reversalOfId: r.id, reversalReason: reason, reversedById: undefined, inspectionId: undefined, inspectionNumber: undefined, qcRequired: false, postedAt: new Date().toISOString(), postedBy: c.userName, idempotencyKey: `${revId}:reversal`, createdAt: undefined, updatedAt: undefined, version: undefined } as any);
    db.update<ProductionReceipt>(C.productionReceipts, r.id, { status: 'Reversed', reversedById: revId, reversalReason: reason });
    // restore consumed floor quantities
    const total = r.qty + r.scrapQty;
    const components = o.components.map((cmp) => { if (cmp.isPhantom) return cmp; const consumedMoves = moves.filter((m) => m.itemId === cmp.itemId && m.warehouseId === o.wipWarehouseId); const q = consumedMoves.reduce((s, m) => s + m.baseQty, 0); return q ? { ...cmp, consumedQty: round(Math.max(0, cmp.consumedQty - q), 3) } : cmp; });
    const byProductsReceived = o.byProductsReceived.map((b) => { const x = r.byProducts.find((y) => y.itemId === b.itemId); return x ? { ...b, qty: round(b.qty - x.qty, 3), value: round(b.value - x.value) } : b; });
    const updated: Partial<ProductionOrder> = { components, receivedQty: round(o.receivedQty - r.qty, 3), scrapQty: round(o.scrapQty - r.scrapQty, 3), byProductsReceived, journalIds: [...o.journalIds, ...journalIds] };
    const tmp = { ...o, ...updated } as ProductionOrder;
    updated.status = tmp.receivedQty > 0 ? 'Partially Completed' : 'In Progress';
    updated.completedAt = undefined; updated.actualEnd = undefined;
    db.update<ProductionOrder>(C.productionOrders, o.id, updated);
    if (r.value > 0) wipEntry(o, { date, type: 'Reversal', amount: r.value, journalId, journalNumber, sourceType: 'Production Receipt', sourceId: revId, sourceNumber: number, description: `Reversal of ${r.number} output: ${reason}` });
    r.byProducts.forEach((b) => b.value > 0 && wipEntry(o, { date, type: 'Reversal', amount: b.value, journalId, journalNumber, sourceType: 'Production Receipt', sourceId: revId, sourceNumber: number, description: `Reversal of by-product ${b.itemName}` }));
    if (r.scrapValue > 0) wipEntry(o, { date, type: 'Reversal', amount: r.scrapValue, journalId: scrapJournalId, sourceType: 'Production Receipt', sourceId: revId, sourceNumber: number, description: `Reversal of scrap on ${r.number}` });
    engine.audit({ action: 'production_receipt.reversed', objectType: 'Production Receipt', objectId: r.id, objectNumber: r.number, detail: `Reversed by ${number}: ${reason} · ${total} ${o.uom}`, correlationId: o.correlationId });
    refreshCosts(o.id);
    return rev;
  });
}
