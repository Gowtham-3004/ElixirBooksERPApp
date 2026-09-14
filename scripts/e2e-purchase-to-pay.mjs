// E2E-02 Purchase-to-pay acceptance walkthrough (FRD §23).
// Requisition → PO → approval → partial GRN with QC rejection → vendor invoice with a price
// exception → resolve → post → payment batch (maker-checker, bank file, UTR) → statement import
// → reconciliation match + confirm → supplier ledger / AP ageing verification.
// Usage: npx vite --port 5184 --strictPort   then   node scripts/e2e-purchase-to-pay.mjs http://localhost:5184
import { chromium } from 'playwright-core';
import fs from 'node:fs';

// playwright-core rejects in-flight navigation promises when the browser closes; that surfaces as
// an unhandled TargetClosedError *after* the run has finished. Ignore it during teardown only.
let tearingDown = false;
process.on('unhandledRejection', (e) => {
  if (tearingDown && String(e).includes('TargetClosedError')) return;
  console.error(e);
  process.exit(1);
});
const base = process.argv[2] ?? 'http://localhost:5184';
const dir = process.env.E2E_OUT ?? 'scripts/.e2e-out'; fs.mkdirSync(dir, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 }, acceptDownloads: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e?.message ?? e)));
page.on('console', (m) => { if (m.type() === 'error' && !/favicon|404/.test(m.text())) errors.push(m.text().slice(0, 300)); });
let step = 0;
const log = (...a) => console.log(`[${++step}]`, ...a);
const shot = (n) => page.screenshot({ path: `${dir}/${String(step).padStart(2, '0')}-${n}.png` });
const fail = async (msg) => { await shot('FAIL'); console.error('FAIL:', msg); console.error('errors', errors); await browser.close(); process.exit(1); };
const expectText = async (t, msg) => { const body = await page.locator('body').innerText(); if (!body.includes(t)) await fail(`${msg ?? ''} expected text "${t}"`); };
const go = async (r) => { await page.goto(`${base}/#/${r}`, { waitUntil: 'networkidle' }); await page.waitForTimeout(400); };
async function login(email) {
  await page.evaluate(() => { localStorage.setItem('elixir-books-session', JSON.stringify({ auth: 'login' })); });
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(300);
  const emailInput = page.locator('input[type=email]').first();
  await emailInput.fill(email); await page.locator('button[type=submit]').first().click(); await page.waitForTimeout(700);
  const mfa = page.locator('input[placeholder="123456"]'); if (await mfa.count()) { await mfa.fill('123456'); await page.getByText('Verify and sign in').click(); await page.waitForTimeout(400); }
  const choose = page.locator('.company-picker'); if (await choose.count()) { await page.locator('.company-card:not(.create)').first().click(); await page.waitForTimeout(400); }
  log('logged in as', email);
}
const pickEntity = async (scope, query) => { const box = scope.locator('.field-input').first(); await box.click(); await page.waitForTimeout(100); const input = scope.locator('input[placeholder]').first(); await input.click(); await input.fill(query); await page.waitForTimeout(250); await page.locator('.menu .menu-item').first().click(); await page.waitForTimeout(200); };
const confirmDialog = async (label) => { const btn = page.locator('.modal').getByRole('button', { name: label, exact: true }); await btn.click(); await page.waitForTimeout(500); };
const fillReason = async (text) => { const ta = page.locator('.modal textarea').first(); if (await ta.count()) await ta.fill(text); };
const idFromUrl = () => page.url().split('#/')[1].split('?')[0].split('/')[2];

await page.goto(base + '/#/', { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.clear());
await login('rahul@acmepvt.com');

// ── 1. Requisition → approve (no workflow → auto) ─────────────────────────
await go('purchase/requisitions/new');
await page.getByText('+ Add line').click(); await page.waitForTimeout(150);
let row = page.locator('table tbody tr').nth(0); await pickEntity(row, 'Hex Bolt');
await row.locator('input.num').nth(0).fill('500'); await row.locator('input.num').nth(0).press('Tab');
await page.getByText('+ Add line').click(); await page.waitForTimeout(150);
row = page.locator('table tbody tr').nth(1); await pickEntity(row, 'Hex Nut');
await row.locator('input.num').nth(0).fill('300'); await row.locator('input.num').nth(0).press('Tab');
await page.locator('textarea').first().fill('E2E-02 hardware restock');
await page.getByRole('button', { name: 'Submit requisition' }).click(); await page.waitForTimeout(600);
await expectText('Approved', 'requisition auto-approved'); const reqId = idFromUrl(); log('requisition', reqId, 'Approved'); await shot('requisition');

// ── 2. Convert to PO → submit for approval ────────────────────────────────
await page.getByRole('button', { name: 'Convert to PO' }).click(); await page.waitForTimeout(200);
await pickEntity(page.locator('.modal'), 'Shree');
await page.locator('.modal').getByRole('button', { name: 'Create PO' }).click(); await page.waitForTimeout(700);
if (!page.url().includes('/edit')) await fail('expected PO edit page, got ' + page.url());
const poId = idFromUrl(); log('PO draft', poId);
await page.getByRole('button', { name: 'Submit for approval' }).click(); await page.waitForTimeout(700);
await expectText('Awaiting approval', 'PO submitted'); await shot('po-submitted');

// ── 3. Approve as tenant owner (Dept head → Finance) ──────────────────────
await login('aarav@acmegroup.in');
await go(`purchase/orders/${poId}`);
for (let i = 0; i < 2; i++) { const b = page.getByRole('button', { name: 'Approve', exact: true }); if (!(await b.count())) break; await b.click(); await page.waitForTimeout(200); await fillReason('Approved in E2E-02 walkthrough'); await confirmDialog('Approve PO'); await page.waitForTimeout(400); }
await go(`purchase/orders/${poId}`); await expectText('Approved — ready for receipt', 'PO approved'); log('PO approved'); await shot('po-approved');

// ── 4. Partial GRN with 20 rejected ───────────────────────────────────────
await login('rahul@acmepvt.com');
await go(`purchase/grn/new?po=${poId}`);
row = page.locator('table tbody tr').filter({ hasText: 'Hex Bolt' }).first();
await row.locator('input.num').nth(0).fill('300'); await row.locator('input.num').nth(0).press('Tab');
await row.locator('input.num').nth(2).fill('20'); await row.locator('input.num').nth(2).press('Tab');
await row.locator('select').nth(0).selectOption('Return to supplier');
await page.getByRole('button', { name: 'Post receipt' }).click(); await page.waitForTimeout(800);
await expectText('Partial Accept', 'GRN partial accept'); const grnId = idFromUrl(); log('GRN posted', grnId); await shot('grn');
await go('inventory/ledger'); await expectText('GRN/26-27/', 'ledger shows GRN'); log('stock ledger updated');

// ── 5. Vendor invoice from GRN with price exception ───────────────────────
await go(`purchase/vendor-invoices/new?po=${poId}&grn=${grnId}`);
await page.locator('input[placeholder="As printed on the supplier\'s bill"]').fill('SSL/E2E/0007');
row = page.locator('table tbody tr').filter({ hasText: 'Hex Bolt' }).first();
await row.locator('input.num').nth(1).fill('30'); await row.locator('input.num').nth(1).press('Tab'); await page.waitForTimeout(200);
await expectText('matching exception(s) will be raised', 'match preview warns');
await page.getByRole('button', { name: 'Submit & match' }).click(); await page.waitForTimeout(800);
await expectText('Posting blocked', 'invoice blocked by exception'); const invId = idFromUrl(); log('vendor invoice submitted with exception', invId); await shot('invoice-exception');

// ── 6. Resolve exception → post invoice ───────────────────────────────────
await go('purchase/exceptions');
await page.locator('table tbody tr').filter({ hasText: 'SSL/E2E/0007' }).first().click(); await page.waitForTimeout(500);
await page.locator('.drawer textarea').first().fill('Rate increase agreed with supplier over phone (E2E-02)');
await page.locator('.drawer').getByRole('button', { name: 'Resolve exception' }).click(); await page.waitForTimeout(600);
await go(`purchase/vendor-invoices/${invId}`); await expectText('ready to post', 'invoice approved after resolution');
await page.getByRole('button', { name: 'Post invoice' }).first().click(); await page.waitForTimeout(200); await confirmDialog('Post invoice'); await page.waitForTimeout(500);
await expectText('Posted', 'invoice posted'); const invNumber = (await page.locator('.doc-rail .identifier').first().innerText()).trim(); log('invoice posted', invNumber); await shot('invoice-posted');

// ── 7. Payment batch: proposal → submit → approve (Anita) → file → UTR → complete ──
await go('purchase/ageing'); await expectText('Shree Suppliers', 'ageing shows Shree');
await page.getByRole('button', { name: 'Create payment proposal' }).click(); await page.waitForTimeout(300);
const prow = page.locator('.modal table tbody tr').filter({ hasText: invNumber }).first(); await prow.locator('input[type=checkbox]').check();
await page.locator('.modal').getByRole('button', { name: /Create batch/ }).click(); await page.waitForTimeout(700);
const batchId = idFromUrl(); log('batch created', batchId);
await page.getByRole('button', { name: 'Submit for approval' }).click(); await page.waitForTimeout(200); await confirmDialog('Submit batch');
await expectText('Awaiting approval', 'batch submitted');
await login('anita@acmepvt.com'); await go(`purchase/batches/${batchId}`);
await page.getByRole('button', { name: 'Approve', exact: true }).click(); await page.waitForTimeout(200); await confirmDialog('Approve batch'); await page.waitForTimeout(400);
await expectText('Generate bank file', 'batch approved'); log('batch approved by Anita');
const dl = page.waitForEvent('download'); await page.getByRole('button', { name: 'Generate bank file' }).click(); const d = await dl; log('bank file', d.suggestedFilename()); await page.waitForTimeout(300);
await page.getByRole('button', { name: 'Mark sent to bank' }).click(); await page.waitForTimeout(200); await confirmDialog('Mark sent to bank');
await page.locator('input[placeholder="UTR or bank error"]').first().fill('UTR/E2E02/000123');
await page.getByRole('button', { name: 'Accepted', exact: true }).click(); await page.waitForTimeout(300);
await page.getByRole('button', { name: 'Complete batch' }).click(); await page.waitForTimeout(200); await confirmDialog('Complete batch'); await page.waitForTimeout(500);
await expectText('Completed', 'batch completed'); await shot('batch-completed');
const pmtNumber = (await page.locator('table tbody tr td .identifier.link').filter({ hasText: 'PMT/' }).first().innerText()).trim();
const netCell = await page.locator('table tfoot td').nth(3).innerText(); log('payment', pmtNumber, 'net', netCell);
const net = Number(netCell.replace(/[^0-9.]/g, ''));

// ── 8. Statement import → match → confirm ─────────────────────────────────
await login('rahul@acmepvt.com');
const t = new Date(); const dd = String(t.getDate()).padStart(2, '0'); const mm = String(t.getMonth() + 1).padStart(2, '0'); const yyyy = t.getFullYear();
const csv = `Date,Narration,Chq./Ref.No.,Withdrawal Amt.,Deposit Amt.,Closing Balance\n${dd}/${mm}/${yyyy},NEFT SHREE SUPPLIERS LTD ${pmtNumber},UTR/E2E02/000123,${net.toFixed(2)},,\n`;
fs.writeFileSync(`${dir}/hdfc-e2e.csv`, csv);
await go('banking/statements'); await page.getByRole('button', { name: '+ Import statement' }).click(); await page.waitForTimeout(300);
await page.locator('.drawer input[type=file]').setInputFiles(`${dir}/hdfc-e2e.csv`); await page.waitForTimeout(500);
await page.locator('.drawer').getByRole('button', { name: 'Validate' }).click(); await page.waitForTimeout(300);
await page.locator('.drawer').getByRole('button', { name: 'Use computed closing' }).click(); await page.waitForTimeout(300);
await expectText('All checks passed', 'statement validation');
await page.locator('.drawer').getByRole('button', { name: 'Review commit' }).click(); await page.waitForTimeout(300);
await page.locator('.drawer').getByRole('button', { name: /Import \d+ lines/ }).click(); await page.waitForTimeout(700);
await expectText('hdfc-e2e.csv', 'statement listed'); log('statement imported'); await shot('statement');
const ms = `${yyyy}-${mm}-01`; const me = new Date(yyyy, t.getMonth() + 1, 0); const meS = `${yyyy}-${mm}-${String(me.getDate()).padStart(2, '0')}`;
await go(`banking/reconciliation?account=acc_1310&from=${ms}&to=${meS}`);
const srow = page.locator('table tbody tr').filter({ hasText: 'NEFT SHREE SUPPLIERS' }).first();
await expectText('Suggested', 'suggestion shown'); await srow.getByText('Match', { exact: true }).click(); await page.waitForTimeout(500);
await expectText(`↔ ${pmtNumber}`, 'line matched to payment'); log('statement line matched'); await shot('recon-matched');
await page.getByRole('button', { name: 'Confirm reconciliation' }).first().click(); await page.waitForTimeout(300);
const unexplained = await page.locator('.modal .kv .v').last().innerText(); log('unexplained', unexplained);
await confirmDialog('Confirm reconciliation'); await page.waitForTimeout(600);
await expectText('Bank reconciliation statement', 'BRS report'); await shot('brs');

// ── 9. Verify supplier ledger + AP ageing ─────────────────────────────────
await go('purchase/ageing/sup_shree'); await expectText(pmtNumber, 'supplier ledger shows payment'); await expectText('Settled', 'invoice settled');
await go('purchase/ageing'); const ageText = await page.locator('body').innerText(); log('AP ageing lists Shree?', ageText.includes('Shree Suppliers') ? 'yes (other open items / advance)' : 'no');
await go(`purchase/orders/${poId}`); await expectText('Partially Received', 'PO status');
console.log('E2E-02 PASSED · errors:', errors);
// settle any navigation still in flight before tearing the browser down, otherwise Playwright
// rejects the pending goto with TargetClosedError after the run has already succeeded
await page.waitForTimeout(200);
tearingDown = true;
await page.close().catch(() => {});
await browser.close().catch(() => {});
process.exit(errors.length ? 1 : 0);
