# Elixir Books ERP — OpenAPI contract

Source of truth for the HTTP API the front end expects from a backend. The front end today runs
against an in-browser store (`src/store`), so this contract is **derived from the code**: every
TypeScript interface became a schema, every exported action function became an operation, every
status union became an enum, and every engine error code became an `ErrorCode`.

| What | Where |
|---|---|
| Multi-file source (edit these) | `docs/api/openapi.yaml`, `docs/api/paths/*.yaml`, `docs/api/components/**` |
| Bundled single file (generated) | `public/api/openapi.json` — served by Vite at `/api/openapi.json` |
| Browsable reference (Swagger UI) | `public/api/index.html` → <http://localhost:8443/api/index.html> |
| Endpoint index (generated) | `docs/api/ENDPOINTS.md` |

```sh
pnpm api:lint     # validate the source (refs, ids, required responses, examples)
pnpm api:bundle   # lint + write public/api/openapi.json + ENDPOINTS.md
npx @redocly/cli lint public/api/openapi.json --config docs/api/redocly.yaml   # optional second opinion (0 errors)
```

Current size: **905 operations** across 653 paths and 20 tags, 750 schemas, 137 shared + 1 929
inline examples, 29 webhooks (28 domain events + `test`). Per module: Masters 121 · Admin 102 ·
Purchase 88 · Sales 80 · Production 76 · Projects 66 · Inventory 42 · Accounting 40 · Reports 38 ·
Payroll 37 · Banking 35 · Budgets 31 · Taxation 29 · POS 24 · Auth 22 · Fixed Assets 21 ·
CRM 16 · Platform 16 · System 16 · Approvals 5.

## Layout

```
docs/api/
  openapi.yaml                 root: info (conventions), servers, security, tags, x-tagGroups
  paths/<module>.yaml          { "/path": PathItem }           one file per module / tag
  components/
    securitySchemes.yaml       bearerAuth, apiKeyAuth
    parameters.yaml            X-Company-Id, Idempotency-Key, cursor/limit/sort/q, filters, ids
    headers.yaml               X-Correlation-Id, Location, ETag, RateLimit-*
    responses.yaml             shared error responses, each with several named examples
    schemas/<module>.yaml      { Name: Schema }                common, document, <module>…
    examples/<module>.yaml     { Name: Example }               reusable payloads
  webhooks.yaml                { EventName: PathItem }         domain events (OpenAPI 3.1 webhooks)
```

`scripts/openapi-bundle.mjs` discovers these by convention (no config), rewrites every external
`$ref` to `#/components/<type>/<Name>`, merges everything into one document, lints it and writes
the bundle. Component names must be unique across files of the same type.

## Conventions (summary — the root `openapi.yaml` description is the full text)

- `/v1` base path · tenant from the token · **`X-Company-Id` header required** on company-scoped
  operations (not on `/auth/*`, `/me*`, `/onboarding*`, `/companies`, `/platform/*`, `/health`, `/enums`).
- `bearerAuth` (JWT) by default; `apiKeyAuth` on operations whose `x-permission` is covered by an
  API-key scope.
- Cursor pagination `cursor`/`limit`/`sort`; lists return `{ data, meta, scope }`.
- `expectedVersion` on edits → `409 CONFLICT` when stale.
- `Idempotency-Key` on every `x-idempotent` operation → replay or `409 IDEMPOTENCY_CONFLICT`.
- One `Error` body `{ code, message, field?, path?, details?, correlationId }`; `ErrorCode` is the
  closed list in `components/schemas/common.yaml`.
- State-changing document actions return an `ActionResult` (`document` + `journal`,
  `stockMovements`, `openItems`, `approval`, `reservations`, `relatedDocuments`, `warnings`).
- Generic document sub-resources (attachments, journal, activity, PDF, e-mail) live once under
  `/documents/{collection}/{id}/…` (tag **System**) for every document collection.
- Operation extensions: `x-permission`, `x-frd`, `x-idempotent`, `x-events`,
  `x-workflow-doc-type`, `x-platform-only`, `x-company-scoped`.

## The "full cases" rule

Every operation documents all of its cases, using shared components so the files stay readable:

| Operation type | Request examples | Success examples | Error responses (all `$ref`) |
|---|---|---|---|
| List | query examples in the description | `firstPage`, `lastPage`, `empty` | 400 401 403 |
| Get | — | one per notable state | 401 403 404 |
| Create | `minimal`, `full`, domain variants | one per variant (201) | 400 401 403 404 409 422 (423 if dated) |
| Patch | `fieldsOnly`, `replaceLines` | 200 | 400 401 403 404 409 422 |
| Delete | — | 204 | 401 403 404 409 |
| Action | variants where the input differs | outcome variants (e.g. routed vs posted) | 400 401 403 404 409 422 423 (502 provider) |
| Bulk | action variants | `allSucceeded`, `partialFailure` | 400 401 403 |
| Report | query variants | `withRows`, `empty` | 400 401 403 |
| Export / import / upload | format / dry-run / commit | 202 job or 200 inline | 400 401 403 409 413 422 |

The shared error responses in `components/responses.yaml` each carry several named examples
(e.g. `Conflict` → `staleVersion`, `idempotencyPayloadMismatch`, `invalidState`,
`alreadyReversed`, `duplicate`, `referenced`, `planLimit`), so an operation that references
`409` automatically exposes every 409 case.

## Adding or changing an endpoint

1. Put the schema in `components/schemas/<module>.yaml` (mirror the TS interface in
   `src/modules/<module>/types.ts`; `<Entity>Input` = writable fields, `<Entity>` = `allOf
   [BaseRecord, Input, server fields]`, `<Entity>Patch` = `allOf [Input, ExpectedVersion]`).
2. Put reusable payloads in `components/examples/<module>.yaml`.
3. Add the path to `paths/<module>.yaml` with `tags`, `summary`, `operationId`, `x-permission`,
   the `X-Company-Id` parameter (path-level), request/response examples and the `$ref` error responses.
4. `pnpm api:bundle` — fix anything the lint reports.

Reusing a payload inside another example: write `{ $ref: '#/components/examples/<Name>/value' }`
anywhere inside an example `value` (e.g. `document: { $ref: '#/components/examples/SalesInvoicePosted/value' }`).
That is not standard OpenAPI, so the bundler deep-clones the referenced value into the output — the
published JSON contains no such refs. Shared examples live in `components/examples/<module>.yaml`.

`x-permission` uses the strings the app itself checks (`s.can('…')`): `<module>.<resource>.<action>`,
with `<module>.*` wildcards honoured by `permissionCovers` in `src/modules/admin/shared.tsx`.
Self-service endpoints (`/me*`, `/auth/*`, `/enums`, `/countries`) carry no `x-permission`.

YAML gotcha: inside flow mappings `{ … }` a comma or `: ` in an unquoted value splits the entry.
Quote such strings (`description: "a, b"`). The bundler flags the resulting stray keys.
