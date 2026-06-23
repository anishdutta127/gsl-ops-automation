# gate-live-bugs: BUG 1, BUG 2, edit/delete surface

_Date: 2026-06-23. Diagnosed against live prod (VERIFY_PASSWORD)._

## BUG 1: VEX product not appearing after create

Not a regression of the write path. Reproduced in prod:
- A fresh VEX product created via the live app **lands in Postgres immediately**
  (queried before any "Sync now") and renders on a full load. The create-dispatch
  fix is holding.
- The lag was a stale **App Router client cache** on soft navigation (the VEX
  native-form flow never invalidated it, unlike the app's client-form flows).
- **Fixed** in `gate-cache-fix` (see `docs/gate-cache-fix/E2E_VERIFICATION_LOG.md`):
  `revalidatePath` on the VEX create/edit + inventory create routes, plus explicit
  `force-dynamic` on the two list pages. "Sync now" is now redundant for these flows.

## BUG 2: duplicate St Paul's payment (DIAGNOSED; recovery pending owner confirm)

**It is a DOUBLE-WRITE, not a render bug.** On `MOU-STEAM-2627-038`
(St. Paul's Mission School), the same single bank receipt exists as **two
`payment_logs` rows**:

| payment_log id | date | amount | NEFT reference | matched installment |
|---|---|---|---|---|
| `PL-CB850B8E` | 27-May-2026 | Rs 3,72,000 | PUNBH26147595072...PUNB0007520 | `MOU-STEAM-2627-038-i2` |
| `PL-45348EE5` | 27-May-2026 | Rs 3,72,000 | PUNBH26147595072...PUNB0007520 | `MOU-STEAM-2627-038-i1` |

A bank reference is unique per transaction, so two logs with the identical
reference are the same payment entered twice. Each was matched to a different
installment, so i1 AND i2 both show `received=3,72,000, Partial` from one real
Rs 3,72,000 receipt: the payment is double-counted. The `payments` (installment)
rows are NOT duplicated; the duplication is in `payment_logs` + the second match.

**Likely cause:** a double-create of the bank receipt (double-submit of the log
form, or the same bank line imported twice), then matched to a second installment.
`payment_logs` create has no dedup on (reference, amount, date).

**Recommended recovery (authorised prod-write sequence, but needs one decision
from the owner first):** which installment did the real Rs 3,72,000 go to? It is
almost certainly **i1** (a partial against the first installment), making
`PL-CB850B8E` (matched to i2) the duplicate. Recovery, pending that confirmation:
1. Backup `payment_logs` (both rows) + the two `payments` rows (i1, i2) + the MOU.
2. `unmatch` the duplicate from i2 (reverts i2 received->null, status->Pending) via
   the existing `unmatchPayment` path, then soft-remove/`deletePayment`-equivalent
   the duplicate `payment_log` `PL-CB850B8E`.
3. Verify in DB AND the live `/finance` UI that only one Rs 3,72,000 receipt remains
   and i2 is Pending again.
Not executed this session: financial correction needs the owner to confirm the
keeper row before deletion (do not guess on money).

**Cause fix (recommended, not yet built):** dedup `payment_log` create on
(bank_reference, amount, date) or guard the submit, so the same receipt cannot be
logged twice.

## Edit / delete surface matrix (today)

Edit is broadly present; hard/soft delete is almost entirely absent (only payments
has a full edit/unmatch/delete mutation set, Admin-gated, in
`src/lib/payment/paymentMutations.ts`).

| Entity | Create | Edit | Delete / reverse | Notes |
|---|---|---|---|---|
| Payment (installment) | yes | yes (`editPayment`) | yes (`deletePayment` + `unmatchPayment`, Admin) | Reference pattern ALREADY exists |
| MOU | yes | yes (`/mous/[id]/edit`) | no | High value; soft-delete (status) |
| VEX product | yes | yes | no | Low risk; hard-delete ok (catalogue) |
| Inventory item | yes | yes (`/inventory/[id]/edit`) | no | Hard-delete ok (with stock check) |
| School | yes | yes | no | Soft-delete (FK hub) |
| Dispatch / kitDispatch | yes | via workflow | no (forward-only; rewind = Admin JSON edit) | Backlog: dispatch rewind |
| VEX PI | yes | transitions | no | Financial: void/reverse, not delete (void exists) |
| Adjustment | yes | status only | no (reverse exists: `reverseAdjustment`) | Financial: reverse, never delete |
| Sales opportunity | yes | yes | mark-lost (soft) | |
| Vendor / Agreement | yes | yes | no (agreement has terminate) | |
| Escalation | yes | yes | no | Soft-close exists |
| CC rule / template | yes | yes | toggle/disable (soft) | |

### Recommended priority to add the missing delete/reverse (each: confirm step + auditLog entry per the CLAUDE.md convention + correct `access.ts`/`permissions.ts` gate)
1. **MOU soft-delete/cancel** (status -> Cancelled, not vanish): highest everyday need; many FKs depend on it so never hard-delete.
2. **VEX product delete** (hard ok; catalogue, guard if referenced by a PI/dispatch): simplest, good second reference.
3. **Inventory item delete** (hard ok; block if stock > 0 or referenced).
4. **School soft-delete** (FK hub; soft only).
5. Financial entities (PI, payment, adjustment): use **void/reverse**, which mostly exists; ensure each is surfaced with confirm + audit. Do NOT add hard-delete.

Reference pattern to copy: the payment mutation set (`paymentMutations.ts` +
`/api/finance/payment/[paymentId]` action multiplexer): Admin-gated, audited,
`?ok`/`?error` redirects, reversible. New deletes should follow it: a confirm
step in the UI, an `auditLog` entry on the entity (action like `cancel`/`delete`
with before/after + reason), and the matching `access.ts` gate.

**Not implemented this pass:** the user-suggested "payment delete/reverse" already
exists, so there is no new reference pattern to build; the missing deletes (MOU
cancel, VEX/inventory delete) are sequenced above for a focused follow-up rather
than rushed at the end of this session.
