import type { BaseRecord, CompanyDefaults, DocHeader, DocLine, ID } from '../../store';

export type TenderType = 'Cash' | 'Card' | 'UPI' | 'Credit';
export const TENDER_TYPES: TenderType[] = ['Cash', 'Card', 'UPI'];

export interface Tender { type: TenderType; amount: number; reference?: string; last4?: string }

export interface PosTerminal extends BaseRecord {
  companyId?: ID;
  code: string;
  name: string;
  branchId: ID;
  warehouseId: ID;
  cashAccountId?: ID;
  status: 'Active' | 'Inactive';
  location?: string;
}

export interface PosShift extends BaseRecord {
  companyId?: ID;
  number: string;
  terminalId: ID;
  terminalName: string;
  cashierId: ID;
  cashierName: string;
  branchId: ID;
  openedAt: string;
  closedAt?: string;
  openingFloat: number;
  status: 'Open' | 'Closed' | 'Pending Approval';
  expected?: Record<string, number>;
  counted?: Record<string, number>;
  variance?: Record<string, number>;
  varianceTotal?: number;
  bills?: number;
  sales?: number;
  refunds?: number;
  journalId?: ID;
  journalNumber?: string;
  approvalId?: ID;
  closeNotes?: string;
  closedBy?: string;
}

export interface PosBill extends DocHeader {
  shiftId: ID;
  terminalId: ID;
  cashierName: string;
  tenders: Tender[];
  tendered: number;
  change: number;
  onCredit?: boolean;
  openItemId?: ID;
  returnedTotal?: number;
  reprints?: number;
}

export interface PosReturn extends DocHeader {
  billId?: ID;
  billNumber?: string;
  shiftId: ID;
  terminalId: ID;
  cashierName: string;
  reasonCode: string;
  reasonText?: string;
  noReceipt: boolean;
  refund: Tender;
  approvalRequired?: boolean;
}

export interface PosHeldCart extends BaseRecord {
  companyId?: ID;
  shiftId: ID;
  cartId: string;
  label: string;
  lines: DocLine[];
  customerId?: ID;
  customerName?: string;
  heldAt: string;
  total: number;
}

export interface PosSettings {
  posVarianceTolerance: number;
  posNoReceiptReturns: 'Deny' | 'Manager approval' | 'Allow';
  posNoReceiptApprovalThreshold: number;
  posDefaultCustomerId?: ID;
  posDefaultWarehouseId?: ID;
  posCashAccountId: ID;
  posCardAccountId: ID;
  posUpiAccountId: ID;
  posPriceListId?: ID;
  posAllowCredit: boolean;
}

export function posSettingsOf(d?: CompanyDefaults): PosSettings {
  const x = (d ?? {}) as Partial<PosSettings> & CompanyDefaults;
  return {
    posVarianceTolerance: x.posVarianceTolerance ?? 100,
    posNoReceiptReturns: x.posNoReceiptReturns ?? 'Manager approval',
    posNoReceiptApprovalThreshold: x.posNoReceiptApprovalThreshold ?? 2000,
    posDefaultCustomerId: x.posDefaultCustomerId ?? 'cust_walkin',
    posDefaultWarehouseId: x.posDefaultWarehouseId ?? x.warehouseId,
    posCashAccountId: x.posCashAccountId ?? x.cashAccountId ?? 'acc_1300',
    posCardAccountId: x.posCardAccountId ?? x.bankAccountId ?? 'acc_1310',
    posUpiAccountId: x.posUpiAccountId ?? x.bankAccountId ?? 'acc_1310',
    posPriceListId: x.posPriceListId ?? 'pl_retail',
    posAllowCredit: x.posAllowCredit ?? true,
  };
}
