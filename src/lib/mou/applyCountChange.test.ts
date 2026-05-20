import { describe, expect, it } from 'vitest'
import type { MOU, Payment, StudentCountEvent, User } from '@/lib/types'
import {
  applyCountChange,
  getCurrentStudentCountFor,
  type ApplyCountChangeDeps,
} from './applyCountChange'

const FIXED_TS = '2026-05-19T12:00:00.000Z'

function makeUser(id: string, role: User['role'], department: User['department'] = null): User {
  return {
    id,
    name: id,
    email: `${id}@example.test`,
    role,
    department,
    testingOverride: false,
    active: true,
    passwordHash: 'X',
    createdAt: '',
    auditLog: [],
  }
}

function makeMou(overrides: Partial<MOU> = {}): MOU {
  return {
    id: 'MOU-PRANAV-001',
    schoolId: 'SCH-A',
    schoolName: 'Test',
    programme: 'STEAM',
    programmeSubType: null,
    schoolScope: 'SINGLE',
    schoolGroupId: null,
    status: 'Active',
    cohortStatus: 'active',
    academicYear: '2026-27',
    startDate: '2026-04-01',
    endDate: '2027-03-31',
    studentsMou: 500,
    studentsActual: 500,
    studentsVariance: null,
    studentsVariancePct: null,
    spWithoutTax: 0,
    spWithTax: 1000,
    contractValue: 500000,
    received: 0,
    tds: 0,
    balance: 500000,
    receivedPct: 0,
    paymentSchedule: '25-25-25-25 quarterly',
    trainerModel: null,
    salesPersonId: null,
    templateVersion: null,
    generatedAt: null,
    notes: null,
    delayNotes: null,
    daysToExpiry: null,
    auditLog: [],
    ...overrides,
  }
}

function makePayment(overrides: Partial<Payment>): Payment {
  return {
    id: 'MOU-PRANAV-001-i1',
    mouId: 'MOU-PRANAV-001',
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

function makeDeps(overrides: Partial<ApplyCountChangeDeps> = {}): ApplyCountChangeDeps {
  return {
    mous: [makeMou()],
    payments: [
      makePayment({ id: 'MOU-PRANAV-001-i1', instalmentSeq: 1 }),
      makePayment({ id: 'MOU-PRANAV-001-i2', instalmentSeq: 2 }),
      makePayment({ id: 'MOU-PRANAV-001-i3', instalmentSeq: 3 }),
      makePayment({ id: 'MOU-PRANAV-001-i4', instalmentSeq: 4 }),
    ],
    users: [makeUser('pranav.b', 'Finance', 'finance')],
    events: [],
    now: () => new Date(FIXED_TS),
    ...overrides,
  }
}

describe('getCurrentStudentCountFor', () => {
  it('returns studentsActual when no events exist', () => {
    expect(getCurrentStudentCountFor(makeMou({ studentsActual: 450 }), [])).toBe(450)
  })

  it('returns the latest event newCount when events exist', () => {
    const events: StudentCountEvent[] = [
      {
        id: 'SCE-2026-0001',
        mouId: 'MOU-PRANAV-001',
        newCount: 450,
        previousCount: 500,
        effectiveDate: '2026-05-01',
        recordedAt: '2026-05-01T10:00:00.000Z',
        recordedBy: 'pranav.b',
        reason: 'reason',
        relatedInstallmentId: null,
        notes: null,
        recalcImpact: {
          installmentsAffected: [],
          previousExpectedTotal: 0,
          newExpectedTotal: 0,
          adjustmentApplied: {
            toInstallmentId: null,
            previousNetDue: 0,
            newNetDue: 0,
            cumulativeDelta: 0,
          },
        },
        auditLog: [],
      },
      {
        id: 'SCE-2026-0002',
        mouId: 'MOU-PRANAV-001',
        newCount: 400,
        previousCount: 450,
        effectiveDate: '2026-08-01',
        recordedAt: '2026-08-01T10:00:00.000Z',
        recordedBy: 'pranav.b',
        reason: 'reason',
        relatedInstallmentId: null,
        notes: null,
        recalcImpact: {
          installmentsAffected: [],
          previousExpectedTotal: 0,
          newExpectedTotal: 0,
          adjustmentApplied: {
            toInstallmentId: null,
            previousNetDue: 0,
            newNetDue: 0,
            cumulativeDelta: 0,
          },
        },
        auditLog: [],
      },
    ]
    expect(getCurrentStudentCountFor(makeMou(), events)).toBe(400)
  })

  it('ignores events for other MOUs', () => {
    const events: StudentCountEvent[] = [
      {
        id: 'SCE-2026-0001',
        mouId: 'MOU-OTHER',
        newCount: 999,
        previousCount: 0,
        effectiveDate: '2026-05-01',
        recordedAt: '2026-05-01T10:00:00.000Z',
        recordedBy: 'pranav.b',
        reason: 'reason',
        relatedInstallmentId: null,
        notes: null,
        recalcImpact: {
          installmentsAffected: [],
          previousExpectedTotal: 0,
          newExpectedTotal: 0,
          adjustmentApplied: {
            toInstallmentId: null,
            previousNetDue: 0,
            newNetDue: 0,
            cumulativeDelta: 0,
          },
        },
        auditLog: [],
      },
    ]
    expect(getCurrentStudentCountFor(makeMou({ studentsActual: 500 }), events)).toBe(500)
  })
})

describe('applyCountChange - Pranav scenario A (500 -> 450 -> 400 with PI 1 locked)', () => {
  it('first change (500 -> 450) revises all 4 unpaid rows uniformly', () => {
    const deps = makeDeps()
    const result = applyCountChange(
      {
        mouId: 'MOU-PRANAV-001',
        newCount: 450,
        effectiveDate: '2026-05-19',
        reason: 'first intake reconciliation',
        recordedBy: 'pranav.b',
      },
      deps,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.payloads.event.newCount).toBe(450)
    expect(result.payloads.event.previousCount).toBe(500)
    expect(result.payloads.event.id).toBe('SCE-2026-0001')
    expect(result.payloads.event.recalcImpact.installmentsAffected).toHaveLength(4)
    // Every payment update has netDue = 112,500.
    for (const p of result.payloads.paymentUpdates) {
      expect(p.netDue).toBe(112500)
      expect(p.nominalAmount).toBe(112500)
      expect(p.adjustmentFromLockedInstallments).toBe(0)
      expect(p.expectedAmount).toBe(112500) // mirrors netDue
      expect(p.percentShare).toBe(25)
    }
    expect(result.payloads.mouUpdate.studentsActual).toBe(450)
    expect(result.payloads.mouUpdate.studentCountEventIds).toEqual(['SCE-2026-0001'])
  })

  it('second change (450 -> 400 after PI 1 paid at 1,12,500) lands the carry on PI 2', () => {
    // Simulate state after first change + PI 1 payment.
    const lockedI1 = makePayment({
      id: 'MOU-PRANAV-001-i1',
      instalmentSeq: 1,
      expectedAmount: 112500,
      nominalAmount: 112500,
      netDue: 112500,
      adjustmentFromLockedInstallments: 0,
      percentShare: 25,
      receivedAmount: 112500,
      status: 'Paid',
      isLocked: true,
      lockedAt: '2026-06-10T10:00:00.000Z',
    })
    const unpaid = [2, 3, 4].map((seq) =>
      makePayment({
        id: `MOU-PRANAV-001-i${seq}`,
        instalmentSeq: seq,
        expectedAmount: 112500,
        nominalAmount: 112500,
        netDue: 112500,
        adjustmentFromLockedInstallments: 0,
        percentShare: 25,
      }),
    )
    const existingEvent: StudentCountEvent = {
      id: 'SCE-2026-0001',
      mouId: 'MOU-PRANAV-001',
      newCount: 450,
      previousCount: 500,
      effectiveDate: '2026-05-19',
      recordedAt: '2026-05-19T10:00:00.000Z',
      recordedBy: 'pranav.b',
      reason: 'first intake',
      relatedInstallmentId: null,
      notes: null,
      recalcImpact: {
        installmentsAffected: ['MOU-PRANAV-001-i1', 'MOU-PRANAV-001-i2', 'MOU-PRANAV-001-i3', 'MOU-PRANAV-001-i4'],
        previousExpectedTotal: 500000,
        newExpectedTotal: 450000,
        adjustmentApplied: {
          toInstallmentId: 'MOU-PRANAV-001-i1',
          previousNetDue: 125000,
          newNetDue: 112500,
          cumulativeDelta: 0,
        },
      },
      auditLog: [],
    }
    const deps = makeDeps({
      mous: [makeMou({ studentsActual: 450, studentCountEventIds: ['SCE-2026-0001'] })],
      payments: [lockedI1, ...unpaid],
      events: [existingEvent],
    })
    const result = applyCountChange(
      {
        mouId: 'MOU-PRANAV-001',
        newCount: 400,
        effectiveDate: '2026-09-01',
        reason: 'second intake reconciliation',
        recordedBy: 'pranav.b',
      },
      deps,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.payloads.event.previousCount).toBe(450)
    expect(result.payloads.event.newCount).toBe(400)
    expect(result.payloads.event.id).toBe('SCE-2026-0002')
    // Phase 6A spread-by-weight: remainingContract = 400,000 - 112,500
    // = 287,500. Three unpaid at 25% each; each lands at
    // 287,500 × 25 / 75 = 95,833.33 (last absorbs rounding tail).
    const pi2 = result.payloads.paymentUpdates.find((p) => p.id === 'MOU-PRANAV-001-i2')
    expect(pi2).toBeTruthy()
    if (!pi2) return
    expect(pi2.nominalAmount).toBe(100000)
    expect(pi2.adjustmentFromLockedInstallments).toBe(-4166.67)
    expect(pi2.netDue).toBe(95833.33)
    expect(pi2.expectedAmount).toBe(95833.33)
    // PI 3 also carries a small per-row adjustment now.
    const pi3 = result.payloads.paymentUpdates.find((p) => p.id === 'MOU-PRANAV-001-i3')
    expect(pi3?.netDue).toBe(95833.33)
    expect(pi3?.adjustmentFromLockedInstallments).toBe(-4166.67)
    const pi4 = result.payloads.paymentUpdates.find((p) => p.id === 'MOU-PRANAV-001-i4')
    expect(pi4?.netDue).toBe(95833.34)
    // PI 1 (locked) gets an update because nominalAmount drifts even
    // though netDue stays at receivedAmount.
    const pi1 = result.payloads.paymentUpdates.find((p) => p.id === 'MOU-PRANAV-001-i1')
    expect(pi1).toBeTruthy()
    expect(pi1?.netDue).toBe(112500) // immutable
    expect(pi1?.nominalAmount).toBe(100000) // theoretical at new count
    expect(pi1?.expectedAmount).toBe(112500) // locked rows keep expectedAmount

    expect(result.payloads.event.recalcImpact.adjustmentApplied.cumulativeDelta).toBe(-12500)
    // firstUnpaidId still points at PI 2 (the operator's attention
    // anchor); under spread-by-weight the adjustment is shared across
    // all unpaid rows but PI 2 remains the conventional pointer.
    expect(result.payloads.event.recalcImpact.adjustmentApplied.toInstallmentId).toBe('MOU-PRANAV-001-i2')
  })
})

describe('applyCountChange - failure modes', () => {
  it('rejects unknown user', () => {
    const deps = makeDeps()
    const result = applyCountChange(
      {
        mouId: 'MOU-PRANAV-001',
        newCount: 400,
        effectiveDate: '2026-05-19',
        reason: 'reason',
        recordedBy: 'ghost.user',
      },
      deps,
    )
    expect(result).toEqual({ ok: false, reason: 'unknown-user' })
  })

  it('rejects Ops user in production lockdown', () => {
    const deps = makeDeps({
      users: [makeUser('misba.m', 'OpsEmployee', 'ops')],
    })
    const original = process.env.TESTING_OPEN_ACCESS
    process.env.TESTING_OPEN_ACCESS = 'false'
    try {
      const result = applyCountChange(
        {
          mouId: 'MOU-PRANAV-001',
          newCount: 400,
          effectiveDate: '2026-05-19',
          reason: 'reason',
          recordedBy: 'misba.m',
        },
        deps,
      )
      expect(result).toEqual({ ok: false, reason: 'permission' })
    } finally {
      if (original === undefined) delete process.env.TESTING_OPEN_ACCESS
      else process.env.TESTING_OPEN_ACCESS = original
    }
  })

  it('rejects no-change (newCount equals previous)', () => {
    const deps = makeDeps()
    const result = applyCountChange(
      {
        mouId: 'MOU-PRANAV-001',
        newCount: 500,
        effectiveDate: '2026-05-19',
        reason: 'reason',
        recordedBy: 'pranav.b',
      },
      deps,
    )
    expect(result).toEqual({ ok: false, reason: 'no-change' })
  })

  it('rejects invalid date', () => {
    const deps = makeDeps()
    const result = applyCountChange(
      {
        mouId: 'MOU-PRANAV-001',
        newCount: 400,
        effectiveDate: '2026/05/19',
        reason: 'reason',
        recordedBy: 'pranav.b',
      },
      deps,
    )
    expect(result).toEqual({ ok: false, reason: 'invalid-date' })
  })

  it('rejects negative or zero count', () => {
    const deps = makeDeps()
    const result = applyCountChange(
      {
        mouId: 'MOU-PRANAV-001',
        newCount: 0,
        effectiveDate: '2026-05-19',
        reason: 'reason',
        recordedBy: 'pranav.b',
      },
      deps,
    )
    expect(result).toEqual({ ok: false, reason: 'invalid-count' })
  })

  it('rejects empty reason', () => {
    const deps = makeDeps()
    const result = applyCountChange(
      {
        mouId: 'MOU-PRANAV-001',
        newCount: 400,
        effectiveDate: '2026-05-19',
        reason: '   ',
        recordedBy: 'pranav.b',
      },
      deps,
    )
    expect(result).toEqual({ ok: false, reason: 'invalid-reason' })
  })

  it('rejects unknown MOU', () => {
    const deps = makeDeps()
    const result = applyCountChange(
      {
        mouId: 'MOU-GHOST',
        newCount: 400,
        effectiveDate: '2026-05-19',
        reason: 'reason',
        recordedBy: 'pranav.b',
      },
      deps,
    )
    expect(result).toEqual({ ok: false, reason: 'mou-not-found' })
  })
})

describe('applyCountChange - MOU with no instalments', () => {
  it('records the event without recalc impact', () => {
    const deps = makeDeps({ payments: [] })
    const result = applyCountChange(
      {
        mouId: 'MOU-PRANAV-001',
        newCount: 600,
        effectiveDate: '2026-05-19',
        reason: 'recce update',
        recordedBy: 'pranav.b',
      },
      deps,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.payloads.paymentUpdates).toHaveLength(0)
    expect(result.payloads.event.recalcImpact.installmentsAffected).toHaveLength(0)
    expect(result.payloads.mouUpdate.studentsActual).toBe(600)
  })
})
