# gate-stuck-data: authorised prod recovery of the stuck queue

**Date:** 2026-06-23. **Authorisation:** the owner explicitly authorised a
one-time production DB write for this recovery and supplied `VERIFY_PASSWORD`.

## Why
The drain cron is disabled ("postgres is truth source"), so writes that fell
into `pending_updates.json` (the dead-letter queue, before the create-dispatch
gaps were fixed) never reached Postgres. 7 entries were stuck. This recovery
replays them into Postgres idempotently, then clears the queue.

## Sequence followed (per the owner's strict plan; not reordered)

### 1. Deploy + fresh-save gate (PASS)
Logged into the live deploy (`https://gsl-ops-automation.vercel.app`) and
created a throwaway VEX product `ZZ-DEPLOYCHECK-0623` via the real create route.
- Route returned `303 -> /operations/vex?product-created=ZZ-DEPLOYCHECK-0623`.
- Direct Postgres query confirmed the row **landed in `vex_products`** (not the
  queue), proving the deployed write-gap fix persists to the DB.
- It rendered in the `/operations/vex` SKU master (read path is live).
- Throwaway then **deleted** from Postgres (1 row, 0 remaining).
Writes work end to end, so the recovery proceeded.

### 2. Identify the stuck rows (exactly 7 -> 4 distinct targets)
Parsed `src/data/pending_updates.json` (pulled from `main`, the queue's store):

| # | entity.op | natural key | queuedBy |
|---|---|---|---|
| 1 | mou.update | MOU-STEAM-2627-085 | anita.c |
| 2 | inventoryItem.create | INV-VIQRC-FULL-GAME-ELEMENT-2026-27- | anita.c |
| 3-6 | vexProduct.create | 228-9258 (x4 identical retries) | anita.c / pranav.b |
| 7 | mou.update | MOU-STEAM-2627-087 | anita.c |

Collapsed to: 1 VEX product, 1 inventory item, 2 MOU updates. No unexpected
entries (the importer aborts if the queue shape differs).

### 3. Backup (done)
`--apply` dumped the affected rows to `.recovery-backup/stuck-recovery-<ts>.json`
(gitignored; prod data) before any write: the 2 MOU rows captured pre-update;
the VEX product + inventory item were absent (nothing to lose; reversible by
delete). Backup confirmed present.

### 4. Idempotent importer + dry run (done)
`scripts/recover-stuck-queue.mjs` matches on natural key:
- vexProduct: `INSERT ... ON CONFLICT (part_number) DO UPDATE` (run-twice safe).
- inventoryItem: `INSERT ... ON CONFLICT (id) DO UPDATE`; audit_log = payload +
  a `recovered-from-queue` provenance entry.
- mou.update: `UPDATE` (row exists) of the student-count delta only
  (`students_actual`, `student_count_event_ids`, `audit_log` = payload + note);
  fixed-value target, so idempotent.

Dry run confirmed: 228-9258 ABSENT->INSERT; INV-VIQRC ABSENT->INSERT;
MOU-085 students_actual 300->224 (event SCE-2026-0013 **present**);
MOU-087 students_actual 900->1135 (event SCE-2026-0014 **present**). The
referenced student-count events already existed in Postgres (only the MOU-row
update was stuck), so no dangling references.

### 5. Apply (committed) + Postgres verify
Applied in one transaction. Post-write Postgres state:
- `vex_products 228-9258`: present ("VIQRC Full Game Element 2026-27").
- `inventory_items INV-VIQRC-FULL-GAME-ELEMENT-2026-27-`: present, stock 15.
- `mous MOU-STEAM-2627-085`: students_actual 224, event_ids [SCE-2026-0013].
- `mous MOU-STEAM-2627-087`: students_actual 1135, event_ids [SCE-2026-0014].

### 6. Live UI verify (all PASS)
Logged into the live deploy and asserted each surface renders the recovered data
(screenshots in `.verification/recovery/`, gitignored):

| Surface | URL | Result |
|---|---|---|
| SKU master shows 228-9258 | /operations/vex | PASS (HTTP 200) |
| Inventory shows VIQRC Full Game Element | /admin/inventory | PASS (HTTP 200) |
| MOU-085 students actual 224 | /mous/MOU-STEAM-2627-085 | PASS (HTTP 200) |
| MOU-087 students actual 1135 | /mous/MOU-STEAM-2627-087 | PASS (HTTP 200) |

### 7. Clear the queue (done, after confirmation)
Only after all 4 were confirmed in DB + UI: removed the 7 recovered entries from
`pending_updates.json` by entry id (preserving any newly-appended entries; none
existed). Queue is now empty.

## Residual notes
- The MOU student-count change re-prices installment Payment rows; those payment
  updates were NOT among the 7 stuck entries, so the installments were already
  consistent in Postgres (payment.update was wired and landed directly). Only the
  MOU-row mirror of the change was stuck; it is now applied.
- The full retirement of the queue/cron machinery (W2) is deferred to a focused
  pass that first audits every `enqueueUpdate` call site before flipping the
  fallback to fail loudly.
- `scripts/recover-stuck-queue.mjs` is kept (idempotent, re-runnable) as the
  reproducible record; the throwaway probe/UI scripts were deleted.
