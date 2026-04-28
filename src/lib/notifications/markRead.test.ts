/*
 * W4-E.5 markRead + markAllRead tests.
 */

import { describe, expect, it, vi } from 'vitest'
import type { Notification, PendingUpdate, User } from '@/lib/types'
import { markRead, markAllRead, type MarkReadDeps } from './markRead'

const NOW = new Date('2026-04-28T12:00:00.000Z')

function user(id: string, role: User['role'] = 'OpsHead'): User {
  return {
    id,
    name: id,
    email: `${id}@getsetlearn.info`,
    role,
    testingOverride: false,
    active: true,
    passwordHash: 'X',
    createdAt: '2026-01-01T00:00:00Z',
    auditLog: [],
  }
}

function notification(id: string, recipientUserId: string, readAt: string | null = null): Notification {
  return {
    id,
    recipientUserId,
    senderUserId: 'someone-else',
    kind: 'dispatch-request-created',
    title: 't',
    body: 'b',
    actionUrl: '/x',
    payload: {},
    createdAt: NOW.toISOString(),
    readAt,
    auditLog: [],
  }
}

function makeDeps(overrides: Partial<MarkReadDeps> = {}): {
  deps: MarkReadDeps
  calls: PendingUpdate[]
} {
  const calls: PendingUpdate[] = []
  const enqueue = vi.fn(async (params) => {
    const entry: PendingUpdate = {
      id: 'P-' + Math.random().toString(36).slice(2, 8),
      queuedAt: NOW.toISOString(),
      retryCount: 0,
      ...params,
    }
    calls.push(entry)
    return entry
  }) as unknown as MarkReadDeps['enqueue']
  return {
    deps: {
      notifications: [],
      users: [],
      enqueue,
      now: () => NOW,
      ...overrides,
    },
    calls,
  }
}

describe('W4-E.5 markRead', () => {
  it('flips readAt when caller is the recipient', async () => {
    const u = user('opshead')
    const n = notification('NTF-1', u.id)
    const { deps, calls } = makeDeps({ notifications: [n], users: [u] })
    const result = await markRead({ notificationId: n.id, markedBy: u.id }, deps)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.notification.readAt).not.toBeNull()
    expect(result.notification.auditLog[0]!.action).toBe('notification-marked-read')
    expect(calls.length).toBe(1)
  })

  it('rejects when caller is not the recipient', async () => {
    const u = user('opshead')
    const other = user('other')
    const n = notification('NTF-1', u.id)
    const { deps } = makeDeps({ notifications: [n], users: [u, other] })
    const result = await markRead({ notificationId: n.id, markedBy: other.id }, deps)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('not-recipient')
  })

  it('idempotent: already-read returns already-read without writing', async () => {
    const u = user('opshead')
    const n = notification('NTF-1', u.id, NOW.toISOString())
    const { deps, calls } = makeDeps({ notifications: [n], users: [u] })
    const result = await markRead({ notificationId: n.id, markedBy: u.id }, deps)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('already-read')
    expect(calls.length).toBe(0)
  })
})

describe('W4-E.5 markAllRead', () => {
  it('updates every unread notification for the user; skips already-read', async () => {
    const u = user('opshead')
    const ns = [
      notification('NTF-1', u.id),
      notification('NTF-2', u.id, NOW.toISOString()),
      notification('NTF-3', u.id),
      notification('NTF-4', 'someone-else'),
    ]
    const { deps, calls } = makeDeps({ notifications: ns, users: [u] })
    const result = await markAllRead(u.id, deps)
    expect(result.updated).toBe(2)
    expect(calls.length).toBe(2)
  })
})
