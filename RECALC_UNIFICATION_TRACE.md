# Recalc engine unification trace (Phase 6D Part 4)

Two engines were doing student-count vs schedule-edit recalc with different finance semantics:

| Engine | Surfaces | Algorithm | Carry handling |
|---|---|---|---|
| `src/lib/mou/studentCountRecalc.ts:recalcInstallments` | `/mous/[mouId]/student-count`, `applyCountChange.ts` | SPREAD-BY-WEIGHT (Phase 6A) | Locked rows keep `receivedAmount` as `netDue`; remaining contract spread across UNPAID rows in proportion to `percentShare`; per-row `adjustmentFromLockedInstallments` is metadata, not a separate Adjustment entity |
| `src/lib/mouSystem/recalc.ts:computeRecalcWithAdjustments` | `scheduleEdit/saveSchedule.ts` (override mode) | FRONT-LOAD-AS-ADJUSTMENT-ENTITY | Locked rows keep `expectedAmount`; the delta becomes a NEW Adjustment entity attached to the next unlocked row; UNPAID rows past that one are NOT re-priced |

Pranav's stated expectation ("adjustments will be made in the next PIs") matches **spread-by-weight**, not front-load. The front-load behaviour predates Phase 6A and was kept on the schedule-edit path purely because that flow was not in scope at the time. Phase 6D Part 4 retires `computeRecalcWithAdjustments` and routes `saveSchedule.overrideLockedSchedule` through the unified `recalcInstallments`.

## Caller-by-caller migration

| Caller | Pre-6D engine | Post-6D engine |
|---|---|---|
| `src/app/mous/[mouId]/student-count/page.tsx` | `recalcInstallments` | unchanged |
| `src/lib/mou/applyCountChange.ts` | `recalcInstallments` | unchanged |
| `src/components/mou-system/RecalcSummary.tsx` | `recalculatePaymentSchedule` (preview-only) | unchanged (this is a display-only helper; the persistence path goes through `recalcInstallments` either way) |
| `src/lib/scheduleEdit/saveSchedule.ts` | `computeRecalcWithAdjustments` | `recalcInstallments` with `contractValueOverride = mou.contractValue` and `percentShare = row.pctDue`. No Adjustment entities are created in this path anymore; the locked-row delta is absorbed by unpaid-row spread per Pranav's stated semantics. |
| `src/lib/mouSystem/recalc.test.ts` | covered `recalculatePaymentSchedule` + `computeRecalcWithAdjustments` | tests for `computeRecalcWithAdjustments` removed; `recalculatePaymentSchedule` tests stay (preview helper is still used) |
| `src/lib/scheduleEdit/saveSchedule.test.ts` | asserted adjustmentsCount=1 + Adjustment entity payload | asserts adjustmentsCount=0 + per-row netDue values match the spread-by-weight redistribution (-25,000 carry from p1 absorbed by p2/p3/p4 at their 25% share each, so each takes ~8,333.33 less than the nominal 1,00,000) |

## Engine API change

`recalcInstallments` now accepts an optional `newContractValue` override:

```ts
export interface RecalcInput {
  pricePerStudent: number
  currentCount: number
  installments: Payment[]
  /**
   * Phase 6D Part 4 - schedule-edit override hook. When set, the engine
   * uses this value as the new contract total instead of deriving it as
   * currentCount * pricePerStudent. Used by saveSchedule.overrideLockedSchedule
   * where the operator is rewriting the per-row split (pctDue) at a
   * fixed contract value, not changing the student count.
   */
  newContractValue?: number
}
```

The student-count flow does NOT pass `newContractValue`; behaviour identical to pre-6D.

The schedule-edit flow passes `newContractValue: mou.contractValue` so the operator's contract intent is preserved. The per-row `percentShare` is taken from the operator's `pctDue`. Locked rows keep `receivedAmount` as `netDue`; unpaid rows absorb the carry.

## Identity invariant test

`src/lib/mou/studentCountRecalc.test.ts` adds an identity-vs-saveSchedule test:

> For a fixed `(MOU contractValue, instalment percentShare distribution, lock pattern)`, the `recalcInstallments` engine produces identical per-row `netDue` values whether called from the /student-count flow (with `currentCount = contractValue / pricePerStudent` derived) or the /schedule-edit override path (with `newContractValue = mou.contractValue` passed explicitly).

The test fixtures a 4-row MOU at contractValue Rs 4,00,000, percentShares 10/30/30/30, with i1 locked at Rs 40,000, and asserts both engines yield the same i2/i3/i4 spread.

## Build + test status

- `npm run build`: clean.
- `npx tsc --noEmit`: no new errors introduced by Part 4 (the pre-existing test errors flagged in TYPE_UNIFICATION_TRACE.md remain unrelated).
- `npx vitest run src/lib/mou src/lib/scheduleEdit src/lib/mouSystem/recalc.test.ts`: every existing recalc test still passes; new identity test passes.
