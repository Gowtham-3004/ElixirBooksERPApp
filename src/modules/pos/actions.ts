// POS engine: shifts, carts, checkout (idempotent), returns, shift close with variance (FR-POS-001..007).
import { db, C, engine, ValidationError, IDS } from '../../store';
import type { Customer, DocLine, Item, PriceList, ApprovalRequest } from '../../store';
import { fmtMoney, round, today, uid } from '../../lib/format';
import type { PosBill, PosHeldCart, PosReturn, PosShift, PosTerminal, Tender, TenderType } from './types';
import { posSettingsOf } from './types';
import { salesAccountFor, taxAccountFor, arAccountFor, ACC } from '../sales/core';

export function settings() { return posSettingsOf(engine.ctx().company?.defaults); }

export function tenderAccount(t: TenderType, terminal?: PosTerminal): string {
  const s = settings();
  if (t === 'Cash') return terminal?.cashAccountId ?? s.posCashAccountId;
  if (t === 'Card') return s.posCardAccountId;
  if (t === 'UPI') return s.posUpiAccountId;
  return arAccountFor();
}

export function openShiftFor(userId?: string): PosShift | undefined {
  return db.findBy<PosShift>(C.posShifts, (s) => s.status === 'Open' && (!userId || s.cashierId === userId) && s.companyId === engine.ctx().companyId);
}

export function openShift(terminalId: string, openingFloat: number): PosShift {
  const c = engine.ctx();
  const t = db.find<PosTerminal>(C.posTerminals, terminalId);
  if (!t) throw new ValidationError('Choose a terminal', 'VALIDATION', 'terminalId');
  if (t.status !== 'Active') throw new ValidationError(`${t.name} is inactive`, 'INVALID_STATE');
  const busy = db.findBy<PosShift>(C.posShifts, (s) => s.status === 'Open' && s.terminalId === terminalId);
  if (busy) throw new ValidationError(`${t.name} already has an open shift (${busy.cashierName})`, 'INVALID_STATE');
  if (openShiftFor(c.userId)) throw new ValidationError('You already have an open shift — close it first', 'INVALID_STATE');
  if (openingFloat < 0) throw new ValidationError('Opening float cannot be negative', 'VALIDATION', 'openingFloat');
  const number = `SHIFT-${today().replace(/-/g, '')}-${t.code}-${String(db.count(C.posShifts, (s) => s.openedAt?.slice(0, 10) === today()) + 1).padStart(2, '0')}`;
  const s = db.insert<PosShift>(C.posShifts, { number, terminalId, terminalName: t.name, cashierId: c.userId ?? '', cashierName: c.userName, branchId: t.branchId, openedAt: new Date().toISOString(), openingFloat, status: 'Open', bills: 0, sales: 0, refunds: 0 });
  engine.audit({ action: 'pos.shift_opened', objectType: 'POS Shift', objectId: s.id, objectNumber: number, detail: `${t.name} · float ${fmtMoney(openingFloat)}` });
  return s;
}

// ── Cart ───────────────────────────────────────────────────────────────────

export function retailPriceList(): PriceList | undefined {
  return db.find<PriceList>(C.priceLists, settings().posPriceListId) ?? db.find<PriceList>(C.priceLists, IDS.plRetail);
}

export function catalogue(): (Item & { retailPrice: number; source: string })[] {
  const pl = retailPriceList();
  const cid = engine.ctx().companyId;
  return db.where<Item>(C.items, (i) => i.status === 'Active' && (!i.companyId || i.companyId === cid) && i.type !== 'Raw Material' && i.type !== 'Semi-Finished').map((i) => { const p = engine.resolvePrice({ itemId: i.id, priceListId: pl?.id, direction: 'sale' }); return { ...i, retailPrice: p.rate, source: p.priceListName ?? p.source }; });
}

export function cartLine(itemId: string, qty = 1, customerId?: string): DocLine {
  const pl = retailPriceList();
  const s = settings();
  return engine.lineFromItem(itemId, { qty, customerId, priceListId: pl?.id, direction: 'sale', warehouseId: s.posDefaultWarehouseId });
}

export function computeCart(lines: DocLine[], customerId?: string) {
  const pl = retailPriceList();
  const tc = engine.taxContextFor('Customer', customerId, 'sale', engine.ctx().branchId);
  return engine.computeDocument(lines, tc, { roundTotal: true, taxInclusive: !!pl?.taxInclusive });
}

export function holdCart(shiftId: string, cartId: string, lines: DocLine[], customerId: string | undefined, label: string): PosHeldCart {
  const cust = db.find<Customer>(C.customers, customerId);
  const total = computeCart(lines, customerId).totals.total;
  const existing = db.findBy<PosHeldCart>(C.posHeldCarts, (h) => h.cartId === cartId);
  if (existing) return db.update<PosHeldCart>(C.posHeldCarts, existing.id, { lines, customerId, customerName: cust?.name, label, total, heldAt: new Date().toISOString() });
  return db.insert<PosHeldCart>(C.posHeldCarts, { shiftId, cartId, label: label || `Hold ${db.count(C.posHeldCarts, (h) => h.shiftId === shiftId) + 1}`, lines, customerId, customerName: cust?.name, heldAt: new Date().toISOString(), total });
}

export function resumeCart(id: string): PosHeldCart | undefined {
  const h = db.find<PosHeldCart>(C.posHeldCarts, id);
  if (h) db.remove(C.posHeldCarts, id);
  return h;
}

// ── Checkout (FR-POS-003/004/007) ──────────────────────────────────────────

export interface CheckoutInput { cartId: string; shiftId: string; lines: DocLine[]; customerId?: string; tenders: Tender[]; tendered: number }

export function validateCheckout(input: CheckoutInput): string[] {
  const errs: string[] = [];
  if (!input.lines.length) errs.push('Cart is empty');
  input.lines.forEach((l) => { if (l.qty <= 0) errs.push(`${l.itemName}: quantity must be positive`); });
  const { totals } = computeCart(input.lines, input.customerId);
  const sum = round(input.tenders.reduce((a, t) => a + t.amount, 0));
  if (input.tenders.length === 0) errs.push('Choose a tender');
  if (input.tenders.some((t) => t.amount <= 0)) errs.push('Tender amounts must be positive');
  if (sum + 0.005 < totals.total) errs.push(`Tendered ${fmtMoney(sum)} is less than payable ${fmtMoney(totals.total)}`);
  const nonCash = input.tenders.filter((t) => t.type !== 'Cash').reduce((a, t) => a + t.amount, 0);
  if (nonCash > totals.total + 0.005) errs.push('Card / UPI / credit cannot exceed the payable — change is given in cash only');
  input.tenders.forEach((t) => { if (t.type === 'Card' && !(t.last4 && /^\d{4}$/.test(t.last4))) errs.push('Card: enter the last 4 digits'); if (t.type === 'UPI' && !t.reference?.trim()) errs.push('UPI: enter the transaction reference'); });
  const s = settings();
  if (input.tenders.some((t) => t.type === 'Credit')) {
    const c = db.find<Customer>(C.customers, input.customerId);
    if (!c || c.id === s.posDefaultCustomerId) errs.push('Credit sales need a named customer');
    else if (!s.posAllowCredit) errs.push('Credit sales are disabled in POS settings');
    else { const chk = engine.checkCredit(c.id, totals.total); if (!chk.ok) errs.push(chk.message ?? 'Credit check failed'); }
  }
  const allowNeg = engine.ctx().company?.defaults.allowNegativeStock ?? false;
  input.lines.forEach((l) => { const it = db.find<Item>(C.items, l.itemId); if (it?.isStock && !allowNeg) { const wh = l.warehouseId ?? s.posDefaultWarehouseId ?? IDS.whMain; const pos = engine.stockPosition(it.id, wh); if (pos.onHand < l.qty) errs.push(`${it.name}: only ${pos.onHand} on hand in ${db.find<any>(C.warehouses, wh)?.name}`); } });
  return errs;
}

/** Complete the sale: posts bill, journal, stock, customer ledger. Idempotent on the cart id (double tap returns the same bill). */
export function completeSale(input: CheckoutInput): PosBill {
  const idem = `pos:${input.cartId}`;
  const existing = db.findBy<PosBill>(C.posBills, (b) => b.idempotencyKey === idem);
  if (existing) return existing;
  return db.transaction(() => {
    const again = db.findBy<PosBill>(C.posBills, (b) => b.idempotencyKey === idem);
    if (again) return again;
    const errs = validateCheckout(input);
    if (errs.length) throw new ValidationError(errs.join('; '), 'VALIDATION');
    const shift = db.find<PosShift>(C.posShifts, input.shiftId);
    if (!shift || shift.status !== 'Open') throw new ValidationError('Shift is not open', 'INVALID_STATE');
    const terminal = db.find<PosTerminal>(C.posTerminals, shift.terminalId);
    const s = settings();
    const date = today();
    engine.assertPostable(date);
    const customerId = input.customerId ?? s.posDefaultCustomerId;
    const cust = db.find<Customer>(C.customers, customerId);
    const { lines, totals } = computeCart(input.lines, customerId);
    const wh = terminal?.warehouseId ?? s.posDefaultWarehouseId ?? IDS.whMain;
    const number = engine.allocateNumber('POS Bill', { date, branchId: shift.branchId });
    const tendered = round(input.tenders.reduce((a, t) => a + t.amount, 0));
    const change = round(Math.max(0, tendered - totals.total));
    const onCredit = input.tenders.some((t) => t.type === 'Credit');
    // journal: Dr tenders (cash net of change), Cr sales, Cr tax, round-off
    const byAcc = new Map<string, number>();
    lines.forEach((l) => byAcc.set(salesAccountFor(l), round((byAcc.get(salesAccountFor(l)) ?? 0) + l.taxable)));
    const taxLines = new Map<string, { accountId: string; cr: number; taxComponent: string }>();
    lines.forEach((l) => Object.entries(l.taxComponents ?? {}).forEach(([k, v]) => { const a = taxAccountFor(k, l.taxRateId); const prev = taxLines.get(k); taxLines.set(k, { accountId: a, cr: round((prev?.cr ?? 0) + v), taxComponent: k }); }));
    const drs = new Map<string, engine.PostLine>();
    input.tenders.forEach((t) => { const acc = tenderAccount(t.type, terminal); const amt = t.type === 'Cash' ? round(t.amount - change) : t.amount; const prev = drs.get(acc); drs.set(acc, { accountId: acc, dr: round((prev?.dr ?? 0) + amt), partyType: t.type === 'Credit' ? 'Customer' : undefined, partyId: t.type === 'Credit' ? cust?.id : undefined, partyName: t.type === 'Credit' ? cust?.name : undefined, narration: `${t.type}${t.reference ? ' ' + t.reference : ''}${t.last4 ? ' ****' + t.last4 : ''}` }); });
    const jl: engine.PostLine[] = [...drs.values(), ...Array.from(byAcc.entries()).map(([a, v]) => ({ accountId: a, cr: v })), ...taxLines.values(), ...(totals.roundOff > 0 ? [{ accountId: ACC.roundOff, cr: totals.roundOff }] : totals.roundOff < 0 ? [{ accountId: ACC.roundOff, dr: -totals.roundOff }] : [])];
    const j = engine.postJournal({ date, branchId: shift.branchId, lines: jl, sourceType: 'POS Bill', sourceId: 'pending', sourceNumber: number, narration: `POS ${number} · ${terminal?.name ?? ''} · ${shift.cashierName}`, idempotencyKey: idem, correlationId: uid('corr') });
    const bill = db.insert<PosBill>(C.posBills, { ...engine.newDocHeader('POS Bill', { number, date, branchId: shift.branchId, partyType: 'Customer', partyId: cust?.id, partyName: cust?.name, partySnapshot: cust ? engine.partySnapshotFor('Customer', cust.id) : undefined, lines: lines.map((l) => ({ ...l, warehouseId: l.warehouseId ?? wh })), totals: { ...totals, paid: onCredit ? round(totals.total - input.tenders.filter((t) => t.type === 'Credit').reduce((a, t) => a + t.amount, 0)) : totals.total, due: onCredit ? input.tenders.filter((t) => t.type === 'Credit').reduce((a, t) => a + t.amount, 0) : 0 }, warehouseId: wh, priceListId: retailPriceList()?.id, correlationId: j.correlationId }), id: undefined, status: 'Posted', shiftId: shift.id, terminalId: shift.terminalId, cashierName: shift.cashierName, tenders: input.tenders, tendered, change, onCredit, journalId: j.id, journalNumber: j.number, postedAt: new Date().toISOString(), postedBy: engine.ctx().userName, idempotencyKey: idem, createdAt: undefined, updatedAt: undefined, version: undefined } as any);
    db.update<any>(C.journals, j.id, { sourceId: bill.id });
    const saleMoves = lines.flatMap((l) => { const it = db.find<Item>(C.items, l.itemId); return it?.isStock ? [engine.moveStock({ date, itemId: it.id, warehouseId: l.warehouseId ?? wh, qty: -l.qty, uom: l.uom, type: 'POS Sale', sourceType: 'POS Bill', sourceId: bill.id, sourceNumber: number, batch: l.batch })] : []; });
    engine.postCogsJournal({ date, movements: saleMoves, sourceType: 'POS Bill', sourceId: bill.id, sourceNumber: number, branchId: bill.branchId, companyId: bill.companyId, correlationId: bill.correlationId });
    let openItemId: string | undefined;
    if (onCredit && cust) {
      const creditAmt = input.tenders.filter((t) => t.type === 'Credit').reduce((a, t) => a + t.amount, 0);
      openItemId = engine.createOpenItem({ partyType: 'Customer', partyId: cust.id, partyName: cust.name, docType: 'POS Bill', docId: bill.id, docNumber: number, date, dueDate: engine.dueDateFor(date, cust.paymentTerms), currency: bill.currency, originalAmount: creditAmt, baseAmount: creditAmt, rate: 1, direction: 'Debit', branchId: shift.branchId, companyId: bill.companyId }).id;
      db.update<PosBill>(C.posBills, bill.id, { openItemId });
    }
    db.update<PosShift>(C.posShifts, shift.id, { bills: (shift.bills ?? 0) + 1, sales: round((shift.sales ?? 0) + totals.total) });
    db.where<PosHeldCart>(C.posHeldCarts, (h) => h.cartId === input.cartId).forEach((h) => db.remove(C.posHeldCarts, h.id));
    engine.audit({ action: 'pos.bill_posted', objectType: 'POS Bill', objectId: bill.id, objectNumber: number, detail: `${fmtMoney(totals.total)} · ${input.tenders.map((t) => `${t.type} ${fmtMoney(t.amount)}`).join(' + ')}${change ? ` · change ${fmtMoney(change)}` : ''} · ${j.number}`, correlationId: j.correlationId });
    return db.find<PosBill>(C.posBills, bill.id)!;
  });
}

// ── Returns (FR-POS-005) ───────────────────────────────────────────────────

export function returnableOnBill(bill: PosBill, lineId: string): number {
  const l = bill.lines.find((x) => x.id === lineId);
  return l ? round(Math.max(0, l.qty - (l.returnedQty ?? 0)), 3) : 0;
}

export interface ReturnInput { shiftId: string; billId?: string; lines: DocLine[]; reasonCode: string; reasonText?: string; noReceipt: boolean; refund: Tender; customerId?: string }

export function validateReturn(input: ReturnInput): string[] {
  const errs: string[] = [];
  const s = settings();
  if (!input.lines.length) errs.push('Choose at least one line to return');
  if (!input.reasonCode) errs.push('Choose a reason');
  const bill = db.find<PosBill>(C.posBills, input.billId);
  if (!input.noReceipt && !bill) errs.push('Look up the original bill or tick "No receipt"');
  if (bill) input.lines.forEach((l) => { const max = l.sourceLineId ? returnableOnBill(bill, l.sourceLineId) : 0; if (l.qty > max + 0.0005) errs.push(`${l.itemName}: only ${max} returnable`); });
  if (input.noReceipt && s.posNoReceiptReturns === 'Deny') errs.push('No-receipt returns are not allowed by policy');
  if (input.refund.type === 'Card' && !input.refund.last4) errs.push('Card refund: enter the last 4 digits');
  if (input.refund.type === 'Credit' && !input.customerId) errs.push('Store credit needs a named customer');
  return errs;
}

export function returnNeedsApproval(input: ReturnInput, total: number): boolean {
  const s = settings();
  return input.noReceipt && s.posNoReceiptReturns === 'Manager approval' && total > s.posNoReceiptApprovalThreshold;
}

export function postReturn(input: ReturnInput): PosReturn {
  return db.transaction(() => {
    const errs = validateReturn(input);
    if (errs.length) throw new ValidationError(errs.join('; '), 'VALIDATION');
    const shift = db.find<PosShift>(C.posShifts, input.shiftId);
    if (!shift || shift.status !== 'Open') throw new ValidationError('Open a shift to process returns', 'INVALID_STATE');
    const terminal = db.find<PosTerminal>(C.posTerminals, shift.terminalId);
    const bill = db.find<PosBill>(C.posBills, input.billId);
    const date = today();
    engine.assertPostable(date);
    const customerId = input.customerId ?? bill?.partyId ?? settings().posDefaultCustomerId;
    const cust = db.find<Customer>(C.customers, customerId);
    const { lines, totals } = computeCart(input.lines, customerId);
    const c = engine.ctx();
    const number = engine.allocateNumber('POS Return', { date, branchId: shift.branchId });
    // policy: manager approval for no-receipt returns above threshold
    let approvalRequired = false;
    let status = 'Posted';
    let approvalId: string | undefined;
    if (returnNeedsApproval(input, totals.total)) {
      approvalRequired = true;
      const draft = db.insert<PosReturn>(C.posReturns, { ...engine.newDocHeader('POS Return', { number, date, branchId: shift.branchId, partyType: 'Customer', partyId: cust?.id, partyName: cust?.name, lines, totals, warehouseId: terminal?.warehouseId }), id: undefined, status: 'Draft', shiftId: shift.id, terminalId: shift.terminalId, cashierName: shift.cashierName, billId: bill?.id, billNumber: bill?.number, reasonCode: input.reasonCode, reasonText: input.reasonText, noReceipt: true, refund: input.refund, approvalRequired: true, createdAt: undefined, updatedAt: undefined, version: undefined } as any);
      const req = engine.submitForApproval({ docType: 'POS Return', collection: C.posReturns, docId: draft.id, docNumber: number, amount: totals.total, branchId: shift.branchId, partyId: cust?.id, summary: `No-receipt return ${fmtMoney(totals.total)} · ${input.reasonText ?? input.reasonCode}` });
      if (req) { engine.audit({ action: 'pos.return_submitted', objectType: 'POS Return', objectId: draft.id, objectNumber: number, detail: `Awaiting ${req.ruleName}` }); return db.find<PosReturn>(C.posReturns, draft.id)!; }
      // no workflow rule configured: require a manager permission to proceed
      if (!c.can('pos.return.approve') && !c.can('pos.*')) { db.remove(C.posReturns, draft.id); engine.voidNumber('POS Return', number, 'No-receipt return refused — manager approval required'); throw new ValidationError(`No-receipt returns above ${fmtMoney(settings().posNoReceiptApprovalThreshold)} need a manager (pos.return.approve)`, 'DENIED'); }
      db.remove(C.posReturns, draft.id);
      approvalId = undefined;
      status = 'Posted';
    }
    // journal: Dr sales / tax · Cr refund tender
    const byAcc = new Map<string, number>();
    lines.forEach((l) => byAcc.set(salesAccountFor(l), round((byAcc.get(salesAccountFor(l)) ?? 0) + l.taxable)));
    const taxLines = new Map<string, { accountId: string; dr: number; taxComponent: string }>();
    lines.forEach((l) => Object.entries(l.taxComponents ?? {}).forEach(([k, v]) => { const a = taxAccountFor(k, l.taxRateId); const prev = taxLines.get(k); taxLines.set(k, { accountId: a, dr: round((prev?.dr ?? 0) + v), taxComponent: k }); }));
    const refundAcc = input.refund.type === 'Credit' ? ACC.advances : tenderAccount(input.refund.type, terminal);
    const jl: engine.PostLine[] = [...Array.from(byAcc.entries()).map(([a, v]) => ({ accountId: a, dr: v })), ...taxLines.values(), ...(totals.roundOff > 0 ? [{ accountId: ACC.roundOff, dr: totals.roundOff }] : totals.roundOff < 0 ? [{ accountId: ACC.roundOff, cr: -totals.roundOff }] : []), { accountId: refundAcc, cr: totals.total, partyType: input.refund.type === 'Credit' ? 'Customer' : undefined, partyId: input.refund.type === 'Credit' ? cust?.id : undefined, partyName: input.refund.type === 'Credit' ? cust?.name : undefined, narration: `Refund ${input.refund.type}` }];
    const j = engine.postJournal({ date, branchId: shift.branchId, lines: jl, sourceType: 'POS Return', sourceId: 'pending', sourceNumber: number, narration: `POS return ${number}${bill ? ` against ${bill.number}` : ' (no receipt)'} · ${input.reasonText ?? input.reasonCode}`, idempotencyKey: `posret:${number}` });
    const ret = db.insert<PosReturn>(C.posReturns, { ...engine.newDocHeader('POS Return', { number, date, branchId: shift.branchId, partyType: 'Customer', partyId: cust?.id, partyName: cust?.name, partySnapshot: cust ? engine.partySnapshotFor('Customer', cust.id) : undefined, lines, totals, warehouseId: terminal?.warehouseId, sourceType: bill ? 'POS Bill' : undefined, sourceId: bill?.id, sourceNumber: bill?.number, correlationId: j.correlationId }), id: undefined, status, shiftId: shift.id, terminalId: shift.terminalId, cashierName: shift.cashierName, billId: bill?.id, billNumber: bill?.number, reasonCode: input.reasonCode, reasonText: input.reasonText, noReceipt: input.noReceipt, refund: { ...input.refund, amount: totals.total }, approvalRequired, approvalId, journalId: j.id, journalNumber: j.number, postedAt: new Date().toISOString(), postedBy: c.userName, createdAt: undefined, updatedAt: undefined, version: undefined } as any);
    db.update<any>(C.journals, j.id, { sourceId: ret.id });
    const wh = terminal?.warehouseId ?? settings().posDefaultWarehouseId ?? IDS.whMain;
    const returnMoves = lines.flatMap((l) => { const it = db.find<Item>(C.items, l.itemId); return it?.isStock ? [engine.moveStock({ date, itemId: it.id, warehouseId: wh, qty: l.qty, uom: l.uom, type: 'POS Return', sourceType: 'POS Return', sourceId: ret.id, sourceNumber: number, rate: engine.stockPosition(it.id, wh).avgRate || undefined })] : []; });
    engine.postCogsJournal({ date, movements: returnMoves, sourceType: 'POS Return', sourceId: ret.id, sourceNumber: number, branchId: ret.branchId, companyId: ret.companyId, correlationId: ret.correlationId });
    if (bill) db.update<PosBill>(C.posBills, bill.id, (prev) => ({ lines: prev.lines.map((x) => { const r = lines.find((l) => l.sourceLineId === x.id); return r ? { ...x, returnedQty: round((x.returnedQty ?? 0) + r.qty, 3) } : x; }), returnedTotal: round((prev.returnedTotal ?? 0) + totals.total) }));
    if (input.refund.type === 'Credit' && cust) engine.createOpenItem({ partyType: 'Customer', partyId: cust.id, partyName: cust.name, docType: 'POS Return', docId: ret.id, docNumber: number, date, dueDate: date, currency: ret.currency, originalAmount: totals.total, baseAmount: totals.total, rate: 1, direction: 'Credit', branchId: shift.branchId, companyId: ret.companyId });
    db.update<PosShift>(C.posShifts, shift.id, { refunds: round((shift.refunds ?? 0) + totals.total) });
    engine.audit({ action: 'pos.return_posted', objectType: 'POS Return', objectId: ret.id, objectNumber: number, detail: `${fmtMoney(totals.total)} refunded by ${input.refund.type}${bill ? ` against ${bill.number}` : ' · no receipt'} · ${input.reasonText ?? input.reasonCode}`, correlationId: j.correlationId });
    return db.find<PosReturn>(C.posReturns, ret.id)!;
  });
}

/** Post an approved no-receipt return (after the approval workflow). */
export function postApprovedReturn(id: string): PosReturn {
  const r = db.find<PosReturn>(C.posReturns, id);
  if (!r) throw new ValidationError('Return not found', 'NOT_FOUND');
  if (r.status !== 'Approved') throw new ValidationError(`Return is ${r.status}`, 'INVALID_STATE');
  db.remove(C.posReturns, id);
  return postReturn({ shiftId: openShiftFor()?.id ?? r.shiftId, billId: r.billId, lines: r.lines, reasonCode: r.reasonCode, reasonText: r.reasonText, noReceipt: false, refund: r.refund, customerId: r.partyId });
}

// ── Shift close (FR-POS-006) ───────────────────────────────────────────────

export function shiftSummary(shift: PosShift) {
  const bills = db.where<PosBill>(C.posBills, (b) => b.shiftId === shift.id && b.status === 'Posted');
  const returns = db.where<PosReturn>(C.posReturns, (r) => r.shiftId === shift.id && r.status === 'Posted');
  const expected: Record<string, number> = { Cash: shift.openingFloat, Card: 0, UPI: 0, Credit: 0 };
  bills.forEach((b) => b.tenders.forEach((t) => { expected[t.type] = round((expected[t.type] ?? 0) + (t.type === 'Cash' ? t.amount - b.change : t.amount)); }));
  returns.forEach((r) => { expected[r.refund.type] = round((expected[r.refund.type] ?? 0) - r.refund.amount); });
  const sales = round(bills.reduce((a, b) => a + b.totals.total, 0));
  const refunds = round(returns.reduce((a, r) => a + r.totals.total, 0));
  const tax = round(bills.reduce((a, b) => a + b.totals.tax, 0) - returns.reduce((a, r) => a + r.totals.tax, 0));
  const items = bills.reduce((a, b) => a + b.lines.reduce((x, l) => x + l.qty, 0), 0);
  return { bills, returns, expected, sales, refunds, tax, items, net: round(sales - refunds) };
}

export function closeShift(shiftId: string, counted: Record<string, number>, notes?: string): PosShift {
  return db.transaction(() => {
    const shift = db.find<PosShift>(C.posShifts, shiftId);
    if (!shift || shift.status !== 'Open') throw new ValidationError('Shift is not open', 'INVALID_STATE');
    const c = engine.ctx();
    const s = settings();
    const sum = shiftSummary(shift);
    const variance: Record<string, number> = {};
    (['Cash', 'Card', 'UPI'] as const).forEach((t) => { variance[t] = round((counted[t] ?? 0) - (sum.expected[t] ?? 0)); });
    const varianceTotal = round(Object.values(variance).reduce((a, b) => a + b, 0));
    const beyond = Math.abs(varianceTotal) > s.posVarianceTolerance;
    let status: PosShift['status'] = 'Closed';
    let approvalId: string | undefined;
    if (beyond) {
      const req = engine.submitForApproval({ docType: 'POS Shift Variance', collection: C.posShifts, docId: shift.id, docNumber: shift.number, amount: Math.abs(varianceTotal), branchId: shift.branchId, summary: `Variance ${fmtMoney(varianceTotal)} vs tolerance ${fmtMoney(s.posVarianceTolerance)}`, skipStatusUpdate: true });
      if (req) { status = 'Pending Approval'; approvalId = req.id; }
      else if (!c.can('pos.shift.approve') && !c.can('pos.*')) throw new ValidationError(`Variance ${fmtMoney(varianceTotal)} exceeds the ${fmtMoney(s.posVarianceTolerance)} tolerance — a manager must approve the close`, 'DENIED');
    }
    const date = today();
    engine.assertPostable(date);
    const terminal = db.find<PosTerminal>(C.posTerminals, shift.terminalId);
    let journalId: string | undefined, journalNumber: string | undefined;
    const cashVar = variance.Cash ?? 0;
    if (Math.abs(cashVar) >= 0.01) {
      const cashAcc = tenderAccount('Cash', terminal);
      const j = engine.postJournal({ date, branchId: shift.branchId, sourceType: 'POS Shift', sourceId: shift.id, sourceNumber: shift.number, narration: `Cash ${cashVar > 0 ? 'over' : 'short'} on shift close ${shift.number} · ${shift.cashierName}`, idempotencyKey: `shift:${shift.id}:close`, lines: cashVar > 0 ? [{ accountId: cashAcc, dr: cashVar }, { accountId: ACC.otherIncome, cr: cashVar, narration: 'Cash over' }] : [{ accountId: IDS.accMisc, dr: -cashVar, narration: 'Cash short' }, { accountId: cashAcc, cr: -cashVar }] });
      journalId = j.id; journalNumber = j.number;
    }
    const out = db.update<PosShift>(C.posShifts, shift.id, { status, closedAt: new Date().toISOString(), closedBy: c.userName, expected: sum.expected, counted, variance, varianceTotal, bills: sum.bills.length, sales: sum.sales, refunds: sum.refunds, journalId, journalNumber, approvalId, closeNotes: notes });
    engine.audit({ action: status === 'Closed' ? 'pos.shift_closed' : 'pos.shift_variance_submitted', objectType: 'POS Shift', objectId: shift.id, objectNumber: shift.number, detail: `${sum.bills.length} bills · sales ${fmtMoney(sum.sales)} · variance ${fmtMoney(varianceTotal)}${journalNumber ? ` · ${journalNumber}` : ''}` });
    if (beyond) engine.notify({ type: 'approval', title: `Shift ${shift.number} closed with variance ${fmtMoney(varianceTotal)}`, body: notes, link: `pos/shifts/${shift.id}` });
    return out;
  });
}

export function approveShiftVariance(shiftId: string, comment: string) {
  const shift = db.find<PosShift>(C.posShifts, shiftId);
  if (!shift || shift.status !== 'Pending Approval') throw new ValidationError('Nothing to approve', 'INVALID_STATE');
  const req = db.find<ApprovalRequest>(C.approvals, shift.approvalId);
  if (req && req.status === 'Pending') engine.actOnApproval(req.id, 'Approve', { comment });
  db.update<PosShift>(C.posShifts, shiftId, { status: 'Closed' });
  engine.audit({ action: 'pos.shift_variance_approved', objectType: 'POS Shift', objectId: shiftId, objectNumber: shift.number, detail: comment });
}

export { fmtMoney };
