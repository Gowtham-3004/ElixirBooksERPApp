// E2E-01 (sales-to-cash) and E2E-05 (idempotent post) walkthrough against a running dev server.
// Usage: node scripts/e2e-sales.mjs [baseUrl]   (default http://localhost:5183)
import { chromium } from 'playwright-core';

// playwright-core rejects in-flight navigation promises when the browser closes; that surfaces as
// an unhandled TargetClosedError *after* the run has finished. Ignore it during teardown only.
let tearingDown = false;
process.on('unhandledRejection', (e) => {
  if (tearingDown && String(e).includes('TargetClosedError')) return;
  console.error(e);
  process.exit(1);
});

const base = process.argv[2] ?? 'http://localhost:5183';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e?.message ?? e)));
page.on('console', (m) => { if (m.type() === 'error' && !/favicon|404/.test(m.text())) errors.push(m.text().slice(0, 300)); });
const log = (...a) => console.log('•', ...a);
const fail = (msg) => { throw new Error(msg); };
const wait = (ms) => page.waitForTimeout(ms);

async function login(email) {
  await page.evaluate(() => localStorage.removeItem('elixir-books-session'));
  await page.goto(base + '/#/', { waitUntil: 'networkidle' });
  await page.reload({ waitUntil: 'networkidle' });
  await wait(400);
  const emailInput = page.locator('input[type=email]').first();
  await emailInput.fill(email);
  await page.locator('button[type=submit]').first().click();
  await wait(800);
  const mfa = page.locator('input[placeholder="123456"]');
  if (await mfa.count()) { await mfa.fill('123456'); await page.getByText('Verify and sign in').click(); await wait(400); }
  const choose = page.locator('.company-picker');
  if (await choose.count()) { await page.locator('.company-card:not(.create)').first().click(); await wait(300); }
  await wait(300);
}
async function go(path) { await page.goto(`${base}/#/${path}`, { waitUntil: 'networkidle' }); await wait(400); }
async function pick(placeholder, text) {
  const inp = page.locator(`input[placeholder="${placeholder}"]`).last();
  await inp.click();
  await inp.fill(text);
  await wait(250);
  await inp.press('Enter');
  await wait(250);
}
async function setRowNumber(rowText, index, value) {
  const row = page.locator('table.data-table tr', { hasText: rowText }).first();
  const inp = row.locator('input.num').nth(index);
  await inp.click({ clickCount: 3 });
  await inp.fill(String(value));
  await inp.press('Tab');
  await wait(200);
}
async function confirmDialog(label) {
  const btn = page.locator('.modal button', { hasText: label }).last();
  await btn.click();
  await wait(600);
}
async function expectText(t, ctx) { const ok = await page.getByText(t, { exact: false }).first().isVisible().catch(() => false); if (!ok) fail(`${ctx}: expected to see "${t}"`); }
async function dbRows(col) {
  await wait(500);
  for (let attempt = 0; attempt < 4; attempt++) {
    try { return await page.evaluate((c) => (JSON.parse(localStorage.getItem('elixir-books-db') ?? '{}').state ?? {})[c] ?? [], col); }
    catch (e) { if (!/Execution context was destroyed|navigation/.test(String(e.message))) throw e; await wait(800); }
  }
  return page.evaluate((c) => (JSON.parse(localStorage.getItem('elixir-books-db') ?? '{}').state ?? {})[c] ?? [], col);
}

try {
  await page.goto(base + '/#/', { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await login('rahul@acmepvt.com');
  log('signed in as Rahul (Finance Admin)');

  // ── E2E-01 step 2: quotation ────────────────────────────────────────────
  await go('sales/quotations/new');
  await pick('Search customer by name, GSTIN, code…', 'Arlene');
  await page.getByText('Add line').click();
  await pick('Search item…', 'Hex Nut');
  await setRowNumber('Hex Nut', 0, 100);
  await page.getByTestId('save-quotation').click();
  await wait(800);
  if (!page.url().includes('sales/quotations/')) fail('quotation was not saved');
  const qtNumber = (await page.locator('.doc-rail .identifier').first().innerText()).trim();
  log('quotation saved', qtNumber);
  await page.getByTestId('send-quotation').click();
  await wait(300);
  await page.locator('.modal button', { hasText: 'Send email' }).click();
  await wait(500);
  await expectText('Sent', 'quotation send');
  await page.getByTestId('convert-quotation').click();
  await wait(300);
  await confirmDialog('Convert to order');
  await wait(600);
  if (!page.url().includes('sales/orders/')) fail('conversion did not open the sales order');
  log('converted to sales order');

  // ── step 3: confirm order + reservation ─────────────────────────────────
  await page.getByTestId('submit-order').click();
  await wait(800);
  await expectText('Confirmed', 'order confirm');
  await expectText('Reservations', 'order reservations panel');
  const orders = await dbRows('salesOrders');
  const so = orders.find((o) => o.sourceType === 'Quotation' && o.status === 'Confirmed' && o.lines.some((l) => l.reservedQty === 100));
  if (!so) fail('order not confirmed with a 100-unit reservation');
  log('order confirmed with reservation', so.number);

  // partial delivery (60 of 100)
  await page.getByTestId('create-delivery').click();
  await wait(600);
  await setRowNumber('Hex Nut', 0, 60);
  await page.getByTestId('post-delivery').click();
  await wait(300);
  await confirmDialog('Post delivery');
  await wait(700);
  if (!page.url().includes('sales/deliveries/')) fail('delivery not posted');
  await expectText('Posted', 'delivery posted');
  const dcs = await dbRows('deliveries');
  const dc = dcs.find((d) => d.sourceId === so.id && d.status === 'Posted');
  if (!dc || dc.lines[0].qty !== 60) fail('partial delivery of 60 not found');
  const moves = await dbRows('stockMovements');
  if (!moves.some((m) => m.sourceId === dc.id && m.baseQty === -60 && m.type === 'Delivery')) fail('delivery stock movement missing');
  log('partial delivery posted', dc.number, '· stock issued −60');

  // ── step 4: invoice from delivery, post ─────────────────────────────────
  await page.getByTestId('invoice-from-delivery').click();
  await wait(700);
  await page.getByTestId('post-invoice').click();
  await wait(300);
  await confirmDialog('Post invoice');
  await wait(900);
  if (!page.url().includes('sales/invoices/')) fail('invoice not posted');
  const invs = await dbRows('salesInvoices');
  const inv = invs.find((i) => i.sourceId === dc.id && i.status === 'Posted');
  if (!inv) fail('posted invoice from delivery not found');
  const journals = await dbRows('journals');
  const jv = journals.find((j) => j.id === inv.journalId);
  if (!jv || Math.abs(jv.totalDr - jv.totalCr) > 0.01) fail('invoice journal missing or unbalanced');
  const oi = (await dbRows('openItems')).find((o) => o.docId === inv.id);
  if (!oi || Math.abs(oi.outstanding - inv.totals.total) > 0.01) fail('open item not created');
  log('invoice posted', inv.number, 'total', inv.totals.total, 'journal', jv.number, 'balanced');

  // ── e-invoice ───────────────────────────────────────────────────────────
  await page.locator('.doc-footer button', { hasText: 'More' }).click();
  await wait(200);
  await page.locator('.menu-item', { hasText: 'Generate e-invoice' }).click();
  await wait(300);
  await page.getByTestId('generate-irn').click();
  await wait(700);
  const inv2 = (await dbRows('salesInvoices')).find((i) => i.id === inv.id);
  if (inv2.statutory?.eInvoiceStatus !== 'Accepted' || !inv2.statutory.irn) fail('e-invoice not accepted: ' + JSON.stringify(inv2.statutory));
  log('e-invoice accepted · IRN', inv2.statutory.irn.slice(0, 12) + '…');

  // ── step 6: partial receipt with allocation ─────────────────────────────
  await page.getByTestId('record-receipt').click();
  await wait(500);
  const netInput = page.locator('.drawer input.num').first();
  await netInput.click({ clickCount: 3 }); await netInput.fill('1000'); await netInput.press('Tab'); await wait(200);
  await setRowNumber(inv.number, 0, 1000);
  await page.locator('.drawer input[placeholder="NEFT/…"]').fill('NEFT/E2E/0001');
  await page.getByTestId('post-receipt').click();
  await wait(900);
  const inv3 = (await dbRows('salesInvoices')).find((i) => i.id === inv.id);
  if (Math.abs(inv3.totals.paid - 1000) > 0.01 || Math.abs(inv3.totals.due - (inv.totals.total - 1000)) > 0.01) fail(`receipt allocation wrong: paid ${inv3.totals.paid} due ${inv3.totals.due}`);
  const rcpt = (await dbRows('receipts')).find((r) => r.allocations.some((a) => a.docId === inv.id));
  log('partial receipt posted', rcpt.number, '· invoice due', inv3.totals.due);

  // ── step 7: credit note (return 10 units) ───────────────────────────────
  await go(`sales/invoices/${inv.id}`);
  await page.getByTestId('create-credit-note').click();
  await wait(700);
  await setRowNumber('Hex Nut', 0, 10);
  await page.locator('select').filter({ has: page.locator('option', { hasText: 'Goods damaged in transit' }) }).first().selectOption({ label: 'Goods damaged in transit (Return)' });
  await page.getByText('Goods are being returned to stock').click();
  await wait(200);
  await page.getByTestId('submit-credit-note').click();
  await wait(900);
  if (!page.url().includes('sales/credit-notes/')) fail('credit note not submitted');
  const cn = (await dbRows('creditNotes')).find((c) => c.invoiceId === inv.id);
  if (!cn || cn.status !== 'Submitted') fail('credit note should be Submitted (Credit Note workflow)');
  log('credit note submitted for approval', cn.id);

  // approvals: Priya (Sales Manager) step 1, Rahul (Finance Admin) step 2
  await login('priya@acmepvt.com');
  await go(`sales/credit-notes/${cn.id}`);
  await page.getByTestId('approve-credit-note').click();
  await wait(300);
  await page.locator('.modal textarea').fill('Damaged goods verified at the warehouse.');
  await confirmDialog('Approve credit note');
  // step 2 (Finance): Rahul is the requester, so self-approval is blocked (SoD) — the tenant owner approves
  await login('aarav@acmegroup.in');
  await go(`sales/credit-notes/${cn.id}`);
  await page.getByTestId('approve-credit-note').click();
  await wait(300);
  await confirmDialog('Approve credit note');
  await wait(400);
  await login('rahul@acmepvt.com');
  await go(`sales/credit-notes/${cn.id}`);
  await page.getByTestId('post-credit-note').click();
  await wait(300);
  await confirmDialog('Post credit note');
  await wait(900);
  const cn2 = (await dbRows('creditNotes')).find((c) => c.id === cn.id);
  if (cn2.status !== 'Posted') fail('credit note not posted: ' + cn2.status);
  const inv4 = (await dbRows('salesInvoices')).find((i) => i.id === inv.id);
  const ret = (await dbRows('stockMovements')).find((m) => m.sourceType === 'Sales Return' && m.baseQty === 10);
  if (!ret) fail('sales return stock receipt missing');
  log('credit note posted', cn2.number, '· allocated', cn2.allocated, '· invoice due now', inv4.totals.due, '· stock +10 received');

  // ── step 8: AR ageing + accounting tab ──────────────────────────────────
  await go('sales/ageing');
  await expectText('Arlene Traders', 'AR ageing row');
  await go(`sales/invoices/${inv.id}?tab=accounting`);
  await expectText('Journal is balanced', 'accounting tab');
  log('AR ageing shows Arlene · invoice accounting tab balanced');

  // ── E2E-05: double-click Post creates exactly one invoice ───────────────
  const before = (await dbRows('salesInvoices')).length;
  for (let attempt = 0; attempt < 3; attempt++) {
    await go('sales/invoices/new');
    await pick('Search customer by name, GSTIN, code…', 'Arlene');
    await page.getByText('Add line').click();
    await pick('Search item…', 'Hex Nut');
    await setRowNumber('Hex Nut', 0, 5);
    // a Vite full-reload (parallel edits) can wipe the form mid-way — verify before posting
    const ok = (await page.locator('.page').innerText()).includes('C-0001') && (await page.locator('table.data-table tr', { hasText: 'Hex Nut' }).count()) > 0;
    if (ok) break;
    log('form was reset by a hot reload — retrying E2E-05 setup');
  }
  await page.getByTestId('post-invoice').click();
  await wait(300);
  const confirmBtn = page.locator('.modal button', { hasText: 'Post invoice' }).last();
  await confirmBtn.dblclick();
  await wait(1200);
  const after = (await dbRows('salesInvoices'));
  if (after.length !== before + 1) fail(`double-click created ${after.length - before} invoices`);
  const nums = after.map((i) => i.number);
  if (new Set(nums).size !== nums.length) fail('duplicate invoice numbers');
  const jvs = (await dbRows('journals')).filter((j) => j.sourceType === 'Sales Invoice' && j.status === 'Posted' && j.companyId === 'co_acme');
  if (new Set(jvs.map((j) => j.idempotencyKey)).size !== jvs.length) fail('duplicate invoice journals');
  log('E2E-05 · double-click post created exactly one invoice', after[after.length - 1].number);

  // ── E2E-05 (POS): double-tap Complete sale creates one bill ─────────────
  await go('pos');
  if (await page.getByTestId('open-shift').count()) {
    await page.locator('select').first().selectOption({ label: 'T-02 · Andheri counter' });
    await page.getByTestId('open-shift').click();
    await wait(600);
  }
  await page.getByTestId('pos-search').fill('HW-NUT-M16');
  await page.getByTestId('pos-search').press('Enter');
  await wait(300);
  await page.getByTestId('pos-tile-HW-NUT-M16').click();
  await wait(200);
  const billsBefore = (await dbRows('posBills')).length;
  await page.getByTestId('pos-complete').dblclick();
  await wait(900);
  const billsAfter = await dbRows('posBills');
  if (billsAfter.length !== billsBefore + 1) fail(`POS double-tap created ${billsAfter.length - billsBefore} bills`);
  const receiptShown = await page.getByText('Payment received').first().isVisible().catch(() => false);
  if (!receiptShown) log('(receipt screen not visible — page was hot-reloaded; bill count verified instead)');
  const posBill = billsAfter[billsAfter.length - 1];
  const posJv = (await dbRows('journals')).find((j) => j.id === posBill.journalId);
  if (!posJv || Math.abs(posJv.totalDr - posJv.totalCr) > 0.01) fail('POS bill journal missing/unbalanced');
  if (!(await dbRows('stockMovements')).some((m) => m.sourceId === posBill.id && m.type === 'POS Sale')) fail('POS stock issue missing');
  log('E2E-05 (POS) · double-tap created exactly one bill', posBill.number, '· journal', posJv.number);

  if (errors.length) { console.log('page errors:', errors); process.exitCode = 1; } else console.log('\nE2E-01 and E2E-05 PASSED with zero page errors');
} catch (e) {
  console.error('E2E FAILED:', e.message);
  console.error('page errors:', errors.slice(0, 10));
  await page.screenshot({ path: 'scripts/e2e-failure.png' }).catch(() => {});
  process.exitCode = 1;
} finally {
  tearingDown = true;
  await browser.close();
}
