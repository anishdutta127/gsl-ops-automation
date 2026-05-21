import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createAdjustment,
  type CreateAdjustmentDeps,
} from './createAdjustment'
import type { MOU, Payment, PendingUpdate, User } from '@/lib/types'

const FIXED_TS = '2026-05-13T10:00:00.000Z'

// Strict-gate tests: force production-mode so canEditFinanceData
// rejects non-Finance callers. Testing-open default opens EDIT.
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
    id: 'MOU-X',
    schoolId: 'SCH-X',
    schoolName: 'Test School',
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
    studentsVariance: 0,
    studentsVariancePct: 0,
    spWithoutTax: 847,
    spWithTax: 1000,
    contractValue: 500000,
    received: 0,
    tds: 0,
    balance: 500000,
    receivedPct: 0,
    paymentSchedule: '25-25-25-25',
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
    id: 'MOU-X-i1',
    mouId: 'MOU-X',
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
}): { deps: CreateAdjustmentDeps; calls: Array<Record<string, unknown>> } {
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
      enqueue: enqueue as unknown as CreateAdjustmentDeps['enqueue'],
      now: () => new Date(FIXED_TS),
    },
    calls,
  }
}

describe('createAdjustment', () => {
  it('happy path: Finance creates a credit adjustment against an unlocked instalment', async () => {
    const m = mou()
    const p1 = pay()
    const { deps, calls } = makeDeps({
      mous: [m],
      payments: [p1],
      users: [user('Finance', 'pranav', 'finance')],
    })
    const res = await createAdjustment(
      {
        mouId: m.id,
        installmentId: p1.id,
        triggeredByEvent: 'manual',
        amountDelta: -10000,
        reason: 'School requested goodwill discount for delayed start.',
        effectiveDate: '2026-05-13',
        notes: null,
        recordedBy: 'pranav',
      },
      deps,
    )
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.adjustment.amountDelta).toBe(-10000)
      expect(res.adjustment.beforeAmount).toBe(125000)
      expect(res.adjustment.afterAmount).toBe(115000)
      expect(res.adjustment.appliedToInstallmentId).toBe(p1.id)
    }
    expect(calls).toHaveLength(2) // 1 adjustment create + 1 mou audit
    expect(calls[0]!.entity).toBe('adjustment')
    expect(calls[1]!.entity).toBe('mou')
  })

  it('attaches to next-unlocked instalment when source is locked (paid + PI sent)', async () => {
    const m = mou()
    const p1 = pay({ piNumber: 'GSL/OPS/26-27/0001', status: 'Paid', receivedAmount: 125000 })
    const p2 = pay({ id: 'MOU-X-i2', instalmentSeq: 2 })
    const { deps } = makeDeps({
      mous: [m],
      payments: [p1, p2],
      users: [user('Finance', 'pranav', 'finance')],
    })
    const res = await createAdjustment(
      {
        mouId: m.id,
        installmentId: p1.id,
        triggeredByEvent: 'actuals_update',
        amountDelta: -25000,
        reason: 'Student count dropped 500→400 after PI-1 paid.',
        effectiveDate: null,
        notes: null,
        recordedBy: 'pranav',
      },
      deps,
    )
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.adjustment.originalInstallmentId).toBe(p1.id)
      expect(res.adjustment.appliedToInstallmentId).toBe(p2.id)
    }
  })

  it('refuses non-Finance user', async () => {
    const m = mou()
    const p1 = pay()
    const { deps } = makeDeps({
      mous: [m],
      payments: [p1],
      users: [user('OpsEmployee', 'pradeep', 'ops')],
    })
    const res = await createAdjustment(
      {
        mouId: m.id,
        installmentId: p1.id,
        triggeredByEvent: 'manual',
        amountDelta: 1000,
        reason: 'attempted by ops user',
        effectiveDate: null,
        notes: null,
        recordedBy: 'pradeep',
      },
      deps,
    )
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.reason).toBe('permission')
  })

  it('refuses zero amount and short reason', async () => {
    const m = mou()
    const p1 = pay()
    const { deps } = makeDeps({
      mous: [m],
      payments: [p1],
      users: [user('Finance', 'pranav', 'finance')],
    })
    const zero = await createAdjustment(
      {
        mouId: m.id,
        installmentId: p1.id,
        triggeredByEvent: 'manual',
        amountDelta: 0,
        reason: 'a long enough reason here',
        effectiveDate: null,
        notes: null,
        recordedBy: 'pranav',
      },
      deps,
    )
    expect(zero.ok).toBe(false)
    if (!zero.ok) expect(zero.reason).toBe('invalid-amount')

    const short = await createAdjustment(
      {
        mouId: m.id,
        installmentId: p1.id,
        triggeredByEvent: 'manual',
        amountDelta: 5000,
        reason: 'short',
        effectiveDate: null,
        notes: null,
        recordedBy: 'pranav',
      },
      deps,
    )
    expect(short.ok).toBe(false)
    if (!short.ok) expect(short.reason).toBe('missing-reason')
  })
})
