// Shared helpers for Company administration: permission gate, live company hook, constants.
import type { ReactNode } from 'react';
import { db, C, engine, useRecord, useSession, nav } from '../../store';
import type { Company, User } from '../../store';
import { Button, EmptyState, useToast } from '../../components/ui';

/** Permission gate for an admin sub-page. Tenant owner passes everything. */
export function Gate({ perm, what, children }: { perm: string; what: string; children: ReactNode }) {
  const s = useSession();
  const toast = useToast();
  if (s.can(perm)) return <>{children}</>;
  return (
    <div className="page">
      <EmptyState icon="🔒" title={`You don't have access to ${what}`} description={`Requires the ${perm} permission (PERMISSION_DENIED). Ask your company administrator to grant access.`}
        action={<><Button variant="primary" onClick={() => {
          const owner = db.find<User>(C.users, s.tenant?.ownerUserId);
          engine.notify({ type: 'security', title: `${s.user?.name} requested access to ${what}`, body: `Permission ${perm} · from ${window.location.hash}`, link: `admin/users/${s.user?.id}`, userId: owner?.id });
          engine.audit({ action: 'access.requested', objectType: 'Permission', objectNumber: perm, detail: what, result: 'Denied' });
          toast.success('Access request sent to the tenant owner');
        }}>Request access</Button><Button variant="secondary" onClick={() => nav.go('home')}>Go home</Button></>} />
    </div>
  );
}

export function useCompany(): Company | undefined {
  const s = useSession();
  return useRecord<Company>(C.companies, s.state.companyId);
}

export const DOC_TYPES = ['Sales Invoice', 'Credit Note', 'Quotation', 'Sales Order', 'Delivery', 'Sales Return', 'Receipt', 'Purchase Order', 'Requisition', 'RFQ', 'GRN', 'Vendor Invoice', 'Debit Note', 'Purchase Return', 'Payment', 'Payment Batch', 'Journal', 'Bank Voucher', 'Stock Adjustment', 'Stock Transfer', 'Stock Count', 'POS Bill', 'POS Return', 'Expense Claim', 'Payroll Run', 'Asset', 'Contract', 'Project', 'Timesheet', 'BOM', 'Production Order', 'Material Issue', 'Production Receipt', 'Quality Inspection', 'Subcontract Order', 'Exchange Rate', 'Supplier Bank Detail', 'Period Reopen', 'Profile Change'];

/** Permission matrix rows: module × resource (FR-IAM-003). */
export const PERMISSION_MATRIX: { module: string; label: string; resources: { id: string; label: string }[] }[] = [
  { module: 'sales', label: 'Sales', resources: [{ id: 'quotation', label: 'Quotations' }, { id: 'order', label: 'Sales orders' }, { id: 'delivery', label: 'Deliveries' }, { id: 'invoice', label: 'Invoices' }, { id: 'creditnote', label: 'Credit notes' }, { id: 'receipt', label: 'Receipts' }] },
  { module: 'purchase', label: 'Purchase', resources: [{ id: 'requisition', label: 'Requisitions' }, { id: 'order', label: 'Purchase orders' }, { id: 'grn', label: 'GRN' }, { id: 'invoice', label: 'Vendor invoices' }, { id: 'payment', label: 'Payments' }, { id: 'batch', label: 'Payment batches' }] },
  { module: 'inventory', label: 'Inventory', resources: [{ id: 'stock', label: 'Stock & ledger' }, { id: 'adjustment', label: 'Adjustments' }, { id: 'transfer', label: 'Transfers' }, { id: 'count', label: 'Counts' }] },
  { module: 'accounting', label: 'Accounting', resources: [{ id: 'journal', label: 'Journals' }, { id: 'ledger', label: 'Ledgers' }, { id: 'period', label: 'Periods (post-closed)' }, { id: 'reports', label: 'Financial reports' }] },
  { module: 'banking', label: 'Banking', resources: [{ id: 'account', label: 'Bank accounts' }, { id: 'voucher', label: 'Vouchers' }, { id: 'reconciliation', label: 'Reconciliation' }] },
  { module: 'taxation', label: 'Taxation', resources: [{ id: 'returns', label: 'Returns' }, { id: 'einvoice', label: 'e-Invoice / e-Way bill' }, { id: 'tds', label: 'TDS / TCS' }] },
  { module: 'payroll', label: 'Payroll', resources: [{ id: 'employee', label: 'Employees' }, { id: 'run', label: 'Payroll runs' }, { id: 'payslip', label: 'Payslips (confidential)' }] },
  { module: 'fixed-assets', label: 'Fixed assets', resources: [{ id: 'asset', label: 'Assets' }, { id: 'depreciation', label: 'Depreciation' }] },
  { module: 'budgets', label: 'Budgets & expenses', resources: [{ id: 'budget', label: 'Budgets' }, { id: 'expenses', label: 'Expense claims' }] },
  { module: 'pos', label: 'POS', resources: [{ id: 'terminal', label: 'Terminal' }, { id: 'shift', label: 'Shifts' }] },
  { module: 'projects', label: 'Projects & contracts', resources: [{ id: 'project', label: 'Projects' }, { id: 'timesheet', label: 'Timesheets' }, { id: 'billing', label: 'Billing' }] },
  { module: 'production', label: 'Production', resources: [{ id: 'order', label: 'Production orders' }, { id: 'bom', label: 'BOMs' }, { id: 'qc', label: 'Quality' }] },
  { module: 'crm', label: 'CRM', resources: [{ id: 'lead', label: 'Leads' }, { id: 'activity', label: 'Activities' }] },
  { module: 'reports', label: 'Reports', resources: [{ id: 'sales', label: 'Sales' }, { id: 'purchase', label: 'Purchase' }, { id: 'inventory', label: 'Inventory' }, { id: 'cash', label: 'Cash' }, { id: 'cfo', label: 'CFO dashboard' }] },
  { module: 'masters', label: 'Masters', resources: [{ id: 'customers', label: 'Customers' }, { id: 'suppliers', label: 'Suppliers' }, { id: 'items', label: 'Items' }, { id: 'pricelists', label: 'Price lists' }, { id: 'employees', label: 'Employees' }, { id: 'warehouses', label: 'Warehouses' }, { id: 'accounts', label: 'Chart of accounts' }] },
  { module: 'admin', label: 'Administration', resources: [{ id: 'company', label: 'Company' }, { id: 'branches', label: 'Branches' }, { id: 'periods', label: 'Periods' }, { id: 'users', label: 'Users' }, { id: 'roles', label: 'Roles' }, { id: 'numbering', label: 'Number series' }, { id: 'workflows', label: 'Workflows' }, { id: 'templates', label: 'Templates' }, { id: 'audit', label: 'Audit log' }, { id: 'integrations', label: 'Integrations' }, { id: 'jobs', label: 'Jobs' }, { id: 'data', label: 'Data & demo' }] },
  { module: 'approvals', label: 'Approvals', resources: [{ id: 'act', label: 'Act on requests' }] },
];
export const PERMISSION_ACTIONS = ['view', 'create', 'edit', 'submit', 'approve', 'post', 'reverse', 'export', 'delete'] as const;

/** FRD §21.2 domain events. */
export const DOMAIN_EVENTS = ['DocumentCreated', 'DocumentSubmitted', 'DocumentApproved', 'DocumentRejected', 'DocumentPosted', 'DocumentReversed', 'DocumentCancelled', 'JournalPosted', 'JournalReversed', 'StockReserved', 'StockReleased', 'StockMoved', 'StockReversed', 'InvoicePosted', 'InvoiceCredited', 'ReceiptAllocated', 'ReceiptReversed', 'PurchaseReceived', 'PurchaseInvoiced', 'PurchaseMatched', 'PaymentApproved', 'PaymentCompleted', 'PaymentFailed', 'PeriodLocked', 'PeriodReopened', 'StatutorySubmissionAccepted', 'StatutorySubmissionRejected', 'StatutorySubmissionCancelled'];

export const API_SCOPES = ['sales.*', 'sales.invoice.view', 'sales.invoice.create', 'sales.order.create', 'sales.receipt.view', 'purchase.*', 'purchase.order.view', 'inventory.stock.view', 'masters.customers.view', 'masters.items.view', 'accounting.journal.view', 'reports.*', 'webhooks.manage'];

/** Does a permission set cover a specific permission string? */
export function permissionCovers(perms: string[], perm: string): boolean {
  if (perms.includes('*')) return true;
  const [mod, res, act] = perm.split('.');
  return perms.some((p) => p === perm || p === `${mod}.*` || p === `${mod}.${res}.*` || p === `*.*.${act}` || p === `*.${res}.${act}`);
}

export function randomKey(prefix: string, len = 24) {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let out = '';
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return `${prefix}${out}`;
}

export function mask(secret: string, keep = 4) {
  return secret.slice(0, Math.min(11, Math.max(0, secret.indexOf('_') + 4))) + '••••••••••••' + secret.slice(-keep);
}
