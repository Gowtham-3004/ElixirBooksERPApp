// Banking types (FR-BNK-001/002, FR-REC-001..006).
import type { BaseRecord, DocHeader, ID } from '../../store';

/** Additive banking settings kept on company.defaults (read through bankingSettings()). */
export interface BankingSettings {
  reconToleranceDays: number;
  reconToleranceAmt: number;
  reconAutoSuggestThreshold: number;
}

export type VoucherType = 'Deposit' | 'Withdrawal' | 'Contra' | 'Receipt' | 'Payment' | 'Transfer';

export interface BankVoucher extends DocHeader {
  docType: 'Bank Voucher';
  status: 'Draft' | 'Posted' | 'Reversed' | 'Cancelled';
  voucherType: VoucherType;
  /** the bank/cash account the voucher moves money through */
  bankAccountId: ID;
  bankAccountName: string;
  /** other side of the entry (bank/cash for contra, income/expense/party control otherwise) */
  counterAccountId: ID;
  counterAccountName: string;
  amount: number;
  method?: 'NEFT' | 'RTGS' | 'IMPS' | 'Cheque' | 'UPI' | 'Cash' | 'Internal';
  instrumentRef?: string;
  narration: string;
  statementLineId?: ID;
}

export interface StatementFormat {
  name: string;
  dateCol: string;
  descCol: string;
  refCol: string;
  debitCol: string;
  creditCol: string;
  balanceCol?: string;
  dateFormat: 'YYYY-MM-DD' | 'DD/MM/YYYY' | 'DD-MM-YYYY' | 'MM/DD/YYYY';
}

export interface BankStatement extends BaseRecord {
  bankAccountId: ID;
  bankAccountName: string;
  fileName: string;
  fingerprint: string;
  periodFrom: string;
  periodTo: string;
  currency: string;
  openingBalance: number;
  closingBalance: number;
  lineCount: number;
  totalDebit: number;
  totalCredit: number;
  status: 'Imported' | 'Partially Reconciled' | 'Reconciled';
  importedBy: string;
  importedAt: string;
  format?: StatementFormat;
  reconciliationId?: ID;
}

export interface StatementLine extends BaseRecord {
  statementId: ID;
  bankAccountId: ID;
  date: string;
  description: string;
  reference?: string;
  debit: number;
  credit: number;
  balance?: number;
  fingerprint: string;
  status: 'Unmatched' | 'Matched' | 'Excluded';
  /** journal ids cleared by this line (1:n / n:1 share a matchGroupId) */
  matchedJournalIds?: ID[];
  /** document number(s) for display / runtime lookup when journals are seeded elsewhere */
  matchedDocNumber?: string;
  matchGroupId?: string;
  matchedAt?: string;
  matchedBy?: string;
  matchConfidence?: number;
  matchReason?: string;
  reconciliationId?: ID;
}

export interface Reconciliation extends BaseRecord {
  number: string;
  bankAccountId: ID;
  bankAccountName: string;
  periodFrom: string;
  periodTo: string;
  statementId?: ID;
  statementBalance: number;
  bookBalance: number;
  clearedCount: number;
  clearedAmount: number;
  unmatchedStatement: { id: ID; date: string; description: string; amount: number }[];
  unmatchedBook: { journalId: ID; number: string; date: string; amount: number; narration?: string }[];
  adjustments: { voucherId: ID; number: string; amount: number; narration: string }[];
  difference: number;
  status: 'Draft' | 'Confirmed';
  confirmedBy?: string;
  confirmedAt?: string;
  notes?: string;
}
