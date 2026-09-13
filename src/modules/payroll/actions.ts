// Payroll run lifecycle (FR-PAY-002..005): calculate → finalize (freeze inputs, payslips) → post (journal) → bank file / reverse / off-cycle.
import { db, C, engine, ValidationError } from '../../store';
import type { Employee, Company } from '../../store';
import { round, today, toCSV, downloadText, fiscalYearOf } from '../../lib/format';
import type { PayrollRun, PayrollInput, SalaryStructure, Payslip, Loan, PayrollLine } from './types';
import { computeLine, sumLines, DEFAULT_PAYROLL_SETTINGS, periodLabel, daysInPeriod } from './calc';
import { departmentDimension, payrollPostingLines } from './posting';
import type { ExpenseClaim } from '../budgets/types';

export function payrollSettings() {
  return { ...DEFAULT_PAYROLL_SETTINGS, ...(engine.ctx().company?.defaults.payroll ?? {}) };
}

export function savePayrollSettings(patch: Partial<ReturnType<typeof payrollSettings>>) {
  const co = engine.ctx().company;
  if (!co) return;
  db.update<Company>(C.companies, co.id, { defaults: { ...co.defaults, payroll: { ...payrollSettings(), ...patch } } });
  engine.audit({ action: 'payroll.settings.updated', objectType: 'Company', objectId: co.id, detail: JSON.stringify(patch) });
}

/** Active structure for an employee at a period (effective-dated). */
export function structureFor(employeeId: string, period: string): SalaryStructure | undefined {
  const end = `${period}-${String(daysInPeriod(period)).padStart(2, '0')}`;
  return db.where<SalaryStructure>(C.salaryStructures, (x) => x.employeeId === employeeId && x.status !== 'Draft' && x.effectiveFrom <= end && (!x.effectiveTo || x.effectiveTo >= `${period}-01`)).sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0];
}

export function payrollEmployees(period: string): Employee[] {
  const cid = engine.ctx().companyId;
  const end = `${period}-${String(daysInPeriod(period)).padStart(2, '0')}`;
  return db.where<Employee>(C.employees, (e) => e.companyId === cid && e.dateOfJoining <= end && (!e.dateOfLeaving || e.dateOfLeaving >= `${period}-01`) && e.status !== 'Terminated');
}

export function inputFor(employeeId: string, period: string): PayrollInput | undefined {
  return db.findBy<PayrollInput>(C.payrollInputs, (i) => i.employeeId === employeeId && i.period === period);
}

/** Ensure an input row exists for every payroll employee of the period (draft). */
export function ensureInputs(period: string): PayrollInput[] {
  const settings = payrollSettings();
  return db.transaction(() => payrollEmployees(period).map((e) => {
    const existing = inputFor(e.id, period);
    if (existing) return existing;
    const loan = db.findBy<Loan>(C.loans, (l) => l.employeeId === e.id && l.status === 'Active' && l.schedule.some((r) => r.period === period && r.status === 'Pending'));
    const emi = loan?.schedule.find((r) => r.period === period)?.emi ?? 0;
    return db.insert<PayrollInput>(C.payrollInputs, { period, employeeId: e.id, employeeName: e.name, workingDays: settings.workingDaysPerMonth, lopDays: 0, overtimeHours: 0, overtimeAmount: 0, reimbursements: 0, reimbursementClaimIds: [], bonus: 0, arrears: 0, loanEmi: emi, loanId: loan?.id, otherDeductions: 0, status: 'Draft' });
  }));
}

/** Approved, posted, unreimbursed personal expense claims for an employee (available to push through payroll). */
export function reimbursableClaims(employeeId: string): ExpenseClaim[] {
  return db.where<ExpenseClaim>(C.expenseClaims, (c) => c.employeeId === employeeId && c.status === 'Approved' && !!c.journalId && c.paymentMethod === 'Personal' && !c.reimbursedAt);
}

export function calculateRun(run: PayrollRun, opts: { employeeIds?: string[]; label?: string } = {}): PayrollRun {
  const settings = payrollSettings();
  const emps = payrollEmployees(run.period).filter((e) => !opts.employeeIds || opts.employeeIds.includes(e.id));
  const lines: PayrollLine[] = [];
  const skipped: string[] = [];
  emps.forEach((e) => {
    const st = structureFor(e.id, run.period);
    if (!st) { skipped.push(e.name); return; }
    const input = run.type === 'Off-cycle' ? undefined : inputFor(e.id, run.period);
    const line = computeLine({ id: e.id, name: e.name, code: e.code, department: e.department, branchId: e.branchId, costCentreId: e.costCentreId, bankDetail: e.bankDetail }, st, input, settings, departmentDimension(e.department));
    if (run.type === 'Off-cycle') {
      // off-cycle (bonus / F&F): only one-off amounts from run lines already captured
      const prev = run.lines.find((l) => l.employeeId === e.id);
      const bonus = prev?.bonus ?? 0, arrears = prev?.arrears ?? 0;
      const gross = round(bonus + arrears);
      const tds = round(gross * ((st.tdsMonthly ?? 0) > 0 ? 0.1 : 0));
      lines.push({ ...line, workingDays: 0, paidDays: 0, lopDays: 0, earnings: {}, basic: 0, hra: 0, special: 0, otherEarnings: 0, overtime: 0, reimbursements: 0, bonus, arrears, gross, pf: 0, esi: 0, pt: 0, tds, loan: 0, otherDeductions: 0, deductions: tds, net: round(gross - tds), employerPf: 0, employerEsi: 0, note: prev?.note });
    } else lines.push(line);
  });
  const totals = sumLines(lines);
  const out = db.update<PayrollRun>(C.payrollRuns, run.id, { lines, totals, employeeCount: lines.length, status: 'Calculated', calculatedAt: new Date().toISOString(), notes: skipped.length ? `No salary structure: ${skipped.join(', ')}` : undefined });
  engine.audit({ action: 'payroll.run.calculated', objectType: 'Payroll Run', objectId: run.id, objectNumber: run.number, detail: `${lines.length} employees · gross ${totals.gross} · net ${totals.net}${skipped.length ? ' · skipped ' + skipped.join(', ') : ''}` });
  return out;
}

export function createRun(period: string, type: 'Regular' | 'Off-cycle' = 'Regular', label?: string): PayrollRun {
  if (type === 'Regular' && db.findBy<PayrollRun>(C.payrollRuns, (r) => r.period === period && r.type === 'Regular' && r.status !== 'Reversed')) throw new ValidationError(`A regular payroll run already exists for ${periodLabel(period)} — reverse it before creating another`, 'DUPLICATE');
  engine.assertPostable(`${period}-01`);
  const number = engine.allocateNumber('Payroll Run', { date: `${period}-01` });
  const c = engine.ctx();
  const run = db.insert<PayrollRun>(C.payrollRuns, { number, period, fy: fiscalYearOf(`${period}-01`, c.fyStartMonth), type, label, branchId: c.branchId, status: 'Draft', employeeCount: 0, lines: [], totals: sumLines([]), correlationId: `corr_${number}` });
  engine.audit({ action: 'payroll.run.created', objectType: 'Payroll Run', objectId: run.id, objectNumber: number, detail: `${type} · ${periodLabel(period)}` });
  if (type === 'Regular') { ensureInputs(period); return calculateRun(run); }
  return run;
}

export function finalizeRun(run: PayrollRun): PayrollRun {
  if (run.status !== 'Calculated') throw new ValidationError('Recalculate the run before finalizing', 'INVALID_STATE');
  if (!run.lines.length) throw new ValidationError('Run has no employees', 'EMPTY');
  return db.transaction(() => {
    const c = engine.ctx();
    const lines = run.lines.map((l) => {
      const emp = db.find<Employee>(C.employees, l.employeeId);
      const ps = db.insert<Payslip>(C.payslips, { number: `PS/${run.period}/${l.employeeCode}${run.type === 'Off-cycle' ? '-OC' : ''}`, runId: run.id, runNumber: run.number, period: run.period, employeeId: l.employeeId, employeeName: l.employeeName, employeeCode: l.employeeCode, department: l.department, designation: emp?.designation ?? '', pan: emp?.pan, uan: emp?.uan, bankMasked: l.bankMasked, line: l, status: 'Generated' });
      return { ...l, payslipId: ps.id };
    });
    if (run.type === 'Regular') {
      db.where<PayrollInput>(C.payrollInputs, (i) => i.period === run.period).forEach((i) => db.update<PayrollInput>(C.payrollInputs, i.id, { status: 'Locked', lockedByRunId: run.id }));
      // loan schedule recovery
      lines.forEach((l) => { if (!l.loan) return; const loan = db.findBy<Loan>(C.loans, (x) => x.employeeId === l.employeeId && x.status === 'Active'); if (!loan) return; const schedule = loan.schedule.map((r) => (r.period === run.period ? { ...r, status: 'Recovered' as const, runId: run.id } : r)); const recovered = round(loan.recovered + l.loan); const balance = round(loan.principal - recovered); db.update<Loan>(C.loans, loan.id, { schedule, recovered, balance, status: balance <= 0 ? 'Closed' : 'Active' }); });
      // reimbursed claims via payroll
      db.where<PayrollInput>(C.payrollInputs, (i) => i.period === run.period && i.reimbursementClaimIds.length > 0).forEach((i) => i.reimbursementClaimIds.forEach((cid) => { const claim = db.find<ExpenseClaim>(C.expenseClaims, cid); if (claim && !claim.reimbursedAt) db.update<ExpenseClaim>(C.expenseClaims, cid, { status: 'Reimbursed', reimbursedAt: new Date().toISOString(), reimbursementMode: 'Payroll', reimbursementRef: run.number }); }));
    }
    const out = db.update<PayrollRun>(C.payrollRuns, run.id, { lines, status: 'Finalized', finalizedAt: new Date().toISOString(), finalizedBy: c.userName });
    engine.audit({ action: 'payroll.run.finalized', objectType: 'Payroll Run', objectId: run.id, objectNumber: run.number, detail: `${lines.length} payslips generated · inputs frozen` });
    engine.notify({ type: 'system', title: `Payroll ${periodLabel(run.period)} finalized`, body: `${lines.length} payslips · net ${run.totals.net.toLocaleString('en-IN')}`, link: `payroll/runs/${run.id}` });
    return out;
  });
}

export function postRun(run: PayrollRun, paymentDate = today()): PayrollRun {
  if (run.status !== 'Finalized') throw new ValidationError('Finalize the run before posting', 'INVALID_STATE');
  const date = paymentDate;
  engine.assertPostable(date);
  return db.transaction(() => {
    const c = engine.ctx();
    const j = engine.postJournal({ date, branchId: run.branchId, sourceType: 'Payroll Run', sourceId: run.id, sourceNumber: run.number, narration: `Payroll ${periodLabel(run.period)}${run.type === 'Off-cycle' ? ' (off-cycle' + (run.label ? ': ' + run.label : '') + ')' : ''} · ${run.lines.length} employees`, lines: payrollPostingLines(run), idempotencyKey: `${run.id}:post`, correlationId: run.correlationId });
    // employee open items for net pay (settled by the bank file / payment)
    run.lines.forEach((l) => { if (l.net > 0) engine.createOpenItem({ partyType: 'Employee', partyId: l.employeeId, partyName: l.employeeName, docType: 'Payroll', docId: run.id, docNumber: `${run.number}/${l.employeeCode}`, date, dueDate: date, currency: c.currency, originalAmount: l.net, baseAmount: l.net, rate: 1, direction: 'Debit', branchId: run.branchId ?? c.branchId }); });
    const out = db.update<PayrollRun>(C.payrollRuns, run.id, { status: 'Posted', journalId: j.id, journalNumber: j.number, postedAt: new Date().toISOString(), postedBy: c.userName, paymentDate: date });
    engine.audit({ action: 'payroll.run.posted', objectType: 'Payroll Run', objectId: run.id, objectNumber: run.number, detail: `${j.number} · Dr ${j.totalDr} / Cr ${j.totalCr}`, correlationId: run.correlationId });
    engine.notify({ type: 'system', title: `Payroll ${periodLabel(run.period)} posted`, body: `${j.number} · net ${run.totals.net.toLocaleString('en-IN')}`, link: `payroll/runs/${run.id}` });
    return out;
  });
}

export function reverseRun(run: PayrollRun, reason: string): PayrollRun {
  if (run.status !== 'Posted' && run.status !== 'Finalized') throw new ValidationError('Only finalized or posted runs can be reversed', 'INVALID_STATE');
  return db.transaction(() => {
    let rev: PayrollRun | undefined;
    if (run.journalId) {
      const rj = engine.reverseJournal(run.journalId, { reason });
      rev = db.insert<PayrollRun>(C.payrollRuns, { number: `${run.number}-R`, period: run.period, fy: run.fy, type: run.type, label: `Reversal of ${run.number}`, branchId: run.branchId, status: 'Posted', employeeCount: run.employeeCount, lines: run.lines.map((l) => ({ ...l, payslipId: undefined })), totals: run.totals, journalId: rj.id, journalNumber: rj.number, postedAt: new Date().toISOString(), postedBy: engine.ctx().userName, reversalOfId: run.id, reversalReason: reason, correlationId: run.correlationId });
      db.where<any>(C.openItems, (o) => o.docType === 'Payroll' && o.docId === run.id && o.status === 'Open').forEach((o) => db.update<any>(C.openItems, o.id, { status: 'Written Off', outstanding: 0, baseOutstanding: 0 }));
    }
    run.lines.forEach((l) => { if (l.payslipId) db.update<Payslip>(C.payslips, l.payslipId, { status: 'Void', voidReason: reason }); });
    if (run.type === 'Regular') {
      db.where<PayrollInput>(C.payrollInputs, (i) => i.period === run.period && i.lockedByRunId === run.id).forEach((i) => db.update<PayrollInput>(C.payrollInputs, i.id, { status: 'Approved', lockedByRunId: undefined }));
      db.where<Loan>(C.loans, (l) => l.schedule.some((r) => r.runId === run.id)).forEach((loan) => { const schedule = loan.schedule.map((r) => (r.runId === run.id ? { ...r, status: 'Pending' as const, runId: undefined } : r)); const recovered = round(loan.recovered - loan.schedule.filter((r) => r.runId === run.id).reduce((s, r) => s + r.emi, 0)); db.update<Loan>(C.loans, loan.id, { schedule, recovered, balance: round(loan.principal - recovered), status: 'Active' }); });
    }
    const out = db.update<PayrollRun>(C.payrollRuns, run.id, { status: 'Reversed', reversedById: rev?.id, reversalReason: reason });
    engine.audit({ action: 'payroll.run.reversed', objectType: 'Payroll Run', objectId: run.id, objectNumber: run.number, detail: `${reason}${rev ? ' · reversal journal ' + rev.journalNumber : ''}`, correlationId: run.correlationId });
    return out;
  });
}

export function bankFile(run: PayrollRun, masked = true): string {
  const rows = run.lines.filter((l) => l.net > 0).map((l) => { const emp = db.find<Employee>(C.employees, l.employeeId); const acc = emp?.bankDetail?.accountNumber ?? ''; return { beneficiary: l.employeeName, code: l.employeeCode, bank: emp?.bankDetail?.bankName ?? '', account: masked ? (acc ? '••••' + acc.slice(-4) : '') : acc, ifsc: emp?.bankDetail?.ifsc ?? '', amount: l.net.toFixed(2), narration: `SAL ${run.period} ${l.employeeCode}`, mode: 'NEFT' }; });
  const csv = toCSV(rows);
  downloadText(`bank-file-${run.number}.csv`, csv);
  db.update<PayrollRun>(C.payrollRuns, run.id, { bankFileGeneratedAt: new Date().toISOString() });
  engine.audit({ action: 'payroll.bankfile', objectType: 'Payroll Run', objectId: run.id, objectNumber: run.number, detail: `${rows.length} beneficiaries · ${masked ? 'masked' : 'unmasked'} account numbers`, sensitive: !masked });
  return csv;
}

export function revealAudit(what: string, employeeId: string) {
  engine.audit({ action: 'payroll.reveal', objectType: 'Employee', objectId: employeeId, detail: `Revealed ${what}`, sensitive: true });
}
