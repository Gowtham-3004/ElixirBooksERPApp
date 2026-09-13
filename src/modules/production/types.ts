// Manufacturing / production module types (FR-MFG-001..016).
// Masters extend BaseRecord; documents carry number/date/branch/status like DocHeader
// but are not sales/purchase documents (no party totals), so they are modelled explicitly.
import type { BaseRecord, ID } from '../../store';

// ── Settings (additive keys on company.defaults.production) ────────────────

export interface MfgSettings {
  mode: 'discrete' | 'process';
  planning: 'MTS' | 'MTO';
  overIssueTolerancePct: number;
  backflushDefault: boolean;
  qcRequiredForFG: boolean;
  costingMethod: 'Standard' | 'Actual';
  /** auto-release MRP production suggestions whose standard value is below this (0 = never) */
  autoReleaseThreshold: number;
  wipWarehouseId: ID;
  scrapWarehouseId: ID;
  subcontractWarehouseId: ID;
  fgWarehouseId: ID;
  rmWarehouseId: ID;
  labourAbsorbedAccountId: ID;
  overheadAbsorbedAccountId: ID;
}

// ── Bill of material (FR-MFG-002) ──────────────────────────────────────────

export interface BomComponent {
  id: ID;
  itemId: ID;
  itemCode: string;
  itemName: string;
  /** quantity per BOM output quantity */
  qty: number;
  uom: string;
  scrapPct: number;
  substitutes: ID[];
  isPhantom: boolean;
}

export interface BomByProduct {
  id: ID;
  itemId: ID;
  itemName: string;
  qty: number;
  uom: string;
  costSharePct: number;
}

export type BomStatus = 'Draft' | 'Active' | 'Superseded';

export interface Bom extends BaseRecord {
  code: string;
  itemId: ID;
  itemCode: string;
  itemName: string;
  version: number;
  effectiveFrom: string;
  effectiveTo?: string;
  status: BomStatus;
  mode: 'discrete' | 'process';
  outputQty: number;
  uom: string;
  components: BomComponent[];
  byProducts: BomByProduct[];
  routingId?: ID;
  notes?: string;
  supersedesId?: ID;
  supersededById?: ID;
  /** last roll-up result (per output unit) */
  stdCost?: number;
  rolledUpAt?: string;
}

// ── Routing (FR-MFG-003) ───────────────────────────────────────────────────

export interface RoutingOperation {
  id: ID;
  seq: number;
  name: string;
  workCentreId: ID;
  setupMin: number;
  runMinPerUnit: number;
  labourRate: number;
  machineRate: number;
  yieldPct: number;
  parallel: boolean;
  subcontract: boolean;
  supplierId?: ID;
  serviceItemId?: ID;
  subcontractRate?: number;
}

export interface Routing extends BaseRecord {
  code: string;
  name: string;
  itemId?: ID;
  itemName?: string;
  operations: RoutingOperation[];
  status: 'Active' | 'Inactive';
  notes?: string;
}

// ── Work centre (FR-MFG-004) ───────────────────────────────────────────────

export interface WorkCentre extends BaseRecord {
  code: string;
  name: string;
  /** 0 = Sunday … 6 = Saturday */
  workingDays: number[];
  hoursPerDay: number;
  capacityHrsPerDay: number;
  efficiencyPct: number;
  costRateLabour: number;
  costRateMachine: number;
  overheadRate: number;
  warehouseId: ID;
  branchId?: ID;
  permittedOperations: string[];
  status: 'Active' | 'Inactive';
}

// ── MRP (FR-MFG-005/006) ───────────────────────────────────────────────────

export type SuggestionType = 'Purchase' | 'Production' | 'Transfer';
export type SuggestionStatus = 'Suggested' | 'Accepted' | 'Rejected' | 'Converted';

export interface DemandRef { type: string; id: ID; number: string; qty: number; date: string }

export interface MrpSuggestion {
  id: ID;
  type: SuggestionType;
  itemId: ID;
  itemCode: string;
  itemName: string;
  qty: number;
  uom: string;
  needBy: string;
  orderBy: string;
  reason: string;
  demandRefs: DemandRef[];
  supplierId?: ID;
  supplierName?: string;
  fromWarehouseId?: ID;
  toWarehouseId?: ID;
  bomId?: ID;
  estValue: number;
  status: SuggestionStatus;
  convertedDocId?: ID;
  convertedDocNumber?: string;
  convertedDocType?: string;
}

export interface MrpItemDetail {
  itemId: ID;
  itemCode: string;
  itemName: string;
  uom: string;
  onHand: number;
  reserved: number;
  openPo: number;
  plannedReceipts: number;
  safetyStock: number;
  independentDemand: number;
  dependentDemand: number;
  netRequirement: number;
  shortfall: number;
  hasBom: boolean;
}

export interface MrpParams {
  horizonDays: number;
  includeSafetyStock: boolean;
  lotSizing: 'Lot-for-lot' | 'Fixed qty' | 'Min order';
  warehouseId?: ID;
  includeDrafts: boolean;
}

export interface MrpRun extends BaseRecord {
  number: string;
  date: string;
  branchId: ID;
  params: MrpParams;
  suggestions: MrpSuggestion[];
  details: MrpItemDetail[];
  status: 'Completed' | 'Partially Converted' | 'Converted';
  runBy: string;
  summary: { itemsPlanned: number; shortfalls: number; purchase: number; production: number; transfer: number; value: number };
}

// ── Production order (FR-MFG-007/008) ──────────────────────────────────────

export type ProductionOrderStatus = 'Draft' | 'Planned' | 'Submitted' | 'Approved' | 'Rejected' | 'Returned' | 'Released' | 'In Progress' | 'Partially Completed' | 'Completed' | 'Closed' | 'Cancelled';

export interface OrderComponent {
  id: ID;
  bomComponentId?: ID;
  itemId: ID;
  itemCode: string;
  itemName: string;
  uom: string;
  /** qty per one output unit, before scrap */
  qtyPer: number;
  scrapPct: number;
  /** planned incl. scrap for the full order qty */
  plannedQty: number;
  issuedQty: number;
  returnedQty: number;
  consumedQty: number;
  isPhantom: boolean;
  substitutes: ID[];
  tracking: 'None' | 'Batch' | 'Serial';
  warehouseId?: ID;
}

export type OperationStatus = 'Pending' | 'In Progress' | 'Done' | 'Skipped';

export interface OrderOperation {
  id: ID;
  seq: number;
  name: string;
  workCentreId: ID;
  workCentreName: string;
  setupMin: number;
  runMinPerUnit: number;
  labourRate: number;
  machineRate: number;
  overheadRate: number;
  yieldPct: number;
  parallel: boolean;
  subcontract: boolean;
  supplierId?: ID;
  serviceItemId?: ID;
  subcontractRate?: number;
  status: OperationStatus;
  startedAt?: string;
  stoppedAt?: string;
  actualSetupMin: number;
  actualRunMin: number;
  labourCost: number;
  machineCost: number;
  overheadCost: number;
  subcontractCost: number;
  completedQty: number;
  scrapQty: number;
  scrapReason?: string;
  subcontractOrderId?: ID;
  isRework?: boolean;
  journalId?: ID;
  completedBy?: string;
  completedAt?: string;
}

export interface ProductionCosts {
  materialStd: number;
  materialActual: number;
  labourStd: number;
  labourActual: number;
  machineStd: number;
  machineActual: number;
  overheadStd: number;
  overheadActual: number;
  subcontractStd: number;
  subcontractActual: number;
  scrap: number;
  byProductCredit: number;
  outputValue: number;
  totalStd: number;
  totalActual: number;
  variance: number;
  variancePct: number;
  /** WIP balance for the order after outputs/scrap/variance postings */
  wipBalance: number;
  closeVariance: number;
}

export interface SourceDemand { type: string; id: ID; number: string; lineId?: ID; customerName?: string }

export interface ProductionOrder extends BaseRecord {
  number: string;
  docType: 'Production Order';
  date: string;
  branchId: ID;
  status: ProductionOrderStatus;
  itemId: ID;
  itemCode: string;
  itemName: string;
  uom: string;
  tracking: 'None' | 'Batch' | 'Serial';
  bomId: ID;
  bomCode: string;
  bomVersion: number;
  routingId?: ID;
  routingCode?: string;
  qty: number;
  plannedStart: string;
  plannedEnd: string;
  actualStart?: string;
  actualEnd?: string;
  warehouseId: ID;
  wipWarehouseId: ID;
  rmWarehouseId: ID;
  scrapWarehouseId: ID;
  lotNumber?: string;
  serialPrefix?: string;
  sourceDemand?: SourceDemand;
  mrpRunId?: ID;
  components: OrderComponent[];
  operations: OrderOperation[];
  costs: ProductionCosts;
  costingMethod: 'Standard' | 'Actual';
  stdUnitCost: number;
  receivedQty: number;
  scrapQty: number;
  byProductsReceived: { itemId: ID; itemName: string; qty: number; value: number }[];
  journalIds: ID[];
  closeJournalId?: ID;
  approvalId?: ID;
  reasonForCancel?: string;
  reopenReason?: string;
  shortCloseReason?: string;
  priority: 'Normal' | 'High' | 'Low';
  dimensions?: Record<string, string>;
  notes?: string;
  correlationId: string;
  releasedAt?: string;
  releasedBy?: string;
  startedAt?: string;
  completedAt?: string;
  closedAt?: string;
  closedBy?: string;
  submittedAt?: string;
  submittedBy?: string;
  cancelledAt?: string;
  idempotencyKey?: string;
  autoReleased?: boolean;
  fy?: string;
  period?: string;
}

// ── Material issue (FR-MFG-009) ────────────────────────────────────────────

export interface IssueLine {
  id: ID;
  componentId?: ID;
  itemId: ID;
  itemCode: string;
  itemName: string;
  qty: number;
  uom: string;
  batch?: string;
  serials?: string[];
  warehouseId: ID;
  rate: number;
  value: number;
}

export interface MaterialIssue extends BaseRecord {
  number: string;
  docType: 'Material Issue';
  date: string;
  branchId: ID;
  orderId: ID;
  orderNumber: string;
  type: 'Issue' | 'Return' | 'Backflush';
  lines: IssueLine[];
  status: 'Posted' | 'Reversed';
  totalValue: number;
  journalId?: ID;
  journalNumber?: string;
  movementIds: ID[];
  idempotencyKey: string;
  reversalOfId?: ID;
  reversedById?: ID;
  reversalReason?: string;
  postedAt: string;
  postedBy: string;
  notes?: string;
  receiptId?: ID;
  correlationId: string;
}

// ── Production receipt (FR-MFG-009/010) ────────────────────────────────────

export interface ProductionReceipt extends BaseRecord {
  number: string;
  docType: 'Production Receipt';
  date: string;
  branchId: ID;
  orderId: ID;
  orderNumber: string;
  itemId: ID;
  itemCode: string;
  itemName: string;
  qty: number;
  uom: string;
  batch?: string;
  serials?: string[];
  warehouseId: ID;
  byProducts: { itemId: ID; itemName: string; qty: number; uom: string; value: number }[];
  scrapQty: number;
  scrapReason?: string;
  scrapValue: number;
  qcRequired: boolean;
  inspectionId?: ID;
  inspectionNumber?: string;
  status: 'Hold' | 'Posted' | 'Reversed' | 'Rejected';
  unitCost: number;
  costBasis: 'Standard' | 'Actual';
  value: number;
  backflush: boolean;
  backflushIssueId?: ID;
  journalId?: ID;
  journalNumber?: string;
  scrapJournalId?: ID;
  movementIds: ID[];
  reversalOfId?: ID;
  reversedById?: ID;
  reversalReason?: string;
  postedAt?: string;
  postedBy?: string;
  notes?: string;
  correlationId: string;
  idempotencyKey: string;
}

// ── Quality (FR-MFG-013) ───────────────────────────────────────────────────

export type InspectionType = 'Incoming' | 'In-process' | 'Finished goods';

export interface InspectionCheck {
  id: ID;
  name: string;
  spec: string;
  method: string;
  kind: 'Pass/Fail' | 'Measurement';
  min?: number;
  max?: number;
  unit?: string;
}

export interface InspectionPlan extends BaseRecord {
  code: string;
  name: string;
  type: InspectionType;
  itemId?: ID;
  itemName?: string;
  checks: InspectionCheck[];
  samplePct: number;
  status: 'Active' | 'Inactive';
}

export interface InspectionResult {
  checkId: ID;
  check: string;
  spec: string;
  value?: string;
  pass: boolean | null;
  note?: string;
}

export type Disposition = 'Accept' | 'Reject' | 'Rework' | 'Scrap' | 'Return' | 'Hold';

export interface QualityInspection extends BaseRecord {
  number: string;
  docType: 'Quality Inspection';
  date: string;
  branchId: ID;
  type: InspectionType;
  planId?: ID;
  planName?: string;
  itemId: ID;
  itemCode: string;
  itemName: string;
  refType: 'GRN' | 'Purchase Order' | 'Production Order' | 'Production Receipt' | 'Subcontract Order';
  refId: ID;
  refNumber: string;
  refLineId?: ID;
  operationId?: ID;
  operationName?: string;
  lotQty: number;
  sampleQty: number;
  batch?: string;
  serials?: string[];
  results: InspectionResult[];
  acceptedQty: number;
  rejectedQty: number;
  heldQty: number;
  disposition?: Disposition;
  outcome?: 'Pass' | 'Fail' | 'Partial';
  status: 'Open' | 'In Progress' | 'Completed' | 'Cancelled';
  inspectorName?: string;
  completedAt?: string;
  completedBy?: string;
  notes?: string;
  correlationId: string;
}

// ── Subcontracting (FR-MFG-014) ────────────────────────────────────────────

export interface SentItem { id: ID; itemId: ID; itemCode: string; itemName: string; qty: number; uom: string; batch?: string; rate: number; movementId?: ID; sentAt?: string; warehouseId: ID }

export interface SubReceipt { id: ID; date: string; qty: number; consumed: { itemId: ID; qty: number }[]; returned: { itemId: ID; qty: number }[]; charge: number; journalId?: ID; movementIds: ID[]; by: string }

export interface SubcontractOrder extends BaseRecord {
  number: string;
  docType: 'Subcontract Order';
  date: string;
  branchId: ID;
  supplierId: ID;
  supplierName: string;
  orderId?: ID;
  orderNumber?: string;
  operationId?: ID;
  operationName: string;
  serviceItemId: ID;
  serviceItemName: string;
  rate: number;
  qty: number;
  expectedDate: string;
  sendWarehouseId: ID;
  subWarehouseId: ID;
  itemsSent: SentItem[];
  received: SubReceipt[];
  receivedQty: number;
  charges: number;
  consumptionVariance: { itemId: ID; itemName: string; sent: number; consumed: number; returned: number; variance: number; value: number }[];
  poId?: ID;
  poNumber?: string;
  grnId?: ID;
  status: 'Draft' | 'Sent' | 'Partially Received' | 'Received' | 'Closed' | 'Cancelled';
  journalIds: ID[];
  openItemId?: ID;
  notes?: string;
  sentAt?: string;
  closedAt?: string;
  cancelReason?: string;
  correlationId: string;
}

// ── WIP ledger (FR-MFG-011) ────────────────────────────────────────────────

export type WipEntryType = 'Material In' | 'Material Return' | 'Conversion' | 'Subcontract' | 'Output' | 'By-product' | 'Scrap' | 'Variance' | 'Reversal';

export interface WipEntry extends BaseRecord {
  orderId: ID;
  orderNumber: string;
  date: string;
  type: WipEntryType;
  /** signed: + into WIP, − out of WIP */
  amount: number;
  journalId?: ID;
  journalNumber?: string;
  sourceType: string;
  sourceId: ID;
  sourceNumber: string;
  description?: string;
}
