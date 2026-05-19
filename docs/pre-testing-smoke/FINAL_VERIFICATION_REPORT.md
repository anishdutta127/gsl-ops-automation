# Pre-testing final verification report

**Date:** 2026-05-20
**Standard:** CLAUDE.md V4 - end-to-end user flow walks with realistic data.
**Status:** Ready for testing email.

## Summary

Phases 1 through 5 plus polish-now have shipped. Pre-testing smoke walked every Pranav-facing flow and every cross-feature interaction in the brief. Two findings landed as fixes during this gate; one was a Phase 2 deferred item, one was a UX copy pass; everything else is green.

## Step 0: PI template binary edit applied

`public/ops-templates/pi-template.docx` now carries the Phase 5 instalment summary table. Render test against real fixture data confirms the table populates with 1 header row plus 4 instalment loop rows; the contract-total and total-received summary paragraphs resolve cleanly. Script at `scripts/add-pi-instalment-summary.py` is idempotent so re-running the patch on an already-patched template is a no-op.

## All 12 flows + 5 interactions

See `SMOKE_TEST_LOG.md` for the detailed per-flow pass/fail table. Headline:

- **12 of 12 flows PASS.**
- **5 of 5 cross-feature interactions PASS** (one required a fix landed this gate; see below).

## Fixes applied during this gate

| # | sha | message |
|---|---|---|
| 1 | 5d3ab34 | fix(audit): sales-rep reassignment lands in critical-changes panel |
| 2 | 8630e33 | style(copy): pre-testing copy cleanup - replace 'nominal' jargon with plain English |

Both fixes were caught by the SSR smoke test (`src/__e2e/pre-testing-smoke-2026-05-20.test.tsx`, 22 cases, all green). The first restored a Phase 2 deferred item; the second cleaned up implementation jargon that had leaked into operator-facing surfaces during Phase 5 build.

## Issues found that were NOT fixed (with reasoning)

| Issue | Reasoning |
|---|---|
| Orphan payments in fixture (piNumber set, parent MOU absent from `mous.json`) | Data anomaly in fixture, not a code bug. The renderPi route returns `mou-not-found` for these rows; the `/api/finance/pi/[paymentId]/download` route surfaces a redirect to a friendly page. Not within smoke scope to clean fixtures. |
| No live browser walk | Playwright is not installed; SSR component-tree walk is the documented V4 fallback floor. Anish + Pranav verify visually post-deploy. |
| "This invoice" + adjustment-breakdown PI summary row not exercised in fixture render | The fixture's paid MOUs have all 4 instalments paid; no live "1 paid + 1 current with carry + 2 due" combination. Placeholder bag is tested (21 generatePi.test.ts cases); the live combination surfaces the first time Pranav recalcs a count after partial payment. |
| Mobile 375px sweep is code-review only | CSS classes (flex-wrap, overflow-x-auto, min-w-0 flex-1) verified by inspection; no automated viewport screenshot. |

## Pranav exact-number reconciliation

The pre-testing smoke (`src/__e2e/pre-testing-smoke-2026-05-20.test.tsx` "Pranav exact-number reconciliation (regression guard)") confirms:

500 students -> 450 students -> 400 students with PI 1 locked at Rs 1,12,500 still produces:

  PI 1: Rs 1,12,500 (locked)
  PI 2: **Rs 87,500** (share Rs 1,00,000 less Rs 12,500 credit from earlier PI)
  PI 3: Rs 1,00,000
  PI 4: Rs 1,00,000

  Total: Rs 4,00,000 = 400 x 1,000.

`recalcInstallments` returns `reconciled: true`. The math reconciles end-to-end after all of Phase 5 + the copy cleanup.

## PI template render confirmation

`scripts/test-pi-render.mjs` against `MOU-STEAM-2526-002` (Don Bosco Bandel) produced `tmp/pi-render-test.docx` with:

  - PROFORMA INVOICE heading + Bill To block
  - Existing 4-column line-items table with the single current instalment
  - **NEW: "Instalment Summary" heading + 4-row instalment table** with seq, due date, status (`Paid`), amount
  - **NEW: "Contract total at 531 students: Rs 16,91,766"** paragraph
  - **NEW: "Total received to date: Rs 16,91,766"** paragraph
  - Payment Terms, Bank Account Details, Authorised Signatory

The render confirms the placeholder bag from `src/lib/pi/generatePi.ts` populates the patched template correctly. Document size 36925 bytes (reasonable; previous template was 33-35KB).

## Test data IDs for Pranav's retest email

| Purpose | Data |
|---|---|
| Year filter + multi-year MOU demonstration | `MOU-STEAM-2526-002` (and roughly 43 other multi-FY MOUs in the active cohort) |
| Count change + recalc demonstration | Any MOU with at least 1 paid instalment is suitable. Browse `/mous?status=Active` for a list. |
| Batch payment entry | Pick any school from the picker dropdown at `/finance/payments/log-batch` (the picker only lists schools with outstanding instalments). |
| TDS split on existing entry | Use `/finance/payments/new` with bank + TDS inputs. |
| Salesperson reassignment | Browse `/schools` and click into any. The Reassign CTA is visible on the header card. |
| Saved drafts | Save any draft from `/mous/new/<template>` and find it via the Drafts CTA on `/mous`. |

## Live URLs verified

Below all return `307 Temporary Redirect -> /login?next=...` on the canonical `gsl-ops-automation.vercel.app` alias, which is the expected auth gate behaviour:

- `/mous`
- `/mous/new`
- `/mous/[id]`
- `/mous/[id]/installments`
- `/mous/[id]/student-count`
- `/finance/payments`
- `/finance/payments/log-batch`
- `/finance/payments/new`
- `/schools/[id]`
- `/schools/[id]/reassign-sales-rep`

## Recommendation

**Ready for testing email.** All 12 brief flows + 5 cross-feature interactions pass at SSR + unit-test level. The 2 fixes landed during smoke are committed and deployed; the math reconciles to Pranav's exact numbers. Anish can send the testing email.
