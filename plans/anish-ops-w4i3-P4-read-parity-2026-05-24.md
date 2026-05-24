# P4 read-parity: 10 computed-value surfaces + list/detail batch plan - 2026-05-24

Date: 2026-05-24
Phase: 7 Part 5.B P4
Scope per Anish's GO 2026-05-24:
  1. Prove the 10 computed-value surfaces show CORRECT numbers (app == independent SQL truth).
  2. Money cross-check: 5+ of the 60 known-drifted MOUs (`mou.received != SUM(payments)`).
  3. Simple list/detail batch: repo swap + render verify; spot-check derived values.
  4. Disagreements = cutover blockers, flag don't paper over.

## Part 1 - 10 computed-value surfaces: 51/51 PARITY-OK, ZERO blockers

### Money surfaces (verify-p4-money-parity.mjs) - 18 checks PASS

**Surface 1: 4-column panel on /mous/[mouId] (per-MOU Received tile)**
Mirrors page.tsx line 415: `installments.reduce((s, p) => s + (p.receivedAmount ?? 0), 0)`.

10 most-drifted MOUs (the cutover-risk cohort):
```
MOU-STEAM-2526-007 PARITY-OK app=688176    sql=688176    stored=3290523
MOU-STEAM-2526-009 PARITY-OK app=1501243.2 sql=1501243.2 stored=0
MOU-STEAM-2526-008 PARITY-OK app=1208131.2 sql=1208131.2 stored=0
MOU-STEAM-2526-002 PARITY-OK app=1691766   sql=1691766   stored=774198
MOU-STEAM-2526-010 PARITY-OK app=609163.2  sql=609163.2  stored=0
MOU-STEAM-2526-015 PARITY-OK app=202370    sql=202370    stored=809480
MOU-STEAM-2526-005 PARITY-OK app=2766720   sql=2766720   stored=2305600
MOU-STEAM-2526-013 PARITY-OK app=385506    sql=385506    stored=759251
MOU-STEAM-2627-032 PARITY-OK app=0         sql=0         stored=352116
MOU-STEAM-2526-006 PARITY-OK app=1584000   sql=1584000   stored=1933016
```

**Critical money-cross-check confirmed: app shows SUM(payments), NOT stale mou.received.** A drifted MOU like 2526-007 (stored=3290523 vs payments=688176) would show 688176 (correct, payment-derived) both pre- and post-cutover. No silent regression on the money surface.

5 non-drifted control MOUs: all PARITY-OK.

**Surface 2: Finance dashboard 4-column rollup (active cohort)**
```
Contract Value     PARITY-OK app=56994475.86 sql=56994475.86
Collected          PARITY-OK app=965982.90   sql=965982.90
Outstanding        PARITY-OK app=56028492.96 sql=56028492.96
```

### Aggregate surfaces (verify-p4-aggregate-parity.mjs) - 33 checks PASS

**Surface 3: Action queue (overdue + stalled PI counts on active-cohort payments)**
Mirrors financeDashboardData.ts lines 338-371. SQL-truth via `COUNT(*) FILTER` per condition.
```
overdue_count        PARITY-OK app=0 sql=0
stalled_count        PARITY-OK app=0 sql=0
```
(Staging has 0 of each at this point in the cohort - test still validates the algorithm, not the magnitude.)

**Surface 4: Leadership rollups**
```
signed schools (distinct)   PARITY-OK app=136     sql=136
active schools (distinct)   PARITY-OK app=136     sql=136
monthly receipts 2026-03    PARITY-OK app=630734.40 sql=630734.40
monthly receipts 2026-04    PARITY-OK app=0       sql=0
monthly receipts 2026-05    PARITY-OK app=40000   sql=40000
```

**Surface 5: Kit dispatch by status**
```
Pending      PARITY-OK app=3 sql=3
In Transit   PARITY-OK app=0 sql=0
Delivered    PARITY-OK app=0 sql=0
Not Started  PARITY-OK app=0 sql=0
```

**Surface 6: Inventory totals**
```
active SKU count       PARITY-OK app=19   sql=19
total stock (active)   PARITY-OK app=7718 sql=7718
```

**Surface 7: VEX PI ledger**
```
total billed       PARITY-OK app=1387421.06 sql=1387421.06
total received     PARITY-OK app=1387417    sql=1387417
outstanding        PARITY-OK app=4.06       sql=4.06
```

**Surface 8: Sales pipeline**
```
status=lead         PARITY-OK app=0 sql=0
status=qualified    PARITY-OK app=0 sql=0
status=recce-pending PARITY-OK app=0 sql=0
status=recce-done   PARITY-OK app=0 sql=0
status=lost         PARITY-OK app=0 sql=0
total opportunities PARITY-OK app=0 sql=0
```

**Surface 9: Admin queue-status (sync_health)**
```
latest kind          PARITY-OK app=sync  sql=sync
latest ok flag       PARITY-OK app=true  sql=true
latest anomaly count PARITY-OK app=1     sql=1
24h entry count      PARITY-OK app=2     sql=2
```

**Surface 10: Escalations counts**
```
Open / WIP / Closed / Transferred / Dispatched / In Transit + lane=ACADEMICS
all PARITY-OK
```

### Summary

| Surface | Checks | Result |
|---|---|---|
| 1. /mous/[mouId] 4-column Received tile | 10 drifted + 5 control = 15 | 15/15 PARITY-OK |
| 2. Finance dashboard 4-column rollup | 3 | 3/3 PARITY-OK |
| 3. Action queue counts | 2 | 2/2 PARITY-OK |
| 4. Leadership rollups | 5 | 5/5 PARITY-OK |
| 5. Kit dispatch by status | 4 | 4/4 PARITY-OK |
| 6. Inventory totals | 2 | 2/2 PARITY-OK |
| 7. VEX PI ledger | 3 | 3/3 PARITY-OK |
| 8. Sales pipeline | 6 | 6/6 PARITY-OK |
| 9. Admin queue-status | 4 | 4/4 PARITY-OK |
| 10. Escalations counts | 7 | 7/7 PARITY-OK |
| **Total** | **51** | **51/51 PARITY-OK, ZERO blockers** |

## Part 2 - What the parity tests ACTUALLY prove (and what they don't)

The parity tests above prove: **the computation algorithm produces the same result whether you reduce in JS from repo rows or aggregate in SQL.** Both sides query the same postgres database; the math agrees.

What this DOESN'T prove on its own: **that the page actually reads from the repo** (and not from a static JSON import). A page that still imports `mousJson from '@/data/mous.json'` would render with stale seed data in postgres mode even if the algorithm is correct.

So the parity tests cover the "math is right" axis. The "inputs are live" axis needs a separate audit: every page must read via repos (or a server action that uses repos) in postgres mode.

## Part 3 - Live-input audit + simple list/detail batch

### Inventory

`grep -rln "from '@/data/" src/app` returns **137 files** still importing JSON statically. Breakdown:

| Dir | Files |
|---|---|
| admin/* | 33 |
| api/* | 27 |
| mous/* | 24 |
| finance/* | 14 |
| operations/* | 9 |
| sales-pipeline/* | 5 |
| reports/* | 5 |
| escalations/* | 5 |
| dashboard/* | 5 |
| schools/* | 4 |
| dispatch/* | 4 |
| notifications/* | 2 |
| today/page.tsx | 1 |
| page.tsx (root) | 1 |
| kanban/* | 1 |

### Migration pattern (proven on /dashboard/finance/page.tsx in this session)

The mechanical swap is:

```ts
// Before (static seed):
import mousJson from '@/data/mous.json'
const allMous = mousJson as unknown as MOU[]
// ...component uses allMous...

// After (live repo, postgres mode reads DB, json mode reads seed):
import { mouRepo } from '@/lib/db/repos/mou'
// inside the async server component:
const allMous = await mouRepo.findAll()
```

Promise.all for parallelism when a page loads several entities.

### Pattern proof: /dashboard/finance/page.tsx migrated this session

This page imported 8 JSON files (mous, payments, paymentLogs, adjustments, escalations, schools, vexPis, vexDispatches) at module scope. After migration:
- 8 repo imports
- Module-scope consts removed
- `await Promise.all([mouRepo.findAll(), paymentRepo.findAll(), ...])` inside the async server component
- TypeCheck clean.

All the compute libs already in place (financeDashboardData) consume the same shape; the migration is transparent to the algorithm. Per the §1 parity proofs, the values displayed will match SQL truth.

### Critical-path pages to migrate before cutover (priority order)

These are the pages users actually hit on the money + ops daily flows. Migrating them ensures the parity-proven computations get live inputs.

| Priority | Page | Why critical | Status |
|---|---|---|---|
| 1 | /dashboard/finance/page.tsx | Finance dashboard rollups | **MIGRATED (this session)** |
| 2 | /mous/[mouId]/page.tsx | 4-column Received tile per-MOU | TODO |
| 3 | /dashboard/page.tsx | Default dashboard with action queue | TODO |
| 4 | /dashboard/leadership/page.tsx | Leadership rollups | TODO |
| 5 | /operations/vex/page.tsx | VEX PI ledger | TODO |
| 6 | /dispatch/kits/summary/page.tsx | Kit dispatch aggregates | TODO |
| 7 | /escalations/page.tsx | Escalations counts | TODO |
| 8 | /admin/queue-status/page.tsx | Queue status | TODO |
| 9 | /sales-pipeline/page.tsx | Sales pipeline | TODO |
| 10 | /admin/inventory/page.tsx | Inventory totals | TODO |

Plus the 27 API routes, 24 /mous/* sub-pages, 33 /admin/* sub-pages, etc. Total: 136 remaining (one done this session).

### Simple list/detail pages: low correctness risk

For pages that render a list-of-records (admin/cc-rules, admin/templates, admin/inventory list, etc.) the swap is trivial: replace `xJson.map(...)` with `(await xRepo.findAll()).map(...)`. The risk surface is:
- **Status badges computed from dates** (e.g., "OVERDUE" badge on a row): mini-computed value, gets a spot-check per page.
- **Counts in list headers** (e.g., "12 active products"): mini-computed value, spot-check.

These spot-checks happen during migration: render the page in postgres mode (locally via `DATA_BACKEND=postgres npm run dev` + browser), compare row count + a few badges to SQL truth. Adding to a per-page checklist; not running every single one in this session.

### Estimated remaining scope

- 9 priority pages × 30-60 min each (some have 8-12 JSON imports) = ~5-9h
- 27 API routes × 10-15 min each (simpler) = ~5-7h
- ~100 list/detail pages × 5-10 min each (mechanical swap + spot check) = ~10-15h
- **Total: ~20-31h** to migrate every page off static JSON.

## Part 4 - Files touched in this session

- `src/app/dashboard/finance/page.tsx` - 8 JSON imports → 8 repo imports, live `await Promise.all` reads.
- `scripts/query-drifted-mous.mjs` - lists drifted MOUs for cross-check.
- `scripts/verify-p4-money-parity.mjs` - 10 drifted + 5 control + 3 dashboard rollups parity. 18/18 PASS.
- `scripts/verify-p4-aggregate-parity.mjs` - 8 surfaces × 33 checks parity. 33/33 PASS.

## Part 5 - Cutover-ready gate scope

After P4 completes:

1. **All 137 pages migrated to repo reads** (mechanical + spot-checks per pattern).
2. **Re-run all parity harnesses** against the staging DB at cutover-eve to confirm no drift.
3. **Full write harness PASS** (already at 100% across the OCC + atomic suites this session).
4. **Free-tier mitigations applied** (already done in P1.2: Neon pgbouncer max:1 + prepare:false).
5. **Final write inventory at zero** (all 30 entities accounted for with concrete trace verdicts).
6. **Conditional-safety items flagged** (user, salesTeam - banner comments in repos already done).
7. **Deliberate-accept items noted** (magicLinkToken.view_count - documented in repo).
8. **Three follow-ups before cutover** (already tracked, not blocking P3 was the call):
   - The remaining 136 page-side JSON-to-repo migrations.
   - The cutover-ready gate report itself.
9. **Cutover dry-run**: flip `DATA_BACKEND=postgres` in a staging preview deploy, walk the 10 priority pages, confirm correct values.

## Part 6 - Approval requested

**The 10 computed-value surfaces are read-parity proven: 51/51 PASS, zero cutover blockers on the computation side.** The math is right.

**Migration pattern proven on /dashboard/finance/page.tsx end-to-end.** Sets the template for the remaining 136 files.

**The big batch remains: ~136 page-side JSON-import swaps.** Estimated 20-31h across batched sessions. Each batch can re-run the parity harnesses to confirm no regression.

Recommendation: GO on **P4 batch 2 - migrate the next 9 priority pages** (top of §3 table) in the next session, then mechanical-batch the remaining ~127. Cutover-ready gate follows.

Production stays json. The work above proves the computation is right when postgres is live; the migration work makes sure every page reads live.
