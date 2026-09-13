# Elixir Books ERP — Functional Requirements Document (FRD)

**Document status:** Draft functional baseline  
**Version:** 1.2  
**Date:** 07 September 2026  
**Related documents:** Elixir Books ERP BRD v1.0; Elixir Books ERP PRD v1.0

## 1. Purpose

This FRD translates the approved business and product scope into testable system behavior. Requirement IDs shall be referenced by user stories, API contracts, design screens, test cases, and release evidence.

## 2. System actors

- Platform Admin
- Tenant Owner
- Company Admin
- Finance Admin / Accountant
- Sales User / Sales Approver
- Purchase User / Purchase Approver
- Warehouse User
- Cashier / POS Manager
- Banking / Treasury User
- HR / Payroll User
- Asset User
- Auditor / Read-only User
- Integration Client / Background Worker

An actor may hold multiple roles, subject to segregation-of-duty policy.

## 3. Common functional conventions

### 3.1 Context

- Every business request shall resolve authenticated user, tenant, entitlement, company, branch where applicable, and financial year/period where applicable.
- The server shall ignore or reject unauthorized client-supplied scope.
- Company switch shall refresh effective permissions, defaults, currency, time zone, period, and module availability.

### 3.2 Common entity attributes

Business records shall use, as applicable:

- Immutable unique ID.
- Tenant ID; company ID; branch/location ID.
- Human-readable code/number.
- Status and version/concurrency value.
- Created/updated by and timestamps.
- Approval, posting, cancellation, and reversal metadata.
- Source type/source ID and correlation/idempotency key.
- Custom-field values under governed metadata definitions.

### 3.3 Money and quantities

- Monetary values shall use exact decimal or integer minor units and explicit currency.
- Quantity, rate, tax, exchange rate, and base amount shall use configured decimal scales.
- The system shall store transaction currency, exchange rate, transaction amount, and base amount for foreign-currency entries.
- Rounding differences shall post only to a configured account within permitted tolerance.

### 3.4 Document behavior

- Draft documents are editable by permitted users.
- Submission freezes fields except permitted workflow metadata.
- Posting captures master and calculation snapshots.
- Posted documents cannot be physically deleted or directly edited.
- Reversal/cancellation shall preserve and link the original document and its effects.
- Optimistic concurrency shall prevent silent overwrites.

### 3.5 Country, locale, and legal-entity conventions

- Country and currency shall use ISO identifiers and configured currency precision.
- Each company shall have exactly one base currency; changing it after posting requires a governed migration.
- Companies under one tenant may use different countries/currencies, but ledgers, periods, statutory books, banks, and number series remain company-specific.
- UTC timestamps and explicit time zones shall be used; statutory dates retain local legal meaning.
- Locale affects presentation, not persisted monetary or temporal meaning.
- Global contracts shall use generic tax/localization concepts; India-specific attributes belong to the India localization boundary.

## 4. Platform and identity requirements

| ID | Functional requirement | Priority |
|---|---|---|
| FR-PLT-001 | Platform Admin shall create, edit, activate, retire, and version subscription plans. | Must |
| FR-PLT-002 | A plan shall define module/action entitlements and numeric usage limits. | Must |
| FR-PLT-003 | The system shall track trial, active, grace, suspended, expired, and cancelled subscription states. | Must |
| FR-PLT-004 | API and UI shall enforce the same effective entitlements. | Must |
| FR-PLT-005 | Upgrade shall unlock capabilities without copying tenant data. | Must |
| FR-IAM-001 | Tenant Owner/Admin shall invite a user by verified contact channel and assign initial access. | Must |
| FR-IAM-002 | The system shall support activation, password setup/reset, session expiry, logout, suspension, and deactivation. | Must |
| FR-IAM-003 | Admin shall create roles using module, resource, action, and data-scope permissions. | Must |
| FR-IAM-004 | Admin shall map users to one or more companies and branches. | Must |
| FR-IAM-005 | Every protected operation shall perform server-side authorization. | Must |
| FR-IAM-006 | Security-sensitive identity and permission changes shall create audit events. | Must |
| FR-IAM-007 | MFA and SSO shall be supported as edition/configuration capabilities. | Should |

Acceptance examples:

- A user assigned Company A cannot list, infer, export, or mutate Company B records.
- Removing a user's company permission prevents subsequent authorized API use according to session/revocation policy.
- An API call for an unentitled module returns a stable entitlement error.

## 5. Organization and configuration

| ID | Functional requirement |
|---|---|
| FR-ORG-001 | Tenant Owner shall create multiple companies within subscription limits. |
| FR-ORG-002 | Company setup shall capture legal/trade name, PAN, GST registrations, addresses, contacts, business type, base/reporting currency, time zone, and branding. |
| FR-ORG-003 | Company Admin shall create branches, stores, offices, warehouses, and related address/GST mappings. |
| FR-ORG-004 | Admin shall configure financial year, books beginning date, opening-balance date, and accounting periods. |
| FR-ORG-005 | Authorized Finance Admin shall open, soft-close, lock, and reopen periods with reason and audit. |
| FR-ORG-006 | Admin shall define company/branch defaults for warehouse, accounts, taxes, payment terms, price list, and document template. |
| FR-ORG-007 | The system shall validate GSTIN/PAN formats and configured uniqueness rules. |
| FR-ORG-008 | An onboarding checklist shall show mandatory setup, completion, blockers, and readiness status. |
| FR-ORG-009 | Company shall select an enabled country/localization pack and compatible version. |
| FR-ORG-010 | Company shall configure locale/language, fiscal calendar, base currency, optional reporting currency, and permitted transaction currencies. |
| FR-ORG-011 | System shall prevent a transaction or payment batch from mixing legal companies. |
| FR-ORG-012 | Enabled intercompany activity shall identify both entities and due-to/due-from and elimination metadata. |
| FR-BIZ-001 | Company onboarding shall capture primary business nature: Trading, Services, Manufacturing, or Hybrid. |
| FR-BIZ-002 | Onboarding shall capture relevant secondary characteristics and recommend a versioned operating-profile template. |
| FR-BIZ-003 | Profile template shall propose modules, terms, masters, COA/accounts, dimensions, roles, workflows, numbering, dashboards, reports, and imports. |
| FR-BIZ-004 | Admin shall review and override recommendations within entitlement, permission, accounting, and localization constraints. |
| FR-BIZ-005 | Companies under one tenant may use different operating profiles. |
| FR-BIZ-006 | Profile change shall run dependency/impact checks, require reason and approval, execute migration steps, and retain history/audit. |
| FR-BIZ-007 | Deactivating a profile capability shall not delete or reinterpret its existing masters, documents, journals, stock movements, or audit. |
| FR-BIZ-008 | UI navigation and defaults shall follow effective profile; APIs remain protected by entitlements and permissions independently. |

## 6. Reference and master data

### 6.1 Common reference masters

The system shall provide country, state, city/district, currency, exchange-rate type, time zone, language, UOM, HSN/SAC, tax rates, bank codes, reason codes, payment terms, terms/conditions, and document types.

| ID | Functional requirement |
|---|---|
| FR-MDM-001 | Authorized users shall create/update/deactivate company masters while preserving references from historical transactions. |
| FR-MDM-002 | Registers shall support search, filters, active state, pagination, export, and permission scope. |
| FR-MDM-003 | Import shall validate each row, return error details, support corrected retry, and prevent duplicate re-import. |
| FR-MDM-004 | Duplicate rules shall be configurable for key party, item, tax, bank, and document identifiers. |
| FR-MDM-005 | Master changes shall create auditable before/after or semantic change events. |

### 6.2 Customer and supplier

| ID | Functional requirement |
|---|---|
| FR-PTY-001 | Customer shall capture group, legal/display name, GSTIN/PAN, tax treatment, billing/shipping addresses, contacts, currency, payment terms, credit limit, price list, salesperson, receivable account, and status. |
| FR-PTY-002 | Supplier shall capture equivalent identity/tax/contact fields plus payable account, purchase terms, default currency, and approved bank details. |
| FR-PTY-003 | A party may have multiple addresses and contacts with one default per purpose. |
| FR-PTY-004 | Credit policy shall support warn, block, and override-with-approval modes. |
| FR-PTY-005 | Supplier bank-detail changes shall support enhanced permission and approval/audit controls. |

### 6.3 Item/service, warehouse, pricing

| ID | Functional requirement |
|---|---|
| FR-ITM-001 | Item shall capture type, code/SKU, name, group/category, brand, base UOM, alternate UOM conversions, HSN/SAC, tax profile, sales/purchase/inventory accounts, tracking flags, and status. |
| FR-ITM-002 | Service items shall not produce stock movements. |
| FR-WHS-001 | Warehouse shall map to company/branch and optionally contain bins and special-purpose locations. |
| FR-PRC-001 | Price list shall capture type, currency, tax inclusion, validity, scope, priority, and active state. |
| FR-PRC-002 | Price-list entry shall identify item, UOM, minimum quantity, rate, optional customer/supplier, and effective dates. |
| FR-PRC-003 | Price resolution shall select a deterministic valid entry and expose the selected source to the document. |
| FR-PRC-004 | The document shall snapshot source rate, applied rate, discount, override reason, and approving user where required. |

## 7. Document numbering and templates

| ID | Functional requirement |
|---|---|
| FR-DOC-001 | Admin shall define number series by company, branch, document type, and financial year. |
| FR-DOC-002 | A series shall support prefix, suffix, padding, next number, reset rule, and draft/posted allocation policy. |
| FR-DOC-003 | Number allocation shall be concurrency safe and never create duplicates. |
| FR-DOC-004 | Voided/reserved gaps shall be explainable through audit; issued numbers shall not be silently reused. |
| FR-DOC-005 | Admin shall configure branded print/email templates with governed variables. |
| FR-DOC-006 | Generated output shall store template version and document snapshot/reference sufficient for reproduction policy. |

## 8. Accounting requirements

### 8.1 Chart of accounts and dimensions

| ID | Functional requirement |
|---|---|
| FR-ACC-001 | Admin shall define account groups, ledger accounts, account type, normal balance, currency behavior, posting eligibility, control-account flag, and active state. |
| FR-ACC-002 | Control accounts shall reject unauthorized manual postings. |
| FR-ACC-003 | Dimensions shall include branch, department, cost centre, profit centre, project, employee, customer, supplier, and product line as configured. |
| FR-ACC-004 | Account rules shall define required/optional/prohibited dimensions. |

### 8.2 Journal and posting engine

| ID | Functional requirement |
|---|---|
| FR-ACC-010 | Posting request shall include source identity, company, branch, business date, currency, lines, dimensions, tax references, and idempotency key. |
| FR-ACC-011 | The engine shall reject unbalanced, invalid-account, invalid-dimension, unauthorized, duplicate, or locked-period postings. |
| FR-ACC-012 | Successful posting shall atomically create immutable journal header/lines, source linkage, ledger effects, and outbox/audit event. |
| FR-ACC-013 | A repeated request with the same idempotency key and equivalent payload shall return the original outcome. |
| FR-ACC-014 | A repeated key with conflicting payload shall be rejected. |
| FR-ACC-015 | Reversal shall create an opposite journal linked to the original; it shall not overwrite original lines. |
| FR-ACC-016 | Manual journals shall follow configured draft/approval/post lifecycle. |
| FR-ACC-017 | The system shall support recurring-journal definitions and controlled generated drafts. |

### 8.3 Ledgers, opening balances, and reports

| ID | Functional requirement |
|---|---|
| FR-ACC-020 | GL and sub-ledgers shall derive from posted journals only. |
| FR-ACC-021 | Opening import shall support ledger, party, bank, tax, inventory, employee, and asset balances with control reconciliation. |
| FR-ACC-022 | Trial balance debit and credit totals shall always reconcile for the same company/scope/period. |
| FR-ACC-023 | Users shall drill from statements to account ledger, journal, and source document, subject to permission. |
| FR-ACC-024 | Period close shall report unposted drafts, unmatched balances, stock/ledger exceptions, integration exceptions, and required approvals. |

## 9. Tax requirements

| ID | Functional requirement |
|---|---|
| FR-TAX-001 | Tax input shall include seller/buyer registration and location, place of supply, item HSN/SAC/treatment, date, price, quantity, discount, charges, and tax-inclusion mode. |
| FR-TAX-002 | Engine shall determine CGST/SGST versus IGST and applicable rate/components for configured scenarios. |
| FR-TAX-003 | The engine shall support taxable, exempt, nil-rated, non-GST, reverse charge, export, SEZ, and cess configurations. |
| FR-TAX-004 | Tax shall calculate at line level and aggregate by component/rate/HSN with governed rounding. |
| FR-TAX-005 | Posted documents shall retain complete tax inputs, rule/version reference, outputs, and ledger mapping snapshot. |
| FR-TAX-006 | Credit/debit note and return shall calculate linked tax adjustments without modifying original tax records. |
| FR-TDS-001 | TDS/TCS shall support section, rate, threshold, PAN condition, party applicability, basis, account mapping, and certificate/reference tracking. |

### 9.1 Localization-pack requirements

| ID | Functional requirement |
|---|---|
| FR-L10N-001 | A versioned localization contract shall cover registrations, tax, invoices, validation, statutory reports, filing integrations, address/formatting, and optional payroll rules. |
| FR-L10N-002 | Localization rules shall have jurisdiction, effective period, version, status, and compatibility metadata. |
| FR-L10N-003 | Company shall activate only approved packs and retain the version used by each posted statutory document. |
| FR-L10N-004 | India pack shall implement GST, TDS/TCS, GSTIN/PAN, HSN/SAC, place of supply, e-invoice, e-way bill, and Indian returns without leaking India-only logic into the core. |
| FR-L10N-005 | Unsupported statutory actions shall fail explicitly and never silently apply India rules. |
| FR-L10N-006 | Pack upgrades shall validate compatibility and never recalculate posted history. |

## 9A. Multi-currency and foreign exchange requirements

| ID | Functional requirement |
|---|---|
| FR-FX-001 | Currency master shall store ISO code, name, display symbol, minor-unit precision, rounding increment/mode, and effective status. |
| FR-FX-002 | Exchange rates shall store base/quote currencies, quotation direction, effective timestamp, source/type, rate, approval, and audit. |
| FR-FX-003 | Rate resolution shall use a deterministic configured hierarchy and return selected rate, type, source, and timestamp. |
| FR-FX-004 | Manual/imported/overridden rates shall require permission, reason, and configured approval. |
| FR-FX-005 | Posted monetary facts shall store transaction currency/amount, base currency/amount, rate, rate timestamp/type/source, and rounding. |
| FR-FX-006 | Every posted journal shall balance in company base currency and retain applicable transaction-currency line amounts. |
| FR-FX-007 | AR/AP open items shall retain original currency, original outstanding, base carrying amount, and settlement history. |
| FR-FX-008 | Receipt/payment shall support permitted same- and cross-currency settlement, settlement rate, bank currency, charges, and residual tolerance. |
| FR-FX-009 | Settlement shall calculate/post realized gain or loss; reversal shall reverse it using original context. |
| FR-FX-010 | Period-end revaluation shall apply an approved closing rate to eligible foreign open items/accounts and post itemized unrealized gain/loss. |
| FR-FX-011 | Revaluation shall support next-period reversal and prevent duplicate scope/version runs. |
| FR-FX-012 | Foreign-currency bank accounts shall retain account currency and record transaction/base/bank amounts where different. |
| FR-FX-013 | Later rate corrections shall never change historical posted transactions. |
| FR-FX-014 | Reporting-currency translation shall remain separate from legal company base-currency books. |

Acceptance example: an INR-base company posts USD 10,000 at 83.20 (₹832,000), settles at 84.00 (₹840,000), and posts ₹8,000 realized gain before configured fees/rounding.

## 10. Inventory requirements

| ID | Functional requirement |
|---|---|
| FR-INV-001 | Stock ledger shall record immutable quantity movements by item, warehouse/bin, date/time, source, UOM/base quantity, batch/serial where enabled, and value. |
| FR-INV-002 | System shall calculate on-hand, reserved, committed, available, in-transit, and projected quantities. |
| FR-INV-003 | Stock issue shall enforce negative-stock policy under concurrent requests. |
| FR-INV-004 | Reservation shall link to order lines and support partial allocate, release, fulfil, expiry, and cancellation. |
| FR-INV-005 | Adjustment shall require reason and approval according to value/quantity policy. |
| FR-INV-006 | Transfer shall support dispatch, in-transit, receipt, shortage/damage, and reversal. |
| FR-INV-007 | Stock count shall compare counted and system quantity and create an approved variance adjustment. |
| FR-INV-008 | Valuation shall use the configured supported method and reconcile inventory control accounts. |
| FR-INV-009 | A source reversal shall reverse related stock and accounting effects atomically or through a controlled, recoverable orchestration. |

### 10.1 Trading profile requirements

| ID | Functional requirement |
|---|---|
| FR-TRD-001 | Trading profile shall activate selected purchasing, receiving, inventory, sales fulfilment, delivery, returns, AR/AP, banking, tax, and reporting capabilities. |
| FR-TRD-002 | Replenishment shall use reorder level/quantity, safety stock, lead time, demand, availability, and open supply to create suggestions. |
| FR-TRD-003 | Landed-cost allocation shall distribute eligible freight/duty/charges by approved basis and update inventory cost/accounting without changing supplier invoice history. |
| FR-TRD-004 | System shall calculate gross margin from recognized revenue and governed cost of goods sold at document/report cut-off. |
| FR-TRD-005 | Distribution shall support branch/warehouse allocation, transfer, reservation, pick/pack/delivery where enabled, and fulfilment status. |

### 10.2 Services profile requirements

| ID | Functional requirement |
|---|---|
| FR-SRV-001 | Services profile shall support service catalog, customer project/engagement, contract/SOW, resources, rate cards, billing rules, expenses, invoicing, AR and profitability. |
| FR-SRV-002 | Contract shall define currency, dates, billing method, rates/amount, milestones/usage/period, taxes, payment terms, dimensions and approval. |
| FR-SRV-003 | Time, usage, milestone, deliverable and billable expense inputs shall retain source, approver and invoiced status. |
| FR-SRV-004 | Billing engine shall produce invoice drafts for enabled fixed-price, time-and-material, milestone, recurring, usage or cost-plus rules without duplicate billing. |
| FR-SRV-005 | Retainer/advance shall be allocated to eligible invoices and maintain remaining customer liability/credit. |
| FR-SRV-006 | Enabled revenue accounting shall track billed, unbilled/accrued, deferred, recognized and reversed values by contract/project/period. |
| FR-SRV-007 | Project profitability shall combine revenue, resource cost, purchases, employee expenses and allocated overhead by governed cut-off. |

### 10.3 Manufacturing profile requirements

| ID | Functional requirement |
|---|---|
| FR-MFG-001 | Manufacturing profile shall support discrete/process and make-to-stock/make-to-order modes only as explicitly enabled. |
| FR-MFG-002 | BOM shall be effective-dated/versioned and contain component, quantity, UOM, scrap/yield, substitute/alternative and output/by-product definitions. |
| FR-MFG-003 | Routing shall define ordered/parallel operations, work centre, setup/run time, labour/machine requirements, yield and subcontract flag. |
| FR-MFG-004 | Work centre shall define calendar, capacity, efficiency, cost rates, location and permitted operations. |
| FR-MFG-005 | MRP shall calculate net requirements from demand, stock, reservations, safety stock, open supply, BOM, lead times, lot sizing and planning horizon. |
| FR-MFG-006 | Planning suggestions shall not create approved purchase/production/transfer orders without configured review or automation policy. |
| FR-MFG-007 | Production order shall capture item/revision, BOM/routing version, quantity, dates, warehouse/WIP locations, lot/serial, costs, source demand and status. |
| FR-MFG-008 | Production lifecycle shall support draft, planned, released, in progress, partially completed, completed, closed and cancelled states with controlled transitions. |
| FR-MFG-009 | Material issue/return/backflush and output receipt shall post through the shared inventory engine and prevent duplicate/over consumption according to tolerance. |
| FR-MFG-010 | System shall capture actual labour, machine, subcontract, overhead, scrap, rework and by-product values when enabled. |
| FR-MFG-011 | WIP accounting shall reconcile material, conversion cost, output, scrap and variance through the shared accounting engine. |
| FR-MFG-012 | Production costing shall support configured standard/actual methods and report material, labour, machine, overhead, yield and purchase-price variance. |
| FR-MFG-013 | Quality inspection shall support incoming, in-process and finished-goods plans, results, acceptance, rejection, hold, rework and disposition. |
| FR-MFG-014 | Subcontracting shall track material sent, supplier operation/service, receipt, consumption, variance, charges and tax/accounting effects. |
| FR-MFG-015 | Batch/serial genealogy shall trace components to production order and finished outputs where tracking is enabled. |
| FR-MFG-016 | Reversal/cancellation shall validate downstream consumption/output/sale and reverse stock, WIP, cost and accounting safely. |

## 11. Sales and receivables

### 11.1 Quotation

| ID | Functional requirement |
|---|---|
| FR-SAL-001 | User shall create a quotation with customer/address, validity, currency, price list, items/services, quantities, prices, discounts, taxes, charges, terms, salesperson, dimensions, and attachments. |
| FR-SAL-002 | User shall revise a quotation while retaining revision history. |
| FR-SAL-003 | Approved quotation shall generate PDF/email and convert to sales order without re-entry. |
| FR-SAL-004 | Conversion shall preserve source linkage and commercial snapshots. |

### 11.2 Sales order and reservation

| ID | Functional requirement |
|---|---|
| FR-SAL-010 | Sales order shall be created directly or from an eligible quotation. |
| FR-SAL-011 | Submission shall validate customer status, credit policy, price/discount permission, tax, stock policy, and mandatory fields. |
| FR-SAL-012 | Approved stock-item lines shall support warehouse allocation and reservation. |
| FR-SAL-013 | System shall track ordered, reserved, delivered, invoiced, returned, cancelled, and pending quantity/value per line. |
| FR-SAL-014 | Authorized user shall partially fulfil, amend permitted unfulfilled values, cancel, or short-close with reason and impact validation. |

### 11.3 Delivery

| ID | Functional requirement |
|---|---|
| FR-SAL-020 | Delivery shall select eligible order lines and quantities up to remaining fulfilment. |
| FR-SAL-021 | Posting delivery shall issue inventory from selected warehouse/batch/serial and update order fulfilment. |
| FR-SAL-022 | Multiple deliveries may reference one order; one delivery may be invoiced in full or as permitted by policy. |
| FR-SAL-023 | Delivery reversal shall restore stock/reservation/order state and block when downstream state prevents safe reversal. |

### 11.4 Sales invoice

| ID | Functional requirement |
|---|---|
| FR-SAL-030 | Invoice shall be created directly or from eligible order/delivery documents. |
| FR-SAL-031 | System shall prevent quantity/value exceeding source eligibility unless authorized tolerance applies. |
| FR-SAL-032 | Due date shall derive from payment terms and allow permitted override. |
| FR-SAL-033 | Posting shall atomically establish receivable, revenue/tax/charge/discount/round-off journals and stock issue when direct stock invoicing is used. |
| FR-SAL-034 | System shall track original, paid, credited, written-off, and outstanding amount. |
| FR-SAL-035 | Posted invoice shall produce print/PDF/email output and statutory readiness/status. |
| FR-SAL-036 | Duplicate customer invoice reference/payload rules shall warn or block according to policy. |

### 11.5 Return, credit note, receipt

| ID | Functional requirement |
|---|---|
| FR-SAL-040 | Sales return shall reference eligible posted invoice/delivery lines and remaining returnable quantity. |
| FR-SAL-041 | Posting a goods return shall receive stock and create required tax/accounting correction. |
| FR-SAL-042 | Credit note shall adjust customer outstanding or create unapplied credit and link to the source. |
| FR-AR-001 | Receipt shall support cash, bank, cheque, UPI, gateway, and configured methods. |
| FR-AR-002 | Receipt may allocate partially across one or many invoices or remain an authorized advance/unallocated amount. |
| FR-AR-003 | Allocation shall update open items without rewriting invoice journal lines. |
| FR-AR-004 | Receipt reversal shall restore allocations and reverse accounting with reason/audit. |
| FR-AR-005 | AR shall provide outstanding, ageing, statement, credit exposure, and collection follow-up. |

## 12. Purchase and payables

| ID | Functional requirement |
|---|---|
| FR-PUR-001 | Requisition shall capture requester, need date, items/services, quantity, expected price, warehouse, purpose, dimensions, and attachment. |
| FR-PUR-002 | RFQ shall be issued to selected suppliers and supplier quotations recorded/compared. |
| FR-PUR-010 | PO shall capture supplier, address, currency, items/services, price, discount, tax, charges, delivery schedule, warehouse, terms, dimensions, and approvals. |
| FR-PUR-011 | PO shall track ordered, received, accepted, invoiced, returned, cancelled, and pending quantities/values. |
| FR-PUR-020 | GRN shall receive eligible PO lines partially or fully, capture batch/serial/QC data where enabled, and post stock movement. |
| FR-PUR-021 | QC shall record accepted, rejected, and held quantities with disposition. |
| FR-PUR-030 | Vendor invoice shall be created directly or against PO/GRN according to company policy. |
| FR-PUR-031 | System shall detect duplicate supplier invoice number within configured supplier/company/period scope. |
| FR-PUR-032 | Matching shall compare PO, GRN, invoice, and optional QC using quantity, price, tax, charge, and tolerance rules. |
| FR-PUR-033 | Exceptions shall be visible, assigned, resolved/approved, and audited before posting where policy blocks them. |
| FR-PUR-034 | Posting shall establish payable, expense/inventory, input tax, charges, discount, and round-off entries. |
| FR-PUR-040 | Purchase return/debit note shall reverse eligible stock, tax, and supplier liability with source linkage. |
| FR-AP-001 | AP shall provide open items, due schedule, advances, debit/credit allocation, ageing, and payment proposals. |

## 13. Workflow requirements

| ID | Functional requirement |
|---|---|
| FR-WFL-001 | Admin shall define versioned workflow by company, document type, amount, branch, department, project, exception, and other approved attributes. |
| FR-WFL-002 | Workflow shall support sequential and parallel steps, named users, roles, groups, and reporting hierarchy where configured. |
| FR-WFL-003 | System shall resolve and snapshot applicable workflow at submission. |
| FR-WFL-004 | Approver shall approve, reject, return for changes, or delegate where permitted, with comment requirements. |
| FR-WFL-005 | Escalation/reminder shall trigger by elapsed business time and configured calendar. |
| FR-WFL-006 | A changed document shall invalidate or restart approval according to material-change rules. |
| FR-WFL-007 | Workflow actions shall be idempotent and safe under concurrent approvers. |
| FR-WFL-008 | Approval history shall be immutable and visible on the business document. |

## 14. Banking, receipts, payments, and reconciliation

| ID | Functional requirement |
|---|---|
| FR-BNK-001 | Authorized user shall manage cash/bank ledger mappings, account identity, branch, currency, and opening balance. |
| FR-BNK-002 | System shall support deposit, withdrawal, contra, receipt, payment, and transfer vouchers. |
| FR-PMT-001 | Payment shall select approved payable/open items, allow partial allocation, withholding, charges, and approved advance. |
| FR-PMT-002 | Payment batch shall group eligible payments, execute maker-checker approval, and generate configured bank output. |
| FR-PMT-003 | Batch/payment shall track created, approved, submitted, accepted, failed, completed, reversed, reference, UTR, and error state. |
| FR-REC-001 | Statement import shall support configured CSV/XLSX formats and future API feeds. |
| FR-REC-002 | Import shall validate account, dates, currency, balances, duplicate fingerprints, and row errors. |
| FR-REC-003 | Matching shall support exact/manual/suggested one-to-one, one-to-many, and many-to-one allocation. |
| FR-REC-004 | Suggestions shall show confidence/reason without automatically posting unauthorized adjustments. |
| FR-REC-005 | User shall confirm/unmatch reconciliation under permission with audit. |
| FR-REC-006 | Reconciliation shall report book balance, statement balance, cleared/unmatched items, timing differences, and adjustments at cut-off. |

## 15. POS requirements

| ID | Functional requirement |
|---|---|
| FR-POS-001 | Cashier shall open an assigned terminal shift with opening float. |
| FR-POS-002 | Cashier shall scan/search items, select customer, calculate price/tax/discount, and hold/resume carts. |
| FR-POS-003 | Checkout shall accept one or more configured tenders and create a posted POS invoice/receipt. |
| FR-POS-004 | Completion shall update stock, sales/tax, tender accounts, and customer ledger where applicable. |
| FR-POS-005 | Return shall require original transaction or controlled no-receipt policy, reason, and approval thresholds. |
| FR-POS-006 | Shift close shall compare expected and counted tenders and route variance approval/posting. |
| FR-POS-007 | Duplicate checkout requests shall not create duplicate bills or charges. |

## 16. Budget, expense, payroll, and fixed assets

### 16.1 Budget and expense

| ID | Functional requirement |
|---|---|
| FR-BUD-001 | Budget shall be defined by year/period, account, and configured dimensions with version/revision. |
| FR-BUD-002 | System shall calculate budget, commitment, actual, available, and variance. |
| FR-BUD-003 | Transactions shall warn, block, or seek override approval when budget control applies. |
| FR-EXP-001 | Employee shall submit expense claim with category, date, amount, tax, project/cost centre, receipt, and payment details. |
| FR-EXP-002 | Approved claim shall create employee payable/expense and flow to payment. |

### 16.2 Payroll

| ID | Functional requirement |
|---|---|
| FR-PAY-001 | Payroll shall maintain employee financial/statutory details and salary structures with effective dates. |
| FR-PAY-002 | Payroll run shall calculate earnings, deductions, contributions, reimbursements, loans/advances, and net pay from approved inputs. |
| FR-PAY-003 | Finalization shall freeze inputs and produce payslips, statutory summaries, and payment output. |
| FR-PAY-004 | Payroll posting shall create salary expense/liability entries by configured dimensions without exposing confidential details to unauthorized users. |
| FR-PAY-005 | Reversal/off-cycle correction shall preserve original run and approval history. |

### 16.3 Fixed assets

| ID | Functional requirement |
|---|---|
| FR-AST-001 | Asset master shall capture category/group, identifier, description, location, custodian, acquisition, capitalization, cost, residual value, life, method, accounts, and dimensions. |
| FR-AST-002 | Asset may originate from purchase invoice/GRN or authorized manual capitalization. |
| FR-AST-003 | Depreciation run shall calculate by method, useful life, in-service/disposal dates, prior depreciation, and period. |
| FR-AST-004 | Approved depreciation shall post accounting entries and prevent duplicate period posting. |
| FR-AST-005 | Transfer, revaluation, impairment, and disposal shall follow approval and accounting/tax rules. |

## 17. Statutory integrations

| ID | Functional requirement |
|---|---|
| FR-CMP-001 | System shall validate invoice readiness before e-invoice/e-way-bill submission. |
| FR-CMP-002 | Submission shall use a stable idempotency reference and preserve request fingerprint, response, timestamp, status, and provider correlation. |
| FR-CMP-003 | Accepted e-invoice shall store IRN, acknowledgement, signed QR/reference data, and render it on required outputs. |
| FR-CMP-004 | Rejection shall show actionable provider errors without changing a posted journal. |
| FR-CMP-005 | Cancellation shall enforce statutory window/reason and synchronize local state. |
| FR-CMP-006 | GST registers shall classify posted sales, purchases, credit/debit notes, advances/adjustments as required. |
| FR-CMP-007 | GSTR preparation shall reconcile totals to tax ledgers and retain generation/version history. |
| FR-CMP-008 | Provider credentials shall be company/registration scoped, encrypted, masked, rotated, and access audited. |

## 18. Reports and dashboard

| ID | Functional requirement |
|---|---|
| FR-RPT-001 | Every module shall provide an operational register with consistent filters, status, totals, drill-down, and export. |
| FR-RPT-002 | Financial reports shall include day book, journal, ledger, trial balance, P&L, balance sheet, cash flow, AR ageing, and AP ageing. |
| FR-RPT-003 | Inventory reports shall include stock ledger, on-hand/available, valuation, movement, ageing, reorder, and count variance. |
| FR-RPT-004 | Sales/purchase reports shall support company, branch, date, party, item, group, salesperson/buyer, project, tax, and status dimensions. |
| FR-RPT-005 | CFO dashboard shall show revenue, gross/net margin, expense, cash, receivables/payables, working capital, budget variance, project/branch profitability, tax liabilities, and trend. |
| FR-RPT-006 | Each widget/report shall show scope, period, currency, applied filters, and data freshness. |
| FR-RPT-007 | Report permission shall enforce row/data scope and sensitive-field masking in view and export. |
| FR-RPT-008 | Large export shall execute asynchronously and notify the requester with expiry/access controls. |
| FR-RPT-009 | Reports shall reconcile to authoritative posted ledgers at the same cut-off; exceptions shall be observable. |
| FR-RPT-010 | Currency-aware reports shall show transaction currency, base currency, rate, base equivalent, and gain/loss where relevant. |
| FR-RPT-011 | FX reports shall include currency-wise AR/AP, bank balances, exposure, realized gain/loss, revaluation, and rate audit. |
| FR-RPT-012 | Group reports shall translate company results into consolidation currency without changing company ledgers. |
| FR-RPT-013 | Translation shall support closing, average, historical, or account-specific rates and disclose translation adjustment. |
| FR-RPT-014 | Future consolidation shall support journals, ownership periods, intercompany matching/elimination, and source drill-down. |

## 18A. Group and consolidation requirements

| ID | Functional requirement |
|---|---|
| FR-CNS-001 | Authorized user shall define a group hierarchy of independently balanced legal companies. |
| FR-CNS-002 | Consolidation shall define period, currency, accounting/rate policies, ownership dates, and included companies. |
| FR-CNS-003 | Translation shall retain source company/currency/amount, applied rate, translated amount, and adjustment. |
| FR-CNS-004 | Consolidation adjustments shall remain separate from legal-company journals and require workflow/audit. |
| FR-CNS-005 | Enabled intercompany documents shall identify counterparty company and matching reference. |
| FR-CNS-006 | Eliminations shall never overwrite source books and shall remain reversible and traceable. |

## 19. Audit, attachments, notifications, import/export

| ID | Functional requirement |
|---|---|
| FR-AUD-001 | Audit event shall record actor/service, tenant/company, time, action, object, result, correlation, source channel, and approved change detail. |
| FR-AUD-002 | Audit records shall be append-only for application users and protected from tenant modification. |
| FR-AUD-003 | Authorized auditors shall search/export audit events without exposing secrets or unrelated tenant data. |
| FR-FIL-001 | Users shall attach permitted file types/sizes to configured masters/documents; access follows parent permission. |
| FR-FIL-002 | File storage shall scan/validate, encrypt, version/retain as configured, and prevent executable use. |
| FR-NTF-001 | Notification shall use event-driven templates and record queued/sent/delivered/failed status. |
| FR-NTF-002 | Notification failure shall not undo an otherwise valid business posting. |
| FR-IMP-001 | Import shall provide template, dry-run validation, row errors, duplicate handling, commit summary, and audit. |
| FR-EXPORT-001 | Export shall preserve filter/scope metadata and respect data permission/masking. |

## 20. Cross-cutting validation and error handling

- Required-field, format, reference, state, entitlement, authorization, period, duplicate, balance, stock, credit, tax, and workflow validation shall occur server-side.
- API errors shall return stable machine-readable code, safe human-readable message, field/path where applicable, and correlation ID.
- Validation failures shall not create partial journals, stock movements, or downstream jobs.
- Third-party timeouts shall transition integration work to a visible recoverable state; clients shall not blindly retry non-idempotent actions.
- Background jobs shall support retry policy, dead-letter/failure visibility, replay permission, and idempotency.

## 21. Data and integration interface requirements

### 21.1 API conventions

- Versioned REST APIs documented through OpenAPI; events/webhooks for approved integration cases.
- Cursor or stable pagination for large mutable registers; deterministic sort.
- Idempotency key required for posting, payment, POS checkout, imports, and external submissions.
- Optimistic concurrency token required for material draft edits.
- Correlation ID propagated across API, database transaction, queue, worker, and external provider.

### 21.2 Domain events

At minimum:

- DocumentCreated/Submitted/Approved/Rejected/Posted/Reversed/Cancelled.
- JournalPosted/Reversed.
- StockReserved/Released/Moved/Reversed.
- InvoicePosted/Credited; ReceiptAllocated/Reversed.
- PurchaseReceived/Invoiced/Matched; PaymentApproved/Completed/Failed.
- PeriodLocked/Reopened.
- StatutorySubmissionAccepted/Rejected/Cancelled.

Events shall publish through a transactional outbox or equivalent reliable mechanism.

## 22. Role and segregation-of-duty baseline

| Action | Typical permitted role | Control |
|---|---|---|
| Maintain plan/tenant | Platform Admin | Platform-only audit |
| Maintain company/security | Tenant/Company Admin | Cannot bypass protected finance controls by default |
| Create transaction | Module operator | No posting/approval unless separately granted |
| Approve transaction | Assigned approver | Workflow and self-approval policy |
| Post/reverse journal | Finance role | Period and source control |
| Approve payment batch | Treasury approver | Maker-checker |
| Reopen period | Finance Admin/CFO | Reason, elevated approval, audit |
| View payroll | Payroll-confidential role | Field/record segregation |
| Export sensitive data | Explicit export permission | Audit and masking |

The final matrix is company-configurable within product guardrails.

## 23. End-to-end acceptance scenarios

### E2E-01 Sales-to-cash

1. Create customer and item with price/tax/account mappings.
2. Create quotation and convert to approved order.
3. Reserve stock and post partial deliveries.
4. Create/post invoice from deliveries.
5. Verify stock issue, tax, AR, revenue, document PDF, and outstanding.
6. Receive partial then final payment; allocate and reconcile bank statement.
7. Return one item and issue credit note.
8. Verify inventory, tax, customer ledger, GL, reports, and audit reconcile.

### E2E-02 Purchase-to-pay

1. Approve requisition and PO.
2. Receive partial goods and record QC where enabled.
3. Enter supplier invoice with one within-tolerance and one exception case.
4. Resolve/approve exception and post payable/input tax/inventory or expense.
5. Select invoice into approved payment batch and record completion/UTR.
6. Import bank statement and reconcile.
7. Verify supplier ledger, GL, stock, tax, AP ageing, and audit.

### E2E-03 Period close

1. Run close checklist and resolve blocking exceptions.
2. Lock period.
3. Confirm operational users cannot back-post.
4. Generate and reconcile trial balance, P&L, balance sheet, cash flow, AR/AP, stock, bank, and tax reports.
5. Reopen using elevated approval and reason; verify audit and subsequent re-close.

### E2E-04 Tenant isolation and access

1. Create two tenants with overlapping human-readable document numbers.
2. Attempt list, direct-ID, export, attachment, report, job, and integration access across tenants.
3. Confirm all attempts are denied without existence/data leakage and logged safely.

### E2E-05 Idempotency/concurrency

1. Submit duplicate invoice posting, POS checkout, payment, stock issue, and statutory request concurrently.
2. Confirm one business result, consistent response, no duplicated journal/stock/payment/submission, and explainable audit.

### E2E-06 Foreign-currency lifecycle

1. Configure INR-base company, USD customer/price list, settlement route, rates, and FX accounts.
2. Post a USD invoice at approved invoice-date rate.
3. Run and reverse period-end revaluation according to policy.
4. Settle at another rate and verify original-currency closure, base cash, realized gain/loss, charges, GL, AR, and audit.

### E2E-07 Multi-country and consolidation boundary

1. Configure India/INR and UAE/AED companies under one tenant with separate packs, ledgers, periods, banks, and sequences.
2. Verify applicable country behavior and that no transaction/payment mixes entities.
3. Translate both closed ledgers into consolidation currency.
4. Verify source books remain unchanged and translated totals, rates, adjustments, and drill-down are traceable.

### E2E-08 Nature-aware onboarding and hybrid profile

1. Create Trading, Services, Manufacturing, and Hybrid companies under one tenant.
2. Verify each receives the correct proposed modules, masters, COA, roles, workflow, dashboard, reports, and terminology.
3. Verify common accounting/tax/currency/identity engines are reused and unauthorized hidden modules remain API-protected.
4. Add a second profile to the Hybrid company and verify impact review/migration without historical changes.

### E2E-09 Trading lifecycle

Purchase → GRN → landed cost → stock/valuation → order/reservation → delivery/invoice → return/receipt → margin and inventory reconciliation.

### E2E-10 Services lifecycle

Contract/project → approved time/usage/milestone/expense → generated invoice → revenue treatment → receipt → project/customer profitability reconciliation.

### E2E-11 Manufacturing lifecycle

Demand → MRP suggestion → approved purchase/production supply → material issue → operations/quality → output/by-product/scrap → WIP/cost/variance → sale → inventory and GL reconciliation.

## 24. Traceability summary

| BRD capability | PRD epic | FRD groups |
|---|---|---|
| Platform and access | EP-01, EP-02 | FR-PLT, FR-IAM |
| Organization/master data | EP-03, EP-04 | FR-ORG, FR-MDM, FR-PTY, FR-ITM, FR-WHS |
| Accounting/tax/pricing | EP-05, EP-06, EP-07 | FR-ACC, FR-TAX, FR-TDS, FR-PRC |
| Inventory | EP-08 | FR-INV |
| Sales/AR | EP-09 | FR-SAL, FR-AR |
| Purchase/AP | EP-10 | FR-PUR, FR-AP |
| POS | EP-11 | FR-POS |
| Banking/reconciliation | EP-12 | FR-BNK, FR-PMT, FR-REC |
| Workflow | EP-13 | FR-WFL |
| Budget/payroll/assets | EP-14 | FR-BUD, FR-EXP, FR-PAY, FR-AST |
| Compliance/report/audit | EP-06, EP-15 | FR-CMP, FR-RPT, FR-AUD |
| Multi-country/localization | EP-16 | FR-ORG, FR-L10N |
| Multi-currency/FX | EP-17 | FR-FX, FR-ACC, FR-BNK, FR-RPT |
| Consolidation/intercompany | EP-18 | FR-CNS, FR-RPT |
| Business-nature profiles | EP-19 | FR-BIZ |
| Trading profile | EP-20 | FR-TRD, FR-PUR, FR-INV, FR-SAL |
| Services profile | EP-21 | FR-SRV, FR-SAL, FR-AR, FR-ACC |
| Manufacturing profile | EP-22 | FR-MFG, FR-INV, FR-PUR, FR-ACC |

## 25. Functional open items requiring stakeholder decision

- Exact fields and validation services for GSTIN/PAN and company onboarding.
- Financial Year Start versus Books Beginning/Opening Balance date semantics.
- Branch-wise GST registration and document numbering rules.
- Supported valuation methods and direct-invoice stock timing.
- Price resolution precedence and promotion boundary.
- Approval material-change, recall, delegation, escalation, and self-approval rules.
- PO/GRN/invoice matching tolerances by item/category/company.
- Supported transaction and settlement currencies by module/release.
- Rate provider, quotation direction, hierarchy/type, approval, fallback, holiday, and missing-rate policy.
- Realized gain/loss, revaluation scope/frequency/reversal, rounding, and materiality rules.
- Receipt TDS and advance tax treatment.
- POS connectivity/offline expectations.
- Payroll statutory scope and confidentiality model.
- E-invoice/e-way-bill/GST provider and manual fallback.
- Bank formats/API scope, payment approval, signing, and UTR handling.
- Report cut-off, consolidation, eliminations, and comparative-period requirements.
- First non-India packs, statutory certification, ownership, update SLA, and compatibility policy.
- Consolidation currency/standard, ownership periods, intercompany matching, eliminations, and CTA presentation.
- Business-nature questionnaire, recommendation logic, profile versioning, hybrid combinations, and live-profile change authority.
- Trading landed-cost allocation, replenishment, distribution/pick-pack, stock costing, and margin policy.
- Services contract/billing methods, time/usage approval, revenue recognition, resource cost, and profitability policy.
- Manufacturing mode, BOM/routing/versioning, MRP, capacity, execution capture, quality, subcontracting, genealogy, WIP and cost methods.
- Data migration, retention, archival, deletion, and legal-hold policy.
