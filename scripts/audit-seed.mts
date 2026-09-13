// Seed integrity audit: runs the seed builder in isolation and reports trial-balance balance,
// duplicate journal numbers/ids, duplicate economic events, negative stock positions and — the
// part that matters most — whether every control account still equals its sub-ledger
// (FR-ACC-020/022, FR-AR-005, FR-AP-001, FR-INV-008, FR-RPT-009).
//
// Run: npx vite-node scripts/audit-seed.mts
//
// Balances are computed the way `engine.accountBalance` computes them: opening balance in the
// account's `normalBalance` direction, plus every journal whose status is Posted *or Reversed*
// (a reversed journal was posted; its linked reversal offsets it, so both stay in the ledger).
const g = globalThis as any;
if (!g.localStorage) g.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {} };
if (!g.window) g.window = { location: { hash: '' }, addEventListener: () => {} };

const { buildSeed } = await import('../src/store/seed/index.ts');
const seed = buildSeed() as Record<string, any[]>;

const journals = (seed.journals ?? []) as any[];
const accounts = (seed.accounts ?? []) as any[];
const moves = (seed.stockMovements ?? []) as any[];
const items = (seed.items ?? []) as any[];
const openItems = (seed.openItems ?? []) as any[];
const inLedger = (j: any) => j.status === 'Posted' || j.status === 'Reversed';
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

console.log('collections:', Object.keys(seed).length, '· rows:', Object.values(seed).reduce((s: number, r: any) => s + r.length, 0));

// 1. duplicate ids / numbers
const byId = new Map<string, number>();
const byNum = new Map<string, string[]>();
for (const [col, rows] of Object.entries(seed)) {
  for (const r of rows as any[]) {
    byId.set(r.id, (byId.get(r.id) ?? 0) + 1);
    if (col === 'journals' && r.number) byNum.set(r.number, [...(byNum.get(r.number) ?? []), r.id]);
  }
}
const dupIds = [...byId].filter(([, n]) => n > 1);
const dupNums = [...byNum].filter(([, ids]) => ids.length > 1);
console.log('duplicate record ids:', dupIds.length, dupIds.slice(0, 10));
console.log('duplicate journal numbers:', dupNums.length, dupNums.slice(0, 10));

// 2. journal balance + TB
let unbalanced = 0;
const bal = new Map<string, { dr: number; cr: number }>();
for (const j of journals) {
  if (!inLedger(j)) continue;
  const dr = j.lines.reduce((s: number, l: any) => s + (l.drBase ?? l.dr ?? 0), 0);
  const cr = j.lines.reduce((s: number, l: any) => s + (l.crBase ?? l.cr ?? 0), 0);
  if (Math.abs(dr - cr) > 0.02) { unbalanced++; if (unbalanced < 6) console.log('  UNBALANCED', j.id, j.number, dr.toFixed(2), cr.toFixed(2)); }
  for (const l of j.lines) {
    const b = bal.get(l.accountId) ?? { dr: 0, cr: 0 };
    b.dr += l.drBase ?? l.dr ?? 0;
    b.cr += l.crBase ?? l.cr ?? 0;
    bal.set(l.accountId, b);
  }
}
console.log('posted journals:', journals.filter((j) => j.status === 'Posted').length, '· in ledger (incl. reversed):', journals.filter(inLedger).length, '· unbalanced:', unbalanced);

let tbDr = 0, tbCr = 0, openDr = 0, openCr = 0;
for (const a of accounts) {
  const b = bal.get(a.id) ?? { dr: 0, cr: 0 };
  const ob = a.openingBalance ?? 0;
  const obDr = a.normalBalance === 'Dr' ? ob : -ob;
  const net = obDr + b.dr - b.cr;
  if (ob) { if (a.normalBalance === 'Dr') openDr += ob; else openCr += ob; }
  if (net >= 0) tbDr += net; else tbCr += -net;
}
console.log('opening balances: Dr', openDr.toFixed(2), 'Cr', openCr.toFixed(2), '· diff', (openDr - openCr).toFixed(2));
console.log('trial balance:    Dr', tbDr.toFixed(2), 'Cr', tbCr.toFixed(2), '· diff', (tbDr - tbCr).toFixed(2));

// 3. expense concentration — spot double-posted recurring events
const perAccountMonth = new Map<string, { amt: number; js: string[] }>();
for (const j of journals) {
  if (!inLedger(j)) continue;
  for (const l of j.lines) {
    const acc = accounts.find((a) => a.id === l.accountId);
    if (!acc || acc.type !== 'Expense') continue;
    const key = `${acc.code} ${acc.name}|${(j.date ?? '').slice(0, 7)}`;
    const e = perAccountMonth.get(key) ?? { amt: 0, js: [] };
    e.amt += (l.drBase ?? l.dr ?? 0) - (l.crBase ?? l.cr ?? 0);
    e.js.push(j.id);
    perAccountMonth.set(key, e);
  }
}
const suspicious = [...perAccountMonth].filter(([, e]) => e.js.length > 1 && /jv_sal|jv_dep|jv_pay/.test(e.js.join(',')));
console.log('\nexpense accounts with >1 journal in a month (possible double count):');
for (const [k, e] of suspicious.slice(0, 20)) console.log(' ', k, '=', e.amt.toFixed(2), 'from', [...new Set(e.js)].join(', '));

// 4. stock positions
const pos = new Map<string, number>();
for (const m of moves) {
  const k = `${m.itemId}|${m.warehouseId}`;
  pos.set(k, (pos.get(k) ?? 0) + (m.baseQty ?? m.qty ?? 0));
}
const neg = [...pos].filter(([, q]) => q < -0.0005);
console.log('\nstock movements:', moves.length, '· negative item/warehouse positions:', neg.length);
for (const [k, q] of neg.slice(0, 15)) {
  const [itemId, wh] = k.split('|');
  console.log('  NEGATIVE', items.find((i) => i.id === itemId)?.code ?? itemId, wh, q.toFixed(3));
}

// ── 5. control-account reconciliations ─────────────────────────────────────
// Reconciliation is scoped to the primary operating company — the seed also carries Acme Gulf
// and the consolidation entities, whose account codes repeat.
const CO = 'co_acme';
const coAccounts = accounts.filter((a) => a.companyId === CO);
const accOf = (code: string) => coAccounts.find((a) => a.code === code);
/** Closing balance in the account's normal direction (credit balances on a Cr account are positive). */
const netOfAcc = (a: any) => {
  if (!a) return NaN;
  const b = bal.get(a.id) ?? { dr: 0, cr: 0 };
  const ob = a.openingBalance ?? 0;
  return r2(a.normalBalance === 'Dr' ? ob + b.dr - b.cr : ob + b.cr - b.dr);
};
const netOf = (code: string) => netOfAcc(accOf(code));

// Open items are routed to the control account their source document actually posts to.
// Invoices/credit notes/opening balances sit in AR (1100) / AP (2100); money received or paid
// with nothing to apply it to sits in the advance accounts (2150 customers, 1450 suppliers) or
// in Retainers Received (2160), so those rows must NOT be counted against AR/AP control.
const ADVANCE_DOCTYPES = new Set(['Receipt', 'Payment', 'Advance']);
const RETAINER_DOCTYPES = new Set(['Retainer']);
const live = (o: any) => o.status !== 'Settled' && o.status !== 'Written Off';
const signed = (o: any) => (o.direction === 'Debit' ? 1 : -1) * (o.baseOutstanding ?? 0);
const kindOf = (o: any) => (ADVANCE_DOCTYPES.has(o.docType) ? 'advance' : RETAINER_DOCTYPES.has(o.docType) ? 'retainer' : 'control');
const sumOpen = (party: string, kind: 'control' | 'advance' | 'retainer') =>
  r2(openItems.filter((o) => o.partyType === party && live(o) && kindOf(o) === kind).reduce((s, o) => s + signed(o), 0));

// Production / subcontract activity is owned by the manufacturing module (still under construction),
// so WIP (1220) and every production or subcontract movement are excluded from the inventory tie.
const PROD_SOURCE = /Production|Subcontract|Material Issue|Work Order|Job Card|Disassembly/i;
const PROD_WH = new Set(['wh_wip', 'wh_subcon', 'wh_scrap']);
const isProdMove = (m: any) => PROD_SOURCE.test(m.type ?? '') || PROD_SOURCE.test(m.sourceType ?? '') || PROD_WH.has(m.warehouseId);
const isProdJournal = (j: any) => PROD_SOURCE.test(j.sourceType ?? '');

/** Inventory control (1200 + 1210) excluding production postings. */
const invLedgerExclProduction = (() => {
  const ids = new Set(['1200', '1210'].map((c) => accOf(c)?.id));
  let v = ['1200', '1210'].reduce((s, c) => s + (accOf(c)?.openingBalance ?? 0), 0);
  for (const j of journals) {
    if (!inLedger(j) || isProdJournal(j)) continue;
    for (const l of j.lines) if (ids.has(l.accountId)) v += (l.drBase ?? 0) - (l.crBase ?? 0);
  }
  return r2(v);
})();

/**
 * Stock sub-ledger value under moving average: receipts and value-only (landed cost) movements in,
 * issues out — exactly what `engine.stockPosition().value` reports and what the stock-valuation
 * report totals. Production/subcontract movements are excluded to match the ledger side.
 */
const stockValueExclProduction = r2(moves.filter((m) => !isProdMove(m))
  .reduce((s, m) => s + (m.value ?? 0) * ((m.baseQty ?? 0) < 0 ? -1 : 1), 0));

/**
 * Every stock movement must have a journal of the same value. Opening stock is the exception —
 * it is carried by the account's opening balance — and warehouse transfers do not touch the ledger.
 */
const NO_JOURNAL_OK = new Set(['Opening', 'Transfer Out', 'Transfer In']);
const movesWithoutJournal = moves.filter((m) => !isProdMove(m) && !NO_JOURNAL_OK.has(m.type) && !m.journalId);

// GRNI: goods accrued on posted GRNs, less the part already cleared by posted vendor invoices.
const grns = (seed.grns ?? []) as any[];
const vendorInvoices = (seed.vendorInvoices ?? []) as any[];
const grnAccrued = r2(grns.filter((g) => g.status === 'Posted').reduce((s, g) => s + g.lines.reduce((t: number, l: any) => t + (l.taxable ?? 0), 0), 0));
const grnCleared = r2(vendorInvoices.filter((v) => v.status === 'Posted').reduce((s, v) => s + v.lines.filter((l: any) => l.grnId).reduce((t: number, l: any) => t + r2(l.qty * (l.poRate ?? l.rate)), 0), 0));

// Employee payable: approved-but-not-yet-reimbursed claims paid personally by the employee.
const claims = (seed.expenseClaims ?? []) as any[];
const claimPosted = (c: any) => c.status === 'Approved' || c.status === 'Reimbursed';
const unreimbursed = r2(claims.filter((c) => claimPosted(c) && c.paymentMethod !== 'Corporate card' && c.status !== 'Reimbursed').reduce((s, c) => s + c.totals.total, 0));
const cardOutstanding = r2(claims.filter((c) => claimPosted(c) && c.paymentMethod === 'Corporate card').reduce((s, c) => s + c.totals.total, 0));

// Tax control accounts vs the tax the posted documents say they charged / suffered.
const docTax = (cols: [string, number][], comp: string) =>
  r2(cols.reduce((s, [col, sign]) => s + sign * (seed[col] ?? []).filter((d: any) => d.status === 'Posted' || d.status === 'Settled')
    .reduce((t: number, d: any) => t + (d.totals?.components?.[comp] ?? 0), 0), 0));
const OUT_DOCS: [string, number][] = [['salesInvoices', 1], ['creditNotes', -1], ['posBills', 1], ['posReturns', -1]];
const IN_DOCS: [string, number][] = [['vendorInvoices', 1], ['debitNotes', -1]];
// Reverse charge books the same amount as BOTH input credit and output liability (FR-TAX-004).
const rcmTax = (comp: string) => r2(vendorInvoices.filter((v) => v.status === 'Posted' && v.reverseCharge)
  .reduce((s, v) => s + v.lines.reduce((t: number, l: any) => t + (l.taxComponents?.[comp] ?? 0), 0), 0));
// GST on expense claims is input credit (claims split their tax 50/50 CGST/SGST).
const claimTax = (comp: string) => (comp === 'CGST' || comp === 'SGST')
  ? r2(claims.filter(claimPosted).reduce((s, c) => s + (comp === 'CGST' ? Math.round((c.totals.tax / 2) * 100) / 100 : r2(c.totals.tax - Math.round((c.totals.tax / 2) * 100) / 100)), 0))
  : 0;
const outputExpected = (code: string, comp: string) => r2((accOf(code)?.openingBalance ?? 0) + docTax(OUT_DOCS, comp) + rcmTax(comp));
const inputExpected = (code: string, comp: string) => r2((accOf(code)?.openingBalance ?? 0) + docTax(IN_DOCS, comp) + rcmTax(comp) + claimTax(comp));

// P&L net profit vs the retained-earnings movement implied by the balance sheet.
// Every account nets to zero across the trial balance, so the Dr-positive total of the balance
// sheet is exactly the profit the P&L reports — i.e. the retained-earnings movement for the year.
const plNet = r2(coAccounts.filter((a) => a.type === 'Income' || a.type === 'Expense').reduce((s, a) => {
  const b = bal.get(a.id) ?? { dr: 0, cr: 0 };
  return s + (a.type === 'Income' ? b.cr - b.dr : -(b.dr - b.cr));
}, 0));
const bsMovement = r2(coAccounts.filter((a) => a.type !== 'Income' && a.type !== 'Expense').reduce((s, a) => {
  const n = netOfAcc(a);
  return s + (a.normalBalance === 'Dr' ? n : -n);
}, 0));

type Row = [string, number, number, string];
const rows: Row[] = [
  ['AR control 1100', netOf('1100'), sumOpen('Customer', 'control'), 'customer invoices / credit notes / opening'],
  ['Customer advances 2150', netOf('2150'), -sumOpen('Customer', 'advance'), 'unapplied receipts on account'],
  ['AP control 2100', netOf('2100'), sumOpen('Supplier', 'control'), 'supplier invoices / debit notes / opening'],
  ['Supplier advances 1450', netOf('1450'), -sumOpen('Supplier', 'advance'), 'advances paid to suppliers'],
  ['GRNI 2110', netOf('2110'), r2(grnAccrued - grnCleared), 'goods received not invoiced'],
  ['Employee payable 2340', netOf('2340'), sumOpen('Employee', 'control'), 'unreimbursed expense claims'],
  ['Corporate card 2350', netOf('2350'), cardOutstanding, 'card spend not yet settled with the statement'],
  ['Salaries payable 2330', netOf('2330'), 0, 'cleared by the monthly disbursement'],
  ['Output CGST 2300', netOf('2300'), outputExpected('2300', 'CGST'), 'tax on posted sales documents'],
  ['Output SGST 2301', netOf('2301'), outputExpected('2301', 'SGST'), 'tax on posted sales documents'],
  ['Output IGST 2302', netOf('2302'), outputExpected('2302', 'IGST'), 'tax on posted sales documents'],
  ['Input CGST 1400', netOf('1400'), inputExpected('1400', 'CGST'), 'tax on posted purchase documents'],
  ['Input SGST 1401', netOf('1401'), inputExpected('1401', 'SGST'), 'tax on posted purchase documents'],
  ['Input IGST 1402', netOf('1402'), inputExpected('1402', 'IGST'), 'tax on posted purchase documents'],
  ['P&L net vs balance-sheet movement', bsMovement, plNet, 'retained-earnings movement implied by the balance sheet'],
];

console.log('\ncontrol reconciliation (ledger vs sub-ledger):');
let diffs = 0;
for (const [label, ledger, sub, note] of rows) {
  const d = r2(ledger - sub);
  if (Math.abs(d) >= 1) diffs++;
  console.log(` ${Math.abs(d) < 1 ? 'OK  ' : 'DIFF'} ${label}: ledger ${ledger.toFixed(2)} · sub-ledger ${sub.toFixed(2)} · diff ${d.toFixed(2)}  — ${note}`);
}
console.log(` ${movesWithoutJournal.length === 0 ? 'OK  ' : 'DIFF'} stock movements without a journal (excl. opening/transfers/production): ${movesWithoutJournal.length}`);
for (const m of movesWithoutJournal.slice(0, 10)) console.log(`      ${m.date} ${m.type} ${m.sourceNumber ?? m.sourceId} ${m.itemCode} ${m.baseQty}`);

// Inventory including production. Two separate ties, because WIP carries value the stock ledger
// cannot: conversion cost (labour, machine, overhead) is absorbed into 1220 as operations complete
// and only leaves when finished output is received.
//   1200 + 1210  must equal stock held in ordinary warehouses, to the rupee.
//   1220 (WIP)   must equal material on the shop floor PLUS conversion absorbed but not yet released,
//                so it can never be less than the floor stock (that would be releasing cost that was
//                never incurred).
const wipWarehouses = new Set(((seed.warehouses ?? []) as any[]).filter((w) => w.type === 'WIP').map((w) => w.id));
const inWip = (m: any) => wipWarehouses.has(m.warehouseId);
const signedValue = (m: any) => (m.value ?? 0) * ((m.baseQty ?? 0) < 0 ? -1 : 1);
const stockOrdinary = r2(moves.filter((m) => !inWip(m)).reduce((s2, m) => s2 + signedValue(m), 0));
const stockOnFloor = r2(moves.filter(inWip).reduce((s2, m) => s2 + signedValue(m), 0));
const invLedger = r2(netOf('1200') + netOf('1210'));
const wipLedger = r2(netOf('1220'));
const conversionHeld = r2(wipLedger - stockOnFloor);
const invDiff = r2(invLedger - stockOrdinary);
if (Math.abs(invDiff) >= 1) diffs += 1;
console.log(` ${Math.abs(invDiff) < 1 ? 'OK  ' : 'DIFF'} Inventory 1200+1210 (all movements): ledger ${invLedger.toFixed(2)} · sub-ledger ${stockOrdinary.toFixed(2)} · diff ${invDiff.toFixed(2)}  — stock in ordinary warehouses`);
console.log(` ${conversionHeld >= -0.5 ? 'OK  ' : 'DIFF'} WIP 1220 covers the shop floor: ledger ${wipLedger.toFixed(2)} · material on floor ${stockOnFloor.toFixed(2)} · conversion held ${conversionHeld.toFixed(2)} — WIP must be at least the floor stock`);
if (conversionHeld < -0.5) diffs += 1;

console.log(`\n${diffs === 0 && unbalanced === 0 && dupIds.length === 0 && dupNums.length === 0 && neg.length === 0 && movesWithoutJournal.length === 0 ? 'AUDIT OK' : `AUDIT: ${diffs} reconciliation difference(s)`}`);
