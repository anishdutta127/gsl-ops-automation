import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  AuditEntry,
  MOU,
  PendingUpdate,
  PendingUpdateEntity,
  SalesPerson,
  School,
  User,
} from '@/lib/types'
import { reassignSalesRep, type ReassignDeps } from './reassignSalesRep'

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
    createdAt: '2026-01-01',
    auditLog: [],
  }
}

function makeRep(id: string, active = true): SalesPerson {
  return {
    id,
    name: id,
    email: `${id}@example.test`,
    phone: null,
    territories: [],
    programmes: [],
    active,
    joinedDate: '2026-01-01',
  }
}

function makeSchool(auditLog: AuditEntry[] = []): School {
  return {
    id: 'SCH-A',
    name: 'A',
    legalEntity: null,
    city: 'X',
    state: 'Y',
    region: 'East',
    pinCode: null,
    contactPerson: null,
    email: null,
    phone: null,
    billingName: null,
    pan: null,
    gstNumber: null,
    notes: null,
    active: true,
    createdAt: '2026-01-01',
    auditLog,
  }
}

function makeMou(id: string, salesPersonId: string | null): MOU {
  return {
    id,
    schoolId: 'SCH-A',
    schoolName: 'A',
    programme: 'STEAM',
    programmeSubType: null,
    schoolScope: 'SINGLE',
    schoolGroupId: null,
    status: 'Active',
    cohortStatus: 'active',
    academicYear: '2026-27',
    startDate: '2026-04-01',
    endDate: '2027-03-31',
    studentsMou: 100,
    studentsActual: null,
    studentsVariance: null,
    studentsVariancePct: null,
    spWithoutTax: 0,
    spWithTax: 0,
    contractValue: 100000,
    received: 0,
    tds: 0,
    balance: 100000,
    receivedPct: 0,
    paymentSchedule: '',
    trainerModel: null,
    salesPersonId,
    templateVersion: null,
    generatedAt: '2026-03-01T00:00:00.000Z',
    notes: null,
    delayNotes: null,
    daysToExpiry: null,
    auditLog: [],
  }
}

const enqueueCalls: Array<{ entity: PendingUpdateEntity; payloadId: string }> = []
async function recordingEnqueue(params: {
  queuedBy: string
  entity: PendingUpdateEntity
  operation: 'create' | 'update' | 'delete'
  payload: Record<string, unknown>
}): Promise<PendingUpdate> {
  enqueueCalls.push({
    entity: params.entity,
    payloadId: String(params.payload.id ?? ''),
  })
  return {
    id: `pu-${enqueueCalls.length}`,
    entity: params.entity,
    operation: params.operation,
    payload: params.payload,
    queuedBy: params.queuedBy,
    queuedAt: '2026-05-19T12:00:00.000Z',
  } as PendingUpdate
}

const NOW = new Date('2026-05-19T12:00:00.000Z')

function makeDeps(overrides: Partial<ReassignDeps> = {}): ReassignDeps {
  return {
    schools: [makeSchool()],
    mous: [makeMou('MOU-1', 'sp-old')],
    users: [makeUser('anish.d', 'Admin', null)],
    salesTeam: [makeRep('sp-old'), makeRep('sp-new')],
    enqueue: recordingEnqueue,
    now: () => NOW,
    ...overrides,
  }
}

beforeEach(() => {
  enqueueCalls.length = 0
})
afterEach(() => vi.restoreAllMocks())

describe('reassignSalesRep', () => {
  it('future-only writes school audit only; leaves MOUs unchanged', async () => {
    const deps = makeDeps()
    const result = await reassignSalesRep(
      {
        schoolId: 'SCH-A',
        newSalesPersonId: 'sp-new',
        scope: 'future-only',
        reason: 'territory change',
        reassignedBy: 'anish.d',
      },
      deps,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.previousSalesPersonId).toBe('sp-old')
    expect(result.updatedMouIds).toEqual([])
    expect(enqueueCalls).toHaveLength(1)
    expect(enqueueCalls[0]?.entity).toBe('school')
    const auditEntry = result.school.auditLog.at(-1)
    expect(auditEntry?.action).toBe('sales-rep-reassigned')
    expect((auditEntry?.after as Record<string, unknown>).salesPersonId).toBe('sp-new')
    expect(auditEntry?.notes).toContain('territory change')
  })

  it('all-mous cascades: school audit + every MOU update enqueued', async () => {
    const deps = makeDeps({
      mous: [makeMou('MOU-1', 'sp-old'), makeMou('MOU-2', 'sp-old'), makeMou('MOU-3', 'sp-new')],
    })
    const result = await reassignSalesRep(
      {
        schoolId: 'SCH-A',
        newSalesPersonId: 'sp-new',
        scope: 'all-mous',
        reason: null,
        reassignedBy: 'anish.d',
      },
      deps,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    // MOU-3 was already sp-new; should be skipped to avoid pointless audit.
    expect(result.updatedMouIds).toEqual(['MOU-1', 'MOU-2'])
    // 1 school + 2 MOUs = 3 enqueue calls
    expect(enqueueCalls).toHaveLength(3)
    expect(enqueueCalls[0]?.entity).toBe('school')
    expect(enqueueCalls[1]?.entity).toBe('mou')
    expect(enqueueCalls[1]?.payloadId).toBe('MOU-1')
    expect(enqueueCalls[2]?.payloadId).toBe('MOU-2')
  })

  it('permission denied: Ops user is rejected in production lockdown', async () => {
    // Default TESTING_OPEN_ACCESS=true opens both gates for every active
    // user; this test enforces strict mode so the Ops-without-Sales-or-
    // Finance gate denial is exercised.
    const deps = makeDeps({
      users: [makeUser('misba.m', 'OpsEmployee', 'ops')],
    })
    const original = process.env.TESTING_OPEN_ACCESS
    process.env.TESTING_OPEN_ACCESS = 'false'
    try {
      const result = await reassignSalesRep(
        {
          schoolId: 'SCH-A',
          newSalesPersonId: 'sp-new',
          scope: 'future-only',
          reason: null,
          reassignedBy: 'misba.m',
        },
        deps,
      )
      expect(result).toEqual({ ok: false, reason: 'permission' })
      expect(enqueueCalls).toHaveLength(0)
    } finally {
      if (original === undefined) delete process.env.TESTING_OPEN_ACCESS
      else process.env.TESTING_OPEN_ACCESS = original
    }
  })

  it('Finance user can reassign (canEditFinanceData branch)', async () => {
    const deps = makeDeps({
      users: [makeUser('pranav.b', 'Finance', 'finance')],
    })
    // Production lockdown (TESTING_OPEN_ACCESS=false) for this case to
    // ensure canEditFinanceData strict-mode also accepts Finance dept.
    const original = process.env.TESTING_OPEN_ACCESS
    process.env.TESTING_OPEN_ACCESS = 'false'
    try {
      const result = await reassignSalesRep(
        {
          schoolId: 'SCH-A',
          newSalesPersonId: 'sp-new',
          scope: 'future-only',
          reason: null,
          reassignedBy: 'pranav.b',
        },
        deps,
      )
      expect(result.ok).toBe(true)
    } finally {
      if (original === undefined) delete process.env.TESTING_OPEN_ACCESS
      else process.env.TESTING_OPEN_ACCESS = original
    }
  })

  it('unknown school -> school-not-found', async () => {
    const deps = makeDeps()
    const result = await reassignSalesRep(
      {
        schoolId: 'SCH-MISSING',
        newSalesPersonId: 'sp-new',
        scope: 'future-only',
        reason: null,
        reassignedBy: 'anish.d',
      },
      deps,
    )
    expect(result).toEqual({ ok: false, reason: 'school-not-found' })
    expect(enqueueCalls).toHaveLength(0)
  })

  it('unknown sales rep -> unknown-sales-rep', async () => {
    const deps = makeDeps()
    const result = await reassignSalesRep(
      {
        schoolId: 'SCH-A',
        newSalesPersonId: 'sp-ghost',
        scope: 'future-only',
        reason: null,
        reassignedBy: 'anish.d',
      },
      deps,
    )
    expect(result).toEqual({ ok: false, reason: 'unknown-sales-rep' })
  })

  it('inactive sales rep -> inactive-sales-rep', async () => {
    const deps = makeDeps({
      salesTeam: [makeRep('sp-old'), makeRep('sp-new', false)],
    })
    const result = await reassignSalesRep(
      {
        schoolId: 'SCH-A',
        newSalesPersonId: 'sp-new',
        scope: 'future-only',
        reason: null,
        reassignedBy: 'anish.d',
      },
      deps,
    )
    expect(result).toEqual({ ok: false, reason: 'inactive-sales-rep' })
  })

  it('no-change when new rep equals current -> no-change', async () => {
    const deps = makeDeps()
    const result = await reassignSalesRep(
      {
        schoolId: 'SCH-A',
        newSalesPersonId: 'sp-old',
        scope: 'future-only',
        reason: null,
        reassignedBy: 'anish.d',
      },
      deps,
    )
    expect(result).toEqual({ ok: false, reason: 'no-change' })
    expect(enqueueCalls).toHaveLength(0)
  })

  it('unassign (newSalesPersonId=null) is supported', async () => {
    const deps = makeDeps()
    const result = await reassignSalesRep(
      {
        schoolId: 'SCH-A',
        newSalesPersonId: null,
        scope: 'future-only',
        reason: 'rep left org',
        reassignedBy: 'anish.d',
      },
      deps,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const audit = result.school.auditLog.at(-1)
    expect((audit?.after as Record<string, unknown>).salesPersonId).toBeNull()
  })
})
