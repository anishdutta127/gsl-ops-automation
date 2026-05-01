import { beforeEach, describe, expect, it, vi } from 'vitest'
import { editEscalation, type EditEscalationDeps } from './editEscalation'
import type { Escalation, PendingUpdate, User } from '@/lib/types'

const FIXED_TS = '2026-05-01T10:00:00.000Z'

function user(role: User['role'], id = 'u'): User {
  return {
    id, name: id, email: `${id}@example.test`, role,
    testingOverride: false, active: true, passwordHash: 'X',
    createdAt: '', auditLog: [],
  }
}

function esc(overrides: Partial<Escalation> = {}): Escalation {
  return {
    id: 'ESC-X',
    createdAt: '2026-04-01T00:00:00Z',
    createdBy: 'pratik.d',
    schoolId: 'SCH-X',
    mouId: 'MOU-X',
    stage: 'kit-dispatch',
    lane: 'OPS',
    level: 'L2',
    origin: 'manual',
    originId: null,
    severity: 'medium',
    description: 'Sample escalation.',
    assignedTo: 'misba.m',
    notifiedEmails: [],
    status: 'Open',
    category: null,
    type: null,
    resolutionNotes: null,
    resolvedAt: null,
    resolvedBy: null,
    auditLog: [],
    ...overrides,
  }
}

function makeDeps(opts: { escalations: Escalation[]; users: User[] }):
{ deps: EditEscalationDeps; calls: Array<Record<string, unknown>> } {
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
      escalations: opts.escalations, users: opts.users,
      enqueue: enqueue as unknown as EditEscalationDeps['enqueue'],
      now: () => new Date(FIXED_TS),
    },
    calls,
  }
}

describe('editEscalation', () => {
  beforeEach(() => vi.clearAllMocks())

  it('happy path: OpsHead changes status -> queued + audit', async () => {
    const u = user('OpsHead', 'misba.m')
    const { deps, calls } = makeDeps({ escalations: [esc()], users: [u] })
    const result = await editEscalation(
      { id: 'ESC-X', editedBy: 'misba.m', patch: { status: 'WIP' } },
      deps,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.escalation.status).toBe('WIP')
    expect(result.changedFields).toEqual(['status'])
    expect(result.escalation.auditLog).toHaveLength(1)
    expect(result.escalation.auditLog[0]!.action).toBe('escalation-edited')
    expect(result.escalation.auditLog[0]!.before).toEqual({ status: 'Open' })
    expect(result.escalation.auditLog[0]!.after).toEqual({ status: 'WIP' })
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({ entity: 'escalation', operation: 'update' })
  })

  it('captures category and type as free text', async () => {
    const u = user('OpsHead', 'misba.m')
    const { deps } = makeDeps({ escalations: [esc()], users: [u] })
    const result = await editEscalation(
      {
        id: 'ESC-X', editedBy: 'misba.m',
        patch: { category: 'Logistics', type: 'Courier delay' },
      },
      deps,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.escalation.category).toBe('Logistics')
    expect(result.escalation.type).toBe('Courier delay')
    expect(result.changedFields).toEqual(['category', 'type'])
  })

  it('blank category/type normalises to null', async () => {
    const u = user('OpsHead', 'misba.m')
    const e = esc({ category: 'X', type: 'Y' })
    const { deps } = makeDeps({ escalations: [e], users: [u] })
    const result = await editEscalation(
      { id: 'ESC-X', editedBy: 'misba.m', patch: { category: '   ', type: '' } },
      deps,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.escalation.category).toBeNull()
    expect(result.escalation.type).toBeNull()
  })

  it('all 6 status values are valid', async () => {
    const u = user('OpsHead', 'misba.m')
    const statuses = ['Open', 'WIP', 'Closed', 'Transfer to Other Department', 'Dispatched', 'In Transit'] as const
    for (const status of statuses) {
      const { deps } = makeDeps({ escalations: [esc({ status: 'Open' })], users: [u] })
      const result = await editEscalation(
        { id: 'ESC-X', editedBy: 'misba.m', patch: { status } },
        deps,
      )
      // 'Open' -> 'Open' has no changes; everything else should accept.
      if (status === 'Open') {
        expect(result).toEqual({ ok: false, reason: 'no-changes' })
      } else {
        expect(result.ok).toBe(true)
      }
    }
  })

  it('rejects invalid status with invalid-status', async () => {
    const u = user('OpsHead', 'misba.m')
    const { deps } = makeDeps({ escalations: [esc()], users: [u] })
    const result = await editEscalation(
      { id: 'ESC-X', editedBy: 'misba.m', patch: { status: 'GibberishStatus' as never } },
      deps,
    )
    expect(result).toEqual({ ok: false, reason: 'invalid-status' })
  })

  it('flipping to Closed auto-populates resolvedAt and resolvedBy', async () => {
    const u = user('OpsHead', 'misba.m')
    const { deps } = makeDeps({ escalations: [esc({ status: 'WIP' })], users: [u] })
    const result = await editEscalation(
      { id: 'ESC-X', editedBy: 'misba.m', patch: { status: 'Closed', resolutionNotes: 'Fixed' } },
      deps,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.escalation.status).toBe('Closed')
    expect(result.escalation.resolvedAt).toBe(FIXED_TS)
    expect(result.escalation.resolvedBy).toBe('misba.m')
    expect(result.changedFields).toContain('resolvedAt')
    expect(result.changedFields).toContain('resolvedBy')
  })

  it('editing a Closed escalation does NOT re-stamp resolvedAt/resolvedBy', async () => {
    const u = user('OpsHead', 'misba.m')
    const original = esc({
      status: 'Closed', resolvedAt: '2026-04-12T10:00:00Z', resolvedBy: 'ameet.z',
    })
    const { deps } = makeDeps({ escalations: [original], users: [u] })
    const result = await editEscalation(
      { id: 'ESC-X', editedBy: 'misba.m', patch: { category: 'Logistics' } },
      deps,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.escalation.resolvedAt).toBe('2026-04-12T10:00:00Z')
    expect(result.escalation.resolvedBy).toBe('ameet.z')
  })

  it('SalesRep is rejected with permission', async () => {
    const u = user('SalesRep', 'sp-x')
    const { deps, calls } = makeDeps({ escalations: [esc()], users: [u] })
    const result = await editEscalation(
      { id: 'ESC-X', editedBy: 'sp-x', patch: { status: 'WIP' } },
      deps,
    )
    expect(result).toEqual({ ok: false, reason: 'permission' })
    expect(calls).toHaveLength(0)
  })

  it('OpsEmployee is rejected with permission (no escalation:resolve grant)', async () => {
    const u = user('OpsEmployee', 'ops-x')
    const { deps } = makeDeps({ escalations: [esc()], users: [u] })
    const result = await editEscalation(
      { id: 'ESC-X', editedBy: 'ops-x', patch: { status: 'WIP' } },
      deps,
    )
    expect(result).toEqual({ ok: false, reason: 'permission' })
  })

  it('rejects unknown user', async () => {
    const { deps } = makeDeps({ escalations: [esc()], users: [] })
    const result = await editEscalation(
      { id: 'ESC-X', editedBy: 'ghost', patch: { status: 'WIP' } },
      deps,
    )
    expect(result).toEqual({ ok: false, reason: 'unknown-user' })
  })

  it('rejects escalation-not-found', async () => {
    const u = user('OpsHead', 'misba.m')
    const { deps } = makeDeps({ escalations: [], users: [u] })
    const result = await editEscalation(
      { id: 'ESC-NOPE', editedBy: 'misba.m', patch: { status: 'WIP' } },
      deps,
    )
    expect(result).toEqual({ ok: false, reason: 'escalation-not-found' })
  })

  it('rejects empty description with missing-description', async () => {
    const u = user('OpsHead', 'misba.m')
    const { deps } = makeDeps({ escalations: [esc()], users: [u] })
    const result = await editEscalation(
      { id: 'ESC-X', editedBy: 'misba.m', patch: { description: '   ' } },
      deps,
    )
    expect(result).toEqual({ ok: false, reason: 'missing-description' })
  })

  it('no-op patch returns no-changes', async () => {
    const u = user('OpsHead', 'misba.m')
    const { deps, calls } = makeDeps({ escalations: [esc()], users: [u] })
    const result = await editEscalation(
      { id: 'ESC-X', editedBy: 'misba.m', patch: {} },
      deps,
    )
    expect(result).toEqual({ ok: false, reason: 'no-changes' })
    expect(calls).toHaveLength(0)
  })

  it('editing severity is captured in changedFields + audit', async () => {
    const u = user('OpsHead', 'misba.m')
    const { deps } = makeDeps({ escalations: [esc()], users: [u] })
    const result = await editEscalation(
      { id: 'ESC-X', editedBy: 'misba.m', patch: { severity: 'high' } },
      deps,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.escalation.severity).toBe('high')
    expect(result.changedFields).toEqual(['severity'])
  })

  it('rejects invalid severity', async () => {
    const u = user('OpsHead', 'misba.m')
    const { deps } = makeDeps({ escalations: [esc()], users: [u] })
    const result = await editEscalation(
      { id: 'ESC-X', editedBy: 'misba.m', patch: { severity: 'critical' as never } },
      deps,
    )
    expect(result).toEqual({ ok: false, reason: 'invalid-severity' })
  })
})
