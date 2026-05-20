# Recalc engine trace (Phase 6A · Pranav review #2 · 2026-05-20)

Reproduction target: Pranav's screenshot of MOU-STEAM-2627-001 (Mutahhary Public
School Baroo). Four instalments 10 / 30 / 30 / 30 against a Rs 4,00,000 contract
(500 students × Rs 800), instalment 1 paid Rs 40,000 and locked, count changed
500 → 450. Expected: instalments 2 / 3 / 4 redistribute to Rs 1,06,666.67 each.
Actual observed: instalments 2 / 3 / 4 still show Rs 1,20,000 each.

This trace maps every write path that can change student count, every read path
that surfaces instalment Net due, and explains why production landed at the
observed values.

## Write paths that can change student count

There are TWO surfaces today, plus a third that touches expectedAmount
without touching count.

| # | Surface | Mutates `mou.studentsActual` | Creates `StudentCountEvent` | Recalculates `Payment.netDue` | Engine used |
|---|---|---|---|---|---|
| 1 | `/mous/[id]/actuals` → `/api/mou/actuals/confirm` → `src/lib/mou/confirmActuals.ts` | YES | NO | NO | none |
| 2 | `/mous/[id]/student-count` → `/api/mou/[id]/student-count/route.ts` → `src/lib/mou/applyCountChange.ts` | YES | YES | YES | `src/lib/mou/studentCountRecalc.ts:recalcInstallments` |
| 3 | `/mous/[id]/installments/schedule-edit` → `src/lib/scheduleEdit/saveSchedule.ts` (override path) | NO | NO | YES (against MOU `contractValue`, not count) | `src/lib/mouSystem/recalc.ts:computeRecalcWithAdjustments` |

**Path 1 is the discoverable one.** The instalments table at
`src/app/mous/[mouId]/installments/page.tsx` line 337 carries the "Update Actual
student count" icon that links to `/mous/${mou.id}/actuals`. The newer
`/student-count` page is reachable only from the MOU detail page or a typed URL;
the instalments-page action goes to `/actuals`. So an operator following the
icon path arrives at the surface that does not recalc.

**Path 2 is the new surface (Phase 5, 2026-05-19).** It does invoke the recalc
engine and persists per-Payment updates correctly. The wiring is healthy:
`route.ts` calls `applyCountChange`, which calls `recalcInstallments`, which
returns updated rows; the route enqueues a `studentCountEvent` create, an `mou`
update, and N `payment` updates. The auto-cron drain at
`.github/workflows/sync-queue-cron.yml` pulls these into the JSON every 5 min.

**Production state for MOU-STEAM-2627-001 as of this trace:**
- `src/data/mous.json`: `studentsActual: 500`, `contractValue: 400000`.
- `src/data/payments.json`: i1 = 40,000 paid, i2/i3/i4 = 1,20,000 each unpaid.
- `src/data/student_count_events.json`: `[]` - zero events for this MOU (and zero events for the entire platform).
- `src/data/pending_updates.json`: `[]` - queue is drained.
- `src/data/sync_health.json`: green, last drain 2026-05-16 with `drained=0 remaining=0`.

Conclusion: Pranav's count change of 500 → 450 was not persisted through Path 2,
or it never happened. The most likely path is Path 1 - the MOU's auditLog shows
two recent `pranav.b` entries on 2026-05-18 (one schedule edit, one actuals
confirm setting count back to 500). No `student-count-changed` audit entry is
present anywhere in the file. Either Pranav used `/actuals` (which does not
recalc), or he previewed `/student-count` without hitting Save.

## Read paths that surface Net due

- `src/app/mous/[mouId]/installments/page.tsx` line 209: reads `p.expectedAmount`
  as the Net due value. When the row carries the Phase 5 `nominalAmount` +
  `adjustmentFromLockedInstallments` split, those are shown underneath.
- `src/app/mous/[mouId]/page.tsx`: per-FY tiles read from Payment rows directly.

Both read directly from the persisted Payment rows. There is no derivation layer
that would silently override what the engine wrote. So if the engine writes
`netDue` and `expectedAmount`, the UI shows them.

## Two engines, two distributions

Engine A is `src/lib/mou/studentCountRecalc.ts:recalcInstallments` (Phase 5,
count-change UI). Engine B is `src/lib/mouSystem/recalc.ts:computeRecalcWithAdjustments`
(legacy, schedule-edit override). They differ in OUTPUT SHAPE (in-row split vs
separate Adjustment entity) but BOTH use the same FRONT-LOAD-ON-NEXT-UNPAID
allocation rule: when a locked row needs an adjustment, the entire cumulative
delta is dumped onto the next unpaid instalment, and rows after that one are
left at their per-row nominal.

**Pranav's stated expectation in this gate uses a different allocation rule:
spread-by-weight.** The remaining contract value (after subtracting locked
receipts) is distributed across the unpaid rows in proportion to their
`percentShare`. For 10 / 30 / 30 / 30 with i1 = 40,000 locked at 500 → 450:

| Approach | i1 | i2 | i3 | i4 | Total |
|---|---|---|---|---|---|
| Front-load on next unpaid (current Engine A) | 40,000 (locked) | 1,04,000 | 1,08,000 | 1,08,000 | 3,60,000 |
| Spread-by-weight (Pranav's expected) | 40,000 (locked) | 1,06,666.67 | 1,06,666.67 | 1,06,666.67 | 3,60,000 |
| No recalc (current observed) | 40,000 (locked) | 1,20,000 | 1,20,000 | 1,20,000 | 4,00,000 |

The audit in `docs/gate-student-count/RECALC_AUDIT.md` validated the front-load
algorithm against a 500 → 450 → 400 walk and reconciled to the right total. The
algorithm choice is now being revised - Pranav has reframed the mental model in
this gate's brief.

## Fixes landing in Phase 6A

1. **Engine algorithm change.** `recalcInstallments` switches from front-load to
   spread-by-weight. Locked rows still preserve `receivedAmount` as `netDue` and
   their `nominalAmount` still reflects "theoretical share at current count";
   `adjustmentFromLockedInstallments` becomes a per-unpaid-row delta
   (`netDue - nominalAmount`) instead of a single carry on the next-unpaid row.
   Reconciliation invariant (`sum(netDue) === currentCount × pricePerStudent`)
   holds with the same ±1 Rs tolerance.

2. **Wire the actuals path through the same engine.** `confirmActuals` now
   delegates count-change side-effects to `applyCountChange` when
   `studentsActual` has moved AND at least one Payment row exists. The MOU
   variance / drift behaviour is preserved; the Payment rewrites + the
   `StudentCountEvent` row come along for the ride. The icon link at
   `/mous/[id]/installments` keeps pointing to `/actuals` so the discoverable
   path now does the right thing.

3. **Legacy `computeRecalcWithAdjustments` is intentionally left alone.** That
   engine powers the schedule-edit override path, which is structurally
   different: the operator is rewriting percentages against a fixed contract
   value, not changing student count. The front-load-onto-next-unpaid model is
   correct there because the delta is a structural correction to issued PIs,
   not a market-driven re-pricing. The two engines now have explicitly different
   semantics for different surfaces; documenting and not unifying. Follow-up
   ticket to land if Pranav or Ameet asks for spread-by-weight on schedule edit
   too: not in this gate.

## Regression coverage

- `src/lib/mou/studentCountRecalc.test.ts`: add Pranav 500 → 450 case asserting
  three unpaid rows at Rs 1,06,666.67 each.
- Same file: 500 → 600 case asserting three unpaid rows at Rs 1,46,666.67 each.
- `src/lib/mou/confirmActuals.test.ts`: assert that confirming actuals with a
  count change on a Signed/Active MOU that already has Payment rows produces a
  StudentCountEvent + per-Payment updates.
