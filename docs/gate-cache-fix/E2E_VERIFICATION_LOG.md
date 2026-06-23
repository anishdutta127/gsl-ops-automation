# gate-cache-fix: VEX product not visible until "Sync now"

**Date:** 2026-06-23. Diagnosed against live prod before fixing (VERIFY_PASSWORD).

## Diagnosis (write vs read, confirmed against prod)

Per the protocol: first establish whether the row reaches Postgres immediately
(write) or only after "Sync now".

- **Write is immediate (not queued).** A throwaway VEX product created via the
  live create route was present in Postgres **immediately after create, before any
  "Sync now"** (direct `SELECT` confirmed), and rendered in the SKU master on a
  fresh full load (HTTP 200). [Established in STEP 0 / gate-stuck-data; re-using
  that evidence.] So the create-dispatch fix is holding: the write is NOT going to
  the dead-letter queue.
- **Server read is live.** `/operations/vex` is dynamic (`getCurrentUser()` ->
  cookies), reads `vexProductRepo.findAll()` against Postgres at request time. A
  fresh load reflects new rows.
- **The lag is the App Router CLIENT router cache, not invalidated on the VEX
  mutation.** Evidence: across the app, client-component mutation forms call
  `router.refresh()` after writing (dispatch, finance, agreements, vendors, etc.),
  but the VEX product create/edit flow is a **native `<form method=POST>`** and
  **no route calls `revalidatePath` for `/operations/vex`** (only one route in the
  whole app used `revalidatePath` at all). So after a create, a soft (in-app
  `<Link>`) navigation to the SKU master can serve a stale cached RSC payload until
  it expires. "Sync now" (the legacy queue-drain on `/admin`) busts it only
  incidentally (it forces a refresh); it is not what persists the row.

**Which "real-time" this is:** case (a) "after I save it should appear for me
without a manual Sync". It is NOT case (b) (live push to another user's already-open
screen): that would need polling/websockets and is not built here.

**What "Sync now" actually does:** triggers `/api/admin/sync-queue` -> `drainQueue`
(the legacy JSON-queue drain). In postgres mode the queue stays empty, so for these
create/edit flows "Sync now" is now **redundant** (kept for queue health/legacy
ad-hoc use; not removed this pass).

## Fix (surgical)

- `revalidatePath('/operations/vex')` in the VEX product **create** and **edit**
  routes; `revalidatePath('/admin/inventory')` in the inventory **create** route.
  This invalidates the client router cache for the list on mutation, so the new
  row shows on normal navigation without "Sync now".
- `export const dynamic = 'force-dynamic'` on `/operations/vex` and
  `/admin/inventory` to make request-time rendering explicit and refactor-proof
  (they were already dynamic via cookies; no behaviour change, documents intent).
- Surgical: did not touch unrelated list pages' rendering. Other native-form list
  flows (MOUs, etc.) can adopt the same `revalidatePath` pattern; tracked as a
  follow-up rather than a broad sweep this pass.

## Verification

| What | How | Result |
|---|---|---|
| Write reaches Postgres immediately (before Sync) | live create + direct `SELECT` | PASS (STEP 0) |
| Fresh full load shows the new SKU | live `/operations/vex` HTTP 200 | PASS (STEP 0) |
| Build typechecks (routes + pages) | `npm run build` | PASS; `/operations/vex` and `/admin/inventory` render as `ƒ` (dynamic) |
| New SKU shows on normal navigation, no "Sync now" | post-deploy live re-check | see residual below |

## Residual risk (per V4)

The soft (in-app `<Link>`) navigation staleness could not be scripted cleanly this
session: the Playwright reproduction that filled and submitted the real browser
form lost its session on the form POST and bounced to `/login` (a harness
cookie-handling glitch, not prod behaviour; STEP 0's API-level create authenticated
fine). So the "appears on soft-nav without Sync" acceptance was verified by
reasoning + the code asymmetry, not a live soft-nav click. `revalidatePath` is the
canonical Next App Router remedy for exactly this (mutation should reflect in lists
on navigation). Recommended final confirmation: after this deploys, create a VEX
product in the live UI and navigate to the SKU master via the nav (not a hard
refresh): it should appear with no "Sync now".
