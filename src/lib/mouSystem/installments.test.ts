import { describe, it, expect } from 'vitest'
import {
  buildInstallmentsFromMou,
  deriveStatus,
  overpaymentError,
  paidAmount,
  parsePaymentSchedule,
  mouIsFullyPaid,
  validateSplitAmounts,
} from './installments'
import type { MOU, Payment } from './types'

function mou(overrides: Partial<MOU> = {}): MOU {
  return {
    id: 'MOU-STEAM-2526-777',
    schoolId: 'SCH-TEST',
    schoolName: 'Test School',
    programme: 'STEAM',
    programmeSubType: null,
    schoolScope: 'SINGLE',
    schoolGroupId: null,
    cohortStatus: 'active',
    delayNotes: null,
    status: 'Active',
    academicYear: '2025-26',
    startDate: '2025-04-01',
    endDate: '2026-03-31',
    studentsMou: 100,
    studentsActual: null,
    studentsVariance: null,
    studentsVariancePct: null,
    spWithoutTax: 2700,
    spWithTax: 3186,
    contractValue: 318600,
    received: 0,
    tds: 0,
    balance: 318600,
    receivedPct: 0,
    paymentSchedule: '25-25-25-25 quarterly',
    trainerModel: null,
    notes: null,
    daysToExpiry: 100,
    salesPersonId: null,
    templateVersion: null,
    generatedAt: null,
    draftVariables: null,
    auditLog: [],
    ...overrides,
  }
}

function payment(overrides: Partial<Payment> = {}): Payment {
  return {
    id: 'X-i1',
    mouId: 'X',
    schoolName: 'X',
    programme: 'STEAM',
    instalmentLabel: '1 of 1',
    instalmentSeq: 1,
    totalInstalments: 1,
    description: 'X',
    dueDateRaw: '2026-01-01',
    dueDateIso: '2026-01-01',
    expectedAmount: 100000,
    receivedAmount: 0,
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
    auditLog: null,
    ...overrides,
  }
}

describe('parsePaymentSchedule', () => {
  it('parses canonical terms', () => {
    expect(parsePaymentSchedule('25-25-25-25 quarterly')).toEqual([25, 25, 25, 25])
    expect(parsePaymentSchedule('50-50 half-yearly')).toEqual([50, 50])
    expect(parsePaymentSchedule('100% advance')).toEqual([100])
  })
  it('parses ad-hoc splits', () => {
    expect(parsePaymentSchedule('40-30-30')).toEqual([40, 30, 30])
    expect(parsePaymentSchedule('50, 25, 25')).toEqual([50, 25, 25])
  })
  it('returns empty array for junk input', () => {
    expect(parsePaymentSchedule('')).toEqual([])
    expect(parsePaymentSchedule('as agreed')).toEqual([])
  })
})

describe('buildInstallmentsFromMou', () => {
  it('generates four quarterly instalments of equal share', () => {
    const out = buildInstallmentsFromMou(mou())
    expect(out).toHaveLength(4)
    expect(out[0]!.expectedAmount).toBe(79650)
    expect(out.reduce((s, p) => s + p.expectedAmount, 0)).toBe(318600)
    expect(out[0]!.instalmentLabel).toBe('1 of 4')
    expect(out[0]!.mouId).toBe('MOU-STEAM-2526-777')
  })
  it('generates a single instalment for 100% advance', () => {
    const out = buildInstallmentsFromMou(mou({ paymentSchedule: '100% advance' }))
    expect(out).toHaveLength(1)
    expect(out[0]!.expectedAmount).toBe(318600)
  })
})

describe('paidAmount + balance + derived status', () => {
  const today = new Date('2026-03-15T00:00:00Z')
  it('returns Received when fully paid', () => {
    const p = payment({
      expectedAmount: 100000,
      partialPayments: [
        { date: '2026-01-01', amount: 100000, mode: 'UPI', reference: null, notes: null, paymentLogId: null },
      ],
    })
    expect(paidAmount(p)).toBe(100000)
    expect(deriveStatus(p, today)).toBe('Received')
  })
  it('returns Partial when some paid', () => {
    const p = payment({
      expectedAmount: 100000,
      partialPayments: [
        { date: '2026-01-01', amount: 40000, mode: 'UPI', reference: null, notes: null, paymentLogId: null },
      ],
    })
    expect(paidAmount(p)).toBe(40000)
    expect(deriveStatus(p, today)).toBe('Partial')
  })
  it('returns Overdue when past due and unpaid', () => {
    const p = payment({ dueDateIso: '2026-01-01' })
    expect(deriveStatus(p, today)).toBe('Overdue')
  })
  it('returns Due Soon within 14 days', () => {
    const due = new Date(today.getTime() + 10 * 86400000).toISOString().slice(0, 10)
    const p = payment({ dueDateIso: due })
    expect(deriveStatus(p, today)).toBe('Due Soon')
  })
  it('returns PI Sent when piSentDate set and no payment', () => {
    const p = payment({ piSentDate: '2026-02-01' })
    expect(deriveStatus(p, today)).toBe('PI Sent')
  })
})

describe('overpaymentError', () => {
  it('rejects overpayment > 1 rupee', () => {
    const p = payment({ expectedAmount: 100000 })
    expect(overpaymentError(p, 100002)).toMatch(/exceeds/)
  })
  it('allows exact or penny-underpayment', () => {
    const p = payment({ expectedAmount: 100000 })
    expect(overpaymentError(p, 100000)).toBeNull()
    expect(overpaymentError(p, 100001)).toBeNull()
  })
})

describe('validateSplitAmounts (Phase 3a P2 fix)', () => {
  it('rejects TDS-alone (bank=0, tds>0)', () => {
    const err = validateSplitAmounts({ amount: 100000, bankAmount: 0, tdsAmount: 100000 })
    expect(err).toBe('Bank receipt is required. TDS alone is not payment received.')
  })

  it('accepts bank only (bank=full, tds=0)', () => {
    expect(validateSplitAmounts({ amount: 100000, bankAmount: 100000, tdsAmount: 0 })).toBeNull()
  })

  it('accepts bank + TDS that sum to amount', () => {
    expect(validateSplitAmounts({ amount: 100000, bankAmount: 90000, tdsAmount: 10000 })).toBeNull()
  })

  it('rejects mismatched bank + TDS sum', () => {
    const err = validateSplitAmounts({ amount: 100000, bankAmount: 50000, tdsAmount: 30000 })
    expect(err).toMatch(/does not equal split/)
  })

  it('rejects negative bank', () => {
    expect(validateSplitAmounts({ amount: 100, bankAmount: -10, tdsAmount: 110 })).toBe(
      'bankAmount cannot be negative.',
    )
  })

  it('rejects negative TDS', () => {
    expect(validateSplitAmounts({ amount: 100, bankAmount: 110, tdsAmount: -10 })).toBe(
      'tdsAmount cannot be negative.',
    )
  })

  it('rejects non-positive amount', () => {
    expect(validateSplitAmounts({ amount: 0, bankAmount: 0, tdsAmount: 0 })).toBe(
      'Split amount must be positive (got 0).',
    )
  })

  it('accepts a legacy split with no Bank/TDS columns (only amount)', () => {
    // The reconcile flow predates Phase 3 and never carries bankAmount/tdsAmount;
    // those rows must keep working.
    expect(validateSplitAmounts({ amount: 100000 })).toBeNull()
  })
})

describe('mouIsFullyPaid', () => {
  it('false when any row open', () => {
    const ps = [
      payment({ mouId: 'M', expectedAmount: 100, partialPayments: [{ date: '2026-01-01', amount: 100, mode: null, reference: null, notes: null, paymentLogId: null }] }),
      payment({ id: 'M-i2', mouId: 'M', expectedAmount: 100 }),
    ]
    expect(mouIsFullyPaid('M', ps)).toBe(false)
  })
  it('true when all paid', () => {
    const full = { date: '2026-01-01', amount: 100, mode: null, reference: null, notes: null, paymentLogId: null }
    const ps = [
      payment({ mouId: 'M', expectedAmount: 100, partialPayments: [full] }),
      payment({ id: 'M-i2', mouId: 'M', expectedAmount: 100, partialPayments: [full] }),
    ]
    expect(mouIsFullyPaid('M', ps)).toBe(true)
  })
})
