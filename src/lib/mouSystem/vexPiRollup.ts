/*
 * VEX PI status roll-up from dispatch delivery progress.
 *
 * The PI status (VexPiStatus) is otherwise nudged manually by Finance. This
 * helper derives the status implied by the PI's dispatches so that, once kits
 * are confirmed Delivered, the PI moves off "Delivery Pending" on its own (the
 * gap Pranav flagged on MTPL/UP/26-27/0030: dispatches reached Shipped but the
 * PI-level status never advanced).
 *
 * Rule (confirmed with the owner, 2026-06-26):
 *   - Completed: every ordered line-item quantity has been dispatched AND every
 *     dispatch for the PI is 'Delivered'. Never marks a PI done while goods
 *     remain unshipped.
 *   - Partially Dispatched: at least one dispatch is 'Delivered' but the PI is
 *     not fully delivered yet.
 *   - Otherwise (nothing delivered, e.g. dispatches only Shipped): no roll-up.
 *
 * Forward-only: the helper only returns a status that ADVANCES the PI along the
 * VexPiStatus order, so it never rewinds a status Finance set by hand and never
 * regresses on a re-run. Returns null when there is no change to apply.
 */

import type { VexPi, VexPiStatus } from './types'

/**
 * Minimal shape this helper reads off a dispatch. Kept structural so it accepts
 * a VexDispatch from either the @/lib/types or @/lib/mouSystem/types flavour
 * (they diverge only on the AuditAction union, which the roll-up never touches).
 */
interface DispatchProgress {
  piId: string
  status: string
  items: { partNumber: string; qty: number }[]
  // A voided dispatch (Pass 2 cascade) never counts toward the roll-up.
  voidedAt?: string | null
}

const PI_STATUS_ORDER: VexPiStatus[] = [
  'Generated',
  'Payment Pending',
  'Delivery Pending',
  'Partially Dispatched',
  'Completed',
]

export function rollUpVexPiStatus(
  pi: Pick<VexPi, 'id' | 'status' | 'lineItems'>,
  allDispatches: DispatchProgress[],
): VexPiStatus | null {
  const dispatches = allDispatches.filter((d) => d.piId === pi.id && !d.voidedAt)
  if (dispatches.length === 0) return null

  const dispatchedQtyByPart = new Map<string, number>()
  for (const d of dispatches) {
    for (const it of d.items) {
      dispatchedQtyByPart.set(
        it.partNumber,
        (dispatchedQtyByPart.get(it.partNumber) ?? 0) + it.qty,
      )
    }
  }
  const fullyDispatched = pi.lineItems.every(
    (li) => (dispatchedQtyByPart.get(li.partNumber) ?? 0) >= li.quantity,
  )
  const allDelivered = dispatches.every((d) => d.status === 'Delivered')
  const anyDelivered = dispatches.some((d) => d.status === 'Delivered')

  let target: VexPiStatus | null = null
  if (fullyDispatched && allDelivered) target = 'Completed'
  else if (anyDelivered) target = 'Partially Dispatched'
  if (!target) return null

  const curIdx = PI_STATUS_ORDER.indexOf(pi.status)
  const targetIdx = PI_STATUS_ORDER.indexOf(target)
  if (targetIdx <= curIdx) return null
  return target
}
