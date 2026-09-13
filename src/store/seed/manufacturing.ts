// Seed data for the manufacturing module (FR-MFG-001..016): BOMs, routings, work
// centres, production orders across every status, material issues, receipts,
// scrap, inspections, subcontract orders, one MRP run, WIP ledger and the
// balanced journals + stock movements behind each posting. Owned by production.
import type { DB } from '../db';
import type { Account, Item, Journal, OpenItem, StockMovement, StockMoveType, Supplier, Warehouse } from '../types';
import type { Bom, BomComponent, InspectionPlan, MaterialIssue, MrpRun, OrderComponent, OrderOperation, ProductionCosts, ProductionOrder, ProductionReceipt, QualityInspection, Routing, RoutingOperation, SubcontractOrder, WipEntry, WorkCentre } from '../../modules/production/types';
import { C } from '../collections';
import { IDS, rec } from './core';
import { jv, ACC, type JLine } from './purchase';

const co = IDS.acme;
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const r3 = (n: number) => Math.round((n + Number.EPSILON) * 1000) / 1000;
const T = (d: string, hm = '10:00') => `${d}T${hm}:00.000Z`;
const addDaysIso = (iso: string, days: number) => { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + days); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const WIP = 'wh_wip', SCRAP = 'wh_scrap', SUBCON = 'wh_subcon';
const WH_NAME: Record<string, string> = { [IDS.whMain]: 'Main WH', [IDS.whAndheri]: 'Andheri WH', [WIP]: 'Shop Floor WIP', [SCRAP]: 'Scrap Yard', [SUBCON]: 'At Subcontractor' };

// extra GL accounts + item / supplier / warehouse rows owned by this seed
ACC.acc_1220 = ['1220', 'Work in Progress'];
ACC.acc_5710 = ['5710', 'Production Variances'];
ACC.acc_5720 = ['5720', 'Subcontracting Charges'];
ACC.acc_5730 = ['5730', 'Production Labour Absorbed'];
ACC.acc_5740 = ['5740', 'Manufacturing Overhead Absorbed'];

interface Itm { id: string; code: string; name: string; uom: string; rate: number; tracking: 'None' | 'Batch' | 'Serial' }
const I: Record<string, Itm> = {
  steel4: { id: IDS.iSteel4, code: 'STL-4MM-HR', name: 'Steel Plates 4mm HR', uom: 'MT', rate: 85000, tracking: 'Batch' },
  steel6: { id: IDS.iSteel6, code: 'STL-6MM-CR', name: 'Steel Plates 6mm CR', uom: 'MT', rate: 92000, tracking: 'Batch' },
  bolt: { id: IDS.iBolt, code: 'HW-BOLT-M16', name: 'Hex Bolt M16 × 60', uom: 'Nos', rate: 28, tracking: 'None' },
  nut: { id: IDS.iNut, code: 'HW-NUT-M16', name: 'Hex Nut M16', uom: 'Nos', rate: 18, tracking: 'None' },
  grease: { id: IDS.iGrease, code: 'LUB-GRS-2', name: 'Grease EP-2 15 kg', uom: 'Tin', rate: 2800, tracking: 'None' },
  wheel: { id: IDS.iGrind, code: 'GRD-WHL-180', name: 'Grinding Wheel 180mm', uom: 'Nos', rate: 380, tracking: 'None' },
  electrode: { id: IDS.iElectrode, code: 'ELEC-WLD-200', name: 'Electrode Welding 200A', uom: 'Kg', rate: 1850, tracking: 'None' },
  bracket: { id: IDS.iBracket, code: 'FG-BRKT-STD', name: 'Steel Mounting Bracket (Std)', uom: 'Nos', rate: 1240, tracking: 'Batch' },
  frame: { id: IDS.iFrame, code: 'FG-FRAME-L', name: 'Welded Frame Assembly L', uom: 'Nos', rate: 8900, tracking: 'Serial' },
  offcut: { id: 'item_offcut', code: 'RM-OFFCUT', name: 'Steel Offcuts (recovered)', uom: 'Kg', rate: 30, tracking: 'None' },
};
const INV_ACC: Record<string, string> = { [I.steel4.id]: IDS.accInvRM, [I.steel6.id]: IDS.accInvRM, [I.offcut.id]: IDS.accInvRM };
const invAcc = (itemId: string) => INV_ACC[itemId] ?? IDS.accInvFG;
const byId = (id: string) => Object.values(I).find((x) => x.id === id)!;

// journal number pool (unused numbers below the Journal series counter)
const JV_POOL = [...Array.from({ length: 18 }, (_, i) => 312 + i), ...Array.from({ length: 18 }, (_, i) => 372 + i), ...Array.from({ length: 19 }, (_, i) => 391 + i)];
let jvIdx = 0;
const nextJv = () => `JV/26-27/${String(JV_POOL[jvIdx++] ?? 500 + jvIdx).padStart(4, '0')}`;

let smSeq = 0, wipSeq = 0;
const moves: StockMovement[] = [];
const journals: Journal[] = [];
const wip: WipEntry[] = [];
const issues: MaterialIssue[] = [];
const receipts: ProductionReceipt[] = [];
const inspections: QualityInspection[] = [];
const subs: SubcontractOrder[] = [];
const openItems: OpenItem[] = [];

function mv(date: string, it: Itm, whId: string, qty: number, rate: number, type: StockMoveType, sourceType: string, sourceId: string, sourceNumber: string, extra: Partial<StockMovement> = {}): StockMovement {
  smSeq += 1;
  const m: StockMovement = { id: `smm_${String(smSeq).padStart(4, '0')}`, companyId: co, createdAt: T(date, '09:30'), updatedAt: T(date, '09:30'), createdBy: 'seed', version: 1, date, itemId: it.id, itemCode: it.code, itemName: it.name, warehouseId: whId, warehouseName: WH_NAME[whId] ?? whId, qty, uom: it.uom, baseQty: qty, rate, value: r2(Math.abs(qty) * rate), type, sourceType, sourceId, sourceNumber, ...extra };
  moves.push(m);
  return m;
}
function post(id: string, date: string, sourceType: string, sourceId: string, sourceNumber: string, narration: string, lines: JLine[], extra: Partial<Journal> = {}): Journal {
  const j = jv(id, nextJv(), date, sourceType, sourceId, sourceNumber, narration, lines, { idempotencyKey: `${sourceId}:${id}`, ...extra });
  journals.push(j);
  return j;
}
function wipRow(o: ProductionOrder, date: string, type: WipEntry['type'], amount: number, j: Journal | undefined, sourceType: string, sourceId: string, sourceNumber: string, description?: string) {
  wipSeq += 1;
  wip.push(rec<WipEntry>(`wip_${String(wipSeq).padStart(3, '0')}`, { companyId: co, orderId: o.id, orderNumber: o.number, date, type, amount: r2(amount), journalId: j?.id, journalNumber: j?.number, sourceType, sourceId, sourceNumber, description, createdAt: T(date), updatedAt: T(date) }));
}

// ── Masters ────────────────────────────────────────────────────────────────

const workCentres: WorkCentre[] = [
  rec<WorkCentre>('wc_cut', { companyId: co, code: 'WC-CUT', name: 'Cutting', workingDays: [1, 2, 3, 4, 5, 6], hoursPerDay: 8, capacityHrsPerDay: 8, efficiencyPct: 90, costRateLabour: 250, costRateMachine: 400, overheadRate: 120, warehouseId: WIP, branchId: IDS.brAndheri, permittedOperations: ['Cut', 'Shear', 'Drill'], status: 'Active' }),
  rec<WorkCentre>('wc_weld', { companyId: co, code: 'WC-WELD', name: 'Welding bay', workingDays: [1, 2, 3, 4, 5, 6], hoursPerDay: 8, capacityHrsPerDay: 16, efficiencyPct: 85, costRateLabour: 350, costRateMachine: 200, overheadRate: 150, warehouseId: WIP, branchId: IDS.brAndheri, permittedOperations: ['Weld', 'Tack', 'Fit-up'], status: 'Active' }),
  rec<WorkCentre>('wc_grind', { companyId: co, code: 'WC-GRIND', name: 'Grinding', workingDays: [1, 2, 3, 4, 5, 6], hoursPerDay: 8, capacityHrsPerDay: 8, efficiencyPct: 95, costRateLabour: 250, costRateMachine: 150, overheadRate: 100, warehouseId: WIP, branchId: IDS.brAndheri, permittedOperations: ['Grind', 'Deburr', 'Polish'], status: 'Active' }),
  rec<WorkCentre>('wc_asm', { companyId: co, code: 'WC-ASM', name: 'Assembly', workingDays: [1, 2, 3, 4, 5], hoursPerDay: 8, capacityHrsPerDay: 8, efficiencyPct: 90, costRateLabour: 300, costRateMachine: 0, overheadRate: 100, warehouseId: WIP, branchId: IDS.brAndheri, permittedOperations: ['Assemble', 'Inspect', 'Pack'], status: 'Active' }),
];

const rop = (id: string, seq: number, name: string, wc: string, setupMin: number, runMinPerUnit: number, extra: Partial<RoutingOperation> = {}): RoutingOperation => {
  const w = workCentres.find((x) => x.id === wc)!;
  return { id, seq, name, workCentreId: wc, setupMin, runMinPerUnit, labourRate: w.costRateLabour, machineRate: w.costRateMachine, yieldPct: 100, parallel: false, subcontract: false, ...extra };
};
const routings: Routing[] = [
  rec<Routing>('rt_bracket', { companyId: co, code: 'RT-BRKT', name: 'Bracket fabrication', itemId: I.bracket.id, itemName: I.bracket.name, status: 'Active', operations: [rop('rop_b1', 10, 'Cut', 'wc_cut', 30, 1.5), rop('rop_b2', 20, 'Weld', 'wc_weld', 20, 3), rop('rop_b3', 30, 'Grind', 'wc_grind', 10, 2, { yieldPct: 98 }), rop('rop_b4', 40, 'Inspect', 'wc_asm', 5, 0.5)] }),
  rec<Routing>('rt_frame', { companyId: co, code: 'RT-FRAME', name: 'Frame assembly', itemId: I.frame.id, itemName: I.frame.name, status: 'Active', operations: [rop('rop_f1', 10, 'Cut', 'wc_cut', 30, 12), rop('rop_f2', 20, 'Weld', 'wc_weld', 45, 40, { yieldPct: 97 }), rop('rop_f3', 30, 'Grind', 'wc_grind', 15, 15, { parallel: true }), rop('rop_f4', 40, 'Assemble', 'wc_asm', 20, 25), rop('rop_f5', 50, 'Powder-coat', 'wc_asm', 0, 0, { subcontract: true, supplierId: 'sup_powdercoat', serviceItemId: 'item_powdercoat', subcontractRate: 450, labourRate: 0, machineRate: 0 }), rop('rop_f6', 60, 'Inspect', 'wc_asm', 10, 5)] }),
  rec<Routing>('rt_offcut', { companyId: co, code: 'RT-CUT-ONLY', name: 'Cut only (job work)', status: 'Inactive', operations: [rop('rop_c1', 10, 'Cut', 'wc_cut', 15, 2)] }),
];

const bc = (id: string, it: Itm, qty: number, scrapPct = 0, extra: Partial<BomComponent> = {}): BomComponent => ({ id, itemId: it.id, itemCode: it.code, itemName: it.name, qty, uom: it.uom, scrapPct, substitutes: [], isPhantom: false, ...extra });
const boms: Bom[] = [
  rec<Bom>('bom_brkt_v1', { companyId: co, code: 'BOM-001', itemId: I.bracket.id, itemCode: I.bracket.code, itemName: I.bracket.name, version: 1, effectiveFrom: '2026-04-01', effectiveTo: '2026-07-31', status: 'Superseded', mode: 'discrete', outputQty: 1, uom: 'Nos', components: [bc('bc_11', I.steel4, 0.013, 5), bc('bc_12', I.bolt, 4), bc('bc_13', I.nut, 4), bc('bc_14', I.grease, 0.012)], byProducts: [], routingId: 'rt_bracket', supersededById: 'bom_brkt_v2', stdCost: 1338, rolledUpAt: T('2026-04-01'), notes: 'Initial release', createdAt: T('2026-04-01'), updatedAt: T('2026-08-01') }),
  rec<Bom>('bom_brkt_v2', { companyId: co, code: 'BOM-001', itemId: I.bracket.id, itemCode: I.bracket.code, itemName: I.bracket.name, version: 2, effectiveFrom: '2026-08-01', status: 'Active', mode: 'discrete', outputQty: 1, uom: 'Nos', components: [bc('bc_21', I.steel4, 0.012, 3, { substitutes: [I.steel6.id] }), bc('bc_22', I.bolt, 4), bc('bc_23', I.nut, 4), bc('bc_24', I.grease, 0.01)], byProducts: [{ id: 'bp_21', itemId: I.offcut.id, itemName: I.offcut.name, qty: 0.6, uom: 'Kg', costSharePct: 0 }], routingId: 'rt_bracket', supersedesId: 'bom_brkt_v1', stdCost: 1308, rolledUpAt: T('2026-08-01'), notes: 'Steel usage reduced after nesting optimisation (v1 0.013 → 0.012 MT); offcuts recovered as by-product', createdAt: T('2026-08-01'), updatedAt: T('2026-08-01') }),
  rec<Bom>('bom_frame', { companyId: co, code: 'BOM-002', itemId: I.frame.id, itemCode: I.frame.code, itemName: I.frame.name, version: 1, effectiveFrom: '2026-04-01', status: 'Active', mode: 'discrete', outputQty: 1, uom: 'Nos', components: [bc('bc_31', I.steel6, 0.08, 2), bc('bc_32', I.bracket, 4), bc('bc_33', I.electrode, 0.5), bc('bc_34', I.wheel, 0.2)], byProducts: [{ id: 'bp_31', itemId: I.offcut.id, itemName: I.offcut.name, qty: 4, uom: 'Kg', costSharePct: 0 }], routingId: 'rt_frame', stdCost: 14800, rolledUpAt: T('2026-04-01'), createdAt: T('2026-04-01'), updatedAt: T('2026-04-01') }),
  rec<Bom>('bom_frame_v2', { companyId: co, code: 'BOM-002', itemId: I.frame.id, itemCode: I.frame.code, itemName: I.frame.name, version: 2, effectiveFrom: '2026-10-01', status: 'Draft', mode: 'discrete', outputQty: 1, uom: 'Nos', components: [bc('bc_41', I.steel6, 0.078, 2), bc('bc_42', I.bracket, 4), bc('bc_43', I.electrode, 0.45), bc('bc_44', I.wheel, 0.2)], byProducts: [{ id: 'bp_41', itemId: I.offcut.id, itemName: I.offcut.name, qty: 4, uom: 'Kg', costSharePct: 0 }], routingId: 'rt_frame', supersedesId: 'bom_frame', notes: 'Draft — electrode consumption trial (0.5 → 0.45 kg) pending welding trials', createdAt: T('2026-09-10'), updatedAt: T('2026-09-10') }),
];

const plans: InspectionPlan[] = [
  rec<InspectionPlan>('qp_fg_bracket', { companyId: co, code: 'QP-001', name: 'FG · Bracket dimensional & weld', type: 'Finished goods', itemId: I.bracket.id, itemName: I.bracket.name, samplePct: 10, status: 'Active', checks: [{ id: 'ck1', name: 'Length', spec: '118–122', method: 'Vernier', kind: 'Measurement', min: 118, max: 122, unit: 'mm' }, { id: 'ck2', name: 'Weld visual', spec: 'No porosity / undercut', method: 'Visual (IS 822)', kind: 'Pass/Fail' }, { id: 'ck3', name: 'Hole pitch', spec: '59.5–60.5', method: 'Go/No-go gauge', kind: 'Measurement', min: 59.5, max: 60.5, unit: 'mm' }] }),
  rec<InspectionPlan>('qp_fg_frame', { companyId: co, code: 'QP-002', name: 'FG · Frame squareness & coating', type: 'Finished goods', itemId: I.frame.id, itemName: I.frame.name, samplePct: 100, status: 'Active', checks: [{ id: 'ck1', name: 'Diagonal squareness', spec: '≤ 2', method: 'Tape · diagonal difference', kind: 'Measurement', min: 0, max: 2, unit: 'mm' }, { id: 'ck2', name: 'Weld penetration', spec: 'Full penetration, no cracks', method: 'DPT', kind: 'Pass/Fail' }, { id: 'ck3', name: 'Coating thickness', spec: '60–80', method: 'Elcometer', kind: 'Measurement', min: 60, max: 80, unit: 'µm' }, { id: 'ck4', name: 'Serial label', spec: 'Legible, matches serial', method: 'Visual', kind: 'Pass/Fail' }] }),
  rec<InspectionPlan>('qp_in_steel', { companyId: co, code: 'QP-003', name: 'Incoming · Steel plates', type: 'Incoming', samplePct: 5, status: 'Active', checks: [{ id: 'ck1', name: 'Thickness', spec: 'Nominal ± 0.1', method: 'Micrometer', kind: 'Measurement', unit: 'mm' }, { id: 'ck2', name: 'Mill test certificate', spec: 'Heat no. matches MTC', method: 'Document', kind: 'Pass/Fail' }, { id: 'ck3', name: 'Surface', spec: 'No pitting / rust scale', method: 'Visual', kind: 'Pass/Fail' }] }),
  rec<InspectionPlan>('qp_in_hw', { companyId: co, code: 'QP-004', name: 'Incoming · Hardware', type: 'Incoming', samplePct: 2, status: 'Active', checks: [{ id: 'ck1', name: 'Thread gauge', spec: 'M16 × 2 6H', method: 'Go/No-go', kind: 'Pass/Fail' }, { id: 'ck2', name: 'Plating', spec: 'Uniform zinc, no flaking', method: 'Visual', kind: 'Pass/Fail' }] }),
  rec<InspectionPlan>('qp_inproc', { companyId: co, code: 'QP-005', name: 'In-process · Weld fit-up', type: 'In-process', samplePct: 10, status: 'Active', checks: [{ id: 'ck1', name: 'Fit-up gap', spec: '≤ 1.5', method: 'Feeler gauge', kind: 'Measurement', min: 0, max: 1.5, unit: 'mm' }, { id: 'ck2', name: 'Tack welds', spec: '4 tacks, no cracks', method: 'Visual', kind: 'Pass/Fail' }] }),
];

// ── Order builder (mirrors modules/production/actions + receiptActions) ────

function comps(bom: Bom, qty: number): OrderComponent[] {
  return bom.components.map((c) => ({ id: `${c.id}_oc`, bomComponentId: c.id, itemId: c.itemId, itemCode: c.itemCode, itemName: c.itemName, uom: c.uom, qtyPer: c.qty, scrapPct: c.scrapPct, plannedQty: r3(c.qty * qty * (1 + c.scrapPct / 100)), issuedQty: 0, returnedQty: 0, consumedQty: 0, isPhantom: c.isPhantom, substitutes: c.substitutes, tracking: byId(c.itemId).tracking, warehouseId: c.itemId === I.bracket.id ? IDS.whAndheri : IDS.whMain }));
}
function ops(routing: Routing, orderId: string): OrderOperation[] {
  return routing.operations.map((op) => { const w = workCentres.find((x) => x.id === op.workCentreId)!; return { id: `${orderId}_${op.id}`, seq: op.seq, name: op.name, workCentreId: op.workCentreId, workCentreName: w.name, setupMin: op.setupMin, runMinPerUnit: op.runMinPerUnit, labourRate: op.labourRate, machineRate: op.machineRate, overheadRate: w.overheadRate, yieldPct: op.yieldPct, parallel: op.parallel, subcontract: op.subcontract, supplierId: op.supplierId, serviceItemId: op.serviceItemId, subcontractRate: op.subcontractRate, status: 'Pending' as const, actualSetupMin: 0, actualRunMin: 0, labourCost: 0, machineCost: 0, overheadCost: 0, subcontractCost: 0, completedQty: 0, scrapQty: 0 }; });
}
function emptyCosts(): ProductionCosts { return { materialStd: 0, materialActual: 0, labourStd: 0, labourActual: 0, machineStd: 0, machineActual: 0, overheadStd: 0, overheadActual: 0, subcontractStd: 0, subcontractActual: 0, scrap: 0, byProductCredit: 0, outputValue: 0, totalStd: 0, totalActual: 0, variance: 0, variancePct: 0, wipBalance: 0, closeVariance: 0 }; }

interface OrderSpec { id: string; n: number; it: Itm; bom: Bom; routing: Routing; qty: number; date: string; start: string; end: string; status: ProductionOrder['status']; extra?: Partial<ProductionOrder> }
function mkOrder(s: OrderSpec): ProductionOrder {
  const number = `PRD/26-27/${String(s.n).padStart(4, '0')}`;
  return rec<ProductionOrder>(s.id, { companyId: co, number, docType: 'Production Order', date: s.date, branchId: IDS.brAndheri, status: s.status, itemId: s.it.id, itemCode: s.it.code, itemName: s.it.name, uom: s.it.uom, tracking: s.it.tracking, bomId: s.bom.id, bomCode: s.bom.code, bomVersion: s.bom.version, routingId: s.routing.id, routingCode: s.routing.code, qty: s.qty, plannedStart: s.start, plannedEnd: s.end, warehouseId: IDS.whAndheri, wipWarehouseId: WIP, rmWarehouseId: IDS.whMain, scrapWarehouseId: SCRAP, lotNumber: s.it.tracking === 'Batch' ? `LOT-PRD-${String(s.n).padStart(4, '0')}-1` : undefined, serialPrefix: s.it.tracking === 'Serial' ? 'FRM' : undefined, components: comps(s.bom, s.qty), operations: ops(s.routing, s.id), costs: emptyCosts(), costingMethod: 'Actual', stdUnitCost: s.bom.stdCost ?? s.it.rate, receivedQty: 0, scrapQty: 0, byProductsReceived: [], journalIds: [], priority: 'Normal', correlationId: `corr_${s.id}`, fy: '2026-27', period: s.date.slice(0, 7), createdAt: T(s.date, '09:00'), updatedAt: T(s.date, '09:00'), createdBy: 'Anil Deshmukh', ...s.extra });
}

let miSeq = 19;
function issue(o: ProductionOrder, date: string, lines: { it: Itm; qty: number; batch?: string; wh?: string }[], type: MaterialIssue['type'] = 'Issue') {
  miSeq += 1;
  const id = `mi_${String(miSeq).padStart(4, '0')}`;
  const number = `MI/26-27/${String(miSeq).padStart(4, '0')}`;
  const gl = new Map<string, number>();
  const movementIds: string[] = [];
  const outLines = lines.map((l, i) => {
    const whId = l.wh ?? (l.it.id === I.bracket.id ? IDS.whAndheri : IDS.whMain);
    const out = mv(date, l.it, whId, -l.qty, l.it.rate, 'Production Issue', 'Material Issue', id, number, { batch: l.batch, bin: whId === IDS.whMain ? 'A-01' : 'R1' });
    const inn = mv(date, l.it, WIP, l.qty, l.it.rate, 'Production Issue', 'Material Issue', id, number, { batch: l.batch, bin: 'CELL-1' });
    movementIds.push(out.id, inn.id);
    gl.set(invAcc(l.it.id), r2((gl.get(invAcc(l.it.id)) ?? 0) + out.value));
    const cmp = o.components.find((c) => c.itemId === l.it.id);
    if (cmp) cmp.issuedQty = r3(cmp.issuedQty + l.qty);
    return { id: `${id}_l${i + 1}`, componentId: cmp?.id, itemId: l.it.id, itemCode: l.it.code, itemName: l.it.name, qty: l.qty, uom: l.it.uom, batch: l.batch, warehouseId: whId, rate: l.it.rate, value: out.value };
  });
  const totalValue = r2(outLines.reduce((s, l) => s + l.value, 0));
  const j = post(`jv_prd_${id}`, date, 'Material Issue', id, number, `${type === 'Backflush' ? 'Backflush' : 'Material issue'} ${number} to ${o.number} (${o.itemName})`, [{ acc: 'acc_1220', dr: totalValue }, ...Array.from(gl.entries()).map(([acc, cr]) => ({ acc, cr }))]);
  movementIds.forEach((mid) => { const m = moves.find((x) => x.id === mid)!; m.journalId = j.id; });
  issues.push(rec<MaterialIssue>(id, { companyId: co, number, docType: 'Material Issue', date, branchId: IDS.brAndheri, orderId: o.id, orderNumber: o.number, type, lines: outLines, status: 'Posted', totalValue, journalId: j.id, journalNumber: j.number, movementIds, idempotencyKey: `${id}:seed`, postedAt: T(date, '09:30'), postedBy: 'Suresh Kumar', correlationId: o.correlationId, createdAt: T(date, '09:30'), updatedAt: T(date, '09:30') }));
  o.journalIds.push(j.id);
  if (o.status === 'Released') o.status = 'In Progress';
  o.actualStart = o.actualStart ?? date;
  wipRow(o, date, 'Material In', totalValue, j, 'Material Issue', id, number, `${outLines.length} line(s) issued`);
  return id;
}

function opDone(o: ProductionOrder, name: string, date: string, setup: number, run: number, opts: { completedQty?: number; scrapQty?: number; scrapReason?: string; status?: 'Done' | 'In Progress' } = {}) {
  const op = o.operations.find((x) => x.name === name)!;
  const hrs = (setup + run) / 60;
  Object.assign(op, { actualSetupMin: setup, actualRunMin: run, labourCost: r2(hrs * op.labourRate), machineCost: r2(hrs * op.machineRate), overheadCost: r2(hrs * op.overheadRate), completedQty: opts.completedQty ?? (opts.status === 'In Progress' ? 0 : o.qty - (opts.scrapQty ?? 0)), scrapQty: opts.scrapQty ?? 0, scrapReason: opts.scrapReason, status: opts.status ?? 'Done', startedAt: T(date, '08:00') });
  if (op.status !== 'Done') return;
  op.completedAt = T(date, '17:00'); op.completedBy = 'Anil Deshmukh';
  const conv = r2(op.labourCost + op.machineCost + op.overheadCost);
  if (conv <= 0) return;
  const lines: JLine[] = [{ acc: 'acc_1220', dr: conv }];
  if (op.labourCost > 0) lines.push({ acc: 'acc_5730', cr: op.labourCost });
  if (op.machineCost + op.overheadCost > 0) lines.push({ acc: 'acc_5740', cr: r2(op.machineCost + op.overheadCost) });
  const j = post(`jv_prd_${op.id}`, date, 'Production Order', o.id, o.number, `Conversion cost · ${o.number} · ${op.name} (${setup + run} min)`, lines, { idempotencyKey: `${o.id}:op:${op.id}:conv` });
  op.journalId = j.id;
  o.journalIds.push(j.id);
  wipRow(o, date, 'Conversion', conv, j, 'Production Order', o.id, o.number, `${op.name} · labour ${op.labourCost} · machine ${op.machineCost} · overhead ${op.overheadCost}`);
}

function costsOf(o: ProductionOrder): ProductionCosts {
  const std = (op: OrderOperation) => { const m = op.setupMin + op.runMinPerUnit * o.qty; const h = m / 60; return op.subcontract ? { l: 0, m: 0, o: 0, s: r2((op.subcontractRate ?? 0) * o.qty) } : { l: r2(h * op.labourRate), m: r2(h * op.machineRate), o: r2(h * op.overheadRate), s: 0 }; };
  const stds = o.operations.filter((x) => !x.isRework).map(std);
  const materialStd = r2(o.components.reduce((s, c) => s + c.plannedQty * byId(c.itemId).rate, 0));
  const materialActual = r2(issues.filter((i) => i.orderId === o.id).reduce((s, i) => s + (i.type === 'Return' ? -i.totalValue : i.totalValue), 0) + wip.filter((w) => w.orderId === o.id && w.type === 'Material In' && w.sourceType === 'Subcontract Order').reduce((s, w) => s + w.amount, 0));
  const rs = receipts.filter((r) => r.orderId === o.id && r.status === 'Posted');
  const scrap = r2(rs.reduce((s, r) => s + r.scrapValue, 0));
  const byProductCredit = r2(rs.reduce((s, r) => s + r.byProducts.reduce((x, b) => x + b.value, 0), 0));
  const outputValue = r2(rs.reduce((s, r) => s + r.value, 0));
  const c: ProductionCosts = { materialStd, materialActual, labourStd: r2(stds.reduce((s, x) => s + x.l, 0)), labourActual: r2(o.operations.reduce((s, x) => s + x.labourCost, 0)), machineStd: r2(stds.reduce((s, x) => s + x.m, 0)), machineActual: r2(o.operations.reduce((s, x) => s + x.machineCost, 0)), overheadStd: r2(stds.reduce((s, x) => s + x.o, 0)), overheadActual: r2(o.operations.reduce((s, x) => s + x.overheadCost, 0)), subcontractStd: r2(stds.reduce((s, x) => s + x.s, 0)), subcontractActual: r2(o.operations.reduce((s, x) => s + x.subcontractCost, 0)), scrap, byProductCredit, outputValue, totalStd: 0, totalActual: 0, variance: 0, variancePct: 0, wipBalance: r2(wip.filter((w) => w.orderId === o.id).reduce((s, w) => s + w.amount, 0)), closeVariance: o.costs.closeVariance };
  c.totalStd = r2(c.materialStd + c.labourStd + c.machineStd + c.overheadStd + c.subcontractStd);
  c.totalActual = r2(c.materialActual + c.labourActual + c.machineActual + c.overheadActual + c.subcontractActual + c.scrap - c.byProductCredit);
  c.variance = r2(c.totalActual - c.totalStd);
  c.variancePct = c.totalStd ? r2((c.variance / c.totalStd) * 100) : 0;
  return c;
}

let prcSeq = 7;
const frameSerial = 0;
interface ReceiptSpec { qty: number; scrap?: number; scrapReason?: string; byProductKg?: number; hold?: boolean; date: string }
function receipt(o: ProductionOrder, s: ReceiptSpec): ProductionReceipt {
  prcSeq += 1;
  const id = `prc_${String(prcSeq).padStart(4, '0')}`;
  const number = `PRC/26-27/${String(prcSeq).padStart(4, '0')}`;
  const n = receipts.filter((r) => r.orderId === o.id).length + 1;
  const batch = o.tracking === 'Batch' ? `LOT-PRD-${o.number.slice(-4)}-${n}` : undefined;
  const total = s.qty + (s.scrap ?? 0);
  const prior = receipts.filter((r) => r.orderId === o.id).flatMap((r) => r.serials ?? []).length;
  const serials = o.tracking === 'Serial' ? Array.from({ length: total }, (_, i) => `FRM-${String(frameSerial + prior + i + 1).padStart(4, '0')}`) : undefined;
  const byProducts = s.byProductKg ? [{ itemId: I.offcut.id, itemName: I.offcut.name, qty: s.byProductKg, uom: 'Kg', value: r2(s.byProductKg * I.offcut.rate) }] : [];
  const byProductValue = r2(byProducts.reduce((x, b) => x + b.value, 0));
  // Actual costing: a receipt may only release what WIP is actually carrying for this order
  // (material issued + conversion absorbed + subcontract), shared over the output still expected.
  // Spreading the whole order's cost across an early partial receipt drives WIP negative.
  const wipBalance = r2(wip.filter((w) => w.orderId === o.id).reduce((x, w) => x + w.amount, 0));
  const remaining = Math.max(total, r3(o.qty - o.receivedQty - o.scrapQty));
  const share = remaining > 0 ? total / remaining : 1;
  const releasable = Math.max(0, r2(wipBalance * share - byProductValue));
  const c = costsOf(o);
  const incurred = r2(c.materialActual + c.labourActual + c.machineActual + c.overheadActual + c.subcontractActual - c.byProductCredit);
  const denom = o.receivedQty + o.scrapQty + total;
  const unitCost = releasable > 0 ? r2(releasable / total) : r2(incurred / denom);
  const r = rec<ProductionReceipt>(id, { companyId: co, number, docType: 'Production Receipt', date: s.date, branchId: IDS.brAndheri, orderId: o.id, orderNumber: o.number, itemId: o.itemId, itemCode: o.itemCode, itemName: o.itemName, qty: s.qty, uom: o.uom, batch, serials, warehouseId: IDS.whAndheri, byProducts, scrapQty: s.scrap ?? 0, scrapReason: s.scrapReason, scrapValue: r2(unitCost * (s.scrap ?? 0)), qcRequired: !!s.hold || o.itemId === I.bracket.id, status: s.hold ? 'Hold' : 'Posted', unitCost, costBasis: 'Actual', value: r2(unitCost * s.qty), backflush: false, movementIds: [], correlationId: o.correlationId, idempotencyKey: `${id}:seed`, createdAt: T(s.date, '15:00'), updatedAt: T(s.date, '15:00'), createdBy: 'Anil Deshmukh' });
  receipts.push(r);
  if (s.hold) return r;
  const movementIds: string[] = [];
  // consume floor stock proportionally from WIP (FIFO batches as issued)
  o.components.forEach((cmp) => {
    const onFloor = r3(cmp.issuedQty - cmp.returnedQty - cmp.consumedQty);
    const need = r3(cmp.qtyPer * (1 + cmp.scrapPct / 100) * total);
    const take = r3(Math.min(onFloor, need));
    if (take <= 0) return;
    const it = byId(cmp.itemId);
    const batchOf = issues.filter((i) => i.orderId === o.id).flatMap((i) => i.lines).find((l) => l.itemId === cmp.itemId)?.batch ?? subs.filter((x) => x.orderId === o.id).flatMap((x) => x.itemsSent).find((l) => l.itemId === cmp.itemId)?.batch;
    movementIds.push(mv(s.date, it, WIP, -take, it.rate, 'Production Receipt', 'Production Receipt', id, number, { batch: batchOf, bin: 'CELL-1' }).id);
    cmp.consumedQty = r3(cmp.consumedQty + take);
  });
  const gl: JLine[] = [];
  if (s.qty > 0) { movementIds.push(mv(s.date, byId(o.itemId), IDS.whAndheri, s.qty, unitCost, 'Production Receipt', 'Production Receipt', id, number, { batch, serials: serials?.slice(0, s.qty), bin: 'R1' }).id); gl.push({ acc: IDS.accInvFG, dr: r.value }); }
  byProducts.forEach((b) => { movementIds.push(mv(s.date, I.offcut, IDS.whAndheri, b.qty, I.offcut.rate, 'Production Receipt', 'Production Receipt', id, number, { bin: 'R3' }).id); gl.push({ acc: IDS.accInvRM, dr: b.value }); });
  const outValue = r2(r.value + byProducts.reduce((x, b) => x + b.value, 0));
  const j = post(`jv_prd_${id}`, s.date, 'Production Receipt', id, number, `Production receipt ${number} · ${o.number} · ${o.itemName} × ${s.qty} @ ${unitCost} (Actual)`, [...gl, { acc: 'acc_1220', cr: outValue }]);
  r.journalId = j.id; r.journalNumber = j.number;
  wipRow(o, s.date, 'Output', -r.value, j, 'Production Receipt', id, number, `${s.qty} ${o.uom} @ ${unitCost}`);
  byProducts.forEach((b) => wipRow(o, s.date, 'By-product', -b.value, j, 'Production Receipt', id, number, `${b.itemName} × ${b.qty} kg`));
  if ((s.scrap ?? 0) > 0) {
    movementIds.push(mv(s.date, byId(o.itemId), SCRAP, s.scrap!, 0, 'Scrap', 'Production Receipt', id, number, { batch, serials: serials?.slice(s.qty) }).id);
    const sj = post(`jv_prd_${id}_scrap`, s.date, 'Production Receipt', id, number, `Scrap ${s.scrap} ${o.uom} on ${o.number} · ${s.scrapReason}`, [{ acc: 'acc_5700', dr: r.scrapValue }, { acc: 'acc_1220', cr: r.scrapValue }]);
    r.scrapJournalId = sj.id;
    o.journalIds.push(sj.id);
    wipRow(o, s.date, 'Scrap', -r.scrapValue, sj, 'Production Receipt', id, number, `${s.scrap} ${o.uom} · ${s.scrapReason}`);
  }
  movementIds.forEach((mid) => { moves.find((x) => x.id === mid)!.journalId = j.id; });
  r.movementIds = movementIds; r.postedAt = T(s.date, '15:30'); r.postedBy = 'Anil Deshmukh';
  o.journalIds.push(j.id);
  o.receivedQty = r3(o.receivedQty + s.qty); o.scrapQty = r3(o.scrapQty + (s.scrap ?? 0));
  byProducts.forEach((b) => { const e = o.byProductsReceived.find((x) => x.itemId === b.itemId); if (e) { e.qty += b.qty; e.value = r2(e.value + b.value); } else o.byProductsReceived.push({ itemId: b.itemId, itemName: b.itemName, qty: b.qty, value: b.value }); });
  if (o.receivedQty + o.scrapQty >= o.qty) { o.status = 'Completed'; o.actualEnd = s.date; o.completedAt = T(s.date, '16:00'); } else o.status = 'Partially Completed';
  return r;
}
function close(o: ProductionOrder, date: string) {
  // return anything still on the shop floor to its source warehouse before measuring the variance
  o.components.forEach((cmp) => {
    const onFloor = r3(cmp.issuedQty - cmp.returnedQty - cmp.consumedQty);
    if (onFloor <= 0) return;
    const it = byId(cmp.itemId);
    const back = mv(date, it, WIP, -onFloor, it.rate, 'Production Issue', 'Production Order', o.id, o.number, { bin: 'CELL-1' });
    const home = mv(date, it, IDS.whMain, onFloor, it.rate, 'Production Issue', 'Production Order', o.id, o.number, { bin: 'A-01' });
    const jr = post(`jv_prd_${o.id}_return`, date, 'Production Order', o.id, o.number, `Unused material returned to stores on close of ${o.number} · ${it.name} × ${onFloor}`, [{ acc: it.id === I.bracket.id || it.id === I.frame.id ? IDS.accInvFG : IDS.accInvRM, dr: back.value }, { acc: 'acc_1220', cr: back.value }], { idempotencyKey: `${o.id}:close:return:${cmp.itemId}` });
    back.journalId = jr.id; home.journalId = jr.id;
    o.journalIds.push(jr.id);
    cmp.returnedQty = r3(cmp.returnedQty + onFloor);
    wipRow(o, date, 'Material Return', -back.value, jr, 'Production Order', o.id, o.number, `${it.name} × ${onFloor} returned to stores`);
  });
  const balance = r2(wip.filter((w) => w.orderId === o.id).reduce((s, w) => s + w.amount, 0));
  if (Math.abs(balance) >= 0.01) {
    const abs = Math.abs(balance);
    const j = post(`jv_prd_${o.id}_close`, date, 'Production Order', o.id, o.number, `Production variance on close of ${o.number} (${o.itemName} × ${o.qty})`, balance > 0 ? [{ acc: 'acc_5710', dr: abs }, { acc: 'acc_1220', cr: abs }] : [{ acc: 'acc_1220', dr: abs }, { acc: 'acc_5710', cr: abs }], { idempotencyKey: `${o.id}:close` });
    o.closeJournalId = j.id; o.journalIds.push(j.id); o.costs.closeVariance = balance;
    wipRow(o, date, 'Variance', -balance, j, 'Production Order', o.id, o.number, `Close variance ${balance > 0 ? 'under-absorbed' : 'over-absorbed'}`);
  }
  o.status = 'Closed'; o.closedAt = T(date, '18:00'); o.closedBy = 'Rahul Kumar';
}

let scoSeq = 1;
function subcontract(o: ProductionOrder, date: string, sent: { it: Itm; qty: number; batch?: string }[], recv?: { date: string; qty: number; consumed: { it: Itm; qty: number }[]; returned?: { it: Itm; qty: number }[] }, closeIt = false): SubcontractOrder {
  scoSeq += 1;
  const id = `sco_${String(scoSeq).padStart(4, '0')}`;
  const number = `SCO/26-27/${String(scoSeq).padStart(4, '0')}`;
  const op = o.operations.find((x) => x.subcontract)!;
  const itemsSent = sent.map((l, i) => { const whId = l.it.id === I.bracket.id ? IDS.whAndheri : IDS.whMain; const out = mv(date, l.it, whId, -l.qty, l.it.rate, 'Subcontract Out', 'Subcontract Order', id, number, { batch: l.batch, bin: 'R1' }); mv(date, l.it, SUBCON, l.qty, l.it.rate, 'Subcontract Out', 'Subcontract Order', id, number, { batch: l.batch }); return { id: `${id}_s${i + 1}`, itemId: l.it.id, itemCode: l.it.code, itemName: l.it.name, qty: l.qty, uom: l.it.uom, batch: l.batch, rate: l.it.rate, movementId: out.id, sentAt: T(date, '11:00'), warehouseId: whId }; });
  const sc = rec<SubcontractOrder>(id, { companyId: co, number, docType: 'Subcontract Order', date, branchId: IDS.brAndheri, supplierId: 'sup_powdercoat', supplierName: 'Precision Powder Coaters', orderId: o.id, orderNumber: o.number, operationId: op.id, operationName: op.name, serviceItemId: 'item_powdercoat', serviceItemName: 'Powder Coating Service', rate: 450, qty: o.qty, expectedDate: recv?.date ?? '2026-09-20', sendWarehouseId: IDS.whAndheri, subWarehouseId: SUBCON, itemsSent, received: [], receivedQty: 0, charges: 0, consumptionVariance: [], status: 'Sent', journalIds: [], sentAt: T(date, '11:00'), correlationId: o.correlationId, createdAt: T(date, '10:00'), updatedAt: T(date, '11:00'), createdBy: 'Anil Deshmukh' });
  subs.push(sc);
  op.subcontractOrderId = sc.id;
  if (!recv) return sc;
  const movementIds: string[] = [];
  const gl = new Map<string, number>();
  let consumedValue = 0;
  recv.consumed.forEach((l) => { const sentL = itemsSent.find((x) => x.itemId === l.it.id); movementIds.push(mv(recv.date, l.it, SUBCON, -l.qty, l.it.rate, 'Subcontract In', 'Subcontract Order', id, number, { batch: sentL?.batch }).id, mv(recv.date, l.it, WIP, l.qty, l.it.rate, 'Subcontract In', 'Subcontract Order', id, number, { batch: sentL?.batch, bin: 'CELL-2' }).id); const v = r2(l.qty * l.it.rate); gl.set(invAcc(l.it.id), r2((gl.get(invAcc(l.it.id)) ?? 0) + v)); consumedValue = r2(consumedValue + v); const cmp = o.components.find((c) => c.itemId === l.it.id); if (cmp) cmp.issuedQty = r3(cmp.issuedQty + l.qty); });
  (recv.returned ?? []).forEach((l) => { const sentL = itemsSent.find((x) => x.itemId === l.it.id); movementIds.push(mv(recv.date, l.it, SUBCON, -l.qty, l.it.rate, 'Subcontract In', 'Subcontract Order', id, number, { batch: sentL?.batch }).id, mv(recv.date, l.it, sentL?.warehouseId ?? IDS.whAndheri, l.qty, l.it.rate, 'Subcontract In', 'Subcontract Order', id, number, { batch: sentL?.batch }).id); });
  const charge = r2(450 * recv.qty);
  const lines: JLine[] = [];
  if (consumedValue > 0) { lines.push({ acc: 'acc_1220', dr: consumedValue }); gl.forEach((cr, acc) => lines.push({ acc, cr })); }
  lines.push({ acc: 'acc_1220', dr: charge }, { acc: IDS.accAP, cr: charge, partyType: 'Supplier', partyId: 'sup_powdercoat', partyName: 'Precision Powder Coaters' });
  const j = post(`jv_prd_${id}`, recv.date, 'Subcontract Order', id, number, `Subcontract receipt ${number} · ${op.name} × ${recv.qty} from Precision Powder Coaters`, lines);
  movementIds.forEach((mid) => { moves.find((x) => x.id === mid)!.journalId = j.id; });
  if (consumedValue > 0) wipRow(o, recv.date, 'Material In', consumedValue, j, 'Subcontract Order', id, number, 'Materials consumed at subcontractor');
  wipRow(o, recv.date, 'Subcontract', charge, j, 'Subcontract Order', id, number, `${op.name} × ${recv.qty} @ 450`);
  const variance = itemsSent.map((l) => { const consumed = recv.consumed.filter((x) => x.it.id === l.itemId).reduce((s, x) => s + x.qty, 0); const returned = (recv.returned ?? []).filter((x) => x.it.id === l.itemId).reduce((s, x) => s + x.qty, 0); const v = r3(l.qty - consumed - returned); return { itemId: l.itemId, itemName: l.itemName, sent: l.qty, consumed, returned, variance: v, value: r2(v * l.rate) }; });
  let vj: Journal | undefined;
  const vTotal = r2(variance.reduce((s, v) => s + v.value, 0));
  if (vTotal > 0) {
    variance.filter((v) => v.variance > 0).forEach((v) => movementIds.push(mv(recv.date, byId(v.itemId), SUBCON, -v.variance, byId(v.itemId).rate, 'Subcontract In', 'Subcontract Order', id, number).id));
    vj = post(`jv_prd_${id}_var`, recv.date, 'Subcontract Order', id, number, `Subcontract consumption variance · ${number}`, [{ acc: 'acc_5710', dr: vTotal }, ...variance.filter((v) => v.value > 0).map((v) => ({ acc: invAcc(v.itemId), cr: v.value }))], { idempotencyKey: `${id}:variance` });
  }
  openItems.push(rec<OpenItem>(`oi_${id}`, { companyId: co, partyType: 'Supplier', partyId: 'sup_powdercoat', partyName: 'Precision Powder Coaters', docType: 'Subcontract Order', docId: id, docNumber: number, date: recv.date, dueDate: addDaysIso(recv.date, 15), currency: 'INR', originalAmount: charge, baseAmount: charge, rate: 1, outstanding: charge, baseOutstanding: charge, direction: 'Debit', status: 'Open', settlements: [], branchId: IDS.brAndheri, createdAt: T(recv.date, '16:00'), updatedAt: T(recv.date, '16:00') }));
  sc.openItemId = `oi_${id}`;
  sc.received = [{ id: `${id}_r1`, date: recv.date, qty: recv.qty, consumed: recv.consumed.map((x) => ({ itemId: x.it.id, qty: x.qty })), returned: (recv.returned ?? []).map((x) => ({ itemId: x.it.id, qty: x.qty })), charge, journalId: j.id, movementIds, by: 'Suresh Kumar' }];
  sc.receivedQty = recv.qty; sc.charges = charge; sc.consumptionVariance = variance; sc.journalIds = [j.id, ...(vj ? [vj.id] : [])]; sc.status = recv.qty >= sc.qty ? 'Received' : 'Partially Received'; sc.updatedAt = T(recv.date, '16:00');
  Object.assign(op, { subcontractCost: charge, completedQty: recv.qty, status: recv.qty >= o.qty ? 'Done' : 'In Progress', completedAt: recv.qty >= o.qty ? T(recv.date, '16:00') : undefined, completedBy: 'Suresh Kumar', startedAt: T(date, '11:00') });
  o.journalIds.push(j.id, ...(vj ? [vj.id] : []));
  if (closeIt) { sc.status = 'Closed'; sc.closedAt = T(recv.date, '17:00'); }
  return sc;
}

let qcSeq = 21;
function inspection(spec: { type: QualityInspection['type']; it: Itm; plan: InspectionPlan; refType: QualityInspection['refType']; refId: string; refNumber: string; lotQty: number; date: string; status: QualityInspection['status']; results?: (boolean | null)[]; values?: string[]; accepted?: number; rejected?: number; disposition?: QualityInspection['disposition']; batch?: string; serials?: string[]; operationName?: string; operationId?: string; notes?: string; refLineId?: string }) {
  qcSeq += 1;
  const id = `qc_${String(qcSeq).padStart(4, '0')}`;
  const number = `QC/26-27/${String(qcSeq).padStart(4, '0')}`;
  const results = spec.plan.checks.map((ch, i) => ({ checkId: ch.id, check: ch.name, spec: ch.spec + (ch.unit ? ` ${ch.unit}` : ''), value: spec.values?.[i], pass: spec.results ? spec.results[i] : null }));
  const failed = results.filter((r) => r.pass === false).length;
  const done = spec.status === 'Completed';
  inspections.push(rec<QualityInspection>(id, { companyId: co, number, docType: 'Quality Inspection', date: spec.date, branchId: IDS.brAndheri, type: spec.type, planId: spec.plan.id, planName: spec.plan.name, itemId: spec.it.id, itemCode: spec.it.code, itemName: spec.it.name, refType: spec.refType, refId: spec.refId, refNumber: spec.refNumber, refLineId: spec.refLineId, operationId: spec.operationId, operationName: spec.operationName, lotQty: spec.lotQty, sampleQty: Math.max(1, Math.ceil((spec.lotQty * spec.plan.samplePct) / 100)), batch: spec.batch, serials: spec.serials, results, acceptedQty: spec.accepted ?? 0, rejectedQty: spec.rejected ?? 0, heldQty: done ? Math.max(0, spec.lotQty - (spec.accepted ?? 0) - (spec.rejected ?? 0)) : spec.lotQty, disposition: spec.disposition, outcome: done ? (failed === 0 ? 'Pass' : failed === results.length ? 'Fail' : 'Partial') : undefined, status: spec.status, inspectorName: 'Meena Iyer', completedAt: done ? T(spec.date, '16:30') : undefined, completedBy: done ? 'Meena Iyer' : undefined, notes: spec.notes, correlationId: `corr_${id}`, createdAt: T(spec.date, '14:00'), updatedAt: T(spec.date, '16:30'), createdBy: 'Meena Iyer' }));
  return { id, number };
}

// ── Build the document history ─────────────────────────────────────────────

export function seedManufacturing(): Partial<DB> {
  // masters added by this module
  const items: Item[] = [
    rec<Item>('item_offcut', { companyId: co, code: 'RM-OFFCUT', name: 'Steel Offcuts (recovered)', description: 'By-product of cutting; sold to scrap dealers or reused for small parts', type: 'Raw Material', group: 'Steel', baseUom: 'Kg', altUoms: [], hsn: '72044900', taxRateId: IDS.taxGST18, salesAccountId: IDS.accOtherIncome, purchaseAccountId: IDS.accPurchases, inventoryAccountId: IDS.accInvRM, tracking: 'None', reorderLevel: 0, reorderQty: 0, safetyStock: 0, leadTimeDays: 0, salesPrice: 42, purchasePrice: 30, standardCost: 30, status: 'Active', isStock: true }),
    rec<Item>('item_powdercoat', { companyId: co, code: 'SVC-PWDRCOAT', name: 'Powder Coating Service', description: 'Job-work powder coating per frame (RAL 7016)', type: 'Service', group: 'Services', baseUom: 'Nos', altUoms: [], hsn: '998898', taxRateId: IDS.taxGST18, salesAccountId: IDS.accServiceRev, purchaseAccountId: 'acc_5720', tracking: 'None', reorderLevel: 0, reorderQty: 0, safetyStock: 0, leadTimeDays: 5, salesPrice: 0, purchasePrice: 450, status: 'Active', isStock: false, preferredSupplierId: 'sup_powdercoat' }),
  ];
  const suppliers: Supplier[] = [
    rec<Supplier>('sup_powdercoat', { companyId: co, code: 'S-0011', name: 'Precision Powder Coaters', group: 'Job work', gstin: '27AABCP7788K1Z4', pan: 'AABCP7788K', taxTreatment: 'Registered', addresses: [{ id: 'a1', purpose: 'Both', isDefault: true, address: { line1: 'Plot 22, MIDC Taloja Phase 1', city: 'Navi Mumbai', state: 'Maharashtra', stateCode: '27', pin: '410208', country: 'IN' } }], contacts: [{ id: 'c1', name: 'Nitin Sawant', email: 'nitin@precisionpc.in', phone: '+91 98207 44110', isDefault: true }], currency: 'INR', purchaseTerms: 'Net 15', payableAccountId: IDS.accAP, bankDetails: [], tdsSectionId: IDS.tds194C, status: 'Active' }),
  ];
  const warehouses: Warehouse[] = [rec<Warehouse>(SUBCON, { companyId: co, code: 'WH-SUBCON', name: 'At Subcontractor', branchId: IDS.brAndheri, bins: [], type: 'Transit', status: 'Active' })];
  const accounts: Account[] = [
    rec<Account>('acc_5730', { companyId: co, code: '5730', name: 'Production Labour Absorbed', groupId: 'ag_cogs', type: 'Expense', normalBalance: 'Dr', isControl: false, postingAllowed: true, currencyBehaviour: 'Base', requiredDimensions: [], prohibitedDimensions: [], status: 'Active' }),
    rec<Account>('acc_5740', { companyId: co, code: '5740', name: 'Manufacturing Overhead Absorbed', groupId: 'ag_cogs', type: 'Expense', normalBalance: 'Dr', isControl: false, postingAllowed: true, currencyBehaviour: 'Base', requiredDimensions: [], prohibitedDimensions: [], status: 'Active' }),
  ];

  const B2 = boms[1], BF = boms[2], RB = routings[0], RF = routings[1];
  const orders: ProductionOrder[] = [];

  // 1 · PRD-0007 Bracket × 200 — Closed (Aug)
  const o7 = mkOrder({ id: 'prd_0007', n: 7, it: I.bracket, bom: B2, routing: RB, qty: 200, date: '2026-08-01', start: '2026-08-03', end: '2026-08-07', status: 'Released', extra: { releasedAt: T('2026-08-02'), releasedBy: 'Anil Deshmukh', sourceDemand: { type: 'Sales Order', id: 'so_0118', number: 'SO/26-27/0118', customerName: 'Metro Distributors' } } });
  issue(o7, '2026-08-03', [{ it: I.steel4, qty: 2.472, batch: 'HR-2603-A' }, { it: I.bolt, qty: 800 }, { it: I.nut, qty: 800 }, { it: I.grease, qty: 2 }]);
  opDone(o7, 'Cut', '2026-08-03', 30, 300); opDone(o7, 'Weld', '2026-08-04', 20, 610); opDone(o7, 'Grind', '2026-08-05', 10, 400, { scrapQty: 4, scrapReason: 'Weld porosity' }); opDone(o7, 'Inspect', '2026-08-06', 5, 100);
  const qcA = inspection({ type: 'In-process', it: I.bracket, plan: plans[4], refType: 'Production Order', refId: o7.id, refNumber: o7.number, operationId: o7.operations[1].id, operationName: 'Weld', lotQty: 200, date: '2026-08-04', status: 'Completed', results: [true, true], values: ['1.1', ''], accepted: 200, rejected: 0, disposition: 'Accept' });
  const r7 = receipt(o7, { qty: 196, scrap: 4, scrapReason: 'Weld porosity', byProductKg: 120, date: '2026-08-07' });
  inspection({ type: 'Finished goods', it: I.bracket, plan: plans[0], refType: 'Production Receipt', refId: r7.id, refNumber: r7.number, lotQty: 196, date: '2026-08-07', status: 'Completed', results: [true, true, true], values: ['120.2', '', '60.1'], accepted: 196, rejected: 0, disposition: 'Accept', batch: r7.batch });
  close(o7, '2026-08-08');
  orders.push(o7);
  void qcA;

  // 2 · PRD-0008 Frame × 5 — Closed with subcontract powder-coat (Aug)
  const o8 = mkOrder({ id: 'prd_0008', n: 8, it: I.frame, bom: BF, routing: RF, qty: 5, date: '2026-08-08', start: '2026-08-10', end: '2026-08-18', status: 'Released', extra: { releasedAt: T('2026-08-09'), releasedBy: 'Anil Deshmukh', sourceDemand: { type: 'Sales Order', id: 'so_0119', number: 'SO/26-27/0119', customerName: 'Sunshine Exports' } } });
  issue(o8, '2026-08-10', [{ it: I.steel6, qty: 0.408, batch: 'CR-2603-B' }, { it: I.electrode, qty: 2.5 }, { it: I.wheel, qty: 1 }]);
  opDone(o8, 'Cut', '2026-08-10', 30, 65); opDone(o8, 'Weld', '2026-08-11', 45, 210); opDone(o8, 'Grind', '2026-08-12', 15, 80); opDone(o8, 'Assemble', '2026-08-13', 20, 130);
  subcontract(o8, '2026-08-13', [{ it: I.bracket, qty: 20, batch: 'BR-2609-01' }], { date: '2026-08-17', qty: 5, consumed: [{ it: I.bracket, qty: 20 }] }, true);
  opDone(o8, 'Inspect', '2026-08-18', 10, 25);
  const r8 = receipt(o8, { qty: 5, byProductKg: 20, date: '2026-08-18' });
  inspection({ type: 'Finished goods', it: I.frame, plan: plans[1], refType: 'Production Receipt', refId: r8.id, refNumber: r8.number, lotQty: 5, date: '2026-08-18', status: 'Completed', results: [true, true, true, true], values: ['1.5', '', '72', ''], accepted: 5, rejected: 0, disposition: 'Accept', serials: r8.serials });
  close(o8, '2026-08-19');
  orders.push(o8);

  // 3 · PRD-0009 Bracket × 150 — Closed (late Aug)
  const o9 = mkOrder({ id: 'prd_0009', n: 9, it: I.bracket, bom: B2, routing: RB, qty: 150, date: '2026-08-18', start: '2026-08-20', end: '2026-08-24', status: 'Released', extra: { releasedAt: T('2026-08-19'), releasedBy: 'Anil Deshmukh' } });
  issue(o9, '2026-08-20', [{ it: I.steel4, qty: 1.854, batch: 'HR-2603-A' }, { it: I.bolt, qty: 600 }, { it: I.nut, qty: 600 }, { it: I.grease, qty: 2 }]);
  opDone(o9, 'Cut', '2026-08-20', 35, 240); opDone(o9, 'Weld', '2026-08-21', 20, 480); opDone(o9, 'Grind', '2026-08-22', 10, 290, { scrapQty: 2, scrapReason: 'Dimensional out of tolerance' }); opDone(o9, 'Inspect', '2026-08-24', 5, 70);
  receipt(o9, { qty: 148, scrap: 2, scrapReason: 'Dimensional out of tolerance', byProductKg: 90, date: '2026-08-24' });
  close(o9, '2026-08-26');
  orders.push(o9);

  // 4 · PRD-0010 Frame × 4 — Completed (subcontract received, not yet closed)
  const o10 = mkOrder({ id: 'prd_0010', n: 10, it: I.frame, bom: BF, routing: RF, qty: 4, date: '2026-08-31', start: '2026-09-02', end: '2026-09-09', status: 'Released', extra: { releasedAt: T('2026-09-01'), releasedBy: 'Anil Deshmukh', priority: 'High' } });
  issue(o10, '2026-09-02', [{ it: I.steel6, qty: 0.326, batch: 'CR-2603-B' }, { it: I.electrode, qty: 2 }, { it: I.wheel, qty: 1 }]);
  opDone(o10, 'Cut', '2026-09-02', 30, 50); opDone(o10, 'Weld', '2026-09-03', 45, 175); opDone(o10, 'Grind', '2026-09-04', 15, 60); opDone(o10, 'Assemble', '2026-09-04', 20, 105);
  subcontract(o10, '2026-09-05', [{ it: I.bracket, qty: 17, batch: 'BR-2609-01' }], { date: '2026-09-09', qty: 4, consumed: [{ it: I.bracket, qty: 16 }] });
  opDone(o10, 'Inspect', '2026-09-09', 10, 20);
  receipt(o10, { qty: 4, byProductKg: 16, date: '2026-09-09' });
  orders.push(o10);

  // 5 · PRD-0011 Bracket × 100 — Completed with FG inspection passed (LOT-PRD-0011-1)
  const o11 = mkOrder({ id: 'prd_0011', n: 11, it: I.bracket, bom: B2, routing: RB, qty: 100, date: '2026-08-30', start: '2026-09-01', end: '2026-09-04', status: 'Released', extra: { releasedAt: T('2026-08-31'), releasedBy: 'Anil Deshmukh', mrpRunId: 'mrp_003' } });
  issue(o11, '2026-09-01', [{ it: I.steel4, qty: 1.236, batch: 'HR-2603-A' }, { it: I.bolt, qty: 400 }, { it: I.nut, qty: 400 }, { it: I.grease, qty: 1 }]);
  opDone(o11, 'Cut', '2026-09-01', 30, 150); opDone(o11, 'Weld', '2026-09-02', 20, 300); opDone(o11, 'Grind', '2026-09-03', 10, 200); opDone(o11, 'Inspect', '2026-09-04', 5, 50);
  const r11 = receipt(o11, { qty: 100, byProductKg: 60, date: '2026-09-04' });
  inspection({ type: 'Finished goods', it: I.bracket, plan: plans[0], refType: 'Production Receipt', refId: r11.id, refNumber: r11.number, lotQty: 100, date: '2026-09-04', status: 'Completed', results: [true, true, true], values: ['119.8', '', '60.0'], accepted: 100, rejected: 0, disposition: 'Accept', batch: r11.batch });
  orders.push(o11);

  // 6 · PRD-0012 Bracket × 120 — Partially Completed (60 posted, 30 on QC hold), late
  const o12 = mkOrder({ id: 'prd_0012', n: 12, it: I.bracket, bom: B2, routing: RB, qty: 120, date: '2026-09-06', start: '2026-09-08', end: '2026-09-12', status: 'Released', extra: { releasedAt: T('2026-09-07'), releasedBy: 'Anil Deshmukh', sourceDemand: { type: 'Sales Order', id: 'so_0126', number: 'SO/26-27/0126', customerName: 'Vimal Corporation' } } });
  issue(o12, '2026-09-08', [{ it: I.steel4, qty: 1.484, batch: 'HR-2603-A' }, { it: I.bolt, qty: 480 }, { it: I.nut, qty: 480 }, { it: I.grease, qty: 2 }]);
  opDone(o12, 'Cut', '2026-09-08', 30, 185); opDone(o12, 'Weld', '2026-09-09', 25, 370); opDone(o12, 'Grind', '2026-09-11', 10, 130, { status: 'In Progress', completedQty: 90 });
  receipt(o12, { qty: 60, byProductKg: 36, date: '2026-09-11' });
  const r12h = receipt(o12, { qty: 30, hold: true, date: '2026-09-12' });
  const qcHold = inspection({ type: 'Finished goods', it: I.bracket, plan: plans[0], refType: 'Production Receipt', refId: r12h.id, refNumber: r12h.number, lotQty: 30, date: '2026-09-12', status: 'Open', batch: r12h.batch, notes: 'Awaiting coating thickness readings' });
  r12h.inspectionId = qcHold.id; r12h.inspectionNumber = qcHold.number;
  orders.push(o12);

  // 7 · PRD-0013 Frame × 3 — In Progress (partial issue, weld in progress)
  const o13 = mkOrder({ id: 'prd_0013', n: 13, it: I.frame, bom: BF, routing: RF, qty: 3, date: '2026-09-09', start: '2026-09-10', end: '2026-09-17', status: 'Released', extra: { releasedAt: T('2026-09-09'), releasedBy: 'Anil Deshmukh', sourceDemand: { type: 'Sales Order', id: 'so_0127', number: 'SO/26-27/0127', customerName: 'Delta Engineering' } } });
  issue(o13, '2026-09-10', [{ it: I.steel6, qty: 0.245, batch: 'CR-2603-B' }, { it: I.electrode, qty: 1.5 }]);
  opDone(o13, 'Cut', '2026-09-10', 30, 40); opDone(o13, 'Weld', '2026-09-11', 45, 60, { status: 'In Progress', completedQty: 1 });
  orders.push(o13);

  // 8 · PRD-0014 Bracket × 80 — Released, nothing issued yet
  orders.push(mkOrder({ id: 'prd_0014', n: 14, it: I.bracket, bom: B2, routing: RB, qty: 80, date: '2026-09-11', start: '2026-09-14', end: '2026-09-16', status: 'Released', extra: { releasedAt: T('2026-09-12'), releasedBy: 'Anil Deshmukh' } }));
  // 9 · PRD-0015 Frame × 6 — Planned
  orders.push(mkOrder({ id: 'prd_0015', n: 15, it: I.frame, bom: BF, routing: RF, qty: 6, date: '2026-09-12', start: '2026-09-21', end: '2026-09-30', status: 'Planned', extra: { sourceDemand: { type: 'Sales Order', id: 'so_0129', number: 'SO/26-27/0129', customerName: 'Global Tech Solutions' } } }));
  // 10 · PRD-0016 Bracket × 50 — Planned from MRP-004
  orders.push(mkOrder({ id: 'prd_0016', n: 16, it: I.bracket, bom: B2, routing: RB, qty: 50, date: '2026-09-12', start: '2026-09-16', end: '2026-09-17', status: 'Planned', extra: { mrpRunId: 'mrp_004', sourceDemand: { type: 'Sales Order', id: 'so_0126', number: 'SO/26-27/0126', customerName: 'Vimal Corporation' }, notes: 'From MRP-004: shortfall 50 Nos against SO/26-27/0126' } }));
  // 11 · PRD-0017 Bracket × 300 — Draft
  orders.push(mkOrder({ id: 'prd_0017', n: 17, it: I.bracket, bom: B2, routing: RB, qty: 300, date: '2026-09-13', start: '2026-09-28', end: '2026-10-03', status: 'Draft', extra: { notes: 'Make-to-stock replenishment for Q3 — awaiting steel GRN' } }));
  // 12 · PRD-0018 Frame × 2 — Cancelled
  orders.push(mkOrder({ id: 'prd_0018', n: 18, it: I.frame, bom: BF, routing: RF, qty: 2, date: '2026-09-03', start: '2026-09-05', end: '2026-09-11', status: 'Cancelled', extra: { reasonForCancel: 'Customer withdrew purchase order DE/PO/0912 before release', cancelledAt: T('2026-09-06'), sourceDemand: { type: 'Sales Order', id: 'so_0122', number: 'SO/26-27/0122', customerName: 'Delta Engineering' } } }));

  // incoming inspections on GRNs (purchase module documents, referenced by id only)
  inspection({ type: 'Incoming', it: I.steel4, plan: plans[2], refType: 'GRN', refId: 'grn_0062', refNumber: 'GRN/26-27/0062', refLineId: 'gl1', lotQty: 2, date: '2026-09-11', status: 'Completed', results: [true, true, true], values: ['4.02', '', ''], accepted: 2, rejected: 0, disposition: 'Accept', batch: 'BSS-0911' });
  inspection({ type: 'Incoming', it: I.bolt, plan: plans[3], refType: 'GRN', refId: 'grn_0061', refNumber: 'GRN/26-27/0061', refLineId: 'gl1', lotQty: 280, date: '2026-09-09', status: 'Completed', results: [true, false], values: ['', ''], accepted: 260, rejected: 20, disposition: 'Return', notes: 'Zinc plating flaking on ~7% of sample — 20 Nos segregated for return to National Hardware' });

  orders.forEach((o) => { o.costs = costsOf(o); o.updatedAt = T(o.closedAt?.slice(0, 10) ?? o.completedAt?.slice(0, 10) ?? o.actualStart ?? o.date, '18:00'); });

  // MRP run (12 Sep) — partially converted
  const mrp: MrpRun[] = [
    rec<MrpRun>('mrp_003', { companyId: co, number: 'MRP-003', date: '2026-08-29', branchId: IDS.brAndheri, params: { horizonDays: 30, includeSafetyStock: true, lotSizing: 'Lot-for-lot', includeDrafts: false }, status: 'Converted', runBy: 'Anil Deshmukh', summary: { itemsPlanned: 9, shortfalls: 1, purchase: 0, production: 1, transfer: 0, value: 130800 }, details: [{ itemId: I.bracket.id, itemCode: I.bracket.code, itemName: I.bracket.name, uom: 'Nos', onHand: 148, reserved: 120, openPo: 0, plannedReceipts: 0, safetyStock: 50, independentDemand: 78, dependentDemand: 0, netRequirement: 100, shortfall: 100, hasBom: true }], suggestions: [{ id: 'sug_3a', type: 'Production', itemId: I.bracket.id, itemCode: I.bracket.code, itemName: I.bracket.name, qty: 100, uom: 'Nos', needBy: '2026-09-05', orderBy: '2026-09-01', reason: 'Shortfall 100 Nos (sales demand 78 · safety stock 50 · on hand 148 · reserved 120) · BOM BOM-001 v2', demandRefs: [{ type: 'Sales Order', id: 'so_0121', number: 'SO/26-27/0121', qty: 78, date: '2026-09-05' }], bomId: B2.id, estValue: 130800, status: 'Converted', convertedDocId: 'prd_0011', convertedDocNumber: 'PRD/26-27/0011', convertedDocType: 'Production Order' }], createdAt: T('2026-08-29'), updatedAt: T('2026-08-31') }),
    rec<MrpRun>('mrp_004', { companyId: co, number: 'MRP-004', date: '2026-09-12', branchId: IDS.brAndheri, params: { horizonDays: 30, includeSafetyStock: true, lotSizing: 'Fixed qty', includeDrafts: false }, status: 'Partially Converted', runBy: 'Anil Deshmukh', summary: { itemsPlanned: 11, shortfalls: 4, purchase: 2, production: 1, transfer: 1, value: 2358400 },
      details: [
        { itemId: I.bracket.id, itemCode: I.bracket.code, itemName: I.bracket.name, uom: 'Nos', onHand: 384, reserved: 170, openPo: 0, plannedReceipts: 90, safetyStock: 50, independentDemand: 270, dependentDemand: 36, netRequirement: 52, shortfall: 52, hasBom: true },
        { itemId: I.frame.id, itemCode: I.frame.code, itemName: I.frame.name, uom: 'Nos', onHand: 17, reserved: 6, openPo: 0, plannedReceipts: 9, safetyStock: 5, independentDemand: 12, dependentDemand: 0, netRequirement: -3, shortfall: 0, hasBom: true },
        { itemId: I.steel4.id, itemCode: I.steel4.code, itemName: I.steel4.name, uom: 'MT', onHand: 41.44, reserved: 4, openPo: 0, plannedReceipts: 0, safetyStock: 10, independentDemand: 5, dependentDemand: 5.31, netRequirement: -17.13, shortfall: 0, hasBom: false },
        { itemId: I.steel6.id, itemCode: I.steel6.code, itemName: I.steel6.name, uom: 'MT', onHand: 24.02, reserved: 1, openPo: 0, plannedReceipts: 0, safetyStock: 8, independentDemand: 1, dependentDemand: 0.49, netRequirement: -13.53, shortfall: 0, hasBom: false },
        { itemId: I.bolt.id, itemCode: I.bolt.code, itemName: I.bolt.name, uom: 'Nos', onHand: 6220, reserved: 4200, openPo: 0, plannedReceipts: 0, safetyStock: 1000, independentDemand: 6200, dependentDemand: 520, netRequirement: 5700, shortfall: 5700, hasBom: false },
        { itemId: I.nut.id, itemCode: I.nut.code, itemName: I.nut.name, uom: 'Nos', onHand: 8920, reserved: 3700, openPo: 0, plannedReceipts: 0, safetyStock: 1000, independentDemand: 4700, dependentDemand: 520, netRequirement: 1000, shortfall: 1000, hasBom: false },
        { itemId: I.grease.id, itemCode: I.grease.code, itemName: I.grease.name, uom: 'Tin', onHand: 5, reserved: 6, openPo: 0, plannedReceipts: 0, safetyStock: 3, independentDemand: 12, dependentDemand: 1.3, netRequirement: 17.3, shortfall: 17.3, hasBom: false },
        { itemId: I.electrode.id, itemCode: I.electrode.code, itemName: I.electrode.name, uom: 'Kg', onHand: 54, reserved: 0, openPo: 0, plannedReceipts: 0, safetyStock: 20, independentDemand: 100, dependentDemand: 4.5, netRequirement: 70.5, shortfall: 70.5, hasBom: false },
      ],
      suggestions: [
        { id: 'sug_4a', type: 'Production', itemId: I.bracket.id, itemCode: I.bracket.code, itemName: I.bracket.name, qty: 50, uom: 'Nos', needBy: '2026-09-18', orderBy: '2026-09-16', reason: 'Shortfall 52 Nos (sales demand 270 · production demand 36 · safety stock 50 · on hand 384 · reserved 170 · planned receipts 90) · BOM BOM-001 v2 · lead 10 d', demandRefs: [{ type: 'Sales Order', id: 'so_0126', number: 'SO/26-27/0126', qty: 50, date: '2026-09-18' }], bomId: B2.id, estValue: 65400, status: 'Converted', convertedDocId: 'prd_0016', convertedDocNumber: 'PRD/26-27/0016', convertedDocType: 'Production Order' },
        { id: 'sug_4b', type: 'Purchase', itemId: I.bolt.id, itemCode: I.bolt.code, itemName: I.bolt.name, qty: 10000, uom: 'Nos', needBy: '2026-09-20', orderBy: '2026-09-10', reason: 'Shortfall 5700 Nos (sales demand 6200 · production demand 520 · safety stock 1000 · on hand 6220 · reserved 4200) · lead time 10 d · Fixed qty', demandRefs: [{ type: 'Sales Order', id: 'so_0128', number: 'SO/26-27/0128', qty: 3000, date: '2026-09-20' }, { type: 'Sales Order', id: 'so_0126', number: 'SO/26-27/0126', qty: 2000, date: '2026-09-18' }], supplierId: IDS.sNational, supplierName: 'National Hardware Co', estValue: 280000, status: 'Accepted' },
        { id: 'sug_4c', type: 'Purchase', itemId: I.electrode.id, itemCode: I.electrode.code, itemName: I.electrode.name, qty: 100, uom: 'Kg', needBy: '2026-09-22', orderBy: '2026-09-15', reason: 'Shortfall 70.5 Kg (sales demand 100 · production demand 4.5 · safety stock 20 · on hand 54) · lead time 7 d · Fixed qty', demandRefs: [{ type: 'Sales Order', id: 'so_0125', number: 'SO/26-27/0125', qty: 100, date: '2026-09-22' }], supplierId: IDS.sNational, supplierName: 'National Hardware Co', estValue: 185000, status: 'Suggested' },
        { id: 'sug_4d', type: 'Purchase', itemId: I.grease.id, itemCode: I.grease.code, itemName: I.grease.name, qty: 24, uom: 'Tin', needBy: '2026-09-18', orderBy: '2026-09-13', reason: 'Shortfall 17.3 Tin (sales demand 12 · production demand 1.3 · safety stock 3 · on hand 5 · reserved 6) · lead time 5 d · Fixed qty', demandRefs: [{ type: 'Sales Order', id: 'so_0128', number: 'SO/26-27/0128', qty: 6, date: '2026-09-18' }], supplierId: IDS.sShree, supplierName: 'Shree Suppliers Ltd', estValue: 67200, status: 'Rejected' },
        { id: 'sug_4e', type: 'Purchase', itemId: I.nut.id, itemCode: I.nut.code, itemName: I.nut.name, qty: 5000, uom: 'Nos', needBy: '2026-09-20', orderBy: '2026-09-10', reason: 'Shortfall 1000 Nos (sales demand 4700 · production demand 520 · safety stock 1000 · on hand 8920 · reserved 3700) · lead time 10 d · Fixed qty', demandRefs: [{ type: 'Sales Order', id: 'so_0128', number: 'SO/26-27/0128', qty: 1500, date: '2026-09-20' }], supplierId: IDS.sNational, supplierName: 'National Hardware Co', estValue: 90000, status: 'Suggested' },
      ], createdAt: T('2026-09-12'), updatedAt: T('2026-09-12') }),
  ];

  return {
    [C.items]: items as any, [C.suppliers]: suppliers as any, [C.warehouses]: warehouses as any, [C.accounts]: accounts as any,
    [C.workCentres]: workCentres as any, [C.routings]: routings as any, [C.boms]: boms as any, [C.inspectionPlans]: plans as any,
    [C.productionOrders]: orders as any, [C.materialIssues]: issues as any, [C.productionReceipts]: receipts as any, [C.qualityInspections]: inspections as any,
    [C.subcontractOrders]: subs as any, [C.mrpRuns]: mrp as any, [C.wipEntries]: wip as any,
    [C.stockMovements]: moves as any, [C.journals]: journals as any, [C.openItems]: openItems as any,
  };
}
