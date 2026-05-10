# MERGE_PLAN.md: gsl-mou-system → gsl-ops-automation

**Status:** Gate 1 Step 1 deliverable. Convergence plan only; no migration runs in Gate 1.
**Source repo:** `C:\Users\anish\Projects\gsl-mou-system\` (Phase 3 Round 3, post adjustment-as-line-item).
**Target repo:** `C:\Users\anish\Projects\gsl-ops-automation\` (Week 4-I.5 close, dashboard rebuild + smart templates).
**Migration window:** Gate 2 of 5. This doc is the contract for that gate.

The plan is written so the engineer running Gate 2 reads it once and knows: which schemas to copy, which behaviours must arrive intact, and which two weeks the dual-write parallel run consumes.

---

## 1. Why this document exists

GSL has been running two production-ish webapps in parallel since 2026-02:

- `gsl-mou-system`: drafting, signing, tracking MOUs; PI generation; Tally export; payment reconciliation. Used by Shubhangi, Anita, Pranav, Vishwanath. Source of truth for MOU lifecycle + finance.
- `gsl-ops-automation`: post-MOU operations (intake, dispatch, feedback, escalations, training rollout). Used by Pradeep, Misba, Swati, Pratik. Source of truth for ops execution.

Both apps share the same school identity space and the same staff. Running them as separate codebases creates daily friction: a school's MOU lives in one app, its dispatches in another, its feedback in a third pane. Misba's MM6 (Sales Pipeline tab visible to Ops) is a symptom; the disease is two source-of-truths sharing one operational reality.

The unified GSL Ops Platform (this repo) is the convergence target. Gate 2 will pull MOU lifecycle + finance into this repo as first-class modules. `gsl-mou-system` stops accepting writes and becomes a read-only legacy archive at cutover.

**This doc is the migration contract.** What moves verbatim, what must not regress, how the two-week parallel run runs.

---

## 2. Source vs target inventory

The current Ops repo has already inherited several gsl-mou-system pieces verbatim. The Gate 2 work is the next layer.

### Already inherited in gsl-ops-automation today

| File / pattern | Status |
|---|---|
| `src/lib/githubQueue.ts` (atomicUpdateJson + queue write pattern) | Inherited; in production. |
| `src/lib/pendingUpdates.ts` (pending-updates entity shape) | Inherited; in production. |
| `src/lib/format.ts` (formatRs, formatDate, Indian-comma grouping) | Inherited; in production. Em-dash debt cleaned in mou-system commit `13e7710`. |
| `next.config.mjs` (`experimental.outputFileTracingIncludes` placement) | Inherited; in production. |
| `vercel.json` (`ignoreCommand` on `^chore\(queue\):` prefix) | Inherited; in production. Auto-sync trigger lives in `.github/workflows/sync-queue-cron.yml` instead of Vercel cron because Hobby-tier rejects sub-daily cadence (W4-I.3 decision). |
| `AuditEntry` shape | Inherited verbatim; ops-domain actions added on top. |
| Per-user RBAC (bcrypt + JWT httpOnly + 7-day refresh) | From gsl-hr-system, not gsl-mou-system. Already in place. |

### Still to migrate in Gate 2

| File / module | Migration discipline |
|---|---|
| `src/lib/types.ts` (MOU, School, Payment, PaymentLog, VexProduct, VexPi, VexDispatch, VexOrder, Agreement, Adjustment, SignedValues, PiCounterMap, Rate, Alert) | Copy schemas verbatim. No schema drift. Field names, optional / nullable shapes, audit shape stay identical. The Ops `src/lib/types.ts` already exports its own `Programme` enum (5-value: STEAM / Robotics / Young Pioneers / Harvard HBPE / VEX); reconcile by extending the existing enum if missing values, not redefining. |
| `src/lib/recalc.ts` (RecalcInput, RecalcInstalment, RecalcResult, ExistingInstallment, InstallmentUpdate, PendingAdjustment, RecalcWriteResult, recalculatePaymentSchedule, computeRecalcWithAdjustments) | Copy verbatim. The lock criterion (`paidAmount > 0 || piSentDate truthy`) is non-negotiable. Round 3 `freshExpectedAmount` plug-in for per-year pricing must arrive intact. |
| `src/lib/pi.ts` (PI_BLOCKED_STATUSES, isPiAllowedForStatus, PiSummaryRow, PiInvoice, companyBlockFor, hsnFor, issuePiNumber, amountInWordsInr, composePi, buildMouPiSummary, computeFiscalYear) | Copy verbatim. Adjustment-as-line-item summing on `composePi` (`balanceDuePreviousInstalments` + `netPaymentDue`) is non-negotiable. |
| `src/lib/vex.ts` (parseCsv, slugify, matchSchool, mapCsvToDraftRows, buildVexOrdersFromRows, vexFunnelCounts) | Copy verbatim. The 28-SKU → multi-dispatch lifecycle is the hard requirement (`VexPi` independent of `VexDispatch`, one PI may have N dispatches). |
| `src/lib/templates.ts` (TEMPLATES registry + COMMON_MAIN placeholders + listTemplates / getTemplate + SALES_CHANNELS + TRAINER_MODELS) | Copy verbatim. The .docx skeleton is rendered deterministically via `docx` lib in `src/lib/mouDoc.ts` (also migrate). |
| `src/lib/company.ts` + `config/company.json` (MAF Technologies entity registry + GSTIN/HSN/PI prefix routing) | Copy verbatim. The Ops repo will reuse the same `config/company.json` shape; do NOT fork the file. |
| `src/data/pi_counter.json` shape (PiCounterMap with per-entity `next` cursor) | Copy as-is. Single counter per GST entity is the locked contract. |
| `src/lib/githubQueue.ts` extension: `issuePiNumberAtomic` (atomic counter increment with sha-conflict retry) | Copy verbatim. The retry-on-409 pattern is what guarantees gap-free per-GSTIN sequencing. |
| `src/data/adjustments.json` seed file | Migrate as `[]`; the lib paths read it with the `coerceAgreement`-style optional-field tolerance already established. |
| MOU drafting in-browser annexure editor (autosave → `mous.json` `draftVariables`) | Source pages live under `src/app/mous/[id]/draft` in mou-system. Migrate UI verbatim; the autosave queue path uses `atomicUpdateJson` already inherited. |
| MOU + PI .docx / .pdf generation | `src/lib/mouDoc.ts` + the React-PDF renderer pages. Migrate verbatim with the two-logos-two-purposes asset paths preserved. |
| `public/branding/gsl_amg_logo.png` (combined GSL+AMG, MOU `.docx` header) | Copy file. |
| `public/branding/amg_logo.png` (AMG-only, PI `.pdf` header) | Copy file. If absent in source repo, lift from the existing mou-system PI renderer's import. |
| `public/mou-templates/STEAM-v2.1.docx`, `YP-v2.1.docx`, `HBPE-v2.1.docx` | Copy verbatim. Aliasing of `*-v2.1` → `*-v3` lives in `getTemplate()`; preserve. |
| `public/skill-files/mou-legal-compliance-india.md`, `gsl-mou-standards.md`, `mou-audit-checklist.md` | Copy verbatim. Users will continue to download these from the unified app and upload to their own Claude conversations for MOU drafting + audit. |
| Tally Prime 6.2 XML voucher writer (alongside the PI .pdf path) | Migrate verbatim. The XML format is locked by Tally; do not optimise. |

### Renamed at cutover (no schema drift, only file location)

| In gsl-mou-system | In gsl-ops-automation |
|---|---|
| `src/data/mous.json` | `src/data/mous.json` (already exists; merge by ID, prefer mou-system rows for any conflict at cutover instant). |
| `src/data/schools.json` | `src/data/schools.json` (already exists; identity reconciliation per Ground-Truth report §4: fuzzy-match cluster review at cutover, not auto-match). |
| `src/data/payments.json` | `src/data/payments.json` (already exists in Ops; canonical is mou-system at cutover instant). |
| `src/data/payment_log.json` | `src/data/payment_logs.json` (already exists; rename `payment_log` → `payment_logs` to match Ops plurality convention). |
| `src/data/agreements.json` | `src/data/agreements.json` (new in Ops). |
| `src/data/signed_values.json` | `src/data/signed_values.json` (new in Ops). |
| `src/data/vex_products.json`, `vex_orders.json`, `vex_dispatches.json`, `vex_pis.json` | Same names; new in Ops. |
| `src/data/adjustments.json` | `src/data/adjustments.json` (new in Ops). |
| `src/data/sales_team.json` | `src/data/sales_team.json` (already exists in Ops with the 5-value Programme enum + extended fields). |

---

## 3. Entities to migrate verbatim

Schemas, no drift. Field-by-field reproductions of `gsl-mou-system/src/lib/types.ts` are the source of truth for these entities. Below is the inventory only; field-level definitions stay in the type file.

### MOU
- Identity: `id` MOU-{TYPE}-{YEAR}-{SEQ}; `schoolId`; `schoolName` (denormalised).
- Lifecycle: `status` (Draft / Sent for Signing / Awaiting Signature / Pending Signature / Signed / Active / Completed / Expired / Renewed); `academicYear`; `startDate`; `endDate`; `effectiveDate`; `numberOfYears`.
- Commercials: `studentsMou`; `studentsActual`; `studentsVariance(Pct)`; `spWithoutTax`; `spWithTax`; `contractValue`; `received`; `tds`; `balance`; `receivedPct`; `paymentSchedule` (legacy string); `paymentSchedules` (Phase 3 structured); `yearlyPricing` (Round 3).
- People + provenance: `salesRep` (legacy free-text); `salesPersonId` (FK); `salesChannel`; `schoolCrmId`; `trainerModel`; `notes`; `daysToExpiry`.
- Drafting + generation: `templateVersion`; `generatedAt`; `draftVariables`; `billingBlock` (13 fields per Pranav's spec); `signedMouPdfPath`.
- Universal: `auditLog: AuditEntry[]`.

### School
- Identity: `id` SCH-{NORMALIZED_NAME}; `name`; `legalEntity`.
- Geo: `city`; `state`; `pinCode`.
- Contact: `contactPerson`; `designation`; `email`; `phone`.
- Billing + shipping: `billingName`; `billingAddress`; `shippingName`; `shippingAddress`.
- Tax: `pan`; `gstNumber`.
- Aggregate: `activeMous`; `totalLifetimeValue`; `notes`; `auditLog`.

### Payment (per-instalment, FK to MOU)
- `id` `${mouId}-i${instalmentSeq}`; `mouId`; `schoolName`; `programme`; `instalmentLabel`; `instalmentSeq`; `totalInstalments`; `description`.
- Due / received: `dueDateRaw`; `dueDateIso`; `expectedAmount`; `receivedAmount`; `receivedDate`; `paymentMode`; `bankReference`; `partialPayments[]`.
- Linkage: `piNumber`; `taxInvoiceNumber`; `status` (Received / Pending / Overdue / Partial / Due Soon / PI Sent / Paid).
- PI bookkeeping: `piSentDate`; `piSentTo`; `piGeneratedAt`; `studentCountActual` (per-instalment override).
- Universal: `auditLog`.

### PaymentLog (bank-line-level)
- `id` (UUID); `date`; `amount`; `mode`; `reference`; `narration`; `salesPersonId`.
- Reconciliation: `matchedInstallmentIds[]`; `unmatched`; `loggedBy`; `loggedAt`; `notes`.

### Adjustment (Phase 3 Round 2)
- `id` ADJ-...; `mouId`; `schoolId`; `triggeredByEvent` (`actuals_update` / `installment_plan_change` / `manual` / `vex_overpayment`); `triggeredAt`; `triggeredBy`.
- Linkage: `originalInstallmentId`; `appliedToInstallmentId` (null = floating credit at school level).
- Money: `amountDelta` (signed); `beforeAmount`; `afterAmount`; `reason`.
- Lifecycle: `status` (`Active` / `Reversed`).

### SignedValues
- `mouId`; `signedDate`; `signedBy`; `pricePerStudent`; `studentCount`; `duration`; `signedScanUrl`; `capturedAt`; `notes`.

### Agreement (vendor / NDA registry)
- `id`; `type` (`Vendor` / `NDA`); `partyName`; `natureOfAgreement`; `product`; `department`; `keyTerms` (Round 2 optional summary); `startDate`; `endDate`; `tenure`; `noticePeriod`; `vendorLocation`; `physicalCustody`; `documentUrl`; `daysToExpiry`; `auditLog`.

### VexProduct / VexPi / VexDispatch / VexOrder (the 28-SKU module)
- `VexProduct`: `partNumber`; `name`; `defaultUnitPrice`; `active`. 28-row master from `VEX_Product_Master.xlsx` Sheet2; do not seed Sheet1's 87-row carton-dimension data (Phase 3b deferred).
- `VexPi`: `id` VEXPI-{ENTITY}-2627-{SEQ}; `piNumber` (shared programme + VEX counter per GST entity); `entityKey` (`MH` / `UP`); `issueDate`; ship-to + bill-to blocks; `lineItems: VexPiLineItem[]`; `subtotal`; `freightCharges`; `taxableValue`; `gstPct`; `gstAmount`; `total`; `status` (`Generated` / `Payment Pending` / `Delivery Pending` / `Partially Dispatched` / `Completed`); `paymentReceivedAmount`; `paymentLogIds[]`; `auditLog`.
- `VexDispatch`: `id` VEXD-{ENTITY}-2627-{SEQ}; `piId` (FK); `items: VexDispatchItem[]`; `freight`; `mode` (`Air` / `Surface`); `status` (`Requested` / `Request Raised to Warehouse` / `Invoiced` / `Shipped`); `taxInvoiceNumber`; `taxInvoicePath`; `invoicedAt`; `supportingDocPath`; `warehouseEmailSentAt`; `warehouseEmailSentBy`; `auditLog`.
- `VexOrder`: legacy Tally-imported voucher records; preserve for historical view; new flow uses VexPi + VexDispatch.

### PiCounterMap
- `fiscalYear` (`2627`); `entities: { MH: { next: number }, UP: { next: number } }`.
- One sequential counter per GST entity. Sequence is gap-free within entity. Atomic increment via `issuePiNumberAtomic` with sha-conflict retry up to 3 times.

### PendingUpdate (queue entry shape, already inherited)
- `id` (UUID); `queuedAt`; `queuedBy`; `entity` (now extends to `mou` / `installment` / `vexOrder` / `agreement` / `paymentLog` / `signedValues` / `piIssue` / `piCounter`); `operation`; `payload`; `retryCount`; `lastError`.

### Rate / Alert (legacy Phase 2; preserve for read-only registry view)
- `Rate`: programme + variant + standard / minAcceptable price + paymentTerms.
- `Alert`: legacy alert objects from before the Ops escalations module; preserve for one cycle, then deprecate when escalations subsumes them in Gate 4.

### KPIs (computed, not stored)
- The KPIs object shape stays in `src/lib/types.ts` for the dashboard to import; the values are recomputed on every render (server-component pages).

---

## 4. Behaviours that MUST NOT regress (Pranav's hard requirements)

Each item below is a contract. Gate 2 ships with a regression test asserting the behaviour. The test list lives in `src/lib/recalc.test.ts`, `src/lib/pi.test.ts`, `src/lib/vex.test.ts` and a new `tests/migration/lifecycle-12-mou-walk.test.ts` (the rupee-perfect replay).

### 4.1 Recalc engine rupee-perfection (adjustment-as-line-item)
- **Contract:** Once a PI has been issued (`piSentDate` truthy) OR any payment has been received against an instalment (`paidAmount > 0`), that instalment's `expectedAmount` is locked. Subsequent actuals updates produce an `Adjustment` row attached to the next unlocked instalment, never silently rewrite history.
- **Source:** `gsl-mou-system/src/lib/recalc.ts:165` `computeRecalcWithAdjustments` lock criterion.
- **Regression test:** `tests/migration/lifecycle-12-mou-walk.test.ts` walks 12 representative MOUs (3 STEAM, 3 Robotics, 3 YP, 2 HBPE, 1 multi-year) through the full lifecycle (sign → instalment 1 PI → payment → actuals drop → instalment 2 PI → payment → completion) and asserts identical totals to the reference fixtures captured from gsl-mou-system production data on the cutover instant.
- **Round 1 Pranav scenario** (the canonical fixture): 500 students × Rs 1,000/student × 4 × 25%; drop to 450 BEFORE any payment rewrites all four PIs to Rs 1,12,500; pay instalment 1 of Rs 1,12,500; drop to 400 AFTER instalment 1 paid: instalment 1 stays Rs 1,12,500, Rs 12,500 credit Adjustment attaches to instalment 2; instalment 2 expected Rs 1,00,000; net due Rs 87,500; instalment 3, 4 each Rs 1,00,000.
- **Why:** Audit trail. Finance reconciles to issued PIs, not retroactively-rewritten ones.

### 4.2 Per-year pricing for multi-year MOUs (Round 3)
- **Contract:** When `mou.yearlyPricing` is non-null, contract value and per-instalment expected amounts use the matching year's `spWithTax`. The `freshExpectedAmount` plug on `ExistingInstallment` lets the recalc engine accept a pre-computed per-year amount instead of multiplying `perStudentPrice * newStudents * pctDue / 100`.
- **Source:** `gsl-mou-system/src/lib/recalc.ts:122` (`freshExpectedAmount` field), `:178` (engine path).
- **Regression test:** Multi-year MOU fixture in the 12-MOU walk asserts year 1 instalments use Rs 1,500/student and year 2 instalments use Rs 1,600/student (Pranav's example).
- **Why:** Multi-year MOUs price-step year-over-year; rewriting the engine to handle this naively would re-introduce drift on issued PIs. The plug pattern is non-negotiable.

### 4.3 GSTIN routing + HSN + PI prefix
- **Contract:**
  - Maharashtra (`MH`) GSTIN `27AAOCM1035E1ZN`, HSN `999294`, PI prefix `MTPL/MH/2627/<seq>` zero-padded 4 digits. Programmes routed to MH: Young Pioneers, Harvard HBPE, VEX-MH (default).
  - Uttar Pradesh (`UP`) GSTIN `09AAOCM1035E1ZL`, HSN `999294`, PI prefix `MTPL/UP/2627/<seq>` zero-padded 4 digits. Programmes routed to UP: STEAM, Robotics, VEX-UP.
  - Counter is gap-free per entity, sequential, atomic increment with sha-conflict retry.
- **Source:** `gsl-mou-system/config/company.json`, `src/lib/pi.ts:152` (`hsnFor`), `:162` (`issuePiNumber`).
- **Regression test:** Three concurrent PI-issue calls per entity in `pi.test.ts` assert no gaps and no duplicates.
- **Why:** GST audit. A gap in `MTPL/MH/2627/0001..` is a flag-for-explanation event with the GST officer; we do not introduce risk for cleverness.

### 4.4 Two logos, two purposes
- **Contract:** MOU `.docx` uses the combined GSL+AMG logo (`public/branding/gsl_amg_logo.png`). PI `.pdf` uses the AMG-only logo (`public/branding/amg_logo.png`). The MOU is a GSL-branded contract; the PI is invoiced from MAF Technologies (the AMG entity) and must visually present as such.
- **Source:** Phase 3 Round 2 default #2 in `gsl-mou-system/CLAUDE.md:6`.
- **Regression test:** Snapshot test on the rendered docx + pdf assets.
- **Why:** Pranav's compliance preference. The PI's tax origin is AMG, not GSL. Branding follows tax origin on the invoice.

### 4.5 VEX 28-SKU partial dispatch
- **Contract:** PI generation and dispatch are separate domain operations. A single `VexPi` may have N `VexDispatch` rows as warehouse stock arrives. PI status flows through `Generated` → `Payment Pending` → `Delivery Pending` → `Partially Dispatched` → `Completed`. Dispatch status flows independently: `Requested` → `Request Raised to Warehouse` → `Invoiced` → `Shipped`.
- **Source:** `gsl-mou-system/src/lib/types.ts:307` (`VexPi`), `:347` (`VexDispatch`).
- **Regression test:** `vex.test.ts` asserts a single PI with three dispatches (12 SKUs / 8 SKUs / 8 SKUs over three weeks) walks through `Generated` → `Partially Dispatched` (after first dispatch ships) → `Partially Dispatched` (after second) → `Completed` (after third).
- **Why:** VEX warehouse delivers in waves as Chinese supply lands. One PI per kit order, multiple shipments, which is the way GSL operates today.

### 4.6 MOU drafting in-browser annexure editor with autosave
- **Contract:** The drafting UI (`/mous/new` and `/mous/[id]/edit`) renders the placeholder catalogue from `templates.ts`, autosaves field-by-field to `mous.json` `draftVariables` via `atomicUpdateJson`, and persists across reloads / browser-back. Annexure (commercial terms) edits live in the same drafting flow as the body fields.
- **Source:** `gsl-mou-system/src/lib/templates.ts`; the UI pages at `src/app/mous/new/...` and `mous/[id]/edit/...` (migrate verbatim).
- **Regression test:** Playwright test draft → reload → resume; the in-progress fields survive.
- **Why:** Sales drafts MOUs over multiple sittings. Loss of in-progress work is a launch-blocker class regression.

### 4.7 PI counter shared across programme PIs and VEX PIs within a GST entity
- **Contract:** `MTPL/MH/2627/0001` could be a YP PI; `0002` a VEX PI; `0003` a STEAM PI. The sequence is per-GSTIN, not per-programme. The `PiCounterMap` shape with `entities.MH.next` and `entities.UP.next` is the source of truth.
- **Source:** Phase 3 Round 2 default #3 in `gsl-mou-system/CLAUDE.md:12`.
- **Regression test:** `pi.test.ts` issues a YP PI, then a VEX PI, then a STEAM PI under MH and asserts `0001` / `0002` / `0003`.
- **Why:** Pranav's preference for clean GST audit trail. One sequence per entity collapses cleanly into Tally Prime's voucher import.

### 4.8 Sales rep, sales channel, multi-year payment schedule on MOU draft
- **Contract:** The MOU drafting form captures `salesPersonId` (FK to `sales_team.json`), `salesChannel` (`School Programs (Course)` / `Bootcamps` / `Partnerships - Govt Projects` / `Others`), and `paymentSchedules: YearPaymentSchedule[]` (per-year instalment plans, percentage-based, summing to 100 per year). These are persisted on the MOU record and surface on the .docx body.
- **Source:** `gsl-mou-system/src/lib/types.ts:140-152`; the drafting UI form and validators.
- **Regression test:** A two-year MOU with `[{ year: 1, instalments: [{ month: 'April 2026', pctDue: 50 }, { month: 'October 2026', pctDue: 50 }] }, { year: 2, instalments: [...] }]` round-trips through the form, the .docx, and the recalc engine without drift.
- **Why:** Pranav's drafting flow. Sales channel feeds Phase 1.1 reporting; the multi-year schedule feeds the recalc engine via `freshExpectedAmount`.

### 4.9 Adjustment reversal flow data model
- **Contract:** `Adjustment.status` supports `Active` and `Reversed`. The reversal mutation flips status to `Reversed` and emits an audit entry on the parent MOU. PI generation logic (`composePi:264`) filters to `status === 'Active'` when summing adjustments, so a `Reversed` row is invisible to the next PI.
- **Source:** `gsl-mou-system/src/lib/types.ts:436-457` (Adjustment + AdjustmentStatus); `pi.ts:264` (the active-only filter).
- **Regression test:** `recalc.test.ts` creates an active adjustment, generates a PI showing the `balanceDuePreviousInstalments` line, then reverses the adjustment, then re-generates the PI and asserts the line shows Rs 0 (per Pranav's Round 2 spec the line still renders even when zero).
- **Why:** Reversals happen when a finance team-member discovers an adjustment was created in error (e.g., student count was misreported). The data model supports it; the UI is deferred but the data path must be reversal-safe so the eventual UI is a thin shell.

### 4.10 Manual carry-forward debt from gsl-mou-system

These known-debt items travel with the migration. Gate 2 does not block on them, but they get logged in `docs/W4-DEFERRED-ITEMS.md` so they stay visible.

| Item | Trigger to act |
|---|---|
| Em-dash policy debt across MOU components and data fixtures | When a single dedicated cleanup commit can land with screenshot before / after evidence (gsl-mou-system BACKLOG entry, P2). |
| Footer version-string auto-bump on `/ship` | When the next stale-cache false-alarm wastes >20 min (P2). |
| Manual browser QA for `/api/signed-values/save` | When the Vercel app accepts its first signed-values write post-cutover (P2). |
| Browser-back double-submit idempotency | When duplicate entries are observed in any entity file in production (gsl-mou-system TODOS, deferred). |
| 375px multi-year payment schedule grid | When a user reports the multi-year schedule doesn't fit on phone (gsl-mou-system TODOS, deferred). |

---

## 5. Cutover plan: post Gate 5

**Gate 2 entry update:** cutover happens **after Gate 5 final verification**, not after Gate 2 or Gate 3. Pranav, Shubhangi, and Anita continue using `gsl-mou-system.vercel.app` for daily MOU / PI / payment work during Gates 2-5 build. The migrated MOU module on Ops platform is parallel-built, populated with imported data for verification, but not handed over as system-of-record until Gate 5 ships and we manually flip.

The parallel-build window therefore spans Gates 2-5, not 2 weeks. During this window:
- mou-system is the write target for live MOU + PI + payment work.
- Ops platform receives one-shot snapshots from mou-system at each gate boundary (Gate 2 Step 4, then re-snapshot at Gate 5 cutover).
- The recalc engine, PI generation, payment matching libs migrate verbatim to Ops in Gate 2 Step 2 and run on imported data for verification; they do not produce production PIs during the parallel-build window.
- The PI counter ownership stays with mou-system (see §8).

**Cutover day** (post Gate 5 final verification):

1. Final read from `gsl-mou-system/src/data/*.json`: the most recent state of MOUs, payments, PIs, VEX records.
2. One-shot import into Ops via `scripts/cutover-load.mjs`. Audit log every entity creation as `'cutover-import'`.
3. Lock the PI counter (see §9): Ops reads `pi_counter.json` from mou-system one final time, persists it locally, and from this moment forward Ops is the only system that issues PIs.
4. `gsl-mou-system` middleware flips to read-only banner mode: every POST / PUT / DELETE returns HTTP 410 Gone with a redirect URL pointing to the equivalent Ops route. Reads continue to serve from the snapshot at cutover instant.
5. Ops `/` and per-department dashboards surface the per-department onboarding banner from §6.

**Rollback contract:**
- 48-hour rollback window. If a catastrophic regression surfaces in the first 48h, re-enable writes on `gsl-mou-system` and pause Ops writes; Anish replays any Ops-side captures into mou-system via a one-off script.
- After 48h the rollback path is closed. Ops becomes the only source of truth and the parallel-build mechanic is retired. Anish's 48h sign-off is the formal gate.

**Per-department onboarding banner** (Gate 5 deliverable, copy locked in §6) shows on first login post-cutover. Banner ID is set to the cutover date; dismissal stored in `localStorage`.

### Notes on the parallel-build window

- Bookmark preservation: Ops platform's MOU / PI / payment routes use the same path structure as gsl-mou-system (`/mous`, `/mous/[id]`, `/mous/[id]/pi`, `/payments/*`, `/vex/*`). A user pasting `https://gsl-ops-automation.vercel.app/mous/MOU-STEAM-2526-001` lands on the migrated equivalent.
- Daily diff report: `scripts/cutover-diff.mjs` is built in Gate 2 Step 4 and runs on Anish's local machine each morning during the parallel-build window. It compares the most recent Ops snapshot to the current mou-system state and writes `docs/cutover-diff-{date}.md`. Anish reviews; any unexpected divergence is logged and root-caused before the next morning.
- The legacy `gsl-mou-system` Vercel project stays deployed throughout the parallel-build window. After cutover + 48h rollback period passes, it stops being redeployed; the last build URL preserves as a read-only archive.

---

## 6. Per-department onboarding banner plan (Gate 5 placeholder)

Cutover-day banner shape, locked here so Gate 5 does not re-litigate.

### 6.1 First-login banner (per user, dismissable, persistent)

**Sales (department: `sales`):**

> Welcome to the unified GSL Ops Platform.
>
> Your MOUs, draft pipeline, signed registry, and signing flow are now in this app under "Pipeline" and "Active MOUs". Your sales-opportunity pipeline (pre-MOU) lives under "Pipeline" → "Drafts". Dispatch requests for kits go through "Dispatch" → "Raise Request"; this is the new Sales-initiated flow. Read more in the launch note linked below.

**Ops (department: `ops`):**

> Welcome to the unified GSL Ops Platform.
>
> Active MOUs (post-signing), schools, escalations, kit dispatch, training rollout, and feedback are all under "Operations". Dispatch requests from Sales arrive under "Dispatch" → "Pending Review". The MOU drafting + finance flows (PI generation, Tally export) live under their respective stages but are not your write surfaces. Read more in the launch note linked below.

**Finance (department: `finance`):**

> Welcome to the unified GSL Ops Platform.
>
> PI generation, payment matching, Tally export, and adjustment management are now in this app under "Finance". MOU drafting and signed registry continue to feed Finance via the same flow as before; the difference is everything lives in one app. Your reconciliation queue is at "Finance" → "Unmatched payments". Read more in the launch note linked below.

**Admin / Leadership (department: `null`):**

> Welcome to the unified GSL Ops Platform.
>
> All modules are visible to you. Your default landing page is the Operations Control Dashboard. Reports module surfaces leadership-level KPIs. The audit log spans every department. Read more in the launch note linked below.

### 6.2 Banner mechanics

- Banner ID `cutover-2026-XX-XX` (the actual cutover date is set at Gate 5).
- Dismissal stored in `localStorage['cutover-banner-dismissed-2026-XX-XX']`.
- 7-day re-show: if the user dismissed within the first 24 hours, the banner re-surfaces once 7 days post-cutover with a "Quick recap?" framing.
- Banner copy is held in `src/lib/banners/cutoverBanner.ts` so it can be edited centrally without grepping through page components.

### 6.3 Launch note

- A `docs/LAUNCH-NOTE.md` in the Ops repo, also linked from each banner. ~2 pages. What changed, what stayed, where to find common workflows, who to ping for help (Anish + Pradeep).
- Authored at Gate 5 close, not earlier.

---

## 7. Open questions parked for Gate 2 entry

Originally unresolved at Gate 1 close. Gate 2 entry decisions below.

### 7.1 Programme enum (Gate 2 decision)

**Decision:** Programme reduces to 4 canonical values: `STEAM | Young Pioneers | Harvard HBPE | Robotics`. VEX is a parallel module (its own `VexPi` / `VexDispatch` / `VexOrder` entities, separate counter sequence shared with programme PIs per GST entity). TinkRworks is a STEAM subtype captured via `MOU.programmeSubType = 'TinkRworks'`.

**Migration shape:**
- `Programme` (TypeScript): `'STEAM' | 'Young Pioneers' | 'Harvard HBPE' | 'Robotics'`.
- `SalesProgramme = Programme | 'VEX'` for sales-team + sales-opportunity contexts (a rep can own VEX kit pursuits without an MOU programme of the same name).
- `IntakeProductConfirmed = Programme | 'VEX' | 'TinkRworks'` for intake-time captured product (6 historical W4-C.7 backfill records carry the legacy variant on STEAM-programme MOUs; preserved as captured signal until a future productSubtype split).
- Live data migrated in Gate 2 Step 1: 2 sales-team records (Vikram T's `['STEAM','TinkRworks']` → `['STEAM']`; Arjun K's `['TinkRworks','VEX']` → `['STEAM','VEX']`). 0 MOUs use TinkRworks or VEX as `programme` so the MOU-side migration is enum-only.
- `MouCard` accent palette retains Robotics with the brand-navy chip (formerly TinkRworks).
- Dispatch line-item programme matching (`createRequest.lineItemMismatchesProgramme`) tightened to read TinkRworks as `programme === 'STEAM' && subType === 'TinkRworks'` rather than the standalone TinkRworks programme.

### 7.2 SchoolGroup model (Gate 2 decision)

**Decision:** Option B. `SchoolGroup → has many School → has many MOU`. Each existing School backfills to its own SchoolGroup (1:1 by default). Chain commercial terms live on SchoolGroup.

**Migration shape:**
- `SchoolGroup` already existed in Ops platform from Q-I groundwork. Gate 2 Step 1 extends it with chain-billing fields: `primaryContact`, `primaryEmail`, `primaryPhone`, `gstNumber` (all optional `string | null` to keep round 1 fixtures + the existing `schoolGroup.ts` lib compiling without forced migration).
- Chain MOU PI generation reads `SchoolGroup.gstNumber` when `school.gstNumber` is null.
- Standalone schools (1:1 group) leave the chain-billing fields null and bill through their own School fields.
- The 1:1 backfill (every standalone School gets its own SchoolGroup) lands in Gate 2 Step 4 (one-time data import).

### 7.3 TrainerHead department mapping (Gate 1 decision, retained)

The brief maps Sales / Ops / Finance to departments and leaves Admin / Leadership null. The Ops repo also has `TrainerHead` (Shashank's role pre-Admin promotion). Gate 1 Step 2 backfilled Shashank as `department: null` (cross-functional Admin during pilot per Anish's call); the `defaultDepartmentForRole(TrainerHead)` seed mapping returns `'ops'` for any future TrainerHead user, but Shashank himself is null. Revisit at Gate 4 when training rollout becomes a first-class module and an `'academics'` department becomes warranted.
4. **`OpsEmployee` vs `Operations` vs `Ops Coordinator` vs `Ops Lead` role names.** The brief mentions `Operations` / `Ops Coordinator` / `Ops Lead`. The Ops repo has `OpsHead` and `OpsEmployee`. Gate 1 Step 2 maps both to `department: 'ops'` and does not introduce new role names. The role-design conversation post-pilot will revisit naming.
5. **`Premium-Sales` role.** The brief mentions `Premium-Sales` mapping to `department: 'sales'`. The Ops repo does not have this role today. Gate 1 Step 2 leaves the helper structure ready (the dept resolver is a switch-by-role) so adding `Premium-Sales` later is a one-line change. Do not introduce the role pre-emptively.
6. **`Accounts` role vs `Finance`.** The brief mentions `Accounts` mapping to `department: 'finance'`. Ops has `Finance`. Same approach: Gate 1 Step 2 keys off existing `Finance`; future role additions are a one-line change.

---

## 8. Reading order for the Gate 2 engineer

When Gate 2 begins, the engineer reads:

1. This document (`docs/MERGE_PLAN.md`).
2. `gsl-mou-system/CLAUDE.md` (Phase 3 Round 2 + Round 3 defaults).
3. `gsl-mou-system/src/lib/types.ts` (entity schemas).
4. `gsl-mou-system/src/lib/recalc.ts` (the rupee-perfect engine).
5. `gsl-mou-system/src/lib/pi.ts` (PI generation + adjustment summing).
6. `gsl-mou-system/src/lib/vex.ts` (28-SKU partial dispatch).
7. `gsl-mou-system/src/lib/templates.ts` (drafting placeholder catalogue).
8. `gsl-mou-system/config/company.json` (GSTIN registry).
9. `ops-data/ground-truth-data-report-2026-04-24.md` §1, §3, §4 (data quality at cutover).
10. `docs/role-decisions.md` (current Ops permission posture).

That ten-file reading order, plus this plan, is enough to land Gate 2 without re-reading the full mou-system codebase.

---

## 9. PI counter ownership during parallel-build (Gate 2 §3)

**Until Gate 5 cutover:** mou-system continues to issue PIs and increment its `pi_counter.json` (the single-counter shape) and `pi_counter_map.json` (the per-GSTIN shape under MTPL/MH and MTPL/UP). Pranav, Shubhangi, and Anita continue daily PI work on `gsl-mou-system.vercel.app`.

**Ops platform during parallel-build:** Gate 2 Step 3 copies the latest `company.json` and `pi_counter*.json` snapshot from mou-system into Ops. Ops uses these for verification; recalc + PI generation libs run on imported data, but **Ops does not issue production PIs until Gate 5 cutover**. Any PI generated by Ops during parallel-build is an internal verification artefact, never sent to a school, never persisted to the `pi_issues` ledger.

**At cutover:** the counter state is read one final time from mou-system and locked into Ops. From cutover instant onward, Ops is the only system that issues PIs. The `pi_counter_map.json` carries the next sequence value per GSTIN and Ops's atomic `issuePiNumberAtomic` increments it per issuance.

**Counter doubt mitigation:** if a PI gets issued on mou-system between the final-snapshot-read and the cutover-flip (a < 5-minute window), the daily diff report (§5) catches the mismatch the next morning. Recovery: re-read mou-system's counter, increment Ops's counter to match, re-issue on Ops with the correct sequence, mark the original mou-system PI as superseded. The probability of a collision is low because PI issuance during parallel-build is mou-system-only by policy; the cutover-day flip happens with mou-system in maintenance mode (writes already disabled).

---

**End of MERGE_PLAN.md.**
