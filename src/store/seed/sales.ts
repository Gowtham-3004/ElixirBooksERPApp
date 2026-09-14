// Seed data for the sales module: quotations, orders (with reservations), deliveries,
// invoices, credit notes, sales returns, receipts — plus the journals, open items and
// stock movements those posted documents would have produced. Totals are hand-built
// with the same arithmetic the engine uses (no session dependency at seed time).
import type { DB } from '../db';
import type { Customer, DocLine, DocTotals, Item, Journal, JournalLine, OpenItem, PartySnapshot, Reservation, StockMovement, TaxBreakupRow, ApprovalRequest, Attachment, AuditEvent } from '../types';
import { C } from '../collections';
import { IDS, rec, SEED_NOW, seedMasters } from './core';
import { round } from '../../lib/format';

const M = seedMasters();
const ITEMS = M[C.items] as unknown as Item[];
const CUSTOMERS = M[C.customers] as unknown as Customer[];
const item = (id: string) => ITEMS.find((i) => i.id === id)!;
const cust = (id: string) => CUSTOMERS.find((c) => c.id === id)!;
const TAX_RATE: Record<string, number> = { [IDS.taxGST0]: 0, [IDS.taxGST5]: 5, [IDS.taxGST12]: 12, [IDS.taxGST18]: 18, [IDS.taxGST28]: 28 };
const BRANCH_STATE: Record<string, string> = { [IDS.brHO]: '27', [IDS.brAndheri]: '27', [IDS.brSurat]: '24', [IDS.brPune]: '27' };
const CO = IDS.acme;
const T = (d: string, h = '10:00') => `${d}T${h}:00.000Z`;

let lineSeq = 0;
const lid = () => `ln_s${String(++lineSeq).padStart(4, '0')}`;

export interface LineSpec { item?: string; name?: string; qty: number; rate?: number; disc?: number; discAmt?: number; wh?: string; batch?: string; serials?: string[]; tax?: string; hsn?: string; account?: string; override?: string; desc?: string; uom?: string }

function snapshot(c: Customer): PartySnapshot {
  const billing = c.addresses.find((a) => a.purpose !== 'Shipping' && a.isDefault) ?? c.addresses[0];
  const shipping = c.addresses.find((a) => a.purpose !== 'Billing' && a.isDefault) ?? billing;
  const pl = (M[C.priceLists] as any[]).find((p) => p.id === c.priceListId);
  return { name: c.name, gstin: c.gstin, pan: c.pan, taxTreatment: c.taxTreatment, state: billing?.address.state, stateCode: billing?.address.stateCode, billingAddress: billing?.address, shippingAddress: shipping?.address, contact: c.contacts.find((x) => x.isDefault) ?? c.contacts[0], priceListName: pl?.name, paymentTerms: c.paymentTerms, currency: c.currency };
}

/** Build lines + totals the way engine.computeDocument does. */
export function buildLines(specs: LineSpec[], ctx: { custId: string; branchId: string; wh?: string; charges?: { id: string; name: string; amount: number; taxRateId?: string }[]; roundTotal?: boolean; rate?: number }): { lines: DocLine[]; totals: DocTotals } {
  const c = cust(ctx.custId);
  const zero = c.taxTreatment === 'SEZ' || c.taxTreatment === 'Export' || c.taxTreatment === 'Overseas';
  const buyerState = c.addresses[0]?.address.stateCode;
  const inter = c.taxTreatment === 'Overseas' || (!!buyerState && buyerState !== BRANCH_STATE[ctx.branchId]);
  const components: Record<string, number> = {};
  const breakup = new Map<string, TaxBreakupRow>();
  const lines: DocLine[] = specs.map((s) => {
    const it = s.item ? item(s.item) : undefined;
    const rate = s.rate ?? it?.salesPrice ?? 0;
    const taxRateId = s.tax ?? it?.taxRateId;
    const pct = zero ? 0 : (TAX_RATE[taxRateId ?? ''] ?? 0);
    const gross = round(s.qty * rate);
    const discountAmt = round(s.discAmt ?? (gross * (s.disc ?? 0)) / 100);
    const taxable = round(gross - discountAmt);
    const comps: Record<string, number> = {};
    if (pct > 0) { if (inter) comps.IGST = round((taxable * pct) / 100); else { comps.CGST = round((taxable * pct) / 200); comps.SGST = round((taxable * pct) / 200); } }
    const taxAmt = round(Object.values(comps).reduce((a, b) => a + b, 0));
    const hsn = s.hsn ?? it?.hsn;
    Object.entries(comps).forEach(([k, v]) => {
      components[k] = round((components[k] ?? 0) + v);
      const cr = k === 'IGST' ? pct : pct / 2;
      const key = `${k}|${cr}|${hsn ?? ''}`;
      const row = breakup.get(key) ?? { component: k, rate: cr, hsn: hsn ?? '—', taxable: 0, tax: 0 };
      row.taxable = round(row.taxable + taxable); row.tax = round(row.tax + v); breakup.set(key, row);
    });
    return { id: lid(), itemId: it?.id, itemCode: it?.code, itemName: s.name ?? it?.name ?? '', description: s.desc, hsn, qty: s.qty, uom: s.uom ?? it?.baseUom ?? 'Nos', rate, listRate: s.override ? (it?.salesPrice ?? rate) : rate, priceListName: s.override ? 'Wholesale' : c.priceListId === IDS.plUSD ? 'Export (USD)' : c.priceListId === IDS.plRetail ? 'Retail (MRP)' : 'Wholesale', overrideReason: s.override, discountPct: s.disc ?? (discountAmt && gross ? round((discountAmt / gross) * 100) : 0), discountAmt, taxable, taxRateId, taxRate: pct, taxAmt, taxComponents: comps, taxTreatment: zero ? 'Zero-rated (SEZ/Export)' : 'Taxable', reverseCharge: false, amount: round(taxable + taxAmt), warehouseId: it?.isStock ? (s.wh ?? ctx.wh) : undefined, batch: s.batch, serials: s.serials, accountId: s.account ?? it?.salesAccountId } as DocLine;
  });
  const subtotal = round(lines.reduce((a, l) => a + round(l.qty * l.rate), 0));
  const discount = round(lines.reduce((a, l) => a + l.discountAmt, 0));
  const taxable = round(lines.reduce((a, l) => a + l.taxable, 0));
  let charges = 0;
  (ctx.charges ?? []).forEach((ch) => { charges = round(charges + ch.amount); if (ch.taxRateId && !zero) { const pct = TAX_RATE[ch.taxRateId] ?? 0; const comps: Record<string, number> = inter ? { IGST: round((ch.amount * pct) / 100) } : { CGST: round((ch.amount * pct) / 200), SGST: round((ch.amount * pct) / 200) }; Object.entries(comps).forEach(([k, v]) => { components[k] = round((components[k] ?? 0) + v); const key = `${k}|${pct}|charges`; const row = breakup.get(key) ?? { component: k, rate: k === 'IGST' ? pct : pct / 2, hsn: 'Charges', taxable: 0, tax: 0 }; row.taxable = round(row.taxable + ch.amount); row.tax = round(row.tax + v); breakup.set(key, row); }); } });
  const tax = round(Object.values(components).reduce((a, b) => a + b, 0));
  const raw = round(taxable + tax + charges);
  const roundOff = ctx.roundTotal === false ? 0 : round(Math.round(raw) - raw);
  const total = round(raw + roundOff);
  const fx = ctx.rate ?? 1;
  return { lines, totals: { subtotal, discount, taxable, tax, components, breakup: Array.from(breakup.values()), charges, tds: 0, roundOff, total, paid: 0, credited: 0, writtenOff: 0, due: total, baseTotal: round(total * fx) } };
}

interface DocOpts { branchId?: string; wh?: string; status?: string; number?: string; due?: string; terms?: string; ref?: string; sp?: string; source?: { type: string; id: string; number: string }; rate?: number; currency?: string; extra?: Record<string, unknown>; charges?: { id: string; name: string; amount: number; taxRateId?: string }[]; posted?: boolean; created?: string; by?: string; notes?: string; terms2?: string }

function doc(kind: string, id: string, number: string, date: string, custId: string, specs: LineSpec[], o: DocOpts = {}) {
  const c = cust(custId);
  const branchId = o.branchId ?? IDS.brHO;
  const currency = o.currency ?? c.currency;
  const rate = o.rate ?? 1;
  const built = buildLines(specs, { custId, branchId, wh: o.wh ?? (branchId === IDS.brAndheri ? IDS.whAndheri : IDS.whMain), charges: o.charges, rate });
  const snap = snapshot(c);
  const posted = o.posted ?? (o.status === 'Posted' || o.status === 'Settled');
  return rec<any>(id, {
    companyId: CO, number, docType: kind, date, dueDate: o.due, branchId, status: o.status ?? 'Posted', currency, rate, rateType: rate === 1 ? 'Same' : 'Spot', rateSource: rate === 1 ? '—' : 'RBI reference',
    partyType: 'Customer', partyId: c.id, partyName: c.name, partySnapshot: snap, reference: o.ref, sourceType: o.source?.type, sourceId: o.source?.id, sourceNumber: o.source?.number,
    lines: built.lines, totals: built.totals, paymentTerms: o.terms ?? c.paymentTerms, salespersonId: o.sp ?? c.salespersonId, priceListId: c.priceListId, warehouseId: o.wh ?? (branchId === IDS.brAndheri ? IDS.whAndheri : IDS.whMain),
    placeOfSupply: snap.state, placeOfSupplyCode: snap.stateCode, fy: '2026-27', period: date.slice(0, 7), correlationId: `corr_${id.toUpperCase()}`, charges: o.charges ?? [], notes: o.notes, terms: o.terms2,
    postedAt: posted ? T(date) : undefined, postedBy: posted ? (o.by ?? 'Rahul Kumar') : undefined, createdAt: T(o.created ?? date, '09:15'), updatedAt: T(date), createdBy: o.by ?? 'Rahul Kumar', templateId: kind === 'Sales Invoice' ? IDS.tplInvoice : kind === 'Quotation' ? IDS.tplQuote : undefined, templateVersion: kind === 'Sales Invoice' ? 3 : kind === 'Quotation' ? 2 : undefined,
    ...(o.extra ?? {}),
  });
}

// ── Journals / open items / stock helpers ──────────────────────────────────

const ACCOUNTS = M[C.accounts] as unknown as { id: string; code: string; name: string }[];
const acc = (id: string) => ACCOUNTS.find((a) => a.id === id) ?? { id, code: '', name: id };
let jvSeq = 330;
let jlSeq = 0;
function journal(id: string, date: string, lines: { accountId: string; dr?: number; cr?: number; partyId?: string; partyName?: string; taxComponent?: string; narration?: string }[], o: { sourceType: string; sourceId: string; sourceNumber: string; narration: string; branchId?: string; currency?: string; rate?: number; number?: string; type?: Journal['type']; idempotencyKey?: string }): Journal {
  const rate = o.rate ?? 1;
  const jl: JournalLine[] = lines.filter((l) => (l.dr ?? 0) !== 0 || (l.cr ?? 0) !== 0).map((l) => { const a = acc(l.accountId); return { id: `jl_s${String(++jlSeq).padStart(4, '0')}`, accountId: a.id, accountCode: a.code, accountName: a.name, dr: round(l.dr ?? 0), cr: round(l.cr ?? 0), drBase: round((l.dr ?? 0) * rate), crBase: round((l.cr ?? 0) * rate), currency: o.currency ?? 'INR', partyType: l.partyId ? 'Customer' : undefined, partyId: l.partyId, partyName: l.partyName, dimensions: { Branch: o.branchId ?? IDS.brHO }, narration: l.narration, taxComponent: l.taxComponent }; });
  const totalDr = round(jl.reduce((s, l) => s + l.drBase, 0));
  const totalCr = round(jl.reduce((s, l) => s + l.crBase, 0));
  if (Math.abs(totalDr - totalCr) > 0.011) throw new Error(`Seed journal ${id} unbalanced: ${totalDr} vs ${totalCr}`);
  const number = o.number ?? `JV/26-27/${String(jvSeq++).padStart(4, '0')}`;
  return rec<Journal>(id, { companyId: CO, number, date, period: date.slice(0, 7), fy: '2026-27', branchId: o.branchId ?? IDS.brHO, currency: o.currency ?? 'INR', rate, status: 'Posted', type: o.type ?? 'Auto', sourceType: o.sourceType, sourceId: o.sourceId, sourceNumber: o.sourceNumber, narration: o.narration, lines: jl, totalDr, totalCr, idempotencyKey: o.idempotencyKey, payloadHash: 'seed', postedAt: T(date), postedBy: 'Rahul Kumar', correlationId: `corr_${o.sourceId.toUpperCase()}`, createdAt: T(date), updatedAt: T(date) });
}

const TAX_ACC: Record<string, string> = { CGST: IDS.accGSTOutputCGST, SGST: IDS.accGSTOutputSGST, IGST: IDS.accGSTOutputIGST };

function invoiceJournal(inv: any, number?: string): Journal {
  const t = inv.totals as DocTotals;
  const byAcc = new Map<string, number>();
  inv.lines.forEach((l: DocLine) => byAcc.set(l.accountId ?? IDS.accSales, round((byAcc.get(l.accountId ?? IDS.accSales) ?? 0) + l.taxable)));
  const lines = [{ accountId: IDS.accAR, dr: t.total, partyId: inv.partyId, partyName: inv.partyName, narration: `Invoice ${inv.number}` }, ...Array.from(byAcc.entries()).map(([a, v]) => ({ accountId: a, cr: v })), ...Object.entries(t.components).map(([k, v]) => ({ accountId: TAX_ACC[k], cr: v, taxComponent: k })), ...(t.charges ? [{ accountId: IDS.accOtherIncome, cr: t.charges }] : []), ...(t.roundOff > 0 ? [{ accountId: IDS.accRoundOff, cr: t.roundOff }] : t.roundOff < 0 ? [{ accountId: IDS.accRoundOff, dr: -t.roundOff }] : [])];
  return journal(`jv_${inv.id}`, inv.date, lines, { sourceType: 'Sales Invoice', sourceId: inv.id, sourceNumber: inv.number, narration: `Sales invoice ${inv.number} · ${inv.partyName}`, branchId: inv.branchId, currency: inv.currency, rate: inv.rate, number, idempotencyKey: `inv:${inv.id}:post` });
}

function creditNoteJournal(cn: any): Journal {
  const t = cn.totals as DocTotals;
  const byAcc = new Map<string, number>();
  cn.lines.forEach((l: DocLine) => byAcc.set(l.accountId ?? IDS.accSales, round((byAcc.get(l.accountId ?? IDS.accSales) ?? 0) + l.taxable)));
  const lines = [...Array.from(byAcc.entries()).map(([a, v]) => ({ accountId: a, dr: v })), ...Object.entries(t.components).map(([k, v]) => ({ accountId: TAX_ACC[k], dr: v, taxComponent: k })), ...(t.roundOff > 0 ? [{ accountId: IDS.accRoundOff, dr: t.roundOff }] : t.roundOff < 0 ? [{ accountId: IDS.accRoundOff, cr: -t.roundOff }] : []), { accountId: IDS.accAR, cr: t.total, partyId: cn.partyId, partyName: cn.partyName, narration: `Credit note ${cn.number} against ${cn.invoiceNumber}` }];
  return journal(`jv_${cn.id}`, cn.date, lines, { sourceType: 'Credit Note', sourceId: cn.id, sourceNumber: cn.number, narration: `Credit note ${cn.number} against ${cn.invoiceNumber} · ${cn.reasonText}`, branchId: cn.branchId, idempotencyKey: `cn:${cn.id}:post` });
}

function receiptJournal(r: any): Journal {
  const allocated = round(r.allocations.reduce((s: number, a: any) => s + a.amount, 0));
  const unapplied = round(r.amount - allocated);
  const lines = [{ accountId: r.bankAccountId, dr: round(r.amount - r.charges - r.tds), narration: `${r.method} ${r.reference ?? ''}` }, ...(r.charges ? [{ accountId: IDS.accBankCharges, dr: r.charges }] : []), ...(r.tds ? [{ accountId: IDS.accTDSReceivable, dr: r.tds }] : []), ...(allocated ? [{ accountId: IDS.accAR, cr: allocated, partyId: r.partyId, partyName: r.partyName, narration: r.allocations.map((a: any) => a.docNumber).join(', ') }] : []), ...(unapplied > 0.005 ? [{ accountId: IDS.accAdvanceCustomer, cr: unapplied, partyId: r.partyId, partyName: r.partyName, narration: 'Unapplied advance' }] : [])];
  return journal(`jv_${r.id}`, r.date, lines, { sourceType: 'Receipt', sourceId: r.id, sourceNumber: r.number, narration: `Receipt ${r.number} · ${r.partyName} · ${r.method}`, branchId: r.branchId, currency: r.currency, rate: r.rate, idempotencyKey: `rcpt:${r.id}:post` });
}

let smSeq = 0;
function stockMove(date: string, l: DocLine, sign: 1 | -1, type: StockMovement['type'], src: { type: string; id: string; number: string }, journalId?: string): StockMovement | null {
  const it = item(l.itemId!);
  if (!it?.isStock) return null;
  const wh = l.warehouseId ?? IDS.whMain;
  const whName = (M[C.warehouses] as any[]).find((w) => w.id === wh)?.name;
  const rate = it.purchasePrice || it.standardCost || 0;
  return rec<StockMovement>(`sm_s${String(++smSeq).padStart(4, '0')}`, { companyId: CO, date, itemId: it.id, itemCode: it.code, itemName: it.name, warehouseId: wh, warehouseName: whName, qty: sign * l.qty, uom: l.uom, baseQty: sign * l.qty, batch: l.batch, serials: l.serials, rate, value: round(l.qty * rate), type, sourceType: src.type, sourceId: src.id, sourceNumber: src.number, journalId, createdAt: T(date), updatedAt: T(date) });
}

function openItem(d: any, o: { direction: 'Debit' | 'Credit'; amount?: number; docType?: string; id?: string }): OpenItem {
  const amount = o.amount ?? d.totals.total;
  return rec<OpenItem>(o.id ?? `oi_${d.id}`, { companyId: CO, partyType: 'Customer', partyId: d.partyId, partyName: d.partyName, docType: o.docType ?? d.docType, docId: d.id, docNumber: d.number, date: d.date, dueDate: d.dueDate ?? d.date, currency: d.currency, originalAmount: amount, baseAmount: round(amount * (d.rate ?? 1)), rate: d.rate ?? 1, outstanding: amount, baseOutstanding: round(amount * (d.rate ?? 1)), direction: o.direction, status: 'Open', settlements: [], branchId: d.branchId, createdAt: T(d.date), updatedAt: T(d.date) });
}

let stlSeq = 0;
function settle(oi: OpenItem, s: { date: string; docType: string; docId: string; docNumber: string; amount: number; rate?: number }) {
  const rate = s.rate ?? oi.rate;
  const baseAmount = round(s.amount * rate);
  const originalBase = round(s.amount * oi.rate);
  oi.outstanding = round(oi.outstanding - s.amount);
  oi.baseOutstanding = round(oi.baseOutstanding - originalBase);
  oi.status = oi.outstanding <= 0.005 ? 'Settled' : 'Partially Settled';
  oi.settlements.push({ id: `stl_s${String(++stlSeq).padStart(3, '0')}`, date: s.date, docType: s.docType, docId: s.docId, docNumber: s.docNumber, amount: s.amount, baseAmount, rate, fxGainLoss: round(baseAmount - originalBase) });
}

// ── Build everything ───────────────────────────────────────────────────────

export function seedSales(): Partial<DB> {
  lineSeq = 0; jvSeq = 330; jlSeq = 0; smSeq = 0; stlSeq = 0;
  const A = IDS.whAndheri;
  const SRT = { branchId: IDS.brSurat };

  // ── Invoices ────────────────────────────────────────────────────────────
  const inv = (id: string, n: string, date: string, custId: string, lines: LineSpec[], o: DocOpts = {}) => doc('Sales Invoice', id, `INV/26-27/${n}`, date, custId, lines, { due: o.due ?? addD(date, cust(custId).paymentTerms), status: 'Posted', extra: { roundTotal: true, statutory: { eInvoiceStatus: cust(custId).gstin ? 'Pending' : 'Not Applicable', ewbStatus: 'Not Applicable' } }, ...o });
  const srt = (id: string, n: string, date: string, custId: string, lines: LineSpec[], o: DocOpts = {}) => doc('Sales Invoice', id, `INV/SRT/26-27/${n}`, date, custId, lines, { due: addD(date, cust(custId).paymentTerms), status: 'Posted', ...SRT, wh: IDS.whMain, extra: { roundTotal: true, statutory: { eInvoiceStatus: cust(custId).gstin ? 'Pending' : 'Not Applicable', ewbStatus: 'Not Applicable' } }, ...o });

  const invoices: any[] = [
    inv('inv_0098', '0098', '2026-04-02', IDS.cVimal, [{ item: IDS.iSteel4, qty: 1, batch: 'HR-2603-A' }, { item: IDS.iSteel6, qty: 1, batch: 'CR-2603-B' }], { ref: 'VC/PO/2201', sp: IDS.spSuresh }),
    inv('inv_0101', '0101', '2026-04-03', IDS.cGlobalTech, [{ item: IDS.iConsult, qty: 30, rate: 2528.25, override: 'Negotiated project rate', desc: 'ERP advisory · March 2026' }], { ref: 'GTS-WO-118', extra: { roundTotal: true, templateId: IDS.tplInvoiceModern, templateVersion: 1, dimensions: { Project: IDS.dimPrj051, Department: IDS.dimDeptSales } } }),
    inv('inv_0102', '0102', '2026-04-04', IDS.cSunrise, [{ item: IDS.iCrate, qty: 20 }, { item: IDS.iBox, qty: 100 }], { ref: 'SI/PO/0410', sp: IDS.spSuresh }),
    inv('inv_0105', '0105', '2026-04-06', IDS.cArlene, [{ item: IDS.iBolt, qty: 200 }, { item: IDS.iGrind, qty: 10 }, { item: IDS.iGrease, qty: 1 }], { ref: 'PO-ARLENE-0039' }),
    inv('inv_0108', '0108', '2026-04-09', IDS.cRajesh, [{ item: IDS.iSteel6, qty: 1, batch: 'CR-2603-B' }, { item: IDS.iElectrode, qty: 10 }], { ref: 'RE/PO/1188' }),
    inv('inv_0109', '0109', '2026-04-11', IDS.cDelta, [{ item: IDS.iConsult, qty: 40 }, { item: IDS.iTransport, qty: 1 }], { status: 'Cancelled', posted: false, extra: { cancelReason: 'Cancelled before dispatch — customer withdrew the order', roundTotal: true } }),
    inv('inv_0110', '0110', '2026-04-12', IDS.cSunshine, [{ item: IDS.iBracket, qty: 10, batch: 'BR-2609-01', wh: A }, { item: IDS.iFrame, qty: 2, wh: A, serials: Array.from({ length: 2 }, (_, i) => `FR-L-26${String(i + 1).padStart(3, '0')}`) }], { ref: 'SE/LUT/0412', notes: 'Supply to SEZ unit under LUT — zero-rated', wh: A, branchId: IDS.brAndheri }),
    inv('inv_0111', '0111', '2026-04-13', IDS.cVimal, [{ item: IDS.iSteel4, qty: 2, batch: 'HR-2603-A' }, { item: IDS.iSteel6, qty: 1, batch: 'CR-2603-B' }], { ref: 'VC/PO/2214', sp: IDS.spSuresh }),
    inv('inv_0112', '0112', '2026-04-14', IDS.cKiran, [{ item: IDS.iConsult, qty: 15 }], { status: 'Returned', posted: false, ref: 'KT/PO/77', extra: { roundTotal: true, submittedAt: T('2026-04-14', '11:00'), submittedBy: 'Priya Mehta' } }),
    inv('inv_0113', '0113', '2026-04-15', IDS.cBharat, [{ item: IDS.iChai, qty: 20, batch: 'CH-2608' }, { item: IDS.iAssam, qty: 10, batch: 'AS-2607' }, { item: IDS.iGreen, qty: 10 }], { ref: 'BA-0415' }),
    inv('inv_0114', '0114', '2026-04-16', IDS.cMetro, [{ item: IDS.iSteel4, qty: 2, rate: 90500, batch: 'HR-2603-A' }], { ref: 'MD/PO/0931' }),
    inv('inv_0115', '0115', '2026-04-17', IDS.cSunrise, [{ item: IDS.iCrate, qty: 100 }, { item: IDS.iBox, qty: 500 }], { status: 'Draft', posted: false, ref: 'SI/PO/0417', extra: { roundTotal: true } }),
    inv('inv_0116', '0116', '2026-04-18', IDS.cGlobalTech, [{ item: IDS.iConsult, qty: 30, rate: 2528.25, override: 'Negotiated project rate', desc: 'ERP advisory · April 2026' }], { status: 'Submitted', posted: false, ref: 'GTS-WO-121', extra: { roundTotal: true, submittedAt: T('2026-04-18', '11:30'), submittedBy: 'Priya Mehta', dimensions: { Project: IDS.dimPrj051 } } }),
    inv('inv_0117', '0117', '2026-04-19', IDS.cRajesh, [{ item: IDS.iSteel4, qty: 1, batch: 'HR-2603-A' }, { item: IDS.iBracket, qty: 5, batch: 'BR-2609-01', wh: A }, { item: IDS.iGrind, qty: 3 }], { ref: 'RE/PO/1196' }),
    inv('inv_0118', '0118', '2026-04-21', IDS.cArlene, [{ item: IDS.iBolt, qty: 500 }, { item: IDS.iNut, qty: 400 }, { item: IDS.iGrease, qty: 2 }, { item: IDS.iConsult, qty: 40, rate: 1735, override: 'Blanket rate per annual contract', desc: 'On-site fitment support' }], { ref: 'PO-ARLENE-0042', sp: IDS.spAnita, source: { type: 'Delivery', id: 'dc_0075', number: 'DC/26-27/0075' }, extra: { roundTotal: true, deliveryIds: ['dc_0075'], approvalId: 'apr_inv_0118', submittedAt: T('2026-04-21', '09:30'), submittedBy: 'Rahul Kumar', statutory: { eInvoiceStatus: 'Accepted', irn: 'ab12ef3456cd789a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f9', ackNo: '232410012345678', ackDate: T('2026-04-22', '08:15'), signedQr: 'QR:ab12ef3456cd789a0b1c2d3e', eInvoiceSubmittedAt: T('2026-04-22', '08:15'), ewbStatus: 'Generated', ewbNo: '351002345678', ewbValidUpto: T('2026-04-23', '08:20'), vehicleNo: 'MH04CD5566', transporterId: '27AABCS9876T1Z0', distanceKm: 32 }, attachmentIds: ['att_inv_0118_po', 'att_inv_0118_einv'] } }),
    // Surat sales office series
    srt('inv_srt_0001', '0001', '2026-05-05', IDS.cVimal, [{ item: IDS.iSteel4, qty: 1, batch: 'HR-2603-A' }], { ref: 'VC/PO/2230', sp: IDS.spSuresh }),
    srt('inv_srt_0002', '0002', '2026-05-18', IDS.cSunrise, [{ item: IDS.iCrate, qty: 20 }], { ref: 'SI/PO/0518', sp: IDS.spSuresh }),
    srt('inv_srt_0003', '0003', '2026-06-04', IDS.cBharat, [{ item: IDS.iChai, qty: 10, batch: 'CH-2608' }, { item: IDS.iDarj, qty: 5 }], { ref: 'BA-0604' }),
    srt('inv_srt_0004', '0004', '2026-06-22', IDS.cDelta, [{ item: IDS.iConsult, qty: 20, desc: 'Validation consulting' }], { ref: 'DP/WO/622' }),
    srt('inv_srt_0005', '0005', '2026-07-08', IDS.cMetro, [{ item: IDS.iBolt, qty: 300 }, { item: IDS.iNut, qty: 500 }], { ref: 'MD/PO/1002' }),
    srt('inv_srt_0006', '0006', '2026-07-25', IDS.cVimal, [{ item: IDS.iSteel6, qty: 1, batch: 'CR-2603-B' }], { ref: 'VC/PO/2251', sp: IDS.spSuresh }),
    srt('inv_srt_0007', '0007', '2026-08-06', IDS.cUSTech, [{ item: IDS.iSteel4, qty: 1, rate: 1150, batch: 'HR-2603-A' }, { item: IDS.iBracket, qty: 20, rate: 24, batch: 'BR-2609-01', wh: A }], { currency: 'USD', rate: 84.1, ref: 'USTI-PO-2026-31', notes: 'Export under LUT · Incoterms FOB Nhava Sheva' }),
    srt('inv_srt_0008', '0008', '2026-08-14', IDS.cSunrise, [{ item: IDS.iBox, qty: 100 }], { ref: 'SI/PO/0814', sp: IDS.spSuresh }),
    srt('inv_srt_0009', '0009', '2026-08-28', IDS.cRajesh, [{ item: IDS.iElectrode, qty: 10 }], { ref: 'RE/PO/1240' }),
    srt('inv_srt_0010', '0010', '2026-09-04', IDS.cBharat, [{ item: IDS.iGreen, qty: 10 }, { item: IDS.iAssam, qty: 10, batch: 'AS-2607' }], { ref: 'BA-0904' }),
    srt('inv_srt_0011', '0011', '2026-09-10', IDS.cDelta, [{ item: IDS.iConsult, qty: 10 }], { status: 'Draft', posted: false, number: 'INV/DRAFT', extra: { roundTotal: true } }),
  ];
  invoices.forEach((i) => { if (i.status === 'Draft' && i.number.includes('SRT')) i.number = 'INV/DRAFT'; });
  const invById = (id: string) => invoices.find((i) => i.id === id)!;

  // ── Orders, deliveries, quotations ──────────────────────────────────────
  const so = (id: string, n: string, date: string, custId: string, lines: LineSpec[], o: DocOpts = {}) => doc('Sales Order', id, `SO/26-27/${n}`, date, custId, lines, { status: 'Confirmed', posted: false, extra: { expectedDate: addD(date, 'Net 7'), confirmedAt: T(date, '11:00'), confirmedBy: 'Priya Mehta', reservationExpiry: addD(date, 'Net 14') }, ...o });
  const orders: any[] = [
    so('so_0092', '0092', '2026-04-10', IDS.cArlene, [{ item: IDS.iBolt, qty: 500 }, { item: IDS.iNut, qty: 400 }, { item: IDS.iGrease, qty: 2 }, { item: IDS.iConsult, qty: 40, rate: 1735, override: 'Blanket rate per annual contract', desc: 'On-site fitment support' }], { status: 'Closed', ref: 'PO-ARLENE-0042', sp: IDS.spAnita }),
    so('so_0123', '0123', '2026-08-29', IDS.cGlobalTech, [{ item: IDS.iConsult, qty: 30, rate: 2528.25, override: 'Negotiated project rate' }], { status: 'Draft', extra: { expectedDate: '2026-09-15' } }),
    so('so_0124', '0124', '2026-09-01', IDS.cSunrise, [{ item: IDS.iCrate, qty: 30, wh: A }, { item: IDS.iBox, qty: 200, wh: A }], { status: 'Delivered', wh: A, sp: IDS.spSuresh, ref: 'SI/PO/0901', branchId: IDS.brAndheri }),
    so('so_0125', '0125', '2026-09-04', IDS.cRajesh, [{ item: IDS.iBolt, qty: 300 }, { item: IDS.iNut, qty: 300 }, { item: IDS.iElectrode, qty: 10 }], { status: 'Partially Delivered', ref: 'RE/PO/1252' }),
    so('so_0126', '0126', '2026-09-06', IDS.cVimal, [{ item: IDS.iSteel4, qty: 1, wh: A }, { item: IDS.iSteel6, qty: 1, wh: A }, { item: IDS.iBracket, qty: 10, wh: A }, { item: IDS.iBolt, qty: 500, wh: A }, { item: IDS.iNut, qty: 500, wh: A }], { wh: A, sp: IDS.spSuresh, source: { type: 'Quotation', id: 'qt_0038', number: 'QT/26-27/0038' }, ref: 'VC/PO/2270', branchId: IDS.brAndheri }),
    so('so_0127', '0127', '2026-09-08', IDS.cMetro, [{ item: IDS.iSteel4, qty: 1, rate: 90500 }, { item: IDS.iCrate, qty: 20 }, { item: IDS.iBox, qty: 100 }], { status: 'Delivered', ref: 'MD/PO/1031' }),
    so('so_0128', '0128', '2026-09-10', IDS.cArlene, [{ item: IDS.iBolt, qty: 800 }, { item: IDS.iNut, qty: 400 }, { item: IDS.iGrease, qty: 2 }], { status: 'Partially Delivered', ref: 'PO-ARLENE-0058' }),
  ];
  const orderById = (id: string) => orders.find((x) => x.id === id)!;
  const soLine = (orderId: string, itemId: string) => orderById(orderId).lines.find((l: DocLine) => l.itemId === itemId)!;

  const dc = (id: string, n: string, date: string, orderId: string | undefined, custId: string, lines: LineSpec[], o: DocOpts = {}) => {
    const order = orderId ? orderById(orderId) : undefined;
    const d = doc('Delivery', id, `DC/26-27/${n}`, date, custId, lines, { status: 'Posted', by: 'Suresh Kumar', source: order ? { type: 'Sales Order', id: order.id, number: order.number } : undefined, ref: order?.reference, ...o });
    if (order) d.lines = d.lines.map((l: DocLine) => { const sl = soLine(order.id, l.itemId!); return { ...l, sourceLineId: sl.id, sourceDocId: order.id, sourceQty: sl.qty, remainingQty: round(sl.qty - l.qty), invoicedQty: 0 }; });
    return d;
  };
  const deliveries: any[] = [
    dc('dc_0075', '0075', '2026-04-15', 'so_0092', IDS.cArlene, [{ item: IDS.iBolt, qty: 500 }, { item: IDS.iNut, qty: 400 }, { item: IDS.iGrease, qty: 2 }], { extra: { invoiced: true, vehicleNo: 'MH04CD5566', transporter: 'Speedway Logistics' } }),
    dc('dc_0093', '0093', '2026-09-01', undefined, IDS.cGlobalTech, [{ item: IDS.iGrind, qty: 10 }], { status: 'Draft', posted: false }),
    dc('dc_0094', '0094', '2026-09-09', 'so_0127', IDS.cMetro, [{ item: IDS.iCrate, qty: 20 }], { extra: { vehicleNo: 'MH02AB1234', transporter: 'Speedway Logistics' } }),
    dc('dc_0095', '0095', '2026-09-05', 'so_0124', IDS.cSunrise, [{ item: IDS.iCrate, qty: 30, wh: A }, { item: IDS.iBox, qty: 200, wh: A }], { wh: A, branchId: IDS.brAndheri }),
    dc('dc_0096', '0096', '2026-09-07', 'so_0125', IDS.cRajesh, [{ item: IDS.iBolt, qty: 150 }, { item: IDS.iNut, qty: 150 }]),
    dc('dc_0097', '0097', '2026-09-11', 'so_0127', IDS.cMetro, [{ item: IDS.iSteel4, qty: 1, rate: 90500, batch: 'HR-2603-A' }, { item: IDS.iBox, qty: 100 }], { extra: { vehicleNo: 'MH02AB1234' } }),
    dc('dc_0098', '0098', '2026-09-11', 'so_0128', IDS.cArlene, [{ item: IDS.iBolt, qty: 500 }, { item: IDS.iNut, qty: 200 }], { extra: { vehicleNo: 'MH04CD5566' } }),
  ];
  // order line fulfilment from posted deliveries + invoiced quantities
  deliveries.filter((d) => d.status === 'Posted').forEach((d) => d.lines.forEach((l: DocLine) => { const sl = orderById(l.sourceDocId!).lines.find((x: DocLine) => x.id === l.sourceLineId)!; sl.deliveredQty = round((sl.deliveredQty ?? 0) + l.qty); }));
  orders.forEach((o) => o.lines.forEach((l: DocLine) => { l.deliveredQty = l.deliveredQty ?? 0; l.invoicedQty = 0; l.reservedQty = 0; l.returnedQty = 0; l.remainingQty = round(l.qty - l.deliveredQty); }));
  // so_0092 fully invoiced by inv_0118 via dc_0075
  orderById('so_0092').lines.forEach((l: DocLine) => { l.invoicedQty = l.qty; });
  deliveries.find((d) => d.id === 'dc_0075').lines.forEach((l: DocLine) => { l.invoicedQty = l.qty; });
  const inv0118 = invById('inv_0118');
  inv0118.lines = inv0118.lines.map((l: DocLine, i: number) => { const dl = deliveries.find((d) => d.id === 'dc_0075').lines[i]; if (dl) return { ...l, sourceLineId: dl.id, sourceDocId: 'dc_0075', sourceQty: dl.qty, remainingQty: 0 }; const sl = orderById('so_0092').lines[i]; return { ...l, sourceLineId: sl.id, sourceDocId: 'so_0092', sourceQty: sl.qty, remainingQty: 0 }; });

  // reservations for open order lines
  const reservations: Reservation[] = [];
  const reserve = (orderId: string, itemId: string, qty: number, fulfilled = 0) => { const o = orderById(orderId); const l = soLine(orderId, itemId); l.reservedQty = qty; reservations.push(rec<Reservation>(`rsv_${orderId}_${itemId.replace('item_', '')}`, { companyId: CO, itemId, warehouseId: l.warehouseId ?? o.warehouseId, qty, fulfilledQty: fulfilled, sourceType: 'Sales Order', sourceId: o.id, sourceNumber: o.number, lineId: l.id, status: fulfilled >= qty ? 'Fulfilled' : fulfilled > 0 ? 'Partially Fulfilled' : 'Reserved', expiresAt: o.reservationExpiry, createdAt: T(o.date, '11:00'), updatedAt: T(o.date, '11:00') })); };
  reserve('so_0125', IDS.iBolt, 300, 150); reserve('so_0125', IDS.iNut, 300, 150); reserve('so_0125', IDS.iElectrode, 10);
  ['item_stl4', 'item_stl6', 'item_bracket', 'item_bolt', 'item_nut'].forEach((it) => reserve('so_0126', it, soLine('so_0126', it).qty));
  reserve('so_0128', IDS.iBolt, 800, 500); reserve('so_0128', IDS.iNut, 400, 200); reserve('so_0128', IDS.iGrease, 2);

  const qt = (id: string, n: string, date: string, custId: string, status: string, valid: string, lines: LineSpec[], o: DocOpts = {}) => doc('Quotation', id, `QT/26-27/${n}`, date, custId, lines, { status, posted: false, extra: { validUntil: valid, revision: 1, sentAt: ['Sent', 'Accepted', 'Converted', 'Expired'].includes(status) ? T(date, '15:00') : undefined, sentTo: ['Sent', 'Accepted', 'Converted', 'Expired'].includes(status) ? cust(custId).contacts[0]?.email : undefined, acceptedAt: status === 'Accepted' || status === 'Converted' ? T(addD(date, 'Net 2'), '10:00') : undefined, ...(o.extra ?? {}) }, terms2: 'Prices exclusive of GST · Delivery ex-works Mumbai · Payment as per agreed terms', ...o });
  const quotations: any[] = [
    qt('qt_0041', '0041', '2026-09-11', IDS.cArlene, 'Sent', '2026-09-25', [{ item: IDS.iBolt, qty: 2000 }, { item: IDS.iNut, qty: 1000 }, { item: IDS.iGrease, qty: 12 }], { sp: IDS.spVikram, ref: 'Arlene RFQ Sep-26' }),
    qt('qt_0040', '0040', '2026-09-09', IDS.cRajesh, 'Draft', '2026-09-23', [{ item: IDS.iSteel4, qty: 1 }, { item: IDS.iBracket, qty: 50 }, { item: IDS.iBolt, qty: 1000 }, { item: IDS.iNut, qty: 1000 }, { item: IDS.iGrind, qty: 20 }], { sp: IDS.spPriya }),
    qt('qt_0039', '0039', '2026-09-07', IDS.cMetro, 'Accepted', '2026-09-21', [{ item: IDS.iSteel4, qty: 1, rate: 90500 }, { item: IDS.iCrate, qty: 50 }], { sp: IDS.spVikram }),
    qt('qt_0038', '0038', '2026-09-05', IDS.cVimal, 'Converted', '2026-09-19', [{ item: IDS.iSteel4, qty: 1 }, { item: IDS.iSteel6, qty: 1 }, { item: IDS.iBracket, qty: 10 }, { item: IDS.iBolt, qty: 500 }, { item: IDS.iNut, qty: 500 }], { sp: IDS.spSuresh, extra: { convertedToId: 'so_0126', convertedToNumber: 'SO/26-27/0126' } }),
    qt('qt_0037', '0037', '2026-09-02', IDS.cGlobalTech, 'Expired', '2026-09-12', [{ item: IDS.iConsult, qty: 10 }], { sp: IDS.spPriya }),
    qt('qt_0036', '0036', '2026-08-29', IDS.cSunrise, 'Sent', '2026-09-26', [{ item: IDS.iCrate, qty: 300 }, { item: IDS.iBox, qty: 1500 }, { item: IDS.iBolt, qty: 500 }, { item: IDS.iTransport, qty: 1 }], { sp: IDS.spSuresh }),
    qt('qt_0035', '0035', '2026-08-20', IDS.cDelta, 'Declined', '2026-09-03', [{ item: IDS.iAMC, qty: 1 }], { sp: IDS.spPriya, extra: { declinedReason: 'Customer chose an incumbent vendor on price' } }),
  ];
  orderById('so_0126').lines.forEach((l: DocLine, i: number) => { const ql = quotations.find((q) => q.id === 'qt_0038').lines[i]; l.sourceLineId = ql.id; l.sourceDocId = 'qt_0038'; l.sourceQty = ql.qty; });

  // ── Receipts ────────────────────────────────────────────────────────────
  const openItems: OpenItem[] = [];
  invoices.filter((i) => i.status === 'Posted').forEach((i) => openItems.push(openItem(i, { direction: 'Debit' })));
  const oiFor = (docId: string) => openItems.find((o) => o.docId === docId && o.direction === 'Debit')!;
  const rcpt = (id: string, n: string, date: string, custId: string, method: string, reference: string, amount: number, allocs: [string, number][], o: { bank?: string; charges?: number; tds?: number; rate?: number; currency?: string; branchId?: string } = {}) => {
    const c = cust(custId);
    const allocations = allocs.map(([invId, amt]) => ({ openItemId: `oi_${invId}`, docId: invId, docNumber: invById(invId).number, amount: amt }));
    const allocated = round(allocations.reduce((s, a) => s + a.amount, 0));
    const unapplied = round(amount - allocated);
    const rate = o.rate ?? 1;
    const r = rec<any>(id, { companyId: CO, number: `RCPT/26-27/${n}`, docType: 'Receipt', date, branchId: o.branchId ?? IDS.brHO, status: 'Posted', currency: o.currency ?? 'INR', rate, partyType: 'Customer', partyId: c.id, partyName: c.name, partySnapshot: snapshot(c), method, reference, bankAccountId: o.bank ?? (method === 'Cash' ? IDS.accPettyCash : IDS.accHDFC), amount, charges: o.charges ?? 0, tds: o.tds ?? 0, allocations, unapplied, lines: [], totals: { subtotal: amount, discount: 0, taxable: amount, tax: 0, components: {}, breakup: [], charges: 0, tds: 0, roundOff: 0, total: amount, paid: allocated, credited: 0, writtenOff: 0, due: unapplied, baseTotal: round(amount * rate) }, fy: '2026-27', period: date.slice(0, 7), correlationId: `corr_${id.toUpperCase()}`, postedAt: T(date, '14:00'), postedBy: 'Anil Patil', createdAt: T(date, '13:30'), updatedAt: T(date, '14:00'), createdBy: 'Anil Patil', idempotencyKey: `rcpt:${id}:post`, templateId: IDS.tplReceipt, chequeDate: method === 'Cheque' ? date : undefined, chequeBank: method === 'Cheque' ? 'Bank of Baroda' : undefined });
    // Realized FX: the open item clears at its booked rate while the bank receives the settlement
    // rate, so the difference must be booked to AR — otherwise control drifts from the sub-ledger.
    let fxGainLoss = 0;
    allocations.forEach((a) => { const oi = oiFor(a.docId); fxGainLoss = round(fxGainLoss + round(a.amount * rate) - round(a.amount * oi.rate)); settle(oi, { date, docType: 'Receipt', docId: id, docNumber: r.number, amount: a.amount, rate }); });
    r.fxGainLoss = fxGainLoss;
    if (unapplied > 0.005) { const adv = openItem(r, { direction: 'Credit', amount: unapplied, docType: 'Receipt', id: `oi_adv_${id}` }); openItems.push(adv); r.advanceOpenItemId = adv.id; }
    return r;
  };
  const tot = (id: string) => invById(id).totals.total as number;
  const receipts: any[] = [
    rcpt('rcpt_0212', '0212', '2026-09-08', IDS.cUSTech, 'NEFT', 'SWIFT/090801/USD/4471', 1630, [['inv_srt_0007', 1630]], { bank: 'acc_1330', currency: 'USD', rate: 84.3, branchId: IDS.brSurat }),
    rcpt('rcpt_0182', '0182', '2026-04-07', IDS.cGlobalTech, 'NEFT', 'NEFT/040701/00214', tot('inv_0101'), [['inv_0101', tot('inv_0101')]]),
    rcpt('rcpt_0188', '0188', '2026-04-10', IDS.cSunrise, 'UPI', 'UPI/041012/88341', 74200, []),
    rcpt('rcpt_0192', '0192', '2026-04-20', IDS.cVimal, 'Cheque', 'CHQ 184512', 500000, [['inv_0098', tot('inv_0098')], ['inv_0111', round(500000 - tot('inv_0098'))]]),
    rcpt('rcpt_0198', '0198', '2026-04-22', IDS.cRajesh, 'IMPS', 'IMPS/041801/23412', 145000, [['inv_0117', 100000]], { bank: IDS.accICICI }),
    rcpt('rcpt_0201', '0201', '2026-04-25', IDS.cMetro, 'RTGS', 'RTGS/042011/09943', tot('inv_0114'), [['inv_0114', tot('inv_0114')]]),
    rcpt('rcpt_0203', '0203', '2026-04-28', IDS.cArlene, 'NEFT', 'NEFT/042208/00412', tot('inv_0105'), [['inv_0105', tot('inv_0105')]]),
    rcpt('rcpt_0205', '0205', '2026-05-30', IDS.cVimal, 'NEFT', 'NEFT/053001/11021', tot('inv_srt_0001'), [['inv_srt_0001', tot('inv_srt_0001')]], { branchId: IDS.brSurat }),
    rcpt('rcpt_0206', '0206', '2026-06-20', IDS.cSunrise, 'RTGS', 'RTGS/062002/04412', tot('inv_srt_0002'), [['inv_srt_0002', tot('inv_srt_0002')]], { branchId: IDS.brSurat }),
    rcpt('rcpt_0207', '0207', '2026-07-02', IDS.cBharat, 'UPI', 'UPI/070211/55321', 4000, [['inv_srt_0003', 4000]], { branchId: IDS.brSurat }),
    rcpt('rcpt_0208', '0208', '2026-08-10', IDS.cVimal, 'NEFT', 'NEFT/081001/22910', 100000, [['inv_srt_0006', 100000]], { branchId: IDS.brSurat }),
    rcpt('rcpt_0210', '0210', '2026-09-05', IDS.cRajesh, 'NEFT', 'NEFT/090501/00871', 15000, [['inv_srt_0009', 15000]], { charges: 0, branchId: IDS.brSurat }),
  ];

  // ── Credit notes & sales returns ────────────────────────────────────────
  const REASON: Record<string, string> = { rc_short: 'Short supply', rc_disc: 'Discount adjustment', rc_qual: 'Quality rejection', rc_price: 'Price correction', rc_dmg: 'Goods damaged in transit' };
  const salesReturns: any[] = [];
  const cn = (id: string, n: string, date: string, invId: string, reason: string, lines: (LineSpec & { srcIdx?: number })[], o: { status?: string; goods?: boolean; posted?: boolean; number?: string } = {}) => {
    const i = invById(invId);
    const status = o.status ?? 'Posted';
    const d = doc('Credit Note', id, o.number ?? `CN/26-27/${n}`, date, i.partyId, lines, { branchId: i.branchId, status, posted: status === 'Posted', source: { type: 'Sales Invoice', id: i.id, number: i.number }, extra: { invoiceId: i.id, invoiceNumber: i.number, reasonCode: reason, reasonText: REASON[reason], goodsReturn: !!o.goods, returnWarehouseId: o.goods ? i.warehouseId : undefined, roundTotal: true, submittedAt: status === 'Submitted' ? T(date, '11:00') : undefined, submittedBy: status === 'Submitted' ? 'Priya Mehta' : undefined } });
    d.lines = d.lines.map((l: DocLine, k: number) => { const src = lines[k].srcIdx !== undefined ? i.lines[lines[k].srcIdx!] : i.lines.find((x: DocLine) => x.itemId === l.itemId); return src ? { ...l, sourceLineId: src.id, sourceDocId: i.id, sourceQty: src.qty, remainingQty: round(src.qty - (src.returnedQty ?? 0)) } : l; });
    if (status === 'Posted') {
      d.lines.forEach((l: DocLine) => { const src = i.lines.find((x: DocLine) => x.id === l.sourceLineId); if (src && l.itemId === src.itemId) src.returnedQty = round((src.returnedQty ?? 0) + l.qty); });
      const oi = oiFor(i.id);
      const allocated = round(Math.min(d.totals.total, oi.outstanding));
      if (allocated > 0) settle(oi, { date, docType: 'Credit Note', docId: id, docNumber: d.number, amount: allocated });
      const unapplied = round(d.totals.total - allocated);
      d.allocated = allocated; d.unapplied = unapplied;
      if (unapplied > 0.005) { const c = openItem(d, { direction: 'Credit', amount: unapplied, docType: 'Credit Note', id: `oi_cr_${id}` }); openItems.push(c); d.creditOpenItemId = c.id; }
      if (o.goods) {
        const srId = `sr_${id.replace('cn_', '')}`;
        const sr = rec<any>(srId, { companyId: CO, number: `SR/26-27/${String(salesReturns.length + 6).padStart(4, '0')}`, docType: 'Sales Return', date, branchId: i.branchId, status: 'Posted', currency: d.currency, rate: 1, partyType: 'Customer', partyId: d.partyId, partyName: d.partyName, partySnapshot: d.partySnapshot, sourceType: 'Credit Note', sourceId: id, sourceNumber: d.number, warehouseId: i.warehouseId, lines: d.lines.filter((l: DocLine) => item(l.itemId!)?.isStock).map((l: DocLine) => ({ ...l, id: lid(), warehouseId: l.warehouseId ?? i.warehouseId })), totals: d.totals, creditNoteId: id, creditNoteNumber: d.number, invoiceId: i.id, invoiceNumber: i.number, reasonCode: reason, journalId: `jv_${id}`, fy: '2026-27', period: date.slice(0, 7), correlationId: `corr_${id.toUpperCase()}`, postedAt: T(date, '12:00'), postedBy: 'Suresh Kumar', createdAt: T(date, '12:00'), updatedAt: T(date, '12:00') });
        salesReturns.push(sr);
        d.salesReturnId = srId;
      }
    }
    return d;
  };
  const creditNotes: any[] = [
    cn('cn_0015', '0015', '2026-08-22', 'inv_0098', 'rc_short', [{ item: IDS.iSteel6, qty: 0.5, batch: 'CR-2603-B', srcIdx: 1 }]),
    cn('cn_0016', '0016', '2026-08-28', 'inv_0102', 'rc_disc', [{ item: IDS.iBox, qty: 20, srcIdx: 1 }]),
    cn('cn_0017', '0017', '2026-09-02', 'inv_0108', 'rc_qual', [{ item: IDS.iElectrode, qty: 5 }], { status: 'Draft', goods: true }),
    cn('cn_0018', '0018', '2026-09-06', 'inv_0114', 'rc_price', [{ name: 'Price correction — Steel Plates 4mm HR', qty: 2, rate: 6000, tax: IDS.taxGST18, hsn: '72084000', account: IDS.accSales, uom: 'MT', srcIdx: 0 }]),
    cn('cn_0019', '0019', '2026-09-10', 'inv_0105', 'rc_dmg', [{ item: IDS.iBolt, qty: 100 }, { item: IDS.iGrind, qty: 3 }], { goods: true }),
    cn('cn_0008', '0008', '2026-09-11', 'inv_0117', 'rc_price', [{ name: 'Price correction — Hex Bolt M16 × 60', qty: 1, rate: 10593.22, tax: IDS.taxGST18, hsn: '73181500', account: IDS.accSales, uom: 'Nos', srcIdx: 1 }], { status: 'Submitted' }),
  ];
  // CN drafts keep DRAFT number until posted (series allocates on post) — cn_0017
  creditNotes.find((c) => c.id === 'cn_0017').number = 'CN/DRAFT';

  // invoice paid / credited / due from open items
  invoices.filter((i) => i.status === 'Posted').forEach((i) => {
    const oi = oiFor(i.id);
    i.openItemId = oi.id;
    i.totals.paid = round(oi.settlements.filter((s) => s.docType === 'Receipt').reduce((a, s) => a + s.amount, 0));
    i.totals.credited = round(oi.settlements.filter((s) => s.docType === 'Credit Note').reduce((a, s) => a + s.amount, 0));
    i.totals.due = round(Math.max(0, oi.outstanding));
    if (i.totals.due <= 0.005) i.status = 'Settled';
  });

  // ── Journals ────────────────────────────────────────────────────────────
  const journals: Journal[] = [];
  invoices.filter((i) => i.status === 'Posted' || i.status === 'Settled').sort((a, b) => a.date.localeCompare(b.date)).forEach((i) => { const j = invoiceJournal(i, i.id === 'inv_0118' ? 'JV/26-27/0412' : undefined); journals.push(j); i.journalId = j.id; i.journalNumber = j.number; i.idempotencyKey = `inv:${i.id}:post`; });
  receipts.forEach((r) => {
    const j = receiptJournal(r); journals.push(j); r.journalId = j.id; r.journalNumber = j.number;
    // Realized FX is a separate base-currency journal (the receipt journal is in the document
    // currency), exactly as engine.settleOpenItem posts it at runtime (FR-FX-007).
    if (Math.abs(r.fxGainLoss ?? 0) > 0.005) {
      const abs = Math.abs(r.fxGainLoss);
      const gain = r.fxGainLoss > 0;
      const fj = journal(`jv_fx_${r.id}`, r.date, gain
        ? [{ accountId: IDS.accAR, dr: abs, partyId: r.partyId, partyName: r.partyName }, { accountId: IDS.accFxGain, cr: abs }]
        : [{ accountId: IDS.accFxLoss, dr: abs }, { accountId: IDS.accAR, cr: abs, partyId: r.partyId, partyName: r.partyName }],
        { sourceType: 'FX Settlement', sourceId: r.id, sourceNumber: r.number, narration: `Realized FX ${gain ? 'gain' : 'loss'} on ${r.allocations.map((a: any) => a.docNumber).join(', ')} (${r.currency}) settled at ${r.rate}`, branchId: r.branchId });
      journals.push(fj);
    }
  });
  creditNotes.filter((c) => c.status === 'Posted').forEach((c) => { const j = creditNoteJournal(c); journals.push(j); c.journalId = j.id; c.journalNumber = j.number; c.idempotencyKey = `cn:${c.id}:post`; });

  // ── Stock movements + cost of goods sold ────────────────────────────────
  // Every movement carries a journal of the same value (FR-INV-008): relieving stock without
  // relieving inventory control leaves 1200/1210 permanently above the AVCO stock valuation.
  const moves: StockMovement[] = [];
  const cogsJournal = (doc: any, srcType: string, ms: StockMovement[]) => {
    const byAcc = new Map<string, number>();
    ms.forEach((m) => { const a = item(m.itemId)?.inventoryAccountId ?? IDS.accInvFG; byAcc.set(a, round((byAcc.get(a) ?? 0) + (m.baseQty < 0 ? m.value : -m.value))); });
    const total = round(Array.from(byAcc.values()).reduce((s, v) => s + v, 0));
    if (Math.abs(total) < 0.005) return;
    const lines = [
      ...(total > 0 ? [{ accountId: IDS.accCOGS, dr: total }] : [{ accountId: IDS.accCOGS, cr: -total }]),
      ...Array.from(byAcc.entries()).filter(([, v]) => Math.abs(v) >= 0.005).map(([a, v]) => (v > 0 ? { accountId: a, cr: v } : { accountId: a, dr: -v })),
    ];
    const j = journal(`jv_cogs_${doc.id}`, doc.date, lines, { sourceType: srcType, sourceId: doc.id, sourceNumber: doc.number, narration: `${total > 0 ? 'Cost of goods sold' : 'Cost of goods returned to stock'} · ${doc.number}`, branchId: doc.branchId, idempotencyKey: `cogs:${doc.id}` });
    journals.push(j);
    ms.forEach((m) => { m.journalId = j.id; });
  };
  deliveries.filter((d) => d.status === 'Posted').forEach((d) => { const ms: StockMovement[] = []; d.lines.forEach((l: DocLine) => { const m = stockMove(d.date, l, -1, 'Delivery', { type: 'Delivery', id: d.id, number: d.number }); if (m) ms.push(m); }); moves.push(...ms); cogsJournal(d, 'Delivery', ms); });
  invoices.filter((i) => (i.status === 'Posted' || i.status === 'Settled') && !i.sourceId).forEach((i) => { const ms: StockMovement[] = []; i.lines.forEach((l: DocLine) => { const m = stockMove(i.date, l, -1, 'Delivery', { type: 'Sales Invoice', id: i.id, number: i.number }, i.journalId); if (m) ms.push(m); }); moves.push(...ms); cogsJournal(i, 'Sales Invoice', ms); });
  salesReturns.forEach((sr) => { const ms: StockMovement[] = []; sr.lines.forEach((l: DocLine) => { const m = stockMove(sr.date, l, 1, 'Sales Return', { type: 'Sales Return', id: sr.id, number: sr.number }, sr.journalId); if (m) ms.push(m); }); moves.push(...ms); cogsJournal(sr, 'Sales Return', ms); });

  // ── Approvals / attachments / audit for the flagship invoice ────────────
  const approvals: ApprovalRequest[] = [
    rec<ApprovalRequest>('apr_inv_0118', { companyId: CO, docType: 'Sales Invoice', collection: C.salesInvoices, docId: 'inv_0118', docNumber: 'INV/26-27/0118', amount: 118000, currency: 'INR', branchId: IDS.brHO, requesterId: IDS.uRahul, requesterName: 'Rahul Kumar', ruleId: 'wf_inv', ruleName: 'Sales Invoice Approval', ruleVersion: 2, steps: [{ order: 1, name: 'Finance approval', approverType: 'Role', approverRef: IDS.rFinAdmin, approverLabel: 'Finance Approver', status: 'Approved', actedBy: 'Priya Mehta', actedById: IDS.uPriya, actedAt: T('2026-04-21', '09:45'), comment: 'Approved. Terms verified and credit check passed.', commentRequired: false }, { order: 2, name: 'CFO approval', approverType: 'User', approverRef: IDS.uOwner, approverLabel: 'CFO (above ₹5L)', status: 'Skipped', commentRequired: true }], currentStep: 2, status: 'Approved', submittedAt: T('2026-04-21', '09:30'), completedAt: T('2026-04-21', '09:45'), history: [{ at: T('2026-04-21', '09:30'), by: 'Rahul Kumar', action: 'Submitted for approval' }, { at: T('2026-04-21', '09:45'), by: 'Priya Mehta', action: 'Approved at step 1', comment: 'Approved. Terms verified and credit check passed.', step: 1 }], summary: 'Arlene Traders · ₹1,18,000.00', createdAt: T('2026-04-21', '09:30'), updatedAt: T('2026-04-21', '09:45') }),
  ];
  const attachments: Attachment[] = [
    rec<Attachment>('att_inv_0118_po', { companyId: CO, objectType: 'Sales Invoice', objectId: 'inv_0118', name: 'Purchase-Order-Arlene.pdf', size: 43008, mime: 'application/pdf', scanState: 'Clean', uploadedBy: 'Rahul Kumar', at: T('2026-04-21', '09:16'), fileVersion: 1 }),
    rec<Attachment>('att_inv_0118_einv', { companyId: CO, objectType: 'Sales Invoice', objectId: 'inv_0118', name: 'e-Invoice-INV-26-27-0118-signed.pdf', size: 18432, mime: 'application/pdf', scanState: 'Clean', statutory: true, uploadedBy: 'IRP', at: T('2026-04-22', '08:15'), fileVersion: 1 }),
  ];
  const au = (id: string, at: string, actor: string, action: string, objectType: string, objectId: string, objectNumber: string, detail?: string): AuditEvent => rec<AuditEvent>(id, { companyId: CO, at, actor, action, objectType, objectId, objectNumber, result: 'Success', detail, correlationId: `corr_${objectId.toUpperCase()}`, channel: 'web', createdAt: at, updatedAt: at });
  const audit: AuditEvent[] = [
    au('au_inv0118_1', T('2026-04-21', '09:15'), 'Rahul Kumar', 'invoice.created', 'Sales Invoice', 'inv_0118', 'INV/DRAFT', 'Converted from DC/26-27/0075 (SO/26-27/0092)'),
    au('au_inv0118_2', T('2026-04-21', '09:30'), 'Rahul Kumar', 'workflow.submitted', 'Sales Invoice', 'inv_0118', 'INV/DRAFT', 'Sales Invoice Approval v2 · 2 step(s)'),
    au('au_inv0118_3', T('2026-04-21', '09:45'), 'Priya Mehta', 'workflow.approve', 'Sales Invoice', 'inv_0118', 'INV/DRAFT', 'Approved. Terms verified and credit check passed.'),
    au('au_inv0118_4', T('2026-04-21', '10:00'), 'Rahul Kumar', 'invoice.posted', 'Sales Invoice', 'inv_0118', 'INV/26-27/0118', 'Arlene Traders · ₹1,18,000.00 · JV/26-27/0412'),
    au('au_inv0118_5', T('2026-04-22', '08:15'), 'Rahul Kumar', 'einvoice.accepted', 'Sales Invoice', 'inv_0118', 'INV/26-27/0118', 'IRN ab12ef3456cd789a… Ack 232410012345678'),
    au('au_inv0118_6', T('2026-04-22', '08:20'), 'Suresh Kumar', 'ewaybill.generated', 'Sales Invoice', 'inv_0118', 'INV/26-27/0118', 'EWB 351002345678 · valid 1 day(s)'),
    au('au_inv0116_1', T('2026-04-18', '11:30'), 'Priya Mehta', 'workflow.submitted', 'Sales Invoice', 'inv_0116', 'INV/26-27/0116', 'Sales Invoice Approval v2 · 2 step(s)'),
    au('au_cn0008_1', T('2026-09-11', '11:00'), 'Priya Mehta', 'workflow.submitted', 'Credit Note', 'cn_0008', 'CN/26-27/0008', 'Credit Note Approval v2 · 2 step(s)'),
  ];
  const integrationLogs = [
    rec<any>('il_inv_0118_irn', { companyId: CO, provider: 'IRP', action: 'GenerateIRN', objectType: 'Sales Invoice', objectId: 'inv_0118', objectNumber: 'INV/26-27/0118', requestFingerprint: 'fp_inv0118', idempotencyKey: 'einv:inv_0118', request: { DocNo: 'INV/26-27/0118', DocDt: '2026-04-21', SellerGstin: '27AAAPL1234C1Z5', BuyerGstin: '27AAAPL1234C1Z5', TotInvVal: 118000 }, response: { Irn: 'ab12ef3456cd789a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f9', AckNo: '232410012345678', AckDt: T('2026-04-22', '08:15'), Status: 'ACT' }, status: 'Accepted', providerRef: '232410012345678', at: T('2026-04-22', '08:15'), correlationId: 'corr_INV_0118' }),
    rec<any>('il_inv_0118_ewb', { companyId: CO, provider: 'EWB', action: 'GenerateEWB', objectType: 'Sales Invoice', objectId: 'inv_0118', objectNumber: 'INV/26-27/0118', requestFingerprint: 'fp_inv0118_ewb', idempotencyKey: 'ewb:inv_0118', request: { DocNo: 'INV/26-27/0118', VehicleNo: 'MH04CD5566', Distance: 32 }, response: { EwbNo: '351002345678', EwbValidTill: T('2026-04-23', '08:20') }, status: 'Accepted', providerRef: '351002345678', at: T('2026-04-22', '08:20'), correlationId: 'corr_INV_0118' }),
  ];

  return {
    [C.quotations]: quotations, [C.salesOrders]: orders, [C.deliveries]: deliveries, [C.salesInvoices]: invoices, [C.creditNotes]: creditNotes, [C.salesReturns]: salesReturns, [C.receipts]: receipts,
    [C.journals]: journals as any, [C.openItems]: openItems as any, [C.stockMovements]: moves as any, [C.reservations]: reservations as any,
    [C.approvals]: approvals as any, [C.attachments]: attachments as any, [C.audit]: audit as any, [C.integrationLogs]: integrationLogs,
  };
}

/** Add payment-term days to a date (seed-time equivalent of engine.dueDateFor). */
function addD(date: string, terms?: string): string {
  const days = terms?.match(/(\d+)/) ? parseInt(terms!.match(/(\d+)/)![1], 10) : 0;
  const d = new Date(date + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export { SEED_NOW };
