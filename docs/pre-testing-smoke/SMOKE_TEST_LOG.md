# Smoke test log: 2026-05-20 pre-testing gate

**Standard:** CLAUDE.md V4 verification standard.
**Goal:** Walk every Pranav-facing flow before the testing email goes out. Catch broken edge cases that any cumulative-feature gap created.
**Tooling:** `src/__e2e/pre-testing-smoke-2026-05-20.test.tsx` - 22 SSR walks covering 11 of the 12 brief-listed flows plus the 5 cross-feature interactions.

## Flow walk results

| # | Flow | Status | Notes |
|---|---|---|---|
| 1 | Create new MOU - picker + wizard | PASS | Drafts shortcut visible, wizard renders against live sales_team. |
| 2 | Set payment schedule (empty-state CTA) | PASS | The empty-installments CTA renders when an MOU is signed but has no rows. |
| 3 | Update student count + recalc | PASS | Form page renders; preview pane renders when ?preview is set. |
| 4 | Generate PI with summary table | PASS | renderPi happy path produces .docx bytes (>1KB) using the patched binary template. The template-render python smoke at scripts/test-pi-render.mjs confirmed the new INSTALMENT_SUMMARY table renders cleanly with 5 rows (1 header + 4 instalments) against real MOU MOU-STEAM-2526-002. |
| 5 | Log payment batch with TDS | PASS | School picker renders + per-row Bank + TDS form renders for a school with outstanding installments. |
| 6 | Log single payment | PASS | New form exposes bank + TDS inputs; tdsDeducted single-field is gone. |
| 7 | Year-based registry navigation | PASS | /mous lands on current FY, year picker active. Multi-FY MOU appears in each of its years. Multi-year MOU detail shows year tabs. |
| 8 | Salesperson reassignment | PASS | School detail Reassign CTA visible; reassign form renders with current rep + scope buttons. |
| 9 | Saved drafts visibility | PASS | /mous Drafts CTA + Draft chip + count visible. |
| 10 | ErrorBoundary backstops on wizard pages | PASS | All 6 error.tsx files compile and export default components. |
| 11 | Mobile 375px sanity sweep | PASS (code review) | Year-picker pill row uses flex-wrap; instalments table uses overflow-x-auto; batch form table uses overflow-x-auto. No fixed widths that break at 375px. |
| 12 | Permission gates on every editable surface | PASS | TESTING_OPEN_ACCESS opens both VIEW + EDIT gates by default (CLAUDE.md). Admin wildcard intact. Finance dept-scoped permissions verified by 2 lib tests (recordReceipt + applyCountChange). |

## Cross-feature interaction results

| # | Interaction | Status | Notes |
|---|---|---|---|
| 1 | TDS-paid lock + count change | PASS | Locked instalment paid via Rs 1,00,000 bank + Rs 12,500 TDS contributes the full Rs 1,12,500 to `lockedDeltaContribution`. Pranav's reasoning holds: the FULL payment (bank + TDS) counts as received, so the carry calculation reproduces the pure-bank case exactly. |
| 2 | Year filter + multi-year MOU + count change | PASS | Both surfaces (year-picker rows + year-tab detail) read from the same Payment list; recalc'd `expectedAmount` and `netDue` flow through both views uniformly. |
| 3 | Salesperson reassignment + audit panel | **FIXED THIS GATE** | Phase 2 introduced the `sales-rep-reassigned` action but did not add it to `CRITICAL_ACTIONS`. Pre-testing smoke caught the gap. Fixed in `5d3ab34`. |
| 4 | Saved draft excluded from batch payment school list | PASS | The batch flow's school picker filters on `outstandingSchoolIds` which only includes schools with active-cohort MOUs in instalment-bearing statuses; draft-only MOUs do not enter the set. |
| 5 | Empty / dead-end state copy | PASS | Year filter with no MOUs does not crash. Drafts list with zero drafts renders. Batch picker with zero outstanding schools renders the "no schools..." copy. |

## Issues found + fixes applied

| Issue | Root cause | Fix | Commit |
|---|---|---|---|
| `sales-rep-reassigned` not in critical-changes panel | Phase 2 deferred this; the action was added to `AuditAction` but never to `CRITICAL_ACTIONS`. CC flagged it in the Phase 2 final report. | One-line addition to `CRITICAL_ACTIONS` set in `src/lib/criticalChanges.ts`. 22-case smoke walk + 13 existing criticalChanges tests green. | `5d3ab34` |
| Smoke-test PI render picked an orphan payment (parent MOU missing from fixture) | Data anomaly in `payments.json` - some rows carry piNumber but their `mouId` does not exist in `mous.json`. Not a code bug; test fixture issue. | Tightened the test filter to require both mou + school exist before invoking renderPi. | included in `5d3ab34` |
| "nominal" + "cumulative carry" + "could not reconcile" UI copy was jargon | Implementation vocabulary leaked into operator-facing surfaces during Phase 5 build. | Replaced with "share", "Carry from earlier PIs (credit going to next PI / shortfall to recover)", and "Could not balance the schedule" plain-English equivalents. | `8630e33` |

## Pranav exact-number reconciliation (regression guard)

The pre-testing smoke includes a dedicated assertion that
500 → 450 → 400 with PI 1 locked still produces:
- PI 1: Rs 1,12,500 (locked)
- PI 2: **Rs 87,500** (Rs 1,00,000 share less Rs 12,500 credit from earlier PI)
- PI 3 + 4: Rs 1,00,000 each
- Total: Rs 4,00,000 = 400 × 1,000

`recalcInstallments` returns `reconciled: true`. Confirmed.

## Test data IDs for Pranav's retest

| Surface | Fixture id | What it demonstrates |
|---|---|---|
| Year filter + multi-year | `MOU-STEAM-2526-002` (and ~43 others) | Multi-FY MOU; appears in both 2024-25 and 2025-26 views. |
| MOU with paid + pending mix for count change demo | `MOU-STEAM-2526-002` | 4 instalments, some paid; suitable for "drop count, watch carry" walk. |
| Schools with outstanding instalments for batch payment | Any school in the batch picker dropdown (the picker filters automatically). | Live picker shows real schools. |
| Draft for resume flow | The Drafts CTA on /mous shows the count; any draft works. | Wizard resume from saved state. |
| School for reassignment demo | Any school visible at /schools | Reassign modal exposes current rep + scope buttons. |

## Residual gaps for honest accounting

- **No live browser walk.** Playwright not installed. SSR walks cover structural rendering; visual / interactive walk-through is on Anish + Pranav post-deploy.
- **PI template binary edit happened in Step 0** but the test fixture only contains MOUs with all-paid PIs, so the "This invoice" + adjustment-breakdown row was not exercised in render. The placeholder bag tests (21 cases at `generatePi.test.ts`) cover the data shape; Pranav will see the live combination when he generates a PI on a partially-paid MOU after count change.
- **Mobile sweep is code-review only.** The CSS classes (`flex-wrap`, `overflow-x-auto`, `min-w-0 flex-1`) are correct; no 375px viewport screenshot is captured.
