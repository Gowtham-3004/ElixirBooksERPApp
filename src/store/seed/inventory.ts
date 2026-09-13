// Seed data for the inventory module: opening stock, movements behind the
// seeded GRNs / transfers / adjustments / purchase return / landed cost,
// adjustments, transfers, a stock count in progress and one landed-cost doc.
// Deliveries and reservations are seeded by the sales module.
import type { DB } from '../db';
import type { Journal, StockMovement, StockMoveType } from '../types';
import type { StockAdjustment, AdjustmentLine, StockTransfer, TransferLine, StockCount, LandedCost } from '../../modules/inventory/types';
import { C } from '../collections';
import { IDS } from './core';
import { ITM, jv, mkLine, mkTotals } from './purchase';

const co = IDS.acme;
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const WH_NAME: Record<string, string> = { [IDS.whMain]: 'Main WH', [IDS.whAndheri]: 'Andheri WH', [IDS.whTransit]: 'In-Transit', wh_scrap: 'Scrap Yard', wh_wip: 'Shop Floor WIP' };

interface ItemRef { id: string; code: string; name: string; uom: string; rate: number; invAcc: string }
const I: Record<string, ItemRef> = {
  steel4: { id: IDS.iSteel4, code: 'STL-4MM-HR', name: 'Steel Plates 4mm HR', uom: 'MT', rate: 85000, invAcc: IDS.accInvRM },
  steel6: { id: IDS.iSteel6, code: 'STL-6MM-CR', name: 'Steel Plates 6mm CR', uom: 'MT', rate: 92000, invAcc: IDS.accInvRM },
  crate: { id: IDS.iCrate, code: 'PKG-CRATE-L', name: 'Wooden Crates Large', uom: 'Nos', rate: 850, invAcc: IDS.accInvFG },
  box: { id: IDS.iBox, code: 'PKG-BOX-M', name: 'Corrugated Box Medium', uom: 'Nos', rate: 85, invAcc: IDS.accInvFG },
  bolt: { id: IDS.iBolt, code: 'HW-BOLT-M16', name: 'Hex Bolt M16 × 60', uom: 'Nos', rate: 28, invAcc: IDS.accInvFG },
  nut: { id: IDS.iNut, code: 'HW-NUT-M16', name: 'Hex Nut M16', uom: 'Nos', rate: 18, invAcc: IDS.accInvFG },
  grease: { id: IDS.iGrease, code: 'LUB-GRS-2', name: 'Grease EP-2 15 kg', uom: 'Tin', rate: 2800, invAcc: IDS.accInvFG },
  wheel: { id: IDS.iGrind, code: 'GRD-WHL-180', name: 'Grinding Wheel 180mm', uom: 'Nos', rate: 380, invAcc: IDS.accInvFG },
  electrode: { id: IDS.iElectrode, code: 'ELEC-WLD-200', name: 'Electrode Welding 200A', uom: 'Kg', rate: 1850, invAcc: IDS.accInvFG },
  chai: { id: IDS.iChai, code: 'SKU-10021', name: 'Masala Chai 250 g', uom: 'pcs', rate: 110, invAcc: IDS.accInvFG },
  assam: { id: IDS.iAssam, code: 'SKU-10034', name: 'Premium Assam Tea 500 g', uom: 'pcs', rate: 290, invAcc: IDS.accInvFG },
  green: { id: IDS.iGreen, code: 'SKU-10019', name: 'Green Tea Sachets (Box 25)', uom: 'box', rate: 220, invAcc: IDS.accInvFG },
  darj: { id: IDS.iDarj, code: 'SKU-10055', name: 'Darjeeling First Flush 100 g', uom: 'pcs', rate: 650, invAcc: IDS.accInvFG },
  bracket: { id: IDS.iBracket, code: 'FG-BRKT-STD', name: 'Steel Mounting Bracket (Std)', uom: 'Nos', rate: 1240, invAcc: IDS.accInvFG },
  frame: { id: IDS.iFrame, code: 'FG-FRAME-L', name: 'Welded Frame Assembly L', uom: 'Nos', rate: 8900, invAcc: IDS.accInvFG },
};

let seq = 0;
function mv(date: string, item: ItemRef, wh: string, qty: number, type: StockMoveType, sourceType: string, sourceId: string, sourceNumber: string, extra: Partial<StockMovement> = {}): StockMovement {
  seq += 1;
  const rate = extra.rate ?? item.rate;
  return {
    id: `sm_${String(seq).padStart(4, '0')}`, companyId: co, createdAt: `${date}T08:00:00.000Z`, updatedAt: `${date}T08:00:00.000Z`, createdBy: 'seed', version: 1,
    date, itemId: item.id, itemCode: item.code, itemName: item.name, warehouseId: wh, warehouseName: WH_NAME[wh] ?? wh, qty, uom: item.uom, baseQty: qty, rate, value: r2(Math.abs(qty) * rate),
    type, sourceType, sourceId, sourceNumber, ...extra,
  };
}

export function seedInventory(): Partial<DB> {
  const moves: StockMovement[] = [];
  const journals: Journal[] = [];
  const OPEN = '2026-04-01';
  const op = (item: ItemRef, wh: string, qty: number, extra: Partial<StockMovement> = {}) => moves.push(mv(OPEN, item, wh, qty, 'Opening', 'Opening Stock', 'opening_2026', 'OPENING/2026-27', { bin: wh === IDS.whMain ? 'A-01' : 'R1', ...extra }));

  // Opening stock — sized so that opening + ALL seeded movements (purchase GRNs, transfers,
  // adjustments plus the sales / POS / production seeds) lands on the legacy stock-on-hand
  // figures, and no item+warehouse ever goes negative at any point in the timeline.
  op(I.steel4, IDS.whMain, 56.804, { batch: 'HR-2603-A' });
  op(I.steel4, IDS.whAndheri, 5, { batch: 'HR-2603-A' });
  op(I.steel6, IDS.whMain, 17.734, { batch: 'CR-2603-B', bin: 'A-02' });
  op(I.steel6, IDS.whAndheri, 6, { batch: 'CR-2603-B' });
  op(I.crate, IDS.whMain, 320, { bin: 'B-01' });
  op(I.crate, IDS.whAndheri, 30);
  op(I.box, IDS.whMain, 2111, { bin: 'B-01' });
  op(I.box, IDS.whAndheri, 530, { bin: 'R2' });
  op(I.bolt, IDS.whMain, 8599, { bin: 'B-02' });
  op(I.bolt, IDS.whAndheri, 3000, { bin: 'R3' });
  op(I.nut, IDS.whMain, 10011, { bin: 'B-02' });
  op(I.nut, IDS.whAndheri, 2000, { bin: 'R3' });
  op(I.grease, IDS.whMain, 18.1, { bin: 'B-02' });
  op(I.wheel, IDS.whMain, 150, { bin: 'B-02' });
  op(I.electrode, IDS.whMain, 60, { bin: 'B-02' });
  op(I.chai, IDS.whMain, 194, { batch: 'CH-2608', expiryDate: '2027-02-28', bin: 'A-01' });
  op(I.assam, IDS.whMain, 135, { batch: 'AS-2607', expiryDate: '2027-01-31', bin: 'A-01' });
  op(I.green, IDS.whMain, 100, { bin: 'A-01' });
  op(I.darj, IDS.whMain, 64, { bin: 'A-01' });
  op(I.bracket, IDS.whAndheri, 120, { batch: 'BR-2609-01', bin: 'R1' });
  op(I.frame, IDS.whAndheri, 8, { serials: Array.from({ length: 8 }, (_, i) => `FR-L-26${String(i + 1).padStart(3, '0')}`), bin: 'R1' });

  // Transfers (FR-INV-006)
  const trLine = (id: string, item: ItemRef, qty: number, extra: Partial<TransferLine> = {}): TransferLine => ({ id, itemId: item.id, itemCode: item.code, itemName: item.name, qty, uom: item.uom, rate: item.rate, discountPct: 0, discountAmt: 0, taxable: r2(qty * item.rate), taxRate: 0, taxAmt: 0, taxComponents: {}, amount: r2(qty * item.rate), ...extra });
  const trf = (id: string, num: string, date: string, from: string, to: string, status: StockTransfer['status'], lines: TransferLine[], extra: Partial<StockTransfer> = {}): StockTransfer => ({
    id, companyId: co, createdAt: `${date}T08:00:00.000Z`, updatedAt: `${date}T09:00:00.000Z`, createdBy: 'seed', version: 1, number: num, docType: 'Stock Transfer', date, branchId: IDS.brHO, status, currency: 'INR', rate: 1,
    fromWarehouseId: from, fromWarehouseName: WH_NAME[from], toWarehouseId: to, toWarehouseName: WH_NAME[to], lines, totals: { ...mkTotals([]), total: r2(lines.reduce((s, l) => s + l.amount, 0)), baseTotal: r2(lines.reduce((s, l) => s + l.amount, 0)) }, totalValue: r2(lines.reduce((s, l) => s + l.amount, 0)),
    fy: '2026-27', period: date.slice(0, 7), correlationId: `corr_${id}`, dispatchedAt: `${date}T09:00:00.000Z`, dispatchedBy: 'Suresh Kumar', ...extra,
  });
  const transfers: StockTransfer[] = [
    trf('trf_0008', 'TRF/26-27/0008', '2026-09-05', IDS.whMain, IDS.whAndheri, 'Completed', [trLine('tl1', I.steel4, 5, { receivedQty: 5, batch: 'HR-2603-A' })], { receivedAt: '2026-09-06T11:00:00.000Z', receivedBy: 'Suresh Kumar', vehicleNo: 'MH-02-AB-1122', notes: 'Plates for fabrication batch PRJ-042' }),
    trf('trf_0007', 'TRF/26-27/0007', '2026-09-02', IDS.whMain, IDS.whAndheri, 'In Transit', [trLine('tl1', I.crate, 100)], { vehicleNo: 'MH-02-AB-1122' }),
    trf('trf_0006', 'TRF/26-27/0006', '2026-08-28', IDS.whAndheri, IDS.whMain, 'Completed', [trLine('tl1', I.bolt, 1000, { receivedQty: 1000 })], { receivedAt: '2026-08-28T16:00:00.000Z', receivedBy: 'Suresh Kumar' }),
    trf('trf_0005', 'TRF/26-27/0005', '2026-08-22', IDS.whMain, IDS.whAndheri, 'Completed', [trLine('tl1', I.box, 400, { receivedQty: 400 })], { receivedAt: '2026-08-23T10:00:00.000Z', receivedBy: 'Suresh Kumar' }),
  ];
  const dispatch = (t: StockTransfer, date: string) => t.lines.forEach((l) => { const it = Object.values(I).find((x) => x.id === l.itemId)!; moves.push(mv(date, it, t.fromWarehouseId, -l.qty, 'Transfer Out', 'Stock Transfer', t.id, t.number, { batch: l.batch })); moves.push(mv(date, it, IDS.whTransit, l.qty, 'Transfer In', 'Stock Transfer', t.id, t.number, { batch: l.batch })); });
  const receive = (t: StockTransfer, date: string) => t.lines.forEach((l) => { const it = Object.values(I).find((x) => x.id === l.itemId)!; moves.push(mv(date, it, IDS.whTransit, -(l.receivedQty ?? l.qty), 'Transfer Out', 'Stock Transfer', t.id, t.number, { batch: l.batch })); moves.push(mv(date, it, t.toWarehouseId, l.receivedQty ?? l.qty, 'Transfer In', 'Stock Transfer', t.id, t.number, { batch: l.batch })); });

  // Adjustments (FR-INV-005)
  const adjLine = (id: string, item: ItemRef, qty: number, wh: string, reasonCode: string, batch?: string): AdjustmentLine => ({ id, itemId: item.id, itemCode: item.code, itemName: item.name, qty, uom: item.uom, rate: item.rate, discountPct: 0, discountAmt: 0, taxable: 0, taxRate: 0, taxAmt: 0, taxComponents: {}, amount: r2(Math.abs(qty) * item.rate), value: r2(Math.abs(qty) * item.rate), warehouseId: wh, reasonCode, batch });
  const adj = (id: string, num: string, date: string, wh: string, type: StockAdjustment['adjustmentType'], reasonCode: string, reason: string, status: StockAdjustment['status'], lines: AdjustmentLine[], extra: Partial<StockAdjustment> = {}): StockAdjustment => ({
    id, companyId: co, createdAt: `${date}T08:00:00.000Z`, updatedAt: `${date}T09:00:00.000Z`, createdBy: 'seed', version: 1, number: num, docType: 'Stock Adjustment', date, branchId: IDS.brHO, status, currency: 'INR', rate: 1,
    warehouseId: wh, warehouseName: WH_NAME[wh], adjustmentType: type, reasonCode, reason, lines, totals: { ...mkTotals([]), total: r2(lines.reduce((s, l) => s + l.value, 0)), baseTotal: r2(lines.reduce((s, l) => s + l.value, 0)) }, totalValue: r2(lines.reduce((s, l) => s + l.value, 0)),
    fy: '2026-27', period: date.slice(0, 7), correlationId: `corr_${id}`, submittedAt: `${date}T08:30:00.000Z`, submittedBy: 'Suresh Kumar', ...extra,
  });
  const adjustments: StockAdjustment[] = [
    adj('adj_0012', 'ADJ/26-27/0012', '2026-09-07', IDS.whAndheri, 'Write-off', 'WRITEOFF', 'Damaged in storage — water ingress at R2', 'Posted', [adjLine('al1', I.box, -80, IDS.whAndheri, 'WRITEOFF')], { approverName: 'Rahul Kumar', postedAt: '2026-09-07T12:00:00.000Z', postedBy: 'Rahul Kumar', journalId: 'jv_adj_0012', journalNumber: 'JV/26-27/0352' }),
    adj('adj_0011', 'ADJ/26-27/0011', '2026-09-01', IDS.whMain, 'Count variance', 'COUNTVAR', 'Physical count variance — 2 tins found behind rack B-02', 'Posted', [adjLine('al1', I.grease, 2, IDS.whMain, 'COUNTVAR')], { approverName: 'Anita Rao', postedAt: '2026-09-01T12:00:00.000Z', postedBy: 'Anita Rao', journalId: 'jv_adj_0011', journalNumber: 'JV/26-27/0351' }),
    adj('adj_0010', 'ADJ/26-27/0010', '2026-08-25', IDS.whMain, 'Write-off', 'WRITEOFF', 'Rusted — unusable, scrapped', 'Posted', [adjLine('al1', I.nut, -200, IDS.whMain, 'WRITEOFF')], { approverName: 'Rahul Kumar', postedAt: '2026-08-25T12:00:00.000Z', postedBy: 'Rahul Kumar', journalId: 'jv_adj_0010', journalNumber: 'JV/26-27/0350' }),
    adj('adj_0009', 'ADJ/26-27/0009', '2026-08-20', IDS.whAndheri, 'Count variance', 'COUNTVAR', 'Count reconciliation — weighbridge re-measure shows 0.5 MT more', 'Submitted', [adjLine('al1', I.steel6, 0.5, IDS.whAndheri, 'COUNTVAR', 'CR-2603-B')]),
  ];
  const postAdj = (a: StockAdjustment) => {
    a.lines.forEach((l) => { const it = Object.values(I).find((x) => x.id === l.itemId)!; moves.push(mv(a.date, it, a.warehouseId, l.qty, 'Adjustment', 'Stock Adjustment', a.id, a.number, { batch: l.batch, journalId: a.journalId })); });
    const inv = a.lines.reduce((s, l) => s + l.qty * l.rate, 0);
    const acc = Object.values(I).find((x) => x.id === a.lines[0].itemId)!.invAcc;
    journals.push(jv(a.journalId!, a.journalNumber!, a.date, 'Stock Adjustment', a.id, a.number, `${a.adjustmentType} · ${a.number} · ${a.reason}`, inv < 0 ? [{ acc: IDS.accInvAdj, dr: r2(-inv) }, { acc, cr: r2(-inv) }] : [{ acc, dr: r2(inv) }, { acc: IDS.accInvAdj, cr: r2(inv) }]));
  };

  // GRN movements (posted GRNs from the purchase seed) — accepted qty only
  const grnMv = (date: string, grnId: string, grnNum: string, lines: { item: ItemRef; qty: number; wh: string; rate: number; batch?: string; bin?: string }[], jid: string) => lines.forEach((l) => moves.push(mv(date, l.item, l.wh, l.qty, 'GRN', 'GRN', grnId, grnNum, { rate: l.rate, batch: l.batch, bin: l.bin, journalId: jid })));
  grnMv('2026-08-14', 'grn_0057', 'GRN/26-27/0057', [{ item: I.steel6, qty: 3, wh: IDS.whMain, rate: 92000, batch: 'VTC-0814', bin: 'A-02' }], 'jv_grn_0057');
  dispatch(transfers[3], '2026-08-22'); receive(transfers[3], '2026-08-23');
  postAdj(adjustments[2]);
  dispatch(transfers[2], '2026-08-28'); receive(transfers[2], '2026-08-28');
  grnMv('2026-09-01', 'grn_0058', 'GRN/26-27/0058', [{ item: I.crate, qty: 20, wh: IDS.whAndheri, rate: 850, bin: 'R1' }, { item: I.box, qty: 200, wh: IDS.whAndheri, rate: 85, bin: 'R2' }], 'jv_grn_0058');
  postAdj(adjustments[1]);
  dispatch(transfers[1], '2026-09-02');
  dispatch(transfers[0], '2026-09-05'); receive(transfers[0], '2026-09-06');
  grnMv('2026-09-07', 'grn_0060', 'GRN/26-27/0060', [{ item: I.crate, qty: 100, wh: IDS.whAndheri, rate: 850, bin: 'R1' }, { item: I.box, qty: 150, wh: IDS.whAndheri, rate: 85, bin: 'R2' }], 'jv_grn_0060');
  postAdj(adjustments[0]);
  grnMv('2026-09-09', 'grn_0061', 'GRN/26-27/0061', [{ item: I.bolt, qty: 280, wh: IDS.whMain, rate: 28, bin: 'B-02' }, { item: I.nut, qty: 200, wh: IDS.whMain, rate: 18, bin: 'B-02' }], 'jv_grn_0061');
  moves.push(mv('2026-09-09', I.crate, IDS.whAndheri, -10, 'Purchase Return', 'Purchase Return', 'prt_0003', 'PRT/26-27/0003', { journalId: 'jv_dn_0008' }));
  grnMv('2026-09-11', 'grn_0062', 'GRN/26-27/0062', [{ item: I.steel4, qty: 2, wh: IDS.whMain, rate: 85000, batch: 'BSS-0911', bin: 'A-01' }, { item: I.bolt, qty: 250, wh: IDS.whMain, rate: 28, bin: 'B-01' }, { item: I.nut, qty: 500, wh: IDS.whMain, rate: 18, bin: 'B-01' }], 'jv_grn_0062');

  // Landed cost (FR-TRD-003) on GRN/26-27/0062 — freight + insurance allocated by value
  const lcBase = [{ lineId: 'gl1', item: I.steel4, qty: 2, value: 170000 }, { lineId: 'gl2', item: I.bolt, qty: 250, value: 7000 }, { lineId: 'gl3', item: I.nut, qty: 500, value: 9000 }];
  const lcTotal = 9700; const lcSum = lcBase.reduce((s, b) => s + b.value, 0);
  const allocations = lcBase.map((b, i) => { const allocated = i === lcBase.length - 1 ? r2(lcTotal - lcBase.slice(0, -1).reduce((s, x) => s + r2((lcTotal * x.value) / lcSum), 0)) : r2((lcTotal * b.value) / lcSum); return { id: `la${i + 1}`, grnId: 'grn_0062', grnNumber: 'GRN/26-27/0062', lineId: b.lineId, itemId: b.item.id, itemName: b.item.name, warehouseId: IDS.whMain, qty: b.qty, baseValue: b.value, weight: 0, allocated, newRate: r2((b.value + allocated) / b.qty) }; });
  const landedCosts: LandedCost[] = [{
    id: 'lc_0001', companyId: co, createdAt: '2026-09-12T08:00:00.000Z', updatedAt: '2026-09-12T09:00:00.000Z', createdBy: 'seed', version: 1, number: 'LC/26-27/0001', docType: 'Landed Cost', date: '2026-09-12', branchId: IDS.brHO, status: 'Posted', currency: 'INR', rate: 1,
    grnIds: ['grn_0062'], grnNumbers: ['GRN/26-27/0062'], basis: 'Value', costs: [{ id: 'c1', name: 'Freight — Speedway Logistics', supplierId: IDS.sTransport, supplierName: 'Speedway Logistics', amount: 8500, accountId: IDS.accFreight, reference: 'SL/2026/1902' }, { id: 'c2', name: 'Transit insurance', amount: 1200, accountId: IDS.accFreight, reference: 'ICICI Lombard MTP/8812' }],
    allocations, totalCost: lcTotal, lines: [], totals: { ...mkTotals([]), total: lcTotal, baseTotal: lcTotal }, fy: '2026-27', period: '2026-09', correlationId: 'corr_lc_0001', postedAt: '2026-09-12T10:00:00.000Z', postedBy: 'Rahul Kumar', journalId: 'jv_lc_0001', journalNumber: 'JV/26-27/0353', notes: 'Freight and insurance for BSS/DC/1187 capitalised',
  }];
  allocations.forEach((a) => { const it = Object.values(I).find((x) => x.id === a.itemId)!; moves.push(mv('2026-09-12', it, IDS.whMain, 0, 'Landed Cost', 'Landed Cost', 'lc_0001', 'LC/26-27/0001', { value: a.allocated, rate: 0, journalId: 'jv_lc_0001' })); });
  journals.push(jv('jv_lc_0001', 'JV/26-27/0353', '2026-09-12', 'Landed Cost', 'lc_0001', 'LC/26-27/0001', 'Landed cost LC/26-27/0001 capitalised on GRN/26-27/0062', [{ acc: IDS.accInvRM, dr: allocations[0].allocated }, { acc: IDS.accInvFG, dr: r2(allocations[1].allocated + allocations[2].allocated) }, { acc: IDS.accFreight, cr: lcTotal }]));

  // Stock count in progress (FR-INV-007) — Main WH, frozen 13 Sep
  const countRows: { item: ItemRef; system: number; counted: number | null; batch?: string }[] = [
    { item: I.steel4, system: 38.5, counted: 38.5 }, { item: I.steel6, system: 19, counted: 19.5 }, { item: I.crate, system: 200, counted: 198 }, { item: I.box, system: 1200, counted: 1200 },
    { item: I.bolt, system: 6500, counted: 6500 }, { item: I.nut, system: 7200, counted: null }, { item: I.grease, system: 12, counted: 14 },
  ];
  const stockCounts: StockCount[] = [{
    id: 'sc_0003', companyId: co, createdAt: '2026-09-13T06:00:00.000Z', updatedAt: '2026-09-13T08:30:00.000Z', createdBy: 'seed', version: 1, number: 'SC/26-27/0003', docType: 'Stock Count', date: '2026-09-13', branchId: IDS.brHO, status: 'In Progress', currency: 'INR', rate: 1,
    warehouseId: IDS.whMain, warehouseName: 'Main WH', itemGroup: 'Steel, Packaging, Hardware, Consumables', frozenAt: '2026-09-13T06:00:00.000Z', lines: [], totals: mkTotals([]), fy: '2026-27', period: '2026-09', correlationId: 'corr_sc_0003',
    countLines: countRows.map((c, i) => ({ id: `cl${i + 1}`, itemId: c.item.id, itemCode: c.item.code, itemName: c.item.name, uom: c.item.uom, systemQty: c.system, countedQty: c.counted, rate: c.item.rate, countedBy: c.counted !== null ? 'Suresh Kumar' : undefined, countedAt: c.counted !== null ? '2026-09-13T08:15:00.000Z' : undefined })),
    notes: 'Quarterly cycle count — Main WH',
  }];

  // Keep the item helper referenced (mkLine/ITM are used by purchase seed; re-export pattern)
  void mkLine; void ITM;

  return { [C.stockMovements]: moves as any, [C.stockTransfers]: transfers as any, [C.stockAdjustments]: adjustments as any, [C.landedCosts]: landedCosts as any, [C.stockCounts]: stockCounts as any, [C.journals]: journals as any };
}
