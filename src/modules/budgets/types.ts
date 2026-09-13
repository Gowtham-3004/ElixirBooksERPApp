// Budgets & expenses module types (FR-BUD-001..003, FR-EXP-001/002).
import type { BaseRecord, ID } from '../../store';

export interface BudgetLine {
  id: string;
  accountId: ID;
  accountCode: string;
  accountName: string;
  accountType: string;
  groupId?: ID;
  /** 12 monthly amounts starting at FY start month */
  months: number[];
  total: number;
}

export interface Budget extends BaseRecord {
  companyId?: ID;
  code: string;
  name: string;
  fy: string;
  fyStart: string;
  version: number;
  revision: number;
  status: 'Draft' | 'Approved' | 'Superseded' | 'Rejected';
  scope: { branchId?: ID; departmentId?: ID; costCentreId?: ID; projectId?: ID };
  lines: BudgetLine[];
  totalIncome: number;
  totalExpense: number;
  approvedBy?: string;
  approvedAt?: string;
  supersededById?: ID;
  revisionOfId?: ID;
  notes?: string;
  approvalId?: ID;
}

export type ControlMode = 'Warn' | 'Block' | 'Override';

export interface BudgetRule extends BaseRecord {
  companyId?: ID;
  groupId: ID;
  groupName: string;
  mode: ControlMode;
  thresholdPct: number;
  includeCommitted: boolean;
  status: 'Active' | 'Inactive';
  notes?: string;
}

export interface ExpenseCategory extends BaseRecord {
  companyId?: ID;
  code: string;
  name: string;
  accountId: ID;
  accountName?: string;
  receiptRequired: boolean;
  taxRateId?: ID;
  perDiem?: number;
  status: 'Active' | 'Inactive';
}

export interface ExpenseLine {
  id: string;
  date: string;
  categoryId: ID;
  categoryName: string;
  accountId: ID;
  description: string;
  amount: number;
  taxRateId?: ID;
  taxRate: number;
  tax: number;
  total: number;
  dimensions: Record<string, string>;
  receiptAttachmentId?: ID;
  hasReceipt?: boolean;
}

export type ClaimStatus = 'Draft' | 'Submitted' | 'Approved' | 'Rejected' | 'Returned' | 'Reimbursed';

export interface ExpenseClaim extends BaseRecord {
  companyId?: ID;
  number: string;
  docType: 'Expense Claim';
  date: string;
  branchId: ID;
  employeeId: ID;
  employeeName: string;
  employeeCode?: string;
  department?: string;
  purpose: string;
  status: ClaimStatus | string;
  lines: ExpenseLine[];
  totals: { amount: number; tax: number; total: number };
  currency: string;
  paymentMethod: 'Personal' | 'Corporate card';
  dimensions?: Record<string, string>;
  approvalId?: ID;
  journalId?: ID;
  journalNumber?: string;
  openItemId?: ID;
  submittedAt?: string;
  submittedBy?: string;
  approvedAt?: string;
  approvedBy?: string;
  postedAt?: string;
  reimbursedAt?: string;
  reimbursementRef?: string;
  reimbursementMode?: 'Bank' | 'Payroll' | 'Card settlement';
  reimbursementJournalId?: ID;
  rejectionReason?: string;
  attachmentIds?: ID[];
  correlationId: string;
  notes?: string;
  idempotencyKey?: string;
}

export interface BudgetCheckResult {
  ok: boolean;
  mode: ControlMode | 'None';
  message?: string;
  needsApproval?: boolean;
  budget: number;
  actual: number;
  committed: number;
  available: number;
  utilizationPct: number;
  accountCode?: string;
  ruleId?: string;
}
