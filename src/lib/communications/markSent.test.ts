import { beforeEach, describe, expect, it, vi } from 'vitest'
import { markCommunicationSent, type MarkSentDeps } from './markSent'
import type { Communication, PendingUpdate, User } from '@/lib/types'

const FIXED_TS = '2026-04-26T10:00:00.000Z'

function user(role: User['role'], id = 'u'): User {
  return {
    id, name: id, email: `${id}@example.test`, role,
    testingOverride: false, active: true, passwordHash: 'X',
    createdAt: '', auditLog: [],
  }
}

function communication(overrides: Partial<Communication> = {}): Communication {
  return {
    id: 'COM-FBR-001', type: 'feedback-request', schoolId: 'SCH-X',
    mouId: 'MOU-X', installmentSeq: 1, channel: 'email',
    subject: 'Your feedback on STEAM at Greenfield', bodyEmail: '<html>...</html>',
    bodyWhatsApp: 'Hi Priya...', toEmail: 'spoc@example.test', toPhone: null,
    ccEmails: [], queuedAt: '2026-04-25T10:00:00Z', queuedBy: 'pradeep.r',
    sentAt: null, copiedAt: null, status: 'queued-for-manual',
    bounceDetail: null, auditLog: [],
    ...overrides,
  }
}

function makeDeps(opts: {
  communications: Communication[]
  users: User[]
}): { deps: MarkSentDeps; calls: Array<Record<string, unknown>> } {
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
      communications: opts.communications,
      users: opts.users,
      enqueue: enqueue as unknown as MarkSentDeps['enqueue'],
      now: () => new Date(FIXED_TS),
    },
    calls,
  }
}

describe('markCommunicationSent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('happy path: status flips to sent + sentAt set + audit entry appended', async () => {
    const u = user('OpsHead', 'pradeep.r')
    const { deps, calls } = makeDeps({
      communications: [communication()], users: [u],
    })
    const result = await markCommunicationSent(
      { communicationId: 'COM-FBR-001', markedBy: 'pradeep.r' },
      deps,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.communication.status).toBe('sent')
    expect(result.communication.sentAt).toBe(FIXED_TS)
    expect(result.communication.auditLog).toHaveLength(1)
    expect(result.communication.auditLog[0]?.action).toBe('status_change')
    expect(calls[0]).toMatchObject({ entity: 'communication', operation: 'update' })
  })

  it('Admin can mark sent (wildcard)', async () => {
    const u = user('Admin', 'anish.d')
    const { deps } = makeDeps({
      communications: [communication()], users: [u],
    })
    const result = await markCommunicationSent(
      { communicationId: 'COM-FBR-001', markedBy: 'anish.d' },
      deps,
    )
    expect(result.ok).toBe(true)
  })

  it('SalesHead is REJECTED (mou:send-feedback-request not granted)', async () => {
    const u = user('SalesHead', 'pratik.d')
    const { deps, calls } = makeDeps({
      communications: [communication()], users: [u],
    })
    const result = await markCommunicationSent(
      { communicationId: 'COM-FBR-001', markedBy: 'pratik.d' },
      deps,
    )
    expect(result).toEqual({ ok: false, reason: 'permission' })
    expect(calls).toHaveLength(0)
  })

  it('rejects already-sent (idempotency guard)', async () => {
    const u = user('OpsHead', 'pradeep.r')
    const { deps, calls } = makeDeps({
      communications: [communication({ status: 'sent', sentAt: '2026-04-25T11:00:00Z' })],
      users: [u],
    })
    const result = await markCommunicationSent(
      { communicationId: 'COM-FBR-001', markedBy: 'pradeep.r' },
      deps,
    )
    expect(result).toEqual({ ok: false, reason: 'already-sent' })
    expect(calls).toHaveLength(0)
  })

  it('rejects wrong-status when communication is in non-manual queue state', async () => {
    const u = user('OpsHead', 'pradeep.r')
    const { deps } = makeDeps({
      communications: [communication({ status: 'queued' })],  // automated queue, not manual
      users: [u],
    })
    const result = await markCommunicationSent(
      { communicationId: 'COM-FBR-001', markedBy: 'pradeep.r' },
      deps,
    )
    expect(result).toEqual({ ok: false, reason: 'wrong-status' })
  })

  it('rejects communication-not-found', async () => {
    const u = user('OpsHead', 'pradeep.r')
    const { deps } = makeDeps({ communications: [], users: [u] })
    const result = await markCommunicationSent(
      { communicationId: 'COM-NOPE', markedBy: 'pradeep.r' },
      deps,
    )
    expect(result).toEqual({ ok: false, reason: 'communication-not-found' })
  })

  it('rejects unknown user', async () => {
    const { deps } = makeDeps({ communications: [communication()], users: [] })
    const result = await markCommunicationSent(
      { communicationId: 'COM-FBR-001', markedBy: 'ghost' },
      deps,
    )
    expect(result).toEqual({ ok: false, reason: 'unknown-user' })
  })
})
