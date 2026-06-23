# gate-sku-fix: E2E verification log

**Date:** 2026-06-22
**Symptom:** On the SKU master / VEX products page (`/operations/vex`), clicking
"New product" and saving did not make the product appear in the list.

## Root cause (diagnosed, not assumed)

Production runs `DATA_BACKEND=postgres` (CLAUDE.md sync section + project memory:
prod DB is `ep-shiny-waterfall`). In postgres mode every write goes through
`enqueueUpdate` -> `dispatchToRepo` (`src/lib/pendingUpdates.ts`). The
`vexProduct` case handled **only `update`** and **threw on `create`**:

```ts
case 'vexProduct': {
  if (operation === 'update') await vexProductRepo.update(...)
  else throw new Error(`vexProduct ${operation} is not supported via repo`)
}
```

`enqueueUpdate` catches that throw and falls back to `appendToQueue` (the JSON
queue). The cron then drains the create into `src/data/vex_products.json` and
commits it. But the SKU master read path (`vexProductRepo.findAll()`) reads
`SELECT * FROM vex_products` from **postgres** in prod, and never reads that JSON
file. So the new product was written to the wrong store and stayed permanently
invisible. The user still got a success redirect (`?product-created=...`) because
the fallback swallowed the dispatch error: **silent success, invisible result.**

Edits worked in prod because `vexProductRepo.updateOCC` already had a postgres
branch; only **create** was never wired (`vexProductRepo` had no `create()` at
all). This create-vs-edit asymmetry is the exact signature of the bug.

Ruled out by inspection:
- **Drain cron**: healthy. `sync_health.json` shows regular `github-actions`
  runs, `ok:true`, queue currently `[]`, `CRON_SECRET` working. Not the cause.
- **Build-time read**: `/operations/vex` is `ƒ (Dynamic)` (confirmed in the build
  output); it reads at request time. Not a static-render staleness issue in prod.
- **Status filter**: the SKU table renders both active and retired SKUs; new
  products default `active=true`. Nothing filters them out.

## Fix (surgical)

1. `src/lib/db/repos/vexProduct.ts`: added `create()` with a postgres `INSERT`
   (columns matched to `001-init.sql` + `006-vex-products-version.sql`:
   `part_number, name, default_unit_price, active, version`) and a json-mode
   enqueue branch for symmetry with `update()`.
2. `src/lib/pendingUpdates.ts`: wired `operation === 'create'` in the
   `vexProduct` dispatch case to `vexProductRepo.create`.

No data-layer re-architecture (CLAUDE.md rule #3). The JSON-queue fallback for
other entities is untouched.

## Verification

| # | What | How | Result |
|---|---|---|---|
| 1 | Postgres-mode create routes to the repo, not the queue fallback | `src/lib/pendingUpdates.vexProductCreate.test.ts` (mocks repo + githubQueue, `DATA_BACKEND=postgres`) | PASS: `vexProductRepo.create` called once; `appendToQueue` not called |
| 2 | Update still routes to `vexProductRepo.update` | same file | PASS |
| 3 | Full route walk: form -> POST -> dispatch -> success redirect | `src/app/api/operations/vex/products/route.test.ts` (`@vitest-environment node`, real `FormData`, `TESTING_OPEN_ACCESS=true`, Admin user) | PASS: 303 to `/operations/vex?product-created=999-TESTNEW`; `enqueueUpdate` called with `{entity:'vexProduct', operation:'create', payload:{...}}` |
| 4 | Duplicate part number rejected with clear error, no dispatch | same file | PASS: 303 with `error=duplicate-part-number`, no enqueue |
| 5 | Real postgres INSERT + read-back through `findAll`/`findByPartNumber` | `src/lib/db/repos/__tests__/vexProduct.create.parity.test.ts` (gated on `DATABASE_URL`, sentinel SKU, self-cleanup) | SKIPPED locally (no `DATABASE_URL`); runs wherever a DB is configured (CI/staging) |
| 6 | Production build | `npm run build` | PASS: typecheck + Next build clean; `/operations/vex` and `/operations/vex/products/new` both `ƒ (Dynamic)` |

Local test run: `4 passed | 1 skipped`.

## Residual risk (stated per V4 standard)

A **live** end-to-end walk against the production postgres DB was **not** performed:
`.env.local`'s `DATABASE_URL` points at production (`ep-shiny-waterfall`), prod
probes/writes are denied by the permission classifier without explicit per-target
authorisation, and there is no separate verification DB configured. Writing a test
product to the prod DB is an outward, hard-to-reverse action and was deliberately
not done.

The postgres write path is covered by:
- the dispatch-routing test (#1) proving the create reaches the repo, and
- the gated integration test (#5) which executes the real `INSERT` + read-back the
  moment a `DATABASE_URL` is available (CI/staging/local-with-DB).

The local-json mode cannot reproduce the postgres path (it enqueues and reads the
build-time JSON import; the known "appears after the cron drain + rebuild"
artifact applies there, which is the legacy interim behaviour, not the prod fix).

**To close the residual risk:** after deploy, watch one real Add VEX product save
on production (Finance/Admin user) and confirm the SKU appears in the list
immediately. If a verification DB is wired or `DATABASE_URL` is exported in CI,
test #5 will execute the INSERT path automatically.
