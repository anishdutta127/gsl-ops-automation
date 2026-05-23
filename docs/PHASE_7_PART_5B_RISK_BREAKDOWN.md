# Phase 7 Part 5.B risk breakdown

**Total unmigrated:** 208 files (the +9 vs earlier "199" is because /admin/audit/page.tsx still has its own users.json import beyond what collectAuditRows migrated, plus a few other detail surfaces I missed at first count).

## Three buckets

| Bucket | Count | What it is | Cutover blocker? |
|---|---|---|---|
| **A_RMW_JSONB** | **34** | WRITE routes/libs that read a JSONB column, mutate it client-side, write the whole row back. The Blocker 1 race class. Two parallel callers lose one of two writes. | **YES** for all 34. Must migrate to atomic appendAudit/updatePartial pattern + concurrency-test each one. |
| **B_WRITE** | **36** | WRITE routes/libs that call enqueueUpdate but do NOT mutate JSONB arrays. Scalar field updates. | **Partially.** Of these, 11 write entities that the backend-aware enqueueUpdate bridge does NOT yet dispatch to postgres (writes land in queue, never reach Postgres in postgres-mode). Those 11 are cutover blockers. The remaining 25 land in postgres via the bridge but still race on full-row replace if two callers concurrent-write. |
| **C_READ_ONLY** | **138** | No writes; just renders data. In postgres mode they read stale BUNDLED json (frozen at build time). Users see stale data, possibly take wrong action. UX risk, not data corruption. | **Not a hard blocker.** Could go to production with stale reads on these surfaces, BUT the demo experience suffers (data doesn't reflect recent writes from other users). Strongly recommended to migrate, but can be done post-cutover if there's pressure. |

## Bridge dispatcher coverage

The backend-aware `enqueueUpdate` (committed in `9b11d50`) dispatches these entities directly to their postgres repo in `DATA_BACKEND=postgres` mode:

```
mou, user, school, payment, dispatch, kitDispatch, escalation,
notification, vexPi, vendor, inventoryItem, salesTeam, vexProduct
```

For these entities the lib/route still calls `enqueueUpdate(...)`; the bridge intercepts and routes the write to postgres instantly. Json mode unchanged.

### Entities the bridge does NOT yet dispatch (writes silently fall back to queue and never reach postgres):

| Entity | Unmigrated writes | Files |
|---|---|---|
| adjustment | 1 | api/mou/installments/edit/route.ts |
| agreement | 3 | api/operations/agreements/[id]/edit, create, [id]/terminate routes |
| magicLinkToken | 2 | api/feedback/submit/route.ts, app/portal/status/[tokenId]/page.tsx |
| paymentLog | 2 | api/finance/payment/log, api/finance/payment/bulk-import |
| studentCountEvent | 1 | api/mou/[mouId]/student-count/route.ts |
| vexDispatch | 2 | api/operations/vex/pi/[id]/dispatch/create, [dispatchId]/transition |
| **Total** | **11** | - |

These 11 are **cutover blockers** even on Path B. Either extend the bridge dispatcher to cover these entities (cheap, 10 lines per entity in pendingUpdates.ts), or migrate the call sites fully. The bridge extension is the smaller change.

### What about the [?] entries in A_RMW_JSONB?

Many A_RMW_JSONB files use a `deps.enqueue(...)` indirection so the script couldn't identify the entity statically. Spot-checking a few: every `src/lib/<domain>/*` file enqueues for the corresponding entity (escalations/* → 'escalation', communications/* → 'communication', schools/* → 'school', etc.). The bridge-coverage table holds: any A_RMW_JSONB write for a non-bridged entity is doubly blocked (race + lost write).

## Strategic decision: Path A vs Path B

### Path A (migrate all 208 before cutover)
- **Effort:** ~6-10 sessions at current pace.
- **Safety:** full. Users always see live postgres data. No stale reads, no race losses except the documented baseline-60 drift.
- **What's verified at cutover:** every named surface plus every list view, every audit log surface, every admin page.

### Path B (migrate writes + bridge gaps + Blocker 1, leave reads for post-cutover)
- **What to migrate before cutover:**
  - 34 A_RMW_JSONB (must - race fix + atomic refactor + concurrency test)
  - 6 entity classes to add to bridge dispatcher (adjustment, agreement, magicLinkToken, paymentLog, studentCountEvent, vexDispatch) - tiny addition to pendingUpdates.ts
  - The 11 specific write call sites that target those entities still need atomicity review (do they RMW or simple scalar?). Recheck after bridge extension.
- **Effort:** ~3-5 sessions to clear the 34 RMW_JSONB + bridge extension + sanity check on the 11.
- **What goes to cutover with KNOWN staleness:** 138 read-only pages render bundled-json snapshot. Users see data frozen at build time on those surfaces.
- **Risk profile:**
  - Data corruption: **mitigated** (writes all land correctly in postgres, race-safe)
  - UX staleness: **present** on 138 pages. Users on those surfaces don't see recent updates from other users.
  - Post-cutover migration: each read-only page is a 5-line mechanical change (`import X from '@/data/x.json'` → `import { xRepo } from '@/lib/db/repos/x'` + `await xRepo.findAll()`). Could ship one batch per week post-cutover with low risk.

### Recommendation

**Path B is the right call.** Reasoning:
- The 138 read-only pages are pure UX, not data-corruption risk.
- Path B closes the data-loss risk (Blocker 1 + bridge gaps) in ~half the time.
- Post-cutover, the 138 reads get migrated in parallel with active product work, not blocking demo.
- The user-facing tile values that drive decisions (Received tile, MOU registry, dashboard counters) can be selectively migrated in the Path B work as "demo-critical" reads, while admin/audit/reports stay on bundled json for now.

### Path B punch list (target for completion before Part 6 cutover)

1. **Bridge extension** (1 commit, ~30 min): add adjustment, agreement, magicLinkToken, paymentLog, studentCountEvent, vexDispatch to the `pendingUpdates.ts` dispatcher. Also add repo update/create methods on the leafRepos for these where missing. Re-run harness; assert these writes now hit postgres.

2. **Batches 3-6** (already planned, ~4 sessions): migrate the write libs (payment, finance, dispatch, intake, escalations, templates, reminders, schools, sales, ops, inventory, imports). Each batch includes:
   - imports/defaultDeps converted to repos
   - For A_RMW_JSONB call sites in the batch: refactor to atomic pattern (mouRepo.updateWithAudit or equivalent on other entities; add appendComment, appendAllocation, appendLineItem methods to repos as needed)
   - Add concurrency test to the harness per route
   - Json-mode tests stay green at each step

3. **Demo-critical read paths** (subset of C_READ_ONLY, ~15-25 pages): homepage, /today, /mous, /mous/[id], /mous/archive, /schools/[id], /finance/payments, /admin/pi-counter, /admin/queue-status, /admin/finance-drift (when built). These are surfaces users look at during the demo + early production use. Migrate to repos with the page.tsx → `await xRepo.findAll()` pattern.

4. **Post-cutover Part 7** (deferred): remaining ~115 read-only pages. Migrate progressively over several weeks. Each page failure isolated; no data corruption risk.

5. **Final pre-cutover harness expansion**: every named function in the verification list gets three-layer PASS with the new write paths. The concurrency test now runs against multiple routes, not just kit-details.

## A_RMW_JSONB full list (the 34 must-fix-before-cutover files)

```
src/app/api/dispatch/kits/[mouId]/challan/upload/route.ts          [kitDispatch]
src/app/api/dispatch/kits/[mouId]/warehouse-email/route.ts         [kitDispatch]
src/app/api/dispatch/[id]/dispatch-note/route.ts                   [dispatch]
src/app/api/dispatch/[id]/handover-worksheet/route.ts              [dispatch]
src/app/api/escalations/[escalationId]/comment/route.ts            [escalation]
src/app/api/inventory/[id]/adjust/route.ts                         [inventoryItem]
src/app/api/operations/agreements/[id]/edit/route.ts               [agreement - NOT BRIDGED]
src/app/api/operations/vendors/[id]/edit/route.ts                  [vendor]
src/app/api/workflow/send-reminder/route.ts                        [mou]
src/lib/ccRules/editCcRule.ts                                      [ccRule via deps - NOT BRIDGED]
src/lib/ccRules/toggleCcRule.ts                                    [ccRule via deps - NOT BRIDGED]
src/lib/communications/markSent.ts                                 [communication via deps - NOT BRIDGED]
src/lib/deliveryAck/acknowledgeDispatch.ts                         [dispatch via deps]
src/lib/dispatch/overrideAudit.ts                                  [mou via deps]
src/lib/dispatch/raiseDispatch.ts                                  [dispatch via deps]
src/lib/dispatch/reviewRequest.ts                                  [dispatchRequest via deps - NOT BRIDGED]
src/lib/escalations/editEscalation.ts                              [escalation via deps]
src/lib/escalations/transferEscalation.ts                          [escalation via deps]
src/lib/finance/confirmMatch.ts                                    [paymentLog via deps - NOT BRIDGED]
src/lib/finance/reissuePi.ts                                       [payment via deps]
src/lib/finance/reverseAdjustment.ts                               [adjustment via deps - NOT BRIDGED]
src/lib/intake/editIntake.ts                                       [intakeRecord via deps - NOT BRIDGED]
src/lib/intake/recordIntake.ts                                     [intakeRecord via deps - NOT BRIDGED]
src/lib/inventory/editInventoryItem.ts                             [inventoryItem via deps]
src/lib/kanban/recordTransition.ts                                 [mou via deps]
src/lib/lifecycleRules/editLifecycleRule.ts                        [lifecycleRule via deps - NOT BRIDGED]
src/lib/reminders/markReminderSent.ts                              [communication via deps - NOT BRIDGED]
src/lib/salesOpportunity/editOpportunity.ts                        [salesOpportunity via deps - NOT BRIDGED]
src/lib/salesOpportunity/markOpportunityLost.ts                    [salesOpportunity via deps - NOT BRIDGED]
src/lib/schoolGroups/schoolGroup.ts                                [schoolGroup via deps - NOT BRIDGED]
src/lib/schools/editSchool.ts                                      [school via deps]
src/lib/schools/reassignSalesRep.ts                                [school via deps]
src/lib/templates/editTemplate.ts                                  [communicationTemplate via deps - NOT BRIDGED]
src/lib/templates/markCommunicationSent.ts                         [communication via deps - NOT BRIDGED]
```

14 of these write to NOT-BRIDGED entities. Bridge extension covers those entities + atomic pattern covers the JSONB RMW; both gaps must be closed for cutover.

## Numbers summary

- 208 total unmigrated
- **34 A_RMW_JSONB** (must fix - atomic + concurrency test + maybe bridge extend)
- **36 B_WRITE** (11 bridge-missing must fix; 25 bridge-safe writes can stay scalar-only)
- **138 C_READ_ONLY** (Path A migrates all; Path B defers most)

Net Path B work before cutover: **34 A + 6 bridge entity adds + 11 specific write call site recheck + ~20 demo-critical reads = ~71 files**. About 1/3 the Path A scope.

End of risk breakdown. Continuing with Batch 3 (payment/finance/adjustments, write-priority).
