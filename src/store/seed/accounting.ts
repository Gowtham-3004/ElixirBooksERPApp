// Seed data for the accounting module. Owned by the accounting module; add collections here.
// Reference fixed IDs from ./core (IDS) so cross-module links stay stable.
//
// Journals here are the "book-keeping" entries that no other module posts: opening
// sub-ledger balances, bank charges, interest, payroll provisions, depreciation, rent,
// utilities, loan interest accruals, a realized FX gain, manual JVs, a June revaluation
// (reversed in July) and one Submitted manual journal (jv_0045) for the approvals inbox.
// Every journal is balanced; the trial balance (opening balances + journals) reconciles.
import type { DB } from '../db';
import type { Account, Journal, JournalLine, OpenItem } from '../types';
import { C } from '../collections';
import { IDS, rec, SEED_NOW } from './core';
import type { RecurringJournal, RevaluationRun } from '../../modules/accounting/types';

const co = IDS.acme;

// Extra master rows this module needs (additive to core masters).
export const ACC_IDS = {
  accPayrollBank: 'acc_1340',
  accInterestAccrued: 'acc_2510',
  accOpeningEquity: 'acc_3900',
  accUnrealFxGain: 'acc_4920',
  accUnrealFxLoss: 'acc_5610',
  accInterestIncome: 'acc_4110',
  accUnbilled: 'acc_1160',
  accDeferred: 'acc_2400',
  accRetainers: 'acc_2160',
} as const;

type LineIn = { acc: string; dr?: number; cr?: number; partyType?: 'Customer' | 'Supplier' | 'Employee'; partyId?: string; partyName?: string; dims?: Record<string, string>; narration?: string };

const ACCOUNT_META: Record<string, { code: string; name: string }> = {};

function line(id: string, l: LineIn, i: number): JournalLine {
  const meta = ACCOUNT_META[l.acc] ?? { code: l.acc, name: l.acc };
  const dr = l.dr ?? 0;
  const cr = l.cr ?? 0;
  return { id: `${id}_l${i + 1}`, accountId: l.acc, accountCode: meta.code, accountName: meta.name, dr, cr, drBase: dr, crBase: cr, currency: 'INR', partyType: l.partyType, partyId: l.partyId, partyName: l.partyName, dimensions: { Branch: IDS.brHO, ...(l.dims ?? {}) }, narration: l.narration };
}

function journal(id: string, number: string, date: string, type: Journal['type'], sourceType: string, narration: string, lines: LineIn[], extra: Partial<Journal> = {}): Journal {
  const ls = lines.map((l, i) => line(id, l, i));
  const totalDr = Math.round(ls.reduce((s, l) => s + l.drBase, 0) * 100) / 100;
  const totalCr = Math.round(ls.reduce((s, l) => s + l.crBase, 0) * 100) / 100;
  if (Math.abs(totalDr - totalCr) > 0.011) throw new Error(`Seed journal ${id} is unbalanced: ${totalDr} vs ${totalCr}`);
  const status = extra.status ?? 'Posted';
  return rec<Journal>(id, {
    companyId: co,
    number,
    date,
    period: date.slice(0, 7),
    fy: '2026-27',
    branchId: IDS.brHO,
    currency: 'INR',
    rate: 1,
    status,
    type,
    sourceType,
    narration,
    lines: ls,
    totalDr,
    totalCr,
    postedAt: status === 'Posted' || status === 'Reversed' ? `${date}T10:00:00.000Z` : undefined,
    postedBy: status === 'Posted' || status === 'Reversed' ? 'Rahul Kumar' : undefined,
    correlationId: `corr_${id}`,
    createdAt: `${date}T09:30:00.000Z`,
    updatedAt: `${date}T10:00:00.000Z`,
    ...extra,
  });
}

export function seedAccountingMasters(): Account[] {
  const acc = (id: string, code: string, name: string, groupId: string, type: Account['type'], extra: Partial<Account> = {}): Account =>
    rec<Account>(id, { companyId: co, code, name, groupId, type, normalBalance: type === 'Asset' || type === 'Expense' ? 'Dr' : 'Cr', isControl: false, postingAllowed: true, currencyBehaviour: 'Base', requiredDimensions: [], prohibitedDimensions: [], status: 'Active', ...extra });
  return [
    acc(ACC_IDS.accPayrollBank, '1340', 'SBI Payroll Account ****4321', 'ag_ca', 'Asset', { isControl: true, controlType: 'Bank', isBank: true, openingBalance: 2600000, bankDetails: { bankName: 'State Bank of India', accountNumber: '30012345674321', ifsc: 'SBIN0001234', branch: 'Andheri East', currency: 'INR' } }),
    acc(ACC_IDS.accInterestAccrued, '2510', 'Interest Accrued on Term Loan', 'ag_ncl', 'Liability'),
    // Opening balances imported from the previous system did not fully reconcile; the
    // difference is parked here and surfaced on Accounting › Opening balances.
    acc(ACC_IDS.accOpeningEquity, '3900', 'Opening Balance Equity', 'ag_eq', 'Equity', { openingBalance: 1802179 }),
  ];
}

export function seedAccounting(): Partial<DB> {
  // account meta for line snapshots (code · name) — mirrors core.ts
  const meta: [string, string, string][] = [
    [IDS.accAR, '1100', 'Trade Receivables (AR Control)'], [IDS.accPettyCash, '1300', 'Cash — Petty Cash'], [IDS.accHDFC, '1310', 'HDFC Current Account ****1234'],
    ['acc_1330', '1330', 'HDFC EEFC Account (USD) ****9012'], [ACC_IDS.accPayrollBank, '1340', 'SBI Payroll Account ****4321'], [ACC_IDS.accUnbilled, '1160', 'Unbilled Revenue (Accrued)'],
    [IDS.accEmpAdvance, '1600', 'Employee Advances & Loans'], [IDS.accAccDep, '1510', 'Accumulated Depreciation'], [IDS.accAP, '2100', 'Trade Payables (AP Control)'],
    [IDS.accTDSPayable, '2310', 'TDS Payable'], [IDS.accPFPayable, '2320', 'PF Payable'], [IDS.accESIPayable, '2321', 'ESI Payable'], [IDS.accPTPayable, '2322', 'Professional Tax Payable'],
    [IDS.accSalaryPayable, '2330', 'Salaries Payable'], [ACC_IDS.accDeferred, '2400', 'Deferred Revenue'], [ACC_IDS.accRetainers, '2160', 'Retainers Received'], [ACC_IDS.accInterestAccrued, '2510', 'Interest Accrued on Term Loan'],
    [ACC_IDS.accInterestIncome, '4110', 'Interest Income'], [IDS.accFxGain, '4910', 'Foreign Exchange Gain'], [ACC_IDS.accUnrealFxGain, '4920', 'Unrealised FX Gain'],
    [IDS.accSalaries, '5100', 'Employee Salaries'], [IDS.accEmployerPF, '5110', 'Employer PF & ESI Contribution'], [IDS.accRent, '5200', 'Rent'], [IDS.accUtilities, '5210', 'Utilities'],
    [IDS.accDep, '5300', 'Depreciation & Amortisation'], [IDS.accBankCharges, '5400', 'Bank Charges'], [IDS.accFinance, '5410', 'Interest & Finance Costs'], [IDS.accTravel, '5500', 'Travel & Logistics'],
    [IDS.accMarketing, '5510', 'Marketing & Selling'], [IDS.accIT, '5520', 'IT & Software'], [IDS.accProfFees, '5530', 'Professional Fees'], [IDS.accMisc, '5590', 'Miscellaneous Expenses'],
    [ACC_IDS.accUnrealFxLoss, '5610', 'Unrealised FX Loss'],
  ];
  meta.forEach(([id, code, name]) => { ACCOUNT_META[id] = { code, name }; });

  const journals: Journal[] = [];
  let n = 360;
  const num = () => { if (n === 390 || n === 410) n++; return `JV/26-27/${String(n++).padStart(4, '0')}`; };

  // 1. Opening sub-ledger & accrual balances (accounts left blank in the COA opening grid)
  journals.push(journal('jv_opening', 'OB/26-27/0001', '2026-04-01', 'Opening', 'Opening Balance', 'Opening balances — accrued revenue, advances, EEFC (USD 5,000 @ 83.20), deferred revenue, retainers and March salaries', [
    { acc: ACC_IDS.accUnbilled, dr: 240000, narration: 'Unbilled services at 31 Mar 2026' },
    { acc: IDS.accEmpAdvance, dr: 85000, partyType: 'Employee', partyId: IDS.eVikram, partyName: 'Vikram Singh', narration: 'Travel advance' },
    { acc: 'acc_1330', dr: 416000, narration: 'USD 5,000.00 @ 83.20 (RBI reference, 01 Apr 2026)' },
    { acc: ACC_IDS.accDeferred, cr: 360000, narration: 'AMC billed in advance' },
    { acc: ACC_IDS.accRetainers, cr: 150000, narration: 'Global Tech advisory retainer' },
    { acc: IDS.accSalaryPayable, cr: 231000, narration: 'March 2026 net salaries' },
  ]));

  // 1b. Opening sub-ledger detail behind the AR (1100) and AP (2100) opening balances.
  //     FR-ACC-020/022 + FR-AR-005: a control account is only meaningful if its sub-ledger adds up,
  //     so every rupee of the carried-forward AR/AP balance is an invoice with a party and a due
  //     date. These rows carry no journal — the balance itself lives on the account's
  //     `openingBalance` (posting a journal too would double-count it). Due dates sit in FY 2025-26 /
  //     early FY 2026-27 so AR and AP ageing both show a genuine opening tail.
  const openingItem = (
    n: number, partyType: 'Customer' | 'Supplier', partyId: string, partyName: string,
    docNumber: string, date: string, dueDate: string, amount: number,
  ): OpenItem => rec<OpenItem>(`oi_open_${partyType === 'Customer' ? 'ar' : 'ap'}_${String(n).padStart(2, '0')}`, {
    companyId: co, partyType, partyId, partyName, docType: 'Opening', docId: `opening_${partyType === 'Customer' ? 'ar' : 'ap'}_${String(n).padStart(2, '0')}`,
    docNumber, date, dueDate, currency: 'INR', originalAmount: amount, baseAmount: amount, rate: 1,
    outstanding: amount, baseOutstanding: amount, direction: 'Debit', status: 'Open', settlements: [], branchId: IDS.brHO,
    createdAt: '2026-04-01T00:00:00.000Z', updatedAt: '2026-04-01T00:00:00.000Z',
  });
  // Trade receivables carried forward — must total exactly account 1100's opening balance ₹18,45,200.
  const openingAr: [string, string, string, string, string, number][] = [
    [IDS.cArlene, 'Arlene Traders', 'INV/25-26/0412', '2026-03-18', '2026-04-17', 412000],
    [IDS.cRajesh, 'Rajesh Enterprises', 'INV/25-26/0388', '2026-03-05', '2026-04-04', 268500],
    [IDS.cGlobalTech, 'Global Tech Solutions', 'INV/25-26/0351', '2026-02-20', '2026-04-06', 356900],
    [IDS.cSunrise, 'Sunrise Industries', 'INV/25-26/0296', '2026-01-28', '2026-02-27', 184300],
    [IDS.cMetro, 'Metro Distributors', 'INV/25-26/0419', '2026-03-25', '2026-04-09', 295000],
    [IDS.cVimal, 'Vimal Commodities', 'INV/25-26/0374', '2026-03-10', '2026-04-09', 198500],
    [IDS.cBharat, 'Bharat Agencies', 'INV/25-26/0207', '2025-12-15', '2026-01-14', 130000],
  ];
  // Trade payables carried forward — must total exactly account 2100's opening balance ₹12,30,400.
  const openingAp: [string, string, string, string, string, number][] = [
    [IDS.sBharatSteel, 'Bharat Steel Suppliers', 'BSS/2025-26/0914', '2026-03-20', '2026-04-19', 385000],
    [IDS.sNational, 'National Hardware Co', 'NHC/INV/2025/0742', '2026-03-12', '2026-04-11', 142600],
    [IDS.sKiranAg, 'Kiran Agencies', 'KA/2025-26/0588', '2026-02-26', '2026-03-28', 96400],
    [IDS.sGlobalPack, 'Global Packaging Ltd', 'GPL/25-26/1904', '2026-03-08', '2026-04-07', 128900],
    [IDS.sVinod, 'Vinod Trading Co.', 'VTC/25-26/0361', '2026-02-14', '2026-03-31', 276500],
    [IDS.sTransport, 'Speedway Logistics', 'SL/2025/1644', '2026-03-22', '2026-04-06', 48000],
    [IDS.sConsult, 'Mehta & Associates (CA)', 'MA/2025-26/092', '2026-01-31', '2026-03-02', 153000],
  ];
  const openItems: OpenItem[] = [
    ...openingAr.map(([id, name, num_, date, due, amt], i) => openingItem(i + 1, 'Customer', id, name, num_, date, due, amt)),
    ...openingAp.map(([id, name, num_, date, due, amt], i) => openingItem(i + 1, 'Supplier', id, name, num_, date, due, amt)),
  ];
  const openingTotal = (t: 'Customer' | 'Supplier') => openItems.filter((o) => o.partyType === t).reduce((s, o) => s + o.baseAmount, 0);
  if (openingTotal('Customer') !== 1845200) throw new Error(`Opening AR open items ${openingTotal('Customer')} ≠ account 1100 opening 1845200`);
  if (openingTotal('Supplier') !== 1230400) throw new Error(`Opening AP open items ${openingTotal('Supplier')} ≠ account 2100 opening 1230400`);

  // 2. Bank charges — HDFC (monthly)
  const charges: [string, number][] = [['2026-04-12', 236], ['2026-05-12', 295], ['2026-06-12', 412], ['2026-07-12', 236], ['2026-08-12', 531], ['2026-09-12', 236]];
  charges.forEach(([d, amt], i) => journals.push(journal(`jv_bc_${i + 1}`, i === 0 ? 'JV/26-27/0390' : num(), d, 'Auto', 'Bank Charges', `Bank charges — HDFC CA ****1234 (${d.slice(0, 7)})`, [
    { acc: IDS.accBankCharges, dr: amt, narration: 'Transaction & SMS charges' },
    { acc: IDS.accHDFC, cr: amt },
  ])));

  // 3. Interest earned — HDFC FD (monthly, credited to current account)
  const interest: [string, number][] = [['2026-04-22', 9386], ['2026-05-22', 9386], ['2026-06-22', 9386], ['2026-07-22', 9540], ['2026-08-22', 9540]];
  interest.forEach(([d, amt], i) => journals.push(journal(`jv_int_${i + 1}`, i === 0 ? 'JV/26-27/0410' : num(), d, 'Auto', 'Interest', `Interest earned — HDFC FD (${d.slice(0, 7)})`, [
    { acc: IDS.accHDFC, dr: amt },
    { acc: ACC_IDS.accInterestIncome, cr: amt, narration: 'FD interest, TDS not deducted (Form 15G)' },
  ])));

  // 4. Salary disbursement from the payroll bank account. The salary ACCRUAL for each
  // period is posted by the payroll module's run (jv_pay_2026_MM) — never duplicate it here.
  const monthEnds = ['2026-04-30', '2026-05-31', '2026-06-30', '2026-07-31', '2026-08-31'];
  void monthEnds;
  // Amounts mirror the net pay credited to Salaries Payable by each payroll run, so the control account clears.
  const payDays: [string, number, string][] = [['2026-04-02', 231000, 'March 2026'], ['2026-05-02', 455779, 'April 2026'], ['2026-06-02', 450779, 'May 2026'], ['2026-07-02', 449899, 'June 2026'], ['2026-08-03', 399579, 'July 2026'], ['2026-09-02', 399579, 'August 2026']];
  payDays.forEach(([d, amt, m], i) => journals.push(journal(`jv_pay_${i + 1}`, num(), d, 'Auto', 'Salary Disbursement', `Salary disbursement for ${m} — SBI payroll account`, [
    { acc: IDS.accSalaryPayable, dr: amt },
    { acc: ACC_IDS.accPayrollBank, cr: amt, narration: 'NEFT bulk transfer' },
  ])));

  // 5. Depreciation is posted by the fixed-assets module's depreciation runs
  // (jv_dep_2026_MM) from the asset register — not seeded generically here.

  // 6. Rent (standing instruction, 5th) and utilities (18th)
  ['2026-04-05', '2026-05-05', '2026-06-05', '2026-07-05', '2026-08-05', '2026-09-05'].forEach((d, i) => journals.push(journal(`jv_rent_${i + 1}`, num(), d, 'Auto', 'Rent', `Office rent for ${d.slice(0, 7)} — Andheri Industrial Estate`, [
    { acc: IDS.accRent, dr: 45000, dims: { Department: IDS.dimDeptAdmin, CostCentre: IDS.dimCCMumbai } },
    { acc: IDS.accHDFC, cr: 45000, narration: 'Standing instruction' },
  ])));
  const utils: [string, number][] = [['2026-04-18', 24300], ['2026-05-18', 27150], ['2026-06-18', 31900], ['2026-07-18', 29400], ['2026-08-18', 26800]];
  utils.forEach(([d, amt], i) => journals.push(journal(`jv_util_${i + 1}`, num(), d, 'Auto', 'Utilities', `Electricity & internet for ${d.slice(0, 7)}`, [
    { acc: IDS.accUtilities, dr: amt, dims: { Department: IDS.dimDeptAdmin, CostCentre: IDS.dimCCMumbai } },
    { acc: IDS.accHDFC, cr: amt, narration: 'Auto-debit' },
  ])));

  // 7. Interest accrual on SBI term loan (monthly, 9% p.a.)
  monthEnds.forEach((d, i) => journals.push(journal(`jv_loanint_${i + 1}`, num(), d, 'Auto', 'Interest', `Interest accrued on SBI term loan for ${d.slice(0, 7)} (₹1.80 Cr @ 9% p.a.)`, [
    { acc: IDS.accFinance, dr: 135000 },
    { acc: ACC_IDS.accInterestAccrued, cr: 135000 },
  ])));

  // 8. Realized FX gain on converting part of the EEFC (USD) balance into rupees.
  //    It deliberately does NOT touch AR control: a gain booked against 1100 with no matching
  //    movement on the customer's open item breaks the AR sub-ledger tie (FR-ACC-022). Realized FX
  //    on receivables is produced by the settlement itself (see the USD receipt in seed/sales.ts).
  journals.push(journal('jv_fxgain', num(), '2026-07-20', 'Auto', 'FX Settlement', 'USD 3,000.00 converted from the EEFC account at 84.00 vs book rate 83.20 — realized FX gain', [
    { acc: IDS.accHDFC, dr: 252000, narration: 'USD 3,000.00 @ 84.00 credited to HDFC CA ****1234' },
    { acc: 'acc_1330', cr: 249600, narration: 'USD 3,000.00 @ book rate 83.20' },
    { acc: IDS.accFxGain, cr: 2400, narration: 'USD 3,000 × (84.00 − 83.20)' },
  ], { sourceNumber: 'FXC/26-27/0001' }));

  // 9. Manual journals (posted)
  journals.push(journal('jv_man_1', num(), '2026-05-14', 'Manual', 'Manual Journal', 'Domain, SSL and SaaS renewals paid by net banking — not routed through AP', [
    { acc: IDS.accIT, dr: 18500, dims: { Department: IDS.dimDeptFin } },
    { acc: IDS.accHDFC, cr: 18500, narration: 'UTR HDFCN52026051412345' },
  ], { postedBy: 'Anil Patil' }));
  journals.push(journal('jv_man_2', num(), '2026-06-28', 'Manual', 'Manual Journal', 'Provision for statutory audit fees FY 2025-26 — Mehta & Associates', [
    { acc: IDS.accProfFees, dr: 75000, dims: { Department: IDS.dimDeptFin } },
    { acc: IDS.accAP, cr: 75000, partyType: 'Supplier', partyId: IDS.sConsult, partyName: 'Mehta & Associates (CA)' },
  ]));
  // A manual journal that credits AP control is a payable like any other: it needs an open item,
  // otherwise the supplier ledger and AP ageing under-report it (FR-ACC-020, FR-AP-001).
  openItems.push(rec<OpenItem>('oi_jv_man_2', {
    companyId: co, partyType: 'Supplier', partyId: IDS.sConsult, partyName: 'Mehta & Associates (CA)', docType: 'Manual Journal',
    docId: 'jv_man_2', docNumber: 'MA/2025-26/AUDIT', date: '2026-06-28', dueDate: '2026-07-28', currency: 'INR',
    originalAmount: 75000, baseAmount: 75000, rate: 1, outstanding: 75000, baseOutstanding: 75000,
    direction: 'Debit', status: 'Open', settlements: [], branchId: IDS.brHO, createdAt: '2026-06-28T10:00:00.000Z', updatedAt: '2026-06-28T10:00:00.000Z',
  }));
  journals.push(journal('jv_man_3', num(), '2026-08-09', 'Manual', 'Manual Journal', 'Petty cash replenishment — cheque 004512', [
    { acc: IDS.accPettyCash, dr: 25000 },
    { acc: IDS.accHDFC, cr: 25000 },
  ]));

  // 10. June revaluation of the USD (EEFC) bank balance at closing 83.75 — reversed 1 Jul.
  //     Scoped to the bank balance on purpose: revaluing AR control without restating the matching
  //     open items would put the AR sub-ledger out by the revaluation delta (FR-ACC-022, FR-RPT-009).
  const revLines: LineIn[] = [
    { acc: 'acc_1330', dr: 2750, narration: 'EEFC USD 5,000 @ 83.75 vs book 83.20' },
    { acc: ACC_IDS.accUnrealFxGain, cr: 2750, narration: 'USD 5,000 × (83.75 − 83.20)' },
  ];
  journals.push(journal('jv_reval_jun', 'REV/26-27/0001', '2026-06-30', 'Revaluation', 'Revaluation', 'Period-end revaluation of the USD (EEFC) bank balance at closing rate 83.75 (Jun 2026)', revLines, { status: 'Reversed', reversedById: 'jv_reval_jun_rev', reversalReason: 'Auto-reverse on first day of next period', sourceId: 'rev_run_jun', sourceNumber: 'REV/26-27/0001' }));
  journals.push(journal('jv_reval_jun_rev', num(), '2026-07-01', 'Reversal', 'Revaluation', 'Reversal of REV/26-27/0001: Auto-reverse on first day of next period', revLines.map((l) => ({ ...l, dr: l.cr, cr: l.dr })), { reversalOfId: 'jv_reval_jun', reversalReason: 'Auto-reverse on first day of next period', sourceId: 'rev_run_jun', sourceNumber: 'REV/26-27/0001' }));

  // 11. Submitted manual journal awaiting approval (approvals inbox)
  journals.push(journal('jv_0045', 'JV/DRAFT/0045', '2026-09-10', 'Manual', 'Manual Journal', 'Reclass of marketing spend', [
    { acc: IDS.accMarketing, dr: 18240, dims: { Department: IDS.dimDeptSales, CostCentre: IDS.dimCCMumbai }, narration: 'Trade-fair stall booked under travel' },
    { acc: IDS.accTravel, cr: 18240 },
  ], { status: 'Submitted', createdBy: 'Anil Patil', createdAt: '2026-09-10T11:20:00.000Z', updatedAt: '2026-09-10T11:24:00.000Z', idempotencyKey: 'manual:jv_0045' }));

  const recurring: RecurringJournal[] = [
    rec<RecurringJournal>('rj_dep', { companyId: co, code: 'RJ-001', name: 'Monthly depreciation (SLM)', frequency: 'Monthly', startDate: '2026-04-30', nextRun: '2026-09-30', mode: 'Draft', narration: 'Depreciation for {period} — plant, machinery & computers (SLM)', status: 'Active', runCount: 5, lastRunAt: '2026-08-31T10:00:00.000Z', generatedIds: ['jv_dep_2026_04', 'jv_dep_2026_05', 'jv_dep_2026_06', 'jv_dep_2026_07', 'jv_dep_2026_08'], lines: [
      { id: 'rjl_1', accountId: IDS.accDep, dr: 42000, cr: 0 },
      { id: 'rjl_2', accountId: IDS.accAccDep, dr: 0, cr: 42000 },
    ] }),
    rec<RecurringJournal>('rj_loan', { companyId: co, code: 'RJ-002', name: 'Term loan interest accrual', frequency: 'Monthly', startDate: '2026-04-30', endDate: '2029-03-31', nextRun: '2026-09-30', mode: 'Post', narration: 'Interest accrued on SBI term loan for {period} (₹1.80 Cr @ 9% p.a.)', status: 'Active', runCount: 5, lastRunAt: '2026-08-31T10:00:00.000Z', generatedIds: ['jv_loanint_1', 'jv_loanint_2', 'jv_loanint_3', 'jv_loanint_4', 'jv_loanint_5'], lines: [
      { id: 'rjl_3', accountId: IDS.accFinance, dr: 135000, cr: 0 },
      { id: 'rjl_4', accountId: ACC_IDS.accInterestAccrued, dr: 0, cr: 135000 },
    ] }),
  ];

  const revaluationRuns: RevaluationRun[] = [
    rec<RevaluationRun>('rev_run_jun', { companyId: co, number: 'REV/26-27/0001', asOf: '2026-06-30', period: '2026-06', currency: 'USD', closingRate: 83.75, rateId: 'fx_04', scope: ['Bank'], gain: 2750, loss: 0, net: 2750, journalId: 'jv_reval_jun', journalNumber: 'REV/26-27/0001', reversalJournalId: 'jv_reval_jun_rev', autoReverse: true, status: 'Reversed', reason: 'Quarter-end close Q1 FY 2026-27', createdAt: '2026-06-30T18:30:00.000Z', updatedAt: '2026-07-01T09:00:00.000Z', items: [
      { id: 'rvi_1', kind: 'Bank', ref: '1330 · HDFC EEFC Account (USD) ****9012', partyName: 'HDFC Bank', accountId: 'acc_1330', currency: 'USD', amount: 5000, bookRate: 83.2, bookBase: 416000, closingBase: 418750, difference: 2750 },
    ] }),
  ];

  const audit = [
    { id: 'aud_jv_0045_submit', at: '2026-09-10T11:24:00.000Z', actor: 'Anil Patil', actorId: IDS.uAnil, action: 'workflow.submitted', objectType: 'Journal', objectId: 'jv_0045', objectNumber: 'JV/DRAFT/0045', result: 'Success', detail: 'Journal Approval (Manual) v2 · 1 step(s)', correlationId: 'corr_jv_0045', channel: 'web', companyId: co, createdAt: '2026-09-10T11:24:00.000Z', updatedAt: SEED_NOW, version: 1 },
    { id: 'aud_reval_jun', at: '2026-06-30T18:30:00.000Z', actor: 'Rahul Kumar', actorId: IDS.uRahul, action: 'revaluation.posted', objectType: 'Revaluation', objectId: 'rev_run_jun', objectNumber: 'REV/26-27/0001', result: 'Success', detail: 'USD @ 83.75 · 2 items · net −2,750.00', correlationId: 'corr_jv_reval_jun', channel: 'web', companyId: co, createdAt: '2026-06-30T18:30:00.000Z', updatedAt: SEED_NOW, version: 1 },
    { id: 'aud_reval_jun_rev', at: '2026-07-01T09:00:00.000Z', actor: 'system', action: 'revaluation.reversed', objectType: 'Revaluation', objectId: 'rev_run_jun', objectNumber: 'REV/26-27/0001', result: 'Success', detail: 'Auto-reverse on first day of next period', correlationId: 'corr_jv_reval_jun', channel: 'worker', companyId: co, createdAt: '2026-07-01T09:00:00.000Z', updatedAt: SEED_NOW, version: 1 },
  ];

  return {
    [C.accounts]: seedAccountingMasters() as any,
    [C.journals]: journals as any,
    [C.openItems]: openItems as any,
    [C.recurringJournals]: recurring as any,
    [C.revaluationRuns]: revaluationRuns as any,
    [C.audit]: audit as any,
  };
}
