import { describe, expect, it } from 'vitest'
import {
  PAID_TOLERANCE,
  isVexPiFullyPaid,
  deriveVexPiStatusFromBalance,
  nudgeVexPiStatusOnPayment,
} from './vexPiStatus'

describe('isVexPiFullyPaid (GST-rounding tolerance)', () => {
  it('treats a sub-rupee shortfall as fully paid', () => {
    expect(isVexPiFullyPaid(114284, 114284.18)).toBe(true) // 0.18 short
    expect(isVexPiFullyPaid(91432, 91432.3)).toBe(true) // 0.30 short
    expect(isVexPiFullyPaid(1000, 1000)).toBe(true) // exact
    expect(isVexPiFullyPaid(1200, 1000)).toBe(true) // over
  })
  it('does not treat a real partial as fully paid', () => {
    expect(isVexPiFullyPaid(1, 4.72)).toBe(false)
    expect(isVexPiFullyPaid(99998, 100000)).toBe(false) // Rs 2 short
    expect(isVexPiFullyPaid(0, 1000)).toBe(false)
  })
  it('the tolerance ceiling is exactly Rs 1', () => {
    expect(PAID_TOLERANCE).toBe(1)
    expect(isVexPiFullyPaid(999, 1000)).toBe(true) // exactly Rs 1 short -> paid
    expect(isVexPiFullyPaid(998.99, 1000)).toBe(false) // > Rs 1 short -> not paid
  })
})

describe('deriveVexPiStatusFromBalance (total / idempotent)', () => {
  it('nothing paid -> Generated', () => {
    expect(deriveVexPiStatusFromBalance(0, 1000, 'Payment Pending')).toBe('Generated')
    expect(deriveVexPiStatusFromBalance(-1, 1000, 'Delivery Pending')).toBe('Generated')
  })
  it('partial -> Payment Pending (rewinds a higher state on a void-down)', () => {
    expect(deriveVexPiStatusFromBalance(400, 1000, 'Delivery Pending')).toBe('Payment Pending')
  })
  it('fully paid -> Delivery Pending, preserving any later state', () => {
    expect(deriveVexPiStatusFromBalance(1000, 1000, 'Generated')).toBe('Delivery Pending')
    expect(deriveVexPiStatusFromBalance(1000, 1000, 'Payment Pending')).toBe('Delivery Pending')
    expect(deriveVexPiStatusFromBalance(1000, 1000, 'Partially Dispatched')).toBe('Partially Dispatched')
    expect(deriveVexPiStatusFromBalance(1200, 1000, 'Completed')).toBe('Completed')
  })
  it('is idempotent', () => {
    const once = deriveVexPiStatusFromBalance(114284, 114284.18, 'Payment Pending')
    expect(deriveVexPiStatusFromBalance(114284, 114284.18, once)).toBe(once)
    expect(once).toBe('Delivery Pending')
  })
})

describe('nudgeVexPiStatusOnPayment (forward-nudge on a new receipt)', () => {
  it('a full receipt settles Generated/Payment Pending to Delivery Pending', () => {
    expect(nudgeVexPiStatusOnPayment(1000, 1000, 'Generated')).toBe('Delivery Pending')
    expect(nudgeVexPiStatusOnPayment(114284, 114284.18, 'Payment Pending')).toBe('Delivery Pending')
  })
  it('a partial receipt only advances Generated, never churns a higher state', () => {
    expect(nudgeVexPiStatusOnPayment(400, 1000, 'Generated')).toBe('Payment Pending')
    expect(nudgeVexPiStatusOnPayment(400, 1000, 'Payment Pending')).toBe('Payment Pending')
    // a partial top-up never rewinds a manually-set higher state
    expect(nudgeVexPiStatusOnPayment(400, 1000, 'Partially Dispatched')).toBe('Partially Dispatched')
  })
  it('a full receipt never rewinds dispatch progress', () => {
    expect(nudgeVexPiStatusOnPayment(1000, 1000, 'Partially Dispatched')).toBe('Partially Dispatched')
    expect(nudgeVexPiStatusOnPayment(1000, 1000, 'Completed')).toBe('Completed')
  })
})
