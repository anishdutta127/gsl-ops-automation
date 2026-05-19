import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  saveScheduleNoPi,
  overrideLockedSchedule,
  type ScheduleEditDeps,
} from './saveSchedule'
import type { MOU, Payment, PendingUpdate, User } from '@/lib/types'

const FIXED_TS = '2026-05-13T10:00:00.000Z'

// Strict-gate tests: force production-mode so the Finance/Sales gate
// rejects non-Finance non-Sales callers. Testing-open default opens EDIT.
const ORIGINAL_TESTING = process.env.TESTING_OPEN_ACCESS
beforeEach(() => {
  process.env.TESTING_OPEN_ACCESS = 'false'
})
afterEach(() => {
  if (ORIGINAL_TESTING === undefined) {
    delete process.env.TESTING_OPEN_ACCESS
  } else {
    process.env.TESTING_OPEN_ACCESS = ORIGINAL_TESTING
  }
})

function user(role: User['role'], id = 'u', department: User['department'] = null): User {
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

function mou(overrides: Partial<MOU> = {}): MOU {
  return {
    id: 'MOU-STEAM-2627-001',
    schoolId: 'SCH-X',
    schoolName: 'Test School',
    programme: 'STEAM',
    programmeSubType: null,
    schoolScope: 'SINGLE',
    schoolGroupId: null,
    status: 'Signed',
    cohortStatus: 'active',
    academicYear: '2026-27',
    startDate: '2026-04-01',
    endDate: '2027-03-31',
    studentsMou: 500,
    studentsActual: 500,
    studentsVariance: 0,
    studentsVariancePct: 0,
    spWithoutTax: 847,
    spWithTax: 1000,
    contractValue: 500000,
    received: 0,
    tds: 0,
    balance: 500000,
    receivedPct: 0,
    paymentSchedule: '25-25-25-25 quarterly',
    trainerModel: 'GSL-T',
    salesPersonId: null,
    templateVersion: null,
    generatedAt: null,
    notes: null,
    delayNotes: null,
    daysToExpiry: 300,
    auditLog: [],
    ...overrides,
  }
}

function pay(overrides: Partial<Payment> = {}): Payment {
  return {
    id: 'MOU-STEAM-2627-001-i1',
    mouId: 'MOU-STEAM-2627-001',
    schoolName: 'Test School',
    programme: 'STEAM',
    instalmentLabel: '1 of 4',
    instalmentSeq: 1,
    totalInstalments: 4,
    description: '',
    dueDateRaw: '2026-05-15',
    dueDateIso: '2026-05-15',
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
    partialPayments: [],
    auditLog: [],
    ...overrides,
  }
}

function makeDeps(opts: {
  mous: MOU[]
  payments: Payment[]
  users: User[]
}): { deps: ScheduleEditDeps; calls: Array<Record<string, unknown>> } {
  const calls: Array<Record<string, unknown>> = []
  const enqueue = vi.fn(async (params: Record<string, unknown>) => {
    calls.push(params)
    const stub: PendingUpdate = {
      id: 'p',
      queuedAt: FIXED_TS,
      queuedBy: String(params.queuedBy),
      entity: params.entity as PendingUpdate['entity'],
      operation: params.operation as PendingUpdate['operation'],
      payload: params.payload as Record<string, unknown>,
      retryCount: 0,
    }
    return stub
  })
  return {
    deps: {
      mous: opts.mous,
      payments: opts.payments,
      users: opts.users,
      enqueue: enqueue as unknown as ScheduleEditDeps['enqueue'],
      now: () => new Date(FIXED_TS),
    },
    calls,
  }
}

describe('saveScheduleNoPi', () => {
  it('happy path: Finance edits an unlocked schedule; pct + amount rewritten', async () => {
    const m = mou()
    const p1 = pay({ id: 'MOU-STEAM-2627-001-i1', instalmentSeq: 1 })
    const p2 = pay({
      id: 'MOU-STEAM-2627-001-i2',
      instalmentSeq: 2,
      instalmentLabel: '2 of 4',
    })
    const { deps, calls } = makeDeps({
      mous: [m],
      payments: [p1, p2],
      users: [user('Finance', 'shubhangi', 'finance')],
    })
    const res = await saveScheduleNoPi(
      {
        mouId: m.id,
        rows: [
          { paymentId: p1.id, pctDue: 50, dueDateIso: '2026-06-01', notes: null },
          { paymentId: p2.id, pctDue: 50, dueDateIso: '2026-09-01', notes: 'Q3' },
        ],
        recordedBy: 'shubhangi',
      },
      deps,
    )
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.touchedPayments).toBe(2)
      expect(res.createdPayments).toBe(0)
      expect(res.deletedPayments).toBe(0)
    }
    // 2 payment updates + 1 mou update.
    expect(calls).toHaveLength(3)
    const paymentCalls = calls.filter((c) => c.entity === 'payment')
    expect(paymentCalls).toHaveLength(2)
    const p1Update = (paymentCalls[0]!.payload as Payment)
    expect(p1Update.expectedAmount).toBe(250000)
    expect(p1Update.dueDateIso).toBe('2026-06-01')
  })

  it('refuses when any payment has piNumber (locked)', async () => {
    const m = mou()
    const p1 = pay({ piNumber: 'GSL/OPS/26-27/0001' })
    const { deps } = makeDeps({
      mous: [m],
      payments: [p1],
      users: [user('Finance', 'shubhangi', 'finance')],
    })
    const res = await saveScheduleNoPi(
      {
        mouId: m.id,
        rows: [{ paymentId: p1.id, pctDue: 100, dueDateIso: null, notes: null }],
        recordedBy: 'shubhangi',
      },
      deps,
    )
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.reason).toBe('pi-issued-requires-override')
  })

  it('refuses when pct does not sum to 100', async () => {
    const m = mou()
    const { deps } = makeDeps({
      mous: [m],
      payments: [],
      users: [user('Finance', 'shubhangi', 'finance')],
    })
    const res = await saveScheduleNoPi(
      {
        mouId: m.id,
        rows: [
          { paymentId: null, pctDue: 30, dueDateIso: null, notes: null },
          { paymentId: null, pctDue: 30, dueDateIso: null, notes: null },
        ],
        recordedBy: 'shubhangi',
      },
      deps,
    )
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.reason).toBe('pct-sum-out-of-range')
  })

  it('refuses non-Finance non-Sales submission', async () => {
    const m = mou()
    const { deps } = makeDeps({
      mous: [m],
      payments: [],
      users: [user('OpsEmployee', 'pradeep', 'ops')],
    })
    const res = await saveScheduleNoPi(
      {
        mouId: m.id,
        rows: [{ paymentId: null, pctDue: 100, dueDateIso: null, notes: null }],
        recordedBy: 'pradeep',
      },
      deps,
    )
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.reason).toBe('permission')
  })
})

describe('overrideLockedSchedule', () => {
  it('Pranav 500→400 canonical: PI-1 paid Rs 1,25,000 preserved; PI-2 re-priced; adjustment created', async () => {
    const m = mou({ contractValue: 400000 }) // post-actuals contract value after 500→400 drop
    const p1 = pay({
      id: 'M-i1',
      instalmentSeq: 1,
      piNumber: 'GSL/OPS/26-27/0001',
      receivedAmount: 125000,
      status: 'Paid',
      expectedAmount: 125000,
    })
    const p2 = pay({
      id: 'M-i2',
      instalmentSeq: 2,
      instalmentLabel: '2 of 4',
      expectedAmount: 125000,
      receivedAmount: null,
    })
    const p3 = pay({
      id: 'M-i3',
      instalmentSeq: 3,
      instalmentLabel: '3 of 4',
      expectedAmount: 125000,
    })
    const p4 = pay({
      id: 'M-i4',
      instalmentSeq: 4,
      instalmentLabel: '4 of 4',
      expectedAmount: 125000,
    })
    const { deps, calls } = makeDeps({
      mous: [m],
      payments: [p1, p2, p3, p4],
      users: [user('Finance', 'pranav', 'finance')],
    })
    const res = await overrideLockedSchedule(
      {
        mouId: m.id,
        rows: [
          { paymentId: p1.id, pctDue: 25, dueDateIso: null, notes: null },
          { paymentId: p2.id, pctDue: 25, dueDateIso: null, notes: null },
          { paymentId: p3.id, pctDue: 25, dueDateIso: null, notes: null },
          { paymentId: p4.id, pctDue: 25, dueDateIso: null, notes: null },
        ],
        recordedBy: 'pranav',
        reason: '500 students dropped to 400 after the first PI was paid.',
      },
      deps,
    )
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.adjustmentsCount).toBe(1)
    }
    const adjCall = calls.find((c) => c.entity === 'adjustment')
    expect(adjCall).toBeDefined()
    const adjPayload = adjCall!.payload as Record<string, unknown>
    expect(adjPayload.originalInstallmentId).toBe('M-i1')
    expect(adjPayload.appliedToInstallmentId).toBe('M-i2')
    expect(adjPayload.amountDelta).toBe(-25000) // 100000 new - 125000 old
    expect(adjPayload.status).toBe('Active')
  })

  it('refuses when reason is too short', async () => {
    const m = mou()
    const p1 = pay({ piNumber: 'GSL/OPS/26-27/0001' })
    const { deps } = makeDeps({
      mous: [m],
      payments: [p1],
      users: [user('Finance', 'pranav', 'finance')],
    })
    const res = await overrideLockedSchedule(
      {
        mouId: m.id,
        rows: [{ paymentId: p1.id, pctDue: 100, dueDateIso: null, notes: null }],
        recordedBy: 'pranav',
        reason: 'short',
      },
      deps,
    )
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.reason).toBe('missing-reason')
  })

  it('refuses row count change in override mode', async () => {
    const m = mou()
    const p1 = pay({ piNumber: 'GSL/OPS/26-27/0001' })
    const p2 = pay({ id: 'M-i2', instalmentSeq: 2 })
    const { deps } = makeDeps({
      mous: [m],
      payments: [p1, p2],
      users: [user('Finance', 'pranav', 'finance')],
    })
    const res = await overrideLockedSchedule(
      {
        mouId: m.id,
        rows: [{ paymentId: p1.id, pctDue: 100, dueDateIso: null, notes: null }],
        recordedBy: 'pranav',
        reason: 'wants to consolidate to one row after PI',
      },
      deps,
    )
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.reason).toBe('override-requires-existing-rows')
  })
})
