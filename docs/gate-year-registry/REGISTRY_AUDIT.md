# /mous registry audit + FY definition

**Gate:** Phase 3 year-based MOU registry navigation (2026-05-19).
**Trigger:** Pranav review item #1.

## Current /mous registry

| Aspect | State |
|---|---|
| Route | `src/app/mous/page.tsx` (server component) |
| Cohort filter | `mou.cohortStatus === 'active'` (archived MOUs only at `/mous/archive`) |
| Dimension filters | status, programme, region (with NE / SW super-region shortcuts), schoolGroup, year (academicYear equality) |
| Text search | id / schoolName / programmeSubType / notes |
| Stage filter | `?stage=<kanbanKey>` deep-link from kanban column headers |
| Default landing | unfiltered active cohort, all academic years mixed |
| Table columns | MOU id, School, Programme, Status, Students (actual / committed) |
| Other CTAs | `+ New MOU` (canEditMOU), `Drafts (n)` (canEditMOU; landed in stabilise gate `407251b`), `View archived` |

The existing `year` dimension is an `academicYear` chip filter (option set derived from the cohort's distinct values). It is single-FY: each MOU carries one `academicYear` value. Multi-year MOUs (Apr 2026 - Mar 2028) are tagged with their starting FY only. That is the gap this gate closes.

## Existing FY helpers

| Helper | Location | Behaviour |
|---|---|---|
| `fiscalYearOfIso(isoDate)` | `src/lib/dashboard/leadershipData.ts:62` | Returns Indian FY label e.g. `"2026-27"` for a 2026-05-19 date. |
| `priorFy(label)` | `src/lib/dashboard/leadershipData.ts:72` | Returns the previous FY label (input `"2026-27"` -> `"2025-26"`). |
| `computeFinancialHealth({ mous, payments, fy, now })` | `src/lib/dashboard/leadershipData.ts:80` | Filters by `m.academicYear === fy` equality only; does NOT consider instalment-due-date FY membership. |
| `scopeMous` inside `fySummary.ts` | `src/lib/reports/fySummary.ts:89` | Same equality filter when `filters.fy` is set; or overlap window when explicit `from`/`to` are set. |

**Decision:** keep the existing `"2026-27"` label format. The brief's example URL was `?year=FY2026-27` but the codebase uses `"2026-27"` everywhere (`mou.academicYear`, `fiscalYearOfIso`, `priorFy`, dashboard FY toggle). Introducing an `FY` prefix would force a parallel format internally for no functional gain. Surface convention deviation: the URL param will be `?year=2026-27`.

## MOU schema fields relevant to year membership

| Field | Type | Used for | Notes |
|---|---|---|---|
| `MOU.academicYear` | string e.g. `"2026-27"` | Historical "primary" FY | Single value. The wizard sets it; pranavApply.ts sets it. Not enough for multi-year membership. |
| `MOU.startDate` / `MOU.endDate` | ISO yyyy-mm-dd \| null | Duration of the contract | Source of truth for draft / unsigned MOUs that have zero payments. |
| `Payment.dueDateIso` (per MOU's payments) | ISO yyyy-mm-dd \| null | When the instalment is due | Drives year membership for any MOU with instalments. |
| `Payment.expectedAmount`, `Payment.receivedAmount` | number | Year-scoped totals | Brief's per-row year contract value / received / balance. |

## Multi-year MOU count in production data

```
$ node -e "
  const m=require('./src/data/mous.json');
  const multi=m.filter(x => {
    if (!x.startDate || !x.endDate) return false;
    const s=new Date(x.startDate), e=new Date(x.endDate);
    const months=(e.getFullYear()-s.getFullYear())*12 + (e.getMonth()-s.getMonth());
    return months > 12;
  });
  console.log('Total MOUs:', m.length, 'Multi-year (>12mo):', multi.length);
"
Total MOUs: 179 Multi-year (>12mo): 31
```

So roughly **17 percent of MOUs are multi-year** (e.g. `MOU-STEAM-2627-001` Apr 2026 - Mar 2028). These currently surface only in their starting `academicYear` filter, which is the exact gap Pranav flagged.

Payment due-date FY distribution (where this gate will derive year membership from):

```
2024-25: 13 instalments
2025-26: 110 instalments
2026-27: 137 instalments
```

So three FYs are relevant in production data today; the picker will need to render three pills.

## "Current FY" derivation across the codebase

- Dashboard FY toggle reads from URL `?fy=<label>` with a default chosen elsewhere.
- `fySummary.ts` uses `filters.fy` from the report-filters parser.
- Today's date drives the default via `fiscalYearOfIso(now.toISOString())`.

This gate's `getCurrentFinancialYear()` will be a thin re-export of the same `fiscalYearOfIso(new Date().toISOString())` call so there is exactly one definition of "today's FY" in the codebase.

## Year membership rule

**Decision (from brief, building to it):**

`getFinancialYearsForMou(mou, payments)` returns the set of FY labels that include this MOU:

1. Collect `fiscalYearOfIso(p.dueDateIso)` for every `Payment` where `p.mouId === mou.id` and `p.dueDateIso !== null`.
2. If the set is non-empty, return it sorted ascending.
3. Otherwise (draft / unsigned MOU with no payments), fall back to the FY range spanned by `[mou.startDate, mou.endDate]`. Enumerate each FY between (inclusive). Return that.
4. If neither payments nor startDate / endDate are usable, return `[mou.academicYear]` as a last resort.

This rule means an Apr 2026 - Mar 2028 MOU with instalments due 2026-07, 2027-01, 2027-07 shows up in both `2026-27` and `2027-28` picker views, with year-specific instalment subsets in each.

## Filters preserved + chained

The existing filter rail (status / programme / region / schoolGroup / search) chains AFTER the year filter. The chained set:

```
allMous
  -> cohortStatus==='active'  (W4-A.3)
  -> visible to user          (scopeMousForUser)
  -> in year                  (new yearMembership rule)
  -> stage filter (kanban)    (existing W3-C deep-link)
  -> dimension filters        (existing chip filters)
  -> text search              (existing q param)
```

The existing `academicYear`-equality chip filter at `dimensions.year` is **retired and replaced** by the new year picker pill row. The dimension key `year` stays in the URL parsing for backwards compatibility with bookmarked kanban links but no chip rail option is rendered for it.

## Row data: year-scoped vs lifetime

Existing columns: MOU id, School, Programme, Status, Students.

Per the brief, when a year is selected the row carries year-scoped financials:

| Column | Source |
|---|---|
| MOU id | `mou.id` |
| School | `mou.schoolName` |
| Programme | `mou.programme` |
| Status | `mou.status` |
| Year contract value | sum of `expectedAmount` over `getYearSpecificInstalments(mou, fy, payments)` |
| Year received | sum of `receivedAmount` |
| Year instalments | count of `getYearSpecificInstalments` |
| Total contract value | `mou.contractValue` (rendered small, secondary) |

The brief listed seven year-aware columns plus Total. The existing table has Students which is not in the brief's column list. Decision: keep Students column too. The brief is additive ("Order: # / Due Date / % / Expected Amount / Received / Status / Actions" pattern from Phase 2) so dropping Students would surprise existing users.

## Out of scope (BACKLOG)

These naturally surface from year-based registry navigation but are not in this gate:

- Year-aware School pages (schools that span multiple FYs)
- Year-aware SalesPerson performance views
- Year-aware Sales Targets entity (new schema)
- Multi-year revenue projection / billing forecast
- Year-rollup roll-forward (auto-archive at FY-end)

Flag for separate gates after Pranav confirms year-based registry lands as intended.

## Decision summary

Build a `src/lib/mou/yearMembership.ts` library exporting five functions per the brief. Use existing `fiscalYearOfIso` from leadershipData (re-export or call). Year format is `"2026-27"` (not `"FY2026-27"`). Year membership uses payment due dates first, falls back to MOU duration. Replace the existing `year` chip filter with a pill row; preserve URL param compatibility. Row data switches to year-scoped financials when a year is active.
