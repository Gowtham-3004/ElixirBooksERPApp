// Seed data for the purchase module (requisitions, RFQs, POs, GRNs, vendor
// invoices, match exceptions, debit notes, payments, payment batches, AP open
// items and the journals behind every posted document). Owned by purchase.
// Helpers exported here are reused by the inventory and banking seeds.
import type { DB } from '../db';
import type { DocLine, DocTotals, Journal, JournalLine, OpenItem, PartySnapshot } from '../types';
import type { Requisition, Rfq, SupplierQuote, PurchaseOrder, PoLine, Grn, GrnLine, VendorInvoice, VendorInvoiceLine, MatchException, DebitNote, PurchaseReturn, Payment, PaymentBatch } from '../../modules/purchase/types';
import { C } from '../collections';
import { IDS, rec, SEED_NOW } from './core';

const co = IDS.acme;
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

// ── Account map (id → code/name) for seeded journals ───────────────────────
export const ACC: Record<string, [string, string]> = {
  acc_1100: ['1100', 'Trade Receivables (AR Control)'], acc_1200: ['1200', 'Inventory — Finished Goods'], acc_1210: ['1210', 'Inventory — Raw Materials'],
  acc_1300: ['1300', 'Cash — Petty Cash'], acc_1310: ['1310', 'HDFC Current Account ****1234'], acc_1320: ['1320', 'ICICI Current Account ****5678'], acc_1330: ['1330', 'HDFC EEFC Account (USD) ****9012'],
  acc_1400: ['1400', 'Input CGST'], acc_1401: ['1401', 'Input SGST'], acc_1402: ['1402', 'Input IGST'], acc_1450: ['1450', 'Advances to Suppliers'],
  acc_2100: ['2100', 'Trade Payables (AP Control)'], acc_2110: ['2110', 'Goods Received Not Invoiced (GRNI)'], acc_2150: ['2150', 'Advances from Customers'], acc_2300: ['2300', 'Output CGST Payable'], acc_2301: ['2301', 'Output SGST Payable'], acc_2302: ['2302', 'Output IGST Payable'], acc_2310: ['2310', 'TDS Payable'],
  acc_4110: ['4110', 'Interest Income'], acc_4910: ['4910', 'Foreign Exchange Gain'], acc_5010: ['5010', 'Purchases — Raw Materials'], acc_5020: ['5020', 'Inventory Adjustments / Write-off'], acc_5030: ['5030', 'Freight & Landed Costs'],
  acc_5200: ['5200', 'Rent'], acc_5400: ['5400', 'Bank Charges'], acc_5500: ['5500', 'Travel & Logistics'], acc_5530: ['5530', 'Professional Fees'], acc_5600: ['5600', 'Foreign Exchange Loss'], acc_5700: ['5700', 'Scrap & Rework'],
};

export interface JLine { acc: string; dr?: number; cr?: number; partyType?: 'Customer' | 'Supplier' | 'Employee'; partyId?: string; partyName?: string; narration?: string; taxComponent?: string }

/** Build a posted journal record for a seeded document. */
export function jv(id: string, number: string, date: string, sourceType: string, sourceId: string, sourceNumber: string, narration: string, lines: JLine[], extra: Partial<Journal> = {}): Journal {
  const jl: JournalLine[] = lines.filter((l) => (l.dr ?? 0) !== 0 || (l.cr ?? 0) !== 0).map((l, i) => ({
    id: `${id}_l${i + 1}`, accountId: l.acc, accountCode: ACC[l.acc]?.[0] ?? l.acc, accountName: ACC[l.acc]?.[1] ?? l.acc,
    dr: r2(l.dr ?? 0), cr: r2(l.cr ?? 0), drBase: r2(l.dr ?? 0), crBase: r2(l.cr ?? 0), currency: 'INR',
    partyType: l.partyType, partyId: l.partyId, partyName: l.partyName, dimensions: { Branch: IDS.brHO }, narration: l.narration, taxComponent: l.taxComponent,
  }));
  const totalDr = r2(jl.reduce((s, l) => s + l.drBase, 0));
  const totalCr = r2(jl.reduce((s, l) => s + l.crBase, 0));
  return rec<Journal>(id, { companyId: co, number, date, period: date.slice(0, 7), fy: '2026-27', branchId: IDS.brHO, currency: 'INR', rate: 1, status: 'Posted', type: 'Auto', sourceType, sourceId, sourceNumber, narration, lines: jl, totalDr, totalCr, idempotencyKey: `${sourceId}:post`, postedAt: `${date}T10:30:00.000Z`, postedBy: 'Rahul Kumar', correlationId: `corr_${id}`, ...extra });
}

// ── Master snapshots ───────────────────────────────────────────────────────
interface Sup { id: string; name: string; gstin: string; state: string; code: string; city: string; line1: string; pin: string; terms: string; tds?: string; bank?: { bankName: string; accountNumber: string; ifsc: string } }
export const SUP: Record<string, Sup> = {
  bharatSteel: { id: IDS.sBharatSteel, name: 'Bharat Steel Suppliers', gstin: '27AABBS4321G1Z8', state: 'Maharashtra', code: '27', city: 'Navi Mumbai', line1: 'Steel Market, Kalamboli', pin: '410218', terms: 'Net 30', tds: IDS.tds194C, bank: { bankName: 'HDFC Bank', accountNumber: '50200012345678', ifsc: 'HDFC0000240' } },
  national: { id: IDS.sNational, name: 'National Hardware Co', gstin: '29AABNC8765F1Z2', state: 'Karnataka', code: '29', city: 'Bengaluru', line1: 'SP Road', pin: '560002', terms: 'Net 30', tds: IDS.tds194C, bank: { bankName: 'ICICI Bank', accountNumber: '001405001234', ifsc: 'ICIC0000014' } },
  kiran: { id: IDS.sKiranAg, name: 'Kiran Agencies', gstin: '24AABKA9012J1Z5', state: 'Gujarat', code: '24', city: 'Surat', line1: 'Udhna Industrial Estate', pin: '394210', terms: 'Net 30', bank: { bankName: 'SBI', accountNumber: '30012345678', ifsc: 'SBIN0001234' } },
  sunrise: { id: IDS.sSunriseTr, name: 'Sunrise Traders', gstin: '24AABST5678H1Z1', state: 'Gujarat', code: '24', city: 'Surat', line1: 'Ring Road', pin: '395002', terms: 'Net 15', tds: IDS.tds194C },
  globalPack: { id: IDS.sGlobalPack, name: 'Global Packaging Ltd', gstin: '27AABGP1234K1Z3', state: 'Maharashtra', code: '27', city: 'Navi Mumbai', line1: 'Taloja MIDC', pin: '410208', terms: 'Net 30', bank: { bankName: 'Kotak Bank', accountNumber: '1234567890', ifsc: 'KKBK0000123' } },
  shree: { id: IDS.sShree, name: 'Shree Suppliers Ltd', gstin: '29AABCS5432Q1Z2', state: 'Karnataka', code: '29', city: 'Bengaluru', line1: 'Bommasandra', pin: '560099', terms: 'Net 30', tds: IDS.tds194C, bank: { bankName: 'HDFC Bank', accountNumber: '50100098765432', ifsc: 'HDFC0000567' } },
  bharatAg: { id: IDS.sBharatAg, name: 'Bharat Agencies', gstin: '29AABCB9012K1Z6', state: 'Karnataka', code: '29', city: 'Bengaluru', line1: 'Peenya', pin: '560058', terms: 'Net 30' },
  vinod: { id: IDS.sVinod, name: 'Vinod Trading Co.', gstin: '24AABCV1234S1Z8', state: 'Gujarat', code: '24', city: 'Surat', line1: 'Hazira', pin: '394270', terms: 'Net 45' },
  transport: { id: IDS.sTransport, name: 'Speedway Logistics', gstin: '27AABCS9876T1Z0', state: 'Maharashtra', code: '27', city: 'Thane', line1: 'Bhiwandi', pin: '421302', terms: 'Net 15', tds: IDS.tds194C },
  consult: { id: IDS.sConsult, name: 'Mehta & Associates (CA)', gstin: '27AABCM1111P1Z9', state: 'Maharashtra', code: '27', city: 'Mumbai', line1: 'Fort', pin: '400001', terms: 'Net 30', tds: IDS.tds194J },
};

export function snap(s: Sup): PartySnapshot {
  const address = { line1: s.line1, city: s.city, state: s.state, stateCode: s.code, pin: s.pin, country: 'IN' };
  return { name: s.name, gstin: s.gstin, pan: s.gstin.slice(2, 12), taxTreatment: 'Registered', state: s.state, stateCode: s.code, billingAddress: address, shippingAddress: address, paymentTerms: s.terms, currency: 'INR' };
}

interface Itm { id: string; code: string; name: string; uom: string; hsn: string; pct: number; taxId: string; invAcc: string; purAcc: string }
export const ITM: Record<string, Itm> = {
  steel4: { id: IDS.iSteel4, code: 'STL-4MM-HR', name: 'Steel Plates 4mm HR', uom: 'MT', hsn: '72084000', pct: 18, taxId: IDS.taxGST18, invAcc: IDS.accInvRM, purAcc: IDS.accPurchases },
  steel6: { id: IDS.iSteel6, code: 'STL-6MM-CR', name: 'Steel Plates 6mm CR', uom: 'MT', hsn: '72084200', pct: 18, taxId: IDS.taxGST18, invAcc: IDS.accInvRM, purAcc: IDS.accPurchases },
  crate: { id: IDS.iCrate, code: 'PKG-CRATE-L', name: 'Wooden Crates Large', uom: 'Nos', hsn: '44152090', pct: 12, taxId: IDS.taxGST12, invAcc: IDS.accInvFG, purAcc: IDS.accPurchases },
  box: { id: IDS.iBox, code: 'PKG-BOX-M', name: 'Corrugated Box Medium', uom: 'Nos', hsn: '48191000', pct: 12, taxId: IDS.taxGST12, invAcc: IDS.accInvFG, purAcc: IDS.accPurchases },
  bolt: { id: IDS.iBolt, code: 'HW-BOLT-M16', name: 'Hex Bolt M16 × 60', uom: 'Nos', hsn: '73181500', pct: 18, taxId: IDS.taxGST18, invAcc: IDS.accInvFG, purAcc: IDS.accPurchases },
  nut: { id: IDS.iNut, code: 'HW-NUT-M16', name: 'Hex Nut M16', uom: 'Nos', hsn: '73182100', pct: 18, taxId: IDS.taxGST18, invAcc: IDS.accInvFG, purAcc: IDS.accPurchases },
  grease: { id: IDS.iGrease, code: 'LUB-GRS-2', name: 'Grease EP-2 15 kg', uom: 'Tin', hsn: '27101910', pct: 18, taxId: IDS.taxGST18, invAcc: IDS.accInvFG, purAcc: IDS.accPurchases },
  wheel: { id: IDS.iGrind, code: 'GRD-WHL-180', name: 'Grinding Wheel 180mm', uom: 'Nos', hsn: '68042210', pct: 18, taxId: IDS.taxGST18, invAcc: IDS.accInvFG, purAcc: IDS.accPurchases },
  electrode: { id: IDS.iElectrode, code: 'ELEC-WLD-200', name: 'Electrode Welding 200A', uom: 'Kg', hsn: '83111000', pct: 18, taxId: IDS.taxGST18, invAcc: IDS.accInvFG, purAcc: IDS.accPurchases },
  chai: { id: IDS.iChai, code: 'SKU-10021', name: 'Masala Chai 250 g', uom: 'pcs', hsn: '0902', pct: 5, taxId: IDS.taxGST5, invAcc: IDS.accInvFG, purAcc: IDS.accPurchases },
  assam: { id: IDS.iAssam, code: 'SKU-10034', name: 'Premium Assam Tea 500 g', uom: 'pcs', hsn: '0902', pct: 5, taxId: IDS.taxGST5, invAcc: IDS.accInvFG, purAcc: IDS.accPurchases },
  darj: { id: IDS.iDarj, code: 'SKU-10055', name: 'Darjeeling First Flush 100 g', uom: 'pcs', hsn: '0902', pct: 5, taxId: IDS.taxGST5, invAcc: IDS.accInvFG, purAcc: IDS.accPurchases },
  consult: { id: IDS.iConsult, code: 'SVC-CONSULT', name: 'Consultancy Services (per hour)', uom: 'Hr', hsn: '998311', pct: 18, taxId: IDS.taxGST18, invAcc: '', purAcc: IDS.accProfFees },
  transport: { id: IDS.iTransport, code: 'SVC-TRANSPORT', name: 'Transport Charges', uom: 'Trip', hsn: '996511', pct: 5, taxId: 'tax_rcm5', invAcc: '', purAcc: IDS.accTravel },
};

// ── Line & totals computation (mirrors engine.computeDocument for seed) ────
export interface LineSpec { id: string; item: Itm; qty: number; rate: number; listRate?: number; warehouseId?: string; batch?: string; rcm?: boolean; discountPct?: number; extra?: Partial<DocLine> }

export function mkLine(spec: LineSpec, inter: boolean): DocLine {
  const gross = r2(spec.qty * spec.rate);
  const discountAmt = r2((gross * (spec.discountPct ?? 0)) / 100);
  const taxable = r2(gross - discountAmt);
  const comps: Record<string, number> = {};
  if (spec.item.pct > 0) {
    if (inter) comps.IGST = r2((taxable * spec.item.pct) / 100);
    else { comps.CGST = r2((taxable * spec.item.pct) / 200); comps.SGST = r2((taxable * spec.item.pct) / 200); }
  }
  const taxAmt = r2(Object.values(comps).reduce((a, b) => a + b, 0));
  return {
    id: spec.id, itemId: spec.item.id, itemCode: spec.item.code, itemName: spec.item.name, hsn: spec.item.hsn, qty: spec.qty, uom: spec.item.uom, rate: spec.rate, listRate: spec.listRate ?? spec.rate,
    priceListName: spec.listRate && spec.listRate !== spec.rate ? 'Standard Purchase' : 'Item master', overrideReason: spec.listRate && spec.listRate !== spec.rate ? 'Negotiated rate' : undefined,
    discountPct: spec.discountPct ?? 0, discountAmt, taxable, taxRateId: spec.item.taxId, taxRate: spec.item.pct, taxAmt, taxComponents: comps, taxTreatment: 'Taxable', reverseCharge: !!spec.rcm,
    amount: r2(taxable + (spec.rcm ? 0 : taxAmt)), warehouseId: spec.warehouseId, batch: spec.batch, accountId: spec.item.invAcc || spec.item.purAcc, ...(spec.extra ?? {}),
  };
}

export function mkTotals(lines: DocLine[], opts: { charges?: number; tdsPct?: number; tdsLabel?: string; paid?: number; credited?: number } = {}): DocTotals {
  const subtotal = r2(lines.reduce((s, l) => s + r2(l.qty * l.rate), 0));
  const discount = r2(lines.reduce((s, l) => s + l.discountAmt, 0));
  const taxable = r2(lines.reduce((s, l) => s + l.taxable, 0));
  const components: Record<string, number> = {};
  const breakup = new Map<string, { component: string; rate: number; hsn: string; taxable: number; tax: number }>();
  lines.forEach((l) => {
    if (l.reverseCharge) return;
    Object.entries(l.taxComponents).forEach(([k, v]) => {
      components[k] = r2((components[k] ?? 0) + v);
      const rate = k === 'IGST' ? l.taxRate : l.taxRate / 2;
      const key = `${k}|${rate}|${l.hsn}`;
      const row = breakup.get(key) ?? { component: k, rate, hsn: l.hsn ?? '—', taxable: 0, tax: 0 };
      row.taxable = r2(row.taxable + l.taxable); row.tax = r2(row.tax + v); breakup.set(key, row);
    });
  });
  const tax = r2(Object.values(components).reduce((a, b) => a + b, 0));
  const charges = opts.charges ?? 0;
  const tds = opts.tdsPct ? r2((taxable * opts.tdsPct) / 100) : 0;
  const raw = r2(taxable + tax + charges - tds);
  const roundOff = r2(Math.round(raw) - raw);
  const total = r2(raw + roundOff);
  const paid = opts.paid ?? 0; const credited = opts.credited ?? 0;
  return { subtotal, discount, taxable, tax, components, breakup: Array.from(breakup.values()), charges, tds, tdsSection: opts.tdsLabel, roundOff, total, paid, credited, writtenOff: 0, due: r2(total - paid - credited), baseTotal: total };
}

const base = (id: string, docType: string, number: string, date: string, status: string, sup?: Sup, extra: Record<string, unknown> = {}) => ({
  id, companyId: co, createdAt: `${date}T09:00:00.000Z`, updatedAt: `${date}T09:30:00.000Z`, createdBy: 'seed', version: 1,
  number, docType, date, branchId: IDS.brHO, status, currency: 'INR', rate: 1, partyType: sup ? ('Supplier' as const) : undefined, partyId: sup?.id, partyName: sup?.name, partySnapshot: sup ? snap(sup) : undefined,
  paymentTerms: sup?.terms, fy: '2026-27', period: date.slice(0, 7), correlationId: `corr_${id}`, ...extra,
});

const due = (date: string, terms: string) => { const d = new Date(date + 'T00:00:00'); d.setDate(d.getDate() + (parseInt(terms.replace(/\D/g, ''), 10) || 0)); return d.toISOString().slice(0, 10); };
const posted = (date: string, by = 'Rahul Kumar') => ({ postedAt: `${date}T10:30:00.000Z`, postedBy: by });

function taxLines(lines: DocLine[], inter: boolean): JLine[] {
  const comps: Record<string, number> = {};
  lines.forEach((l) => Object.entries(l.taxComponents).forEach(([k, v]) => { comps[k] = r2((comps[k] ?? 0) + v); }));
  const out: JLine[] = [];
  if (comps.CGST) out.push({ acc: IDS.accGSTInputCGST, dr: comps.CGST, taxComponent: 'CGST' });
  if (comps.SGST) out.push({ acc: IDS.accGSTInputSGST, dr: comps.SGST, taxComponent: 'SGST' });
  if (comps.IGST) out.push({ acc: IDS.accGSTInputIGST, dr: comps.IGST, taxComponent: 'IGST' });
  void inter;
  return out;
}

// ═══════════════════════════════════════════════════════════════════════════
export function seedPurchase(): Partial<DB> {
  const journals: Journal[] = [];
  const openItems: OpenItem[] = [];
  let jvNo = 300;
  const nextJv = () => `JV/26-27/${String(jvNo++).padStart(4, '0')}`;

  // ── Requisitions (legacy rows) ─────────────────────────────────────────
  const reqLine = (id: string, item: Itm, qty: number, rate: number, wh: string = IDS.whMain, purpose?: string): DocLine => ({ ...mkLine({ id, item, qty, rate, warehouseId: wh }, false), taxComponents: {}, taxAmt: 0, taxRate: 0, amount: r2(qty * rate), purpose } as DocLine);
  const req = (id: string, num: string, date: string, requesterName: string, requesterId: string, dept: string, needBy: string, status: Requisition['status'], lines: DocLine[], extra: Partial<Requisition> = {}): Requisition => ({
    ...base(id, 'Requisition', num, date, status, undefined, { requesterName, requesterId, department: dept, needByDate: needBy, lines, totals: { ...mkTotals(lines), tax: 0, components: {}, breakup: [], total: r2(lines.reduce((s, l) => s + l.amount, 0)), baseTotal: r2(lines.reduce((s, l) => s + l.amount, 0)) }, dimensions: { Department: dept }, submittedAt: status !== 'Draft' ? `${date}T09:15:00.000Z` : undefined, submittedBy: status !== 'Draft' ? requesterName : undefined }),
    ...extra,
  }) as Requisition;
  const requisitions: Requisition[] = [
    req('req_0081', 'PR/26-27/0081', '2026-09-12', 'Anita Rao', IDS.uAnita, IDS.dimDeptOps, '2026-09-20', 'Approved', [reqLine('rl1', ITM.bolt, 1000, 28, IDS.whMain, 'Line 2 assembly'), reqLine('rl2', ITM.nut, 1000, 18), reqLine('rl3', ITM.grease, 8, 2800), reqLine('rl4', ITM.electrode, 10, 1850)], { purpose: 'Monthly consumables for fabrication line' }),
    req('req_0080', 'PR/26-27/0080', '2026-09-10', 'Suresh Kumar', IDS.uSuresh, IDS.dimDeptProd, '2026-09-18', 'Submitted', [reqLine('rl1', ITM.steel6, 1.5, 92000, IDS.whAndheri, 'PRJ-042 brackets'), reqLine('rl2', ITM.steel4, 0.5, 85000, IDS.whAndheri), reqLine('rl3', ITM.bolt, 500, 28, IDS.whAndheri), reqLine('rl4', ITM.nut, 500, 18, IDS.whAndheri), reqLine('rl5', ITM.wheel, 20, 380, IDS.whAndheri), reqLine('rl6', ITM.electrode, 10, 1850, IDS.whAndheri)], { purpose: 'Metro Line 3 bracket batch', dimensions: { Department: IDS.dimDeptProd, Project: IDS.dimPrj042 } }),
    req('req_0079', 'PR/26-27/0079', '2026-09-08', 'Priya Mehta', IDS.uPriya, IDS.dimDeptAdmin, '2026-09-15', 'Converted', [reqLine('rl1', ITM.bolt, 600, 28), reqLine('rl2', ITM.nut, 1400, 18)], { purpose: 'Hardware restock', convertedToId: 'po_0091', convertedToNumber: 'PO/26-27/0091' }),
    req('req_0078', 'PR/26-27/0078', '2026-09-05', 'Vikram Singh', IDS.uVikram, IDS.dimDeptOps, '2026-09-12', 'Converted', [reqLine('rl1', ITM.grease, 10, 2800), reqLine('rl2', ITM.wheel, 100, 380), reqLine('rl3', ITM.electrode, 5, 1850)], { purpose: 'Maintenance consumables', convertedToId: 'po_0089', convertedToNumber: 'PO/26-27/0089' }),
    req('req_0077', 'PR/26-27/0077', '2026-09-02', 'Rahul Kumar', IDS.uRahul, IDS.dimDeptFin, '2026-09-09', 'Draft', [reqLine('rl1', ITM.box, 140, 85, IDS.whMain, 'Archive boxes for FY files')], { purpose: 'Archive boxes' }),
    req('req_0076', 'PR/26-27/0076', '2026-08-29', 'Anita Rao', IDS.uAnita, IDS.dimDeptProd, '2026-09-05', 'Rejected', [reqLine('rl1', ITM.steel4, 1, 85000, IDS.whAndheri), reqLine('rl2', ITM.steel6, 0.5, 92000, IDS.whAndheri), reqLine('rl3', ITM.bolt, 200, 28), reqLine('rl4', ITM.nut, 200, 18), reqLine('rl5', ITM.grease, 2, 2800), reqLine('rl6', ITM.wheel, 5, 380), reqLine('rl7', ITM.electrode, 2, 1850), reqLine('rl8', ITM.crate, 5, 850)], { purpose: 'Spare fabrication stock', cancelReason: 'Duplicate of PR/26-27/0080 — consolidated' }),
  ];

  // ── RFQs & quotes ──────────────────────────────────────────────────────
  const rfqs: Rfq[] = [
    { ...base('rfq_0011', 'RFQ', 'RFQ/26-27/0011', '2026-09-02', 'Awarded', undefined, { lines: [reqLine('rq1', ITM.steel6, 1.25, 92000, IDS.whMain)], totals: mkTotals([]), supplierIds: [IDS.sShree, IDS.sBharatSteel, IDS.sVinod], sentAt: '2026-09-02T11:00:00.000Z', validUntil: '2026-09-16', awardedSupplierId: IDS.sShree, awardedQuoteId: 'sq_011_shree', poId: 'po_0093', poNumber: 'PO/26-27/0093', notes: 'CR plates for Metro Line 3 bracket batch — delivery to Main WH' }) } as Rfq,
    { ...base('rfq_0010', 'RFQ', 'RFQ/26-27/0010', '2026-08-25', 'Sent', undefined, { lines: [reqLine('rq1', ITM.crate, 200, 850, IDS.whAndheri), reqLine('rq2', ITM.box, 2000, 85, IDS.whAndheri)], totals: mkTotals([]), supplierIds: [IDS.sKiranAg, IDS.sGlobalPack], sentAt: '2026-08-25T10:00:00.000Z', validUntil: '2026-09-20', notes: 'Q3 packaging requirement' }) } as Rfq,
  ];
  const quote = (id: string, sup: Sup, rate: number, lead: number, date: string, status: SupplierQuote['status'], ref: string): SupplierQuote => rec<SupplierQuote>(id, { companyId: co, rfqId: 'rfq_0011', rfqNumber: 'RFQ/26-27/0011', supplierId: sup.id, supplierName: sup.name, quoteRef: ref, date, validUntil: '2026-09-30', leadTimeDays: lead, currency: 'INR', paymentTerms: sup.terms, lines: [{ lineId: 'rq1', itemId: ITM.steel6.id, itemName: ITM.steel6.name, qty: 1.25, uom: 'MT', rate, amount: r2(1.25 * rate) }], total: r2(1.25 * rate), status });
  const supplierQuotes: SupplierQuote[] = [
    quote('sq_011_shree', SUP.shree, 84000, 7, '2026-09-04', 'Awarded', 'SSL/Q/2026/311'),
    quote('sq_011_bss', SUP.bharatSteel, 86500, 10, '2026-09-04', 'Rejected', 'BSS-QT-0912'),
    quote('sq_011_vinod', SUP.vinod, 85200, 12, '2026-09-05', 'Rejected', 'VTC/26/088'),
  ];

  // ── Purchase orders ────────────────────────────────────────────────────
  const poLine = (id: string, item: Itm, qty: number, rate: number, inter: boolean, wh: string, expectedDate: string, fulfil: { received?: number; accepted?: number; rejected?: number; invoiced?: number; returned?: number } = {}, listRate?: number): PoLine => ({ ...mkLine({ id, item, qty, rate, listRate, warehouseId: wh }, inter), expectedDate, receivedQty: fulfil.received ?? 0, acceptedQty: fulfil.accepted ?? 0, rejectedQty: fulfil.rejected ?? 0, invoicedQty: fulfil.invoiced ?? 0, returnedQty: fulfil.returned ?? 0 });
  const po = (id: string, num: string, date: string, sup: Sup, status: PurchaseOrder['status'], lines: PoLine[], extra: Partial<PurchaseOrder> = {}, charges: { id: string; name: string; amount: number }[] = []): PurchaseOrder => ({
    ...base(id, 'Purchase Order', num, date, status, sup, { lines, totals: mkTotals(lines, { charges: charges.reduce((s, c) => s + c.amount, 0) }), charges, expectedDate: lines[0]?.expectedDate, terms: 'Delivery to Main WH · Freight paid by supplier · Please quote PO number on all documents', amendments: [], submittedAt: status !== 'Draft' ? `${date}T10:00:00.000Z` : undefined, submittedBy: status !== 'Draft' ? 'Anita Rao' : undefined, dimensions: { Department: IDS.dimDeptOps }, templateId: IDS.tplPO, templateVersion: 2 }),
    ...extra,
  }) as PurchaseOrder;
  const purchaseOrders: PurchaseOrder[] = [
    po('po_0093', 'PO/26-27/0093', '2026-09-11', SUP.shree, 'Submitted', [poLine('pl1', ITM.steel6, 1.25, 84000, true, IDS.whMain, '2026-09-20', {}, 92000)], { rfqId: 'rfq_0011', rfqNumber: 'RFQ/26-27/0011', notes: 'Awarded from RFQ/26-27/0011 · rate as per quote SSL/Q/2026/311', submittedBy: 'Anita Rao' }, [{ id: 'ch1', name: 'Loading charges', amount: 100 }]),
    po('po_0092', 'PO/26-27/0092', '2026-09-08', SUP.bharatSteel, 'Closed', [poLine('pl1', ITM.steel4, 2, 85000, false, IDS.whMain, '2026-09-11', { received: 2, accepted: 2, invoiced: 2 }), poLine('pl2', ITM.bolt, 250, 28, false, IDS.whMain, '2026-09-11', { received: 250, accepted: 250, invoiced: 250 }), poLine('pl3', ITM.nut, 500, 18, false, IDS.whMain, '2026-09-11', { received: 500, accepted: 500, invoiced: 500 })], { requisitionId: 'req_0081', requisitionNumber: 'PR/26-27/0081' }),
    po('po_0091', 'PO/26-27/0091', '2026-09-08', SUP.national, 'Partially Received', [poLine('pl1', ITM.bolt, 600, 28, true, IDS.whMain, '2026-09-12', { received: 300, accepted: 280, rejected: 20 }), poLine('pl2', ITM.nut, 1400, 18, true, IDS.whMain, '2026-09-12', { received: 200, accepted: 200 })], { requisitionId: 'req_0079', requisitionNumber: 'PR/26-27/0079' }),
    po('po_0090', 'PO/26-27/0090', '2026-09-05', SUP.kiran, 'Closed', [poLine('pl1', ITM.crate, 100, 850, true, IDS.whAndheri, '2026-09-07', { received: 100, accepted: 100, invoiced: 100, returned: 10 }), poLine('pl2', ITM.box, 150, 85, true, IDS.whAndheri, '2026-09-07', { received: 150, accepted: 150, invoiced: 150 })]),
    po('po_0089', 'PO/26-27/0089', '2026-09-01', SUP.sunrise, 'Approved', [poLine('pl1', ITM.grease, 10, 2800, true, IDS.whMain, '2026-09-04'), poLine('pl2', ITM.wheel, 100, 380, true, IDS.whMain, '2026-09-04', { received: 100, rejected: 100 })], { requisitionId: 'req_0078', requisitionNumber: 'PR/26-27/0078', notes: 'GRN/26-27/0059 rejected 100 wheels (quality) — replacement awaited' }),
    po('po_0088', 'PO/26-27/0088', '2026-08-28', SUP.globalPack, 'Closed', [poLine('pl1', ITM.crate, 20, 850, false, IDS.whAndheri, '2026-09-01', { received: 20, accepted: 20, invoiced: 20 }), poLine('pl2', ITM.box, 200, 85, false, IDS.whAndheri, '2026-09-01', { received: 200, accepted: 200, invoiced: 200 })]),
    po('po_0087', 'PO/26-27/0087', '2026-08-24', SUP.bharatSteel, 'Draft', [poLine('pl1', ITM.steel4, 1, 85000, false, IDS.whMain, '2026-09-30')], { submittedAt: undefined, submittedBy: undefined }),
    po('po_0086', 'PO/26-27/0086', '2026-08-20', SUP.vinod, 'Cancelled', [poLine('pl1', ITM.steel6, 0.6, 92000, true, IDS.whMain, '2026-09-05')], { cancelReason: 'Supplier could not meet delivery date — re-sourced via RFQ/26-27/0011' }),
    po('po_0085', 'PO/26-27/0085', '2026-08-10', SUP.vinod, 'Closed', [poLine('pl1', ITM.steel6, 3, 92000, true, IDS.whMain, '2026-08-14', { received: 3, accepted: 3, invoiced: 3 })]),
  ];

  // ── GRNs ───────────────────────────────────────────────────────────────
  const grnLine = (id: string, poLineId: string, item: Itm, ordered: number, received: number, accepted: number, rejected: number, rate: number, inter: boolean, wh: string, extra: Partial<GrnLine> = {}): GrnLine => ({ ...mkLine({ id, item, qty: accepted, rate, warehouseId: wh, batch: extra.batch }, inter), poLineId, orderedQty: ordered, receivedQty: received, acceptedQty: accepted, rejectedQty: rejected, heldQty: 0, sourceLineId: poLineId, ...extra });
  const grn = (id: string, num: string, date: string, sup: Sup, poId: string, poNum: string, qc: Grn['qcStatus'], lines: GrnLine[], wh: string, extra: Partial<Grn> = {}): Grn => ({
    ...base(id, 'GRN', num, date, 'Posted', sup, { poId, poNumber: poNum, sourceType: 'Purchase Order', sourceId: poId, sourceNumber: poNum, qcStatus: qc, lines, totals: mkTotals(lines), warehouseId: wh, receivedBy: 'Suresh Kumar', ...posted(date, 'Suresh Kumar') }),
    ...extra,
  }) as Grn;
  const grns: Grn[] = [
    grn('grn_0062', 'GRN/26-27/0062', '2026-09-11', SUP.bharatSteel, 'po_0092', 'PO/26-27/0092', 'Accepted', [grnLine('gl1', 'pl1', ITM.steel4, 2, 2, 2, 0, 85000, false, IDS.whMain, { batch: 'BSS-0911', bin: 'A-01', invoicedQty: 2 }), grnLine('gl2', 'pl2', ITM.bolt, 250, 250, 250, 0, 28, false, IDS.whMain, { bin: 'B-01', invoicedQty: 250 }), grnLine('gl3', 'pl3', ITM.nut, 500, 500, 500, 0, 18, false, IDS.whMain, { bin: 'B-01', invoicedQty: 500 })], IDS.whMain, { supplierChallan: 'BSS/DC/1187', vehicleNo: 'MH-04-GT-2291', journalId: 'jv_grn_0062', journalNumber: 'JV/26-27/0311', landedCostIds: ['lc_0001'] }),
    grn('grn_0061', 'GRN/26-27/0061', '2026-09-09', SUP.national, 'po_0091', 'PO/26-27/0091', 'Partial Accept', [grnLine('gl1', 'pl1', ITM.bolt, 600, 300, 280, 20, 28, true, IDS.whMain, { bin: 'B-02', disposition: 'Return to supplier', qcNote: '20 pcs thread damage', invoicedQty: 280 }), grnLine('gl2', 'pl2', ITM.nut, 1400, 200, 200, 0, 18, true, IDS.whMain, { bin: 'B-02', invoicedQty: 200 })], IDS.whMain, { supplierChallan: 'NHC/CH/4471', journalId: 'jv_grn_0061', journalNumber: 'JV/26-27/0310' }),
    grn('grn_0060', 'GRN/26-27/0060', '2026-09-07', SUP.kiran, 'po_0090', 'PO/26-27/0090', 'Accepted', [grnLine('gl1', 'pl1', ITM.crate, 100, 100, 100, 0, 850, true, IDS.whAndheri, { bin: 'R1', invoicedQty: 100, returnedQty: 10 }), grnLine('gl2', 'pl2', ITM.box, 150, 150, 150, 0, 85, true, IDS.whAndheri, { bin: 'R2', invoicedQty: 150 })], IDS.whAndheri, { supplierChallan: 'KA/DN/2026/0907', journalId: 'jv_grn_0060', journalNumber: 'JV/26-27/0309' }),
    grn('grn_0059', 'GRN/26-27/0059', '2026-09-04', SUP.sunrise, 'po_0089', 'PO/26-27/0089', 'Rejected', [grnLine('gl1', 'pl2', ITM.wheel, 100, 100, 0, 100, 380, true, IDS.whMain, { disposition: 'Return to supplier', qcNote: 'Wrong grit — entire lot rejected at inward QC' })], IDS.whMain, { supplierChallan: 'ST/0904/17' }),
    grn('grn_0058', 'GRN/26-27/0058', '2026-09-01', SUP.globalPack, 'po_0088', 'PO/26-27/0088', 'Accepted', [grnLine('gl1', 'pl1', ITM.crate, 20, 20, 20, 0, 850, false, IDS.whAndheri, { bin: 'R1', invoicedQty: 20 }), grnLine('gl2', 'pl2', ITM.box, 200, 200, 200, 0, 85, false, IDS.whAndheri, { bin: 'R2', invoicedQty: 200 })], IDS.whAndheri, { supplierChallan: 'GPL/DC/8891', journalId: 'jv_grn_0058', journalNumber: 'JV/26-27/0308' }),
    grn('grn_0057', 'GRN/26-27/0057', '2026-08-14', SUP.vinod, 'po_0085', 'PO/26-27/0085', 'Accepted', [grnLine('gl1', 'pl1', ITM.steel6, 3, 3, 3, 0, 92000, true, IDS.whMain, { batch: 'VTC-0814', bin: 'A-02', invoicedQty: 3 })], IDS.whMain, { supplierChallan: 'VTC/26/2210', journalId: 'jv_grn_0057', journalNumber: 'JV/26-27/0307' }),
  ];
  const grnAccrual = (g: Grn, jid: string, jnum: string) => {
    const byAcc: Record<string, number> = {};
    g.lines.forEach((l) => { const acc = l.accountId ?? IDS.accInvFG; byAcc[acc] = r2((byAcc[acc] ?? 0) + l.taxable); });
    const total = r2(Object.values(byAcc).reduce((a, b) => a + b, 0));
    if (total === 0) return;
    // The accrual is credited to GRNI (2110), NOT to AP control — there is no vendor document yet,
    // so the balance has no party and must not appear in the AP sub-ledger (FR-AP-001).
    journals.push(jv(jid, jnum, g.date, 'GRN', g.id, g.number, `GRN accrual · ${g.number} against ${g.poNumber}`, [...Object.entries(byAcc).map(([acc, dr]) => ({ acc, dr })), { acc: IDS.accGRNI, cr: total, narration: `Goods received not invoiced · ${g.number}` }]));
  };
  grnAccrual(grns.find((g) => g.id === 'grn_0057')!, 'jv_grn_0057', 'JV/26-27/0307');
  grnAccrual(grns.find((g) => g.id === 'grn_0058')!, 'jv_grn_0058', 'JV/26-27/0308');
  grnAccrual(grns.find((g) => g.id === 'grn_0060')!, 'jv_grn_0060', 'JV/26-27/0309');
  grnAccrual(grns.find((g) => g.id === 'grn_0061')!, 'jv_grn_0061', 'JV/26-27/0310');
  grnAccrual(grns.find((g) => g.id === 'grn_0062')!, 'jv_grn_0062', 'JV/26-27/0311');
  jvNo = 312;

  // ── Vendor invoices ────────────────────────────────────────────────────
  const vLine = (id: string, item: Itm, qty: number, rate: number, inter: boolean, src: { poLineId?: string; grnId?: string; grnLineId?: string; poRate?: number; poQty?: number; grnQty?: number } = {}, rcm = false, wh?: string): VendorInvoiceLine => ({ ...mkLine({ id, item, qty, rate, rcm, warehouseId: wh }, inter), ...src, sourceLineId: src.poLineId, accountId: src.grnId ? IDS.accGRNI : item.invAcc && wh ? item.invAcc : item.purAcc });
  const vinv = (id: string, num: string, date: string, sup: Sup, supInv: string, status: VendorInvoice['status'], match: VendorInvoice['matchStatus'], lines: VendorInvoiceLine[], opts: { poId?: string; poNumber?: string; grnIds?: string[]; grnNumbers?: string[]; tdsPct?: number; tdsLabel?: string; tdsSectionId?: string; charges?: { id: string; name: string; amount: number }[]; paid?: number; credited?: number; rcm?: boolean; notes?: string; dims?: Record<string, string> }): VendorInvoice => {
    const charges = opts.charges ?? [];
    const totals = mkTotals(lines, { charges: charges.reduce((s, c) => s + c.amount, 0), tdsPct: opts.tdsPct, tdsLabel: opts.tdsLabel, paid: opts.paid, credited: opts.credited });
    return {
      ...base(id, 'Vendor Invoice', num, date, status, sup, { supplierInvoiceNumber: supInv, supplierInvoiceDate: date, dueDate: due(date, sup.terms), poId: opts.poId, poNumber: opts.poNumber, sourceType: opts.poId ? 'Purchase Order' : undefined, sourceId: opts.poId, sourceNumber: opts.poNumber, grnIds: opts.grnIds ?? [], grnNumbers: opts.grnNumbers ?? [], lines, totals, charges, matchStatus: match, matchMode: opts.poId ? '3-way' : 'Direct', tdsSectionId: opts.tdsSectionId, reverseCharge: !!opts.rcm, notes: opts.notes, dimensions: opts.dims ?? { Department: IDS.dimDeptOps }, submittedAt: status !== 'Draft' ? `${date}T10:00:00.000Z` : undefined, submittedBy: status !== 'Draft' ? 'Anil Patil' : undefined, ...(status === 'Posted' ? posted(date, 'Anil Patil') : {}) }),
    } as VendorInvoice;
  };
  const vendorInvoices: VendorInvoice[] = [
    vinv('vinv_0038', 'VINV/26-27/0038', '2026-09-10', SUP.bharatSteel, 'BSS/2026/1187', 'Posted', 'Matched', [vLine('vl1', ITM.steel4, 2, 85000, false, { poLineId: 'pl1', grnId: 'grn_0062', grnLineId: 'gl1', poRate: 85000, poQty: 2, grnQty: 2 }), vLine('vl2', ITM.bolt, 250, 28, false, { poLineId: 'pl2', grnId: 'grn_0062', grnLineId: 'gl2', poRate: 28, poQty: 250, grnQty: 250 }), vLine('vl3', ITM.nut, 500, 18, false, { poLineId: 'pl3', grnId: 'grn_0062', grnLineId: 'gl3', poRate: 18, poQty: 500, grnQty: 500 })], { poId: 'po_0092', poNumber: 'PO/26-27/0092', grnIds: ['grn_0062'], grnNumbers: ['GRN/26-27/0062'], tdsPct: 1, tdsLabel: '194C · 1%', tdsSectionId: IDS.tds194C, paid: 217620 }),
    vinv('vinv_0037', 'VINV/26-27/0037', '2026-09-08', SUP.national, 'NHC/INV/2026/0912', 'Submitted', 'Exception', [vLine('vl1', ITM.bolt, 280, 30, true, { poLineId: 'pl1', grnId: 'grn_0061', grnLineId: 'gl1', poRate: 28, poQty: 600, grnQty: 280 }), vLine('vl2', ITM.nut, 200, 18, true, { poLineId: 'pl2', grnId: 'grn_0061', grnLineId: 'gl2', poRate: 18, poQty: 1400, grnQty: 200 })], { poId: 'po_0091', poNumber: 'PO/26-27/0091', grnIds: ['grn_0061'], grnNumbers: ['GRN/26-27/0061'], tdsSectionId: IDS.tds194C, notes: 'Supplier billed bolts at ₹30 vs PO ₹28 — exception raised' }),
    vinv('vinv_0036', 'VINV/26-27/0036', '2026-09-05', SUP.kiran, 'KA/2026-27/0645', 'Posted', 'Matched', [vLine('vl1', ITM.crate, 100, 850, true, { poLineId: 'pl1', grnId: 'grn_0060', grnLineId: 'gl1', poRate: 850, poQty: 100, grnQty: 100 }), vLine('vl2', ITM.box, 150, 85, true, { poLineId: 'pl2', grnId: 'grn_0060', grnLineId: 'gl2', poRate: 85, poQty: 150, grnQty: 150 })], { poId: 'po_0090', poNumber: 'PO/26-27/0090', grnIds: ['grn_0060'], grnNumbers: ['GRN/26-27/0060'], paid: 109480 }),
    vinv('vinv_0035', 'VINV/26-27/0035', '2026-09-01', SUP.globalPack, 'GPL/26-27/2210', 'Posted', 'Matched', [vLine('vl1', ITM.crate, 20, 850, false, { poLineId: 'pl1', grnId: 'grn_0058', grnLineId: 'gl1', poRate: 850, poQty: 20, grnQty: 20 }), vLine('vl2', ITM.box, 200, 85, false, { poLineId: 'pl2', grnId: 'grn_0058', grnLineId: 'gl2', poRate: 85, poQty: 200, grnQty: 200 })], { poId: 'po_0088', poNumber: 'PO/26-27/0088', grnIds: ['grn_0058'], grnNumbers: ['GRN/26-27/0058'] }),
    vinv('vinv_0034', 'VINV/26-27/0034', '2026-08-28', SUP.bharatSteel, 'BSS/2026/1102', 'Posted', 'Not Required', [vLine('vl1', ITM.electrode, 25, 1850, false), vLine('vl2', ITM.wheel, 10, 375, false)], { tdsPct: 1, tdsLabel: '194C · 1%', tdsSectionId: IDS.tds194C, notes: 'Direct invoice — consumables issued to shop floor' }),
    vinv('vinv_0033', 'VINV/26-27/0033', '2026-08-20', SUP.national, 'NHC/INV/2026/0871', 'Posted', 'Not Required', [vLine('vl1', ITM.bolt, 1000, 28, true)], { paid: 33040 }),
    vinv('vinv_0032', 'VINV/26-27/0032', '2026-08-15', SUP.vinod, 'VTC/26-27/0412', 'Posted', 'Matched', [vLine('vl1', ITM.steel6, 3, 92000, true, { poLineId: 'pl1', grnId: 'grn_0057', grnLineId: 'gl1', poRate: 92000, poQty: 3, grnQty: 3 })], { poId: 'po_0085', poNumber: 'PO/26-27/0085', grnIds: ['grn_0057'], grnNumbers: ['GRN/26-27/0057'] }),
    vinv('vinv_0031', 'VINV/26-27/0031', '2026-08-05', SUP.transport, 'SL/2026/1877', 'Posted', 'Not Required', [vLine('vl1', ITM.transport, 4, 4200, false, {}, true)], { rcm: true, notes: 'GTA — reverse charge 5% self-assessed' }),
    vinv('vinv_0030', 'VINV/26-27/0030', '2026-08-01', SUP.sunrise, 'ST/26-27/0388', 'Posted', 'Not Required', [vLine('vl1', ITM.grease, 30, 2800, true), vLine('vl2', ITM.electrode, 20, 1800, true)], { tdsPct: 1, tdsLabel: '194C · 1%', tdsSectionId: IDS.tds194C }),
    vinv('vinv_0029', 'VINV/26-27/0029', '2026-07-28', SUP.globalPack, 'GPL/26-27/2088', 'Posted', 'Not Required', [vLine('vl1', ITM.box, 400, 85, false)], { paid: 38080 }),
    vinv('vinv_0028', 'VINV/26-27/0028', '2026-07-20', SUP.consult, 'MA/2026-27/117', 'Posted', 'Not Required', [vLine('vl1', ITM.consult, 40, 2500, false)], { tdsPct: 10, tdsLabel: '194J · 10%', tdsSectionId: IDS.tds194J, dims: { Department: IDS.dimDeptFin, Project: IDS.dimPrj051 }, notes: 'ERP advisory — July' }),
    vinv('vinv_0027', 'VINV/26-27/0027', '2026-07-05', SUP.sunrise, 'ST/26-27/0341', 'Posted', 'Not Required', [vLine('vl1', ITM.grease, 25, 2800, true), vLine('vl2', ITM.wheel, 10, 500, true)], { tdsPct: 1, tdsLabel: '194C · 1%', tdsSectionId: IDS.tds194C, credited: 6608 }),
    vinv('vinv_0022', 'VINV/26-27/0022', '2026-04-10', SUP.bharatAg, 'BA/26-27/0041', 'Posted', 'Not Required', [vLine('vl1', ITM.chai, 1000, 110, true), vLine('vl2', ITM.assam, 50, 290, true), vLine('vl3', ITM.darj, 70, 650, true)], { charges: [{ id: 'ch1', name: 'Freight (to-pay)', amount: 9500 }], paid: 188000, notes: 'Beverage stock — April replenishment' }),
    { ...vinv('vinv_draft1', 'VINV/DRAFT', '2026-09-12', SUP.vinod, 'VTC/26-27/0470', 'Draft', 'Pending', [vLine('vl1', ITM.steel6, 0.5, 92000, true)], { notes: 'Awaiting GRN — received against PO pending' }), submittedAt: undefined, submittedBy: undefined } as VendorInvoice,
  ];
  // journals + open items for posted vendor invoices
  vendorInvoices.filter((v) => v.status === 'Posted').forEach((v) => {
    const inter = v.partySnapshot?.stateCode !== '27';
    const jid = `jv_${v.id}`; const jnum = nextJv();
    const lines: JLine[] = [];
    const grnValue = r2(v.lines.filter((l) => l.grnId).reduce((s, l) => s + r2(l.qty * (l.poRate ?? l.rate)), 0));
    if (grnValue) lines.push({ acc: IDS.accGRNI, dr: grnValue, narration: 'Clear GRNI accrual' });
    const byAcc: Record<string, number> = {};
    v.lines.filter((l) => !l.grnId).forEach((l) => { const acc = l.accountId ?? IDS.accPurchases; byAcc[acc] = r2((byAcc[acc] ?? 0) + l.taxable); });
    Object.entries(byAcc).forEach(([acc, dr]) => lines.push({ acc, dr }));
    v.lines.filter((l) => l.grnId).forEach((l) => { const diff = r2(l.taxable - r2(l.qty * (l.poRate ?? l.rate))); if (diff) lines.push({ acc: IDS.accPurchases, dr: diff, narration: 'Price variance' }); });
    if (v.totals.charges) lines.push({ acc: IDS.accFreight, dr: v.totals.charges, narration: 'Charges' });
    if (v.reverseCharge) {
      const rcmTax = r2(v.lines.reduce((s, l) => s + l.taxAmt, 0));
      lines.push({ acc: IDS.accGSTInputCGST, dr: r2(rcmTax / 2), taxComponent: 'CGST', narration: 'RCM input' }, { acc: IDS.accGSTInputSGST, dr: r2(rcmTax / 2), taxComponent: 'SGST', narration: 'RCM input' }, { acc: IDS.accGSTOutputCGST, cr: r2(rcmTax / 2), taxComponent: 'CGST', narration: 'RCM output liability' }, { acc: IDS.accGSTOutputSGST, cr: r2(rcmTax / 2), taxComponent: 'SGST', narration: 'RCM output liability' });
    } else lines.push(...taxLines(v.lines, inter));
    if (v.totals.tds) lines.push({ acc: IDS.accTDSPayable, cr: v.totals.tds, narration: v.totals.tdsSection });
    if (v.totals.roundOff) lines.push({ acc: IDS.accRoundOff, ...(v.totals.roundOff > 0 ? { cr: v.totals.roundOff } : { dr: -v.totals.roundOff }) });
    lines.push({ acc: IDS.accAP, cr: v.totals.total, partyType: 'Supplier', partyId: v.partyId, partyName: v.partyName });
    journals.push(jv(jid, jnum, v.date, 'Vendor Invoice', v.id, v.number, `Vendor invoice ${v.number} · ${v.partyName} · ${v.supplierInvoiceNumber}`, lines));
    v.journalId = jid; v.journalNumber = jnum;
    const oiId = `oi_${v.id}`;
    v.openItemId = oiId;
    openItems.push(rec<OpenItem>(oiId, { companyId: co, partyType: 'Supplier', partyId: v.partyId!, partyName: v.partyName!, docType: 'Vendor Invoice', docId: v.id, docNumber: v.number, date: v.date, dueDate: v.dueDate!, currency: 'INR', originalAmount: v.totals.total, baseAmount: v.totals.total, rate: 1, outstanding: v.totals.due, baseOutstanding: v.totals.due, direction: 'Debit', status: v.totals.due <= 0 ? 'Settled' : v.totals.due < v.totals.total ? 'Partially Settled' : 'Open', settlements: [], branchId: IDS.brHO }));
  });
  const oi = (id: string) => openItems.find((o) => o.id === id)!;
  const settle = (oiId: string, docType: string, docId: string, docNumber: string, date: string, amount: number) => { const o = oi(oiId); o.settlements.push({ id: `stl_${docId}_${oiId}`, date, docType, docId, docNumber, amount, baseAmount: amount, rate: 1, fxGainLoss: 0 }); };

  // ── Match exceptions ───────────────────────────────────────────────────
  const matchExceptions: MatchException[] = [
    rec<MatchException>('mex_001', { companyId: co, invoiceId: 'vinv_0037', invoiceNumber: 'VINV/26-27/0037', supplierId: IDS.sNational, supplierName: 'National Hardware Co', poId: 'po_0091', poNumber: 'PO/26-27/0091', grnId: 'grn_0061', grnNumber: 'GRN/26-27/0061', lineId: 'vl1', itemName: 'Hex Bolt M16 × 60', type: 'Price variance', poValue: 28, grnValue: 28, invoiceValue: 30, variance: 560, variancePct: 7.14, tolerance: '2% / ₹500', status: 'Assigned', assignedToId: IDS.uAnita, assignedToName: 'Anita Rao', raisedAt: '2026-09-08T10:05:00.000Z' }),
    rec<MatchException>('mex_000', { companyId: co, invoiceId: 'vinv_0032', invoiceNumber: 'VINV/26-27/0032', supplierId: IDS.sVinod, supplierName: 'Vinod Trading Co.', poId: 'po_0085', poNumber: 'PO/26-27/0085', grnId: 'grn_0057', grnNumber: 'GRN/26-27/0057', lineId: 'vl1', itemName: 'Steel Plates 6mm CR', type: 'Tax variance', poValue: 49680, grnValue: 49680, invoiceValue: 49680, variance: 0, variancePct: 0, tolerance: '2% / ₹500', status: 'Approved', resolution: 'Accept invoice value', resolutionReason: 'Supplier IGST computed on rounded taxable value — within ₹1, accepted', resolvedBy: 'Anita Rao', resolvedAt: '2026-08-15T12:00:00.000Z', approvedBy: 'Rahul Kumar', approvedAt: '2026-08-15T14:00:00.000Z', raisedAt: '2026-08-15T10:05:00.000Z' }),
  ];

  // ── Debit notes & purchase return ──────────────────────────────────────
  const dnLine = (id: string, item: Itm, qty: number, rate: number, inter: boolean, wh?: string): DocLine => mkLine({ id, item, qty, rate, warehouseId: wh }, inter);
  const dn7Lines = [dnLine('dl1', ITM.grease, 2, 2800, true)];
  const dn8Lines = [dnLine('dl1', ITM.crate, 10, 850, true, IDS.whAndheri)];
  const debitNotes: DebitNote[] = [
    { ...base('dn_0007', 'Debit Note', 'DN/26-27/0007', '2026-08-12', 'Posted', SUP.sunrise, { invoiceId: 'vinv_0027', invoiceNumber: 'VINV/26-27/0027', sourceType: 'Vendor Invoice', sourceId: 'vinv_0027', sourceNumber: 'VINV/26-27/0027', reasonCode: 'SHORT', goodsReturn: false, lines: dn7Lines, totals: mkTotals(dn7Lines), settledAgainstInvoice: true, notes: '2 tins short-supplied against ST/26-27/0341', journalId: 'jv_dn_0007', journalNumber: 'JV/26-27/0330', ...posted('2026-08-12', 'Anil Patil') }) } as DebitNote,
    { ...base('dn_0008', 'Debit Note', 'DN/26-27/0008', '2026-09-09', 'Posted', SUP.kiran, { invoiceId: 'vinv_0036', invoiceNumber: 'VINV/26-27/0036', grnId: 'grn_0060', grnNumber: 'GRN/26-27/0060', sourceType: 'Vendor Invoice', sourceId: 'vinv_0036', sourceNumber: 'VINV/26-27/0036', reasonCode: 'DAMAGED', goodsReturn: true, returnWarehouseId: IDS.whAndheri, purchaseReturnId: 'prt_0003', purchaseReturnNumber: 'PRT/26-27/0003', lines: dn8Lines, totals: mkTotals(dn8Lines), settledAgainstInvoice: false, openItemId: 'oi_dn_0008', notes: '10 crates damaged in transit — returned to supplier', journalId: 'jv_dn_0008', journalNumber: 'JV/26-27/0331', ...posted('2026-09-09', 'Anil Patil') }) } as DebitNote,
  ];
  const purchaseReturns: PurchaseReturn[] = [
    { ...base('prt_0003', 'Purchase Return', 'PRT/26-27/0003', '2026-09-09', 'Posted', SUP.kiran, { debitNoteId: 'dn_0008', debitNoteNumber: 'DN/26-27/0008', grnId: 'grn_0060', grnNumber: 'GRN/26-27/0060', sourceType: 'Debit Note', sourceId: 'dn_0008', sourceNumber: 'DN/26-27/0008', lines: dn8Lines, totals: mkTotals(dn8Lines), warehouseId: IDS.whAndheri, ...posted('2026-09-09', 'Suresh Kumar') }) } as PurchaseReturn,
  ];
  journals.push(jv('jv_dn_0007', 'JV/26-27/0330', '2026-08-12', 'Debit Note', 'dn_0007', 'DN/26-27/0007', 'Debit note DN/26-27/0007 · short supply against VINV/26-27/0027', [{ acc: IDS.accAP, dr: 6608, partyType: 'Supplier', partyId: IDS.sSunriseTr, partyName: 'Sunrise Traders' }, { acc: IDS.accPurchases, cr: 5600 }, { acc: IDS.accGSTInputIGST, cr: 1008, taxComponent: 'IGST' }]));
  journals.push(jv('jv_dn_0008', 'JV/26-27/0331', '2026-09-09', 'Debit Note', 'dn_0008', 'DN/26-27/0008', 'Debit note DN/26-27/0008 · goods return PRT/26-27/0003', [{ acc: IDS.accAP, dr: 9520, partyType: 'Supplier', partyId: IDS.sKiranAg, partyName: 'Kiran Agencies' }, { acc: IDS.accInvFG, cr: 8500 }, { acc: IDS.accGSTInputIGST, cr: 1020, taxComponent: 'IGST' }]));
  settle('oi_vinv_0027', 'Debit Note', 'dn_0007', 'DN/26-27/0007', '2026-08-12', 6608);
  openItems.push(rec<OpenItem>('oi_dn_0008', { companyId: co, partyType: 'Supplier', partyId: IDS.sKiranAg, partyName: 'Kiran Agencies', docType: 'Debit Note', docId: 'dn_0008', docNumber: 'DN/26-27/0008', date: '2026-09-09', dueDate: '2026-09-09', currency: 'INR', originalAmount: 9520, baseAmount: 9520, rate: 1, outstanding: 9520, baseOutstanding: 9520, direction: 'Credit', status: 'Open', settlements: [], branchId: IDS.brHO }));

  // ── Payments ───────────────────────────────────────────────────────────
  const pay = (id: string, num: string, date: string, sup: Sup, method: Payment['method'], bank: string, bankName: string, utr: string | undefined, allocs: { oi: string; docId: string; docNumber: string; amount: number; outstanding: number }[], status: Payment['status'], extra: Partial<Payment> = {}): Payment => {
    const gross = r2(allocs.reduce((s, a) => s + a.amount, 0) + (extra.unappliedAmount ?? 0));
    const tds = extra.tdsAmount ?? 0; const charges = extra.chargesAmount ?? 0;
    const p: Payment = {
      ...base(id, 'Payment', num, date, status, sup, { method, bankAccountId: bank, bankAccountName: bankName, utr, allocations: allocs.map((a, i) => ({ id: `al${i + 1}`, openItemId: a.oi, docType: 'Vendor Invoice', docId: a.docId, docNumber: a.docNumber, outstanding: a.outstanding, amount: a.amount, tds: 0 })), tdsAmount: tds, chargesAmount: charges, grossAmount: gross, netAmount: r2(gross - tds), unappliedAmount: 0, lines: [], totals: { ...mkTotals([]), total: r2(gross - tds), baseTotal: r2(gross - tds) }, ...(status === 'Completed' ? posted(date, 'Anil Patil') : {}) }),
      ...extra,
    } as Payment;
    return p;
  };
  const payments: Payment[] = [
    pay('pmt_0180', 'PMT/26-27/0180', '2026-09-12', SUP.bharatSteel, 'NEFT', IDS.accHDFC, 'HDFC Current Account ****1234', 'UTR/091210/00881', [{ oi: 'oi_vinv_0038', docId: 'vinv_0038', docNumber: 'VINV/26-27/0038', amount: 217620, outstanding: 217620 }], 'Completed', { journalId: 'jv_pmt_0180', journalNumber: 'JV/26-27/0340', notes: 'Settlement of BSS/2026/1187' }),
    pay('pmt_0178', 'PMT/26-27/0178', '2026-09-10', SUP.national, 'NEFT', IDS.accHDFC, 'HDFC Current Account ****1234', 'UTR/091012/00621', [{ oi: 'oi_vinv_0033', docId: 'vinv_0033', docNumber: 'VINV/26-27/0033', amount: 33040, outstanding: 33040 }], 'Completed', { journalId: 'jv_pmt_0178', journalNumber: 'JV/26-27/0339', batchId: 'pb_0021', batchNumber: 'PMT-BATCH/0021' }),
    pay('pmt_0176', 'PMT/26-27/0176', '2026-09-10', SUP.kiran, 'RTGS', IDS.accHDFC, 'HDFC Current Account ****1234', 'UTR/091020/00142', [{ oi: 'oi_vinv_0036', docId: 'vinv_0036', docNumber: 'VINV/26-27/0036', amount: 109480, outstanding: 109480 }], 'Completed', { journalId: 'jv_pmt_0176', journalNumber: 'JV/26-27/0338', batchId: 'pb_0021', batchNumber: 'PMT-BATCH/0021' }),
    pay('pmt_0174', 'PMT/26-27/0174', '2026-09-05', SUP.globalPack, 'Cheque', IDS.accICICI, 'ICICI Current Account ****5678', 'CHQ 041234', [{ oi: 'oi_vinv_0029', docId: 'vinv_0029', docNumber: 'VINV/26-27/0029', amount: 38080, outstanding: 38080 }], 'Completed', { journalId: 'jv_pmt_0174', journalNumber: 'JV/26-27/0337', instrumentDate: '2026-09-05' }),
    pay('pmt_0152', 'PMT/26-27/0152', '2026-04-18', SUP.bharatAg, 'UPI', IDS.accHDFC, 'HDFC Current Account ****1234', 'UPI/042015/89341', [{ oi: 'oi_vinv_0022', docId: 'vinv_0022', docNumber: 'VINV/26-27/0022', amount: 188000, outstanding: 188000 }], 'Completed', { journalId: 'jv_pmt_0152', journalNumber: 'JV/26-27/0336' }),
    pay('pmt_0151', 'PMT/26-27/0151', '2026-04-12', SUP.shree, 'Cheque', IDS.accHDFC, 'HDFC Current Account ****1234', 'CHQ 041234', [], 'Completed', { journalId: 'jv_pmt_0151', journalNumber: 'JV/26-27/0335', unappliedAmount: 62000, grossAmount: 62000, netAmount: 62000, totals: { ...mkTotals([]), total: 62000, baseTotal: 62000 }, advanceOpenItemId: 'oi_adv_shree', instrumentDate: '2026-04-12', notes: 'Advance against steel supply — to be applied on next invoice' }),
    { ...pay('pmt_0172', 'PMT/DRAFT', '2026-09-12', SUP.bharatSteel, 'NEFT', IDS.accHDFC, 'HDFC Current Account ****1234', undefined, [{ oi: 'oi_vinv_0034', docId: 'vinv_0034', docNumber: 'VINV/26-27/0034', amount: 58500, outstanding: 58500 }], 'Draft') },
  ];
  const payJv = (p: Payment, jid: string, jnum: string) => {
    const lines: JLine[] = [];
    const alloc = r2(p.allocations.reduce((s, a) => s + a.amount, 0));
    if (alloc) lines.push({ acc: IDS.accAP, dr: alloc, partyType: 'Supplier', partyId: p.partyId, partyName: p.partyName });
    if (p.unappliedAmount) lines.push({ acc: IDS.accAdvanceSupplier, dr: p.unappliedAmount, partyType: 'Supplier', partyId: p.partyId, partyName: p.partyName, narration: 'Advance to supplier' });
    if (p.tdsAmount) lines.push({ acc: IDS.accTDSPayable, cr: p.tdsAmount });
    lines.push({ acc: p.bankAccountId, cr: p.netAmount, narration: `${p.method} ${p.utr ?? ''}`.trim() });
    journals.push(jv(jid, jnum, p.date, 'Payment', p.id, p.number, `Payment ${p.number} · ${p.partyName} · ${p.method}${p.utr ? ' ' + p.utr : ''}`, lines));
  };
  payments.filter((p) => p.status === 'Completed').forEach((p) => {
    payJv(p, p.journalId!, p.journalNumber!);
    p.allocations.forEach((a) => settle(a.openItemId, 'Payment', p.id, p.number, p.date, a.amount));
  });
  openItems.push(rec<OpenItem>('oi_adv_shree', { companyId: co, partyType: 'Supplier', partyId: IDS.sShree, partyName: 'Shree Suppliers Ltd', docType: 'Payment', docId: 'pmt_0151', docNumber: 'PMT/26-27/0151', date: '2026-04-12', dueDate: '2026-04-12', currency: 'INR', originalAmount: 62000, baseAmount: 62000, rate: 1, outstanding: 62000, baseOutstanding: 62000, direction: 'Credit', status: 'Open', settlements: [], branchId: IDS.brHO }));

  // ── Payment batches ────────────────────────────────────────────────────
  const bl = (id: string, sup: Sup, oiIds: string[], nums: string[], amount: number, status: PaymentBatch['lines'][number]['status'], extra: Partial<PaymentBatch['lines'][number]> = {}) => ({ id, supplierId: sup.id, supplierName: sup.name, openItemIds: oiIds, docNumbers: nums, amount, tds: 0, net: amount, bankName: sup.bank?.bankName, accountNumber: sup.bank?.accountNumber, ifsc: sup.bank?.ifsc, status, ...extra });
  const paymentBatches: PaymentBatch[] = [
    rec<PaymentBatch>('pb_0022', { companyId: co, number: 'PMT-BATCH/0022', docType: 'Payment Batch', date: '2026-09-11', branchId: IDS.brHO, currency: 'INR', bankAccountId: IDS.accHDFC, bankAccountName: 'HDFC Current Account ****1234', method: 'NEFT', status: 'Submitted', total: 642000, makerId: IDS.uAnil, makerName: 'Anil Patil', submittedAt: '2026-09-11T11:00:00.000Z', notes: 'Weekly supplier run — overdue first', correlationId: 'corr_pb_0022', lines: [
      bl('bl1', SUP.sunrise, ['oi_vinv_0027', 'oi_vinv_0030'], ['VINV/26-27/0027', 'VINV/26-27/0030'], 221542, 'Pending', { note: 'Overdue 31–60 d' }),
      bl('bl2', SUP.consult, ['oi_vinv_0028'], ['VINV/26-27/0028'], 108000, 'Pending'),
      bl('bl3', SUP.transport, ['oi_vinv_0031'], ['VINV/26-27/0031'], 16800, 'Pending'),
      bl('bl4', SUP.bharatSteel, ['oi_vinv_0034'], ['VINV/26-27/0034'], 58500, 'Pending'),
      bl('bl5', SUP.globalPack, ['oi_vinv_0035'], ['VINV/26-27/0035'], 38080, 'Pending'),
      bl('bl6', SUP.vinod, ['oi_vinv_0032'], ['VINV/26-27/0032'], 199078, 'Pending', { note: 'Partial — cash-flow cap; balance ₹1,26,602 next run' }),
    ] }),
    rec<PaymentBatch>('pb_0021', { companyId: co, number: 'PMT-BATCH/0021', docType: 'Payment Batch', date: '2026-09-09', branchId: IDS.brHO, currency: 'INR', bankAccountId: IDS.accHDFC, bankAccountName: 'HDFC Current Account ****1234', method: 'NEFT', status: 'Completed', total: 142520, makerId: IDS.uAnil, makerName: 'Anil Patil', checkerName: 'Anita Rao', submittedAt: '2026-09-09T11:00:00.000Z', approvedAt: '2026-09-09T15:20:00.000Z', fileGeneratedAt: '2026-09-10T09:00:00.000Z', fileName: 'HDFC_NEFT_PMT-BATCH-0021.csv', sentAt: '2026-09-10T09:05:00.000Z', completedAt: '2026-09-10T16:00:00.000Z', correlationId: 'corr_pb_0021', lines: [
      bl('bl1', SUP.kiran, ['oi_vinv_0036'], ['VINV/26-27/0036'], 109480, 'Completed', { utr: 'UTR/091020/00142', paymentId: 'pmt_0176', paymentNumber: 'PMT/26-27/0176' }),
      bl('bl2', SUP.national, ['oi_vinv_0033'], ['VINV/26-27/0033'], 33040, 'Completed', { utr: 'UTR/091012/00621', paymentId: 'pmt_0178', paymentNumber: 'PMT/26-27/0178' }),
    ] }),
  ];

  // finalise open item statuses after settlements
  openItems.forEach((o) => {
    const settled = r2(o.settlements.reduce((s, x) => s + x.amount, 0));
    o.outstanding = r2(o.originalAmount - settled); o.baseOutstanding = o.outstanding;
    o.status = o.outstanding <= 0.005 ? 'Settled' : settled > 0 ? 'Partially Settled' : 'Open';
  });

  void SEED_NOW;
  return {
    [C.requisitions]: requisitions as any, [C.rfqs]: rfqs as any, [C.supplierQuotes]: supplierQuotes as any, [C.purchaseOrders]: purchaseOrders as any, [C.grns]: grns as any,
    [C.vendorInvoices]: vendorInvoices as any, [C.matchExceptions]: matchExceptions as any, [C.debitNotes]: debitNotes as any, [C.purchaseReturns]: purchaseReturns as any,
    [C.payments]: payments as any, [C.paymentBatches]: paymentBatches as any, [C.openItems]: openItems as any, [C.journals]: journals as any,
  };
}
