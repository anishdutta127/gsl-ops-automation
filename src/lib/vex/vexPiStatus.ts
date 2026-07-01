/*
 * VEX PI status derivation from the payment balance (single source of truth).
 *
 * A VexPi's status is otherwise hand-nudged by Finance, but the payment-driven
 * part of it (Generated -> Payment Pending -> Delivery Pending) MUST be derived
 * from `paymentReceivedAmount` vs `total` so it can never go stale. Every path
 * that changes the balance (log / edit / void a VEX payment, or edit the PI
 * total) routes its status through one of the two functions here, and
 * vexPiRepo.recordVexPayment mirrors `nudgeVexPiStatusOnPayment` in SQL.
 *
 * THE ROUNDING TOLERANCE (the bug this module fixes):
 *   A PI total carries 2-dp GST (e.g. Rs 1,14,284.18) but banks remit whole
 *   rupees (Rs 1,14,284). A whole-rupee receipt is therefore a few paise short
 *   of the total, and a STRICT `received >= total` comparison stranded a
 *   fully-settled PI at "Payment Pending" (VEXPI-UP-26-27-017, -MH-26-27-004,
 *   et al). We treat an outstanding of up to PAID_TOLERANCE rupees as fully
 *   paid. Owner precedent: Funscholar VEXPI-UP-26-27-013 (Rs 0.10 short) was
 *   adjudicated "GST rounding, invoice effectively paid". A genuine partial is
 *   short by hundreds/thousands, never by < Rs 1, so the tolerance cannot mask
 *   a real outstanding balance.
 */

import type { VexPiStatus } from '@/lib/types'

/**
 * Maximum outstanding (in rupees) still counted as fully paid. GST on a
 * whole-rupee receipt leaves a strictly sub-rupee paise gap, so Rs 1 covers
 * every rounding case without ever masking a genuine partial.
 */
export const PAID_TOLERANCE = 1

const ORDER: VexPiStatus[] = [
  'Generated',
  'Payment Pending',
  'Delivery Pending',
  'Partially Dispatched',
  'Completed',
]
const DELIVERY_PENDING_IDX = ORDER.indexOf('Delivery Pending')

/** True when the receipt covers the total within the GST-rounding tolerance. */
export function isVexPiFullyPaid(received: number, total: number): boolean {
  return received > 0 && received >= total - PAID_TOLERANCE
}

const atOrBeyondDelivery = (s: VexPiStatus): boolean =>
  ORDER.indexOf(s) >= DELIVERY_PENDING_IDX

/**
 * TOTAL / idempotent derivation from the balance. Used by the explicit finance
 * corrections (edit/void a VEX payment, edit the PI) and by the status
 * reconcile. Re-running it on the same balance is a no-op.
 *
 *   received <= 0          -> Generated
 *   0 < received (partial) -> Payment Pending
 *   fully paid             -> keep any status already at/beyond Delivery Pending
 *                             (never rewinds dispatch progress); else Delivery Pending
 */
export function deriveVexPiStatusFromBalance(
  received: number,
  total: number,
  current: VexPiStatus,
): VexPiStatus {
  if (received <= 0) return 'Generated'
  if (!isVexPiFullyPaid(received, total)) return 'Payment Pending'
  return atOrBeyondDelivery(current) ? current : 'Delivery Pending'
}

/**
 * FORWARD-NUDGE applied when LOGGING a new payment. Mirrored byte-for-byte by
 * the SQL CASE in vexPiRepo.recordVexPayment (kept in sync by a contract test).
 * Unlike the total derivation it never forces a non-Generated status back to
 * Payment Pending, so an additional partial receipt on an already-pending PI
 * does not churn the status:
 *
 *   fully paid             -> keep any status already at/beyond Delivery Pending;
 *                             else Delivery Pending
 *   partial, was Generated -> Payment Pending
 *   partial, otherwise     -> unchanged
 */
export function nudgeVexPiStatusOnPayment(
  newReceived: number,
  total: number,
  current: VexPiStatus,
): VexPiStatus {
  if (isVexPiFullyPaid(newReceived, total)) {
    return atOrBeyondDelivery(current) ? current : 'Delivery Pending'
  }
  return current === 'Generated' ? 'Payment Pending' : current
}
