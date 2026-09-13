// BOM / routing / work-centre master actions (FR-MFG-002/003/004).
import { db, C, engine, ValidationError } from '../../store';
import type { Item } from '../../store';
import { addDays, today, uid } from '../../lib/format';
import type { Bom, BomByProduct, BomComponent, Routing, RoutingOperation, WorkCentre } from './types';
import { bomsFor, item, rollupBom } from './core';

export interface BomInput {
  itemId: string;
  effectiveFrom: string;
  effectiveTo?: string;
  mode: 'discrete' | 'process';
  outputQty: number;
  components: BomComponent[];
  byProducts: BomByProduct[];
  routingId?: string;
  notes?: string;
  status?: 'Draft' | 'Active';
}

function validateBom(input: BomInput) {
  const it = item(input.itemId);
  if (!it) throw new ValidationError('Choose the output item', 'VALIDATION', 'itemId');
  if (!(input.outputQty > 0)) throw new ValidationError('Output quantity must be positive', 'VALIDATION', 'outputQty');
  if (!input.components.length) throw new ValidationError('Add at least one component', 'VALIDATION', 'components');
  input.components.forEach((c) => {
    if (!c.itemId) throw new ValidationError('Every component needs an item', 'VALIDATION', 'components');
    if (c.itemId === input.itemId) throw new ValidationError('A BOM cannot contain its own output item', 'VALIDATION', 'components');
    if (!(c.qty > 0)) throw new ValidationError(`${c.itemName}: quantity must be positive`, 'VALIDATION', 'components');
    if (c.scrapPct < 0 || c.scrapPct > 100) throw new ValidationError(`${c.itemName}: scrap % must be 0–100`, 'VALIDATION', 'components');
  });
  if (input.effectiveTo && input.effectiveTo < input.effectiveFrom) throw new ValidationError('Effective-to must be after effective-from', 'VALIDATION', 'effectiveTo');
}

export function newComponent(itemId?: string): BomComponent {
  const it = item(itemId);
  return { id: uid('bc'), itemId: itemId ?? '', itemCode: it?.code ?? '', itemName: it?.name ?? '', qty: 1, uom: it?.baseUom ?? 'Nos', scrapPct: 0, substitutes: [], isPhantom: false };
}

export function newByProduct(itemId?: string): BomByProduct {
  const it = item(itemId);
  return { id: uid('bp'), itemId: itemId ?? '', itemName: it?.name ?? '', qty: 1, uom: it?.baseUom ?? 'Nos', costSharePct: 0 };
}

/** Create a new BOM (version 1 for the item, or next version when the item already has BOMs). */
export function createBom(input: BomInput): Bom {
  validateBom(input);
  const it = item(input.itemId)!;
  const existing = bomsFor(it.id);
  const code = existing[0]?.code ?? engine.allocateNumber('BOM');
  const version = existing.length ? Math.max(...existing.map((b) => b.version)) + 1 : 1;
  const status = input.status ?? 'Draft';
  const bom = db.insert<Bom>(C.boms, { code, itemId: it.id, itemCode: it.code, itemName: it.name, version, effectiveFrom: input.effectiveFrom, effectiveTo: input.effectiveTo, status: 'Draft', mode: input.mode, outputQty: input.outputQty, uom: it.baseUom, components: input.components, byProducts: input.byProducts, routingId: input.routingId, notes: input.notes });
  const rolled = db.update<Bom>(C.boms, bom.id, { stdCost: rollupBom(bom).perUnit, rolledUpAt: new Date().toISOString() });
  engine.audit({ action: 'bom.created', objectType: 'BOM', objectId: bom.id, objectNumber: `${code} v${version}`, detail: `${it.name} · ${input.components.length} component(s)` });
  return status === 'Active' ? activateBom(bom.id) : rolled;
}

/** Edit a Draft in place; editing an Active BOM creates a new effective-dated version and supersedes the old one. */
export function saveBom(id: string, input: BomInput): Bom {
  const bom = db.find<Bom>(C.boms, id);
  if (!bom) throw new ValidationError('BOM not found', 'NOT_FOUND');
  validateBom(input);
  if (bom.status === 'Draft') {
    const out = db.update<Bom>(C.boms, id, { effectiveFrom: input.effectiveFrom, effectiveTo: input.effectiveTo, mode: input.mode, outputQty: input.outputQty, components: input.components, byProducts: input.byProducts, routingId: input.routingId, notes: input.notes });
    const rolled = db.update<Bom>(C.boms, id, { stdCost: rollupBom(out).perUnit, rolledUpAt: new Date().toISOString() });
    engine.audit({ action: 'bom.updated', objectType: 'BOM', objectId: id, objectNumber: `${bom.code} v${bom.version}` });
    return input.status === 'Active' ? activateBom(id) : rolled;
  }
  if (bom.status === 'Superseded') throw new ValidationError('Superseded versions are read-only — edit the current version', 'INVALID_STATE');
  // Active → new version
  const from = input.effectiveFrom > bom.effectiveFrom ? input.effectiveFrom : today();
  const next = createBom({ ...input, effectiveFrom: from, status: 'Draft' });
  db.update<Bom>(C.boms, next.id, { supersedesId: bom.id, notes: input.notes ?? `Revision of v${bom.version}` });
  engine.audit({ action: 'bom.revised', objectType: 'BOM', objectId: next.id, objectNumber: `${bom.code} v${next.version}`, detail: `Revised from v${bom.version}; activate to supersede` });
  return input.status === 'Active' ? activateBom(next.id) : db.find<Bom>(C.boms, next.id)!;
}

/** Activate: supersedes any other active version of the same item (effective-to = day before). */
export function activateBom(id: string): Bom {
  const bom = db.find<Bom>(C.boms, id);
  if (!bom) throw new ValidationError('BOM not found', 'NOT_FOUND');
  if (bom.status === 'Active') return bom;
  return db.transaction(() => {
    bomsFor(bom.itemId).filter((b) => b.id !== id && b.status === 'Active').forEach((b) => {
      db.update<Bom>(C.boms, b.id, { status: 'Superseded', supersededById: id, effectiveTo: b.effectiveTo ?? addDays(bom.effectiveFrom, -1) });
      engine.audit({ action: 'bom.superseded', objectType: 'BOM', objectId: b.id, objectNumber: `${b.code} v${b.version}`, detail: `Superseded by v${bom.version}` });
    });
    const out = db.update<Bom>(C.boms, id, { status: 'Active', supersedesId: bom.supersedesId, stdCost: rollupBom(bom).perUnit, rolledUpAt: new Date().toISOString() });
    engine.audit({ action: 'bom.activated', objectType: 'BOM', objectId: id, objectNumber: `${bom.code} v${bom.version}`, detail: `Effective ${bom.effectiveFrom}` });
    return out;
  });
}

export function deleteDraftBom(id: string) {
  const bom = db.find<Bom>(C.boms, id);
  if (!bom) return;
  if (bom.status !== 'Draft') throw new ValidationError('Only Draft BOMs can be deleted', 'INVALID_STATE');
  if (db.count(C.productionOrders, (o: any) => o.bomId === id)) throw new ValidationError('BOM is referenced by production orders', 'IN_USE');
  db.remove(C.boms, id);
  engine.audit({ action: 'bom.deleted', objectType: 'BOM', objectId: id, objectNumber: `${bom.code} v${bom.version}` });
}

/** Write the roll-up to the item master standard cost. */
export function updateItemStandardCost(bomId: string): { item: Item; from?: number; to: number } {
  const bom = db.find<Bom>(C.boms, bomId);
  if (!bom) throw new ValidationError('BOM not found', 'NOT_FOUND');
  const it = item(bom.itemId)!;
  const to = rollupBom(bom).perUnit;
  const updated = db.update<Item>(C.items, it.id, { standardCost: to });
  db.update<Bom>(C.boms, bom.id, { stdCost: to, rolledUpAt: new Date().toISOString() });
  engine.audit({ action: 'item.standard_cost_updated', objectType: 'Item', objectId: it.id, objectNumber: it.code, detail: `${it.standardCost ?? '—'} → ${to} from ${bom.code} v${bom.version}` });
  return { item: updated, from: it.standardCost, to };
}

/** Where-used: BOMs (any status) that contain the item as a component or substitute. */
export function whereUsed(itemId: string): Bom[] {
  const cid = engine.ctx().companyId;
  return db.where<Bom>(C.boms, (b) => b.companyId === cid && b.components.some((c) => c.itemId === itemId || c.substitutes.includes(itemId)));
}

// ── Routings ───────────────────────────────────────────────────────────────

export function newOperation(seq: number, workCentreId?: string): RoutingOperation {
  const wc = db.find<WorkCentre>(C.workCentres, workCentreId);
  return { id: uid('rop'), seq, name: wc?.permittedOperations[0] ?? '', workCentreId: workCentreId ?? '', setupMin: 0, runMinPerUnit: 1, labourRate: wc?.costRateLabour ?? 0, machineRate: wc?.costRateMachine ?? 0, yieldPct: 100, parallel: false, subcontract: false };
}

export function saveRouting(input: Partial<Routing> & { name: string; operations: RoutingOperation[] }, id?: string): Routing {
  if (!input.name.trim()) throw new ValidationError('Routing name is required', 'VALIDATION', 'name');
  if (!input.operations.length) throw new ValidationError('Add at least one operation', 'VALIDATION', 'operations');
  input.operations.forEach((op) => {
    if (!op.name.trim()) throw new ValidationError(`Operation ${op.seq}: name is required`, 'VALIDATION', 'operations');
    if (!op.subcontract && !op.workCentreId) throw new ValidationError(`${op.name}: choose a work centre`, 'VALIDATION', 'operations');
    if (op.subcontract && (!op.supplierId || !op.serviceItemId)) throw new ValidationError(`${op.name}: subcontract operations need a supplier and service item`, 'VALIDATION', 'operations');
    if (op.yieldPct <= 0 || op.yieldPct > 100) throw new ValidationError(`${op.name}: yield must be 1–100%`, 'VALIDATION', 'operations');
  });
  const seqs = input.operations.map((o) => o.seq);
  if (new Set(seqs).size !== seqs.length) throw new ValidationError('Operation sequence numbers must be unique', 'VALIDATION', 'operations');
  const itemName = item(input.itemId)?.name;
  if (id) {
    const out = db.update<Routing>(C.routings, id, { ...input, itemName, operations: input.operations.slice().sort((a, b) => a.seq - b.seq) });
    engine.audit({ action: 'routing.updated', objectType: 'Routing', objectId: id, objectNumber: out.code });
    return out;
  }
  const code = input.code ?? `RT-${String(db.count(C.routings) + 1).padStart(3, '0')}`;
  const r = db.insert<Routing>(C.routings, { code, status: 'Active', ...input, itemName, operations: input.operations.slice().sort((a, b) => a.seq - b.seq) });
  engine.audit({ action: 'routing.created', objectType: 'Routing', objectId: r.id, objectNumber: code });
  return r;
}

// ── Work centres ───────────────────────────────────────────────────────────

export function saveWorkCentre(input: Omit<WorkCentre, keyof import('../../store').BaseRecord> & Partial<WorkCentre>, id?: string): WorkCentre {
  if (!input.name?.trim()) throw new ValidationError('Name is required', 'VALIDATION', 'name');
  if (!input.code?.trim()) throw new ValidationError('Code is required', 'VALIDATION', 'code');
  if (!(input.capacityHrsPerDay > 0)) throw new ValidationError('Capacity per day must be positive', 'VALIDATION', 'capacityHrsPerDay');
  if (!input.workingDays.length) throw new ValidationError('Pick at least one working day', 'VALIDATION', 'workingDays');
  if (!input.warehouseId) throw new ValidationError('Choose the WIP warehouse', 'VALIDATION', 'warehouseId');
  const dup = db.findBy<WorkCentre>(C.workCentres, (w) => w.code === input.code && w.id !== id);
  if (dup) throw new ValidationError(`Code ${input.code} is already used by ${dup.name}`, 'DUPLICATE', 'code');
  if (id) {
    const out = db.update<WorkCentre>(C.workCentres, id, input);
    engine.audit({ action: 'work_centre.updated', objectType: 'Work Centre', objectId: id, objectNumber: out.code });
    return out;
  }
  const w = db.insert<WorkCentre>(C.workCentres, input);
  engine.audit({ action: 'work_centre.created', objectType: 'Work Centre', objectId: w.id, objectNumber: w.code });
  return w;
}
