// Budget control (FR-BUD-003): checkBudget(accountId, amount, date) for other modules to call before commit/post.
import { db, C, engine } from '../../store';
import type { Account } from '../../store';
import { round, fmtMoney, fiscalYearOf } from '../../lib/format';
import { fyRange, monthRange } from '../reports/compute';
import { activeBudget, budgetFor, committedFor } from './compute';
import type { BudgetCheckResult, BudgetRule } from './types';

/**
 * Check a prospective posting of `amount` to `accountId` on `date` against the approved budget and the control rule of
 * the account's group. Returns ok=false only for mode Block; Override returns ok=true with needsApproval.
 */
export function checkBudget(accountId: string, amount: number, date: string, opts: { scope?: 'period' | 'ytd' | 'fy'; companyId?: string } = {}): BudgetCheckResult {
  const cid = opts.companyId ?? engine.ctx().companyId;
  const acc = db.find<Account>(C.accounts, accountId);
  const none: BudgetCheckResult = { ok: true, mode: 'None', budget: 0, actual: 0, committed: 0, available: 0, utilizationPct: 0, accountCode: acc?.code };
  if (!acc || acc.type !== 'Expense') return { ...none, message: acc ? 'Budget control applies to expense accounts only' : 'Unknown account' };
  const rule = db.findBy<BudgetRule>(C.budgetRules, (r) => r.companyId === cid && r.groupId === acc.groupId && r.status === 'Active');
  if (!rule) return { ...none, message: `No budget control rule for ${acc.name}` };
  const fyStart = engine.companyOf(cid)?.fiscalYearStartMonth ?? 4;
  const fy = fiscalYearOf(date, fyStart);
  const budget = activeBudget(fy, cid);
  if (!budget) return { ...none, mode: rule.mode, message: `No approved budget for FY ${fy}`, ruleId: rule.id };
  const scope = opts.scope ?? 'ytd';
  const range = scope === 'period' ? monthRange(date.slice(0, 7)) : scope === 'fy' ? fyRange(date, fyStart) : { from: fyRange(date, fyStart).from, to: monthRange(date.slice(0, 7)).to };
  const line = budget.lines.find((l) => l.accountId === accountId);
  const budgetAmt = budgetFor(line, budget, range);
  const b = engine.accountBalance(accountId, { from: range.from, to: range.to, companyId: cid });
  const actual = round(b.dr - b.cr);
  const committed = rule.includeCommitted ? committedFor(accountId, range, cid) : 0;
  const available = round(budgetAmt - actual - committed);
  const projected = round(actual + committed + amount);
  const utilizationPct = budgetAmt > 0 ? round((projected / budgetAmt) * 100, 1) : 999;
  const base = { mode: rule.mode, budget: budgetAmt, actual, committed, available, utilizationPct, accountCode: acc.code, ruleId: rule.id };
  const limit = round((budgetAmt * rule.thresholdPct) / 100);
  if (budgetAmt <= 0) return { ...base, ok: rule.mode !== 'Block', needsApproval: rule.mode === 'Override', message: `${acc.code} · ${acc.name} has no budget line for FY ${fy}${rule.mode === 'Block' ? ' — posting blocked' : ''}` };
  if (projected <= limit) return { ...base, ok: true, message: `Within budget: ${fmtMoney(projected)} of ${fmtMoney(budgetAmt)} (${utilizationPct}%) · ${scope.toUpperCase()}` };
  const msg = `${acc.code} · ${acc.name}: ${fmtMoney(projected)} would reach ${utilizationPct}% of the ${scope.toUpperCase()} budget ${fmtMoney(budgetAmt)} (threshold ${rule.thresholdPct}%)`;
  if (rule.mode === 'Block') return { ...base, ok: false, message: `${msg} — blocked by budget control` };
  if (rule.mode === 'Override') return { ...base, ok: true, needsApproval: true, message: `${msg} — needs budget override approval` };
  return { ...base, ok: true, message: `${msg} — warning` };
}
