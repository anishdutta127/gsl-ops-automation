/*
 * Gate 2 Step 6 V5 + V6: reverseAdjustment lib tests.
 *
 * Pins the rules locked by STEP6_QUESTIONS Q9 (idempotency: 'already-reversed'
 * is a failure, not a silent no-op) and brief verification spec (Finance +
 * cross-functional Admin can reverse; Ops + Sales + Leadership cannot;
 * audit lands on the parent MOU, not on the Adjustment).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  reverseAdjustment,
  type ReverseAdjustmentDeps,
} from './reverseAdjustment'
import type { Adjustment, MOU, PendingUpdate, User } from '@/lib/types'

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
import type { enqueueUpdate } from '@/lib/pendingUpdates'

const FIXED_TS = '2026-05-15T10:00:00.000Z'

function user(args: {
  id: string
  role: User['role']
  department: User['department']
}): User {
  return {
    id: args.id,
    name: args.id,
    email: `${args.id}@example.test`,
    role: args.role,
    department: args.department,
    testingOverride: false,
    active: true,
    passwordHash: 'X',
    createdAt: '2026-04-01T00:00:00Z',
    auditLog: [],
  }
}

function adj(overrides: Partial<Adjustment> = {}): Adjustment {
  return {
    id: 'ADJ-TEST',
    mouId: 'MOU-FIXTURE',
    schoolId: 'SCH-FIXTURE',
    triggeredByEvent: 'actuals_update',
    triggeredAt: '2026-05-01T00:00:00Z',
    triggeredBy: 'shubhangi.g',
    originalInstallmentId: 'MOU-FIXTURE-i1',
    appliedToInstallmentId: 'MOU-FIXTURE-i2',
    amountDelta: -12500,
    reason: 'students dropped 500 to 400 after inst-1 paid',
    beforeAmount: 112500,
    afterAmount: 100000,
    status: 'Active',
    ...overrides,
  }
}

function mou(overrides: Partial<MOU> = {}): MOU {
  return {
    id: 'MOU-FIXTURE',
    schoolId: 'SCH-FIXTURE',
    schoolName: 'Fixture School',
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
    studentsActual: null,
    studentsVariance: null,
    studentsVariancePct: null,
    spWithoutTax: 1000,
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

function makeDeps(args: {
  adjustments: Adjustment[]
  mous: MOU[]
  users: User[]
}) {
  // Typed mock with full enqueueUpdate signature so mock.calls[N][0] is
  // typed as the EnqueueArgs[0] rather than `never` under strict tsc.
  // Runtime is identical; the cast is purely type-side.
  const enqueueMock = vi.fn<typeof enqueueUpdate>(
    async () => ({ id: 'pq' }) as unknown as PendingUpdate,
  )
  const deps: ReverseAdjustmentDeps = {
    adjustments: args.adjustments,
    mous: args.mous,
    users: args.users,
    enqueue: enqueueMock,
    now: () => new Date(FIXED_TS),
  }
  return { deps, enqueueMock }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('reverseAdjustment: permission gates (V6)', () => {
  it('Finance can reverse', async () => {
    const u = user({ id: 'shubhangi.g', role: 'Finance', department: 'finance' })
    const a = adj()
    const m = mou()
    const { deps } = makeDeps({ adjustments: [a], mous: [m], users: [u] })
    const result = await reverseAdjustment(
      { adjustmentId: 'ADJ-TEST', reversedBy: 'shubhangi.g', reason: null },
      deps,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.adjustment.status).toBe('Reversed')
  })

  it('cross-functional Admin (department=null) can reverse', async () => {
    const u = user({ id: 'anish.d', role: 'Admin', department: null })
    const { deps } = makeDeps({
      adjustments: [adj()],
      mous: [mou()],
      users: [u],
    })
    const result = await reverseAdjustment(
      { adjustmentId: 'ADJ-TEST', reversedBy: 'anish.d', reason: null },
      deps,
    )
    expect(result.ok).toBe(true)
  })

  it('Ops (Admin role + department=ops) cannot reverse', async () => {
    const u = user({ id: 'misba.m', role: 'Admin', department: 'ops' })
    const { deps } = makeDeps({
      adjustments: [adj()],
      mous: [mou()],
      users: [u],
    })
    const result = await reverseAdjustment(
      { adjustmentId: 'ADJ-TEST', reversedBy: 'misba.m', reason: null },
      deps,
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('permission')
  })

  it('Sales cannot reverse', async () => {
    const u = user({ id: 'pratik.d', role: 'Admin', department: 'sales' })
    const { deps } = makeDeps({
      adjustments: [adj()],
      mous: [mou()],
      users: [u],
    })
    const result = await reverseAdjustment(
      { adjustmentId: 'ADJ-TEST', reversedBy: 'pratik.d', reason: null },
      deps,
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('permission')
  })

  it('Leadership cannot reverse (read-most posture)', async () => {
    const u = user({ id: 'ameet.z', role: 'Leadership', department: null })
    const { deps } = makeDeps({
      adjustments: [adj()],
      mous: [mou()],
      users: [u],
    })
    const result = await reverseAdjustment(
      { adjustmentId: 'ADJ-TEST', reversedBy: 'ameet.z', reason: null },
      deps,
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('permission')
  })

  it('unknown user', async () => {
    const { deps } = makeDeps({ adjustments: [adj()], mous: [mou()], users: [] })
    const result = await reverseAdjustment(
      { adjustmentId: 'ADJ-TEST', reversedBy: 'nobody', reason: null },
      deps,
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('unknown-user')
  })
})

describe('reverseAdjustment: idempotency (Q9 + V5)', () => {
  it('returns ok=false reason=already-reversed on second call', async () => {
    const u = user({ id: 'shubhangi.g', role: 'Finance', department: 'finance' })
    const a = adj({ status: 'Reversed' })
    const { deps, enqueueMock } = makeDeps({
      adjustments: [a],
      mous: [mou()],
      users: [u],
    })
    const result = await reverseAdjustment(
      { adjustmentId: 'ADJ-TEST', reversedBy: 'shubhangi.g', reason: null },
      deps,
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('already-reversed')
    // No-op write: enqueue must not be called on the second attempt.
    expect(enqueueMock).not.toHaveBeenCalled()
  })

  it('adjustment-not-found surfaces as a distinct reason', async () => {
    const u = user({ id: 'shubhangi.g', role: 'Finance', department: 'finance' })
    const { deps } = makeDeps({ adjustments: [], mous: [mou()], users: [u] })
    const result = await reverseAdjustment(
      { adjustmentId: 'ADJ-MISSING', reversedBy: 'shubhangi.g', reason: null },
      deps,
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('adjustment-not-found')
  })
})

describe('reverseAdjustment: audit trail', () => {
  it('appends adjustment-reversed entry to the parent MOU auditLog (not the Adjustment)', async () => {
    const u = user({ id: 'shubhangi.g', role: 'Finance', department: 'finance' })
    const a = adj()
    const m = mou()
    const { deps, enqueueMock } = makeDeps({
      adjustments: [a],
      mous: [m],
      users: [u],
    })
    await reverseAdjustment(
      { adjustmentId: 'ADJ-TEST', reversedBy: 'shubhangi.g', reason: 'duplicate capture' },
      deps,
    )
    expect(enqueueMock).toHaveBeenCalledTimes(2)
    const writeCalls = enqueueMock.mock.calls.map((c) => c[0] as { entity: string })
    const entities = writeCalls.map((c) => c.entity)
    expect(entities).toContain('adjustment')
    expect(entities).toContain('mou')
    // MOU audit entry has the reversal action and includes the reason in notes.
    const mouCall = enqueueMock.mock.calls.find(
      (c) => (c[0] as { entity: string }).entity === 'mou',
    )
    const mouPayload = mouCall![0] as unknown as { payload: MOU }
    const updatedMou = mouPayload.payload
    const lastAudit = updatedMou.auditLog[updatedMou.auditLog.length - 1]!
    expect(lastAudit.action).toBe('adjustment-reversed')
    expect(lastAudit.notes).toContain('duplicate capture')
    expect(lastAudit.before).toMatchObject({ status: 'Active' })
    expect(lastAudit.after).toMatchObject({ status: 'Reversed' })
  })
})
