// Group & consolidation types (FR-CNS-001..006, FR-RPT-012..014, FR-FX-014, FR-ORG-011/012).
// Consolidation artefacts live in their own collections (C.groups, C.consolidationRuns,
// C.consolidationJournals, C.intercompanyDocs) and are never written into legal-company journals.
import type { BaseRecord, ID } from '../../../store';

export type ConsolidationMethod = 'Full' | 'Proportional' | 'Equity';
export type RateType = 'Average' | 'Closing' | 'Historical';
export type AccountingStandard = 'Ind AS' | 'IFRS';
export type RunStatus = 'Draft' | 'Translated' | 'Adjusted' | 'Final' | 'Reversed';
export type PlBasis = 'YTD' | 'Period';

export interface GroupMember {
  companyId: ID;
  ownershipPct: number;
  from: string;
  to?: string;
  method: ConsolidationMethod;
}

export interface RatePolicy {
  income: RateType;
  balance: RateType;
  equity: RateType;
  /** account code → rate type (FR-RPT-013 account-specific rates) */
  accountOverrides: Record<string, RateType>;
}

export interface Group extends BaseRecord {
  code: string;
  name: string;
  tenantId: ID;
  consolidationCurrency: string;
  parentCompanyId: ID;
  members: GroupMember[];
  accountingStandard: AccountingStandard;
  ratePolicy: RatePolicy;
  status: 'Active' | 'Inactive';
  notes?: string;
}

export interface RateInfo {
  rate: number;
  type: string;
  source: string;
  at: string;
  /** set when the resolved rate had to fall back (e.g. no closing rate published) */
  note?: string;
  /** user override, audited */
  overridden?: { original: number; reason: string; by: string; at: string };
}

export interface RunCompany {
  companyId: ID;
  companyName: string;
  baseCurrency: string;
  ownershipPct: number;
  method: ConsolidationMethod;
  ownershipFrom: string;
  ownershipTo?: string;
  included: boolean;
  rateClosing: RateInfo;
  rateAverage: RateInfo;
  rateHistorical: RateInfo;
  ratesSource: string;
}

export interface TranslatedLine {
  id: ID;
  companyId: ID;
  accountId?: ID;
  accountCode: string;
  accountName: string;
  type: 'Asset' | 'Liability' | 'Equity' | 'Income' | 'Expense';
  groupCode: string;
  groupName: string;
  sourceCurrency: string;
  /** Dr-positive amount in the company's base currency (after ownership factor for proportional method) */
  sourceAmount: number;
  ownershipFactor: number;
  rateType: RateType | 'Same';
  rate: number;
  /** Dr-positive amount in consolidation currency */
  translatedAmount: number;
  /** synthetic lines (retained earnings roll-forward, equity-method investment) carry a note */
  note?: string;
}

export interface ConsolidationJournalLine {
  id: ID;
  accountCode: string;
  accountName: string;
  dr: number;
  cr: number;
  narration?: string;
}

/** Group-level adjustment journal (FR-CNS-004): separate collection, workflow + audit, never in C.journals. */
export interface ConsolidationJournal extends BaseRecord {
  runId: ID;
  groupId: ID;
  number: string;
  date: string;
  period: string;
  currency: string;
  reason: string;
  lines: ConsolidationJournalLine[];
  totalDr: number;
  totalCr: number;
  status: 'Draft' | 'Submitted' | 'Approved' | 'Rejected' | 'Returned' | 'Posted' | 'Reversed';
  approvalId?: ID;
  workflowNote?: string;
  postedAt?: string;
  postedBy?: string;
  reversedById?: ID;
  reversalOfId?: ID;
  reversalReason?: string;
}

export type EliminationKind = 'Intercompany balance' | 'Intercompany trading' | 'Unrealised profit' | 'Manual';
export type EliminationStatus = 'Proposed' | 'Accepted' | 'Rejected' | 'Reversed';

export interface Elimination {
  id: ID;
  pairRef: string;
  kind: EliminationKind;
  description: string;
  drCompanyId?: ID;
  drAccountCode: string;
  drAccountName: string;
  drAmount: number;
  crCompanyId?: ID;
  crAccountCode: string;
  crAccountName: string;
  crAmount: number;
  /** drAmount − crAmount, booked to differenceAccountCode so the elimination balances */
  fxDifference: number;
  differenceAccountCode: string;
  /** display amount (= drAmount) */
  amount: number;
  sourceDocs: { id: ID; number: string; type: string; date: string; amount: number; currency: string; matchStatus: string }[];
  status: EliminationStatus;
  reversible: true;
  reason?: string;
  warning?: string;
  actedBy?: string;
  actedAt?: string;
}

export interface BooksSnapshot {
  companyId: ID;
  journals: number;
  totalDr: number;
  totalCr: number;
  lastPostedAt?: string;
  at: string;
}

export interface RunLogEntry { at: string; by: string; action: string; detail?: string }

export interface ConsolidationRun extends BaseRecord {
  groupId: ID;
  number: string;
  /** yyyy-mm when created for a single period */
  period?: string;
  from: string;
  to: string;
  plBasis: PlBasis;
  currency: string;
  accountingStandard: AccountingStandard;
  status: RunStatus;
  /** re-run version of the same period; BaseRecord.version is the concurrency token */
  runVersion: number;
  supersedesId?: ID;
  supersededById?: ID;
  companies: RunCompany[];
  translatedLines: TranslatedLine[];
  /** translation adjustment (Dr-positive sum of translated lines; positive = credit reserve) */
  cta: number;
  ctaByCompany: Record<ID, number>;
  /** consolidation journal ids */
  adjustments: ID[];
  eliminations: Elimination[];
  /** consolidated totals by account-group code, in consolidation currency (Dr-positive) */
  totals: Record<string, number>;
  approvalId?: ID;
  createdBy?: string;
  translatedAt?: string;
  finalizedAt?: string;
  finalizedBy?: string;
  reversedAt?: string;
  reversalReason?: string;
  booksAtTranslate: BooksSnapshot[];
  booksAtFinal?: BooksSnapshot[];
  log: RunLogEntry[];
}

export type IcDocType = 'Invoice' | 'Payment' | 'Journal';
export type IcMatchStatus = 'Unmatched' | 'Matched' | 'Difference';

export interface IntercompanyDifference {
  expectedTo: number;
  actualTo: number;
  diffTo: number;
  toCurrency: string;
  explanation: string[];
}

/** Intercompany document (FR-ORG-012, FR-CNS-005): both entities, due-to/due-from, matching reference, journals on each side. */
export interface IntercompanyDoc extends BaseRecord {
  type: IcDocType;
  number: string;
  fromCompanyId: ID;
  toCompanyId: ID;
  date: string;
  currency: string;
  amount: number;
  baseCurrencyFrom: string;
  baseCurrencyTo: string;
  rateFrom: number;
  rateTo: number;
  baseAmountFrom: number;
  baseAmountTo: number;
  counterpartyRef: string;
  narration?: string;
  matchStatus: IcMatchStatus;
  matchedAt?: string;
  matchedBy?: string;
  /** account ids on each side */
  dueFromAccount: ID;
  dueToAccount: ID;
  sourceJournalIds: { from?: ID; to?: ID };
  sourceJournalNumbers?: { from?: string; to?: string };
  difference?: IntercompanyDifference;
  eliminationIds?: ID[];
}
