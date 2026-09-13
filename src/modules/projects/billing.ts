// Billing engine (FR-SRV-004) and retainers / advances (FR-SRV-005).
// previewBilling() is pure; generateBilling() writes Draft Sales Invoices into
// C.salesInvoices (same DocHeader shape the sales module posts) and stamps the
// invoiced flag on every source so nothing bills twice.
import { db, C, engine, ValidationError } from '../../store';
import type { DocHeader, DocLine, Item, OpenItem, Journal, Account } from '../../store';
import { fmtMoney, round, today, uid } from '../../lib/format';
import type { BillableExpense, BillingResult, BillingRun, Contract, Milestone, Retainer, RetainerAllocation, Timesheet, UsageRecord } from './types';
import { ACC } from './types';
import { addMonths, billRateFor, billableExpenses, companyRows, contractOf, costRateFor, customerOf, hourEntries, itemOf, milestonesOf, projectOf, projectsOfContract, resourceOf, settings, usageOf, toBaseAmount, weekDays } from './data';

const now = () => new Date().toISOString();

export interface BillingSource { type: 'Timesheet' | 'Expense' | 'Milestone' | 'Instalment' | 'Usage' | 'Recurring' | 'Cost'; id: string; rowId?: string; label: string; detail?: string; qty: number; rate: number; amount: number; date: string }

export interface BillingPreview {
  contract: Contract;
  method: Contract['billingMethod'];
  lines: DocLine[];
  sources: BillingSource[];
  taxable: number;
  total: number;
  taxAmt: number;
  currency: string;
  rate: number;
  skipReason?: string;
  retainerAvailable: number;
  warnings: string[];
}

function serviceLine(c: Contract, itemId: string | undefined, name: string, qty: number, rate: number, uom: string, description?: string): DocLine {
  const item = itemOf(itemId) ?? itemOf(settings().prjDefaultServiceItemId) ?? db.findBy<Item>(C.items, (i) => i.type === 'Service' && i.status === 'Active');
  const dim = projectOf(c.projectId)?.dimensionId ?? c.dimensions?.Project;
  return engine.newLine({ itemId: item?.id, itemCode: item?.code, itemName: name, description, hsn: item?.hsn, qty: round(qty, 3), uom, rate: round(rate, 2), listRate: round(rate, 2), priceListName: 'Contract', taxRateId: c.taxRateId ?? item?.taxRateId, accountId: item?.salesAccountId ?? ACC.serviceRev, dimensions: dim ? { Project: dim } : undefined });
}

function fxRate(c: Contract, date: string): number {
  const base = engine.ctx().currency;
  return c.currency === base ? 1 : engine.resolveRate(c.currency, base, date).rate || 1;
}

/** What each contract would bill for the period, by method. Pure — no writes. */
export function previewBilling(period: { from: string; to: string }, contractIds?: string[]): BillingPreview[] {
  const contracts = companyRows<Contract>(C.contracts).filter((c) => c.status === 'Active' && (!contractIds || contractIds.includes(c.id)));
  return contracts.map((c) => previewContract(c, period));
}

export function previewContract(c: Contract, period: { from: string; to: string }): BillingPreview {
  const sources: BillingSource[] = [];
  const lines: DocLine[] = [];
  const warnings: string[] = [];
  const pids = projectsOfContract(c.id).map((p) => p.id);
  const svc = c.serviceItemId;
  const base = engine.ctx().currency;
  const retainerAvailable = round(companyRows<Retainer>(C.retainers).filter((r) => r.customerId === c.customerId && r.status === 'Open' && r.currency === c.currency).reduce((s, r) => s + r.remaining, 0));

  const addHours = (mode: 'bill' | 'cost') => {
    const entries = hourEntries({ projectIds: pids, statuses: ['Approved'], billableOnly: true, uninvoicedOnly: true, to: period.to });
    if (!pids.length) warnings.push('No project is linked to this contract — timesheets cannot be matched');
    const byKey = new Map<string, { employeeId: string; name: string; role?: string; rate: number; hours: number; rowIds: Set<string>; tsIds: Set<string> }>();
    entries.forEach((e) => {
      const emp = e.timesheet.employeeId;
      const res = resourceOf(emp);
      const rate = mode === 'cost' ? round(costRateFor(emp) * (1 + (c.markupPct ?? 0) / 100), 2) : billRateFor(c, emp, e.row.serviceId).rate;
      const key = `${emp}|${rate}`;
      const g = byKey.get(key) ?? { employeeId: emp, name: e.timesheet.employeeName, role: res?.role, rate, hours: 0, rowIds: new Set(), tsIds: new Set() };
      g.hours = round(g.hours + e.hours, 2);
      g.rowIds.add(e.row.id);
      g.tsIds.add(e.timesheet.id);
      byKey.set(key, g);
      sources.push({ type: 'Timesheet', id: e.timesheet.id, rowId: e.row.id, label: `${e.timesheet.number} · ${e.timesheet.employeeName}`, detail: `${e.row.task || projectOf(e.row.projectId)?.name} · ${e.date}`, qty: e.hours, rate, amount: round(e.hours * rate), date: e.date });
    });
    byKey.forEach((g) => {
      if (g.rate <= 0) warnings.push(`No bill rate for ${g.name} — set a resource rate, contract rate or rate card`);
      lines.push(serviceLine(c, svc, `${mode === 'cost' ? 'Cost-plus services' : 'Professional services'} — ${g.name}${g.role ? ` (${g.role})` : ''}`, g.hours, g.rate, 'Hr', `${g.hours} h approved to ${period.to}${mode === 'cost' ? ` · cost + ${c.markupPct ?? 0}%` : ''}`));
    });
    const exps = billableExpenses().filter((x) => x.status === 'Ready' && pids.includes(x.projectId) && x.date <= period.to);
    exps.forEach((x) => {
      const amt = mode === 'cost' ? round(x.amount * (1 + (c.markupPct ?? 0) / 100)) : x.billAmount;
      const fx = c.currency === base ? 1 : 1 / (engine.resolveRate(c.currency, base, period.to).rate || 1);
      sources.push({ type: 'Expense', id: x.id, label: `${x.claimNumber} · ${x.employeeName}`, detail: x.description, qty: 1, rate: round(amt * fx), amount: round(amt * fx), date: x.date });
      lines.push(serviceLine(c, svc, `Reimbursable expense — ${x.description}`, 1, round(amt * fx), 'Nos', `${x.claimNumber} · ${x.employeeName} · ${x.date}${x.markupPct ? ` · +${x.markupPct}%` : ''}`));
    });
  };

  switch (c.billingMethod) {
    case 'Time & material': addHours('bill'); break;
    case 'Cost plus': addHours('cost'); break;
    case 'Milestone': {
      milestonesOf(c.id).filter((m) => m.status === 'Achieved').forEach((m) => {
        sources.push({ type: 'Milestone', id: m.id, label: m.name, detail: `Achieved ${m.achievedAt ?? ''}`, qty: 1, rate: m.amount, amount: m.amount, date: m.achievedAt ?? m.due });
        lines.push(serviceLine(c, svc, `Milestone — ${m.name}`, 1, m.amount, 'Nos', `${c.title} · achieved ${m.achievedAt ?? m.due}`));
      });
      break;
    }
    case 'Fixed price': {
      milestonesOf(c.id).filter((m) => m.status !== 'Invoiced' && (m.status === 'Achieved' || m.due <= period.to)).forEach((m) => {
        sources.push({ type: 'Instalment', id: m.id, label: m.name, detail: `Due ${m.due}`, qty: 1, rate: m.amount, amount: m.amount, date: m.due });
        lines.push(serviceLine(c, svc, `${c.title} — ${m.name}`, 1, m.amount, 'Nos', `Fixed price instalment · due ${m.due}`));
      });
      break;
    }
    case 'Recurring': {
      const r = c.recurrence;
      if (r && r.nextBillDate >= period.from && r.nextBillDate <= period.to && (!r.endDate || r.nextBillDate <= r.endDate)) {
        const label = `${r.frequency} fee · ${r.nextBillDate.slice(0, 7)}`;
        sources.push({ type: 'Recurring', id: c.id, label, qty: 1, rate: r.amount, amount: r.amount, date: r.nextBillDate });
        lines.push(serviceLine(c, svc, `${c.title} — ${r.frequency.toLowerCase()} fee`, 1, r.amount, 'Nos', `Period from ${r.nextBillDate} · next bill ${addMonths(r.nextBillDate, r.frequency === 'Monthly' ? 1 : r.frequency === 'Quarterly' ? 3 : 12)}`));
      }
      break;
    }
    case 'Usage': {
      const byMetric = new Map<string, { qty: number; amount: number; ids: string[] }>();
      usageOf(c.id).filter((u) => !u.invoiced && u.period <= period.to.slice(0, 7)).forEach((u) => {
        const g = byMetric.get(u.metric) ?? { qty: 0, amount: 0, ids: [] };
        g.qty = round(g.qty + u.qty, 3); g.amount = round(g.amount + u.amount); g.ids.push(u.id);
        byMetric.set(u.metric, g);
        sources.push({ type: 'Usage', id: u.id, label: `${u.metric} · ${u.period}`, qty: u.qty, rate: u.rate, amount: u.amount, date: u.date });
      });
      byMetric.forEach((g, metric) => lines.push(serviceLine(c, svc, `${metric} — usage to ${period.to.slice(0, 7)}`, g.qty, g.qty ? round(g.amount / g.qty, 4) : 0, c.usage?.unit ?? 'Nos', `${g.ids.length} usage record(s)`)));
      break;
    }
  }
  const rate = fxRate(c, period.to);
  const cust = customerOf(c.customerId);
  const tc = engine.taxContextFor('Customer', c.customerId, 'sale', c.branchId);
  const computed = engine.computeDocument(lines, tc, { roundTotal: true, rate });
  let skipReason: string | undefined;
  if (!lines.length) skipReason = 'Nothing to bill for this period';
  else if (!cust || cust.status !== 'Active') skipReason = `Customer is ${cust?.status ?? 'missing'}`;
  if (c.billingMethod === 'Time & material' && c.capAmount && c.capAmount > 0) {
    const billedSoFar = companyRows<DocHeader>(C.salesInvoices).filter((i) => i.sourceType === 'Contract' && i.sourceId === c.id && i.status !== 'Cancelled' && i.status !== 'Reversed').reduce((s, i) => s + (i.totals?.taxable ?? 0), 0);
    if (billedSoFar + computed.totals.taxable > c.capAmount) warnings.push(`Cap ${fmtMoney(c.capAmount, c.currency)} exceeded: ${fmtMoney(billedSoFar + computed.totals.taxable, c.currency)} billed after this run`);
  }
  return { contract: c, method: c.billingMethod, lines: computed.lines, sources, taxable: computed.totals.taxable, total: computed.totals.total, taxAmt: computed.totals.tax, currency: c.currency, rate, skipReason, retainerAvailable, warnings };
}

/** Generate Draft Sales Invoices for every billable preview. Sources are flagged so they never bill twice. */
export function generateBilling(previews: BillingPreview[], opts: { date: string; period: string; from: string; to: string; applyRetainer: boolean; notes?: string }): BillingRun {
  const billable = previews.filter((p) => !p.skipReason && p.lines.length);
  if (!billable.length) throw new ValidationError('Nothing to generate — every selected contract is skipped', 'EMPTY');
  engine.assertPostable(opts.date);
  const c0 = engine.ctx();
  return db.transaction(() => {
    const results: BillingResult[] = [];
    const invoiceIds: string[] = [];
    const runId = uid('brun');
    previews.forEach((p) => {
      const c = p.contract;
      const cust = customerOf(c.customerId);
      if (p.skipReason || !cust) { results.push({ contractId: c.id, contractNumber: c.number, customerId: c.customerId, customerName: cust?.name ?? '', method: c.billingMethod, currency: c.currency, amount: 0, taxable: 0, skipped: p.skipReason ?? 'Customer missing', sources: 0 }); return; }
      // duplicate guard: re-check every source is still unbilled at generation time
      const stale = p.sources.find((s) => (s.type === 'Timesheet' && db.find<Timesheet>(C.timesheets, s.id)?.rows.find((r) => r.id === s.rowId)?.invoiceId) || (s.type === 'Expense' && db.find<BillableExpense>(C.billableExpenses, s.id)?.status === 'Invoiced') || ((s.type === 'Milestone' || s.type === 'Instalment') && db.find<Milestone>(C.milestones, s.id)?.status === 'Invoiced') || (s.type === 'Usage' && db.find<UsageRecord>(C.usageRecords, s.id)?.invoiced) || (s.type === 'Recurring' && contractOf(c.id)?.lastRecurringPeriod === opts.period));
      if (stale) { results.push({ contractId: c.id, contractNumber: c.number, customerId: c.customerId, customerName: cust.name, method: c.billingMethod, currency: c.currency, amount: 0, taxable: 0, skipped: `Already billed: ${stale.label}`, sources: 0 }); return; }
      const snap = engine.partySnapshotFor('Customer', c.customerId);
      const dim = projectOf(c.projectId)?.dimensionId ?? c.dimensions?.Project;
      const terms = c.paymentTerms ?? cust.paymentTerms;
      const header = engine.newDocHeader('Sales Invoice', { date: opts.date, dueDate: engine.dueDateFor(opts.date, terms), paymentTerms: terms, partyType: 'Customer', partyId: c.customerId, partyName: cust.name, partySnapshot: snap, currency: c.currency, rate: p.rate, rateType: p.rate === 1 ? 'Same' : 'Spot', sourceType: 'Contract', sourceId: c.id, sourceNumber: c.number, reference: `${c.number} · ${opts.period}`, dimensions: dim ? { Project: dim } : undefined, placeOfSupply: snap?.state, placeOfSupplyCode: snap?.stateCode, templateId: c0.company?.defaults.templateId, branchId: c.branchId, notes: `Generated by billing run for ${opts.period} · contract ${c.number} (${c.billingMethod}) · ${p.sources.length} source(s)${opts.notes ? ' · ' + opts.notes : ''}` });
      const tc = engine.taxContextFor('Customer', c.customerId, 'sale', c.branchId);
      // retainer application: reduce due, record allocation as Pending until the invoice posts
      let applied = 0;
      const retainers = opts.applyRetainer ? companyRows<Retainer>(C.retainers).filter((r) => r.customerId === c.customerId && r.status === 'Open' && r.currency === c.currency && r.remaining > 0).sort((a, b) => a.receivedDate.localeCompare(b.receivedDate)) : [];
      const computed0 = engine.computeDocument(p.lines, tc, { roundTotal: true, rate: p.rate });
      let toApply = computed0.totals.total;
      const allocs: { retainer: Retainer; amount: number }[] = [];
      retainers.forEach((r) => { if (toApply <= 0) return; const a = round(Math.min(r.remaining, toApply)); if (a > 0) { allocs.push({ retainer: r, amount: a }); toApply = round(toApply - a); applied = round(applied + a); } });
      const computed = engine.computeDocument(p.lines, tc, { roundTotal: true, rate: p.rate, paid: applied });
      const inv = db.insert<DocHeader & { roundTotal: boolean; retainerApplied?: number }>(C.salesInvoices, { ...header, lines: computed.lines, totals: computed.totals, status: 'Draft', roundTotal: true, retainerApplied: applied || undefined, notes: applied ? `${header.notes}\nRetainer applied: ${fmtMoney(applied, c.currency)} (${allocs.map((a) => a.retainer.number).join(', ')}) — settles against the receivable when this invoice posts.` : header.notes, createdAt: undefined, updatedAt: undefined, version: undefined } as any);
      allocs.forEach(({ retainer, amount }) => {
        const alloc: RetainerAllocation = { id: uid('ra'), invoiceId: inv.id, invoiceNumber: inv.number, amount, date: opts.date, status: 'Pending' };
        const allocated = round(retainer.allocated + amount);
        db.update<Retainer>(C.retainers, retainer.id, { allocations: [...retainer.allocations, alloc], allocated, remaining: round(retainer.amount - allocated), status: retainer.amount - allocated <= 0.005 ? 'Fully allocated' : 'Open' });
        engine.audit({ action: 'retainer.applied', objectType: 'Retainer', objectId: retainer.id, objectNumber: retainer.number, detail: `${fmtMoney(amount, c.currency)} applied to draft ${inv.number} (${c.number})` });
      });
      // stamp sources
      const stamp = { invoiceId: inv.id, invoiceNumber: inv.number, invoicedAt: now() };
      const tsIds = new Set<string>();
      p.sources.forEach((s) => {
        if (s.type === 'Timesheet' && s.rowId) {
          const ts = db.find<Timesheet>(C.timesheets, s.id)!;
          tsIds.add(ts.id);
          db.update<Timesheet>(C.timesheets, ts.id, (prev) => ({ rows: prev.rows.map((r) => (r.id === s.rowId ? { ...r, ...stamp } : r)) }));
        } else if (s.type === 'Expense') db.update<BillableExpense>(C.billableExpenses, s.id, { status: 'Invoiced', ...stamp });
        else if (s.type === 'Milestone' || s.type === 'Instalment') db.update<Milestone>(C.milestones, s.id, { status: 'Invoiced', ...stamp });
        else if (s.type === 'Usage') db.update<UsageRecord>(C.usageRecords, s.id, { invoiced: true, invoiceId: inv.id, invoiceNumber: inv.number });
        else if (s.type === 'Recurring') { const r = c.recurrence!; db.update<Contract>(C.contracts, c.id, { lastRecurringPeriod: opts.period, recurrence: { ...r, nextBillDate: addMonths(r.nextBillDate, r.frequency === 'Monthly' ? 1 : r.frequency === 'Quarterly' ? 3 : 12) } }); }
      });
      tsIds.forEach((id) => {
        const ts = db.find<Timesheet>(C.timesheets, id)!;
        const allBilled = ts.rows.every((r) => !r.billable || r.hours.every((h) => !h) || r.invoiceId);
        if (allBilled) db.update<Timesheet>(C.timesheets, id, { status: 'Invoiced', invoicedInvoiceId: inv.id, invoicedAt: now() });
      });
      engine.audit({ action: 'invoice.created', objectType: 'Sales Invoice', objectId: inv.id, objectNumber: inv.number, detail: `Billing run ${opts.period} · ${c.number} (${c.billingMethod}) · ${p.sources.length} source(s) · ${fmtMoney(computed.totals.total, c.currency)}`, correlationId: inv.correlationId });
      invoiceIds.push(inv.id);
      results.push({ contractId: c.id, contractNumber: c.number, customerId: c.customerId, customerName: cust.name, method: c.billingMethod, currency: c.currency, amount: computed.totals.total, taxable: computed.totals.taxable, invoiceId: inv.id, invoiceNumber: inv.number, retainerApplied: applied || undefined, sources: p.sources.length });
    });
    const number = engine.allocateNumber('Billing Run', { date: opts.date });
    const run = db.insert<BillingRun>(C.billingRuns, { id: runId, number, period: opts.period, from: opts.from, to: opts.to, date: opts.date, contractIds: previews.map((p) => p.contract.id), results, invoiceIds, status: 'Generated', by: c0.userName, applyRetainer: opts.applyRetainer, branchId: c0.branchId, notes: opts.notes } as any);
    engine.audit({ action: 'billing.generated', objectType: 'Billing Run', objectId: run.id, objectNumber: run.number, detail: `${opts.period} · ${invoiceIds.length} invoice(s) · ${results.filter((r) => r.skipped).length} skipped` });
    engine.notify({ type: 'system', title: `Billing run ${run.number}: ${invoiceIds.length} draft invoice(s)`, body: `Period ${opts.period} · review and post under Sales › Invoices`, link: 'sales/invoices' });
    return run;
  });
}

/** Cancel a run: deletes still-Draft invoices it generated and releases their sources. Posted invoices stay. */
export function cancelBillingRun(id: string, reason: string): BillingRun {
  const run = db.find<BillingRun>(C.billingRuns, id);
  if (!run) throw new ValidationError('Billing run not found', 'NOT_FOUND');
  if (run.status === 'Cancelled') return run;
  const posted = run.invoiceIds.map((i) => db.find<DocHeader>(C.salesInvoices, i)).filter((i) => i && i.status !== 'Draft');
  if (posted.length) throw new ValidationError(`${posted.length} invoice(s) from this run are already posted — reverse them in Sales first`, 'INVALID_STATE');
  return db.transaction(() => {
    run.invoiceIds.forEach((invId) => releaseInvoiceSources(invId));
    const out = db.update<BillingRun>(C.billingRuns, run.id, { status: 'Cancelled', notes: [run.notes, `Cancelled: ${reason}`].filter(Boolean).join('\n') });
    engine.audit({ action: 'billing.cancelled', objectType: 'Billing Run', objectId: run.id, objectNumber: run.number, detail: reason });
    return out;
  });
}

/** Release every source stamped with a (draft) invoice id and delete the draft. */
export function releaseInvoiceSources(invoiceId: string) {
  const inv = db.find<DocHeader>(C.salesInvoices, invoiceId);
  companyRows<Timesheet>(C.timesheets).forEach((ts) => {
    if (!ts.rows.some((r) => r.invoiceId === invoiceId)) return;
    db.update<Timesheet>(C.timesheets, ts.id, { rows: ts.rows.map((r) => (r.invoiceId === invoiceId ? { ...r, invoiceId: undefined, invoiceNumber: undefined, invoicedAt: undefined } : r)), status: ts.status === 'Invoiced' ? 'Approved' : ts.status, invoicedInvoiceId: undefined, invoicedAt: undefined });
  });
  companyRows<BillableExpense>(C.billableExpenses).filter((b) => b.invoiceId === invoiceId).forEach((b) => db.update<BillableExpense>(C.billableExpenses, b.id, { status: 'Ready', invoiceId: undefined, invoiceNumber: undefined, invoicedAt: undefined }));
  companyRows<Milestone>(C.milestones).filter((m) => m.invoiceId === invoiceId).forEach((m) => db.update<Milestone>(C.milestones, m.id, { status: m.kind === 'Milestone' ? 'Achieved' : 'Pending', invoiceId: undefined, invoiceNumber: undefined, invoicedAt: undefined }));
  companyRows<UsageRecord>(C.usageRecords).filter((u) => u.invoiceId === invoiceId).forEach((u) => db.update<UsageRecord>(C.usageRecords, u.id, { invoiced: false, invoiceId: undefined, invoiceNumber: undefined }));
  companyRows<Retainer>(C.retainers).forEach((r) => {
    const mine = r.allocations.filter((a) => a.invoiceId === invoiceId && a.status === 'Pending');
    if (!mine.length) return;
    const amt = mine.reduce((s, a) => s + a.amount, 0);
    const allocated = round(r.allocated - amt);
    db.update<Retainer>(C.retainers, r.id, { allocations: r.allocations.filter((a) => !(a.invoiceId === invoiceId && a.status === 'Pending')), allocated, remaining: round(r.amount - allocated), status: 'Open' });
  });
  if (inv && inv.status === 'Draft') db.remove(C.salesInvoices, inv.id);
  if (inv?.sourceId) { const c = contractOf(inv.sourceId); if (c?.billingMethod === 'Recurring' && c.lastRecurringPeriod && c.recurrence) db.update<Contract>(C.contracts, c.id, { lastRecurringPeriod: undefined, recurrence: { ...c.recurrence, nextBillDate: addMonths(c.recurrence.nextBillDate, c.recurrence.frequency === 'Monthly' ? -1 : c.recurrence.frequency === 'Quarterly' ? -3 : -12) } }); }
}

// ── Retainers & advances (FR-SRV-005) ──────────────────────────────────────

export function newRetainer(partial: Partial<Retainer> = {}): Partial<Retainer> {
  const c = engine.ctx();
  return { customerId: '', amount: 0, currency: c.currency, receivedDate: today(), bankAccountId: c.company?.defaults.bankAccountId ?? ACC.hdfc, allocations: [], allocated: 0, remaining: 0, status: 'Open', ...partial };
}

/** Record a retainer: Dr bank · Cr Retainers received (2160) + customer Credit open item. */
export function recordRetainer(input: Partial<Retainer> & { customerId: string; amount: number; receivedDate: string; bankAccountId: string }): Retainer {
  const cust = customerOf(input.customerId);
  if (!cust) throw new ValidationError('Choose a customer', 'VALIDATION', 'customerId');
  if (!(input.amount > 0)) throw new ValidationError('Amount must be positive', 'VALIDATION', 'amount');
  const bank = db.find<Account>(C.accounts, input.bankAccountId);
  if (!bank) throw new ValidationError('Choose a bank account', 'VALIDATION', 'bankAccountId');
  engine.assertPostable(input.receivedDate);
  const c0 = engine.ctx();
  const currency = input.currency ?? c0.currency;
  const rate = currency === c0.currency ? 1 : engine.resolveRate(currency, c0.currency, input.receivedDate).rate || 1;
  return db.transaction(() => {
    const id = uid('ret');
    const number = engine.allocateNumber('Retainer', { date: input.receivedDate });
    const j = engine.postJournal({ date: input.receivedDate, currency, rate, sourceType: 'Retainer', sourceId: id, sourceNumber: number, narration: `Retainer received from ${cust.name}${input.reference ? ' · ' + input.reference : ''}`, idempotencyKey: `ret:${id}:post`, lines: [{ accountId: bank.id, dr: input.amount, narration: input.reference }, { accountId: ACC.retainers, cr: input.amount, partyType: 'Customer', partyId: cust.id, partyName: cust.name, narration: 'Retainer / advance' }] });
    const oi = engine.createOpenItem({ partyType: 'Customer', partyId: cust.id, partyName: cust.name, docType: 'Retainer', docId: id, docNumber: number, date: input.receivedDate, dueDate: input.receivedDate, currency, originalAmount: input.amount, baseAmount: round(input.amount * rate), rate, direction: 'Credit', branchId: c0.branchId });
    const ret = db.insert<Retainer>(C.retainers, { id, number, customerId: cust.id, customerName: cust.name, contractId: input.contractId, amount: round(input.amount), currency, rate, baseAmount: round(input.amount * rate), receivedDate: input.receivedDate, bankAccountId: bank.id, reference: input.reference, notes: input.notes, journalId: j.id, journalNumber: j.number, openItemId: oi.id, allocations: [], allocated: 0, remaining: round(input.amount), status: 'Open', branchId: c0.branchId } as any);
    engine.audit({ action: 'retainer.received', objectType: 'Retainer', objectId: ret.id, objectNumber: number, detail: `${cust.name} · ${fmtMoney(input.amount, currency)} · ${j.number}` });
    engine.notify({ type: 'system', title: `Retainer ${number} recorded`, body: `${cust.name} · ${fmtMoney(input.amount, currency)}`, link: `projects/retainers/${ret.id}` });
    return ret;
  });
}

/** Posted invoices of the customer with an outstanding open item (allocation targets). */
export function eligibleInvoices(retainer: Retainer): { invoice: DocHeader; openItem: OpenItem }[] {
  return companyRows<DocHeader>(C.salesInvoices)
    .filter((i) => i.partyId === retainer.customerId && (i.status === 'Posted' || i.status === 'Settled') && i.currency === retainer.currency)
    .map((invoice) => ({ invoice, openItem: db.findBy<OpenItem>(C.openItems, (o) => o.docId === invoice.id && o.direction === 'Debit')! }))
    .filter((x) => x.openItem && x.openItem.outstanding > 0.005);
}

/** Allocate a retainer to a posted invoice: Dr 2160 · Cr AR, settle both open items. */
export function allocateRetainer(retainerId: string, invoiceId: string, amount: number, date = today()): Retainer {
  const r = db.find<Retainer>(C.retainers, retainerId);
  if (!r) throw new ValidationError('Retainer not found', 'NOT_FOUND');
  if (r.status === 'Reversed') throw new ValidationError('Retainer is reversed', 'INVALID_STATE');
  const inv = db.find<DocHeader>(C.salesInvoices, invoiceId);
  if (!inv) throw new ValidationError('Invoice not found', 'NOT_FOUND');
  if (inv.partyId !== r.customerId) throw new ValidationError('Invoice belongs to a different customer', 'VALIDATION', 'invoiceId');
  if (inv.status !== 'Posted' && inv.status !== 'Settled') throw new ValidationError(`Invoice ${inv.number} is ${inv.status} — allocations settle posted invoices only`, 'INVALID_STATE');
  const oi = db.findBy<OpenItem>(C.openItems, (o) => o.docId === inv.id && o.direction === 'Debit');
  if (!oi) throw new ValidationError('No receivable open item for this invoice', 'INVALID_STATE');
  if (!(amount > 0)) throw new ValidationError('Allocation must be positive', 'VALIDATION', 'amount');
  if (amount > r.remaining + 0.005) throw new ValidationError(`Only ${fmtMoney(r.remaining, r.currency)} remains on ${r.number}`, 'OVER_ALLOCATION', 'amount');
  if (amount > oi.outstanding + 0.005) throw new ValidationError(`Invoice outstanding is ${fmtMoney(oi.outstanding, inv.currency)}`, 'OVER_ALLOCATION', 'amount');
  engine.assertPostable(date);
  return db.transaction(() => {
    const allocId = uid('ra');
    const j = engine.postJournal({ date, currency: r.currency, rate: r.rate, sourceType: 'Retainer Allocation', sourceId: r.id, sourceNumber: r.number, narration: `Retainer ${r.number} applied to ${inv.number} · ${r.customerName}`, idempotencyKey: `ret:${r.id}:alloc:${inv.id}:${allocId}`, lines: [{ accountId: ACC.retainers, dr: amount, partyType: 'Customer', partyId: r.customerId, partyName: r.customerName }, { accountId: customerOf(r.customerId)?.receivableAccountId ?? ACC.ar, cr: amount, partyType: 'Customer', partyId: r.customerId, partyName: r.customerName, narration: inv.number }] });
    engine.settleOpenItem(oi.id, { amount, docType: 'Retainer', docId: r.id, docNumber: r.number, date, rate: r.rate });
    if (r.openItemId) { const roi = db.find<OpenItem>(C.openItems, r.openItemId); if (roi && roi.outstanding >= amount - 0.005) engine.settleOpenItem(roi.id, { amount, docType: 'Sales Invoice', docId: inv.id, docNumber: inv.number, date, rate: r.rate, postFx: false }); }
    const pending = r.allocations.find((a) => a.invoiceId === inv.id && a.status === 'Pending' && Math.abs(a.amount - amount) < 0.005);
    const alloc: RetainerAllocation = pending ? { ...pending, date, journalId: j.id, journalNumber: j.number, status: 'Settled' } : { id: allocId, invoiceId: inv.id, invoiceNumber: inv.number, amount, date, journalId: j.id, journalNumber: j.number, status: 'Settled' };
    const allocations = pending ? r.allocations.map((a) => (a.id === pending.id ? alloc : a)) : [...r.allocations, alloc];
    const allocated = round(allocations.filter((a) => a.status !== 'Reversed').reduce((s, a) => s + a.amount, 0));
    const paid = round((inv.totals.paid ?? 0) + (pending ? 0 : amount));
    db.update<DocHeader>(C.salesInvoices, inv.id, { totals: { ...inv.totals, paid, due: round(inv.totals.total - paid - (inv.totals.credited ?? 0) - (inv.totals.writtenOff ?? 0)) }, status: inv.totals.total - paid - (inv.totals.credited ?? 0) - (inv.totals.writtenOff ?? 0) <= 0.005 ? 'Settled' : inv.status });
    const out = db.update<Retainer>(C.retainers, r.id, { allocations, allocated, remaining: round(r.amount - allocated), status: r.amount - allocated <= 0.005 ? 'Fully allocated' : 'Open' });
    engine.audit({ action: 'retainer.allocated', objectType: 'Retainer', objectId: r.id, objectNumber: r.number, detail: `${fmtMoney(amount, r.currency)} → ${inv.number} · ${j.number}` });
    return out;
  });
}

/** Settle Pending allocations (made against draft invoices by a billing run) once those invoices are posted. */
export function settlePendingAllocations(): number {
  let n = 0;
  companyRows<Retainer>(C.retainers).forEach((r) => {
    r.allocations.filter((a) => a.status === 'Pending').forEach((a) => {
      const inv = db.find<DocHeader>(C.salesInvoices, a.invoiceId);
      if (!inv || (inv.status !== 'Posted' && inv.status !== 'Settled')) return;
      try { allocateRetainer(r.id, inv.id, a.amount, today()); n++; } catch { /* leave pending; surfaced in UI */ }
    });
  });
  return n;
}

export function reverseRetainer(id: string, reason: string): Retainer {
  const r = db.find<Retainer>(C.retainers, id);
  if (!r) throw new ValidationError('Retainer not found', 'NOT_FOUND');
  if (r.allocations.some((a) => a.status === 'Settled')) throw new ValidationError('Retainer has settled allocations — reverse those invoices first', 'INVALID_STATE');
  return db.transaction(() => {
    if (r.journalId) engine.reverseJournal(r.journalId, { reason });
    if (r.openItemId) { const oi = db.find<OpenItem>(C.openItems, r.openItemId); if (oi) db.update<OpenItem>(C.openItems, oi.id, { status: 'Settled', outstanding: 0, baseOutstanding: 0 }); }
    r.allocations.filter((a) => a.status === 'Pending').forEach((a) => { const inv = db.find<DocHeader>(C.salesInvoices, a.invoiceId); if (inv && inv.status === 'Draft') db.update<DocHeader>(C.salesInvoices, inv.id, { totals: { ...inv.totals, paid: round(inv.totals.paid - a.amount), due: round(inv.totals.due + a.amount) } }); });
    const out = db.update<Retainer>(C.retainers, r.id, { status: 'Reversed', reversalReason: reason, remaining: 0, allocations: r.allocations.map((a) => ({ ...a, status: 'Reversed' as const })) });
    engine.audit({ action: 'retainer.reversed', objectType: 'Retainer', objectId: r.id, objectNumber: r.number, detail: reason });
    return out;
  });
}

export function retainerJournal(id?: string): Journal | undefined {
  return db.find<Journal>(C.journals, id);
}

export function retainerBalance(customerId: string): number {
  return round(companyRows<Retainer>(C.retainers).filter((r) => r.customerId === customerId && r.status !== 'Reversed').reduce((s, r) => s + toBaseAmount(r.remaining, r.currency), 0));
}

export const weekDaysOf = weekDays;
