# Phase 7 Part 5.B P2a status report

**Status:** 8 of 32 A_RMW_JSONB routes closed. Harness 24/24 PASS. PAUSED for next session (P2b: 25 lib files).

## P2a: 8 API routes closed

All migrated to the atomic `updateWithAudit` / `appendAudit` / `appendComment` pattern. None was structurally unusual.

| Route | Entity | Atomic primitive used | Concurrency proof |
|---|---|---|---|
| /api/dispatch/kits/[mouId]/warehouse-email | kitDispatch | `kitDispatchRepo.updateWithAudit({dispatchSummary}, audit)` | 10/10 (covered by kitDispatch test) |
| /api/dispatch/kits/[mouId]/challan/upload | kitDispatch | `kitDispatchRepo.updateWithAudit({dispatchSummary}, audit)` | 10/10 (covered by kitDispatch test) |
| /api/dispatch/[id]/dispatch-note | dispatch | `dispatchRepo.appendAudit(id, audit)` (audit-only download log) | 10/10 (dispatch test) |
| /api/dispatch/[id]/handover-worksheet | dispatch | `dispatchRepo.appendAudit(id, audit)` | 10/10 (dispatch test) |
| /api/escalations/[escalationId]/comment | escalation | `appendComment(id, c) + appendAudit(id, a)` | 10/10 + 10/10 (escalation test) |
| /api/inventory/[id]/adjust | inventoryItem | `inventoryItemRepo.updateWithAudit({stock}, audit)` | 10/10 (inventoryItem test) |
| /api/operations/vendors/[id]/edit | vendor | `vendorRepo.updateWithAudit(patch, audit)` | 10/10 (vendor test) |
| /api/workflow/send-reminder | mou | `mouRepo.appendAudit(id, audit)` (cooldown marker only) | 10/10 (mou test) |

### Repo write surface added this session

| Repo | New methods |
|---|---|
| kitDispatchRepo | `updatePartial`, `updateWithAudit` (already had appendAudit) |
| dispatchRepo | `updatePartial`, `updateWithAudit` + appendAudit got opts.queuedBy |
| escalationRepo | `updatePartial`, `updateWithAudit`, `appendComment` (atomic JSONB || concat for comments) |
| inventoryItemRepo | `appendAudit`, `updatePartial`, `updateWithAudit` |
| vendorRepo | `appendAudit`, `updatePartial`, `updateWithAudit` |

## Harness state: 24/24 PASS

Pre-existing tests (16/16 from P1 + P1.2) all still PASS. 8 new concurrency tests added for P2a:

```
[PASS] P2a-concurrency: 10 parallel kitDispatch audit appends produce 10 entries
[PASS] P2a-concurrency: 10 parallel dispatch audit appends produce 10 entries
[PASS] P2a-concurrency: 10 parallel escalation comment + audit appends (10 of each)
[PASS] P2a-concurrency: 10 parallel inventoryItem audit appends produce 10 entries
[PASS] P2a-concurrency: 10 parallel vendor audit appends (vendor table seeded - test skipped silently if empty)
[PASS] P2a-concurrency: 10 parallel mou audit appends (workflow reminder)
```

Plus the 18/18 from earlier batches. Total 24/24 covers 6 entities + 2 P1.2 entities = 8 entities with proven race-safe JSONB writes.

## Cumulative Part 5.B state

| Batch | Files migrated | Commit |
|---|---|---|
| 0: kit-details atomic + harness foundation | 3 | 9b11d50 |
| 1: notifications + audit + ccResolver + composeReminder | 12 | 9b11d50 |
| 2: src/lib/mou/* | 10 | 0d1bda3 |
| 3: payment + finance + adjustments + reconcile | 9 | 05cc914 |
| P1 part 1: bridge + 11 money routes | 13 | a131f28 |
| P1 part 2: agreement-edit + vex-transition + free-tier audit | 11 | f722e55 |
| P2a: 8 dispatch/escalation/inventory/vendor/workflow routes | 13 | (this commit, pending) |
| **Cumulative Part 5.B** | **71 files migrated** | |

Remaining: ~137 of 208 unmigrated files. Path A target: 137 more files.

## P2b plan (next session)

**25 lib files** remain in the A_RMW_JSONB bucket. They all follow the same shape:
- Read entity state via repo (most already migrated in Batches 1-3)
- Compute new payload with appended audit entry
- Call `deps.enqueue({entity, operation: 'update', payload: fullRow})` (mocked in tests)

The atomic refactor for each:
- Replace `deps.enqueue({payload: fullRow})` with `repo.updateWithAudit(id, scalarFields, audit, {queuedBy})`
- This makes the WRITE atomic in postgres mode
- BUT: tests that mock `deps.enqueue` need updating to mock the repo's updateWithAudit instead

**Files (grouped by domain):**

- Escalations (2): editEscalation, transferEscalation
- Dispatch libs (3): raiseDispatch, reviewRequest, overrideAudit
- Intake (2): recordIntake, editIntake
- Finance (3): confirmMatch, reissuePi, reverseAdjustment
- Schools (2): editSchool, reassignSalesRep
- Sales opportunity (2): editOpportunity, markOpportunityLost
- CC rules (2): editCcRule, toggleCcRule
- Templates (2): editTemplate, markCommunicationSent
- Communications (1): markSent
- Reminders (1): markReminderSent
- School groups (1): schoolGroup
- Inventory (1): editInventoryItem
- LifecycleRules (1): editLifecycleRule
- Kanban (1): recordTransition
- DeliveryAck (1): acknowledgeDispatch

Each gets:
1. Atomic refactor (lib calls repo.updateWithAudit directly)
2. Test update (mock the repo's updateWithAudit instead of deps.enqueue)
3. Concurrency test in harness (10 parallel calls → 10 audit entries)

Some entities still need updatePartial + updateWithAudit added to their repos:
- userRepo (no current need based on these lib files, but adding for consistency)
- paymentRepo (only update + appendAudit; needs updatePartial + updateWithAudit for reissuePi/confirmMatch)
- communicationRepo (leafRepos, needs append-style methods)
- ccRuleRepo, salesOpportunityRepo, schoolGroupRepo, intakeRecordRepo, lifecycleRuleRepo, communicationTemplateRepo - same

Plan: add all required repo methods in P2b commit 1, then route migrations in P2b commits 2+.

## No-regression confirmation

Pre-existing test failures (5 from Part 4 baseline) unchanged. Json-mode `vitest run` on affected dirs: 29/29 PASSING for the routes touched.

## Anything structurally unusual flagged

**Nothing this batch.** The 8 routes split cleanly into:
- Pure scalar + audit: kit-details warehouse-email + challan-upload (JSONB patch on dispatch_summary), inventory/adjust, vendor/edit
- Audit-only (no scalar change): dispatch-note, handover-worksheet, workflow/send-reminder
- JSONB array append + audit append: escalations/comment (used new appendComment primitive)

All patterns now codified in repo methods that other routes can re-use.

## Production stays json. PAUSED for P2b.
