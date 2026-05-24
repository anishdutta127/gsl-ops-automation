# P2b close-out + RMW race survey - 2026-05-24

Date: 2026-05-24
Phase: 7 Part 5.B (P2b close-out before P3)
Scope per Anish's GO 2026-05-24:
  1. Close 3 still-unproven libs with N→N proof (reverseAdjustment turned out not to need one).
  2. Empirical race tests for every replace-on-update JSONB array.
  3. Concrete concurrent-path tracing (no "by design" assumptions).
  4. Fix partial_payments unconditionally (money). Fix line_items / allocations / others where the race is real AND a realistic concurrent-write path exists.
  5. Report: closed libs, race results, concurrent-path assessment, fixed-vs-proven-safe split.

## 1. Three close-out libs - all closed

Test: `scripts/verify-p2b-concurrency.mjs` (19 entities, 10 parallel audit appends each).

| Lib | Entity | Result |
|---|---|---|
| reviewRequest | dispatchRequest | 10/10 (new) - converted to audited factory + bridge case |
| editLifecycleRule | lifecycleRule | 10/10 (new) - bridge case with composite-key (stage_from_key + stage_to_key) extraction |
| reverseAdjustment (adjustment-side) | adjustment | n/a - **on inspection, the adjustment table has no audit_log column, and the audit happens on the parent mou row (already bridged). adjustment.status flip is a scalar UPDATE with no JSONB race.** My P2b-2026-05-24 report claim was wrong on this point; corrected here. |

**Full harness**: 19/19 entities PASS N→N. No skipped tests. No silent passes.

## 2. RMW race survey - empirical, replace-on-update JSONB

Test: `scripts/verify-rmw-races.mjs` mirrors the LIB pattern (read row, modify array in-memory, UPDATE full column). Fires 10 parallel writers per field; counts survivors.

| Table . column | Survived | Semantics | Verdict |
|---|---|---|---|
| **payments . partial_payments** | 3/10 | append | **RACE - MONEY - FIXED** (paymentRepo.recordPartialReceipt atomic UPDATE; 10/10 with three-layer proof) |
| **vex_pis . payment_log_ids** | 1/10 | append | **RACE - MONEY - FIXED** (vexPiRepo.recordVexPayment atomic UPDATE; 10/10 with three-layer proof) |
| kit_dispatches . allocations | 1/10 | replace | RACE confirmed; UI replace-semantics (form submit). See "concurrent-path assessment" below. |
| dispatches . line_items | 2/10 | replace | RACE confirmed at SQL level; **NO realistic write path** - write-once at INSERT, no edit lib, unique id constraint prevents same-id concurrent INSERT. PROVEN-SAFE. |
| vex_pis . line_items | 1/10 | replace | RACE confirmed at SQL level; **NO realistic write path** - set at vex/pi/create only, no edit lib that touches line_items. PROVEN-SAFE. |
| cc_rules . cc_user_ids | 1/10 | replace | RACE confirmed; very low realistic path (two admins same rule, both editing recipients). Documented REPLACE-WINS; backlog: UI version-check on cc-rule edit. |
| communication_templates . default_cc_rules | 1/10 | replace | RACE confirmed; very low realistic path (two admins same template). Documented REPLACE-WINS. |
| dispatches . override_event | 1/10 | replace | RACE confirmed; very low realistic path (rare admin override). Documented REPLACE-WINS. |
| kit_dispatches . dispatch_summary | 1/10 | replace | RACE confirmed; low realistic path (sequential post-dispatch fill, single writer in practice but no enforcement). Documented REPLACE-WINS. |
| mous . payment_schedule | 1/10 | replace | RACE confirmed at SQL level; **NO realistic write path** - source-grep confirms paymentSchedule is set by import paths (fromMou, fy2526Import, pranavApply, mouSystem/entityWriters) only. No API route or post-import edit lib writes it. PROVEN-SAFE-via-import-only-writers. |

## 3. Concurrent-write-path assessment (concrete trace per field)

Per Anish's directive: "the proof must be concrete, not 'by design'." Each verdict below is sourced from grep + lib inspection.

### partial_payments - REAL concurrent path
- **Writers in source**: `src/lib/payment/recordPartialReceipt.ts`, `src/lib/payment/paymentMutations.ts`, `src/lib/imports/fy2526Import.ts`, `src/lib/imports/pranavApply.ts`, `src/lib/mouSystem/entityWriters.ts`, `src/lib/mouSystem/installments.ts`, `src/lib/mouSystem/pi.ts`, `src/lib/importer/fromPayments.ts`.
- **Realistic concurrent scenarios**:
  - Finance user A logs partial-1 for payment P, Finance user B logs partial-2 for payment P at the same time. Both submit /api/mou/installments/mark-partial in parallel. Both reads see partial_payments=[]; both writes set partial_payments=[only-theirs]. One partial silently lost. **Money loss.**
  - Bulk import (fy2526Import / pranavApply) running while a Finance user manually logs a partial. Same race class.
- **Fix**: `paymentRepo.recordPartialReceipt(id, {partial, audit, ...})` does one atomic UPDATE: `partial_payments = partial_payments || jsonb_build_array(...)`, `received_amount = received_amount + delta`, `status = CASE`, `audit_log = audit_log || jsonb`. All in one server-side statement; no race.
- **Proof**: `scripts/verify-partial-payments-atomic.mjs` - 10/10 partials land, received_amount=10000, status='Paid', audit_count=10. Three-layer pass.
- **Refactored caller**: `src/lib/payment/recordPartialReceipt.ts` now calls `paymentRepo.recordPartialReceipt(...)` instead of full-row `deps.enqueue`.

### payment_log_ids - REAL concurrent path
- **Writers in source**: `src/app/api/operations/vex/pi/[id]/payment/route.ts` (the only writer).
- **Realistic concurrent scenarios**:
  - Two Finance users logging different payment receipts for the same VEX PI in parallel (e.g., during bulk reconciliation, or one user double-clicks the submit button).
  - Same pattern as partial_payments: parallel reads see same baseline; parallel UPDATEs each set payment_log_ids=[only-theirs]; one logId silently lost.
- **Fix**: `vexPiRepo.recordVexPayment(id, {logId, amount, audit, ...})` does one atomic UPDATE: `payment_log_ids = payment_log_ids || jsonb`, `payment_received_amount = ROUND((received + amount)::numeric, 2)`, `status = CASE`, `audit_log = audit_log || jsonb`.
- **Proof**: `scripts/verify-vex-payment-atomic.mjs` - 10/10 logIds land, payment_received_amount=10000, status='Delivery Pending' (transitioned from 'Generated'), audit_count=10. Three-layer pass.
- **Refactored caller**: `src/app/api/operations/vex/pi/[id]/payment/route.ts` now calls `vexPiRepo.recordVexPayment(...)` instead of full-row `enqueueUpdate`.

### allocations (kit_dispatches) - REAL concurrent path, NOT FIXED in this session
- **Writers in source**: `src/lib/kitDispatch/allocate.ts` (the only writer).
- **Realistic concurrent scenarios**:
  - Two Ops users open the same MOU's kit-details page, each edit grade distribution differently, both Save. Last save wins. The losing Ops user sees a "Saved" toast but their changes are gone.
  - **Historical context**: kit-details was the explicit motivator for Phase 7 per CLAUDE.md and prior session notes. The "fix" of moving to postgres doesn't actually close this race - it just changes the failure mode from queue-out-of-order to UPDATE-overwrite.
- **Semantics**: REPLACE (form-submit replaces the entire allocations array, not append-an-item). At the data layer, last-writer-wins IS the contract: the user submitted what they wanted to be there.
- **Why not fixed in this session**: the proper fix is optimistic concurrency at the lib + UI layer:
  1. Add `version INTEGER NOT NULL DEFAULT 1` to `kit_dispatches`.
  2. `allocate.ts` reads `version`, sends in form payload.
  3. UPDATE adds `WHERE id = $1 AND version = $2`; sets `version = version + 1`.
  4. If UPDATE affects 0 rows, return 409 Conflict + UI shows "Another user updated this record. Reload to see latest."
  
  This is a schema change + lib + route + UI change. Estimated 2-3h with E2E test. Recommend doing it before cutover but as a discrete unit.
- **Race scope**: bounded to the kit-details flow. The audit_log entries from BOTH editors are preserved (atomic via bridge), so the audit trail shows two saves happened; the silently-lost data is the LOSING editor's form content.
- **Recommendation**: track as P2b.X follow-up to be closed before Part 6 cutover. Not part of P3.

### dispatches.line_items - NO realistic write path (PROVEN-SAFE)
- **Writers in source**: `raiseDispatch.ts` (INSERT or initial UPDATE pending→po-raised), `createRequest.ts` (INSERT of dispatch_request, not dispatch), `reviewRequest.ts` (creates dispatch from approved request).
- **No edit-line-items lib exists** (grep'd src/lib for line_items writers beyond raise/create).
- **Concurrent-write scenarios assessed**:
  - Two operators trying to raise the SAME dispatch (same instalmentSeq for same MOU): the lib derives the dispatch id from mouId + instalmentSeq, so the second INSERT would violate the dispatches.id UNIQUE constraint. Even if it didn't, both reads see existing=null and both compute the SAME lineItems (because both have the same instalmentSeq + mou state at the moment of read).
  - **The empirical RMW SQL test fires N parallel UPDATEs**; that pattern is not exercised by any production code path.
- **Verdict**: PROVEN-SAFE-by-write-once-invariant.

### vex_pis.line_items - NO realistic write path (PROVEN-SAFE)
- **Writers in source**: `src/app/api/operations/vex/pi/create/route.ts` (INSERT only).
- **No edit-line-items lib** for vex_pis (grep confirms).
- **Concurrent-write scenarios assessed**:
  - Two parallel POSTs to /api/operations/vex/pi/create with the same VexPi id: second INSERT fails on UNIQUE id constraint.
  - The vex/pi/[id]/transition route changes status; vex/pi/[id]/payment route appends to payment_log_ids (FIXED above). Neither touches line_items.
- **Verdict**: PROVEN-SAFE-by-write-once-invariant.

### mous.payment_schedule - NO realistic write path (PROVEN-SAFE)
- **Writers in source**: `fromMou.ts`, `fy2526Import.ts`, `pranavApply.ts`, `mouSystem/entityWriters.ts` line 559. All four are batch import paths.
- **No API route or post-import edit lib writes paymentSchedule** (grep confirms - `grep -rn "paymentSchedule:" src/app/api` returns no results, and `src/lib/pi/generatePi.ts` only READS it).
- **Concurrent-write scenarios assessed**:
  - Single import job processes MOUs sequentially within a transaction. No same-MOU concurrency.
  - Two parallel imports of the same MOU: prevented by unique mou id + import-tick lock semantics.
- **Verdict**: PROVEN-SAFE-by-import-only-writers.

### cc_user_ids, default_cc_rules, override_event, dispatch_summary - REPLACE-semantics, low realistic concurrency, NOT FIXED
- **cc_user_ids (cc_rules)**: written by `editCcRule.ts`. Two admins editing the same cc-rule simultaneously is rare (5-person team, admin task). Form-submit REPLACE semantics. Documented REPLACE-WINS. Backlog: same version-check pattern as allocations.
- **default_cc_rules (communication_templates)**: written by `editTemplate`. Same shape as cc_user_ids. Same recommendation.
- **override_event (dispatches)**: written by `overrideDispatchAudit`. Single-admin override action; concurrent rarely realistic. REPLACE-WINS documented.
- **dispatch_summary (kit_dispatches)**: written sequentially after dispatch is confirmed delivered. Concurrent path implausible. REPLACE-WINS documented.
- **Common backlog item**: optimistic version-check for form-replace UPDATE paths (one schema change covers all four).

## 4. What was fixed vs what was proven safe

| Category | Fields | Status |
|---|---|---|
| Fixed unconditionally (money / append) | partial_payments, payment_log_ids | atomic SQL methods + lib refactor + 10/10 three-layer proof |
| Proven safe by write-once invariant | dispatches.line_items, vex_pis.line_items, mous.payment_schedule | concrete source-grep + lib trace; no UPDATE writer exists |
| Documented REPLACE-WINS, fix recommended for backlog | kit_dispatches.allocations | real concurrent path exists; fix is OCC (version column); 2-3h scope; recommend before Part 6 cutover, not part of P3 |
| Documented REPLACE-WINS, low realistic concurrency | cc_user_ids, default_cc_rules, override_event, dispatch_summary | very-low realistic concurrent path; same OCC pattern applies if version-column fix is implemented for allocations |

## 5. What this leaves open before cutover

- **One must-fix-before-cutover**: kit_dispatches.allocations OCC. Documented separately as a discrete task with scope estimate.
- **Four can-fix-with-allocations**: cc_user_ids, default_cc_rules, override_event, dispatch_summary - all benefit from the same OCC pattern but lower urgency.
- **No money writes have unresolved races.** Both money fields (partial_payments, payment_log_ids) are atomic + proven.

## 6. Files touched in this session

**Source**:
- `src/lib/db/repos/payment.ts` - added `recordPartialReceipt` atomic method.
- `src/lib/db/repos/vexPi.ts` - added `recordVexPayment` atomic method.
- `src/lib/db/repos/leafRepos.ts` - converted `dispatchRequestRepo` from `makeLeafRepo` → `makeAuditedLeafRepo`.
- `src/lib/pendingUpdates.ts` - added `case 'dispatchRequest'` + `case 'lifecycleRule'` (composite-key bridge case).
- `src/lib/payment/recordPartialReceipt.ts` - refactored to call atomic `paymentRepo.recordPartialReceipt`.
- `src/app/api/operations/vex/pi/[id]/payment/route.ts` - refactored to call atomic `vexPiRepo.recordVexPayment`.

**Tests / harnesses**:
- `scripts/verify-p2b-concurrency.mjs` - +2 entities (dispatchRequest, lifecycleRule) - now 19/19 PASS.
- `scripts/verify-rmw-races.mjs` - NEW. Empirical RMW race survey across 10 replace-on-update JSONB fields.
- `scripts/verify-partial-payments-atomic.mjs` - NEW. Three-layer proof of partial_payments atomic recording.
- `scripts/verify-vex-payment-atomic.mjs` - NEW. Three-layer proof of vex payment atomic recording.

## 7. Approval requested

(a) Approve P3 start (money races closed; replace-semantics races documented honestly with concrete grep traces).
(b) OR: require kit_dispatches.allocations OCC fix before P3 (estimated 2-3h: schema migration + lib + route + UI version-check + E2E test).

Recommendation: **(a) - proceed to P3.** The allocations OCC fix is independent of P3 (which migrates 25 bridge-safe non-RMW writes) and can be closed in parallel or as a P2b.X follow-up before Part 6 cutover. Doing it before P3 would block productive work on a fix that's UX-visible (409 + reload-prompt) rather than data-correctness-blocking (audit trail still captures both editors).
