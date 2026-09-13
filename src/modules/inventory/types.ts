// Inventory document types (FR-INV-001..009, FR-TRD-002/003).
import type { DocHeader, DocLine, ID } from '../../store';

/** Additive inventory settings kept on company.defaults (read through inventorySettings()). */
export interface InventorySettings {
  negativeStockPolicy: 'Block' | 'Warn' | 'Allow';
  valuationMethod: 'AVCO' | 'FIFO' | 'Standard';
  transitWarehouseId: ID;
  scrapWarehouseId: ID;
  countTolerancePct: number;
}

export type AdjustmentType = 'Write-off' | 'Count variance' | 'Found' | 'Damage' | 'Rework' | 'Other';

export interface AdjustmentLine extends DocLine {
  /** signed qty: +in / −out */
  qty: number;
  value: number;
  reasonCode?: string;
}

export interface StockAdjustment extends DocHeader {
  docType: 'Stock Adjustment';
  status: 'Draft' | 'Submitted' | 'Approved' | 'Rejected' | 'Returned' | 'Posted' | 'Reversed' | 'Cancelled';
  warehouseId: ID;
  warehouseName?: string;
  adjustmentType: AdjustmentType;
  reasonCode: string;
  reason: string;
  lines: AdjustmentLine[];
  totalValue: number;
  countId?: ID;
  countNumber?: string;
  approverName?: string;
}

export interface TransferLine extends DocLine {
  receivedQty?: number;
  shortageQty?: number;
  damageQty?: number;
  shortageReason?: string;
}

export interface StockTransfer extends DocHeader {
  docType: 'Stock Transfer';
  status: 'Draft' | 'In Transit' | 'Completed' | 'Reversed' | 'Cancelled';
  fromWarehouseId: ID;
  fromWarehouseName?: string;
  toWarehouseId: ID;
  toWarehouseName?: string;
  lines: TransferLine[];
  totalValue: number;
  dispatchedAt?: string;
  dispatchedBy?: string;
  receivedAt?: string;
  receivedBy?: string;
  vehicleNo?: string;
}

export interface CountLine {
  id: ID;
  itemId: ID;
  itemCode: string;
  itemName: string;
  uom: string;
  batch?: string;
  bin?: string;
  systemQty: number;
  countedQty: number | null;
  rate: number;
  countedBy?: string;
  countedAt?: string;
  note?: string;
}

export interface StockCount extends DocHeader {
  docType: 'Stock Count';
  status: 'Draft' | 'In Progress' | 'Submitted' | 'Approved' | 'Rejected' | 'Posted' | 'Cancelled';
  warehouseId: ID;
  warehouseName?: string;
  itemGroup?: string;
  frozenAt?: string;
  countLines: CountLine[];
  adjustmentId?: ID;
  adjustmentNumber?: string;
  approverName?: string;
}

export type LandedCostBasis = 'Value' | 'Qty' | 'Weight';

export interface LandedCostItem {
  id: ID;
  name: string;
  supplierId?: ID;
  supplierName?: string;
  amount: number;
  accountId?: ID;
  reference?: string;
}

export interface LandedCostAllocation {
  id: ID;
  grnId: ID;
  grnNumber: string;
  lineId: ID;
  itemId: ID;
  itemName: string;
  warehouseId: ID;
  qty: number;
  baseValue: number;
  weight: number;
  allocated: number;
  newRate: number;
}

export interface LandedCost extends DocHeader {
  docType: 'Landed Cost';
  status: 'Draft' | 'Posted' | 'Reversed';
  grnIds: ID[];
  grnNumbers: string[];
  basis: LandedCostBasis;
  costs: LandedCostItem[];
  allocations: LandedCostAllocation[];
  totalCost: number;
}
