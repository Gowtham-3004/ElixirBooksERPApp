# Integration findings (cross-module QA)

Produced by `npx vite-node scripts/audit-seed.mts`. Re-run it after any seed change.
Runtime companion: `node scripts/verify-control-accounts.mjs http://localhost:5191` (needs a dev
server) checks that the AR/AP ageing reports, the trial balance, `engine.accountBalance` and the CFO
dashboard all agree.

## Current state

```text
collections 126 · rows 1895 · journals in ledger 328 · unbalanced 0
duplicate record ids 0 · duplicate journal numbers 0
opening balances Dr 34,348,580.00 = Cr 34,348,580.00
trial balance    Dr 47,728,256.55 = Cr 47,728,256.55
stock movements 270 · negative item/warehouse positions 0
every control reconciliation line OK · AUDIT OK
```

Row and trial-balance totals move while the production, projects and consolidation seeds are still
being written; the reconciliation lines are what must stay OK.

## Wave 1 fixes (already in place)

1. **Duplicate journal numbers (75)** — `buildSeed()` runs `dedupeJournalNumbers()`: the earliest
   journal keeps the number, later ones are renumbered onto free numbers in the same company's
   prefix, every record that stored `journalNumber` is repointed, and the `Journal` series' `next`
   is moved past the highest issued number (FR-DOC-003).
2. **Double-counted salary and depreciation expense** — the generic `jv_sal_*` / `jv_dep_*` blocks
   were removed; the authoritative `jv_pay_2026_MM` (payroll runs) and `jv_dep_2026_MM` (asset
   depreciation runs) are the only source. The salary *disbursement* journals remain and mirror the
   net pay each run credits, so account 2330 nets to zero.
3. **Approval outcomes writing `status` onto non-documents** — `engine.submitForApproval` /
   `actOnApproval` only stamp `status`/`approvalId` on real workflow documents.

## Wave 2 — accounting-integrity pass

### 1. AR control (1100) ties to its sub-ledger — FR-ACC-020/022, FR-AR-005, FR-RPT-009

Before: ledger ₹51.18L vs customer open items ₹20.07L. After: **₹49,73,718 = ₹49,73,718**.

- **Opening AR had no sub-ledger.** `seed/accounting.ts` now seeds seven carried-forward customer
  invoices (`docType: 'Opening'`, `INV/25-26/xxxx`, dated Dec 2025 – Mar 2026 with real due dates)
  totalling **exactly ₹18,45,200** — the opening balance on account 1100. The seed throws if the two
  ever drift. They carry no journal: the balance already lives on `account.openingBalance`, so
  posting one would double-count it. AR ageing now shows a genuine > 90-day opening tail.
- **Advances and retainers were being counted against AR control.** Unapplied receipts post to
  *2150 Advances from Customers* and services retainers to *2160 Retainers Received* — not to 1100 —
  so counting those open items against AR control made it look ₹12.58L short. Open items are now
  routed to the control account their document actually posts to (`openItemScope()` in
  `modules/reports/compute.ts`, mirrored in the audit). The AR ageing report shows the AR items and
  reconciles to 1100 on screen; unapplied credits are reported underneath with the account they sit on.
- **`jv_fxgain` debited AR ₹4,000 with no matching sub-ledger movement** and quoted INV/26-27/0102,
  which is an INR invoice for a different customer. It is now a realized gain on converting USD 3,000
  out of the EEFC account (1330 → 1310), which is what the opening EEFC balance actually supports.
- **The June revaluation (`jv_reval_jun`) revalued AR without restating the open items.** It now
  revalues the USD (EEFC) bank balance only; `rev_run_jun` was restated to match (`scope: ['Bank']`,
  gain ₹2,750). Revaluing AR control is only safe once open items are restated with it.
- **Realized FX on receivables now comes from the settlement itself.** `seed/sales.ts` seeds
  `RCPT/26-27/0212` (USD 1,630 against INV/SRT/26-27/0007 at 84.30 vs a booked 84.10) and posts the
  ₹326 gain as a separate base-currency journal, exactly as `engine.settleOpenItem` does at runtime.
  This is also the first row the realized-FX report has ever had.
- `CN/26-27/0016` needed no open item — it is fully allocated against `oi_inv_0102` (₹2,128).

### 2. AP control (2100) ties to its sub-ledger — FR-ACC-020, FR-AP-001

Before: ledger ₹20.93L vs supplier open items ₹7.01L. After: **₹20,68,532 = ₹20,68,532**.

- Seven carried-forward supplier invoices seeded in `seed/accounting.ts`, totalling **exactly
  ₹12,30,400** (account 2100's opening balance), again guarded by an assertion.
- **New account `2110 · Goods Received Not Invoiced (GRNI)`** (Liability, control, posting allowed).
  GRNs credit GRNI with *no party* — there is no vendor document yet, so nothing may reach the AP
  sub-ledger — and the vendor invoice debits GRNI for every line matched to a GRN, falling back to
  the expense/inventory account for non-PO invoices. Changed in `seed/purchase.ts`,
  `modules/purchase/actions.ts` (GRN posting) and `modules/purchase/invoiceActions.ts` (invoice
  posting + projected journal). The account is configurable via `purchaseSettings().grniAccountId`.
  GRNI now holds ₹11,440 = GRN/26-27/0061 received but not yet invoiced (VINV/26-27/0037 is still
  in exception).
- **New account `2350 · Corporate Card Payable`.** Corporate-card expense claims credited AP control
  with a party name but no party id, which polluted the AP sub-ledger. They now credit 2350 with no
  party (the company settles the card statement, not a supplier). Personal claims continue to credit
  *2340 Employee Reimbursements Payable* with `partyType: 'Employee'`. Changed in `seed/budgets.ts`,
  `modules/budgets/expenseActions.ts` and the projected journal in `modules/budgets/Expenses.tsx`.
- **`jv_man_2`** (₹75,000 audit-fee provision) credited AP control with a party but had no open item;
  one is now seeded (`oi_jv_man_2`). A manual journal on a control account is a payable like any other.
- `DN/26-27/0007` needed no open item — it is settled against `oi_vinv_0027` (₹6,608).
- The subcontract-order charge already has both a party and an open item and reconciles; it belongs
  to the manufacturing module and was left alone.
- Supplier advances (₹62,000 to Shree Suppliers) post to *1450 Advances to Suppliers* and now
  reconcile there instead of against AP control.

### 3. Inventory control ties to valuation — FR-INV-008

Before: 1200+1210+1220 ₹67.62L vs stock ₹65.31L. After: **1200+1210 excl. production
₹81,72,988 = ₹81,72,988**, and 0 stock movements without a journal.

- **Opening inventory balances did not match the opening stock.** The seeded opening movements are
  worth ₹90,62,593 (₹16,25,725 finished goods / ₹74,36,868 raw materials) but the accounts carried
  ₹6,82,400 + ₹54,20,000. Per the brief the *accounts* were corrected to the stock, and the
  ₹29,60,193 difference was absorbed into opening **Retained Earnings** (₹8,42,600 → ₹38,02,793) so
  the opening trial balance still nets to zero. `3900 Opening Balance Equity` was left at its
  existing ₹18,02,179 — it is the documented "prior system did not reconcile" plug and is surfaced
  on Accounting › Opening balances.
- **Sales, POS and sales returns relieved stock with no ledger entry at all** — ~₹14.9L of inventory
  left 1200/1210 without a journal, which is why control could never tie. `seed/sales.ts` and
  `seed/pos.ts` now post a COGS journal per delivery / cash-sale invoice / sales return / POS bill /
  POS return (Dr 5000 · Cr the item's inventory account, at the movement's own value), and every
  stock movement carries its journal id. This adds ~₹14.9L of cost of goods sold to the P&L, which
  is the main reason net profit moved.
- **Landed cost / value-only movements** are matched by `jv_lc_0001` (₹9,700 split ₹8,865.59 to 1210
  and ₹834.41 to 1200) and are now included in the valuation (a qty-0 movement carries value).
- **One valuation engine.** `engine.stockPosition` now reports the moving-average stock-ledger value
  (receipts + landed cost − issues) and derives `avgRate` from it, instead of `onHand × receipt
  average` — the two diverge as soon as a landed cost lands after an issue. `modules/inventory/
  actions.ts › valuation()` is now a thin wrapper over it, so Inventory › Valuation and Reports ›
  Stock valuation report the same number (₹83,13,720.15) for the first time.
- Both valuation screens now compare against 1200 + 1210 + **1220** (WIP is inventory too) and are
  scoped to the active company — the GL tile was previously adding another company's 1200.

### 4. One source of truth for balances

`modules/reports/compute.ts` had its own `openingDr()`/`ledgerBalances()` that interpreted opening
balances by account **type** and ignored `Reversed` journals, while `engine.accountBalance` uses
`normalBalance` and counts them. Both are deleted: `ledgerBalances()` is now a thin presentation
wrapper that calls `engine.accountBalance` per account and flips the result into the Dr-positive
convention the statements use. Every report that reads balances — P&L, balance sheet, cash flow,
trial balance, journal register, budget variance, profitability, FX, bank balances and the CFO
dashboard — goes through it. `engine.accountBalance` gained two additive options, `dimension` and
`includeOpening`, so dimension-sliced reports no longer need their own loop.

Verified at runtime: trial balance Dr = Cr, AR ageing = TB AR control =
`engine.accountBalance`, AP likewise, and CFO dashboard net profit = P&L net profit = ₹12,93,872.19
= the audit's P&L figure.

### 5. Audit coverage

`scripts/audit-seed.mts` now computes balances the way the engine does (Posted **and** Reversed
journals, opening balance in `normalBalance` direction, scoped to `co_acme` — account codes repeat
across companies) and checks: AR control, customer advances, AP control, supplier advances, GRNI,
employee payable, corporate card, inventory excluding production, salaries payable, the three output
tax accounts, the three input tax accounts (including reverse charge and expense-claim GST), P&L net
vs the retained-earnings movement implied by the balance sheet, and that no stock movement is
missing a journal. It prints `AUDIT OK` only when every line reconciles.

## Deliberately left / out of scope

1. **Production and subcontracting** (manufacturing module, still being built). Inventory including
   WIP is out by **₹83,134.14**, reported as an `INFO` line by the audit and visible on both stock
   valuation screens. Every production/subcontract movement and journal is excluded from the
   reconciliation that must pass; once the module lands, remove the `PROD_SOURCE` exclusion in
   `scripts/audit-seed.mts` and the gap should close.
2. **`2160 Retainers Received`** is seeded by the projects/services module. Retainer open items are
   classified as `advance` so they stop distorting AR, but no reconciliation line is asserted for
   2160 because its data is still changing. It also carries a ₹1,50,000 opening retainer from
   `jv_opening` with no matching open item.
3. **Runtime COGS.** The seed posts cost of goods sold, but `modules/sales/actions.ts`,
   `modules/sales/fulfilment.ts` and `modules/pos/actions.ts` still relieve stock without a COGS
   journal — those files belong to the sales/POS modules. Posting a new invoice in the running app
   will therefore re-open the inventory difference by the cost of that invoice. **This is the single
   biggest remaining gap** and should be the next module-owned fix: mirror `cogsJournal()` from
   `seed/sales.ts` in the posting actions.
4. **Workflow coverage** — still no seeded rule for Sales Order, POS Return, POS shift variance,
   Requisition, Contract, Consolidation Adjustment or Asset Transfer; those paths fall back to
   permission gates.
5. **`po_0094`** has a seeded approval request but is not in the agreed PO id list — unconfirmed.
