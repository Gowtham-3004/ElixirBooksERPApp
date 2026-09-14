#!/usr/bin/env node
// Bundle + lint the multi-file OpenAPI contract in docs/api into public/api/openapi.json.
//
//   node scripts/openapi-bundle.mjs            bundle → public/api/openapi.json
//   node scripts/openapi-bundle.mjs --check    lint only (non-zero exit on error)
//   node scripts/openapi-bundle.mjs --index    also write docs/api/ENDPOINTS.md
//
// Source layout (convention-driven, no config):
//   docs/api/openapi.yaml                  root document (info, servers, tags, security)
//   docs/api/paths/<module>.yaml           { "/path": PathItem, ... }  → merged into root.paths
//   docs/api/components/<type>.yaml        { Name: Component }         → root.components.<type>
//   docs/api/components/<type>/<file>.yaml { Name: Component }         → root.components.<type>
//   docs/api/webhooks.yaml                 { EventName: PathItem }     → root.webhooks
//
// $ref forms accepted in source files:
//   '#/Name'                               local to a component file → #/components/<type>/Name
//   '../components/schemas/x.yaml#/Name'   external → #/components/schemas/Name
//   '#/components/<type>/Name'             already bundled form, left as-is
// Component names must be unique across all files of a type.

import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';

const SRC = path.resolve('docs/api');
const OUT = path.resolve('public/api/openapi.json');
const INDEX = path.join(SRC, 'ENDPOINTS.md');
const args = process.argv.slice(2);
const CHECK_ONLY = args.includes('--check');
const WRITE_INDEX = args.includes('--index');

const COMPONENT_TYPES = ['schemas', 'responses', 'parameters', 'examples', 'requestBodies', 'headers', 'securitySchemes', 'links', 'callbacks'];
const METHODS = ['get', 'put', 'post', 'delete', 'patch', 'head', 'options', 'trace'];
// Operations under these prefixes are not company-scoped (no X-Company-Id needed).
const COMPANY_EXEMPT_PREFIXES = ['/auth/', '/me', '/platform/', '/companies', '/health', '/enums', '/onboarding'];

const errors = [];
const warnings = [];
const fail = (msg) => errors.push(msg);
const warn = (msg) => warnings.push(msg);

// ── file loading ──────────────────────────────────────────────────────────

const cache = new Map();
function loadYaml(file) {
  if (cache.has(file)) return cache.get(file);
  let doc;
  try {
    doc = parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    fail(`${rel(file)}: YAML parse error: ${e.message}`);
    doc = {};
  }
  checkSplitScalars(doc, file, '');
  cache.set(file, doc);
  return doc;
}

/** A comma inside an unquoted flow-mapping value splits it into a stray null-valued key — catch that. */
function checkSplitScalars(node, file, trail) {
  if (Array.isArray(node)) node.forEach((n, i) => checkSplitScalars(n, file, `${trail}[${i}]`));
  else if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      // a null-valued key is almost always a split scalar (`example: a,b` → { example: 'a', b: null }); only
      // `nextCursor: null`-style keys in example values are legitimate
      if (v === null && !/^(nextCursor|next|previous|value|default|example)$/.test(k) && !/\/(value|example)(\/|\[|$)/.test(trail)) fail(`${rel(file)}: stray key "${k}" at ${trail} — quote the value containing the comma`);
      checkSplitScalars(v, file, `${trail}/${k}`);
    }
  }
}
const rel = (f) => path.relative(process.cwd(), f).split(path.sep).join('/');

function listYaml(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((d) => (d.isDirectory() ? listYaml(path.join(dir, d.name)) : d.name.endsWith('.yaml') || d.name.endsWith('.yml') ? [path.join(dir, d.name)] : []))
    .sort();
}

/** components/<type>.yaml or components/<type>/<file>.yaml → type */
function componentTypeOf(file) {
  const p = path.relative(path.join(SRC, 'components'), file).split(path.sep);
  if (p[0].startsWith('..')) return null;
  const t = p.length === 1 ? p[0].replace(/\.ya?ml$/, '') : p[0];
  return COMPONENT_TYPES.includes(t) ? t : null;
}

// ── $ref rewriting ────────────────────────────────────────────────────────

function rewriteRefs(node, file, localType) {
  if (Array.isArray(node)) return node.map((n) => rewriteRefs(n, file, localType));
  if (!node || typeof node !== 'object') return node;
  const out = {};
  for (const [k, v] of Object.entries(node)) {
    if (k === '$ref' && typeof v === 'string') out[k] = rewriteRef(v, file, localType);
    else if (k === 'discriminator' && v && typeof v === 'object' && v.mapping && typeof v.mapping === 'object') {
      // discriminator.mapping values are refs too (not under a `$ref` key)
      out[k] = { ...v, mapping: Object.fromEntries(Object.entries(v.mapping).map(([mk, mv]) => [mk, typeof mv === 'string' ? rewriteRef(mv, file, localType) : mv])) };
    } else out[k] = rewriteRefs(v, file, localType);
  }
  return out;
}

function rewriteRef(ref, file, localType) {
  if (ref.startsWith('#/components/')) return ref;
  if (ref.startsWith('#/')) {
    if (!localType) {
      fail(`${rel(file)}: local $ref '${ref}' is only allowed inside component files`);
      return ref;
    }
    return `#/components/${localType}/${ref.slice(2)}`;
  }
  const [filePart, pointer] = ref.split('#');
  if (!filePart) {
    fail(`${rel(file)}: malformed $ref '${ref}'`);
    return ref;
  }
  const target = path.resolve(path.dirname(file), filePart);
  if (!fs.existsSync(target)) {
    fail(`${rel(file)}: $ref target file not found: '${ref}'`);
    return ref;
  }
  const type = componentTypeOf(target);
  if (!type) {
    fail(`${rel(file)}: external $ref must point into docs/api/components/<type>/: '${ref}'`);
    return ref;
  }
  if (!pointer || !pointer.startsWith('/')) {
    fail(`${rel(file)}: external $ref needs a '#/Name' pointer: '${ref}'`);
    return ref;
  }
  return `#/components/${type}/${pointer.slice(1)}`;
}

// ── assemble ──────────────────────────────────────────────────────────────

function bundle() {
  const rootFile = path.join(SRC, 'openapi.yaml');
  if (!fs.existsSync(rootFile)) throw new Error(`missing ${rel(rootFile)}`);
  const root = rewriteRefs(loadYaml(rootFile), rootFile, null);
  root.paths = root.paths ?? {};
  root.components = root.components ?? {};
  const pathOwner = new Map();
  const compOwner = new Map();

  for (const file of listYaml(path.join(SRC, 'components'))) {
    const type = componentTypeOf(file);
    if (!type) {
      fail(`${rel(file)}: unknown component type (expected one of ${COMPONENT_TYPES.join(', ')})`);
      continue;
    }
    const doc = loadYaml(file) ?? {};
    root.components[type] = root.components[type] ?? {};
    for (const [name, value] of Object.entries(doc)) {
      const key = `${type}/${name}`;
      if (compOwner.has(key)) fail(`${rel(file)}: duplicate component '${key}' (also in ${compOwner.get(key)})`);
      compOwner.set(key, rel(file));
      root.components[type][name] = rewriteRefs(value, file, type);
    }
  }

  for (const file of listYaml(path.join(SRC, 'paths'))) {
    const doc = loadYaml(file) ?? {};
    for (const [p, item] of Object.entries(doc)) {
      if (!p.startsWith('/')) {
        fail(`${rel(file)}: path keys must start with '/': '${p}'`);
        continue;
      }
      if (pathOwner.has(p)) fail(`${rel(file)}: duplicate path '${p}' (also in ${pathOwner.get(p)})`);
      pathOwner.set(p, rel(file));
      root.paths[p] = rewriteRefs(item, file, null);
    }
  }

  const webhooksFile = path.join(SRC, 'webhooks.yaml');
  if (fs.existsSync(webhooksFile)) {
    root.webhooks = { ...(root.webhooks ?? {}), ...rewriteRefs(loadYaml(webhooksFile), webhooksFile, null) };
  }

  inlineExampleRefs(root);

  // stable key order for diff-friendly output
  root.paths = Object.fromEntries(Object.entries(root.paths).sort(([a], [b]) => a.localeCompare(b)));
  for (const t of Object.keys(root.components)) {
    root.components[t] = Object.fromEntries(Object.entries(root.components[t]).sort(([a], [b]) => a.localeCompare(b)));
  }
  return root;
}

/**
 * Example payloads may reuse other example payloads with `{ $ref: '#/components/examples/Name/value' }`
 * (keeps the source DRY). Standard tooling does not resolve $ref inside example values, so the bundle
 * inlines them (deep clone) — nested reuse is resolved iteratively.
 */
function inlineExampleRefs(root) {
  const isExampleRef = (v) => v && typeof v === 'object' && typeof v.$ref === 'string' && /^#\/components\/examples\/[^/]+\/value$/.test(v.$ref) && Object.keys(v).length === 1;
  const resolveOnce = (node, inValue) => {
    if (Array.isArray(node)) return node.map((n) => resolveOnce(n, inValue));
    if (!node || typeof node !== 'object') return node;
    if (inValue && isExampleRef(node)) {
      const target = resolvePointer(root, node.$ref);
      if (target === undefined) {
        fail(`example $ref '${node.$ref}' does not resolve`);
        return node;
      }
      return structuredClone(target);
    }
    const out = {};
    for (const [k, v] of Object.entries(node)) out[k] = resolveOnce(v, inValue || k === 'value' || k === 'example');
    return out;
  };
  for (let i = 0; i < 5; i++) {
    root.components = resolveOnce(root.components, false);
    root.paths = resolveOnce(root.paths, false);
    if (root.webhooks) root.webhooks = resolveOnce(root.webhooks, false);
  }
}

// ── lint ──────────────────────────────────────────────────────────────────

function resolvePointer(root, ref) {
  const parts = ref.slice(2).split('/').map((s) => s.replace(/~1/g, '/').replace(/~0/g, '~'));
  let cur = root;
  for (const p of parts) {
    if (cur && typeof cur === 'object' && p in cur) cur = cur[p];
    else return undefined;
  }
  return cur;
}

function deref(root, node) {
  let n = node;
  let guard = 0;
  while (n && typeof n === 'object' && n.$ref && guard++ < 20) n = resolvePointer(root, n.$ref);
  return n;
}

function walkRefs(node, cb, trail = '') {
  if (Array.isArray(node)) node.forEach((n, i) => walkRefs(n, cb, `${trail}[${i}]`));
  else if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      if (k === '$ref' && typeof v === 'string') cb(v, trail);
      else walkRefs(v, cb, `${trail}/${k}`);
    }
  }
}

function hasExample(mediaType) {
  if (!mediaType || typeof mediaType !== 'object') return false;
  if ('example' in mediaType) return true;
  return !!(mediaType.examples && Object.keys(mediaType.examples).length);
}

function lint(root) {
  // 1. every $ref resolves
  walkRefs(root, (ref, trail) => {
    if (!ref.startsWith('#/')) fail(`unresolved external $ref '${ref}' at ${trail}`);
    else if (resolvePointer(root, ref) === undefined) fail(`dangling $ref '${ref}' at ${trail}`);
  });

  const opIds = new Map();
  const stats = { paths: 0, operations: 0, byTag: {}, examples: 0 };
  const tagsDeclared = new Set((root.tags ?? []).map((t) => t.name));

  for (const [p, item] of Object.entries(root.paths ?? {})) {
    stats.paths++;
    const pathParams = (item.parameters ?? []).map((x) => deref(root, x));
    for (const m of METHODS) {
      const op = item[m];
      if (!op) continue;
      stats.operations++;
      const where = `${m.toUpperCase()} ${p}`;
      const params = [...pathParams, ...(op.parameters ?? []).map((x) => deref(root, x))].filter(Boolean);
      const paramNames = new Set(params.map((x) => `${x.in}:${x.name}`));

      if (!op.operationId) fail(`${where}: missing operationId`);
      else if (opIds.has(op.operationId)) fail(`${where}: duplicate operationId '${op.operationId}' (also ${opIds.get(op.operationId)})`);
      else opIds.set(op.operationId, where);
      if (!op.summary) fail(`${where}: missing summary`);
      if (!op.tags?.length) fail(`${where}: missing tags`);
      for (const t of op.tags ?? []) {
        if (!tagsDeclared.has(t)) fail(`${where}: tag '${t}' not declared in root tags`);
        stats.byTag[t] = (stats.byTag[t] ?? 0) + 1;
      }
      const codes = Object.keys(op.responses ?? {});
      if (!codes.some((c) => /^2\d\d$/.test(c))) fail(`${where}: no 2xx response`);
      const isPublic = Array.isArray(op.security) && op.security.length === 0;
      if (!isPublic && !codes.includes('401')) fail(`${where}: missing 401 response`);
      if (!isPublic && !codes.includes('403') && !p.startsWith('/auth/')) fail(`${where}: missing 403 response`);
      if (op.requestBody && !codes.includes('400')) fail(`${where}: operation with a request body but no 400 response`);
      if (/\{[a-zA-Z]+\}/.test(p) && !codes.includes('404')) fail(`${where}: path has an id but no 404 response`);

      if (op['x-idempotent'] && !paramNames.has('header:Idempotency-Key')) fail(`${where}: x-idempotent but no Idempotency-Key header parameter`);
      const exempt = COMPANY_EXEMPT_PREFIXES.some((x) => p.startsWith(x)) || op['x-company-scoped'] === false;
      if (!exempt && !paramNames.has('header:X-Company-Id')) fail(`${where}: company-scoped operation without X-Company-Id header parameter`);
      const pathVars = [...p.matchAll(/\{([^}]+)\}/g)].map((x) => x[1]);
      for (const v of pathVars) if (!paramNames.has(`path:${v}`)) fail(`${where}: path variable '{${v}}' has no path parameter`);

      // request body: needs schema + ≥1 example for JSON
      const rb = deref(root, op.requestBody);
      if (rb?.content) {
        for (const [mt, media] of Object.entries(rb.content)) {
          if (!media.schema) fail(`${where}: requestBody ${mt} has no schema`);
          if (mt.includes('json') && !hasExample(media)) fail(`${where}: requestBody ${mt} has no example`);
          stats.examples += Object.keys(media.examples ?? {}).length + ('example' in media ? 1 : 0);
        }
      }
      // success responses: JSON content needs ≥1 example
      for (const [code, r] of Object.entries(op.responses ?? {})) {
        const res = deref(root, r);
        if (!res) continue;
        if (!res.description) fail(`${where}: response ${code} has no description`);
        if (/^2\d\d$/.test(code) && res.content) {
          for (const [mt, media] of Object.entries(res.content)) {
            if (!media.schema) fail(`${where}: response ${code} ${mt} has no schema`);
            if (mt.includes('json') && !hasExample(media)) fail(`${where}: response ${code} ${mt} has no example`);
            stats.examples += Object.keys(media.examples ?? {}).length + ('example' in media ? 1 : 0);
          }
        }
      }
    }
  }

  // shared error responses must carry examples too
  for (const [name, r] of Object.entries(root.components?.responses ?? {})) {
    const json = r.content?.['application/json'];
    if (json && !hasExample(json)) warn(`components.responses.${name}: no example`);
  }

  stats.schemas = Object.keys(root.components?.schemas ?? {}).length;
  stats.sharedExamples = Object.keys(root.components?.examples ?? {}).length;
  stats.webhooks = Object.keys(root.webhooks ?? {}).length;
  stats.tags = tagsDeclared.size;
  return stats;
}

// ── endpoint index ────────────────────────────────────────────────────────

function writeIndex(root) {
  const lines = ['# Endpoint index', '', 'Generated by `pnpm api:bundle` — do not edit by hand.', ''];
  const byTag = {};
  for (const [p, item] of Object.entries(root.paths)) {
    for (const m of METHODS) {
      const op = item[m];
      if (!op) continue;
      const tag = op.tags?.[0] ?? 'Untagged';
      (byTag[tag] = byTag[tag] ?? []).push({ m: m.toUpperCase(), p, op });
    }
  }
  const order = (root.tags ?? []).map((t) => t.name);
  const tags = Object.keys(byTag).sort((a, b) => (order.indexOf(a) === -1 ? 999 : order.indexOf(a)) - (order.indexOf(b) === -1 ? 999 : order.indexOf(b)));
  for (const t of tags) {
    lines.push(`## ${t}`, '', '| Method | Path | operationId | Summary | Permission | Idempotent | Workflow |', '|---|---|---|---|---|---|---|');
    for (const { m, p, op } of byTag[t]) {
      lines.push(`| \`${m}\` | \`${p}\` | \`${op.operationId}\` | ${op.summary ?? ''} | ${op['x-permission'] ? `\`${op['x-permission']}\`` : ''} | ${op['x-idempotent'] ? 'yes' : ''} | ${op['x-workflow-doc-type'] ?? ''} |`);
    }
    lines.push('');
  }
  if (root.webhooks) {
    lines.push('## Webhooks', '', '| Event | Summary |', '|---|---|');
    for (const [name, item] of Object.entries(root.webhooks)) lines.push(`| \`${name}\` | ${item.post?.summary ?? ''} |`);
    lines.push('');
  }
  fs.writeFileSync(INDEX, lines.join('\n'));
}

// ── main ──────────────────────────────────────────────────────────────────

let root;
try {
  root = bundle();
} catch (e) {
  console.error(`✖ ${e.message}`);
  process.exit(1);
}
const stats = lint(root);

for (const w of warnings) console.warn(`⚠ ${w}`);
for (const e of errors) console.error(`✖ ${e}`);

console.log(
  `OpenAPI ${root.openapi} · ${stats.paths} paths · ${stats.operations} operations · ${stats.tags} tags · ${stats.schemas} schemas · ${stats.sharedExamples} shared examples · ${stats.examples} inline example slots · ${stats.webhooks} webhooks`,
);
console.log(Object.entries(stats.byTag).map(([t, n]) => `${t}=${n}`).join('  '));

if (errors.length) {
  console.error(`\n${errors.length} error(s)`);
  process.exit(1);
}
if (!CHECK_ONLY) {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(root, null, 2) + '\n');
  console.log(`→ wrote ${rel(OUT)} (${(fs.statSync(OUT).size / 1024).toFixed(0)} KB)`);
  if (WRITE_INDEX) {
    writeIndex(root);
    console.log(`→ wrote ${rel(INDEX)}`);
  }
}
