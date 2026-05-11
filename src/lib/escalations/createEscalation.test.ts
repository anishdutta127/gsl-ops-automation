import { describe, expect, it, vi } from 'vitest'
import {
  createEscalation,
  type CreateEscalationDeps,
} from './createEscalation'
import type { Escalation, PendingUpdate, User } from '@/lib/types'

const FIXED_TS = '2026-05-11T10:00:00.000Z'

function user(role: User['role'], id = 'u'): User {
  return {
    id,
    name: id,
    email: `${id}@example.test`,
    role,
    testingOverride: false,
    active: true,
    passwordHash: 'X',
    createdAt: '',
    auditLog: [],
  }
}

function makeDeps(opts: { escalations: Escalation[]; users: User[] }):
{ deps: CreateEscalationDeps; calls: Array<Record<string, unknown>> } {
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
      escalations: opts.escalations,
      users: opts.users,
      enqueue: enqueue as unknown as CreateEscalationDeps['enqueue'],
      uuid: () => 'abcdef12-3456-7890-abcd-ef1234567890',
      now: () => new Date(FIXED_TS),
    },
    calls,
  }
}

describe('createEscalation', () => {
  it('creates a manual escalation with sla target from severity', async () => {
    const u = user('OpsHead', 'misba.m')
    const { deps, calls } = makeDeps({ escalations: [], users: [u] })

    const result = await createEscalation(
      {
        description: 'Kit delivery delayed past committed date.',
        severity: 'critical',
        category: 'Dispatch Delay',
        type: 'Operational',
        ownedByDepartment: 'ops',
        schoolId: 'SCH-1',
        mouId: 'MOU-1',
        assignedTo: null,
        createdBy: u.id,
      },
      deps,
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.escalation.origin).toBe('manual')
    expect(result.escalation.severity).toBe('critical')
    expect(result.escalation.lane).toBe('OPS')
    expect(result.escalation.level).toBe('L3') // critical -> L3
    expect(result.escalation.status).toBe('Open')
    expect(result.escalation.ownedByDepartment).toBe('ops')
    // sla target = createdAt + 24h for critical
    expect(result.escalation.slaTargetDate).toBe('2026-05-12T10:00:00.000Z')
    expect(result.escalation.auditLog).toHaveLength(1)
    expect(result.escalation.auditLog[0]?.action).toBe('create')
    expect(calls).toHaveLength(1)
    expect(calls[0]?.entity).toBe('escalation')
    expect(calls[0]?.operation).toBe('create')
  })

  it('finance dept escalations also land on OPS lane (Phase 1 collapse)', async () => {
    const u = user('Finance', 'pranav.p')
    const { deps } = makeDeps({ escalations: [], users: [u] })
    const result = await createEscalation(
      {
        description: 'Tally export reconciliation diverged.',
        severity: 'high',
        category: 'Payment Issue',
        type: 'Operational',
        ownedByDepartment: 'finance',
        schoolId: null,
        mouId: null,
        assignedTo: null,
        createdBy: u.id,
      },
      deps,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.escalation.lane).toBe('OPS')
    expect(result.escalation.ownedByDepartment).toBe('finance')
  })

  it('sales dept escalations land on SALES lane', async () => {
    const u = user('SalesHead', 'gowri.s')
    const { deps } = makeDeps({ escalations: [], users: [u] })
    const result = await createEscalation(
      {
        description: 'Need pricing confirmation on extended MOU.',
        severity: 'medium',
        category: 'Other',
        type: null,
        ownedByDepartment: 'sales',
        schoolId: null,
        mouId: null,
        assignedTo: null,
        createdBy: u.id,
      },
      deps,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.escalation.lane).toBe('SALES')
  })

  it('rejects missing description', async () => {
    const u = user('OpsHead', 'misba.m')
    const { deps } = makeDeps({ escalations: [], users: [u] })
    const result = await createEscalation(
      {
        description: '   ',
        severity: 'medium',
        category: null,
        type: null,
        ownedByDepartment: 'ops',
        schoolId: null,
        mouId: null,
        assignedTo: null,
        createdBy: u.id,
      },
      deps,
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('missing-description')
  })

  it('rejects invalid department', async () => {
    const u = user('OpsHead', 'misba.m')
    const { deps } = makeDeps({ escalations: [], users: [u] })
    const result = await createEscalation(
      {
        description: 'x',
        severity: 'medium',
        category: null,
        type: null,
        ownedByDepartment: 'marketing' as 'ops',
        schoolId: null,
        mouId: null,
        assignedTo: null,
        createdBy: u.id,
      },
      deps,
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('invalid-department')
  })

  it('rejects unknown user', async () => {
    const { deps } = makeDeps({ escalations: [], users: [] })
    const result = await createEscalation(
      {
        description: 'x',
        severity: 'medium',
        category: null,
        type: null,
        ownedByDepartment: 'ops',
        schoolId: null,
        mouId: null,
        assignedTo: null,
        createdBy: 'ghost',
      },
      deps,
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('unknown-user')
  })

  it('respects permission gate (a baseline user has escalation:create)', async () => {
    const u = user('SalesRep', 'sales.rep')
    const { deps } = makeDeps({ escalations: [], users: [u] })
    const result = await createEscalation(
      {
        description: 'SalesRep raising a ticket.',
        severity: 'low',
        category: 'Other',
        type: null,
        ownedByDepartment: 'ops',
        schoolId: null,
        mouId: null,
        assignedTo: null,
        createdBy: u.id,
      },
      deps,
    )
    expect(result.ok).toBe(true)
  })

  it('severity to level mapping covers all four tiers', async () => {
    const u = user('OpsHead', 'misba.m')
    const fixtures: Array<{
      severity: 'critical' | 'high' | 'medium' | 'low'
      level: 'L1' | 'L2' | 'L3'
    }> = [
      { severity: 'critical', level: 'L3' },
      { severity: 'high', level: 'L2' },
      { severity: 'medium', level: 'L1' },
      { severity: 'low', level: 'L1' },
    ]
    for (const fx of fixtures) {
      const { deps } = makeDeps({ escalations: [], users: [u] })
      const result = await createEscalation(
        {
          description: 'x',
          severity: fx.severity,
          category: null,
          type: null,
          ownedByDepartment: 'ops',
          schoolId: null,
          mouId: null,
          assignedTo: null,
          createdBy: u.id,
        },
        deps,
      )
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.escalation.level).toBe(fx.level)
    }
  })
})
