// Budget vs actuals maths (FR-BUD-002). Actual = posted journals via ledger balances; committed = approved POs not yet received.
import { db, C, engine } from '../../store';
import type { Account, AccountGroup, DocHeader } from '../../store';
import { round } from '../../lib/format';
import { ledgerBalances, periodsBetween, type Range } from '../reports/compute';
import type { Budget, BudgetLine } from './types';

export interface VarianceRow {
  accountId: string;
  code: string;
  name: string;
  type: string;
  groupId?: string;
  groupName: string;
  budgetFy: number;
  budgetPeriod: number;
  actual: number;
  committed: number;
  available: number;
  variance: number;
  favorable: boolean;
  utilizationPct: number;
  kind: 'account' | 'group' | 'calc';
}

export function activeBudget(fy: string, companyId?: string): Budget | undefined {
  const cid = companyId ?? engine.ctx().companyId;
  const approved = db.where<Budget>(C.budgets, (b) => b.companyId === cid && b.fy === fy && b.status === 'Approved').sort((a, b) => b.revision - a.revision);
  return approved[0] ?? db.where<Budget>(C.budgets, (b) => b.companyId === cid && b.fy === fy).sort((a, b) => b.revision - a.revision)[0];
}

/** Budget amount for an account over a range (sums the FY months that fall inside the range). */
export function budgetFor(line: BudgetLine | undefined, budget: Budget, range: Range): number {
  if (!line) return 0;
  const fyMonths = periodsBetween({ from: budget.fyStart, to: `${parseInt(budget.fyStart.slice(0, 4), 10) + 1}-${budget.fyStart.slice(5, 7)}-01` }).slice(0, 12);
  const inRange = periodsBetween(range);
  return round(fyMonths.reduce((s, p, i) => s + (inRange.includes(p) ? (line.months[i] ?? 0) : 0), 0));
}

/** Committed = unreceived value of approved / partially received purchase orders hitting the account (by line account or purchase default). */
export function committedFor(accountId: string, range: Range, companyId?: string): number {
  const cid = companyId ?? engine.ctx().companyId;
  const purchaseAcc = engine.companyOf(cid)?.defaults.purchaseAccountId;
  return round(db.where<DocHeader>(C.purchaseOrders, (p) => (!p.companyId || p.companyId === cid) && (p.status === 'Approved' || p.status === 'Partially Received' || p.status === 'Open') && p.date >= range.from && p.date <= range.to).reduce((s, p) => s + (p.lines ?? []).filter((l) => (l.accountId ?? purchaseAcc) === accountId).reduce((x, l) => x + Math.max(0, (l.qty - (l.receivedQty ?? 0))) * l.rate * (1 - (l.discountPct ?? 0) / 100), 0), 0));
}

export function budgetVsActual(budget: Budget | undefined, range: Range, opts: { branchId?: string } = {}): { rows: VarianceRow[]; totals: { income: VarianceRow; expense: VarianceRow; net: VarianceRow } } {
  const bal = ledgerBalances(range, { branchId: opts.branchId });
  const accounts = db.where<Account>(C.accounts, (a) => a.companyId === engine.ctx().companyId);
  const groups = db.where<AccountGroup>(C.accountGroups, (g) => g.companyId === engine.ctx().companyId).sort((a, b) => a.order - b.order);
  const rows: VarianceRow[] = [];
  const lineFor = (accId: string) => budget?.lines.find((l) => l.accountId === accId);
  const mk = (a: Account): VarianceRow | null => {
    const line = lineFor(a.id);
    const b = bal.get(a.id);
    const actual = a.type === 'Income' ? round((b?.cr ?? 0) - (b?.dr ?? 0)) : round((b?.dr ?? 0) - (b?.cr ?? 0));
    if (!line && actual === 0) return null;
    const budgetPeriod = budget ? budgetFor(line, budget, range) : 0;
    const committed = a.type === 'Expense' ? committedFor(a.id, range) : 0;
    const available = round(budgetPeriod - actual - committed);
    const variance = a.type === 'Income' ? round(actual - budgetPeriod) : round(budgetPeriod - actual - committed);
    return { accountId: a.id, code: a.code, name: a.name, type: a.type, groupId: a.groupId, groupName: groups.find((g) => g.id === a.groupId)?.name ?? '', budgetFy: line?.total ?? 0, budgetPeriod, actual, committed, available, variance, favorable: variance >= 0, utilizationPct: budgetPeriod > 0 ? round(((actual + committed) / budgetPeriod) * 100, 1) : actual + committed > 0 ? 999 : 0, kind: 'account' };
  };
  const sumRows = (rs: VarianceRow[], name: string, type: string, kind: 'group' | 'calc'): VarianceRow => {
    const t = rs.reduce((acc, r) => ({ budgetFy: acc.budgetFy + r.budgetFy, budgetPeriod: acc.budgetPeriod + r.budgetPeriod, actual: acc.actual + r.actual, committed: acc.committed + r.committed }), { budgetFy: 0, budgetPeriod: 0, actual: 0, committed: 0 });
    const available = round(t.budgetPeriod - t.actual - t.committed);
    const variance = type === 'Income' ? round(t.actual - t.budgetPeriod) : available;
    return { accountId: '', code: '', name, type, groupName: name, budgetFy: round(t.budgetFy), budgetPeriod: round(t.budgetPeriod), actual: round(t.actual), committed: round(t.committed), available, variance, favorable: variance >= 0, utilizationPct: t.budgetPeriod > 0 ? round(((t.actual + t.committed) / t.budgetPeriod) * 100, 1) : 0, kind };
  };
  const incomeRows: VarianceRow[] = [];
  const expenseRows: VarianceRow[] = [];
  groups.filter((g) => g.type === 'Income' || g.type === 'Expense').forEach((g) => {
    const accRows = accounts.filter((a) => a.groupId === g.id).map(mk).filter(Boolean) as VarianceRow[];
    if (!accRows.length) return;
    const gRow = sumRows(accRows, g.name, g.type, 'group');
    gRow.groupId = g.id;
    rows.push(gRow, ...accRows);
    (g.type === 'Income' ? incomeRows : expenseRows).push(...accRows);
  });
  const income = sumRows(incomeRows, 'Total income', 'Income', 'calc');
  const expense = sumRows(expenseRows, 'Total expenses', 'Expense', 'calc');
  const net: VarianceRow = { ...income, name: 'Net result', kind: 'calc', budgetFy: round(income.budgetFy - expense.budgetFy), budgetPeriod: round(income.budgetPeriod - expense.budgetPeriod), actual: round(income.actual - expense.actual), committed: expense.committed, available: 0, variance: round(income.actual - expense.actual - (income.budgetPeriod - expense.budgetPeriod)), favorable: income.actual - expense.actual >= income.budgetPeriod - expense.budgetPeriod, utilizationPct: 0 };
  return { rows, totals: { income, expense, net } };
}
