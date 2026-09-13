// Payroll → ledger mapping (FR-PAY-004). Pure: returns posting lines for a run.
import { IDS } from '../../store/seed/core';
import type { PayrollRun, PayrollLine } from './types';

export interface PostingLine {
  accountId: string;
  dr?: number;
  cr?: number;
  partyType?: 'Customer' | 'Supplier' | 'Employee';
  partyId?: string;
  partyName?: string;
  dimensions?: Record<string, string>;
  narration?: string;
}

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export const DEPT_DIMENSION: Record<string, string> = {
  Finance: IDS.dimDeptFin,
  Accounts: IDS.dimDeptFin,
  Sales: IDS.dimDeptSales,
  Operations: IDS.dimDeptOps,
  Production: IDS.dimDeptProd,
  Admin: IDS.dimDeptAdmin,
  HR: IDS.dimDeptAdmin,
};

export function departmentDimension(department: string): string {
  return DEPT_DIMENSION[department] ?? IDS.dimDeptAdmin;
}

/** Ledger mapping shown on the run page. */
export const LEDGER_MAP = [
  { key: 'salaries', label: 'Salary expense (gross less reimbursements)', accountId: IDS.accSalaries, side: 'Dr', dims: 'Department (required)' },
  { key: 'reimb', label: 'Reimbursements paid via payroll', accountId: IDS.accEmpPayable, side: 'Dr', dims: '' },
  { key: 'employer', label: 'Employer PF & ESI contribution', accountId: IDS.accEmployerPF, side: 'Dr', dims: '' },
  { key: 'pf', label: 'PF payable (employee + employer)', accountId: IDS.accPFPayable, side: 'Cr', dims: '' },
  { key: 'esi', label: 'ESI payable (employee + employer)', accountId: IDS.accESIPayable, side: 'Cr', dims: '' },
  { key: 'pt', label: 'Professional tax payable', accountId: IDS.accPTPayable, side: 'Cr', dims: '' },
  { key: 'tds', label: 'TDS payable (section 192)', accountId: IDS.accTDSPayable, side: 'Cr', dims: '' },
  { key: 'loan', label: 'Loan / advance recovery', accountId: IDS.accEmpAdvance, side: 'Cr', dims: '' },
  { key: 'net', label: 'Salaries payable (per employee)', accountId: IDS.accSalaryPayable, side: 'Cr', dims: 'Employee party' },
] as const;

/** Build balanced posting lines for a payroll run. */
export function payrollPostingLines(run: Pick<PayrollRun, 'lines' | 'totals' | 'period'>): PostingLine[] {
  const out: PostingLine[] = [];
  // Dr salary expense by department dimension
  const byDept = new Map<string, { dept: string; amount: number }>();
  run.lines.forEach((l: PayrollLine) => {
    const dim = l.departmentDimId ?? departmentDimension(l.department);
    const cur = byDept.get(dim) ?? { dept: l.department, amount: 0 };
    cur.amount = r2(cur.amount + l.gross - l.reimbursements);
    byDept.set(dim, cur);
  });
  byDept.forEach((v, dim) => { if (v.amount) out.push({ accountId: IDS.accSalaries, dr: v.amount, dimensions: { Department: dim }, narration: `Salaries · ${v.dept}` }); });
  const t = run.totals;
  if (t.reimbursements) out.push({ accountId: IDS.accEmpPayable, dr: t.reimbursements, narration: 'Expense reimbursements paid via payroll' });
  if (t.employerTotal) out.push({ accountId: IDS.accEmployerPF, dr: t.employerTotal, narration: 'Employer PF & ESI' });
  const pfTotal = r2(t.pf + t.employerPf);
  const esiTotal = r2(t.esi + t.employerEsi);
  if (pfTotal) out.push({ accountId: IDS.accPFPayable, cr: pfTotal, narration: 'PF payable' });
  if (esiTotal) out.push({ accountId: IDS.accESIPayable, cr: esiTotal, narration: 'ESI payable' });
  if (t.pt) out.push({ accountId: IDS.accPTPayable, cr: t.pt, narration: 'Professional tax payable' });
  if (t.tds) out.push({ accountId: IDS.accTDSPayable, cr: t.tds, narration: 'TDS on salary (192)' });
  if (t.loan) out.push({ accountId: IDS.accEmpAdvance, cr: t.loan, narration: 'Loan / advance recovery' });
  if (t.otherDeductions) out.push({ accountId: IDS.accOtherIncome, cr: t.otherDeductions, narration: 'Other payroll recoveries' });
  run.lines.forEach((l) => { if (l.net) out.push({ accountId: IDS.accSalaryPayable, cr: l.net, partyType: 'Employee', partyId: l.employeeId, partyName: l.employeeName, narration: `Net pay ${run.period}` }); });
  const dr = r2(out.reduce((s, l) => s + (l.dr ?? 0), 0));
  const cr = r2(out.reduce((s, l) => s + (l.cr ?? 0), 0));
  const diff = r2(dr - cr);
  if (Math.abs(diff) >= 0.005) out.push(diff > 0 ? { accountId: IDS.accRoundOff, cr: diff, narration: 'Payroll rounding' } : { accountId: IDS.accRoundOff, dr: -diff, narration: 'Payroll rounding' });
  return out;
}
