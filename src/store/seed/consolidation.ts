// Seed data for group / consolidation / intercompany (FR-CNS-001..006, FR-RPT-012..014, FR-ORG-011/012).
// Owned by the consolidation module. Contains:
//   • the Elixir Insights (AED) chart of accounts, opening balances, 12 posted journals and a number series,
//     so the second legal company has an independently balanced trial balance to consolidate;
//   • AED/INR translation rates (historical / average / closing) used by the runs;
//   • the group definition, two consolidation runs (Jun 2026 Final, Aug 2026 Draft) and
//   • four intercompany documents with mirrored journals in BOTH companies (jv_ic_*).
// Consolidation artefacts never live in C.journals — adjustments go to C.consolidationJournals.
import type { DB } from '../db';
import type { Account, AccountGroup, ExchangeRate, Journal, JournalLine, NumberSeries } from '../types';
import { C } from '../collections';
import { IDS, rec } from './core';
import type { ConsolidationJournal, ConsolidationRun, Group, IntercompanyDoc, RunCompany, TranslatedLine } from '../../modules/reports/consolidation/types';

export const CNS_IDS = {
  group: 'grp_acme',
  runJun: 'cns_run_2026_06',
  runAug: 'cns_run_2026_08',
  adjJun: 'cj_2026_06_001',
  gulfRecv: 'acc_gulf_ic_recv',
  gulfPay: 'acc_gulf_ic_pay',
} as const;

const G = IDS.gulf;
const AT = '2026-09-13T09:00:00.000Z';

// ── Elixir Insights chart of accounts (AED) ────────────────────────────────────────────

const GG = { ca: 'agg_ca', fa: 'agg_fa', cl: 'agg_cl', eq: 'agg_eq', rev: 'agg_rev', oi: 'agg_oi', cogs: 'agg_cogs', opex: 'agg_opex', fin: 'agg_fin' };

function gulfGroups(): AccountGroup[] {
  const g = (id: string, code: string, name: string, type: AccountGroup['type'], order: number) => rec<AccountGroup>(id, { companyId: G, code, name, type, order });
  return [
    g(GG.ca, 'CA', 'Current Assets', 'Asset', 10),
    g(GG.fa, 'FA', 'Fixed Assets', 'Asset', 20),
    g(GG.cl, 'CL', 'Current Liabilities', 'Liability', 30),
    g(GG.eq, 'EQ', 'Equity', 'Equity', 40),
    g(GG.rev, 'REV', 'Revenue', 'Income', 50),
    g(GG.oi, 'OI', 'Other Income', 'Income', 55),
    g(GG.cogs, 'COGS', 'Cost of Goods Sold', 'Expense', 60),
    g(GG.opex, 'OPEX', 'Operating Expenses', 'Expense', 70),
    g(GG.fin, 'FIN', 'Finance Costs', 'Expense', 80),
  ];
}

/** id → [code, name] for journal-line stamping. */
const GACC: Record<string, [string, string]> = {};

function gulfAccounts(): Account[] {
  const acc = (id: string, code: string, name: string, groupId: string, type: Account['type'], extra: Partial<Account> = {}): Account => {
    GACC[id] = [code, name];
    return rec<Account>(id, { companyId: G, code, name, groupId, type, normalBalance: type === 'Asset' || type === 'Expense' ? 'Dr' : 'Cr', isControl: false, postingAllowed: true, currencyBehaviour: 'Base', requiredDimensions: [], prohibitedDimensions: [], status: 'Active', ...extra });
  };
  return [
    acc('acc_g_1100', '1100', 'Trade Receivables (AR Control)', GG.ca, 'Asset', { isControl: true, controlType: 'AR', currencyBehaviour: 'Any', openingBalance: 262000 }),
    acc(CNS_IDS.gulfRecv, '1170', 'Intercompany Receivable — Elixir Business Solution', GG.ca, 'Asset', { currencyBehaviour: 'Any', openingBalance: 0 }),
    acc('acc_g_1200', '1200', 'Inventory — Finished Goods', GG.ca, 'Asset', { isControl: true, controlType: 'Inventory', openingBalance: 184000 }),
    acc('acc_g_1300', '1300', 'Cash on Hand', GG.ca, 'Asset', { isControl: true, controlType: 'Cash', openingBalance: 12000 }),
    acc('acc_g_1310', '1310', 'Emirates NBD Current Account ****7742', GG.ca, 'Asset', { isControl: true, controlType: 'Bank', isBank: true, openingBalance: 418000, bankDetails: { bankName: 'Emirates NBD', accountNumber: '1024567742001', ifsc: 'EBILAEAD', branch: 'Jebel Ali', currency: 'AED' } }),
    acc('acc_g_1320', '1320', 'Mashreq Bank USD Account ****3310', GG.ca, 'Asset', { isControl: true, controlType: 'Bank', isBank: true, currencyBehaviour: 'Fixed', fixedCurrency: 'USD', openingBalance: 0, bankDetails: { bankName: 'Mashreq Bank', accountNumber: '019100003310', ifsc: 'BOMLAEAD', branch: 'Deira', currency: 'USD' } }),
    acc('acc_g_1400', '1400', 'Input VAT Recoverable', GG.ca, 'Asset', { controlType: 'Tax', openingBalance: 9500 }),
    acc('acc_g_1450', '1450', 'Advances to Suppliers', GG.ca, 'Asset', { openingBalance: 0 }),
    acc('acc_g_1500', '1500', 'Property, Plant & Equipment', GG.fa, 'Asset', { isControl: true, controlType: 'FixedAsset', openingBalance: 240000 }),
    acc('acc_g_1510', '1510', 'Accumulated Depreciation', GG.fa, 'Asset', { normalBalance: 'Cr', openingBalance: 60000 }),
    acc('acc_g_2100', '2100', 'Trade Payables (AP Control)', GG.cl, 'Liability', { isControl: true, controlType: 'AP', currencyBehaviour: 'Any', openingBalance: 178000 }),
    acc(CNS_IDS.gulfPay, '2170', 'Intercompany Payable — Elixir Business Solution', GG.cl, 'Liability', { currencyBehaviour: 'Any', openingBalance: 0 }),
    acc('acc_g_2300', '2300', 'Output VAT Payable', GG.cl, 'Liability', { controlType: 'Tax', openingBalance: 21500 }),
    acc('acc_g_2330', '2330', 'Salaries Payable', GG.cl, 'Liability', { openingBalance: 26000 }),
    acc('acc_g_3000', '3000', 'Share Capital', GG.eq, 'Equity', { openingBalance: 300000 }),
    acc('acc_g_3100', '3100', 'Retained Earnings', GG.eq, 'Equity', { openingBalance: 540000 }),
    acc('acc_g_4000', '4000', 'Sales Revenue', GG.rev, 'Income'),
    acc('acc_g_4100', '4100', 'Other Income', GG.oi, 'Income'),
    acc('acc_g_5010', '5010', 'Purchases & Cost of Goods Sold', GG.cogs, 'Expense'),
    acc('acc_g_5100', '5100', 'Staff Costs', GG.opex, 'Expense'),
    acc('acc_g_5200', '5200', 'Rent', GG.opex, 'Expense'),
    acc('acc_g_5210', '5210', 'Utilities', GG.opex, 'Expense'),
    acc('acc_g_5300', '5300', 'Depreciation', GG.opex, 'Expense'),
    acc('acc_g_5400', '5400', 'Bank Charges', GG.fin, 'Expense'),
    acc('acc_g_5590', '5590', 'Miscellaneous Expenses', GG.opex, 'Expense'),
    acc('acc_g_5600', '5600', 'Foreign Exchange Loss', GG.fin, 'Expense'),
  ];
}

// ── Journals ───────────────────────────────────────────────────────────────

type LineIn = { acc: string; dr?: number; cr?: number; narration?: string };

const ACME_ACC: Record<string, [string, string]> = {
  acc_1170: ['1170', 'Intercompany Receivable — Elixir Insights'],
  acc_2170: ['2170', 'Intercompany Payable — Elixir Insights'],
  acc_4020: ['4020', 'Export Sales'],
  acc_1310: ['1310', 'HDFC Current Account ****1234'],
  acc_5010: ['5010', 'Purchases — Raw Materials'],
};

function jline(jid: string, l: LineIn, i: number, rate: number, companyId: string, branchId: string): JournalLine {
  const meta = (companyId === G ? GACC[l.acc] : ACME_ACC[l.acc]) ?? [l.acc, l.acc];
  const dr = l.dr ?? 0;
  const cr = l.cr ?? 0;
  return { id: `${jid}_l${i + 1}`, accountId: l.acc, accountCode: meta[0], accountName: meta[1], dr, cr, drBase: Math.round(dr * rate * 100) / 100, crBase: Math.round(cr * rate * 100) / 100, currency: companyId === G ? 'AED' : 'INR', dimensions: { Branch: branchId }, narration: l.narration };
}

function mkJournal(opts: { id: string; number: string; date: string; companyId: string; branchId: string; fy: string; currency: string; rate: number; type: Journal['type']; sourceType: string; sourceId?: string; sourceNumber?: string; narration: string; lines: LineIn[]; idempotencyKey?: string }): Journal {
  const ls = opts.lines.map((l, i) => jline(opts.id, l, i, opts.rate, opts.companyId, opts.branchId));
  const totalDr = Math.round(ls.reduce((s, l) => s + l.drBase, 0) * 100) / 100;
  const totalCr = Math.round(ls.reduce((s, l) => s + l.crBase, 0) * 100) / 100;
  if (Math.abs(totalDr - totalCr) > 0.011) throw new Error(`Seed journal ${opts.id} is unbalanced: ${totalDr} vs ${totalCr}`);
  return rec<Journal>(opts.id, {
    companyId: opts.companyId, number: opts.number, date: opts.date, period: opts.date.slice(0, 7), fy: opts.fy, branchId: opts.branchId,
    currency: opts.currency, rate: opts.rate, status: 'Posted', type: opts.type, sourceType: opts.sourceType, sourceId: opts.sourceId, sourceNumber: opts.sourceNumber,
    narration: opts.narration, lines: ls, totalDr, totalCr, idempotencyKey: opts.idempotencyKey, postedAt: `${opts.date}T10:00:00.000Z`, postedBy: 'Rahul Kumar', correlationId: `corr_${opts.id}`,
    createdAt: `${opts.date}T09:30:00.000Z`, updatedAt: `${opts.date}T10:00:00.000Z`,
  });
}

const gj = (id: string, number: string, date: string, sourceType: string, narration: string, lines: LineIn[], type: Journal['type'] = 'Auto') =>
  // every seeded journal carries an idempotency key, so a repeat post is recognised (FR-ACC-013)
  mkJournal({ id, number, date, companyId: G, branchId: IDS.brDubai, fy: '2026', currency: 'AED', rate: 1, type, sourceType, narration, lines, idempotencyKey: `${id}:seed` });

function gulfJournals(): Journal[] {
  return [
    gj('jv_g_0001', 'GJV/2026/0001', '2026-07-03', 'Sales Invoice', 'Sales invoice GINV/2026/0031 — Al Noor Trading LLC (VAT 5%)', [
      { acc: 'acc_g_1100', dr: 105000, narration: 'Al Noor Trading LLC' }, { acc: 'acc_g_4000', cr: 100000 }, { acc: 'acc_g_2300', cr: 5000 },
    ]),
    gj('jv_g_0002', 'GJV/2026/0002', '2026-07-06', 'Vendor Invoice', 'Supplier invoice — Gulf Metals FZE (VAT 5% recoverable)', [
      { acc: 'acc_g_5010', dr: 62000 }, { acc: 'acc_g_1400', dr: 3100 }, { acc: 'acc_g_2100', cr: 65100, narration: 'Gulf Metals FZE' },
    ]),
    gj('jv_g_0003', 'GJV/2026/0003', '2026-07-12', 'Receipt', 'Receipt from Al Noor Trading LLC — Emirates NBD', [
      { acc: 'acc_g_1310', dr: 90000 }, { acc: 'acc_g_1100', cr: 90000, narration: 'Al Noor Trading LLC' },
    ]),
    gj('jv_g_0004', 'GJV/2026/0004', '2026-07-20', 'Payment', 'JAFZA warehouse rent — July 2026', [
      { acc: 'acc_g_5200', dr: 18000 }, { acc: 'acc_g_1310', cr: 18000 },
    ]),
    gj('jv_g_0005', 'GJV/2026/0005', '2026-07-31', 'Payroll', 'Payroll provision — July 2026 (6 staff)', [
      { acc: 'acc_g_5100', dr: 46000 }, { acc: 'acc_g_2330', cr: 46000 },
    ], 'Manual'),
    gj('jv_g_0006', 'GJV/2026/0006', '2026-08-04', 'Payment', 'Payment to Gulf Metals FZE', [
      { acc: 'acc_g_2100', dr: 60000, narration: 'Gulf Metals FZE' }, { acc: 'acc_g_1310', cr: 60000 },
    ]),
    gj('jv_g_0007', 'GJV/2026/0007', '2026-08-09', 'Sales Invoice', 'Sales invoice GINV/2026/0032 — Emaar Facilities Management', [
      { acc: 'acc_g_1100', dr: 147000, narration: 'Emaar Facilities Management' }, { acc: 'acc_g_4000', cr: 140000 }, { acc: 'acc_g_2300', cr: 7000 },
    ]),
    gj('jv_g_0008', 'GJV/2026/0008', '2026-08-18', 'Payment', 'DEWA utilities and bank charges — August 2026', [
      { acc: 'acc_g_5210', dr: 6400 }, { acc: 'acc_g_5400', dr: 1100 }, { acc: 'acc_g_1310', cr: 7500 },
    ]),
    gj('jv_g_0009', 'GJV/2026/0009', '2026-08-31', 'Depreciation', 'Depreciation — racking and handling equipment (Jul–Aug 2026)', [
      { acc: 'acc_g_5300', dr: 8000 }, { acc: 'acc_g_1510', cr: 8000 },
    ], 'Manual'),
    gj('jv_g_0010', 'GJV/2026/0010', '2026-08-31', 'Payroll', 'Payroll provision — August 2026 (6 staff)', [
      { acc: 'acc_g_5100', dr: 46000 }, { acc: 'acc_g_2330', cr: 46000 },
    ], 'Manual'),
    gj('jv_g_0011', 'GJV/2026/0011', '2026-09-02', 'Payment', 'Salary transfer — July and August 2026 payroll', [
      { acc: 'acc_g_2330', dr: 72000 }, { acc: 'acc_g_1310', cr: 72000 },
    ]),
    gj('jv_g_0012', 'GJV/2026/0012', '2026-09-08', 'Sales Invoice', 'Sales invoice GINV/2026/0033 — Al Noor Trading LLC with cost of sales', [
      { acc: 'acc_g_1100', dr: 84000, narration: 'Al Noor Trading LLC' }, { acc: 'acc_g_5010', dr: 52000, narration: 'Cost of goods sold' },
      { acc: 'acc_g_4000', cr: 80000 }, { acc: 'acc_g_2300', cr: 4000 }, { acc: 'acc_g_1200', cr: 52000 },
    ]),
  ];
}

// ── Intercompany documents + mirrored journals (FR-ORG-011/012, FR-CNS-005) ──

const AED_INR_JUL = 22.1;
const AED_INR_AUG = 22.5;
const INR_AED_SEP = 0.04415; // 1 / 22.65

function icJournals(): Journal[] {
  const am = (id: string, number: string, date: string, currency: string, rate: number, narration: string, lines: LineIn[], sourceId: string, sourceNumber: string) =>
    mkJournal({ id, number, date, companyId: IDS.acme, branchId: IDS.brHO, fy: '2026-27', currency, rate, type: 'Auto', sourceType: 'Intercompany', sourceId, sourceNumber, narration, lines });
  const gm = (id: string, number: string, date: string, narration: string, lines: LineIn[], sourceId: string, sourceNumber: string) =>
    mkJournal({ id, number, date, companyId: G, branchId: IDS.brDubai, fy: '2026', currency: 'AED', rate: 1, type: 'Auto', sourceType: 'Intercompany', sourceId, sourceNumber, narration, lines });
  return [
    // 1 — Elixir Business Solution invoices Elixir Insights, AED 60,000 (matched pair; Elixir Business Solution books INR at 22.10)
    am('jv_ic_001a', 'JV/26-27/0501', '2026-07-10', 'AED', AED_INR_JUL, 'Intercompany invoice IC-2026-0001: Elixir Business Solution → Elixir Insights (AED 60,000 @ 22.10)', [
      { acc: 'acc_1170', dr: 60000, narration: 'Due from Elixir Insights' }, { acc: 'acc_4020', cr: 60000 },
    ], 'icd_001', 'IC/2026/0001'),
    gm('jv_ic_001b', 'GJV/2026/0021', '2026-07-10', 'Intercompany invoice IC-2026-0001 from Elixir Business Solution Pvt Ltd (AED 60,000)', [
      { acc: 'acc_g_5010', dr: 60000 }, { acc: CNS_IDS.gulfPay, cr: 60000, narration: 'Due to Elixir Business Solution Pvt Ltd' },
    ], 'icd_001', 'IC/2026/0001'),
    // 2 — Elixir Insights settles AED 35,000 (matched pair)
    gm('jv_ic_002a', 'GJV/2026/0022', '2026-08-14', 'Intercompany payment IC-2026-0002 to Elixir Business Solution Pvt Ltd (AED 35,000)', [
      { acc: CNS_IDS.gulfPay, dr: 35000, narration: 'Due to Elixir Business Solution Pvt Ltd' }, { acc: 'acc_g_1310', cr: 35000 },
    ], 'icd_002', 'IC/2026/0002'),
    am('jv_ic_002b', 'JV/26-27/0502', '2026-08-14', 'AED', AED_INR_AUG, 'Intercompany receipt IC-2026-0002 from Elixir Insights (AED 35,000 @ 22.50)', [
      { acc: 'acc_1310', dr: 35000 }, { acc: 'acc_1170', cr: 35000, narration: 'Due from Elixir Insights' },
    ], 'icd_002', 'IC/2026/0002'),
    // 3 — Elixir Insights invoices Elixir Business Solution AED 24,000; Elixir Business Solution side NOT yet booked (unmatched)
    gm('jv_ic_003a', 'GJV/2026/0023', '2026-08-21', 'Intercompany invoice IC-2026-0003: Elixir Insights → Elixir Business Solution Pvt Ltd (AED 24,000) — awaiting counterparty entry', [
      { acc: CNS_IDS.gulfRecv, dr: 24000, narration: 'Due from Elixir Business Solution Pvt Ltd' }, { acc: 'acc_g_4000', cr: 24000 },
    ], 'icd_003', 'IC/2026/0003'),
    // 4 — Elixir Business Solution funds Elixir Insights INR 500,000; Elixir Insights bank credited AED 21,890 (difference vs INR→AED 0.04415)
    am('jv_ic_004a', 'JV/26-27/0503', '2026-09-04', 'INR', 1, 'Intercompany funding IC-2026-0004: Elixir Business Solution → Elixir Insights (INR 500,000)', [
      { acc: 'acc_1170', dr: 500000, narration: 'Due from Elixir Insights' }, { acc: 'acc_1310', cr: 500000 },
    ], 'icd_004', 'IC/2026/0004'),
    gm('jv_ic_004b', 'GJV/2026/0024', '2026-09-04', 'Intercompany funding IC-2026-0004 received from Elixir Business Solution Pvt Ltd (INR 500,000 credited as AED 21,890)', [
      { acc: 'acc_g_1310', dr: 21890 }, { acc: CNS_IDS.gulfPay, cr: 21890, narration: 'Due to Elixir Business Solution Pvt Ltd' },
    ], 'icd_004', 'IC/2026/0004'),
  ];
}

function intercompanyDocs(): IntercompanyDoc[] {
  const d = (id: string, fields: Omit<IntercompanyDoc, 'id' | 'createdAt' | 'updatedAt' | 'version'>) => rec<IntercompanyDoc>(id, fields);
  return [
    d('icd_001', {
      companyId: IDS.acme, type: 'Invoice', number: 'IC/2026/0001', fromCompanyId: IDS.acme, toCompanyId: G, date: '2026-07-10', currency: 'AED', amount: 60000,
      baseCurrencyFrom: 'INR', baseCurrencyTo: 'AED', rateFrom: AED_INR_JUL, rateTo: 1, baseAmountFrom: 1326000, baseAmountTo: 60000,
      counterpartyRef: 'IC-2026-0001', narration: 'Steel brackets shipped to Jebel Ali for regional distribution',
      matchStatus: 'Matched', matchedAt: '2026-07-11T06:30:00.000Z', matchedBy: 'Rahul Kumar',
      dueFromAccount: 'acc_1170', dueToAccount: CNS_IDS.gulfPay, sourceJournalIds: { from: 'jv_ic_001a', to: 'jv_ic_001b' }, sourceJournalNumbers: { from: 'JV/26-27/0501', to: 'GJV/2026/0021' },
      difference: { expectedTo: 60000, actualTo: 60000, diffTo: 0, toCurrency: 'AED', explanation: [
        'Elixir Business Solution Pvt Ltd books: INR 13,26,000.00 (= AED 60,000 × 22.10)',
        'Elixir Insights books: AED 60,000.00 (transaction currency is the Elixir Insights base currency)',
        'Both sides agree in transaction currency — the INR/AED difference appears only on consolidation and is carried to CTA',
      ] },
    }),
    d('icd_002', {
      companyId: G, type: 'Payment', number: 'IC/2026/0002', fromCompanyId: G, toCompanyId: IDS.acme, date: '2026-08-14', currency: 'AED', amount: 35000,
      baseCurrencyFrom: 'AED', baseCurrencyTo: 'INR', rateFrom: 1, rateTo: AED_INR_AUG, baseAmountFrom: 35000, baseAmountTo: 787500,
      counterpartyRef: 'IC-2026-0001', narration: 'Part settlement of IC-2026-0001',
      matchStatus: 'Matched', matchedAt: '2026-08-15T06:00:00.000Z', matchedBy: 'Rahul Kumar',
      dueFromAccount: 'acc_1170', dueToAccount: CNS_IDS.gulfPay, sourceJournalIds: { from: 'jv_ic_002a', to: 'jv_ic_002b' }, sourceJournalNumbers: { from: 'GJV/2026/0022', to: 'JV/26-27/0502' },
      difference: { expectedTo: 787500, actualTo: 787500, diffTo: 0, toCurrency: 'INR', explanation: [
        'Elixir Insights books: AED 35,000.00 (transaction currency)',
        'Elixir Business Solution Pvt Ltd books: INR 7,87,500.00 (= AED 35,000 × 22.50 on 14 Aug 2026)',
        'Both sides agree; the AED/INR movement between invoice (22.10) and settlement (22.50) is a realised FX difference of INR 14,000 in Elixir Business Solution books',
      ] },
    }),
    d('icd_003', {
      companyId: G, type: 'Invoice', number: 'IC/2026/0003', fromCompanyId: G, toCompanyId: IDS.acme, date: '2026-08-21', currency: 'AED', amount: 24000,
      baseCurrencyFrom: 'AED', baseCurrencyTo: 'INR', rateFrom: 1, rateTo: AED_INR_AUG, baseAmountFrom: 24000, baseAmountTo: 0,
      counterpartyRef: 'IC-2026-0003', narration: 'Regional warehousing and handling recharge — awaiting Elixir Business Solution entry',
      matchStatus: 'Unmatched',
      dueFromAccount: CNS_IDS.gulfRecv, dueToAccount: 'acc_2170', sourceJournalIds: { from: 'jv_ic_003a' }, sourceJournalNumbers: { from: 'GJV/2026/0023' },
    }),
    d('icd_004', {
      companyId: IDS.acme, type: 'Journal', number: 'IC/2026/0004', fromCompanyId: IDS.acme, toCompanyId: G, date: '2026-09-04', currency: 'INR', amount: 500000,
      baseCurrencyFrom: 'INR', baseCurrencyTo: 'AED', rateFrom: 1, rateTo: INR_AED_SEP, baseAmountFrom: 500000, baseAmountTo: 21890,
      counterpartyRef: 'IC-2026-0004', narration: 'Working-capital funding to Elixir Insights',
      matchStatus: 'Difference', matchedAt: '2026-09-05T05:30:00.000Z', matchedBy: 'Anil Patil',
      dueFromAccount: 'acc_1170', dueToAccount: CNS_IDS.gulfPay, sourceJournalIds: { from: 'jv_ic_004a', to: 'jv_ic_004b' }, sourceJournalNumbers: { from: 'JV/26-27/0503', to: 'GJV/2026/0024' },
      difference: { expectedTo: 22075, actualTo: 21890, diffTo: -185, toCurrency: 'AED', explanation: [
        'Elixir Business Solution Pvt Ltd books: INR 5,00,000.00 (transaction currency)',
        'Elixir Insights books: AED 21,890.00 (expected INR 500,000 × 0.04415 = AED 22,075.00)',
        'Unexplained difference AED −185.00 on the Elixir Insights side — remittance charges deducted by the correspondent bank; proposed as an elimination difference line (Exchange difference on intercompany balances)',
      ] },
    }),
  ];
}

// ── Translation rates AED → INR (FR-FX-014) ────────────────────────────────

function rates(): ExchangeRate[] {
  const fx = (id: string, rate: number, type: ExchangeRate['type'], effectiveAt: string, source: string): ExchangeRate =>
    rec<ExchangeRate>(id, { base: 'AED', quote: 'INR', rate, direction: 'Multiply', type, effectiveAt, source, status: 'Approved', approvedBy: 'Rahul Kumar' });
  return [
    fx('fx_cns_h1', 20.9, 'Historical', '2025-01-01T00:00:00Z', 'Acquisition-date rate — Elixir Insights incorporation'),
    fx('fx_cns_01', 22.1, 'Spot', '2026-04-01T09:00:00Z', 'RBI reference'),
    fx('fx_cns_02', 22.28, 'Average', '2026-06-01T00:00:00Z', 'RBI monthly average'),
    fx('fx_cns_03', 22.35, 'Closing', '2026-06-30T18:00:00Z', 'RBI reference'),
    fx('fx_cns_04', 22.42, 'Spot', '2026-07-01T09:00:00Z', 'RBI reference'),
    fx('fx_cns_05', 22.5, 'Average', '2026-08-01T00:00:00Z', 'RBI monthly average'),
    fx('fx_cns_06', 22.58, 'Closing', '2026-08-31T18:00:00Z', 'RBI reference'),
    fx('fx_cns_07', 22.8, 'Average', '2026-09-01T00:00:00Z', 'RBI monthly average'),
    fx('fx_cns_08', 22.95, 'Closing', '2026-09-30T18:00:00Z', 'RBI reference (indicative month-end)'),
  ];
}

// ── Group (FR-CNS-001) ─────────────────────────────────────────────────────

function group(): Group {
  return rec<Group>(CNS_IDS.group, {
    companyId: IDS.acme, code: 'GRP-ELIXIR', name: 'Elixir Global', tenantId: IDS.tenant,
    consolidationCurrency: 'INR', parentCompanyId: IDS.acme, accountingStandard: 'Ind AS', status: 'Active',
    members: [
      { companyId: IDS.acme, ownershipPct: 100, from: '2020-04-01', method: 'Full' },
      { companyId: G, ownershipPct: 100, from: '2025-01-01', method: 'Full' },
    ],
    ratePolicy: { income: 'Average', balance: 'Closing', equity: 'Historical', accountOverrides: { '1500': 'Historical', '3000': 'Historical' } },
    notes: 'Each member keeps its own ledgers, periods, banks and number series; consolidation only reads them (FR-FX-014).',
  });
}

// ── Consolidation runs (FR-CNS-002/003, FR-RPT-012/013) ────────────────────

const rateInfo = (rate: number, type: string, source: string, at: string) => ({ rate, type, source, at });

function runCompanies(closing: number, average: number, historical: number): RunCompany[] {
  return [
    { companyId: IDS.acme, companyName: 'Elixir Business Solution', baseCurrency: 'INR', ownershipPct: 100, method: 'Full', ownershipFrom: '2020-04-01', included: true, rateClosing: rateInfo(1, 'Same currency', '—', AT), rateAverage: rateInfo(1, 'Same currency', '—', AT), rateHistorical: rateInfo(1, 'Same currency', '—', AT), ratesSource: 'Same currency' },
    { companyId: G, companyName: 'Elixir Insights', baseCurrency: 'AED', ownershipPct: 100, method: 'Full', ownershipFrom: '2025-01-01', included: true, rateClosing: rateInfo(closing, 'Closing', 'RBI reference', AT), rateAverage: rateInfo(average, 'Average', 'RBI monthly average', AT), rateHistorical: rateInfo(historical, 'Historical', 'Acquisition-date rate — Elixir Insights incorporation', '2025-01-01T00:00:00Z'), ratesSource: 'RBI reference · RBI monthly average · Acquisition-date rate' },
  ];
}

type TlIn = [code: string, name: string, type: TranslatedLine['type'], groupCode: string, groupName: string, src: number, rateType: TranslatedLine['rateType'], rate: number, accountId?: string];

function tl(companyId: string, currency: string, rows: TlIn[]): TranslatedLine[] {
  return rows.map((r, i) => ({
    id: `tl_${companyId.slice(3)}_${i + 1}`, companyId, accountId: r[8], accountCode: r[0], accountName: r[1], type: r[2], groupCode: r[3], groupName: r[4],
    sourceCurrency: currency, sourceAmount: r[5], ownershipFactor: 1, rateType: r[6], rate: r[7], translatedAmount: Math.round(r[5] * r[7] * 100) / 100,
  }));
}

function junRun(): ConsolidationRun {
  const acme = tl(IDS.acme, 'INR', [
    ['1100', 'Trade Receivables (AR Control)', 'Asset', 'CA', 'Current Assets', 4240000, 'Closing', 1, IDS.accAR],
    ['1170', 'Intercompany Receivable — Elixir Insights', 'Asset', 'CA', 'Current Assets', 1118000, 'Closing', 1, 'acc_1170'],
    ['1200', 'Inventory — Finished Goods', 'Asset', 'CA', 'Current Assets', 1742000, 'Closing', 1, IDS.accInvFG],
    ['1310', 'HDFC Current Account ****1234', 'Asset', 'CA', 'Current Assets', 1180000, 'Closing', 1, IDS.accHDFC],
    ['1500', 'Property, Plant & Equipment', 'Asset', 'FA', 'Fixed Assets', 17480000, 'Historical', 1, IDS.accPPE],
    ['2100', 'Trade Payables (AP Control)', 'Liability', 'CL', 'Current Liabilities', -3120000, 'Closing', 1, IDS.accAP],
    ['2500', 'Term Loan — SBI', 'Liability', 'NCL', 'Non-current Liabilities', -18000000, 'Closing', 1, IDS.accTermLoan],
    ['3000', 'Share Capital', 'Equity', 'EQ', 'Equity', -2500000, 'Historical', 1, IDS.accShareCap],
    ['3100', 'Retained Earnings', 'Equity', 'EQ', 'Equity', -842600, 'Historical', 1, IDS.accRetained],
    ['3190', 'Retained earnings — prior years (unappropriated)', 'Equity', 'EQ', 'Equity', 112600, 'Historical', 1],
    ['4000', 'Sales Revenue', 'Income', 'REV', 'Revenue', -4960000, 'Average', 1, IDS.accSales],
    ['5010', 'Purchases — Raw Materials', 'Expense', 'COGS', 'Cost of Goods Sold', 2910000, 'Average', 1, IDS.accPurchases],
    ['5100', 'Employee Salaries', 'Expense', 'OPEX', 'Operating Expenses', 640000, 'Average', 1, IDS.accSalaries],
  ]);
  const gulf = tl(G, 'AED', [
    ['1100', 'Trade Receivables (AR Control)', 'Asset', 'CA', 'Current Assets', 328000, 'Closing', 22.35, 'acc_g_1100'],
    ['1200', 'Inventory — Finished Goods', 'Asset', 'CA', 'Current Assets', 184000, 'Closing', 22.35, 'acc_g_1200'],
    ['1310', 'Emirates NBD Current Account ****7742', 'Asset', 'CA', 'Current Assets', 424500, 'Closing', 22.35, 'acc_g_1310'],
    ['1500', 'Property, Plant & Equipment', 'Asset', 'FA', 'Fixed Assets', 240000, 'Historical', 20.9, 'acc_g_1500'],
    ['1510', 'Accumulated Depreciation', 'Asset', 'FA', 'Fixed Assets', -64000, 'Closing', 22.35, 'acc_g_1510'],
    ['2100', 'Trade Payables (AP Control)', 'Liability', 'CL', 'Current Liabilities', -183100, 'Closing', 22.35, 'acc_g_2100'],
    ['2170', 'Intercompany Payable — Elixir Business Solution', 'Liability', 'CL', 'Current Liabilities', -50000, 'Closing', 22.35, CNS_IDS.gulfPay],
    ['2300', 'Output VAT Payable', 'Liability', 'CL', 'Current Liabilities', -26500, 'Closing', 22.35, 'acc_g_2300'],
    ['3000', 'Share Capital', 'Equity', 'EQ', 'Equity', -300000, 'Historical', 20.9, 'acc_g_3000'],
    ['3100', 'Retained Earnings', 'Equity', 'EQ', 'Equity', -540000, 'Historical', 20.9, 'acc_g_3100'],
    ['3190', 'Retained earnings — prior years (unappropriated)', 'Equity', 'EQ', 'Equity', 41100, 'Historical', 20.9],
    ['4000', 'Sales Revenue', 'Income', 'REV', 'Revenue', -240000, 'Average', 22.28, 'acc_g_4000'],
    ['5010', 'Purchases & Cost of Goods Sold', 'Expense', 'COGS', 'Cost of Goods Sold', 122000, 'Average', 22.28, 'acc_g_5010'],
    ['5100', 'Staff Costs', 'Expense', 'OPEX', 'Operating Expenses', 46000, 'Average', 22.28, 'acc_g_5100'],
    ['5200', 'Rent', 'Expense', 'OPEX', 'Operating Expenses', 18000, 'Average', 22.28, 'acc_g_5200'],
  ]);
  const lines = [...acme, ...gulf];
  const sum = (cid: string) => Math.round(lines.filter((l) => l.companyId === cid).reduce((s, l) => s + l.translatedAmount, 0) * 100) / 100;
  const ctaByCompany = { [IDS.acme]: sum(IDS.acme), [G]: sum(G) };
  const cta = Math.round((ctaByCompany[IDS.acme] + ctaByCompany[G]) * 100) / 100;
  const totals: Record<string, number> = {};
  lines.forEach((l) => { totals[l.groupCode] = Math.round(((totals[l.groupCode] ?? 0) + l.translatedAmount) * 100) / 100; });
  const books = [
    { companyId: IDS.acme, journals: 164, totalDr: 48216430, totalCr: 48216430, lastPostedAt: '2026-06-30T18:00:00.000Z', at: '2026-07-09T11:20:00.000Z' },
    { companyId: G, journals: 0, totalDr: 0, totalCr: 0, at: '2026-07-09T11:20:00.000Z' },
  ];
  return rec<ConsolidationRun>(CNS_IDS.runJun, {
    companyId: IDS.acme, groupId: CNS_IDS.group, number: 'CNS/2026-06/01', period: '2026-06', from: '2026-06-01', to: '2026-06-30', plBasis: 'YTD',
    currency: 'INR', accountingStandard: 'Ind AS', status: 'Final', runVersion: 1,
    companies: runCompanies(22.35, 22.28, 20.9), translatedLines: lines, cta, ctaByCompany, totals,
    adjustments: [CNS_IDS.adjJun],
    eliminations: [{
      id: 'elim_jun_01', pairRef: 'ACME↔GULF', kind: 'Intercompany balance',
      description: 'Eliminate Elixir Business Solution receivable from Elixir Insights against the Elixir Insights payable at 30 Jun 2026',
      drCompanyId: G, drAccountCode: '2170', drAccountName: 'Intercompany Payable — Elixir Business Solution', drAmount: 1117500,
      crCompanyId: IDS.acme, crAccountCode: '1170', crAccountName: 'Intercompany Receivable — Elixir Insights', crAmount: 1118000,
      fxDifference: -500, differenceAccountCode: 'CTA', amount: 1118000, sourceDocs: [],
      status: 'Accepted', reversible: true, reason: 'Matched on the June intercompany reconciliation', actedBy: 'Rahul Kumar', actedAt: '2026-07-09T11:40:00.000Z',
      warning: 'Translation difference −500 INR booked to the translation reserve (CTA)',
    }],
    createdBy: 'Rahul Kumar', translatedAt: '2026-07-09T11:20:00.000Z', finalizedAt: '2026-07-09T12:05:00.000Z', finalizedBy: 'Rahul Kumar',
    booksAtTranslate: books, booksAtFinal: books,
    log: [
      { at: '2026-07-09T11:05:00.000Z', by: 'Rahul Kumar', action: 'Created', detail: 'Elixir Global · 2026-06 · INR' },
      { at: '2026-07-09T11:20:00.000Z', by: 'Rahul Kumar', action: 'Translated', detail: `${lines.length} lines · CTA ${cta} INR` },
      { at: '2026-07-09T11:40:00.000Z', by: 'Rahul Kumar', action: 'Elimination accepted', detail: 'ACME↔GULF · intercompany balance 11,18,000 INR' },
      { at: '2026-07-09T11:55:00.000Z', by: 'Rahul Kumar', action: 'Adjustment posted', detail: 'CJ/2026-06/001 · 96,000 INR · Elixir Insights depreciation aligned to group policy' },
      { at: '2026-07-09T12:05:00.000Z', by: 'Rahul Kumar', action: 'Finalized', detail: 'v1 · legal books verified unchanged' },
    ],
    createdAt: '2026-07-09T11:05:00.000Z', updatedAt: '2026-07-09T12:05:00.000Z',
  });
}

function augRun(): ConsolidationRun {
  return rec<ConsolidationRun>(CNS_IDS.runAug, {
    companyId: IDS.acme, groupId: CNS_IDS.group, number: 'CNS/2026-08/02', period: '2026-08', from: '2026-08-01', to: '2026-08-31', plBasis: 'YTD',
    currency: 'INR', accountingStandard: 'Ind AS', status: 'Draft', runVersion: 1,
    companies: runCompanies(22.58, 22.5, 20.9), translatedLines: [], cta: 0, ctaByCompany: {}, totals: {},
    adjustments: [], eliminations: [], createdBy: 'Rahul Kumar', booksAtTranslate: [],
    log: [{ at: '2026-09-03T09:30:00.000Z', by: 'Rahul Kumar', action: 'Created', detail: 'Elixir Global · 2026-08 · INR — awaiting translation' }],
    createdAt: '2026-09-03T09:30:00.000Z', updatedAt: '2026-09-03T09:30:00.000Z',
  });
}

function adjustments(): ConsolidationJournal[] {
  return [rec<ConsolidationJournal>(CNS_IDS.adjJun, {
    companyId: IDS.acme, runId: CNS_IDS.runJun, groupId: CNS_IDS.group, number: 'CJ/2026-06/001', date: '2026-06-30', period: '2026-06', currency: 'INR',
    reason: 'Align Elixir Insights racking depreciation to the group Ind AS useful life of 8 years (local books use 12 years)',
    lines: [
      { id: 'cjl_1', accountCode: '5300', accountName: 'Depreciation & Amortisation', dr: 96000, cr: 0, narration: 'Additional group depreciation — Elixir Insights racking' },
      { id: 'cjl_2', accountCode: '1510', accountName: 'Accumulated Depreciation', dr: 0, cr: 96000, narration: 'Additional group depreciation — Elixir Insights racking' },
    ],
    totalDr: 96000, totalCr: 96000, status: 'Posted', postedAt: '2026-07-09T11:55:00.000Z', postedBy: 'Rahul Kumar',
    workflowNote: 'No approval rule for Consolidation Adjustment — posted directly (audited). Never written to Elixir Business Solution or Elixir Insights journals (FR-CNS-004).',
    createdAt: '2026-07-09T11:50:00.000Z', updatedAt: '2026-07-09T11:55:00.000Z',
  })];
}

// ── Compose ────────────────────────────────────────────────────────────────

export function seedConsolidation(): Partial<DB> {
  const numberSeries: NumberSeries[] = [
    rec<NumberSeries>('ns_journal_gulf', { companyId: G, docType: 'Journal', fy: 'ALL', prefix: 'GJV/2026/', suffix: '', padding: 4, next: 25, resetRule: 'Never', allocation: 'On post', status: 'Active', voids: [] }),
    rec<NumberSeries>('ns_salesinvoice_gulf', { companyId: G, docType: 'Sales Invoice', fy: 'ALL', prefix: 'GINV/2026/', suffix: '', padding: 4, next: 34, resetRule: 'Never', allocation: 'On post', status: 'Active', voids: [] }),
  ];
  return {
    [C.accountGroups]: gulfGroups() as any,
    [C.accounts]: gulfAccounts() as any,
    [C.numberSeries]: numberSeries as any,
    [C.exchangeRates]: rates() as any,
    [C.journals]: [...gulfJournals(), ...icJournals()] as any,
    [C.intercompanyDocs]: intercompanyDocs() as any,
    [C.groups]: [group()] as any,
    [C.consolidationRuns]: [junRun(), augRun()] as any,
    [C.consolidationJournals]: adjustments() as any,
  };
}
