// End-to-end walkthrough for taxation / payroll / fixed assets / budgets / reports.
// Usage: node scripts/walkthrough-finance.mjs [baseUrl]   (expects a Vite dev server, e.g. `npx vite --port 5185`)
// Steps: submit a pending e-invoice · finalize + post Sep payroll · post Sep depreciation · submit an expense claim ·
//        mark GSTR-1 filed · assert P&L net profit == CFO dashboard net profit tile.
import { chromium } from 'playwright-core';

// playwright-core rejects in-flight navigation promises when the browser closes; that surfaces as
// an unhandled TargetClosedError *after* the run has finished. Ignore it during teardown only.
let tearingDown = false;
process.on('unhandledRejection', (e) => {
  if (tearingDown && String(e).includes('TargetClosedError')) return;
  console.error(e);
  process.exit(1);
});

const base = process.argv[2] ?? 'http://localhost:5185';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e?.message ?? e)));
page.on('console', (m) => { if (m.type() === 'error' && !/favicon|404/.test(m.text())) errors.push(m.text().slice(0, 200)); });
const log = (...a) => console.log('•', ...a);
const go = async (r) => { await page.goto(`${base}/#/${r}`, { waitUntil: 'networkidle' }); await page.waitForTimeout(400); };
const clickText = async (text, exact = true) => { const l = page.getByRole('button', { name: text, exact }).first(); await l.waitFor({ state: 'visible', timeout: 5000 }); await l.click(); await page.waitForTimeout(300); };
const confirmDialog = async (label) => { const b = page.locator('.modal').getByRole('button', { name: label, exact: true }).first(); await b.waitFor({ state: 'visible', timeout: 5000 }); await b.click(); await page.waitForTimeout(500); };
const fillReason = async (text) => { const ta = page.locator('.modal textarea').first(); if (await ta.count()) await ta.fill(text); };
const parseMoney = (s) => Number(String(s).replace(/[^0-9.\-−]/g, '').replace('−', '-'));

// ── sign in ────────────────────────────────────────────────────────────────
await page.goto(base + '/#/', { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });
const email = page.locator('input[type=email]').first();
if (await email.count()) {
  await email.fill(process.env.WALK_USER ?? 'aarav@acmegroup.in'); // tenant owner: payroll + finance rights
  await page.locator('button[type=submit]').first().click();
  await page.waitForTimeout(900);
  const mfa = page.locator('input[placeholder="123456"]');
  if (await mfa.count()) { await mfa.fill('123456'); await page.getByText('Verify and sign in').click(); await page.waitForTimeout(300); }
  const choose = page.getByText('Choose a company');
  if (await choose.count()) { await page.getByText('Acme Private Limited').first().click(); await page.waitForTimeout(300); }
}
log('signed in');

// ── 1. e-invoice: submit a pending document (inv_0118 or the first pending) ───
await go('taxation/einvoices');
const state = await page.evaluate(() => {
  const db = JSON.parse(localStorage.getItem('elixir-books-db') ?? '{}').state ?? {};
  const inv = (db.salesInvoices ?? []).find((d) => d.id === 'inv_0118');
  return { hasInvoices: (db.salesInvoices ?? []).length, inv0118: inv ? { status: inv.status, einv: inv.statutory?.eInvoiceStatus } : null };
});
log('sales invoices in store:', state.hasInvoices, '· inv_0118:', JSON.stringify(state.inv0118));
const pendingTab = page.getByRole('button', { name: /^Pending/ }).first();
if (await pendingTab.count()) await pendingTab.click();
await page.waitForTimeout(300);
const submitBtn = page.locator('table button', { hasText: 'Submit' }).first();
if (await submitBtn.count()) {
  const rowText = await submitBtn.locator('xpath=ancestor::tr').innerText();
  await submitBtn.click();
  await page.waitForTimeout(600);
  const toast = await page.locator('.toast').first().innerText().catch(() => '');
  log('e-invoice submitted for row:', rowText.split('\n')[0], '→', toast);
} else {
  const retry = page.locator('table button', { hasText: 'Fix and retry' }).first();
  if (await retry.count()) { await retry.click(); await page.waitForTimeout(600); log('e-invoice retry →', await page.locator('.toast').first().innerText().catch(() => '')); }
  else log('no pending e-invoice to submit (sales seed may not be present yet) — skipped');
}

// ── 2. payroll: finalize + post Sep run ─────────────────────────────────────
await go('payroll/runs/pr_run_0006');
let finalize = page.getByRole('button', { name: 'Finalize', exact: true }).first();
if (await finalize.count() && await finalize.isEnabled()) {
  await finalize.click();
  await confirmDialog('Finalize run');
  log('payroll Sep finalized');
}
const post = page.getByRole('button', { name: 'Post to ledger', exact: true }).first();
if (await post.count()) {
  await post.click();
  await confirmDialog('Post payroll');
  await page.waitForTimeout(500);
  const hdr = await page.locator('main, body').first().innerText();
  const jv = hdr.match(/journal (JV\/[0-9-]+\/\d+)/);
  log('payroll Sep posted ·', jv ? jv[1] : 'journal number not found in header');
} else log('Sep run already posted or not finalizable');

// ── 3. depreciation: post Sep run ──────────────────────────────────────────
await go('fixed-assets/depreciation');
const depPost = page.getByRole('button', { name: 'Post depreciation', exact: true }).first();
if (await depPost.count() && await depPost.isEnabled()) {
  await depPost.click();
  await confirmDialog('Post depreciation');
  await page.waitForTimeout(500);
  const txt = await page.locator('main, body').first().innerText();
  log('depreciation posted:', (txt.match(/DEP-RUN-\d+/) ?? ['?'])[0]);
} else log('depreciation post disabled:', await depPost.getAttribute('title'));

// ── 4. expense claim: create + submit ──────────────────────────────────────
await go('budgets/expenses/new');
const empPicker = page.locator('.page input[placeholder="Search…"]').first();
if (await empPicker.count()) { await empPicker.click(); await empPicker.fill('Suresh'); await page.waitForTimeout(200); await empPicker.press('Enter'); await page.waitForTimeout(200); }
await page.getByPlaceholder('Client visit — Pune · Safety certification course · Team lunch').fill('Walkthrough — client lunch');
await clickText('+ Add line');
const catSel = page.locator('table select').first();
await catSel.selectOption({ label: 'Entertainment' });
await page.locator('table input[type=number]').first().fill('1800');
await page.locator('table input[type=checkbox]').first().check();
await page.waitForTimeout(200);
await clickText('Submit claim');
await confirmDialog('Submit claim');
await page.waitForTimeout(600);
const claimHdr = await page.locator('.doc-rail').first().innerText().catch(() => '');
log('expense claim submitted:', claimHdr.split('\n').slice(0, 3).join(' · '));

// ── 5. GSTR-1: mark as filed ───────────────────────────────────────────────
await go('taxation/gstr1');
const filedBanner = page.getByText(/was filed on/);
if (await filedBanner.count()) log('GSTR-1 for current period already filed');
else {
  await clickText('Mark as filed');
  await confirmDialog('Mark as filed');
  await page.waitForTimeout(500);
  const t = await page.locator('main, body').first().innerText();
  log('GSTR-1 filed:', (t.match(/ARN\s+([A-Z0-9]+)/) ?? ['?'])[0]);
}

// ── 6. P&L net profit == dashboard net profit tile ─────────────────────────
await go('reports/pl');
const plTile = page.locator('.kpi-tile', { hasText: 'Net profit' }).first();
const plNet = parseMoney((await plTile.innerText()).split('\n')[1]);
await go('reports/dashboard');
const dashTile = page.locator('.kpi-tile', { hasText: /Net profit/i }).first();
const dashRaw = (await dashTile.innerText()).split('\n')[1];
// dashboard uses compact money (₹x.xx L / Cr) — compare with the same compaction
const compact = (n) => { const a = Math.abs(n); const s = n < 0 ? '−' : ''; if (a >= 1e7) return `${s}₹${(a / 1e7).toFixed(2)} Cr`; if (a >= 1e5) return `${s}₹${(a / 1e5).toFixed(2)} L`; return `${s}₹${a.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; };
const match = dashRaw.trim() === compact(plNet);
log(`P&L net profit ${plNet} → compact ${compact(plNet)} · dashboard tile "${dashRaw.trim()}" · ${match ? 'MATCH' : 'MISMATCH'}`);

console.log(JSON.stringify({ ok: match && errors.length === 0, plNet, dashboard: dashRaw.trim(), errors }, null, 1));
tearingDown = true;
await browser.close();
process.exit(match && errors.length === 0 ? 0 : 1);
