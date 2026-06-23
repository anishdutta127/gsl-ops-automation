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
3. **Twin bug (same root cause):** `inventoryItem.create` had the identical
   gap (`dispatchToRepo` threw on create). Added `inventoryItemRepo.create()`
   (postgres `INSERT` matching the `inventory_items` schema; json enqueue for
   symmetry) and wired `operation === 'create'` in the `inventoryItem` dispatch
   case. The reported session created BOTH a VEX product and an inventory item
   for the same SKU `228-9258`; both were being lost.

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

The dispatch-routing test also covers `inventoryItem` create (twin bug):
`inventoryItemRepo.create` is called, `appendToQueue` is not.

Local test run: `5 passed | 1 skipped`.

## Related findings (live queue evidence, broader than this fix)

Inspecting `src/data/pending_updates.json` on `main` after this fix gave live
corroboration and surfaced a larger problem:

- **The reported bug, in the wild.** User `anita.c` (and `pranav.b`) created VEX
  product `228-9258` ("VIQRC Full Game Element 2026-27") **four times** between
  22-Jun and 23-Jun; each fell into the queue fallback, so they retried. A
  matching `inventoryItem.create` for the same SKU is stuck too. Both are the
  deterministic-throw bug fixed here.
- **The drain cron is intentionally disabled.** Commit `4d50d8e` (28-May-2026)
  renamed `.github/workflows/sync-queue-cron.yml` to `.yml.disabled` with the
  message "disable sync-queue-cron (postgres is truth source)". `gh run list`
  confirms the last cron run was 27-May-2026. So the JSON queue **never drains**
  now, and even if it did it writes to `src/data/*.json`, which postgres
  production never reads.
- **Therefore the queue fallback is a silent dead-letter.** Any write whose
  postgres dispatch throws is swallowed into a queue that goes nowhere; the user
  sees a success redirect and the data is lost. This fix closes the two
  deterministic create gaps (`vexProduct`, `inventoryItem`), but **two stuck
  `mou.update` entries** (`MOU-STEAM-2627-085`, `MOU-STEAM-2627-087`) show OTHER
  writes are also hitting the fallback for non-deterministic reasons. A full
  audit of every entity's dispatch coverage is warranted (now scoped as the
  planned DB-migration work).
- **Recovery of the already-lost rows.** The four `228-9258` creates + the
  inventory item + the two MOU updates sit in the dead queue and will not appear
  in production. After this fix deploys, the simplest recovery is to re-enter
  them via the forms (the new write now lands in postgres). I did not write to
  the production DB directly (prod writes are denied, and it is an outward,
  hard-to-reverse action).

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
