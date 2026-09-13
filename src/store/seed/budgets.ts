// Seed data for budgets & expenses: FY 2026-27 budget v1 (approved), control rules, expense categories,
// 7 expense claims (exp_0041 Submitted — referenced by the approvals seed), their journals and employee open items.
import type { DB } from '../db';
import type { Journal, OpenItem } from '../types';
import { C } from '../collections';
import { IDS, rec } from './core';
import type { Budget, BudgetLine, BudgetRule, ExpenseCategory, ExpenseClaim, ExpenseLine } from '../../modules/budgets/types';
import { seedJournal } from './payroll';
import type { PostingLine } from '../../modules/payroll/posting';

const co = IDS.acme;
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Seasonal spread of an annual amount into 12 FY months (Apr..Mar). */
function spread(annual: number, profile: 'flat' | 'growth' | 'q4' = 'flat'): number[] {
  const w = profile === 'flat' ? Array(12).fill(1) : profile === 'growth' ? [0.7, 0.75, 0.8, 0.85, 0.9, 0.95, 1.05, 1.1, 1.15, 1.2, 1.25, 1.3] : [0.8, 0.8, 0.8, 0.9, 0.9, 0.9, 1, 1, 1, 1.3, 1.3, 1.3];
  const sum = w.reduce((a, b) => a + b, 0);
  const months = w.map((x) => Math.round((annual * x) / sum));
  const diff = annual - months.reduce((a, b) => a + b, 0);
  months[11] += diff;
  return months;
}

const ACCOUNTS: Record<string, { code: string; name: string; type: string; groupId: string }> = {
  [IDS.accSales]: { code: '4000', name: 'Sales Revenue', type: 'Income', groupId: 'ag_rev' },
  [IDS.accServiceRev]: { code: '4010', name: 'Service Revenue', type: 'Income', groupId: 'ag_rev' },
  [IDS.accCOGS]: { code: '5000', name: 'Cost of Goods Sold', type: 'Expense', groupId: 'ag_cogs' },
  [IDS.accPurchases]: { code: '5010', name: 'Purchases — Raw Materials', type: 'Expense', groupId: 'ag_cogs' },
  [IDS.accSalaries]: { code: '5100', name: 'Employee Salaries', type: 'Expense', groupId: 'ag_opex' },
  [IDS.accEmployerPF]: { code: '5110', name: 'Employer PF & ESI Contribution', type: 'Expense', groupId: 'ag_opex' },
  [IDS.accRent]: { code: '5200', name: 'Rent', type: 'Expense', groupId: 'ag_opex' },
  [IDS.accUtilities]: { code: '5210', name: 'Utilities', type: 'Expense', groupId: 'ag_opex' },
  [IDS.accMarketing]: { code: '5510', name: 'Marketing & Selling', type: 'Expense', groupId: 'ag_opex' },
  [IDS.accTravel]: { code: '5500', name: 'Travel & Logistics', type: 'Expense', groupId: 'ag_opex' },
  [IDS.accIT]: { code: '5520', name: 'IT & Software', type: 'Expense', groupId: 'ag_opex' },
  [IDS.accProfFees]: { code: '5530', name: 'Professional Fees', type: 'Expense', groupId: 'ag_opex' },
  [IDS.accFinance]: { code: '5410', name: 'Interest & Finance Costs', type: 'Expense', groupId: 'ag_fin' },
  [IDS.accBankCharges]: { code: '5400', name: 'Bank Charges', type: 'Expense', groupId: 'ag_fin' },
  [IDS.accDep]: { code: '5300', name: 'Depreciation & Amortisation', type: 'Expense', groupId: 'ag_opex' },
  [IDS.accMisc]: { code: '5590', name: 'Miscellaneous Expenses', type: 'Expense', groupId: 'ag_opex' },
  acc_5540: { code: '5540', name: 'Training & Development', type: 'Expense', groupId: 'ag_opex' },
  acc_5550: { code: '5550', name: 'Office Supplies', type: 'Expense', groupId: 'ag_opex' },
  acc_5560: { code: '5560', name: 'Entertainment', type: 'Expense', groupId: 'ag_opex' },
};

export function seedBudgets(): Partial<DB> {
  const line = (accountId: string, annual: number, profile: 'flat' | 'growth' | 'q4' = 'flat'): BudgetLine => {
    const a = ACCOUNTS[accountId];
    const months = spread(annual, profile);
    return { id: `bl_${a.code}`, accountId, accountCode: a.code, accountName: a.name, accountType: a.type, groupId: a.groupId, months, total: months.reduce((x, y) => x + y, 0) };
  };
  const lines: BudgetLine[] = [
    line(IDS.accSales, 10800000, 'growth'), line(IDS.accServiceRev, 1200000, 'growth'),
    line(IDS.accCOGS, 4200000, 'growth'), line(IDS.accPurchases, 3000000, 'growth'),
    line(IDS.accSalaries, 1350000), line(IDS.accEmployerPF, 150000),
    line(IDS.accRent, 240000), line(IDS.accUtilities, 120000),
    line(IDS.accMarketing, 480000, 'q4'), line(IDS.accTravel, 240000), line(IDS.accIT, 180000), line(IDS.accProfFees, 120000),
    line(IDS.accFinance, 84000), line(IDS.accBankCharges, 12000), line(IDS.accDep, 1128000), line(IDS.accMisc, 60000),
    line('acc_5540', 48000), line('acc_5550', 36000), line('acc_5560', 24000),
  ];
  const totalIncome = lines.filter((l) => l.accountType === 'Income').reduce((s, l) => s + l.total, 0);
  const totalExpense = lines.filter((l) => l.accountType === 'Expense').reduce((s, l) => s + l.total, 0);
  const budgets: Budget[] = [
    rec<Budget>('bud_2627_v1', { companyId: co, code: 'BUD-2026-27', name: 'Annual operating budget FY 2026-27', fy: '2026-27', fyStart: '2026-04-01', version: 1, revision: 1, status: 'Approved', scope: {}, lines, totalIncome, totalExpense, approvedBy: 'Aarav Mehta', approvedAt: '2026-03-30T10:00:00.000Z', notes: 'Board-approved operating plan. Capex tracked separately under Fixed assets.', createdAt: '2026-03-20T10:00:00.000Z', updatedAt: '2026-03-30T10:00:00.000Z' }),
  ];

  const rules: BudgetRule[] = [
    rec<BudgetRule>('brule_opex', { companyId: co, groupId: 'ag_opex', groupName: 'Operating Expenses', mode: 'Warn', thresholdPct: 90, includeCommitted: true, status: 'Active', notes: 'Warn when committed + actual exceeds 90% of period budget' }),
    rec<BudgetRule>('brule_cogs', { companyId: co, groupId: 'ag_cogs', groupName: 'Cost of Goods Sold', mode: 'Override', thresholdPct: 100, includeCommitted: true, status: 'Active', notes: 'Purchases above budget need Finance approval' }),
    rec<BudgetRule>('brule_fin', { companyId: co, groupId: 'ag_fin', groupName: 'Finance Costs', mode: 'Block', thresholdPct: 100, includeCommitted: false, status: 'Active' }),
    rec<BudgetRule>('brule_fa', { companyId: co, groupId: 'ag_fa', groupName: 'Fixed Assets', mode: 'Override', thresholdPct: 100, includeCommitted: true, status: 'Inactive', notes: 'Capex budget not loaded for FY 2026-27' }),
  ];

  const ec = (id: string, code: string, name: string, accountId: string, receiptRequired = true, taxRateId?: string, perDiem?: number): ExpenseCategory =>
    rec<ExpenseCategory>(id, { companyId: co, code, name, accountId, accountName: ACCOUNTS[accountId]?.name, receiptRequired, taxRateId, perDiem, status: 'Active' });
  const categories: ExpenseCategory[] = [
    ec('ecat_travel', 'TRAVEL', 'Travel', IDS.accTravel, true, IDS.taxGST5),
    ec('ecat_lodging', 'LODGING', 'Lodging', IDS.accTravel, true, IDS.taxGST12),
    ec('ecat_meals', 'MEALS', 'Meals & per diem', 'acc_5560', false, undefined, 750),
    ec('ecat_ent', 'ENT', 'Entertainment', 'acc_5560', true, IDS.taxGST18),
    ec('ecat_office', 'OFFICE', 'Office Supplies', 'acc_5550', true, IDS.taxGST18),
    ec('ecat_training', 'TRAINING', 'Training', 'acc_5540', true, IDS.taxGST18),
    ec('ecat_it', 'IT', 'IT & Software', IDS.accIT, true, IDS.taxGST18),
    ec('ecat_prof', 'PROF', 'Professional fees', IDS.accProfFees, true, IDS.taxGST18),
    ec('ecat_misc', 'MISC', 'Miscellaneous', IDS.accMisc, false),
  ];
  const catById = (id: string) => categories.find((c) => c.id === id)!;

  // ── Expense claims ─────────────────────────────────────────────────────────
  const el = (id: string, date: string, categoryId: string, description: string, amount: number, taxRate: number, dims: Record<string, string> = {}, hasReceipt = true): ExpenseLine => {
    const c = catById(categoryId);
    const tax = r2((amount * taxRate) / 100);
    return { id, date, categoryId, categoryName: c.name, accountId: c.accountId, description, amount, taxRateId: taxRate === 18 ? IDS.taxGST18 : taxRate === 12 ? IDS.taxGST12 : taxRate === 5 ? IDS.taxGST5 : undefined, taxRate, tax, total: r2(amount + tax), dimensions: dims, hasReceipt };
  };
  const claim = (id: string, number: string, date: string, empId: string, empName: string, empCode: string, department: string, purpose: string, status: ExpenseClaim['status'], method: ExpenseClaim['paymentMethod'], lines: ExpenseLine[], extra: Partial<ExpenseClaim> = {}): ExpenseClaim => {
    const amount = r2(lines.reduce((s, l) => s + l.amount, 0));
    const tax = r2(lines.reduce((s, l) => s + l.tax, 0));
    return rec<ExpenseClaim>(id, { companyId: co, number, docType: 'Expense Claim', date, branchId: IDS.brHO, employeeId: empId, employeeName: empName, employeeCode: empCode, department, purpose, status, lines, totals: { amount, tax, total: r2(amount + tax) }, currency: 'INR', paymentMethod: method, correlationId: `corr_${id.toUpperCase()}`, createdAt: `${date}T09:00:00.000Z`, updatedAt: `${date}T09:00:00.000Z`, ...extra });
  };
  const claims: ExpenseClaim[] = [
    claim('exp_0041', 'EXP/26-27/0041', '2026-09-12', IDS.eSuresh, 'Suresh Kumar', 'EMP-005', 'Production', 'Site visit — Pune (Metro Line 3 brackets)', 'Submitted', 'Personal', [
      el('el_41_1', '2026-09-10', 'ecat_travel', 'Mumbai–Pune–Mumbai by cab', 4200, 0, { Project: IDS.dimPrj042 }),
      el('el_41_2', '2026-09-10', 'ecat_lodging', 'Hotel — 1 night, Chakan', 3500, 0, { Project: IDS.dimPrj042 }),
      el('el_41_3', '2026-09-11', 'ecat_meals', 'Per diem (1 day)', 750, 0, { Project: IDS.dimPrj042 }, false),
    ], { approvalId: 'apr_exp_0041', submittedAt: '2026-09-13T03:00:00.000Z', submittedBy: 'Suresh Kumar', dimensions: { Project: IDS.dimPrj042 }, notes: '3 receipts attached' }),
    claim('exp_0022', 'EXP/26-27/0022', '2026-09-10', IDS.eVikram, 'Vikram Singh', 'EMP-003', 'Operations', 'Client visit — Pune', 'Approved', 'Personal', [
      el('el_22_1', '2026-09-09', 'ecat_travel', 'Client visit — Pune (fuel + tolls)', 8400, 0, { CostCentre: IDS.dimCCPune }),
    ], { submittedAt: '2026-09-10T10:00:00.000Z', submittedBy: 'Vikram Singh', approvedAt: '2026-09-11T09:00:00.000Z', approvedBy: 'Rahul Kumar', postedAt: '2026-09-11T09:05:00.000Z', journalId: 'jv_exp_0022', journalNumber: 'JV/26-27/0371', openItemId: 'oi_exp_0022', reimbursementMode: 'Payroll' }),
    claim('exp_0021', 'EXP/26-27/0021', '2026-09-08', IDS.ePriya, 'Priya Mehta', 'EMP-002', 'Sales', 'Customer lunch — Q1 review', 'Approved', 'Personal', [
      el('el_21_1', '2026-09-08', 'ecat_ent', 'Customer lunch — Global Tech Q1 review', 3200, 18, { Customer: IDS.cGlobalTech }),
    ], { submittedAt: '2026-09-08T12:00:00.000Z', submittedBy: 'Priya Mehta', approvedAt: '2026-09-08T12:00:01.000Z', approvedBy: 'system (no workflow ≤ ₹5,000)', postedAt: '2026-09-08T12:00:02.000Z', journalId: 'jv_exp_0021', journalNumber: 'JV/26-27/0370', openItemId: 'oi_exp_0021', reimbursementMode: 'Bank' }),
    claim('exp_0020', 'EXP/26-27/0020', '2026-09-05', IDS.eAnita, 'Anita Rao', 'EMP-004', 'Admin', 'Stationery and printer cartridges', 'Draft', 'Personal', [
      el('el_20_1', '2026-09-05', 'ecat_office', 'Stationery and printer cartridges', 1850, 18),
    ]),
    claim('exp_0019', 'EXP/26-27/0019', '2026-09-02', IDS.eRahul, 'Rahul Kumar', 'EMP-001', 'Finance', 'Flight MUM-DEL for vendor meet', 'Reimbursed', 'Corporate card', [
      el('el_19_1', '2026-09-01', 'ecat_travel', 'Flight MUM-DEL (IndiGo) for vendor meet', 12000, 6),
    ], { submittedAt: '2026-09-02T10:00:00.000Z', submittedBy: 'Rahul Kumar', approvedAt: '2026-09-03T09:00:00.000Z', approvedBy: 'Aarav Mehta', postedAt: '2026-09-03T09:05:00.000Z', journalId: 'jv_exp_0019', journalNumber: 'JV/26-27/0369', reimbursedAt: '2026-09-03T09:05:00.000Z', reimbursementMode: 'Card settlement', reimbursementRef: 'HDFC card statement Sep' }),
    claim('exp_0018', 'EXP/26-27/0018', '2026-08-28', IDS.eSuresh, 'Suresh Kumar', 'EMP-005', 'Production', 'Safety certification course', 'Reimbursed', 'Personal', [
      el('el_18_1', '2026-08-26', 'ecat_training', 'Safety certification course — NSC', 6500, 0),
    ], { submittedAt: '2026-08-28T10:00:00.000Z', submittedBy: 'Suresh Kumar', approvedAt: '2026-08-29T09:00:00.000Z', approvedBy: 'Vikram Singh', postedAt: '2026-08-29T09:05:00.000Z', journalId: 'jv_exp_0018', journalNumber: 'JV/26-27/0341', openItemId: 'oi_exp_0018', reimbursedAt: '2026-09-02T11:00:00.000Z', reimbursementMode: 'Bank', reimbursementRef: 'NEFT HDFC ****1234 · UTR N245261234567', reimbursementJournalId: 'jv_exp_0018_pay' }),
    claim('exp_0017', 'EXP/26-27/0017', '2026-08-22', IDS.eMeena, 'Meena Joshi', 'EMP-006', 'HR', 'Software subscription renewal', 'Rejected', 'Personal', [
      el('el_17_1', '2026-08-20', 'ecat_it', 'Canva Pro annual subscription', 4200, 18),
    ], { submittedAt: '2026-08-22T10:00:00.000Z', submittedBy: 'Meena Joshi', rejectionReason: 'Software purchases must go through IT procurement (PO), not personal expense', approvedBy: 'Rahul Kumar', approvedAt: '2026-08-23T10:00:00.000Z' }),
  ];

  // ── Journals + open items for approved/reimbursed claims ──────────────────
  const claimLines = (c: ExpenseClaim): PostingLine[] => {
    const out: PostingLine[] = [];
    c.lines.forEach((l) => out.push({ accountId: l.accountId, dr: l.amount, dimensions: l.dimensions, narration: l.description }));
    const tax = c.totals.tax;
    if (tax) { out.push({ accountId: IDS.accGSTInputCGST, dr: r2(tax / 2), narration: 'Input CGST on expense' }); out.push({ accountId: IDS.accGSTInputSGST, dr: r2(tax - tax / 2), narration: 'Input SGST on expense' }); }
    // Corporate card → card liability (2350). It is NOT an AP-control balance: there is no supplier
    // invoice and no party, so it must never reach the AP sub-ledger (FR-EXP-004, FR-ACC-020).
    if (c.paymentMethod === 'Corporate card') out.push({ accountId: IDS.accCardPayable, cr: c.totals.total, narration: 'Corporate card — HDFC Business Card, settled with card statement' });
    else out.push({ accountId: IDS.accEmpPayable, cr: c.totals.total, partyType: 'Employee', partyId: c.employeeId, partyName: c.employeeName, narration: `Reimbursable · ${c.number}` });
    return out;
  };
  const journals: Journal[] = [];
  const openItems: OpenItem[] = [];
  claims.filter((c) => c.journalId).forEach((c) => {
    journals.push(seedJournal(c.journalId!, c.journalNumber!, c.approvedAt!.slice(0, 10), 'Expense Claim', c.id, c.number, `Expense claim ${c.number} · ${c.employeeName} · ${c.purpose}`, claimLines(c), c.approvedBy ?? 'Rahul Kumar'));
    if (c.openItemId) {
      const settled = c.status === 'Reimbursed';
      openItems.push(rec<OpenItem>(c.openItemId, { companyId: co, partyType: 'Employee', partyId: c.employeeId, partyName: c.employeeName, docType: 'Expense Claim', docId: c.id, docNumber: c.number, date: c.approvedAt!.slice(0, 10), dueDate: c.approvedAt!.slice(0, 10), currency: 'INR', originalAmount: c.totals.total, baseAmount: c.totals.total, rate: 1, outstanding: settled ? 0 : c.totals.total, baseOutstanding: settled ? 0 : c.totals.total, direction: 'Debit', status: settled ? 'Settled' : 'Open', branchId: IDS.brHO, settlements: settled ? [{ id: `stl_${c.id}`, date: c.reimbursedAt!.slice(0, 10), docType: 'Reimbursement', docId: c.reimbursementJournalId!, docNumber: 'JV/26-27/0345', amount: c.totals.total, baseAmount: c.totals.total, rate: 1, fxGainLoss: 0 }] : [] }));
    }
  });
  const c18 = claims.find((c) => c.id === 'exp_0018')!;
  journals.push(seedJournal('jv_exp_0018_pay', 'JV/26-27/0345', '2026-09-02', 'Reimbursement', c18.id, c18.number, `Reimbursement of ${c18.number} to ${c18.employeeName} · NEFT`, [
    { accountId: IDS.accEmpPayable, dr: c18.totals.total, partyType: 'Employee', partyId: c18.employeeId, partyName: c18.employeeName },
    { accountId: IDS.accHDFC, cr: c18.totals.total, narration: 'NEFT · UTR N245261234567' },
  ], 'Anita Rao'));

  return {
    [C.budgets]: budgets as any,
    [C.budgetRules]: rules as any,
    [C.expenseCategories]: categories as any,
    [C.expenseClaims]: claims as any,
    [C.journals]: journals as any,
    [C.openItems]: openItems as any,
  };
}
