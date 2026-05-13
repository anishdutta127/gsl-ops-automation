# Finance dashboard jargon cleanup (Gate 5A.7 Step 5)

Audit ran 2026-05-13 against `main` at 1ead135. Scope: `/dashboard/finance`
labels and immediate neighbours. Out of scope: deeper drilldown pages
(`/finance/payments`, `/operations/vex`, etc.) and the API.

## Changes made

| Surface | Before | After | Reason |
|---|---|---|---|
| Headline KPI strip card 1 | "Active MOUs" | (removed) | Brief Step 4: dropped from headline. Operational detail, not commercial position. Still derivable from the programme breakdown row count below. |
| Headline KPI strip card 4 | "Open alerts" | (removed) | Brief Step 4: dropped from headline. Severity vs priority mapping was confusing ("high" in the subtitle = `severity === 'critical'` in the data). Severity escalations remain visible in the `HighPriorityAlertsPanel` section directly below. |
| Headline KPI strip card 4 (new) | (n/a) | "Needs attention" | Names the operator's actionable queue length: payments that are overdue OR have a PI raised more than 30 days ago without payment. |
| Payments row left card heading | "Payments needing attention" | "Unmatched bank entries" | Resolves the name collision with the new "Needs attention" KPI. The card has always shown unmatched bank entries; the new label simply matches what is on screen. |
| VEX kit orders card 2 label | "Total Pipeline" | "Pipeline value" | Title-case opaque phrase replaced with two words that read in any sentence. The "sum of all VEX PI values" hint remains. |
| VEX kit orders card 3 label | "Pending to dispatch" | "Awaiting dispatch" | Same meaning, smoother English. Matches the dashboard's tense ("Active operations", "Top overdue payments"). |

The page-level docstring at `src/app/dashboard/finance/page.tsx:5` was updated
in lockstep with the heading rename so the file comment matches what the user
sees.

## Considered but not changed

| Surface | Label | Verdict |
|---|---|---|
| KPI strip card 1 (new) | "Total contract value" | Plain English; commercial term, not jargon. Kept. |
| KPI strip card 2 (new) | "Collected" | One word; clear. Kept. |
| KPI strip card 3 (new) | "Outstanding" | One word; clear. Kept. |
| Row 2 heading | "High-priority alerts" | Plain English. Kept. |
| Row 3.5 L heading | "Top overdue payments" | Plain English. Kept. |
| Row 3.5 R heading | "Renewal needed" | Plain English. Kept. |
| Row 4 heading | "Amount Receipt Summary" | The phrase is the Indian accounting standard for the document; keeping it preserves searchability and signals intent. Title Case is the only mild jargon flag; left in place. |
| Row 5 heading | "VEX kit orders" | Programme name; kept per brief. |
| Row 6 heading | "Programme breakdown" | Kept per brief. |
| Right-card heading | "PIs awaiting payment" | Two-letter PI is contextualised by every neighbouring section. Kept. |
| Tally footer CTA | "Run new export" | Plain English. Kept. |
| Filter chip label | "Receipts" | Indian accounting standard, kept per brief. |
| Abbreviations: PI, MOU, FY | (various) | Already contextualised at first use in surrounding copy; kept per brief. |

## Out of scope (logged for follow-up)

These appear on adjacent surfaces and would benefit from the same pass; they
are not part of Step 5 because the brief scoped to `/dashboard/finance`.

- `/operations/vex` carries the same "Total Pipeline" / "Pending to dispatch"
  labels. The VEX dispatch lifecycle uses Title Case ("Request Raised to
  Warehouse") which reads as legal-document tone. Distinct decision deferred
  to the Ops dashboard pass.
- `/finance/payments` matcher subheadings ("Bank entry matcher") could be
  simpler. Out of scope for this gate.
- `/dashboard/leadership` accountability headings overlap with this work but
  are owned by a different reviewer.

## Test impact

`FinanceSections.test.tsx` updated to assert the new VEX labels ("Pipeline
value" and "Awaiting dispatch") in place of the old ones. No new tests
added; the cleanup is name-only and the test count delta is zero for Step 5.
