// Seed data for the admin / platform / approvals / home modules.
// Owns: approvals, audit, notifications, importJobs, exportJobs, jobs,
// providerCredentials, apiKeys, webhooks, savedViews, notificationSettings.
// Approval rows reference document ids agreed with the other module agents.
import type { DB } from '../db';
import type {
  ApprovalRequest, AuditEvent, Notification, ImportJob, ExportJob, BackgroundJob, ProviderCredential, ApiKey, Webhook, SavedView, NotificationSetting,
} from '../types';
import { C } from '../collections';
import { IDS, rec, SEED_NOW } from './core';

const NOW = Date.parse(SEED_NOW);
const ago = (hours: number) => new Date(NOW - hours * 3600e3).toISOString();
const ahead = (hours: number) => new Date(NOW + hours * 3600e3).toISOString();
const co = IDS.acme;

export function seedAdmin(): Partial<DB> {
  // ── Approvals (7 rows matching the legacy inbox mock) ────────────────────
  const step = (order: number, name: string, approverType: string, approverRef: string, approverLabel: string, status: ApprovalRequest['steps'][number]['status'], submittedAgo: number, slaHours: number, extra: Partial<ApprovalRequest['steps'][number]> = {}) => ({
    order, name, approverType, approverRef, approverLabel, status, commentRequired: false, dueAt: new Date(NOW - submittedAgo * 3600e3 + slaHours * 3600e3).toISOString(), ...extra,
  });
  const approvals: ApprovalRequest[] = [
    rec<ApprovalRequest>('apr_inv_0116', {
      companyId: co, docType: 'Sales Invoice', collection: C.salesInvoices, docId: 'inv_0116', docNumber: 'INV/26-27/0116', amount: 89500, currency: 'INR', branchId: IDS.brHO,
      requesterId: IDS.uPriya, requesterName: 'Priya Mehta', ruleId: 'wf_inv', ruleName: 'Sales Invoice Approval', ruleVersion: 2,
      steps: [step(1, 'Finance approval', 'Role', IDS.rFinAdmin, 'Finance Approver', 'Pending', 50, 24), { ...step(2, 'CFO approval', 'User', IDS.uOwner, 'CFO (above ₹5L)', 'Skipped', 50, 48, { commentRequired: true }) }],
      currentStep: 1, status: 'Pending', submittedAt: ago(50), summary: 'Global Tech Solutions · 3 lines · GST 18% · Net 45',
      history: [{ at: ago(50), by: 'Priya Mehta', action: 'Submitted for approval' }],
    }),
    rec<ApprovalRequest>('apr_po_0093', {
      companyId: co, docType: 'Purchase Order', collection: C.purchaseOrders, docId: 'po_0093', docNumber: 'PO/26-27/0093', amount: 124000, currency: 'INR', branchId: IDS.brHO,
      requesterId: IDS.uSuresh, requesterName: 'Suresh Kumar', ruleId: 'wf_po', ruleName: 'Purchase Order Approval', ruleVersion: 2,
      steps: [step(1, 'Department head', 'Manager', 'manager', 'Vikram Singh (manager)', 'Approved', 30, 24, { actedBy: 'Vikram Singh', actedById: IDS.uVikram, actedAt: ago(20), comment: 'Within Q2 raw-material budget' }), step(2, 'Finance approval', 'Role', IDS.rFinAdmin, 'Finance Admin', 'Pending', 30, 24)],
      currentStep: 2, status: 'Pending', submittedAt: ago(30), summary: 'Shree Suppliers Ltd · HR steel coil 4mm × 20 MT · 3-way match',
      history: [{ at: ago(30), by: 'Suresh Kumar', action: 'Submitted for approval' }, { at: ago(20), by: 'Vikram Singh', action: 'Approved at step 1', comment: 'Within Q2 raw-material budget', step: 1 }],
    }),
    rec<ApprovalRequest>('apr_jv_0045', {
      companyId: co, docType: 'Journal', collection: C.journals, docId: 'jv_0045', docNumber: 'JV/26-27/0045', amount: 18240, currency: 'INR', branchId: IDS.brHO,
      requesterId: IDS.uAnil, requesterName: 'Anil Patil', ruleId: 'wf_jv', ruleName: 'Journal Approval (Manual)', ruleVersion: 2,
      steps: [step(1, 'Finance approval', 'Role', IDS.rFinAdmin, 'Finance Admin', 'Pending', 98, 24, { commentRequired: true })],
      currentStep: 1, status: 'Pending', submittedAt: ago(98), summary: 'Manual journal · Prepaid insurance amortisation · Dr Insurance 18,240 / Cr Prepaid 18,240',
      history: [{ at: ago(98), by: 'Anil Patil', action: 'Submitted for approval' }, { at: ago(26), by: 'system', action: 'Reminder sent to Finance Admin' }],
    }),
    rec<ApprovalRequest>('apr_pb_0022', {
      companyId: co, docType: 'Payment Batch', collection: C.paymentBatches, docId: 'pb_0022', docNumber: 'PMT-BATCH/0022', amount: 642000, currency: 'INR', branchId: IDS.brHO,
      requesterId: IDS.uAnita, requesterName: 'Anita Rao', ruleId: 'wf_batch', ruleName: 'Payment Batch (Maker-Checker)', ruleVersion: 2,
      steps: [step(1, 'Treasury approval', 'Role', IDS.rTreasury, 'Treasury Approver', 'Pending', 26, 8)],
      currentStep: 1, status: 'Pending', submittedAt: ago(26), summary: '9 supplier payments · HDFC Current ****1234 · NEFT · value date tomorrow',
      history: [{ at: ago(26), by: 'Anita Rao', action: 'Submitted for approval' }],
    }),
    rec<ApprovalRequest>('apr_cn_0008', {
      companyId: co, docType: 'Credit Note', collection: C.creditNotes, docId: 'cn_0008', docNumber: 'CN/26-27/0008', amount: 12500, currency: 'INR', branchId: IDS.brHO,
      requesterId: IDS.uVikram, requesterName: 'Vikram Singh', ruleId: 'wf_cn', ruleName: 'Credit Note Approval', ruleVersion: 2,
      steps: [step(1, 'Sales manager', 'Role', IDS.rSalesMgr, 'Sales Manager', 'Pending', 52, 24, { commentRequired: true }), step(2, 'Finance approval', 'Role', IDS.rFinAdmin, 'Finance Admin', 'Pending', 52, 24)],
      currentStep: 1, status: 'Pending', submittedAt: ago(52), summary: 'Arlene Traders · short supply against INV/26-27/0111 · reason SHORT',
      history: [{ at: ago(52), by: 'Vikram Singh', action: 'Submitted for approval' }],
    }),
    rec<ApprovalRequest>('apr_po_0094', {
      companyId: co, docType: 'Purchase Order', collection: C.purchaseOrders, docId: 'po_0094', docNumber: 'PO/26-27/0094', amount: 78000, currency: 'INR', branchId: IDS.brPune,
      requesterId: IDS.uSuresh, requesterName: 'Suresh Kumar', ruleId: 'wf_po', ruleName: 'Purchase Order Approval', ruleVersion: 2,
      steps: [step(1, 'Department head', 'Manager', 'manager', 'Vikram Singh (manager)', 'Pending', 20, 24), step(2, 'Finance approval', 'Role', IDS.rFinAdmin, 'Finance Admin', 'Pending', 20, 24)],
      currentStep: 1, status: 'Pending', submittedAt: ago(20), summary: 'Kiran Agencies · packaging crates × 400 · Pune Depot',
      history: [{ at: ago(20), by: 'Suresh Kumar', action: 'Submitted for approval' }],
    }),
    rec<ApprovalRequest>('apr_exp_0041', {
      companyId: co, docType: 'Expense Claim', collection: C.expenseClaims, docId: 'exp_0041', docNumber: 'EXP/26-27/0041', amount: 8450, currency: 'INR', branchId: IDS.brHO,
      requesterId: IDS.uSuresh, requesterName: 'Suresh Kumar', ruleId: 'wf_exp', ruleName: 'Expense Claim (>₹5,000)', ruleVersion: 2,
      steps: [step(1, 'Manager approval', 'Manager', 'manager', 'Vikram Singh (manager)', 'Pending', 6, 48)],
      currentStep: 1, status: 'Pending', submittedAt: ago(6), summary: 'Site visit · Pune · travel + lodging · 3 receipts attached',
      history: [{ at: ago(6), by: 'Suresh Kumar', action: 'Submitted for approval' }],
    }),
    // completed history rows
    rec<ApprovalRequest>('apr_inv_0112', {
      companyId: co, docType: 'Sales Invoice', collection: C.salesInvoices, docId: 'inv_0112', docNumber: 'INV/26-27/0112', amount: 156750, currency: 'INR', branchId: IDS.brHO,
      requesterId: IDS.uPriya, requesterName: 'Priya Mehta', ruleId: 'wf_inv', ruleName: 'Sales Invoice Approval', ruleVersion: 2,
      steps: [step(1, 'Finance approval', 'Role', IDS.rFinAdmin, 'Finance Approver', 'Approved', 140, 24, { actedBy: 'Rahul Kumar', actedById: IDS.uRahul, actedAt: ago(130) }), step(2, 'CFO approval', 'User', IDS.uOwner, 'CFO (above ₹5L)', 'Skipped', 140, 48)],
      currentStep: 2, status: 'Approved', submittedAt: ago(140), completedAt: ago(130), summary: 'Sunrise Industries · 5 lines',
      history: [{ at: ago(140), by: 'Priya Mehta', action: 'Submitted for approval' }, { at: ago(130), by: 'Rahul Kumar', action: 'Approved at step 1', step: 1 }],
    }),
    rec<ApprovalRequest>('apr_po_0090', {
      companyId: co, docType: 'Purchase Order', collection: C.purchaseOrders, docId: 'po_0090', docNumber: 'PO/26-27/0090', amount: 45200, currency: 'INR', branchId: IDS.brHO,
      requesterId: IDS.uSuresh, requesterName: 'Suresh Kumar', ruleId: 'wf_po', ruleName: 'Purchase Order Approval', ruleVersion: 2,
      steps: [step(1, 'Department head', 'Manager', 'manager', 'Vikram Singh (manager)', 'Rejected', 200, 24, { actedBy: 'Vikram Singh', actedById: IDS.uVikram, actedAt: ago(190), comment: 'Duplicate of PO/26-27/0089 — cancel this one' }), step(2, 'Finance approval', 'Role', IDS.rFinAdmin, 'Finance Admin', 'Pending', 200, 24)],
      currentStep: 1, status: 'Rejected', submittedAt: ago(200), completedAt: ago(190), summary: 'National Hardware Co · consumables',
      history: [{ at: ago(200), by: 'Suresh Kumar', action: 'Submitted for approval' }, { at: ago(190), by: 'Vikram Singh', action: 'Rejected at step 1', comment: 'Duplicate of PO/26-27/0089 — cancel this one', step: 1 }],
    }),
  ];

  // ── Audit events (~40 across modules / actors / channels) ────────────────
  let n = 0;
  const ev = (hoursAgo: number, actor: string, actorId: string | undefined, action: string, objectType: string, objectId: string | undefined, objectNumber: string | undefined, detail?: string, extra: Partial<AuditEvent> = {}): AuditEvent => {
    n += 1;
    return rec<AuditEvent>(`aud_${String(n).padStart(3, '0')}`, { companyId: co, tenantId: IDS.tenant, at: ago(hoursAgo), actor, actorId, action, objectType, objectId, objectNumber, result: 'Success', correlationId: `corr_${(0x1a2b3c + n * 7919).toString(16).toUpperCase()}`, channel: 'web', detail, ...extra });
  };
  const audit: AuditEvent[] = [
    ev(0.2, 'Rahul Kumar', IDS.uRahul, 'auth.login', 'User', IDS.uRahul, undefined, 'Chrome · Windows · MFA verified'),
    ev(0.4, 'Priya Mehta', IDS.uPriya, 'auth.login', 'User', IDS.uPriya, undefined, 'Chrome · macOS'),
    ev(1, 'Priya Mehta', IDS.uPriya, 'invoice.posted', 'Sales Invoice', 'inv_0118', 'INV/26-27/0118', 'Arlene Traders · ₹1,18,000.00 · JV/26-27/0412'),
    ev(1.1, 'system', undefined, 'journal.posted', 'Journal', 'jv_0412', 'JV/26-27/0412', 'Sales Invoice INV/26-27/0118 · Dr 118000 / Cr 118000', { channel: 'system' }),
    ev(1.2, 'system', undefined, 'stock.moved', 'StockMovement', 'sm_9001', 'INV/26-27/0118', 'Delivery HR-STL-4MM −20 MT @ Main Warehouse', { channel: 'system' }),
    ev(1.5, 'IRP', undefined, 'einvoice.accepted', 'Sales Invoice', 'inv_0118', 'INV/26-27/0118', 'IRN 4f1c…9a2 · Ack 232400012345678', { channel: 'worker', actor: 'IRP worker' }),
    ev(2, 'Anil Patil', IDS.uAnil, 'receipt.posted', 'Receipt', 'rcpt_0210', 'RCPT/26-27/0210', 'Rajesh Enterprises · ₹2,45,000.00 · allocated to INV/26-27/0117'),
    ev(3, 'Anita Rao', IDS.uAnita, 'workflow.submitted', 'Payment Batch', 'pb_0022', 'PMT-BATCH/0022', 'Payment Batch (Maker-Checker) v2 · 1 step(s)'),
    ev(4, 'Vikram Singh', IDS.uVikram, 'grn.posted', 'GRN', 'grn_0062', 'GRN/26-27/0062', 'Bharat Steel Suppliers · 3 lines accepted · 0 rejected'),
    ev(5, 'Rahul Kumar', IDS.uRahul, 'export', 'Sales Invoice', undefined, undefined, 'CSV · 118 rows · filters {"tab":"posted"}'),
    ev(6, 'Meena Joshi', IDS.uMeena, 'payroll.run.approved', 'Payroll Run', 'pr_run_0006', 'PR-RUN-0006', 'Aug 2026 · 8 employees · net ₹6,12,400'),
    ev(7, 'Rahul Kumar', IDS.uRahul, 'import.committed', 'Items', undefined, undefined, 'items-sep.csv: 42 rows imported, 3 errors, 1 duplicates skipped', { channel: 'import' }),
    ev(9, 'Suresh Kumar', IDS.uSuresh, 'workflow.submitted', 'Expense Claim', 'exp_0041', 'EXP/26-27/0041', 'Expense Claim (>₹5,000) v2 · 1 step(s)'),
    ev(10, 'Rahul Kumar', IDS.uRahul, 'user.invited', 'User', 'usr_kiran', undefined, 'kiran@acmepvt.com · Sales User · Acme Private Limited', { sensitive: true }),
    ev(12, 'Aarav Mehta', IDS.uOwner, 'role.updated', 'Role', IDS.rSalesUser, 'SALES_USER', 'Added sales.invoice.submit', { sensitive: true, before: { permissions: ['sales.invoice.create', 'sales.invoice.edit', 'sales.invoice.view'] }, after: { permissions: ['sales.invoice.create', 'sales.invoice.edit', 'sales.invoice.view', 'sales.invoice.submit'] } }),
    ev(14, 'Vikram Singh', IDS.uVikram, 'workflow.approve', 'Purchase Order', 'po_0093', 'PO/26-27/0093', 'Within Q2 raw-material budget'),
    ev(18, 'system', undefined, 'notification.failed', 'Notification', 'ntf_009', undefined, 'Email to auditor@kpmg.com bounced (550 mailbox unavailable)', { channel: 'worker', result: 'Failure' }),
    ev(20, 'Anil Patil', IDS.uAnil, 'journal.draft', 'Journal', 'jv_0045', 'JV/26-27/0045', 'Manual journal · prepaid insurance amortisation'),
    ev(22, 'Bank worker', undefined, 'bank.statement.imported', 'Bank Statement', 'bs_0031', 'HDFC ****1234', '43 lines · 2026-09-12 · fingerprint fp_3ad1', { channel: 'worker' }),
    ev(26, 'Deepa Nair', 'usr_deepa', 'auth.login', 'User', 'usr_deepa', undefined, 'Account suspended', { result: 'Denied' }),
    ev(28, 'Priya Mehta', IDS.uPriya, 'sales.invoice.edit', 'Sales Invoice', 'inv_0116', 'INV/26-27/0116', 'Rate override on line 2 · reason: negotiated', { before: { rate: 1450 }, after: { rate: 1380 } }),
    ev(30, 'Suresh Kumar', IDS.uSuresh, 'workflow.submitted', 'Purchase Order', 'po_0093', 'PO/26-27/0093', 'Purchase Order Approval v2 · 2 step(s)'),
    ev(34, 'Rahul Kumar', IDS.uRahul, 'numbering.void', 'NumberSeries', 'ns_salesinvoice', 'INV/26-27/0109', 'Cancelled before dispatch'),
    ev(40, 'Anita Rao', IDS.uAnita, 'supplier.bank.approved', 'Supplier', IDS.sNational, 'S-0002', 'ICICI Bank ****1234 approved after call-back verification', { sensitive: true }),
    ev(44, 'API key acme-erp-sync', undefined, 'api.read', 'Sales Invoice', undefined, undefined, 'GET /v1/sales-invoices?updatedSince=… · 200 · 118 rows', { channel: 'api' }),
    ev(48, 'Aarav Mehta', IDS.uOwner, 'user.mfa.enabled', 'User', IDS.uVikram, undefined, 'MFA enforced for Operations Manager', { sensitive: true }),
    ev(52, 'Vikram Singh', IDS.uVikram, 'workflow.submitted', 'Credit Note', 'cn_0008', 'CN/26-27/0008', 'Credit Note Approval v2 · 2 step(s)'),
    ev(60, 'Rahul Kumar', IDS.uRahul, 'user.suspended', 'User', 'usr_deepa', undefined, 'Left the organisation — pending exit clearance', { sensitive: true }),
    ev(70, 'Rahul Kumar', IDS.uRahul, 'export.queued', 'Audit', undefined, undefined, 'XLSX · 1,240 rows · masked · expires in 7 days'),
    ev(75, 'EWB worker', undefined, 'ewaybill.generated', 'Delivery', 'dc_0098', 'DC/26-27/0098', 'EWB 341002345678 · valid 2 day(s)', { channel: 'worker' }),
    ev(80, 'Rahul Kumar', IDS.uRahul, 'workflow.rule.updated', 'WorkflowRule', 'wf_inv', 'WF-001', 'Rule version 1 → 2: CFO step threshold raised to ₹5L', { before: { ruleVersion: 1 }, after: { ruleVersion: 2 } }),
    ev(90, 'Aarav Mehta', IDS.uOwner, 'credential.rotated', 'ProviderCredential', 'cred_irp_mh', 'IRP · 27AAAPL1234C1Z5', 'Client secret rotated', { sensitive: true }),
    ev(98, 'Anil Patil', IDS.uAnil, 'workflow.submitted', 'Journal', 'jv_0045', 'JV/26-27/0045', 'Journal Approval (Manual) v2 · 1 step(s)'),
    ev(110, 'Rahul Kumar', IDS.uRahul, 'template.updated', 'DocumentTemplate', IDS.tplInvoice, 'TPL-INV', 'Version 2 → 3: added IRN/QR block'),
    ev(120, 'Rahul Kumar', IDS.uRahul, 'export', 'Trial Balance', undefined, undefined, 'PDF · Aug 2026 · all branches'),
    ev(130, 'Rahul Kumar', IDS.uRahul, 'workflow.approve', 'Sales Invoice', 'inv_0112', 'INV/26-27/0112', undefined),
    ev(150, 'Vikram Singh', IDS.uVikram, 'stock.adjusted', 'Stock Adjustment', 'adj_0012', 'ADJ/26-27/0012', 'Count variance · −3 boxes · reason COUNTVAR'),
    ev(190, 'Vikram Singh', IDS.uVikram, 'workflow.reject', 'Purchase Order', 'po_0090', 'PO/26-27/0090', 'Duplicate of PO/26-27/0089 — cancel this one'),
    ev(236, 'Rahul Kumar', IDS.uRahul, 'period.softclosed', 'Period', 'per_acme_2026-08', 'Aug 2026', 'Month-end close complete'),
    ev(240, 'Rate worker', undefined, 'fx.rate.imported', 'ExchangeRate', 'fx_15', 'USD/INR', '84.42 Spot · RBI reference', { channel: 'worker' }),
    ev(300, 'Aarav Mehta', IDS.uOwner, 'plan.viewed', 'Tenant', IDS.tenant, undefined, 'Plan & usage · Pro v4'),
    ev(320, 'Rahul Kumar', IDS.uRahul, 'auth.password_reset', 'User', IDS.uAnil, undefined, 'Reset link issued to anil@acmepvt.com', { sensitive: true }),
    ev(400, 'Rahul Kumar', IDS.uRahul, 'localization.checked', 'Company', co, 'ACME', 'India pack 1.5 (Beta) compatibility check: compatible, upgrade deferred'),
    ev(500, 'Platform Admin', IDS.uPlatform, 'tenant.plan.changed', 'Tenant', 'tnt_nova', undefined, 'Growth → ERP Enterprise (grace)', { tenantId: 'tnt_platform', companyId: undefined }),
    ev(520, 'Platform Admin', IDS.uPlatform, 'tenant.suspended', 'Tenant', 'tnt_old', undefined, 'Payment failed 3 times', { tenantId: 'tnt_platform', companyId: undefined }),
    ev(600, 'Platform Admin', IDS.uPlatform, 'plan.versioned', 'Plan', IDS.planGrowth, 'GROWTH', 'Growth v1 activated; production is reserved for ERP Enterprise', { tenantId: 'tnt_platform', companyId: undefined }),
  ];

  // ── Notifications ────────────────────────────────────────────────────────
  const nt = (id: string, hoursAgo: number, type: Notification['type'], title: string, body: string, link: string, extra: Partial<Notification> = {}): Notification =>
    rec<Notification>(id, { companyId: co, at: ago(hoursAgo), type, title, body, link, read: hoursAgo > 30, status: 'delivered', channel: 'in-app', ...extra });
  const notifications: Notification[] = [
    nt('ntf_001', 1, 'approval', 'Sales Invoice INV/26-27/0116 awaits approval', 'Finance Approver · Global Tech Solutions · ₹89,500.00', 'approvals?id=apr_inv_0116'),
    nt('ntf_002', 1.5, 'integration', 'e-Invoice accepted: INV/26-27/0118', 'IRN generated · Ack 232400012345678', 'sales/invoices/inv_0118'),
    nt('ntf_003', 3, 'approval', 'Payment Batch PMT-BATCH/0022 awaits approval', 'Treasury Approver · 9 payments · ₹6,42,000.00', 'approvals?id=apr_pb_0022'),
    nt('ntf_004', 5, 'export', 'Export ready: sales-invoices-2026-09-13', '118 rows · CSV · expires in 7 days', 'admin/jobs'),
    nt('ntf_005', 7, 'import', 'Import complete: Items', '42 rows imported from items-sep.csv · 3 errors', 'admin/jobs?tab=imports'),
    nt('ntf_006', 9, 'due', '6 customer invoices overdue', 'Arlene Traders, Rajesh Enterprises and 4 more · ₹4,12,300.00 past due', 'sales/receivables'),
    nt('ntf_007', 14, 'approval', 'Purchase Order PO/26-27/0093 awaits Finance Admin', 'Step 2 of 2 · Shree Suppliers Ltd', 'approvals?id=apr_po_0093'),
    nt('ntf_008', 18, 'security', 'New sign-in on Safari · iPhone', 'rahul@acmepvt.com · Mumbai · if this was not you, sign out other sessions', `admin/users/${IDS.uRahul}`, { userId: IDS.uRahul }),
    nt('ntf_009', 18, 'system', 'Audit export mail to auditor@kpmg.com failed', '550 mailbox unavailable — retry from Notification settings', 'admin/notifications', { status: 'failed', channel: 'email' }),
    nt('ntf_010', 26, 'approval', 'Journal JV/26-27/0045 approval overdue', 'SLA breached by 3 days · escalated to Tenant Owner', 'approvals?id=apr_jv_0045'),
    nt('ntf_011', 40, 'due', 'GSTR-3B for Aug 2026 due on 20 Sep', 'Output tax ₹3,42,110 · Input credit ₹2,18,900', 'taxation/returns'),
    nt('ntf_012', 48, 'integration', 'Bank statement imported: HDFC ****1234', '43 lines · 7 unmatched', 'banking/reconciliation'),
    nt('ntf_013', 60, 'system', 'Background job dead-lettered: GSTR-1 export', 'Provider timeout after 3 attempts — replay from Jobs', 'admin/jobs', { status: 'sent', channel: 'email' }),
    nt('ntf_014', 72, 'due', 'Trial ends in 14 days for Zen Retail', 'Tenant tnt_zen', 'platform/tenants', { userId: IDS.uPlatform, companyId: undefined, status: 'queued', channel: 'email' }),
  ];

  // ── Import / export / background jobs ────────────────────────────────────
  const importJobs: ImportJob[] = [
    rec<ImportJob>('imp_001', { companyId: co, entity: 'Items', fileName: 'items-sep.csv', fingerprint: 'fp_8c21a0f3', rows: 46, valid: 42, errors: 3, duplicates: 1, status: 'Committed', errorRows: [{ row: 7, field: 'HSN', code: 'INVALID', message: 'HSN 7208 must be 6–8 digits' }, { row: 19, field: 'Base UOM', code: 'REQUIRED', message: 'Base UOM is required' }, { row: 33, field: 'Sales price', code: 'FORMAT', message: 'Sales price must be a number' }], committedAt: ago(7), by: 'Rahul Kumar' }),
    rec<ImportJob>('imp_002', { companyId: co, entity: 'Customers', fileName: 'customers-q2.csv', fingerprint: 'fp_1f9e77b2', rows: 120, valid: 112, errors: 8, duplicates: 0, status: 'Dry-run', errorRows: [{ row: 4, field: 'GSTIN', code: 'INVALID', message: 'GSTIN format is invalid (e.g. 27AAAPL1234C1Z5)' }, { row: 11, field: 'Email', code: 'INVALID', message: 'Enter a valid email address' }, { row: 45, field: 'Payment terms', code: 'REFERENCE', message: 'Payment term "Net 90" does not exist' }], by: 'Priya Mehta' }),
    rec<ImportJob>('imp_003', { companyId: co, entity: 'Opening balances', fileName: 'tb-2026-04-01.csv', fingerprint: 'fp_aa0b4411', rows: 84, valid: 84, errors: 0, duplicates: 0, status: 'Committed', errorRows: [], committedAt: ago(3200), by: 'Rahul Kumar' }),
    rec<ImportJob>('imp_004', { companyId: co, entity: 'Bank statement', fileName: 'hdfc-1234-aug.csv', fingerprint: 'fp_3ad1c9e0', rows: 43, valid: 0, errors: 1, duplicates: 43, status: 'Failed', errorRows: [{ row: 1, field: 'File', code: 'DUP_FILE', message: 'This exact file was already imported on 2026-09-12' }], by: 'Anil Patil' }),
  ];
  const exportJobs: ExportJob[] = [
    rec<ExportJob>('exp_job_001', { companyId: co, name: 'sales-invoices-2026-09-13', entity: 'Sales Invoice', format: 'CSV', filters: { tab: 'posted', q: '' }, scope: 'Acme · Head Office · FY 2026-27', status: 'Ready', rows: 118, requestedBy: 'Rahul Kumar', readyAt: ago(5), expiresAt: ahead(163), masked: false }),
    rec<ExportJob>('exp_job_002', { companyId: co, name: 'audit-log-2026-09-10', entity: 'Audit', format: 'XLSX', filters: { from: '2026-04-01', to: '2026-09-10' }, scope: 'Acme · all branches', status: 'Queued', rows: 1240, requestedBy: 'Rahul Kumar', expiresAt: ahead(168), masked: true }),
    rec<ExportJob>('exp_job_003', { companyId: co, name: 'stock-valuation-aug', entity: 'Stock valuation', format: 'PDF', filters: { period: '2026-08' }, scope: 'Acme · all warehouses', status: 'Expired', rows: 640, requestedBy: 'Vikram Singh', readyAt: ago(400), expiresAt: ago(232), masked: false }),
  ];
  const jobs: BackgroundJob[] = [
    rec<BackgroundJob>('job_001', { companyId: co, type: 'export', name: 'Export audit-log-2026-09-10 (XLSX)', status: 'Queued', attempts: 0, maxAttempts: 3, correlationId: 'corr_EXP0001', idempotencyKey: 'export:exp_job_002', payload: { exportJobId: 'exp_job_002' } }),
    rec<BackgroundJob>('job_002', { companyId: co, type: 'einvoice', name: 'IRP submit INV/26-27/0118', status: 'Completed', attempts: 1, maxAttempts: 3, correlationId: 'corr_EINV0118', idempotencyKey: 'einv:inv_0118', startedAt: ago(1.6), finishedAt: ago(1.5), payload: { docId: 'inv_0118' } }),
    rec<BackgroundJob>('job_003', { companyId: co, type: 'gstr', name: 'GSTR-1 export Aug 2026', status: 'Dead-letter', attempts: 3, maxAttempts: 3, lastError: 'GSTN_TIMEOUT: provider did not respond within 30s', correlationId: 'corr_GSTR0826', idempotencyKey: 'gstr1:2026-08', startedAt: ago(62), finishedAt: ago(60), payload: { period: '2026-08', registration: '27AAAPL1234C1Z5' } }),
    rec<BackgroundJob>('job_004', { companyId: co, type: 'notification', name: 'Email digest · approvals due', status: 'Retrying', attempts: 2, maxAttempts: 5, lastError: 'SMTP 421 try again later', correlationId: 'corr_NTF0921', idempotencyKey: 'digest:2026-09-13', startedAt: ago(0.5) }),
    rec<BackgroundJob>('job_005', { companyId: co, type: 'revaluation', name: 'FX revaluation Aug 2026', status: 'Completed', attempts: 1, maxAttempts: 3, correlationId: 'corr_REV0826', idempotencyKey: 'reval:2026-08', startedAt: ago(230), finishedAt: ago(229.9) }),
    rec<BackgroundJob>('job_006', { companyId: co, type: 'import', name: 'Import customers-q2.csv (dry-run)', status: 'Failed', attempts: 1, maxAttempts: 1, lastError: '8 rows failed validation', correlationId: 'corr_IMP0002', idempotencyKey: 'import:fp_1f9e77b2', startedAt: ago(9), finishedAt: ago(8.9) }),
  ];

  // ── Provider credentials / API keys / webhooks ───────────────────────────
  const providerCredentials: ProviderCredential[] = [
    rec<ProviderCredential>('cred_irp_mh', { companyId: co, provider: 'IRP', registrationId: 'reg_mh', label: 'IRP · Maharashtra (27AAAPL1234C1Z5)', username: 'API_ACME_MH', secretMasked: '••••••••••Xk9Q', rotatedAt: ago(90), expiresAt: ahead(24 * 275), status: 'Active', accessLog: [{ at: ago(90), by: 'Aarav Mehta', action: 'Rotated' }, { at: ago(1.5), by: 'IRP worker', action: 'Used · GenerateIRN' }, { at: ago(75), by: 'IRP worker', action: 'Used · GenerateIRN' }] }),
    rec<ProviderCredential>('cred_irp_gj', { companyId: co, provider: 'IRP', registrationId: 'reg_gj', label: 'IRP · Gujarat (24AAAPL1234C2Z3)', username: 'API_ACME_GJ', secretMasked: '••••••••••7Ha2', rotatedAt: ago(24 * 200), expiresAt: ago(24 * 5), status: 'Expired', accessLog: [{ at: ago(24 * 200), by: 'Rahul Kumar', action: 'Created' }] }),
    rec<ProviderCredential>('cred_ewb_mh', { companyId: co, provider: 'EWB', registrationId: 'reg_mh', label: 'e-Way bill · Maharashtra', username: 'EWB_ACME_MH', secretMasked: '••••••••••p3Lm', rotatedAt: ago(24 * 40), expiresAt: ahead(24 * 325), status: 'Active', accessLog: [{ at: ago(75), by: 'EWB worker', action: 'Used · GenerateEWB' }] }),
    rec<ProviderCredential>('cred_bank_hdfc', { companyId: co, provider: 'Bank', label: 'HDFC Bank · Corporate API (****1234)', username: 'ACMEPVT_H2H', secretMasked: '••••••••••Zz01', rotatedAt: ago(24 * 12), status: 'Active', accessLog: [{ at: ago(22), by: 'Bank worker', action: 'Used · FetchStatement' }, { at: ago(24 * 12), by: 'Anita Rao', action: 'Rotated' }] }),
    rec<ProviderCredential>('cred_rates', { companyId: co, provider: 'RateProvider', label: 'RBI reference rates', username: 'public', secretMasked: '—', rotatedAt: ago(24 * 100), status: 'Active', accessLog: [{ at: ago(240), by: 'Rate worker', action: 'Used · FetchRates' }] }),
    rec<ProviderCredential>('cred_email', { companyId: co, provider: 'Email', label: 'Transactional email (SES)', username: 'AKIA…ACME', secretMasked: '••••••••••mE41', rotatedAt: ago(24 * 60), status: 'Active', accessLog: [{ at: ago(18), by: 'Notification worker', action: 'Used · Send (failed 550)' }] }),
    rec<ProviderCredential>('cred_sms_old', { companyId: co, provider: 'SMS', label: 'SMS gateway (legacy)', username: 'acme_sms', secretMasked: '••••••••••q8Rt', rotatedAt: ago(24 * 400), status: 'Revoked', accessLog: [{ at: ago(24 * 30), by: 'Aarav Mehta', action: 'Revoked · migrated to WhatsApp provider' }] }),
  ];
  const apiKeys: ApiKey[] = [
    rec<ApiKey>('key_001', { companyId: co, name: 'acme-erp-sync', prefix: 'ebk_live_a1', keyMasked: 'ebk_live_a1••••••••••••••••3f9c', scopes: ['sales.invoice.view', 'sales.receipt.view', 'masters.customers.view', 'reports.*'], status: 'Active', lastUsedAt: ago(44), expiresAt: ahead(24 * 300) }),
    rec<ApiKey>('key_002', { companyId: co, name: 'shopify-connector (rotated out)', prefix: 'ebk_live_77', keyMasked: 'ebk_live_77••••••••••••••••b0d2', scopes: ['sales.order.create', 'masters.items.view', 'inventory.stock.view'], status: 'Revoked', lastUsedAt: ago(24 * 20), revokedAt: ago(24 * 15), revokedReason: 'Key leaked in CI logs — rotated' }),
  ];
  const webhooks: Webhook[] = [
    rec<Webhook>('wh_001', { companyId: co, url: 'https://hooks.acmepvt.com/erp/documents', description: 'Warehouse WMS sync', events: ['DocumentPosted', 'StockMoved', 'StockReversed', 'PurchaseReceived'], secretMasked: 'whsec_••••••••9Ke2', status: 'Active', lastDeliveryAt: ago(1.2), lastStatus: 'Success', failures: 0 }),
    rec<Webhook>('wh_002', { companyId: co, url: 'https://finance.acmegroup.in/events', description: 'Group finance data lake', events: ['JournalPosted', 'JournalReversed', 'PeriodLocked', 'PeriodReopened', 'PaymentCompleted', 'StatutorySubmissionAccepted'], secretMasked: 'whsec_••••••••Lp71', status: 'Paused', lastDeliveryAt: ago(30), lastStatus: 'Failed', failures: 4 }),
  ];
  const savedViews: SavedView[] = [
    rec<SavedView>('sv_001', { companyId: co, module: 'sales', register: 'invoices', name: 'Overdue > 30 days', filters: { tab: 'overdue', ageing: 'd3160' }, isDefault: false, ownerId: IDS.uPriya, shared: true }),
    rec<SavedView>('sv_002', { companyId: co, module: 'purchase', register: 'orders', name: 'Awaiting GRN', filters: { tab: 'approved', received: 'partial' }, isDefault: true, ownerId: IDS.uVikram, shared: false }),
    rec<SavedView>('sv_003', { companyId: co, module: 'admin', register: 'audit', name: 'Security events', filters: { sensitive: 'true' }, isDefault: false, ownerId: IDS.uOwner, shared: true }),
  ];

  // ── Notification settings (event → template → channels) ─────────────────
  const ns = (id: string, event: string, label: string, category: Notification['type'], template: string, inApp: boolean, email: boolean, sms: boolean, enabled = true): NotificationSetting =>
    rec<NotificationSetting>(id, { companyId: co, event, label, category, template, channels: { inApp, email, sms }, enabled });
  const notificationSettings: NotificationSetting[] = [
    ns('ns_001', 'DocumentSubmitted', 'Document awaits my approval', 'approval', '{{docType}} {{docNumber}} awaits approval — {{approverLabel}}', true, true, false),
    ns('ns_002', 'DocumentApproved', 'My request approved', 'approval', '{{docType}} {{docNumber}} approved by {{actor}}', true, true, false),
    ns('ns_003', 'DocumentRejected', 'My request rejected / returned', 'approval', '{{docType}} {{docNumber}} {{status}} — {{comment}}', true, true, true),
    ns('ns_004', 'ApprovalOverdue', 'Approval SLA breached', 'approval', '{{docType}} {{docNumber}} overdue by {{hours}}h — escalated to {{escalationRole}}', true, true, false),
    ns('ns_005', 'StatutorySubmissionAccepted', 'e-Invoice / e-Way bill accepted', 'integration', '{{provider}} accepted {{docNumber}} · {{providerRef}}', true, false, false),
    ns('ns_006', 'StatutorySubmissionRejected', 'e-Invoice / e-Way bill rejected', 'integration', '{{provider}} rejected {{docNumber}}: {{errorMessage}}', true, true, false),
    ns('ns_007', 'ImportCompleted', 'Import committed', 'import', 'Import complete: {{entity}} — {{rows}} rows, {{errors}} errors', true, false, false),
    ns('ns_008', 'ExportReady', 'Export ready to download', 'export', 'Export ready: {{name}} ({{rows}} rows) — expires {{expiresAt}}', true, true, false),
    ns('ns_009', 'InvoiceOverdue', 'Customer invoice overdue', 'due', '{{count}} invoices overdue · {{amount}}', true, true, false),
    ns('ns_010', 'ReturnDue', 'Statutory return due', 'due', '{{returnType}} for {{period}} due on {{dueDate}}', true, true, true),
    ns('ns_011', 'NewSignIn', 'New device sign-in', 'security', 'New sign-in on {{device}} · {{location}}', true, true, true),
    ns('ns_012', 'JobDeadLettered', 'Background job dead-lettered', 'system', 'Job {{name}} failed after {{attempts}} attempts: {{error}}', true, true, false),
    ns('ns_013', 'PeriodLocked', 'Period locked / reopened', 'system', 'Period {{period}} {{action}} by {{actor}}', true, false, false, false),
  ];

  return {
    [C.approvals]: approvals as any,
    [C.audit]: audit as any,
    [C.notifications]: notifications as any,
    [C.importJobs]: importJobs as any,
    [C.exportJobs]: exportJobs as any,
    [C.jobs]: jobs as any,
    [C.providerCredentials]: providerCredentials as any,
    [C.apiKeys]: apiKeys as any,
    [C.webhooks]: webhooks as any,
    [C.savedViews]: savedViews as any,
    [C.notificationSettings]: notificationSettings as any,
  };
}
