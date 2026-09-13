// Fixed assets module types (FR-AST-001..005).
import type { BaseRecord, ID } from '../../store';

export type DepMethod = 'WDV' | 'SLM';
export type AssetStatus = 'New' | 'Active' | 'Fully Depreciated' | 'Disposed' | 'Draft';

export interface AssetCategory extends BaseRecord {
  companyId?: ID;
  code: string;
  name: string;
  method: DepMethod;
  ratePct: number;
  usefulLifeYears: number;
  assetAccountId: ID;
  depreciationAccountId: ID;
  accumulatedAccountId: ID;
  status: 'Active' | 'Inactive';
}

export interface AssetDisposalInfo {
  date: string;
  proceeds: number;
  buyer?: string;
  reason: string;
  nbvAtDisposal: number;
  accumulatedAtDisposal: number;
  gainLoss: number;
  journalId?: ID;
  journalNumber?: string;
  receiptAccountId?: ID;
}

export interface Asset extends BaseRecord {
  companyId?: ID;
  number: string;
  name: string;
  description?: string;
  categoryId: ID;
  categoryName: string;
  location: string;
  branchId?: ID;
  custodianId?: ID;
  custodianName?: string;
  acquisitionDate: string;
  capitalizationDate: string;
  inServiceDate: string;
  cost: number;
  residual: number;
  usefulLifeYears: number;
  method: DepMethod;
  ratePct: number;
  /** accumulated depreciation before books opened (part of ledger opening balance) */
  openingAccumulated: number;
  /** accumulated depreciation posted through runs since books opened */
  postedDepreciation: number;
  /** net revaluation (+) / impairment (−) applied to carrying amount */
  revaluation: number;
  impairment: number;
  assetAccountId: ID;
  depreciationAccountId: ID;
  accumulatedAccountId: ID;
  dimensions: Record<string, string>;
  supplierId?: ID;
  supplierName?: string;
  sourceType?: string;
  sourceId?: ID;
  sourceNumber?: string;
  journalId?: ID;
  journalNumber?: string;
  status: AssetStatus;
  disposal?: AssetDisposalInfo;
  quantity?: number;
  serialNo?: string;
  warrantyUntil?: string;
  notes?: string;
  correlationId?: string;
  approvalId?: ID;
}

export interface DepreciationLine {
  assetId: ID;
  assetNumber: string;
  assetName: string;
  categoryName: string;
  method: DepMethod;
  ratePct: number;
  openingNbv: number;
  depreciation: number;
  closingNbv: number;
  daysInService: number;
  daysInPeriod: number;
  dimensions: Record<string, string>;
  depreciationAccountId: ID;
  accumulatedAccountId: ID;
  note?: string;
}

export interface DepreciationRun extends BaseRecord {
  companyId?: ID;
  number: string;
  period: string;
  fy: string;
  status: 'Draft' | 'Posted' | 'Reversed';
  lines: DepreciationLine[];
  total: number;
  assetCount: number;
  journalId?: ID;
  journalNumber?: string;
  postedAt?: string;
  postedBy?: string;
  reversedById?: ID;
  reversalOfId?: ID;
  reversalReason?: string;
  branchId?: ID;
  correlationId?: string;
}

export type AssetEventType = 'Created' | 'Capitalized' | 'Depreciated' | 'Transferred' | 'Revalued' | 'Impaired' | 'Disposed' | 'Reversed';

export interface AssetEvent extends BaseRecord {
  companyId?: ID;
  assetId: ID;
  assetNumber: string;
  assetName: string;
  type: AssetEventType;
  date: string;
  detail: string;
  amount?: number;
  from?: string;
  to?: string;
  reason?: string;
  journalId?: ID;
  journalNumber?: string;
  by: string;
  approvalId?: ID;
  status?: 'Pending' | 'Approved' | 'Posted' | 'Rejected';
  meta?: Record<string, unknown>;
}
