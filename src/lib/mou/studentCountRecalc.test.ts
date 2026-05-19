import { describe, expect, it } from 'vitest'
import type { Payment } from '@/lib/types'
import { recalcInstallments } from './studentCountRecalc'

function inst(overrides: Partial<Payment>): Payment {
  return {
    id: 'MOU-X-i1',
    mouId: 'MOU-X',
    schoolName: 'Test',
    programme: 'STEAM',
    instalmentLabel: '1 of 4',
    instalmentSeq: 1,
    totalInstalments: 4,
    description: '',
    dueDateRaw: null,
    dueDateIso: null,
    expectedAmount: 125000,
    receivedAmount: null,
    receivedDate: null,
    paymentMode: null,
    bankReference: null,
    piNumber: null,
    taxInvoiceNumber: null,
    status: 'Pending',
    notes: null,
    piSentDate: null,
    piSentTo: null,
    piGeneratedAt: null,
    studentCountActual: null,
    partialPayments: null,
    auditLog: [],
    ...overrides,
  }
}

// Pranav's spec uses Rs 1000 per student GST-inclusive.
// At signing: 500 students -> contractValue 5,00,000 -> 4 quarterly instalments of 1,25,000.
function baseline4x500(): Payment[] {
  return [
    inst({ id: 'MOU-X-i1', instalmentSeq: 1, expectedAmount: 125000 }),
    inst({ id: 'MOU-X-i2', instalmentSeq: 2, expectedAmount: 125000 }),
    inst({ id: 'MOU-X-i3', instalmentSeq: 3, expectedAmount: 125000 }),
    inst({ id: 'MOU-X-i4', instalmentSeq: 4, expectedAmount: 125000 }),
  ]
}

describe('recalcInstallments - Pranav worked example 1 (decreasing 500 -> 450 -> 400)', () => {
  it('Step A: 500 -> 450 BEFORE any payment, all 4 PIs revise to Rs 1,12,500', () => {
    const result = recalcInstallments({
      pricePerStudent: 1000,
      currentCount: 450,
      installments: baseline4x500(),
    })
    expect(result.reconciled).toBe(true)
    expect(result.cumulativeDelta).toBe(0)
    expect(result.firstUnpaidId).toBe('MOU-X-i1')
    expect(result.rows[0]?.netDue).toBe(112500)
    expect(result.rows[1]?.netDue).toBe(112500)
    expect(result.rows[2]?.netDue).toBe(112500)
    expect(result.rows[3]?.netDue).toBe(112500)
    expect(result.totalCommitted).toBe(450000)
  })

  it('Step B: after PI 1 paid at 112500 + count drops to 400, PI 2 nets to Rs 87,500', () => {
    // PI 1 is now locked at 112500.
    const installments = baseline4x500()
    installments[0] = inst({
      id: 'MOU-X-i1',
      instalmentSeq: 1,
      expectedAmount: 112500,
      receivedAmount: 112500,
      status: 'Paid',
    })
    // Remaining unpaid carry their post-450-recalc baseline.
    installments[1] = inst({ id: 'MOU-X-i2', instalmentSeq: 2, expectedAmount: 112500 })
    installments[2] = inst({ id: 'MOU-X-i3', instalmentSeq: 3, expectedAmount: 112500 })
    installments[3] = inst({ id: 'MOU-X-i4', instalmentSeq: 4, expectedAmount: 112500 })

    const result = recalcInstallments({
      pricePerStudent: 1000,
      currentCount: 400,
      installments,
    })

    expect(result.reconciled).toBe(true)
    // PI 1 stays at received amount (locked).
    expect(result.rows[0]?.netDue).toBe(112500)
    expect(result.rows[0]?.isLocked).toBe(true)
    expect(result.rows[0]?.nominalAmount).toBe(100000) // theoretical at new count
    expect(result.rows[0]?.lockedDeltaContribution).toBe(-12500) // overpayment

    // Cumulative delta = -12,500 (excess credit).
    expect(result.cumulativeDelta).toBe(-12500)
    expect(result.firstUnpaidId).toBe('MOU-X-i2')

    // PI 2 takes the carry: nominal 1,00,000 - 12,500 = 87,500.
    expect(result.rows[1]?.nominalAmount).toBe(100000)
    expect(result.rows[1]?.adjustmentFromLockedInstallments).toBe(-12500)
    expect(result.rows[1]?.netDue).toBe(87500)

    // PI 3, 4: full nominal, no adjustment.
    expect(result.rows[2]?.netDue).toBe(100000)
    expect(result.rows[2]?.adjustmentFromLockedInstallments).toBe(0)
    expect(result.rows[3]?.netDue).toBe(100000)

    // Total over MOU = 4,00,000 = 400 × 1000.
    expect(result.totalCommitted).toBe(400000)
  })
})

describe('recalcInstallments - Pranav worked example 2 (increasing 500 -> 600)', () => {
  it('after PI 1 paid at 125000 + count rises to 600, PI 2 nets to Rs 1,75,000', () => {
    const installments = baseline4x500()
    installments[0] = inst({
      id: 'MOU-X-i1',
      instalmentSeq: 1,
      expectedAmount: 125000,
      receivedAmount: 125000,
      status: 'Paid',
    })

    const result = recalcInstallments({
      pricePerStudent: 1000,
      currentCount: 600,
      installments,
    })

    expect(result.reconciled).toBe(true)
    // PI 1 locked at 1,25,000. Theoretical at 600 = 1,50,000. Shortfall = +25,000.
    expect(result.rows[0]?.netDue).toBe(125000)
    expect(result.rows[0]?.nominalAmount).toBe(150000)
    expect(result.rows[0]?.lockedDeltaContribution).toBe(25000)
    expect(result.cumulativeDelta).toBe(25000)

    // PI 2 = nominal 1,50,000 + 25,000 shortfall = 1,75,000.
    expect(result.firstUnpaidId).toBe('MOU-X-i2')
    expect(result.rows[1]?.adjustmentFromLockedInstallments).toBe(25000)
    expect(result.rows[1]?.netDue).toBe(175000)

    // PI 3 + 4: 1,50,000 each.
    expect(result.rows[2]?.netDue).toBe(150000)
    expect(result.rows[3]?.netDue).toBe(150000)

    // Total = 6,00,000 = 600 × 1000.
    expect(result.totalCommitted).toBe(600000)
  })
})

describe('recalcInstallments - additional cases', () => {
  it('count change BEFORE any payment: all unpaid rows revise uniformly with zero carry', () => {
    const result = recalcInstallments({
      pricePerStudent: 1000,
      currentCount: 600,
      installments: baseline4x500(),
    })
    expect(result.cumulativeDelta).toBe(0)
    expect(result.rows.every((r) => r.adjustmentFromLockedInstallments === 0)).toBe(true)
    expect(result.rows.every((r) => r.netDue === 150000)).toBe(true)
    expect(result.totalCommitted).toBe(600000)
  })

  it('count change between PI 3 and PI 4 (3 locked, 1 unpaid)', () => {
    // 500 students originally; 3 PIs paid at 125000 each; count now drops to 400.
    const installments = baseline4x500()
    for (let i = 0; i < 3; i += 1) {
      installments[i] = inst({
        id: `MOU-X-i${i + 1}`,
        instalmentSeq: i + 1,
        expectedAmount: 125000,
        receivedAmount: 125000,
        status: 'Paid',
      })
    }
    const result = recalcInstallments({
      pricePerStudent: 1000,
      currentCount: 400,
      installments,
    })
    expect(result.reconciled).toBe(true)
    // Each locked row contributes (100000 - 125000) = -25000; cumulative = -75000.
    expect(result.cumulativeDelta).toBe(-75000)
    expect(result.firstUnpaidId).toBe('MOU-X-i4')
    // PI 4 absorbs: nominal 100000 + (-75000) = 25000.
    expect(result.rows[3]?.netDue).toBe(25000)
    // Total = 3 × 125000 + 25000 = 4,00,000 = 400 × 1000.
    expect(result.totalCommitted).toBe(400000)
  })

  it('count change makes net due negative when cumulative overpayment exceeds nominal', () => {
    // 500 students; PI 1, PI 2 both paid at 1,25,000; count drops to 200.
    const installments = baseline4x500()
    installments[0] = inst({
      id: 'MOU-X-i1',
      instalmentSeq: 1,
      expectedAmount: 125000,
      receivedAmount: 125000,
      status: 'Paid',
    })
    installments[1] = inst({
      id: 'MOU-X-i2',
      instalmentSeq: 2,
      expectedAmount: 125000,
      receivedAmount: 125000,
      status: 'Paid',
    })
    const result = recalcInstallments({
      pricePerStudent: 1000,
      currentCount: 200,
      installments,
    })
    expect(result.reconciled).toBe(true)
    // Each locked row contributes (50000 - 125000) = -75000; cumulative = -150000.
    expect(result.cumulativeDelta).toBe(-150000)
    // PI 3 (first unpaid): nominal 50000 + (-150000) = -100000 net due.
    // This is a credit-balance state; the engine returns the negative
    // and the UI surfaces "credit of Rs 1,00,000 carrying forward".
    expect(result.rows[2]?.netDue).toBe(-100000)
    expect(result.rows[3]?.netDue).toBe(50000)
    // Total still reconciles: 125000 + 125000 + (-100000) + 50000 = 2,00,000.
    expect(result.totalCommitted).toBe(200000)
  })

  it('all rows locked: cumulativeDelta surfaces but no row absorbs', () => {
    const installments = baseline4x500().map((p, i) =>
      inst({
        id: `MOU-X-i${i + 1}`,
        instalmentSeq: i + 1,
        expectedAmount: 125000,
        receivedAmount: 125000,
        status: 'Paid',
      }),
    )
    const result = recalcInstallments({
      pricePerStudent: 1000,
      currentCount: 400,
      installments,
    })
    // No unpaid row to absorb; the engine still computes the delta
    // for transparency but firstUnpaidId is null.
    expect(result.firstUnpaidId).toBeNull()
    expect(result.cumulativeDelta).toBe(-100000)
    // totalCommitted now reflects only the locked netDue values
    // (the carry is informational; the operator has to issue a
    // refund or apply it to a renewal).
    expect(result.totalCommitted).toBe(500000)
    // reconciled is FALSE because total - expected (4,00,000) is 1,00,000.
    expect(result.reconciled).toBe(false)
  })

  it('non-uniform percentShare (10-30-30-30) preserves shape', () => {
    const installments: Payment[] = [
      inst({ id: 'MOU-X-i1', instalmentSeq: 1, expectedAmount: 50000 }),
      inst({ id: 'MOU-X-i2', instalmentSeq: 2, expectedAmount: 150000 }),
      inst({ id: 'MOU-X-i3', instalmentSeq: 3, expectedAmount: 150000 }),
      inst({ id: 'MOU-X-i4', instalmentSeq: 4, expectedAmount: 150000 }),
    ]
    // Contract value = 5,00,000; pricePerStudent = 1000; current count = 400.
    const result = recalcInstallments({
      pricePerStudent: 1000,
      currentCount: 400,
      installments,
    })
    expect(result.reconciled).toBe(true)
    // 10% of 4,00,000 = 40,000; 30% × 3 = 1,20,000 each.
    expect(result.rows[0]?.netDue).toBe(40000)
    expect(result.rows[1]?.netDue).toBe(120000)
    expect(result.rows[2]?.netDue).toBe(120000)
    expect(result.rows[3]?.netDue).toBe(120000)
    expect(result.totalCommitted).toBe(400000)
  })

  it('explicit percentShare overrides expectedAmount-derivation', () => {
    const installments: Payment[] = [
      inst({ id: 'MOU-X-i1', instalmentSeq: 1, expectedAmount: 0, percentShare: 25 }),
      inst({ id: 'MOU-X-i2', instalmentSeq: 2, expectedAmount: 0, percentShare: 25 }),
      inst({ id: 'MOU-X-i3', instalmentSeq: 3, expectedAmount: 0, percentShare: 25 }),
      inst({ id: 'MOU-X-i4', instalmentSeq: 4, expectedAmount: 0, percentShare: 25 }),
    ]
    const result = recalcInstallments({
      pricePerStudent: 1000,
      currentCount: 500,
      installments,
    })
    expect(result.rows.every((r) => r.netDue === 125000)).toBe(true)
  })

  it('partial payment is treated as locked (any positive receivedAmount locks)', () => {
    // PI 1 was paid Rs 50,000 of a Rs 1,25,000 instalment; treat as locked
    // for recalc purposes (the operator should re-record the partial via
    // a separate flow if they want to unlock).
    const installments = baseline4x500()
    installments[0] = inst({
      id: 'MOU-X-i1',
      instalmentSeq: 1,
      expectedAmount: 125000,
      receivedAmount: 50000,
      status: 'Partial',
    })
    const result = recalcInstallments({
      pricePerStudent: 1000,
      currentCount: 400,
      installments,
    })
    expect(result.rows[0]?.isLocked).toBe(true)
    // Theoretical nominal at 400 = 1,00,000. Received = 50,000. Delta = +50,000 shortfall.
    expect(result.rows[0]?.lockedDeltaContribution).toBe(50000)
    expect(result.cumulativeDelta).toBe(50000)
    // PI 2 (first unpaid) = nominal 100000 + 50000 shortfall = 150000.
    expect(result.rows[1]?.netDue).toBe(150000)
  })
})
