// Responsive audit (phone / tablet / laptop / desktop): signs in, visits each route at every width in
// WIDTHS (default 375,768,1024,1440), screenshots it, and fails if any element extends past the viewport
// outside a sideways-scrolling container. Usage:
//   WIDTHS=375,768 node scripts/audit-responsive.mjs http://localhost:5173 out-dir [routes...]
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

let tearingDown = false;
process.on('unhandledRejection', (e) => { if (tearingDown && String(e).includes('TargetClosedError')) return; console.error(e); process.exit(1); });

const [base = 'http://localhost:5173', outDir = 'shots', ...routeArgs] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const routes = routeArgs.length ? routeArgs : ['home', 'sales/invoices', 'sales/invoices/inv_0118', 'sales/invoices/new', 'purchase/orders/po_0093', 'accounting/journals', 'accounting/journals/jv_0045', 'reports', 'reports/trial-balance', 'masters/customers/cust_arlene', 'masters/items', 'admin', 'admin/users', 'pos', 'approvals', 'inventory/valuation', 'payroll', 'banking', 'taxation', 'projects', 'production', 'platform'];
const widths = (process.env.WIDTHS ?? '375,768,1024,1440').split(',').map(Number);

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error' && !/favicon|404/.test(m.text())) errors.push(`console: ${m.text().slice(0, 160)}`); });

await page.goto(`${base}/#/`, { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });
await page.locator('input[type=email]').first().fill('rahul@acmepvt.com');
await page.locator('button[type=submit]').first().click();
await page.waitForTimeout(800);
if (await page.locator('input[placeholder="123456"]').count()) { await page.locator('input[placeholder="123456"]').fill('123456'); await page.getByText('Verify and sign in').click(); await page.waitForTimeout(400); }
if (await page.getByText('Choose a company').count()) { await page.getByText('Acme Private Limited').first().click(); await page.waitForTimeout(400); }

const probe = () => page.evaluate(() => {
  const main = document.querySelector('main') ?? document.body;
  const doc = document.documentElement;
  const wide = [];
  const vw = window.innerWidth;
  document.querySelectorAll('body *').forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.right > vw + 1 && getComputedStyle(el).position !== 'fixed') {
      // skip descendants of a horizontally scrolling container (tables, chip strips)
      let p = el.parentElement, inScroll = false;
      while (p) { const cs = getComputedStyle(p); if ((cs.overflowX === 'auto' || cs.overflowX === 'scroll') && p.scrollWidth > p.clientWidth) { inScroll = true; break; } p = p.parentElement; }
      if (!inScroll) wide.push(`${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : ''} right=${Math.round(r.right)} w=${Math.round(r.width)}`);
    }
  });
  return { docOverflow: doc.scrollWidth - doc.clientWidth, mainOverflow: main.scrollWidth - main.clientWidth, wide: wide.slice(0, 6) };
});

const report = [];
for (const route of routes) {
  for (const w of widths) {
    await page.setViewportSize({ width: w, height: w < 500 ? 812 : 900 });
    await page.goto(`${base}/#/${route}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    const r = await probe();
    const name = `${route.replace(/[\/?=&]/g, '_')}@${w}.png`;
    await page.screenshot({ path: `${outDir}/${name}`, fullPage: w < 500 });
    const bad = r.docOverflow > 1 || r.mainOverflow > 1 || r.wide.length;
    report.push({ route, w, ...r, bad });
    console.log(`${bad ? 'OVERFLOW' : 'ok      '} ${route}@${w} doc+${r.docOverflow} main+${r.mainOverflow} ${r.wide.join(' | ')}`);
  }
}
console.log(`\nerrors: ${errors.length}`); errors.slice(0, 8).forEach((e) => console.log('  ' + e));
console.log(`overflowing: ${report.filter((r) => r.bad).length}/${report.length}`);
tearingDown = true;
await browser.close();
process.exit(report.some((r) => r.bad) || errors.length ? 1 : 0);
