// Report computations — all derived from posted journals, opening balances, open items and stock movements
// (FR-RPT-002/003/009/010/011). Pure functions over store reads; no React.
import { db, C, engine, IDS } from '../../store';
import type { Account, AccountGroup, Journal, OpenItem, StockMovement, Item, DocHeader, ExchangeRate } from '../../store';
import { round, ageingBucket, today, daysBetween, fiscalYearOf, periodCodeOf } from '../../lib/format';

export interface Range { from: string; to: string }

export interface LedgerBalance { accountId: string; opening: number; dr: number; cr: number; closing: number }

/**
 * Dr-positive ledger balance for a range (opening = before `from`, movement within [from, to]).
 *
 * There is exactly ONE balance engine in the app: `engine.accountBalance`. This is a presentation
 * wrapper that flips its normal-direction result into the Dr-positive convention the financial
 * statements use, so the trial balance, P&L, balance sheet, cash flow, budget variance and the
 * dashboards can never disagree with the ledger or with each other (FR-RPT-002/003/009).
 */
export function ledgerBalances(range: Partial<Range>, opts: { companyId?: string; branchId?: string; dimension?: { type: string; id: string } } = {}): Map<string, LedgerBalance> {
  const cid = opts.companyId ?? engine.ctx().companyId;
  const accounts = db.where<Account>(C.accounts, (a) => a.companyId === cid);
  const out = new Map<string, LedgerBalance>();
  accounts.forEach((a) => {
    const b = engine.accountBalance(a.id, { from: range.from, to: range.to, companyId: cid, branchId: opts.branchId, dimension: opts.dimension, includeOpening: !(opts.branchId || opts.dimension) });
    const sign = a.normalBalance === 'Dr' ? 1 : -1;
    out.set(a.id, { accountId: a.id, opening: round(b.opening * sign), dr: b.dr, cr: b.cr, closing: round(b.net * sign) });
  });
  return out;
}

export function accountsOf(companyId?: string): Account[] {
  const cid = companyId ?? engine.ctx().companyId;
  return db.where<Account>(C.accounts, (a) => a.companyId === cid).sort((a, b) => a.code.localeCompare(b.code));
}

export function groupsOf(companyId?: string): AccountGroup[] {
  const cid = companyId ?? engine.ctx().companyId;
  return db.where<AccountGroup>(C.accountGroups, (g) => g.companyId === cid).sort((a, b) => a.order - b.order);
}

// ── P&L ────────────────────────────────────────────────────────────────────

export interface PlLine { accountId?: string; code?: string; label: string; amount: number; compare?: number; level: 0 | 1 | 2; kind: 'group' | 'account' | 'total' | 'net' }

export interface PlResult { lines: PlLine[]; revenue: number; cogs: number; grossProfit: number; opex: number; ebitda: number; depreciation: number; finance: number; otherIncome: number; netProfit: number; compare?: PlResult }

export function profitAndLoss(range: Range, opts: { branchId?: string; compare?: Range; dimension?: { type: string; id: string } } = {}): PlResult {
  const bal = ledgerBalances(range, { branchId: opts.branchId, dimension: opts.dimension });
  const cmp = opts.compare ? ledgerBalances(opts.compare, { branchId: opts.branchId, dimension: opts.dimension }) : undefined;
  const accounts = accountsOf();
  const groups = groupsOf();
  const move = (m: Map<string, LedgerBalance>, a: Account) => { const b = m.get(a.id); if (!b) return 0; return a.type === 'Income' ? round(b.cr - b.dr) : round(b.dr - b.cr); };
  const lines: PlLine[] = [];
  const groupTotal = (gid: string, m: Map<string, LedgerBalance>) => accounts.filter((a) => a.groupId === gid).reduce((s, a) => s + move(m, a), 0);
  const pushGroup = (g: AccountGroup) => {
    const accs = accounts.filter((a) => a.groupId === g.id && (move(bal, a) !== 0 || (cmp && move(cmp, a) !== 0)));
    lines.push({ label: g.name, amount: round(groupTotal(g.id, bal)), compare: cmp ? round(groupTotal(g.id, cmp)) : undefined, level: 0, kind: 'group' });
    accs.forEach((a) => lines.push({ accountId: a.id, code: a.code, label: a.name, amount: move(bal, a), compare: cmp ? move(cmp, a) : undefined, level: 1, kind: 'account' }));
  };
  const gRev = groups.filter((g) => g.type === 'Income' && g.code === 'REV');
  const gOI = groups.filter((g) => g.type === 'Income' && g.code !== 'REV');
  const gCogs = groups.filter((g) => g.code === 'COGS');
  const gOpex = groups.filter((g) => g.type === 'Expense' && g.code !== 'COGS' && g.code !== 'FIN');
  const gFin = groups.filter((g) => g.code === 'FIN');
  const sum = (gs: AccountGroup[], m: Map<string, LedgerBalance>) => round(gs.reduce((s, g) => s + groupTotal(g.id, m), 0));
  gRev.forEach(pushGroup);
  const revenue = sum(gRev, bal);
  lines.push({ label: 'Total revenue from operations', amount: revenue, compare: cmp ? sum(gRev, cmp) : undefined, level: 0, kind: 'total' });
  gCogs.forEach(pushGroup);
  const cogs = sum(gCogs, bal);
  const grossProfit = round(revenue - cogs);
  lines.push({ label: 'Gross profit', amount: grossProfit, compare: cmp ? round(sum(gRev, cmp) - sum(gCogs, cmp)) : undefined, level: 0, kind: 'total' });
  gOpex.forEach(pushGroup);
  const opex = sum(gOpex, bal);
  const depAcc = accounts.find((a) => a.id === IDS.accDep);
  const depreciation = depAcc ? move(bal, depAcc) : 0;
  lines.push({ label: 'Total operating expenses', amount: opex, compare: cmp ? sum(gOpex, cmp) : undefined, level: 0, kind: 'total' });
  const ebitda = round(grossProfit - opex + depreciation);
  lines.push({ label: 'EBITDA', amount: ebitda, compare: cmp ? round(sum(gRev, cmp) - sum(gCogs, cmp) - sum(gOpex, cmp) + (depAcc ? move(cmp, depAcc) : 0)) : undefined, level: 0, kind: 'total' });
  gOI.forEach(pushGroup);
  const otherIncome = sum(gOI, bal);
  gFin.forEach(pushGroup);
  const finance = sum(gFin, bal);
  const netProfit = round(revenue + otherIncome - cogs - opex - finance);
  lines.push({ label: 'Net profit before tax', amount: netProfit, compare: cmp ? round(sum(gRev, cmp) + sum(gOI, cmp) - sum(gCogs, cmp) - sum(gOpex, cmp) - sum(gFin, cmp)) : undefined, level: 0, kind: 'net' });
  return { lines, revenue, cogs, grossProfit, opex, ebitda, depreciation, finance, otherIncome, netProfit };
}

// ── Balance sheet ──────────────────────────────────────────────────────────

export interface BsLine { accountId?: string; code?: string; label: string; amount: number; compare?: number; level: 0 | 1; kind: 'group' | 'account' | 'total' }
export interface BsResult { assets: BsLine[]; liabilities: BsLine[]; totalAssets: number; totalLiabilities: number; totalEquity: number; retainedCurrent: number; totalLE: number; difference: number; compare?: { totalAssets: number; totalLE: number } }

export function balanceSheet(asOf: string, opts: { branchId?: string; compareAsOf?: string } = {}): BsResult {
  const build = (to: string) => {
    const bal = ledgerBalances({ to }, { branchId: opts.branchId });
    const accounts = accountsOf();
    const groups = groupsOf();
    const closing = (a: Account) => bal.get(a.id)?.closing ?? 0;
    const assets: BsLine[] = [];
    const liabilities: BsLine[] = [];
    let totalAssets = 0, totalLiabilities = 0, totalEquity = 0;
    groups.filter((g) => g.type === 'Asset').forEach((g) => {
      const accs = accounts.filter((a) => a.groupId === g.id && closing(a) !== 0);
      const t = round(accs.reduce((s, a) => s + closing(a), 0));
      assets.push({ label: g.name, amount: t, level: 0, kind: 'group' });
      accs.forEach((a) => assets.push({ accountId: a.id, code: a.code, label: a.name, amount: closing(a), level: 1, kind: 'account' }));
      totalAssets += t;
    });
    groups.filter((g) => g.type === 'Liability' || g.type === 'Equity').forEach((g) => {
      const accs = accounts.filter((a) => a.groupId === g.id && closing(a) !== 0);
      const t = round(accs.reduce((s, a) => s - closing(a), 0));
      liabilities.push({ label: g.name, amount: t, level: 0, kind: 'group' });
      accs.forEach((a) => liabilities.push({ accountId: a.id, code: a.code, label: a.name, amount: -closing(a), level: 1, kind: 'account' }));
      if (g.type === 'Liability') totalLiabilities += t; else totalEquity += t;
    });
    // current-year profit = net movement on P&L accounts to date
    const retainedCurrent = round(accounts.filter((a) => a.type === 'Income' || a.type === 'Expense').reduce((s, a) => s - closing(a), 0));
    liabilities.push({ label: 'Profit for the period (unappropriated)', amount: retainedCurrent, level: 1, kind: 'account' });
    totalEquity = round(totalEquity + retainedCurrent);
    const totalLE = round(totalLiabilities + totalEquity);
    return { assets, liabilities, totalAssets: round(totalAssets), totalLiabilities: round(totalLiabilities), totalEquity, retainedCurrent, totalLE, difference: round(totalAssets - totalLE) };
  };
  const cur = build(asOf);
  if (opts.compareAsOf) {
    const c = build(opts.compareAsOf);
    const mapC = (lines: BsLine[], other: BsLine[]) => lines.forEach((l) => { const m = other.find((o) => (l.accountId ? o.accountId === l.accountId : o.label === l.label && o.kind === l.kind)); l.compare = m?.amount ?? 0; });
    mapC(cur.assets, c.assets); mapC(cur.liabilities, c.liabilities);
    return { ...cur, compare: { totalAssets: c.totalAssets, totalLE: c.totalLE } };
  }
  return cur;
}

// ── Cash flow (indirect) ───────────────────────────────────────────────────

export interface CfLine { label: string; amount: number; level: 0 | 1; kind: 'item' | 'total' }
export interface CfResult { operating: CfLine[]; investing: CfLine[]; financing: CfLine[]; netOperating: number; netInvesting: number; netFinancing: number; netChange: number; openingCash: number; closingCash: number; actualChange: number; difference: number }

export function cashFlow(range: Range, opts: { branchId?: string } = {}): CfResult {
  const pl = profitAndLoss(range, { branchId: opts.branchId });
  const bal = ledgerBalances(range, { branchId: opts.branchId });
  const accounts = accountsOf();
  const groups = groupsOf();
  const gcode = (a: Account) => groups.find((g) => g.id === a.groupId)?.code ?? '';
  const isCash = (a: Account) => a.controlType === 'Bank' || a.controlType === 'Cash';
  const delta = (a: Account) => { const b = bal.get(a.id); return b ? round(b.dr - b.cr) : 0; };
  const operating: CfLine[] = [{ label: 'Net profit before tax', amount: pl.netProfit, level: 0, kind: 'item' }];
  if (pl.depreciation) operating.push({ label: 'Add: depreciation & amortisation', amount: pl.depreciation, level: 1, kind: 'item' });
  if (pl.finance) operating.push({ label: 'Add: finance costs', amount: pl.finance, level: 1, kind: 'item' });
  const wc = (label: string, filter: (a: Account) => boolean, sign: 1 | -1) => {
    const amt = round(accounts.filter(filter).reduce((s, a) => s + delta(a), 0) * sign);
    if (amt !== 0) operating.push({ label: `${amt < 0 ? 'Less' : 'Add'}: ${label}`, amount: amt, level: 1, kind: 'item' });
  };
  wc('(increase) / decrease in trade receivables', (a) => gcode(a) === 'CA' && a.controlType === 'AR', -1);
  wc('(increase) / decrease in inventories', (a) => gcode(a) === 'CA' && (a.controlType === 'Inventory' || a.controlType === 'WIP'), -1);
  wc('(increase) / decrease in other current assets', (a) => gcode(a) === 'CA' && !isCash(a) && a.controlType !== 'AR' && a.controlType !== 'Inventory' && a.controlType !== 'WIP', -1);
  wc('increase / (decrease) in trade payables', (a) => gcode(a) === 'CL' && a.controlType === 'AP', -1);
  wc('increase / (decrease) in other current liabilities', (a) => gcode(a) === 'CL' && a.controlType !== 'AP', -1);
  const netOperating = round(operating.reduce((s, l) => s + l.amount, 0) - pl.finance);
  if (pl.finance) operating.push({ label: 'Less: finance costs paid', amount: -pl.finance, level: 1, kind: 'item' });
  const investing: CfLine[] = [];
  accounts.filter((a) => gcode(a) === 'FA').forEach((a) => { const d = delta(a); if (d !== 0) investing.push({ label: d > 0 ? `Purchase of ${a.name.toLowerCase()}` : `Proceeds / depreciation — ${a.name.toLowerCase()}`, amount: -d, level: 1, kind: 'item' }); });
  // add back depreciation credited to accumulated depreciation (non-cash) so investing shows only cash capex
  const accDep = accounts.find((a) => a.id === IDS.accAccDep);
  if (accDep && pl.depreciation) investing.push({ label: 'Adjust: non-cash depreciation credited to accumulated depreciation', amount: -pl.depreciation, level: 1, kind: 'item' });
  const netInvesting = round(investing.reduce((s, l) => s + l.amount, 0));
  const financing: CfLine[] = [];
  accounts.filter((a) => gcode(a) === 'NCL' || (a.type === 'Equity')).forEach((a) => { const d = delta(a); if (d !== 0) financing.push({ label: d < 0 ? `Proceeds — ${a.name}` : `Repayment / reduction — ${a.name}`, amount: -d, level: 1, kind: 'item' }); });
  const netFinancing = round(financing.reduce((s, l) => s + l.amount, 0));
  const netChange = round(netOperating + netInvesting + netFinancing);
  const cashAccs = accounts.filter(isCash);
  const openingCash = round(cashAccs.reduce((s, a) => s + (bal.get(a.id)?.opening ?? 0), 0));
  const closingCash = round(cashAccs.reduce((s, a) => s + (bal.get(a.id)?.closing ?? 0), 0));
  const actualChange = round(closingCash - openingCash);
  return { operating, investing, financing, netOperating, netInvesting, netFinancing, netChange, openingCash, closingCash, actualChange, difference: round(netChange - actualChange) };
}

// ── Trial balance ──────────────────────────────────────────────────────────

export interface TbRow { accountId: string; code: string; name: string; type: string; group: string; openingDr: number; openingCr: number; dr: number; cr: number; closingDr: number; closingCr: number }

export function trialBalance(range: Partial<Range>, opts: { branchId?: string } = {}): { rows: TbRow[]; totalDr: number; totalCr: number; difference: number } {
  const bal = ledgerBalances(range, { branchId: opts.branchId });
  const groups = groupsOf();
  const rows: TbRow[] = accountsOf().map((a) => {
    const b = bal.get(a.id)!;
    return { accountId: a.id, code: a.code, name: a.name, type: a.type, group: groups.find((g) => g.id === a.groupId)?.name ?? '', openingDr: b.opening > 0 ? b.opening : 0, openingCr: b.opening < 0 ? -b.opening : 0, dr: b.dr, cr: b.cr, closingDr: b.closing > 0 ? b.closing : 0, closingCr: b.closing < 0 ? -b.closing : 0 };
  }).filter((r) => r.openingDr || r.openingCr || r.dr || r.cr);
  const totalDr = round(rows.reduce((s, r) => s + r.closingDr, 0));
  const totalCr = round(rows.reduce((s, r) => s + r.closingCr, 0));
  return { rows, totalDr, totalCr, difference: round(totalDr - totalCr) };
}

// ── Ageing ─────────────────────────────────────────────────────────────────

export const BUCKETS = [
  { key: 'current', label: 'Current', color: '#12784E' },
  { key: 'd030', label: '1–30 days', color: '#F59E0B' },
  { key: 'd3160', label: '31–60 days', color: '#F97316' },
  { key: 'd6190', label: '61–90 days', color: '#EF4444' },
  { key: 'd90p', label: '> 90 days', color: '#C0393F' },
] as const;
export type BucketKey = (typeof BUCKETS)[number]['key'];

export interface AgeingRow { partyId: string; partyName: string; currency: string; current: number; d030: number; d3160: number; d6190: number; d90p: number; total: number; items: OpenItem[]; overdueDays: number }

/**
 * Which control account an open item actually posts to (FR-ACC-020/022).
 * Invoices, credit/debit notes and carried-forward opening balances live in AR (1100) / AP (2100);
 * money received or paid with nothing to apply it to lives in the advance accounts (2150 customers,
 * 1450 suppliers) or in Retainers Received (2160). Mixing them makes the ageing report disagree
 * with the control account it is supposed to explain.
 */
export function openItemScope(o: OpenItem): 'control' | 'advance' {
  return o.docType === 'Receipt' || o.docType === 'Payment' || o.docType === 'Retainer' || o.docType === 'Advance' ? 'advance' : 'control';
}

/** Control accounts each party sub-ledger reconciles against. */
export const CONTROL_ACCOUNTS = {
  Customer: { control: [IDS.accAR], advance: [IDS.accAdvanceCustomer, 'acc_2160'] },
  Supplier: { control: [IDS.accAP], advance: [IDS.accAdvanceSupplier] },
} as const;

export function ageing(partyType: 'Customer' | 'Supplier', asOf = today(), opts: { branchId?: string; currency?: string; scope?: 'control' | 'advance' | 'all' } = {}): { rows: AgeingRow[]; totals: Record<BucketKey | 'total', number> } {
  const cid = engine.ctx().companyId;
  const scope = opts.scope ?? 'control';
  const items = db.where<OpenItem>(C.openItems, (o) => o.partyType === partyType && (!o.companyId || o.companyId === cid) && o.status !== 'Settled' && o.status !== 'Written Off' && o.date <= asOf && (scope === 'all' || openItemScope(o) === scope) && (!opts.branchId || o.branchId === opts.branchId) && (!opts.currency || o.currency === opts.currency));
  const map = new Map<string, AgeingRow>();
  items.forEach((o) => {
    const key = o.partyId;
    const row = map.get(key) ?? { partyId: o.partyId, partyName: o.partyName, currency: o.currency, current: 0, d030: 0, d3160: 0, d6190: 0, d90p: 0, total: 0, items: [], overdueDays: 0 };
    const signed = o.direction === 'Debit' ? o.baseOutstanding : -o.baseOutstanding;
    const b = ageingBucket(o.dueDate, asOf);
    row[b] = round(row[b] + signed);
    row.total = round(row.total + signed);
    row.items.push(o);
    row.overdueDays = Math.max(row.overdueDays, o.direction === 'Debit' ? daysBetween(o.dueDate, asOf) : 0);
    map.set(key, row);
  });
  const rows = Array.from(map.values()).sort((a, b) => b.total - a.total);
  const totals = { current: 0, d030: 0, d3160: 0, d6190: 0, d90p: 0, total: 0 };
  rows.forEach((r) => { (Object.keys(totals) as (keyof typeof totals)[]).forEach((k) => { totals[k] = round(totals[k] + r[k]); }); });
  return { rows, totals };
}

// ── Inventory ──────────────────────────────────────────────────────────────

export function stockItems(): Item[] {
  const cid = engine.ctx().companyId;
  return db.where<Item>(C.items, (i) => i.companyId === cid && i.isStock);
}

export interface ValuationRow { itemId: string; code: string; name: string; uom: string; warehouseId: string; warehouse: string; qty: number; avgRate: number; value: number; reorderLevel: number; reserved: number; available: number }

export function stockValuation(opts: { warehouseId?: string; asOf?: string } = {}): ValuationRow[] {
  const whs = db.where<any>(C.warehouses, (w) => (!opts.warehouseId || w.id === opts.warehouseId));
  const out: ValuationRow[] = [];
  stockItems().forEach((i) => {
    whs.forEach((w) => {
      const p = engine.stockPosition(i.id, w.id, { asOf: opts.asOf });
      if (p.onHand === 0 && p.reserved === 0) return;
      out.push({ itemId: i.id, code: i.code, name: i.name, uom: i.baseUom, warehouseId: w.id, warehouse: w.name, qty: p.onHand, avgRate: p.avgRate, value: p.value, reorderLevel: i.reorderLevel, reserved: p.reserved, available: p.available });
    });
  });
  return out.sort((a, b) => b.value - a.value);
}

export interface AgeingStockRow { itemId: string; code: string; name: string; warehouse: string; d030: number; d3160: number; d6190: number; d90p: number; total: number; value: number }

/** FIFO stock ageing: remaining on-hand allocated to the newest receipts first. */
export function stockAgeing(asOf = today()): AgeingStockRow[] {
  const moves = db.get<StockMovement>(C.stockMovements);
  const out: AgeingStockRow[] = [];
  stockItems().forEach((i) => {
    const byWh = new Map<string, StockMovement[]>();
    moves.filter((m) => m.itemId === i.id && m.date <= asOf).forEach((m) => byWh.set(m.warehouseId, [...(byWh.get(m.warehouseId) ?? []), m]));
    byWh.forEach((ms, whId) => {
      let onHand = ms.reduce((s, m) => s + m.baseQty, 0);
      if (onHand <= 0) return;
      const row: AgeingStockRow = { itemId: i.id, code: i.code, name: i.name, warehouse: ms[0].warehouseName ?? whId, d030: 0, d3160: 0, d6190: 0, d90p: 0, total: onHand, value: 0 };
      const receipts = ms.filter((m) => m.baseQty > 0).sort((a, b) => b.date.localeCompare(a.date));
      for (const r of receipts) {
        if (onHand <= 0) break;
        const q = Math.min(onHand, r.baseQty);
        const age = daysBetween(r.date, asOf);
        const k: 'd030' | 'd3160' | 'd6190' | 'd90p' = age <= 30 ? 'd030' : age <= 60 ? 'd3160' : age <= 90 ? 'd6190' : 'd90p';
        row[k] = round(row[k] + q, 3);
        row.value = round(row.value + q * r.rate);
        onHand -= q;
      }
      if (onHand > 0) row.d90p = round(row.d90p + onHand, 3);
      out.push(row);
    });
  });
  return out;
}

// ── Sales / purchase analysis ─────────────────────────────────────────────

export interface AnalysisRow { key: string; label: string; sub?: string; docs: number; qty: number; taxable: number; tax: number; total: number; cogs: number; margin: number; marginPct: number }

export type AnalysisDim = 'customer' | 'supplier' | 'item' | 'salesperson' | 'branch' | 'period' | 'group';

export function postedDocs(collection: string, range: Range, opts: { branchId?: string; partyId?: string; itemId?: string; status?: string; dimension?: { type: string; id: string } } = {}): DocHeader[] {
  const cid = engine.ctx().companyId;
  return db.where<DocHeader>(collection, (d) => (!d.companyId || d.companyId === cid) && (opts.status ? d.status === opts.status : d.status === 'Posted' || d.status === 'Settled' || d.status === 'Paid') && d.date >= range.from && d.date <= range.to && (!opts.branchId || d.branchId === opts.branchId) && (!opts.partyId || d.partyId === opts.partyId) && (!opts.itemId || (d.lines ?? []).some((l) => l.itemId === opts.itemId)) && (!opts.dimension || d.dimensions?.[opts.dimension.type] === opts.dimension.id || (d.lines ?? []).some((l) => l.dimensions?.[opts.dimension!.type] === opts.dimension!.id)));
}

export function costOfLine(l: { itemId?: string; qty: number; warehouseId?: string; rate: number }, direction: 'sale' | 'purchase'): number {
  if (direction === 'purchase') return round(l.qty * l.rate);
  const item = db.find<Item>(C.items, l.itemId);
  if (!item || !item.isStock) return 0;
  const pos = engine.stockPosition(item.id, l.warehouseId);
  const rate = pos.avgRate || item.standardCost || item.purchasePrice || 0;
  return round(l.qty * rate);
}

export function analysis(docs: DocHeader[], dim: AnalysisDim, direction: 'sale' | 'purchase', includeCredits?: DocHeader[]): AnalysisRow[] {
  const map = new Map<string, AnalysisRow>();
  const add = (key: string, label: string, sub: string | undefined, sign: 1 | -1, d: DocHeader, lines: DocHeader['lines']) => {
    const row = map.get(key) ?? { key, label, sub, docs: 0, qty: 0, taxable: 0, tax: 0, total: 0, cogs: 0, margin: 0, marginPct: 0 };
    row.docs += 1;
    lines.forEach((l) => {
      row.qty = round(row.qty + sign * l.qty, 3);
      row.taxable = round(row.taxable + sign * l.taxable);
      row.tax = round(row.tax + sign * l.taxAmt);
      row.cogs = round(row.cogs + sign * costOfLine(l, direction));
    });
    row.total = round(row.total + sign * (lines === d.lines ? d.totals.baseTotal || d.totals.total : lines.reduce((s, l) => s + l.amount, 0)));
    map.set(key, row);
  };
  const keyOf = (d: DocHeader, l?: DocHeader['lines'][number]): { key: string; label: string; sub?: string } => {
    switch (dim) {
      case 'customer': case 'supplier': return { key: d.partyId ?? '—', label: d.partyName ?? d.partySnapshot?.name ?? '—', sub: d.partySnapshot?.gstin };
      case 'item': return { key: l?.itemId ?? l?.itemName ?? '—', label: l?.itemName ?? '—', sub: l?.itemCode };
      case 'group': { const it = db.find<Item>(C.items, l?.itemId); return { key: it?.group ?? 'Other', label: it?.group ?? 'Other' }; }
      case 'salesperson': { const sp = db.find<any>(C.salespersons, d.salespersonId); return { key: d.salespersonId ?? '—', label: sp?.name ?? 'Unassigned' }; }
      case 'branch': { const b = db.find<any>(C.branches, d.branchId); return { key: d.branchId, label: b?.name ?? d.branchId }; }
      case 'period': return { key: d.date.slice(0, 7), label: d.date.slice(0, 7) };
    }
  };
  const all: { d: DocHeader; sign: 1 | -1 }[] = [...docs.map((d) => ({ d, sign: 1 as const })), ...(includeCredits ?? []).map((d) => ({ d, sign: -1 as const }))];
  all.forEach(({ d, sign }) => {
    if (dim === 'item' || dim === 'group') {
      const byKey = new Map<string, DocHeader['lines']>();
      (d.lines ?? []).forEach((l) => { const k = keyOf(d, l); byKey.set(k.key, [...(byKey.get(k.key) ?? []), l]); });
      byKey.forEach((lines, k) => { const meta = keyOf(d, lines[0]); add(k, meta.label, meta.sub, sign, d, lines); });
    } else {
      const k = keyOf(d);
      add(k.key, k.label, k.sub, sign, d, d.lines ?? []);
    }
  });
  const rows = Array.from(map.values());
  rows.forEach((r) => { r.margin = round(r.taxable - r.cogs); r.marginPct = r.taxable ? round((r.margin / r.taxable) * 100, 1) : 0; });
  return rows.sort((a, b) => b.taxable - a.taxable);
}

// ── FX ─────────────────────────────────────────────────────────────────────

export interface FxExposureRow { openItemId: string; partyType: string; partyName: string; docNumber: string; date: string; dueDate: string; currency: string; outstanding: number; bookedRate: number; baseOutstanding: number; currentRate: number; currentBase: number; unrealized: number; rateSource: string }

export function fxExposure(asOf = today()): FxExposureRow[] {
  const base = engine.ctx().currency;
  const cid = engine.ctx().companyId;
  return db.where<OpenItem>(C.openItems, (o) => (!o.companyId || o.companyId === cid) && o.currency !== base && o.status !== 'Settled' && o.status !== 'Written Off').map((o) => {
    const r = engine.resolveRate(o.currency, base, asOf, 'Closing');
    const cur = r.rate || engine.resolveRate(o.currency, base, asOf).rate;
    const currentBase = round(o.outstanding * cur);
    const unrealized = round((currentBase - o.baseOutstanding) * (o.direction === 'Debit' ? 1 : -1) * (o.partyType === 'Customer' ? 1 : -1));
    return { openItemId: o.id, partyType: o.partyType, partyName: o.partyName, docNumber: o.docNumber, date: o.date, dueDate: o.dueDate, currency: o.currency, outstanding: o.outstanding, bookedRate: o.rate, baseOutstanding: o.baseOutstanding, currentRate: cur, currentBase, unrealized, rateSource: r.rate ? `${r.type} · ${r.source}` : 'Spot' };
  });
}

export function realizedFx(range: Range): { date: string; partyName: string; docNumber: string; settledBy: string; currency: string; amount: number; bookedRate: number; settledRate: number; gainLoss: number }[] {
  const cid = engine.ctx().companyId;
  const out: ReturnType<typeof realizedFx> = [];
  db.where<OpenItem>(C.openItems, (o) => (!o.companyId || o.companyId === cid)).forEach((o) => o.settlements.forEach((s) => {
    if (s.fxGainLoss && s.date >= range.from && s.date <= range.to) out.push({ date: s.date, partyName: o.partyName, docNumber: o.docNumber, settledBy: s.docNumber, currency: o.currency, amount: s.amount, bookedRate: o.rate, settledRate: s.rate, gainLoss: s.fxGainLoss });
  }));
  return out.sort((a, b) => b.date.localeCompare(a.date));
}

export function rateAudit(): ExchangeRate[] {
  return db.get<ExchangeRate>(C.exchangeRates).slice().sort((a, b) => b.effectiveAt.localeCompare(a.effectiveAt));
}

// ── Period helpers ─────────────────────────────────────────────────────────

export function fyRange(date: string, fyStartMonth = 4): Range {
  const fy = fiscalYearOf(date, fyStartMonth);
  const startYear = parseInt(fy.slice(0, 4), 10);
  const from = `${startYear}-${String(fyStartMonth).padStart(2, '0')}-01`;
  const end = new Date(startYear + 1, fyStartMonth - 1, 0);
  return { from, to: `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}` };
}

export function monthRange(period: string): Range {
  const [y, m] = period.split('-').map((x) => parseInt(x, 10));
  return { from: `${period}-01`, to: `${period}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}` };
}

export function quarterRange(period: string, fyStartMonth = 4): Range {
  const [y, m] = period.split('-').map((x) => parseInt(x, 10));
  const offset = ((m - fyStartMonth) + 12) % 12;
  const qStart = new Date(y, m - 1 - (offset % 3), 1);
  const qEnd = new Date(qStart.getFullYear(), qStart.getMonth() + 3, 0);
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return { from: iso(qStart), to: iso(qEnd) };
}

export function shiftRange(r: Range, months: number): Range {
  const shift = (iso: string, endOfMonth: boolean) => {
    const d = new Date(iso.slice(0, 10) + 'T00:00:00');
    const t = new Date(d.getFullYear(), d.getMonth() + months + (endOfMonth ? 1 : 0), endOfMonth ? 0 : d.getDate());
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
  };
  return { from: shift(r.from, false), to: shift(r.to, r.to.slice(8, 10) >= '28') };
}

export function presetRange(preset: string, period: string, fyStartMonth = 4, custom?: Partial<Range>): Range {
  switch (preset) {
    case 'MTD': return monthRange(period);
    case 'QTD': return quarterRange(period, fyStartMonth);
    case 'YTD': { const fy = fyRange(`${period}-01`, fyStartMonth); return { from: fy.from, to: monthRange(period).to }; }
    case 'FY': return fyRange(`${period}-01`, fyStartMonth);
    case 'Custom': return { from: custom?.from || monthRange(period).from, to: custom?.to || monthRange(period).to };
    default: return monthRange(period);
  }
}

export function periodsBetween(range: Range): string[] {
  const out: string[] = [];
  let cur = range.from.slice(0, 7);
  const end = range.to.slice(0, 7);
  while (cur <= end) {
    out.push(cur);
    const [y, m] = cur.split('-').map((x) => parseInt(x, 10));
    const d = new Date(y, m, 1);
    cur = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (out.length > 60) break;
  }
  return out;
}

export { periodCodeOf };
