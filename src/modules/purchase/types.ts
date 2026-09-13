// Purchase & payables document types (FR-PUR-001..040, FR-AP-001, FR-PMT-001..003).
// All documents extend DocHeader; masters are referenced by id and snapshotted at posting.
import type { BaseRecord, DocHeader, DocLine, ID } from '../../store';

/** Additive purchase settings kept on company.defaults (read through purchaseSettings()). */
export interface PurchaseSettings {
  matchingMode: '2-way' | '3-way' | '4-way';
  matchTolerancePct: number;
  matchToleranceAmt: number;
  overReceiptTolerancePct: number;
  blockOnException: boolean;
  duplicateInvoiceScope: 'Supplier' | 'Supplier+FY' | 'Company';
  directInvoiceStock: boolean;
  /** Goods-received-not-invoiced accrual account (2110) — GRNs credit this, vendor invoices clear it. */
  grniAccountId: ID;
}

// ── Requisition (FR-PUR-001) ───────────────────────────────────────────────

export interface RequisitionLine extends DocLine {
  purpose?: string;
}

export interface Requisition extends DocHeader {
  docType: 'Requisition';
  status: 'Draft' | 'Submitted' | 'Approved' | 'Rejected' | 'Returned' | 'Converted' | 'Cancelled';
  requesterId?: ID;
  requesterName: string;
  department?: ID;
  needByDate: string;
  purpose?: string;
  lines: RequisitionLine[];
  convertedToId?: ID;
  convertedToNumber?: string;
  rfqId?: ID;
  rfqNumber?: string;
}

// ── RFQ & supplier quotes (FR-PUR-002) ─────────────────────────────────────

export interface Rfq extends DocHeader {
  docType: 'RFQ';
  status: 'Draft' | 'Sent' | 'Quoted' | 'Awarded' | 'Closed' | 'Cancelled';
  supplierIds: ID[];
  sentAt?: string;
  requisitionId?: ID;
  requisitionNumber?: string;
  awardedSupplierId?: ID;
  awardedQuoteId?: ID;
  poId?: ID;
  poNumber?: string;
}

export interface SupplierQuoteLine {
  lineId: ID;
  itemId?: ID;
  itemName: string;
  qty: number;
  uom: string;
  rate: number;
  amount: number;
}

export interface SupplierQuote extends BaseRecord {
  rfqId: ID;
  rfqNumber: string;
  supplierId: ID;
  supplierName: string;
  quoteRef?: string;
  date: string;
  validUntil: string;
  leadTimeDays: number;
  currency: string;
  paymentTerms?: string;
  lines: SupplierQuoteLine[];
  total: number;
  notes?: string;
  status: 'Received' | 'Awarded' | 'Rejected';
}

// ── Purchase order (FR-PUR-010/011) ────────────────────────────────────────

export interface PoLine extends DocLine {
  expectedDate?: string;
  cancelledQty?: number;
}

export interface PurchaseOrder extends DocHeader {
  docType: 'Purchase Order';
  status: 'Draft' | 'Submitted' | 'Approved' | 'Returned' | 'Rejected' | 'Partially Received' | 'Received' | 'Closed' | 'Short Closed' | 'Cancelled';
  lines: PoLine[];
  expectedDate?: string;
  requisitionId?: ID;
  requisitionNumber?: string;
  rfqId?: ID;
  rfqNumber?: string;
  amendments: { at: string; by: string; reason: string; revision: number; summary: string }[];
  shortCloseReason?: string;
  emailedAt?: string;
}

// ── Goods receipt (FR-PUR-020/021) ─────────────────────────────────────────

export type QcDisposition = 'Return to supplier' | 'Scrap' | 'Rework';

export interface GrnLine extends DocLine {
  poLineId?: ID;
  bin?: string;
  orderedQty: number;
  receivedQty: number;
  acceptedQty: number;
  rejectedQty: number;
  heldQty: number;
  disposition?: QcDisposition;
  qcNote?: string;
  expiryDate?: string;
  invoicedQty?: number;
  returnedQty?: number;
}

export interface Grn extends DocHeader {
  docType: 'GRN';
  status: 'Draft' | 'Posted' | 'Reversed' | 'Cancelled';
  qcStatus: 'Pending' | 'Accepted' | 'Partial Accept' | 'Rejected';
  poId?: ID;
  poNumber?: string;
  lines: GrnLine[];
  supplierChallan?: string;
  vehicleNo?: string;
  receivedBy?: string;
  landedCostIds?: ID[];
}

// ── Vendor invoice & matching (FR-PUR-030..034) ────────────────────────────

export interface VendorInvoiceLine extends DocLine {
  poLineId?: ID;
  grnId?: ID;
  grnLineId?: ID;
  poRate?: number;
  poQty?: number;
  grnQty?: number;
}

export interface VendorInvoice extends DocHeader {
  docType: 'Vendor Invoice';
  status: 'Draft' | 'Submitted' | 'Approved' | 'Posted' | 'Reversed' | 'Cancelled';
  matchStatus: 'Pending' | 'Matched' | 'Exception' | 'Not Required';
  matchMode?: string;
  supplierInvoiceNumber: string;
  supplierInvoiceDate: string;
  poId?: ID;
  poNumber?: string;
  grnIds: ID[];
  grnNumbers: string[];
  lines: VendorInvoiceLine[];
  tdsSectionId?: ID;
  reverseCharge: boolean;
  freightAsLandedCost?: boolean;
  openItemId?: ID;
  paid?: number;
}

export type ExceptionType = 'Price variance' | 'Qty variance' | 'Tax variance' | 'Charge variance' | 'Missing GRN';
export type ExceptionResolution = 'Accept invoice value' | 'Adjust to PO' | 'Request debit note';

export interface MatchException extends BaseRecord {
  invoiceId: ID;
  invoiceNumber: string;
  supplierId?: ID;
  supplierName: string;
  poId?: ID;
  poNumber?: string;
  grnId?: ID;
  grnNumber?: string;
  lineId?: ID;
  itemName?: string;
  type: ExceptionType;
  poValue?: number;
  grnValue?: number;
  invoiceValue: number;
  variance: number;
  variancePct: number;
  tolerance: string;
  status: 'Open' | 'Assigned' | 'Resolved' | 'Approved';
  assignedToId?: ID;
  assignedToName?: string;
  resolution?: ExceptionResolution;
  resolutionReason?: string;
  resolvedBy?: string;
  resolvedAt?: string;
  approvedBy?: string;
  approvedAt?: string;
  raisedAt: string;
}

// ── Debit note / purchase return (FR-PUR-040) ──────────────────────────────

export interface DebitNote extends DocHeader {
  docType: 'Debit Note';
  status: 'Draft' | 'Posted' | 'Reversed' | 'Cancelled';
  invoiceId?: ID;
  invoiceNumber?: string;
  grnId?: ID;
  grnNumber?: string;
  reasonCode: string;
  goodsReturn: boolean;
  returnWarehouseId?: ID;
  purchaseReturnId?: ID;
  purchaseReturnNumber?: string;
  settledAgainstInvoice?: boolean;
  openItemId?: ID;
}

export interface PurchaseReturn extends DocHeader {
  docType: 'Purchase Return';
  status: 'Posted' | 'Reversed';
  debitNoteId: ID;
  debitNoteNumber: string;
  grnId?: ID;
  grnNumber?: string;
}

// ── Payments (FR-PMT-001/003, FR-AP-001) ───────────────────────────────────

export type PaymentMethod = 'NEFT' | 'RTGS' | 'IMPS' | 'Cheque' | 'UPI' | 'Cash';

export interface PaymentAllocation {
  id: ID;
  openItemId: ID;
  docType: string;
  docId: ID;
  docNumber: string;
  outstanding: number;
  amount: number;
  tds: number;
}

export interface Payment extends DocHeader {
  docType: 'Payment';
  status: 'Draft' | 'Pending Approval' | 'Completed' | 'Failed' | 'Reversed' | 'Cancelled';
  method: PaymentMethod;
  bankAccountId: ID;
  bankAccountName: string;
  utr?: string;
  instrumentDate?: string;
  allocations: PaymentAllocation[];
  tdsSectionId?: ID;
  tdsAmount: number;
  chargesAmount: number;
  chargesAccountId?: ID;
  grossAmount: number;
  netAmount: number;
  unappliedAmount: number;
  advanceOpenItemId?: ID;
  batchId?: ID;
  batchNumber?: string;
  failureReason?: string;
  fxGainLoss?: number;
}

export interface PaymentBatchLine {
  id: ID;
  supplierId: ID;
  supplierName: string;
  openItemIds: ID[];
  docNumbers: string[];
  amount: number;
  tds: number;
  net: number;
  bankName?: string;
  accountNumber?: string;
  ifsc?: string;
  note?: string;
  status: 'Pending' | 'Accepted' | 'Failed' | 'Completed';
  utr?: string;
  error?: string;
  paymentId?: ID;
  paymentNumber?: string;
}

export interface PaymentBatch extends BaseRecord {
  number: string;
  docType: 'Payment Batch';
  date: string;
  branchId: ID;
  currency: string;
  bankAccountId: ID;
  bankAccountName: string;
  method: PaymentMethod;
  status: 'Created' | 'Submitted' | 'Approved' | 'Rejected' | 'Returned' | 'Sent to bank' | 'Accepted' | 'Failed' | 'Partially Completed' | 'Completed' | 'Reversed' | 'Cancelled';
  lines: PaymentBatchLine[];
  total: number;
  makerId?: ID;
  makerName: string;
  checkerName?: string;
  approvalId?: ID;
  submittedAt?: string;
  approvedAt?: string;
  fileGeneratedAt?: string;
  fileName?: string;
  sentAt?: string;
  completedAt?: string;
  notes?: string;
  correlationId?: string;
}
