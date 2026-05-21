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

describe('recalcInstallments - spread-by-weight (Phase 6A)', () => {
  it('Step A: 500 -> 450 BEFORE any payment, all 4 PIs revise to Rs 1,12,500 (no locked rows, same as before)', () => {
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

  it('Step B: PI1 paid at 112500, count drops 450 -> 400, three unpaid spread to Rs 95,833.33 each', () => {
    const installments = baseline4x500()
    installments[0] = inst({
      id: 'MOU-X-i1',
      instalmentSeq: 1,
      expectedAmount: 112500,
      receivedAmount: 112500,
      status: 'Paid',
    })
    installments[1] = inst({ id: 'MOU-X-i2', instalmentSeq: 2, expectedAmount: 112500 })
    installments[2] = inst({ id: 'MOU-X-i3', instalmentSeq: 3, expectedAmount: 112500 })
    installments[3] = inst({ id: 'MOU-X-i4', instalmentSeq: 4, expectedAmount: 112500 })

    const result = recalcInstallments({
      pricePerStudent: 1000,
      currentCount: 400,
      installments,
    })

    expect(result.reconciled).toBe(true)
    expect(result.rows[0]?.netDue).toBe(112500)
    expect(result.rows[0]?.isLocked).toBe(true)
    expect(result.rows[0]?.nominalAmount).toBe(100000)
    expect(result.rows[0]?.lockedDeltaContribution).toBe(-12500)

    // Cumulative delta unchanged: -12,500 (locked row over-paid vs nominal at 400).
    expect(result.cumulativeDelta).toBe(-12500)
    expect(result.firstUnpaidId).toBe('MOU-X-i2')

    // Spread: remainingContract = 400,000 - 112,500 = 287,500. Three rows
    // at 25% each. Each gets 287,500 × 25 / 75 = 95,833.33 (last absorbs
    // rounding tail to keep sum exact).
    expect(result.rows[1]?.netDue).toBe(95833.33)
    expect(result.rows[2]?.netDue).toBe(95833.33)
    expect(result.rows[3]?.netDue).toBe(95833.34)
    // Each unpaid row carries a small per-row adjustment now
    // (nominal 100,000 less the redistributed credit).
    expect(result.rows[1]?.adjustmentFromLockedInstallments).toBe(-4166.67)
    expect(result.rows[2]?.adjustmentFromLockedInstallments).toBe(-4166.67)
    expect(result.rows[3]?.adjustmentFromLockedInstallments).toBe(-4166.66)
    expect(result.totalCommitted).toBe(400000)
  })

  it('500 -> 600 after PI1 paid at 125000: three unpaid spread to Rs 1,58,333.33 each', () => {
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
    expect(result.rows[0]?.netDue).toBe(125000)
    expect(result.rows[0]?.nominalAmount).toBe(150000)
    expect(result.rows[0]?.lockedDeltaContribution).toBe(25000)
    expect(result.cumulativeDelta).toBe(25000)

    expect(result.firstUnpaidId).toBe('MOU-X-i2')
    // remainingContract = 600,000 - 125,000 = 475,000.
    // Each unpaid gets 475,000 × 25 / 75 = 158,333.33.
    expect(result.rows[1]?.netDue).toBe(158333.33)
    expect(result.rows[2]?.netDue).toBe(158333.33)
    expect(result.rows[3]?.netDue).toBe(158333.34)
    // Each unpaid row's adjustment = netDue - nominal(150,000) = +8,333.33 ish.
    expect(result.rows[1]?.adjustmentFromLockedInstallments).toBe(8333.33)
    expect(result.rows[3]?.adjustmentFromLockedInstallments).toBe(8333.34)
    expect(result.totalCommitted).toBe(600000)
  })
})

describe('recalcInstallments - Pranav production reproduction (MOU-STEAM-2627-001)', () => {
  // Mutahhary Public School Baroo: 4 instalments 10 / 30 / 30 / 30
  // against Rs 4,00,000 contract at 500 students × Rs 800/student.
  // i1 paid Rs 40,000 (locked). Count drops to 450; remaining
  // Rs 3,20,000 spreads across i2 / i3 / i4 by 30/90 weight.
  function mutahharyBaseline(): Payment[] {
    return [
      inst({ id: 'MOU-S-i1', instalmentSeq: 1, expectedAmount: 40000, receivedAmount: 40000, status: 'Paid' }),
      inst({ id: 'MOU-S-i2', instalmentSeq: 2, expectedAmount: 120000 }),
      inst({ id: 'MOU-S-i3', instalmentSeq: 3, expectedAmount: 120000 }),
      inst({ id: 'MOU-S-i4', instalmentSeq: 4, expectedAmount: 120000 }),
    ]
  }

  it('500 -> 450 with i1 paid Rs 40,000: i2 / i3 / i4 land at Rs 1,06,666.67 each', () => {
    const result = recalcInstallments({
      pricePerStudent: 800,
      currentCount: 450,
      installments: mutahharyBaseline(),
    })
    expect(result.reconciled).toBe(true)
    expect(result.firstUnpaidId).toBe('MOU-S-i2')
    // i1 locked.
    expect(result.rows[0]?.isLocked).toBe(true)
    expect(result.rows[0]?.netDue).toBe(40000)
    expect(result.rows[0]?.nominalAmount).toBe(36000) // 450 × 800 × 10 / 100
    expect(result.rows[0]?.lockedDeltaContribution).toBe(-4000) // over-paid by Rs 4,000
    // Spread: remainingContract = 360,000 - 40,000 = 320,000.
    // Each unpaid gets 320,000 × 30 / 90 = 106,666.67.
    expect(result.rows[1]?.netDue).toBe(106666.67)
    expect(result.rows[2]?.netDue).toBe(106666.67)
    expect(result.rows[3]?.netDue).toBe(106666.66)
    // Total reconciles to 450 × 800 = 360,000 (within 1 Rs).
    expect(Math.abs(result.totalCommitted - 360000)).toBeLessThanOrEqual(1)
  })

  it('500 -> 600 with i1 paid Rs 40,000: i2 / i3 / i4 each scale up to Rs 1,46,666.67', () => {
    const result = recalcInstallments({
      pricePerStudent: 800,
      currentCount: 600,
      installments: mutahharyBaseline(),
    })
    expect(result.reconciled).toBe(true)
    // remainingContract = 480,000 - 40,000 = 440,000.
    // Each unpaid gets 440,000 × 30 / 90 = 146,666.67.
    expect(result.rows[1]?.netDue).toBe(146666.67)
    expect(result.rows[2]?.netDue).toBe(146666.67)
    expect(result.rows[3]?.netDue).toBe(146666.66)
    expect(Math.abs(result.totalCommitted - 480000)).toBeLessThanOrEqual(1)
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

  it('count change between PI 3 and PI 4 (3 locked, 1 unpaid): the lone unpaid absorbs the entire carry', () => {
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
    expect(result.cumulativeDelta).toBe(-75000)
    expect(result.firstUnpaidId).toBe('MOU-X-i4')
    // remainingContract = 400,000 - 375,000 = 25,000. Only one unpaid
    // row, so it absorbs everything (same outcome as old engine).
    expect(result.rows[3]?.netDue).toBe(25000)
    expect(result.totalCommitted).toBe(400000)
  })

  it('count change makes net due negative when cumulative overpayment exceeds remaining contract', () => {
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
    expect(result.cumulativeDelta).toBe(-150000)
    // remainingContract = 200,000 - 250,000 = -50,000.
    // Two unpaid rows at 25% each. Each gets -50,000 × 25 / 50 = -25,000.
    expect(result.rows[2]?.netDue).toBe(-25000)
    expect(result.rows[3]?.netDue).toBe(-25000)
    expect(result.totalCommitted).toBe(200000)
  })

  it('all rows locked: cumulativeDelta surfaces but no row absorbs and reconciled is false', () => {
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
    expect(result.firstUnpaidId).toBeNull()
    expect(result.cumulativeDelta).toBe(-100000)
    // totalCommitted reflects only the locked netDue values
    // (the carry is informational; the operator has to issue a
    // refund or apply it to a renewal).
    expect(result.totalCommitted).toBe(500000)
    expect(result.reconciled).toBe(false)
  })

  it('non-uniform percentShare (10-30-30-30) preserves shape when no rows locked', () => {
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

  it('partial payment is treated as locked; carry spreads across remaining unpaid', () => {
    // PI 1 was paid Rs 50,000 of a Rs 1,25,000 instalment; treat as locked
    // for recalc purposes.
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
    expect(result.rows[0]?.lockedDeltaContribution).toBe(50000) // shortfall (received less than nominal)
    expect(result.cumulativeDelta).toBe(50000)
    // remainingContract = 400,000 - 50,000 = 350,000. Three unpaid at
    // 25% each. Each = 350,000 × 25 / 75 = 116,666.67.
    expect(result.rows[1]?.netDue).toBe(116666.67)
    expect(result.rows[2]?.netDue).toBe(116666.67)
    expect(result.rows[3]?.netDue).toBe(116666.66)
    expect(result.totalCommitted).toBe(400000)
  })
})

describe('Phase 6D Part 4: identity between /student-count and /schedule-edit flows', () => {
  // The two surfaces now share the same engine (recalcInstallments).
  // This test asserts they produce identical per-row netDue for the
  // same logical input.
  //
  // Scenario: 4-row MOU at contractValue Rs 4,00,000, percentShares
  // 10/30/30/30, with i1 locked at Rs 40,000.
  //
  //   - /student-count flow: caller passes pricePerStudent = 1000,
  //     currentCount = 400 (so currentCount * pricePerStudent =
  //     400,000) and lets the engine derive contract from count.
  //   - /schedule-edit override flow: caller passes pricePerStudent
  //     and currentCount as informational, plus newContractValue =
  //     400,000 explicitly. The engine MUST use the override.
  //
  // The two callsites must yield identical row.netDue values.
  it('produces identical per-row netDue for the same input regardless of which caller flow drives the engine', () => {
    const installments: Payment[] = [
      inst({
        id: 'MOU-X-i1',
        instalmentSeq: 1,
        expectedAmount: 40000,
        receivedAmount: 40000,
        status: 'Received',
        percentShare: 10,
      }),
      inst({
        id: 'MOU-X-i2',
        instalmentSeq: 2,
        expectedAmount: 120000,
        receivedAmount: null,
        percentShare: 30,
      }),
      inst({
        id: 'MOU-X-i3',
        instalmentSeq: 3,
        expectedAmount: 120000,
        receivedAmount: null,
        percentShare: 30,
      }),
      inst({
        id: 'MOU-X-i4',
        instalmentSeq: 4,
        expectedAmount: 120000,
        receivedAmount: null,
        percentShare: 30,
      }),
    ]
    // Flow A: student-count driven. contract derived from count × price.
    const flowA = recalcInstallments({
      pricePerStudent: 1000,
      currentCount: 400,
      installments,
    })
    // Flow B: schedule-edit override. contractValue passed explicitly.
    const flowB = recalcInstallments({
      pricePerStudent: 1000,
      currentCount: 400,
      installments,
      newContractValue: 400000,
    })
    expect(flowA.rows.length).toBe(flowB.rows.length)
    for (let i = 0; i < flowA.rows.length; i += 1) {
      expect(flowA.rows[i]?.paymentId).toBe(flowB.rows[i]?.paymentId)
      expect(flowA.rows[i]?.netDue).toBe(flowB.rows[i]?.netDue)
      expect(flowA.rows[i]?.adjustmentFromLockedInstallments).toBe(
        flowB.rows[i]?.adjustmentFromLockedInstallments,
      )
    }
    expect(flowA.totalCommitted).toBe(flowB.totalCommitted)
    expect(flowA.reconciled).toBe(flowB.reconciled)
    // Sanity: the locked row's netDue is Rs 40,000 (receivedAmount
    // preserved); the three unpaid rows share Rs 3,60,000 by their
    // 30/30/30 weights, each getting Rs 1,20,000 exactly.
    expect(flowA.rows[0]?.netDue).toBe(40000)
    expect(flowA.rows[1]?.netDue).toBe(120000)
    expect(flowA.rows[2]?.netDue).toBe(120000)
    expect(flowA.rows[3]?.netDue).toBe(120000)
  })

  it('flow B (schedule-edit) honours the contractValue override when it diverges from count × price', () => {
    // currentCount × pricePerStudent = 500 × 1000 = 500,000.
    // But the operator-supplied newContractValue is 400,000; the
    // engine must use the override.
    const installments: Payment[] = [
      inst({
        id: 'MOU-X-i1',
        instalmentSeq: 1,
        expectedAmount: 125000,
        receivedAmount: 125000,
        status: 'Received',
        percentShare: 25,
      }),
      inst({
        id: 'MOU-X-i2',
        instalmentSeq: 2,
        expectedAmount: 125000,
        receivedAmount: null,
        percentShare: 25,
      }),
      inst({
        id: 'MOU-X-i3',
        instalmentSeq: 3,
        expectedAmount: 125000,
        receivedAmount: null,
        percentShare: 25,
      }),
      inst({
        id: 'MOU-X-i4',
        instalmentSeq: 4,
        expectedAmount: 125000,
        receivedAmount: null,
        percentShare: 25,
      }),
    ]
    const result = recalcInstallments({
      pricePerStudent: 1000,
      currentCount: 500, // intentionally NOT 400; override governs
      installments,
      newContractValue: 400000,
    })
    expect(result.totalCommitted).toBe(400000)
    // remainingContract = 400,000 - 125,000 = 275,000.
    // Three unpaid at 25 / 75 = 1/3 each. 275,000 / 3 = 91,666.67;
    // last unpaid absorbs the rounding tail.
    expect(result.rows[0]?.netDue).toBe(125000)
    expect(result.rows[1]?.netDue).toBe(91666.67)
    expect(result.rows[2]?.netDue).toBe(91666.67)
    expect(result.rows[3]?.netDue).toBe(91666.66)
  })
})
