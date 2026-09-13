// End-to-end walkthrough for Masters & Accounting (needs a Vite dev server, default http://localhost:5182):
//  1. customer with a duplicate GSTIN is blocked      2. manual journal: create → submit → approve → post → reverse (reason)
//  3. price-resolution tester                          4. import 2 items via the wizard sample
// Usage: node scripts/walkthrough-masters-accounting.mjs [baseUrl]
import { chromium } from 'playwright-core';

// playwright-core rejects in-flight navigation promises when the browser closes; that surfaces as
// an unhandled TargetClosedError *after* the run has finished. Ignore it during teardown only.
let tearingDown = false;
process.on('unhandledRejection', (e) => {
  if (tearingDown && String(e).includes('TargetClosedError')) return;
  console.error(e);
  process.exit(1);
});

const base = process.argv[2] ?? 'http://localhost:5182';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e?.message ?? e)));
page.on('console', (m) => { if (m.type() === 'error' && !/favicon|404/.test(m.text())) errors.push(m.text().slice(0, 200)); });
const results = [];
const step = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`); };
const wait = (ms) => page.waitForTimeout(ms);

async function login(email) {
  await page.goto(base + '/#/', { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.removeItem('elixir-books-session'));
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('input[type=email]').first().fill(email);
  await page.locator('button[type=submit]').first().click();
  await wait(700);
  const mfa = page.locator('input[placeholder="123456"]');
  if (await mfa.count()) { await mfa.fill('123456'); await page.getByText('Verify and sign in').click(); await wait(400); }
  if (await page.getByText('Choose a company').count()) { await page.getByText('Acme Private Limited').first().click(); await wait(400); }
}
const go = async (path) => { await page.goto(`${base}/#/${path}`, { waitUntil: 'networkidle' }); await wait(400); };
const fieldByLabel = (label) => page.locator('label.field-label', { hasText: label }).first().locator('xpath=following-sibling::*[1]//input | following-sibling::input | following-sibling::*[1]//textarea | following-sibling::textarea').first();

try {
  await page.goto(base + '/#/', { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await login('rahul@acmepvt.com');

  // ── 1. Duplicate GSTIN is blocked ──────────────────────────────────────
  await go('masters/customers');
  await page.getByRole('button', { name: '+ New customer' }).click();
  await wait(300);
  await fieldByLabel('Legal name').fill('Dup Test Traders');
  await fieldByLabel('GSTIN').fill('27AAAPL1234C1Z5'); // Arlene Traders' GSTIN
  await fieldByLabel('GSTIN').blur();
  await wait(300);
  const dupBanner = page.locator('.banner.danger', { hasText: 'Duplicate blocked' });
  const createBtn = page.getByRole('button', { name: 'Create customer' });
  step('Duplicate GSTIN blocked with banner', (await dupBanner.count()) > 0, (await dupBanner.first().innerText().catch(() => '')).slice(0, 90));
  step('Create customer button disabled on duplicate', await createBtn.isDisabled());
  await page.keyboard.press('Escape');
  await wait(200);

  // ── 4. Import 2 items via wizard sample ────────────────────────────────
  await go('masters/items');
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  await wait(300);
  await page.getByRole('button', { name: 'Load sample data' }).click();
  await wait(300);
  await page.getByRole('button', { name: 'Run dry-run' }).click();
  await wait(300);
  const valid = await page.locator('.summary-block').innerText();
  await page.getByRole('button', { name: 'Review commit' }).click();
  await wait(300);
  await page.getByRole('button', { name: /Import \d+ rows/ }).click();
  await wait(600);
  const earl = await page.getByText('Earl Grey Tea 250 g').count();
  const washer = await page.getByText('Spring Washer M16').count();
  step('Imported 2 items via wizard sample', earl > 0 && washer > 0, valid.replace(/\s+/g, ' ').slice(0, 80));

  // ── 3. Price-resolution tester ─────────────────────────────────────────
  await go('masters/price-lists/pl_wholesale');
  await page.getByRole('button', { name: 'Test resolution' }).click();
  await wait(300);
  const itemField = page.locator('label.field-label', { hasText: 'Item' }).first().locator('xpath=following-sibling::*[1]');
  await itemField.locator('.field-input').first().click(); // picker shows the selected value until clicked
  await wait(150);
  const itemPicker = itemField.locator('input').first();
  await itemPicker.fill('Masala Chai');
  await wait(300);
  await page.keyboard.press('Enter');
  const qty = page.locator('label.field-label', { hasText: 'Quantity' }).first().locator('xpath=following-sibling::*[1]//input').first();
  await qty.fill('500');
  await qty.blur();
  await wait(300);
  const resText = await page.locator('.card', { hasText: 'Resolution hierarchy' }).innerText();
  step('Price tester resolves tier rate 142 from Wholesale for qty 500', /142\.00/.test(resText) && /Wholesale/.test(resText), resText.replace(/\s+/g, ' ').slice(0, 120));

  // ── 2a. Manual journal: create + submit (Rahul) ────────────────────────
  await go('accounting/journals/new');
  await page.locator('textarea').first().fill('E2E walkthrough: bank charges reclass test');
  const rows = page.locator('table.data-table tbody tr');
  const r1 = rows.nth(0);
  await r1.getByPlaceholder('Account…').click();
  await r1.getByPlaceholder('Account…').fill('5400');
  await wait(250);
  await page.keyboard.press('Enter');
  await r1.locator('input[type=number]').fill('1250');
  const r2 = rows.nth(1);
  await r2.getByPlaceholder('Account…').click();
  await r2.getByPlaceholder('Account…').fill('1310');
  await wait(250);
  await page.keyboard.press('Enter');
  await r2.getByRole('button', { name: 'Cr', exact: true }).click();
  await r2.locator('input[type=number]').fill('1250');
  await wait(200);
  const balanced = (await page.locator('tfoot').innerText()).includes('Balanced');
  step('Journal lines balanced banner', balanced);
  await page.getByRole('button', { name: 'Save & submit for approval' }).click();
  await wait(800);
  const url = page.url();
  const jvId = url.split('/journals/')[1]?.split('?')[0];
  const submitted = (await page.locator('.doc-rail .badge', { hasText: 'Submitted' }).count()) > 0;
  step('Journal saved and submitted for approval', submitted && !!jvId, jvId);

  // ── 2b. Approve → post → reverse (Aarav, tenant owner) ─────────────────
  await login('aarav@acmegroup.in');
  await go(`accounting/journals/${jvId}`);
  await page.getByRole('button', { name: 'Approve', exact: true }).click();
  await wait(300);
  await page.locator('.modal textarea').fill('Reviewed the reclass — supporting bank advice attached');
  await page.locator('.modal').getByRole('button', { name: 'Approve journal' }).click();
  await wait(500);
  step('Journal approved', (await page.locator('.doc-rail .badge', { hasText: 'Approved' }).count()) > 0);
  await page.locator('.doc-footer').getByRole('button', { name: 'Post journal' }).click();
  await wait(300);
  await page.locator('.modal').getByRole('button', { name: 'Post journal' }).click();
  await wait(600);
  const number = await page.locator('.doc-rail .identifier').first().innerText();
  step('Journal posted with number', (await page.locator('.doc-rail .badge', { hasText: 'Posted' }).count()) > 0 && /JV\/26-27\/\d{4}/.test(number), number);
  await page.locator('.doc-footer').getByRole('button', { name: 'Reverse' }).click();
  await wait(300);
  await page.locator('.modal textarea').fill('Posted to the wrong bank account — reversing per review');
  await page.locator('.modal').getByRole('button', { name: 'Reverse journal' }).click();
  await wait(800);
  const revBanner = await page.locator('.banner', { hasText: 'Reversal of' }).count();
  step('Reversal journal created with reason', revBanner > 0, page.url().split('#/')[1]);
  await go(`accounting/journals/${jvId}`);
  step('Original journal marked Reversed', (await page.locator('.doc-rail .badge', { hasText: 'Reversed' }).count()) > 0);

  // trial balance still reconciles
  await go('accounting/trial-balance');
  const tbBanner = await page.locator('.banner').first().innerText();
  step('Trial balance reconciles after walkthrough', tbBanner.includes('reconciles'), tbBanner.slice(0, 100));
} catch (e) {
  step('Walkthrough crashed', false, String(e?.message ?? e).slice(0, 300));
}

console.log(JSON.stringify({ passed: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length, errors: errors.slice(0, 10) }, null, 1));
tearingDown = true;
await browser.close();
process.exit(results.some((r) => !r.ok) || errors.length ? 1 : 0);
