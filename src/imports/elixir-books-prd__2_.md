# Elixir Books ERP — Product Requirements Document (PRD)

**Document status:** Draft for product, design, engineering, and QA review  
**Version:** 1.2  
**Date:** 07 September 2026  
**Related document:** Elixir Books ERP BRD v1.0

## 1. Product definition

Elixir Books is a modular, multi-tenant ERP for Indian businesses. It unifies financial accounting with customer sales, supplier purchase, inventory, POS, banking, payroll, fixed assets, tax compliance, workflow, and reporting. A customer can begin with a Lite invoicing edition and unlock full ERP capabilities without migrating data.

The first technical form is a modular monolith using a shared PostgreSQL database, API application, and background workers. Identity may run inside the platform/Books API initially but shall have an explicit boundary so it can become a separate service later.

## 2. Product goals

- Deliver a reliable finance core whose ledgers reconcile to every posted source document.
- Complete the principal order-to-cash and procure-to-pay journeys.
- Offer simple onboarding for small businesses and governance for multi-branch organizations.
- Make tax, inventory, accounting, audit, and reports consequences automatic.
- Provide role-specific, responsive workflows for operators, managers, finance, and executives.
- Provide stable APIs for web, mobile, desktop, automation, and partners.
- Launch India-first while keeping company, currency, tax, document, and reporting contracts ready for international expansion.
- Adapt each company experience to Manufacturing, Trading, Services, or a governed hybrid profile without creating separate ERP products.

### 2.1 Non-goals

- Manufacturing/MRP in the initial product program.
- A general low-code platform permitting arbitrary runtime logic.
- Replacing banks, GST networks, or statutory portals.
- Supporting every national tax regime in the first release.

## 3. Personas and jobs to be done

| Persona | Primary job |
|---|---|
| Tenant owner | Subscribe, create companies, invite teams, govern product access |
| Company admin | Configure branches, periods, numbering, masters, permissions, workflows |
| Accountant | Post, reconcile, close, correct, and report trustworthy books |
| Sales executive | Prepare quotes/orders/invoices quickly and track collection |
| Sales manager | Approve discounts, monitor pipeline/order fulfilment and credit exposure |
| Purchase executive | Procure items/services with approved commercial terms |
| Warehouse user | Receive, issue, transfer, count, and trace stock |
| Finance approver | Approve invoices, journals, payments, overrides, and exceptions |
| Cashier | Bill rapidly, accept tenders, process returns, close shift |
| Payroll user | Calculate and post salary obligations securely |
| CFO | Understand profitability, cash, working capital, risk, and forecast |
| Auditor | Trace who changed, approved, posted, reversed, exported, or accessed data |

## 4. Product experience principles

- Context is always visible: tenant, company, branch, financial year, and document state.
- Drafting is forgiving; posting is controlled and explicit.
- Users see business language while accounting consequences remain inspectable.
- Validation appears close to the field and explains how to resolve the problem.
- Registers use consistent search, filters, columns, bulk actions, export, and saved views.
- Destructive or financial actions show consequences and require appropriate confirmation.
- Mobile prioritizes approvals, dashboards, capture, lookup, and selected transactions.
- The visual direction is light skeuomorphism with restrained depth, high readability, and finance-grade density.

## 5. Product information architecture

1. Home / role dashboard
2. CRM
3. Sales
4. Purchase
5. Inventory
6. POS
7. Accounting
8. Banking
9. Taxation
10. Payroll
11. Fixed assets
12. Budgets and expenses
13. Reports and CFO dashboard
14. Approvals and activity
15. Masters and imports
16. Company administration
17. Platform administration (authorized platform users only)

Menu availability is driven by subscription and permission; development order follows dependencies, not navigation order.

## 6. Release scope and priorities

### 6.1 Release 1 — Foundation

Must include:

- Tenant/subscription record and entitlement enforcement.
- Sign-in, invitation, password/session controls, roles and scoped permissions.
- Company, branch/location, financial year, period, currency, tax registration.
- Global/common masters, number series, attachment, audit, notifications.
- Import templates and initial onboarding checklist.

Exit outcome: an administrator can securely onboard a multi-branch organization.

### 6.2 Release 2 — Accounting and Sales MVP

Must include:

- COA, dimensions, journals, posting engine, GL, customer ledger, opening balances.
- Customer, item/service, UOM, HSN/SAC, GST, payment terms, price list.
- Direct draft/approve/post/cancel sales invoice.
- Receipts and invoice allocation.
- PDF/email, sales register, customer ledger/outstanding, trial balance, tax summary.

Exit outcome: a service or simple-goods company can invoice, collect, and produce reconciled accounting.

### 6.3 Release 3 — Inventory and full Sales

- Warehouse, stock opening, stock ledger, valuation, adjustment, transfer.
- Quotation, sales order, reservation, delivery, partial fulfilment.
- Sales return, credit note, credit control, ageing.
- Sales and inventory operational reports.

Exit outcome: complete order-to-cash for stock and service items.

### 6.4 Release 4 — Purchase and banking

- Supplier, requisition, RFQ, PO, GRN, vendor bill, 2/3-way matching, return/debit note, AP.
- Cash/bank, receipt/payment vouchers, payment batch, statement import, reconciliation.

Exit outcome: procure-to-pay and daily cash/bank control.

### 6.5 Release 5 — POS and compliance

- POS terminal, shift, tender, return, closing.
- E-invoice, e-way bill, GSTR-1, 2B/reconciliation, GSTR-3B preparation, TDS/TCS.

### 6.6 Release 6 — Enterprise finance

- Budgets, expense/reimbursement, payroll accounting, fixed assets.
- Advanced workflows, dashboards, forecasts, custom fields, integrations.

### 6.7 Release 7 — Business profiles and manufacturing

- Trading and Services profile templates with nature-aware onboarding, navigation, masters, workflows, dashboards, and reports.
- Hybrid profile selection and controlled change-impact workflow.
- Manufacturing core: BOM/routing, work centres, MRP, production orders, material issue/consumption, output, scrap/by-product, WIP, quality, subcontracting, production costing and variance.

## 7. Epic requirements

### EP-01 Platform, subscription, and entitlement

User stories:

- As a platform admin, I can create plans and entitlements so customers receive contracted features and limits.
- As a tenant owner, I can see plan, renewal, limits, usage, and upgrade options.
- As a Lite customer, I can upgrade to Pro and retain all data and document history.

Acceptance highlights:

- An unentitled feature is unavailable in UI and rejected by API.
- Expiry/grace/suspension behavior follows configured policy without losing data.
- Entitlement changes are audited.

### EP-02 Identity and authorization

- Invite, activate, suspend, and deactivate users.
- Define roles from granular resources/actions and data scopes.
- Assign tenant/company/branch access.
- Switch company/branch without a new account.
- Review active sessions and security events.

Acceptance highlights:

- Authorization is server-enforced on every operation.
- Cross-tenant identifiers cannot expose existence or data.
- Identity contracts remain separable from business domains.

### EP-03 Organization and onboarding

- Guided company setup: legal information, GST/PAN, addresses, currency, fiscal settings, logo, bank accounts.
- Create branches, offices, stores, warehouses, GST registrations, and mappings.
- Configure financial years, periods, books beginning date, sequences, defaults, and policies.
- Import masters/opening data with validation and reconciliation status.

### EP-04 Master data management

- Govern country/state/currency/UOM/HSN/SAC/tax reference data.
- Manage customers, suppliers, contacts, addresses, items/services, warehouses, salespersons, projects, dimensions, terms, and price lists.
- Support active/inactive, duplicate checks, import/export, audit, and references.
- Prevent deactivation where business rules require an active dependency.

### EP-05 Accounting foundation

- Configure COA templates and company-specific ledgers.
- Create manual and source journals with dimension and currency lines.
- Validate, approve, post, reverse, and trace journals.
- Maintain GL/sub-ledgers and opening balances.
- Lock periods and execute controlled close/reopen.
- Produce day book, journal register, ledger, trial balance, P&L, balance sheet, cash flow.

### EP-06 Tax engine and compliance data

- Determine GST type from registrations, locations, party/item treatment, and place of supply.
- Calculate inclusive/exclusive GST, cess, reverse charge, export/SEZ/exempt/nil/non-GST cases.
- Apply TDS/TCS sections, thresholds, and party applicability where enabled.
- Store tax snapshots and statutory identifiers on source documents and journal lines.
- Generate e-invoice/e-way bill payloads, status, acknowledgement, QR/reference, cancellation, and retry history.

### EP-07 Pricing and commercial rules

- Create selling/purchase price lists with currency, dates, tax-inclusion, item/UOM rate, quantity slab, and priority.
- Assign a default price list to customer/supplier/channel/branch.
- Resolve one applicable price deterministically.
- Permit authorized overrides and record source rate, applied rate, discount, and reason.

### EP-08 Inventory

- Maintain warehouse/bin, opening quantity/value, stock movement, availability, reservation, and valuation.
- Process adjustment, transfer, transit/receipt, count, damage/write-off.
- Support batch/serial/expiry as an edition or phase capability.
- Integrate GRN, delivery, POS, returns, and direct invoice with stock and accounting.

### EP-09 Sales and receivables

- CRM lead/opportunity/activity foundation.
- Quotation create/revise/send/convert.
- Sales order approve, reserve, partially fulfil, short-close/cancel.
- Delivery issue/reverse and invoice conversion.
- Direct or source-linked sales invoice with posting, PDF, email, outstanding, and statutory status.
- Return/credit note with inventory, tax, and ledger reversal.
- Receipt, advance, partial/multi-invoice allocation, reversal, ageing, and collections.

### EP-10 Purchase and payables

- Requisition, approval, RFQ, supplier quotation comparison.
- PO, partial receipt, GRN, optional inspection.
- Vendor invoice and configurable 2/3/4-way matching with tolerances.
- Purchase return/debit note with stock, tax, and ledger effects.
- AP ageing, advance, payment proposal, approval, and payment allocation.

### EP-11 POS

- Open/close cashier shift with float and variance.
- Scan/search item, price, discount, tax, hold/resume cart.
- Complete bill with cash/card/UPI/mixed tender.
- Return against original bill and update inventory/accounting.
- Offline capability is excluded until explicitly designed; poor-connectivity behavior must be safe and visible.

### EP-12 Banking and reconciliation

- Manage bank/cash accounts and vouchers.
- Import statement files with mapping, validation, duplicate prevention, and import history.
- Match one-to-one, one-to-many, many-to-one, and suggest by amount/date/reference/party.
- Create authorized adjustments and complete/undo reconciliation with audit.
- Prepare payment batches and record file/reference/UTR/failure/reversal.

### EP-13 Workflow and collaboration

- Configure sequential/parallel workflows by document, amount, branch, role, department, project, and exception.
- Submit, approve, reject, return, resubmit, delegate, escalate, recall where permitted.
- Show approval history, comments, attachments, notifications, and ageing.
- Prevent requesters from bypassing maker-checker policies.

### EP-14 Budgets, expenses, payroll, and fixed assets

- Budget by account/dimension/period and compare commitment/actual/available.
- Submit and approve employee claims with allocation and payment.
- Manage employee/pay components, payroll run, approvals, accounting, and payment outputs.
- Capitalize assets, depreciate, transfer, revalue, impair, and dispose with ledger integration.

### EP-15 Reporting, analytics, and audit

- Standard filterable registers with drill-down and asynchronous exports.
- Role-scoped CFO dashboard and operational KPIs.
- Saved views, scheduled report generation, and data freshness indicator.
- Searchable audit timeline by actor, business object, event, correlation, and period.
- Report totals reconcile to source ledgers for the same scope and cut-off.

### EP-16 Multi-country and localization platform

- Configure each legal company with ISO country, base currency, fiscal calendar, time zone, locale/language, legal identifiers, tax registrations, and localization-pack version.
- Keep the ERP core country-neutral and resolve country behavior through versioned localization contracts.
- Allow a tenant to operate companies in multiple countries while enforcing independent ledgers, periods, tax books, bank accounts, sequences, and statutory reports.
- Provide extension points for registration schema, validation, tax, invoice requirements, statutory reports, providers, payroll rules, address/formatting, and retention.
- Start with India; introduce UAE, UK, and other packs through separately governed releases.

Acceptance: core transaction modules must not directly depend on GST-only fields; posted documents retain the country-pack version used; unsupported statutory behavior fails explicitly.

### EP-17 Multi-currency and foreign exchange

- Maintain ISO currencies, minor-unit precision, rounding, exchange-rate types/sources, quotation direction, effective timestamps, provider/manual priority, approval, and history.
- Support transaction, base, settlement, reporting, and consolidation currencies.
- Store original amount, base amount, rate, rate timestamp/type/source, and rounding on posted monetary facts.
- Maintain AR/AP open items by original currency and base carrying amount.
- Calculate realized gain/loss during settlement and unrealized revaluation at period end, with controlled reversal.
- Support foreign-currency bank accounts, cross-currency settlement, charges, and rate overrides.

Acceptance: every journal balances in company base currency; currency totals reconcile; retries do not duplicate FX postings; reversals use original currency context.

### EP-18 Group reporting and intercompany readiness

- Define tenant group hierarchy and optional reporting/consolidation currencies.
- Translate company balances using governed closing, average, historical, or account-specific rates.
- Preserve source values, applied rates, translated values, and translation adjustments.
- Support future intercompany counterparties, matching, eliminations, ownership periods, and consolidation journals.
- Allow consolidated report drill-down to translated company balance and source ledger.

### EP-19 Business-nature profiles

- Select one primary company profile: Trading, Services, Manufacturing, or Hybrid.
- Collect secondary characteristics such as stock/non-stock, B2B/B2C, retail/distribution, project/subscription/time-based service, discrete/process production, make-to-stock/order, and batch/serial requirements.
- Recommend a profile template for modules, terminology, dashboard, navigation, master-data checklist, COA, accounts, dimensions, roles, workflows, numbering, tax/document defaults, and imports.
- Let authorized administrators review and override recommendations before activation.
- Apply profile changes only after impact analysis, dependency checks, approval, migration steps, and audit; never rewrite history.
- Allow different companies under one tenant to use different profiles and currencies/localizations.

Acceptance: irrelevant capabilities are hidden from normal navigation but still protected by entitlement/API checks; hybrid profiles do not duplicate master or posting data; historical documents retain their original type and behavior after profile change.

### EP-20 Trading operating profile

- Provide supplier-to-stock-to-customer workflows, purchasing, GRN, warehouse/bins, valuation, replenishment/reorder, stock transfer, landed cost, price lists, order fulfilment, delivery, invoice and returns.
- Provide stock availability, ageing, turnover, margin, landed-cost, supplier performance, fulfilment, and branch/warehouse profitability views.
- Support wholesale, retail/POS, distribution, and non-stock/service add-ons through selected capabilities.

### EP-21 Services operating profile

- Provide service catalog, project/engagement, contract/SOW, resource and rate card, timesheet/usage/milestone/deliverable, billable expense, retainer/advance, service invoice and collection.
- Support fixed-price, time-and-material, milestone, recurring/subscription, usage-based, and cost-plus billing as phased capabilities.
- Integrate project/customer profitability, accrued/unbilled/deferred revenue where enabled, resource cost, expense, tax and receivables with shared accounting.

### EP-22 Manufacturing operating profile

- Manage item revisions, BOM versions/alternatives, routing/operations, work centres, calendars, yield, scrap/by-product, quality plans and subcontract operations.
- Calculate material requirements from demand, stock, reservations, lead time, safety stock, open supply, BOM and planning parameters.
- Create, release, schedule, execute, complete, cancel and close production orders.
- Issue/backflush materials, record labour/machine/overhead, receive output, track WIP, genealogy, variance and actual/standard cost according to enabled scope.
- Reuse inventory, purchase, sales, tax, accounting, workflow, numbering, audit and reports; manufacturing shall not implement parallel ledgers.

## 8. Core workflow state models

### 8.1 Financial document

Draft → Submitted → Approved → Posted → Settled/Closed.

Alternate transitions: Submitted → Rejected/Returned; Draft/Approved → Cancelled when unposted; Posted → Reversed/Adjusted through a linked corrective document.

### 8.2 Order fulfilment

Draft → Submitted → Approved → Confirmed → Partially fulfilled → Fulfilled → Closed.

Alternate: Rejected, Cancelled, Short closed. Fulfilment quantities may never exceed allowed source quantity unless an authorized tolerance applies.

### 8.3 Integration submission

Not required/Ready → Queued → Submitted → Accepted or Rejected → Cancelled where legally permitted.

Retries retain an idempotency reference and full attempt history.

## 9. Cross-module dependencies

| Product area | Mandatory upstream capabilities |
|---|---|
| Sales invoice | Customer, item/service, price/tax, numbering, AR, posting, permission, audit |
| Delivery | Sales order, warehouse, inventory engine, item/UOM |
| Purchase invoice | Supplier, tax, AP, posting; PO/GRN when matching required |
| GRN | PO, item, warehouse, inventory engine |
| Receipt/payment | Sub-ledger document, cash/bank, posting, allocation |
| POS | Sales, price, tax, inventory, tender accounts, posting |
| Payroll posting | Employee, payroll rules, dimensions, accounts, approved payroll |
| Depreciation | Asset register, period, method, posting |
| E-invoice | Posted GST sales invoice and valid statutory master data |
| Reconciliation | Bank statement, bank ledger, matching and adjustment capability |
| Financial statements | Correct GL, periods, dimensions, closing rules |
| Foreign-currency settlement | Currency/rates, FX-aware open items, bank currency, posting engine, gain/loss accounts |
| Period-end revaluation | Foreign open items/balances, closing rate, run and reversal rules |
| Country statutory process | Company localization pack, registrations, compliant documents, provider credentials |
| Consolidated statements | Closed company ledgers, group hierarchy, consolidation currency and translation rates |
| Trading profile | Party/item masters, purchase, inventory, sales, tax, accounting and banking |
| Services profile | Customer/service, project/contract, billing basis, expenses, tax, AR and accounting |
| Manufacturing profile | Item/inventory, purchase/sales demand, BOM/routing/work centre, planning, quality, costing and accounting |

## 10. Search, registers, and document UX

All major registers shall provide:

- Permission-scoped default view.
- Search, date/company/branch/status/party/amount and module-specific filters.
- Sort, pagination, configurable columns, saved views, and shareable filter state where safe.
- Totals calculated for clearly identified result scope.
- Export with asynchronous processing for large data.
- Row drill-down, source/target document links, activity, and audit access.
- Empty, loading, error, stale, and no-permission states.

Document pages shall provide:

- Sticky identity/status/amount summary.
- Header, party/address, lines, charges/discounts, tax, totals, terms, attachments, approvals, accounting, and activity sections.
- Inline calculation explanation and source/master snapshot.
- Explicit actions based on state, entitlement, and permission.

## 11. Notifications and communications

- Channels: in-app and email initially; SMS/WhatsApp through optional providers.
- Events: invitation, approval request/outcome, due/overdue, document sent, integration outcome, payment/receipt, import/export result, closing exception.
- Templates support company branding and locale-ready variables.
- Delivery attempts and failure status are observable; business posting must not roll back solely because notification fails.
- Sensitive documents require authorized recipients and protected access/link policy.

## 12. Non-functional product requirements

| ID | Requirement |
|---|---|
| NFR-01 | Monthly production availability target: 99.9%, excluding approved maintenance; final SLA depends on edition. |
| NFR-02 | For normal load, p95 read API under 500 ms and p95 synchronous write API under 1 s, excluding third-party calls and asynchronous jobs. |
| NFR-03 | Standard register initial result under 2 s for indexed, normal-scope queries; large reports run asynchronously with progress/status. |
| NFR-04 | Posting is atomic: document, journal, stock/tax effects, and outbox state either commit consistently or fail safely. |
| NFR-05 | Tenant isolation is enforced in database and application; automated negative isolation tests are release-gating. |
| NFR-06 | Encryption in transit and at rest; secrets reside in managed secret storage and never in source or logs. |
| NFR-07 | RPO target ≤15 minutes and RTO target ≤4 hours for production, subject to final business approval. |
| NFR-08 | All timestamps stored in UTC and displayed in company/user time zone; statutory dates retain business-local meaning. |
| NFR-09 | Core web workflows target WCAG 2.1 AA and keyboard operation. |
| NFR-10 | APIs are versioned, documented, idempotent where needed, and backward-compatible within published support policy. |
| NFR-11 | Financial and audit retention is configurable by jurisdiction, with a default proposal of eight financial years for India subject to legal sign-off. |
| NFR-12 | Every request/job/integration can be traced using correlation IDs without logging confidential values unnecessarily. |
| NFR-13 | Currency handling shall honor ISO 4217 precision and rounding without assuming two decimals or a symbol. |
| NFR-14 | Localization rules shall be versioned/effective-dated and historical outcomes reproducible after upgrades. |
| NFR-15 | Locale affects presentation only; persisted numeric, currency, date, and timestamp meaning remains unambiguous. |

## 13. Analytics and product metrics

### 13.1 Adoption

- Activated tenants/companies, invited versus active users.
- Onboarding completion and time to first posted invoice.
- Weekly/monthly active users by role/module.
- Lite-to-Pro upgrade and feature adoption.

### 13.2 Operational outcome

- Document cycle time and approval ageing.
- Quote-to-order, order-to-invoice, invoice-to-cash.
- PO-to-GRN, invoice-match exception rate, invoice-to-payment.
- Overdue AR/AP, days sales outstanding, stock variance, reconciliation match rate.
- Month-end close duration and manual journal count.

### 13.3 Quality

- Posting/reconciliation invariant failures (target zero).
- API/job/integration error and retry rates.
- Duplicate prevention events.
- Support incidents by severity and module.
- Report reconciliation and export failure rate.

Product analytics must avoid collecting confidential accounting payloads unless explicitly justified and governed.

## 14. Technical product constraints

- Web: React + Vite; mobile: React Native + Expo; desktop: Tauri where required.
- API: NestJS/TypeScript; AI/ML workloads may use Python.
- PostgreSQL with shared-schema tenant IDs and Row-Level Security.
- Redis + BullMQ for queue/cache; workers own processors.
- Azure and Kubernetes as target infrastructure.
- OpenTelemetry and Sentry for observability.
- Modular DDD boundaries; controllers in API app, processors in worker, domain/application/infrastructure separated.
- Exact decimal or integer minor-unit money handling; no binary floating-point calculations.
- Use ISO country/currency identifiers, UTC timestamps, explicit business-local dates, and company/user time zones.
- Do not hard-code INR, ₹, GSTIN, Indian states, April–March, or two-decimal assumptions in the global core.
- Country packs implement generic localization contracts instead of scattered country branches.
- Raw SQL allowed for reviewed, performance-critical accounting reports while normal domain persistence uses the selected ORM/query builder.

## 15. Product acceptance strategy

Every epic requires:

1. Approved UX and rule examples.
2. API/schema contract and authorization matrix.
3. Unit, integration, tenant-isolation, concurrency, and audit tests.
4. Happy path plus rejection, reversal, duplicate, locked-period, and provider-failure cases.
5. Accounting/tax/stock golden scenario validation.
6. Accessibility and responsive checks for designated journeys.
7. Operational dashboard, alerts, runbook, and migration/release notes.

### 15.1 Release-level definition of done

- No open Severity 1 or Severity 2 defects.
- Financial invariants and reconciliation suites pass.
- Security review and dependency/vulnerability gates pass.
- Approved performance/capacity tests pass.
- Backup/restore and rollback procedure tested.
- User documentation, training, support ownership, and monitoring ready.
- Product, finance/domain, engineering, QA, security, and operations sign-off recorded.

## 16. Roadmap dependencies and parallel tracks

After organization, identifiers, and domain contracts stabilize, these tracks can execute in parallel:

- Accounting core.
- Customer/supplier/item/master experience.
- Tax calculation.
- Inventory engine.
- Sales and purchase UI against versioned contracts.
- Workflow, notifications, PDF, attachment, audit, import/export.
- Reports beginning with module registers, followed by financial statements.

Before parallel execution, approve contracts for document lifecycle, money/tax, posting, stock movement, approvals, numbering, audit events, reversals, tenant context, and errors.

## 17. Open product decisions

- Release calendar and exact MVP boundary: service-only versus basic stock items.
- Edition matrix, limits, pricing, grace period, downgrade, and archival behavior.
- First supported bank statement formats and bank integrations.
- Initial GST provider and failure/manual fallback UX.
- Inventory valuation, batch/serial, multi-currency, and offline POS phase.
- Approval designer complexity supported in first release.
- Metadata/custom field limits and reporting behavior.
- Mobile transaction scope versus approval/dashboard-only scope.
- Quantitative scale profile for tenant, document, line, and report volumes.
- First expansion countries and localization certification/support ownership.
- Exchange-rate provider, hierarchy, quotation method, override, holiday, and missing-rate policies.
- Delivery sequence for foreign transactions, realized FX, revaluation, reporting currency, and consolidation.
- Intercompany matching, elimination, ownership, and consolidation accounting policies.
- Profile questionnaire, recommendation rules, allowed hybrid combinations, change/migration policy, and terminology.
- Trading depth: landed cost, replenishment, distribution, POS, batch/serial and margin analytics.
- Services depth: project/contract, resource/timesheet, subscription/usage/milestone billing and revenue recognition.
- Manufacturing depth: discrete/process, planning/capacity, shop-floor capture, quality, subcontracting, genealogy, WIP and costing.
