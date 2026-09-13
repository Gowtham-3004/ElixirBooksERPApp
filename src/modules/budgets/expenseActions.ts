// Expense claim lifecycle (FR-EXP-001/002): save draft → submit (workflow) → approve/reject → post (journal + employee
// open item) → reimburse (bank / payroll / card settlement).
import { db, C, engine, ValidationError, IDS } from '../../store';
import type { Company, ExpenseSettings, TaxRate } from '../../store';
import { round, today, uid, correlationId } from '../../lib/format';
import type { ExpenseClaim, ExpenseLine, ExpenseCategory } from './types';
import { checkBudget } from './control';

export const DEFAULT_EXPENSE_SETTINGS: ExpenseSettings = { receiptRequiredAbove: 500, perDiemDomestic: 750, perDiemInternational: 3500, corporateCardAccountId: IDS.accCardPayable, employeePayableAccountId: IDS.accEmpPayable };

export function expenseSettings(): ExpenseSettings {
  return { ...DEFAULT_EXPENSE_SETTINGS, ...(engine.ctx().company?.defaults.expense ?? {}) };
}

export function saveExpenseSettings(patch: Partial<ExpenseSettings>) {
  const co = engine.ctx().company;
  if (!co) return;
  db.update<Company>(C.companies, co.id, { defaults: { ...co.defaults, expense: { ...expenseSettings(), ...patch } } });
  engine.audit({ action: 'expense.settings.updated', objectType: 'Company', objectId: co.id, detail: JSON.stringify(patch) });
}

export function newClaimLine(cat?: ExpenseCategory): ExpenseLine {
  const tr = db.find<TaxRate>(C.taxRates, cat?.taxRateId);
  return { id: uid('el'), date: today(), categoryId: cat?.id ?? '', categoryName: cat?.name ?? '', accountId: cat?.accountId ?? '', description: '', amount: cat?.perDiem ?? 0, taxRateId: cat?.taxRateId, taxRate: tr?.rate ?? 0, tax: 0, total: cat?.perDiem ?? 0, dimensions: {}, hasReceipt: false };
}

export function recomputeLine(l: ExpenseLine): ExpenseLine {
  const tr = db.find<TaxRate>(C.taxRates, l.taxRateId);
  const rate = tr?.treatment === 'Taxable' ? tr.rate : 0;
  const tax = round((l.amount * rate) / 100);
  return { ...l, taxRate: rate, tax, total: round(l.amount + tax) };
}

export function totalsOf(lines: ExpenseLine[]) {
  const amount = round(lines.reduce((s, l) => s + l.amount, 0));
  const tax = round(lines.reduce((s, l) => s + l.tax, 0));
  return { amount, tax, total: round(amount + tax) };
}

export function currentEmployee() {
  const c = engine.ctx();
  return db.findBy<any>(C.employees, (e) => e.userId === c.userId);
}

export function validateClaim(c: ExpenseClaim): string[] {
  const errs: string[] = [];
  const st = expenseSettings();
  if (!c.employeeId) errs.push('Employee is required');
  if (!c.purpose.trim()) errs.push('Purpose is required');
  if (!c.lines.length) errs.push('Add at least one expense line');
  c.lines.forEach((l, i) => {
    if (!l.categoryId) errs.push(`Line ${i + 1}: category required`);
    if (l.amount <= 0) errs.push(`Line ${i + 1}: amount must be positive`);
    const cat = db.find<ExpenseCategory>(C.expenseCategories, l.categoryId);
    if ((cat?.receiptRequired || l.total > st.receiptRequiredAbove) && !l.hasReceipt && !l.receiptAttachmentId) errs.push(`Line ${i + 1}: receipt required (${cat?.receiptRequired ? cat.name : 'above ' + st.receiptRequiredAbove})`);
  });
  return errs;
}

export function saveClaim(c: ExpenseClaim): ExpenseClaim {
  const lines = c.lines.map(recomputeLine);
  const totals = totalsOf(lines);
  const existing = db.find<ExpenseClaim>(C.expenseClaims, c.id);
  if (existing) return db.update<ExpenseClaim>(C.expenseClaims, c.id, { ...c, lines, totals }, { expectedVersion: existing.version });
  const number = engine.allocateNumber('Expense Claim', { date: c.date });
  const rec = db.insert<ExpenseClaim>(C.expenseClaims, { ...c, id: c.id, number, lines, totals, status: 'Draft', correlationId: c.correlationId || correlationId() });
  engine.audit({ action: 'expense.created', objectType: 'Expense Claim', objectId: rec.id, objectNumber: number, detail: `${c.employeeName} · ${totals.total}` });
  return rec;
}

export function submitClaim(c: ExpenseClaim): ExpenseClaim {
  const errs = validateClaim(c);
  if (errs.length) throw new ValidationError(errs[0], 'VALIDATION');
  const saved = saveClaim(c);
  // budget control (warn only at submission)
  const warnings = saved.lines.map((l) => checkBudget(l.accountId, l.amount, saved.date)).filter((r) => r.mode !== 'None' && r.message && !r.message.startsWith('Within'));
  return db.transaction(() => {
    const req = engine.submitForApproval({ docType: 'Expense Claim', collection: C.expenseClaims, docId: saved.id, docNumber: saved.number, amount: saved.totals.total, summary: `${saved.purpose} · ${saved.lines.length} line(s)`, department: saved.department });
    const now = new Date().toISOString();
    if (!req) {
      // no workflow → auto-approve and post
      db.update<ExpenseClaim>(C.expenseClaims, saved.id, { status: 'Approved', submittedAt: now, submittedBy: engine.ctx().userName, approvedAt: now, approvedBy: 'system (no workflow)' });
      engine.audit({ action: 'expense.submitted', objectType: 'Expense Claim', objectId: saved.id, objectNumber: saved.number, detail: 'No workflow applies — auto-approved' });
      return postClaim(db.find<ExpenseClaim>(C.expenseClaims, saved.id)!);
    }
    const out = db.update<ExpenseClaim>(C.expenseClaims, saved.id, { submittedAt: now, submittedBy: engine.ctx().userName, notes: warnings.length ? `Budget: ${warnings.map((w) => w.message).join(' | ')}` : saved.notes });
    return out;
  });
}

export function approveClaim(c: ExpenseClaim, comment?: string): ExpenseClaim {
  const req = db.find<any>(C.approvals, c.approvalId);
  if (req && req.status === 'Pending') engine.actOnApproval(req.id, 'Approve', { comment });
  const fresh = db.find<ExpenseClaim>(C.expenseClaims, c.id)!;
  if (fresh.status !== 'Approved') { db.update<ExpenseClaim>(C.expenseClaims, c.id, { status: 'Approved', approvedAt: new Date().toISOString(), approvedBy: engine.ctx().userName }); }
  return postClaim(db.find<ExpenseClaim>(C.expenseClaims, c.id)!);
}

export function rejectClaim(c: ExpenseClaim, reason: string): ExpenseClaim {
  const req = db.find<any>(C.approvals, c.approvalId);
  if (req && req.status === 'Pending') engine.actOnApproval(req.id, 'Reject', { comment: reason });
  const out = db.update<ExpenseClaim>(C.expenseClaims, c.id, { status: 'Rejected', rejectionReason: reason, approvedBy: engine.ctx().userName, approvedAt: new Date().toISOString() });
  engine.audit({ action: 'expense.rejected', objectType: 'Expense Claim', objectId: c.id, objectNumber: c.number, detail: reason });
  engine.notify({ type: 'approval', title: `${c.number} rejected`, body: reason, link: `budgets/expenses/${c.id}` });
  return out;
}

/** Post the approved claim: Dr expense accounts (+ input tax), Cr employee payable (open item) or corporate card liability. */
export function postClaim(c: ExpenseClaim): ExpenseClaim {
  if (c.journalId) return c;
  if (c.status !== 'Approved') throw new ValidationError('Only approved claims can be posted', 'INVALID_STATE');
  const st = expenseSettings();
  const date = c.approvedAt?.slice(0, 10) ?? today();
  const postDate = engine.postingCheck(date).ok ? date : today();
  return db.transaction(() => {
    const lines = c.lines.map((l) => ({ accountId: l.accountId, dr: l.amount, dimensions: { ...(c.dimensions ?? {}), ...l.dimensions }, narration: l.description || l.categoryName }));
    const tax = c.totals.tax;
    const taxLines = tax ? [{ accountId: IDS.accGSTInputCGST, dr: round(tax / 2), narration: 'Input CGST on expense' }, { accountId: IDS.accGSTInputSGST, dr: round(tax - tax / 2), narration: 'Input SGST on expense' }] : [];
    const card = c.paymentMethod === 'Corporate card';
    const credit = card
      // Corporate-card spend is a card liability (2350), never AP control and never the employee:
      // the company pays the card statement, so there is no party sub-ledger behind it (FR-EXP-004).
      ? { accountId: st.corporateCardAccountId ?? IDS.accCardPayable, cr: c.totals.total, narration: 'Corporate card — HDFC Business Card, settled with card statement' }
      : { accountId: st.employeePayableAccountId ?? IDS.accEmpPayable, cr: c.totals.total, partyType: 'Employee' as const, partyId: c.employeeId, partyName: c.employeeName, narration: `Reimbursable · ${c.number}` };
    const j = engine.postJournal({ date: postDate, branchId: c.branchId, sourceType: 'Expense Claim', sourceId: c.id, sourceNumber: c.number, narration: `Expense claim ${c.number} · ${c.employeeName} · ${c.purpose}`, lines: [...lines, ...taxLines, credit], idempotencyKey: `${c.id}:post`, correlationId: c.correlationId });
    let openItemId: string | undefined;
    if (!card) openItemId = engine.createOpenItem({ partyType: 'Employee', partyId: c.employeeId, partyName: c.employeeName, docType: 'Expense Claim', docId: c.id, docNumber: c.number, date: postDate, dueDate: postDate, currency: c.currency, originalAmount: c.totals.total, baseAmount: c.totals.total, rate: 1, direction: 'Debit', branchId: c.branchId }).id;
    const out = db.update<ExpenseClaim>(C.expenseClaims, c.id, { journalId: j.id, journalNumber: j.number, postedAt: new Date().toISOString(), openItemId, ...(card ? { status: 'Reimbursed', reimbursedAt: new Date().toISOString(), reimbursementMode: 'Card settlement', reimbursementRef: 'Corporate card statement' } : {}) });
    engine.audit({ action: 'expense.posted', objectType: 'Expense Claim', objectId: c.id, objectNumber: c.number, detail: `${j.number} · ${c.totals.total}${card ? ' · corporate card' : ' · employee payable'}`, correlationId: c.correlationId });
    engine.notify({ type: 'approval', title: `${c.number} approved & posted`, body: `${c.employeeName} · ${c.totals.total.toLocaleString('en-IN')}${card ? '' : ' · awaiting reimbursement'}`, link: `budgets/expenses/${c.id}` });
    return out;
  });
}

export function reimburseClaim(c: ExpenseClaim, input: { mode: 'Bank' | 'Payroll'; date: string; reference?: string; bankAccountId?: string }): ExpenseClaim {
  if (c.status !== 'Approved' || !c.journalId) throw new ValidationError('Claim must be approved and posted before reimbursement', 'INVALID_STATE');
  return db.transaction(() => {
    if (input.mode === 'Payroll') {
      // push to next period's payroll inputs
      const period = today().slice(0, 7);
      const input0 = db.findBy<any>(C.payrollInputs, (i) => i.employeeId === c.employeeId && i.period === period && i.status !== 'Locked');
      if (input0) db.update<any>(C.payrollInputs, input0.id, { reimbursements: round((input0.reimbursements ?? 0) + c.totals.total), reimbursementClaimIds: [...(input0.reimbursementClaimIds ?? []), c.id], status: 'Draft' });
      else db.insert(C.payrollInputs, { period, employeeId: c.employeeId, employeeName: c.employeeName, workingDays: 30, lopDays: 0, overtimeHours: 0, overtimeAmount: 0, reimbursements: c.totals.total, reimbursementClaimIds: [c.id], bonus: 0, arrears: 0, loanEmi: 0, otherDeductions: 0, status: 'Draft' });
      const out = db.update<ExpenseClaim>(C.expenseClaims, c.id, { reimbursementMode: 'Payroll', reimbursementRef: `Payroll ${period}`, notes: `Queued for payroll ${period}` });
      engine.audit({ action: 'expense.reimburse.payroll', objectType: 'Expense Claim', objectId: c.id, objectNumber: c.number, detail: `Queued in payroll inputs ${period}` });
      return out;
    }
    engine.assertPostable(input.date);
    const bank = input.bankAccountId ?? engine.ctx().company?.defaults.bankAccountId ?? IDS.accHDFC;
    const st = expenseSettings();
    const j = engine.postJournal({ date: input.date, branchId: c.branchId, sourceType: 'Reimbursement', sourceId: c.id, sourceNumber: c.number, narration: `Reimbursement of ${c.number} to ${c.employeeName}${input.reference ? ' · ' + input.reference : ''}`, lines: [{ accountId: st.employeePayableAccountId ?? IDS.accEmpPayable, dr: c.totals.total, partyType: 'Employee', partyId: c.employeeId, partyName: c.employeeName }, { accountId: bank, cr: c.totals.total, narration: input.reference ?? 'Bank transfer' }], idempotencyKey: `${c.id}:reimburse`, correlationId: c.correlationId });
    if (c.openItemId) engine.settleOpenItem(c.openItemId, { amount: c.totals.total, docType: 'Reimbursement', docId: j.id, docNumber: j.number, date: input.date });
    const out = db.update<ExpenseClaim>(C.expenseClaims, c.id, { status: 'Reimbursed', reimbursedAt: new Date().toISOString(), reimbursementMode: 'Bank', reimbursementRef: input.reference ?? j.number, reimbursementJournalId: j.id });
    engine.audit({ action: 'expense.reimbursed', objectType: 'Expense Claim', objectId: c.id, objectNumber: c.number, detail: `${j.number} · ${c.totals.total}`, correlationId: c.correlationId });
    engine.notify({ type: 'system', title: `${c.number} reimbursed`, body: `${c.totals.total.toLocaleString('en-IN')} paid to ${c.employeeName}`, link: `budgets/expenses/${c.id}`, userId: db.find<any>(C.employees, c.employeeId)?.userId });
    return out;
  });
}

export function returnToDraft(c: ExpenseClaim): ExpenseClaim {
  return db.update<ExpenseClaim>(C.expenseClaims, c.id, { status: 'Draft', approvalId: undefined, rejectionReason: undefined });
}
