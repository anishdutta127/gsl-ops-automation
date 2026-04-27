import { describe, expect, it, vi } from 'vitest'
import { recordTransition, type RecordTransitionDeps } from './recordTransition'
import type { MOU, PendingUpdate, Programme, User } from '@/lib/types'

const FIXED_TS = '2026-04-27T12:00:00.000Z'

function mou(overrides: Partial<MOU> & Pick<MOU, 'id'>): MOU {
  return {
    schoolId: 'SCH-T', schoolName: 'Test', programme: 'STEAM' as Programme,
    programmeSubType: null, schoolScope: 'SINGLE', schoolGroupId: null,
    status: 'Active', cohortStatus: 'active', academicYear: '2026-27', startDate: '2026-04-01', endDate: '2027-03-31',
    studentsMou: 100, studentsActual: null, studentsVariance: null, studentsVariancePct: null,
    spWithoutTax: 1000, spWithTax: 1180, contractValue: 100000, received: 0, tds: 0,
    balance: 100000, receivedPct: 0, paymentSchedule: '', trainerModel: null, salesPersonId: null,
    templateVersion: null, generatedAt: null, notes: null, daysToExpiry: null, auditLog: [],
    ...overrides,
  }
}

function user(overrides: Partial<User> & Pick<User, 'id'>): User {
  return {
    name: overrides.id, email: `${overrides.id}@x`, role: 'Admin',
    testingOverride: false, active: true, passwordHash: 'X',
    createdAt: '', auditLog: [], ...overrides,
  }
}

function makeDeps(opts: {
  mous?: MOU[]
  users?: User[]
  enqueueFails?: boolean
}): { deps: RecordTransitionDeps; calls: Array<Record<string, unknown>> } {
  const calls: Array<Record<string, unknown>> = []
  const enqueue = vi.fn(async (params: Record<string, unknown>) => {
    if (opts.enqueueFails) throw new Error('queue down')
    calls.push(params)
    const stub: PendingUpdate = {
      id: 'p', queuedAt: FIXED_TS, queuedBy: String(params.queuedBy),
      entity: params.entity as PendingUpdate['entity'],
      operation: params.operation as PendingUpdate['operation'],
      payload: params.payload as Record<string, unknown>,
      retryCount: 0,
    }
    return stub
  })
  return {
    deps: {
      mous: opts.mous ?? [mou({ id: 'M1' })],
      users: opts.users ?? [user({ id: 'anish.d' })],
      enqueue: enqueue as unknown as RecordTransitionDeps['enqueue'],
      now: () => new Date(FIXED_TS),
    },
    calls,
  }
}

describe('recordTransition', () => {
  it('forward-by-one: returns ok, audited=false, no queue write (per-stage action is the audit record)', async () => {
    const { deps, calls } = makeDeps({})
    const result = await recordTransition({
      mouId: 'M1', fromStage: 'actuals-confirmed', toStage: 'cross-verification',
      reason: null, recordedBy: 'anish.d',
    }, deps)
    expect(result).toEqual({ ok: true, audited: false, mouId: 'M1', kind: 'forward-by-one' })
    expect(calls).toHaveLength(0)
  })

  it('forward-skip: writes kanban-stage-transition entry with reason in notes', async () => {
    const { deps, calls } = makeDeps({})
    const result = await recordTransition({
      mouId: 'M1', fromStage: 'mou-signed', toStage: 'kit-dispatched',
      reason: 'Imported mid-flight; kit was already dispatched upstream.',
      recordedBy: 'anish.d',
    }, deps)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.audited).toBe(true)
    expect(calls).toHaveLength(1)
    const payload = calls[0]?.payload as { auditLog: Array<{ action: string; before: unknown; after: unknown; notes: string }> }
    expect(payload.auditLog).toHaveLength(1)
    expect(payload.auditLog[0]?.action).toBe('kanban-stage-transition')
    expect(payload.auditLog[0]?.before).toEqual({ stage: 'mou-signed' })
    expect(payload.auditLog[0]?.after).toEqual({ stage: 'kit-dispatched' })
    expect(payload.auditLog[0]?.notes).toContain('Imported mid-flight')
  })

  it('backward: writes kanban-stage-transition entry; reason is required', async () => {
    const { deps, calls } = makeDeps({})
    const result = await recordTransition({
      mouId: 'M1', fromStage: 'invoice-raised', toStage: 'actuals-confirmed',
      reason: 'PI issued in error; reverting for re-verification.',
      recordedBy: 'anish.d',
    }, deps)
    expect(result.ok).toBe(true)
    expect(calls).toHaveLength(1)
  })

  it('Pre-Ops exit: writes audit entry with reason', async () => {
    const m = mou({ id: 'M-pre', status: 'Pending Signature' })
    const { deps, calls } = makeDeps({ mous: [m] })
    const result = await recordTransition({
      mouId: 'M-pre', fromStage: 'pre-ops', toStage: 'mou-signed',
      reason: 'Confirmed signed; updating from Pending Signature to Active.',
      recordedBy: 'anish.d',
    }, deps)
    expect(result.ok).toBe(true)
    expect(calls).toHaveLength(1)
  })

  it('skip without reason => reason-missing', async () => {
    const { deps } = makeDeps({})
    const result = await recordTransition({
      mouId: 'M1', fromStage: 'mou-signed', toStage: 'kit-dispatched',
      reason: null, recordedBy: 'anish.d',
    }, deps)
    expect(result).toEqual({ ok: false, reason: 'reason-missing' })
  })

  it('skip with reason < 5 chars => reason-too-short', async () => {
    const { deps } = makeDeps({})
    const result = await recordTransition({
      mouId: 'M1', fromStage: 'mou-signed', toStage: 'kit-dispatched',
      reason: 'oops', recordedBy: 'anish.d',
    }, deps)
    expect(result).toEqual({ ok: false, reason: 'reason-too-short' })
  })

  it('drop into Pre-Ops => rejected (one-way exit enforcement)', async () => {
    const { deps } = makeDeps({})
    const result = await recordTransition({
      mouId: 'M1', fromStage: 'mou-signed', toStage: 'pre-ops',
      reason: null, recordedBy: 'anish.d',
    }, deps)
    expect(result).toEqual({ ok: false, reason: 'rejected-pre-ops' })
  })

  it('same-column drop => no-op (not a queue write)', async () => {
    const { deps, calls } = makeDeps({})
    const result = await recordTransition({
      mouId: 'M1', fromStage: 'invoice-raised', toStage: 'invoice-raised',
      reason: null, recordedBy: 'anish.d',
    }, deps)
    expect(result).toEqual({ ok: false, reason: 'no-op' })
    expect(calls).toHaveLength(0)
  })

  it('unknown mouId => mou-not-found', async () => {
    const { deps } = makeDeps({})
    const result = await recordTransition({
      mouId: 'M-ghost', fromStage: 'mou-signed', toStage: 'invoice-raised',
      reason: null, recordedBy: 'anish.d',
    }, deps)
    expect(result).toEqual({ ok: false, reason: 'mou-not-found' })
  })

  it('unknown user => unknown-user', async () => {
    const { deps } = makeDeps({})
    const result = await recordTransition({
      mouId: 'M1', fromStage: 'mou-signed', toStage: 'invoice-raised',
      reason: null, recordedBy: 'ghost',
    }, deps)
    expect(result).toEqual({ ok: false, reason: 'unknown-user' })
  })
})
