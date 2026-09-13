// Payroll module types (FR-PAY-001..005).
import type { BaseRecord, ID } from '../../store';

export type ComponentType = 'Earning' | 'Deduction' | 'EmployerContribution';
export type ComponentBasis = 'Amount' | 'PctOfBasic' | 'PctOfGross';

export interface SalaryComponent {
  code: string;
  name: string;
  type: ComponentType;
  basis: ComponentBasis;
  value: number;
  taxable?: boolean;
}

export interface SalaryStructure extends BaseRecord {
  companyId?: ID;
  employeeId: ID;
  employeeName: string;
  employeeCode: string;
  effectiveFrom: string;
  effectiveTo?: string;
  version: number;
  structureVersion: number;
  components: SalaryComponent[];
  pf: boolean;
  esi: boolean;
  pt: boolean;
  taxRegime: 'Old' | 'New';
  /** monthly TDS estimate (section 192) */
  tdsMonthly: number;
  monthlyGross: number;
  monthlyCtc: number;
  annualCtc: number;
  status: 'Active' | 'Superseded' | 'Draft';
  supersededById?: ID;
  revisionOfId?: ID;
  notes?: string;
}

export interface PayrollInput extends BaseRecord {
  companyId?: ID;
  period: string;
  employeeId: ID;
  employeeName: string;
  workingDays: number;
  lopDays: number;
  overtimeHours: number;
  overtimeAmount: number;
  reimbursements: number;
  reimbursementClaimIds: ID[];
  bonus: number;
  arrears: number;
  loanEmi: number;
  loanId?: ID;
  otherDeductions: number;
  otherDeductionNote?: string;
  status: 'Draft' | 'Approved' | 'Locked';
  approvedBy?: string;
  approvedAt?: string;
  lockedByRunId?: ID;
}

export interface PayrollLine {
  employeeId: ID;
  employeeName: string;
  employeeCode: string;
  department: string;
  departmentDimId?: ID;
  costCentreId?: ID;
  branchId?: ID;
  structureId?: ID;
  workingDays: number;
  paidDays: number;
  lopDays: number;
  earnings: Record<string, number>;
  basic: number;
  hra: number;
  special: number;
  otherEarnings: number;
  overtime: number;
  reimbursements: number;
  bonus: number;
  arrears: number;
  gross: number;
  pf: number;
  esi: number;
  pt: number;
  tds: number;
  loan: number;
  otherDeductions: number;
  deductions: number;
  net: number;
  employerPf: number;
  employerEsi: number;
  payslipId?: ID;
  bankMasked?: string;
  note?: string;
}

export interface PayrollTotals {
  basic: number;
  hra: number;
  special: number;
  otherEarnings: number;
  overtime: number;
  reimbursements: number;
  bonus: number;
  arrears: number;
  gross: number;
  pf: number;
  esi: number;
  pt: number;
  tds: number;
  loan: number;
  otherDeductions: number;
  deductions: number;
  net: number;
  employerPf: number;
  employerEsi: number;
  employerTotal: number;
}

export interface PayrollRun extends BaseRecord {
  companyId?: ID;
  number: string;
  period: string;
  fy: string;
  type: 'Regular' | 'Off-cycle';
  label?: string;
  branchId?: ID;
  status: 'Draft' | 'Calculated' | 'Finalized' | 'Posted' | 'Reversed';
  employeeCount: number;
  lines: PayrollLine[];
  totals: PayrollTotals;
  journalId?: ID;
  journalNumber?: string;
  calculatedAt?: string;
  finalizedAt?: string;
  finalizedBy?: string;
  postedAt?: string;
  postedBy?: string;
  reversedById?: ID;
  reversalOfId?: ID;
  reversalReason?: string;
  bankFileGeneratedAt?: string;
  paymentDate?: string;
  correlationId?: string;
  notes?: string;
}

export interface Payslip extends BaseRecord {
  companyId?: ID;
  number: string;
  runId: ID;
  runNumber: string;
  period: string;
  employeeId: ID;
  employeeName: string;
  employeeCode: string;
  department: string;
  designation: string;
  pan?: string;
  uan?: string;
  bankMasked?: string;
  line: PayrollLine;
  status: 'Generated' | 'Emailed' | 'Void';
  emailedAt?: string;
  voidReason?: string;
}

export interface LoanScheduleRow { period: string; emi: number; principal: number; interest: number; balance: number; status: 'Pending' | 'Recovered' | 'Skipped'; runId?: ID }

export interface Loan extends BaseRecord {
  companyId?: ID;
  number: string;
  employeeId: ID;
  employeeName: string;
  type: 'Loan' | 'Advance';
  principal: number;
  interestPct: number;
  emi: number;
  months: number;
  startPeriod: string;
  balance: number;
  recovered: number;
  status: 'Active' | 'Closed';
  schedule: LoanScheduleRow[];
  journalId?: ID;
  journalNumber?: string;
  disbursedOn?: string;
  purpose?: string;
}

export interface StatutoryFiling {
  key: string;
  kind: 'PF' | 'ESI' | 'PT' | 'TDS';
  label: string;
  period: string;
  employee: number;
  employer: number;
  dueDate: string;
}
