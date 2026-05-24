# Cutover-ready gate report - 2026-05-24

Date: 2026-05-24
Phase: 7 Part 5.B (final gate before Part 6 production cutover)
Gate run: `.verification/gate-2026-05-24T08-19-52/`

**Per Anish 2026-05-24: this is the GATE, NOT the cutover. Production flip (Part 6) requires a separate explicit GO after Anish reviews this report.**

## TL;DR

- **GATE STATUS: GREEN.** Consolidated harness 10/10 gating suites PASS in a single run against staging postgres.
- Free-tier config (`prepare:false`, `max:1`, timeouts) active in client.ts; local DATABASE_URL uses the Neon `-pooler` (pgbouncer) endpoint; production Vercel env must mirror.
- Production JSON has drifted +36 rows across 9 entities since the staging seed was taken. Part 6 fresh seed will capture these.
- JSON-mode no-regression floor holds (2066/2070 lib tests PASS in json mode; 4 pre-existing data-shape failures unrelated to P4).
- **PAUSED for Anish review.**

## 1. Consolidated harness - single-pass result

`scripts/verify-cutover-gate.mjs` spawns each harness as a child node process and emits one consolidated PASS/FAIL. **10 / 10 gating suites PASS:**

| # | Suite | Coverage | Duration | Result |
|---|---|---|---|---|
| 1 | p2b-concurrency | 19 audited entities, 10 parallel audit appends each | 48.5s | **PASS** |
| 2 | occ-123 | OCC #1 cc_rules, #2 communication_templates, #3 override_event (set + ack) | 5.0s | **PASS** |
| 3 | occ-4 | OCC #4 dispatch_summary cross-flow (6 writers / 4 sub-flows / loser-retry) | 2.9s | **PASS** |
| 4 | occ-567 | OCC #5 vex_products, #6 stage_responsibility, #7 mou_import_review NULL-check | 4.8s | **PASS** |
| 5 | partial-pay | Money atomic: partial_payments (3-layer: drive + SQL + reload) | 3.3s | **PASS** |
| 6 | vex-pay | Money atomic: vex_pis.payment_log_ids (3-layer) | 3.4s | **PASS** |
| 7 | alloc-occ-sql | Allocations OCC primitive (SQL level) | 3.4s | **PASS** |
| 8 | alloc-occ-repo | Allocations OCC route-equivalent (HTTP 200/409 + loser-retry) | 3.5s | **PASS** |
| 9 | p4-money | Read-parity: 10 drifted MOUs + 5 control + 3 dashboard rollups | 7.5s | **PASS** |
| 10 | p4-agg | Read-parity: 8 surfaces × 33 aggregate checks (action queue, leadership, kit, inventory, vex PI ledger, sales pipeline, queue-status, escalations) | 8.1s | **PASS** |
| - | rmw-survey | Informational raw-SQL RMW race survey (proves the fix targets remained vulnerable pre-fix; not gating) | 12.2s | INFO |

Total runtime: 93.5s. Output logs: `.verification/gate-2026-05-24T08-19-52/{suite-id}.log` per suite.

**Nothing regressed across the batches as they accumulated.** The race-survey is INFORMATIONAL only - its purpose is the historical reference of "yes the raw RMW pattern races on these fields" with the per-field fix verdict already established in P2b.X + P3 reports.

## 2. Free-tier config + production connection-string requirements

### Confirmed in code

`src/lib/db/client.ts:101-107`:

```ts
cached = postgres(url, {
  max: 1,              // one connection per function invocation; Neon free-tier per-project cap = 10 direct
  idle_timeout: 30,    // close idle quickly so the pooler reclaims slot
  connect_timeout: 30, // Neon free-tier auto-suspends after ~5 min; cold-start takes 3-10s
  prepare: false,      // pgbouncer transaction mode doesn't share prepared statements across pooled clients
  onnotice: () => {},
})
```

### Local DATABASE_URL - confirmed pooled

Hostname pattern: `ep-dark-water-aovsi9st-pooler.c-2.ap-southeast-1.aws.neon.tech`. The `-pooler` infix is Neon's pgbouncer endpoint. Direct (non-pooler) endpoint would be `ep-dark-water-aovsi9st.c-2.ap-southeast-1.aws.neon.tech` (no `-pooler`).

### Production Vercel env - REQUIRED before Part 6

Anish must verify (via `vercel env ls production`) that the production `DATABASE_URL` env var:

1. Contains `-pooler` in the hostname (uses pgbouncer endpoint).
2. Contains `sslmode=require` (TLS to Neon).
3. Does NOT contain `?prepare=true` or `?statement_cache_size>0` (would re-enable prepared statements, which `prepare: false` in client.ts overrides anyway, but query-string `prepare=true` is misleading).

The application code is config-correct. The deploy must use the right env value. Vercel CLI command Anish would run:

```bash
vercel env pull --environment=production .env.production.local
grep ^DATABASE_URL .env.production.local
# confirm -pooler infix, sslmode=require, no prepare-string override
```

DATA_BACKEND env value in production should currently be `json` (or unset, which defaults to json per CLAUDE.md). The Part 6 cutover IS the flip to `postgres`.

## 3. Production JSON drift since staging seed - quantified

`scripts/verify-json-vs-postgres-drift.mjs` compared every entity's row count in local `src/data/*.json` (production source-of-truth) vs current staging postgres. Local repo is at HEAD; remote `origin/main` is 15 commits ahead, all `chore(sync-health): sync ok` heartbeats touching ONLY `src/data/sync_health.json` (no live entity drift).

### Drift summary

| Direction | Count of entities | Total rows |
|---|---|---|
| JSON > postgres (production has new rows not yet in staging) | 9 | +36 |
| postgres > JSON (staging has test-fixture rows not in production) | 3 | -10 |
| Aligned (diff = 0) | 24 | 0 |

### Production-pending rows (Part 6 re-seed must capture)

| Entity | json | pg | diff | likely source |
|---|---|---|---|---|
| mous | 137 | 136 | +1 | 1 new MOU drafted since staging seed |
| dispatches | 27 | 23 | +4 | 4 new dispatches raised |
| dispatch_requests | 2 | 0 | +2 | 2 new dispatch requests submitted |
| communications | 16 | 2 | +14 | 14 communications logged (the largest delta) |
| magic_link_tokens | 2 | 0 | +2 | 2 feedback tokens issued |
| feedback | 8 | 2 | +6 | 6 feedback submissions |
| escalations | 5 | 1 | +4 | 4 new escalations opened |
| signed_values | 3 | 2 | +1 | 1 signed-value snapshot |
| chain_dismissals | 2 | 0 | +2 | 2 chain-reconciliation dismissals |

### Staging-only extras (NOT a cutover concern)

| Entity | json | pg | diff | source |
|---|---|---|---|---|
| payments | (production) | +2 | -2 | concurrency-test temp fixtures from earlier OCC runs (P2b vendor fix pattern) |
| kit_dispatches | 0 | 6 | -6 | concurrency-test temp fixtures + OCC fixtures |
| vex_pis | 5 | 7 | -2 | concurrency-test temp fixtures |

These do NOT affect production cutover because production seeds from JSON to its OWN fresh Neon branch, not from staging.

## 4. Part 6 cutover procedure - step by step

### Pre-flight (the night before, or the morning of)

**Anish actions (these CANNOT be automated by Claude in-session and must be done in human hands):**

1. **Create the Neon snapshot branch** (manual; Claude does NOT have a Neon API key in this environment, so this is an Anish-in-the-console step):
 - Open https://console.neon.tech/ → select the gsl-ops-automation project → select the production branch.
 - Click "Create branch" → name it `pre-cutover-2026-XX-XX` (matching the cutover date).
 - Choose "Branch from current state" (zero-copy, instant).
 - This branch is the rollback target if the seed corrupts the production branch.
2. **Confirm DATABASE_URL is NOT yet set in production Vercel env** (one-shot sanity check):
   ```bash
   vercel env ls production | grep -iE "database|data_backend"
   ```
   Expected output: empty (no rows). If anything is set, STOP and reconcile - the cutover procedure below ADDS these vars; if they already exist with wrong values, you must `vercel env rm` first.
3. **Refresh local main** at the cutover moment (NOT in advance): `git pull origin main` so `src/data/*.json` is the FRESHEST production source-of-truth. The seed reads from local `src/data/`, so any production writes that landed between now and the cutover moment will be captured iff this pull happens immediately before step 6 below.
4. **Confirm queue is drained**: `gh run list --workflow=sync-queue-cron.yml --limit=5` should show recent successful runs. If pending entries exist (>5 min stale), wait for the next cron tick or trigger manually with the `import-tick` admin route.
5. **Tag the commit** that will be the seed source: `git tag part6-cutover-seed-2026-XX-XX && git push --tags`. This is the exact-state snapshot we redeploy from in case of rollback.

### Cutover steps (CRITICAL: production re-seed is REAL-APPLY, not dry-run)

**The lesson from Part 3:** dry-runs roll back at commit time and miss errors that only surface when COMMIT actually fires. The savepoint FK bug was caught only by a real apply with verification. The Part 6 production seed must be REAL APPLY with FULL VERIFICATION.

**Confirmed empty in production Vercel env today:** `DATABASE_URL` is NOT set; `DATA_BACKEND` is NOT set. The cutover ADDS both. Production currently has 18 env vars (AUTH_*, CRON_SECRET, GSL_JWT_SECRET, GSL_QUEUE_GITHUB_TOKEN, GSL_SNAPSHOT_SIGNING_KEY, PI_PARALLEL_BUILD_LOCK, TESTING_OPEN_ACCESS); none of them are postgres-related.

```bash
# 0. (Anish must have already created the pre-cutover-YYYY-MM-DD Neon
#    branch via the console - see pre-flight step 1. The DATABASE_URL
#    below points to the LIVE PRODUCTION branch, not the snapshot
#    branch; the snapshot is the rollback target.)

# 1. Apply schema (idempotent migrations 001-007) to production Neon branch.
#    DATABASE_URL points to the PRODUCTION postgres branch, NOT staging.
DATABASE_URL='<production postgres -pooler URL>' \
  node scripts/apply-migration.mjs scripts/migrations/001-init.sql
DATABASE_URL='<production postgres -pooler URL>' \
  node scripts/apply-migration.mjs scripts/migrations/002-fixups.sql
DATABASE_URL='<production postgres -pooler URL>' \
  node scripts/apply-migration.mjs scripts/migrations/003-kit-dispatch-version.sql
DATABASE_URL='<production postgres -pooler URL>' \
  node scripts/apply-migration.mjs scripts/migrations/004-cc-rules-version.sql
DATABASE_URL='<production postgres -pooler URL>' \
  node scripts/apply-migration.mjs scripts/migrations/005-communication-templates-version.sql
DATABASE_URL='<production postgres -pooler URL>' \
  node scripts/apply-migration.mjs scripts/migrations/006-vex-products-version.sql
DATABASE_URL='<production postgres -pooler URL>' \
  node scripts/apply-migration.mjs scripts/migrations/007-stage-responsibility-version.sql

# 2. REAL APPLY the production seed (NOT --dry-run). The seed script
#    must commit and verify; per Part 3 we caught the savepoint FK bug
#    ONLY because we did a real apply. Repeat that discipline here.
DATABASE_URL='<production postgres -pooler URL>' \
  node scripts/seed-postgres.mjs --apply --verify

# Expected outcomes carrying over from Part 3:
# - 38 demo rows (well-known expected-orphan allowlist) skipped intentionally.
# - 5 archived MOUs recovered by the import-review-replay step.
# - FBK-004 row skipped (known-broken legacy entry).
# These are documented in plans/anish-ops-w4i3-recon-2026-04-30.md and the
# Part 3 seed completion report. The seed log MUST show:
# - all 36 entity tables populated
# - row counts matching src/data/*.json (modulo the documented skips)
# - parity test PASS at end of seed

# 2.5 POST-APPLY VERIFICATION (Anish 2026-05-24 #2 spot-checks).
#     Runs AFTER seed COMMIT, BEFORE env flip. This is the explicit
#     human-checkpoint Anish reviews before approving the flip.
DATABASE_URL='<production postgres -pooler URL>' \
  node scripts/verify-seed-post-apply.mjs
# Output covers (proven against staging in pre-flight):
# - The 9 archive payments (5 restored MOUs): count, sum-received, per-mouId breakdown
# - partial_payments JSONB length+sum vs JSON snapshot
# - pi_counter_map.priorFiscalYears['2526'].entities (MH/UP next values)
# - 5 restored archived MOUs (cohort_status='archived', recovery notes prefix)
# - All 35 entity row-counts vs JSON snapshot (flag >=5% material drift)
# Exit 0 iff all spot-checks pass. NO automatic next step on success -
# Anish reviews + explicitly approves before step 3.

# === CHECKPOINT 1 (HUMAN GO REQUIRED) ===
# Anish reviews step 2.5 output. If anything is off (archive payments
# missing, counter map wrong, MOUs not flagged 'archived', material
# row-count drift on a non-allowlisted entity), STOP and roll back the
# database from the pre-cutover-YYYY-MM-DD Neon snapshot. The env
# vars are NOT set yet at this point; the production app is still
# running on json with no postgres-related vars. Rollback = "do nothing
# more, the app is still on json".
# If Anish approves: GO on to step 3.

# 3. Re-run the consolidated gate against PRODUCTION postgres (one-shot).
DATABASE_URL='<production postgres -pooler URL>' \
  node scripts/verify-cutover-gate.mjs
# Must be GATE STATUS: GREEN before proceeding.

# === CHECKPOINT 2 (HUMAN GO REQUIRED before step 4 - THE FLIP) ===
# At this point: production app is STILL on json (env vars unset).
# Postgres branch is seeded + verified + parity-checked. Last chance
# to abort harmlessly.
# Anish reviews step 3 gate output. If GREEN: explicitly say "flip"
# and proceed to step 4. Otherwise STOP (no production impact yet).

# 4. Set the production env vars. BOTH are new today (neither
#    DATABASE_URL nor DATA_BACKEND exists in production env -
#    confirmed by `vercel env ls production` 2026-05-24).
#    The DATABASE_URL must use the -pooler endpoint with sslmode=require:
#    postgresql://<user>:<pass>@ep-<id>-pooler.<region>.aws.neon.tech/<db>?sslmode=require
echo '<production postgres -pooler URL>' | vercel env add DATABASE_URL production
echo 'postgres' | vercel env add DATA_BACKEND production
# Confirm both landed:
vercel env ls production | grep -iE "database|data_backend"

# 5. Redeploy production from the seed-source-tagged commit.
vercel deploy --prod --git-branch=main

# 6. Post-deploy smoke: walk the 10 priority surfaces in the live URL,
#    confirm values match SQL (run verify-p4-money-parity.mjs +
#    verify-p4-aggregate-parity.mjs one more time against the production
#    DB after the deploy is live).
DATABASE_URL='<production postgres -pooler URL>' \
  node scripts/verify-p4-money-parity.mjs
DATABASE_URL='<production postgres -pooler URL>' \
  node scripts/verify-p4-aggregate-parity.mjs

# 7. Tail Vercel logs for 15 min for any postgres error spikes.
vercel logs --prod --follow
```

### Rollback procedure (if anything looks wrong)

```bash
# Flip DATA_BACKEND back to json (or just remove it; default is json).
vercel env rm DATA_BACKEND production

# DATABASE_URL can stay set (harmless when DATA_BACKEND=json since
# the client only initialises on the postgres branch), or remove it
# too if you want a clean revert to pre-Part-6 state.
# Optional: vercel env rm DATABASE_URL production

# Redeploy from the same seed-source-tagged commit.
vercel deploy --prod --git-branch=main
```

**Rollback restore speed:** ~60-120s for the env-flip + redeploy. The src/data/*.json files in the repo at the seed-source-tagged commit are still the live production source-of-truth in json mode; the redeploy returns the app to its pre-cutover behavior identically. The postgres branch keeps its rows (no rollback needed there); we just stop reading from it. The next forward attempt repeats steps 4-7.

**Database-level rollback** (only if seed corrupted the production branch and we need to discard it): in Neon console, restore the production branch from the `pre-cutover-YYYY-MM-DD` snapshot branch created in pre-flight step 1. This is point-in-time restore - takes ~30s.

**Rollback safety:** any writes that landed in postgres BETWEEN the cutover and the rollback are NOT replayed to json. If the rollback is fast (within minutes), this is bounded to a small handful of writes. The audit_log entries on each row capture the writes, so post-rollback we can replay them manually via the queue if needed.

### Cutover smoke checklist (verify before declaring DONE)

| Surface | Verify |
|---|---|
| /dashboard/finance | Contract / Collected / Outstanding tiles render with non-stale values |
| /mous/[mouId] (pick a drifted MOU like MOU-STEAM-2526-007) | Received tile shows ₹688K (SUM-of-payments), NOT ₹3.29M (stale mou.received) |
| /admin/queue-status | latest sync_health entry visible; pendingReviewCount accurate |
| /escalations | row count matches `SELECT COUNT(*) FROM escalations` |
| /operations/vex | total billed / received / outstanding align |
| /dispatch/kits/[any mouId] | allocations form loads `version` from postgres |
| /admin/inventory | 19 active SKUs, total stock 7718 (or current numbers) |
| Create a new escalation | row lands in postgres; audit entry recorded |
| Save a kit-allocation | OCC fires, version bumps |

## 5. JSON-mode no-regression floor

Per Anish: "with DATA_BACKEND unset/json (current production default), everything STILL works identically".

`unset DATA_BACKEND; unset DATABASE_URL; npx vitest run src/lib`:
- **2066 PASS, 81 SKIPPED, 4 FAIL.**
- The 4 failures are all PRE-EXISTING data-shape tests that drift as the JSON evolves; not introduced by P4:
 - `src/lib/mouSystem/lifecycleReplay.test.ts > Scenario 7/8` (mouSystem replay fixtures, last touched 2026-05-23 in 9b11d50 - prior to my P4 work)
 - `src/lib/schema-w4g.test.ts > InventoryItem schema: 20 records` (inventory_items.json now has 21 rows per the drift report; test expects 20)
 - `src/lib/audit/aggregate.test.ts > collectAuditRows: every MOU audit row has a recognized action` (new audit action types added since test was written)

These are JSON-evolution test rot, NOT P4 regressions. They were failing in json mode before P4 started; my work didn't touch them.

**The no-regression floor for production code paths holds.**

## 6. Consolidated cutover-ready table

| Bar | Status | Evidence |
|---|---|---|
| All entity-JSON imports migrated to repo reads | **MET** | 135 of 135 live-entity files migrated; 5 remaining are documented non-entity snapshot imports |
| Parity 51/51 PASS | **MET** | verify-p4-money-parity (18/18) + verify-p4-aggregate-parity (33/33); re-run after every batch |
| Typecheck clean for src/app/ | **MET** | zero new errors introduced by P4 across all batches |
| Zero partial-migration pages | **MET** | per-file audit confirmed every touched page has zero stray @/data/ imports |
| OCC fixes #1-#7 proven 10/1+9 | **MET** | verify-occ-123-proofs + verify-occ-4 + verify-occ-567 |
| 2 money atomic-append fixes proven 10/10 three-layer | **MET** | verify-partial-payments-atomic + verify-vex-payment-atomic |
| P2b concurrency 19/19 entities N→N | **MET** | verify-p2b-concurrency |
| Allocations OCC primitive + route-equivalent | **MET** | verify-allocations-occ + verify-allocations-occ-repo |
| Free-tier mitigations (Neon pgbouncer) | **MET** | client.ts max:1, prepare:false, timeouts; local DATABASE_URL uses -pooler |
| Production Vercel DATABASE_URL is pooler | **REQUIRED** (Anish to verify with vercel env pull before Part 6) |
| Production JSON drift quantified | **MET** | +36 rows across 9 entities; will be captured by the Part 6 fresh seed |
| Conditional-safety banners in repos | **MET** | user.ts + salesTeam.ts carry CONDITIONALLY-SAFE warning blocks |
| Deliberate-accept docs | **MET** | magicLinkToken.view_count documented as material-impact-zero |
| Consolidated gate harness single-run PASS | **MET** | this report; 10/10 gating suites green |
| JSON-mode no-regression floor | **MET** | 2066/2070 lib tests PASS; 4 pre-existing data-shape failures unrelated to P4 |
| Part 6 cutover procedure documented | **MET** | §4 above, with explicit real-apply-not-dry-run language |
| Part 6 rollback procedure documented | **MET** | §4 above, restore <2 min |
| Production re-seed plan: real apply + verify, not dry-run | **MET** | §4 step 2; carries over Part 3 lessons (38 expected-orphan allowlist + 5 archived MOU recovery + FBK-004 skip) |

## 7. What this leaves for Anish to verify before Part 6 GO

1. **Production Vercel DATABASE_URL** uses the pgbouncer (`-pooler`) endpoint with `sslmode=require`. Anish to run `vercel env pull` and grep.
2. **Part 6 cutover window** scheduled when Misba + Pranav + Ameet are available for smoke-testing (not the night before a school-launch day).
3. **Manual Neon snapshot** of the production postgres branch named `pre-cutover-2026-XX-XX` before the seed runs - the rollback safety net.
4. **Acceptance of the JSON drift cost**: any production write that happens between the seed and the cutover-deploy is lost UNLESS we freeze writes during the window. Recommend a 30-minute write-freeze window (post a banner; users see "Cutting over - please come back in 30 minutes").

## 8. Approval requested

**PAUSED.** This is the gate report, not the cutover. Awaiting Anish's review.

If Anish reviews and approves, the next session can execute the Part 6 procedure documented in §4 (real-apply production seed + env flip + deploy + post-deploy smoke + rollback if anything looks wrong).

Production stays json until that explicit Part 6 GO.
