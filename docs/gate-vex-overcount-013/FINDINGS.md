# VEX over-count: Funscholar (VEXPI-UP-26-27-013) - findings, root cause, fix

_2026-06-27. Re-scan + root-cause + mechanism fix SHIPPED (main 73517d4). Data recovery APPLIED + verified in prod (owner go 2026-06-27)._

## 1. Re-scan: the complete current over-count list

Scanned all **30** `vex_pis` against the **30** `payment_logs` rows they reference
(`scripts/diagnose-vex-overcount.mjs`, read-only).

| Class | Count | Meaning | Action |
|---|---|---|---|
| **DUP-LOGS-OVERCOUNT** | **1** | duplicate receipt logged twice, both rows persisted | **recover** |
| DANGLING-OVERCOUNT | 0 | the VEXPI-UP-26-27-020 class (already fixed) | none |
| MISSING-LOGS | 5 | balance ~correct, no `payment_logs` row (benign, pre-existing) | none (optional backfill) |
| CLEAN | 8 | reconciles to its logs | none |
| UNPAID | 16 | no payments | none |

**Exactly one PI needs over-count recovery: `VEXPI-UP-26-27-013` (Funscholar Innovations Pvt Ltd).**

- received **Rs 8,21,032** vs total **Rs 4,10,516.10** = **2.00x**.
- 5 benign MISSING-LOGS (`VEXPI-MH-2627-001`, `VEXPI-UP-2627-001..004`): historical, balance is ~1x correct, only the `payment_logs` rows are absent. NOT over-counts. Out of scope.

### Why the prior scan reported "only VEXPI-UP-26-27-020"

The previous scan classified a PI as an over-count **only if it had dangling
`payment_log_ids`** (ids referencing no `payment_logs` row). That is the signature
of the 020 mechanism. **Funscholar's two duplicate logs both persisted**, so its
`payment_received_amount` reconciles exactly to them (`stated == reconciled`,
0 dangling) and the old classifier called it **CLEAN**.

The scan is now fixed: a new **DUP-LOGS-OVERCOUNT** class detects a PI whose
*present* logs contain a duplicate receipt group (same real bank reference +
amount appearing 2+ times). The scan caught Funscholar on the re-run.

## 2. Root cause - why VEX payments still duplicated

Funscholar is **not** the same mechanism we recovered on VEXPI-UP-26-27-020.

The two `payment_logs` on the PI:

| id | date | amount | reference | logged by |
|---|---|---|---|---|
| `VEXPL-800ecbea` | 2026-06-26 | 4,10,516 | `INF/INFT/044632377521/Maf Technologies Advance/FUNSCHOLAR INNO` | Anita C. |
| `VEXPL-864a741b` | 2026-06-27 | 4,10,516 | `INF/INFT/044632377521/Maf Technologies Advance/FUNSCHOLAR INNO` | Anita C. |

**The same bank receipt (one NEFT, UTR `044632377521`) was logged twice, on two
consecutive days.** Same reference, same amount, **different date**. Both writes
succeeded, so the balance was incremented twice → 2x.

Two independent holes allowed it:

1. **The VEX payment route (`/api/operations/vex/pi/[id]/payment`) had no
   duplicate guard at all.** The BUG2 dedup (commit `e1a5d55`) was added **only**
   to the finance route (`/api/finance/payment/log`). VEX was never covered.
2. **Even the finance dedup keyed on `(reference, amount, DATE)`.** Because the
   two Funscholar entries differ in the typed date, they would have slipped past
   the finance guard too. A bank reference uniquely identifies one transaction;
   the date the operator types is not part of that identity.

There is also a **latent second mechanism** (the 020 class): the route called
`recordVexPayment` (atomic balance increment + append logId) **before** the
separate `enqueueUpdate(paymentLog create)`. With W2 fail-loud, if the log
persist throws, the increment is already committed and a finance retry
re-increments. The 50b4f54 payload-shape fix removed the specific failure that
caused 020, but the ordering hazard remained.

## 3. Mechanism fix (SHIPPED, main 73517d4)

- **`src/lib/payment/duplicateReceipt.ts`** - shared guard `isDuplicateReceipt`,
  keyed on **reference + amount (NOT date)**; ignores placeholder references
  (`NA`, blank, `-`, ...) so multiple cash/NA receipts stay loggable. 9 unit tests.
- **VEX payment route** - rejects a duplicate receipt with **409 before any
  balance mutation**, and **reorders** the writes so the durable `payment_log`
  persists **first** and the balance increment second. A thrown increment now
  leaves the balance untouched, so a retry can't re-increment (closes the 020
  class), and a duplicate retry is caught by the reference dedup. +1 route test.
- **Finance route** - refactored onto the shared guard, **dropping `date`** from
  the key (the same weakness that would have let Funscholar through there).
- **Scan** - `diagnose-vex-overcount.mjs` gains the DUP-LOGS-OVERCOUNT class.

Gate: `tsc` 0 · `lint` 0 · `build` 0 · suite green.

> Git note: this fix was re-parented onto `origin/main` and pushed in isolation.
> The delivery-confirmation commit `d1f0104` (which it sat on top of) is **held
> back** pending prod migration 019 and is preserved on branch
> `delivery-confirmation-hold` - it is NOT on main and was NOT pushed.

## 4. Data recovery - APPLIED + verified (owner go 2026-06-27)

**Status: DONE.** Owner authorised the apply and chose status **`Delivery Pending`**
(the single receipt covers the invoice; the Rs 0.10 is GST-rounding noise).
`recover-vex-overcount-013.mjs --apply` ran one transaction, backed up first.

Result (10/10 verify checks PASS, confirmed by an independent re-scan):

- `payment_received_amount` 8,21,032 → **4,10,516** (1x)
- duplicate `payment_logs` row `VEXPL-864a741b` **deleted**; keeper `VEXPL-800ecbea` intact
- `payment_log_ids` → `['VEXPL-800ecbea']`; status `Delivery Pending`
- `SUM(received)` across all VEX PIs dropped by exactly 4,10,516; **no other PI moved**
- Re-scan: `VEXPI-UP-26-27-013` now **CLEAN**; **total PIs needing over-count recovery: 0**
- Reversible via `.recovery-backup/vex-VEXPI-UP-26-27-013-pre.json` (full pre-state incl. the deleted row).

### Original plan (for the record) - GATED dry-run

`scripts/recover-vex-overcount-013.mjs` (DRY RUN by default; hard pre-flight
aborts unless live prod equals the reviewed pre-state). Dry-run pre-flight PASSED.

Planned writes (one transaction, backup-first, reversible):

- **DELETE** the duplicate `payment_logs` row `VEXPL-864a741b`.
- **UPDATE** `vex_pis` `VEXPI-UP-26-27-013`:
  - `payment_received_amount` 8,21,032 → **4,10,516** (the single real receipt)
  - `payment_log_ids` → `['VEXPL-800ecbea']` (keep the first entry)
  - `status` → **decision pending** (see below)
  - `audit_log` += a recovery entry
- Keeper `VEXPL-800ecbea` left untouched. 11 post-commit verify checks incl.
  "nothing else moved" (`SUM(received)` drops by exactly 4,10,516).

### Status decision for the owner

A single Rs 4,10,516 receipt is **Rs 0.10 short** of the Rs 4,10,516.10 total (a
GST-rounding artifact). The PI's own audit shows that after the first genuine
payment the system set status to **`Payment Pending`** (4,10,516 < 4,10,516.10);
the duplicate then pushed it to `Delivery Pending`.

- Option A: `Payment Pending` - faithful to the single-payment state.
- **Option B (owner chose this): `Delivery Pending`** - treat the 0.10 as rounding noise (effectively paid, dispatch unblocked).
