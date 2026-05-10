import { describe, it, expect } from 'vitest'
import { computeRecalcWithAdjustments, recalculatePaymentSchedule } from './recalc'

describe('recalculatePaymentSchedule', () => {
  // Pranav's example, verbatim.
  it('500 students, 4 × 25% : at MOU sign every PI is Rs 1,25,000', () => {
    const r = recalculatePaymentSchedule({
      perStudentPrice: 1000,
      currentStudents: 500,
      pcts: [25, 25, 25, 25],
      paymentsByInstalment: [0, 0, 0, 0],
    })
    expect(r.instalments[0]!.newExpected).toBe(125000)
    expect(r.instalments[1]!.newExpected).toBe(125000)
    expect(r.instalments[2]!.newExpected).toBe(125000)
    expect(r.instalments[3]!.newExpected).toBe(125000)
    expect(r.totalDue).toBe(500000)
    expect(r.totalPaid).toBe(0)
  })

  it('count drops to 450 : all 4 instalments become Rs 1,12,500', () => {
    const r = recalculatePaymentSchedule({
      perStudentPrice: 1000,
      currentStudents: 450,
      pcts: [25, 25, 25, 25],
      paymentsByInstalment: [0, 0, 0, 0],
    })
    expect(r.instalments[0]!.newExpected).toBe(112500)
    expect(r.instalments[1]!.newExpected).toBe(112500)
    expect(r.instalments[2]!.newExpected).toBe(112500)
    expect(r.instalments[3]!.newExpected).toBe(112500)
    expect(r.totalDue).toBe(450000)
  })

  it('Inst 1 paid Rs 1,12,500; count drops to 400 : Inst 2 net due is Rs 87,500', () => {
    const r = recalculatePaymentSchedule({
      perStudentPrice: 1000,
      currentStudents: 400,
      pcts: [25, 25, 25, 25],
      paymentsByInstalment: [112500, 0, 0, 0],
    })
    expect(r.instalments[0]!.newExpected).toBe(100000)
    expect(r.instalments[0]!.paidApplied).toBe(100000)
    expect(r.instalments[0]!.balance).toBe(0)
    expect(r.instalments[0]!.status).toBe('Paid')

    expect(r.instalments[1]!.newExpected).toBe(100000)
    expect(r.instalments[1]!.paidApplied).toBe(12500)
    expect(r.instalments[1]!.balance).toBe(87500)
    expect(r.instalments[1]!.status).toBe('Partial')

    expect(r.instalments[2]!.newExpected).toBe(100000)
    expect(r.instalments[2]!.balance).toBe(100000)
    expect(r.instalments[2]!.status).toBe('Pending')

    expect(r.instalments[3]!.newExpected).toBe(100000)
    expect(r.instalments[3]!.balance).toBe(100000)
    expect(r.totalDue).toBe(400000)
    expect(r.totalPaid).toBe(112500)
  })

  it('count rises 450 → 500 : Inst 1 paid Rs 1,12,500 leaves a Rs 12,500 balance', () => {
    const r = recalculatePaymentSchedule({
      perStudentPrice: 1000,
      currentStudents: 500,
      pcts: [25, 25, 25, 25],
      paymentsByInstalment: [112500, 0, 0, 0],
    })
    expect(r.instalments[0]!.newExpected).toBe(125000)
    expect(r.instalments[0]!.paidApplied).toBe(112500)
    expect(r.instalments[0]!.balance).toBe(12500)
    expect(r.instalments[0]!.status).toBe('Partial')
    expect(r.instalments[1]!.balance).toBe(125000)
    expect(r.totalDue).toBe(500000)
  })

  it('over-payment beyond entire schedule shows up as surplus credit', () => {
    const r = recalculatePaymentSchedule({
      perStudentPrice: 1000,
      currentStudents: 100,
      pcts: [50, 50],
      paymentsByInstalment: [60000, 50000], // 1,10,000 paid against 1,00,000 schedule
    })
    expect(r.instalments[0]!.balance).toBe(0)
    expect(r.instalments[1]!.balance).toBe(0)
    expect(r.surplusCredit).toBe(10000)
  })

  it('handles all-paid happy path with no carry', () => {
    const r = recalculatePaymentSchedule({
      perStudentPrice: 1000,
      currentStudents: 100,
      pcts: [25, 25, 25, 25],
      paymentsByInstalment: [25000, 25000, 25000, 25000],
    })
    for (const ins of r.instalments) {
      expect(ins.balance).toBe(0)
      expect(ins.status).toBe('Paid')
    }
  })

  it('handles uneven percentages (50-25-25)', () => {
    const r = recalculatePaymentSchedule({
      perStudentPrice: 2000,
      currentStudents: 200,
      pcts: [50, 25, 25],
      paymentsByInstalment: [0, 0, 0],
    })
    // Total = 2000 * 200 = 400000. 50% = 200000, 25% = 100000.
    expect(r.instalments[0]!.newExpected).toBe(200000)
    expect(r.instalments[1]!.newExpected).toBe(100000)
    expect(r.instalments[2]!.newExpected).toBe(100000)
    expect(r.totalDue).toBe(400000)
  })
})

describe('computeRecalcWithAdjustments : adjustment-as-line-item', () => {
  // Pranav's exact 500/450/400 example.

  it('500 → 450 BEFORE any payment rewrites every PI in place', () => {
    const result = computeRecalcWithAdjustments({
      perStudentPrice: 1000,
      newStudents: 450,
      installments: [
        { id: 'i1', seq: 1, pctDue: 25, expectedAmount: 125000, paidAmount: 0, piSentDate: null },
        { id: 'i2', seq: 2, pctDue: 25, expectedAmount: 125000, paidAmount: 0, piSentDate: null },
        { id: 'i3', seq: 3, pctDue: 25, expectedAmount: 125000, paidAmount: 0, piSentDate: null },
        { id: 'i4', seq: 4, pctDue: 25, expectedAmount: 125000, paidAmount: 0, piSentDate: null },
      ],
      reason: 'Round 2 test: drop 500→450 pre-payment',
    })
    expect(result.adjustments).toHaveLength(0)
    expect(result.updates.map((u) => u.newExpectedAmount)).toEqual([
      112500, 112500, 112500, 112500,
    ])
  })

  it('450 → 400 AFTER Inst 1 paid preserves Inst 1 and creates a Rs 12,500 credit on Inst 2', () => {
    const result = computeRecalcWithAdjustments({
      perStudentPrice: 1000,
      newStudents: 400,
      installments: [
        { id: 'i1', seq: 1, pctDue: 25, expectedAmount: 112500, paidAmount: 112500, piSentDate: '2026-04-01' },
        { id: 'i2', seq: 2, pctDue: 25, expectedAmount: 112500, paidAmount: 0, piSentDate: null },
        { id: 'i3', seq: 3, pctDue: 25, expectedAmount: 112500, paidAmount: 0, piSentDate: null },
        { id: 'i4', seq: 4, pctDue: 25, expectedAmount: 112500, paidAmount: 0, piSentDate: null },
      ],
      reason: 'Round 2 test: drop 450→400 after Inst 1 paid',
    })
    // Three unlocked installments rewrite to Rs 1,00,000.
    expect(result.updates.map((u) => [u.installmentId, u.newExpectedAmount])).toEqual([
      ['i2', 100000],
      ['i3', 100000],
      ['i4', 100000],
    ])
    // One adjustment for Inst 1 : credit applied to Inst 2.
    expect(result.adjustments).toHaveLength(1)
    expect(result.adjustments[0]).toMatchObject({
      originalInstallmentId: 'i1',
      appliedToInstallmentId: 'i2',
      amountDelta: -12500,
      beforeAmount: 112500,
      afterAmount: 100000,
    })
  })

  it('paid installment with PI sent gates the rewrite (PI sent = locked even if not paid)', () => {
    const result = computeRecalcWithAdjustments({
      perStudentPrice: 1000,
      newStudents: 400,
      installments: [
        { id: 'i1', seq: 1, pctDue: 25, expectedAmount: 112500, paidAmount: 0, piSentDate: '2026-04-01' },
        { id: 'i2', seq: 2, pctDue: 25, expectedAmount: 112500, paidAmount: 0, piSentDate: null },
      ],
      reason: 'PI-sent lock test',
    })
    expect(result.updates.find((u) => u.installmentId === 'i1')).toBeUndefined()
    expect(result.adjustments[0]).toMatchObject({
      originalInstallmentId: 'i1',
      appliedToInstallmentId: 'i2',
    })
  })

  it('floats the adjustment when no future unlocked installment exists', () => {
    const result = computeRecalcWithAdjustments({
      perStudentPrice: 1000,
      newStudents: 400,
      installments: [
        { id: 'i1', seq: 1, pctDue: 50, expectedAmount: 56250, paidAmount: 56250, piSentDate: '2026-04-01' },
        { id: 'i2', seq: 2, pctDue: 50, expectedAmount: 56250, paidAmount: 56250, piSentDate: '2026-07-01' },
      ],
      reason: 'No unlocked future installment',
    })
    expect(result.updates).toHaveLength(0)
    expect(result.adjustments).toHaveLength(2)
    for (const adj of result.adjustments) {
      expect(adj.appliedToInstallmentId).toBeNull()
    }
  })

  it('no-op when actuals match committed (every newExpected equals existing)', () => {
    const result = computeRecalcWithAdjustments({
      perStudentPrice: 1000,
      newStudents: 500,
      installments: [
        { id: 'i1', seq: 1, pctDue: 25, expectedAmount: 125000, paidAmount: 0, piSentDate: null },
        { id: 'i2', seq: 2, pctDue: 25, expectedAmount: 125000, paidAmount: 0, piSentDate: null },
      ],
      reason: 'no change',
    })
    expect(result.updates).toHaveLength(0)
    expect(result.adjustments).toHaveLength(0)
  })
})
