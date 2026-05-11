# Gate 3.5 Step 3: hidden routes (Sales pipeline)

Per Anish (Gate 3.5 brief): "we don't need the Sales pipeline in this right now, we will add the Sales part later." This doc tracks every Sales-module route that has been hidden from nav surfaces so the un-hide path is one search away when the Sales module returns.

**Principle:** routes stay reachable by direct URL for Admin testing during the pilot; only the nav-surface affordances are removed. No code deleted; no tests removed.

---

## Routes hidden from nav

| Route | What it does | Still reachable via |
|---|---|---|
| `/sales-pipeline` | Pre-MOU opportunity list | direct URL |
| `/sales-pipeline/new` | Create a new opportunity | direct URL |
| `/sales-pipeline/[id]` | Opportunity detail | direct URL |
| `/sales-pipeline/[id]/edit` | Edit opportunity | direct URL |
| `/sales-pipeline/[id]/mark-lost` | Mark opportunity as lost | direct URL |

All five routes still exist in `src/app/sales-pipeline/`. Their server actions in `src/app/sales-pipeline/actions.ts` still work. Existing tests in `src/app/sales-pipeline/*.test.tsx` still run and pass.

---

## Nav surfaces touched

1. **TopNav** (`src/components/ops/TopNav.tsx`): NAV_STAGES no longer contains the Pipeline stage. Six stages today instead of seven. The header comment captures the Gate 3.5 Step 3 decision.
2. **Operations Control Dashboard** (`src/app/page.tsx`): `DashboardSalesPipelineSummary` block removed from JSX. The component file remains at `src/components/ops/dashboard/DashboardSalesPipelineSummary.tsx` for the un-hide path. The Gate 1 MM6 department-conditional rule (Ops users do not see the summary) is preserved in git history.
3. **Sales dashboard** (`src/app/dashboard/sales/page.tsx`): the Sales Pipeline tile in PRIMARY_ACTIONS removed and replaced with a placeholder banner above the action card row: "Sales module coming in next phase. For now, use [MOU drafting] to record signed MOUs." Remaining tiles: Active MOUs, Draft new MOU (added per Step 4), Schools, Approve dispatches.
4. **FilterRail** (`src/components/ops/FilterRail.tsx`): no filter dimension referenced the Sales pipeline; only inline comments mention the route. No JSX change needed.

---

## Un-hide path

When the Sales module returns (anticipated post-cutover Gate 5+):

1. **TopNav:** restore the Pipeline stage to NAV_STAGES. Single line addition. The header comment in `TopNav.tsx` (Gate 3.5 Step 3) names the change.
2. **Operations Control Dashboard:** re-import `DashboardSalesPipelineSummary`, restore the `buildSalesPipelineSummary` call from the void-stub, restore the conditional `{showSalesPipelineSummary ? ... : null}` JSX. The Gate 1 MM6 department-conditional logic block is captured in commit history before Gate 3.5; restore from there.
3. **Sales dashboard:** delete the placeholder banner div + re-add the Sales pipeline tile to PRIMARY_ACTIONS.
4. **No nav-surface changes elsewhere.**

Estimated effort to un-hide: 30 minutes including a regression test pass.

---

## What was NOT touched

- The 5 sales-pipeline routes themselves (page.tsx, layout, actions.ts).
- Existing sales-pipeline tests (5 test files: `page.test.tsx`, `[id]/page.test.tsx`, `new/page.test.tsx`, etc.).
- `src/lib/dashboard/dashboardData.ts` `buildSalesPipelineSummary` function (still exported for the un-hide).
- `src/data/sales_opportunities.json` (data file preserved).
- Any escalation cross-reference to a sales-pipeline opportunity (Gate 1 audit-edit page mentions /sales-pipeline in a comment).

---

## Tests passing

After Step 3 commit, the following test classes still pass:
- `src/app/sales-pipeline/*.test.tsx` (existing pipeline test suite; routes still work).
- `src/app/page.test.tsx` (Operations Control Dashboard tests; the test suite did not assert presence of the Sales Pipeline summary block specifically -- verified pre-Step 3).
- `src/app/dashboard/sales/page.test.tsx` (if it exists; verify after edit).
- All nav-rendering tests across the platform (TopNav stage count drops to 6; tests that hard-coded a 7-stage count are flagged in `STEP3_5_QUESTIONS.md` and updated).

If any test fails on stage count, update the test to expect 6 stages with a comment referencing this doc.
