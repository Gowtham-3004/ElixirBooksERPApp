// Admin / IAM walkthrough: invite → accept invitation → activate · lock a period with reason · approve from inbox ·
// create a workflow rule · change plan. Usage: node scripts/walkthrough-admin.mjs [baseUrl]
import { chromium } from 'playwright-core';

// playwright-core rejects in-flight navigation promises when the browser closes; that surfaces as
// an unhandled TargetClosedError *after* the run has finished. Ignore it during teardown only.
let tearingDown = false;
process.on('unhandledRejection', (e) => {
  if (tearingDown && String(e).includes('TargetClosedError')) return;
  console.error(e);
  process.exit(1);
});

const base = process.argv[2] ?? 'http://localhost:5181';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push({ type: 'pageerror', msg: String(e?.message ?? e) }));
page.on('console', (m) => { if (m.type() === 'error' && !/favicon|404/.test(m.text())) errors.push({ type: 'console', msg: m.text().slice(0, 300) }); });
const steps = [];
const ok = (name, pass, note = '') => { steps.push({ name, pass, note }); console.log(`${pass ? 'PASS' : 'FAIL'} ${name}${note ? ' — ' + note : ''}`); };
const wait = (ms) => page.waitForTimeout(ms);

async function signIn(email) {
  await page.goto(base + '/#/', { waitUntil: 'networkidle' });
  const emailInput = page.locator('input[type=email]').first();
  if (!(await emailInput.count())) return;
  await emailInput.fill(email);
  await page.locator('button[type=submit]').first().click();
  await wait(800);
  const mfa = page.locator('input[placeholder="123456"]');
  if (await mfa.count()) { await mfa.fill('123456'); await page.getByText('Verify and sign in').click(); await wait(300); }
  if (await page.locator('.company-picker').count()) { await page.locator('.company-card:not(.create)').first().click(); await wait(300); }
}
async function signOut() {
  await page.evaluate(() => { localStorage.setItem('elixir-books-session', JSON.stringify({ auth: 'login' })); });
  await page.goto(base + '/#/', { waitUntil: 'networkidle' });
  await page.reload({ waitUntil: 'networkidle' });
}

await page.goto(base + '/#/', { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });

// ── 1. Invite a user → open invitation → activate ────────────────────────
await signIn('aarav@acmegroup.in');
await page.goto(base + '/#/admin/users', { waitUntil: 'networkidle' });
await wait(300);
await page.getByRole('button', { name: /Invite user/ }).first().click();
await wait(200);
const emailField = page.locator('.drawer input').nth(1);
await page.locator('.drawer input').nth(0).fill('Test Walkthrough');
await emailField.fill('walkthrough@acmepvt.com');
await page.locator('.drawer .chip', { hasText: 'Accountant' }).first().click();
await page.getByRole('button', { name: 'Send invitation' }).click();
await wait(400);
const linkInput = page.locator('.drawer input').first();
const inviteUrl = await linkInput.inputValue();
ok('Invite user creates invitation link', /#\/invite\?token=/.test(inviteUrl), inviteUrl);
await page.getByRole('button', { name: /Open invitation now/ }).click();
await wait(500);
ok('Invitation screen shows inviter/tenant/role', (await page.getByText('Accept your invitation').count()) > 0 && (await page.getByText('Accountant').count()) > 0);
const pwInputs = page.locator('input[type=password]');
await page.locator('input').first().fill('Test Walkthrough');
await pwInputs.nth(0).fill('Passw0rdX');
await pwInputs.nth(1).fill('Passw0rdX');
await page.getByRole('button', { name: 'Activate account' }).click();
await wait(800);
ok('Activated user lands on Home', (await page.getByText(/Good (morning|afternoon|evening), Test/).count()) > 0);
await signOut();

// ── 2. Lock a period with reason ─────────────────────────────────────────
await signIn('aarav@acmegroup.in');
await page.goto(base + '/#/admin/periods', { waitUntil: 'networkidle' });
await wait(300);
const periodRow = (label) => page.locator('tbody tr').filter({ has: page.locator('td:first-child', { hasText: label }) }).first();
await periodRow('Aug 2026').getByRole('button', { name: 'Lock' }).click();
await wait(300);
const ackBox = page.locator('.modal input[type=checkbox]');
if (await ackBox.count()) await ackBox.first().check();
await page.locator('.modal textarea').first().fill('Month-end close complete — walkthrough lock');
await page.getByRole('button', { name: 'Lock period' }).click();
await wait(500);
ok('Period Aug 2026 locked', (await periodRow('Aug 2026').getByText('Locked').count()) > 0, (await periodRow('Aug 2026').innerText()).replace(/\s+/g, ' ').slice(0, 90));

// ── 3. Approve one approval from the inbox ───────────────────────────────
await page.goto(base + '/#/approvals', { waitUntil: 'networkidle' });
await wait(300);
const before = await page.locator('.filter-tab', { hasText: 'Awaiting me' }).innerText();
const firstApprove = page.locator('tbody tr').first().getByRole('button', { name: 'Approve' });
await firstApprove.click();
await wait(300);
const reasonBox = page.locator('.modal textarea');
if (await reasonBox.count()) await reasonBox.first().fill('Approved in walkthrough — within budget');
await page.locator('.modal').getByRole('button', { name: /^Approve / }).click();
await wait(500);
const after = await page.locator('.filter-tab', { hasText: 'Awaiting me' }).innerText();
ok('Approval processed from inbox', before !== after, `${before.trim()} → ${after.trim()}`);

// ── 4. Create a workflow rule ────────────────────────────────────────────
await page.goto(base + '/#/admin/workflows', { waitUntil: 'networkidle' });
await wait(300);
await page.getByRole('button', { name: /New rule/ }).first().click();
await wait(200);
await page.locator('.drawer input').first().fill('Walkthrough rule');
await page.getByRole('button', { name: 'Save & activate' }).click();
await wait(500);
ok('Workflow rule created and active', (await page.locator('tr', { hasText: 'Walkthrough rule' }).count()) > 0 && (await page.locator('tr', { hasText: 'Walkthrough rule' }).getByText('Active').count()) > 0);

// ── 5. Change plan ───────────────────────────────────────────────────────
await page.goto(base + '/#/admin/plan', { waitUntil: 'networkidle' });
await wait(300);
await page.getByRole('button', { name: 'Upgrade plan' }).click();
await wait(200);
// the seeded tenant may already be on the top tier, so switch to whichever plan is not current
const targetCard = page.locator('.modal .radio-card:not(.selected):not([disabled])', { hasText: /Enterprise|Growth/ }).first();
const targetName = (await targetCard.innerText()).split('·')[0].trim();
await targetCard.click();
await page.locator('.modal').getByRole('button', { name: new RegExp(`(Upgrade|Switch) to ${targetName}`) }).click();
await wait(500);
ok(`Plan changed to ${targetName}`, (await page.locator('main').getByText(targetName).first().count()) > 0 && (await page.getByText(`You are now on ${targetName}`).count()) > 0);

// ── 6. Platform admin sanity ─────────────────────────────────────────────
await signOut();
await signIn('admin@elixirbooks.com');
await page.goto(base + '/#/platform/tenants', { waitUntil: 'networkidle' });
await page.waitForSelector('tbody tr', { timeout: 10000 }).catch(() => {});
await wait(300);
ok('Platform tenants register visible to platform admin', (await page.getByText('4 tenants').count()) > 0 && (await page.locator('tbody tr').count()) >= 4, (await page.locator('main').innerText()).replace(/\s+/g, ' ').slice(0, 120));

console.log(JSON.stringify({ steps, errors: errors.slice(0, 20) }, null, 1));
tearingDown = true;
await browser.close();
process.exit(errors.length || steps.some((s) => !s.pass) ? 1 : 0);
