// Verifies that the seeded trial balance reconciles: Σ opening balances (normal side) + Σ posted/reversed
// journal lines must give Dr total == Cr total, and every seeded journal must balance.
// Usage: node scripts/verify-tb.mjs   (transpiles the seed with the TypeScript compiler API, no dev server needed)
import ts from 'typescript';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'node_modules', '.cache', 'verify-tb');
const files = ['src/lib/format.ts', 'src/store/types.ts', 'src/store/collections.ts', 'src/store/seed/core.ts', 'src/store/seed/accounting.ts', 'src/modules/accounting/types.ts'];
fs.rmSync(out, { recursive: true, force: true });
for (const f of files) {
  const src = fs.readFileSync(path.join(root, f), 'utf8');
  const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, verbatimModuleSyntax: false } }).outputText
    .replace(/from '(\.{1,2}\/[^']+)'/g, (m, p) => (p.endsWith('.js') ? m : `from '${p}.js'`));
  const dest = path.join(out, f.replace(/\.ts$/, '.js'));
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, js);
}
// db.ts is only needed for the DB type — stub it.
fs.writeFileSync(path.join(out, 'src/store/db.js'), 'export const db = {};');

const core = await import(pathToFileURL(path.join(out, 'src/store/seed/core.js')).href);
const acc = await import(pathToFileURL(path.join(out, 'src/store/seed/accounting.js')).href);
const masters = core.seedMasters();
const accounting = acc.seedAccounting();
const accounts = [...masters.accounts, ...accounting.accounts];
const journals = accounting.journals;

let problems = 0;
const byId = new Map(accounts.map((a) => [a.id, a]));
for (const j of journals) {
  const dr = j.lines.reduce((s, l) => s + l.drBase, 0);
  const cr = j.lines.reduce((s, l) => s + l.crBase, 0);
  if (Math.abs(dr - cr) > 0.011) { console.log(`UNBALANCED ${j.number}: Dr ${dr} Cr ${cr}`); problems++; }
  for (const l of j.lines) if (!byId.has(l.accountId)) { console.log(`${j.number}: unknown account ${l.accountId}`); problems++; }
  if (new Set(journals.map((x) => x.number)).size !== journals.length) { console.log('duplicate journal numbers'); problems++; break; }
}
let totDr = 0, totCr = 0;
const rows = [];
for (const a of accounts) {
  let dr = 0, cr = 0;
  for (const j of journals) if (j.status === 'Posted' || j.status === 'Reversed') for (const l of j.lines) if (l.accountId === a.id) { dr += l.drBase; cr += l.crBase; }
  const opening = a.openingBalance ?? 0;
  const net = a.normalBalance === 'Dr' ? opening + dr - cr : opening + cr - dr;
  const drCol = a.normalBalance === 'Dr' ? (net >= 0 ? net : 0) : net < 0 ? -net : 0;
  const crCol = a.normalBalance === 'Cr' ? (net >= 0 ? net : 0) : net < 0 ? -net : 0;
  totDr += drCol; totCr += crCol;
  if (drCol || crCol) rows.push([a.code, a.name, drCol.toFixed(2), crCol.toFixed(2)]);
}
console.table(rows);
console.log(`Journals: ${journals.length} (${journals.filter((j) => j.status === 'Posted').length} posted, ${journals.filter((j) => j.status === 'Reversed').length} reversed, ${journals.filter((j) => j.status === 'Submitted' || j.status === 'Draft').length} draft/submitted)`);
console.log(`Trial balance: Dr ${totDr.toFixed(2)}  Cr ${totCr.toFixed(2)}  diff ${(totDr - totCr).toFixed(2)}`);
if (Math.abs(totDr - totCr) > 0.011) { console.log('TRIAL BALANCE DOES NOT BALANCE'); problems++; }
process.exit(problems ? 1 : 0);
