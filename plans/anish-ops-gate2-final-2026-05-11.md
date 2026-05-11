# Gate 2 final report: 2026-05-11

**Owner:** Anish Dutta · **CEO sponsor:** Ameet Zaveri
**Scope:** MOU + Payment + PI + VEX + Vendor + NDA hard convergence from `gsl-mou-system` into `gsl-ops-automation`.
**Status:** Gate 2 closed. Gate 3 starts after Anish review.

---

## 1. Step commits (Gate 2)

The eight Gate 2 steps + housekeeping/follow-up commits, in landing order:

| Step | Commit | Subject |
|---|---|---|
| 1 | `35089e2` | feat(entities): migrate MOU + Payment + PI + VEX + Vendor schemas from gsl-mou-system |
| 2 | `9ca424f` | feat(libs): migrate recalc/pi/vex/templates verbatim + 12-MOU rupee-perfect regression |
| 3 | `5872e5a` | chore(config): migrate company.json + pi_counter from gsl-mou-system |
| 4 | `f092ada` | feat(import): one-time data import from gsl-mou-system + snapshot dashboard |
|  | `36bf9af` | chore(gate2): apply Step 4 review feedback + Step 5 prerequisites |
| 5 | `3059b4c` | feat(mou): full MOU drafting + lifecycle UI in Ops platform |
| 6 | `83d6036` | feat(pi): parallel-build lock on PI generation to prevent counter collision (Step 6 housekeeping) |
|  | `61b9d86` | feat(finance): payment matching + PI generation + adjustments UI |
| 7 | `ae4529f` | chore(backlog): log PI render-only split as Gate 5 prereq (Step 6 follow-up) |
|  | `91e1247` | feat(operations): VEX + Vendor + NDA modules |
| 8 | `31791d4` | feat(operations): promote VEX/agreement snapshot + fix VEX PI id format |
|  | `702fddf` | docs(gate2): cutover plan + VEX dispatch role split + rewind backlog |
|  | `63b84b4` | test(gate2): V5 integration tests for lock-flip + shared counter |
|  | `00db7a1` | chore(gate2): tsc strict-mode fixes on V5 integration tests |

13 commits total (8 step-level + 5 housekeeping/follow-up).

---

## 2. Test count

| Snapshot | Tests | Files |
|---|---|---|
| Gate 1 close (pre-Gate 2) | 1,952 | 211 |
| Gate 2 Step 5 close | 2,089 | 226 |
| Gate 2 Step 6 close | 2,114 | 230 |
| Gate 2 Step 7 close | 2,114 | 230 (Step 7 added surfaces, deferred tests to Step 8) |
| **Gate 2 Step 8 close (final)** | **2,127** | **232** |

Net Gate 2 contribution: +175 tests across 21 files. New libs covered: `pi.ts`, `recalc.ts`, `installments.ts`, `vex.ts`, `vexDispatchGate.ts`, `reconcile.ts`, `templates.ts`, `mouDoc.ts`, `attribution.ts`, `monthRange.ts`, `pricing.ts`, `snapshot.ts`, `entityWriters.ts`, `generator.ts`, `piCounterAtomic.ts` (Step 8 V5 addition).

`tsc --noEmit` clean modulo 5 pre-existing strict-mode errors in `src/lib/finance/reverseAdjustment.test.ts` (Step 6 baseline, vitest passes them at runtime). `next lint --max-warnings 0` clean. `docs-lint` passes (em-dash zero; 9 pre-existing AI-slop warnings in older docs, separate cleanup).

---

## 3. Best-practice defaults locked across Gate 2

The full list for the testing email after Gate 5. Anish forwards this to Pranav, Shubhangi, Anita, and Misba so they know what the platform is enforcing without their noticing.

### MOU drafting (Step 5)

- **Programme enum unified** to four values: `STEAM | Young Pioneers | Harvard HBPE | Robotics`. The pre-Gate-2 enum had `TinkRworks` and `VEX` as programme values; both were retired and migrated. `TinkRworks` MOUs become `Robotics` with `programmeSubType: 'TinkRworks'`. `VEX` MOUs were never in production data; the VEX module is a separate sales programme tracked outside the MOU enum.
- **Drafts get programme-prefixed IDs** (`MOU-STEAM-2627-DRAFT-001`, `MOU-YP-...`, `MOU-HBPE-...`, `MOU-ROBO-...`). Sub-agent's first pass mis-prefixed Robotics drafts as `MOU-HBPE-...` (defaulting to HBPE on the else branch); fixed in Step 5 housekeeping.
- **Multi-year payment grids** are first-class on the drafting wizard (Step 5 pillar; `signedValues.years[]` per-year `unitPrice + studentsMou`).
- **Single-`<main>` rule** strict: page-level wrappers use `<section>` / `<div>`, never `<main>`. Root layout owns the only `<main id="main-content">`.

### Payment matching + PI generation (Step 6)

- **Per-entity PI counter** at `src/data/pi_counter_map.json` (sequential gap-free per `MH` / `UP` GSTIN). The legacy single-counter file `pi_counter.json` is kept untouched during the parallel-build window; cutover migrates Ops's PI generator to the per-entity map (MERGE_PLAN §9).
- **PI parallel-build lock** at `src/lib/pi/parallelBuildLock.ts` defaults fail-closed. Production unlock is `PI_PARALLEL_BUILD_LOCK=false` (env-flip at Vercel; no code change). Activates `/api/pi/generate` and `/api/operations/vex/pi/create` simultaneously at cutover.
- **Payment matcher mirrors gsl-mou-system's `ReconcileForm` semantics**: amount + date + narration + tolerance → ranked candidates → click Confirm. Pranav's muscle memory preserved exactly; CSV upload deliberately NOT shipped (brief asked for it, sub-agent stopped + flagged Q2 contradiction with "preserve muscle memory" rule; main CC chose single-amount entry).
- **Adjustment reversal idempotent**: clicking Reverse twice returns `?error=already-reversed` rather than double-reverting.
- **Tally export is XML only** (matches migrated `tally.ts` lib, matches Tally Prime 6.2 Voucher import). Filename `tally-export-{entity}-{fy}.xml`. Indian fiscal year boundary handled (April-March; Jan-Mar belongs to previous April fiscal cycle).
- **PI re-issue** voids the old number on `Payment.piNumber` + records the voided number in `Payment.auditLog`; no `voidedPiNumbers[]` array on Payment (Phase 1.1 if Finance asks).

### VEX module (Step 7-8)

- **VEX PI IDs are sequential per entity** (`VEXPI-{MH|UP}-{2627}-NNN`, gap-free), NOT counter-aligned. Snapshot evidence: the 5 imported VEX PIs have ids `001..004` while their piNumbers carry gaps `0008,0009,0010,0015`; the gap proves programme PIs filled `0011..0014` while VEX seq advanced.
- **VEX PI piNumber shares the per-entity counter** with programme PIs (`MTPL/{entity}/{fy}/NNNN`). The id is VEX-only sequential; the piNumber is shared per-entity sequential. Same `issuePiNumberAtomic(entity)` call site for both surfaces.
- **VEX dispatch lifecycle** is `Requested → Request Raised to Warehouse → Invoiced → Shipped`. Forward-only at the API; rewinds require Admin JSON edit (BACKLOG entry with 30-day usage trigger).
- **VEX dispatch role split** (Q5): `canRaiseDispatch` (Ops + Admin) drives Request-Raised + Shipped; `canEditFinanceData` (Finance + Admin) drives Invoiced. Tax invoicing is a Finance act.
- **VEX dispatch gate** at `src/lib/mouSystem/vexDispatchGate.ts` preserved verbatim from gsl-mou-system. Runs client-side (UX) + server-side (authority) on every dispatch create.
- **VEX 28-SKU master + 141-order tracker** paginated 25/page (mobile 375px friendly). 5 VEX PIs + 4 dispatches + 1 vendor agreement promoted from snapshot to top-level data (Step 8 Q1).

### Cross-cutting

- **Honest toast everywhere**: `"Saved. Will reflect everywhere within ~5 minutes."` (or domain variants: `"Status updated.…"`, `"Dispatch raised. Warehouse will be notified."`). The ~5-minute window matches the cron drain cadence at `.github/workflows/sync-queue-cron.yml`. Pranav and Shubhangi told this honestly so they don't refresh in vain.
- **British English + Indian money format** preserved across all new copy. No em-dashes (docs-lint enforces).
- **WCAG 2.1 AA** via axe-core CI; shrinking baseline.
- **All writes through the GitHub Contents API queue** at `src/lib/pendingUpdates.ts` + `src/lib/githubQueue.ts`.

---

## 4. Items genuinely needing Pranav/Misba/leadership input before Gate 5

Five decisions parked for the people running the workflow, not for engineering:

1. **VEX PI id format confirmation (Pranav).** Snapshot shows VEX-only sequential ids per entity (`VEXPI-UP-2627-001` despite piNumber `MTPL/UP/26-27/0008`). The Step 8 implementation matches the snapshot, but the snapshot alone cannot disambiguate "this is by design" from "this happens to be the first 5 PIs raised under each entity." Pranav: is the VEX id intended to be VEX-only sequential, or should it match the shared counter seq going forward? If the latter, the implementation is a 3-line revert.
2. **VEX dispatch rewind authority (Pranav / Anita).** Step 7 enforced forward-only dispatch transitions at the API. Misclick recovery is Admin JSON edit only. After 30 days of usage: if Ops reports needing rewinds (because tax-invoice was wrong, dispatch needs to drop back to "Request Raised to Warehouse"), we soften the gate. Pranav: is this restriction tolerable?
3. **Excess-payment UX (Pranav / Shubhangi).** gsl-mou-system raised an immediate "Recording excess as advance" warning when a payment exceeded the PI value. Step 7 deferred this to the drain reconciler (the honest-toast covers the gap). If the immediate warning was useful, Phase 1.1 re-adds. Pranav: was the immediate warning load-bearing?
4. **Single-amount matcher vs CSV upload (Shubhangi).** The Step 6 brief mentioned CSV upload but contradicted itself ("preserve muscle memory exactly"). Step 6 shipped single-amount entry mirroring gsl-mou-system's `ReconcileForm` and `PaymentLogForm`. CSV upload is feasible as a Phase 1.1 add if Shubhangi confirms it would speed up daily reconciliation; the matcher already exists, the CSV is a parsing front-end.
5. **Chain MOU SchoolGroup consolidation (Anish / Misba).** 12 chain-candidate schools (Narayana, Techno India, B.D. Memorial, etc.) flagged at `src/data/_snapshots/mou-system/_meta.json` `chainCandidates`. The 1:1 SchoolGroup default works for now. Before cutover, Anish + Misba review which are real chains (multiple branches under one MOU billed centrally) vs standalone, and consolidate the chains into proper SchoolGroups with central billing details.

---

## 5. Gate 5 cutover prerequisites

The full list of items that MUST be resolved before T-0; all tracked in `BACKLOG.md` with triggers naming the cutover deadline:

| # | Backlog entry | Why it blocks cutover |
|---|---|---|
| 1 | PI generator render-only split (Step 6 follow-up) | After `PI_PARALLEL_BUILD_LOCK=false`, downloading an existing PI from `/finance/pi/[paymentId]` would burn a fresh PI number on every Download click. |
| 2 | `.docx` Generate flow port (Step 5 follow-up) | Wizard's Generate button currently shows a parallel-build note; Pranav cannot draft new MOUs on Ops at cutover until this wires through to `mouSystem/templates.ts` + `mouSystem/mouDoc.ts`. |
| 3 | Chain MOU SchoolGroup reconciliation (Step 4 follow-up) | 1:1 default breaks central billing for chains. Each chain needs `memberSchoolIds` + `chain-billing fields` on SchoolGroup; child Schools' gstNumber stays null. |

Decisions parked for Pranav/Misba/leadership (§4 items 1, 2, 3, 4) are NOT cutover blockers per se; they are quality-of-implementation calls that can be made post-cutover if the parallel-build window is enough to test them, but they should land before T-0 to avoid cutover-day surprises.

Gates 3-5 will add their own cutover prereqs to this list as they ship. The bridge between `BACKLOG.md` and the formal cutover-day checklist is at `docs/MERGE_PLAN.md` §5.2.

---

## 6. Cutover sequence (locked at Step 8, refined from §5 of MERGE_PLAN)

**T-48h:** Anish notifies Pranav, Shubhangi, Anita that cutover lands in 48 hours. Tuesday-Wednesday-Thursday slot.

**T-24h:** Anish runs `scripts/cutover-snapshot.mjs`. Verifies snapshot diff. Promotes to `src/data/*.json` on a feature branch. Reviewed. Merged.

**T-1h:** Vercel main is green, all tests pass, no pending PRs.

**T-0 (cutover):**

1. Final read from `gsl-mou-system/src/data/*.json`. Diff against T-24h. Import the last-24h delta via `scripts/cutover-load.mjs` (audit `'cutover-import'`).
2. Lock PI counter: persist mou-system's `pi_counter.json` to Ops one final time. Ops becomes the only PI issuer.
3. **Flip `PI_PARALLEL_BUILD_LOCK=false` on Vercel.** Ops PI generation activates.
4. gsl-mou-system middleware → read-only banner mode (HTTP 410 Gone on writes; redirects to Ops routes).
5. Per-department onboarding banner from MERGE_PLAN §6 surfaces on first login.
6. Anish announces cutover (WhatsApp + email); first-login walkthrough with Pranav, Shubhangi, Anita within the hour.

**T+48h rollback contract:** if a catastrophic regression surfaces, the rollback is (a) re-enable mou-system writes; (b) flip `PI_PARALLEL_BUILD_LOCK=true`; (c) pause Ops logins (maintenance banner); (d) replay Ops-side captures into mou-system via one-off script. After T+48h Anish's sign-off closes the rollback path.

---

## 7. Gate 3 entry conditions

Anish reviews this report. If approved, Gate 3 starts (Status Tracker + Notifications + Audit + Workflow handoff per the ceremony plan). Gate 3 does not need any of the Gate 5 cutover prereqs above to begin; those activate at T-0 only.
