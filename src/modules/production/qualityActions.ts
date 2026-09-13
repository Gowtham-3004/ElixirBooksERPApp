// Quality inspections: plans, creation from GRN / operation / receipt, results and disposition (FR-MFG-013).
import { db, C, engine, ValidationError } from '../../store';
import { correlationId, round, today, uid } from '../../lib/format';
import type { Disposition, InspectionPlan, InspectionResult, InspectionType, ProductionOrder, ProductionReceipt, QualityInspection } from './types';
import { inventoryAccountOf, item, mfgSettings } from './core';
import { addReworkOperation } from './actions';
import { resolveHeldReceipt } from './receiptActions';

export function planFor(type: InspectionType, itemId?: string): InspectionPlan | undefined {
  const cid = engine.ctx().companyId;
  const all = db.where<InspectionPlan>(C.inspectionPlans, (p) => p.companyId === cid && p.status === 'Active' && p.type === type);
  return all.find((p) => p.itemId === itemId) ?? all.find((p) => !p.itemId);
}

export interface NewInspectionInput {
  type: InspectionType;
  itemId: string;
  refType: QualityInspection['refType'];
  refId: string;
  refNumber: string;
  refLineId?: string;
  operationId?: string;
  operationName?: string;
  lotQty: number;
  sampleQty?: number;
  batch?: string;
  serials?: string[];
  planId?: string;
  date?: string;
  notes?: string;
}

export function createInspection(input: NewInspectionInput): QualityInspection {
  const it = item(input.itemId);
  if (!it) throw new ValidationError('Item not found', 'NOT_FOUND', 'itemId');
  const dup = db.findBy<QualityInspection>(C.qualityInspections, (q) => q.refType === input.refType && q.refId === input.refId && (q.refLineId ?? '') === (input.refLineId ?? '') && (q.operationId ?? '') === (input.operationId ?? '') && q.status !== 'Cancelled' && q.status !== 'Completed');
  if (dup) throw new ValidationError(`${dup.number} is already open for ${input.refNumber}`, 'DUPLICATE');
  const plan = input.planId ? db.find<InspectionPlan>(C.inspectionPlans, input.planId) : planFor(input.type, it.id);
  const c = engine.ctx();
  const date = input.date ?? today();
  const number = engine.allocateNumber('Quality Inspection', { date, branchId: c.branchId });
  const sample = input.sampleQty ?? Math.max(1, Math.ceil((input.lotQty * (plan?.samplePct ?? 10)) / 100));
  const q = db.insert<QualityInspection>(C.qualityInspections, {
    number, docType: 'Quality Inspection', date, branchId: c.branchId, type: input.type, planId: plan?.id, planName: plan?.name, itemId: it.id, itemCode: it.code, itemName: it.name,
    refType: input.refType, refId: input.refId, refNumber: input.refNumber, refLineId: input.refLineId, operationId: input.operationId, operationName: input.operationName,
    lotQty: input.lotQty, sampleQty: Math.min(sample, input.lotQty || sample), batch: input.batch, serials: input.serials,
    results: (plan?.checks ?? []).map<InspectionResult>((ch) => ({ checkId: ch.id, check: ch.name, spec: ch.spec + (ch.unit ? ` ${ch.unit}` : ''), pass: null })),
    acceptedQty: 0, rejectedQty: 0, heldQty: input.lotQty, status: 'Open', notes: input.notes, correlationId: correlationId(),
  });
  engine.audit({ action: 'inspection.created', objectType: 'Quality Inspection', objectId: q.id, objectNumber: number, detail: `${input.type} · ${it.name} · ${input.refType} ${input.refNumber}`, correlationId: q.correlationId });
  return q;
}

export function saveResults(id: string, patch: { results?: InspectionResult[]; sampleQty?: number; inspectorName?: string; notes?: string }) {
  const q = db.find<QualityInspection>(C.qualityInspections, id);
  if (!q) throw new ValidationError('Inspection not found', 'NOT_FOUND');
  if (q.status === 'Completed' || q.status === 'Cancelled') throw new ValidationError(`Inspection is ${q.status}`, 'INVALID_STATE');
  return db.update<QualityInspection>(C.qualityInspections, id, { ...patch, status: 'In Progress' });
}

export interface CompleteInput { acceptedQty: number; rejectedQty: number; heldQty?: number; disposition: Disposition; inspectorName?: string; notes?: string; results?: InspectionResult[]; reworkWorkCentreId?: string }

/** Complete with a disposition; applies the downstream effect (release held receipt, scrap, rework op). */
export function completeInspection(id: string, input: CompleteInput): QualityInspection {
  const q0 = db.find<QualityInspection>(C.qualityInspections, id);
  if (!q0) throw new ValidationError('Inspection not found', 'NOT_FOUND');
  if (q0.status === 'Completed') throw new ValidationError('Already completed', 'INVALID_STATE');
  const q = { ...q0, ...(input.results ? { results: input.results } : {}) };
  const accepted = round(input.acceptedQty, 3), rejected = round(input.rejectedQty, 3);
  const held = round(input.heldQty ?? Math.max(0, q.lotQty - accepted - rejected), 3);
  if (accepted < 0 || rejected < 0) throw new ValidationError('Quantities cannot be negative', 'VALIDATION');
  if (accepted + rejected + held > q.lotQty + 0.0005) throw new ValidationError(`Accepted + rejected + held exceeds lot qty ${q.lotQty}`, 'VALIDATION', 'acceptedQty');
  if (q.results.some((r) => r.pass === null) && input.disposition !== 'Hold') throw new ValidationError('Record a result for every check before completing', 'INCOMPLETE');
  const failed = q.results.filter((r) => r.pass === false).length;
  const outcome: QualityInspection['outcome'] = failed === 0 ? 'Pass' : failed === q.results.length ? 'Fail' : 'Partial';
  const c = engine.ctx();
  return db.transaction(() => {
    const finalStatus: QualityInspection['status'] = input.disposition === 'Hold' ? 'In Progress' : 'Completed';
    const out = db.update<QualityInspection>(C.qualityInspections, id, { results: q.results, acceptedQty: accepted, rejectedQty: rejected, heldQty: held, disposition: input.disposition, outcome, status: finalStatus, inspectorName: input.inspectorName ?? q.inspectorName ?? c.userName, notes: input.notes ?? q.notes, completedAt: finalStatus === 'Completed' ? new Date().toISOString() : undefined, completedBy: finalStatus === 'Completed' ? c.userName : undefined });
    if (finalStatus === 'Completed') applyDisposition(out, input);
    engine.audit({ action: finalStatus === 'Completed' ? 'inspection.completed' : 'inspection.held', objectType: 'Quality Inspection', objectId: id, objectNumber: q.number, detail: `${input.disposition} · accepted ${accepted} · rejected ${rejected} · held ${held} · ${outcome}`, correlationId: q.correlationId });
    return db.find<QualityInspection>(C.qualityInspections, id)!;
  });
}

function applyDisposition(q: QualityInspection, input: CompleteInput) {
  if (q.refType === 'Production Receipt') {
    const r = db.find<ProductionReceipt>(C.productionReceipts, q.refId);
    if (!r || r.status !== 'Hold') return;
    if (input.disposition === 'Rework') {
      const o = db.find<ProductionOrder>(C.productionOrders, r.orderId);
      if (o) addReworkOperation(o.id, `Rework after ${q.number}`, input.reworkWorkCentreId ?? o.operations[0]?.workCentreId ?? '', input.notes ?? 'QC rework');
      db.update<ProductionReceipt>(C.productionReceipts, r.id, { notes: [r.notes, `Rework requested by ${q.number} — re-inspect before release`].filter(Boolean).join(' · ') });
      engine.notify({ type: 'system', title: `${r.number} sent for rework`, body: `${q.number}: ${input.notes ?? ''}`, link: `production/orders/${r.orderId}?tab=operations` });
      return;
    }
    resolveHeldReceipt(r.id, { acceptedQty: input.disposition === 'Accept' ? q.acceptedQty : 0, rejectedQty: input.disposition === 'Accept' ? q.rejectedQty : r.qty, reason: `QC ${q.number}: ${input.disposition}${input.notes ? ' — ' + input.notes : ''}`, inspection: q });
    return;
  }
  if (q.refType === 'Production Order' && input.disposition === 'Rework') {
    const o = db.find<ProductionOrder>(C.productionOrders, q.refId);
    if (o) addReworkOperation(o.id, `Rework · ${q.operationName ?? q.number}`, input.reworkWorkCentreId ?? o.operations[0]?.workCentreId ?? '', input.notes ?? 'In-process rework');
    return;
  }
  if (q.refType === 'GRN' && (input.disposition === 'Scrap' || input.disposition === 'Reject') && q.rejectedQty > 0) {
    // move rejected stock from the GRN warehouse to the scrap yard through the shared engine
    const grn = db.find<any>(C.grns, q.refId);
    const line = (grn?.lines ?? []).find((l: any) => l.id === q.refLineId) ?? (grn?.lines ?? []).find((l: any) => l.itemId === q.itemId);
    const fromWh = line?.warehouseId ?? grn?.warehouseId;
    if (!fromWh) return;
    const s = mfgSettings();
    const date = today();
    try {
      engine.assertPostable(date);
      const out = engine.moveStock({ date, itemId: q.itemId, warehouseId: fromWh, qty: -q.rejectedQty, type: 'Scrap', sourceType: 'Quality Inspection', sourceId: q.id, sourceNumber: q.number, batch: line?.batch ?? q.batch, serials: q.serials?.slice(0, q.rejectedQty) });
      engine.moveStock({ date, itemId: q.itemId, warehouseId: s.scrapWarehouseId, qty: q.rejectedQty, rate: 0, type: 'Scrap', sourceType: 'Quality Inspection', sourceId: q.id, sourceNumber: q.number, batch: line?.batch ?? q.batch });
      if (out.value > 0) engine.postJournal({ date, sourceType: 'Quality Inspection', sourceId: q.id, sourceNumber: q.number, idempotencyKey: `${q.id}:scrap`, narration: `Incoming QC rejection scrapped · ${q.refNumber} · ${q.itemName} × ${q.rejectedQty}`, lines: [{ accountId: 'acc_5700', dr: out.value }, { accountId: inventoryAccountOf(item(q.itemId)), cr: out.value }] });
    } catch (e: any) {
      engine.audit({ action: 'inspection.scrap_failed', objectType: 'Quality Inspection', objectId: q.id, objectNumber: q.number, result: 'Failure', detail: e?.message });
    }
  }
}

export function cancelInspection(id: string, reason: string) {
  const q = db.find<QualityInspection>(C.qualityInspections, id);
  if (!q) throw new ValidationError('Inspection not found', 'NOT_FOUND');
  if (q.status === 'Completed') throw new ValidationError('Completed inspections cannot be cancelled', 'INVALID_STATE');
  if (!reason || reason.trim().length < 10) throw new ValidationError('A reason is required', 'VALIDATION', 'reason');
  db.update<QualityInspection>(C.qualityInspections, id, { status: 'Cancelled', notes: [q.notes, `Cancelled: ${reason}`].filter(Boolean).join(' · ') });
  engine.audit({ action: 'inspection.cancelled', objectType: 'Quality Inspection', objectId: id, objectNumber: q.number, detail: reason, correlationId: q.correlationId });
}

export function savePlan(input: Partial<InspectionPlan> & { name: string; type: InspectionType }, id?: string): InspectionPlan {
  if (!input.name.trim()) throw new ValidationError('Plan name is required', 'VALIDATION', 'name');
  if (!(input.checks?.length)) throw new ValidationError('Add at least one check', 'VALIDATION', 'checks');
  if (id) {
    const out = db.update<InspectionPlan>(C.inspectionPlans, id, { ...input });
    engine.audit({ action: 'inspection_plan.updated', objectType: 'Inspection Plan', objectId: id, objectNumber: out.code });
    return out;
  }
  const code = input.code ?? `QP-${String(db.count(C.inspectionPlans) + 1).padStart(3, '0')}`;
  const p = db.insert<InspectionPlan>(C.inspectionPlans, { code, samplePct: 10, status: 'Active', ...input, id: uid('qp'), itemName: item(input.itemId)?.name });
  engine.audit({ action: 'inspection_plan.created', objectType: 'Inspection Plan', objectId: p.id, objectNumber: code });
  return p;
}

/** First-pass yield and top failing checks for the QC stats panel. */
export function qcStats(rows: QualityInspection[]) {
  const done = rows.filter((q) => q.status === 'Completed');
  const pass = done.filter((q) => q.outcome === 'Pass').length;
  const fails = new Map<string, number>();
  done.forEach((q) => q.results.filter((r) => r.pass === false).forEach((r) => fails.set(r.check, (fails.get(r.check) ?? 0) + 1)));
  const byType = (['Incoming', 'In-process', 'Finished goods'] as InspectionType[]).map((t) => { const d = done.filter((q) => q.type === t); return { type: t, count: d.length, fpy: d.length ? round((d.filter((q) => q.outcome === 'Pass').length / d.length) * 100, 1) : 0 }; });
  return { completed: done.length, fpy: done.length ? round((pass / done.length) * 100, 1) : 0, topFailures: Array.from(fails.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5), byType, open: rows.filter((q) => q.status === 'Open' || q.status === 'In Progress').length, rejectedQty: round(done.reduce((s, q) => s + q.rejectedQty, 0), 3) };
}
