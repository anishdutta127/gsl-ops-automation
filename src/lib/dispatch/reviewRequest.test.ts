import { describe, expect, it, vi } from 'vitest'
import type {
  Dispatch,
  DispatchLineItem,
  DispatchRequest,
  MOU,
  PendingUpdate,
  School,
  User,
} from '@/lib/types'
import {
  approveRequest,
  cancelRequest,
  rejectRequest,
  type ReviewRequestDeps,
} from './reviewRequest'

const FIXED_TS = '2026-04-28T13:00:00.000Z'

function pratik(): User {
  return {
    id: 'pratik.d', name: 'Pratik', email: 'pratik.d@gsl.test',
    role: 'SalesHead', testingOverride: false, active: true,
    passwordHash: '', createdAt: '', auditLog: [],
  }
}
function misba(): User {
  return {
    id: 'misba.m', name: 'Misba', email: 'misba.m@gsl.test',
    role: 'OpsHead', testingOverride: false, active: true,
    passwordHash: '', createdAt: '', auditLog: [],
  }
}
function mou(overrides: Partial<MOU> = {}): MOU {
  return {
    id: 'MOU-X', schoolId: 'SCH-X', schoolName: 'X', programme: 'STEAM',
    programmeSubType: null, schoolScope: 'SINGLE', schoolGroupId: null,
    status: 'Active', cohortStatus: 'active', academicYear: '2026-27',
    startDate: '2026-04-01', endDate: '2027-03-31',
    studentsMou: 100, studentsActual: 100, studentsVariance: 0, studentsVariancePct: 0,
    spWithoutTax: 1000, spWithTax: 1180, contractValue: 118000,
    received: 0, tds: 0, balance: 118000, receivedPct: 0,
    paymentSchedule: '50-50 half-yearly',
    trainerModel: 'GSL-T', salesPersonId: 'sp-pratik', templateVersion: null,
    generatedAt: null, notes: null, daysToExpiry: null, delayNotes: null,
    auditLog: [], ...overrides,
  }
}
function school(): School {
  return {
    id: 'SCH-X', name: 'X', legalEntity: null, city: 'C', state: 'S',
    region: 'East', pinCode: null, contactPerson: null, email: null,
    phone: null, billingName: null, pan: null, gstNumber: '29X',
    notes: null, active: true, createdAt: '', auditLog: [],
  }
}
function flat(): DispatchLineItem {
  return { kind: 'flat', skuName: 'STEAM kit set', quantity: 100 }
}
function defaultInventory(): import('@/lib/types').InventoryItem[] {
  return [
    {
      id: 'INV-STEAM-KIT', skuName: 'STEAM kit set', category: 'Other',
      cretileGrade: null, mastersheetSourceName: null, currentStock: 10000,
      reorderThreshold: null, notes: null, active: true,
      lastUpdatedAt: FIXED_TS, lastUpdatedBy: 'system-test', auditLog: [],
    },
  ]
}
function dr(overrides: Partial<DispatchRequest> = {}): DispatchRequest {
  return {
    id: 'DR-1', mouId: 'MOU-X', schoolId: 'SCH-X', requestedBy: 'pratik.d',
    requestedAt: '2026-04-27T10:00:00Z', requestReason: 'pilot kickoff',
    installmentSeq: 1, lineItems: [flat()], status: 'pending-approval',
    conversionDispatchId: null, rejectionReason: null,
    reviewedBy: null, reviewedAt: null, notes: null, auditLog: [],
    ...overrides,
  }
}

function makeDeps(opts: Partial<ReviewRequestDeps> = {}): {
  deps: ReviewRequestDeps
  calls: Array<Record<string, unknown>>
} {
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
      mous: opts.mous ?? [mou()],
      schools: opts.schools ?? [school()],
      users: opts.users ?? [pratik(), misba()],
      dispatches: opts.dispatches ?? [],
      dispatchRequests: opts.dispatchRequests ?? [dr()],
      inventoryItems: opts.inventoryItems ?? defaultInventory(),
      enqueue: enqueue as unknown as ReviewRequestDeps['enqueue'],
      now: () => new Date(FIXED_TS),
    },
    calls,
  }
}

describe('approveRequest', () => {
  it('happy path: OpsHead approves; creates Dispatch with raisedFrom=sales-request + requestId', async () => {
    const { deps, calls } = makeDeps()
    const result = await approveRequest({ requestId: 'DR-1', reviewedBy: 'misba.m' }, deps)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.dispatch.raisedFrom).toBe('sales-request')
    expect(result.dispatch.requestId).toBe('DR-1')
    expect(result.dispatch.lineItems).toHaveLength(1)
    expect(result.request.status).toBe('approved')
    expect(result.request.conversionDispatchId).toBe(result.dispatch.id)
    expect(result.request.reviewedBy).toBe('misba.m')
    // Three enqueue calls: dispatch + dispatchRequest + 1 inventoryItem (W4-G.4)
    expect(calls).toHaveLength(3)
    expect(calls[0]).toMatchObject({ entity: 'dispatch', operation: 'create' })
    expect(calls[1]).toMatchObject({ entity: 'dispatchRequest', operation: 'update' })
    expect(calls[2]).toMatchObject({ entity: 'inventoryItem', operation: 'update' })
  })

  it('SalesHead is REJECTED (lacks dispatch-request:review)', async () => {
    const { deps } = makeDeps()
    const result = await approveRequest({ requestId: 'DR-1', reviewedBy: 'pratik.d' }, deps)
    expect(result).toEqual({ ok: false, reason: 'permission' })
  })

  it('Specific B path (b): Ops can edit lineItems during conversion; audit captures the edit', async () => {
    const { deps } = makeDeps()
    const edited: DispatchLineItem[] = [
      { kind: 'flat', skuName: 'STEAM kit set', quantity: 80 },
    ]
    const result = await approveRequest(
      { requestId: 'DR-1', reviewedBy: 'misba.m', lineItemsOverride: edited },
      deps,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const flatItem = result.dispatch.lineItems[0]
    if (flatItem === undefined || flatItem.kind !== 'flat') {
      throw new Error('expected flat line item at index 0')
    }
    expect(flatItem.quantity).toBe(80)
    // Audit on Dispatch records the edit
    const dispatchAudit = result.dispatch.auditLog[0]!
    expect(dispatchAudit.action).toBe('dispatch-request-converted')
    expect(dispatchAudit.notes ?? '').toMatch(/edits/i)
  })

  it('rejects request-not-pending when DR.status is already approved', async () => {
    const { deps } = makeDeps({
      dispatchRequests: [dr({ status: 'approved' })],
    })
    const result = await approveRequest({ requestId: 'DR-1', reviewedBy: 'misba.m' }, deps)
    expect(result).toEqual({ ok: false, reason: 'request-not-pending' })
  })

  it('rejects dispatch-already-exists when a Dispatch with the same id is already on file', async () => {
    const existing: Dispatch = {
      id: 'DSP-MOU-X-i1', mouId: 'MOU-X', schoolId: 'SCH-X', installmentSeq: 1,
      stage: 'pending', installment1Paid: false, overrideEvent: null,
      poRaisedAt: null, dispatchedAt: null, deliveredAt: null,
      acknowledgedAt: null, acknowledgementUrl: null, notes: null,
      lineItems: [flat()], requestId: null,
      raisedBy: 'misba.m', raisedFrom: 'ops-direct', auditLog: [],
    }
    const { deps } = makeDeps({ dispatches: [existing] })
    const result = await approveRequest({ requestId: 'DR-1', reviewedBy: 'misba.m' }, deps)
    expect(result).toEqual({ ok: false, reason: 'dispatch-already-exists' })
  })

  it('same-person scenario: requester also has review permission and approves their own', async () => {
    // Pradeep is Admin (wildcard), so he has 'dispatch-request:review' AND can submit.
    const pradeep: User = {
      id: 'pradeep.r', name: 'Pradeep', email: 'pradeep.r@gsl.test',
      role: 'Admin', testingOverride: false, active: true,
      passwordHash: '', createdAt: '', auditLog: [],
    }
    const { deps } = makeDeps({
      users: [pradeep],
      dispatchRequests: [dr({ requestedBy: 'pradeep.r' })],
    })
    const result = await approveRequest({ requestId: 'DR-1', reviewedBy: 'pradeep.r' }, deps)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.request.requestedBy).toBe('pradeep.r')
    expect(result.request.reviewedBy).toBe('pradeep.r')
    // Same actor, different timestamps captured on the entity fields
    expect(result.request.requestedAt).not.toBe(result.request.reviewedAt)
  })
})

describe('rejectRequest', () => {
  it('happy path: rejects with reason; status -> rejected', async () => {
    const { deps, calls } = makeDeps()
    const result = await rejectRequest(
      { requestId: 'DR-1', reviewedBy: 'misba.m', rejectionReason: 'Wrong programme' },
      deps,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.request.status).toBe('rejected')
    expect(result.request.rejectionReason).toBe('Wrong programme')
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({ entity: 'dispatchRequest', operation: 'update' })
  })

  it('rejects missing-rejection-reason on empty / whitespace', async () => {
    const { deps } = makeDeps()
    const result = await rejectRequest(
      { requestId: 'DR-1', reviewedBy: 'misba.m', rejectionReason: '   ' },
      deps,
    )
    expect(result).toEqual({ ok: false, reason: 'missing-rejection-reason' })
  })

  it('SalesHead cannot reject (lacks dispatch-request:review)', async () => {
    const { deps } = makeDeps()
    const result = await rejectRequest(
      { requestId: 'DR-1', reviewedBy: 'pratik.d', rejectionReason: 'Nope' },
      deps,
    )
    expect(result).toEqual({ ok: false, reason: 'permission' })
  })
})

describe('cancelRequest', () => {
  it('requester cancels their own pending DR', async () => {
    const { deps } = makeDeps()
    const result = await cancelRequest(
      { requestId: 'DR-1', cancelledBy: 'pratik.d', notes: null },
      deps,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.request.status).toBe('cancelled')
  })

  it('Ops with review permission can cancel any pending DR', async () => {
    const { deps } = makeDeps()
    const result = await cancelRequest(
      { requestId: 'DR-1', cancelledBy: 'misba.m', notes: 'Withdrawn after Ops review' },
      deps,
    )
    expect(result.ok).toBe(true)
  })

  it('a different Sales user cannot cancel someone else\'s pending DR', async () => {
    const otherSales: User = {
      id: 'vish.g', name: 'Vish', email: 'vish.g@gsl.test',
      role: 'SalesRep', testingOverride: false, active: true,
      passwordHash: '', createdAt: '', auditLog: [],
    }
    const { deps } = makeDeps({ users: [pratik(), misba(), otherSales] })
    const result = await cancelRequest(
      { requestId: 'DR-1', cancelledBy: 'vish.g', notes: null },
      deps,
    )
    expect(result).toEqual({ ok: false, reason: 'permission' })
  })

  it('rejects request-not-pending when DR is already approved / rejected / cancelled', async () => {
    const { deps } = makeDeps({ dispatchRequests: [dr({ status: 'approved' })] })
    const result = await cancelRequest(
      { requestId: 'DR-1', cancelledBy: 'pratik.d', notes: null },
      deps,
    )
    expect(result).toEqual({ ok: false, reason: 'request-not-pending' })
  })
})
