# Student count + recalc audit

**Gate:** Phase 5 (2026-05-19) - variable student count + PI recalculation + invoice summary table.
**Trigger:** Pranav review items #4 + #5.

## Schema today

### MOU

```
studentsMou: number               // committed at signing
studentsActual: number | null     // operator-confirmed actual; can be null
studentsVariance: number | null
studentsVariancePct: number | null
spWithoutTax: number              // Rs per student, pre-tax
spWithTax: number                 // Rs per student, GST-inclusive
contractValue: number             // Rs total
paymentSchedule: string           // '25-25-25-25 quarterly'
```

Sample real row (`MOU-STEAM-2526-002`): `studentsMou=540, studentsActual=531, spWithTax=3186, contractValue=1,691,766`.

### Payment (instalment)

```
expectedAmount: number            // current "what we expect" amount
receivedAmount: number | null     // bank + TDS total once recorded
bankAmount?, tdsAmount?           // Phase 4 split
status: 'Pending' | 'PI Sent' | ...
piNumber, piSentDate              // populated once PI issued
```

No per-instalment `percentShare`, `nominalAmount`, `netDue`, or `adjustmentFromLockedInstallments` today.

## Existing recalc paths

### `src/lib/mouSystem/recalc.ts`

Two functions live here today:

1. `recalculatePaymentSchedule(input)` - pure read-only "what would the schedule be if every paid amount got re-allocated at the current count". Used by the MOU detail "Recalc preview" card; not a write path.

2. `computeRecalcWithAdjustments({ perStudentPrice, newStudents, installments, reason })` - the existing write path. Returns `{ updates, adjustments }`:
   - **updates**: installments that are not yet locked (no payment, no PI sent) get `expectedAmount` rewritten in place.
   - **adjustments**: locked installments preserve their `expectedAmount`; a separate `Adjustment` entity row carries the delta to the next unlocked installment.

This is essentially the algorithm Pranav described. The difference vs the brief is the data shape: existing impl keeps adjustments in a separate `Adjustment` entity; the brief asks for adjustment fields on the Payment row itself.

### Callers

- `src/lib/scheduleEdit/saveSchedule.ts` calls `computeRecalcWithAdjustments` when an operator hits "Edit schedule" with new percentages.
- `src/lib/adjustments/createAdjustment.ts` writes Adjustment rows by hand for non-count corrections.
- MOU detail "Recalc preview" card calls `recalculatePaymentSchedule` (read-only display).

There is **no UI today for updating the student count itself**. Operators today change `mou.studentsActual` via `/mous/[id]/actuals` (a single number input + audit on the MOU), and the schedule editor handles the recalc downstream when they manually re-save the schedule.

## Decisions (built to per the brief)

1. **Add the brief's new fields directly to `Payment`**:
   - `nominalAmount?: number` - `percentShare × currentCount × pricePerStudent` at last recalc.
   - `adjustmentFromLockedInstallments?: number` - cumulative carry; non-zero only on the first unpaid row.
   - `netDue?: number` - operational total this installment owes now.
   - `percentShare?: number` - 0-100; derived from `expectedAmount / contractValue` if not set.
   - `lockedAt?: string | null` - ISO when the row first received a payment.
   - All optional; existing rows keep `expectedAmount` as the operational field.

2. **Add the brief's new `StudentCountEvent` entity** at `src/data/student_count_events.json`. Each event records `{ newCount, previousCount, effectiveDate, reason, recalcImpact: { ... } }` so the audit trail is queryable.

3. **Add to MOU**:
   - `studentCountEventIds?: string[]` - history pointers (newest last).
   - `currentStudentCount` is computed from the most recent event, falling back to `studentsActual ?? studentsMou`. No new MOU field needed; derive in a helper.

4. **New library `src/lib/mou/studentCountRecalc.ts`** implementing the brief's algorithm. It does NOT replace `computeRecalcWithAdjustments`; the existing schedule-edit path keeps its Adjustment-entity model. The new lib writes the in-row split that the Phase 5 UI surfaces. Both engines are pure functions over the same Payment list; the schedule-edit path is the legacy code path and the count-change UI is the new path.

5. **`netDue` is operational; `expectedAmount` mirrors it**. For unpaid rows on a recalc, both fields update together. For locked rows, `expectedAmount` stays at `receivedAmount` (the immutable paid value) and `netDue` likewise; `nominalAmount` is the theoretical value at current count (used for the carry calculation).

6. **PI template `INSTALMENT_SUMMARY` placeholder**: the placeholder bag in `src/lib/pi/generatePi.ts` gains a new `INSTALMENT_SUMMARY` array. The `public/ops-templates/pi-template.docx` binary needs a one-time manual edit (in Word) to add the loop `{#INSTALMENT_SUMMARY}...{/INSTALMENT_SUMMARY}` rendering the table. The documentation lands at `docs/gate-student-count/PI_TEMPLATE_INSTALMENT_SUMMARY.md` so the operator step is captured.

## Algorithm verification (Pranav's worked examples)

### Decreasing (500 -> 450 -> 400)

| Step | PI 1 | PI 2 | PI 3 | PI 4 | Cumulative delta | Total |
|---|---|---|---|---|---|---|
| MOU sign 500 | 1,25,000 | 1,25,000 | 1,25,000 | 1,25,000 | 0 | 5,00,000 |
| 500 -> 450 (no payment yet) | 1,12,500 | 1,12,500 | 1,12,500 | 1,12,500 | 0 | 4,50,000 |
| PI 1 paid Rs 1,12,500 | LOCKED 1,12,500 | 1,12,500 | 1,12,500 | 1,12,500 | 0 | 4,50,000 |
| 450 -> 400 | LOCKED 1,12,500 | 87,500 (net) | 1,00,000 | 1,00,000 | -12,500 | 4,00,000 |

`cumulativeDelta = (nominalAtNewCountForLocked - receivedAmountForLocked)` summed = `(0.25*400*1000 - 1,12,500) = (1,00,000 - 1,12,500) = -12,500`.
PI 2 (first unpaid): `netDue = nominal + cumulativeDelta = 1,00,000 + (-12,500) = 87,500`. PI 3 / 4: `netDue = nominal = 1,00,000`.
Final total `1,12,500 + 87,500 + 1,00,000 + 1,00,000 = 4,00,000 = 400 * 1000`.

### Increasing (500 -> 600 after PI 1 paid)

| Step | PI 1 | PI 2 | PI 3 | PI 4 | Cumulative delta | Total |
|---|---|---|---|---|---|---|
| MOU sign 500 | 1,25,000 | 1,25,000 | 1,25,000 | 1,25,000 | 0 | 5,00,000 |
| PI 1 paid Rs 1,25,000 | LOCKED 1,25,000 | 1,25,000 | 1,25,000 | 1,25,000 | 0 | 5,00,000 |
| 500 -> 600 | LOCKED 1,25,000 | 1,75,000 (net) | 1,50,000 | 1,50,000 | +25,000 | 6,00,000 |

`cumulativeDelta = (0.25*600*1000 - 1,25,000) = (1,50,000 - 1,25,000) = +25,000`.
PI 2: `1,50,000 + 25,000 = 1,75,000`. Final total `6,00,000 = 600 * 1000`.

Both examples reconcile exactly. The algorithm is what `computeRecalcWithAdjustments` already implements; the new Phase 5 engine produces the same numbers in a different data shape.

## Migration plan

**Lazy / opt-in.** Existing 396 Payment rows do not gain `nominalAmount` or the other new fields during deploy. The first time a recalc runs (operator updates the student count via the new UI), the affected MOU's Payments gain the new fields. Pre-Phase-5 rows continue to render via `expectedAmount`.

`currentStudentCount` derivation:
- Existing MOUs without any `StudentCountEvent` derive `currentStudentCount` from `studentsActual ?? studentsMou`. No backfill.
- The count-change UI seeds an initial `StudentCountEvent` for the MOU the first time it is used, recording the pre-Phase-5 baseline so the audit trail is complete from that point forward.

This avoids touching 144 schedules + 396 Payment rows during deploy and keeps Pranav free to opt MOUs into Phase 5 reconciliation school-by-school.

## Out of scope (BACKLOG)

| Item | Why deferred |
|---|---|
| Per-student price adjustments mid-MOU | Rare; new entity if needed. |
| Bulk count update via CSV at FY end | Useful but new surface; Phase 6+. |
| Automated count alerts when discrepancy > X% | New notification kind; not in this gate. |
| MOU renewal carrying forward final count | Needs renewal entity work; orthogonal. |

## In-scope file changes

1. `src/lib/types.ts` - new `StudentCountEvent` interface + 6 new fields on `Payment` + audit action `'student-count-changed'`.
2. `src/data/student_count_events.json` - new fixture file (empty array seed).
3. `src/lib/mou/studentCountRecalc.ts` (new) + `.test.ts` - the algorithm.
4. `src/lib/mou/applyCountChange.ts` (new) + `.test.ts` - the write path: creates the event + recalcs + enqueues Payment updates.
5. `src/app/mous/[mouId]/student-count/page.tsx` + `Form.tsx` (new) - the count change UI surface.
6. `src/app/api/mou/[mouId]/student-count/route.ts` (new) - POST target.
7. `src/app/mous/[mouId]/page.tsx` - student count history section + Update count CTA.
8. `src/app/mous/[mouId]/installments/page.tsx` - Nominal / Adjustment / Net due columns.
9. `src/lib/pi/generatePi.ts` - `INSTALMENT_SUMMARY` placeholder added to the bag.
10. `src/lib/criticalChanges.ts` - include `student-count-changed` in critical surface.
11. `docs/gate-student-count/PI_TEMPLATE_INSTALMENT_SUMMARY.md` - operator note for the .docx edit.
