// Approvals helpers: document links, ageing, consequences and post-approval effects for
// admin-owned document types (Period Reopen, Profile Change).
import { db, C, engine } from '../../store';
import type { ApprovalRequest, Company, Period, Role, WorkflowRule } from '../../store';
import type { Consequence } from '../../components/ui/overlays';
import { daysBetween, today, fmtMoney } from '../../lib/format';

export const DOC_ROUTES: Record<string, string> = {
  salesInvoices: 'sales/invoices', creditNotes: 'sales/credit-notes', salesOrders: 'sales/orders', quotations: 'sales/quotations', deliveries: 'sales/deliveries', receipts: 'sales/receipts',
  purchaseOrders: 'purchase/orders', vendorInvoices: 'purchase/vendor-invoices', grns: 'purchase/grn', payments: 'purchase/payments', paymentBatches: 'banking/payment-batches', debitNotes: 'purchase/debit-notes', requisitions: 'purchase/requisitions',
  journals: 'accounting/journals', exchangeRates: 'accounting/fx', expenseClaims: 'budgets/expenses', stockAdjustments: 'inventory/adjustments', productionOrders: 'production/orders', timesheets: 'projects/timesheets',
  periods: 'admin/periods', companies: 'admin/profile', suppliers: 'masters/suppliers',
};

export function docPath(req: ApprovalRequest): string {
  if (req.docType === 'Period Reopen') return 'admin/periods';
  if (req.docType === 'Profile Change') return 'admin/profile';
  return `${DOC_ROUTES[req.collection] ?? req.collection}/${req.docId}`;
}

export const TYPE_ICON: Record<string, string> = { 'Sales Invoice': '📄', 'Purchase Order': '🛒', Journal: '📒', 'Payment Batch': '💳', 'Credit Note': '📋', 'Expense Claim': '🧾', 'Period Reopen': '🔓', 'Profile Change': '⚙️', 'Stock Adjustment': '📦', 'Supplier Bank Detail': '🏦', 'Exchange Rate': '💱', 'Production Order': '🏭', Timesheet: '⏱️' };

export function currentStep(req: ApprovalRequest) {
  return req.steps.find((s) => s.order === req.currentStep);
}

export function ageing(req: ApprovalRequest): { days: number; label: string; tone: 'critical' | 'warning' | 'good' | 'neutral'; overdue: boolean; hoursOver: number } {
  const step = currentStep(req);
  const days = daysBetween(req.submittedAt, today());
  const overdue = req.status === 'Pending' && !!step?.dueAt && new Date(step.dueAt) < new Date();
  const hoursOver = overdue && step?.dueAt ? Math.round((Date.now() - Date.parse(step.dueAt)) / 3600000) : 0;
  const tone = overdue ? 'critical' : days >= 2 ? 'warning' : 'neutral';
  return { days, label: days < 1 ? '< 1 d' : `${days} d`, tone, overdue, hoursOver };
}

/** Escalation target when the SLA has passed and the rule defines one (FR-WFL-005). */
export function escalation(req: ApprovalRequest): { toRole: string; afterHours: number } | null {
  const rule = db.find<WorkflowRule>(C.workflowRules, req.ruleId);
  if (!rule?.escalation) return null;
  const a = ageing(req);
  if (!a.overdue) return null;
  const role = db.find<Role>(C.roles, rule.escalation.toRole);
  return { toRole: role?.name ?? rule.escalation.toRole, afterHours: rule.escalation.afterHours };
}

export const MONEY_MOVING = ['Payment Batch', 'Journal', 'Sales Invoice', 'Credit Note', 'Vendor Invoice', 'Expense Claim', 'Period Reopen'];

export function consequencesFor(req: ApprovalRequest, action: 'Approve' | 'Reject' | 'Return'): Consequence[] {
  const money = fmtMoney(req.amount, req.currency);
  const step = currentStep(req);
  const next = req.steps.find((s) => s.order > (step?.order ?? 0) && s.status === 'Pending');
  if (action !== 'Approve') {
    return [
      { engine: 'Workflow', text: `${req.docNumber} is marked ${action === 'Reject' ? 'Rejected' : 'Returned for changes'} and goes back to ${req.requesterName}`, tone: 'warning' },
      { engine: 'Notification', text: `${req.requesterName} is notified with your comment` },
    ];
  }
  const out: Consequence[] = [];
  if (next) out.push({ engine: 'Workflow', text: `Step ${step?.order} approved · moves to step ${next.order} (${next.approverLabel})` });
  else {
    out.push({ engine: 'Workflow', text: `Final step · ${req.docNumber} becomes Approved`, tone: 'success' });
    switch (req.docType) {
      case 'Payment Batch': out.push({ engine: 'Open items', text: `${money} released for bank execution · supplier open items settle on payment`, tone: 'warning' }, { engine: 'Journal', text: 'Bank and AP journals post on completion' }); break;
      case 'Journal': out.push({ engine: 'Journal', text: `Manual journal ${money} can be posted into its period`, tone: 'warning' }); break;
      case 'Sales Invoice': out.push({ engine: 'Journal', text: `Dr AR / Cr Sales + output tax ${money} on posting` }, { engine: 'Statutory', text: 'e-Invoice (IRN) submission becomes available' }); break;
      case 'Credit Note': out.push({ engine: 'Journal', text: `Reverses revenue and tax ${money} against the original invoice` }, { engine: 'Open items', text: 'Customer balance reduces' }); break;
      case 'Purchase Order': out.push({ engine: 'Stock', text: `Commits ${money} of purchases · GRN can be recorded` }); break;
      case 'Expense Claim': out.push({ engine: 'Open items', text: `${money} becomes payable to the employee` }); break;
      case 'Period Reopen': out.push({ engine: 'Journal', text: `${req.docNumber} reopens — posting allowed again until it is re-locked`, tone: 'danger' }, { engine: 'Statutory', text: 'Filed returns for this period are not recalculated' }); break;
      case 'Profile Change': out.push({ engine: 'Workflow', text: 'Navigation and defaults change; existing documents are preserved' }); break;
      default: out.push({ engine: 'Workflow', text: 'Document may proceed to posting' });
    }
  }
  out.push({ engine: 'Notification', text: `${req.requesterName} is notified` });
  return out;
}

/** Side effects for admin-owned approval types once the request is fully approved. */
export function applyPostApproval(req: ApprovalRequest) {
  if (req.status !== 'Approved') return;
  if (req.docType === 'Period Reopen') {
    const p = db.find<Period>(C.periods, req.docId);
    if (p && p.status !== 'Open' && p.status !== 'Reopened') {
      const by = engine.ctx().userName;
      db.update<Period>(C.periods, p.id, { status: 'Reopened', lockedAt: undefined, lockedBy: undefined, history: [...p.history, { at: new Date().toISOString(), by, action: 'Reopened (approved)', reason: req.summary }] });
      engine.audit({ action: 'period.reopened', objectType: 'Period', objectId: p.id, objectNumber: p.label, detail: `Approved via ${req.ruleName} · ${req.summary ?? ''}` });
      engine.notify({ type: 'system', title: `${p.label} reopened`, body: req.summary, link: 'admin/periods' });
    }
  }
  if (req.docType === 'Profile Change') {
    const co = db.find<Company>(C.companies, req.docId);
    const to = (req as any).payload?.to as string[] | undefined ?? req.summary?.match(/→ (.+?)(?: ·|$)/)?.[1]?.split(' + ');
    if (co && to?.length) {
      db.update<Company>(C.companies, co.id, { profiles: to, nature: to.length > 1 ? 'Hybrid' : (to[0] as Company['nature']), profileHistory: [...co.profileHistory, { at: new Date().toISOString(), by: engine.ctx().userName, from: co.profiles, to, reason: req.summary ?? 'Approved profile change' }] });
      engine.audit({ action: 'profile.changed', objectType: 'Company', objectId: co.id, objectNumber: co.code, detail: `${co.profiles.join(' + ')} → ${to.join(' + ')} (approved)` });
    }
  }
}
