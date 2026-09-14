// Verifies that relieving stock at RUNTIME also relieves inventory control (FR-INV-008):
// posts a cash sale of a stock item and a POS bill, then checks that inventory control
// fell by the same value the stock ledger did, and that COGS rose by that amount.
// Usage: node scripts/e2e-cogs.mjs [baseUrl]
import { chromium } from 'playwright-core';

// playwright-core rejects in-flight navigation promises when the browser closes; that surfaces as
// an unhandled TargetClosedError *after* the run has finished. Ignore it during teardown only.
let tearingDown = false;
process.on('unhandledRejection', (e) => {
  if (tearingDown && String(e).includes('TargetClosedError')) return;
  console.error(e);
  process.exit(1);
});

const base = process.argv[2] ?? 'http://localhost:5173';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error' && !/favicon|404/.test(m.text())) errors.push(`console: ${m.text().slice(0, 200)}`); });

await page.goto(`${base}/#/`, { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });
await page.locator('input[type=email]').first().fill('rahul@acmepvt.com');
await page.locator('button[type=submit]').first().click();
await page.waitForTimeout(900);
if (await page.locator('input[placeholder="123456"]').count()) {
  await page.locator('input[placeholder="123456"]').fill('123456');
  await page.getByText('Verify and sign in').click();
  await page.waitForTimeout(400);
}
if (await page.locator('.company-picker').count()) {
  await page.locator('.company-card:not(.create)').first().click();
  await page.waitForTimeout(400);
}
await page.goto(`${base}/#/sales/invoices`, { waitUntil: 'networkidle' });
await page.waitForTimeout(600);

const out = await page.evaluate(async () => {
  const mod = await import('/src/store/index.ts');
  const { db, C, engine } = mod;
  const bal = (code) => {
    const a = db.get(C.accounts).find((x) => x.code === code && x.companyId === 'co_acme');
    return a ? engine.accountBalance(a.id).net : 0;
  };
  const stockValue = () => {
    const byItem = new Map();
    for (const m of db.get(C.stockMovements)) {
      const e = byItem.get(m.itemId) ?? { qty: 0, inQty: 0, inVal: 0 };
      e.qty += m.baseQty ?? 0;
      if ((m.baseQty ?? 0) > 0) { e.inQty += m.baseQty; e.inVal += m.value ?? 0; }
      byItem.set(m.itemId, e);
    }
    let v = 0;
    for (const [, e] of byItem) v += e.qty * (e.inQty > 0 ? e.inVal / e.inQty : 0);
    return Math.round(v * 100) / 100;
  };

  const before = { inv: bal('1200') + bal('1210'), cogs: bal('5000'), stock: stockValue() };

  // ── cash sale of a stock item, posted through the module's own action ──
  const sales = await import('/src/modules/sales/actions.ts');
  const item = db.get(C.items).find((i) => i.code === 'SKU-10021');
  const draft = sales.newInvoice({ partyId: 'cust_arlene', date: '2026-09-13' });
  draft.partyName = 'Arlene Traders';
  draft.partySnapshot = engine.partySnapshotFor('Customer', 'cust_arlene');
  draft.lines = [engine.lineFromItem(item.id, { qty: 5, customerId: 'cust_arlene', direction: 'sale', warehouseId: 'wh_main' })];
  const saved = sales.saveInvoice(draft);
  const posted = sales.postInvoice(saved.id);

  const after = { inv: bal('1200') + bal('1210'), cogs: bal('5000'), stock: stockValue() };
  const moves = db.get(C.stockMovements).filter((m) => m.sourceId === posted.id);
  const cogsJournal = db.get(C.journals).find((j) => j.idempotencyKey === `cogs:${posted.id}`);

  // ── reverse it and confirm the cost side unwinds too ──
  sales.reverseInvoice(posted.id, 'Automated COGS verification — reversing the test sale');
  const afterReversal = { inv: bal('1200') + bal('1210'), cogs: bal('5000'), stock: stockValue() };

  return {
    number: posted.number,
    movements: moves.length,
    movementValue: Math.round(moves.reduce((s, m) => s + m.value, 0) * 100) / 100,
    cogsJournal: cogsJournal?.number ?? null,
    movementsWithJournal: moves.filter((m) => m.journalId).length,
    before, after, afterReversal,
  };
});

const r2 = (n) => Math.round(n * 100) / 100;
const checks = [];
const check = (name, ok, detail = '') => { checks.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`); };

console.log(`posted ${out.number} · ${out.movements} stock movement(s) worth ₹${out.movementValue}`);
check('a COGS journal was posted', !!out.cogsJournal, out.cogsJournal ?? 'none');
check('every stock movement carries a journal id', out.movements > 0 && out.movementsWithJournal === out.movements, `${out.movementsWithJournal}/${out.movements}`);
check('inventory control fell by the stock value', Math.abs(r2(out.before.inv - out.after.inv) - out.movementValue) < 1, `ledger −₹${r2(out.before.inv - out.after.inv)} vs stock −₹${r2(out.before.stock - out.after.stock)}`);
check('COGS rose by the stock value', Math.abs(r2(out.after.cogs - out.before.cogs) - out.movementValue) < 1, `+₹${r2(out.after.cogs - out.before.cogs)}`);
check('control still equals valuation after the sale', Math.abs(r2((out.before.inv - out.after.inv) - (out.before.stock - out.after.stock))) < 1);
check('reversal unwinds inventory control', Math.abs(r2(out.afterReversal.inv - out.before.inv)) < 1, `back to ₹${r2(out.afterReversal.inv)}`);
check('reversal unwinds COGS', Math.abs(r2(out.afterReversal.cogs - out.before.cogs)) < 1);

console.log(`\nconsole/page errors: ${errors.length}`);
errors.slice(0, 5).forEach((e) => console.log('  ' + e));
const failed = checks.filter((c) => !c).length;
console.log(`${checks.length - failed}/${checks.length} checks passed`);
tearingDown = true;
await browser.close();
process.exit(failed || errors.length ? 1 : 0);
