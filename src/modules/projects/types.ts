// Projects & Contracts (Services profile) domain types — FR-SRV-001..007.
// Documents extend DocHeader; masters extend BaseRecord. Collections live in
// store/collections.ts (services, contracts, projects, timesheets, milestones,
// resources, rateCards, billingRuns, retainers, revenueSchedules).
import type { BaseRecord, CompanyDefaults, DocHeader, ID } from '../../store';

export type ServiceUnit = 'Hr' | 'Day' | 'Month' | 'Fixed';

/** Service catalog entry — mirrors an Item of type 'Service' (FR-SRV-001). */
export interface Service extends BaseRecord {
  itemId: ID;
  code: string;
  name: string;
  description?: string;
  sac?: string;
  unit: ServiceUnit;
  defaultRate: number;
  taxRateId?: ID;
  revenueAccountId?: ID;
  billableDefault: boolean;
  status: 'Active' | 'Inactive';
}

export type BillingMethod = 'Fixed price' | 'Time & material' | 'Milestone' | 'Recurring' | 'Usage' | 'Cost plus';
export const BILLING_METHODS: BillingMethod[] = ['Fixed price', 'Time & material', 'Milestone', 'Recurring', 'Usage', 'Cost plus'];

export type ContractStatus = 'Draft' | 'Submitted' | 'Approved' | 'Returned' | 'Rejected' | 'Active' | 'Completed' | 'Cancelled';
export type RecurrenceFrequency = 'Monthly' | 'Quarterly' | 'Yearly';
export type RevenueMethod = 'Auto' | 'Hours' | 'Percent complete' | 'Milestone' | 'Straight-line' | 'Usage';

export interface RateRow { role: string; rate: number }
export interface UsageTier { upTo: number; rate: number }

/** Contract / SOW (FR-SRV-002). `partyId` is the customer; `sourceId` unused. */
export interface Contract extends DocHeader {
  docType: 'Contract';
  status: ContractStatus;
  customerId: ID;
  projectId?: ID;
  title: string;
  billingMethod: BillingMethod;
  /** contract value (fixed / milestone / cap for T&M) in contract currency */
  amount: number;
  /** T&M: rate card or per-role rates; cap in hours / amount */
  rateCardId?: ID;
  rates?: RateRow[];
  capHours?: number;
  capAmount?: number;
  /** Recurring */
  recurrence?: { amount: number; frequency: RecurrenceFrequency; nextBillDate: string; endDate?: string };
  /** Usage */
  usage?: { metric: string; unit: string; unitRate: number; tiers?: UsageTier[] };
  /** Cost plus */
  markupPct?: number;
  start: string;
  end?: string;
  taxRateId?: ID;
  serviceItemId?: ID;
  revenueMethod: RevenueMethod;
  /** Fixed price % complete history: period → cumulative pct */
  progress?: { period: string; pct: number; note?: string }[];
  activatedAt?: string;
  activatedBy?: string;
  completedAt?: string;
  approvedAt?: string;
  approvedBy?: string;
  /** last billed recurring period (yyyy-mm) — duplicate guard */
  lastRecurringPeriod?: string;
}

export type ProjectStatus = 'Planned' | 'Active' | 'On Hold' | 'Completed' | 'Cancelled';

export interface Project extends BaseRecord {
  code: string;
  name: string;
  description?: string;
  customerId: ID;
  customerName?: string;
  contractId?: ID;
  managerEmployeeId?: ID;
  start: string;
  end?: string;
  budgetHours: number;
  budgetAmount: number;
  status: ProjectStatus;
  /** Project dimension id in C.dimensions (type 'Project') so journals can carry it */
  dimensionId: ID;
  teamEmployeeIds: ID[];
  branchId?: ID;
  statusHistory?: { at: string; by: string; from: string; to: string; reason?: string }[];
}

export interface Resource extends BaseRecord {
  employeeId: ID;
  employeeName: string;
  role: string;
  costRate: number;
  billRate: number;
  capacityHoursPerWeek: number;
  status: 'Active' | 'Inactive';
}

export interface RateCard extends BaseRecord {
  code: string;
  name: string;
  currency: string;
  rows: RateRow[];
  validFrom?: string;
  validTo?: string;
  status: 'Active' | 'Inactive';
}

export type TimesheetStatus = 'Draft' | 'Submitted' | 'Approved' | 'Rejected' | 'Returned' | 'Invoiced';

export interface TimesheetRow {
  id: ID;
  projectId: ID;
  task: string;
  /** 7 day cells starting at weekStart */
  hours: number[];
  billable: boolean;
  notes?: string;
  serviceId?: ID;
  /** invoice that billed this row (T&M / cost plus) */
  invoiceId?: ID;
  invoiceNumber?: string;
  invoicedAt?: string;
}

/** Weekly timesheet (FR-SRV-003). Approval via workflow 'Timesheet' (wf_ts). */
export interface Timesheet extends BaseRecord {
  number: string;
  docType: 'Timesheet';
  employeeId: ID;
  employeeName: string;
  weekStart: string;
  rows: TimesheetRow[];
  totalHours: number;
  billableHours: number;
  status: TimesheetStatus;
  branchId: ID;
  approvalId?: ID;
  submittedAt?: string;
  submittedBy?: string;
  approvedAt?: string;
  approvedBy?: string;
  rejectedAt?: string;
  rejectionReason?: string;
  invoicedInvoiceId?: ID;
  invoicedAt?: string;
  source: 'Web' | 'Import';
  correlationId?: string;
}

export type MilestoneStatus = 'Pending' | 'Achieved' | 'Invoiced';

export interface Milestone extends BaseRecord {
  contractId: ID;
  projectId?: ID;
  kind: 'Milestone' | 'Instalment';
  order: number;
  name: string;
  amount: number;
  due: string;
  status: MilestoneStatus;
  achievedAt?: string;
  achievedBy?: string;
  invoiceId?: ID;
  invoiceNumber?: string;
  invoicedAt?: string;
  deliverable?: string;
}

export interface UsageRecord extends BaseRecord {
  contractId: ID;
  metric: string;
  qty: number;
  rate: number;
  amount: number;
  /** yyyy-mm */
  period: string;
  date: string;
  notes?: string;
  invoiced: boolean;
  invoiceId?: ID;
  invoiceNumber?: string;
  source: 'Web' | 'Import';
}

export type BillableExpenseStatus = 'Ready' | 'Invoiced' | 'Excluded';

/** A claim line flagged billable to a project (FR-SRV-003). */
export interface BillableExpense extends BaseRecord {
  claimId: ID;
  claimNumber: string;
  lineId: ID;
  employeeId: ID;
  employeeName: string;
  projectId: ID;
  contractId?: ID;
  date: string;
  description: string;
  amount: number;
  markupPct: number;
  billAmount: number;
  status: BillableExpenseStatus;
  invoiceId?: ID;
  invoiceNumber?: string;
  invoicedAt?: string;
  approvedBy?: string;
}

export interface BillingResult {
  contractId: ID;
  contractNumber: string;
  customerId: ID;
  customerName: string;
  method: BillingMethod;
  currency: string;
  amount: number;
  /** taxable amount billed (excl tax) */
  taxable: number;
  invoiceId?: ID;
  invoiceNumber?: string;
  retainerApplied?: number;
  skipped?: string;
  sources: number;
}

export interface BillingRun extends BaseRecord {
  number: string;
  period: string;
  from: string;
  to: string;
  date: string;
  contractIds: ID[];
  results: BillingResult[];
  invoiceIds: ID[];
  status: 'Generated' | 'Cancelled';
  by: string;
  applyRetainer: boolean;
  branchId: ID;
  notes?: string;
}

export interface RetainerAllocation {
  id: ID;
  invoiceId: ID;
  invoiceNumber: string;
  amount: number;
  date: string;
  journalId?: ID;
  journalNumber?: string;
  /** Pending = applied to a draft invoice; settles when the invoice posts */
  status: 'Pending' | 'Settled' | 'Reversed';
}

/** Retainer / advance received from a customer (FR-SRV-005). */
export interface Retainer extends BaseRecord {
  number: string;
  customerId: ID;
  customerName: string;
  contractId?: ID;
  amount: number;
  currency: string;
  rate: number;
  baseAmount: number;
  receivedDate: string;
  bankAccountId: ID;
  reference?: string;
  notes?: string;
  journalId?: ID;
  journalNumber?: string;
  openItemId?: ID;
  allocations: RetainerAllocation[];
  allocated: number;
  remaining: number;
  status: 'Open' | 'Fully allocated' | 'Reversed';
  branchId: ID;
  reversedById?: ID;
  reversalReason?: string;
}

/** Revenue schedule row per contract × period (FR-SRV-006). */
export interface RevenueSchedule extends BaseRecord {
  contractId: ID;
  contractNumber: string;
  projectId?: ID;
  customerId: ID;
  period: string;
  method: BillingMethod;
  /** period amounts (base currency) */
  billed: number;
  recognized: number;
  /** cumulative position at period end */
  cumBilled: number;
  cumRecognized: number;
  unbilled: number;
  deferred: number;
  /** prior-period adjustment reversed at the start of this period */
  reversed: number;
  /** adjustment journal for this period (accrual or deferral) */
  journalId?: ID;
  journalNumber?: string;
  adjustmentType?: 'Accrual' | 'Deferral' | 'None';
  adjustment: number;
  /** reversal of the prior period's adjustment, dated first day of this period */
  reversalJournalId?: ID;
  reversalJournalNumber?: string;
  status: 'Posted' | 'Reversed';
  runAt: string;
  runBy: string;
  idempotencyKey: string;
  reversedById?: ID;
  reversalReason?: string;
}

/** Additive, module-owned settings on company.defaults. */
export interface ProjectsSettings {
  prjOverheadPct: number;
  prjDefaultRateCardId?: ID;
  prjWeekStart: 'Mon' | 'Sun';
  prjTimesheetApproval: boolean;
  prjRevenueMethodDefault: RevenueMethod;
  prjDefaultServiceItemId?: ID;
  prjExpenseMarkupPct: number;
  prjRetainerAutoApply: boolean;
  prjContractApproval: boolean;
}

export const PROJECTS_SETTINGS_DEFAULTS: ProjectsSettings = {
  prjOverheadPct: 12,
  prjDefaultRateCardId: 'rc_std',
  prjWeekStart: 'Mon',
  prjTimesheetApproval: true,
  prjRevenueMethodDefault: 'Auto',
  prjDefaultServiceItemId: 'item_consult',
  prjExpenseMarkupPct: 10,
  prjRetainerAutoApply: true,
  prjContractApproval: true,
};

export function projectsSettingsOf(defaults?: CompanyDefaults): ProjectsSettings {
  const d = (defaults ?? {}) as Partial<ProjectsSettings> & CompanyDefaults;
  return {
    prjOverheadPct: d.prjOverheadPct ?? PROJECTS_SETTINGS_DEFAULTS.prjOverheadPct,
    prjDefaultRateCardId: d.prjDefaultRateCardId ?? PROJECTS_SETTINGS_DEFAULTS.prjDefaultRateCardId,
    prjWeekStart: d.prjWeekStart ?? PROJECTS_SETTINGS_DEFAULTS.prjWeekStart,
    prjTimesheetApproval: d.prjTimesheetApproval ?? PROJECTS_SETTINGS_DEFAULTS.prjTimesheetApproval,
    prjRevenueMethodDefault: d.prjRevenueMethodDefault ?? PROJECTS_SETTINGS_DEFAULTS.prjRevenueMethodDefault,
    prjDefaultServiceItemId: d.prjDefaultServiceItemId ?? PROJECTS_SETTINGS_DEFAULTS.prjDefaultServiceItemId,
    prjExpenseMarkupPct: d.prjExpenseMarkupPct ?? PROJECTS_SETTINGS_DEFAULTS.prjExpenseMarkupPct,
    prjRetainerAutoApply: d.prjRetainerAutoApply ?? PROJECTS_SETTINGS_DEFAULTS.prjRetainerAutoApply,
    prjContractApproval: d.prjContractApproval ?? PROJECTS_SETTINGS_DEFAULTS.prjContractApproval,
  };
}

export const ROLES = ['Project manager', 'Solution architect', 'Senior consultant', 'Consultant', 'Business analyst', 'Engineer', 'Junior consultant', 'Finance lead'];

export const ACC = {
  unbilled: 'acc_1160',
  deferred: 'acc_2400',
  retainers: 'acc_2160',
  serviceRev: 'acc_4010',
  ar: 'acc_1100',
  salaries: 'acc_5100',
  hdfc: 'acc_1310',
};
