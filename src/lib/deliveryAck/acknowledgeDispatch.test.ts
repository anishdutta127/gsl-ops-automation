import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  acknowledgeDispatch,
  type AcknowledgeDispatchDeps,
} from './acknowledgeDispatch'
import type { Dispatch, MOU, PendingUpdate, User } from '@/lib/types'

const FIXED_TS = '2026-04-26T10:00:00.000Z'

function user(role: User['role'], id = 'u'): User {
  return {
    id, name: id, email: `${id}@example.test`, role,
    testingOverride: false, active: true, passwordHash: 'X',
    createdAt: '', auditLog: [],
  }
}

function mou(): MOU {
  return {
    id: 'MOU-X', schoolId: 'SCH-X', schoolName: 'Test School',
    programme: 'STEAM', programmeSubType: null, schoolScope: 'SINGLE',
    schoolGroupId: null, status: 'Active', academicYear: '2026-27',
    startDate: '2026-04-01', endDate: '2027-03-31',
    studentsMou: 200, studentsActual: 200, studentsVariance: 0,
    studentsVariancePct: 0, spWithoutTax: 4000, spWithTax: 5000,
    contractValue: 800000, received: 0, tds: 0, balance: 800000,
    receivedPct: 0, paymentSchedule: '25-25-25-25 quarterly',
    trainerModel: 'GSL-T', salesPersonId: null, templateVersion: null,
    generatedAt: null, notes: null, daysToExpiry: null, auditLog: [],
  }
}

function dispatch(overrides: Partial<Dispatch> = {}): Dispatch {
  return {
    id: 'DSP-MOU-X-i1', mouId: 'MOU-X', schoolId: 'SCH-X',
    installmentSeq: 1, stage: 'po-raised', installment1Paid: true,
    overrideEvent: null, poRaisedAt: '2026-04-20T10:00:00Z',
    dispatchedAt: null, deliveredAt: null, acknowledgedAt: null,
    acknowledgementUrl: null, notes: null, auditLog: [],
    ...overrides,
  }
}

function makeDeps(opts: {
  dispatches: Dispatch[]
  mous: MOU[]
  users: User[]
}): { deps: AcknowledgeDispatchDeps; calls: Array<Record<string, unknown>> } {
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
      dispatches: opts.dispatches,
      mous: opts.mous,
      users: opts.users,
      enqueue: enqueue as unknown as AcknowledgeDispatchDeps['enqueue'],
      now: () => new Date(FIXED_TS),
    },
    calls,
  }
}

const VALID_URL = 'https://drive.google.com/file/d/abc123/view'

describe('acknowledgeDispatch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('happy path: po-raised -> acknowledged + URL recorded + both timestamps + queue enqueued', async () => {
    const u = user('OpsHead', 'misba.m')
    const { deps, calls } = makeDeps({
      dispatches: [dispatch({ stage: 'po-raised' })],
      mous: [mou()], users: [u],
    })
    const result = await acknowledgeDispatch(
      {
        dispatchId: 'DSP-MOU-X-i1',
        signedHandoverFormUrl: VALID_URL,
        acknowledgedBy: 'misba.m',
      },
      deps,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.dispatch.stage).toBe('acknowledged')
    expect(result.dispatch.acknowledgementUrl).toBe(VALID_URL)
    expect(result.dispatch.acknowledgedAt).toBe(FIXED_TS)
    expect(result.dispatch.deliveredAt).toBe(FIXED_TS)  // Phase 1 simplified: both set together
    expect(result.dispatch.auditLog).toHaveLength(1)
    expect(result.dispatch.auditLog[0]?.action).toBe('delivery-acknowledged')
    expect(calls).toHaveLength(2)
    expect(calls[0]).toMatchObject({ entity: 'dispatch', operation: 'update' })
    expect(calls[1]).toMatchObject({ entity: 'mou', operation: 'update' })
  })

  it('preserves prior deliveredAt when already set (delivered -> acknowledged)', async () => {
    const u = user('OpsHead', 'misba.m')
    const priorDeliveredAt = '2026-04-25T08:00:00Z'
    const { deps } = makeDeps({
      dispatches: [dispatch({ stage: 'delivered', deliveredAt: priorDeliveredAt })],
      mous: [mou()], users: [u],
    })
    const result = await acknowledgeDispatch(
      {
        dispatchId: 'DSP-MOU-X-i1',
        signedHandoverFormUrl: VALID_URL,
        acknowledgedBy: 'misba.m',
      },
      deps,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.dispatch.deliveredAt).toBe(priorDeliveredAt)
    expect(result.dispatch.acknowledgedAt).toBe(FIXED_TS)
  })

  it('Admin can acknowledge (wildcard)', async () => {
    const u = user('Admin', 'anish.d')
    const { deps } = makeDeps({
      dispatches: [dispatch()], mous: [mou()], users: [u],
    })
    const result = await acknowledgeDispatch(
      {
        dispatchId: 'DSP-MOU-X-i1',
        signedHandoverFormUrl: VALID_URL,
        acknowledgedBy: 'anish.d',
      },
      deps,
    )
    expect(result.ok).toBe(true)
  })

  it('SalesHead is REJECTED (mou:upload-delivery-ack not granted)', async () => {
    const u = user('SalesHead', 'pratik.d')
    const { deps, calls } = makeDeps({
      dispatches: [dispatch()], mous: [mou()], users: [u],
    })
    const result = await acknowledgeDispatch(
      {
        dispatchId: 'DSP-MOU-X-i1',
        signedHandoverFormUrl: VALID_URL,
        acknowledgedBy: 'pratik.d',
      },
      deps,
    )
    expect(result).toEqual({ ok: false, reason: 'permission' })
    expect(calls).toHaveLength(0)
  })

  it('rejects already-acknowledged (idempotency guard)', async () => {
    const u = user('OpsHead', 'misba.m')
    const { deps, calls } = makeDeps({
      dispatches: [dispatch({
        stage: 'acknowledged',
        deliveredAt: '2026-04-25T08:00:00Z',
        acknowledgedAt: '2026-04-25T09:00:00Z',
        acknowledgementUrl: 'https://prior.example/form.pdf',
      })],
      mous: [mou()], users: [u],
    })
    const result = await acknowledgeDispatch(
      {
        dispatchId: 'DSP-MOU-X-i1',
        signedHandoverFormUrl: VALID_URL,
        acknowledgedBy: 'misba.m',
      },
      deps,
    )
    expect(result).toEqual({ ok: false, reason: 'already-acknowledged' })
    expect(calls).toHaveLength(0)
  })

  it('rejects pending stage (must transit through raiseDispatch first)', async () => {
    const u = user('OpsHead', 'misba.m')
    const { deps } = makeDeps({
      dispatches: [dispatch({ stage: 'pending' })],
      mous: [mou()], users: [u],
    })
    const result = await acknowledgeDispatch(
      {
        dispatchId: 'DSP-MOU-X-i1',
        signedHandoverFormUrl: VALID_URL,
        acknowledgedBy: 'misba.m',
      },
      deps,
    )
    expect(result).toEqual({ ok: false, reason: 'wrong-stage' })
  })

  it('rejects malformed URL (not http/https)', async () => {
    const u = user('OpsHead', 'misba.m')
    const { deps } = makeDeps({
      dispatches: [dispatch()], mous: [mou()], users: [u],
    })
    const result = await acknowledgeDispatch(
      {
        dispatchId: 'DSP-MOU-X-i1',
        signedHandoverFormUrl: 'not a url',
        acknowledgedBy: 'misba.m',
      },
      deps,
    )
    expect(result).toEqual({ ok: false, reason: 'invalid-url' })
  })

  it('rejects ftp:// URL (only http/https allowed)', async () => {
    const u = user('OpsHead', 'misba.m')
    const { deps } = makeDeps({
      dispatches: [dispatch()], mous: [mou()], users: [u],
    })
    const result = await acknowledgeDispatch(
      {
        dispatchId: 'DSP-MOU-X-i1',
        signedHandoverFormUrl: 'ftp://example.com/file.pdf',
        acknowledgedBy: 'misba.m',
      },
      deps,
    )
    expect(result).toEqual({ ok: false, reason: 'invalid-url' })
  })

  it('rejects empty URL', async () => {
    const u = user('OpsHead', 'misba.m')
    const { deps } = makeDeps({
      dispatches: [dispatch()], mous: [mou()], users: [u],
    })
    const result = await acknowledgeDispatch(
      {
        dispatchId: 'DSP-MOU-X-i1',
        signedHandoverFormUrl: '   ',
        acknowledgedBy: 'misba.m',
      },
      deps,
    )
    expect(result).toEqual({ ok: false, reason: 'invalid-url' })
  })

  it('rejects dispatch-not-found', async () => {
    const u = user('OpsHead', 'misba.m')
    const { deps } = makeDeps({
      dispatches: [], mous: [mou()], users: [u],
    })
    const result = await acknowledgeDispatch(
      {
        dispatchId: 'DSP-NOPE',
        signedHandoverFormUrl: VALID_URL,
        acknowledgedBy: 'misba.m',
      },
      deps,
    )
    expect(result).toEqual({ ok: false, reason: 'dispatch-not-found' })
  })

  it('rejects unknown user', async () => {
    const { deps } = makeDeps({
      dispatches: [dispatch()], mous: [mou()], users: [],
    })
    const result = await acknowledgeDispatch(
      {
        dispatchId: 'DSP-MOU-X-i1',
        signedHandoverFormUrl: VALID_URL,
        acknowledgedBy: 'ghost',
      },
      deps,
    )
    expect(result).toEqual({ ok: false, reason: 'unknown-user' })
  })

  it('Dispatch audit entry captures before/after state transition', async () => {
    const u = user('OpsHead', 'misba.m')
    const { deps, calls } = makeDeps({
      dispatches: [dispatch({ stage: 'po-raised' })],
      mous: [mou()], users: [u],
    })
    await acknowledgeDispatch(
      {
        dispatchId: 'DSP-MOU-X-i1',
        signedHandoverFormUrl: VALID_URL,
        acknowledgedBy: 'misba.m',
      },
      deps,
    )
    const updated = calls[0]!.payload as unknown as Dispatch
    const entry = updated.auditLog[0]!
    expect(entry.action).toBe('delivery-acknowledged')
    expect(entry.before).toMatchObject({ stage: 'po-raised', acknowledgementUrl: null })
    expect(entry.after).toMatchObject({ stage: 'acknowledged', acknowledgementUrl: VALID_URL })
  })
})
