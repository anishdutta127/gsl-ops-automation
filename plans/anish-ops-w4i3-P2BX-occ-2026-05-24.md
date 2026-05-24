# P2b.X allocations OCC + 4 REPLACE-WINS field traces - 2026-05-24

Date: 2026-05-24
Phase: 7 Part 5.B P2b.X (cutover-gate close-out before P3)
Scope per Anish's GO 2026-05-24:
  1. Close `kit_dispatches.allocations` race with OCC (version + 409 + UI reload). Prove 10 concurrent writes → 1 winner + 9 clean 409s.
  2. Concrete call-path traces for cc_user_ids, default_cc_rules, override_event, dispatch_summary. Real grep, no "low concurrency" soft judgements.
  3. Money fields accepted (10/10 three-layer proof). Write-once fields accepted (line_items, payment_schedule).
  4. P3 plan.

## 1. allocations OCC - FIXED AND PROVEN

### Schema change
`scripts/migrations/003-kit-dispatch-version.sql` (applied to staging):
```sql
ALTER TABLE kit_dispatches ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;
```

### Repo change
`src/lib/db/repos/kitDispatch.ts` adds `updateAllocationsOCC(id, expectedVersion, patch, audit, opts)`:
- One atomic SQL UPDATE: sets allocations + audit_log || jsonb + dispatch_status + sales_approval_* + bumps version. `WHERE id=$1 AND version=$2`.
- Returns `{ok: true, newVersion}` on RETURNING row, else `{ok: false, conflictVersion}` from a follow-up SELECT.
- json mode mirrors via in-memory version compare + enqueue.

### Lib change
`src/lib/kitDispatch/allocate.ts`:
- Accepts `expectedVersion` from caller.
- UPDATE path calls `kitDispatchRepo.updateAllocationsOCC` (not `deps.enqueue`).
- CREATE path unchanged (FK + UNIQUE(mou_id) already enforces single-writer).
- `version-conflict` result reason added; route maps to 409.

### Route change
`src/app/api/dispatch/kits/[mouId]/allocate/route.ts`:
- Reads live state via `kitDispatchRepo`/`mouRepo`/`inventoryItemRepo` (not stale json bundle) so OCC sees current version.
- Accepts `expectedVersion` from request body.
- Returns 409 with `{error: 'version-conflict', conflictVersion, message}` on OCC mismatch.
- Returns 200 with `{ok: true, dispatchId, version}` on success so UI updates its cached version.

### UI change
`src/app/dispatch/kits/[mouId]/AllocationForm.tsx`:
- Accepts `initialVersion` prop; tracks `currentVersion` in state and updates after each save.
- Submits `expectedVersion` with each save.
- On 409: shows amber "Conflict: another user saved first" panel with a "Reload latest" button (`router.refresh()`).
- Page `page.tsx` passes `kd?.version ?? null` from the DB-loaded kit_dispatch.

### Test changes
`src/lib/kitDispatch/allocate.test.ts`:
- 8/8 PASS (was 7).
- Updated "updates an existing record" test to stub `updateAllocationsOCC` and assert OCC contract instead of deps.enqueue.
- New test: "returns version-conflict when OCC mismatch" verifies 409 path returns conflictVersion.

### Proof - PASS

**`scripts/verify-allocations-occ.mjs`** (SQL primitive):
```
Per-writer outcomes:
  writer- 0: WIN (v=2)
  writer- 1: CONFLICT (0 rows)
  [... 7 more]
  writer- 9: CONFLICT (0 rows)

Final state: version=2, allocations=[{writer:0}], audit_log length=1
Winners: 1 / Losers: 9
OVERALL: PASS - OCC enforced, no silent overwrite
retry winner: YES (v=3)
```

**`scripts/verify-allocations-occ-repo.mjs`** (route-equivalent):
```
Per-writer outcome (mirrors route response status):
  writer- 0: 200 OK         (newVersion=2)
  writer- 1: 409 Conflict   (conflictVersion=2)
  [... 7 more]
  writer- 9: 409 Conflict   (conflictVersion=2)

Final state in postgres:
  version:     2
  audit count: 1 (losers contributed 0 - their audit did NOT land)
  allocations: [{writer:0,marker:"WRITER-0",...}]

retry result: 200 OK (v=3) - clean recovery from 409

=== INVARIANTS ===
only-winner-landed (no silent overwrite): OK
all-losers-got-clean-conflict-version:    OK
loser-retry-succeeds-with-new-version:    OK

OVERALL: PASS
```

**The contract Anish asked for held:** 10 concurrent writes → 1 lands, 9 get a clean 409 with the conflict version, no silent overwrite, losers' audit entries do NOT contaminate the trail, the recovery flow (reload + re-submit with new version) succeeds.

## 2. Four REPLACE-WINS field traces - concrete grep + lib path

For each, I traced (a) every API route that writes the field, (b) every lib that handles the write, (c) whether two writers can realistically deliver different content concurrently. No "low concurrency" judgement words.

### 2.1 cc_user_ids (cc_rules) - REAL concurrent path

**Writers traced:**
- `POST /api/cc-rules/create` → `src/lib/ccRules/createCcRule.ts` (INSERT only - INSERT race is bounded by PRIMARY KEY)
- `POST /api/cc-rules/[ruleId]/edit` → `src/lib/ccRules/editCcRule.ts` (UPDATE - the RMW race path)

**Concurrent-write trace:**
- /admin/cc-rules/[ruleId] is the edit page (`src/app/admin/cc-rules/[ruleId]/page.tsx` line 184: `<input name="ccUserIds" defaultValue={rule.ccUserIds.join(', ')}>`).
- Three production users carry the wildcard Admin role: Anish, Ameet, Gowri. All can access /admin/cc-rules and edit any rule.
- Two admins could each load the same rule's edit page, edit the ccUserIds list differently (one adds Misba's email, the other removes Pranav), both click Save.
- editCcRule.ts uses deps.enqueue with full row → smart bridge → repo.updatePartial → full-column REPLACE of cc_user_ids. Last writer wins. Losing edit silently discarded.

**Verdict: REAL concurrent diff path.** Two admins on the same rule is a plausible operational scenario (cc-rule curation is an admin task that can be touched by anyone in the wildcard-admin group).

**Recommended fix:** OCC version column on cc_rules. Same pattern as allocations (~30 LOC for the repo OCC method, ~10 LOC for editCcRule lib, ~15 LOC for the route 409 mapping, ~15 LOC for the form UI 409 reload panel). Estimated 1h.

### 2.2 default_cc_rules (communication_templates) - REAL concurrent path

**Writers traced:**
- `src/app/admin/templates/actions.ts` line 100: `handleEditTemplate` → `src/lib/templates/editTemplate.ts` (UPDATE)
- `src/lib/templates/createTemplate.ts` (INSERT)

**Concurrent-write trace:**
- /admin/templates/[id]/edit is the edit page (`src/app/admin/templates/[id]/edit/page.tsx` line 168: `<input name="defaultCcRules" defaultValue={template.defaultCcRules.join(', ')}>`).
- Same three wildcard admins; same form-replace semantics; identical structure to cc_user_ids.

**Verdict: REAL concurrent diff path** (identical to cc_user_ids - two admins on the same template, REPLACE semantics, last-writer-wins).

**Recommended fix:** OCC version column on communication_templates. Same pattern as allocations + cc_user_ids; ~1h.

### 2.3 override_event (dispatches) - REAL in-theory concurrent path

**Writers traced:**
- `src/lib/dispatch/overrideAudit.ts` `writeP2Override` (Leadership-only) sets `overrideEvent` from null → DispatchOverrideEvent
- `src/lib/dispatch/overrideAudit.ts` `writeOverrideAcknowledgement` (Finance) sets `overrideEvent.acknowledgedBy` from null → user

**Concurrent-write trace:**
- writeP2Override line 105 has an **in-memory** idempotency check: `if (dispatch.overrideEvent !== null) throw`. **This is NOT a postgres-level guard.** Two parallel requests both read deps.dispatches snapshot, both see overrideEvent=null, both pass the check, both write.
- The role is Leadership-only; the action is rare (pre-payment override authorisation). But the lib's idempotency claim is not enforced at the data layer.
- writeOverrideAcknowledgement has the same shape: in-memory check that `acknowledgedBy === null`, then write.

**Verdict: REAL in-theory concurrent diff path.** The idempotency check is in-memory and bypassable by simultaneous reads. Realistic frequency is rare (two Leadership users overriding the same dispatch in the same millisecond) but Anish's bar: not "by design", concrete proof.

**Recommended fix:** server-side conditional UPDATE (no version column needed since the state machine is single-step):
- For writeP2Override: `UPDATE dispatches SET override_event = $1, audit_log = audit_log || $2 WHERE id = $3 AND override_event IS NULL`. If 0 rows → 409 "already overridden by another Leadership member".
- For writeOverrideAcknowledgement: `UPDATE dispatches SET override_event = $1, ... WHERE id = $2 AND override_event IS NOT NULL AND override_event->>'acknowledgedBy' IS NULL`. If 0 rows → 409 "already acknowledged".
- ~20 LOC each in dispatchRepo + lib + route. Estimated 30 min.

### 2.4 dispatch_summary (kit_dispatches) - REAL concurrent path

**Writers traced:**
- `src/lib/kitDispatch/allocate.ts` line 209: sets `dispatchSummary: null` on first allocation (CREATE path - no race)
- `src/lib/kitDispatch/approve.ts` line 105: `approveSalesReview` sets full dispatchSummary
- `src/lib/kitDispatch/accountsExecute.ts` line 142: `executeAccountsDispatch` sets full dispatchSummary
- `src/lib/kitDispatch/summary.ts` line 113: `editDispatchSummary` (DispatchSummaryEditor form save)
- `src/app/api/dispatch/kits/[mouId]/challan/upload/route.ts` line 88: patches `dispatchSummary.deliveryChallanPath`
- `src/app/api/dispatch/kits/[mouId]/warehouse-email/route.ts` line 45: patches `dispatchSummary.warehouseEmailLoggedAt`

**Concurrent-write trace:**
- Six writers across four sub-flows: sales approval, accounts execution, summary edit, challan upload, warehouse-email log. All read full kd, patch one part of dispatchSummary, enqueue full row.
- Realistic scenario: Ops uploads the delivery challan PDF (route 5) AT THE SAME TIME as the warehouse-email log fires (route 6) for the same kit_dispatch. Both reads see dispatch_summary as it was; both write the patched whole; last writer wins. The earlier writer's key inside the JSONB is silently overwritten.
- This is Misba's exact daily flow: post-dispatch she records challan + warehouse-email handoff, sometimes within seconds of each other.

**Verdict: REAL concurrent diff path** (4 writers can overlap; routes are not gated against each other).

**Recommended fix:** the version column on kit_dispatches ALREADY EXISTS (added for allocations in this session). The six writers need to:
1. Read kd.version with the data.
2. Pass version through to the repo write.
3. Repo writes use `UPDATE ... WHERE id=$1 AND version=$2 RETURNING version`.
4. On conflict, route returns 409 + UI shows reload prompt.

Estimated 2h to wire the six writers + route 409 handling + UI prompts.

### Summary of 4 traces

| Field | Concurrent diff path | Recommended action |
|---|---|---|
| cc_user_ids | REAL (two admins on same rule) | OCC version column on cc_rules, ~1h |
| default_cc_rules | REAL (two admins on same template) | OCC version column on communication_templates, ~1h |
| override_event | REAL in-theory (in-memory idempotency check is not data-layer-enforced) | NULL-check OCC (no version needed; state-machine is single-step), ~30 min |
| dispatch_summary | REAL (4 writers can overlap) | Wire the 6 writers through existing kit_dispatches.version OCC, ~2h |

**None of the four can be left "fine on a soft assumption."** All four have concrete concurrent-write paths and need fixing before cutover. Total estimated work: ~4.5h.

## 3. Current state of replace-on-update fields

| Field | Status |
|---|---|
| partial_payments (money) | FIXED + 10/10 three-layer proof |
| payment_log_ids (money) | FIXED + 10/10 three-layer proof |
| dispatches.line_items | PROVEN-SAFE (write-once at raise; UNIQUE id constraint) |
| vex_pis.line_items | PROVEN-SAFE (set at create only; no edit lib writer) |
| mous.payment_schedule | PROVEN-SAFE (import-only writers; no API edit lib) |
| **kit_dispatches.allocations** | **FIXED + OCC proof: 1 winner + 9 clean 409s** |
| cc_user_ids | TRACED REAL CONCURRENT - flagged for OCC fix before cutover |
| default_cc_rules | TRACED REAL CONCURRENT - flagged for OCC fix before cutover |
| override_event | TRACED REAL IN-THEORY - flagged for NULL-check OCC before cutover |
| dispatch_summary | TRACED REAL CONCURRENT (6 writers can overlap) - flagged for OCC fix before cutover |

## 4. P3 plan

Per Anish: P3 = 25 bridge-safe writes → atomic, concurrency-tested, same discipline.

These are the "Phase 7 bridge writes that are NOT audit-RMW" - typically INSERT-only or single-column-UPDATE flows the bridge dispatches through. They don't have the JSONB-append race class, but they need to:
1. Be migrated from `enqueueUpdate(full-row)` to the repo's atomic method.
2. Get a concurrency test where applicable (INSERT races on UNIQUE constraints, scalar UPDATE races where last-writer-wins is correct semantics).
3. Be documented as bridge-safe.

I'll start P3 with a per-write inventory pass (similar to the P1 11-write inventory), classify each as INSERT-race, scalar-UPDATE, or already-bridge-atomic, then handle in batches. The OCC fixes from §2 above can run in parallel since they touch different libs.

## 5. Files touched in this session

**Source**:
- `src/lib/types.ts` - added optional `version: number` to KitDispatch.
- `src/lib/db/repos/kitDispatch.ts` - added `version` column to row mapper; added `updateAllocationsOCC` atomic method.
- `src/lib/kitDispatch/allocate.ts` - accepts `expectedVersion`; UPDATE path uses `updateAllocationsOCC`; added `version-conflict` failure reason; deps gains optional `updateAllocationsOCC` for tests.
- `src/lib/kitDispatch/allocate.test.ts` - 8/8 PASS; new "version-conflict" test.
- `src/app/api/dispatch/kits/[mouId]/allocate/route.ts` - reads live via repos; accepts `expectedVersion`; returns 409 on OCC mismatch; returns `version` on 200.
- `src/app/dispatch/kits/[mouId]/AllocationForm.tsx` - new `initialVersion` prop; tracks `currentVersion`; sends `expectedVersion`; 409 → amber reload panel.
- `src/app/dispatch/kits/[mouId]/page.tsx` - passes `kd?.version ?? null` to form.

**Schema**:
- `scripts/migrations/003-kit-dispatch-version.sql` - `ALTER TABLE kit_dispatches ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1` (applied).

**Harnesses**:
- `scripts/verify-allocations-occ.mjs` - SQL-primitive OCC proof (1+9 + retry).
- `scripts/verify-allocations-occ-repo.mjs` - route-equivalent proof (10× 200/409, audit invariants).
- `scripts/verify-kit-dispatch-version.mjs` - column presence + row stats.

## 6. Approval requested

**Allocations OCC fix is complete and proven.** Anish's contract held: 10 concurrent allocation writes → 1 lands, 9 clean 409s, no silent overwrite.

**Four REPLACE-WINS traces complete** with concrete writer-lib trace. Three of the four are REAL concurrent-diff paths needing OCC fixes before cutover (~4.5h total estimate).

Recommendation: **GO on P3 in parallel with closing the 4 OCC fixes.** P3 is independent (bridge-safe non-RMW writes) and the OCC fixes are localised to three small schema migrations (cc_rules + communication_templates) plus the dispatch_summary wiring. Both streams can land before the Part 6 cutover gate.

Production stays json. No cutover until §2 fixes land + the cutover-readiness gate runs the full harness.
