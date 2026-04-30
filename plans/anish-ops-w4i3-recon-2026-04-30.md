# W4-I.3.1 read-path architecture reconnaissance

**Date:** 2026-04-30. **Author:** Anish (with CC). **Status:** recon. No code changes in this batch.

Reconnaissance for the W4-I.3 read-path reshape decision (B1 / B2 / B3) and the round-2 testing-continuity decision (Y1 / Y2 / Y3). Findings are grounded in the current codebase; numbers are exact counts, not estimates.

---

## 1. Read-path audit

### 1.1 Per-entity import counts

99 distinct files under `src/` import from `@/data/*.json`. Counted by `grep -rn "^import \w\+Json from '@/data/(\w\+)\.json'" src/`, then collapsed by entity. Each line is a top-level static import (Next 14 bundles the JSON contents into the build artefact at compile time):

| Entity                  | Read-path consumers |
| ----------------------- | ------------------: |
| `users`                 |                  44 |
| `mous`                  |                  44 |
| `schools`               |                  36 |
| `sales_team`            |                  23 |
| `dispatches`            |                  21 |
| `communications`        |                  14 |
| `payments`              |                  13 |
| `feedback`              |                  10 |
| `cc_rules`              |                   9 |
| `sales_opportunities`   |                   8 |
| `inventory_items`       |                   8 |
| `intake_records`        |                   8 |
| `school_groups`         |                   6 |
| `notifications`         |                   6 |
| `dispatch_requests`     |                   6 |
| `escalations`           |                   5 |
| `magic_link_tokens`     |                   3 |
| `lifecycle_rules`       |                   3 |
| `reminder_thresholds`   |                   2 |
| `mou_import_review`     |                   2 |
| `sync_health`           |                   1 |
| `school_spocs`          |                   1 |
| `pi_counter`            |                   1 |
| **Total import lines**  |             **268** |

23 distinct JSON entity files in `src/data/`. The brief said 21; the discrepancy is `pi_counter`, `sync_health`, and `payment_logs` (the third does not appear in any read-path import).

### 1.2 Static vs request-time

Every entity file is imported at the top of the consuming module. Next 14's bundler resolves these statically; a `require('@/data/schools.json')` at request time would be dynamic, but no consumer uses that pattern. Net effect: the canonical JSON file is **frozen into the deployed build artefact**. Updating the file in the repo without redeploying is invisible to Vercel.

### 1.3 The most-touched entities

`users`, `mous`, `schools`, `sales_team` together account for 147 of 268 import lines (55%). Any reshape that requires re-plumbing reads will hit those four hardest. `users` in particular is read by every authentication-touching path, including middleware-adjacent code.

---

## 2. Write-path audit

### 2.1 Call-site count

45 call sites of `deps.enqueue({...})` across 34 lib files (excluding tests). One additional indirect call from `feedback/autoEscalation.ts` calls `enqueue` directly (passed in, not from `deps`). Total: **46 enqueue invocations**.

### 2.2 Per-entity write distribution

Counted by `grep -A2 "deps.enqueue({"` then matching the `entity:` field:

| Entity              | Enqueues |
| ------------------- | -------: |
| `mou`               |        9 |
| `dispatch`          |        5 |
| `dispatchRequest`   |        4 |
| `communication`    |        4 |
| `salesOpportunity`  |        3 |
| `notification`      |        3 |
| `inventoryItem`     |        3 |
| `ccRule`            |        3 |
| `schoolGroup`       |        2 |
| `payment`           |        2 |
| `school`            |        1 |
| `salesTeam`         |        1 |
| `mouImportReview`   |        1 |
| `magicLinkToken`    |        1 |
| `lifecycleRule`     |        1 |
| `intakeRecord`      |        1 |
| `escalation`        |        1 |

### 2.3 Operation distribution

Of the 45 explicit-string operations: **29 update**, **15 create**, **1 conditional** (`existing ? 'update' : 'create'` in `raiseDispatch.ts`). No `delete` operations anywhere; entities are soft-deleted via boolean flags or `lossReason`/`active` fields, not removed from the JSON arrays.

### 2.4 Audit log shape

Every write builds an `AuditEntry` with `{timestamp, user, action, before?, after?, notes?}` and pushes it onto the entity's `auditLog[]`. The full updated entity is then enqueued via `appendToQueue`. The queue entry shape is `{id, queuedAt, queuedBy, entity, operation, payload, retryCount}`. Audit history therefore lives **inside each entity record**, not in a separate audit table.

---

## 3. Queue → sync runner mechanics

### 3.1 The sync runner does not exist

This is the headline finding. CLAUDE.md and the lib-level docstrings refer to "the self-hosted sync runner" that "consumes the queue on its next tick: applies each entry to the master Excel via openpyxl, writes the result back out to JSON, and clears the entry." **No such runner exists in this repo.**

Evidence:

- No GitHub Actions workflow under `.github/workflows/` does anything beyond docs-lint. The `sync-and-deploy.yml` referenced in CLAUDE.md (inherited from `gsl-mou-system`) is not present.
- No script under `scripts/` drains `pending_updates.json` into entity files. The openpyxl-using scripts (`w4c-backfill-intake.mjs`, `w4d-mastersheet-mutation.mjs`, `w4e-spoc-import-mutation.mjs`, `w4g-inventory-import-mutation.mjs`) are one-shot backfills that read the legacy Mastersheet xlsx and ENQUEUE; they do not consume the queue.
- `/api/sync/tick` is **not a drain step**. It is a health check: reads `pending_updates.json` + `pi_counter.json`, validates JSON shape and counter monotonicity, appends a result entry to `sync_health.json`. It does not move pending creates/updates into entity files.
- `/api/mou/import-tick` runs `fromMou.importOnce()`, which reads upstream MOU sheets and ENQUEUES new records to the queue. It does not drain.

The RUNBOOK confirms the gap explicitly at line 428: "Phase 1 keeps sync simple: an Admin clicks 'Run import sync now' or 'Run health check now' on `/admin`; lib code runs the same path that a cron-runner would. **No GitHub Actions workflow attached yet.**"

### 3.2 What this means in production

Every write since launch has enqueued to `pending_updates.json` and remained there. Entity JSONs (`schools.json`, `mous.json`, etc.) have only changed via direct human commits (the `feat(...)` and `chore(...)` commits in `git log`). The 3 `chore(queue): append school.create` commits Misba just generated are sitting in `pending_updates.json` on `origin/main` with no path to ever reach `schools.json` until a human merges them.

### 3.3 What was the design intent

Read against `gsl-mou-system` (a sibling project per CLAUDE.md). That project's hourly GitHub Actions cron triggers a workflow that:

1. Pulls `pending_updates.json`.
2. For each entry, mutates the matching entity file via openpyxl on the master Excel.
3. Regenerates entity JSON from the updated Excel.
4. Commits the entity JSON change with a non-`[queue]` subject (which triggers a Vercel rebuild).
5. Empties `pending_updates.json`.

Ops never inherited that workflow. The codebase was built **as if** the runner existed.

### 3.4 Operational consequence for Misba's testing right now

She submitted 3 schools. All 3 enqueued cleanly. None will ever appear in `/admin/schools` or `/schools` until either (a) a human runs a drain script (none exists yet), or (b) the architecture changes to read the queue alongside the source.

---

## 4. Evaluating B1 / B2 / B3 against what we found

### 4.1 B1: Read-merger at request time

**Implementation shape.** Replace each `import xJson from '@/data/x.json'` with a call to `await getMergedX()`, where `getMergedX` reads `x.json` from disk (or from the bundled import) PLUS reads `pending_updates.json` (filtered for `entity === 'x'`), folds creates/updates into the source list in audit order, and returns the merged array.

**Concrete migration scope.** 268 read-path imports across 99 files. Realistic conversion: the high-traffic 4 (`users`, `mous`, `schools`, `sales_team`) get hoisted helpers and converted first; the long tail follows. Each Server Component that currently reads at module top must move the read into the function body (`async`). The Phase 1 dashboard tile + the kanban view + the `/schools` browse list + the audit-aggregate are the heaviest reads; merging needs to be O(n + m) where m is queue depth, which today is 3 entries and design-day might reach 100.

**Risks.**

- **Cache invalidation.** Server Components default to data-cache static behaviour. A merged read against a queue that updates every minute needs `cache: 'no-store'` or `dynamic = 'force-dynamic'` per page. The whole app effectively becomes dynamic. Cold-load latency goes up by the cost of one disk read of `pending_updates.json` per request.
- **Merge semantics for updates.** A queue entry with `operation: 'update'` carries the FULL updated entity payload (see write-path lib code; e.g., `editInventoryItem.ts` enqueues the whole patched item). Merging by id is straightforward: pending entry wins. No three-way merge needed.
- **Merge semantics for creates.** Queue entry payload is the full new entity. Append to source. Watch for id collisions if a queue entry has been drained AND the queue entry survives in the queue file (drain-clear was incomplete); de-dupe by id, last-write-wins by `queuedAt`.
- **Queue depth.** With no drain (current state), the queue grows unboundedly. Merge cost is O(queue) per read; at 1000 entries the per-request overhead is real. Need to pair B1 with a periodic drain (could be Y1's bandaid, or a simpler queue-trim job) so the queue stays small.
- **Queue read latency.** `pending_updates.json` is currently 6KB. Even at 1MB it is sub-millisecond on Vercel's filesystem. Disk read isn't the bottleneck; loss of static optimisation is.

**Pros.**

- Preserves `enqueueUpdate` durability semantics. The 46 write call sites change zero lines.
- Preserves git-history-as-audit (every queue entry is a commit).
- No DB introduction.
- Solves Bug 2 immediately and the same fix solves the "queue never drains" production gap (or at least makes it benign).

**Cons.**

- Every page becomes dynamic. Static optimisation lost across the ~58 page routes.
- Test rewrites: many tests today mock `@/data/x.json` and call the page with no setup. Once reads route through `getMergedX`, the tests need to mock `getMergedX` or both layers. ~180 test files; spot-check suggests 30-50 will need touching.
- The drain step still has to land eventually. B1 alone is "reads see the queue", not "queue ever drains". For a 5-person tool that might be fine for 6 months; for the platform-going-forward goal, drain is mandatory.

**Cost in days:** 4 days to convert all 23 entities and update tests; +1 day if the drain job is added in the same batch.

### 4.2 B2: Direct JSON writes, no queue

**Implementation shape.** Replace `enqueueUpdate(...)` with a direct `atomicUpdateJson('src/data/<entity>.json', mutate, ...)` call. The existing `atomicUpdateJson` helper in `githubQueue.ts` already handles 409 retry semantics; we are reusing it on a different path.

**Concrete migration scope.** 46 enqueue call sites across 34 files. Each call site swaps for a direct entity-file mutate. The lib functions (`createSchool`, `editInventoryItem`, etc.) keep their public signature; only the persistence layer changes. The `pending_updates.json` file goes away (or stays read-only for archaeology). Read paths stay as-is.

**Risks.**

- **Per-write latency.** Every enqueue today is 500-2000ms (per CLAUDE.md). Direct entity writes load a larger file (`schools.json` is 124 records, ~80KB), mutate, write back. Round-trip stays in the 1-3s range. Form submissions block on this. Misba submits a school, waits 2-3 seconds, gets redirected, school appears (because Vercel rebuilds on the non-`[queue]` commit, ~30-60s later); net 30-90 seconds from submit to visible.
- **The Vercel rebuild gap.** Even with B2, the data lives in committed JSON, not RAM. After a successful PUT, Vercel rebuilds before the new state is visible. So "writes need to be visible immediately" is not actually achieved by B2 at the infrastructure level. The only way to make a write visible without a rebuild is to read the file at request time (which is what B1 does, but routed through the source file rather than a queue overlay).
- **GitHub Contents API rate limits.** 5000 req/hour authenticated. At 100 writes/day from a 5-person tool, this is comfortable. Future platform work with 50 users still fits.
- **Concurrent writes on the same entity.** Two operators editing `schools.json` simultaneously hit `atomicUpdateJson` retry-on-409 logic that's already proven for the queue file. No new code; just exercising the existing path on a different file.
- **Loss of audit-via-git.** Today every write is its own commit. With B2 every write is a commit on the entity file directly, which is still git-history-as-audit. Property preserved.

**Pros.**

- Fewer moving parts: queue infrastructure goes away.
- Simpler mental model: "the file IS the data."
- No drain step to ever build.

**Cons.**

- Does NOT solve the immediate-visibility problem on its own. Vercel still has to rebuild between the commit and the live serve. We'd need to pair B2 with making reads dynamic (read `schools.json` from disk at request time, not from the bundled import), which is roughly half of B1's work.
- Loses the queue's batching benefit. If the team grows to 20 operators with simultaneous edits, B2's per-write GitHub round-trip becomes a bottleneck that the queue would have absorbed.
- Throws away durable audit-of-write-intents (the queue captures intent even if the post-write JSON is malformed; B2 has no equivalent).

**Cost in days:** 3 days to convert all enqueue sites + tests; +2 days to make reads dynamic enough that "immediately visible" is actually achieved (otherwise B2 alone doesn't deliver on the goal).

### 4.3 B3: Real database

**Implementation shape.** Introduce a database (Vercel Postgres / Supabase / Neon). Migrate 23 JSON entity types to tables. Replace every `import xJson from '@/data/x.json'` with an ORM call. Replace every `enqueueUpdate` with an INSERT/UPDATE. Drop `pending_updates.json` and the queue infrastructure.

**Concrete migration scope.** 268 read sites + 46 write sites. Plus a one-time data migration of all 23 entity files. Plus schema-design work to capture per-entity audit log shape (audit log lives inside each entity today; in a relational world that's either a JSONB column or a separate audit table). Plus connection management, connection pooling, secrets, backups, migrations tooling.

**Risks.**

- **Data migration fidelity.** 23 entity types, each with type-strict schemas, custom validation, and embedded `auditLog: AuditEntry[]`. The audit-log-in-entity pattern doesn't map cleanly to relational normal form; we'd either keep it as JSONB (preserving the pattern, losing relational queries) or denormalise (introducing schema design questions per entity).
- **Lose git-history-as-audit-log.** This is the largest semantic change. Today, every state mutation is a git commit visible in `git log`. Post-B3, mutations live in DB rows; recovery means a separate audit table + DB-side change-data-capture. Not impossible, just net-new infrastructure.
- **Backup/restore.** Today, restoring data means `git revert`. Post-B3, it means DB point-in-time-recovery. Different operational discipline.
- **Connection management on Vercel serverless.** Every cold-start opens a DB connection. Pooling via Supabase / Neon serverless drivers is mature but is one more layer to learn and operate.
- **For the operational profile (5-person internal tool, 100 writes/day, 124 schools, 23 entity types):** B3 is overkill. The DB provides scalable concurrency and real-time consistency. The team needs neither at this size.

**Pros.**

- Real-time reads + writes. No staleness window.
- Mature tooling for backups, schema migrations, indexes, transactions.
- Scales to 50, 500, 5000 users without architectural change.
- Standard pattern that any engineer joining the team will recognise.

**Cons.**

- Largest scope. Touches every read AND every write AND introduces ~3 new operational systems (DB, ORM/query builder, migration tooling).
- Loses audit-via-git uniqueness.
- Commits Anish to operating a database for a 5-person tool. Per CLAUDE.md the project is single-tenant with no multi-tenant tax; a DB feels like adding a multi-tenant tax.

**Cost in days:** 5-7 days end-to-end (schema design, migration, ORM/queries, test rewrites, deployment plumbing, secrets, smoke tests).

---

## 5. Recommendation: B1, with a follow-up drain step

**B1 is the right fit for this codebase, with one caveat.**

Why B1 over B2:

- B2 doesn't actually solve "writes visible immediately" without ALSO converting reads to dynamic. So B2 is "B1 minus the queue", which means doing most of B1's work plus replumbing every write site, for a smaller win.
- B2 makes Misba's flow feel slow. 1-3s form submits + 30-60s Vercel rebuild before visible is worse UX than B1's "merge queue at read time" which is fast both ways.

Why B1 over B3:

- 268 read sites + 46 write sites are migration-heavy regardless of target. B3 doubles the scope by also introducing a new operational system (DB, ORM, migrations, backups). For 5 operators and 100 writes/day, that's not justified.
- The git-history-as-audit-log property is genuinely valuable to this team. Anish and Misba can `git log` to answer "who changed what when" without query language. B3 throws that away.
- B3 should be on the table if the platform grows to 50+ users or write rate exceeds GitHub's 5000 req/hr ceiling. Today neither is close.

**The caveat.** B1 alone leaves the queue growing unboundedly. The merge-at-read-time approach has O(queue) cost; at 1000 queued entries it starts feeling slow. So B1 must ship with **either**:

- A drain script that runs on demand (Anish-triggered or cron) that walks `pending_updates.json`, applies entries to entity files, commits the entity file change, and clears the queue. ~1 day to write + test.
- OR a queue-trim policy: drop queue entries older than N days that have already been reflected in the entity file. Lighter; doesn't actually merge into source-of-truth.

Recommend the drain script. It closes the long-standing "sync runner is fictional" gap that the codebase was built around. Even if B1 makes its absence non-blocking, having a real drain step restores the architecture-as-documented and gives ops a recovery lever.

**Total cost: 5 days. 4 days for B1 read-merger across 23 entities + ~50 test rewrites; 1 day for the drain script.**

**Risk landing.** The biggest risk is the test mocking refactor. About 30-50 tests today mock `@/data/x.json` directly; they'll need to mock `getMergedX()` instead, which means the tests grow a queue mock alongside the source mock. Mitigation: ship a tiny test helper in `src/lib/test-utils/dataMocks.ts` that takes `{source, queue}` and wires both mocks at once; convert tests in batches per entity.

---

## 6. Round-2 testing-continuity options

**Y1: 2-hour Sync now bandaid.** Add a "Sync now" button to `/admin` that runs the drain script inline. Misba creates a school, clicks Sync now, school appears. Bandaid because it's manual + Vercel rebuild still applies (so 30-60s before visible). Land it and resume testing while B1 is built.

**Y2: pause Misba, ship B1 end-to-end.** Misba's testing pauses for 5 days. She has other work; not idle.

**Y3 (proposed): drain script as a 1-day shipped feature, plus tell Misba "click Sync now after each create until W4-I.3 lands".** Same as Y1 but the drain script is the real thing, not a bandaid; it stays after B1 lands as the queue-trim mechanism. Misba's flow is "submit form → click Sync now on /admin → wait 30s for Vercel rebuild → school visible". Slow but unblocks her in 1 day instead of 5.

**Recommend Y3.** Reasons:

- Y1's bandaid throws away in 5 days, whereas Y3's drain script is a real artefact that stays.
- Y2 leaves Misba blocked for 5 days, which slows the round-2 feedback loop unnecessarily; she has a 124-school dataset to test through.
- Y3 ships in 1 day. The slow flow (manual Sync now + 30s rebuild) is acceptable as a temporary state because Misba is testing, not in production.

Minor downside of Y3: Misba has to remember the manual Sync now click. Mitigation: on `/admin/schools/new` post-create redirect (and `?created=<id>` on `/admin/schools`), include a button "Click Sync now to make this school visible" that links to `/admin?fragment=sync-controls`. It's an honest UI for the temporary state.

---

## 7. Bug 1 placement (commit landed)

Bug 1 (search bar on `/admin/schools`) shipped at commit `b7b0b14` before this recon, per Anish's instruction. Read paths did not change; the search filters in memory. No conflict with B1 / B2 / B3. The commit also captured sweep findings on the 4 other post-action surfaces (`/sales-pipeline/new`, `/admin/inventory/[id]`, `/mous/[id]/intake`, `/dispatch/request`); all 4 are working. The 5th sweep target (`/admin/schools/new` Bug 2) is deferred to W4-I.3 implementation.

---

## 8. Operational context confirmations

- **Active testers:** 12 user records in `users.json` (Anish + 11). Confirms W4-I.1.7 (Gowri + Anita addition) shipped at `c7fa91b` per the brief expectation.
- **Vercel tier:** the codebase doesn't disclose this. Confirm out-of-band if it matters for Y3's rebuild-frequency assumption.
- **GitHub Contents API:** still the data layer. PAT provisioned this session.
- **Routes:** 58 page routes + 37 API routes = 95 surfaces. The brief said ~50; the discrepancy may be that the brief counted top-level routes only.

---

## 9. Decision points for Anish

1. **Path:** B1 / B2 / B3. Recommend B1 + drain script.
2. **Testing continuity:** Y1 / Y2 / Y3. Recommend Y3 (1-day drain script + Sync now button + Misba clicks it manually until B1 ships).
3. **Implementation sequencing:** the drain script can either ship in parallel with B1 (Y3 path) or be folded into the B1 batch.
4. **Test refactor scope:** acceptable to grow from 1531 tests to ~1600+ as part of B1, or constrain B1 to mock-compatibility-preserving changes only?

When you decide, I'll write the implementation brief based on your decisions per the brief's process.
