/*
 * Round 3 Step 10b : VEX dispatch rupee-value gate, unit-tested.
 *
 * Pranav's reproducer (from the round 3 brief):
 *   PI: 10 items × Rs 50,000 each = Rs 5L total.
 *   Paid: Rs 2L.
 *   Try dispatch 3 × Rs 50,000 = Rs 1.5L → ALLOWED (1.5L ≤ 2L available).
 *   Try dispatch 5 × Rs 50,000 = Rs 2.5L → REJECTED with explicit Rs message.
 */

import { describe, it, expect } from 'vitest'
import { checkVexDispatchGate } from './vexDispatchGate'

const ITEM_PRICE = 50000
const PI_QTY = 10

function items(qty: number) {
  return [
    { partNumber: 'PT-1', qty, unitPriceRs: ITEM_PRICE, pendingQty: PI_QTY },
  ]
}

describe('checkVexDispatchGate', () => {
  it('blocks every dispatch when no payment is received', () => {
    expect(
      checkVexDispatchGate({
        paymentReceivedRs: 0,
        alreadyDispatchedValueRs: 0,
        proposedItems: items(1),
      }),
    ).toMatch(/No payment received/i)
  })

  it("Pranav's case: paid Rs 2L, dispatch 3 × Rs 50,000 = Rs 1.5L is allowed", () => {
    expect(
      checkVexDispatchGate({
        paymentReceivedRs: 200000,
        alreadyDispatchedValueRs: 0,
        proposedItems: items(3),
      }),
    ).toBeNull()
  })

  it("Pranav's case: paid Rs 2L, dispatch 5 × Rs 50,000 = Rs 2.5L is rejected with Rs message", () => {
    const err = checkVexDispatchGate({
      paymentReceivedRs: 200000,
      alreadyDispatchedValueRs: 0,
      proposedItems: items(5),
    })
    expect(err).not.toBeNull()
    // The error must phrase both sides in rupees, not qty.
    expect(err).toMatch(/Rs 2,50,000/)
    expect(err).toMatch(/Rs 2,00,000/)
    expect(err).not.toMatch(/qty 5 exceeds/i)
  })

  it('subtracts already-dispatched value from the available envelope', () => {
    // Paid 2L, already dispatched 1.5L → only 0.5L left.
    expect(
      checkVexDispatchGate({
        paymentReceivedRs: 200000,
        alreadyDispatchedValueRs: 150000,
        proposedItems: items(2), // 1L
      }),
    ).toMatch(/exceeds available Rs 50,000/)
  })

  it('rejects qty > pending qty for that part with a units-explicit error', () => {
    expect(
      checkVexDispatchGate({
        paymentReceivedRs: 500000,
        alreadyDispatchedValueRs: 0,
        proposedItems: [
          { partNumber: 'PT-1', qty: 12, unitPriceRs: 1000, pendingQty: 10 },
        ],
      }),
    ).toMatch(/units, not rupees/)
  })

  it('zero or negative qty is rejected', () => {
    expect(
      checkVexDispatchGate({
        paymentReceivedRs: 100,
        alreadyDispatchedValueRs: 0,
        proposedItems: [
          { partNumber: 'PT-1', qty: 0, unitPriceRs: 100, pendingQty: 5 },
        ],
      }),
    ).toMatch(/positive qty/)
  })

  it('exact match (proposed = available) is allowed', () => {
    expect(
      checkVexDispatchGate({
        paymentReceivedRs: 200000,
        alreadyDispatchedValueRs: 0,
        proposedItems: items(4), // 4 × 50K = 2L exactly
      }),
    ).toBeNull()
  })
})
