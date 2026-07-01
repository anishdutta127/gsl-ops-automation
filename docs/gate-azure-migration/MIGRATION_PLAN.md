# Azure migration plan: gsl-ops-automation prod DB to Azure `gsl-ops`

_Author: CC. Date: 2026-07-01. Status: PLAN ONLY, nothing executed. No database was read, written, or changed to produce this document. This is the planned Azure migration target named in CLAUDE.md ("Production target is Azure migration post-Phase-1", W4-DEFERRED D-041)._

> **Guardrail restated.** This document changes nothing. It does not migrate data, does not run any migration, and does not touch any connection string. Every command below is a proposal for a later, separately-approved gate. All DB credentials stay in env vars / secrets; no password or connection string is hardcoded in any committed file (this doc included).

---

## 0. Scope and non-negotiables

- **Copy, never move.** The current prod DB (Neon) stays live and untouched throughout. Azure is populated from a copy. This is what makes rollback a one-line env flip rather than a restore.
- **Two env vars only decide where the app points:** `DATA_BACKEND` (stays `postgres`) and `DATABASE_URL` (the value that changes at cutover). See `src/lib/db/backend.ts` and `src/lib/db/client.ts`.
- **All build/load scripts target a NEW env var `AZURE_DATABASE_URL`, never `DATABASE_URL`.** Today `.env.local` `DATABASE_URL` points at Neon prod (`ep-shiny-waterfall`). Any script that read `DATABASE_URL` would write to prod. Every Azure-side script in this plan reads `AZURE_DATABASE_URL` so a fat-finger cannot hit Neon.
- **Secrets never land in git.** `.env.local` is gitignored; the Azure admin password and connection string live in the 1Password "GSL Ops" vault and in Vercel env vars. Do not paste them into a script, a commit, or this doc.

---

## 1. Current state (source and target, precise)

### Source (live prod, the DB with all real data)

| Field | Value |
|---|---|
| Provider | Neon serverless Postgres |
| Endpoint | `ep-shiny-waterfall` (confirmed in `docs/gate-db-migration/PHASE1-AUDIT.md` and project memory `project_production_db_identity.md`) |
| Region | `ap-southeast-1` (Singapore) |
| Driver | `postgres` (postgres.js v3.4.9), `src/lib/db/client.ts` |
| Connection | `process.env.DATABASE_URL`, read lazily on first query |
| Backend flag | `DATA_BACKEND=postgres` on Vercel Production (proven live: cron-disable commit `4d50d8e` "postgres is truth source"; reads run at request time) |
| Serving region | Vercel `sin1` (`vercel.json` `regions: ["sin1"]`), co-located with Neon Singapore |
| Table count | ~41 tables in `public` (38 from `001-init.sql` + `welcome_notes` 012 + `recce_reports` 013 + `products` 014) |

**How we will confirm this precisely before touching anything** (read-only, run at gate start, not now):

```bash
# Reads .env.local DATABASE_URL = Neon prod. SELECT-only.
node scripts/db-ping.mjs
```

Note: `db-ping.mjs`'s row-count block uses an `xpath`/`query_to_xml` probe that project learnings record as returning `null` per table (it mis-summarised prod as "empty"). For the real counts we use the direct `count(*)` query in section 3, not that probe.

### Target (Azure, must be confirmed empty/fresh)

| Field | Value |
|---|---|
| Provider | Azure Database for PostgreSQL, Flexible Server |
| Databases on the server | `gsl-store` (sibling repo) and `gsl-ops` (this app's target) |
| Target database | `gsl-ops` |
| Region | **Central India** (Pune), per owner: resource group `Azure_store_centralindia`, VM in Central India, shared server also hosts `gsl-store`. One portal check outstanding: confirm the `gsl-ops` **database / Flexible Server** itself is Central India (databases inherit the server's region, so this is a formality, but verify the server, not just the RG name). **This does NOT match the app's current serving region (`sin1`), see Risk R1.** |
| Admin user | Flexible Server uses a plain username (no `user@server` suffix; that was Single Server) |
| SSL | Required by Azure. Connection string needs `sslmode=require` |
| Host | `<server>.postgres.database.azure.com:5432` |
| Expected state | EMPTY: schema not yet created, zero rows |

**How we will confirm `gsl-ops` is empty/fresh** (read-only, at gate start):

```bash
# AZURE_DATABASE_URL = the gsl-ops connection string (from 1Password), NOT DATABASE_URL.
AZURE_DATABASE_URL='postgresql://...@<server>.postgres.database.azure.com:5432/gsl-ops?sslmode=require' \
  node -e "import('postgres').then(async ({default:pg})=>{const s=pg(process.env.AZURE_DATABASE_URL,{max:1});const t=await s.\`select count(*)::int n from information_schema.tables where table_schema='public'\`;console.log('public tables:',t[0].n);await s.end()})"
```

Expected: `public tables: 0`. If it is non-zero, STOP and reconcile: either a prior attempt seeded it (drop and recreate the database, or `DROP SCHEMA public CASCADE; CREATE SCHEMA public;`) or we are pointed at the wrong database.

---

## 2. Schema recreation in `gsl-ops` (ordered, repeatable)

The canonical, source-controlled way to reproduce the schema is to run the migration files `001`..`021` in filename order against `gsl-ops`. Every migration is written idempotent (`CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, `DROP CONSTRAINT IF EXISTS`, `ON CONFLICT DO NOTHING`) and each wraps itself in `BEGIN; ... COMMIT;`, so the sequence is safe and re-runnable.

### 2.1 Migration inventory (what each file does)

Run the `.sql` files only; the `.down.sql` files are rollbacks and must be skipped.

| # | File | Kind | Notes |
|---|---|---|---|
| 001 | `001-init.sql` | DDL + deferred FKs | All ~38 base tables; resolves the 3 FK cycles via bottom-of-file `ALTER TABLE` |
| 002 | `002-fixups.sql` | DDL | Drop NOT NULL on two emails; widen `mou_import_review` CHECK |
| 003 | `003-kit-dispatch-version.sql` | DDL | `kit_dispatches.version` |
| 004 | `004-cc-rules-version.sql` | DDL | version column |
| 005 | `005-communication-templates-version.sql` | DDL | version column |
| 006 | `006-vex-products-version.sql` | DDL | version column |
| 007 | `007-stage-responsibility-version.sql` | DDL | version column |
| 008 | `008-test-account.sql` | **SEED** | `INSERT INTO users` (a test account) |
| 009 | `009-fy2526-import.sql` | **DATA** | `UPDATE mous ...` corrections |
| 010 | `010-mou-products.sql` | DDL | `mous.products JSONB` |
| 011 | `011-mou-ops-review-status.sql` | DDL | `mous.ops_review_status` |
| 012 | `012-welcome-notes.sql` | DDL | `CREATE TABLE welcome_notes` |
| 013 | `013-recce-reports.sql` | DDL | `CREATE TABLE recce_reports` + index |
| 014 | `014-products-registry.sql` | DDL + **SEED** | `CREATE TABLE products`, seed 6 products, DROP `mous_programme_check` |
| 015 | `015-mou-region.sql` | DDL | `mous.region` |
| 016 | `016-product-kind.sql` | DDL + **DATA** | `products.kind` + `UPDATE products` |
| 017 | `017-product-hierarchy.sql` | DDL + **SEED/DATA** | `products.parent_id`, INSERT "Bootcamps (general)", `UPDATE products`, `UPDATE mous` (moves 3 MOUs) |
| 018 | `018-mou-cancelled-status.sql` | DDL | Swap `mous_status_check` to include `Cancelled` |
| 019 | `019-vex-dispatch-delivered.sql` | DDL | `vex_dispatches.delivered_at` + `delivered_by` (the "delivered columns") |
| 020 | `020-payment-log-void.sql` | DDL | `payment_logs.voided_at/voided_by/void_reason` (the "voided columns") |
| 021 | `021-vex-void.sql` | DDL | `voided_*` on `vex_pis` + `vex_dispatches` |

**Why the seed/data migrations (008, 009, 014, 016, 017) matter for ordering:** running the full migration chain leaves a handful of seed rows (a test user, 7 products, MOU/product corrections) in `gsl-ops`. Those rows would collide on primary key with the real prod rows we load in section 3. The fix is deliberate and simple: **after building the schema, TRUNCATE every table, then load prod data into empty tables** (section 3.2). The migration chain's job here is to define the SCHEMA; prod's data is authoritative for the ROWS.

### 2.2 Ordered runner (proposed new script)

`apply-migration.mjs` applies one file. For a repeatable full build we add a thin wrapper (proposed, part of a later gate, not written now) that loops in order and targets `AZURE_DATABASE_URL`:

```
scripts/apply-all-migrations.mjs   (proposed)
  - reads AZURE_DATABASE_URL (NOT DATABASE_URL)
  - lists scripts/migrations/*.sql, excludes *.down.sql
  - sorts by the leading NNN
  - applies each in its own transaction (reusing apply-migration.mjs's sql.unsafe path)
  - prints "applied NNN in Xms" per file, aborts on first failure
```

Run:

```bash
AZURE_DATABASE_URL='postgresql://...gsl-ops?sslmode=require' node scripts/apply-all-migrations.mjs
```

Repeatable: because every statement is `IF NOT EXISTS` / `DO NOTHING` / `DROP ... IF EXISTS`, re-running the whole chain on an already-built schema is a no-op (safe to re-run after a partial failure).

### 2.3 Schema-fidelity cross-check (catch prod drift)

Migrations define the *intended* schema. Live prod may carry small drift from the one-time recovery writes and manual gated migrations. We prove the Azure schema equals live prod before loading data:

```bash
# Dump SCHEMA ONLY from both, normalise, diff. Requires pg_dump (client tools).
pg_dump "$NEON_DATABASE_URL"  --schema-only --no-owner --no-privileges | sed '/^--/d;/^$/d' > /tmp/neon.schema.sql
pg_dump "$AZURE_DATABASE_URL" --schema-only --no-owner --no-privileges | sed '/^--/d;/^$/d' > /tmp/azure.schema.sql
diff /tmp/neon.schema.sql /tmp/azure.schema.sql
```

Expected: no differences (modulo comment/whitespace already stripped). Any diff is drift; investigate before proceeding. If prod carries a column or constraint no migration file produces, that is a real finding: backport it into a new migration file so the source of truth stays the migration chain.

**Note on migration bookkeeping:** the repo has no `schema_migrations` ledger; migrations are applied by hand, one file at a time. That is fine for this one-shot copy (we run the whole chain). Adding a ledger table is optional future hardening, flagged not required for this migration.

---

## 3. Data migration (all live data, verified, idempotent)

### 3.1 Method: `pg_dump --data-only` from Neon into truncated Azure tables

`pg_dump` is the right tool: it emits `COPY` blocks (fast, exact, no truncation), includes `setval(...)` for the two `BIGSERIAL` sequences (`mou_import_review`, `sync_health`), and preserves JSONB, arrays, numerics, and timestamptz byte-for-byte.

FK cycles and per-table load order are handled by disabling FK enforcement during the load (`session_replication_role = replica`), so we do not have to topologically sort ~41 tables.

### 3.2 The load (proposed, idempotent by construction)

```bash
# 1. Snapshot prod DATA ONLY (schema already built in section 2).
pg_dump "$NEON_DATABASE_URL" \
  --data-only --no-owner --no-privileges \
  --file /secure/tmp/gsl-ops-data.sql

# 2. Load into Azure. TRUNCATE-first makes this re-runnable: run it twice, same end state.
psql "$AZURE_DATABASE_URL" <<'SQL'
BEGIN;
SET session_replication_role = replica;   -- suspend FK triggers for the load
-- Clear the seed rows migrations left (products, test user, etc.) + any prior attempt.
-- One statement, CASCADE covers FK deps; RESTART IDENTITY resets sequences before reload.
TRUNCATE
  users, sales_team, schools, school_groups, school_spocs, mous, payments,
  inventory_items, dispatch_requests, dispatches, kit_dispatches, intake_records,
  magic_link_tokens, communications, communication_templates, feedback, escalations,
  notifications, payment_logs, adjustments, signed_values, student_count_events,
  sales_opportunities, mou_import_review, vendors, agreements, vex_products, vex_pis,
  vex_dispatches, vex_orders, cc_rules, lifecycle_rules, stage_responsibility,
  chain_dismissals, reminder_thresholds, homepage_action_log, sync_health, counters,
  welcome_notes, recce_reports, products
  RESTART IDENTITY CASCADE;
SQL

# 3. Apply the data dump inside the same replica-role session.
psql "$AZURE_DATABASE_URL" \
  -c "SET session_replication_role = replica;" \
  -f /secure/tmp/gsl-ops-data.sql \
  -c "SET session_replication_role = DEFAULT;"
```

Idempotent / re-runnable: TRUNCATE-then-COPY reaches the same state no matter how many times it runs. A failed partial load is recovered by simply re-running the block. (The table list should be generated from `information_schema` at run time rather than hand-maintained, so a future migration that adds a table cannot be silently skipped.)

**`counters` table is high-priority.** It holds the PI / MOU id-minting counters as JSONB. It must copy exactly, or id generation could collide or restart. It is included in the TRUNCATE/load list above; verification (3.3) checks it explicitly.

### 3.3 Verification (row counts, no truncation, financial totals reconcile)

Three layers, all run after the load, comparing Azure against Neon. A proposed `scripts/verify-azure-parity.mjs` (reads both `NEON_DATABASE_URL` and `AZURE_DATABASE_URL`, SELECT-only on both) runs all three and exits non-zero on any mismatch.

**Layer 1: per-table row counts match (proves no truncation, nothing dropped).**

```sql
-- Run on each DB; every table's count must be identical.
SELECT table_name,
       (xpath('/r/c/text()', query_to_xml(format('SELECT count(*) AS c FROM %I', table_name), false, true, ''))))[1]::text::int
FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name;
```

(The verifier will use a direct per-table `SELECT count(*)::int` loop, not the `xpath` probe that `db-ping.mjs` got wrong.)

**Layer 2: per-table content checksum (proves rows are identical, not just equinumerous).**

```sql
-- Order-stable hash of every row in a table. Compare the single hash per table across DBs.
SELECT md5(coalesce(string_agg(md5(t::text), '' ORDER BY id), '')) FROM <table> t;
-- Composite-PK / serial tables order by their real key:
--   lifecycle_rules -> ORDER BY stage_from_key, stage_to_key
--   homepage_action_log -> ORDER BY date, user_id, item_id
--   mou_import_review, sync_health -> ORDER BY id
```

Identical hash per table = byte-identical data. This is the strongest "no truncation, no silent drop" proof available in-database.

**Layer 3: financial totals reconcile before/after (the money must not move).**

```sql
SELECT
  (SELECT coalesce(sum(contract_value),0) FROM mous)            AS mou_contract_value,
  (SELECT coalesce(sum(received),0)       FROM mous)            AS mou_received,
  (SELECT coalesce(sum(balance),0)        FROM mous)            AS mou_balance,
  (SELECT count(*) FROM mous)                                   AS mou_count,
  (SELECT coalesce(sum(expected_amount),0) FROM payments)       AS pay_expected,
  (SELECT coalesce(sum(received_amount),0) FROM payments)       AS pay_received,
  (SELECT coalesce(sum(amount),0) FROM payment_logs)            AS paylog_total,
  (SELECT count(*) FROM payment_logs)                           AS paylog_count,
  (SELECT coalesce(sum(total),0) FROM vex_pis)                  AS vexpi_total,
  (SELECT coalesce(sum(payment_received_amount),0) FROM vex_pis) AS vexpi_received,
  (SELECT value FROM counters WHERE key IN (SELECT key FROM counters) LIMIT 0) AS _counters_checked_in_L2;
```

Every figure must match Neon exactly. Known anchor rows to spot-check by id (from project memory): the recovery payment_log `VEXPL-RECOV-UP2627020`; VEX PI `VEXPI-UP-26-27-020` (`received` = 6,32,931); Funscholar `VEXPI-UP-26-27-013` (`received` = 4,10,516). These prove the historical recovery state carried across intact.

Record the Neon "before" numbers in this gate's folder (`docs/gate-azure-migration/RECONCILE_BEFORE.txt`) at snapshot time, and the Azure "after" numbers post-load, so the reconciliation is auditable.

---

## 4. Cutover (env switch) with tested rollback

### 4.1 What actually switches

The app selects its DB purely from `DATABASE_URL` (with `DATA_BACKEND=postgres` unchanged). Cutover = change the **value** of the Vercel Production `DATABASE_URL` from the Neon string to the Azure string, then redeploy so the new deployment reads the new value.

- Vercel env changes take effect on the next deployment, not on the running one. So cutover is: update the env var, then trigger a production deploy (or promote a fresh build).
- Keep the Neon value saved as `NEON_DATABASE_URL` (a second, unused Vercel env var and in 1Password) so rollback is a copy-paste, not a reconstruction.

### 4.2 Minimal / zero-downtime approach: brief announced write-freeze

This is an internal pilot tool with a small number of named testers, so a short off-hours write-freeze is the pragmatic zero-data-loss path. Live logical replication is overkill and adds far more risk than it removes here.

1. **Announce** a short maintenance window (off-hours IST).
2. **Freeze writes.** Options, simplest first: (a) tell testers to pause, and pause the GitHub Actions sync cron (`.github/workflows/sync-queue-cron.yml`); or (b) if a hard guarantee is wanted, temporarily point Vercel at a read-only holding page. For a pilot, (a) is enough.
3. **Final data re-sync.** Re-run section 3.2 (TRUNCATE + reload) so Azure holds the exact current Neon state, including any writes since the trial snapshot. Re-run section 3.3 verification. Because the load is idempotent, this "final" run is identical in shape to the rehearsal run.
4. **Flip the env var AND the region together.** Set Vercel Production `DATABASE_URL` = Azure string (via the Vercel dashboard to avoid the CLI trailing-newline / quote-wrapping traps recorded in project learnings; verify no surrounding quotes), AND land the `vercel.json` `regions` change `["sin1"]` to `["bom1"]` in the same deploy (R1: Azure is Central India, so the app must serve from Mumbai). The DB flip and the region flip must go out in one deployment.
5. **Redeploy** production.
6. **Smoke test** (section 6). If green, unfreeze writes (resume the cron, tell testers).
7. **Watch** (canary) for a defined period (e.g. 24 to 72 hours) before decommissioning Neon.

Expected downtime: the redeploy propagation (seconds to about a minute) plus the freeze window. No data-loss window, because writes are frozen across the final sync + flip.

### 4.3 Rollback (tested, fast)

Trigger: any smoke-test failure, latency regression, or connectivity error post-cutover.

1. Set Vercel Production `DATABASE_URL` back to the saved Neon value, AND revert `vercel.json` `regions` to `["sin1"]` (Neon is in Singapore; both must revert together, R1).
2. Redeploy production (or instant-rollback to the pre-cutover deployment in the Vercel dashboard, which still carries the Neon env at build time only if env is build-baked; since this app reads env at runtime, re-setting the var + redeploy is the reliable path).
3. Verify the app serves from Neon (section 6 smoke, plus the `x-vercel-id` / a DB-identity check).

Rollback is safe because **Neon was never modified**: it stayed the live primary during the whole exercise, and any writes during the freeze were captured by the final re-sync into Azure only. If we roll back before unfreezing, no write was lost. If a write happened on Azure after unfreeze and we later roll back, that write is on Azure only: hence the canary watch window before decommissioning Neon, and a documented "reverse re-sync Azure to Neon" step is only needed if we roll back AFTER accepting live Azure writes (Risk R6).

**Rollback must be rehearsed** on the staging flip (section 5.3) before the real cutover, so the exact Vercel steps are known and timed.

---

## 5. Risk and sequencing

### 5.1 Recommendation: finish the open work first, then migrate a stable state

**Migrate a stable, committed, schema-frozen snapshot, not a mid-construction one.** The working tree right now is mid-construction:

- **Uncommitted VEX status roll-up work.** `git status` shows modified `src/lib/vex/vexPaymentMutations.ts`, `vexPiMutations.ts`, `src/app/api/operations/vex/pi/[id]/payment/route.ts`, `src/lib/db/repos/vexPi.ts`, plus untracked `src/lib/vex/vexPiStatus.ts` + tests and `scripts/reconcile-vex-status-rounding.mjs`, `_diagnose-vex-status-stale.mjs`, `_v4-vex-status-rounding.mts`. This is an in-flight data-correctness fix that will also run a **reconciliation against prod data** (the `reconcile-vex-status-rounding.mjs` script). If we migrate now, we copy known-stale VEX status rows to Azure and then have to re-run the correction against Azure too: double the reconciliation, double the audit surface.
- **Editability passes 4 to 7 are not built** (state: "await owner continue for Pass 4"). Pass 4 (user-management UI) and later passes may add migrations `022+` (for example, new user columns). Migrating at `021` means immediately having to replay `022+` onto Azure as they land, and re-verifying schema parity each time. More moving parts, more drift windows.

**Therefore, recommended order:**

1. **Land + verify the current VEX status roll-up fix** and run its reconciliation on **Neon (current prod)** so prod data is correct first. Correct the data where it already lives; do not carry a known bug across the wire.
2. **Complete editability passes 4 to 7** (or at minimum reach a committed checkpoint where the schema is frozen and no further `022+` migration is imminent). Each pass ships and verifies against Neon as today.
3. **Freeze the schema** at whatever the final migration number is (call it `0NN`). Update this plan's section 2 inventory to include `022..0NN`.
4. **Then run the Azure migration** (sections 2 to 4, 6) against that stable, known-good snapshot.

Rationale in one line: the cost of migrating now is paying the schema-recreate + data-reconcile tax twice (once for the copy, again for every fix/pass that lands after), against zero benefit, since there is no stated Azure deadline in CLAUDE.md (it is "post-Phase-1").

**Escape hatch if Azure cutover becomes time-boxed** (cost, compliance, a Neon limit): freeze the schema at `021` now, migrate, and continue passes 4 to 7 directly against Azure (adding `022+` to Azure as the live target). This trades a clean single-shot copy for an earlier cutover. Only take it if a real deadline appears; otherwise option above is cleaner.

### 5.2 Azure-specific risks (what could break)

| # | Risk | Impact | Mitigation |
|---|---|---|---|
| **R1** | **Region mismatch CONFIRMED, and it is a real one.** Azure `gsl-ops` is in **Central India (Pune)**; the app currently serves from **`sin1` (Singapore)** (`vercel.json` `regions:["sin1"]`, co-located with Neon Singapore today). Post-cutover, Vercel Singapore functions would query a Central-India DB on every request: the exact Singapore-DB / far-function split that turned a 0.2s API into 8.9s (project scar). | Severe latency regression across every page (multiple queries per request), app "feels broken". | **Move Vercel serving to Mumbai as part of the cutover.** Change `vercel.json` `regions` from `["sin1"]` to `["bom1"]` (Mumbai, ~120km / low-single-digit-ms from Pune Central India; single-region pin works on all Vercel plans, same as the existing `sin1` pin). **Ship the `vercel.json` change in the SAME deploy that flips `DATABASE_URL` to Azure**, never before (a `bom1` app against Neon-Singapore would itself be mis-located). Rollback must revert BOTH `DATABASE_URL` and `vercel.json` together (see 4.3). Verify post-cutover via the `x-vercel-id` header (expect `bom1`) + a latency measurement against the pre-cutover `sin1`/Neon baseline (section 6, check 4). |
| **R2** | **Firewall / egress IPs.** Azure Flexible Server enforces a firewall. Vercel serverless functions have **non-static egress IPs**, so an IP allowlist cannot pin them. | App cannot connect to Azure at all; total outage on cutover. | Enable "Allow public access from Azure services and resources" is insufficient (Vercel is not Azure). Set a firewall rule allowing public connections (0.0.0.0 to 255.255.255.255) and rely on SSL + a strong admin password + the non-guessable host, OR front with a static-egress proxy. For a pilot, allow-public + strong creds is acceptable; document the tradeoff. Test from a Vercel Preview BEFORE prod cutover. |
| **R3** | **SSL / connection string shape.** Azure requires TLS. postgres.js must negotiate SSL. | Connection refused / handshake error. | Append `?sslmode=require` to `AZURE_DATABASE_URL`. postgres.js honours `sslmode` from the URL; confirm with `db-ping.mjs` against Azure before cutover. Use a plain username (Flexible Server, not the `user@server` Single-Server form). |
| **R4** | **The DNS fallback patch.** `client.ts` patches `dns.lookup` to fall back to 1.1.1.1/8.8.8.8 for Neon hostnames the local ISP cannot resolve. | Likely a no-op for Azure (Vercel resolves natively; the patch only fires on error), but untested against Azure hostnames. | Verify `db-ping.mjs` (which carries the same patch) resolves and connects to the Azure host. Patch is harmless (error-path only); no code change expected. |
| **R5** | **Sequences not reset.** `mou_import_review` and `sync_health` are `BIGSERIAL`. A data load that misses `setval` would reuse ids. | Future inserts collide on PK. | `pg_dump --data-only` emits `setval`; the TRUNCATE uses `RESTART IDENTITY`. Verify `nextval` sanity post-load (max(id)+1). |
| **R6** | **Split-brain writes.** Any writer still pointed at Neon after cutover (a local script using `.env.local`, the sync cron, an out-of-band recovery script) writes to the wrong DB. | Data divergence between Neon and Azure. | After cutover: update local `.env.local` `DATABASE_URL` to Azure (keep `NEON_DATABASE_URL` for reference); confirm the cron calls the app route (so it follows `DATABASE_URL` automatically); freeze out-of-band scripts during the window. |
| **R7** | **`counters` mis-copy.** Id-minting state as JSONB. | New PI/MOU ids collide or restart numbering (a known class: the `fyTag` century bug). | Explicitly included in TRUNCATE/load; verified by content checksum (L2) and a spot read post-cutover. |
| **R8** | **Env var quoting.** Project learnings: a Vercel var pasted with literal surrounding quotes broke prod (401/500). | App sees `"postgresql://...` and every query fails. | Set `DATABASE_URL` via the Vercel dashboard, strip quotes, verify end-to-end (a live login), not by reading the value back (Sensitive vars read back empty). |
| **R9** | **Data drift during the freeze window.** A tester write between snapshot and flip. | Lost write if not captured. | The freeze + final re-sync (section 4.2 steps 2 to 3) closes this. Keep the window short. |
| **R10** | **pg_dump version skew.** Client `pg_dump` older than server major version refuses to dump. | Cannot produce the dump. | Use a `pg_dump` at least as new as both Neon's and Azure's Postgres major version. Confirm versions first (`SELECT version()`). |

### 5.3 Rehearsal (staging flip) before the real cutover

Do the entire sections 2 to 4 + 6 as a **rehearsal** first, pointing a Vercel **Preview** deployment at Azure (Preview-scoped `DATABASE_URL`), while Production stays on Neon. This validates connectivity (R2/R3/R4), latency (R1), schema parity (2.3), data parity (3.3), and the rollback steps (4.3) with zero production exposure. Only after a green rehearsal do we schedule the production window.

---

## 6. Verify end-to-end in Azure post-cutover (proof of "done")

"Deployed" is not "works". The bar is: the live production app, pointed at Azure, passes every check below before we call it done and before Neon is decommissioned.

1. **Connectivity + SSL.** `db-ping.mjs` (or the app's first request) connects to the Azure host over TLS, `SELECT 1` returns.
2. **Schema parity.** Section 2.3 schema diff = empty.
3. **Data parity.** Section 3.3 layers 1 to 3 all pass: per-table counts equal, per-table checksums equal, financial totals equal, anchor rows present.
4. **Region / latency.** Read `x-vercel-id` on a live response to confirm the app now serves from `bom1` (Mumbai), co-located with Central-India Azure (R1). Time a representative dashboard/API request and compare to the pre-cutover `sin1`/Neon baseline. No material regression: `bom1` to Central India should be low-single-digit-ms, so the round-trip cost should be at or below the old `sin1`/Neon-Singapore baseline. Neon/`sin1` baseline and Azure/`bom1` number both recorded in the gate folder. A number materially worse than baseline means the region change did not take effect (still `sin1`), a rollback trigger.
5. **App smoke (read path).** Log into the live deploy with the owner-supplied `VERIFY_PASSWORD` and run `scripts/verify-deploy.mjs` (per CLAUDE.md Phase 6D): `/work` Overview, `/mous` list (MOU count matches the reconciled count), `/dashboard/finance` (programme breakdown + received totals match the pre-cutover figures), a VEX PI detail page, `/admin`. Screenshots land in `.verification/<timestamp>/`; paste paths in the final report.
6. **App smoke (write path), the decisive test.** Reads can pass while writes silently go nowhere (this repo's entire dead-letter-queue history). So do one real end-to-end write against Azure: create a `ZZ`-sentinel entity through the live UI/route (e.g. a throwaway VEX product or a test MOU), confirm the row appears in **Azure** via a direct `count(*)`/`SELECT`, confirm it renders in the live UI, then delete it and confirm it is gone. This is the V4 self-cleaning-sentinel pattern already used in Passes 1 to 3. It proves the production write path terminates in Azure, not that a redirect said "success".
7. **Audit + counters.** After the sentinel write, confirm its `audit_log` entry persisted and that a newly minted id used the next counter value (proves `counters` migrated live, R7).
8. **Canary watch.** Monitor for console errors / 500s / latency for the defined window (24 to 72h) before decommissioning Neon.

Capture all of the above in `docs/gate-azure-migration/E2E_VERIFICATION_LOG.md` (which user, which flow, what happened, screenshot paths), per the V4 verification standard.

---

## 7. Go / no-go and decommission

**Pre-cutover gate (all must be true):**
- [ ] Open work landed and schema frozen at `0NN` (section 5.1), OR the time-boxed escape hatch explicitly chosen.
- [ ] Azure `gsl-ops` server region confirmed Central India in the portal, and the `vercel.json` `regions` change to `["bom1"]` staged for the cutover deploy (R1).
- [ ] Firewall path validated from a Vercel Preview (R2).
- [ ] SSL connection confirmed via `db-ping.mjs` against Azure (R3).
- [ ] Rehearsal (5.3) green: schema parity, data parity, latency, rollback all verified on Preview.
- [ ] `NEON_DATABASE_URL` saved in Vercel + 1Password (rollback value).
- [ ] Owner approval for the window.

**Cutover gate:** section 4.2 steps executed, section 6 checks 1 to 7 green.

**Decommission gate (only after the canary window):**
- [ ] Section 6 check 8 clean for the full window.
- [ ] No rollback pending.
- [ ] Then, and only then: update `.env.local` / local scripts to Azure, archive the Neon connection, and (owner call) pause or delete the Neon project. Do not delete Neon until Azure has carried live production writes cleanly for the agreed window; it is the rollback safety net.

---

## Appendix A: one-screen runbook (for the eventual gated execution)

```
# 0. Confirm state (read-only)
node scripts/db-ping.mjs                              # Neon prod reachable
<check Azure gsl-ops public tables == 0>

# 1. Build schema in Azure (repeatable)
AZURE_DATABASE_URL=... node scripts/apply-all-migrations.mjs

# 2. Prove schema == prod
pg_dump "$NEON_DATABASE_URL"  --schema-only ... | diff - <(pg_dump "$AZURE_DATABASE_URL" --schema-only ...)

# 3. (freeze writes) Copy data (idempotent)
pg_dump "$NEON_DATABASE_URL" --data-only ... > data.sql
psql "$AZURE_DATABASE_URL" -c "TRUNCATE ... RESTART IDENTITY CASCADE" \
  -c "SET session_replication_role=replica" -f data.sql -c "SET session_replication_role=DEFAULT"

# 4. Prove data == prod
AZURE_DATABASE_URL=... NEON_DATABASE_URL=... node scripts/verify-azure-parity.mjs   # counts + checksums + money

# 5. Cutover: Vercel Production DATABASE_URL = Azure string (dashboard, no quotes), redeploy

# 6. Verify live (read + write sentinel + latency), then unfreeze

# ROLLBACK at any failure: Vercel DATABASE_URL = NEON value, redeploy.
```

## Appendix B: env vars in play

| Var | Where | Role | Changes at cutover? |
|---|---|---|---|
| `DATA_BACKEND` | Vercel Prod | `postgres` selects the SQL path | No (stays `postgres`) |
| `DATABASE_URL` | Vercel Prod | The live DB the app uses | **Yes**: Neon string to Azure string |
| `NEON_DATABASE_URL` | Vercel Prod + 1Password | Saved rollback value | New, added pre-cutover |
| `AZURE_DATABASE_URL` | local `.env.local` + 1Password | Target for all build/load/verify scripts | Build-time only; never the app's live var until step 5 |

_End of plan. Nothing in this document has been executed. Awaiting review._
