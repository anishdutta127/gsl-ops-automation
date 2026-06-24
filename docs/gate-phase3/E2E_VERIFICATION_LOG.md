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

## GATED UNWIND 1/3 - 21K: DRY-RUN (backup taken; NOT applied; awaiting explicit go)
Backup: .recovery-backup/21k-MOU-YP-2627-007-pre-cancel.json (gitignored).
- MOU **MOU-YP-2627-007** (21K Learning, Young Pioneers, contract Rs 1,53,400,
  status Active, cohort active, mou.received stale 0).
- ONE payment **MOU-YP-2627-007-i1**: expected Rs 1.00, received Rs 1,53,400.01,
  status Paid, ref AXISCN1358400464, **no PI**. No payment_logs matched.
- On `cancelMou(MOU-YP-2627-007)`: MOU -> status Cancelled + cohort archived;
  payment i1 -> status Cancelled (received_amount kept on the row, excluded from
  sums); received (non-Cancelled) Rs 1,53,400.01 -> 0; MOU drops from active
  views; no orphans; no PI to unwind. Reversible via the backup.
- Apply method on go: via the live cancel route (first real use of the capability).

## Remaining gated unwinds (each backup -> dry-run -> explicit go, in order)
2. St Paul's duplicate PL-CB850B8E.
3. VEX over-count VEXPI-UP-26-27-020 (Rs 31.6L vs Rs 6.3L, 5 dangling logIds; show
   the dangling-logId handling in its dry-run).
Re-classification stays parked on Pranav's rows.
