# Pass 2 (VEX PI edit + void/cancel) - V4 verification

_2026-06-27. Shipped main b4f0482; migration 021 applied to prod._

## What shipped

The VEX PI is no longer frozen: a wrong PI can be corrected, and a PI raised in
error can be voided in-app (with a cascade) instead of fixed by a DB script.

- `editVexPi` + `/operations/vex/pi/[id]/edit`: edit line items / qty / price /
  school / GST / billing / freight; totals re-derived server-side; a qty cannot
  drop below already-dispatched.
- `voidVexPi` + void danger zone on `/operations/vex/pi/[id]`, with the cascade:
  BLOCK if any dispatch is committed (Shipped/Invoiced/Delivered); otherwise
  cascade-void pre-ship dispatches + the PI's payment_logs, zero the balance,
  clear the ids, tombstone the PI.
- Migration 021: `vex_pis` + `vex_dispatches` += `voided_at/voided_by/void_reason`
  (additive, nullable, reversible). Both status columns are free-text (no CHECK).
  Hard-delete stays blocked (the dispatch pi_id FK is ON DELETE RESTRICT).
- Exclusions: voided PIs/dispatches dropped from the VEX list, the finance
  dashboard, and the over-count scan; dispatch-raise / transition / payment
  routes 409 on a voided PI; the detail page shows a VOIDED banner, actions off.
- Permission: edit + void = canEditFinanceData (Finance + Admin), reason + audit.

## Gates

- `tsc --noEmit` 0 · `next lint` 0 · `next build` exit 0 · vitest 3405 pass / 82 skip
  (+9 new unit tests: cascade, block-on-committed, re-derive, guards).
- Migration 021 applied to prod (ep-shiny-waterfall); all 6 columns verified.
- CI (Node 20) runs tsc + lint + the full suite on the pushed commit.

## V4: self-cleaning prod walk (no real data touched)

`scripts/_v4-pass2-vexpi.mts` (untracked) exercised the REAL `voidVexPi` /
`editVexPi` against the REAL prod schema (migration 021), on sentinel
PIs/dispatches/logs it created and DELETED. Result:

```
=== voidVexPi(A): pre-ship dispatch + 2 logs ===
  [PASS] void returned ok  ({"d":1,"l":2})
  [PASS] PI A tombstoned (voided_at set)
  [PASS] PI A balance zeroed
  [PASS] PI A payment_log_ids cleared
  [PASS] dispatch A cascade-voided
  [PASS] both payment_logs cascade-voided (2)
=== voidVexPi(B): has a Shipped dispatch -> must BLOCK ===
  [PASS] void blocked (has-committed-dispatch)
  [PASS] PI B NOT voided
  [PASS] dispatch B NOT voided
=== editVexPi(C): 10x100 -> 5x200 + freight 50 ===
  [PASS] edit returned ok
  [PASS] subtotal 1000 / taxable 1050 / gst 189 / total 1239
ALL CHECKS PASS (14/14)
sentinels cleaned up.
```

Post-run confirm: 0 leftover sentinels; vex_pis=30, vex_dispatches=15,
payment_logs=32 (all restored); 0 voided rows (no real voids yet). Prod
unaffected.

This proves the migration columns + the real void-cascade and edit-re-derive
work end-to-end against prod, including the committed-dispatch block (no
orphaned shipment) and the cascade tombstoning of dispatches + payment_logs with
the balance zeroed. UI is covered by the build; the lib by the 9 unit tests.

## Residual

- A live Playwright UI walk of the actual edit/void buttons on the deployed app
  is the one thing not done (needs VERIFY_PASSWORD); the DB walk + unit tests +
  build cover the logic, routes, and schema.
