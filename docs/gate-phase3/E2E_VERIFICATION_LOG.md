# gate-phase3: MOU cancel/soft-delete + cascade

_Date: 2026-06-24._

## Built + live-verified (cancel capability)
- Migration 018 (applied, backup-first, reversible): mous.status CHECK + 'Cancelled'.
- `cancelMou` (Admin-wildcard only, reason >=10, fail-loud): cascade soft-deletes
  linked non-Cancelled payments first, then sets MOU status='Cancelled' +
  cohortStatus='archived' (drops from all active views via existing filters).
- `/api/mou/[mouId]/cancel` + Admin-only "Cancel (soft-delete)" danger zone on the
  edit page (disclosure + required reason). received/outstanding compute from
  non-Cancelled payments (never the stale mou.received).
- FK fix: rowToMou maps a NULL sales_person_id to '' and updatePartial bound that
  '' into the nullable FK on a full-payload update (cancelMou, and editing any
  salesperson-less MOU) -> mous_sales_person_id_fkey violation. Fixed: updatePartial
  coerces '' -> null for nullable FK cols; cancelMou sends a minimal patch.

### V4 (live prod) - all PASS
Throwaway MOU + paid payment, cancelled via the live route, then cleaned up:
- cancel -> 303 ok=cancelled; MOU status=Cancelled, cohort_status=archived.
- linked payment soft-deleted (Cancelled); received recomputes 50000 -> 0; MOU
  dropped from the active set. Build + cancelMou tests green.

## Payment edit/unmatch/delete
Already existed (paymentMutations) + UI-wired on /finance/payments/[paymentId]
(edit / unmatch / delete; delete Admin-gated). Verified, no rebuild.

## GATED UNWIND 1/3 - 21K: APPLIED + VERIFIED (owner go 2026-06-25)
Backup: .recovery-backup/21k-MOU-YP-2627-007-pre-cancel.json (gitignored).
Applied `cancelMou(MOU-YP-2627-007)` via the live cancel route. **VERIFY PASS**:
MOU status=Cancelled + cohort_status=archived (dropped from active views), payment
i1 soft-deleted (Cancelled), received (non-Cancelled) = Rs 0. Before/after global
counts proved ONLY this MOU + this payment moved: Cancelled MOUs 0 -> 1, Cancelled
payments 0 -> 1, totals unchanged (200 MOUs / 426 payments, no deletes). Reversible.

Dry-run (for the record):
- MOU **MOU-YP-2627-007** (21K Learning, Young Pioneers, contract Rs 1,53,400,
  status Active, cohort active, mou.received stale 0).
- ONE payment **MOU-YP-2627-007-i1**: expected Rs 1.00, received Rs 1,53,400.01,
  status Paid, ref AXISCN1358400464, **no PI**. No payment_logs matched.
- On `cancelMou(MOU-YP-2627-007)`: MOU -> status Cancelled + cohort archived;
  payment i1 -> status Cancelled (received_amount kept on the row, excluded from
  sums); received (non-Cancelled) Rs 1,53,400.01 -> 0; MOU drops from active
  views; no orphans; no PI to unwind. Reversible via the backup.
- Apply method on go: via the live cancel route (first real use of the capability).

## GATED UNWIND 2/3 - St Paul's PL-CB850B8E: APPLIED + VERIFIED (owner go 2026-06-25)
Backup: .recovery-backup/stpauls-PL-CB850B8E-pre.json (holds the FULL deleted log
row -> reversible). Applied in ONE transaction: reverted i2 (received Rs 3,72,000
-> null, status Partial -> Pending, cleared its PL-CB850B8E partial-payment so no
dangling match) + deleted the duplicate payment_log PL-CB850B8E. The plain unmatch
path alone would have left i2 Partial with a dangling partial-payment pointing at
the deleted log; the partial-payment clear is the correction. **VERIFY PASS**: MOU
received Rs 7,44,000 -> Rs 3,72,000; i1 unchanged (Rs 3,72,000, Partial); i2 ->
Pending/null; PL-CB850B8E gone, PL-45348EE5 remains; exactly one payment_log
removed (21 -> 20); nothing else moved.

Dry-run (for the record):
MOU **MOU-STEAM-2627-038** (St. Paul's Mission School). The ONE NEFT receipt
`PUNBH26147595072` (Rs 3,72,000, 2026-05-27) was logged TWICE and matched to BOTH
instalments:
- KEEP: `PL-45348EE5` -> i1; payment i1 received Rs 3,72,000 (status Partial,
  expected Rs 4,00,000). This is the real receipt.
- DUPLICATE: `PL-CB850B8E` -> i2; payment i2 ALSO received Rs 3,72,000 (same NEFT
  ref) = the double-count. Current sum(received) across i1+i2 = Rs 7,44,000.
- On apply (gated): unmatch i2 (received_amount Rs 3,72,000 -> null, received_date
  /mode/ref -> null, status Partial -> Pending) via the existing unmatch path; then
  DELETE the duplicate payment_log `PL-CB850B8E` (raw delete; no payment_log delete
  endpoint). Result: i1 keeps Rs 3,72,000 (Partial), i2 -> Pending, MOU received
  Rs 7,44,000 -> Rs 3,72,000 (the single real receipt). One payment_log remains
  (`PL-45348EE5`). Reversible via the backup.
- Note: mou.received is the stale denormalised field (shows 0); the live figure is
  the payments sum, which is what this corrects.

## GATED UNWIND 3/3 - VEX over-count VEXPI-UP-26-27-020: APPLIED + VERIFIED (owner go 2026-06-25)
Backup: .recovery-backup/vex-VEXPI-UP-26-27-020-pre.json (gitignored; the full VexPi
row) + .recovery-backup/vex-VEXPI-UP-26-27-020-pre-apply-*.json (re-snapshot taken at
apply time). Applied via scripts/recover-vex-overcount.mjs --apply (dry-run default;
hard pre-flight guards that abort on any drift from the reviewed pre-state; one
transaction: INSERT the reconstructed payment_log + UPDATE the VexPi).

**VERIFY PASS (13/13, direct against prod postgres ep-shiny-waterfall):**
- payment_received_amount Rs 31,64,655 -> **Rs 6,32,931** (1x, not 5x).
- payment_log_ids [5 dangling] -> **['VEXPL-RECOV-UP2627020']** (the 5 dangling ids
  dropped; they referenced 0 payment_logs rows so nothing was deleted there).
- Exactly ONE new payment_log created: VEXPL-RECOV-UP2627020 (amount Rs 6,32,931,
  mode Bank Transfer, ref NA, unmatched=false); its narration documents the recovery
  and names all 5 removed retry-duplicate ids.
- status unchanged = Delivery Pending (Rs 6,32,931 >= total Rs 6,32,930.76 = paid,
  awaiting delivery).
- Nothing else moved: vex_pis count 31 -> 31; payment_logs 20 -> 21 (delta = only
  +VEXPL-RECOV-UP2627020, no removals); SUM(payment_received_amount) across all VEX
  PIs 45,62,072 -> 20,30,348 (dropped by exactly Rs 25,31,724 = the over-count); 0
  other vex_pis rows changed.
- Reversible via the backups (full pre-state row preserved).

CURRENT (pre-apply): total Rs 6,32,930.76, payment_received_amount **Rs 31,64,655 (= 5.00x)**,
status Delivery Pending. payment_log_ids = 5 ids
[VEXPL-910ba8b2, VEXPL-51e169b6, VEXPL-ef56e655, VEXPL-53474c88, VEXPL-cbbd3d02].
Cause: 5 failed pre-fix retries, each ran recordVexPayment (+Rs 6,32,931 + appended
a logId) then the enqueue threw, so NO payment_log persisted.

DANGLING-LOGID HANDLING (explicit): all 5 payment_log_ids are **dangling** - each
references **no** payment_logs row (verified: 0 present). So there is **nothing to
delete in payment_logs**; the 5 ids are pure artifacts in the VexPi.payment_log_ids
array. They are all **removed** from that array.

ON APPLY (on go, one transaction):
1. Drop all 5 dangling ids from payment_log_ids.
2. Set payment_received_amount = **Rs 6,32,931** (the single real receipt: bank
   Rs 6,32,931 + TDS Rs 0; the user's actual entry, logged once).
3. Create ONE real payment_log (id e.g. VEXPL-RECOV-UP2627020, amount Rs 6,32,931,
   mode Bank Transfer, reference 'NA', unmatched=false, narration noting the
   recovery + the 5 removed retry-duplicates) and set payment_log_ids = [that id].
4. Recompute status: received Rs 6,32,931 >= total -> stays Delivery Pending (paid,
   awaiting delivery). Append a VexPi audit entry.
RESULT: received Rs 31,64,655 -> Rs 6,32,931 (1x), one real payment_log, status
unchanged. Reversible via the backup. NOTE: the broader gap (every VEX PI lacks
payment_logs historically) is a separate optional backfill, not this unwind.

Re-classification stays parked on Pranav's rows.
