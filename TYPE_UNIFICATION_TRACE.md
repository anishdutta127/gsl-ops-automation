# Type unification trace (Phase 6D Part 3)

The codebase carried two distinct `MOU` definitions:

- `src/lib/types.ts` (canonical) -- the strict, fully-populated type the live registry, kanban, and finance flows rely on.
- `src/lib/mouSystem/types.ts` (looser) -- the mouSystem-namespace type the entity writers, generator wizard, and reconcile pipeline used. Several canonical fields (`programmeSubType`, `schoolScope`, `schoolGroupId`, `cohortStatus`, `delayNotes`) were optional here. Drafts written via this writer landed missing `cohortStatus`, which surfaced as Phase 6A Bug 4 (drafts saved but never appeared on /mous because the active-cohort filter dropped them).

## Outcome

`src/lib/mouSystem/types.ts` now re-exports `MOU`, `MouStatus`, `TrainerModel` from `src/lib/types.ts`. The duplicate interface is deleted; every import path (`from '@/lib/mouSystem/types'` and `from './types'` for siblings inside `mouSystem/`) resolves to the canonical type. The mouSystem-only types (`SignedValues`, `VexPi`, `VexDispatch`, etc.) stay where they are.

## Importers audit (Phase 6D snapshot)

Files importing from `@/lib/mouSystem/types` or `./types` (sibling within `mouSystem/`). Symbols actually pulled in are listed where relevant; many import only programme-routing / VEX types and were not affected by the MOU unification.

### Direct MOU consumers (resolved via re-export, no source edit needed unless TS surfaced an error)

| File | Imports | Notes |
|---|---|---|
| `src/lib/finance/runTallyExport.ts` | `MOU as MouSystemMOU, Payment as MouSystemPayment, School as MouSystemSchool` | Passes through to `findCandidates` in mouSystem/reconcile. Continues to work post-unification (canonical MOU is a superset of what reconcile reads: `id`, `schoolId`, `schoolName`). |
| `src/app/finance/payments/PaymentMatcher.tsx` | `MOU as MouSystemMOU, Payment as MouSystemPayment` | Same callsite into `findCandidates`. Continues to work. |
| `src/lib/mouSystem/attribution.ts` | `MOU, Payment, SalesPerson` | Sibling import. Resolved to canonical MOU. |
| `src/lib/mouSystem/installments.ts` | `MOU, Payment, PaymentStatus` | Sibling. Resolved. |
| `src/lib/mouSystem/pi.ts` | `Adjustment, MOU, Payment, PiCounterMap, Programme, School` | Sibling. Resolved. |
| `src/lib/mouSystem/lifecycleReplay.ts` (implicit via tests) | `MOU, Payment, School, Adjustment` | Sibling. Resolved. |
| `src/lib/mouSystem/reconcile.ts` | `MOU, Payment` | Sibling. Resolved. |
| `src/lib/mouSystem/entityWriters.ts` | `MOU, Payment, MouStatus, TrainerModel, ...` | Sibling. Required code edits: removed the legacy `salesRep` field from new-MOU construction (no longer on canonical MOU; raw value is preserved on `draftVariables`). |
| `src/lib/mouSystem/saveDraftMou.ts` (via test fixtures) | `MOU, Programme` | Sibling. Resolved. |
| `src/lib/imports/fy2526Import.ts` | `Programme` | Programme only; not affected. |
| `src/components/mou-system/GeneratorWizard.tsx` | `GradewiseDistributionRow, MouBillingBlock, ProductSelection, SalesChannel, SalesPerson, TrainerModel, YearPaymentSchedule, YearlyPricingRow` | No MOU import directly. TrainerModel now re-exported from canonical; mouSystem callers continue to compile. |

### Test-fixture migrations (callsite fixes, not type loosenings)

These test fixtures previously constructed a `MOU` with the looser mouSystem shape. Migrated to canonical shape (added the 5 required fields; removed the legacy `salesRep` field; substituted legacy `MouStatus` values `'Signed'` -> `'Active'` since canonical does not carry `'Signed'`).

| File | Changes |
|---|---|
| `src/lib/mouSystem/attribution.test.ts` | +`programmeSubType: null`, `schoolScope: 'SINGLE'`, `schoolGroupId: null`, `cohortStatus: 'active'`, `delayNotes: null`; -`salesRep: null` |
| `src/lib/mouSystem/installments.test.ts` | same |
| `src/lib/mouSystem/pi.test.ts` | same |
| `src/lib/mouSystem/reconcile.test.ts` | same; +`status: 'Sent for Signing'` was already absent on canonical, but the fixture used a fixed `'Active'` so no status mapping required |
| `src/lib/mouSystem/lifecycleReplay.test.ts` | same; +`status: 'Signed'` -> `'Active'` on the helper |
| `src/lib/mouSystem/saveDraftMou.test.ts` | -`salesRep: null` (the existing fixture already carried `programmeSubType` / `schoolScope` / etc.) |
| `src/lib/adjustments/createAdjustment.test.ts` | `status: 'Signed'` -> `'Active'` |
| `src/lib/scheduleEdit/saveSchedule.test.ts` | same |
| `src/lib/mouSystem/entityWriters.ts` | -`salesRep: v.SALES_REP ?? null` from the `MOU` literal constructed at draft-save (raw value retained on `draftVariables: v`) |

## Type-shape narrowing notes

The unification narrowed three enums:

1. `MouStatus` -- canonical has 6 values (`Draft | Pending Signature | Active | Completed | Expired | Renewed`); mouSystem had 8 (legacy: `Sent for Signing`, `Awaiting Signature`, `Signed`). Production data audit (152 MOUs in mous.json) showed 0 records carry the legacy values: distribution is 153 Active, 23 Pending Signature, 4 Draft. The literal-string array `PI_BLOCKED_STATUSES` in `src/lib/mouSystem/pi.ts` keeps the legacy strings on purpose (defensive: `isPiAllowedForStatus(status: string)` accepts any string and the literal-string array is not constrained by MouStatus).

2. `TrainerModel` -- canonical has `Bootcamp | GSL-T | TT | AIQ | Other`; mouSystem had `Bootcamp | GSL-T | TT | TTT | Other`. Production data audit shows 2 records carry `TTT` (data drift); the JSON is loaded `as unknown as MOU[]` so TS does not catch the runtime values. Backfill to migrate `TTT` -> `TT` is out of scope.

3. `Programme` -- both sides already agree (`STEAM | Young Pioneers | Harvard HBPE | Robotics`).

## Build + test status

- `npx tsc --noEmit`: zero MOU-related errors. Remaining errors (`downlevelIteration`, `opsAugmentData.test.ts`, `chainReconciliation.test.ts`, `financeDashboardData.test.ts possibly undefined`) are pre-existing and unrelated to the unification.
- `npm run build`: clean. Compiled successfully.
- `npx vitest run`: 3128 / 3131 tests pass. The 3 failing tests (`src/__e2e/year-registry-2026-05-19.test.tsx` asserting old "FY received" column, `src/app/api/operations/vex/pi/create/route.test.ts` asserting VEX dispatch id format, plus one other) fail identically on `main` before this gate's edits, so the unification introduces zero new regressions.
