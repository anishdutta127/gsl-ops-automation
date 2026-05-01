import { describe, expect, it, vi } from 'vitest'
import type {
  DispatchLineItem,
  DispatchRequest,
  IntakeRecord,
  MOU,
  PendingUpdate,
  SalesPerson,
  School,
  User,
} from '@/lib/types'
import { createRequest, type CreateRequestDeps } from './createRequest'

const FIXED_TS = '2026-04-28T12:00:00.000Z'

function user(overrides: Partial<User> = {}): User {
  return {
    id: 'pratik.d',
    name: 'Pratik D.',
    email: 'pratik.d@getsetlearn.info',
    role: 'SalesHead',
    testingOverride: false,
    active: true,
    passwordHash: '',
    createdAt: '2025-04-01',
    auditLog: [],
    ...overrides,
  }
}

function mou(overrides: Partial<MOU> = {}): MOU {
  return {
    id: 'MOU-X', schoolId: 'SCH-X', schoolName: 'Test School',
    programme: 'STEAM', programmeSubType: null,
    schoolScope: 'SINGLE', schoolGroupId: null,
    status: 'Active', cohortStatus: 'active',
    academicYear: '2026-27', startDate: '2026-04-01', endDate: '2027-03-31',
    studentsMou: 100, studentsActual: 100, studentsVariance: 0, studentsVariancePct: 0,
    spWithoutTax: 1000, spWithTax: 1180, contractValue: 118000,
    received: 0, tds: 0, balance: 118000, receivedPct: 0,
    paymentSchedule: '50-50 half-yearly',
    trainerModel: 'GSL-T', salesPersonId: 'sp-pratik', templateVersion: null,
    generatedAt: null, notes: null, daysToExpiry: null, delayNotes: null,
    auditLog: [],
    ...overrides,
  }
}

function school(): School {
  return {
    id: 'SCH-X', name: 'Test School', legalEntity: null,
    city: 'Kolkata', state: 'West Bengal', region: 'East', pinCode: null,
    contactPerson: null, email: null, phone: null,
    billingName: null, pan: null, gstNumber: '29AAAA0000A1Z5',
    notes: null, active: true, createdAt: '2025-04-01', auditLog: [],
  }
}

function intake(overrides: Partial<IntakeRecord> = {}): IntakeRecord {
  return {
    id: 'IR-X', mouId: 'MOU-X', completedAt: '2026-04-15T10:00:00Z',
    completedBy: 'pratik.d', salesOwnerId: 'sp-pratik',
    location: 'Kolkata', grades: '1-8',
    recipientName: 'Principal', recipientDesignation: 'Principal',
    recipientEmail: 'p@school.test',
    studentsAtIntake: 100, durationYears: 1,
    startDate: '2026-04-01', endDate: '2027-03-31',
    physicalSubmissionStatus: 'Submitted', softCopySubmissionStatus: 'Submitted',
    productConfirmed: 'STEAM', gslTrainingMode: 'GSL Trainer',
    schoolPointOfContactName: 'POC', schoolPointOfContactPhone: '+91',
    signedMouUrl: 'https://x', thankYouEmailSentAt: null,
    gradeBreakdown: null, rechargeableBatteries: null,
    auditLog: [],
    ...overrides,
  }
}

function salesPerson(overrides: Partial<SalesPerson> = {}): SalesPerson {
  return {
    id: 'sp-pratik', name: 'Pratik D.', email: 'pratik.d@getsetlearn.info',
    phone: null, territories: [], programmes: ['STEAM'], active: true,
    joinedDate: '2025-04-01',
    ...overrides,
  }
}

function flatItem(skuName = 'STEAM kit set', quantity = 100): DispatchLineItem {
  return { kind: 'flat', skuName, quantity }
}

function makeDeps(opts: Partial<CreateRequestDeps> = {}): {
  deps: CreateRequestDeps
  calls: Array<Record<string, unknown>>
} {
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
      mous: opts.mous ?? [mou()],
      schools: opts.schools ?? [school()],
      users: opts.users ?? [user()],
      intakeRecords: opts.intakeRecords ?? [intake()],
      dispatchRequests: opts.dispatchRequests ?? [],
      salesPersons: opts.salesPersons ?? [salesPerson()],
      inventoryItems: opts.inventoryItems ?? [],
      enqueue: enqueue as unknown as CreateRequestDeps['enqueue'],
      now: () => new Date(FIXED_TS),
    },
    calls,
  }
}

describe('createRequest happy path + permission gate', () => {
  it('SalesHead happy path: creates DR, enqueues, no warnings', async () => {
    const { deps, calls } = makeDeps()
    const result = await createRequest(
      {
        mouId: 'MOU-X',
        installmentSeq: 1,
        requestReason: 'Q2 dispatch',
        lineItems: [flatItem()],
        notes: null,
        requestedBy: 'pratik.d',
      },
      deps,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.warnings).toEqual([])
    expect(result.request.status).toBe('pending-approval')
    expect(result.request.installmentSeq).toBe(1)
    expect(result.request.lineItems).toHaveLength(1)
    expect(result.request.auditLog).toHaveLength(1)
    expect(result.request.auditLog[0]!.action).toBe('dispatch-request-created')
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({ entity: 'dispatchRequest', operation: 'create' })
  })

  it('SalesRep can also submit (Sales sub-role)', async () => {
    const u = user({ id: 'vish.g', email: 'vish.g@getsetlearn.info', role: 'SalesRep' })
    const { deps } = makeDeps({ users: [u] })
    const result = await createRequest(
      {
        mouId: 'MOU-X', installmentSeq: 1,
        requestReason: 'kickoff',
        lineItems: [flatItem()],
        notes: null,
        requestedBy: 'vish.g',
      },
      deps,
    )
    expect(result.ok).toBe(true)
  })

  it('OpsEmployee is REJECTED (not granted)', async () => {
    const u = user({ id: 'misba.m', role: 'OpsEmployee' })
    const { deps, calls } = makeDeps({ users: [u] })
    const result = await createRequest(
      {
        mouId: 'MOU-X', installmentSeq: 1,
        requestReason: 'r', lineItems: [flatItem()], notes: null,
        requestedBy: 'misba.m',
      },
      deps,
    )
    expect(result).toEqual({ ok: false, reason: 'permission' })
    expect(calls).toHaveLength(0)
  })

  it('unknown user', async () => {
    const { deps } = makeDeps()
    const result = await createRequest(
      {
        mouId: 'MOU-X', installmentSeq: 1,
        requestReason: 'r', lineItems: [flatItem()], notes: null,
        requestedBy: 'ghost',
      },
      deps,
    )
    expect(result).toEqual({ ok: false, reason: 'unknown-user' })
  })
})

describe('createRequest hard errors V1+V2', () => {
  it('V1 cohortStatus archived blocks submit (mou-not-active-cohort)', async () => {
    const { deps } = makeDeps({ mous: [mou({ cohortStatus: 'archived' })] })
    const result = await createRequest(
      {
        mouId: 'MOU-X', installmentSeq: 1,
        requestReason: 'r', lineItems: [flatItem()], notes: null,
        requestedBy: 'pratik.d',
      },
      deps,
    )
    expect(result).toEqual({ ok: false, reason: 'mou-not-active-cohort' })
  })

  it('V2 missing salesPersonId blocks submit (mou-no-sales-owner)', async () => {
    const { deps } = makeDeps({ mous: [mou({ salesPersonId: null })] })
    const result = await createRequest(
      {
        mouId: 'MOU-X', installmentSeq: 1,
        requestReason: 'r', lineItems: [flatItem()], notes: null,
        requestedBy: 'pratik.d',
      },
      deps,
    )
    expect(result).toEqual({ ok: false, reason: 'mou-no-sales-owner' })
  })

  it('shape errors: empty lineItems / bad installmentSeq / missing reason', async () => {
    const { deps } = makeDeps()
    const r1 = await createRequest(
      { mouId: 'MOU-X', installmentSeq: 1, requestReason: 'r', lineItems: [], notes: null, requestedBy: 'pratik.d' },
      deps,
    )
    expect(r1).toEqual({ ok: false, reason: 'invalid-line-items' })
    const r2 = await createRequest(
      { mouId: 'MOU-X', installmentSeq: 0, requestReason: 'r', lineItems: [flatItem()], notes: null, requestedBy: 'pratik.d' },
      deps,
    )
    expect(r2).toEqual({ ok: false, reason: 'invalid-installment-seq' })
    const r3 = await createRequest(
      { mouId: 'MOU-X', installmentSeq: 1, requestReason: '   ', lineItems: [flatItem()], notes: null, requestedBy: 'pratik.d' },
      deps,
    )
    expect(r3).toEqual({ ok: false, reason: 'missing-reason' })
  })
})

describe('createRequest soft warnings V3-V6, V8 (allow submit)', () => {
  it('V3 intake-not-completed when no IntakeRecord', async () => {
    const { deps } = makeDeps({ intakeRecords: [] })
    const result = await createRequest(
      { mouId: 'MOU-X', installmentSeq: 1, requestReason: 'r', lineItems: [flatItem()], notes: null, requestedBy: 'pratik.d' },
      deps,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.warnings).toContain('intake-not-completed')
  })

  it('V4 kit-type-programme-mismatch when SKU does not align with programme', async () => {
    const { deps } = makeDeps({
      mous: [mou({ programme: 'TinkRworks' })],
    })
    const result = await createRequest(
      {
        mouId: 'MOU-X', installmentSeq: 1, requestReason: 'r',
        lineItems: [flatItem('Random SKU', 100)],
        notes: null, requestedBy: 'pratik.d',
      },
      deps,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.warnings).toContain('kit-type-programme-mismatch')
  })

  it('V5 student-count-variance-high when total qty differs > 10% from baseline', async () => {
    // intake studentsAtIntake = 100, request quantity = 200 => 100% variance
    const { deps } = makeDeps()
    const result = await createRequest(
      { mouId: 'MOU-X', installmentSeq: 1, requestReason: 'r', lineItems: [flatItem('STEAM kit', 200)], notes: null, requestedBy: 'pratik.d' },
      deps,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.warnings).toContain('student-count-variance-high')
  })

  it('V6 grade-out-of-intake-range when per-grade allocation outside intake grades', async () => {
    // intake grades '1-8'; allocation grade 10 is out of range
    const { deps } = makeDeps()
    const perGrade: DispatchLineItem = {
      kind: 'per-grade',
      skuName: 'STEAM kit set',
      gradeAllocations: [{ grade: 10, quantity: 5 }],
    }
    const result = await createRequest(
      { mouId: 'MOU-X', installmentSeq: 1, requestReason: 'r', lineItems: [perGrade], notes: null, requestedBy: 'pratik.d' },
      deps,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.warnings).toContain('grade-out-of-intake-range')
  })

  it('V8 duplicate-pending-request when same MOU+installment already pending', async () => {
    const existing: DispatchRequest = {
      id: 'DR-EXISTING', mouId: 'MOU-X', schoolId: 'SCH-X',
      requestedBy: 'pratik.d', requestedAt: FIXED_TS,
      requestReason: 'first', installmentSeq: 1,
      lineItems: [flatItem()], status: 'pending-approval',
      conversionDispatchId: null, rejectionReason: null,
      reviewedBy: null, reviewedAt: null, notes: null, auditLog: [],
    }
    const { deps } = makeDeps({ dispatchRequests: [existing] })
    const result = await createRequest(
      { mouId: 'MOU-X', installmentSeq: 1, requestReason: 'r', lineItems: [flatItem()], notes: null, requestedBy: 'pratik.d' },
      deps,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.warnings).toContain('duplicate-pending-request')
  })
})

describe('createRequest V7 audit-only (submitter != intake salesOwner)', () => {
  it('V7 captured in audit notes; no warning surfaced', async () => {
    // user is pratik.d (sp-pratik); intake salesOwnerId is sp-other.
    const otherSp = salesPerson({ id: 'sp-other', email: 'other@getsetlearn.info' })
    const { deps } = makeDeps({
      intakeRecords: [intake({ salesOwnerId: 'sp-other' })],
      salesPersons: [salesPerson(), otherSp],
    })
    const result = await createRequest(
      { mouId: 'MOU-X', installmentSeq: 1, requestReason: 'r', lineItems: [flatItem()], notes: null, requestedBy: 'pratik.d' },
      deps,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.warnings).not.toContain('submitter-not-intake-owner')
    const audit = result.request.auditLog[0]!
    expect(audit.notes ?? '').toMatch(/V7/)
  })
})
