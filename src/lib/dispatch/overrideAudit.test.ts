/*
 * Q-G Test 8: dispatch p2-override audit + acknowledgement.
 *
 * Drives src/lib/dispatch/overrideAudit.ts against a stubbed deps
 * bundle: tests construct synthetic Dispatch + User arrays, an
 * enqueue spy, fixed clock, and fixed uuid generator. JSON fixtures
 * are not touched. Coverage:
 *
 *   - Happy path (Leadership user; locked gate; valid reason).
 *   - All four reject paths on writeOverrideAudit.
 *   - Escalation pair: shape, lane, level, severity, stage, origin,
 *     assignedTo (lane head per escalationLevelDefault).
 *   - Acknowledgement happy path + three reject paths.
 *   - Gate predicate semantics (paid OR override).
 */

import { describe, expect, it, vi } from 'vitest'
import {
  isGateUnblocked,
  OverrideAuditError,
  writeOverrideAcknowledgement,
  writeOverrideAudit,
  type OverrideAuditDeps,
} from './overrideAudit'
import type {
  Dispatch,
  DispatchOverrideEvent,
  PendingUpdate,
  User,
} from '@/lib/types'

const FIXED_TS = '2026-04-25T10:00:00.000Z'
const FIXED_DATE = new Date(FIXED_TS)
const FIXED_UUID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'

function ameetUser(): User {
  return {
    id: 'ameet.z',
    name: 'Ameet Zaveri',
    email: 'ameet.z@example.test',
    role: 'Leadership',
    testingOverride: false,
    active: true,
    passwordHash: 'X',
    createdAt: '2026-01-01T00:00:00Z',
    auditLog: [],
  }
}

function misbaUser(): User {
  return {
    id: 'misba.m',
    name: 'Misba M.',
    email: 'misba.m@example.test',
    role: 'OpsEmployee',
    testingOverride: true,
    testingOverridePermissions: ['OpsHead'],
    active: true,
    passwordHash: 'X',
    createdAt: '2026-01-01T00:00:00Z',
    auditLog: [],
  }
}

function shubhangiUser(): User {
  return {
    id: 'shubhangi.g',
    name: 'Shubhangi G.',
    email: 'shubhangi.g@example.test',
    role: 'Finance',
    testingOverride: false,
    active: true,
    passwordHash: 'X',
    createdAt: '2026-01-01T00:00:00Z',
    auditLog: [],
  }
}

function pendingDispatch(overrides: Partial<Dispatch> = {}): Dispatch {
  return {
    id: 'DIS-TEST-001',
    mouId: 'MOU-TEST-001',
    schoolId: 'SCH-TEST',
    installmentSeq: 1,
    stage: 'pending',
    installment1Paid: false,
    overrideEvent: null,
    poRaisedAt: null,
    dispatchedAt: null,
    deliveredAt: null,
    acknowledgedAt: null,
    acknowledgementUrl: null,
    notes: null,
    lineItems: [{ kind: 'flat', skuName: 'Test SKU', quantity: 1 }],
    requestId: null,
    raisedBy: 'system-test',
    raisedFrom: 'ops-direct',
    auditLog: [],
    ...overrides,
  }
}

interface EnqueueCall {
  queuedBy: string
  entity: string
  operation: string
  payload: Record<string, unknown>
}

function makeDeps(opts: {
  dispatches: Dispatch[]
  users: User[]
}): { deps: OverrideAuditDeps; calls: EnqueueCall[] } {
  const calls: EnqueueCall[] = []
  const enqueue = vi.fn(async (params: EnqueueCall): Promise<PendingUpdate> => {
    calls.push(params)
    return {
      id: 'pending-stub',
      queuedAt: FIXED_TS,
      queuedBy: params.queuedBy,
      entity: params.entity as PendingUpdate['entity'],
      operation: params.operation as PendingUpdate['operation'],
      payload: params.payload,
      retryCount: 0,
    }
  })
  const deps: OverrideAuditDeps = {
    dispatches: opts.dispatches,
    users: opts.users,
    enqueue: enqueue as unknown as OverrideAuditDeps['enqueue'],
    now: () => FIXED_DATE,
    uuid: () => FIXED_UUID,
  }
  return { deps, calls }
}

describe('Q-G Test 8: writeOverrideAudit', () => {
  it('happy path: Leadership user, locked gate, valid reason -> overrideEvent + auditLog + escalation', async () => {
    const dispatch = pendingDispatch()
    const { deps, calls } = makeDeps({
      dispatches: [dispatch],
      users: [ameetUser()],
    })

    const result = await writeOverrideAudit(
      {
        dispatchId: 'DIS-TEST-001',
        overriddenBy: 'ameet.z',
        reason: 'Pilot kicks off 28-Apr; payment in transit',
      },
      deps,
    )

    expect(result.dispatch.overrideEvent).toEqual({
      overriddenBy: 'ameet.z',
      overriddenAt: FIXED_TS,
      reason: 'Pilot kicks off 28-Apr; payment in transit',
      acknowledgedBy: null,
      acknowledgedAt: null,
    })

    expect(result.dispatch.auditLog).toHaveLength(1)
    expect(result.dispatch.auditLog[0]).toMatchObject({
      timestamp: FIXED_TS,
      user: 'ameet.z',
      action: 'p2-override',
      before: { overrideEvent: null },
    })
    expect(result.dispatch.auditLog[0]?.after).toMatchObject({
      overrideEvent: {
        overriddenBy: 'ameet.z',
        reason: 'Pilot kicks off 28-Apr; payment in transit',
      },
    })

    // Both writes enqueued: dispatch update + escalation create.
    expect(calls).toHaveLength(2)
    expect(calls[0]).toMatchObject({
      queuedBy: 'ameet.z',
      entity: 'dispatch',
      operation: 'update',
    })
    expect(calls[1]).toMatchObject({
      queuedBy: 'ameet.z',
      entity: 'escalation',
      operation: 'create',
    })
  })

  it('escalation has the correct origin/originId/lane/level/severity/stage/assignedTo', async () => {
    const dispatch = pendingDispatch({ schoolId: 'SCH-X', mouId: 'MOU-X' })
    const { deps } = makeDeps({
      dispatches: [dispatch],
      users: [ameetUser(), misbaUser()],
    })

    const { escalation } = await writeOverrideAudit(
      {
        dispatchId: 'DIS-TEST-001',
        overriddenBy: 'ameet.z',
        reason: 'P2 override for pilot timing',
      },
      deps,
    )

    expect(escalation).toMatchObject({
      createdAt: FIXED_TS,
      createdBy: 'ameet.z',
      schoolId: 'SCH-X',
      mouId: 'MOU-X',
      stage: 'kit-dispatch',
      lane: 'OPS',
      level: 'L2',
      origin: 'p2-override',
      originId: 'DIS-TEST-001',
      severity: 'medium',
      assignedTo: 'misba.m',
      notifiedEmails: ['misba.m@example.test'],
      status: 'Open',
    })
    expect(escalation.id.startsWith('ESC-OVR-')).toBe(true)
    expect(escalation.auditLog).toHaveLength(1)
    expect(escalation.auditLog[0]?.action).toBe('create')
  })

  it('rejects empty reason (UI-enforced, server-defended)', async () => {
    const { deps } = makeDeps({
      dispatches: [pendingDispatch()],
      users: [ameetUser()],
    })
    await expect(
      writeOverrideAudit(
        { dispatchId: 'DIS-TEST-001', overriddenBy: 'ameet.z', reason: '' },
        deps,
      ),
    ).rejects.toThrow(OverrideAuditError)
  })

  it('rejects whitespace-only reason', async () => {
    const { deps } = makeDeps({
      dispatches: [pendingDispatch()],
      users: [ameetUser()],
    })
    await expect(
      writeOverrideAudit(
        { dispatchId: 'DIS-TEST-001', overriddenBy: 'ameet.z', reason: '   \t  ' },
        deps,
      ),
    ).rejects.toThrow(/mandatory/)
  })

  it('rejects non-Leadership user (misba.m via OpsHead testingOverride is not allowed)', async () => {
    const { deps, calls } = makeDeps({
      dispatches: [pendingDispatch()],
      users: [misbaUser()],
    })
    await expect(
      writeOverrideAudit(
        { dispatchId: 'DIS-TEST-001', overriddenBy: 'misba.m', reason: 'attempt' },
        deps,
      ),
    ).rejects.toThrow(/permission/)
    expect(calls).toHaveLength(0)
  })

  it('rejects when gate is already unlocked (installment1Paid=true)', async () => {
    const { deps } = makeDeps({
      dispatches: [pendingDispatch({ installment1Paid: true })],
      users: [ameetUser()],
    })
    await expect(
      writeOverrideAudit(
        { dispatchId: 'DIS-TEST-001', overriddenBy: 'ameet.z', reason: 'r' },
        deps,
      ),
    ).rejects.toThrow(/already unlocked/)
  })

  it('rejects when overrideEvent already set (idempotency)', async () => {
    const existing: DispatchOverrideEvent = {
      overriddenBy: 'ameet.z',
      overriddenAt: '2026-04-23T16:25:00Z',
      reason: 'previous',
      acknowledgedBy: null,
      acknowledgedAt: null,
    }
    const { deps } = makeDeps({
      dispatches: [pendingDispatch({ overrideEvent: existing })],
      users: [ameetUser()],
    })
    await expect(
      writeOverrideAudit(
        { dispatchId: 'DIS-TEST-001', overriddenBy: 'ameet.z', reason: 'r' },
        deps,
      ),
    ).rejects.toThrow(/already has an overrideEvent/)
  })

  it('rejects unknown dispatchId', async () => {
    const { deps } = makeDeps({
      dispatches: [pendingDispatch()],
      users: [ameetUser()],
    })
    await expect(
      writeOverrideAudit(
        { dispatchId: 'DIS-DOES-NOT-EXIST', overriddenBy: 'ameet.z', reason: 'r' },
        deps,
      ),
    ).rejects.toThrow(/Dispatch not found/)
  })

  it('rejects unknown user id', async () => {
    const { deps } = makeDeps({
      dispatches: [pendingDispatch()],
      users: [ameetUser()],
    })
    await expect(
      writeOverrideAudit(
        { dispatchId: 'DIS-TEST-001', overriddenBy: 'ghost', reason: 'r' },
        deps,
      ),
    ).rejects.toThrow(/User not found/)
  })
})

describe('Q-G Test 8: writeOverrideAcknowledgement', () => {
  function dispatchWithOverride(): Dispatch {
    return pendingDispatch({
      overrideEvent: {
        overriddenBy: 'ameet.z',
        overriddenAt: '2026-04-23T16:25:00Z',
        reason: 'Prior override reason',
        acknowledgedBy: null,
        acknowledgedAt: null,
      },
    })
  }

  it('happy path: Finance user acknowledges existing override', async () => {
    const dispatch = dispatchWithOverride()
    const { deps, calls } = makeDeps({
      dispatches: [dispatch],
      users: [shubhangiUser()],
    })

    const updated = await writeOverrideAcknowledgement(
      { dispatchId: 'DIS-TEST-001', acknowledgedBy: 'shubhangi.g' },
      deps,
    )

    expect(updated.overrideEvent).toMatchObject({
      acknowledgedBy: 'shubhangi.g',
      acknowledgedAt: FIXED_TS,
      reason: 'Prior override reason',
    })
    expect(updated.auditLog).toHaveLength(1)
    expect(updated.auditLog[0]).toMatchObject({
      action: 'p2-override-acknowledged',
      user: 'shubhangi.g',
    })

    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({ entity: 'dispatch', operation: 'update' })
  })

  it('acknowledgement does not unblock or re-block the gate', async () => {
    const before = dispatchWithOverride()
    expect(isGateUnblocked(before)).toBe(true)

    const { deps } = makeDeps({
      dispatches: [before],
      users: [shubhangiUser()],
    })
    const after = await writeOverrideAcknowledgement(
      { dispatchId: 'DIS-TEST-001', acknowledgedBy: 'shubhangi.g' },
      deps,
    )
    expect(isGateUnblocked(after)).toBe(true)
  })

  it('rejects when no overrideEvent exists', async () => {
    const { deps } = makeDeps({
      dispatches: [pendingDispatch()],
      users: [shubhangiUser()],
    })
    await expect(
      writeOverrideAcknowledgement(
        { dispatchId: 'DIS-TEST-001', acknowledgedBy: 'shubhangi.g' },
        deps,
      ),
    ).rejects.toThrow(/no overrideEvent/)
  })

  it('rejects when already acknowledged', async () => {
    const acked = pendingDispatch({
      overrideEvent: {
        overriddenBy: 'ameet.z',
        overriddenAt: '2026-04-23T16:25:00Z',
        reason: 'r',
        acknowledgedBy: 'shubhangi.g',
        acknowledgedAt: '2026-04-24T10:00:00Z',
      },
    })
    const { deps } = makeDeps({
      dispatches: [acked],
      users: [shubhangiUser()],
    })
    await expect(
      writeOverrideAcknowledgement(
        { dispatchId: 'DIS-TEST-001', acknowledgedBy: 'shubhangi.g' },
        deps,
      ),
    ).rejects.toThrow(/already acknowledged/)
  })

  it('rejects non-Finance user (misba.m has no dispatch:acknowledge-override)', async () => {
    const { deps } = makeDeps({
      dispatches: [dispatchWithOverride()],
      users: [misbaUser()],
    })
    await expect(
      writeOverrideAcknowledgement(
        { dispatchId: 'DIS-TEST-001', acknowledgedBy: 'misba.m' },
        deps,
      ),
    ).rejects.toThrow(/permission/)
  })
})

describe('isGateUnblocked', () => {
  it('returns true when installment1Paid is true', () => {
    expect(isGateUnblocked(pendingDispatch({ installment1Paid: true }))).toBe(true)
  })

  it('returns true when overrideEvent is set', () => {
    expect(
      isGateUnblocked(
        pendingDispatch({
          overrideEvent: {
            overriddenBy: 'ameet.z',
            overriddenAt: FIXED_TS,
            reason: 'r',
            acknowledgedBy: null,
            acknowledgedAt: null,
          },
        }),
      ),
    ).toBe(true)
  })

  it('returns false when neither paid nor overridden', () => {
    expect(isGateUnblocked(pendingDispatch())).toBe(false)
  })
})
