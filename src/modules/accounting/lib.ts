// Accounting helpers: draft-line validation (mirrors engine.postJournal rules), source-document links,
// ledger / trial-balance computation over posted + reversed journals, sub-ledger rows.
import { db, C, engine } from '../../store';
import type { Account, AccountGroup, Journal, JournalLine, OpenItem, Period } from '../../store';
import { round, uid } from '../../lib/format';
import type { AccountingSettings, DraftLine } from './types';

export const LEDGER_STATUSES: Journal['status'][] = ['Posted', 'Reversed'];

export function isLedger(j: Journal) { return j.status === 'Posted' || j.status === 'Reversed'; }

export function newDraftLine(partial: Partial<DraftLine> = {}): DraftLine {
  return { id: uid('dl'), accountId: '', side: 'Dr', amount: 0, dimensions: {}, ...partial };
}

export function linesFromJournal(j: Journal): DraftLine[] {
  return j.lines.map((l) => ({ id: l.id, accountId: l.accountId, side: l.dr ? 'Dr' : 'Cr', amount: l.dr || l.cr, partyType: l.partyType, partyId: l.partyId, partyName: l.partyName, dimensions: Object.fromEntries(Object.entries(l.dimensions ?? {}).filter(([k]) => k !== 'Branch')), narration: l.narration }));
}

export function toPostLines(lines: DraftLine[]): engine.PostLine[] {
  return lines.map((l) => ({ accountId: l.accountId, dr: l.side === 'Dr' ? l.amount : 0, cr: l.side === 'Cr' ? l.amount : 0, partyType: l.partyType, partyId: l.partyId, partyName: l.partyName, dimensions: l.dimensions, narration: l.narration }));
}

/** Build stored journal lines from post lines (same shape engine.postJournal writes) for draft edits. */
export function buildJournalLines(lines: engine.PostLine[], opts: { rate: number; currency: string; branchId?: string }): { lines: JournalLine[]; totalDr: number; totalCr: number } {
  const out: JournalLine[] = lines.map((l) => {
    const acc = db.find<Account>(C.accounts, l.accountId);
    const dr = round(l.dr ?? 0), cr = round(l.cr ?? 0);
    const dims = { ...(l.dimensions ?? {}) };
    if (!dims.Branch && (opts.branchId ?? engine.ctx().branchId)) dims.Branch = opts.branchId ?? engine.ctx().branchId;
    return { id: uid('jl'), accountId: l.accountId, accountCode: acc?.code ?? '', accountName: acc?.name ?? l.accountId, dr, cr, drBase: round(dr * opts.rate), crBase: round(cr * opts.rate), currency: opts.currency, partyType: l.partyType, partyId: l.partyId, partyName: l.partyName, dimensions: dims, narration: l.narration };
  }).filter((l) => l.dr !== 0 || l.cr !== 0);
  return { lines: out, totalDr: round(out.reduce((s, l) => s + l.drBase, 0)), totalCr: round(out.reduce((s, l) => s + l.crBase, 0)) };
}

export interface LineIssue { lineId?: string; field?: string; message: string }

/** Client-side validation mirroring engine.postJournal so users see inline errors before saving. */
export function validateDraft(input: { date: string; lines: DraftLine[]; narration: string; currency: string; rate: number; forPost?: boolean }): LineIssue[] {
  const issues: LineIssue[] = [];
  if (!input.date) issues.push({ field: 'date', message: 'Business date is required' });
  else if (input.forPost) { const chk = engine.postingCheck(input.date); if (!chk.ok) issues.push({ field: 'date', message: chk.reason ?? 'Period is closed' }); }
  if (!input.narration.trim()) issues.push({ field: 'narration', message: 'Narration is required' });
  if (!(input.rate > 0)) issues.push({ field: 'rate', message: 'Exchange rate must be positive' });
  const live = input.lines.filter((l) => l.accountId || l.amount);
  if (live.length < 2) issues.push({ message: 'A journal needs at least two lines' });
  live.forEach((l, i) => {
    const n = i + 1;
    if (!l.accountId) { issues.push({ lineId: l.id, field: 'accountId', message: `Line ${n}: choose an account` }); return; }
    const acc = db.find<Account>(C.accounts, l.accountId);
    if (!acc) { issues.push({ lineId: l.id, field: 'accountId', message: `Line ${n}: account not found` }); return; }
    if (acc.status !== 'Active') issues.push({ lineId: l.id, field: 'accountId', message: `Line ${n}: ${acc.code} is inactive` });
    if (!acc.postingAllowed) issues.push({ lineId: l.id, field: 'accountId', message: `Line ${n}: ${acc.code} · ${acc.name} is a header account — posting not allowed` });
    if (acc.isControl && (acc.controlType === 'AR' || acc.controlType === 'AP' || acc.controlType === 'Employee') && !l.partyId) issues.push({ lineId: l.id, field: 'partyId', message: `Line ${n}: control account ${acc.code} needs a ${acc.controlType === 'AR' ? 'customer' : acc.controlType === 'AP' ? 'supplier' : 'employee'} (FR-ACC-002)` });
    if (!(l.amount > 0)) issues.push({ lineId: l.id, field: 'amount', message: `Line ${n}: amount must be positive` });
    acc.requiredDimensions.forEach((d) => { if (d !== 'Branch' && !l.dimensions?.[d]) issues.push({ lineId: l.id, field: d, message: `Line ${n}: ${acc.code} requires dimension "${d}"` }); });
    acc.prohibitedDimensions.forEach((d) => { if (l.dimensions?.[d]) issues.push({ lineId: l.id, field: d, message: `Line ${n}: ${acc.code} does not allow dimension "${d}"` }); });
    if (acc.currencyBehaviour === 'Base' && input.currency !== (engine.ctx().currency)) issues.push({ lineId: l.id, field: 'accountId', message: `Line ${n}: ${acc.code} accepts base currency only` });
    if (acc.currencyBehaviour === 'Fixed' && acc.fixedCurrency && input.currency !== acc.fixedCurrency) issues.push({ lineId: l.id, field: 'accountId', message: `Line ${n}: ${acc.code} is fixed to ${acc.fixedCurrency}` });
  });
  const dr = round(live.reduce((s, l) => s + (l.side === 'Dr' ? l.amount : 0), 0));
  const cr = round(live.reduce((s, l) => s + (l.side === 'Cr' ? l.amount : 0), 0));
  if (live.length >= 2 && Math.abs(dr - cr) > 0.005) issues.push({ field: 'balance', message: `Journal is not balanced: Dr ${dr.toFixed(2)} ≠ Cr ${cr.toFixed(2)} (difference ${(dr - cr).toFixed(2)})` });
  return issues;
}

export function draftTotals(lines: DraftLine[]) {
  const dr = round(lines.reduce((s, l) => s + (l.side === 'Dr' ? l.amount || 0 : 0), 0));
  const cr = round(lines.reduce((s, l) => s + (l.side === 'Cr' ? l.amount || 0 : 0), 0));
  return { dr, cr, diff: round(dr - cr) };
}

// ── Source links ───────────────────────────────────────────────────────────

const SOURCE_ROUTE: Record<string, string> = {
  'Sales Invoice': 'sales/invoices', 'Credit Note': 'sales/credit-notes', 'Sales Return': 'sales/returns', Receipt: 'sales/receipts', Delivery: 'sales/deliveries',
  'Vendor Invoice': 'purchase/vendor-invoices', 'Debit Note': 'purchase/debit-notes', 'Purchase Return': 'purchase/returns', Payment: 'purchase/payments', GRN: 'purchase/grn', 'Payment Batch': 'purchase/payment-batches',
  'Bank Voucher': 'banking/vouchers', 'Bank Charges': 'banking/vouchers', 'Stock Adjustment': 'inventory/adjustments', 'Stock Transfer': 'inventory/transfers', 'Stock Count': 'inventory/counts', 'Landed Cost': 'inventory/landed-costs',
  'POS Bill': 'pos/bills', 'POS Return': 'pos/returns', 'Payroll Run': 'payroll/runs', 'Expense Claim': 'budgets/expenses', 'Depreciation Run': 'fixed-assets/depreciation', Asset: 'fixed-assets/assets',
  Revaluation: 'accounting/revaluation', 'Production Order': 'production/orders', 'Billing Run': 'projects/billing', 'Recurring Journal': 'accounting/recurring',
};

export function sourceLink(j: Pick<Journal, 'sourceType' | 'sourceId'>): string | undefined {
  if (!j.sourceId) return undefined;
  const r = SOURCE_ROUTE[j.sourceType];
  return r ? `${r}/${j.sourceId}` : undefined;
}

export function journalLink(id: string) { return `accounting/journals/${id}`; }

// ── Ledger computations ────────────────────────────────────────────────────

export interface LedgerEntry { journal: Journal; line: JournalLine; dr: number; cr: number; balance: number }

export function accountLedger(accountId: string, opts: { from?: string; to?: string; companyId?: string; branchId?: string; partyId?: string }): { opening: number; entries: LedgerEntry[]; closing: number; dr: number; cr: number } {
  const acc = db.find<Account>(C.accounts, accountId);
  const cid = opts.companyId ?? engine.ctx().companyId;
  const sign = acc?.normalBalance === 'Dr' ? 1 : -1;
  let opening = (acc?.openingBalance ?? 0) * (opts.partyId ? 0 : 1);
  const rows: { j: Journal; l: JournalLine }[] = [];
  db.where<Journal>(C.journals, (j) => isLedger(j) && j.companyId === cid && (!opts.branchId || j.branchId === opts.branchId)).forEach((j) => {
    j.lines.forEach((l) => {
      if (l.accountId !== accountId) return;
      if (opts.partyId && l.partyId !== opts.partyId) return;
      if (opts.from && j.date < opts.from) { opening += sign * (l.drBase - l.crBase); return; }
      if (opts.to && j.date > opts.to) return;
      rows.push({ j, l });
    });
  });
  rows.sort((a, b) => a.j.date.localeCompare(b.j.date) || (a.j.postedAt ?? a.j.createdAt).localeCompare(b.j.postedAt ?? b.j.createdAt) || a.j.number.localeCompare(b.j.number));
  let bal = round(opening);
  let dr = 0, cr = 0;
  const entries = rows.map(({ j, l }) => { bal = round(bal + sign * (l.drBase - l.crBase)); dr += l.drBase; cr += l.crBase; return { journal: j, line: l, dr: l.drBase, cr: l.crBase, balance: bal }; });
  return { opening: round(opening), entries, closing: bal, dr: round(dr), cr: round(cr) };
}

export interface TbRow { account: Account; group?: AccountGroup; opening: number; dr: number; cr: number; net: number; drCol: number; crCol: number }

export function trialBalance(opts: { from?: string; to?: string; companyId?: string; branchId?: string; includeZero?: boolean }): { rows: TbRow[]; totalDr: number; totalCr: number; balanced: boolean } {
  const cid = opts.companyId ?? engine.ctx().companyId;
  const accounts = db.where<Account>(C.accounts, (a) => a.companyId === cid);
  const groups = db.where<AccountGroup>(C.accountGroups, (g) => g.companyId === cid);
  const rows: TbRow[] = accounts.map((a) => {
    const b = engine.accountBalance(a.id, { from: opts.from, to: opts.to, companyId: cid, branchId: opts.branchId });
    const net = b.net;
    const drCol = a.normalBalance === 'Dr' ? (net >= 0 ? net : 0) : net < 0 ? -net : 0;
    const crCol = a.normalBalance === 'Cr' ? (net >= 0 ? net : 0) : net < 0 ? -net : 0;
    return { account: a, group: groups.find((g) => g.id === a.groupId), opening: b.opening, dr: b.dr, cr: b.cr, net, drCol: round(drCol), crCol: round(crCol) };
  }).filter((r) => opts.includeZero || r.drCol || r.crCol || r.dr || r.cr).sort((a, b) => ((a.group?.order ?? 99) - (b.group?.order ?? 99)) || a.account.code.localeCompare(b.account.code));
  const totalDr = round(rows.reduce((s, r) => s + r.drCol, 0));
  const totalCr = round(rows.reduce((s, r) => s + r.crCol, 0));
  return { rows, totalDr, totalCr, balanced: Math.abs(totalDr - totalCr) < 0.011 };
}

// ── Periods ────────────────────────────────────────────────────────────────

export function periodsOf(companyId?: string): Period[] {
  const cid = companyId ?? engine.ctx().companyId;
  return db.where<Period>(C.periods, (p) => p.companyId === cid).sort((a, b) => a.code.localeCompare(b.code));
}

export function fyRange(fy: string | undefined, companyId?: string): { from: string; to: string } | undefined {
  const ps = periodsOf(companyId).filter((p) => p.fy === fy);
  if (!ps.length) return undefined;
  return { from: ps[0].start, to: ps[ps.length - 1].end };
}

// ── Sub-ledgers ────────────────────────────────────────────────────────────

export function partyOpenItems(partyType: 'Customer' | 'Supplier', partyId?: string, companyId?: string): OpenItem[] {
  const cid = companyId ?? engine.ctx().companyId;
  return db.where<OpenItem>(C.openItems, (o) => o.partyType === partyType && (!o.companyId || o.companyId === cid) && (!partyId || o.partyId === partyId)).sort((a, b) => a.date.localeCompare(b.date));
}

export function settings(): AccountingSettings & { retainedEarningsAccountId: string; openingBalanceEquityAccountId: string; unrealisedFxGainAccountId: string; unrealisedFxLossAccountId: string } {
  const d = (engine.ctx().company?.defaults ?? {}) as AccountingSettings;
  return { ...d, retainedEarningsAccountId: d.retainedEarningsAccountId ?? 'acc_3100', openingBalanceEquityAccountId: d.openingBalanceEquityAccountId ?? 'acc_3900', unrealisedFxGainAccountId: d.unrealisedFxGainAccountId ?? 'acc_4920', unrealisedFxLossAccountId: d.unrealisedFxLossAccountId ?? 'acc_5610' };
}

export function accountLabel(id?: string): string {
  const a = db.find<Account>(C.accounts, id);
  return a ? `${a.code} · ${a.name}` : id ?? '—';
}

export function partyName(partyType?: string, partyId?: string): string | undefined {
  if (!partyId) return undefined;
  const col = partyType === 'Customer' ? C.customers : partyType === 'Supplier' ? C.suppliers : C.employees;
  return db.find<any>(col, partyId)?.name;
}
