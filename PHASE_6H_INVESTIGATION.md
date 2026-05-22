# Phase 6H Investigation: kit details save + product selection allocation

**Investigator:** Claude Code (Opus 4.7)
**Date:** 2026-05-22
**Status:** Investigation complete, waiting for Anish GO before fixes.

## TL;DR

**One root cause, not two.** The kit-details save is silently dropped by the queue drain handler because `/api/mou/[mouId]/kits-details/route.ts` enqueues a partial payload (`{ mouId, productSelection, gradewiseDistribution, audit }`) instead of the full MOU spread. The drainer looks up records by `payload.id` (string) and the kit-details route does not include `id` on the payload at all (it sends `mouId`).

The drainer then **skips the entry AND still trims it from the queue**, so the form's "Saved" toast lies and the data never lands. On reload, `mou.productSelection` is still null. The allocation page reads `mou.productSelection`, finds null, and returns an empty SKU dropdown via `eligibleSkusForMou()`. Both reported failures collapse to this one bug.

The bug is **not** the same class as Phase 6A Bug 4 / the Phase 6D type unification. That was a type-definition divergence. This is a payload-shape mistake at one producer site. All 14+ other MOU-update enqueue sites spread the full MOU (`{ ...mou, ...changes }`) and therefore carry `id` correctly; the kit-details route is the sole outlier.

Two adjacent routes (`warehouse-email`, `challan/upload` under `/api/dispatch/kits/[mouId]/`) have a different but related payload-shape bug (they wrap the record in `.record`). They have not fired yet because no kit dispatch records exist (zero allocations have succeeded due to the upstream bug). Flagged below; not in scope for Phase 6H per the instructions.

## Files traced

### Save path (broken)

| Step | File | Lines |
|---|---|---|
| Form page | `src/app/mous/[mouId]/kits-details/page.tsx` | 1–89 |
| Form client | `src/app/mous/[mouId]/kits-details/KitsDetailsForm.tsx` | 1–101 |
| API route (BUG SITE) | `src/app/api/mou/[mouId]/kits-details/route.ts` | 112–123 |
| Queue writer | `src/lib/pendingUpdates.ts` | 20–37 |
| Drain handler | `src/lib/sync/drainQueue.ts` | 104–137, 197–257 |
| Cron schedule | `.github/workflows/sync-queue-cron.yml` | every 5 minutes |

### Allocation read path (looks correct, blocked by upstream)

| Step | File | Lines |
|---|---|---|
| Detail page | `src/app/dispatch/kits/[mouId]/page.tsx` | 104–110, 230–242 |
| SKU lookup | `src/lib/kitDispatch/lookup.ts` | 29–41 |
| Allocation form | `src/app/dispatch/kits/[mouId]/AllocationForm.tsx` | 31, 197–201, 282–296 |
| Allocation save | `src/lib/kitDispatch/allocate.ts` | 102–128 |

## Root cause (in detail)

### What the kit-details route enqueues

`src/app/api/mou/[mouId]/kits-details/route.ts:112-123`:

```ts
await enqueueUpdate({
  queuedBy: user.id,
  entity: 'mou',
  operation: 'update',
  payload: {
    mouId,                              // <-- wrong key name + partial fields
    productSelection,
    gradewiseDistribution,
    audit: audit as unknown as Record<string, unknown>,
  },
})
```

The payload has no top-level `id` field. It uses `mouId`. It also carries `audit` as a singular field rather than appending to the MOU's `auditLog` array.

### What the drainer requires

`src/lib/sync/drainQueue.ts:104-137`:

```ts
function applyOneToList(list, pending, drainAt) {
  const payload = pending.payload as EntityRecord
  const id = typeof payload.id === 'string' ? payload.id : null
  if (id === null) {
    return { list, outcome: 'skipped' }                 // <-- this fires
  }
  if (pending.operation === 'update') {
    const idx = list.findIndex((r) => r.id === id)
    if (idx >= 0) {
      const next = list.slice()
      next[idx] = payload                                // <-- full replace by id
      return { list: next, outcome: 'drained' }
    }
    ...
  }
}
```

For the kit-details payload, `typeof payload.id === 'string'` is `false` (it is undefined), so `id` becomes `null` and the entry is returned as `'skipped'`.

### Skipped entries are still trimmed

`src/lib/sync/drainQueue.ts:226-239`:

```ts
for (const entry of entries) {
  const { list, outcome } = applyOneToList(working, entry, drainAt)
  working = list
  if (outcome === 'drained') drainedThisEntity++
  else skippedThisEntity++
}
return {
  next: working,
  commitMessage: `chore(sync): apply ${entity} batch (n=${entries.length})`,
}
// ...
for (const entry of entries) drainedIds.add(entry.id)    // <-- all entries, drained OR skipped
```

`drainedIds` is the set of pending-update ids that get filtered out of `pending_updates.json` (see lines 259–278). So a skipped entry never lands in the entity file AND is removed from the queue. **Silent data loss.**

This skip-then-trim behaviour is reasonable for legitimately stale entries (e.g. a duplicate `create` for an id that already exists), but it amplifies any producer-side payload-shape bug into invisible failure. There is no anomaly emitted for "skipped because payload had no id" — `skippedThisEntity` is counted but does not propagate into `anomalies[]`.

### Replace-by-id semantics make even an "id fix" insufficient

If the only change were `mouId` → `id` on the existing payload, the drainer would find the MOU and then do `next[idx] = payload`, replacing the entire record with `{ id, productSelection, gradewiseDistribution, audit }`. Every other field on the MOU (schoolId, programme, students, totalAmount, the entire auditLog) would be obliterated. This is the same replace-by-id pattern every other MOU update site relies on, which is why they spread the full MOU.

So the fix has to do both: include `id` AND spread the full MOU record.

## Deterministic reproducer

Ran the actual `applyOneToList` logic against both payload shapes:

**Current shape `{ mouId, productSelection, ... }`**

```
outcome: skipped
list AFTER: [
  { id: 'MOU-X', schoolName: 'Demo', students: 200, totalAmount: 500000 }
]
```

MOU unchanged. Queue entry will be silently trimmed on next drain.

**Correct shape `{ ...mou, productSelection, ... }`**

```
outcome: drained
list AFTER: [
  {
    id: 'MOU-X', schoolName: 'Demo', students: 200, totalAmount: 500000,
    productSelection: 'TinkRworks',
    gradewiseDistribution: [{ grade: 6, students: 100, kitType: 'Reusable' }],
    auditLog: [{ action: 'update' }]
  }
]
```

MOU correctly updated with all original fields preserved.

## Production data confirms the bug fingerprint

Inspected `src/data/mous.json`:

| metric | count |
|---|---|
| Total MOUs | 183 |
| MOUs with `productSelection` set | 22 |
| MOUs with `gradewiseDistribution` set | **0** |

The 22 with `productSelection` were set by `scripts/backfill-mou-products.mjs` (Phase 6E), which writes **directly** to `mous.json` via `fs.writeFileSync`, bypassing the queue entirely. **Zero** MOUs have `gradewiseDistribution`, even though the kit-details form has been live since Gate 3 Step 1 (commit `d55388a`). Every form submission has been silently dropped.

Also: `src/data/kit_dispatches.json` is empty (0 records). The allocation flow downstream cannot mint a kitDispatch without a valid productSelection, so the bug has cascaded — no kit dispatch has ever been recorded in production.

## Are the two failures one bug?

Yes. One bug, two visible symptoms:

1. **Form save**: posts succeed (HTTP 200), toast shows "Saved", queue entry written, **drain silently drops it**. On reload the page re-reads the still-null MOU and the form looks unchanged.
2. **Allocation dropdown**: `/dispatch/kits/[mouId]/page.tsx:104-110` reads `mou.productSelection`, finds `null`, calls `eligibleSkusForMou()` which returns `[]` for null productSelection (`src/lib/kitDispatch/lookup.ts:33`). The dropdown renders empty and the form shows the amber "Product selection not yet set" banner.

Fix the save and the allocation unblocks itself.

## Relationship to Phase 6A Bug 4 / Phase 6D MOU type unification

**Different bug class.**

- Phase 6A Bug 4 / Phase 6D: two distinct MOU type definitions (canonical in `src/lib/types.ts` and a duplicate in `src/lib/mouSystem/types.ts`). The draft writer was writing the Pipeline shape, the Operations reader was reading the Operations shape, and the fields did not line up. Fixed by collapsing the duplicate into a re-export of the canonical type (commit `27c00f3`).
- Phase 6H: a single producer is writing a partial payload that the queue drain cannot route. The type definitions are now consistent across the codebase; this bug exists in spite of that consistency.

The user-visible symptom is similar ("renders but doesn't save") because both produce silent data loss on the MOU. But the root cause is different and the fix has to be at the producer site, not in the type definitions.

## Comparison to working sibling forms

Every other MOU update enqueue spreads the full MOU record. Sampled:

| Site | Pattern |
|---|---|
| `src/app/api/mou/[mouId]/edit/route.ts:200-212` | `const next: MOU = { ...mou, ...patch, auditLog: [...] }; payload: next` |
| `src/app/api/mou/installments/edit/route.ts:152-164` | `const updated: Payment = { ...payment, ... }; payload: updated` |
| `src/lib/dispatch/raiseDispatch.ts:413-418` | `payload: updatedMou as unknown as Record<string, unknown>` (full MOU) |
| `src/lib/pi/generatePi.ts:543-548` | `payload: updatedMou as unknown as Record<string, unknown>` (full MOU) |
| `src/lib/scheduleEdit/saveSchedule.ts:243-250` | `payload: { ...mou, auditLog: [...(mou.auditLog ?? []), audit] }` |
| `src/lib/finance/confirmMatch.ts:206-211` | `payload: updatedMou as unknown as Record<string, unknown>` (full MOU) |
| `src/lib/kanban/recordTransition.ts:119-124` | `payload: updatedMou as unknown as Record<string, unknown>` (full MOU) |
| `src/app/api/mou/[mouId]/student-count/route.ts:91-96` | `payload: result.payloads.mouUpdate` (constructed as full MOU with id) |
| `src/app/api/admin/sales-team/reassign/route.ts:82` | `payload: next` where `next: MOU = { ...mou, salesPersonId, auditLog }` |
| `src/app/api/mou/[mouId]/signed-mou/upload/route.ts:126` | `payload: next` where `next: MOU = { ...mou, signedMouPdfPath, ... }` |

The kit-details route is the only outlier.

## Other forms with the same save-path exposure (flag, do NOT fix in this gate)

Per the user instruction "Whether other forms have the same save-path exposure (the recurring 'renders but doesn't save' pattern) — list them, don't fix in this gate":

**Two adjacent routes use a `{ id, mouId, record: nextRecord }` wrapper pattern, which is also broken but in a different way:**

1. `src/app/api/dispatch/kits/[mouId]/warehouse-email/route.ts:55-59`
2. `src/app/api/dispatch/kits/[mouId]/challan/upload/route.ts:99-103`

These pass `payload: { id: kd.id, mouId, record: nextRecord }`. The drainer finds the record by `payload.id` (good, that part works) and then does `next[idx] = payload` — replacing the kitDispatch with the wrapper. The kitDispatch row in production would become `{ id, mouId, record: { ...actual fields... } }`, wiping all top-level fields (status, lineItems, dispatchSummary at top level, etc.) and nesting them under a `record` key.

These have **not** fired yet because `src/data/kit_dispatches.json` is empty — no allocations have succeeded due to the upstream kit-details bug. Once Phase 6H ships and allocations start succeeding, these will corrupt kitDispatch records the first time someone logs a warehouse email or uploads a challan.

**Recommended next-gate scope:** Phase 6I or a follow-up should fix both routes to enqueue the spread record directly (`payload: nextRecord as unknown as Record<string, unknown>`).

I scanned all 35+ `enqueueUpdate` call sites under `src/app/api/**` and `src/lib/**`. No other routes carry the same shape bug — every other site spreads the full record or constructs a record with an explicit `id` field.

## Drainer defense-in-depth gap (flag, not in scope)

The drainer currently:
- Returns `outcome: 'skipped'` for any payload without a string `id`.
- Still adds the entry to `drainedIds` and trims it from the queue.
- Counts `skippedThisEntity` in `PerEntityResult.skipped` but does NOT append a string to `anomalies[]`.

So a producer-side bug like Phase 6H is invisible from the sync-health dashboard. The drain logs say "drained N entries, 0 anomalies" even when half of those N were silently dropped.

**Recommended next-gate scope:** the drainer should append an anomaly per skipped entry that names the entity, the queue entry id, and the reason ("missing id on payload" or "duplicate create for existing id"). This would not have prevented Phase 6H but it would have made the bug visible on the sync-health board far earlier.

## Live walkthrough notes

I did **not** run a live verify-deploy.mjs walk against the deployed environment for the investigation. The static and data evidence already pinpoint the producer-side bug deterministically, and the live walk would just confirm what the data already shows (0 of 183 MOUs have `gradewiseDistribution`).

If Anish wants live verification as part of the investigation before GO, I can run:

```
VERIFY_PASSWORD='<...>' node scripts/verify-deploy.mjs --urls phase-6h-pre-fix.json
```

against a target list that walks /mous/[id]/kits-details, submits the form, waits for the next drain cycle, and reloads — confirming the save fails to persist. Otherwise I will run the live walk as part of Part 3 fix verification, which is the V4 standard for the gate.

## Proposed fix scope (for review, not yet implemented)

1. **Fix the producer**: rewrite the enqueue in `src/app/api/mou/[mouId]/kits-details/route.ts:112-123` to spread the existing MOU and append to its auditLog:
   ```ts
   const updated: MOU = {
     ...mou,
     productSelection,
     gradewiseDistribution,
     auditLog: [...(mou.auditLog ?? []), audit],
   }
   await enqueueUpdate({
     queuedBy: user.id,
     entity: 'mou',
     operation: 'update',
     payload: updated as unknown as Record<string, unknown>,
   })
   ```
2. **Regression test**: add a test under `src/app/api/mou/[mouId]/kits-details/route.test.ts` that asserts:
   - The POST returns 200 for a valid body.
   - The enqueued payload has `id` on it.
   - When passed through `applyOneToList`, the outcome is `'drained'` (not `'skipped'`).
   - The resulting MOU has the existing fields preserved and the new fields applied.
3. **Verify allocation read** unblocks: a test that calls `eligibleSkusForMou` against the updated MOU and asserts the dropdown is non-empty for a `productSelection` of TinkRworks (with at least one active TinkRworks SKU in inventory fixture).
4. **Honest error handling**: the form already surfaces queue-failure as an error toast (`src/app/mous/[mouId]/kits-details/KitsDetailsForm.tsx:55-58`). No change needed there. The bug was never a missing error path; the API/queue was returning 200 honestly because the enqueue itself succeeded — it was the drain that silently dropped.
5. **V4 live verification**: pick a real MOU on the live deploy, set product line + grade-wise distribution via the form, manually trigger `/api/admin/sync-queue` to drain, reload the page, confirm both fields persist. Then walk to `/dispatch/kits/[mouId]` and confirm the SKU dropdown populates. Screenshots before/after under `.verification/phase-6h/`.

Will not touch:
- The drainer (defense-in-depth gap flagged separately).
- The warehouse-email and challan/upload routes (same root cause class, flagged for next gate).
- Any other form or save path.

## Anything worth flagging

- The bug has existed since Gate 3 Step 1 (commit `d55388a`). Every kit-details form submission on the live deploy has shown a "Saved" toast and lost the data. This is the kind of bug the V4 verification standard exists to catch; the standard was tightened on 2026-05-19 (also referenced in CLAUDE.md), three days before this report. The kit-details gate predates the V4 tightening.
- The drainer's silent-skip behaviour is a defense-in-depth gap. A future incident anywhere that touches the queue would benefit from anomalies for skips. Worth a small follow-up gate.
- The two suspect adjacent routes (warehouse-email, challan/upload) carry a different but related payload-shape bug. They will manifest the first time someone runs the downstream dispatch flow after Phase 6H lands. Flagged for the next gate to avoid scope creep here.
- The Phase 6E backfill script writes directly to `mous.json` rather than through the queue. That bypasses the bug, which is why 22 MOUs have productSelection. The script is a one-shot tool; it is not a sustainable mitigation, just historical context.
