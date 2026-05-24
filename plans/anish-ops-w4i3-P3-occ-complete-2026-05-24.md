# P3 OCC fixes complete + cutover-ready P4 plan - 2026-05-24

Date: 2026-05-24
Phase: 7 Part 5.B P3 close-out → P4 plan
Scope per Anish's GO 2026-05-24:
  1. Close 3 P3 OCC races (vexProduct, stageResponsibility, mouImportReview).
  2. Document conditional-safety for user + salesTeam (loud comments in repos + cutover-ready report).
  3. Document magicLinkToken.view_count as deliberate accept.
  4. Then P4: 138 read-only pages → repo reads with per-computed-value SQL parity.

## Part 1 - Three P3 OCC fixes proven

`scripts/verify-occ-567-proofs.mjs` ran against staging Postgres. All PASS.

### OCC #5: vex_products.default_unit_price - PASS
- **Schema:** `scripts/migrations/006-vex-products-version.sql` applied (`version INTEGER NOT NULL DEFAULT 1`).
- **Repo:** `src/lib/db/repos/vexProduct.ts` adds `updateOCC(partNumber, expectedVersion, patch, opts)` - single atomic UPDATE with `WHERE part_number=$1 AND version=$2`.
- **Route:** `src/app/api/operations/vex/products/[partNumber]/edit/route.ts` reads `expectedVersion` from form, calls `vexProductRepo.updateOCC`, returns 303 with `?error=version-conflict&conflictVersion=N` on mismatch.
- **UI:** `src/app/operations/vex/products/[partNumber]/edit/page.tsx` adds hidden `<input name="expectedVersion" value={product.version}>` + ERROR_COPY entry.
- **Proof:**
```
--- OCC #5: vex_products.default_unit_price ---
winners=1 losers=9 final.version=2 default_unit_price=100.00
retry: WIN (v=3)
OCC #5: PASS
```

### OCC #6: stage_responsibility.responsible_department - PASS
- **Schema:** `scripts/migrations/007-stage-responsibility-version.sql` applied.
- **Repo:** `src/lib/db/repos/leafRepos.ts` `stageResponsibilityRepo` adds `updateWithAuditOCC(stage, expectedVersion, patch, audit, opts)` - atomic UPDATE with `WHERE stage=$1 AND version=$2` plus `audit = audit || jsonb` concat (note: column is `audit`, not `audit_log`).
- **Lib:** `src/lib/stageResponsibility.ts` `updateStageResponsibility` accepts `expectedVersion`, branches on `currentBackend()`. In postgres mode, calls the OCC method; on mismatch returns `{ok:false, reason:'version-conflict', conflictVersion}`. In json mode, falls back to `deps.enqueue` (test-compat).
- **Proof:**
```
--- OCC #6: stage_responsibility.responsible_department ---
winners=1 losers=9 final.version=2 responsible_department=admin audit=1
retry: WIN (v=3)
OCC #6: PASS
```

### OCC #7: mou_import_review NULL-check - PASS (data-layer guard is the binding check)
- **No schema change** - uses existing `resolution` + `resolved_at` columns.
- **Repo:** `src/lib/db/repos/leafRepos.ts` `mouImportReviewRepo` adds `resolveIfPending(queuedAt, rawRecordId, resolution, fields)` - conditional UPDATE with `WHERE queued_at=$1 AND raw_record->>'id'=$2 AND resolution IS NULL AND resolved_at IS NULL`.
- **Lib (per Anish: data-layer guard REPLACES the in-memory check, not supplements):**
 - `src/lib/mou/rejectImportReview.ts` keeps the in-memory `if (item.resolution !== null)` check labelled as **"snapshot fast-path check (cheap UX feedback); the data-layer NULL-check below is the binding correctness check"**.
 - The atomic `resolveIfPending` call in postgres mode is the SOLE correctness gate.
- **Proof of binding guard:**
```
--- OCC #7 (set): mou_import_review NULL-check ---
winners=1 losers=9 final.resolution=rejected final.resolved_by=admin-4
retry-after-resolved: CORRECTLY CONFLICTS (0 rows, idempotent)
OCC #7: PASS
```
- 9 losers got `{ok:false, reason:'already-resolved'}` - would surface to admin queue as "this review was just resolved by another admin; refresh to see the result". Retry-after-resolved correctly idempotent (0 rows affected).

## Part 2 - Conditional-safety documentation (per Anish requirement (a))

Two entities classified as proven-safe-by-absence-of-edit-form now carry **loud explicit comments** on the repo that any future dev adding an edit page MUST adopt the OCC pattern.

### user - `src/lib/db/repos/user.ts`
Added prominent banner comment:
```ts
/*
 * ============================================================================
 * !!! CONDITIONALLY SAFE - NO ADMIN-EDIT FORM EXISTS !!!  (P3 trace 2026-05-24)
 * ============================================================================
 *
 * ...The User row has scalar UPDATE writers but there is NO /admin/users
 * edit page in the codebase...
 *
 * **Mandatory before adding any User edit UI: adopt the OCC pattern
 * proven in src/lib/db/repos/leafRepos.ts (makeAuditedLeafRepo.
 * updateWithAuditOCC) or src/lib/db/repos/vexProduct.ts (updateOCC)**
 * [4-step checklist + 10-parallel proof requirement]
 *
 * This comment is intentionally loud. Do NOT silently add a user edit
 * route without OCC.
 */
```

### salesTeam - `src/lib/db/repos/salesTeam.ts`
Same shape as user. Banner explicitly names `vexProductRepo.updateOCC` as the reference pattern.

### Why this matters
"Safe by absence of feature" is a runtime invariant that can be violated by a single PR adding an edit page. The loud repo comment makes the invariant visible to anyone touching either file. The cutover-ready gate report (next section) cross-references these comments.

## Part 3 - magicLinkToken.view_count documented as deliberate accept (requirement (b))

`src/lib/db/repos/leafRepos.ts` magicLinkTokenRepo header now carries:

```ts
// P3 OCC trace 2026-05-24: view_count is a non-billing counter; two
// simultaneous status-view clicks on the same magic link race the
// increment and produce an off-by-one. This is a DELIBERATE ACCEPT,
// not an oversight:
// - view_count is not security-relevant (auth gating is on used_at /
//     expires_at, not on count).
// - off-by-one in an audit-trail counter has zero material impact.
// - writers are single-click events; the race window is bounded.
// used_at and used_by_ip writers set deterministic values; concurrent
// writes are idempotent. No fix planned.
// If view_count ever becomes billing-relevant: atomic-increment
// pattern (`UPDATE ... SET view_count = view_count + 1 WHERE id`).
```

## Part 4 - All 7 OCC fixes proven (consolidated)

| OCC # | Field | Pattern | Proof | Status |
|---|---|---|---|---|
| 1 | cc_rules.cc_user_ids | version | verify-occ-123-proofs.mjs 10/1+9 | PASS |
| 2 | communication_templates.default_cc_rules | version | verify-occ-123-proofs.mjs 10/1+9 | PASS |
| 3 | dispatches.override_event (set + ack) | NULL-check | verify-occ-123-proofs.mjs 10/1+9 (set) + 10/1+9 (ack) | PASS (data-layer REPLACES in-memory) |
| 4 | kit_dispatches.dispatch_summary (+ allocations) | version | verify-occ-4-dispatch-summary.mjs 10/1+9 cross-flow | PASS |
| 5 | vex_products.default_unit_price | version | verify-occ-567-proofs.mjs 10/1+9 + retry | PASS |
| 6 | stage_responsibility.responsible_department | version | verify-occ-567-proofs.mjs 10/1+9 + retry | PASS |
| 7 | mou_import_review NULL-check | resolution + resolved_at | verify-occ-567-proofs.mjs 10/1+9 + idempotent-retry | PASS (data-layer REPLACES in-memory) |

Plus the 2 money atomic-append fixes from P2b.X:
| Field | Pattern | Proof | Status |
|---|---|---|---|
| payments.partial_payments | atomic SQL (concat + sum + status recompute + audit append) | verify-partial-payments-atomic.mjs 10/10 three-layer | PASS |
| vex_pis.payment_log_ids | atomic SQL (same shape) | verify-vex-payment-atomic.mjs 10/10 three-layer | PASS |

**Zero known races remain in the audited inventory. Every replace-on-update field and every scalar with a real concurrent-diff admin path is now either fixed-and-proven or documented with a concrete trace.**

## Part 5 - P4 plan: 138 read-only pages → repo reads + per-computed-value SQL parity

### Scope
Inventory all read-side surfaces (pages, server components, API GETs) that currently bind to `src/data/*.json` imports. In postgres mode, they read stale JSON; cutover requires every read to come from the live repo.

But Anish's bar is sharper: **"A read page that renders is not proof it shows the RIGHT number; it must match SQL truth."** Every computed-value surface (totals, balances, counts, aggregates, anything dashboard-y) gets a read-parity check: app-displayed value == independent SQL computation.

### Approach (batched)

**Batch 1 - Inventory.** Grep every `import.*Json from '@/data/'` plus every page/component that displays a number derived from those imports. Categorize:
 - (a) Simple list pages (rows == row count): straight repo swap.
 - (b) Detail pages (single record): straight repo swap.
 - (c) **Computed-value surfaces (the priority targets):**
 - 4-column financial panel (Contract Value / Received / Balance / Adjustments)
 - Received tile on dashboard
 - Action queue counts (overdue / due-soon / WIP escalations)
 - Leadership view rollups (regional revenue, school count, kit-status)
 - Kit-dispatch summary aggregates (allocated / dispatched / delivered)
 - Inventory current_stock totals
 - Sales pipeline conversion rates
 - VEX PI ledger totals

**Batch 2 - Repo migration.** For each (a) and (b), swap `import json from '@/data/...'` for `await repo.findAll()` / `await repo.findById()` in the server component / page. Smoke-test rendering.

**Batch 3 - Read-parity harness.** For each (c) surface, add a test:
  1. Compute the SQL truth via `SELECT SUM/COUNT/...` (independent of app code).
  2. Render the page (Playwright / direct API GET).
  3. Parse the displayed number.
  4. Assert: rendered == SQL truth.

**Batch 4 - Failures.** Any discrepancy is a cutover-blocker. Investigate at row level: is the app computation wrong (rounding, filter, aggregation key) or is the SQL wrong? Fix the divergent side, re-run, repeat until zero divergences.

### Batch 1 starting list (high-priority computed-value surfaces)
From a grep across `src/app/(mous|dashboard|finance|operations|admin)`:
1. `/dashboard` - 4-column financial summary + action queue counts
2. `/mous` - registry rendering + filtered counts
3. `/mous/[mouId]` - 4-column panel per MOU
4. `/finance/payment-logs` - reconciliation totals
5. `/finance/aging` - aging buckets (this is a Phase 1.1 surface, may not exist yet)
6. `/operations/vex` - VEX PI ledger totals
7. `/dispatch/kits/summary` - kit dispatch aggregate counts
8. `/admin/queue-status` - sync queue depth, drain rates
9. `/escalations` - WIP / Closed buckets
10. `/leadership` - regional rollups

Per-surface read-parity test added to `scripts/verify-read-parity.mjs` (to be created in P4).

### Estimated scope
- 138 pages × straight swap: most are 5-10 minutes each = ~12-23h.
- Computed-value surfaces (10 priority targets): 1-2h each for swap + SQL-parity test = ~10-20h.
- Total: ~22-43h spread across batches.

### Cutover-ready gate (post-P4)
After P4:
- Full harness PASS (verify-part5-functional.mjs 27 + 9 = 36 tests, verify-p2b-concurrency.mjs 19, verify-occ-123-proofs.mjs 4, verify-occ-4-dispatch-summary.mjs 1, verify-occ-567-proofs.mjs 3, verify-partial-payments-atomic.mjs 1, verify-vex-payment-atomic.mjs 1, verify-allocations-occ.mjs 1, verify-allocations-occ-repo.mjs 1, verify-read-parity.mjs N (from P4)).
- Free-tier mitigations applied (Neon pgbouncer max:1 + prepare:false - already done in P1.2).
- Final inventory at zero (all 30 entities accounted for, all writers traced).
- The conditional-safety items (user, salesTeam) flagged in the gate report.
- The deliberate-accept (magicLinkToken.view_count) noted.

## Part 6 - Files touched in this session

**Schema migrations:**
- `scripts/migrations/006-vex-products-version.sql` (applied)
- `scripts/migrations/007-stage-responsibility-version.sql` (applied)

**Repos:**
- `src/lib/db/repos/vexProduct.ts` - `version` mapper + `updateOCC` method.
- `src/lib/db/repos/leafRepos.ts` - `stageResponsibilityRepo.updateWithAuditOCC`, `mouImportReviewRepo.resolveIfPending`, magicLinkToken header comment.
- `src/lib/db/repos/user.ts` - CONDITIONALLY-SAFE loud banner comment.
- `src/lib/db/repos/salesTeam.ts` - CONDITIONALLY-SAFE loud banner comment.

**Types:**
- `src/lib/types.ts` - added optional `version: number` to `VexProduct` and `StageResponsibility`.

**Libs:**
- `src/lib/stageResponsibility.ts` - accepts `expectedVersion`, routes via `updateWithAuditOCC` in postgres mode.
- `src/lib/mou/rejectImportReview.ts` - in-memory snapshot check is labelled as fast-path; `resolveIfPending` is the binding data-layer guard in postgres mode.

**Routes:**
- `src/app/api/operations/vex/products/[partNumber]/edit/route.ts` - reads `expectedVersion`, calls `updateOCC`, returns 303 with conflict-version on mismatch.

**UI:**
- `src/app/operations/vex/products/[partNumber]/edit/page.tsx` - hidden `expectedVersion` + ERROR_COPY entry.

**Tests:** all PASS (25/25 in stageResponsibility + rejectImportReview).

**Harnesses:**
- `scripts/verify-occ-567-proofs.mjs` (new) - 3 OCC guards × 10 parallel + retry, all PASS.

## Part 7 - Approval requested

**All 7 OCC fixes complete + proven.** Plus 2 money atomic-append fixes proven. No known races in the audited inventory.

**Conditional-safety documented** in two repo banners + this report. magicLinkToken.view_count documented as deliberate accept.

**P4 plan**: per-surface read-parity testing per Anish's bar (render == SQL truth, not render-without-crash).

Recommend: GO on P4 starting with the computed-value surfaces (4-column panel, Received tile, dashboard, action queue, leadership). Production stays json.
