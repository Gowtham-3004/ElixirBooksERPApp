// Revenue recognition (FR-SRV-006) and project profitability (FR-SRV-007).
// Recognition per contract × period: recognized by method, billed from posted
// invoices, cumulative unbilled (accrued) or deferred position at period end.
// Running a period posts the cumulative adjustment (Dr 1160 / Cr 4010 accrual
// or Dr 4010 / Cr 2400 deferral) and auto-reverses the prior period's entry on
// the first day of the period. Idempotency key: rev:<contract>:<period>.
import { db, C, engine, ValidationError } from '../../store';
import type { DocHeader, Journal } from '../../store';
import { fmtMoney, round } from '../../lib/format';
import type { BillableExpense, Contract, Milestone, Project, RevenueSchedule } from './types';
import { ACC } from './types';
import { billRateFor, billableExpenses, companyRows, costRateFor, hourEntries, invoicesOfContract, milestonesOf, monthsBetween, nextPeriod, periodBounds, periodsBetween, prevPeriod, projectOf, projectsOfContract, settings, toBaseAmount, usageOf } from './data';

const now = () => new Date().toISOString();

export interface RecognitionLine { period: string; billed: number; recognized: number; basis: string }

/** Revenue recognized in a period for a contract (base currency). */
export function recognizedFor(c: Contract, period: string): { amount: number; basis: string } {
  const { from, to } = periodBounds(period);
  const fx = (amt: number) => toBaseAmount(amt, c.currency, to);
  const method = c.revenueMethod === 'Auto' ? autoMethod(c) : c.revenueMethod;
  const active = c.status === 'Active' || c.status === 'Completed';
  if (!active && c.status !== 'Approved') return { amount: 0, basis: `Contract ${c.status}` };
  const pids = projectsOfContract(c.id).map((p) => p.id);
  switch (method) {
    case 'Hours': {
      const entries = hourEntries({ projectIds: pids, statuses: ['Approved', 'Invoiced'], billableOnly: true, from, to });
      let v = 0;
      entries.forEach((e) => { v += e.hours * (c.billingMethod === 'Cost plus' ? costRateFor(e.timesheet.employeeId) * (1 + (c.markupPct ?? 0) / 100) : billRateFor(c, e.timesheet.employeeId, e.row.serviceId).rate); });
      const exps = billableExpenses().filter((x) => x.status !== 'Excluded' && pids.includes(x.projectId) && x.date >= from && x.date <= to).reduce((s, x) => s + x.billAmount, 0);
      return { amount: round(fx(v) + exps), basis: `${round(entries.reduce((s, e) => s + e.hours, 0), 1)} h approved × bill rate${exps ? ' + expenses' : ''}` };
    }
    case 'Percent complete': {
      const prog = (c.progress ?? []).slice().sort((a, b) => a.period.localeCompare(b.period));
      if (prog.length) {
        const cur = prog.filter((p) => p.period <= period).pop()?.pct ?? 0;
        const prev = prog.filter((p) => p.period < period).pop()?.pct ?? 0;
        return { amount: round(fx(c.amount * (cur - prev) / 100)), basis: `${prev}% → ${cur}% complete of ${fmtMoney(c.amount, c.currency)}` };
      }
      return straightLine(c, period, fx);
    }
    case 'Milestone': {
      const ms = milestonesOf(c.id).filter((m) => (m.status === 'Achieved' || m.status === 'Invoiced') && m.achievedAt && m.achievedAt >= from && m.achievedAt <= to);
      return { amount: round(fx(ms.reduce((s, m) => s + m.amount, 0))), basis: ms.length ? `${ms.length} milestone(s) achieved` : 'No milestones achieved' };
    }
    case 'Straight-line': return straightLine(c, period, fx);
    case 'Usage': {
      const us = usageOf(c.id).filter((u) => u.period === period);
      return { amount: round(fx(us.reduce((s, u) => s + u.amount, 0))), basis: us.length ? `${us.reduce((s, u) => s + u.qty, 0)} ${c.usage?.unit ?? ''} used` : 'No usage' };
    }
  }
  return { amount: 0, basis: '—' };
}

function autoMethod(c: Contract): Exclude<Contract['revenueMethod'], 'Auto'> {
  switch (c.billingMethod) {
    case 'Time & material': case 'Cost plus': return 'Hours';
    case 'Fixed price': return 'Percent complete';
    case 'Milestone': return 'Milestone';
    case 'Recurring': return 'Straight-line';
    case 'Usage': return 'Usage';
  }
}

function straightLine(c: Contract, period: string, fx: (n: number) => number): { amount: number; basis: string } {
  const start = c.start.slice(0, 7);
  const end = (c.end ?? c.recurrence?.endDate ?? c.start).slice(0, 7);
  if (period < start) return { amount: 0, basis: 'Before contract start' };
  if (c.billingMethod === 'Recurring' && c.recurrence) {
    if (c.end && period > end) return { amount: 0, basis: 'After contract end' };
    const monthly = c.recurrence.frequency === 'Monthly' ? c.recurrence.amount : c.recurrence.frequency === 'Quarterly' ? c.recurrence.amount / 3 : c.recurrence.amount / 12;
    return { amount: round(fx(monthly)), basis: `${c.recurrence.frequency} fee straight-lined` };
  }
  if (period > end) return { amount: 0, basis: 'After contract end' };
  const months = monthsBetween(c.start, c.end ?? c.start);
  return { amount: round(fx(c.amount / months)), basis: `Straight-line over ${months} month(s)` };
}

/** Revenue billed in the period from posted contract invoices (base currency, excl. tax). */
export function billedFor(c: Contract, period: string): number {
  return round(invoicesOfContract(c.id).filter((i) => (i.status === 'Posted' || i.status === 'Settled') && (i.period ?? i.date.slice(0, 7)) === period).reduce((s, i) => s + (i.totals?.taxable ?? 0) * (i.rate || 1), 0));
}

export interface PeriodPosition { period: string; billed: number; recognized: number; cumBilled: number; cumRecognized: number; unbilled: number; deferred: number; adjustment: number; adjustmentType: 'Accrual' | 'Deferral' | 'None'; basis: string; posted?: RevenueSchedule }

/** Compute (not post) the schedule for a contract across periods start → upto. */
export function schedulePreview(c: Contract, upto: string): PeriodPosition[] {
  const first = c.start.slice(0, 7);
  const periods = periodsBetween(first, upto);
  const posted = companyRows<RevenueSchedule>(C.revenueSchedules).filter((r) => r.contractId === c.id && r.status === 'Posted');
  let cumB = 0, cumR = 0;
  return periods.map((p) => {
    const existing = posted.find((r) => r.period === p);
    const billed = existing ? existing.billed : billedFor(c, p);
    const rec = existing ? { amount: existing.recognized, basis: 'Posted schedule' } : recognizedFor(c, p);
    cumB = round(cumB + billed); cumR = round(cumR + rec.amount);
    const net = round(cumR - cumB);
    return { period: p, billed, recognized: rec.amount, cumBilled: cumB, cumRecognized: cumR, unbilled: net > 0 ? net : 0, deferred: net < 0 ? -net : 0, adjustment: Math.abs(net), adjustmentType: net > 0.005 ? 'Accrual' : net < -0.005 ? 'Deferral' : 'None', basis: rec.basis, posted: existing };
  });
}

function projectDim(c: Contract): Record<string, string> | undefined {
  const dim = projectOf(c.projectId)?.dimensionId ?? c.dimensions?.Project;
  return dim ? { Project: dim } : undefined;
}

/** Post recognition for one contract × period. Idempotent. */
export function runRecognition(contractId: string, period: string): RevenueSchedule {
  const c = db.find<Contract>(C.contracts, contractId);
  if (!c) throw new ValidationError('Contract not found', 'NOT_FOUND');
  if (c.status !== 'Active' && c.status !== 'Completed') throw new ValidationError(`Contract ${c.number} is ${c.status} — only active contracts recognise revenue`, 'INVALID_STATE');
  const key = `rev:${c.id}:${period}`;
  const existing = db.findBy<RevenueSchedule>(C.revenueSchedules, (r) => r.idempotencyKey === key && r.status === 'Posted');
  if (existing) return existing;
  const prevRow = db.findBy<RevenueSchedule>(C.revenueSchedules, (r) => r.contractId === c.id && r.period === prevPeriod(period) && r.status === 'Posted');
  const later = db.findBy<RevenueSchedule>(C.revenueSchedules, (r) => r.contractId === c.id && r.period > period && r.status === 'Posted');
  if (later) throw new ValidationError(`${later.period} is already recognised for ${c.number} — periods must run in order`, 'INVALID_STATE');
  const { from, to } = periodBounds(period);
  engine.assertPostable(to);
  const pos = schedulePreview(c, period).find((p) => p.period === period)!;
  const c0 = engine.ctx();
  return db.transaction(() => {
    let reversalJ: Journal | undefined;
    let reversed = 0;
    if (prevRow?.journalId) {
      const pj = db.find<Journal>(C.journals, prevRow.journalId);
      if (pj && pj.status === 'Posted' && !pj.reversedById) {
        reversalJ = engine.reverseJournal(pj.id, { reason: `Auto-reversal of ${prevRow.period} revenue adjustment at start of ${period}`, date: from });
        reversed = prevRow.adjustment;
      }
    }
    let j: Journal | undefined;
    const dims = projectDim(c);
    if (pos.adjustmentType === 'Accrual') {
      j = engine.postJournal({ date: to, sourceType: 'Revenue Recognition', sourceId: c.id, sourceNumber: c.number, narration: `Unbilled revenue accrual · ${c.number} ${c.title} · ${period} (recognised ${fmtMoney(pos.cumRecognized)} vs billed ${fmtMoney(pos.cumBilled)})`, idempotencyKey: key, lines: [{ accountId: ACC.unbilled, dr: pos.adjustment, partyType: 'Customer', partyId: c.customerId, partyName: c.partyName, dimensions: dims }, { accountId: ACC.serviceRev, cr: pos.adjustment, dimensions: dims }] });
    } else if (pos.adjustmentType === 'Deferral') {
      j = engine.postJournal({ date: to, sourceType: 'Revenue Recognition', sourceId: c.id, sourceNumber: c.number, narration: `Deferred revenue · ${c.number} ${c.title} · ${period} (billed ${fmtMoney(pos.cumBilled)} vs recognised ${fmtMoney(pos.cumRecognized)})`, idempotencyKey: key, lines: [{ accountId: ACC.serviceRev, dr: pos.adjustment, dimensions: dims }, { accountId: ACC.deferred, cr: pos.adjustment, partyType: 'Customer', partyId: c.customerId, partyName: c.partyName, dimensions: dims }] });
    }
    const row = db.insert<RevenueSchedule>(C.revenueSchedules, { contractId: c.id, contractNumber: c.number, projectId: c.projectId, customerId: c.customerId, period, method: c.billingMethod, billed: pos.billed, recognized: pos.recognized, cumBilled: pos.cumBilled, cumRecognized: pos.cumRecognized, unbilled: pos.unbilled, deferred: pos.deferred, reversed, journalId: j?.id, journalNumber: j?.number, adjustmentType: pos.adjustmentType, adjustment: pos.adjustment, reversalJournalId: reversalJ?.id, reversalJournalNumber: reversalJ?.number, status: 'Posted', runAt: now(), runBy: c0.userName, idempotencyKey: key });
    engine.audit({ action: 'revenue.recognised', objectType: 'Revenue Schedule', objectId: row.id, objectNumber: `${c.number} · ${period}`, detail: `Recognised ${fmtMoney(pos.recognized)} · billed ${fmtMoney(pos.billed)} · ${pos.adjustmentType}${j ? ' ' + fmtMoney(pos.adjustment) + ' · ' + j.number : ''}${reversalJ ? ' · reversed ' + reversalJ.number : ''}` });
    return row;
  });
}

/** Run for every active contract in a period. Returns rows + errors per contract. */
export function runRecognitionForPeriod(period: string, contractIds?: string[]): { rows: RevenueSchedule[]; errors: { contract: Contract; message: string }[] } {
  const contracts = companyRows<Contract>(C.contracts).filter((c) => (c.status === 'Active' || c.status === 'Completed') && (!contractIds || contractIds.includes(c.id)) && c.start.slice(0, 7) <= period);
  const rows: RevenueSchedule[] = [];
  const errors: { contract: Contract; message: string }[] = [];
  contracts.forEach((c) => { try { rows.push(runRecognition(c.id, period)); } catch (e: any) { errors.push({ contract: c, message: e?.message ?? 'Failed' }); } });
  return { rows, errors };
}

/** Reverse a posted schedule row (latest period only): reverses its adjustment journal and re-posts the prior adjustment. */
export function reverseRecognition(id: string, reason: string): RevenueSchedule {
  const row = db.find<RevenueSchedule>(C.revenueSchedules, id);
  if (!row) throw new ValidationError('Schedule row not found', 'NOT_FOUND');
  if (row.status !== 'Posted') throw new ValidationError('Already reversed', 'INVALID_STATE');
  const later = db.findBy<RevenueSchedule>(C.revenueSchedules, (r) => r.contractId === row.contractId && r.period > row.period && r.status === 'Posted');
  if (later) throw new ValidationError(`Reverse ${later.period} first — schedules unwind in reverse order`, 'INVALID_STATE');
  return db.transaction(() => {
    if (row.journalId) { const j = db.find<Journal>(C.journals, row.journalId); if (j && j.status === 'Posted' && !j.reversedById) engine.reverseJournal(j.id, { reason }); }
    // undo the auto-reversal so the prior period's adjustment stands again
    if (row.reversalJournalId) { const rj = db.find<Journal>(C.journals, row.reversalJournalId); if (rj && rj.status === 'Posted' && !rj.reversedById) engine.reverseJournal(rj.id, { reason: `Reinstate prior-period adjustment: ${reason}` }); }
    const out = db.update<RevenueSchedule>(C.revenueSchedules, row.id, { status: 'Reversed', reversalReason: reason });
    engine.audit({ action: 'revenue.reversed', objectType: 'Revenue Schedule', objectId: row.id, objectNumber: `${row.contractNumber} · ${row.period}`, detail: reason });
    return out;
  });
}

export function nextPeriodToRun(c: Contract): string {
  const last = companyRows<RevenueSchedule>(C.revenueSchedules).filter((r) => r.contractId === c.id && r.status === 'Posted').map((r) => r.period).sort().pop();
  return last ? nextPeriod(last) : c.start.slice(0, 7);
}

// ── Profitability (FR-SRV-007) ─────────────────────────────────────────────

export interface ProfitRow {
  key: string;
  label: string;
  sub?: string;
  projectId?: string;
  customerId?: string;
  revenue: number;
  billed: number;
  resourceCost: number;
  hours: number;
  purchases: number;
  expenses: number;
  overhead: number;
  cost: number;
  margin: number;
  marginPct: number;
  sources: { type: string; ref: string; label: string; amount: number; link?: string }[];
}

function within(date: string | undefined, from: string, to: string) {
  return !!date && date >= from && date <= to;
}

/** Profitability for a project over a date window (base currency). */
export function projectProfit(p: Project, from: string, to: string): ProfitRow {
  const s = settings();
  const contract = db.find<Contract>(C.contracts, p.contractId) ?? db.findBy<Contract>(C.contracts, (c) => c.projectId === p.id);
  const sources: ProfitRow['sources'] = [];
  // revenue: recognised per period (posted schedule if any, else computed)
  let revenue = 0;
  if (contract) {
    periodsBetween(from, to).forEach((per) => {
      const posted = db.findBy<RevenueSchedule>(C.revenueSchedules, (r) => r.contractId === contract.id && r.period === per && r.status === 'Posted');
      const amt = posted ? posted.recognized : recognizedFor(contract, per).amount;
      if (amt) { revenue += amt; sources.push({ type: 'Revenue', ref: per, label: `${contract.number} · ${per}${posted ? ' (posted)' : ' (computed)'}`, amount: amt, link: `projects/revenue?contract=${contract.id}` }); }
    });
  }
  const invs = companyRows<DocHeader>(C.salesInvoices).filter((i) => (i.status === 'Posted' || i.status === 'Settled') && within(i.date, from, to) && ((contract && i.sourceType === 'Contract' && i.sourceId === contract.id) || i.dimensions?.Project === p.dimensionId));
  const billed = round(invs.reduce((acc, i) => acc + (i.totals?.taxable ?? 0) * (i.rate || 1), 0));
  invs.forEach((i) => sources.push({ type: 'Invoice', ref: i.number, label: `${i.number} · ${i.partyName}`, amount: round((i.totals?.taxable ?? 0) * (i.rate || 1)), link: `sales/invoices/${i.id}` }));
  // resource cost
  const entries = hourEntries({ projectId: p.id, statuses: ['Approved', 'Invoiced'], from, to });
  const byEmp = new Map<string, { name: string; hours: number; cost: number; ts: Set<string> }>();
  entries.forEach((e) => { const g = byEmp.get(e.timesheet.employeeId) ?? { name: e.timesheet.employeeName, hours: 0, cost: 0, ts: new Set() }; g.hours += e.hours; g.cost += e.hours * costRateFor(e.timesheet.employeeId); g.ts.add(e.timesheet.number); byEmp.set(e.timesheet.employeeId, g); });
  let resourceCost = 0, hours = 0;
  byEmp.forEach((g, id) => { resourceCost += g.cost; hours += g.hours; sources.push({ type: 'Resource', ref: id, label: `${g.name} · ${round(g.hours, 1)} h × ${fmtMoney(costRateFor(id))} (${Array.from(g.ts).slice(0, 3).join(', ')}${g.ts.size > 3 ? '…' : ''})`, amount: round(g.cost), link: `projects/timesheets?employee=${id}` }); });
  // purchases: vendor invoice lines carrying the project dimension (defensive)
  let purchases = 0;
  companyRows<any>(C.vendorInvoices).forEach((v) => {
    if (!v || typeof v !== 'object') return;
    if (!['Posted', 'Settled', 'Matched', 'Approved'].includes(String(v.status))) return;
    if (!within(v.date, from, to)) return;
    const headerDim = v.dimensions?.Project;
    const lines: any[] = Array.isArray(v.lines) ? v.lines : [];
    let amt = 0;
    lines.forEach((l) => { const d = l?.dimensions?.Project ?? headerDim; if (d === p.dimensionId) amt += Number(l?.taxable ?? l?.amount ?? 0); });
    if (!lines.length && headerDim === p.dimensionId) amt = Number(v.totals?.taxable ?? v.totals?.total ?? 0);
    if (amt) { purchases += amt; sources.push({ type: 'Purchase', ref: v.number ?? v.id, label: `${v.number ?? v.id} · ${v.partyName ?? ''}`, amount: round(amt), link: `purchase/vendor-invoices/${v.id}` }); }
  });
  // employee expenses: approved claims with the project dimension (defensive) — count line amount, not markup
  let expenses = 0;
  const seen = new Set<string>();
  companyRows<any>(C.expenseClaims).forEach((cl) => {
    if (!cl || !Array.isArray(cl.lines)) return;
    if (!['Approved', 'Reimbursed', 'Posted'].includes(String(cl.status))) return;
    cl.lines.forEach((l: any) => {
      const d = l?.dimensions?.Project ?? cl.dimensions?.Project;
      const date = l?.date ?? cl.date;
      if (d !== p.dimensionId || !within(date, from, to)) return;
      const amt = Number(l?.total ?? l?.amount ?? 0);
      expenses += amt; seen.add(`${cl.id}:${l.id}`);
      sources.push({ type: 'Expense', ref: cl.number ?? cl.id, label: `${cl.number ?? cl.id} · ${cl.employeeName ?? ''} · ${l?.description ?? ''}`, amount: round(amt), link: `budgets/expenses/${cl.id}` });
    });
  });
  companyRows<BillableExpense>(C.billableExpenses).forEach((b) => { if (b.projectId === p.id && within(b.date, from, to) && !seen.has(`${b.claimId}:${b.lineId}`) && b.status !== 'Excluded') { expenses += b.amount; sources.push({ type: 'Expense', ref: b.claimNumber, label: `${b.claimNumber} · ${b.employeeName} · ${b.description}`, amount: b.amount }); } });
  const overhead = round(resourceCost * s.prjOverheadPct / 100);
  if (overhead) sources.push({ type: 'Overhead', ref: 'overhead', label: `Allocated overhead ${s.prjOverheadPct}% of resource cost`, amount: overhead, link: 'projects/settings' });
  const cost = round(resourceCost + purchases + expenses + overhead);
  const margin = round(revenue - cost);
  return { key: p.id, label: `${p.code} · ${p.name}`, sub: p.customerName, projectId: p.id, customerId: p.customerId, revenue: round(revenue), billed, resourceCost: round(resourceCost), hours: round(hours, 1), purchases: round(purchases), expenses: round(expenses), overhead, cost, margin, marginPct: revenue ? round((margin / revenue) * 100, 1) : 0, sources };
}

export function profitability(from: string, to: string, groupBy: 'project' | 'customer'): ProfitRow[] {
  const projects = companyRows<Project>(C.projects).filter((p) => p.status !== 'Cancelled');
  const rows = projects.map((p) => projectProfit(p, from, to)).filter((r) => r.revenue || r.cost || r.billed);
  if (groupBy === 'project') return rows.sort((a, b) => b.revenue - a.revenue);
  const byCust = new Map<string, ProfitRow>();
  rows.forEach((r) => {
    const key = r.customerId ?? 'none';
    const g = byCust.get(key) ?? { key, label: r.sub ?? 'Unassigned', customerId: r.customerId, revenue: 0, billed: 0, resourceCost: 0, hours: 0, purchases: 0, expenses: 0, overhead: 0, cost: 0, margin: 0, marginPct: 0, sources: [] };
    g.revenue = round(g.revenue + r.revenue); g.billed = round(g.billed + r.billed); g.resourceCost = round(g.resourceCost + r.resourceCost); g.hours = round(g.hours + r.hours, 1); g.purchases = round(g.purchases + r.purchases); g.expenses = round(g.expenses + r.expenses); g.overhead = round(g.overhead + r.overhead); g.cost = round(g.cost + r.cost); g.margin = round(g.margin + r.margin); g.marginPct = g.revenue ? round((g.margin / g.revenue) * 100, 1) : 0;
    g.sources = [...g.sources, ...r.sources.map((s) => ({ ...s, label: `${r.label.split(' · ')[0]} · ${s.label}` }))];
    byCust.set(key, g);
  });
  return Array.from(byCust.values()).sort((a, b) => b.revenue - a.revenue);
}

export { milestonesOf };
export type { Milestone };
