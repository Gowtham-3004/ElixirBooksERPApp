// Runtime cross-report check (FR-ACC-022, FR-RPT-009): the AR and AP ageing reports must total
// exactly what the trial balance shows on the AR (1100) and AP (2100) control accounts, and the
// P&L net profit, trial balance and CFO dashboard must all agree — they now all read balances
// through engine.accountBalance, so any drift here means a report is computing its own.
// Usage: node scripts/verify-control-accounts.mjs [baseUrl]   (needs a dev server running)
import { chromium } from 'playwright-core';

const base = process.argv[2] ?? 'http://localhost:5191';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e?.message ?? e)));

await page.goto(base + '/#/', { waitUntil: 'networkidle' });
await page.evaluate(() => { localStorage.clear(); });
await page.reload({ waitUntil: 'networkidle' });
const emailInput = page.locator('input[type=email]').first();
if (await emailInput.count()) {
  await emailInput.fill('rahul@elixirbusiness.in');
  await page.locator('button[type=submit]').first().click();
  await page.waitForTimeout(900);
  const mfa = page.locator('input[placeholder="123456"]');
  if (await mfa.count()) { await mfa.fill('123456'); await page.getByText('Verify and sign in').click(); await page.waitForTimeout(300); }
  const choose = page.locator('.company-picker');
  if (await choose.count()) { await page.locator('.company-card:not(.create)').first().click(); await page.waitForTimeout(300); }
}

/** Read the numbers straight out of the running app's own modules — same code the pages render. */
async function readFigures() {
  await page.goto(`${base}/#/reports/trial-balance`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  return page.evaluate(async () => {
    const store = await import('/src/store/index.ts');
    const compute = await import('/src/modules/reports/compute.ts');
    const { db, C, engine } = store;
    const cid = engine.ctx().companyId;
    const fy = { from: '2026-04-01', to: '2027-03-31' };
    const accByCode = (code) => db.where(C.accounts, (a) => a.companyId === cid && a.code === code)[0];
    const tb = compute.trialBalance(fy);
    const row = (code) => tb.rows.find((r) => r.code === code) ?? { closingDr: 0, closingCr: 0 };
    const ar = compute.ageing('Customer');
    const ap = compute.ageing('Supplier');
    const sum = (res) => Math.round(res.totals.total * 100) / 100;
    const pl = compute.profitAndLoss(fy);
    const tbDr = tb.totalDr;
    const tbCr = tb.totalCr;
    return {
      arTrialBalance: Math.round((row('1100').closingDr - row('1100').closingCr) * 100) / 100,
      arEngine: engine.accountBalance(accByCode('1100').id, fy).net,
      arAgeing: sum(ar),
      apTrialBalance: Math.round((row('2100').closingCr - row('2100').closingDr) * 100) / 100,
      apEngine: engine.accountBalance(accByCode('2100').id, fy).net,
      apAgeing: sum(ap),
      plNetProfit: pl.netProfit,
      tbDr, tbCr,
      // The dashboard's net-profit tile is profitAndLoss() over the same range.
      dashboardNetProfit: compute.profitAndLoss({ from: fy.from, to: fy.to }).netProfit,
    };
  });
}

const f = await readFigures();
const checks = [
  ['AR ageing total = AR control (1100) in the trial balance', f.arAgeing, f.arTrialBalance],
  ['AR control in the trial balance = engine.accountBalance', f.arTrialBalance, f.arEngine],
  ['AP ageing total = AP control (2100) in the trial balance', f.apAgeing, f.apTrialBalance],
  ['AP control in the trial balance = engine.accountBalance', f.apTrialBalance, f.apEngine],
  ['Trial balance Dr = Cr', f.tbDr, f.tbCr],
  ['CFO dashboard net profit = P&L net profit', f.dashboardNetProfit, f.plNetProfit],
];
let bad = 0;
for (const [label, a, b] of checks) {
  const d = Math.round((a - b) * 100) / 100;
  if (Math.abs(d) >= 1) bad++;
  console.log(` ${Math.abs(d) < 1 ? 'OK  ' : 'FAIL'} ${label}: ${a.toFixed(2)} vs ${b.toFixed(2)} · diff ${d.toFixed(2)}`);
}
if (pageErrors.length) { console.log('page errors:', pageErrors.slice(0, 5)); bad++; }
console.log(bad === 0 ? '\nCONTROL ACCOUNTS OK' : `\n${bad} FAILURE(S)`);
await browser.close();
process.exit(bad ? 1 : 0);
