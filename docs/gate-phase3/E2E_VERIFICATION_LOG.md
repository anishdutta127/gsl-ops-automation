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

## GATED UNWIND 2/3 - St Paul's PL-CB850B8E: DRY-RUN (backup taken; NOT applied; awaiting go)
Backup: .recovery-backup/stpauls-PL-CB850B8E-pre.json (gitignored).
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

## GATED UNWIND 3/3 - VEX over-count VEXPI-UP-26-27-020 (queued)
Rs 31.6L vs Rs 6.3L, 5 dangling logIds; show the dangling-logId handling in its
dry-run. Backup -> dry-run -> explicit go.

Re-classification stays parked on Pranav's rows.
