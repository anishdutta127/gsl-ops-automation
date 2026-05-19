# E2E verification log: 2026-05-20 student-count + recalc gate

**Standard:** CLAUDE.md V4 verification standard.
**Gate:** Phase 5 - variable student count + PI recalculation +
invoice summary table (Pranav review items #4 + #5).
**Tooling:** SSR component-tree walks; no Playwright in this repo.

## Verification tooling

1. `src/lib/mou/studentCountRecalc.test.ts` - 10 unit cases on the
   pure recalc engine.
2. `src/lib/mou/applyCountChange.test.ts` - 13 unit cases on the
   write-path wrapper (event creation, MOU + Payment updates,
   permission gates, all failure modes).
3. `src/__e2e/student-count-2026-05-19.test.tsx` - 8 SSR walks:
   Pranav A step 1, A step 2, Pranav B (increasing), credit-balance
   overflow, SSR page render without crash, preview pane,
   critical-audit recognition, MOU detail CTA visibility.
4. Full vitest suite at HEAD.

## Pranav exact-number reconciliation

### Decreasing (500 -> 450 -> 400)

| Step | PI 1 | PI 2 | PI 3 | PI 4 | Cumulative delta | Total |
|---|---|---|---|---|---|---|
| MOU sign 500 | 1,25,000 | 1,25,000 | 1,25,000 | 1,25,000 | 0 | 5,00,000 |
| 500 -> 450 (Step A) | 1,12,500 | 1,12,500 | 1,12,500 | 1,12,500 | 0 | 4,50,000 |
| PI 1 paid Rs 1,12,500 | LOCKED 1,12,500 | 1,12,500 | 1,12,500 | 1,12,500 | 0 | 4,50,000 |
| 450 -> 400 (Step B) | LOCKED 1,12,500 | **87,500** (net) | 1,00,000 | 1,00,000 | **-12,500** | **4,00,000** |

`totalCommitted = 4,00,000 = 400 x 1000`. Engine `reconciled = true`. Asserted in `studentCountRecalc.test.ts` "Step B" + `__e2e/student-count-2026-05-19.test.tsx` "Flow 3".

### Increasing (500 -> 600)

| Step | PI 1 | PI 2 | PI 3 | PI 4 | Cumulative delta | Total |
|---|---|---|---|---|---|---|
| MOU sign 500 | 1,25,000 | 1,25,000 | 1,25,000 | 1,25,000 | 0 | 5,00,000 |
| PI 1 paid Rs 1,25,000 | LOCKED 1,25,000 | 1,25,000 | 1,25,000 | 1,25,000 | 0 | 5,00,000 |
| 500 -> 600 | LOCKED 1,25,000 | **1,75,000** (net) | 1,50,000 | 1,50,000 | **+25,000** | **6,00,000** |

`totalCommitted = 6,00,000 = 600 x 1000`. Engine `reconciled = true`. Asserted in `studentCountRecalc.test.ts` "Pranav worked example 2" + `__e2e` "Flow 5".

### Credit-balance overflow (count drops dramatically)

3 of 4 PIs paid at Rs 1,25,000 each; count drops to 200. Cumulative delta = `3 x (50000 - 125000) = -2,25,000`. PI 4 (first unpaid) absorbs: `nominal 50000 + (-2,25,000) = -1,75,000` (a credit balance carry-forward). Engine returns the negative honestly; the UI surfaces it as "credit of Rs 1,75,000 carrying forward". Asserted in `__e2e` "Flow 6".

## Flow walks

| Flow | Surface | Assertion | Result |
|---|---|---|---|
| 1 Setup | unit tests | baseline 4 x 1,25,000 produced from contractValue 5L + 4 x 25% schedule | PASS |
| 2 First count change | recalc engine | 500 -> 450, all 4 unpaid revise to 1,12,500 | PASS |
| 3 Second count change with PI 1 locked | recalc engine | 450 -> 400 lands PI 2 at 87,500 net | PASS |
| 4 PI summary table data shape | code inspection + existing `generatePi.test.ts` 21/21 green | `INSTALMENT_SUMMARY` + `CONTRACT_TOTAL_AT_CURRENT_COUNT` + `TOTAL_RECEIVED_TO_DATE` + `CURRENT_STUDENT_COUNT` in bag; binary .docx edit is the operator follow-up per `PI_TEMPLATE_INSTALMENT_SUMMARY.md` | PASS (code side); operator step queued |
| 5 Count increase | recalc engine | 500 -> 600 lands PI 2 at 1,75,000 | PASS |
| 6 Credit balance overflow | recalc engine | PI 4 nets to -1,75,000 with cumulative -2,25,000 | PASS |
| 7 Audit trail visibility | criticalChanges lib | `student-count-changed` action returns `isCriticalAudit = true` | PASS |
| 8 SSR render on real fixtures | SSR walks | student-count form page + MOU detail CTA render without crash | PASS |

## Schema migration impact

| Metric | Value |
|---|---|
| Pre-gate Payment rows | 396 |
| Payment rows that gained Phase 5 fields during deploy | 0 (opt-in lazy migration) |
| StudentCountEvent rows seeded | 0 (empty fixture; first event lands when an operator uses the new form) |
| MOUs that need backfill before the new UI can compute correctly | 0 (the form computes percentShare on first use from `expectedAmount / contractValue * 100`) |

## Residual gaps for honest accounting

- **PI template binary edit deferred.** The placeholder bag carries
  the new keys but the `.docx` template does not consume them yet.
  Documented at `docs/gate-student-count/PI_TEMPLATE_INSTALMENT_SUMMARY.md`.
  Until Pranav / Anish updates the template, generated PIs render
  the same single-instalment line item as before; nothing breaks.
- **No live browser walk.** Playwright not installed. SSR walks
  cover structural rendering; visual / interactive verification is
  on Anish + Pranav post-deploy.
- **Preview pane is server-rendered via `?preview=` URL.** No
  client JS; the operator types a new count, hits "Refresh
  preview", the server re-renders the projection. A live-typing
  client variant is a future polish item.
- **Existing schedule-edit path (`/mous/[id]/installments/schedule-edit`)
  continues to use the legacy Adjustment-entity engine** in
  `src/lib/mouSystem/recalc.ts`. Phase 5 deliberately did not
  refactor that path; both engines coexist. A future gate can
  unify if drift becomes an operational problem.
- **No-op "isLocked" persisted field.** I added `isLocked` to the
  Payment schema but the lib derives it from `receivedAmount > 0`.
  The field is reserved for a future "explicit lock without
  payment" case (e.g. MOU termination locking the remaining PIs
  without receipts).

## BACKLOG (surfaced by this gate)

| Item | Notes |
|---|---|
| Per-student price adjustments mid-MOU | Rare; new entity if needed. |
| Bulk count update via CSV at FY end | Useful for end-of-year reconciliation across many schools. |
| Automated count alerts when discrepancy > X% | New NotificationKind; surfaces silent count drift. |
| MOU renewal carrying forward final count | Renewal entity work; orthogonal. |
| Unify the two recalc engines | Phase 6+; the Adjustment-entity path is legacy. |
| PI template binary commit (one-time operator task) | Documented at PI_TEMPLATE_INSTALMENT_SUMMARY.md. |

## Commits in this gate

```
<sha>   feat(audit): student count change events surface in critical-changes panel
21d163f feat(pi): installment summary table on every PI document
9c28fd9 feat(installments): show nominal + adjustment + net due per instalment row
<sha>   feat(students): apply count change UI with recalc preview
<sha>   feat(students): recalc engine for variable student count
<sha>   feat(students): student count history + nominal/net-due payment schema
```
(Full chain at HEAD; sha values below this gate's deploy.)
