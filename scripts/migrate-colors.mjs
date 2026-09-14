// Rewrites hardcoded hex colours to the design tokens declared in src/index.css (:root).
// Walks src/**/*.tsx by default; CSS files must be passed explicitly. Re-runnable and idempotent —
// outputs contain no mapped hex, so a second run changes nothing.
//   node scripts/migrate-colors.mjs            rewrite in place, print a report
//   node scripts/migrate-colors.mjs --dry      report only
//   node scripts/migrate-colors.mjs --check    exit 1 if any mapped hex remains (lint)
//   node scripts/migrate-colors.mjs src/index.css src/styles/ui.css
import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

// old hex (upper-case) → token. Several old greys collapse onto one token on purpose.
const MAP = {
  '#0A0A0A': 'var(--ink)',
  '#3C4043': 'var(--ink-2)',
  '#5F6368': 'var(--ink-3)',
  '#6E6E71': 'var(--ink-4)',
  '#B0B5BF': 'var(--ink-5)',
  '#DADCE0': 'var(--line-strong)', '#E0E2E6': 'var(--line-strong)', '#D0D5DD': 'var(--line-strong)',
  '#EAEAEA': 'var(--line)',
  '#EFEFEF': 'var(--hairline)', '#F5F5F5': 'var(--hairline)',
  '#F7F7F7': 'var(--bg)',
  '#F9FBFC': 'var(--surface-2)', '#FAFAFA': 'var(--surface-2)',
  '#F3F5F5': 'var(--surface-3)', '#F3F5F7': 'var(--surface-3)', '#F2F4F8': 'var(--surface-3)', '#F3F3F5': 'var(--surface-3)',
  '#E7E9EB': 'var(--neutral-bg)',
  '#325CFF': 'var(--accent)',
  '#2E55EB': 'var(--accent-hover)', '#2B4FDB': 'var(--accent-hover)',
  '#EBF0FF': 'var(--accent-soft)', '#ECF1FD': 'var(--accent-soft)', '#F2F5FF': 'var(--accent-soft)', '#F3F6FF': 'var(--accent-soft)',
  '#F2F7FF': 'var(--accent-tint)', '#F9FBFF': 'var(--accent-tint)', '#F0F4FF': 'var(--accent-tint)', '#F5F8FF': 'var(--accent-tint)',
  '#DCE5FF': 'var(--accent-line)',
  '#12784E': 'var(--good)', '#E0F9EC': 'var(--good-bg)', '#F0FFF8': 'var(--good-bg)', '#F1FFF8': 'var(--good-bg)', '#3FA97A': 'var(--good-line)',
  '#8A4B0F': 'var(--warn)', '#FEF4EC': 'var(--warn-bg)', '#FFF7E8': 'var(--warn-bg)', '#FFFBEB': 'var(--warn-bg)', '#E29A4B': 'var(--warn-line)',
  '#C0393F': 'var(--danger)', '#A8323A': 'var(--danger-hover)', '#FFE8EA': 'var(--danger-bg)', '#FFF5F6': 'var(--danger-bg)', '#E0455A': 'var(--danger-line)',
  '#3E5BA5': 'var(--info)', '#EBF7FF': 'var(--info-bg)',
};

// numeral features move to font-variant-numeric so :root can own font-feature-settings (stylistic sets)
const FEATURES = [
  [/fontFeatureSettings: 'normal'/g, "fontVariantNumeric: 'normal'"],
  [/fontFeatureSettings: '"tnum" 1'/g, "fontVariantNumeric: 'tabular-nums'"],
  [/font-feature-settings: normal/g, 'font-variant-numeric: normal'],
  [/font-feature-settings: "tnum" 1/g, 'font-variant-numeric: tabular-nums'],
];

const EXCLUDE = ['src/components/ui/printsheet.tsx', 'src/modules/admin/Templates.tsx', 'src/imports/'];
// lines never rewritten: palette arrays, opt-out marker, the print sheet, data URLs, colour values that are
// stored as data or fed to <input type="color"> (those must stay real hex)
const SKIP_LINE = [/\[\s*['"`]#[0-9A-Fa-f]{6}/, /no-token/, /\.print-sheet/, /data:image/, /type="color"/, /brandColor: '#/];
// alpha-suffix compositions (`${color}20`) break once `color` is a var(): flag for review
const WARN_LINE = /\$\{[^}]+\}[0-9A-Fa-f]{2}\b/;
const HEX = /#([0-9A-Fa-f]{6})\b/g;

const args = process.argv.slice(2);
const dry = args.includes('--dry');
const check = args.includes('--check');
const explicit = args.filter((a) => !a.startsWith('--'));
const root = process.cwd();
const rel = (p) => relative(root, p).split('\\').join('/');

function walk(p, out) {
  if (statSync(p).isDirectory()) { for (const n of readdirSync(p)) walk(join(p, n), out); }
  else if (p.endsWith('.tsx')) out.push(p);
  return out;
}
const files = explicit.length
  ? explicit.flatMap((p) => (statSync(p).isDirectory() ? walk(p, []) : [p]))
  : walk(join(root, 'src'), []);

const perToken = {};
const unmapped = {};
const warnings = [];
const remaining = [];
let changedFiles = 0;

for (const file of files) {
  const r = rel(file);
  if (EXCLUDE.some((e) => r.startsWith(e))) continue;
  const src = readFileSync(file, 'utf8');
  const lines = src.split('\n');
  let touched = false;
  const out = lines.map((line, i) => {
    if (SKIP_LINE.some((re) => re.test(line))) return line;
    if (WARN_LINE.test(line)) warnings.push(`${r}:${i + 1}: ${line.trim().slice(0, 120)}`);
    let next = line.replace(HEX, (m) => {
      const key = m.toUpperCase();
      const token = MAP[key];
      if (!token) { (unmapped[key] ??= []).push(`${r}:${i + 1}`); return m; }
      perToken[token] = (perToken[token] ?? 0) + 1;
      if (check) remaining.push(`${r}:${i + 1}: ${m}`);
      return token;
    });
    for (const [re, to] of FEATURES) next = next.replace(re, to);
    if (next !== line) touched = true;
    return next;
  });
  if (touched) {
    changedFiles++;
    if (!dry && !check) writeFileSync(file, out.join('\n'), 'utf8');
  }
}

if (check) {
  if (remaining.length) { console.error(`${remaining.length} mapped hex literal(s) remain:\n` + remaining.slice(0, 40).join('\n')); process.exit(1); }
  console.log('OK — no mapped hex literals remain.');
  process.exit(0);
}

console.log(`${dry ? '[dry] ' : ''}${changedFiles} file(s) ${dry ? 'would change' : 'changed'}`);
for (const [t, n] of Object.entries(perToken).sort((a, b) => b[1] - a[1])) console.log(`  ${n.toString().padStart(5)}  ${t}`);
if (warnings.length) console.log(`\n${warnings.length} alpha-suffix line(s) to review by hand:\n  ` + warnings.join('\n  '));
const un = Object.entries(unmapped).sort((a, b) => b[1].length - a[1].length);
if (un.length) console.log(`\n${un.length} unmapped hex value(s) left as-is:\n` + un.map(([h, at]) => `  ${at.length.toString().padStart(4)}  ${h}  ${at.slice(0, 3).join(', ')}${at.length > 3 ? ' …' : ''}`).join('\n'));
