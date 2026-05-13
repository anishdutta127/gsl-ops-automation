# Finance KPI strip audit vs gsl-mou-system (Gate 5A.7 Step 3)

Snapshot taken 2026-05-13 against `main` at 52c2e23. Pre-restructure state, no
KPI code changes made yet.

Ameet's walkthrough flagged the Finance dashboard KPI strip as confusing.
Concrete points raised:
1. The first card's meaning isn't obvious.
2. Some numbers don't match what `gsl-mou-system` shows live.
3. He wants "overall first, action second" framing.
4. Plain English, no jargon.

This audit catalogues the current strip, the equivalent in `gsl-mou-system`,
the numerical differences, and the cause for each. Step 4 will rebuild the
strip using these findings.

## Current state: /dashboard/finance KPI strip (Ops platform)

Rendered by `src/components/dashboard/finance/KpiStrip.tsx`, computed by
`computeKpiStrip` in `src/lib/dashboard/financeDashboardData.ts:267`.

| # | Label | Big number | Subtitle | Click target |
|---|---|---|---|---|
| 1 | Active MOUs | `data.activeMous` (integer) | `${data.pipelineMous} in pipeline` | none |
| 2 | Contract value | `formatRs(data.contractValue, { compact: true })` | `across ${data.schoolsCount} schools · click to view` | `/finance/schools-receipts?<filters>` |
| 3 | Collected | `${data.collectedPct.toFixed(1)}%` | `${formatRs(collectedAmount)} of ${formatRs(contractValue)}` + sub: `${formatRs(outstandingAmount)} open` | none |
| 4 | Open alerts | `data.openAlerts` (integer) | `${data.highAlerts} high · ${data.mediumAlerts} medium` | none |

### How each value is computed (Ops platform)

- **Active MOUs** = `filteredMous.filter(m => m.status === 'Active').length`.
  Strict status check; only the literal `'Active'` status passes.
- **Pipeline (subtitle of card 1)** = `filteredMous.filter(m => ['Draft','Pending Signature'].includes(m.status)).length`.
- **Contract value** = `sum(filteredMous.contractValue)`. NB: this sums across
  EVERY MOU that survives the filter -- including `Pending Signature` MOUs
  that have signed value zero in many cases, and including archived prior-year
  MOUs because `applyFilters` does not gate on `cohortStatus`.
- **Schools count** = `new Set(filteredMous.map(m => m.schoolId)).size`.
- **Collected amount** = `sum(filteredPayments.receivedAmount)`. Single field;
  no fallback to a partial-payments aggregation.
- **Collected %** = `collectedAmount / contractValue * 100` (or 0 if no value).
- **Outstanding** = `max(0, contractValue - collectedAmount)`.
- **Open alerts** = count of `escalations` with `status !== 'Closed'` whose
  `mouId` is null or in the filtered MOU set. Severity label mapping in the
  subtitle is **non-obvious**:
  - "high" in the UI = `escalation.severity === 'critical'`
  - "medium" in the UI = `escalation.severity === 'high'`
  - `severity === 'medium'` and `'low'` are counted in the total but not
    surfaced in the subtitle breakdown -- so total can exceed `high + medium`
    visibly without explanation.

### Filters that apply

`parseFinanceFilters` in `financeDashboardData.ts:106` reads URL params:
- `p` (programmes, multi)
- `sc` (sales channels, multi)
- `fy` (single FY, e.g. `2026-27`)
- `from` / `to` (custom date window; overrides FY when set)

When no params are supplied (default landing): `programmes=[]`, `salesChannels=[]`,
`fy=null`, `from=null`, `to=null`. `applyFilters` -> `resolveWindow` returns
`(null, null)`, so `mouOverlapsWindow` always returns true. **The default view
shows every MOU in the data set, including archived prior-year cohorts.**

## gsl-mou-system equivalent (live at https://gsl-mou-system.vercel.app/dashboard)

Rendered by `src/app/page.tsx` in the sibling repo. Same conceptual 4-card
strip. Reference code path:

| # | Label | Big number | Subtitle |
|---|---|---|---|
| 1 | Active MOUs | `totalActiveMous` (integer) | `${totalPendingMous} in pipeline` |
| 2 | Contract value | `<MoneyAmount amount={totalContractValue} compact />` | `across ${totalSchools} schools - click to view` |
| 3 | Collected | `formatPct(collectionPct)` | `<MoneyAmount amount={totalReceived} compact />` + trend: `${MoneyAmount(totalBalance)} open` |
| 4 | Open alerts | `formatCount(alertCounts.total)` | `${high} high · ${medium} medium` |

### How each value is computed (mou-system)

- **Active MOUs** = `filteredMous.filter(m => !PIPELINE_STATUSES.has(m.status)).length`
  where `PIPELINE_STATUSES = {'Draft', 'Sent for Signing', 'Awaiting Signature', 'Pending Signature'}`.
  Inverse logic: anything not pipeline is "active". This captures `'Signed'`,
  `'Active'`, `'Completed'`, `'Expired'`, `'Renewed'` -- whatever statuses the
  mou-system carries.
- **Pipeline count** = same 4-status set.
- **Contract value** = `sum(filteredMous.contractValue)`. Same as Ops.
- **Schools count** = `new Set(filteredMous.map(m => m.schoolId)).size`. Same.
- **Collected amount** = `sum(filteredPayments.paidAmount(p))` via
  `src/lib/installments.ts:216` -- this prefers
  `sum(p.partialPayments.amount)` when partialPayments is non-empty, else falls
  back to `p.receivedAmount`. Different from Ops in principle.
- **Collected %** = same formula.
- **Outstanding** = `sum(filteredPayments.balanceAmount(p))`. Per-payment
  `max(0, expectedAmount - paidAmount(p))`. Subtly different from Ops's
  aggregate `contractValue - collectedAmount` -- mou-system's value cannot go
  negative on any single payment.
- **Open alerts** = `alerts` table (not `escalations`), filtered by `status === 'Open'`
  and MOU scope. Severity field is `priority`, with values `'High' | 'Medium' | 'Low'`.
  No "critical" tier. `alertCounts.high` directly counts `priority === 'High'`
  -- no rename.

### Filters that apply (mou-system)

Same shape as Ops: `p`, `sc`, `fy`, `from`, `to`. Defaults to all programmes
when `p` is empty (rather than no filter). No cohort concept.

## Snapshot numerical comparison

Cutover snapshot from gsl-mou-system landed in
`src/data/_snapshots/mou-system/_meta.json` on **2026-05-10**. Today is **2026-05-13**,
so the Ops data is **3 days behind** any live mou-system mutations. The data
files Ops reads at runtime are the post-import canonical files; they were
seeded from this snapshot (with the importer's status-coercion + cohort split).

Counts in the snapshot vs Ops's current canonical files:

| Entity | gsl-mou-system snapshot (2026-05-10) | Ops canonical (today) | Delta |
|---|---:|---:|---:|
| `mous` | 152 | 143 | -9 |
| `payments` | 219 | 197 | -22 |
| `schools` | 124 | 119 | -5 |
| `agreements` | 1 | (in `agreements.json`) | n/a |
| `vex_pis` | 5 | (in `vex_pis.json`) | n/a |
| `vex_dispatches` | 4 | (in `vex_dispatches.json`) | n/a |

### Why the deltas exist

- **9 MOUs absent in Ops:** the snapshot has 4 MOUs at `status === 'Signed'`,
  which is not in Ops's `MOU.status` union (Ops collapses 'Signed' into
  'Active' at import time per `src/lib/importer/fromMou.ts`). Those 4 should
  surface as 'Active' in Ops; if they're missing entirely the importer dropped
  them on a validation. The remaining 5 are likely school-only or duplicate
  records the importer rejected. Track-down belongs in a separate ticket; for
  the audit purpose it means **Ops will under-count Active MOUs by 9 relative
  to gsl-mou-system live, every time the dashboards are compared side by side.**
- **22 payments absent in Ops:** mou-system has 3 payments with
  `partialPayments.length > 0`; Ops has 0. The importer flattens partials into
  `receivedAmount`, then drops the payment record itself if certain fields are
  invalid. Aggregate Rs differs by Rs 10,000 between `paidAmount` (Rs 2.77 Cr)
  and `receivedAmount` (Rs 2.77 Cr -- the Rs 10k delta is the partial-payment
  remainder not surfaced in `receivedAmount`).
- **5 schools absent in Ops:** flow-through from the 9 missing MOUs.

### Default-view comparison (no filters)

| Card | Ops platform shows today | gsl-mou-system shows today (computed against the snapshot for reproducibility) | Reconciles? |
|---|---|---|---|
| Active MOUs | 134 (status === 'Active') / 9 pipeline | 143 (non-pipeline) / 9 pipeline | **No** -- 9-MOU shortfall from import + the `Signed` status not making it across |
| Contract value | Rs 6.80 Cr across 120 schools | Rs 7.32 Cr across 124 schools | **No** -- the missing 9 MOUs include high-value contracts (Rs ~52 Lakh delta) |
| Collected | 38.7% (Rs 2.63 Cr of Rs 6.80 Cr) | 37.8% via `paidAmount` (Rs 2.77 Cr of Rs 7.32 Cr) | **Partially** -- different denominator + slight numerator drift from partials |
| Open alerts | 3 escalations (severity mapping in subtitle) | n/a from snapshot (alerts not snapshotted); live gsl-mou-system shows alerts table | **No common axis** -- different table, different field names |

### Active-cohort + FY26-27 scope (the "current pursuit")

The most honest headline scope for the Ops dashboard is **active-cohort,
FY26-27**. This is the post-Phase-1 mental model: Ops operates on the live
cohort; archived prior-year is for historical inspection only. The numbers:

| Metric | Value | Notes |
|---|---:|---|
| MOUs | 50 | 41 Active + 9 Pending Signature; 1 MOU in active cohort has no FY-overlapping date window |
| Schools | 50 | 1:1 with MOUs |
| Total contract value | Rs 3.80 Cr | Sum of `contractValue` |
| Payments tied to these MOUs | 0 | Most active-cohort MOUs are not yet in the PI / collection phase |
| Collected | Rs 0 | 0% of Rs 3.80 Cr |
| Outstanding | Rs 3.80 Cr | All open |
| Overdue 30+ days | 0 payments | None yet |

This is the framing Card 1 of the restructured strip should lead with: a
clear, FY-specific, active-cohort-only headline. It also explains why
"Collected = 0%" reads as alarming when shown in the new strip default -- it
is honest. The previous all-cohort default (38.7%) implicitly blended in
prior-year collected revenue, which is comforting but not what the user is
trying to manage.

## Reconciliation decision per metric

For Step 4 the new strip should:

1. **Default to active-cohort + current-FY scope** for the headline numbers.
   The legacy archived-cohort-blended numbers are still reachable via the FY
   chip (`All FYs` option) and the cohort is implicit in the FY scope.
   Without an explicit re-scope, the Ops platform will continue to undercount
   relative to mou-system because gsl-mou-system has no cohort concept and
   shows everything pre-archive.
2. **Pick a single semantic for "Active MOUs"** and document it under the
   subtitle. The brief recommends DROPPING the Active MOUs / Open Alerts cards
   from the headline strip entirely (they are operational details, not the
   commercial position). Step 4 will follow that. The all-statuses count
   remains available on /mous and on /dashboard/ops.
3. **Use `receivedAmount` as the Ops authoritative paid figure.** The Rs 10k
   delta from `paidAmount` semantics is below the visible compact-format
   resolution (`Rs 2.77 Cr` either way). Document the field choice in the
   subtitle: "received and reconciled" or similar.
4. **Resolve the 9-MOU import shortfall as a separate work-item.** It does
   not block Step 4 -- the audit doc names it, and the new strip's framing
   ("active cohort, FY26-27") sidesteps the comparison Ameet was making
   (which was implicitly all-cohort against mou-system's all-cohort).
5. **For "Needs attention", define crisply.** The brief proposes "overdue
   payments + stalled MOUs". Concrete thresholds:
   - Payment past `dueDateIso + 30 days` and not in `'Paid' | 'Received'`.
   - PI raised more than 30 days ago and payment not received.
   - MOU at `Pending Signature` status for more than 60 days (sales-side
     stall, but a Finance signal that revenue is at risk).
   Step 4 will pick a subset that's computable from the fixture today and
   leave the others as BACKLOG items if data isn't there yet.

## Implications for Step 4 build

The new 4-card strip (per Ameet's framing):

```
| Total contract value FY26-27 | Collected | Outstanding | Needs attention |
|         Rs 3.80 Cr           |  Rs 0     | Rs 3.80 Cr  |    0 items      |
|       across 50 schools      | 0% of CV  | across 50  | Overdue payments,|
|                              |           |  schools   |  stalled MOUs   |
```

(Numbers will of course move as payments land.)

Hover / click affordance:
- Card 1 -> /finance/schools-receipts?fy=2026-27 (existing drilldown).
- Card 2 / 3 -> no drilldown (they're commentary on card 1).
- Card 4 -> /finance/payments?status=overdue (or similar) once the route exists. If not, link to `/finance/payments` filtered by overdue.

Card labels and copy:
- All English-words, no rupee jargon ("Contract value" stays -- it is a
  commercial term, not a jargon term).
- Subtitle of each card explains in 1 sentence what the number means.
- Hover or click on the subtitle reveals a longer definition (use the existing
  edit-history reveal component pattern -- this lets Step 4 stay terse on the
  card itself while still being self-documenting).
