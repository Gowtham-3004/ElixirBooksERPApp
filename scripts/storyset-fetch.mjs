// Fetches the curated Storyset (Rafiki) illustrations listed in scripts/storyset.manifest.json, rewrites their
// palette onto the --illus-* tokens (src/index.css) so they follow the theme, and emits the runtime manifest +
// name union under src/assets/storyset/. Raw originals are cached in .cache/storyset/ (gitignored) so the
// normaliser can be re-run offline. SVG output is never linted by migrate-colors (it walks .tsx only) — the
// remaining literal hexes are skin/hair tones on purpose.
//   node scripts/storyset-fetch.mjs                  fetch missing originals, normalise, validate, emit
//   node scripts/storyset-fetch.mjs --check          no network: verify every SVG exists, GIFs present, names.ts in sync
//   node scripts/storyset-fetch.mjs --force          re-download originals even when cached
//   node scripts/storyset-fetch.mjs --renormalize    rebuild every SVG from the cache without fetching
//   node scripts/storyset-fetch.mjs --only a,b       limit to the named entries
//   node scripts/storyset-fetch.mjs --strict         exit 1 when an animated entry has no GIF
// Animated GIFs cannot be fetched (Storyset renders them in its editor) — see src/assets/storyset/animated/README.md.
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.cwd();
const rel = (p) => relative(root, p).split('\\').join('/');
const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
const CHECK = flag('--check'), FORCE = flag('--force'), RENORM = flag('--renormalize'), STRICT = flag('--strict');
const onlyArg = args.find((a) => a.startsWith('--only'));
const ONLY = onlyArg ? (onlyArg.includes('=') ? onlyArg.split('=')[1] : args[args.indexOf(onlyArg) + 1]).split(',') : null;

const INPUT = join(root, 'scripts/storyset.manifest.json');
const CACHE = join(root, '.cache/storyset');
const OUT = join(root, 'src/assets/storyset');
const ANIM = join(OUT, 'animated');
const manifest = JSON.parse(readFileSync(INPUT, 'utf8'));
const { style, license, defaults } = manifest;
const entries = Object.entries(manifest.illustrations).filter(([name]) => !ONLY || ONLY.includes(name));
const UA = 'Mozilla/5.0 (ElixirBooks asset fetch; one-off, see scripts/storyset-fetch.mjs)';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const hex6 = (h) => { const x = h.toLowerCase(); return x.length === 4 ? `#${x[1]}${x[1]}${x[2]}${x[2]}${x[3]}${x[3]}` : x; };

// ── fetch ──────────────────────────────────────────────────────────────────────────────────────────────────
async function get(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    const res = await fetch(url, { headers: { 'user-agent': UA, accept: '*/*' } });
    if (res.ok) return res;
    if (res.status < 500 || i === tries - 1) throw new Error(`${res.status} ${res.statusText} for ${url}`);
    await sleep(800 * (i + 1));
  }
}

/** The illustration page embeds one ImageObject per style; the one for `slug/style` carries the CDN SVG URL. */
async function resolveSvgUrl(slug) {
  const page = `https://storyset.com/illustration/${slug}/${style}`;
  const html = await (await get(page)).text();
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  const objects = blocks.flatMap((b) => { try { const j = JSON.parse(b); return Array.isArray(j) ? j : j['@graph'] ?? [j]; } catch { return []; } });
  const hit = objects.find((o) => o && o['@type'] === 'ImageObject' && typeof o.acquireLicensePage === 'string' && o.acquireLicensePage.endsWith(`/${slug}/${style}`) && /\.svg(\?|$)/.test(o.contentUrl ?? ''));
  if (!hit) throw new Error(`no ${style} ImageObject with an .svg contentUrl on ${page}`);
  return { page, contentUrl: hit.contentUrl };
}

async function ensureOriginal(name, entry) {
  const raw = join(CACHE, `${entry.slug}.svg`);
  const meta = join(CACHE, `${entry.slug}.json`);
  if (existsSync(raw) && existsSync(meta) && !FORCE) return { svg: readFileSync(raw, 'utf8'), ...JSON.parse(readFileSync(meta, 'utf8')) };
  if (RENORM || CHECK) throw new Error(`${name}: no cached original for slug "${entry.slug}" — run without --renormalize/--check`);
  const { page, contentUrl } = await resolveSvgUrl(entry.slug);
  const res = await get(contentUrl);
  const type = res.headers.get('content-type') ?? '';
  if (!type.includes('svg')) throw new Error(`${name}: ${contentUrl} is ${type}, not SVG`);
  const svg = await res.text();
  mkdirSync(CACHE, { recursive: true });
  writeFileSync(raw, svg, 'utf8');
  writeFileSync(meta, JSON.stringify({ page, contentUrl, fetchedAt: new Date().toISOString() }, null, 2), 'utf8');
  await sleep(400);
  return { svg, page, contentUrl, fetchedAt: new Date().toISOString() };
}

// ── normalise ──────────────────────────────────────────────────────────────────────────────────────────────
const REMOVE_TAGS = new Set(['title', 'desc', 'metadata', 'script', 'foreignobject']);
const COLOR_ATTR = /(fill|stroke|stop-color|flood-color|lighting-color)(\s*[:=]\s*"?)(#[0-9a-fA-F]{3}\b|#[0-9a-fA-F]{6}\b)/g;
const OPACITY = /(?<![-\w])(opacity|fill-opacity)\s*[:=]/;
const tagName = (tag) => (tag.match(/^<\/?([a-zA-Z][\w:-]*)/) ?? [])[1]?.toLowerCase();
const attr = (tag, n) => (tag.match(new RegExp(`\\s${n}="([^"]*)"`)) ?? [])[1];
const kebab = (s) => s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').replace(/[\s_]+/g, '-').toLowerCase();

/** Colour histogram of fill/stroke hexes — used to pick the primary and to report what stays literal. */
function histogram(svg) {
  const h = {};
  for (const m of svg.matchAll(COLOR_ATTR)) { const k = hex6(m[3]); h[k] = (h[k] ?? 0) + 1; }
  return h;
}

function detectPrimary(hist, entry) {
  if (entry.primary) return hex6(entry.primary);
  const skip = new Set([hex6(defaults.ink), '#ffffff', '#000000', ...defaults.neutrals.map(hex6), ...defaults.keep.map(hex6)]);
  const ranked = Object.entries(hist).filter(([k]) => !skip.has(k)).sort((a, b) => b[1] - a[1]);
  return ranked[0]?.[0];
}

function normalise(raw, name, entry) {
  const bg = entry.bg ?? defaults.bg ?? 'simple';
  const ink = hex6(defaults.ink);
  const inkLike = new Set((defaults.inkLike ?? []).map(hex6));
  const neutrals = defaults.neutrals.map(hex6);
  const recolor = Object.fromEntries(Object.entries(entry.recolor ?? {}).map(([k, v]) => [hex6(k), v]));
  const hist = histogram(raw);
  const primary = detectPrimary(hist, entry);
  const kept = {};

  // ids: referenced ones get a per-file prefix (several SVGs are inlined on one page); the rest become data-layer
  const referenced = new Set([...raw.matchAll(/url\(#([^)]+)\)|(?:xlink:)?href="#([^"]+)"/g)].map((m) => m[1] ?? m[2]));
  const prefixed = (id) => `${name}__${id}`;

  const mapColor = (hexRaw, ctx) => {
    const hex = hex6(hexRaw);
    if (recolor[hex]) return recolor[hex];
    if (hex === '#ffffff') return ctx.inBg ? 'var(--illus-bg-tint)' : ctx.inOpacity ? '#fff' : 'var(--illus-paper)';
    if (hex === '#000000') return '#000';
    if (hex === ink || inkLike.has(hex)) return 'var(--illus-ink)';
    const n = neutrals.indexOf(hex);
    if (n >= 0) return `var(--illus-n${n + 1})`;
    if (hex === primary) return 'var(--illus-primary)';
    kept[hex] = (kept[hex] ?? 0) + 1;
    return hex;
  };

  const out = [];
  const stack = []; // open elements: { removed, opacity, bg }
  const ctxOf = () => ({ inOpacity: stack.some((s) => s.opacity), inBg: stack.some((s) => s.bg) });
  let removedDepth = 0, sawRoot = false, inStyle = false;
  const tokens = raw.replace(/<\?xml[\s\S]*?\?>/g, '').replace(/<!DOCTYPE[^>]*>/gi, '').replace(/<!--[\s\S]*?-->/g, '').match(/<[^>]+>|[^<]+/g) ?? [];

  for (const tok of tokens) {
    if (tok[0] !== '<') { // text node
      if (removedDepth) continue;
      if (inStyle) out.push(tok.replace(COLOR_ATTR, (m, p, sep, hx) => `${p}${sep}${mapColor(hx, { inOpacity: false, inBg: false })}`));
      else if (tok.trim()) out.push(tok.trim());
      continue;
    }
    const nm = tagName(tok);
    const closing = tok.startsWith('</');
    const selfClosing = tok.endsWith('/>');
    if (closing) {
      const top = stack.pop();
      if (top?.removed) { removedDepth--; continue; }
      if (nm === 'style') inStyle = false;
      if (removedDepth) continue;
      out.push(tok);
      continue;
    }
    // opening or self-closing
    if (removedDepth) { if (!selfClosing) { stack.push({ removed: true }); removedDepth++; } continue; }
    const id = attr(tok, 'id');
    const layer = id ? kebab(id) : undefined;
    const remove = REMOVE_TAGS.has(nm) || (nm === 'g' && (layer === 'background-complete' || (layer === 'background-simple' && bg === 'none')));
    if (remove) { if (!selfClosing) { stack.push({ removed: true }); removedDepth++; } continue; }

    let tag = tok;
    if (nm === 'svg' && !sawRoot) {
      sawRoot = true;
      tag = tag.replace(/\s(width|height|xml:space|id|class)="[^"]*"/g, '');
      if (!/\sviewBox=/.test(tag)) tag = tag.replace(/^<svg/, '<svg viewBox="0 0 500 500"');
      tag = tag.replace(/^<svg/, `<svg aria-hidden="true" focusable="false" data-storyset="${name}"`);
    } else if (id) {
      tag = referenced.has(id) ? tag.replace(`id="${id}"`, `id="${prefixed(id)}"`) : tag.replace(`id="${id}"`, `data-layer="${layer}"`);
    }
    tag = tag.replace(/url\(#([^)]+)\)/g, (m, r) => `url(#${prefixed(r)})`).replace(/((?:xlink:)?href=")#([^"]+)"/g, (m, p, r) => `${p}#${prefixed(r)}"`);
    const ctx = ctxOf();
    const own = { opacity: OPACITY.test(tag), bg: layer === 'background-simple' };
    const c = { inOpacity: ctx.inOpacity || own.opacity, inBg: ctx.inBg || own.bg };
    tag = tag.replace(COLOR_ATTR, (m, p, sep, hx) => `${p}${sep}${mapColor(hx, c)}`);
    if (nm === 'style') inStyle = true;
    if (!selfClosing) stack.push({ removed: false, ...own });
    out.push(tag);
  }
  if (!sawRoot) throw new Error(`${name}: no <svg> root`);
  const svg = out.join('').replace(/>\s+</g, '><').trim() + '\n';
  return { svg, primary, kept, hist };
}

// ── gif validation ─────────────────────────────────────────────────────────────────────────────────────────
function gifInfo(p) {
  if (!existsSync(p)) return null;
  const buf = readFileSync(p);
  const sig = buf.subarray(0, 6).toString('latin1');
  const ok = sig === 'GIF89a' || sig === 'GIF87a';
  return { ok, width: buf.readUInt16LE(6), height: buf.readUInt16LE(8), bytes: buf.length };
}

// ── main ───────────────────────────────────────────────────────────────────────────────────────────────────
const problems = [];
const warnings = [];
const report = {};
mkdirSync(OUT, { recursive: true });
mkdirSync(ANIM, { recursive: true });

for (const [name, entry] of entries) {
  const target = join(OUT, `${name}.svg`);
  try {
    if (CHECK) {
      if (!existsSync(target)) problems.push(`${name}: missing ${rel(target)} — run pnpm storyset`);
      const meta = join(CACHE, `${entry.slug}.json`);
      report[name] = { ...(existsSync(meta) ? JSON.parse(readFileSync(meta, 'utf8')) : {}), bytes: existsSync(target) ? statSync(target).size : 0 };
    } else if (existsSync(target) && !FORCE && !RENORM) {
      const meta = join(CACHE, `${entry.slug}.json`);
      report[name] = { ...(existsSync(meta) ? JSON.parse(readFileSync(meta, 'utf8')) : {}), bytes: statSync(target).size, skipped: true };
    } else {
      const orig = await ensureOriginal(name, entry);
      const { svg, primary, kept, hist } = normalise(orig.svg, name, entry);
      const prev = existsSync(target) ? readFileSync(target, 'utf8') : null;
      if (prev !== svg) writeFileSync(target, svg, 'utf8');
      report[name] = { page: orig.page, contentUrl: orig.contentUrl, fetchedAt: orig.fetchedAt, bytes: Buffer.byteLength(svg), primary, changed: prev !== svg };
      const keptStr = Object.entries(kept).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}×${v}`).join(' ');
      const top = Object.entries(hist).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => `${k}×${v}`).join(' ');
      console.log(`${prev === svg ? '=' : '+'} ${name.padEnd(18)} ${String(Buffer.byteLength(svg)).padStart(6)} B  primary ${primary ?? '—'}  top ${top}${keptStr ? `  kept ${keptStr}` : ''}`);
      if (!primary) warnings.push(`${name}: no primary colour detected — set "primary" in the manifest`);
    }
  } catch (e) {
    problems.push(`${name}: ${e.message}`);
  }
  // animated
  const gif = join(ANIM, `${name}.gif`), dark = join(ANIM, `${name}.dark.gif`);
  const gi = gifInfo(gif), di = gifInfo(dark);
  report[name] = { ...report[name], slug: entry.slug, bg: entry.bg ?? defaults.bg ?? 'simple', animated: !!entry.animated, darkOk: !!entry.darkOk, hasGif: !!gi, hasDarkGif: !!di };
  if (entry.animated) {
    if (!gi) (STRICT ? problems : warnings).push(`${name}: export https://storyset.com/illustration/${entry.slug}/${style} → Animate → GIF as ${rel(gif)}`);
    else {
      if (!gi.ok) problems.push(`${name}: ${rel(gif)} is not a GIF`);
      if (gi.width < 400 || gi.width > 1000) warnings.push(`${name}: ${rel(gif)} is ${gi.width}px wide (aim for 600–800)`);
      if (gi.bytes > 1.5 * 1024 * 1024) warnings.push(`${name}: ${rel(gif)} is ${(gi.bytes / 1048576).toFixed(1)} MB (aim for ≤ 1.5 MB)`);
    }
  } else if (gi) warnings.push(`${name}: ${rel(gif)} exists but the entry is not marked animated`);
}

// duplicate ids across all emitted files would clash once several are inlined on one page
const ids = {};
for (const f of readdirSync(OUT).filter((f) => f.endsWith('.svg'))) {
  for (const m of readFileSync(join(OUT, f), 'utf8').matchAll(/\sid="([^"]+)"/g)) (ids[m[1]] ??= []).push(f);
}
for (const [id, files] of Object.entries(ids)) if (files.length > 1) problems.push(`id "${id}" appears in ${files.join(', ')}`);

// generated runtime files
const allNames = Object.keys(manifest.illustrations).sort();
const animated = allNames.filter((n) => manifest.illustrations[n].animated);
const darkOk = allNames.filter((n) => manifest.illustrations[n].darkOk);
const namesTs = `// generated by scripts/storyset-fetch.mjs from scripts/storyset.manifest.json — do not edit
export const STORYSET_NAMES = [${allNames.map((n) => `'${n}'`).join(', ')}] as const;
export type StorysetName = (typeof STORYSET_NAMES)[number];
/** Entries the manifest expects an animated GIF for (animated/<name>.gif). */
export const STORYSET_ANIMATED: ReadonlySet<StorysetName> = new Set<StorysetName>([${animated.map((n) => `'${n}'`).join(', ')}]);
/** GIFs safe to show on dark surfaces without a .dark.gif sibling. */
export const STORYSET_DARK_OK: ReadonlySet<StorysetName> = new Set<StorysetName>([${darkOk.map((n) => `'${n}'`).join(', ')}]);
`;
const namesPath = join(OUT, 'names.ts');
const outManifest = { style, license, generatedAt: CHECK ? undefined : new Date().toISOString(), illustrations: Object.fromEntries(allNames.map((n) => [n, { ...(report[n] ?? {}), slug: manifest.illustrations[n].slug }])) };
const manifestPath = join(OUT, 'manifest.json');
if (CHECK) {
  if (!existsSync(namesPath) || readFileSync(namesPath, 'utf8') !== namesTs) problems.push(`${rel(namesPath)} is out of date — run pnpm storyset`);
} else if (!ONLY) {
  if (!existsSync(namesPath) || readFileSync(namesPath, 'utf8') !== namesTs) writeFileSync(namesPath, namesTs, 'utf8');
  const prevManifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : null;
  // keep the manifest stable across no-op runs: only rewrite when something other than the timestamp changed
  const strip = (m) => JSON.stringify({ ...m, generatedAt: undefined, illustrations: Object.fromEntries(Object.entries(m.illustrations).map(([k, v]) => [k, { ...v, changed: undefined, skipped: undefined }])) });
  if (!prevManifest || strip(prevManifest) !== strip(outManifest)) writeFileSync(manifestPath, JSON.stringify(outManifest, null, 2) + '\n', 'utf8');
}

const total = allNames.filter((n) => existsSync(join(OUT, `${n}.svg`))).length;
console.log(`\n${total}/${allNames.length} illustrations present · ${animated.filter((n) => existsSync(join(ANIM, `${n}.gif`))).length}/${animated.length} GIFs exported`);
for (const w of warnings) console.log(`warn  ${w}`);
for (const p of problems) console.log(`FAIL  ${p}`);
process.exit(problems.length ? 1 : 0);
