// Read-side helpers for the Projects module: scoped hooks, week/period maths,
// rate resolution and contract / project summaries. Pure functions read the
// store synchronously; hooks are thin reactive wrappers.
import { useMemo } from 'react';
import { db, C, engine, useCollection, useSession, currentScope } from '../../store';
import type { BaseRecord, DocHeader, Employee, Item, TaxRate, Customer } from '../../store';
import { addDays, periodCodeOf, round, today } from '../../lib/format';
import type { BillableExpense, Contract, Milestone, Project, RateCard, Resource, Service, Timesheet, TimesheetRow, UsageRecord, RevenueSchedule, Retainer, BillingRun } from './types';
import { projectsSettingsOf } from './types';

// ── Scoped reads ───────────────────────────────────────────────────────────

export function useRows<T extends BaseRecord>(col: string, sort?: (a: T, b: T) => number): T[] {
  const rows = useCollection<T>(col);
  const s = useSession();
  return useMemo(() => {
    const out = rows.filter((r) => !r.companyId || r.companyId === s.state.companyId);
    return sort ? out.slice().sort(sort) : out;
  }, [rows, s.state.companyId, sort]);
}

export function companyRows<T extends BaseRecord>(col: string): T[] {
  const cid = engine.ctx().companyId;
  return db.where<T>(col, (r) => !r.companyId || r.companyId === cid);
}

export function useSettings() {
  const s = useSession();
  return projectsSettingsOf(s.company?.defaults);
}

export function settings() {
  return projectsSettingsOf(engine.ctx().company?.defaults);
}

// ── Dates & periods ────────────────────────────────────────────────────────

export const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** ISO date of the week start containing `date` (Mon or Sun per settings). */
export function weekStartOf(date: string, start: 'Mon' | 'Sun' = settings().prjWeekStart): string {
  const d = new Date(date + 'T00:00:00Z');
  const dow = d.getUTCDay(); // 0 = Sun
  const offset = start === 'Mon' ? (dow + 6) % 7 : dow;
  return addDays(date, -offset);
}

export function weekDays(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

export function weekLabels(start: 'Mon' | 'Sun' = settings().prjWeekStart): string[] {
  return start === 'Mon' ? DAY_LABELS : ['Sun', ...DAY_LABELS.slice(0, 6)];
}

export function periodBounds(period: string): { from: string; to: string } {
  const [y, m] = period.split('-').map(Number);
  const from = `${period}-01`;
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from, to: `${period}-${String(last).padStart(2, '0')}` };
}

export function prevPeriod(period: string): string {
  const [y, m] = period.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function nextPeriod(period: string): string {
  const [y, m] = period.split('-').map(Number);
  const d = new Date(Date.UTC(y, m, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function periodsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  let p = from.slice(0, 7);
  const end = to.slice(0, 7);
  let guard = 0;
  while (p <= end && guard++ < 120) { out.push(p); p = nextPeriod(p); }
  return out;
}

export function monthsBetween(start: string, end: string): number {
  return Math.max(1, periodsBetween(start, end).length);
}

export function addMonths(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  const day = d.getUTCDate();
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  t.setUTCDate(Math.min(day, last));
  return t.toISOString().slice(0, 10);
}

export function currentPeriod(): string {
  return currentScope().state.periodCode ?? periodCodeOf(today());
}

// ── Lookups ────────────────────────────────────────────────────────────────

export const contractOf = (id?: string) => db.find<Contract>(C.contracts, id);
export const projectOf = (id?: string) => db.find<Project>(C.projects, id);
export const customerOf = (id?: string) => db.find<Customer>(C.customers, id);
export const employeeOf = (id?: string) => db.find<Employee>(C.employees, id);
export const resourceOf = (employeeId?: string) => db.findBy<Resource>(C.resources, (r) => r.employeeId === employeeId);
export const rateCardOf = (id?: string) => db.find<RateCard>(C.rateCards, id);
export const serviceOf = (id?: string) => db.find<Service>(C.services, id);
export const itemOf = (id?: string) => db.find<Item>(C.items, id);
export const taxRateOf = (id?: string) => db.find<TaxRate>(C.taxRates, id);

export function projectsOfContract(contractId: string): Project[] {
  const c = contractOf(contractId);
  return companyRows<Project>(C.projects).filter((p) => p.contractId === contractId || (c?.projectId && p.id === c.projectId));
}

export function contractOfProject(projectId: string): Contract | undefined {
  const p = projectOf(projectId);
  if (!p) return undefined;
  return contractOf(p.contractId) ?? db.findBy<Contract>(C.contracts, (c) => c.projectId === projectId);
}

/** Employee id of the signed-in user (for "my timesheet"). */
export function currentEmployee(): Employee | undefined {
  const uid = engine.ctx().userId;
  return db.findBy<Employee>(C.employees, (e) => e.userId === uid);
}

export function managerUserIdForProject(projectId?: string): string | undefined {
  const p = projectOf(projectId);
  const mgr = employeeOf(p?.managerEmployeeId);
  return mgr?.userId;
}

// ── Rates ──────────────────────────────────────────────────────────────────

/** Bill rate for an employee under a contract: contract rates by role → rate card → resource bill rate → service default. */
export function billRateFor(contract: Contract | undefined, employeeId: string, serviceId?: string): { rate: number; source: string; role?: string } {
  const res = resourceOf(employeeId);
  const role = res?.role;
  if (contract?.rates?.length && role) {
    const r = contract.rates.find((x) => x.role.toLowerCase() === role.toLowerCase());
    if (r) return { rate: r.rate, source: 'Contract rate', role };
  }
  const rcId = contract?.rateCardId ?? settings().prjDefaultRateCardId;
  const rc = rateCardOf(rcId);
  if (rc && role && rc.status === 'Active' && (!contract || rc.currency === contract.currency)) {
    const r = rc.rows.find((x) => x.role.toLowerCase() === role.toLowerCase());
    if (r) return { rate: r.rate, source: `Rate card · ${rc.name}`, role };
  }
  if (res && res.billRate > 0 && (!contract || contract.currency === engine.ctx().currency)) return { rate: res.billRate, source: 'Resource bill rate', role };
  const svc = serviceOf(serviceId);
  if (svc) return { rate: svc.defaultRate, source: `Service · ${svc.name}`, role };
  return { rate: 0, source: 'No rate', role };
}

export function costRateFor(employeeId: string): number {
  const res = resourceOf(employeeId);
  if (res) return res.costRate;
  const emp = employeeOf(employeeId);
  // fallback: CTC / (12 × 160 h)
  return emp ? round(emp.ctc / 1920) : 0;
}

// ── Timesheet maths ────────────────────────────────────────────────────────

export function rowHours(r: TimesheetRow): number {
  return round(r.hours.reduce((a, b) => a + (Number(b) || 0), 0), 2);
}

export function sheetTotals(rows: TimesheetRow[]): { total: number; billable: number } {
  let total = 0, billable = 0;
  rows.forEach((r) => { const h = rowHours(r); total += h; if (r.billable) billable += h; });
  return { total: round(total, 2), billable: round(billable, 2) };
}

export interface HourEntry { timesheet: Timesheet; row: TimesheetRow; date: string; hours: number; dayIndex: number }

/** Flatten timesheets into per-day entries (optionally filtered). */
export function hourEntries(filter: { projectId?: string; projectIds?: string[]; employeeId?: string; from?: string; to?: string; statuses?: string[]; billableOnly?: boolean; uninvoicedOnly?: boolean } = {}): HourEntry[] {
  const out: HourEntry[] = [];
  companyRows<Timesheet>(C.timesheets).forEach((ts) => {
    if (filter.statuses && !filter.statuses.includes(ts.status)) return;
    if (filter.employeeId && ts.employeeId !== filter.employeeId) return;
    const days = weekDays(ts.weekStart);
    ts.rows.forEach((r) => {
      if (filter.projectId && r.projectId !== filter.projectId) return;
      if (filter.projectIds && !filter.projectIds.includes(r.projectId)) return;
      if (filter.billableOnly && !r.billable) return;
      if (filter.uninvoicedOnly && r.invoiceId) return;
      r.hours.forEach((h, i) => {
        const hours = Number(h) || 0;
        if (hours <= 0) return;
        const date = days[i];
        if (filter.from && date < filter.from) return;
        if (filter.to && date > filter.to) return;
        out.push({ timesheet: ts, row: r, date, hours, dayIndex: i });
      });
    });
  });
  return out;
}

/** Unbilled approved hours + value for a contract (or all). */
export function unbilledWork(contractId?: string): { hours: number; value: number; entries: HourEntry[]; expenses: BillableExpense[] } {
  const contracts = contractId ? [contractOf(contractId)].filter(Boolean) as Contract[] : companyRows<Contract>(C.contracts).filter((c) => c.status === 'Active');
  let hours = 0, value = 0;
  const entries: HourEntry[] = [];
  const expenses: BillableExpense[] = [];
  contracts.forEach((c) => {
    if (c.billingMethod !== 'Time & material' && c.billingMethod !== 'Cost plus') return;
    const pids = projectsOfContract(c.id).map((p) => p.id);
    const es = hourEntries({ projectIds: pids, statuses: ['Approved'], billableOnly: true, uninvoicedOnly: true });
    es.forEach((e) => {
      const rate = c.billingMethod === 'Cost plus' ? round(costRateFor(e.timesheet.employeeId) * (1 + (c.markupPct ?? 0) / 100)) : billRateFor(c, e.timesheet.employeeId, e.row.serviceId).rate;
      hours += e.hours;
      value += e.hours * rate * (c.currency === engine.ctx().currency ? 1 : engine.resolveRate(c.currency, engine.ctx().currency, today()).rate || 1);
      entries.push(e);
    });
    billableExpenses().filter((x) => x.status === 'Ready' && pids.includes(x.projectId)).forEach((x) => { value += x.billAmount; expenses.push(x); });
  });
  return { hours: round(hours, 2), value: round(value), entries, expenses };
}

/** Billable expenses live in the module's own collection (a view over claim lines). */
export function billableExpenses(): BillableExpense[] {
  return companyRows<BillableExpense>(C.billableExpenses);
}

// ── Contract summaries ─────────────────────────────────────────────────────

export function invoicesOfContract(contractId: string): DocHeader[] {
  return companyRows<DocHeader>(C.salesInvoices).filter((i) => i.sourceType === 'Contract' && i.sourceId === contractId);
}

export function invoicesOfProject(projectId: string): DocHeader[] {
  const p = projectOf(projectId);
  const dim = p?.dimensionId;
  return companyRows<DocHeader>(C.salesInvoices).filter((i) => (dim && (i.dimensions?.Project === dim || i.lines?.some((l) => l.dimensions?.Project === dim))) || (p?.contractId && i.sourceType === 'Contract' && i.sourceId === p.contractId));
}

export function toBaseAmount(amount: number, currency: string, date = today()): number {
  const base = engine.ctx().currency;
  if (currency === base) return amount;
  const r = engine.resolveRate(currency, base, date).rate || 1;
  return round(amount * r);
}

export interface ContractSummary { billed: number; billedBase: number; posted: number; drafts: number; recognized: number; unbilled: number; deferred: number; unbilledHours: number; unbilledValue: number; milestonesPending: number; retainerRemaining: number }

export function contractSummary(c: Contract): ContractSummary {
  const invs = invoicesOfContract(c.id).filter((i) => i.status !== 'Cancelled' && i.status !== 'Reversed');
  const posted = invs.filter((i) => i.status === 'Posted' || i.status === 'Settled');
  const billed = round(posted.reduce((s, i) => s + (i.totals?.taxable ?? 0), 0));
  const billedBase = round(posted.reduce((s, i) => s + (i.totals?.taxable ?? 0) * (i.rate || 1), 0));
  const drafts = invs.length - posted.length;
  const scheds = companyRows<RevenueSchedule>(C.revenueSchedules).filter((r) => r.contractId === c.id && r.status === 'Posted').sort((a, b) => a.period.localeCompare(b.period));
  const last = scheds[scheds.length - 1];
  const recognized = round(scheds.reduce((s, r) => s + r.recognized, 0));
  const uw = unbilledWork(c.id);
  const ms = companyRows<Milestone>(C.milestones).filter((m) => m.contractId === c.id && m.status !== 'Invoiced');
  const ret = companyRows<Retainer>(C.retainers).filter((r) => r.customerId === c.customerId && r.status !== 'Reversed').reduce((s, r) => s + r.remaining, 0);
  return { billed, billedBase, posted: posted.length, drafts, recognized, unbilled: last?.unbilled ?? 0, deferred: last?.deferred ?? 0, unbilledHours: uw.hours, unbilledValue: uw.value, milestonesPending: ms.length, retainerRemaining: round(ret) };
}

export function milestonesOf(contractId: string): Milestone[] {
  return companyRows<Milestone>(C.milestones).filter((m) => m.contractId === contractId).sort((a, b) => a.order - b.order || a.due.localeCompare(b.due));
}

export function usageOf(contractId: string): UsageRecord[] {
  return companyRows<UsageRecord>(C.usageRecords).filter((u) => u.contractId === contractId).sort((a, b) => a.period.localeCompare(b.period));
}

export function billingRunsOf(contractId: string): BillingRun[] {
  return companyRows<BillingRun>(C.billingRuns).filter((b) => b.contractIds.includes(contractId));
}

// ── Project summaries ──────────────────────────────────────────────────────

export interface ProjectActuals { hours: number; approvedHours: number; cost: number; billableHours: number; billedValue: number; pctHours: number; pctCost: number }

export function projectActuals(p: Project): ProjectActuals {
  const entries = hourEntries({ projectId: p.id, statuses: ['Approved', 'Invoiced', 'Submitted'] });
  const approved = entries.filter((e) => e.timesheet.status !== 'Submitted');
  const hours = round(entries.reduce((s, e) => s + e.hours, 0), 2);
  const approvedHours = round(approved.reduce((s, e) => s + e.hours, 0), 2);
  const cost = round(approved.reduce((s, e) => s + e.hours * costRateFor(e.timesheet.employeeId), 0));
  const billableHours = round(approved.filter((e) => e.row.billable).reduce((s, e) => s + e.hours, 0), 2);
  const billedValue = round(invoicesOfProject(p.id).filter((i) => i.status === 'Posted' || i.status === 'Settled').reduce((s, i) => s + (i.totals?.taxable ?? 0) * (i.rate || 1), 0));
  return { hours, approvedHours, cost, billableHours, billedValue, pctHours: p.budgetHours ? round((hours / p.budgetHours) * 100, 1) : 0, pctCost: p.budgetAmount ? round((cost / p.budgetAmount) * 100, 1) : 0 };
}

/** Utilisation for a window: logged (approved+submitted) vs capacity of active resources. */
export function utilisation(from: string, to: string, employeeId?: string): { logged: number; billable: number; capacity: number; pct: number; billablePct: number } {
  const resources = companyRows<Resource>(C.resources).filter((r) => r.status === 'Active' && (!employeeId || r.employeeId === employeeId));
  const weeks = Math.max(1, Math.round(((new Date(to).getTime() - new Date(from).getTime()) / 86400000 + 1) / 7));
  const capacity = resources.reduce((s, r) => s + r.capacityHoursPerWeek, 0) * weeks;
  const entries = hourEntries({ from, to, employeeId, statuses: ['Approved', 'Invoiced', 'Submitted'] });
  const logged = round(entries.reduce((s, e) => s + e.hours, 0), 2);
  const billable = round(entries.filter((e) => e.row.billable).reduce((s, e) => s + e.hours, 0), 2);
  return { logged, billable, capacity, pct: capacity ? round((logged / capacity) * 100, 1) : 0, billablePct: capacity ? round((billable / capacity) * 100, 1) : 0 };
}

export function customerName(id?: string) {
  return customerOf(id)?.name ?? '—';
}

export function employeeName(id?: string) {
  return employeeOf(id)?.name ?? '—';
}

export function projectLabel(id?: string) {
  const p = projectOf(id);
  return p ? `${p.code} · ${p.name}` : '—';
}
