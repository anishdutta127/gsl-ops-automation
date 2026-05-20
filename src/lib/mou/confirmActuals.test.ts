import { describe, expect, it, vi } from 'vitest'
import {
  confirmActuals,
  isDriftReviewRequired,
  type ConfirmActualsDeps,
} from './confirmActuals'
import type { MOU, Payment, PendingUpdate, StudentCountEvent, User } from '@/lib/types'

const FIXED_TS = '2026-04-26T10:00:00.000Z'

function mou(overrides: Partial<MOU> = {}): MOU {
  return {
    id: 'MOU-X', schoolId: 'SCH-X', schoolName: 'X', programme: 'STEAM',
    programmeSubType: null, schoolScope: 'SINGLE', schoolGroupId: null,
    status: 'Active', cohortStatus: 'active', academicYear: '2026-27',
    startDate: '2026-04-01', endDate: '2027-03-31',
    studentsMou: 200, studentsActual: null, studentsVariance: null,
    studentsVariancePct: null, spWithoutTax: 4000, spWithTax: 5000,
    contractValue: 1000000, received: 0, tds: 0, balance: 1000000,
    receivedPct: 0, paymentSchedule: '', trainerModel: 'GSL-T',
    salesPersonId: 'sp-vikram', templateVersion: null, generatedAt: null,
    notes: null, daysToExpiry: null, delayNotes: null, auditLog: [],
    ...overrides,
  }
}

function user(role: User['role'], id = 'u'): User {
  return {
    id, name: id, email: `${id}@example.test`, role,
    testingOverride: false, active: true, passwordHash: 'X',
    createdAt: '', auditLog: [],
  }
}

function makeDeps(opts: {
  mous: MOU[]
  users: User[]
  payments?: Payment[]
  events?: StudentCountEvent[]
}): { deps: ConfirmActualsDeps; calls: Array<Record<string, unknown>> } {
  const calls: Array<Record<string, unknown>> = []
  const enqueue = vi.fn(async (params: Record<string, unknown>) => {
    calls.push(params)
    const stub: PendingUpdate = {
      id: 'p', queuedAt: FIXED_TS, queuedBy: String(params.queuedBy),
      entity: params.entity as PendingUpdate['entity'],
      operation: params.operation as PendingUpdate['operation'],
      payload: params.payload as Record<string, unknown>, retryCount: 0,
    }
    return stub
  })
  return {
    deps: {
      mous: opts.mous, users: opts.users,
      payments: opts.payments ?? [],
      events: opts.events ?? [],
      enqueue: enqueue as unknown as ConfirmActualsDeps['enqueue'],
      now: () => new Date(FIXED_TS),
    },
    calls,
  }
}

function pay(overrides: Partial<Payment>): Payment {
  return {
    id: 'MOU-X-i1', mouId: 'MOU-X', schoolName: 'X', programme: 'STEAM',
    instalmentLabel: '1 of 4', instalmentSeq: 1, totalInstalments: 4,
    description: '', dueDateRaw: null, dueDateIso: null,
    expectedAmount: 125000, receivedAmount: null, receivedDate: null,
    paymentMode: null, bankReference: null, piNumber: null,
    taxInvoiceNumber: null, status: 'Pending', notes: null,
    piSentDate: null, piSentTo: null, piGeneratedAt: null,
    studentCountActual: null, partialPayments: null, auditLog: [],
    ...overrides,
  }
}

describe('isDriftReviewRequired (10% strict-greater boundary)', () => {
  it('returns false at exactly 10% variance', () => {
    expect(isDriftReviewRequired(0.10)).toBe(false)
    expect(isDriftReviewRequired(-0.10)).toBe(false)
  })

  it('returns true just over 10%', () => {
    expect(isDriftReviewRequired(0.1001)).toBe(true)
    expect(isDriftReviewRequired(-0.15)).toBe(true)
  })

  it('returns false under 10%', () => {
    expect(isDriftReviewRequired(0)).toBe(false)
    expect(isDriftReviewRequired(0.05)).toBe(false)
    expect(isDriftReviewRequired(-0.0999)).toBe(false)
  })
})

describe('confirmActuals', () => {
  it('happy path: writes updated MOU with auditLog entry, no drift', async () => {
    const m = mou({ studentsMou: 200 })
    const u = user('SalesHead', 'pratik.d')
    const { deps, calls } = makeDeps({ mous: [m], users: [u] })
    const result = await confirmActuals(
      { mouId: 'MOU-X', studentsActual: 200, confirmedBy: 'pratik.d' },
      deps,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.mou.studentsActual).toBe(200)
    expect(result.mou.studentsVariance).toBe(0)
    expect(result.mou.studentsVariancePct).toBe(0)
    expect(result.needsDriftReview).toBe(false)
    expect(result.mou.auditLog).toHaveLength(1)
    expect(result.mou.auditLog[0]?.action).toBe('actuals-confirmed')
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({ entity: 'mou', operation: 'update' })
  })

  it('SalesRep can submit on own assignment', async () => {
    const m = mou({ salesPersonId: 'sp-vikram', studentsMou: 200 })
    const u = user('SalesRep', 'sp-vikram')
    const { deps } = makeDeps({ mous: [m], users: [u] })
    const result = await confirmActuals(
      { mouId: 'MOU-X', studentsActual: 210, confirmedBy: 'sp-vikram' },
      deps,
    )
    expect(result.ok).toBe(true)
  })

  it('OpsHead is REJECTED (not in mou:confirm-actuals grant)', async () => {
    const m = mou()
    const u = user('OpsHead', 'pradeep.r')
    const { deps, calls } = makeDeps({ mous: [m], users: [u] })
    const result = await confirmActuals(
      { mouId: 'MOU-X', studentsActual: 200, confirmedBy: 'pradeep.r' },
      deps,
    )
    expect(result).toEqual({ ok: false, reason: 'permission' })
    expect(calls).toHaveLength(0)
  })

  it('Finance is REJECTED (mou:confirm-actuals not granted)', async () => {
    const m = mou()
    const u = user('Finance', 'shubhangi.g')
    const { deps } = makeDeps({ mous: [m], users: [u] })
    const result = await confirmActuals(
      { mouId: 'MOU-X', studentsActual: 200, confirmedBy: 'shubhangi.g' },
      deps,
    )
    expect(result).toEqual({ ok: false, reason: 'permission' })
  })

  it('Admin can submit (wildcard)', async () => {
    const m = mou()
    const u = user('Admin', 'anish.d')
    const { deps } = makeDeps({ mous: [m], users: [u] })
    const result = await confirmActuals(
      { mouId: 'MOU-X', studentsActual: 200, confirmedBy: 'anish.d' },
      deps,
    )
    expect(result.ok).toBe(true)
  })

  it('rejects unknown MOU id', async () => {
    const u = user('Admin', 'anish.d')
    const { deps } = makeDeps({ mous: [], users: [u] })
    const result = await confirmActuals(
      { mouId: 'NOPE', studentsActual: 200, confirmedBy: 'anish.d' },
      deps,
    )
    expect(result).toEqual({ ok: false, reason: 'mou-not-found' })
  })

  it('rejects unknown user', async () => {
    const m = mou()
    const { deps } = makeDeps({ mous: [m], users: [] })
    const result = await confirmActuals(
      { mouId: 'MOU-X', studentsActual: 200, confirmedBy: 'ghost' },
      deps,
    )
    expect(result).toEqual({ ok: false, reason: 'unknown-user' })
  })

  it('rejects wrong status (MOU not Active)', async () => {
    const m = mou({ status: 'Completed' })
    const u = user('Admin', 'anish.d')
    const { deps } = makeDeps({ mous: [m], users: [u] })
    const result = await confirmActuals(
      { mouId: 'MOU-X', studentsActual: 200, confirmedBy: 'anish.d' },
      deps,
    )
    expect(result).toEqual({ ok: false, reason: 'wrong-status' })
  })

  it('rejects studentsActual <= 0', async () => {
    const u = user('Admin', 'anish.d')
    const { deps } = makeDeps({ mous: [mou()], users: [u] })
    expect(
      (await confirmActuals({ mouId: 'MOU-X', studentsActual: 0, confirmedBy: 'anish.d' }, deps)).ok,
    ).toBe(false)
    expect(
      (await confirmActuals({ mouId: 'MOU-X', studentsActual: -5, confirmedBy: 'anish.d' }, deps)).ok,
    ).toBe(false)
  })

  it('rejects studentsActual > 20000', async () => {
    const u = user('Admin', 'anish.d')
    const { deps } = makeDeps({ mous: [mou()], users: [u] })
    const result = await confirmActuals(
      { mouId: 'MOU-X', studentsActual: 25000, confirmedBy: 'anish.d' },
      deps,
    )
    expect(result).toEqual({ ok: false, reason: 'invalid-students' })
  })

  it('flags needsDriftReview when variance > 10% strict', async () => {
    const m = mou({ studentsMou: 100 })
    const u = user('Admin', 'anish.d')
    const { deps } = makeDeps({ mous: [m], users: [u] })
    // 121 vs 100 = 21% over → needs review
    const result = await confirmActuals(
      { mouId: 'MOU-X', studentsActual: 121, confirmedBy: 'anish.d' },
      deps,
    )
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.needsDriftReview).toBe(true)
  })

  it('does NOT flag at exactly 10% (boundary strict)', async () => {
    const m = mou({ studentsMou: 100 })
    const u = user('Admin', 'anish.d')
    const { deps } = makeDeps({ mous: [m], users: [u] })
    const result = await confirmActuals(
      { mouId: 'MOU-X', studentsActual: 110, confirmedBy: 'anish.d' },
      deps,
    )
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.variancePct).toBe(0.10)
      expect(result.needsDriftReview).toBe(false)
    }
  })

  it('captures both before AND after on the auditLog entry', async () => {
    const m = mou({ studentsActual: 195, studentsVariance: -5, studentsVariancePct: -0.025, studentsMou: 200 })
    const u = user('Admin', 'anish.d')
    const { deps } = makeDeps({ mous: [m], users: [u] })
    const result = await confirmActuals(
      { mouId: 'MOU-X', studentsActual: 198, confirmedBy: 'anish.d', notes: 'Re-check after register update' },
      deps,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const entry = result.mou.auditLog.at(-1)!
    expect(entry.before).toMatchObject({ studentsActual: 195, studentsVariance: -5 })
    expect(entry.after).toMatchObject({ studentsActual: 198 })
    expect(entry.notes).toBe('Re-check after register update')
  })
})

describe('confirmActuals - recalc cascade (Phase 6A)', () => {
  // Pranav production reproduction (Mutahhary Public School Baroo).
  // 10/30/30/30 against Rs 4,00,000 contract at 500 × Rs 800; i1
  // paid Rs 40,000 (locked).
  function mutahharyMou(): MOU {
    return mou({
      id: 'MOU-S', schoolId: 'SCH-S', schoolName: 'Mutahhary',
      studentsMou: 500, studentsActual: 500,
      studentsVariance: 0, studentsVariancePct: 0,
      spWithoutTax: 678, spWithTax: 800, contractValue: 400000,
      paymentSchedule: '10-30-30-30',
    })
  }
  function mutahharyPayments(): Payment[] {
    return [
      pay({ id: 'MOU-S-i1', mouId: 'MOU-S', instalmentSeq: 1, instalmentLabel: '1 of 4', expectedAmount: 40000, receivedAmount: 40000, status: 'Paid' }),
      pay({ id: 'MOU-S-i2', mouId: 'MOU-S', instalmentSeq: 2, instalmentLabel: '2 of 4', expectedAmount: 120000 }),
      pay({ id: 'MOU-S-i3', mouId: 'MOU-S', instalmentSeq: 3, instalmentLabel: '3 of 4', expectedAmount: 120000 }),
      pay({ id: 'MOU-S-i4', mouId: 'MOU-S', instalmentSeq: 4, instalmentLabel: '4 of 4', expectedAmount: 120000 }),
    ]
  }

  it('cascades through applyCountChange when count changes and payments exist', async () => {
    const m = mutahharyMou()
    const u = user('Admin', 'pranav.b')
    const { deps, calls } = makeDeps({
      mous: [m], users: [u], payments: mutahharyPayments(),
    })
    const result = await confirmActuals(
      { mouId: 'MOU-S', studentsActual: 450, confirmedBy: 'pranav.b' },
      deps,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.recalcCascadeApplied).toBe(true)

    // Calls order: studentCountEvent create → 4 payment updates →
    // mou update (single combined record).
    const sceCalls = calls.filter((c) => c.entity === 'studentCountEvent')
    const paymentCalls = calls.filter((c) => c.entity === 'payment')
    const mouCalls = calls.filter((c) => c.entity === 'mou')
    expect(sceCalls).toHaveLength(1)
    expect(paymentCalls).toHaveLength(4)
    expect(mouCalls).toHaveLength(1)

    // Payment i2 / i3 / i4 land at Rs 1,06,666.67 each (spread).
    const i2 = paymentCalls.find((c) => (c.payload as Payment).id === 'MOU-S-i2')
      ?.payload as Payment | undefined
    const i3 = paymentCalls.find((c) => (c.payload as Payment).id === 'MOU-S-i3')
      ?.payload as Payment | undefined
    const i4 = paymentCalls.find((c) => (c.payload as Payment).id === 'MOU-S-i4')
      ?.payload as Payment | undefined
    expect(i2?.netDue).toBe(106666.67)
    expect(i3?.netDue).toBe(106666.67)
    expect(i4?.netDue).toBe(106666.66)
    expect(i2?.expectedAmount).toBe(106666.67)

    // The single MOU update stacks both audit entries and carries the
    // appended studentCountEventIds.
    const mouPayload = mouCalls[0]?.payload as MOU
    expect(mouPayload.studentsActual).toBe(450)
    expect(mouPayload.studentCountEventIds?.length).toBe(1)
    const actions = mouPayload.auditLog.map((e) => e.action)
    expect(actions).toContain('actuals-confirmed')
    expect(actions).toContain('student-count-changed')
  })

  it('does NOT cascade when count is unchanged', async () => {
    const m = mutahharyMou()
    const u = user('Admin', 'pranav.b')
    const { deps, calls } = makeDeps({
      mous: [m], users: [u], payments: mutahharyPayments(),
    })
    const result = await confirmActuals(
      { mouId: 'MOU-S', studentsActual: 500, confirmedBy: 'pranav.b' },
      deps,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.recalcCascadeApplied).toBe(false)
    expect(calls.filter((c) => c.entity === 'studentCountEvent')).toHaveLength(0)
    expect(calls.filter((c) => c.entity === 'payment')).toHaveLength(0)
    expect(calls.filter((c) => c.entity === 'mou')).toHaveLength(1)
  })

  it('does NOT cascade when MOU has no Payment rows', async () => {
    const m = mutahharyMou()
    const u = user('Admin', 'pranav.b')
    const { deps, calls } = makeDeps({ mous: [m], users: [u], payments: [] })
    const result = await confirmActuals(
      { mouId: 'MOU-S', studentsActual: 450, confirmedBy: 'pranav.b' },
      deps,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.recalcCascadeApplied).toBe(false)
    expect(calls.filter((c) => c.entity === 'studentCountEvent')).toHaveLength(0)
    expect(calls.filter((c) => c.entity === 'mou')).toHaveLength(1)
  })
})
