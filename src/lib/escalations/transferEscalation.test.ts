import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  claimEscalation,
  transferEscalation,
  type TransferEscalationDeps,
} from './transferEscalation'
import type { Escalation, PendingUpdate, User } from '@/lib/types'

const FIXED_TS = '2026-05-10T12:00:00.000Z'

function user(overrides: { id: string; role: User['role']; department?: User['department'] }): User {
  return {
    id: overrides.id,
    name: overrides.id,
    email: `${overrides.id}@example.test`,
    role: overrides.role,
    department: overrides.department,
    testingOverride: false,
    active: true,
    passwordHash: 'X',
    createdAt: '',
    auditLog: [],
  }
}

function esc(overrides: Partial<Escalation> = {}): Escalation {
  return {
    id: 'ESC-T',
    createdAt: '2026-04-01T00:00:00Z',
    createdBy: 'misba.m',
    schoolId: 'SCH-X',
    mouId: 'MOU-X',
    stage: 'kit-dispatch',
    lane: 'OPS',
    level: 'L2',
    origin: 'manual',
    originId: null,
    severity: 'medium',
    description: 'Sample',
    assignedTo: 'misba.m',
    notifiedEmails: [],
    status: 'Open',
    category: 'Other',
    type: 'Operational',
    ownedByDepartment: 'ops',
    waitingOn: null,
    resolutionNotes: null,
    resolvedAt: null,
    resolvedBy: null,
    auditLog: [],
    ...overrides,
  }
}

interface DepsFactory {
  escalations: Escalation[]
  users: User[]
}

function makeDeps({ escalations, users }: DepsFactory) {
  const enqueueMock = vi.fn(async () => ({ id: 'pq-1' }) as unknown as PendingUpdate)
  const deps: TransferEscalationDeps = {
    escalations,
    users,
    enqueue: enqueueMock,
    now: () => new Date(FIXED_TS),
  }
  return { deps, enqueueMock }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('transferEscalation', () => {
  it('flips status to Transferred, switches owner, clears assignedTo', async () => {
    const opsUser = user({ id: 'misba.m', role: 'OpsHead', department: 'ops' })
    const e = esc({ ownedByDepartment: 'ops', assignedTo: 'misba.m' })
    const { deps } = makeDeps({ escalations: [e], users: [opsUser] })
    const result = await transferEscalation(
      {
        id: 'ESC-T',
        targetDepartment: 'finance',
        reason: 'GSTIN missing; Finance owns capture.',
        transferredBy: 'misba.m',
      },
      deps,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.escalation.status).toBe('Transferred')
    expect(result.escalation.ownedByDepartment).toBe('finance')
    expect(result.escalation.transferredFromDepartment).toBe('ops')
    expect(result.escalation.transferredToDepartment).toBe('finance')
    expect(result.escalation.transferReason).toBe('GSTIN missing; Finance owns capture.')
    expect(result.escalation.assignedTo).toBeNull()
    expect(result.escalation.transferredAt).toBe(FIXED_TS)
  })

  it('rejects non-canManageEscalations callers (Leadership)', async () => {
    const ameet = user({ id: 'ameet.z', role: 'Leadership', department: null })
    const e = esc()
    const { deps } = makeDeps({ escalations: [e], users: [ameet] })
    const result = await transferEscalation(
      {
        id: 'ESC-T',
        targetDepartment: 'finance',
        reason: 'attempt',
        transferredBy: 'ameet.z',
      },
      deps,
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('permission')
  })

  it('rejects empty reason', async () => {
    const opsUser = user({ id: 'misba.m', role: 'OpsHead', department: 'ops' })
    const e = esc()
    const { deps } = makeDeps({ escalations: [e], users: [opsUser] })
    const result = await transferEscalation(
      {
        id: 'ESC-T',
        targetDepartment: 'finance',
        reason: '   ',
        transferredBy: 'misba.m',
      },
      deps,
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('missing-reason')
  })

  it('rejects transfer to same department', async () => {
    const opsUser = user({ id: 'misba.m', role: 'OpsHead', department: 'ops' })
    const e = esc({ ownedByDepartment: 'ops' })
    const { deps } = makeDeps({ escalations: [e], users: [opsUser] })
    const result = await transferEscalation(
      {
        id: 'ESC-T',
        targetDepartment: 'ops',
        reason: 'noop',
        transferredBy: 'misba.m',
      },
      deps,
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('same-department')
  })

  it('rejects transfer of Closed escalation', async () => {
    const opsUser = user({ id: 'misba.m', role: 'OpsHead', department: 'ops' })
    const e = esc({ status: 'Closed' })
    const { deps } = makeDeps({ escalations: [e], users: [opsUser] })
    const result = await transferEscalation(
      {
        id: 'ESC-T',
        targetDepartment: 'finance',
        reason: 'reopen?',
        transferredBy: 'misba.m',
      },
      deps,
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('already-closed')
  })

  it('appends an audit entry on success', async () => {
    const opsUser = user({ id: 'misba.m', role: 'OpsHead', department: 'ops' })
    const e = esc()
    const { deps } = makeDeps({ escalations: [e], users: [opsUser] })
    const result = await transferEscalation(
      {
        id: 'ESC-T',
        targetDepartment: 'finance',
        reason: 'finance owns',
        transferredBy: 'misba.m',
      },
      deps,
    )
    if (!result.ok) throw new Error('expected ok')
    const entries = result.escalation.auditLog
    expect(entries.length).toBe(1)
    expect(entries[0]?.action).toBe('update')
    expect(entries[0]?.notes).toContain('Transferred')
  })
})

describe('claimEscalation', () => {
  it('member of receiving department claims and flips to WIP', async () => {
    const finUser = user({ id: 'shubhangi.g', role: 'Finance', department: 'finance' })
    const e = esc({
      status: 'Transferred',
      ownedByDepartment: 'finance',
      transferredFromDepartment: 'ops',
      transferredToDepartment: 'finance',
      transferredAt: '2026-05-10T11:00:00Z',
      assignedTo: null,
    })
    const { deps } = makeDeps({ escalations: [e], users: [finUser] })
    const result = await claimEscalation(
      { id: 'ESC-T', claimedBy: 'shubhangi.g' },
      deps,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.escalation.status).toBe('WIP')
    expect(result.escalation.assignedTo).toBe('shubhangi.g')
  })

  it('rejects claim from wrong department', async () => {
    const opsUser = user({ id: 'misba.m', role: 'OpsHead', department: 'ops' })
    const e = esc({
      status: 'Transferred',
      ownedByDepartment: 'finance',
    })
    const { deps } = makeDeps({ escalations: [e], users: [opsUser] })
    const result = await claimEscalation(
      { id: 'ESC-T', claimedBy: 'misba.m' },
      deps,
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('wrong-department')
  })

  it('Admin with null department can claim regardless (cross-functional wildcard)', async () => {
    const anish = user({ id: 'anish.d', role: 'Admin', department: null })
    const e = esc({
      status: 'Transferred',
      ownedByDepartment: 'finance',
    })
    const { deps } = makeDeps({ escalations: [e], users: [anish] })
    const result = await claimEscalation(
      { id: 'ESC-T', claimedBy: 'anish.d' },
      deps,
    )
    expect(result.ok).toBe(true)
  })

  it('rejects claim when status is not Transferred', async () => {
    const finUser = user({ id: 'shubhangi.g', role: 'Finance', department: 'finance' })
    const e = esc({ status: 'Open', ownedByDepartment: 'finance' })
    const { deps } = makeDeps({ escalations: [e], users: [finUser] })
    const result = await claimEscalation(
      { id: 'ESC-T', claimedBy: 'shubhangi.g' },
      deps,
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('not-transferred')
  })
})
