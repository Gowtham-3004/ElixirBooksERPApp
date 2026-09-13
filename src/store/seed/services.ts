// Seed data for the Projects & Contracts (Services profile) module: service
// catalog items, contracts (one per billing method), projects + their Project
// dimensions, resources, rate cards, timesheets, milestones, usage, billable
// expenses, billing runs with their generated (posted) invoices, retainers and
// revenue schedules — plus the journals / open items those postings produce.
// Amounts are derived from the same timesheet rows the engine would read, so
// live recomputation matches the posted schedule.
import type { DB } from '../db';
import type { ApprovalRequest, Dimension, DocLine, DocTotals, Item, Journal, JournalLine, NumberSeries, OpenItem, PartySnapshot } from '../types';
import { C } from '../collections';
import { IDS, rec, SEED_NOW } from './core';
import { addDays, round } from '../../lib/format';

const CO = IDS.acme;
const T = (d: string, h = '10:00') => `${d}T${h}:00.000Z`;
const ACC = { ar: IDS.accAR, serviceRev: IDS.accServiceRev, cgst: IDS.accGSTOutputCGST, sgst: IDS.accGSTOutputSGST, igst: IDS.accGSTOutputIGST, roundOff: IDS.accRoundOff, hdfc: IDS.accHDFC, unbilled: 'acc_1160', deferred: 'acc_2400', retainers: 'acc_2160' };
const ACC_META: Record<string, { code: string; name: string }> = {
  [IDS.accAR]: { code: '1100', name: 'Trade Receivables (AR Control)' }, [IDS.accServiceRev]: { code: '4010', name: 'Service Revenue' }, [IDS.accGSTOutputCGST]: { code: '2300', name: 'GST Output CGST' }, [IDS.accGSTOutputSGST]: { code: '2301', name: 'GST Output SGST' }, [IDS.accGSTOutputIGST]: { code: '2302', name: 'GST Output IGST' }, [IDS.accRoundOff]: { code: '4900', name: 'Round-off' }, [IDS.accHDFC]: { code: '1310', name: 'HDFC Bank Current A/c' }, acc_1160: { code: '1160', name: 'Unbilled Revenue (Accrued)' }, acc_2400: { code: '2400', name: 'Deferred Revenue' }, acc_2160: { code: '2160', name: 'Retainers Received' },
};
const CUST: Record<string, { name: string; gstin?: string; state: string; stateCode?: string; treatment: string; city: string; line1: string; pin: string; country: string; terms: string; currency: string; contact: { name: string; email: string; phone: string } }> = {
  [IDS.cGlobalTech]: { name: 'Global Tech Solutions', gstin: '27AABCG3456F1Z5', state: 'Maharashtra', stateCode: '27', treatment: 'Registered', city: 'Mumbai', line1: 'Tower B, BKC', pin: '400051', country: 'IN', terms: 'Net 30', currency: 'INR', contact: { name: 'Neha Shah', email: 'ap@globaltech.in', phone: '+91 22 6789 1000' } },
  [IDS.cMetro]: { name: 'Metro Distributors', gstin: '27AABCM2345J1Z8', state: 'Maharashtra', stateCode: '27', treatment: 'Registered', city: 'Navi Mumbai', line1: 'Vashi APMC Market', pin: '400703', country: 'IN', terms: 'Net 30', currency: 'INR', contact: { name: 'Sameer Khan', email: 'sameer@metrodist.in', phone: '+91 98190 44556' } },
  [IDS.cUSTech]: { name: 'US Tech Imports Inc.', state: 'California', treatment: 'Overseas', city: 'San Francisco', line1: '500 Market St', pin: '94105', country: 'US', terms: 'Net 45', currency: 'USD', contact: { name: 'John Miller', email: 'ap@ustechimports.com', phone: '+1 415 555 0100' } },
  [IDS.cDelta]: { name: 'Delta Pharma', gstin: '27AABCD1234P1Z7', state: 'Maharashtra', stateCode: '27', treatment: 'Registered', city: 'Navi Mumbai', line1: 'Turbhe MIDC', pin: '400705', country: 'IN', terms: 'Net 30', currency: 'INR', contact: { name: 'Deepak Jain', email: 'ap@deltapharma.in', phone: '+91 22 2767 8899' } },
  [IDS.cKiran]: { name: 'Kiran Tech Pvt Ltd', gstin: '27AABCK7654L1Z2', state: 'Maharashtra', stateCode: '27', treatment: 'Registered', city: 'Pune', line1: 'Hinjewadi Phase 1', pin: '411057', country: 'IN', terms: 'Net 30', currency: 'INR', contact: { name: 'Kiran Rao', email: 'finance@kirantech.com', phone: '+91 20 6677 8899' } },
  [IDS.cSunrise]: { name: 'Sunrise Industries', gstin: '24AABCS7890H1Z1', state: 'Gujarat', stateCode: '24', treatment: 'Registered', city: 'Vapi', line1: 'GIDC Vapi', pin: '396195', country: 'IN', terms: 'Net 30', currency: 'INR', contact: { name: 'Hitesh Patel', email: 'accounts@sunriseind.com', phone: '+91 98250 33445' } },
};
function snapshot(id: string): PartySnapshot {
  const c = CUST[id];
  const address = { line1: c.line1, city: c.city, state: c.state, stateCode: c.stateCode, pin: c.pin, country: c.country };
  return { name: c.name, gstin: c.gstin, taxTreatment: c.treatment, state: c.state, stateCode: c.stateCode, billingAddress: address, shippingAddress: address, contact: { id: 'c1', ...c.contact, designation: 'Accounts', isDefault: true, purpose: 'General' }, paymentTerms: c.terms, currency: c.currency };
}

// ── Static ids ─────────────────────────────────────────────────────────────
export const SRV = {
  svcConsult: 'svc_001', svcDev: 'svc_002', svcPM: 'svc_003', svcSupport: 'svc_004', svcImpl: 'svc_005', svcAMC: 'svc_006',
  itemDev: 'item_svc_dev', itemPM: 'item_svc_pm', itemSupport: 'item_svc_support', itemImpl: 'item_svc_impl',
  con1: 'con_001', con2: 'con_002', con3: 'con_003', con4: 'con_004', con5: 'con_005', con6: 'con_006',
  prj051: 'prj_051', prj042: 'prj_042', prj060: 'prj_060', prj061: 'prj_061', prj062: 'prj_062',
  dim060: 'dim_prj_060', dim061: 'dim_prj_061', dim062: 'dim_prj_062',
  rcStd: 'rc_std', rcUsd: 'rc_usd',
  ret1: 'ret_001', ret2: 'ret_002',
  inv1: 'inv_srv_001', inv2: 'inv_srv_002', inv3: 'inv_srv_003', inv4: 'inv_srv_004', inv5: 'inv_srv_005',
} as const;

const RATES: Record<string, number> = { [IDS.ePriya]: 3000, [IDS.eAnita]: 2500, [IDS.eAnil]: 1800, [IDS.eVikram]: 6000, [IDS.eSuresh]: 2000, [IDS.eRahul]: 4500 };
const EMP_NAME: Record<string, string> = { [IDS.eRahul]: 'Rahul Kumar', [IDS.ePriya]: 'Priya Mehta', [IDS.eVikram]: 'Vikram Singh', [IDS.eAnita]: 'Anita Rao', [IDS.eSuresh]: 'Suresh Kumar', [IDS.eAnil]: 'Anil Patil' };
const ROLE: Record<string, string> = { [IDS.eRahul]: 'Finance lead', [IDS.ePriya]: 'Business analyst', [IDS.eVikram]: 'Solution architect', [IDS.eAnita]: 'Consultant', [IDS.eSuresh]: 'Engineer', [IDS.eAnil]: 'Junior consultant' };

// ── Invoice / journal builders (same arithmetic as engine.computeDocument) ──
let lnSeq = 0, jlSeq = 0, jvSeq = 421;
const lid = () => `ln_srv${String(++lnSeq).padStart(3, '0')}`;
interface LineSpec { itemId: string; name: string; qty: number; rate: number; uom: string; desc?: string; hsn: string; dim?: string }

function buildInvoiceLines(custId: string, specs: LineSpec[], rate: number): { lines: DocLine[]; totals: DocTotals } {
  const c = CUST[custId];
  const zero = c.treatment === 'Overseas';
  const inter = !zero && c.stateCode !== '27';
  const components: Record<string, number> = {};
  const breakup: DocTotals['breakup'] = [];
  const lines: DocLine[] = specs.map((s) => {
    const taxable = round(s.qty * s.rate);
    const pct = zero ? 0 : 18;
    const comps: Record<string, number> = pct ? (inter ? { IGST: round(taxable * 0.18) } : { CGST: round(taxable * 0.09), SGST: round(taxable * 0.09) }) : {};
    const taxAmt = round(Object.values(comps).reduce((a, b) => a + b, 0));
    Object.entries(comps).forEach(([k, v]) => { components[k] = round((components[k] ?? 0) + v); const cr = k === 'IGST' ? 18 : 9; const row = breakup.find((b) => b.component === k && b.hsn === s.hsn); if (row) { row.taxable = round(row.taxable + taxable); row.tax = round(row.tax + v); } else breakup.push({ component: k, rate: cr, hsn: s.hsn, taxable, tax: v }); });
    return { id: lid(), itemId: s.itemId, itemCode: s.itemId === IDS.iConsult ? 'SVC-CONSULT' : s.itemId.replace('item_', '').toUpperCase(), itemName: s.name, description: s.desc, hsn: s.hsn, qty: s.qty, uom: s.uom, rate: s.rate, listRate: s.rate, priceListName: 'Contract', discountPct: 0, discountAmt: 0, taxable, taxRateId: zero ? IDS.taxExport : IDS.taxGST18, taxRate: pct, taxAmt, taxComponents: comps, taxTreatment: zero ? 'Zero-rated (SEZ/Export)' : 'Taxable', reverseCharge: false, amount: round(taxable + taxAmt), accountId: ACC.serviceRev, dimensions: s.dim ? { Project: s.dim } : undefined } as DocLine;
  });
  const subtotal = round(lines.reduce((a, l) => a + l.taxable, 0));
  const tax = round(Object.values(components).reduce((a, b) => a + b, 0));
  const raw = round(subtotal + tax);
  const roundOff = round(Math.round(raw) - raw);
  const total = round(raw + roundOff);
  return { lines, totals: { subtotal, discount: 0, taxable: subtotal, tax, components, breakup, charges: 0, tds: 0, roundOff, total, paid: 0, credited: 0, writtenOff: 0, due: total, baseTotal: round(total * rate) } };
}

function journal(id: string, date: string, lines: { accountId: string; dr?: number; cr?: number; partyId?: string; partyName?: string; taxComponent?: string; narration?: string; dim?: string }[], o: { sourceType: string; sourceId: string; sourceNumber: string; narration: string; currency?: string; rate?: number; type?: Journal['type']; idempotencyKey?: string; reversalOfId?: string; reversedById?: string; reversalReason?: string }): Journal {
  const rate = o.rate ?? 1;
  const jl: JournalLine[] = lines.filter((l) => (l.dr ?? 0) !== 0 || (l.cr ?? 0) !== 0).map((l) => { const a = ACC_META[l.accountId] ?? { code: '', name: l.accountId }; return { id: `jl_srv${String(++jlSeq).padStart(3, '0')}`, accountId: l.accountId, accountCode: a.code, accountName: a.name, dr: round(l.dr ?? 0), cr: round(l.cr ?? 0), drBase: round((l.dr ?? 0) * rate), crBase: round((l.cr ?? 0) * rate), currency: o.currency ?? 'INR', partyType: l.partyId ? 'Customer' : undefined, partyId: l.partyId, partyName: l.partyName, dimensions: { Branch: IDS.brHO, ...(l.dim ? { Project: l.dim } : {}) }, narration: l.narration, taxComponent: l.taxComponent }; });
  const totalDr = round(jl.reduce((s, l) => s + l.drBase, 0));
  const totalCr = round(jl.reduce((s, l) => s + l.crBase, 0));
  if (Math.abs(totalDr - totalCr) > 0.011) throw new Error(`Seed journal ${id} unbalanced: ${totalDr} vs ${totalCr}`);
  return rec<Journal>(id, { companyId: CO, number: `JV/26-27/${String(jvSeq++).padStart(4, '0')}`, date, period: date.slice(0, 7), fy: '2026-27', branchId: IDS.brHO, currency: o.currency ?? 'INR', rate, status: o.reversedById ? 'Reversed' : 'Posted', type: o.type ?? 'Auto', sourceType: o.sourceType, sourceId: o.sourceId, sourceNumber: o.sourceNumber, narration: o.narration, lines: jl, totalDr, totalCr, idempotencyKey: o.idempotencyKey, payloadHash: 'seed', postedAt: T(date), postedBy: 'Rahul Kumar', correlationId: `corr_${o.sourceId.toUpperCase()}`, reversalOfId: o.reversalOfId, reversedById: o.reversedById, reversalReason: o.reversalReason, createdAt: T(date), updatedAt: T(date) });
}

// ── Seed ───────────────────────────────────────────────────────────────────
export function seedServices(): Partial<DB> {
  const item = (id: string, code: string, name: string, uom: string, hsn: string, price: number, desc: string): Item =>
    rec<Item>(id, { companyId: CO, code, name, description: desc, type: 'Service', group: 'Services', baseUom: uom, altUoms: [], hsn, taxRateId: IDS.taxGST18, salesAccountId: IDS.accServiceRev, purchaseAccountId: IDS.accProfFees, tracking: 'None', reorderLevel: 0, reorderQty: 0, safetyStock: 0, leadTimeDays: 0, salesPrice: price, purchasePrice: 0, status: 'Active', isStock: false });
  const items: Item[] = [
    item(SRV.itemDev, 'SVC-DEV', 'Software development (per hour)', 'Hr', '998314', 3500, 'Custom development, integration and testing'),
    item(SRV.itemPM, 'SVC-PM', 'Project management (per day)', 'Day', '998311', 24000, 'Engagement / project management'),
    item(SRV.itemSupport, 'SVC-SUPPORT', 'Managed support (monthly)', 'Month', '998313', 150000, 'L2/L3 application support retainer'),
    item(SRV.itemImpl, 'SVC-IMPL', 'Implementation — fixed fee', 'Nos', '998313', 0, 'Fixed-fee implementation deliverable / instalment'),
  ];
  const svc = (id: string, itemId: string, code: string, name: string, sac: string, unit: string, rate: number, desc?: string) =>
    rec<any>(id, { companyId: CO, itemId, code, name, description: desc, sac, unit, defaultRate: rate, taxRateId: IDS.taxGST18, revenueAccountId: IDS.accServiceRev, billableDefault: true, status: 'Active' });
  const services = [
    svc(SRV.svcConsult, IDS.iConsult, 'SVC-CONSULT', 'Consultancy services (per hour)', '998311', 'Hr', 2500, 'Advisory and functional consulting'),
    svc(SRV.svcDev, SRV.itemDev, 'SVC-DEV', 'Software development (per hour)', '998314', 'Hr', 3500),
    svc(SRV.svcPM, SRV.itemPM, 'SVC-PM', 'Project management (per day)', '998311', 'Day', 24000),
    svc(SRV.svcSupport, SRV.itemSupport, 'SVC-SUPPORT', 'Managed support (monthly)', '998313', 'Month', 150000),
    svc(SRV.svcImpl, SRV.itemImpl, 'SVC-IMPL', 'Implementation — fixed fee', '998313', 'Fixed', 0),
    svc(SRV.svcAMC, IDS.iAMC, 'SVC-AMC', 'Annual maintenance contract', '998719', 'Fixed', 120000),
  ];

  const dimensions: Dimension[] = [
    rec<Dimension>(SRV.dim060, { companyId: CO, type: 'Project', code: 'PRJ-060', name: 'US Tech Data Platform', status: 'Active', color: '#0EA5E9' }),
    rec<Dimension>(SRV.dim061, { companyId: CO, type: 'Project', code: 'PRJ-061', name: 'Delta Pharma Managed Support', status: 'Active', color: '#12784E' }),
    rec<Dimension>(SRV.dim062, { companyId: CO, type: 'Project', code: 'PRJ-062', name: 'Kiran Tech API Integration', status: 'Active', color: '#F97316' }),
  ];

  const prj = (id: string, code: string, name: string, customerId: string, contractId: string, mgr: string, start: string, end: string, budgetHours: number, budgetAmount: number, status: string, dimensionId: string, team: string[], desc: string) =>
    rec<any>(id, { companyId: CO, code, name, description: desc, customerId, customerName: CUST[customerId].name, contractId, managerEmployeeId: mgr, start, end, budgetHours, budgetAmount, status, dimensionId, teamEmployeeIds: team, branchId: IDS.brHO, statusHistory: status === 'Active' ? [{ at: T(start), by: 'Rahul Kumar', from: 'Planned', to: 'Active', reason: 'Contract activated' }] : [] });
  const projects = [
    prj(SRV.prj051, 'PRJ-051', 'Global Tech ERP Advisory', IDS.cGlobalTech, SRV.con1, IDS.eVikram, '2026-07-01', '2027-03-31', 1200, 3600000, 'Active', IDS.dimPrj051, [IDS.ePriya, IDS.eAnita, IDS.eAnil], 'ERP selection, process mapping and rollout advisory — time & material'),
    prj(SRV.prj042, 'PRJ-042', 'Metro Line 3 Brackets', IDS.cMetro, SRV.con2, IDS.eVikram, '2026-04-01', '2026-12-31', 900, 1200000, 'Active', IDS.dimPrj042, [IDS.eVikram, IDS.eSuresh], 'Engineering design and supply supervision for Metro Line 3 mounting brackets — fixed price'),
    prj(SRV.prj060, 'PRJ-060', 'US Tech Data Platform', IDS.cUSTech, SRV.con3, IDS.eRahul, '2026-05-01', '2026-12-31', 700, 2800000, 'Active', SRV.dim060, [IDS.eVikram, IDS.eAnita, IDS.eRahul], 'Data platform build for US Tech Imports — milestone billed in USD'),
    prj(SRV.prj061, 'PRJ-061', 'Delta Pharma Managed Support', IDS.cDelta, SRV.con4, IDS.eAnita, '2026-08-01', '2027-07-31', 600, 900000, 'Active', SRV.dim061, [IDS.eAnita, IDS.eAnil], 'Monthly managed application support — recurring fee'),
    prj(SRV.prj062, 'PRJ-062', 'Kiran Tech API Integration', IDS.cKiran, SRV.con5, IDS.ePriya, '2026-06-01', '2027-05-31', 200, 300000, 'Active', SRV.dim062, [IDS.eAnil], 'API gateway usage billed per thousand calls'),
  ];

  const rateCards = [
    rec<any>(SRV.rcStd, { companyId: CO, code: 'RC-STD-26', name: 'Standard INR 2026', currency: 'INR', rows: [{ role: 'Project manager', rate: 5000 }, { role: 'Solution architect', rate: 6000 }, { role: 'Senior consultant', rate: 4500 }, { role: 'Finance lead', rate: 4500 }, { role: 'Consultant', rate: 2500 }, { role: 'Business analyst', rate: 3000 }, { role: 'Engineer', rate: 2000 }, { role: 'Junior consultant', rate: 1800 }], validFrom: '2026-04-01', status: 'Active' }),
    rec<any>(SRV.rcUsd, { companyId: CO, code: 'RC-USD-26', name: 'Export USD 2026', currency: 'USD', rows: [{ role: 'Project manager', rate: 65 }, { role: 'Solution architect', rate: 75 }, { role: 'Senior consultant', rate: 60 }, { role: 'Finance lead', rate: 60 }, { role: 'Consultant', rate: 35 }, { role: 'Business analyst', rate: 40 }, { role: 'Engineer', rate: 30 }, { role: 'Junior consultant', rate: 25 }], validFrom: '2026-04-01', status: 'Active' }),
  ];

  const res = (id: string, emp: string, cost: number, cap = 40) => rec<any>(id, { companyId: CO, employeeId: emp, employeeName: EMP_NAME[emp], role: ROLE[emp], costRate: cost, billRate: RATES[emp], capacityHoursPerWeek: cap, status: 'Active' });
  const resources = [res('res_001', IDS.eRahul, 1800, 20), res('res_002', IDS.ePriya, 1200), res('res_003', IDS.eVikram, 2200, 32), res('res_004', IDS.eAnita, 900), res('res_005', IDS.eSuresh, 700), res('res_006', IDS.eAnil, 600)];

  // ── Contracts ──
  const con = (id: string, n: string, date: string, custId: string, title: string, method: string, amount: number, start: string, end: string | undefined, projectId: string | undefined, status: string, extra: Record<string, unknown>) => {
    const c = CUST[custId];
    const rate = c.currency === 'USD' ? 83.2 : 1;
    const dim = projectId ? projects.find((p) => p.id === projectId)?.dimensionId : undefined;
    return rec<any>(id, { companyId: CO, number: n, docType: 'Contract', date, branchId: IDS.brHO, status, currency: c.currency, rate, partyType: 'Customer', partyId: custId, partyName: c.name, partySnapshot: snapshot(custId), customerId: custId, projectId, title, billingMethod: method, amount, start, end, taxRateId: c.treatment === 'Overseas' ? IDS.taxExport : IDS.taxGST18, paymentTerms: c.terms, serviceItemId: IDS.iConsult, revenueMethod: 'Auto', lines: [], totals: { subtotal: amount, discount: 0, taxable: amount, tax: 0, components: {}, breakup: [], charges: 0, tds: 0, roundOff: 0, total: amount, paid: 0, credited: 0, writtenOff: 0, due: 0, baseTotal: round(amount * rate) }, dimensions: dim ? { Project: dim } : undefined, fy: '2026-27', period: date.slice(0, 7), correlationId: `corr_${id.toUpperCase()}`, submittedAt: status !== 'Draft' ? T(date, '11:00') : undefined, submittedBy: status !== 'Draft' ? 'Rahul Kumar' : undefined, approvedAt: status !== 'Draft' ? T(date, '11:00') : undefined, approvedBy: status !== 'Draft' ? 'system (no Contract workflow)' : undefined, activatedAt: status === 'Active' ? T(start, '09:00') : undefined, activatedBy: status === 'Active' ? 'Rahul Kumar' : undefined, createdAt: T(date, '09:00'), updatedAt: T(date, '11:00'), createdBy: 'Rahul Kumar', ...extra });
  };
  const contracts = [
    con(SRV.con1, 'CON/26-27/0001', '2026-06-20', IDS.cGlobalTech, 'ERP Advisory — Time & material', 'Time & material', 3600000, '2026-07-01', '2027-03-31', SRV.prj051, 'Active', { rateCardId: SRV.rcStd, capHours: 1200, capAmount: 3600000, notes: 'Monthly billing of approved hours at Standard INR 2026 rate card. Cap 1,200 h / ₹36 L.', terms: 'Invoiced monthly in arrears; payable Net 30.' }),
    con(SRV.con2, 'CON/26-27/0002', '2026-03-25', IDS.cMetro, 'Metro Line 3 bracket engineering — fixed price', 'Fixed price', 1800000, '2026-04-01', '2026-12-31', SRV.prj042, 'Active', { serviceItemId: SRV.itemImpl, progress: [{ period: '2026-04', pct: 10, note: 'Design basis approved' }, { period: '2026-05', pct: 20 }, { period: '2026-06', pct: 30, note: 'Detailed drawings issued' }, { period: '2026-07', pct: 45, note: 'Prototype jig fabricated' }, { period: '2026-08', pct: 55 }], notes: 'Fixed fee ₹18 L in four instalments; revenue by % complete.' }),
    con(SRV.con3, 'CON/26-27/0003', '2026-04-28', IDS.cUSTech, 'Data platform build — milestone (USD)', 'Milestone', 60000, '2026-05-01', '2026-12-31', SRV.prj060, 'Active', { rateCardId: SRV.rcUsd, serviceItemId: SRV.itemDev, notes: 'Four milestones, USD 60,000. Export of services — zero-rated under LUT.' }),
    con(SRV.con4, 'CON/26-27/0004', '2026-07-24', IDS.cDelta, 'Managed application support — monthly', 'Recurring', 150000, '2026-08-01', '2027-07-31', SRV.prj061, 'Active', { serviceItemId: SRV.itemSupport, recurrence: { amount: 150000, frequency: 'Monthly', nextBillDate: '2026-09-01', endDate: '2027-07-31' }, lastRecurringPeriod: '2026-08', notes: 'Monthly fee billed on the 1st; straight-line recognition.' }),
    con(SRV.con5, 'CON/26-27/0005', '2026-05-30', IDS.cKiran, 'API gateway — usage billed', 'Usage', 0, '2026-06-01', '2027-05-31', SRV.prj062, 'Active', { serviceItemId: SRV.itemDev, usage: { metric: 'API calls', unit: 'k calls', unitRate: 120, tiers: [{ upTo: 50, rate: 120 }, { upTo: 200, rate: 100 }] }, notes: 'Per 1,000 calls; tiered pricing above 50k / 200k.' }),
    con(SRV.con6, 'CON/DRAFT', '2026-09-10', IDS.cSunrise, 'Plant automation advisory — cost plus', 'Cost plus', 0, '2026-10-01', '2027-03-31', undefined, 'Draft', { markupPct: 25, rateCardId: SRV.rcStd, notes: 'Draft SOW — cost + 25% markup, pending customer sign-off.' }),
  ];

  // ── Timesheets ──
  let tsN = 18;
  const tsList: any[] = [];
  const ts = (id: string, emp: string, weekStart: string, rows: { p: string; task: string; h: number[]; billable?: boolean; inv?: string }[], status: string, extra: Record<string, unknown> = {}) => {
    const number = `TS/26-27/${String(++tsN).padStart(4, '0')}`;
    const rs = rows.map((r, i) => ({ id: `${id}_r${i + 1}`, projectId: r.p, task: r.task, hours: r.h, billable: r.billable ?? true, invoiceId: r.inv, invoiceNumber: r.inv ? INV_NO[r.inv] : undefined, invoicedAt: r.inv ? T(INV_DATE[r.inv]) : undefined }));
    const total = rs.reduce((s, r) => s + r.hours.reduce((a, b) => a + b, 0), 0);
    const billable = rs.filter((r) => r.billable).reduce((s, r) => s + r.hours.reduce((a, b) => a + b, 0), 0);
    const sub = status !== 'Draft';
    const appr = status === 'Approved' || status === 'Invoiced';
    const mgr = rows[0].p === SRV.prj060 ? 'Rahul Kumar' : rows[0].p === SRV.prj061 ? 'Anita Rao' : rows[0].p === SRV.prj062 ? 'Priya Mehta' : 'Vikram Singh';
    const t = rec<any>(id, { companyId: CO, number, docType: 'Timesheet', employeeId: emp, employeeName: EMP_NAME[emp], weekStart, rows: rs, totalHours: total, billableHours: billable, status, branchId: IDS.brHO, source: 'Web', correlationId: `corr_${id.toUpperCase()}`, submittedAt: sub ? T(addDays(weekStart, 4), '18:00') : undefined, submittedBy: sub ? EMP_NAME[emp] : undefined, approvedAt: appr ? T(addDays(weekStart, 7), '09:30') : undefined, approvedBy: appr ? mgr : undefined, invoicedInvoiceId: status === 'Invoiced' ? rows.find((r) => r.inv)?.inv : undefined, invoicedAt: status === 'Invoiced' ? T(INV_DATE[rows.find((r) => r.inv)!.inv!]) : undefined, createdAt: T(weekStart, '09:00'), updatedAt: T(addDays(weekStart, 4), '18:00'), createdBy: EMP_NAME[emp], ...extra });
    tsList.push(t);
    return t;
  };
  const INV_NO: Record<string, string> = { [SRV.inv1]: 'INV/26-27/0094', [SRV.inv2]: 'INV/26-27/0100', [SRV.inv3]: 'INV/26-27/0087', [SRV.inv4]: 'INV/26-27/0106', [SRV.inv5]: 'INV/26-27/0091' };
  const INV_DATE: Record<string, string> = { [SRV.inv1]: '2026-08-05', [SRV.inv2]: '2026-09-03', [SRV.inv3]: '2026-05-15', [SRV.inv4]: '2026-08-03', [SRV.inv5]: '2026-06-02' };
  const P = SRV.prj051, M = SRV.prj042, U = SRV.prj060;
  ts('ts_0019', IDS.eVikram, '2026-07-20', [{ p: M, task: 'Bracket design review', h: [8, 8, 8, 8, 8, 0, 0], billable: false }], 'Approved');
  ts('ts_0020', IDS.ePriya, '2026-07-06', [{ p: P, task: 'Requirements workshops', h: [8, 8, 8, 8, 0, 0, 0], inv: SRV.inv1 }], 'Invoiced');
  ts('ts_0021', IDS.ePriya, '2026-07-13', [{ p: P, task: 'Process mapping — O2C', h: [8, 8, 8, 8, 4, 0, 0], inv: SRV.inv1 }], 'Invoiced');
  ts('ts_0022', IDS.eAnil, '2026-07-13', [{ p: P, task: 'Data migration prep', h: [8, 8, 8, 8, 8, 0, 0], inv: SRV.inv1 }], 'Invoiced');
  ts('ts_0023', IDS.ePriya, '2026-07-20', [{ p: P, task: 'Process mapping — P2P', h: [8, 8, 6, 8, 0, 0, 0], inv: SRV.inv1 }], 'Invoiced');
  ts('ts_0024', IDS.ePriya, '2026-07-27', [{ p: P, task: 'Fit-gap analysis', h: [8, 8, 8, 6, 4, 0, 0], inv: SRV.inv1 }], 'Invoiced');
  ts('ts_0025', IDS.eAnil, '2026-07-27', [{ p: P, task: 'Master data cleansing', h: [8, 8, 8, 8, 6, 0, 0], inv: SRV.inv1 }], 'Invoiced');
  ts('ts_0026', IDS.eVikram, '2026-08-03', [{ p: U, task: 'Platform architecture', h: [4, 4, 4, 4, 4, 0, 0], billable: false }, { p: M, task: 'Design review', h: [4, 4, 0, 0, 0, 0, 0], billable: false }], 'Approved');
  ts('ts_0027', IDS.ePriya, '2026-08-03', [{ p: P, task: 'Solution design workshops', h: [8, 8, 8, 8, 4, 0, 0], inv: SRV.inv2 }], 'Invoiced');
  ts('ts_0028', IDS.ePriya, '2026-08-10', [{ p: P, task: 'Configuration review', h: [8, 8, 8, 8, 6, 0, 0], inv: SRV.inv2 }], 'Invoiced');
  ts('ts_0029', IDS.eAnita, '2026-08-10', [{ p: P, task: 'UAT scripts', h: [8, 8, 8, 0, 0, 0, 0], inv: SRV.inv2 }], 'Invoiced');
  ts('ts_0030', IDS.ePriya, '2026-08-17', [{ p: P, task: 'UAT support', h: [8, 8, 8, 8, 0, 0, 0], inv: SRV.inv2 }], 'Invoiced');
  ts('ts_0031', IDS.eSuresh, '2026-08-17', [{ p: M, task: 'Bracket jig fabrication', h: [8, 8, 8, 8, 8, 0, 0], billable: false }], 'Approved');
  ts('ts_0032', IDS.ePriya, '2026-08-24', [{ p: P, task: 'UAT defect triage', h: [8, 8, 6, 8, 0, 0, 0] }], 'Approved');
  ts('ts_0033', IDS.eAnita, '2026-08-24', [{ p: P, task: 'UAT support', h: [8, 4, 8, 0, 0, 0, 0], inv: SRV.inv2 }], 'Invoiced');
  ts('ts_0034', IDS.eSuresh, '2026-08-24', [{ p: M, task: 'Prototype testing', h: [8, 8, 8, 8, 8, 0, 0], billable: false }], 'Approved');
  ts('ts_0035', IDS.ePriya, '2026-08-31', [{ p: P, task: 'Cut-over planning', h: [8, 8, 8, 8, 2, 0, 0] }], 'Approved');
  ts('ts_0036', IDS.eAnil, '2026-08-31', [{ p: P, task: 'Migration dry-run', h: [8, 8, 8, 8, 4, 0, 0] }], 'Approved');
  ts('ts_0037', IDS.ePriya, '2026-09-07', [{ p: P, task: 'Cut-over rehearsal', h: [8, 8, 8, 8, 0, 0, 0] }], 'Submitted', { approvalId: 'apr_ts_0037' });
  ts('ts_0038', IDS.eAnita, '2026-09-07', [{ p: U, task: 'Data model review', h: [6, 6, 6, 0, 0, 0, 0] }, { p: SRV.prj061, task: 'Support tickets', h: [2, 2, 2, 0, 0, 0, 0] }], 'Submitted', { approvalId: 'apr_ts_0038' });
  ts('ts_0039', IDS.eAnil, '2026-09-07', [{ p: P, task: 'Migration scripts', h: [8, 8, 0, 0, 0, 0, 0] }], 'Draft');
  ts('ts_0040', IDS.eRahul, '2026-09-07', [{ p: U, task: 'Steering committee', h: [2, 0, 2, 0, 2, 0, 0], billable: false }], 'Draft');

  const approvals: ApprovalRequest[] = [
    rec<ApprovalRequest>('apr_ts_0037', { companyId: CO, docType: 'Timesheet', collection: C.timesheets, docId: 'ts_0037', docNumber: 'TS/26-27/0037', amount: 96000, currency: 'INR', branchId: IDS.brHO, requesterId: IDS.uPriya, requesterName: 'Priya Mehta', ruleId: 'wf_ts', ruleName: 'Timesheet Approval', ruleVersion: 2, steps: [{ order: 1, name: 'Project manager', approverType: 'User', approverRef: IDS.uVikram, approverLabel: 'Vikram Singh (Project Manager)', status: 'Pending', commentRequired: false, dueAt: '2026-09-13T18:00:00.000Z' }], currentStep: 1, status: 'Pending', submittedAt: '2026-09-11T18:00:00.000Z', history: [{ at: '2026-09-11T18:00:00.000Z', by: 'Priya Mehta', action: 'Submitted for approval' }], summary: 'Priya Mehta · week of 2026-09-07 · 32 h (32 billable)' }),
    rec<ApprovalRequest>('apr_ts_0038', { companyId: CO, docType: 'Timesheet', collection: C.timesheets, docId: 'ts_0038', docNumber: 'TS/26-27/0038', amount: 60000, currency: 'INR', branchId: IDS.brHO, requesterId: IDS.uAnita, requesterName: 'Anita Rao', ruleId: 'wf_ts', ruleName: 'Timesheet Approval', ruleVersion: 2, steps: [{ order: 1, name: 'Project manager', approverType: 'User', approverRef: IDS.uRahul, approverLabel: 'Rahul Kumar (Project Manager)', status: 'Pending', commentRequired: false, dueAt: '2026-09-13T18:00:00.000Z' }], currentStep: 1, status: 'Pending', submittedAt: '2026-09-11T18:05:00.000Z', history: [{ at: '2026-09-11T18:05:00.000Z', by: 'Anita Rao', action: 'Submitted for approval' }], summary: 'Anita Rao · week of 2026-09-07 · 24 h (24 billable)' }),
    rec<ApprovalRequest>('apr_ts_0032', { companyId: CO, docType: 'Timesheet', collection: C.timesheets, docId: 'ts_0032', docNumber: 'TS/26-27/0032', amount: 90000, currency: 'INR', branchId: IDS.brHO, requesterId: IDS.uPriya, requesterName: 'Priya Mehta', ruleId: 'wf_ts', ruleName: 'Timesheet Approval', ruleVersion: 2, steps: [{ order: 1, name: 'Project manager', approverType: 'User', approverRef: IDS.uVikram, approverLabel: 'Vikram Singh (Project Manager)', status: 'Approved', actedBy: 'Vikram Singh', actedById: IDS.uVikram, actedAt: '2026-08-31T09:30:00.000Z', commentRequired: false, dueAt: '2026-08-30T18:00:00.000Z' }], currentStep: 1, status: 'Approved', submittedAt: '2026-08-28T18:00:00.000Z', completedAt: '2026-08-31T09:30:00.000Z', history: [{ at: '2026-08-28T18:00:00.000Z', by: 'Priya Mehta', action: 'Submitted for approval' }, { at: '2026-08-31T09:30:00.000Z', by: 'Vikram Singh', action: 'Approved at step 1', step: 1 }], summary: 'Priya Mehta · week of 2026-08-24 · 30 h (30 billable)' }),
  ];
  tsList.find((t) => t.id === 'ts_0032').approvalId = 'apr_ts_0032';

  // ── Milestones / instalments ──
  const ms = (id: string, contractId: string, projectId: string, kind: string, order: number, name: string, amount: number, due: string, status: string, extra: Record<string, unknown> = {}) => rec<any>(id, { companyId: CO, contractId, projectId, kind, order, name, amount, due, status, ...extra });
  const milestones = [
    ms('ms_002_1', SRV.con2, SRV.prj042, 'Instalment', 1, 'Instalment 1 — mobilisation (25%)', 450000, '2026-04-30', 'Invoiced', { invoiceId: SRV.inv3, invoiceNumber: INV_NO[SRV.inv3], invoicedAt: T('2026-05-15') }),
    ms('ms_002_2', SRV.con2, SRV.prj042, 'Instalment', 2, 'Instalment 2 — detailed design (25%)', 450000, '2026-06-30', 'Pending'),
    ms('ms_002_3', SRV.con2, SRV.prj042, 'Instalment', 3, 'Instalment 3 — prototype approval (25%)', 450000, '2026-09-30', 'Pending'),
    ms('ms_002_4', SRV.con2, SRV.prj042, 'Instalment', 4, 'Instalment 4 — handover (25%)', 450000, '2026-12-31', 'Pending'),
    ms('ms_003_1', SRV.con3, SRV.prj060, 'Milestone', 1, 'M1 — Discovery & architecture', 12000, '2026-05-31', 'Invoiced', { achievedAt: '2026-05-28', achievedBy: 'Rahul Kumar', deliverable: 'Architecture blueprint signed off', invoiceId: SRV.inv5, invoiceNumber: INV_NO[SRV.inv5], invoicedAt: T('2026-06-02') }),
    ms('ms_003_2', SRV.con3, SRV.prj060, 'Milestone', 2, 'M2 — Data model & ingestion', 15000, '2026-07-31', 'Achieved', { achievedAt: '2026-08-04', achievedBy: 'Vikram Singh', deliverable: 'Ingestion pipelines live in staging' }),
    ms('ms_003_3', SRV.con3, SRV.prj060, 'Milestone', 3, 'M3 — Pipeline build & QA', 18000, '2026-10-15', 'Pending'),
    ms('ms_003_4', SRV.con3, SRV.prj060, 'Milestone', 4, 'M4 — Go-live & hypercare', 15000, '2026-12-15', 'Pending'),
  ];

  const usage = (id: string, period: string, qty: number, rate: number, invoiced = false) => rec<any>(id, { companyId: CO, contractId: SRV.con5, metric: 'API calls', qty, rate, amount: round(qty * rate), period, date: `${period}-28`, invoiced, source: 'Import', notes: 'Gateway metering export' });
  const usageRecords = [usage('usg_001', '2026-06', 38.5, 120), usage('usg_002', '2026-07', 61.2, 100), usage('usg_003', '2026-08', 74.9, 100), rec<any>('usg_004', { companyId: CO, contractId: SRV.con5, metric: 'API calls', qty: 22.4, rate: 120, amount: 2688, period: '2026-09', date: '2026-09-12', invoiced: false, source: 'Web', notes: 'Month-to-date' })];

  const billableExpenses = [rec<any>('bex_001', { companyId: CO, claimId: 'exp_0022', claimNumber: 'EXP/26-27/0022', lineId: 'el_22_1', employeeId: IDS.eVikram, employeeName: 'Vikram Singh', projectId: SRV.prj051, contractId: SRV.con1, date: '2026-09-09', description: 'Client visit — Pune (fuel + tolls)', amount: 8400, markupPct: 10, billAmount: 9240, status: 'Ready', approvedBy: 'Rahul Kumar' })];

  // ── Invoices (posted) generated by the billing runs ──
  const hoursOf = (emp: string, weeks: string[]) => tsList.filter((t) => t.employeeId === emp && weeks.includes(t.weekStart)).reduce((s, t) => s + t.rows.filter((r: any) => r.projectId === P).reduce((a: number, r: any) => a + r.hours.reduce((x: number, y: number) => x + y, 0), 0), 0);
  const invoices: any[] = [];
  const journals: Journal[] = [];
  const openItems: OpenItem[] = [];
  const mkInvoice = (id: string, date: string, custId: string, contractId: string, period: string, specs: LineSpec[], o: { currency?: string; rate?: number; paid?: number; retainer?: string; sources: number }) => {
    const c = CUST[custId];
    const contract = contracts.find((x) => x.id === contractId)!;
    const rate = o.rate ?? 1;
    const built = buildInvoiceLines(custId, specs, rate);
    const paid = o.paid ?? 0;
    const totals = { ...built.totals, paid, due: round(built.totals.total - paid) };
    const due = addDays(date, c.terms === 'Net 45' ? 45 : 30);
    const number = INV_NO[id];
    const inv = rec<any>(id, { companyId: CO, number, docType: 'Sales Invoice', date, dueDate: due, branchId: IDS.brHO, status: 'Posted', currency: o.currency ?? 'INR', rate, rateType: rate === 1 ? 'Same' : 'Spot', rateSource: rate === 1 ? '—' : 'RBI reference', partyType: 'Customer', partyId: custId, partyName: c.name, partySnapshot: snapshot(custId), reference: `${contract.number} · ${period}`, sourceType: 'Contract', sourceId: contractId, sourceNumber: contract.number, lines: built.lines, totals, paymentTerms: c.terms, placeOfSupply: c.state, placeOfSupplyCode: c.stateCode, dimensions: contract.dimensions, fy: '2026-27', period: date.slice(0, 7), correlationId: `corr_${id.toUpperCase()}`, charges: [], roundTotal: true, notes: `Generated by billing run for ${period} · contract ${contract.number} (${contract.billingMethod}) · ${o.sources} source(s)${o.retainer ? `\nRetainer applied: ₹${paid.toLocaleString('en-IN')} (${o.retainer}) — settled against the receivable on posting.` : ''}`, retainerApplied: paid || undefined, journalId: `jv_${id}`, journalNumber: undefined, openItemId: `oi_${id}`, postedAt: T(date, '11:30'), postedBy: 'Rahul Kumar', statutory: { eInvoiceStatus: c.gstin ? 'Pending' : 'Not Applicable', ewbStatus: 'Not Applicable' }, templateId: IDS.tplInvoice, templateVersion: 3, createdAt: T(date, '10:30'), updatedAt: T(date, '11:30'), createdBy: 'Rahul Kumar' });
    const t = totals;
    const dimId = contract.dimensions?.Project;
    const j = journal(`jv_${id}`, date, [
      { accountId: ACC.ar, dr: t.total, partyId: custId, partyName: c.name, narration: `Invoice ${number}` },
      { accountId: ACC.serviceRev, cr: t.taxable, dim: dimId },
      ...Object.entries(t.components).map(([k, v]) => ({ accountId: k === 'CGST' ? ACC.cgst : k === 'SGST' ? ACC.sgst : ACC.igst, cr: v, taxComponent: k })),
      ...(t.roundOff > 0 ? [{ accountId: ACC.roundOff, cr: t.roundOff }] : t.roundOff < 0 ? [{ accountId: ACC.roundOff, dr: -t.roundOff }] : []),
    ], { sourceType: 'Sales Invoice', sourceId: id, sourceNumber: number, narration: `Sales invoice ${number} · ${c.name}`, currency: o.currency, rate, idempotencyKey: `inv:${id}:post` });
    inv.journalNumber = j.number;
    journals.push(j);
    openItems.push(rec<OpenItem>(`oi_${id}`, { companyId: CO, partyType: 'Customer', partyId: custId, partyName: c.name, docType: 'Sales Invoice', docId: id, docNumber: number, date, dueDate: due, currency: o.currency ?? 'INR', originalAmount: t.total, baseAmount: round(t.total * rate), rate, outstanding: round(t.total - paid), baseOutstanding: round((t.total - paid) * rate), direction: 'Debit', status: paid > 0 ? 'Partially Settled' : 'Open', settlements: paid > 0 ? [{ id: `stl_${id}_ret`, date, docType: 'Retainer', docId: SRV.ret1, docNumber: 'RET/26-27/0001', amount: paid, baseAmount: paid, rate: 1, fxGainLoss: 0 }] : [], branchId: IDS.brHO }));
    invoices.push(inv);
    return inv;
  };
  const julPriya = hoursOf(IDS.ePriya, ['2026-07-06', '2026-07-13', '2026-07-20', '2026-07-27']);
  const julAnil = hoursOf(IDS.eAnil, ['2026-07-13', '2026-07-27']);
  const augPriya = hoursOf(IDS.ePriya, ['2026-08-03', '2026-08-10', '2026-08-17']);
  const augAnita = hoursOf(IDS.eAnita, ['2026-08-10', '2026-08-24']);
  const consultSpec = (name: string, qty: number, rate: number, desc: string): LineSpec => ({ itemId: IDS.iConsult, name, qty, rate, uom: 'Hr', desc, hsn: '998311', dim: IDS.dimPrj051 });
  mkInvoice(SRV.inv3, '2026-05-15', IDS.cMetro, SRV.con2, '2026-04', [{ itemId: SRV.itemImpl, name: 'Metro Line 3 bracket engineering — Instalment 1 — mobilisation (25%)', qty: 1, rate: 450000, uom: 'Nos', desc: 'Fixed price instalment · due 2026-04-30', hsn: '998313', dim: IDS.dimPrj042 }], { sources: 1 });
  mkInvoice(SRV.inv5, '2026-06-02', IDS.cUSTech, SRV.con3, '2026-05', [{ itemId: SRV.itemDev, name: 'Milestone — M1 — Discovery & architecture', qty: 1, rate: 12000, uom: 'Nos', desc: 'Data platform build · achieved 2026-05-28', hsn: '998314', dim: SRV.dim060 }], { currency: 'USD', rate: 83.9, sources: 1 });
  mkInvoice(SRV.inv4, '2026-08-03', IDS.cDelta, SRV.con4, '2026-08', [{ itemId: SRV.itemSupport, name: 'Managed application support — monthly fee', qty: 1, rate: 150000, uom: 'Month', desc: 'Period from 2026-08-01 · next bill 2026-09-01', hsn: '998313', dim: SRV.dim061 }], { sources: 1 });
  mkInvoice(SRV.inv1, '2026-08-05', IDS.cGlobalTech, SRV.con1, '2026-07', [consultSpec('Professional services — Priya Mehta (Business analyst)', julPriya, 3000, `${julPriya} h approved to 2026-07-31`), consultSpec('Professional services — Anil Patil (Junior consultant)', julAnil, 1800, `${julAnil} h approved to 2026-07-31`)], { paid: 200000, retainer: 'RET/26-27/0001', sources: 6 });
  mkInvoice(SRV.inv2, '2026-09-03', IDS.cGlobalTech, SRV.con1, '2026-08', [consultSpec('Professional services — Priya Mehta (Business analyst)', augPriya, 3000, `${augPriya} h approved to 2026-08-31`), consultSpec('Professional services — Anita Rao (Consultant)', augAnita, 2500, `${augAnita} h approved to 2026-08-31`)], { sources: 5 });

  const invById = (id: string) => invoices.find((i) => i.id === id)!;
  const result = (id: string, sources: number, retainerApplied?: number) => { const i = invById(id); const con = contracts.find((c) => c.id === i.sourceId)!; return { contractId: con.id, contractNumber: con.number, customerId: i.partyId, customerName: i.partyName, method: con.billingMethod, currency: i.currency, amount: i.totals.total, taxable: i.totals.taxable, invoiceId: i.id, invoiceNumber: i.number, retainerApplied, sources }; };
  const billingRuns = [
    rec<any>('brun_001', { companyId: CO, number: 'BR/26-27/0001', period: '2026-07', from: '2026-07-01', to: '2026-07-31', date: '2026-08-05', contractIds: [SRV.con1, SRV.con2, SRV.con3, SRV.con5], results: [result(SRV.inv1, 6, 200000), { contractId: SRV.con2, contractNumber: 'CON/26-27/0002', customerId: IDS.cMetro, customerName: 'Metro Distributors', method: 'Fixed price', currency: 'INR', amount: 0, taxable: 0, skipped: 'Instalment 2 on hold pending design sign-off (excluded by user)', sources: 0 }, { contractId: SRV.con3, contractNumber: 'CON/26-27/0003', customerId: IDS.cUSTech, customerName: 'US Tech Imports Inc.', method: 'Milestone', currency: 'USD', amount: 0, taxable: 0, skipped: 'Nothing to bill for this period', sources: 0 }, { contractId: SRV.con5, contractNumber: 'CON/26-27/0005', customerId: IDS.cKiran, customerName: 'Kiran Tech Pvt Ltd', method: 'Usage', currency: 'INR', amount: 0, taxable: 0, skipped: 'Usage held — customer disputing June metering', sources: 0 }], invoiceIds: [SRV.inv1], status: 'Generated', by: 'Rahul Kumar', applyRetainer: true, branchId: IDS.brHO, createdAt: T('2026-08-05', '10:30'), updatedAt: T('2026-08-05', '10:30') }),
    rec<any>('brun_002', { companyId: CO, number: 'BR/26-27/0002', period: '2026-08', from: '2026-08-01', to: '2026-08-31', date: '2026-09-03', contractIds: [SRV.con1, SRV.con4], results: [result(SRV.inv2, 5), { ...result(SRV.inv4, 1), skipped: undefined }], invoiceIds: [SRV.inv2, SRV.inv4], status: 'Generated', by: 'Rahul Kumar', applyRetainer: true, branchId: IDS.brHO, notes: 'Delta Aug fee generated earlier on 3 Aug and posted; run re-attached for traceability', createdAt: T('2026-09-03', '10:30'), updatedAt: T('2026-09-03', '10:30') }),
  ];

  // ── Retainers ──
  const jRet1 = journal('jv_ret_001', '2026-04-03', [{ accountId: ACC.hdfc, dr: 500000, narration: 'NEFT GTS/ADV/0403' }, { accountId: ACC.retainers, cr: 500000, partyId: IDS.cGlobalTech, partyName: 'Global Tech Solutions', narration: 'Retainer / advance' }], { sourceType: 'Retainer', sourceId: SRV.ret1, sourceNumber: 'RET/26-27/0001', narration: 'Retainer received from Global Tech Solutions · NEFT GTS/ADV/0403', idempotencyKey: `ret:${SRV.ret1}:post` });
  const jRet1a = journal('jv_ret_001_alloc_1', '2026-08-05', [{ accountId: ACC.retainers, dr: 200000, partyId: IDS.cGlobalTech, partyName: 'Global Tech Solutions' }, { accountId: ACC.ar, cr: 200000, partyId: IDS.cGlobalTech, partyName: 'Global Tech Solutions', narration: INV_NO[SRV.inv1] }], { sourceType: 'Retainer Allocation', sourceId: SRV.ret1, sourceNumber: 'RET/26-27/0001', narration: `Retainer RET/26-27/0001 applied to ${INV_NO[SRV.inv1]} · Global Tech Solutions`, idempotencyKey: `ret:${SRV.ret1}:alloc:${SRV.inv1}:ra_seed_1` });
  const jRet2 = journal('jv_ret_002', '2026-07-10', [{ accountId: ACC.hdfc, dr: 10000, narration: 'SWIFT USTI-0710' }, { accountId: ACC.retainers, cr: 10000, partyId: IDS.cUSTech, partyName: 'US Tech Imports Inc.', narration: 'Advance against M3/M4' }], { sourceType: 'Retainer', sourceId: SRV.ret2, sourceNumber: 'RET/26-27/0002', narration: 'Retainer received from US Tech Imports Inc. · SWIFT USTI-0710', currency: 'USD', rate: 83.9, idempotencyKey: `ret:${SRV.ret2}:post` });
  journals.push(jRet1, jRet1a, jRet2);
  const retainers = [
    rec<any>(SRV.ret1, { companyId: CO, number: 'RET/26-27/0001', customerId: IDS.cGlobalTech, customerName: 'Global Tech Solutions', contractId: SRV.con1, amount: 500000, currency: 'INR', rate: 1, baseAmount: 500000, receivedDate: '2026-04-03', bankAccountId: ACC.hdfc, reference: 'NEFT GTS/ADV/0403', notes: 'Advance against ERP advisory engagement', journalId: jRet1.id, journalNumber: jRet1.number, openItemId: 'oi_ret_001', allocations: [{ id: 'ra_seed_1', invoiceId: SRV.inv1, invoiceNumber: INV_NO[SRV.inv1], amount: 200000, date: '2026-08-05', journalId: jRet1a.id, journalNumber: jRet1a.number, status: 'Settled' }], allocated: 200000, remaining: 300000, status: 'Open', branchId: IDS.brHO, createdAt: T('2026-04-03'), updatedAt: T('2026-08-05') }),
    rec<any>(SRV.ret2, { companyId: CO, number: 'RET/26-27/0002', customerId: IDS.cUSTech, customerName: 'US Tech Imports Inc.', contractId: SRV.con3, amount: 10000, currency: 'USD', rate: 83.9, baseAmount: 839000, receivedDate: '2026-07-10', bankAccountId: ACC.hdfc, reference: 'SWIFT USTI-0710', notes: 'Advance against milestones M3/M4', journalId: jRet2.id, journalNumber: jRet2.number, openItemId: 'oi_ret_002', allocations: [], allocated: 0, remaining: 10000, status: 'Open', branchId: IDS.brHO, createdAt: T('2026-07-10'), updatedAt: T('2026-07-10') }),
  ];
  openItems.push(
    rec<OpenItem>('oi_ret_001', { companyId: CO, partyType: 'Customer', partyId: IDS.cGlobalTech, partyName: 'Global Tech Solutions', docType: 'Retainer', docId: SRV.ret1, docNumber: 'RET/26-27/0001', date: '2026-04-03', dueDate: '2026-04-03', currency: 'INR', originalAmount: 500000, baseAmount: 500000, rate: 1, outstanding: 300000, baseOutstanding: 300000, direction: 'Credit', status: 'Partially Settled', settlements: [{ id: 'stl_ret_001_1', date: '2026-08-05', docType: 'Sales Invoice', docId: SRV.inv1, docNumber: INV_NO[SRV.inv1], amount: 200000, baseAmount: 200000, rate: 1, fxGainLoss: 0 }], branchId: IDS.brHO }),
    rec<OpenItem>('oi_ret_002', { companyId: CO, partyType: 'Customer', partyId: IDS.cUSTech, partyName: 'US Tech Imports Inc.', docType: 'Retainer', docId: SRV.ret2, docNumber: 'RET/26-27/0002', date: '2026-07-10', dueDate: '2026-07-10', currency: 'USD', originalAmount: 10000, baseAmount: 839000, rate: 83.9, outstanding: 10000, baseOutstanding: 839000, direction: 'Credit', status: 'Open', settlements: [], branchId: IDS.brHO }),
  );

  // ── Revenue schedules Apr–Aug (cumulative adjustment with auto-reversal next period) ──
  const FX_END: Record<string, number> = { '2026-05': 83.65, '2026-06': 83.9, '2026-07': 84.0, '2026-08': 84.1 };
  const hoursIn = (period: string) => { // billable approved/invoiced hours on prj_051 by employee within the period
    const out: Record<string, number> = {};
    tsList.filter((t) => t.status === 'Approved' || t.status === 'Invoiced').forEach((t) => t.rows.forEach((r: any) => { if (r.projectId !== P || !r.billable) return; r.hours.forEach((h: number, i: number) => { const d = addDays(t.weekStart, i); if (h > 0 && d.slice(0, 7) === period) out[t.employeeId] = (out[t.employeeId] ?? 0) + h; }); }));
    return out;
  };
  const recon1 = (period: string) => round(Object.entries(hoursIn(period)).reduce((s, [e, h]) => s + h * RATES[e], 0));
  const billedIn = (contractId: string, period: string) => round(invoices.filter((i) => i.sourceId === contractId && i.period === period).reduce((s, i) => s + i.totals.taxable * i.rate, 0));
  const PROG: Record<string, number> = { '2026-04': 10, '2026-05': 20, '2026-06': 30, '2026-07': 45, '2026-08': 55 };
  const recog: Record<string, (p: string) => number> = {
    [SRV.con1]: recon1,
    [SRV.con2]: (p) => { const keys = Object.keys(PROG).sort(); const i = keys.indexOf(p); return i < 0 ? 0 : round(1800000 * (PROG[p] - (i > 0 ? PROG[keys[i - 1]] : 0)) / 100); },
    [SRV.con3]: (p) => round(milestones.filter((m) => m.contractId === SRV.con3 && m.achievedAt && m.achievedAt.slice(0, 7) === p).reduce((s, m) => s + m.amount, 0) * (FX_END[p] ?? 84.1)),
    [SRV.con4]: (p) => (p >= '2026-08' ? 150000 : 0),
  };
  const START: Record<string, string> = { [SRV.con1]: '2026-07', [SRV.con2]: '2026-04', [SRV.con3]: '2026-05', [SRV.con4]: '2026-08' };
  const PERIODS = ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08'];
  const lastDay = (p: string) => { const [y, m] = p.split('-').map(Number); return `${p}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`; };
  const schedules: any[] = [];
  [SRV.con1, SRV.con2, SRV.con3, SRV.con4].forEach((cid) => {
    const c = contracts.find((x) => x.id === cid)!;
    let cumB = 0, cumR = 0, prev: any = null;
    PERIODS.filter((p) => p >= START[cid]).forEach((p) => {
      const billed = billedIn(cid, p);
      const recognized = recog[cid](p);
      cumB = round(cumB + billed); cumR = round(cumR + recognized);
      const net = round(cumR - cumB);
      const type = net > 0.005 ? 'Accrual' : net < -0.005 ? 'Deferral' : 'None';
      const adj = Math.abs(net);
      let reversalJ: Journal | undefined;
      let reversed = 0;
      if (prev?.journalId) {
        const pj = journals.find((j) => j.id === prev.journalId)!;
        reversalJ = journal(`${pj.id}_rev`, `${p}-01`, pj.lines.map((l) => ({ accountId: l.accountId, dr: l.cr, cr: l.dr, partyId: l.partyId, partyName: l.partyName, dim: l.dimensions.Project })), { sourceType: pj.sourceType, sourceId: pj.sourceId ?? cid, sourceNumber: pj.sourceNumber ?? c.number, narration: `Reversal of ${pj.number}: Auto-reversal of ${prev.period} revenue adjustment at start of ${p}`, type: 'Reversal', reversalOfId: pj.id, reversalReason: `Auto-reversal at start of ${p}` });
        pj.status = 'Reversed'; pj.reversedById = reversalJ.id; pj.reversalReason = reversalJ.reversalReason;
        journals.push(reversalJ);
        reversed = prev.adjustment;
      }
      let j: Journal | undefined;
      const dim = c.dimensions?.Project;
      if (type === 'Accrual') j = journal(`jv_rev_${cid}_${p}`, lastDay(p), [{ accountId: ACC.unbilled, dr: adj, partyId: c.customerId, partyName: c.partyName, dim }, { accountId: ACC.serviceRev, cr: adj, dim }], { sourceType: 'Revenue Recognition', sourceId: cid, sourceNumber: c.number, narration: `Unbilled revenue accrual · ${c.number} ${c.title} · ${p} (recognised ₹${cumR.toLocaleString('en-IN')} vs billed ₹${cumB.toLocaleString('en-IN')})`, idempotencyKey: `rev:${cid}:${p}` });
      else if (type === 'Deferral') j = journal(`jv_rev_${cid}_${p}`, lastDay(p), [{ accountId: ACC.serviceRev, dr: adj, dim }, { accountId: ACC.deferred, cr: adj, partyId: c.customerId, partyName: c.partyName, dim }], { sourceType: 'Revenue Recognition', sourceId: cid, sourceNumber: c.number, narration: `Deferred revenue · ${c.number} ${c.title} · ${p} (billed ₹${cumB.toLocaleString('en-IN')} vs recognised ₹${cumR.toLocaleString('en-IN')})`, idempotencyKey: `rev:${cid}:${p}` });
      if (j) journals.push(j);
      const row = rec<any>(`rs_${cid}_${p}`, { companyId: CO, contractId: cid, contractNumber: c.number, projectId: c.projectId, customerId: c.customerId, period: p, method: c.billingMethod, billed, recognized, cumBilled: cumB, cumRecognized: cumR, unbilled: net > 0 ? net : 0, deferred: net < 0 ? -net : 0, reversed, journalId: j?.id, journalNumber: j?.number, adjustmentType: type, adjustment: adj, reversalJournalId: reversalJ?.id, reversalJournalNumber: reversalJ?.number, status: 'Posted', runAt: T(addDays(lastDay(p), 3), '09:00'), runBy: 'Rahul Kumar', idempotencyKey: `rev:${cid}:${p}`, createdAt: T(addDays(lastDay(p), 3), '09:00'), updatedAt: T(addDays(lastDay(p), 3), '09:00') });
      schedules.push(row);
      prev = row;
    });
  });

  const numberSeries: NumberSeries[] = [
    rec<NumberSeries>('ns_billing_run', { companyId: CO, docType: 'Billing Run', fy: 'ALL', prefix: 'BR/26-27/', suffix: '', padding: 4, next: 3, resetRule: 'Never', allocation: 'On save', status: 'Active', voids: [] }),
    rec<NumberSeries>('ns_retainer', { companyId: CO, docType: 'Retainer', fy: 'ALL', prefix: 'RET/26-27/', suffix: '', padding: 4, next: 3, resetRule: 'Never', allocation: 'On post', status: 'Active', voids: [] }),
  ];

  return {
    [C.items]: items as any,
    [C.dimensions]: dimensions as any,
    [C.services]: services,
    [C.projects]: projects,
    [C.contracts]: contracts,
    [C.rateCards]: rateCards,
    [C.resources]: resources,
    [C.timesheets]: tsList,
    [C.approvals]: approvals as any,
    [C.milestones]: milestones,
    [C.usageRecords]: usageRecords,
    [C.billableExpenses]: billableExpenses,
    [C.salesInvoices]: invoices,
    [C.journals]: journals as any,
    [C.openItems]: openItems as any,
    [C.billingRuns]: billingRuns,
    [C.retainers]: retainers,
    [C.revenueSchedules]: schedules,
    [C.numberSeries]: numberSeries as any,
  };
}

export { SEED_NOW };
