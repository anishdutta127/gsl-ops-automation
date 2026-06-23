# Data-layer audit (Phase 1): gate-db-migration

_Date: 2026-06-23. Read-only audit. No code changed in this phase._

## Headline: the app is already on Postgres in production

The brief assumed the app is a JSON-file app to be migrated to a DB. The code says
otherwise, and per the brief's own rule ("if the audit contradicts the docs, trust
the code and report it") this changes the plan:

- **One Postgres DB already exists and is the target.** Driver `postgres` (postgres.js
  v3.4.9) in `src/lib/db/client.ts`, connecting via `DATABASE_URL` to Neon
  (`ep-shiny-waterfall`, ap-southeast-1). No Supabase, no Prisma, no Drizzle, no
  `@neondatabase/serverless`. Do not introduce a new DB.
- **Schema is fully built.** 13 migrations in `scripts/migrations/`, ~40 `CREATE TABLE`s
  covering essentially every entity (incl. recent `welcome_notes`, `recce_reports`).
- **Reads are already live in production.** `currentBackend()` (`src/lib/db/backend.ts`)
  switches on `DATA_BACKEND`; production runs `DATA_BACKEND=postgres` (confirmed by the
  cron-disable commit `4d50d8e` "postgres is truth source", plus project memory). Every
  repo's `findAll`/`findById` runs SQL in that mode. Nearly every page is dynamic
  (calls `getCurrentUser()` -> `cookies()` -> request-time), so reads reflect the DB
  immediately, no rebuild.
- **The JSON files are the json-mode fallback / seed,** used locally (default
  `DATA_BACKEND=json`) and as import provenance. They are NOT the production source.

So a from-scratch "create tables, import JSON, switch reads, switch writes" migration
would mostly redo work already done, and carries real risk. The actual defect that
makes "changes don't show up" is narrower and lives in the WRITE path.

## The real defect: a half-wired write path with a dead-letter fallback

Writes go through `enqueueUpdate()` (`src/lib/pendingUpdates.ts`). In postgres mode it
calls `dispatchToRepo()`; **on any throw it silently falls back to `appendToQueue()`**
(the GitHub Contents API queue, `src/data/pending_updates.json`). That queue used to be
drained to JSON by a cron, but the cron was **deliberately disabled** (commit `4d50d8e`).
So today the fallback is a **dead-letter**: the write returns success, the row never
reaches postgres, and nothing ever drains it. Silent data loss.

`dispatchToRepo` does not cover every (entity, operation). Every uncovered op that a UI
action actually performs is a "saves successfully but disappears" bug.

### Queue-based / silently-lost writes (dispatch gaps)

Operations that `throw` in `dispatchToRepo` (or hit the `default` throw) and therefore
fall into the dead-letter queue in production:

| Entity | Op that throws | User action affected | Repo has the method? |
|---|---|---|---|
| ~~vexProduct~~ | ~~create~~ | New VEX product | FIXED (this session) |
| ~~inventoryItem~~ | ~~create~~ | New inventory item | FIXED (this session) |
| feedback | create (no case -> default) | **SPOC feedback submission** | feedbackRepo is read-only (needs create) |
| recceReport | create (no case -> default) | Recce report create | not in registry/repo |
| studentCountEvent | update | Student-count change re-price | repo is create-only |
| salesTeam | create | Add sales rep | repo update-only |
| ccRule | create | New CC rule | leafRepo update-only |
| schoolGroup | create | New school group | leafRepo update-only |
| communicationTemplate | create | New template | leafRepo update-only |
| intakeRecord | create | New intake record | leafRepo update-only |
| communication | create | **Logging a sent email / WhatsApp copy** | leafRepo update-only |
| salesOpportunity | create | New pipeline opportunity | leafRepo update-only |
| dispatchRequest | create | Raise a dispatch request | leafRepo update-only |
| lifecycleRule | create | New lifecycle rule | composite-PK repo |
| (all entities) | delete | any delete | no delete handlers |

Live evidence in `pending_updates.json` right now: 4 stuck `vexProduct.create` (228-9258),
1 `inventoryItem.create`, and 2 `mou.update` entries from 22-23 Jun that never drained.

### Genuinely build-time / stale reads (small)

Almost everything reads via repos. The only true build-time JSON imports on rendered
surfaces are admin import tools, not core data surfaces:

- `/admin/chain-mou-reconciliation` imports `@/data/_snapshots/mou-system/_meta.json`
- `/admin/imports/fy-2025-26` and `/admin/imports/pi-backfill` import
  `@/data/imports/fy-2025-26-import.json`
- (Plus the json-mode fallback inside repos, which only applies when `DATA_BACKEND=json`,
  i.e. local dev, not production.)

## Task 2 (MOUs on dashboard but not in the list): diagnosed, NOT a freshness bug

Both surfaces read the **same live source** (`mouRepo.findAll()` -> postgres in prod) at
request time. The discrepancy is a **default filter**, not staleness:

- MOUs list (`src/app/mous/page.tsx` L127-135) defaults to the **current financial year**
  (`getCurrentFinancialYear()`), overridable via `?year=` / the year-picker pills. MOUs in
  another FY are hidden by default.
- The programme breakdown (`computeProgrammeBreakdown` in
  `src/lib/dashboard/financeDashboardData.ts`, rendered on `/dashboard/finance` and
  `/dashboard/ops`) aggregates **all MOUs with no FY filter** by default.

So the 3 Young Pioneers MOUs are in a non-current FY: counted in the all-years breakdown,
hidden by the list's current-FY default. The dashboard is not stale and the list is not
wrong; they apply different default scopes. Fix = make the list's FY scope obvious and
clearable (e.g. an "All years" pill, and a visible "showing FY 2026-27" with a clear
control), or align the dashboard breakdown to the same FY default. This contradicts the
DESIGN.md "dashboard is build-time JSON" note, which is stale.

## Recommended plan (corrected; supersedes a from-scratch migration)

The goal ("one live DB, changes reflect everywhere immediately, no rebuild/cron delay")
is achievable surgically, because reads are already live:

1. **Close the write dispatch gaps.** Add the missing `create` (and `studentCountEvent`
   update) handlers + the repo `create` methods they need (feedback, communication,
   salesOpportunity, dispatchRequest, ccRule, schoolGroup, communicationTemplate,
   intakeRecord, salesTeam, recceReport, lifecycleRule). Same pattern as the
   vexProduct/inventoryItem fixes already shipped. This is the fix that makes every save
   land in postgres immediately.
2. **Stop the silent dead-letter.** Make a failed postgres dispatch surface a real error
   to the caller (fail loudly) instead of swallowing into the disabled queue; or remove
   the queue fallback for postgres mode. Audit routes to render the real error.
3. **Recover the stuck rows.** Re-enter (or one-time import) the 7 stuck
   `pending_updates.json` entries into postgres; then empty the dead queue.
4. **Convert the 3 admin build-time JSON reads** to repo reads (or accept them as import
   tooling, documented).
5. **Task 2 filter UX**: surface + clear the MOUs-list FY default.
6. **Optionally retire the queue/cron/drain machinery** once (1)-(2) land, per
   simplicity-first.

This is reviewable in small commits and avoids the risk of a redundant bulk migration.

## Open decision (PAUSE here per the brief)

Two ways forward; need a call before writing code:
- **A (recommended): the surgical plan above**: fix the write gaps + harden the
  fallback + the 3 reads + Task 2, in small commits. Matches the real state of the code.
- **B: the literal full migration**: re-derive schema, re-import all JSON, force-switch
  every read/write, delete the queue machinery wholesale. Larger blast radius; much of it
  is already done, so mostly redundant and riskier.
