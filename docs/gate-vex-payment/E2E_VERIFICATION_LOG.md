# gate-vex-payment: VEX PI payment-log "UNDEFINED_VALUE" fix

_Date: 2026-06-24._

## Symptom
Logging a payment on a VEX PI (bank 632931, TDS 0, Bank Transfer, ref NA) failed
with "UNDEFINED_VALUE: Undefined values are not allowed" - the W2/Phase-0 fail-loud
guard rejecting the write.

## Root cause (traced end to end; NOT the programme-widening)
- `/api/operations/vex/pi/[id]/payment` builds a `paymentLogRecord` with
  `{ scope:'vex', vexPiId, bankAmount, tdsAmount, total, mode, reference, ... }`
  and enqueues a `paymentLog` create.
- `paymentLogRepo.create` (leafRepos.ts:457) binds `${p.amount}` **raw** (every
  other field uses `?? null` / `!!` / `?? []`). The VEX payload has **`total`, not
  `amount`** -> `p.amount` is `undefined` -> postgres.js throws `UNDEFINED_VALUE`.
- It is a long-standing VEX-payload <-> PaymentLog/payment_logs **shape mismatch**
  (the table has no scope/vexPiId/bankAmount/tdsAmount/total columns). **Not**
  caused by the programme-widening (payment_logs has no programme column).
- Why it surfaced now: pre-W2, `enqueueUpdate`'s postgres catch silently fell back
  to the (disabled) dead-letter queue, so **VEX payment_logs never persisted to
  postgres at all**. W2 (fail-loud re-throw) turned the silent loss into a visible
  500. VEX-PI-specific: the MOU-side payment-log writes (`confirmMatch`,
  `finance/payment/log`) correctly set `amount`.

## Fix
Reshape the VEX `paymentLogRecord` to match `PaymentLog` / the payment_logs table:
`amount = total`; bank/TDS split + PI ref captured in `narration` (no dedicated
columns); `matchedInstallmentIds = []`, `unmatched = false` (a VEX receipt is tied
to its PI, not awaiting instalment reconciliation). The VexPi<->log link stays via
`VexPi.paymentLogIds`. Route unit test updated; build + tests green.

## Prod data corruption found (caused by the bug + the user's retries)
The route runs `vexPiRepo.recordVexPayment` (increments the VexPi balance + appends
a logId) BEFORE the enqueue that was throwing. So **each failed retry incremented
the balance and left a dangling logId** while no payment_log persisted:
- **VEXPI-UP-26-27-020**: total **Rs 632,931**, `received` = **Rs 31,64,655**
  (exactly 5x - five failed retries), **5 dangling logIds**, **0** payment_logs.
  Status wrongly "Delivery Pending". **Needs a gated reconciliation** (below).
- Every other VEX PI also has dangling logIds + 0 payment_logs (the bug dropped
  EVERY VEX payment_log historically), but their balances are ~correct (each logged
  once, so `recordVexPayment` ran once). A broader payment_log backfill is optional.

## Proposed gated reconciliation for VEXPI-UP-26-27-020 (NOT applied; awaiting go)
Backup vex_pis row + payment_logs first. Then, in one transaction:
- set `payment_received_amount` = 632,931 (the single real payment),
- replace `payment_log_ids` with one clean id, delete the 5 dangling ids,
- create ONE payment_log (amount 632,931, narration "VEX PI UP-26-27-020 recovered"),
- recompute status.
Reversible via the backup. Dry-run to be shown before applying.

## Verification (V4, live prod) - all PASS
Controlled test on the tiniest VEX PI (VEXPI-UP-2627-004, total Rs 4.72), with
full restore afterwards:
- Logged a Rs 4 payment via the live route -> **route returns ok (no
  UNDEFINED_VALUE)**; the deploy + fix are live.
- **A payment_log row PERSISTED in postgres** (amount = 4, narration carries the
  PI id, unmatched = false) - the exact write that previously threw.
- VexPi balance advanced by 4; **status advanced** Payment Pending -> Delivery
  Pending (recordVexPayment + status recompute work end to end).
- Restored: test payment_log deleted, VexPi reverted to received Rs 1.00 / Payment
  Pending. No residue.

**MOU-side payment path:** unchanged by this fix and already correct - both MOU
payment-log writers set `amount` explicitly (`confirmMatch.ts:178`,
`finance/payment/log/route.ts:166`). Only the VEX route used `total`. So the
MOU-side log path is unaffected (confirmed by code + unchanged).

## Status
Code fix DEPLOYED + live-verified (commit 50b4f54). Future VEX payments now log
correctly. The VEXPI-UP-26-27-020 5x over-count reconciliation is the remaining
item - GATED (backup -> dry-run -> approval), not applied.
