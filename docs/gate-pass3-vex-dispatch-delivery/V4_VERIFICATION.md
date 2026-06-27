# Pass 3 V4 verification: VEX dispatch delivery confirmation + PI roll-up + tax-invoice recorder

Gate: editability pass 3 (ship the held delivery-confirmation branch). Date: 2026-06-28.

This pass integrates the delivery-confirmation work (originally committed local-only as
`d1f0104`, held back pending prod migration 019) into `main` and verifies the full flow
against production.

## 1. Migration 019 (gated: backup -> apply -> verify)

Additive, reversible (`scripts/migrations/019-vex-dispatch-delivered.down.sql`):
adds `vex_dispatches.delivered_at` (TIMESTAMPTZ) + `delivered_by` (TEXT). The `status`
column is free-text (no CHECK), so the new `Delivered` value needs no constraint change.

- **Backup (pre-apply snapshot):** `.recovery-backup/vex-dispatches-pre-019.json`
  - host `ep-shiny-waterfall-...` (prod), `vex_dispatches` rows: 15, columns before: 19
  - `delivered_at` present before: false; `delivered_by` present before: false
- **Apply:** `node scripts/apply-migration.mjs <019>` -> ok in 645ms against `ep-shiny-waterfall`.
- **Verify (`scripts/_verify-vex-dispatch-cols.mjs`):**
  - `delivered_at present: true` (timestamp with time zone)
  - `delivered_by present: true` (text)
  - column count 19 -> 21.

Result: PASS. Columns present in prod before any code that writes them was deployed.

## 2. Integration + deploy

- `pass3-integration` (= `main` + cherry-picked `003d9c7` + voided-aware hardening `a553344`)
  fast-forward merged into `main`. 19 files, 0 conflicts.
- Build-gate GREEN: `tsc --noEmit` 0, `next lint` 0, docs-lint pass, audit:routes pass,
  vitest 3441 pass / 82 skip, `next build` clean.
- Pushed `86bb259..a553344 main -> main` (pre-push suite green). Vercel deploy triggered
  AFTER migration 019 was live (columns first, code second).

## 3. V4 prod walk (self-cleaning sentinels, `scripts/_v4-pass3-delivery.mts`)

Mirrors the Pass 1/Pass 2 approach: exercises the EXACT orchestration of the two route
handlers (`.../dispatch/[dispatchId]/transition` and `.../dispatch/[dispatchId]/tax-invoice`)
using the same imported functions (`vexDispatchRepo.updateWithAudit`, `vexPiRepo.findById`,
`rollUpVexPiStatus`, `enqueueUpdate`) against the REAL prod schema, on sentinel
PIs/dispatches it creates and DELETES. The deployed HTTP walk needs `VERIFY_PASSWORD`
(not stored); the routes' `getCurrentUser()` is cookie-bound and cannot run outside a
request scope, hence the route-faithful replica.

User: real active Admin (`Ajith N.`, `ajith.n`, role Admin, department null wildcard).
Access gates the routes rely on: `canRaiseDispatch` = true, `canEditFinanceData` = true.

### Scenario A: full lifecycle -> PI Completed
`Requested -> Request Raised to Warehouse -> Invoiced (via tax-invoice) -> Shipped -> Delivered`
- A1 transition to Request Raised: dispatch advances; PI stays `Delivery Pending` (nothing delivered). PASS
- A2 tax-invoice recorder: number `TINV-V4-001` + https URL recorded, dispatch advances to `Invoiced`, `invoiced_at` stamped. PASS
- A3 transition to Shipped: PI still `Delivery Pending` (shipped != delivered). PASS
- A3b tax-invoice no-rewind: recording on an already-Shipped dispatch updates the number but keeps status `Shipped`. PASS
- A4 transition to Delivered: `delivered_at` stamped (`2026-06-27T19:41:27Z`), `delivered_by` = `Ajith N.` (migration 019 columns), PI auto-rolls up to `Completed` and persists. PASS
- A5 forward-only guard: a rewind `Delivered -> Shipped` is rejected (`invalid-transition`); dispatch stays `Delivered`. PASS

### Scenario B: partial dispatch -> PI Partially Dispatched
PI has 2 line items (P1 qty 10, P2 qty 5); the dispatch carries only P1.
- After Delivered: `delivered_at` stamped; PI rolls up to `Partially Dispatched` (NOT `Completed`, because P2 remains undispatched) and persists. PASS

**Result: ALL CHECKS PASS (29/29). Sentinels cleaned up; prod restored (vex_dispatches 15, vex_pis unchanged).**

## 4. Bug found by V4 and fixed (the reason the walk earned its keep)

The first V4 run FAILED at A4 (the dispatch -> Delivered PI roll-up):

```
[enqueueUpdate] postgres dispatch failed; ... TypeError: repo.updatePartial is not a function
  at dispatchAuditedUpdate (src/lib/pendingUpdates.ts:125)
  at dispatchToRepo (... case 'vexPi' update)
```

**Root cause:** `case 'vexPi'` (update) in `pendingUpdates.ts` is deliberately routed through
`dispatchAuditedUpdate`, which requires the repo to implement `RepoWithAtomic`
(`findById` + `updatePartial` + `appendAudit`). `vexPiRepo` had `findById` + `appendAudit` +
a full-row `update`, but **no `updatePartial`**, so every `enqueueUpdate({ entity: 'vexPi',
operation: 'update' })` threw. The PI roll-up (this pass's headline feature) is the first and
only caller of that path, so the feature was broken in the just-deployed build. The route unit
test (`transition/route.rollup.test.ts`) mocks `enqueueUpdate`, so it never exercised the real
bridge - only a prod walk (or the contract test below) catches it.

**Fix:** added `vexPiRepo.updatePartial(id, patch, opts)` (camelCase -> snake_case map, JSONB
handling for `line_items` / `payment_log_ids`), mirroring `vexDispatchRepo.updatePartial`.
This honours the wired atomic-update intent (scalar partial update + atomic `appendAudit`)
rather than reverting to a non-atomic full-row update.

**Regression gate (fix the gate, not just the symptom):** added
`src/lib/db/repos/__tests__/auditedUpdate.contract.test.ts` - asserts every repo whose update
is routed through `dispatchAuditedUpdate` (18 entities) exposes `findById` + `updatePartial` +
`appendAudit`. It fails for any future repo wired to the atomic bridge without the surface.
All 18 pass after the fix (the other 17 were already compliant - no sibling latent bugs).

After the fix, the V4 walk is 29/29 green.

## Residual notes

- The roll-up route enqueues a full-spread PI payload (`{ ...pi, status, auditLog }`), so the
  scalar partial-update still writes back the read-time `payment_received_amount` /
  `payment_log_ids`. The atomic gain is on `audit_log` (server-side `|| jsonb` concat). A
  concurrent VEX payment during the same delivery transition is not a real-world race (roll-up
  runs immediately after the delivery click); narrowing the patch to `{ status }` is a possible
  future tightening, out of scope here.
- Tax-invoice recorder is paste-a-URL (Drive/SharePoint), validated https, not a binary upload
  (Vercel FS is read-only; see learnings). If Pranav needs real binary upload that is a separate
  storage task (putBinaryFile/blob, not fs.writeFile).
