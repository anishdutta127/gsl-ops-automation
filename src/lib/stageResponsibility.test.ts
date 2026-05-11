import { describe, expect, it, vi } from 'vitest'
import {
  getResponsibilityMatrix,
  getResponsiblePartyForMou,
  getStageResponsibility,
  updateStageResponsibility,
  userOverrideCount,
  type StageResponsibilityDeps,
} from './stageResponsibility'
import { STAGE_ORDER, type LifecycleStage } from './statusTracker'
import type {
  MOU,
  PendingUpdate,
  StageResponsibility,
} from '@/lib/types'

const FIXED_TS = '2026-05-11T10:00:00.000Z'

function row(
  stage: LifecycleStage,
  overrides: Partial<StageResponsibility> = {},
): StageResponsibility {
  return {
    stage,
    responsibleDepartment: 'ops',
    responsibleUserId: null,
    escalationDepartment: 'sales',
    notes: 'seed',
    updatedAt: FIXED_TS,
    updatedBy: 'seed',
    audit: [],
    ...overrides,
  }
}

function makeDeps(
  responsibility: Partial<Record<LifecycleStage, StageResponsibility>>,
): { deps: StageResponsibilityDeps; calls: Array<Record<string, unknown>> } {
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
      responsibility,
      enqueue: enqueue as unknown as StageResponsibilityDeps['enqueue'],
      now: () => new Date(FIXED_TS),
    },
    calls,
  }
}

function mou(overrides: Partial<MOU> = {}): MOU {
  return {
    id: 'MOU-1',
    schoolId: 'SCH-1',
    schoolName: 'Test',
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
    spWithoutTax: 4000,
    spWithTax: 5000,
    contractValue: 500000,
    received: 0,
    tds: 0,
    balance: 500000,
    receivedPct: 0,
    paymentSchedule: '',
    trainerModel: 'GSL-T',
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

describe('getStageResponsibility', () => {
  it('returns the configured row when present', () => {
    const { deps } = makeDeps({
      pipeline: row('pipeline', { responsibleDepartment: 'leadership' }),
    })
    expect(getStageResponsibility('pipeline', deps).responsibleDepartment).toBe(
      'leadership',
    )
  })

  it('falls back to the default mapping when stage is absent', () => {
    const { deps } = makeDeps({})
    const r = getStageResponsibility('pipeline', deps)
    expect(r.responsibleDepartment).toBe('sales')
    expect(r.escalationDepartment).toBe('leadership')
  })

  it('default fallback for finance closes mapping', () => {
    const { deps } = makeDeps({})
    const r = getStageResponsibility('closed', deps)
    expect(r.responsibleDepartment).toBe('finance')
    expect(r.escalationDepartment).toBe('leadership')
  })
})

describe('getResponsibilityMatrix', () => {
  it('returns a row for every stage in STAGE_ORDER', () => {
    const { deps } = makeDeps({})
    const m = getResponsibilityMatrix(deps)
    for (const s of STAGE_ORDER) {
      expect(m[s]).toBeDefined()
    }
  })

  it('honours configured overrides over defaults', () => {
    const { deps } = makeDeps({
      active: row('active', {
        responsibleDepartment: 'finance',
        responsibleUserId: 'u-1',
      }),
    })
    const m = getResponsibilityMatrix(deps)
    expect(m.active.responsibleUserId).toBe('u-1')
    expect(m.active.responsibleDepartment).toBe('finance')
  })
})

describe('getResponsiblePartyForMou', () => {
  it('uses the current MOU stage to pick the responsibility', () => {
    const { deps } = makeDeps({
      'mou-uploaded': row('mou-uploaded', { responsibleDepartment: 'sales' }),
    })
    const r = getResponsiblePartyForMou({
      mou: mou({ status: 'Active', studentsActual: null }),
      payments: [],
      dispatches: [],
      now: new Date(FIXED_TS),
      deps,
    })
    expect(r.stage).toBe('mou-uploaded')
    expect(r.responsibleDepartment).toBe('sales')
  })

  it('user override appears on the returned party', () => {
    const { deps } = makeDeps({
      'mou-uploaded': row('mou-uploaded', {
        responsibleDepartment: 'sales',
        responsibleUserId: 'gowri.s',
      }),
    })
    const r = getResponsiblePartyForMou({
      mou: mou({ status: 'Active', studentsActual: null }),
      payments: [],
      dispatches: [],
      now: new Date(FIXED_TS),
      deps,
    })
    expect(r.responsibleUserId).toBe('gowri.s')
  })
})

describe('updateStageResponsibility', () => {
  it('writes a change to the queue with an audit entry', async () => {
    const { deps, calls } = makeDeps({
      'mou-uploaded': row('mou-uploaded'),
    })
    const result = await updateStageResponsibility(
      {
        stage: 'mou-uploaded',
        patch: { responsibleDepartment: 'leadership' },
        actorUserId: 'anish.d',
      },
      deps,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.changedFields).toContain('responsibleDepartment')
    expect(result.updated.responsibleDepartment).toBe('leadership')
    expect(result.updated.audit).toHaveLength(1)
    expect(calls).toHaveLength(1)
    expect(calls[0]?.entity).toBe('stageResponsibility')
  })

  it('rejects an unknown stage', async () => {
    const { deps } = makeDeps({})
    const result = await updateStageResponsibility(
      {
        stage: 'not-a-stage' as LifecycleStage,
        patch: { responsibleDepartment: 'ops' },
        actorUserId: 'u',
      },
      deps,
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('unknown-stage')
  })

  it('rejects an invalid responsible department', async () => {
    const { deps } = makeDeps({})
    const result = await updateStageResponsibility(
      {
        stage: 'pipeline',
        patch: {
          responsibleDepartment: 'janitorial' as 'ops',
        },
        actorUserId: 'u',
      },
      deps,
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('invalid-department')
  })

  it('rejects when no fields actually change', async () => {
    const { deps } = makeDeps({
      pipeline: row('pipeline', {
        responsibleDepartment: 'sales',
        escalationDepartment: 'leadership',
        notes: 'unchanged',
      }),
    })
    const result = await updateStageResponsibility(
      {
        stage: 'pipeline',
        patch: { responsibleDepartment: 'sales', notes: 'unchanged' },
        actorUserId: 'u',
      },
      deps,
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('no-changes')
  })

  it('supports setting and clearing the user override', async () => {
    const { deps } = makeDeps({
      active: row('active', { responsibleUserId: null }),
    })
    const set = await updateStageResponsibility(
      {
        stage: 'active',
        patch: { responsibleUserId: 'misba.m' },
        actorUserId: 'anish.d',
      },
      deps,
    )
    expect(set.ok).toBe(true)
    if (!set.ok) return
    expect(set.updated.responsibleUserId).toBe('misba.m')

    // Now clear: pass the updated row back as the registry baseline so
    // the second update sees the prior state.
    const after = makeDeps({ active: set.updated })
    const cleared = await updateStageResponsibility(
      {
        stage: 'active',
        patch: { responsibleUserId: null },
        actorUserId: 'anish.d',
      },
      after.deps,
    )
    expect(cleared.ok).toBe(true)
    if (!cleared.ok) return
    expect(cleared.updated.responsibleUserId).toBeNull()
  })

  it('blank notes normalise to null', async () => {
    const { deps } = makeDeps({
      pipeline: row('pipeline', { notes: 'existing' }),
    })
    const result = await updateStageResponsibility(
      {
        stage: 'pipeline',
        patch: { notes: '   ' },
        actorUserId: 'u',
      },
      deps,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.updated.notes).toBeNull()
  })
})

describe('userOverrideCount', () => {
  it('counts stages with a user override set', () => {
    const matrix = {
      pipeline: row('pipeline', { responsibleUserId: 'u-1' }),
      'mou-uploaded': row('mou-uploaded', { responsibleUserId: null }),
      active: row('active', { responsibleUserId: 'u-2' }),
      'payment-pending': row('payment-pending'),
      'installment-1-received': row('installment-1-received'),
      'pi-generated': row('pi-generated'),
      'dispatch-requested': row('dispatch-requested'),
      'shipment-in-progress': row('shipment-in-progress'),
      delivered: row('delivered'),
      closed: row('closed'),
    } as Record<LifecycleStage, StageResponsibility>
    expect(userOverrideCount(matrix)).toBe(2)
  })

  it('returns 0 when no overrides set', () => {
    const matrix = STAGE_ORDER.reduce(
      (acc, s) => {
        acc[s] = row(s)
        return acc
      },
      {} as Record<LifecycleStage, StageResponsibility>,
    )
    expect(userOverrideCount(matrix)).toBe(0)
  })
})
