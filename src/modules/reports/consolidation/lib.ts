// Consolidation engine: group helpers, rate resolution, translation, eliminations, consolidated
// statements, legal-books verification and intercompany posting/matching. Pure functions over the
// store; every write goes through db/engine so audit + notifications behave like other modules.
// Legal-company ledgers are only ever READ here (FR-RPT-012, FR-CNS-004/006, FR-FX-014) — the single
// exception is postIntercompany(), which posts a balanced journal in EACH company (FR-ORG-011/012).
import { db, C, engine, IDS, ValidationError } from '../../../store';
import type { Account, AccountGroup, Branch, Company, Journal, ID } from '../../../store';
import { round, today, uid, addDays } from '../../../lib/format';
import { fyRange } from '../compute';
import type {
  Group, GroupMember, ConsolidationRun, RunCompany, RateInfo, TranslatedLine, Elimination, ConsolidationJournal,
  ConsolidationJournalLine, BooksSnapshot, IntercompanyDoc, IcDocType, RateType, RunStatus,
} from './types';

// ── Consolidation-only accounts (exist in no legal company) ─────────────────

export const CONSOL_ACCOUNTS: { code: string; name: string; type: TranslatedLine['type']; groupCode: string; groupName: string }[] = [
  { code: 'CTA', name: 'Foreign currency translation reserve (CTA)', type: 'Equity', groupCode: 'EQ', groupName: 'Equity' },
  { code: 'NCI', name: 'Non-controlling interests', type: 'Equity', groupCode: 'EQ', groupName: 'Equity' },
  { code: 'GW', name: 'Goodwill on consolidation', type: 'Asset', groupCode: 'FA', groupName: 'Fixed Assets' },
  { code: 'INVA', name: 'Investment in associates (equity method)', type: 'Asset', groupCode: 'FA', groupName: 'Fixed Assets' },
  { code: 'CACC', name: 'Consolidation accruals & provisions', type: 'Liability', groupCode: 'CL', groupName: 'Current Liabilities' },
  { code: 'SOPA', name: 'Share of profit of associates', type: 'Income', groupCode: 'OI', groupName: 'Other Income' },
  { code: 'ICFX', name: 'Exchange difference on intercompany balances', type: 'Expense', groupCode: 'FIN', groupName: 'Finance Costs' },
  { code: 'URP', name: 'Unrealised profit in intercompany stock', type: 'Expense', groupCode: 'COGS', groupName: 'Cost of Goods Sold' },
];

export const GROUP_ORDER = ['CA', 'FA', 'CL', 'NCL', 'EQ', 'REV', 'OI', 'COGS', 'OPEX', 'FIN'];

// ── Company / chart helpers ───────────────────────────────────────────────

export function tenantCompanies(): Company[] {
  const tenantId = engine.ctx().company?.tenantId ?? IDS.tenant;
  return db.where<Company>(C.companies, (c) => c.tenantId === tenantId);
}

export function companyOf(id?: ID): Company | undefined {
  return db.find<Company>(C.companies, id);
}

export function companyName(id?: ID): string {
  const c = companyOf(id);
  return c?.tradeName ?? c?.legalName ?? id ?? '—';
}

export function defaultBranch(companyId: ID): Branch | undefined {
  const bs = db.where<Branch>(C.branches, (b) => b.companyId === companyId && b.status === 'Active');
  return bs.find((b) => b.isDefault) ?? bs[0];
}

export function accountsOf(companyId: ID): Account[] {
  return db.where<Account>(C.accounts, (a) => a.companyId === companyId).sort((a, b) => a.code.localeCompare(b.code));
}

export function groupsOf(companyId: ID): AccountGroup[] {
  return db.where<AccountGroup>(C.accountGroups, (g) => g.companyId === companyId).sort((a, b) => a.order - b.order);
}

export function activeGroup(): Group | undefined {
  const tenantId = engine.ctx().company?.tenantId ?? IDS.tenant;
  return db.where<Group>(C.groups, (g) => g.tenantId === tenantId && g.status === 'Active')[0] ?? db.get<Group>(C.groups)[0];
}

/** Union chart across the group (keyed by account code) + consolidation-only accounts. */
export function consolidatedChart(group: Group | undefined): { code: string; name: string; type: TranslatedLine['type']; groupCode: string; groupName: string; companyIds: ID[] }[] {
  const map = new Map<string, { code: string; name: string; type: TranslatedLine['type']; groupCode: string; groupName: string; companyIds: ID[] }>();
  (group?.members ?? []).forEach((m) => {
    const groups = groupsOf(m.companyId);
    accountsOf(m.companyId).forEach((a) => {
      const g = groups.find((x) => x.id === a.groupId);
      const ex = map.get(a.code);
      if (ex) ex.companyIds.push(m.companyId);
      else map.set(a.code, { code: a.code, name: a.name.replace(/ — Acme (Gulf|India)$/, ''), type: a.type, groupCode: g?.code ?? 'OTHER', groupName: g?.name ?? 'Other', companyIds: [m.companyId] });
    });
  });
  CONSOL_ACCOUNTS.forEach((c) => { if (!map.has(c.code)) map.set(c.code, { ...c, companyIds: [] }); });
  return Array.from(map.values()).sort((a, b) => a.code.localeCompare(b.code));
}

export function memberActiveIn(m: GroupMember, from: string, to: string): boolean {
  return m.from <= to && (!m.to || m.to >= from);
}

// ── Balances (read-only over legal books) ───────────────────────────────────

/** Dr-positive closing balance at `to`. */
export function drClosing(acc: Account, to: string): number {
  const b = engine.accountBalance(acc.id, { to, companyId: acc.companyId });
  return round(acc.normalBalance === 'Dr' ? b.net : -b.net);
}

/** Dr-positive movement within [from, to]. */
export function drMovement(acc: Account, from: string, to: string): number {
  const b = engine.accountBalance(acc.id, { from, to, companyId: acc.companyId });
  return round(b.dr - b.cr);
}

export interface BooksCheck { companyId: ID; accounts: number; journals: number; totalDr: number; totalCr: number; difference: number; balanced: boolean; asOf: string }

/** Independent balancing check of one legal company's trial balance (FR-CNS-001). */
export function booksCheck(companyId: ID, asOf = today()): BooksCheck {
  const accounts = accountsOf(companyId);
  let totalDr = 0, totalCr = 0;
  accounts.forEach((a) => {
    const v = drClosing(a, asOf);
    if (v > 0) totalDr += v; else totalCr += -v;
  });
  const journals = db.count(C.journals, (j) => j.companyId === companyId && (j.status === 'Posted' || j.status === 'Reversed'));
  const difference = round(totalDr - totalCr);
  return { companyId, accounts: accounts.length, journals, totalDr: round(totalDr), totalCr: round(totalCr), difference, balanced: Math.abs(difference) < 0.011, asOf };
}

/** Fingerprint of a company's legal books used by the "legal books untouched" panel (FR-CNS-006). */
export function booksSnapshot(companyId: ID): BooksSnapshot {
  const js = db.where<Journal>(C.journals, (j) => j.companyId === companyId && (j.status === 'Posted' || j.status === 'Reversed'));
  return {
    companyId,
    journals: js.length,
    totalDr: round(js.reduce((s, j) => s + j.totalDr, 0)),
    totalCr: round(js.reduce((s, j) => s + j.totalCr, 0)),
    lastPostedAt: js.map((j) => j.postedAt ?? j.createdAt).sort().pop(),
    at: new Date().toISOString(),
  };
}

// ── Rates (FR-FX-014, FR-RPT-013) ───────────────────────────────────────────

function info(r: ReturnType<typeof engine.resolveRate>, note?: string): RateInfo {
  return { rate: r.rate, type: r.type, source: r.source, at: r.at, note };
}

export function resolveCompanyRates(base: string, target: string, range: { from: string; to: string }, historicalDate: string): { closing: RateInfo; average: RateInfo; historical: RateInfo } {
  if (base === target) {
    const same: RateInfo = { rate: 1, type: 'Same currency', source: '—', at: range.to };
    return { closing: same, average: same, historical: same };
  }
  let closing = info(engine.resolveRate(base, target, range.to, 'Closing'));
  if (!closing.rate) closing = info(engine.resolveRate(base, target, range.to), 'No closing rate published for the period end — latest spot rate used');
  let average = info(engine.resolveRate(base, target, range.to, 'Average'));
  if (!average.rate) {
    const a = engine.resolveRate(base, target, range.from);
    const b = engine.resolveRate(base, target, range.to);
    if (a.rate && b.rate) average = { rate: round((a.rate + b.rate) / 2, 4), type: 'Average (derived)', source: `Mean of ${a.type} ${a.rate} and ${b.type} ${b.rate}`, at: range.to, note: 'No average rate published — mean of spot at start and end of range' };
    else average = info(b, 'No average rate published — spot at period end used');
  }
  let historical = info(engine.resolveRate(base, target, historicalDate, 'Historical'));
  if (!historical.rate) historical = info(engine.resolveRate(base, target, historicalDate), `No historical rate on ${historicalDate} — spot at ownership date used`);
  if (!historical.rate) historical = { ...closing, note: 'No rate at ownership date — closing rate used' };
  return { closing, average, historical };
}

export function buildRunCompanies(group: Group, range: { from: string; to: string }, includeIds?: ID[]): RunCompany[] {
  return group.members.filter((m) => memberActiveIn(m, range.from, range.to)).map((m) => {
    const co = companyOf(m.companyId);
    const base = co?.baseCurrency ?? 'INR';
    const r = resolveCompanyRates(base, group.consolidationCurrency, range, m.from);
    return {
      companyId: m.companyId,
      companyName: companyName(m.companyId),
      baseCurrency: base,
      ownershipPct: m.ownershipPct,
      method: m.method,
      ownershipFrom: m.from,
      ownershipTo: m.to,
      included: includeIds ? includeIds.includes(m.companyId) : true,
      rateClosing: r.closing,
      rateAverage: r.average,
      rateHistorical: r.historical,
      ratesSource: base === group.consolidationCurrency ? 'Same currency' : Array.from(new Set([r.closing.source, r.average.source, r.historical.source])).join(' · '),
    };
  });
}

function rateTypeFor(acc: { code: string; type: TranslatedLine['type'] }, policy: Group['ratePolicy']): RateType {
  const o = policy.accountOverrides?.[acc.code];
  if (o) return o;
  if (acc.type === 'Income' || acc.type === 'Expense') return policy.income;
  if (acc.type === 'Equity') return policy.equity;
  return policy.balance;
}

function rateOf(rc: RunCompany, t: RateType): number {
  return t === 'Average' ? rc.rateAverage.rate : t === 'Historical' ? rc.rateHistorical.rate : rc.rateClosing.rate;
}

// ── Translation (FR-RPT-012/013, FR-CNS-003) ────────────────────────────────

export function translate(run: ConsolidationRun, group: Group): { lines: TranslatedLine[]; cta: number; ctaByCompany: Record<ID, number>; totals: Record<string, number> } {
  const lines: TranslatedLine[] = [];
  const ctaByCompany: Record<ID, number> = {};
  run.companies.filter((rc) => rc.included).forEach((rc) => {
    const co = companyOf(rc.companyId);
    const fyFrom = fyRange(run.to, co?.fiscalYearStartMonth ?? 4).from;
    const plFrom = run.plBasis === 'Period' ? run.from : fyFrom;
    const groups = groupsOf(rc.companyId);
    const same = rc.baseCurrency === run.currency;
    const factor = rc.method === 'Proportional' ? rc.ownershipPct / 100 : 1;
    const push = (l: Omit<TranslatedLine, 'id' | 'companyId' | 'sourceCurrency' | 'translatedAmount' | 'ownershipFactor'> & { sourceAmount: number }) => {
      if (Math.abs(l.sourceAmount) < 0.005) return;
      const src = round(l.sourceAmount * factor);
      lines.push({ ...l, id: uid('tl'), companyId: rc.companyId, sourceCurrency: rc.baseCurrency, sourceAmount: src, ownershipFactor: factor, rateType: same ? 'Same' : l.rateType, translatedAmount: round(src * (same ? 1 : l.rate)) });
    };
    const accounts = accountsOf(rc.companyId);
    let pnlNet = 0, netAssets = 0;
    if (rc.method === 'Equity') {
      // Equity method: one line for the investment (net assets × %) and one for share of profit; no line-by-line inclusion.
      const pct = rc.ownershipPct / 100;
      accounts.forEach((a) => {
        if (a.type === 'Income' || a.type === 'Expense') pnlNet += drMovement(a, plFrom, run.to);
        else netAssets += drClosing(a, run.to);
      });
      const inv = round(netAssets * pct);
      const sop = round(pnlNet * pct);
      push({ accountCode: 'INVA', accountName: 'Investment in associates (equity method)', type: 'Asset', groupCode: 'FA', groupName: 'Fixed Assets', sourceAmount: inv, rateType: 'Closing', rate: rc.rateClosing.rate, note: `${rc.ownershipPct}% of net assets` });
      push({ accountCode: 'SOPA', accountName: 'Share of profit of associates', type: 'Income', groupCode: 'OI', groupName: 'Other Income', sourceAmount: sop, rateType: 'Average', rate: rc.rateAverage.rate, note: `${rc.ownershipPct}% of net profit` });
      push({ accountCode: '3100', accountName: 'Retained Earnings', type: 'Equity', groupCode: 'EQ', groupName: 'Equity', sourceAmount: round(-(inv + sop)), rateType: 'Historical', rate: rc.rateHistorical.rate, note: 'Equity-method balancing (cost of investment)' });
    } else {
      let priorPnl = 0, ytdPre = 0;
      accounts.forEach((a) => {
        const g = groups.find((x) => x.id === a.groupId);
        const rt = rateTypeFor(a, group.ratePolicy);
        const isPl = a.type === 'Income' || a.type === 'Expense';
        let src: number;
        if (isPl) {
          src = drMovement(a, plFrom, run.to);
          priorPnl += drClosing(a, addDays(fyFrom, -1));
          if (run.plBasis === 'Period') ytdPre += drMovement(a, fyFrom, addDays(run.from, -1));
        } else src = drClosing(a, run.to);
        push({ accountId: a.id, accountCode: a.code, accountName: a.name, type: a.type, groupCode: g?.code ?? 'OTHER', groupName: g?.name ?? 'Other', sourceAmount: src, rateType: rt, rate: rateOf(rc, rt) });
      });
      if (Math.abs(priorPnl) >= 0.005) push({ accountCode: '3190', accountName: 'Retained earnings — prior years (unappropriated)', type: 'Equity', groupCode: 'EQ', groupName: 'Equity', sourceAmount: priorPnl, rateType: group.ratePolicy.equity, rate: rateOf(rc, group.ratePolicy.equity), note: 'Net P&L movement before the current financial year' });
      if (Math.abs(ytdPre) >= 0.005) push({ accountCode: '3191', accountName: 'Retained earnings — current year to date (pre-period)', type: 'Equity', groupCode: 'EQ', groupName: 'Equity', sourceAmount: ytdPre, rateType: group.ratePolicy.income, rate: rateOf(rc, group.ratePolicy.income), note: 'P&L of earlier periods in this financial year' });
    }
    ctaByCompany[rc.companyId] = round(lines.filter((l) => l.companyId === rc.companyId).reduce((s, l) => s + l.translatedAmount, 0));
  });
  const cta = round(Object.values(ctaByCompany).reduce((s, v) => s + v, 0));
  const totals: Record<string, number> = {};
  lines.forEach((l) => { totals[l.groupCode] = round((totals[l.groupCode] ?? 0) + l.translatedAmount); });
  return { lines, cta, ctaByCompany, totals };
}

// ── Intercompany account mapping ─────────────────────────────────────────────

export interface IcAccounts { receivable?: Account; payable?: Account; sales?: Account; purchases?: Account; bank?: Account; income?: Account; expense?: Account }

const IC_MAP: Record<string, Record<keyof IcAccounts, string>> = {
  [IDS.acme]: { receivable: 'acc_1170', payable: 'acc_2170', sales: 'acc_4020', purchases: 'acc_5010', bank: 'acc_1310', income: 'acc_4100', expense: 'acc_5590' },
  [IDS.gulf]: { receivable: 'acc_gulf_ic_recv', payable: 'acc_gulf_ic_pay', sales: 'acc_g_4000', purchases: 'acc_g_5010', bank: 'acc_g_1310', income: 'acc_g_4100', expense: 'acc_g_5590' },
};

/** Intercompany accounts of a company: explicit map first, then by code/name (defensive for companies added later). */
export function icAccountsFor(companyId: ID): IcAccounts {
  const accs = accountsOf(companyId);
  const byId = (id?: string) => (id ? accs.find((a) => a.id === id) : undefined);
  const byCode = (code: string) => accs.find((a) => a.code === code && a.status === 'Active');
  const byName = (re: RegExp) => accs.find((a) => re.test(a.name) && a.status === 'Active');
  const m = IC_MAP[companyId];
  return {
    receivable: byId(m?.receivable) ?? byCode('1170') ?? byName(/intercompany receivable/i),
    payable: byId(m?.payable) ?? byCode('2170') ?? byName(/intercompany payable/i),
    sales: byId(m?.sales) ?? byCode('4020') ?? byCode('4000') ?? byName(/sales/i),
    purchases: byId(m?.purchases) ?? byCode('5010') ?? byName(/purchases/i),
    bank: byId(m?.bank) ?? accs.find((a) => a.isBank && a.status === 'Active' && a.currencyBehaviour !== 'Fixed'),
    income: byId(m?.income) ?? byCode('4100') ?? byName(/other income/i),
    expense: byId(m?.expense) ?? byCode('5590') ?? byName(/miscellaneous/i),
  };
}

// ── Eliminations (FR-CNS-006) ───────────────────────────────────────────────

function icDocsBetween(a: ID, b: ID, to: string): IntercompanyDoc[] {
  return db.where<IntercompanyDoc>(C.intercompanyDocs, (d) => ((d.fromCompanyId === a && d.toCompanyId === b) || (d.fromCompanyId === b && d.toCompanyId === a)) && d.date <= to);
}

/** Propose intercompany eliminations for every ordered company pair in the run, based on IC account balances. */
export function proposeEliminations(run: ConsolidationRun): Elimination[] {
  const out: Elimination[] = [];
  const cos = run.companies.filter((c) => c.included && c.method !== 'Equity');
  const now = new Date().toISOString();
  for (const from of cos) {
    for (const to of cos) {
      if (from.companyId === to.companyId) continue;
      const fa = icAccountsFor(from.companyId), ta = icAccountsFor(to.companyId);
      if (!fa.receivable || !ta.payable) continue;
      const recv = drClosing(fa.receivable, run.to); // Dr-positive in from-base
      const pay = -drClosing(ta.payable, run.to); // Cr-positive in to-base
      if (Math.abs(recv) < 0.005 && Math.abs(pay) < 0.005) continue;
      const docs = icDocsBetween(from.companyId, to.companyId, run.to);
      const unmatched = docs.filter((d) => d.matchStatus === 'Unmatched').length;
      const diffs = docs.filter((d) => d.matchStatus === 'Difference').length;
      const crAmount = round(recv * from.rateClosing.rate);
      const drAmount = round(pay * to.rateClosing.rate);
      const fx = round(drAmount - crAmount);
      out.push({
        id: uid('elim'), pairRef: `${from.companyId.replace(/^co_/, '').toUpperCase()}↔${to.companyId.replace(/^co_/, '').toUpperCase()}`, kind: 'Intercompany balance',
        description: `Eliminate ${companyName(from.companyId)} receivable from ${companyName(to.companyId)} against ${companyName(to.companyId)} payable`,
        drCompanyId: to.companyId, drAccountCode: ta.payable.code, drAccountName: ta.payable.name, drAmount,
        crCompanyId: from.companyId, crAccountCode: fa.receivable.code, crAccountName: fa.receivable.name, crAmount,
        fxDifference: fx, differenceAccountCode: diffs ? 'ICFX' : 'CTA', amount: Math.max(drAmount, crAmount),
        sourceDocs: docs.map((d) => ({ id: d.id, number: d.number, type: d.type, date: d.date, amount: d.amount, currency: d.currency, matchStatus: d.matchStatus })),
        status: 'Proposed', reversible: true, actedAt: now,
        warning: unmatched ? `${unmatched} unmatched intercompany document(s) — balances may not agree` : diffs ? `${diffs} document(s) with unexplained differences — difference booked to ${CONSOL_ACCOUNTS.find((c) => c.code === 'ICFX')?.name}` : Math.abs(fx) > 0.005 ? `Translation difference ${fx > 0 ? '+' : ''}${fx} ${run.currency} booked to CTA` : undefined,
      });
      // intercompany trading (sales/purchases) for invoices in the P&L range
      const co = companyOf(from.companyId);
      const plFrom = run.plBasis === 'Period' ? run.from : fyRange(run.to, co?.fiscalYearStartMonth ?? 4).from;
      const inv = docs.filter((d) => d.type === 'Invoice' && d.fromCompanyId === from.companyId && d.date >= plFrom && d.matchStatus !== 'Unmatched');
      if (inv.length && fa.sales && ta.purchases) {
        const sales = round(inv.reduce((s, d) => s + d.baseAmountFrom, 0) * from.rateAverage.rate);
        const purch = round(inv.reduce((s, d) => s + d.baseAmountTo, 0) * to.rateAverage.rate);
        out.push({
          id: uid('elim'), pairRef: `${from.companyId.replace(/^co_/, '').toUpperCase()}→${to.companyId.replace(/^co_/, '').toUpperCase()}`, kind: 'Intercompany trading',
          description: `Eliminate intercompany sales of ${companyName(from.companyId)} against purchases of ${companyName(to.companyId)} (${inv.length} invoice${inv.length > 1 ? 's' : ''})`,
          drCompanyId: from.companyId, drAccountCode: fa.sales.code, drAccountName: fa.sales.name, drAmount: sales,
          crCompanyId: to.companyId, crAccountCode: ta.purchases.code, crAccountName: ta.purchases.name, crAmount: purch,
          fxDifference: round(sales - purch), differenceAccountCode: 'CTA', amount: Math.max(sales, purch),
          sourceDocs: inv.map((d) => ({ id: d.id, number: d.number, type: d.type, date: d.date, amount: d.amount, currency: d.currency, matchStatus: d.matchStatus })),
          status: 'Proposed', reversible: true, actedAt: now,
        });
      }
    }
  }
  return out;
}

// ── Consolidated statement (FR-RPT-012/014) ─────────────────────────────────

export interface StmtRow {
  code: string; name: string; type: TranslatedLine['type']; groupCode: string; groupName: string;
  byCompany: Record<ID, number>; accountIds: Record<ID, ID | undefined>; eliminations: number; adjustments: number; consolidated: number;
}

export function consolidatedRows(run: ConsolidationRun): StmtRow[] {
  const map = new Map<string, StmtRow>();
  const chart = consolidatedChart(db.find<Group>(C.groups, run.groupId));
  const row = (code: string, name?: string, type?: TranslatedLine['type'], groupCode?: string, groupName?: string) => {
    let r = map.get(code);
    if (!r) {
      const c = chart.find((x) => x.code === code) ?? CONSOL_ACCOUNTS.find((x) => x.code === code);
      r = { code, name: name ?? c?.name ?? code, type: type ?? c?.type ?? 'Asset', groupCode: groupCode ?? c?.groupCode ?? 'OTHER', groupName: groupName ?? c?.groupName ?? 'Other', byCompany: {}, accountIds: {}, eliminations: 0, adjustments: 0, consolidated: 0 };
      map.set(code, r);
    }
    return r;
  };
  run.translatedLines.forEach((l) => {
    const r = row(l.accountCode, l.accountName.replace(/ — Acme (Gulf|India)$/, ''), l.type, l.groupCode, l.groupName);
    r.byCompany[l.companyId] = round((r.byCompany[l.companyId] ?? 0) + l.translatedAmount);
    if (l.accountId) r.accountIds[l.companyId] = l.accountId;
  });
  Object.entries(run.ctaByCompany ?? {}).forEach(([cid, v]) => { if (Math.abs(v) >= 0.005) { const r = row('CTA'); r.byCompany[cid] = round(-v); } });
  run.eliminations.filter((e) => e.status === 'Accepted').forEach((e) => {
    row(e.drAccountCode, e.drAccountName).eliminations = round(row(e.drAccountCode).eliminations + e.drAmount);
    row(e.crAccountCode, e.crAccountName).eliminations = round(row(e.crAccountCode).eliminations - e.crAmount);
    if (Math.abs(e.fxDifference) >= 0.005) row(e.differenceAccountCode).eliminations = round(row(e.differenceAccountCode).eliminations - e.fxDifference);
  });
  db.where<ConsolidationJournal>(C.consolidationJournals, (j) => j.runId === run.id && (j.status === 'Posted' || j.status === 'Approved')).forEach((j) => {
    j.lines.forEach((l) => { const r = row(l.accountCode, l.accountName); r.adjustments = round(r.adjustments + l.dr - l.cr); });
  });
  const order = (g: string) => { const i = GROUP_ORDER.indexOf(g); return i < 0 ? 99 : i; };
  return Array.from(map.values()).map((r) => ({ ...r, consolidated: round(Object.values(r.byCompany).reduce((s, v) => s + v, 0) + r.eliminations + r.adjustments) }))
    .filter((r) => Object.values(r.byCompany).some((v) => v !== 0) || r.eliminations !== 0 || r.adjustments !== 0)
    .sort((a, b) => order(a.groupCode) - order(b.groupCode) || a.code.localeCompare(b.code));
}

/** Present a Dr-positive figure the way a statement reader expects it (income / liabilities / equity as positive credits). */
export function presentSign(type: TranslatedLine['type']): 1 | -1 {
  return type === 'Asset' || type === 'Expense' ? 1 : -1;
}

// ── Run lifecycle ───────────────────────────────────────────────────────────

function log(run: ConsolidationRun, action: string, detail?: string) {
  return [...(run.log ?? []), { at: new Date().toISOString(), by: engine.ctx().userName, action, detail }];
}

export function nextRunNumber(period: string): string {
  const n = db.count(C.consolidationRuns) + 1;
  return `CNS/${period}/${String(n).padStart(2, '0')}`;
}

export function createRun(input: { group: Group; period?: string; from: string; to: string; plBasis: 'YTD' | 'Period'; companies: RunCompany[]; translateNow: boolean; supersedesId?: string }): ConsolidationRun {
  const { group } = input;
  if (input.from > input.to) throw new ValidationError('Range start must be before range end', 'VALIDATION', 'from');
  if (!input.companies.some((c) => c.included)) throw new ValidationError('Include at least one company', 'VALIDATION', 'companies');
  input.companies.filter((c) => c.included).forEach((c) => { if (!c.rateClosing.rate || !c.rateAverage.rate || !c.rateHistorical.rate) throw new ValidationError(`${c.companyName}: no ${c.baseCurrency}→${group.consolidationCurrency} rate could be resolved — add one under Accounting › Currencies & FX or enter an override`, 'RATE_MISSING'); });
  const supersedes = db.find<ConsolidationRun>(C.consolidationRuns, input.supersedesId);
  const periodKey = input.period ?? `${input.from.slice(0, 7)}..${input.to.slice(0, 7)}`;
  return db.transaction(() => {
    const run = db.insert<ConsolidationRun>(C.consolidationRuns, {
      companyId: group.parentCompanyId,
      groupId: group.id, number: supersedes ? supersedes.number : nextRunNumber(periodKey), period: input.period, from: input.from, to: input.to, plBasis: input.plBasis,
      currency: group.consolidationCurrency, accountingStandard: group.accountingStandard, status: 'Draft', runVersion: supersedes ? supersedes.runVersion + 1 : 1, supersedesId: supersedes?.id,
      companies: input.companies, translatedLines: [], cta: 0, ctaByCompany: {}, adjustments: [], eliminations: [], totals: {}, createdBy: engine.ctx().userName, booksAtTranslate: [],
      log: [{ at: new Date().toISOString(), by: engine.ctx().userName, action: 'Created', detail: supersedes ? `Version ${supersedes.runVersion + 1} of ${supersedes.number}` : `${group.name} · ${periodKey} · ${group.consolidationCurrency}` }],
    });
    if (supersedes) db.update<ConsolidationRun>(C.consolidationRuns, supersedes.id, { supersededById: run.id });
    engine.audit({ action: 'consolidation.run.created', objectType: 'Consolidation Run', objectId: run.id, objectNumber: run.number, detail: `${group.name} · ${periodKey} · v${run.runVersion}` });
    return input.translateNow ? translateRun(run.id) : run;
  });
}

export function translateRun(runId: ID, reason?: string): ConsolidationRun {
  const run = db.find<ConsolidationRun>(C.consolidationRuns, runId);
  const group = db.find<Group>(C.groups, run?.groupId);
  if (!run || !group) throw new ValidationError('Run not found', 'NOT_FOUND');
  if (run.status === 'Final' || run.status === 'Reversed') throw new ValidationError(`A ${run.status.toLowerCase()} run cannot be re-translated — create a new version instead`, 'INVALID_STATE');
  const t = translate(run, group);
  const manual = run.eliminations.filter((e) => e.kind === 'Manual' || e.kind === 'Unrealised profit');
  const eliminations = [...proposeEliminations({ ...run, translatedLines: t.lines }), ...manual];
  const books = run.companies.filter((c) => c.included).map((c) => booksSnapshot(c.companyId));
  const hasAdj = db.count(C.consolidationJournals, (j) => j.runId === run.id && j.status === 'Posted') > 0;
  const out = db.update<ConsolidationRun>(C.consolidationRuns, run.id, {
    translatedLines: t.lines, cta: t.cta, ctaByCompany: t.ctaByCompany, totals: t.totals, eliminations, booksAtTranslate: books,
    status: hasAdj ? 'Adjusted' : 'Translated', translatedAt: new Date().toISOString(),
    log: log(run, run.translatedAt ? 'Re-translated' : 'Translated', `${t.lines.length} lines · CTA ${t.cta} ${run.currency}${reason ? ' · ' + reason : ''}`),
  });
  engine.audit({ action: 'consolidation.run.translated', objectType: 'Consolidation Run', objectId: run.id, objectNumber: run.number, detail: `${t.lines.length} lines · CTA ${t.cta} ${run.currency} · legal books read-only${reason ? ' · ' + reason : ''}` });
  return out;
}

export function overrideRate(runId: ID, companyId: ID, which: 'rateClosing' | 'rateAverage' | 'rateHistorical', rate: number, reason: string): ConsolidationRun {
  const run = db.find<ConsolidationRun>(C.consolidationRuns, runId);
  if (!run) throw new ValidationError('Run not found', 'NOT_FOUND');
  if (run.status === 'Final' || run.status === 'Reversed') throw new ValidationError('Rates of a final run cannot change', 'INVALID_STATE');
  if (!(rate > 0)) throw new ValidationError('Rate must be positive', 'VALIDATION', 'rate');
  if (reason.trim().length < 10) throw new ValidationError('A reason of at least 10 characters is required', 'VALIDATION', 'reason');
  const companies = run.companies.map((c) => c.companyId === companyId ? { ...c, [which]: { ...c[which], rate, type: 'Manual override', source: `Override by ${engine.ctx().userName}`, at: new Date().toISOString(), overridden: { original: c[which].overridden?.original ?? c[which].rate, reason, by: engine.ctx().userName, at: new Date().toISOString() } } as RateInfo } : c);
  const out = db.update<ConsolidationRun>(C.consolidationRuns, run.id, { companies, log: log(run, 'Rate override', `${companyName(companyId)} ${which.replace('rate', '')} → ${rate}: ${reason}`) });
  engine.audit({ action: 'consolidation.rate.override', objectType: 'Consolidation Run', objectId: run.id, objectNumber: run.number, detail: `${companyName(companyId)} ${which.replace('rate', '').toLowerCase()} rate ${rate} — ${reason}` });
  return out;
}

export function setEliminationStatus(runId: ID, elimId: ID, status: Elimination['status'], reason?: string): ConsolidationRun {
  const run = db.find<ConsolidationRun>(C.consolidationRuns, runId);
  if (!run) throw new ValidationError('Run not found', 'NOT_FOUND');
  if (run.status === 'Final' || run.status === 'Reversed') throw new ValidationError(`Eliminations of a ${run.status.toLowerCase()} run are frozen — create a new version`, 'INVALID_STATE');
  const e = run.eliminations.find((x) => x.id === elimId);
  if (!e) throw new ValidationError('Elimination not found', 'NOT_FOUND');
  if ((status === 'Reversed' || status === 'Rejected') && !(reason && reason.trim().length >= 10)) throw new ValidationError('A reason is required', 'VALIDATION', 'reason');
  const eliminations = run.eliminations.map((x) => x.id === elimId ? { ...x, status, reason: reason ?? x.reason, actedBy: engine.ctx().userName, actedAt: new Date().toISOString() } : x);
  const out = db.update<ConsolidationRun>(C.consolidationRuns, run.id, { eliminations, status: run.status === 'Translated' && status === 'Accepted' ? 'Adjusted' : run.status, log: log(run, `Elimination ${status.toLowerCase()}`, `${e.pairRef} · ${e.description}${reason ? ' · ' + reason : ''}`) });
  engine.audit({ action: `consolidation.elimination.${status.toLowerCase()}`, objectType: 'Consolidation Run', objectId: run.id, objectNumber: run.number, detail: `${e.pairRef} · ${e.amount} ${run.currency}${reason ? ' · ' + reason : ''}` });
  return out;
}

export function addManualElimination(runId: ID, input: { kind: Elimination['kind']; description: string; drAccountCode: string; crAccountCode: string; amount: number; reason: string }): ConsolidationRun {
  const run = db.find<ConsolidationRun>(C.consolidationRuns, runId);
  if (!run) throw new ValidationError('Run not found', 'NOT_FOUND');
  if (run.status === 'Final' || run.status === 'Reversed') throw new ValidationError('Run is frozen', 'INVALID_STATE');
  if (!(input.amount > 0)) throw new ValidationError('Amount must be positive', 'VALIDATION', 'amount');
  if (input.drAccountCode === input.crAccountCode) throw new ValidationError('Debit and credit accounts must differ', 'VALIDATION', 'crAccountCode');
  const chart = consolidatedChart(db.find<Group>(C.groups, run.groupId));
  const dr = chart.find((c) => c.code === input.drAccountCode), cr = chart.find((c) => c.code === input.crAccountCode);
  const e: Elimination = { id: uid('elim'), pairRef: 'MANUAL', kind: input.kind, description: input.description, drAccountCode: input.drAccountCode, drAccountName: dr?.name ?? input.drAccountCode, drAmount: input.amount, crAccountCode: input.crAccountCode, crAccountName: cr?.name ?? input.crAccountCode, crAmount: input.amount, fxDifference: 0, differenceAccountCode: 'CTA', amount: input.amount, sourceDocs: [], status: 'Accepted', reversible: true, reason: input.reason, actedBy: engine.ctx().userName, actedAt: new Date().toISOString() };
  const out = db.update<ConsolidationRun>(C.consolidationRuns, run.id, { eliminations: [...run.eliminations, e], status: run.status === 'Translated' ? 'Adjusted' : run.status, log: log(run, 'Elimination added', `${input.kind}: ${input.description} · ${input.amount} ${run.currency}`) });
  engine.audit({ action: 'consolidation.elimination.added', objectType: 'Consolidation Run', objectId: run.id, objectNumber: run.number, detail: `${input.kind} · ${input.amount} ${run.currency} · ${input.reason}` });
  return out;
}

export function finalizeRun(runId: ID): ConsolidationRun {
  const run = db.find<ConsolidationRun>(C.consolidationRuns, runId);
  if (!run) throw new ValidationError('Run not found', 'NOT_FOUND');
  if (run.status !== 'Translated' && run.status !== 'Adjusted') throw new ValidationError(`Only translated runs can be finalized (status ${run.status})`, 'INVALID_STATE');
  if (run.eliminations.some((e) => e.status === 'Proposed')) throw new ValidationError('Accept or reject every proposed elimination before finalizing', 'PENDING_ELIMINATIONS');
  if (db.count(C.consolidationJournals, (j) => j.runId === run.id && (j.status === 'Submitted' || j.status === 'Returned')) > 0) throw new ValidationError('Consolidation adjustments are still awaiting approval', 'PENDING_APPROVAL');
  const books = run.companies.filter((c) => c.included).map((c) => booksSnapshot(c.companyId));
  const changed = books.filter((b) => { const p = run.booksAtTranslate.find((x) => x.companyId === b.companyId); return p && (p.journals !== b.journals || p.totalDr !== b.totalDr); });
  if (changed.length) throw new ValidationError(`Legal books of ${changed.map((b) => companyName(b.companyId)).join(', ')} changed since translation — re-translate before finalizing`, 'BOOKS_CHANGED');
  const out = db.update<ConsolidationRun>(C.consolidationRuns, run.id, { status: 'Final', finalizedAt: new Date().toISOString(), finalizedBy: engine.ctx().userName, booksAtFinal: books, log: log(run, 'Finalized', `v${run.runVersion} · CTA ${run.cta} ${run.currency}`) });
  engine.audit({ action: 'consolidation.run.finalized', objectType: 'Consolidation Run', objectId: run.id, objectNumber: run.number, detail: `v${run.runVersion} · ${run.translatedLines.length} lines · ${run.eliminations.filter((e) => e.status === 'Accepted').length} eliminations · legal books verified unchanged` });
  engine.notify({ type: 'system', title: `Consolidation ${run.number} v${run.runVersion} finalized`, body: `${run.currency} · CTA ${run.cta}`, link: `reports/consolidation/runs/${run.id}` });
  return out;
}

export function reverseRun(runId: ID, reason: string): ConsolidationRun {
  const run = db.find<ConsolidationRun>(C.consolidationRuns, runId);
  if (!run) throw new ValidationError('Run not found', 'NOT_FOUND');
  if (run.status === 'Reversed') throw new ValidationError('Run is already reversed', 'INVALID_STATE');
  if (reason.trim().length < 10) throw new ValidationError('A reason of at least 10 characters is required', 'VALIDATION', 'reason');
  return db.transaction(() => {
    db.where<ConsolidationJournal>(C.consolidationJournals, (j) => j.runId === run.id && j.status === 'Posted').forEach((j) => db.update<ConsolidationJournal>(C.consolidationJournals, j.id, { status: 'Reversed', reversalReason: reason }));
    const out = db.update<ConsolidationRun>(C.consolidationRuns, run.id, { status: 'Reversed', reversedAt: new Date().toISOString(), reversalReason: reason, eliminations: run.eliminations.map((e) => e.status === 'Accepted' ? { ...e, status: 'Reversed' as const, reason } : e), log: log(run, 'Reversed', reason) });
    engine.audit({ action: 'consolidation.run.reversed', objectType: 'Consolidation Run', objectId: run.id, objectNumber: run.number, detail: reason });
    return out;
  });
}

export function runStatusTone(s: RunStatus): string {
  return s === 'Final' ? 'Posted' : s === 'Translated' ? 'Approved' : s === 'Adjusted' ? 'Partial' : s;
}

// ── Consolidation adjustments (FR-CNS-004) ──────────────────────────────────

export function postAdjustment(runId: ID, input: { date: string; reason: string; lines: Omit<ConsolidationJournalLine, 'id'>[] }): ConsolidationJournal {
  const run = db.find<ConsolidationRun>(C.consolidationRuns, runId);
  if (!run) throw new ValidationError('Run not found', 'NOT_FOUND');
  if (run.status === 'Final' || run.status === 'Reversed') throw new ValidationError(`Adjustments cannot be added to a ${run.status.toLowerCase()} run`, 'INVALID_STATE');
  if (run.status === 'Draft') throw new ValidationError('Translate the run before adding adjustments', 'INVALID_STATE');
  if (input.reason.trim().length < 10) throw new ValidationError('Reason must be at least 10 characters', 'VALIDATION', 'reason');
  const lines = input.lines.filter((l) => l.dr || l.cr).map((l) => ({ ...l, id: uid('cjl'), dr: round(l.dr), cr: round(l.cr) }));
  if (lines.length < 2) throw new ValidationError('At least two lines are required', 'VALIDATION', 'lines');
  const totalDr = round(lines.reduce((s, l) => s + l.dr, 0)), totalCr = round(lines.reduce((s, l) => s + l.cr, 0));
  if (Math.abs(totalDr - totalCr) > 0.011) throw new ValidationError(`Adjustment is not balanced: Dr ${totalDr} ≠ Cr ${totalCr}`, 'UNBALANCED');
  return db.transaction(() => {
    const n = db.count(C.consolidationJournals) + 1;
    const number = `CJ/${run.period ?? run.to.slice(0, 7)}/${String(n).padStart(3, '0')}`;
    const j = db.insert<ConsolidationJournal>(C.consolidationJournals, { companyId: run.companyId, runId: run.id, groupId: run.groupId, number, date: input.date, period: input.date.slice(0, 7), currency: run.currency, reason: input.reason, lines, totalDr, totalCr, status: 'Draft' });
    const req = engine.submitForApproval({ docType: 'Consolidation Adjustment', collection: C.consolidationJournals, docId: j.id, docNumber: number, amount: totalDr, currency: run.currency, summary: input.reason });
    let out: ConsolidationJournal;
    if (req) {
      out = db.update<ConsolidationJournal>(C.consolidationJournals, j.id, { status: 'Submitted', approvalId: req.id, workflowNote: `${req.ruleName} v${req.ruleVersion} · awaiting ${req.steps.find((s) => s.status === 'Pending')?.approverLabel ?? 'approval'}` });
    } else {
      out = db.update<ConsolidationJournal>(C.consolidationJournals, j.id, { status: 'Posted', postedAt: new Date().toISOString(), postedBy: engine.ctx().userName, workflowNote: 'No approval rule for Consolidation Adjustment — posted directly (audited)' });
      db.update<ConsolidationRun>(C.consolidationRuns, run.id, { adjustments: [...run.adjustments, j.id], status: run.status === 'Translated' ? 'Adjusted' : run.status, log: log(run, 'Adjustment posted', `${number} · ${totalDr} ${run.currency} · ${input.reason}`) });
    }
    engine.audit({ action: req ? 'consolidation.adjustment.submitted' : 'consolidation.adjustment.posted', objectType: 'Consolidation Adjustment', objectId: j.id, objectNumber: number, detail: `${run.number} · Dr ${totalDr} / Cr ${totalCr} ${run.currency} · ${input.reason} · not written to legal-company journals` });
    return out;
  });
}

/** Post an adjustment whose approval request has been approved. */
export function postApprovedAdjustment(journalId: ID): ConsolidationJournal {
  const j = db.find<ConsolidationJournal>(C.consolidationJournals, journalId);
  if (!j) throw new ValidationError('Adjustment not found', 'NOT_FOUND');
  if (j.status !== 'Approved') throw new ValidationError(`Adjustment is ${j.status.toLowerCase()} — only approved adjustments can be posted`, 'INVALID_STATE');
  const run = db.find<ConsolidationRun>(C.consolidationRuns, j.runId);
  if (!run || run.status === 'Final' || run.status === 'Reversed') throw new ValidationError('Run is frozen', 'INVALID_STATE');
  return db.transaction(() => {
    const out = db.update<ConsolidationJournal>(C.consolidationJournals, j.id, { status: 'Posted', postedAt: new Date().toISOString(), postedBy: engine.ctx().userName });
    db.update<ConsolidationRun>(C.consolidationRuns, run.id, { adjustments: [...run.adjustments, j.id], status: run.status === 'Translated' ? 'Adjusted' : run.status, log: log(run, 'Adjustment posted', `${j.number} · ${j.totalDr} ${run.currency}`) });
    engine.audit({ action: 'consolidation.adjustment.posted', objectType: 'Consolidation Adjustment', objectId: j.id, objectNumber: j.number, detail: `${run.number} · after approval` });
    return out;
  });
}

export function reverseAdjustment(journalId: ID, reason: string): ConsolidationJournal {
  const j = db.find<ConsolidationJournal>(C.consolidationJournals, journalId);
  if (!j) throw new ValidationError('Adjustment not found', 'NOT_FOUND');
  if (j.status !== 'Posted') throw new ValidationError('Only posted adjustments can be reversed', 'INVALID_STATE');
  if (reason.trim().length < 10) throw new ValidationError('A reason of at least 10 characters is required', 'VALIDATION', 'reason');
  const run = db.find<ConsolidationRun>(C.consolidationRuns, j.runId);
  if (!run || run.status === 'Final' || run.status === 'Reversed') throw new ValidationError('Run is frozen — create a new version', 'INVALID_STATE');
  return db.transaction(() => {
    const rev = db.insert<ConsolidationJournal>(C.consolidationJournals, { companyId: j.companyId, runId: j.runId, groupId: j.groupId, number: `${j.number}-R`, date: today(), period: today().slice(0, 7), currency: j.currency, reason: `Reversal of ${j.number}: ${reason}`, lines: j.lines.map((l) => ({ ...l, id: uid('cjl'), dr: l.cr, cr: l.dr })), totalDr: j.totalCr, totalCr: j.totalDr, status: 'Posted', postedAt: new Date().toISOString(), postedBy: engine.ctx().userName, reversalOfId: j.id });
    const out = db.update<ConsolidationJournal>(C.consolidationJournals, j.id, { status: 'Reversed', reversedById: rev.id, reversalReason: reason });
    db.update<ConsolidationRun>(C.consolidationRuns, run.id, { adjustments: [...run.adjustments, rev.id], log: log(run, 'Adjustment reversed', `${j.number} → ${rev.number}: ${reason}`) });
    engine.audit({ action: 'consolidation.adjustment.reversed', objectType: 'Consolidation Adjustment', objectId: j.id, objectNumber: j.number, detail: reason });
    return out;
  });
}

// ── Intercompany (FR-ORG-011/012, FR-CNS-005) ───────────────────────────────

export const IC_RULE = 'FR-ORG-011: a single transaction, journal or payment batch never mixes legal companies. Intercompany activity is recorded as two balanced journals — one in each company — linked by a counterparty reference with due-to / due-from accounts (FR-ORG-012).';

export function nextIcNumber(date: string): string {
  const n = db.count(C.intercompanyDocs) + 1;
  return `IC/${date.slice(0, 4)}/${String(n).padStart(4, '0')}`;
}

function icLines(side: 'from' | 'to', type: IcDocType, accs: IcAccounts, amount: number): engine.PostLine[] {
  const need = (a: Account | undefined, what: string) => { if (!a) throw new ValidationError(`No ${what} account is configured for this company`, 'INVALID_ACCOUNT'); return a.id; };
  if (type === 'Invoice') return side === 'from' ? [{ accountId: need(accs.receivable, 'intercompany receivable'), dr: amount }, { accountId: need(accs.sales, 'sales'), cr: amount }] : [{ accountId: need(accs.purchases, 'purchases'), dr: amount }, { accountId: need(accs.payable, 'intercompany payable'), cr: amount }];
  if (type === 'Payment') return side === 'from' ? [{ accountId: need(accs.payable, 'intercompany payable'), dr: amount }, { accountId: need(accs.bank, 'bank'), cr: amount }] : [{ accountId: need(accs.bank, 'bank'), dr: amount }, { accountId: need(accs.receivable, 'intercompany receivable'), cr: amount }];
  return side === 'from' ? [{ accountId: need(accs.receivable, 'intercompany receivable'), dr: amount }, { accountId: need(accs.bank, 'bank'), cr: amount }] : [{ accountId: need(accs.bank, 'bank'), dr: amount }, { accountId: need(accs.payable, 'intercompany payable'), cr: amount }];
}

export interface IcInput { type: IcDocType; fromCompanyId: ID; toCompanyId: ID; amount: number; currency: string; date: string; reference?: string; narration?: string; postCounterparty: boolean }

export function postIntercompany(input: IcInput): IntercompanyDoc {
  if (!input.fromCompanyId || !input.toCompanyId) throw new ValidationError('Choose both companies', 'VALIDATION', 'toCompanyId');
  if (input.fromCompanyId === input.toCompanyId) throw new ValidationError('From and to must be different legal companies (FR-ORG-011)', 'SAME_COMPANY', 'toCompanyId');
  const from = companyOf(input.fromCompanyId), to = companyOf(input.toCompanyId);
  if (!from || !to) throw new ValidationError('Company not found', 'NOT_FOUND');
  if (from.tenantId !== to.tenantId) throw new ValidationError('Both companies must belong to this tenant', 'VALIDATION', 'toCompanyId');
  if (!(input.amount > 0)) throw new ValidationError('Amount must be positive', 'VALIDATION', 'amount');
  const fa = icAccountsFor(from.id), ta = icAccountsFor(to.id);
  if (!fa.receivable || !fa.payable) throw new ValidationError(`${companyName(from.id)} has no intercompany receivable/payable accounts`, 'INVALID_ACCOUNT');
  if (!ta.receivable || !ta.payable) throw new ValidationError(`${companyName(to.id)} has no intercompany receivable/payable accounts`, 'INVALID_ACCOUNT');
  const rateFrom = input.currency === from.baseCurrency ? 1 : engine.resolveRate(input.currency, from.baseCurrency, input.date).rate;
  const rateTo = input.currency === to.baseCurrency ? 1 : engine.resolveRate(input.currency, to.baseCurrency, input.date).rate;
  if (!rateFrom) throw new ValidationError(`No ${input.currency}→${from.baseCurrency} rate on ${input.date}`, 'RATE_MISSING', 'currency');
  if (!rateTo) throw new ValidationError(`No ${input.currency}→${to.baseCurrency} rate on ${input.date}`, 'RATE_MISSING', 'currency');
  engine.assertPostable(input.date, from.id);
  if (input.postCounterparty) engine.assertPostable(input.date, to.id);
  const docId = uid('icd');
  const number = nextIcNumber(input.date);
  const ref = input.reference?.trim() || number;
  return db.transaction(() => {
    const narration = `${input.type === 'Invoice' ? 'Intercompany invoice' : input.type === 'Payment' ? 'Intercompany payment' : 'Intercompany funding'} ${ref}: ${companyName(from.id)} → ${companyName(to.id)}${input.narration ? ' · ' + input.narration : ''}`;
    const jf = engine.postJournal({ companyId: from.id, branchId: defaultBranch(from.id)?.id, date: input.date, currency: input.currency, rate: rateFrom, type: 'Auto', sourceType: 'Intercompany', sourceId: docId, sourceNumber: number, narration, lines: icLines('from', input.type, fa, input.amount), idempotencyKey: `${docId}:from` });
    let jt: Journal | undefined;
    if (input.postCounterparty) jt = engine.postJournal({ companyId: to.id, branchId: defaultBranch(to.id)?.id, date: input.date, currency: input.currency, rate: rateTo, type: 'Auto', sourceType: 'Intercompany', sourceId: docId, sourceNumber: number, narration, lines: icLines('to', input.type, ta, input.amount), idempotencyKey: `${docId}:to` });
    const doc = db.insert<IntercompanyDoc>(C.intercompanyDocs, {
      id: docId, companyId: from.id, type: input.type, number, fromCompanyId: from.id, toCompanyId: to.id, date: input.date, currency: input.currency, amount: input.amount,
      baseCurrencyFrom: from.baseCurrency, baseCurrencyTo: to.baseCurrency, rateFrom, rateTo, baseAmountFrom: round(input.amount * rateFrom), baseAmountTo: jt ? round(input.amount * rateTo) : 0,
      counterpartyRef: ref, narration: input.narration, matchStatus: 'Unmatched',
      dueFromAccount: (input.type === 'Payment' ? ta.receivable : fa.receivable)!.id, dueToAccount: (input.type === 'Payment' ? fa.payable : ta.payable)!.id,
      sourceJournalIds: { from: jf.id, to: jt?.id }, sourceJournalNumbers: { from: jf.number, to: jt?.number },
    });
    engine.audit({ action: 'intercompany.posted', objectType: 'Intercompany Document', objectId: doc.id, objectNumber: number, detail: `${input.type} ${companyName(from.id)} → ${companyName(to.id)} ${input.currency} ${input.amount} · ${jf.number}${jt ? ' / ' + jt.number : ' (counterparty pending)'}` });
    engine.notify({ type: 'system', title: `Intercompany ${input.type.toLowerCase()} ${number} recorded`, body: `${companyName(from.id)} → ${companyName(to.id)} · ${input.currency} ${input.amount}`, link: 'accounting/intercompany' });
    return doc;
  });
}

/** Match both sides of an intercompany document (posting the missing counterparty journal first if needed). */
export function matchIntercompany(docId: ID): IntercompanyDoc {
  const doc = db.find<IntercompanyDoc>(C.intercompanyDocs, docId);
  if (!doc) throw new ValidationError('Intercompany document not found', 'NOT_FOUND');
  if (doc.matchStatus === 'Matched') return doc;
  return db.transaction(() => {
    let d = doc;
    if (!d.sourceJournalIds.to) {
      const to = companyOf(d.toCompanyId)!;
      const ta = icAccountsFor(to.id);
      engine.assertPostable(d.date, to.id);
      const jt = engine.postJournal({ companyId: to.id, branchId: defaultBranch(to.id)?.id, date: d.date, currency: d.currency, rate: d.rateTo, type: 'Auto', sourceType: 'Intercompany', sourceId: d.id, sourceNumber: d.number, narration: `Counterparty entry for intercompany ${d.type.toLowerCase()} ${d.counterpartyRef} from ${companyName(d.fromCompanyId)}`, lines: icLines('to', d.type, ta, d.amount), idempotencyKey: `${d.id}:to` });
      d = db.update<IntercompanyDoc>(C.intercompanyDocs, d.id, { sourceJournalIds: { ...d.sourceJournalIds, to: jt.id }, sourceJournalNumbers: { ...(d.sourceJournalNumbers ?? {}), to: jt.number }, baseAmountTo: round(d.amount * d.rateTo) });
    }
    const expectedTo = round(d.amount * d.rateTo);
    const diffTo = round(d.baseAmountTo - expectedTo);
    const tol = Math.max(1, expectedTo * 0.001);
    const status = Math.abs(diffTo) <= tol ? 'Matched' : 'Difference';
    const explanation = [
      `${companyName(d.fromCompanyId)} books: ${d.baseCurrencyFrom} ${d.baseAmountFrom.toLocaleString('en-IN', { minimumFractionDigits: 2 })} (= ${d.currency} ${d.amount} × ${d.rateFrom})`,
      `${companyName(d.toCompanyId)} books: ${d.baseCurrencyTo} ${d.baseAmountTo.toLocaleString('en-IN', { minimumFractionDigits: 2 })} (expected ${d.currency} ${d.amount} × ${d.rateTo} = ${expectedTo.toLocaleString('en-IN', { minimumFractionDigits: 2 })})`,
      status === 'Matched' ? (d.baseCurrencyFrom === d.baseCurrencyTo ? 'Both sides agree in base currency' : 'Both sides agree in transaction currency — any remaining difference arises only from translating each base currency at consolidation and is booked to CTA') : `Unexplained difference ${d.baseCurrencyTo} ${diffTo.toLocaleString('en-IN', { minimumFractionDigits: 2 })} on the ${companyName(d.toCompanyId)} side — proposed as an elimination difference line (${CONSOL_ACCOUNTS.find((c) => c.code === 'ICFX')?.name})`,
    ];
    const out = db.update<IntercompanyDoc>(C.intercompanyDocs, d.id, { matchStatus: status, matchedAt: new Date().toISOString(), matchedBy: engine.ctx().userName, difference: { expectedTo, actualTo: d.baseAmountTo, diffTo, toCurrency: d.baseCurrencyTo, explanation } });
    engine.audit({ action: `intercompany.${status.toLowerCase()}`, objectType: 'Intercompany Document', objectId: d.id, objectNumber: d.number, detail: explanation[2] });
    return out;
  });
}

export interface DueBalance { companyId: ID; counterpartyId: ID; receivable: number; payable: number; currency: string; receivableAccountId?: ID; payableAccountId?: ID }

/** Due-from / due-to balances for every company pair in the tenant (base currency of the reporting company). */
export function dueBalances(asOf = today()): DueBalance[] {
  const cos = tenantCompanies();
  const out: DueBalance[] = [];
  cos.forEach((co) => {
    const accs = icAccountsFor(co.id);
    if (!accs.receivable && !accs.payable) return;
    cos.filter((x) => x.id !== co.id).forEach((cp) => {
      out.push({ companyId: co.id, counterpartyId: cp.id, receivable: accs.receivable ? drClosing(accs.receivable, asOf) : 0, payable: accs.payable ? -drClosing(accs.payable, asOf) : 0, currency: co.baseCurrency, receivableAccountId: accs.receivable?.id, payableAccountId: accs.payable?.id });
    });
  });
  return out;
}

export function sourceJournalsFor(line: { companyId: ID; accountId?: ID }, run: ConsolidationRun): Journal[] {
  if (!line.accountId) return [];
  const co = companyOf(line.companyId);
  const acc = db.find<Account>(C.accounts, line.accountId);
  const isPl = acc?.type === 'Income' || acc?.type === 'Expense';
  const from = isPl ? (run.plBasis === 'Period' ? run.from : fyRange(run.to, co?.fiscalYearStartMonth ?? 4).from) : '0000-01-01';
  return db.where<Journal>(C.journals, (j) => j.companyId === line.companyId && (j.status === 'Posted' || j.status === 'Reversed') && j.date >= from && j.date <= run.to && j.lines.some((l) => l.accountId === line.accountId)).sort((a, b) => b.date.localeCompare(a.date));
}
