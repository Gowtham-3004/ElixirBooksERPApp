# Elixir Books ERP — Front-end Architecture & Module Conventions

This is a React 19 + Vite + TypeScript prototype of the Elixir Books ERP (see `src/imports/elixir-books-frd__2_.md` for
requirements and `src/imports/design-system-books.md` for the design system). There is no backend: an in-memory,
localStorage-persisted store plus a shared business engine make every screen fully functional.

## Layout

```
src/
  lib/format.ts            money/date/number formatting, validators (GSTIN/PAN/IFSC), CSV, ids
  store/
    types.ts               core domain types (Company, User, Customer, Item, Account, DocHeader, Journal, …)
    collections.ts         C.* collection-name constants — ALWAYS use these, never string literals
    db.ts                  the store: db.get/find/where/insert/update/remove/transaction + useCollection/useRecord hooks
    session.ts             auth + active scope (user, tenant, company, branch, FY, period) — useSession()
    nav.ts                 hash router — nav.go('sales/invoices/<id>'), useRoute() → {module, sub, id, params}
    engine.ts              shared business engine (numbering, periods, tax, totals, pricing, journals, stock,
                           reservations, credit, workflow/approvals, open items, FX, audit, notifications)
    seed/core.ts           platform/org/identity/master seed + fixed IDS (IDS.cArlene, IDS.accAR, …)
    seed/<module>.ts       per-module document seed (owned by that module)
    index.ts               barrel: import { db, C, engine, useCollection, useSession, nav, IDS, … } from '@/store'
  components/
    Icons.tsx              SVG icon set
    AppShell.tsx           sidebar (from registry), context bar (company/branch/period switchers, ⌘K search,
                           notifications, user menu), banners
    ui/                    shared component library — import from '@/components/ui'
  modules/
    registry.tsx           MODULES list: id, label, group, icon, lazy component, profiles, permission
    <module>/index.tsx     module entry: export default function Module({ route }: ModuleProps)
    <module>/…             everything else for that module (pages, forms, types, hooks)
  pages/                   LEGACY static mock pages — replace, do not extend. Delete when superseded.
docs/ARCHITECTURE.md       this file
scripts/smoke.mjs          headless runtime smoke test (npm run smoke, needs `npx vite --port 5173` running)
```

## Routing

Hash routes: `#/<module>/<sub>/<id>?param=x`. `useRoute()` gives `{ module, sub, id, rest, params }`.
`App.tsx` resolves `<module>` via the registry (entitlement + permission gates) and renders the module component.
Each module owns its sub-routes. Standard shape:

```tsx
export default function Module({ route }: ModuleProps) {
  return (
    <ModuleShell module="sales" title="Sales" items={[{ id: 'quotations', label: 'Quotations' }, …]}>
      {(sub) => {
        if (sub === 'invoices' && route.id === 'new') return <InvoiceForm />;
        if (sub === 'invoices' && route.id) return <InvoiceDetail id={route.id} />;
        if (sub === 'invoices') return <InvoiceRegister />;
        …
      }}
    </ModuleShell>
  );
}
```

Link to documents with `nav.go(docLink('sales', 'invoices', id))`. Use `route.params.tab` for tabs, `nav.back()` for back.

## Data access

```ts
const invoices = useCollection<SalesInvoice>(C.salesInvoices);          // reactive, stable reference
const inv = useRecord<SalesInvoice>(C.salesInvoices, id);               // reactive single record
db.insert(C.salesInvoices, { ...fields });                              // stamps id/createdAt/companyId/version
db.update(C.salesInvoices, id, { status: 'Posted' }, { expectedVersion: inv.version }); // optimistic concurrency
db.transaction(() => { …several writes… });                             // one notification
```

- Filter by `companyId === scope.state.companyId` in registers (records are stamped with the active company on insert).
- Never mutate records in place; always `db.update`. Posted documents are never edited/deleted — reverse/cancel instead.
- Module-specific types extend `DocHeader` (documents) or `BaseRecord` (masters) and live in `src/modules/<m>/types.ts`.
- Seed your module's demo data in `src/store/seed/<module>.ts` (return `{ [C.xxx]: rows }`), using `rec()` and `IDS`
  from `./core`. Keep seed rich enough that every register/dashboard has realistic rows (10–30 per collection).
  Bump nothing — the seed version is global; `db.reset()` reseeds (Company admin › Data reset).

## Business engine (`engine.*`) — use it, do not reimplement

| Need | Call |
|---|---|
| Scope/actor | `engine.ctx()` → companyId, branchId, userName, company, currency, can() |
| Number allocation | `engine.allocateNumber('Sales Invoice', { date, branchId })`, `engine.previewNumber(...)`, `engine.voidNumber(...)` |
| Period control | `engine.postingCheck(date)` → {ok, reason}; `engine.assertPostable(date)` throws |
| Tax + totals | `engine.computeDocument(lines, engine.taxContextFor('Customer', partyId, 'sale', branchId, placeOfSupplyCode), { charges, tdsSectionId, roundTotal })` → {lines, totals} |
| Pricing | `engine.resolvePrice({ itemId, qty, customerId, priceListId })`, `engine.lineFromItem(itemId, {...})` |
| Journals | `engine.postJournal({ date, lines: [{accountId, dr}, {accountId, cr}], sourceType, sourceId, sourceNumber, narration, idempotencyKey })`, `engine.reverseJournal(id, { reason })`, `engine.accountBalance(accountId, { from, to })` |
| Stock | `engine.moveStock({ date, itemId, warehouseId, qty: -5, type: 'Delivery', sourceType, sourceId, sourceNumber })`, `engine.stockPosition(itemId, warehouseId)`, `engine.reserveStock(...)`, `engine.reverseStockMovements(sourceId, {...})` |
| Open items | `engine.createOpenItem({...})`, `engine.settleOpenItem(openItemId, { amount, docType, docId, docNumber, date, rate })` (posts realized FX), `engine.partyOutstanding('Customer', id)` |
| Credit | `engine.checkCredit(customerId, amount)` → {ok, mode, message, needsApproval} |
| Workflow | `engine.submitForApproval({ docType: 'Sales Invoice', collection: C.salesInvoices, docId, docNumber, amount })` → request or null (no workflow ⇒ post directly); `engine.actOnApproval(id, 'Approve'|'Reject'|'Return'|'Delegate'|'Recall', { comment })`; `engine.myPendingApprovals()` |
| FX | `engine.resolveRate('USD','INR', date)`, `engine.toBase(amount, 'USD', date)` |
| Audit / notify | `engine.audit({ action: 'invoice.posted', objectType: 'Sales Invoice', objectId, objectNumber, detail })`, `engine.notify({ type: 'approval', title, link })` |
| Doc helpers | `engine.newDocHeader('Sales Invoice', {...})`, `engine.newLine()`, `engine.partySnapshotFor('Customer', id)`, `engine.dueDateFor(date, 'Net 30')`, `engine.markPosted(C.col, doc, extra)` |

Posting pattern for a financial document (all inside `db.transaction`):
1. `engine.assertPostable(doc.date)`
2. `const number = engine.allocateNumber(doc.docType, { date, branchId })`
3. `const j = engine.postJournal({...})` (idempotencyKey = doc.id + ':post')
4. stock moves via `engine.moveStock` where applicable
5. `engine.createOpenItem(...)` for AR/AP documents
6. `db.update(col, doc.id, { status: 'Posted', number, journalId: j.id, journalNumber: j.number, postedAt, postedBy })`
7. `engine.audit(...)` + `engine.notify(...)`
Errors are `ValidationError` with `.code` and `.field` — surface with `useToast().error(e.message)` or inline.

Reversal pattern: `engine.reverseJournal`, `engine.reverseStockMovements`, `engine.unsettleOpenItem`, mark original `Reversed`
with `reversedById`, create linked reversal doc with `reversalOfId`. Always require a reason (ReasonField / ConfirmDialog).

## UI library (`@/components/ui`) — use these, do not hand-roll

- **Register page**: `<RegisterPage title subtitle rows columns tabs filters searchKeys primaryAction importAction rowActions onRowClick bulkActions entity />`
  — gives header, filter tabs with counts, search, filter panel, column chooser, export (CSV/XLSX/PDF, async >500 rows), bulk bar, pagination, totals, empty states.
- **Table**: `<DataTable rows columns rowActions onRowClick selectable dense />`; `Column<T> = { key, label, render, value, align, sortable, total }`.
- **Document page**: `<DocumentPage backLabel onBack number badges amount due rail tabs footer banner />` with `RailSection`, `PartyRail`,
  `ApprovalsTab`, `AccountingTab` (posted or projected journal), `ActivityTab` (audit), `AttachmentsPanel`, `PrintSheet` (print/PDF).
- **Forms**: `TextField NumberField MoneyField PercentField SelectField DateField (checkPeriod) TextArea ReasonField CheckboxField Toggle RadioCards ChipGroup Segmented IdentifierField (GSTIN/PAN/IFSC) MaskedValue EntityPicker` + option hooks
  `useCustomerOptions useSupplierOptions useItemOptions useAccountOptions useEmployeeOptions useWarehouseOptions useUserOptions useDimensionOptions useTaxRateOptions`.
- **Lines & totals**: `LineItemGrid` (editable/read-only, price resolution, tax explain, availability, source eligibility), `TotalsLadder`, `TaxBreakup`.
- **Overlays**: `Drawer` (forms), `Modal`, `ConfirmDialog` (financial confirmation with consequences + reason), `ActionMenu` (⋮), `SplitButton`, `Popover`/`Explain`, `useToast()`, `useAction()`.
- **Composites**: `ModuleShell` (left sub-nav), `PageHeader`, `ScopeLine`, `PeriodBanner`, `Checklist`, `ImportWizard` (upload → map → dry-run → errors → commit, duplicate/fingerprint blocking), `KpiTile`, `Banner`, `Badge` (status → colour taxonomy), `Pill`, `Money`, `TwoLine`, `Identifier`, `EmptyState`, `NoPermission`, `Skeleton`, `Meter`, `SummaryBlock`, `KV`, `Tabs`.
- Icons: `src/components/Icons.tsx`.
- Formatting: `fmtMoney fmtMoneyCompact fmtDate fmtDateTime fmtQty fmtPct fmtPeriod today addDays daysBetween ageingBucket amountInWords` from `@/lib/format`.

## Design rules that matter (from the design system)

- Every register has the anatomy above; row click opens the document page; number is a link; `⋮` holds state-valid actions only.
- **Actions are state-driven**: not applicable → not rendered; blocked by permission/period/credit → rendered disabled with a reason (`reason` prop on Button / MenuAction).
- Post / Reverse / Cancel / Approve batch / Lock / Reopen always go through `ConfirmDialog` with consequences + reason where the FRD requires one.
- Labels are verb + object (`Post invoice`, `Record receipt`) — never `OK`/`Submit` alone. Secondary button restates the safe choice (`Keep invoice`).
- Money via `Money`/`fmtMoney` (tabular, true minus, currency code when mixed). Dates via `fmtDate`. Empty cells `—`.
- Every widget/report header shows scope · period · currency · freshness (`ScopeLine`).
- Posted documents show snapshot tags on party/price/tax; drafts autosave; use `expectedVersion` on saves of drafts.
- Use existing CSS classes from `src/index.css` / `src/styles/ui.css` (`btn-*`, `badge-*`, `pill-*`, `data-table`, `field-input`, `card`, `page`, …). Inline styles are fine for layout; keep the Inter/blue look.

## Responsive layout

Breakpoints live in `src/lib/useMedia.ts` (`useIsMobile` ≤ 767px, `useIsTablet` ≤ 1023px) and are
mirrored by the `@media` blocks at the bottom of `src/styles/ui.css`.

- **Phone (≤ 767px)** — the sidebar is an off-canvas drawer (`.sidebar.open` + `.sidebar-scrim`,
  hamburger in `.shell-header`); company · branch · FY · period move into the `.shell-context` strip
  under the header; header dropdowns render as `.menu.mobile-sheet`. Module sub-navs become a
  horizontal chip strip, `DocumentPage` stacks the rail above the tabs (rail sections collapsed behind
  a *Details* toggle) and its footer is a sideways-scrolling strip that starts scrolled to the primary
  action. Drawers are full-width, modals near full-screen, tables scroll sideways with no-wrap cells.
- **Tablet (768–1023px)** — icon rail, context strip, chip sub-nav, two-column form grids, side
  panels stacked, POS as catalogue | cart-over-tender.
- **Desktop (≥ 1024px)** — unchanged; 1024–1279 narrows the sub-nav and document rail a little.

Most page layouts are inline `display:grid` / `display:flex` styles, so the responsive layer matches
the serialised `style` attribute (`[style*="grid-template-columns: 1fr 1fr"]`, …) and overrides with
`!important`. Row grids that start with a px column (`90px 1fr`, `1fr 160px 32px`) are label/value or
line rows and are deliberately left alone. `.doc-body` is a container-query root, so document-pane
forms collapse on the pane's own width rather than the viewport. When you write new layout, prefer
the shared classes — `.page-actions`, `.tab-strip`, `.table-scroll`, `.grid-2/3/4`, `.kv`,
`.form-footer` — and inline grids with the templates listed above; both get the responsive behaviour
for free. Verify with `node scripts/audit-responsive.mjs <baseUrl> <outDir> [routes…]` (`pnpm responsive`):
it screenshots every route at 375 / 768 / 1024 / 1440 and fails if anything extends past the viewport
outside an `overflow-x: auto` container.

## Permissions & entitlement

`useSession()` → `{ user, company, branch, period, currency, roles, can(perm), entitled(moduleId), profiles, isTenantOwner }`.
Permission strings are `<module>.<resource>.<action>` (e.g. `sales.invoice.post`); roles may hold `sales.*` or `*`.
Gate buttons with `reason={!can('sales.invoice.post') ? 'Requires Finance role' : undefined}` + `disabled`.

## Quality bar

- `npm run typecheck` must pass (strict TS). `npm run build` must pass.
- Runtime: `npx vite --port 5173` then `npm run smoke` (or `node scripts/smoke.mjs http://localhost:5173 <routes…>`) — zero page errors.
- No dead buttons: every rendered action does something (opens a form, posts, navigates, or is disabled with a reason).
- Forms validate inline (field errors + summary), documents recompute totals via `engine.computeDocument` on every change.
- Keep files focused (< ~600 lines); split registers/forms/detail pages into separate files inside the module folder.
- Do not edit files owned by another module. Shared files (`store/types.ts`, `engine.ts`, `ui/*`, `AppShell.tsx`, `registry.tsx`)
  may receive small, additive, backwards-compatible changes only — note them in your final report.

---

## Module map (built)

| Module | Route | Key screens |
|---|---|---|
| Home | `home` | Role dashboard (live KPIs, revenue/expense chart, top customers, recent docs, approvals, period status), onboarding checklist, `home/help` |
| Approvals | `approvals` | Inbox (awaiting me / my requests / all / completed), inline approve·reject·return·delegate·recall, bulk approve, `approvals/activity` audit feed |
| CRM | `crm` | Leads + pipeline board, customer 360, activities, collections |
| Sales | `sales` | Quotations → orders (credit check, reservations) → deliveries → invoices (post, e-invoice, e-way bill, reverse, write-off) → credit notes/returns → receipts (allocation, advances, FX) → AR ageing, statements, collections |
| Purchase | `purchase` | Requisitions → RFQ/quotes/award → POs → GRN+QC → vendor invoices (duplicate detection, 2/3/4-way match) → exceptions workbench → debit notes → payments → batches (maker-checker, bank file, UTR) → AP ageing |
| Inventory | `inventory` | Stock on hand, ledger, batches/serials, reservations, adjustments, transfers (transit/shortage), counts, replenishment, landed cost, valuation reconciliation |
| POS | `pos` | Terminal (shift, catalogue, cart, split tender, hold/resume, idempotent checkout), returns, shift close with variance, bills, terminals admin |
| Projects (Services) | `projects` | Service catalog, contracts (6 billing methods), projects, resources/rate cards, timesheets, billable expenses, milestones/usage, billing runs → draft invoices, retainers, revenue recognition, profitability |
| Production (Manufacturing) | `production` | BOMs (versioned), routings, work centres, MRP → suggestions → POs/orders, production orders (issue, operations, receipts, QC, costing), quality, subcontracting, WIP, genealogy |
| Accounting | `accounting` | Journals (draft→approve→post→reverse), recurring, day book, ledger, trial balance, customer/supplier sub-ledgers, opening balances, FX & revaluation, intercompany, period close |
| Banking | `banking` | Bank/cash accounts, vouchers, statement import, reconciliation workbench (suggestions, 1:n/n:1, unmatch, BRS) |
| Taxation | `taxation` | GST B2B/B2C/ITC/CDN registers, e-invoices, e-way bills, GSTR-1, GSTR-3B, TDS/TCS, filing history |
| Payroll | `payroll` | Employees, salary structures (effective-dated), inputs, runs (finalize/post/bank file/reverse), payslips, loans, statutory |
| Fixed assets | `fixed-assets` | Register, capitalization, depreciation runs, transfers, revaluation/impairment, disposals, categories, reports |
| Budgets & expenses | `budgets` | Budgets (revisions), budget vs actuals, budget control rules, expense claims, settings |
| Reports | `reports` | CFO dashboard, P&L, balance sheet, cash flow, trial balance, journal register, AR/AP, inventory, sales/purchase analysis, margin, tax, FX, budget variance, profitability, saved reports, group consolidation |
| Masters | `masters` | 19 registers (parties, items, warehouses, price lists, COA, dimensions, tax rates, TDS, currencies, FX rates, reference) + import wizards |
| Company admin | `admin` | Company profile, companies, branches, periods (close checklist), defaults, users, roles matrix, numbering, workflow designer, templates, business profile, localization, plan & usage, audit, integrations, jobs, notifications, data reset |
| Platform admin | `platform` | Plans (versioned), tenants (subscription states), usage, platform audit |

## Verification tooling

- `npm run typecheck` · `npm run build`
- `npx vite --port 5173` then `npm run smoke` — visits all ~214 routes headlessly and fails on any page/console error.
- `npx vite-node scripts/audit-seed.mts` — seed integrity: balanced journals, unique numbers/ids, trial-balance balance, control-account reconciliations, no negative stock.
- Per-module Playwright walkthroughs in `scripts/` cover the FRD end-to-end scenarios (E2E-01 sales-to-cash, E2E-02 purchase-to-pay, E2E-03 period close, E2E-05 idempotency, E2E-07 consolidation, E2E-10 services, E2E-11 manufacturing).
