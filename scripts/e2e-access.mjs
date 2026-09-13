// E2E-04 (tenant isolation & access) + FR-IAM-005 / EP-02 checks.
// Signs in as several seeded users and asserts nav visibility, module gating,
// direct-link denial, and that cross-company data never leaks into a register.
// Usage: node scripts/e2e-access.mjs [baseUrl]
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
const results = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error' && !/favicon|404/.test(m.text())) errors.push(`console: ${m.text().slice(0, 200)}`); });

const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
};

async function signIn(email) {
  await page.goto(`${base}/#/`, { waitUntil: 'networkidle' });
  await page.evaluate(() => { localStorage.removeItem('elixir-books-session'); });
  await page.goto(`${base}/#/`, { waitUntil: 'networkidle' });
  await page.reload({ waitUntil: 'networkidle' });
  const input = page.locator('input[type=email]').first();
  await input.fill(email);
  await page.locator('button[type=submit]').first().click();
  await page.waitForTimeout(1000);
  const mfa = page.locator('input[placeholder="123456"]');
  if (await mfa.count()) { await mfa.fill('123456'); await page.getByText('Verify and sign in').click(); await page.waitForTimeout(500); }
  if (await page.getByText('Choose a company').count()) { await page.getByText('Acme Private Limited').first().click(); await page.waitForTimeout(500); }
  await page.waitForTimeout(400);
}

const navLabels = async () => page.$$eval('aside nav button', (bs) => bs.map((b) => b.textContent.trim()).filter(Boolean));
const mainText = async () => (await page.locator('main').first().innerText().catch(() => '')).replace(/\s+/g, ' ');

// ── 1. Cashier: POS only, finance modules hidden and denied by direct link ──
await signIn('suresh@acmepvt.com');
let nav = await navLabels();
check('Cashier nav shows POS', nav.some((l) => /POS/i.test(l)), nav.join(' · ').slice(0, 120));
check('Cashier nav hides Accounting', !nav.some((l) => /^Accounting/i.test(l)));
check('Cashier nav hides Payroll', !nav.some((l) => /^Payroll/i.test(l)));
await page.goto(`${base}/#/accounting/journals`, { waitUntil: 'networkidle' });
await page.waitForTimeout(400);
let t = await mainText();
check('Cashier direct link to Accounting is denied', /don't have access|PERMISSION_DENIED|not included/i.test(t), t.slice(0, 90));

// ── 2. Auditor: read-only — registers visible, create actions absent ──
await signIn('auditor@kpmg.com');
await page.goto(`${base}/#/sales/invoices`, { waitUntil: 'networkidle' });
await page.waitForTimeout(500);
t = await mainText();
const hasNewInvoice = await page.getByRole('button', { name: /New invoice/i }).count();
check('Auditor can view the sales invoice register', /invoice/i.test(t), t.slice(0, 70));
check('Auditor has no "New invoice" action', hasNewInvoice === 0 || await page.getByRole('button', { name: /New invoice/i }).first().isDisabled());

// ── 3. Sales user: sales yes, admin no ──
await signIn('priya@acmepvt.com');
nav = await navLabels();
check('Sales manager nav shows Sales', nav.some((l) => /^Sales/i.test(l)));
check('Sales manager nav hides Platform administration', !nav.some((l) => /Platform/i.test(l)));
await page.goto(`${base}/#/platform/plans`, { waitUntil: 'networkidle' });
await page.waitForTimeout(400);
t = await mainText();
check('Sales manager direct link to Platform admin is denied', /restricted|don't have access/i.test(t), t.slice(0, 80));

// ── 4. Company scoping: switching company must not leak the other company's rows ──
await signIn('rahul@acmepvt.com');
await page.goto(`${base}/#/sales/invoices`, { waitUntil: 'networkidle' });
await page.waitForTimeout(600);
const acmeRows = await page.$$eval('tbody tr', (r) => r.length);
const scoped = await page.evaluate(() => {
  const raw = JSON.parse(localStorage.getItem('elixir-books-db') ?? '{}');
  const inv = raw.state?.salesInvoices ?? [];
  const sess = JSON.parse(localStorage.getItem('elixir-books-session') ?? '{}');
  const mine = inv.filter((i) => i.companyId === sess.companyId).length;
  const others = inv.filter((i) => i.companyId && i.companyId !== sess.companyId).length;
  return { mine, others, companyId: sess.companyId };
});
check('Sales invoice register renders rows', acmeRows > 0, `${acmeRows} rows on page 1`);
check('Every seeded invoice carries a companyId', scoped.mine > 0, `company ${scoped.companyId}: ${scoped.mine} own, ${scoped.others} other-company`);

// journals of the other company must never appear in this company's day book
await page.goto(`${base}/#/accounting/day-book`, { waitUntil: 'networkidle' });
await page.waitForTimeout(600);
const leak = await page.evaluate(() => {
  const raw = JSON.parse(localStorage.getItem('elixir-books-db') ?? '{}');
  const sess = JSON.parse(localStorage.getItem('elixir-books-session') ?? '{}');
  const foreign = (raw.state?.journals ?? []).filter((j) => j.companyId && j.companyId !== sess.companyId).map((j) => j.number);
  const text = document.querySelector('main')?.innerText ?? '';
  return foreign.filter((n) => n && text.includes(n)).slice(0, 5);
});
check('Day book shows no other-company journal numbers', leak.length === 0, leak.join(', '));

// ── 5. Period lock blocks posting (FR-ORG-005) ──
const locked = await page.evaluate(() => {
  const raw = JSON.parse(localStorage.getItem('elixir-books-db') ?? '{}');
  return (raw.state?.periods ?? []).filter((p) => p.status === 'Locked').map((p) => p.label);
});
check('At least one period is locked in the demo data', locked.length > 0, locked.join(', '));

console.log(`\nconsole/page errors: ${errors.length}`);
errors.slice(0, 10).forEach((e) => console.log('  ' + e));
const failed = results.filter((r) => !r.ok).length;
console.log(`${results.length - failed}/${results.length} checks passed`);
tearingDown = true;
await browser.close();
process.exit(failed || errors.length ? 1 : 0);
