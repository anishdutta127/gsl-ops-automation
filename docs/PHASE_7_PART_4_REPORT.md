# Phase 7 Part 4: Repo abstraction layer (final report)

**Status:** Complete. PAUSE for GO on Part 5.
**Date:** 2026-05-23
**Branch:** main (commits c34ea54, 9a0e1b3, plus Part 4 batch 7 + batch 8)

## What landed

The `DATA_BACKEND=json|postgres` switch now covers every entity in
`src/data/`. Default stays `json`; production behaviour is unchanged.
Each repo file branches on `currentBackend()`; json mode reads from
the bundled JSON and writes via the GitHub Contents API queue; postgres
mode reads/writes the seeded staging table. Production stays json
until Part 5 GO.

### Repos shipped (commits 1-8)

| Commit | Repos | Tests |
|---|---|---|
| Part 4 commit 1 (earlier) | userRepo, counterRepo | user.parity 6, counter.atomicity 3, user.auditConcurrency 1 |
| Part 4 commit 2 (earlier) | schoolRepo, salesTeamRepo | school.parity 5, salesTeam.parity 5 |
| Part 4 commit 3 (earlier) | vendorRepo, inventoryItemRepo, vexProductRepo | leafEntities.parity 8 |
| Part 4 commit 4 (earlier) | mouRepo | mou.parity 6 |
| Part 4 commit 5 (c34ea54) | paymentRepo, dispatchRepo, kitDispatchRepo | financeDispatch.parity 11 |
| Part 4 commit 6 (9a0e1b3) | vexPiRepo | vexPi.parity 4 |
| Part 4 commit 7 | escalationRepo, notificationRepo | escalationNotification.parity 8 |
| Part 4 commit 8 | 24 leaf repos in leafRepos.ts | leafRepos.parity 24 |

### Coverage

- 38 staging tables / 38 covered by a repo (14 individual repo files + 1 barrel file)
- 81 parity tests total green against the seeded staging Neon branch
- 0 regressions in the wider test suite (7 pre-existing failures verified unchanged via stash test)
- JSONB write-parity round-trip proven on: users.audit_log, mous.lifecycleSnapshot + workflowStages + lineItems, payments.partial_payments + audit_log, dispatches.line_items, kit_dispatches.allocations + dispatch_summary + shipment_tracking + pod, vex_pis.lineItems + paymentLogIds, escalations.comments + notifiedEmails, notifications.payload

## Parity divergences (all documented + allow-listed in the relevant test)

### Bucket A: archive payments restored to postgres after seed (postgres-side enrichment)

All 9 archive payment IDs appear in both backends now (json was updated to match):

```
MOU-STEAM-2526-001-i1, MOU-STEAM-2526-001-i2, MOU-STEAM-2526-027-i1,
MOU-YP-2526-001-i1, MOU-YP-2526-001-i2,
MOU-YP-2526-002-i1, MOU-YP-2526-002-i2,
MOU-YP-2526-003-i1, MOU-YP-2526-003-i2
```

Parity is now strict-equal on `paymentRepo.findAll()` ID sets.

### Bucket B: demo entries in json that postgres deliberately omits

These reference demo schools (SCH-RIVERDALE-MUM, SCH-OAKWOOD-DEL,
SCH-MAPLELEAF-BLR, SCH-CEDARHEIGHTS-CHN) which we did NOT seed into
postgres. Clean staging strategy; not bugs.

| Entity | Json-only IDs |
|---|---|
| dispatchRepo | DIS-001, DIS-002, DIS-004, DIS-005 |
| escalationRepo | ESC-001, ESC-003, ESC-004, ESC-005 |
| dispatchRequestRepo | DR-MOU-STEAM-2627-001-i1-20260427100000, DR-MOU-STEAM-2627-009-i1-20260426093000 |
| communicationRepo | COM-WLC-001, COM-T30-001, COM-T14-001, COM-T7-001, COM-ACR-001, COM-PIS-001, COM-PRC-001, COM-DSR-001, COM-DAR-001, COM-FBR-001, COM-CLT-001, COM-WAD-001, COM-WAD-002, COM-BNC-001 |
| magicLinkTokenRepo | MLT-FB-001, MLT-SV-001 |
| feedbackRepo | FBK-001, FBK-002, FBK-004, FBK-005, FBK-006, FBK-007 |
| signedValueRepo | MOU-YP-2627-DRAFT-003 |

When Part 5 cuts over, either (a) production demo data gets removed
from the JSON files, or (b) we backfill these into postgres with the
missing FK records. The choice is a Part 5 decision; both work.

### Bucket C: runtime drift (append-only logs)

| Entity | Drift cause |
|---|---|
| syncHealth | Json gets new rows every 5 minutes from the cron drainer. Postgres is a snapshot. After cutover both will converge. Parity test asserts both reachable + return arrays, not identical row counts. |

### Bucket D: shape divergences (handled by adapter on findAll)

| Entity | JSON shape | Postgres shape | Adapter |
|---|---|---|---|
| reminderThresholdRepo | `{ kind: row }` object | row-per-kind | findAll emits `[{kind, ...row}]` from both |
| chainDismissalRepo | `{ dismissedSchoolIds: string[] }` | row-per-schoolId | findAll emits `[{schoolId}]` from both |

Parity assertion passes in both shape-adapted forms.

## Non-divergences explicitly verified

- All seeded-and-cohort MOUs round-trip identically (mouRepo write-parity test)
- 20 parallel `counterRepo.bumpPiCounter` produces 20 distinct sequence numbers (no lost writes)
- 10 parallel `userRepo.appendAudit` calls leave 10 distinct entries (no lost writes)
- Every JSONB column listed above round-trips byte-equal (deep-equal post-normalisation)
- Null vs undefined: writing `null` for a nullable JSONB column reads back as `null` (not `undefined` or `{}`)

## Conditions Anish required, status

- [x] **Default stays `json`.** `currentBackend()` returns `'json'` when env unset.
- [x] **Production behaviour MUST be unchanged.** No call-site has been migrated. Repos exist but are unused at runtime. Wider test suite has 0 new failures.
- [x] **Parity tests assert PARITY, not just "it runs".** Read-parity asserts ID-set equality (with allow-listed divergences); write-parity asserts deep-equal round-trip after mutation.
- [x] **Dependency-ordered multiple commits, NOT big-bang.** 8 commits across users/counters → schools/sales → leaf-ish → mou → finance → vex → escalation/notification → leaf24.
- [x] **`sql.savepoint()` is the permanent rule.** Documented in PHASE_7_MIGRATION_PLAN.md §4.5. No `sql.unsafe('SAVEPOINT')` anywhere.
- [x] **Counter atomicity + audit-append concurrency tests.** counter.atomicity.test.ts + user.auditConcurrency.test.ts.

## DNS fallback retrofit

Added `@vitest-environment node` to all parity test files. Previously
the parity tests ran in jsdom env, where Vite externalises `node:dns`
and the DNS-fallback patch in `client.ts` never installed. On any
machine where the ISP can't resolve Neon hostnames directly (e.g. local
dev on Reliance), the patch is what makes the tests work. Affected
files:

```
src/lib/db/repos/__tests__/{user,school,leafEntities,mou,salesTeam,
                            counter.atomicity,user.auditConcurrency,
                            financeDispatch,vexPi,escalationNotification,
                            leafRepos}.parity.test.ts
```

## Production stays json

Verified at the time of report:

```
$ grep DATA_BACKEND .env.local
DATA_BACKEND=json
```

Production deploy reads the same default. Postgres is unused by the
running app today.

## Part 5 prerequisites (not started)

Per the original migration plan and the user's "PAUSE for GO" gate:

1. Decide demo-data handling (Bucket B): backfill into postgres or
   purge from json. Both are reversible.
2. Pick the first call-site to migrate (recommendation: `getCurrentUser`
   in `src/lib/auth/getCurrentUser.ts`, which only reads `userRepo`).
3. Migrate behind a hidden env flag, walk the E2E flow on staging,
   confirm UI parity, then flip in prod.
4. Repeat per call-site cluster (finance, dispatch, escalation,
   leadership reads...).

End of Part 4. Awaiting GO on Part 5.
