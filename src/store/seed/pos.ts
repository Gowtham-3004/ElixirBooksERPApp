// Seed data for the POS module: terminals, shifts (one open for Suresh), ~40 bills over the
// last two weeks with journals + stock movements, 2 returns, held carts.
import type { DB } from '../db';
import type { DocLine, DocTotals, Item, Journal, JournalLine, StockMovement, TaxBreakupRow } from '../types';
import { C } from '../collections';
import { IDS, rec, seedMasters } from './core';
import { round } from '../../lib/format';
import type { PosBill, PosHeldCart, PosReturn, PosShift, PosTerminal, Tender } from '../../modules/pos/types';

const M = seedMasters();
const ITEMS = M[C.items] as unknown as Item[];
const ACCOUNTS = M[C.accounts] as unknown as { id: string; code: string; name: string }[];
const RETAIL: Record<string, number> = { [IDS.iChai]: 165, [IDS.iAssam]: 420, [IDS.iGreen]: 325, [IDS.iDarj]: 975, [IDS.iBolt]: 38, [IDS.iNut]: 25, [IDS.iCrate]: 1064, [IDS.iGrease]: 3100, [IDS.iGrind]: 420 };
const TAX: Record<string, number> = { [IDS.taxGST5]: 5, [IDS.taxGST12]: 12, [IDS.taxGST18]: 18 };
const BATCH: Record<string, string> = { [IDS.iChai]: 'CH-2609-A', [IDS.iAssam]: 'AS-2609-B' };
const CO = IDS.acme;
const T = (d: string, h = '10:00') => `${d}T${h}:00.000Z`;

// deterministic PRNG so the seed is stable
let seedN = 20260913;
const rnd = () => { seedN = (seedN * 1103515245 + 12345) & 0x7fffffff; return seedN / 0x7fffffff; };
const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];

let ln = 0, jl = 0, sm = 0, jv = 365;
function lines(specs: { item: string; qty: number; disc?: number }[], wh: string): { lines: DocLine[]; totals: DocTotals } {
  const comps: Record<string, number> = {};
  const breakup = new Map<string, TaxBreakupRow>();
  const out: DocLine[] = specs.map((s) => {
    const it = ITEMS.find((i) => i.id === s.item)!;
    const rate = RETAIL[it.id] ?? it.salesPrice;
    const pct = TAX[it.taxRateId ?? ''] ?? 0;
    const gross = round(s.qty * rate);
    const discountAmt = round((gross * (s.disc ?? 0)) / 100);
    const taxable = round((gross - discountAmt) / (1 + pct / 100));
    const c = { CGST: round((taxable * pct) / 200), SGST: round((taxable * pct) / 200) };
    const taxAmt = round(c.CGST + c.SGST);
    Object.entries(c).forEach(([k, v]) => { comps[k] = round((comps[k] ?? 0) + v); const key = `${k}|${pct / 2}|${it.hsn}`; const row = breakup.get(key) ?? { component: k, rate: pct / 2, hsn: it.hsn ?? '—', taxable: 0, tax: 0 }; row.taxable = round(row.taxable + taxable); row.tax = round(row.tax + v); breakup.set(key, row); });
    return { id: `pln_${String(++ln).padStart(4, '0')}`, itemId: it.id, itemCode: it.code, itemName: it.name, hsn: it.hsn, qty: s.qty, uom: it.baseUom, rate, listRate: rate, priceListName: 'Retail (MRP)', discountPct: s.disc ?? 0, discountAmt, taxable, taxRateId: it.taxRateId, taxRate: pct, taxAmt, taxComponents: c, taxTreatment: 'Taxable', reverseCharge: false, amount: round(taxable + taxAmt), warehouseId: wh, batch: BATCH[it.id], accountId: it.salesAccountId };
  });
  const subtotal = round(out.reduce((a, l) => a + round(l.qty * l.rate), 0));
  const discount = round(out.reduce((a, l) => a + l.discountAmt, 0));
  const taxable = round(out.reduce((a, l) => a + l.taxable, 0));
  const tax = round(Object.values(comps).reduce((a, b) => a + b, 0));
  const raw = round(taxable + tax);
  const roundOff = round(Math.round(raw) - raw);
  const total = round(raw + roundOff);
  return { lines: out, totals: { subtotal, discount, taxable, tax, components: comps, breakup: Array.from(breakup.values()), charges: 0, tds: 0, roundOff, total, paid: total, credited: 0, writtenOff: 0, due: 0, baseTotal: total } };
}
const acc = (id: string) => ACCOUNTS.find((a) => a.id === id) ?? { id, code: '', name: id };
function journal(id: string, date: string, ls: { accountId: string; dr?: number; cr?: number; taxComponent?: string; narration?: string }[], o: { sourceType: string; sourceId: string; sourceNumber: string; narration: string; branchId: string; idempotencyKey?: string }): Journal {
  const rows: JournalLine[] = ls.filter((l) => (l.dr ?? 0) !== 0 || (l.cr ?? 0) !== 0).map((l) => { const a = acc(l.accountId); return { id: `pjl_${String(++jl).padStart(4, '0')}`, accountId: a.id, accountCode: a.code, accountName: a.name, dr: round(l.dr ?? 0), cr: round(l.cr ?? 0), drBase: round(l.dr ?? 0), crBase: round(l.cr ?? 0), currency: 'INR', dimensions: { Branch: o.branchId }, narration: l.narration, taxComponent: l.taxComponent }; });
  const totalDr = round(rows.reduce((s, l) => s + l.drBase, 0)), totalCr = round(rows.reduce((s, l) => s + l.crBase, 0));
  if (Math.abs(totalDr - totalCr) > 0.011) throw new Error(`POS seed journal ${id} unbalanced ${totalDr} ${totalCr}`);
  return rec<Journal>(id, { companyId: CO, number: `JV/26-27/${String(jv++).padStart(4, '0')}`, date, period: date.slice(0, 7), fy: '2026-27', branchId: o.branchId, currency: 'INR', rate: 1, status: 'Posted', type: 'Auto', sourceType: o.sourceType, sourceId: o.sourceId, sourceNumber: o.sourceNumber, narration: o.narration, lines: rows, totalDr, totalCr, idempotencyKey: o.idempotencyKey, payloadHash: 'seed', postedAt: T(date), postedBy: 'Suresh Kumar', correlationId: `corr_${o.sourceId.toUpperCase()}`, createdAt: T(date), updatedAt: T(date) });
}
// Cost of goods sold for a POS bill / return. Without it the POS stock relief has no ledger
// counterpart and inventory control (1200/1210) drifts above the AVCO valuation (FR-INV-008).
function cogsJournal(id: string, date: string, ms: StockMovement[], src: { type: string; id: string; number: string }, branchId: string): Journal | undefined {
  const byAcc = new Map<string, number>();
  ms.forEach((m) => { const a = ITEMS.find((i) => i.id === m.itemId)?.inventoryAccountId ?? IDS.accInvFG; byAcc.set(a, round((byAcc.get(a) ?? 0) + (m.baseQty < 0 ? m.value : -m.value))); });
  const total = round(Array.from(byAcc.values()).reduce((a, b) => a + b, 0));
  if (Math.abs(total) < 0.005) return undefined;
  const ls = [
    ...(total > 0 ? [{ accountId: IDS.accCOGS, dr: total }] : [{ accountId: IDS.accCOGS, cr: -total }]),
    ...Array.from(byAcc.entries()).filter(([, v]) => Math.abs(v) >= 0.005).map(([a, v]) => (v > 0 ? { accountId: a, cr: v } : { accountId: a, dr: -v })),
  ];
  return journal(id, date, ls, { sourceType: src.type, sourceId: src.id, sourceNumber: src.number, narration: `${total > 0 ? 'Cost of goods sold' : 'Cost of goods returned to stock'} · ${src.number}`, branchId, idempotencyKey: `cogs:${src.id}` });
}

function move(date: string, l: DocLine, sign: 1 | -1, type: StockMovement['type'], src: { type: string; id: string; number: string }, journalId: string): StockMovement {
  const it = ITEMS.find((i) => i.id === l.itemId)!;
  const whName = (M[C.warehouses] as any[]).find((w) => w.id === l.warehouseId)?.name;
  return rec<StockMovement>(`psm_${String(++sm).padStart(4, '0')}`, { companyId: CO, date, itemId: it.id, itemCode: it.code, itemName: it.name, warehouseId: l.warehouseId!, warehouseName: whName, qty: sign * l.qty, uom: l.uom, baseQty: sign * l.qty, batch: l.batch, rate: it.purchasePrice, value: round(l.qty * it.purchasePrice), type, sourceType: src.type, sourceId: src.id, sourceNumber: src.number, journalId, createdAt: T(date), updatedAt: T(date) });
}

export function seedPos(): Partial<DB> {
  ln = 0; jl = 0; sm = 0; jv = 365; seedN = 20260913;
  const terminals: PosTerminal[] = [
    rec<PosTerminal>('post_01', { companyId: CO, code: 'T-01', name: 'Main counter', branchId: IDS.brHO, warehouseId: IDS.whMain, cashAccountId: IDS.accPettyCash, status: 'Active', location: 'Head Office · ground floor' }),
    rec<PosTerminal>('post_02', { companyId: CO, code: 'T-02', name: 'Andheri counter', branchId: IDS.brAndheri, warehouseId: IDS.whAndheri, cashAccountId: IDS.accPettyCash, status: 'Active', location: 'Andheri warehouse · retail window' }),
  ];
  const shiftDefs: { id: string; date: string; terminal: PosTerminal; cashierId: string; cashier: string; open?: boolean; float: number; bills: number; counted?: Record<string, number>; note?: string }[] = [
    { id: 'psh_01', date: '2026-09-04', terminal: terminals[1], cashierId: IDS.uAnita, cashier: 'Anita Rao', float: 3000, bills: 6 },
    { id: 'psh_02', date: '2026-09-08', terminal: terminals[1], cashierId: IDS.uAnita, cashier: 'Anita Rao', float: 3000, bills: 7 },
    { id: 'psh_03', date: '2026-09-11', terminal: terminals[0], cashierId: IDS.uSuresh, cashier: 'Suresh Kumar', float: 5000, bills: 9 },
    { id: 'psh_04', date: '2026-09-12', terminal: terminals[0], cashierId: IDS.uSuresh, cashier: 'Suresh Kumar', float: 5000, bills: 10, note: 'Cash short ₹60 — likely change error on POS/26-27/0030' },
    { id: 'psh_05', date: '2026-09-13', terminal: terminals[0], cashierId: IDS.uSuresh, cashier: 'Suresh Kumar', float: 5000, bills: 8, open: true },
  ];
  const bills: PosBill[] = [];
  const journals: Journal[] = [];
  const moves: StockMovement[] = [];
  const shifts: PosShift[] = [];
  const returns: PosReturn[] = [];
  let billNo = 1;
  const SKUS_MAIN = [IDS.iChai, IDS.iChai, IDS.iAssam, IDS.iDarj, IDS.iBolt, IDS.iNut, IDS.iCrate, IDS.iBolt];
  const SKUS_ANDHERI = [IDS.iBolt, IDS.iNut, IDS.iCrate, IDS.iBox, IDS.iBolt, IDS.iNut];
  const CUSTS: (string | undefined)[] = [undefined, undefined, undefined, undefined, IDS.cMetro, IDS.cDelta];
  shiftDefs.forEach((sd) => {
    const expected: Record<string, number> = { Cash: sd.float, Card: 0, UPI: 0, Credit: 0 };
    let sales = 0;
    const shiftNumber = `SHIFT-${sd.date.replace(/-/g, '')}-${sd.terminal.code}-01`;
    for (let k = 0; k < sd.bills; k++) {
      const n = 1 + Math.floor(rnd() * 3);
      const SKUS = sd.terminal.warehouseId === IDS.whAndheri ? SKUS_ANDHERI : SKUS_MAIN;
      const specs = Array.from({ length: n }, () => ({ item: pick(SKUS), qty: 1 + Math.floor(rnd() * 3), disc: rnd() < 0.15 ? 5 : 0 })).filter((s, i, a) => a.findIndex((x) => x.item === s.item) === i);
      const custId = pick(CUSTS);
      const cust = custId ? (M[C.customers] as any[]).find((c) => c.id === custId) : undefined;
      const { lines: ls, totals } = lines(specs, sd.terminal.warehouseId);
      const tType = rnd();
      const tenders: Tender[] = tType < 0.45 ? [{ type: 'Cash', amount: Math.ceil(totals.total / 100) * 100 }] : tType < 0.75 ? [{ type: 'UPI', amount: totals.total, reference: `UPI/${sd.date.replace(/-/g, '').slice(2)}/${String(Math.floor(rnd() * 90000) + 10000)}` }] : tType < 0.92 ? [{ type: 'Card', amount: totals.total, last4: String(1000 + Math.floor(rnd() * 9000)) }] : [{ type: 'Cash', amount: Math.floor(totals.total / 2) }, { type: 'UPI', amount: round(totals.total - Math.floor(totals.total / 2)), reference: `UPI/${sd.date.replace(/-/g, '').slice(2)}/${String(Math.floor(rnd() * 90000) + 10000)}` }];
      const tendered = round(tenders.reduce((a, t) => a + t.amount, 0));
      const change = round(Math.max(0, tendered - totals.total));
      const id = `posb_${String(billNo).padStart(3, '0')}`;
      const number = `POS/26-27/${String(billNo).padStart(4, '0')}`;
      billNo++;
      const hh = String(9 + Math.floor((k / sd.bills) * 9)).padStart(2, '0');
      const at = T(sd.date, `${hh}:${String(Math.floor(rnd() * 60)).padStart(2, '0')}`);
      const byAcc = new Map<string, number>();
      ls.forEach((l) => byAcc.set(l.accountId!, round((byAcc.get(l.accountId!) ?? 0) + l.taxable)));
      const jls = [...tenders.map((t) => ({ accountId: t.type === 'Cash' ? IDS.accPettyCash : IDS.accHDFC, dr: t.type === 'Cash' ? round(t.amount - change) : t.amount, narration: `${t.type}${t.reference ? ' ' + t.reference : ''}${t.last4 ? ' ****' + t.last4 : ''}` })), ...Array.from(byAcc.entries()).map(([a, v]) => ({ accountId: a, cr: v })), { accountId: IDS.accGSTOutputCGST, cr: totals.components.CGST ?? 0, taxComponent: 'CGST' }, { accountId: IDS.accGSTOutputSGST, cr: totals.components.SGST ?? 0, taxComponent: 'SGST' }, ...(totals.roundOff > 0 ? [{ accountId: IDS.accRoundOff, cr: totals.roundOff }] : totals.roundOff < 0 ? [{ accountId: IDS.accRoundOff, dr: -totals.roundOff }] : [])];
      const j = journal(`jv_${id}`, sd.date, jls, { sourceType: 'POS Bill', sourceId: id, sourceNumber: number, narration: `POS ${number} · ${sd.terminal.name} · ${sd.cashier}`, branchId: sd.terminal.branchId, idempotencyKey: `pos:cart_seed_${billNo}` });
      journals.push(j);
      const billMoves = ls.map((l) => move(sd.date, l, -1, 'POS Sale', { type: 'POS Bill', id, number }, j.id));
      const cj = cogsJournal(`jv_cogs_${id}`, sd.date, billMoves, { type: 'POS Bill', id, number }, sd.terminal.branchId);
      if (cj) { journals.push(cj); billMoves.forEach((m) => { m.journalId = cj.id; }); }
      moves.push(...billMoves);
      tenders.forEach((t) => { expected[t.type] = round(expected[t.type] + (t.type === 'Cash' ? t.amount - change : t.amount)); });
      sales = round(sales + totals.total);
      bills.push(rec<PosBill>(id, { companyId: CO, number, docType: 'POS Bill', date: sd.date, branchId: sd.terminal.branchId, status: 'Posted', currency: 'INR', rate: 1, partyType: 'Customer', partyId: custId ?? IDS.cWalkin, partyName: cust?.name ?? 'Walk-in Customer', lines: ls, totals, warehouseId: sd.terminal.warehouseId, priceListId: IDS.plRetail, fy: '2026-27', period: sd.date.slice(0, 7), correlationId: `corr_${id.toUpperCase()}`, shiftId: sd.id, terminalId: sd.terminal.id, cashierName: sd.cashier, tenders, tendered, change, journalId: j.id, journalNumber: j.number, postedAt: at, postedBy: sd.cashier, idempotencyKey: `pos:cart_seed_${billNo}`, createdAt: at, updatedAt: at, createdBy: sd.cashier }));
    }
    // returns: one against a bill on psh_04, one no-receipt on psh_05
    if (sd.id === 'psh_04' || sd.id === 'psh_05') {
      const src = sd.id === 'psh_04' ? bills.find((b) => b.shiftId === 'psh_04' && b.lines.some((l) => l.qty > 1)) : undefined;
      const rl = src ? src.lines.slice(0, 1).map((l) => ({ item: l.itemId!, qty: 1 })) : [{ item: IDS.iDarj, qty: 1 }];
      const { lines: ls, totals } = lines(rl, sd.terminal.warehouseId);
      const id = sd.id === 'psh_04' ? 'posr_01' : 'posr_02';
      const number = `POSR/26-27/${sd.id === 'psh_04' ? '0002' : '0003'}`;
      const rls = ls.map((l, i) => ({ ...l, sourceLineId: src?.lines[i]?.id, sourceDocId: src?.id }));
      const j = journal(`jv_${id}`, sd.date, [...rls.map((l) => ({ accountId: l.accountId!, dr: l.taxable })), { accountId: IDS.accGSTOutputCGST, dr: totals.components.CGST ?? 0, taxComponent: 'CGST' }, { accountId: IDS.accGSTOutputSGST, dr: totals.components.SGST ?? 0, taxComponent: 'SGST' }, ...(totals.roundOff > 0 ? [{ accountId: IDS.accRoundOff, dr: totals.roundOff }] : totals.roundOff < 0 ? [{ accountId: IDS.accRoundOff, cr: -totals.roundOff }] : []), { accountId: IDS.accPettyCash, cr: totals.total, narration: 'Refund Cash' }], { sourceType: 'POS Return', sourceId: id, sourceNumber: number, narration: `POS return ${number}${src ? ` against ${src.number}` : ' (no receipt)'}`, branchId: sd.terminal.branchId });
      journals.push(j);
      const retMoves = rls.map((l) => move(sd.date, l, 1, 'POS Return', { type: 'POS Return', id, number }, j.id));
      const rcj = cogsJournal(`jv_cogs_${id}`, sd.date, retMoves, { type: 'POS Return', id, number }, sd.terminal.branchId);
      if (rcj) { journals.push(rcj); retMoves.forEach((m) => { m.journalId = rcj.id; }); }
      moves.push(...retMoves);
      expected.Cash = round(expected.Cash - totals.total);
      if (src) { src.lines[0].returnedQty = 1; src.returnedTotal = totals.total; }
      returns.push(rec<PosReturn>(id, { companyId: CO, number, docType: 'POS Return', date: sd.date, branchId: sd.terminal.branchId, status: 'Posted', currency: 'INR', rate: 1, partyType: 'Customer', partyId: src?.partyId ?? IDS.cWalkin, partyName: src?.partyName ?? 'Walk-in Customer', lines: rls, totals, warehouseId: sd.terminal.warehouseId, sourceType: src ? 'POS Bill' : undefined, sourceId: src?.id, sourceNumber: src?.number, fy: '2026-27', period: sd.date.slice(0, 7), correlationId: `corr_${id.toUpperCase()}`, shiftId: sd.id, terminalId: sd.terminal.id, cashierName: sd.cashier, billId: src?.id, billNumber: src?.number, reasonCode: src ? 'rc_dmg' : 'rc_qual', reasonText: src ? 'Goods damaged in transit' : 'Quality rejection', noReceipt: !src, refund: { type: 'Cash', amount: totals.total }, approvalRequired: false, journalId: j.id, journalNumber: j.number, postedAt: T(sd.date, '16:30'), postedBy: sd.cashier, createdAt: T(sd.date, '16:30'), updatedAt: T(sd.date, '16:30') }));
    }
    const counted = sd.open ? undefined : { Cash: round(expected.Cash - (sd.note ? 60 : 0)), Card: expected.Card, UPI: expected.UPI };
    const variance = counted ? { Cash: round(counted.Cash - expected.Cash), Card: 0, UPI: 0 } : undefined;
    let journalId: string | undefined, journalNumber: string | undefined;
    if (variance && variance.Cash !== 0) { const j = journal(`jv_${sd.id}`, sd.date, [{ accountId: IDS.accMisc, dr: -variance.Cash, narration: 'Cash short' }, { accountId: IDS.accPettyCash, cr: -variance.Cash }], { sourceType: 'POS Shift', sourceId: sd.id, sourceNumber: shiftNumber, narration: `Cash short on shift close ${shiftNumber}`, branchId: sd.terminal.branchId }); journals.push(j); journalId = j.id; journalNumber = j.number; }
    const refunds = round(returns.filter((r) => r.shiftId === sd.id).reduce((a, r) => a + r.totals.total, 0));
    shifts.push(rec<PosShift>(sd.id, { companyId: CO, number: shiftNumber, terminalId: sd.terminal.id, terminalName: sd.terminal.name, cashierId: sd.cashierId, cashierName: sd.cashier, branchId: sd.terminal.branchId, openedAt: T(sd.date, '09:02'), closedAt: sd.open ? undefined : T(sd.date, '18:35'), openingFloat: sd.float, status: sd.open ? 'Open' : 'Closed', expected: sd.open ? undefined : expected, counted, variance, varianceTotal: variance ? variance.Cash : undefined, bills: sd.bills, sales, refunds, journalId, journalNumber, closeNotes: sd.note, closedBy: sd.open ? undefined : sd.cashier, createdAt: T(sd.date, '09:02'), updatedAt: T(sd.date, sd.open ? '09:02' : '18:35') }));
  });
  const heldCarts: PosHeldCart[] = [
    rec<PosHeldCart>('pheld_01', { companyId: CO, shiftId: 'psh_05', cartId: 'cart_seed_hold_1', label: 'Customer fetching wallet', lines: lines([{ item: IDS.iChai, qty: 2 }, { item: IDS.iDarj, qty: 1 }], IDS.whMain).lines, customerId: IDS.cWalkin, customerName: 'Walk-in Customer', heldAt: T('2026-09-13', '10:42'), total: lines([{ item: IDS.iChai, qty: 2 }, { item: IDS.iDarj, qty: 1 }], IDS.whMain).totals.total, createdAt: T('2026-09-13', '10:42'), updatedAt: T('2026-09-13', '10:42') }),
    rec<PosHeldCart>('pheld_02', { companyId: CO, shiftId: 'psh_05', cartId: 'cart_seed_hold_2', label: 'Metro Distributors', lines: lines([{ item: IDS.iBolt, qty: 50 }, { item: IDS.iNut, qty: 50 }], IDS.whMain).lines, customerId: IDS.cMetro, customerName: 'Metro Distributors', heldAt: T('2026-09-13', '11:15'), total: lines([{ item: IDS.iBolt, qty: 50 }, { item: IDS.iNut, qty: 50 }], IDS.whMain).totals.total, createdAt: T('2026-09-13', '11:15'), updatedAt: T('2026-09-13', '11:15') }),
  ];
  return { [C.posTerminals]: terminals as any, [C.posShifts]: shifts as any, [C.posBills]: bills as any, [C.posReturns]: returns as any, [C.posHeldCarts]: heldCarts as any, [C.journals]: journals as any, [C.stockMovements]: moves as any };
}
