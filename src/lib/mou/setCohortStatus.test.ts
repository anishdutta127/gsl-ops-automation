import { describe, expect, it, vi } from 'vitest'
import {
  setCohortStatus,
  type SetCohortStatusDeps,
} from './setCohortStatus'
import type {
  MOU,
  PendingUpdate,
  Programme,
  User,
} from '@/lib/types'

const FIXED_TS = '2026-04-27T19:00:00.000Z'

function admin(): User {
  return {
    id: 'anish.d', name: 'Anish', email: 'anish.d@example.test', role: 'Admin',
    testingOverride: false, active: true, passwordHash: 'X',
    createdAt: '', auditLog: [],
  }
}

function opsHead(): User {
  return {
    id: 'misba.m', name: 'Misba', email: 'm@example.test', role: 'OpsHead',
    testingOverride: false, active: true, passwordHash: 'X',
    createdAt: '', auditLog: [],
  }
}

function mou(overrides: Partial<MOU> & Pick<MOU, 'id'>): MOU {
  return {
    schoolId: 'SCH-T', schoolName: 'Test', programme: 'STEAM' as Programme,
    programmeSubType: null, schoolScope: 'SINGLE', schoolGroupId: null,
    status: 'Active', cohortStatus: 'archived',
    academicYear: '2025-26', startDate: '2025-04-01', endDate: '2026-03-31',
    studentsMou: 100, studentsActual: null, studentsVariance: null, studentsVariancePct: null,
    spWithoutTax: 1000, spWithTax: 1180, contractValue: 100000, received: 0, tds: 0,
    balance: 100000, receivedPct: 0, paymentSchedule: '', trainerModel: null, salesPersonId: null,
    templateVersion: null, generatedAt: null, notes: null, daysToExpiry: null, delayNotes: null, auditLog: [],
    ...overrides,
  }
}

function makeDeps(opts: {
  mous: MOU[]
  users: User[]
}): { deps: SetCohortStatusDeps; calls: Array<Record<string, unknown>> } {
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
      enqueue: enqueue as unknown as SetCohortStatusDeps['enqueue'],
      now: () => new Date(FIXED_TS),
    },
    calls,
  }
}

describe('setCohortStatus', () => {
  it('Admin can flip archived -> active; queue gets the update + audit entry written', async () => {
    const m = mou({ id: 'M-A', cohortStatus: 'archived' })
    const { deps, calls } = makeDeps({ mous: [m], users: [admin()] })
    const res = await setCohortStatus(
      { mouId: 'M-A', target: 'active', changedBy: 'anish.d', notes: 'Renewing for 2627.' },
      deps,
    )
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.mou.cohortStatus).toBe('active')
      expect(res.mou.auditLog).toHaveLength(1)
      const entry = res.mou.auditLog[0]
      expect(entry?.action).toBe('mou-cohort-status-changed')
      expect(entry?.before).toEqual({ cohortStatus: 'archived' })
      expect(entry?.after).toEqual({ cohortStatus: 'active' })
      expect(entry?.notes).toBe('Renewing for 2627.')
    }
    expect(calls).toHaveLength(1)
    expect(calls[0]?.entity).toBe('mou')
    expect(calls[0]?.operation).toBe('update')
  })

  it('Admin can flip active -> archived (the bulk-edit direction)', async () => {
    const m = mou({ id: 'M-B', cohortStatus: 'active' })
    const { deps } = makeDeps({ mous: [m], users: [admin()] })
    const res = await setCohortStatus(
      { mouId: 'M-B', target: 'archived', changedBy: 'anish.d' },
      deps,
    )
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.mou.cohortStatus).toBe('archived')
      expect(res.mou.auditLog[0]?.notes).toBeUndefined()
    }
  })

  it('OpsHead is rejected with reason=permission (cohort flips are leadership-level)', async () => {
    const m = mou({ id: 'M-C', cohortStatus: 'archived' })
    const { deps, calls } = makeDeps({ mous: [m], users: [opsHead()] })
    const res = await setCohortStatus(
      { mouId: 'M-C', target: 'active', changedBy: 'misba.m' },
      deps,
    )
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.reason).toBe('permission')
    expect(calls).toHaveLength(0)
  })

  it('unknown mouId -> reason=mou-not-found, no queue write', async () => {
    const { deps, calls } = makeDeps({ mous: [], users: [admin()] })
    const res = await setCohortStatus(
      { mouId: 'M-NOPE', target: 'active', changedBy: 'anish.d' },
      deps,
    )
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.reason).toBe('mou-not-found')
    expect(calls).toHaveLength(0)
  })

  it('unknown user -> reason=unknown-user before any work', async () => {
    const m = mou({ id: 'M-D', cohortStatus: 'archived' })
    const { deps, calls } = makeDeps({ mous: [m], users: [] })
    const res = await setCohortStatus(
      { mouId: 'M-D', target: 'active', changedBy: 'anish.d' },
      deps,
    )
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.reason).toBe('unknown-user')
    expect(calls).toHaveLength(0)
  })

  it('target equals current value -> reason=no-change, no audit, no queue write', async () => {
    const m = mou({ id: 'M-E', cohortStatus: 'archived' })
    const { deps, calls } = makeDeps({ mous: [m], users: [admin()] })
    const res = await setCohortStatus(
      { mouId: 'M-E', target: 'archived', changedBy: 'anish.d' },
      deps,
    )
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.reason).toBe('no-change')
    expect(calls).toHaveLength(0)
  })

  it('preserves existing auditLog entries (append-only)', async () => {
    const existingEntry = {
      timestamp: '2026-04-01T10:00:00.000Z',
      user: 'system',
      action: 'auto-link-exact-match' as const,
      notes: 'Imported.',
    }
    const m = mou({
      id: 'M-F',
      cohortStatus: 'active',
      auditLog: [existingEntry],
    })
    const { deps } = makeDeps({ mous: [m], users: [admin()] })
    const res = await setCohortStatus(
      { mouId: 'M-F', target: 'archived', changedBy: 'anish.d' },
      deps,
    )
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.mou.auditLog).toHaveLength(2)
      expect(res.mou.auditLog[0]).toEqual(existingEntry)
      expect(res.mou.auditLog[1]?.action).toBe('mou-cohort-status-changed')
    }
  })
})
