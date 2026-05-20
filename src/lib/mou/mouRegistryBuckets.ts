/*
 * Phase 6C: 4-column PI x Payment matrix on /mous registry.
 *
 * Per Pranav review #2, each MOU surfaces four bucket amounts in place
 * of the legacy PI / Received / Balance columns:
 *
 *   1. PI not raised & Payment received   (Excel-import paid rows
 *      without a piNumber set; usually a Pratik backfill candidate)
 *   2. PI raised & Payment received       (the healthy path: invoice
 *      issued, money in)
 *   3. PI raised & Payment not received   (invoice issued, awaiting
 *      payment)
 *   4. PI not raised & Payment not received (instalment pending, no
 *      invoice yet)
 *
 * Sum invariant: the four amounts sum to the year-window expected
 * contract value within Rs 1 tolerance. The /mous table footer adds
 * per-column totals so a registry-wide view balances at a glance.
 *
 * Definitions:
 *   - "Paid" means receivedAmount > 0. Partial receipts count as paid
 *     for the bucket dimension; the bucket amount uses
 *     receivedAmount (what landed) for the paid buckets and
 *     (expected - received) for the unpaid bucket of the same row.
 *     Practically every row in Ops today is either fully paid or fully
 *     unpaid; partial-paid rows surface as a small remainder in the
 *     PI-raised-payment-not-received bucket.
 *   - "PI raised" means payment.piNumber is a non-empty string.
 *   - "Amount" in each bucket is in Rs (whole units after rounding).
 */

import type { MOU, Payment } from '@/lib/types'

export interface MouBucketAmounts {
  /** PI not raised + Payment received. */
  piNoPayYes: number
  /** PI raised + Payment received. */
  piYesPayYes: number
  /** PI raised + Payment NOT received. */
  piYesPayNo: number
  /** PI not raised + Payment NOT received. */
  piNoPayNo: number
  /** Sum of expected amounts across the instalments considered. */
  expectedTotal: number
}

export function deriveMouBucketAmounts(
  instalments: Payment[],
): MouBucketAmounts {
  let piNoPayYes = 0
  let piYesPayYes = 0
  let piYesPayNo = 0
  let piNoPayNo = 0
  let expectedTotal = 0
  for (const inst of instalments) {
    const expected = inst.expectedAmount ?? 0
    expectedTotal += expected
    const received = inst.receivedAmount ?? 0
    const piRaised =
      typeof inst.piNumber === 'string' && inst.piNumber.trim() !== ''
    const unreceived = Math.max(0, expected - received)
    if (received > 0) {
      if (piRaised) piYesPayYes += received
      else piNoPayYes += received
    }
    if (unreceived > 0) {
      if (piRaised) piYesPayNo += unreceived
      else piNoPayNo += unreceived
    }
  }
  return {
    piNoPayYes: Math.round(piNoPayYes),
    piYesPayYes: Math.round(piYesPayYes),
    piYesPayNo: Math.round(piYesPayNo),
    piNoPayNo: Math.round(piNoPayNo),
    expectedTotal: Math.round(expectedTotal),
  }
}

export interface RegistryBucketTotals {
  piNoPayYes: number
  piYesPayYes: number
  piYesPayNo: number
  piNoPayNo: number
  expectedTotal: number
  rowCount: number
}

/**
 * Sum across MOU rows the four bucket amounts. The page passes the
 * per-MOU buckets already computed for column rendering; this just
 * tallies them for the footer.
 */
export function sumRegistryBuckets(
  rows: Array<{ buckets: MouBucketAmounts }>,
): RegistryBucketTotals {
  const out: RegistryBucketTotals = {
    piNoPayYes: 0,
    piYesPayYes: 0,
    piYesPayNo: 0,
    piNoPayNo: 0,
    expectedTotal: 0,
    rowCount: rows.length,
  }
  for (const r of rows) {
    out.piNoPayYes += r.buckets.piNoPayYes
    out.piYesPayYes += r.buckets.piYesPayYes
    out.piYesPayNo += r.buckets.piYesPayNo
    out.piNoPayNo += r.buckets.piNoPayNo
    out.expectedTotal += r.buckets.expectedTotal
  }
  return out
}

/**
 * Reconciliation: the four bucket amounts must sum to expectedTotal
 * within Rs 1 tolerance. The page uses this to render a "reconciles"
 * indicator next to the footer total.
 */
export function bucketsReconcile(buckets: MouBucketAmounts): boolean {
  const sum =
    buckets.piNoPayYes +
    buckets.piYesPayYes +
    buckets.piYesPayNo +
    buckets.piNoPayNo
  return Math.abs(sum - buckets.expectedTotal) <= 1
}

/**
 * Stable lifetime variant for the parametric invariant test: derive
 * buckets across ALL of a MOU's payments without year filtering.
 * Useful for catching invariant violations independent of year scope.
 */
export function deriveLifetimeBucketsForMou(
  mou: MOU,
  payments: Payment[],
): MouBucketAmounts {
  const inst = payments.filter((p) => p.mouId === mou.id)
  return deriveMouBucketAmounts(inst)
}
