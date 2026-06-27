# Pass 1 (finance corrections) - V4 verification

_2026-06-27. Edit/void-reverse for PaymentLog + VEX payments. Shipped main 18f8a1a; migration 020 applied to prod._

## What shipped

A mis-logged, duplicate, or wrong-amount money row is now corrected with a
permissioned, audited, in-app action instead of a developer recovery script.

- VEX payment edit/void on `/operations/vex/pi/[id]` ("Recorded payments").
- Parked PaymentLog edit/void on `/finance/payments/log/[id]` (linked from the
  unmatched list).
- `unmatchPayment` resets the source log (the St Paul's flow enabler).
- Soft-delete tombstone only (migration 020 `voided_at/voided_by/void_reason`);
  never hard-delete. Voided logs excluded from balances, dedup, and queues.
- Permission: edit + void = `canEditFinanceData` (Finance + Admin), reason + audit.

## Gates

- `tsc --noEmit` 0 · `next lint` 0 · `next build` exit 0 · vitest 3396 pass / 82 skip
  (+20 new unit tests on reconciliation correctness and every guard).
- Migration 020 applied to prod (ep-shiny-waterfall) backup-free (additive,
  nullable, reversible via 020-...down.sql); all 3 columns verified present.
- CI (Node 20) runs tsc + lint + the full suite on the pushed commit.

## V4: self-cleaning prod walk (no real data touched)

`scripts/_v4-pass1-void.mts` (untracked) exercised the REAL mutation lib
(`voidVexPayment` / `editVexPayment`) against the REAL prod schema, including the
new `voided_at` column, on sentinel rows it created and then DELETED. Result:

```
=== voidVexPayment(B) ===  (sentinel PI received 2000 = 2x, two 1000 logs)
  [PASS] void returned ok
  [PASS] PI balance 2000 -> 1000
  [PASS] log B dropped from PI ids -> ["PL-ZZ-V4A"]
  [PASS] status recomputed (1000>=1000 -> Delivery Pending)
  [PASS] log B tombstoned (voided_at set, NOT deleted)
  [PASS] log A untouched + still present
=== editVexPayment(A): 1000 -> 600 ===
  [PASS] edit returned ok
  [PASS] log A amount 1000 -> 600
  [PASS] PI balance 1000 -> 600
  [PASS] status recomputed (600<1000 -> Payment Pending)
ALL CHECKS PASS (10/10)
sentinels cleaned up.
```

Post-run confirm: 0 leftover sentinels; payment_logs back to 32; 0 voided logs
(no real voids yet). Prod unaffected.

This proves the migration column + the real void/edit reconciliation work
end-to-end against prod. The full UI button walk was deferred (it needs
VERIFY_PASSWORD); the route + UI are covered by the build and the lib by the 20
unit tests. The St Paul's matched-log flow (unmatch the instalment, then void
the parked log) is covered by the unmatch-resets-source-log unit tests.

## Residual / follow-ups

- A live Playwright UI walk of the actual buttons on the deployed app is the one
  thing not yet done (needs VERIFY_PASSWORD). Offered; owner chose the DB walk.
- The `editPayment` bank/TDS-split desync (an adjacent Payment-edit consistency
  bug the audit flagged) is intentionally deferred to Pass 7 (consistency).
