/*
 * W4-E.5 createNotification + broadcastNotification tests.
 *
 * Coverage:
 *   - happy path: single recipient + broadcast both produce records
 *   - self-exclusion (real user): senderUserId === recipientUserId
 *   - system bypass: senderUserId === 'system' does NOT exclude
 *   - inactive recipient skipped
 *   - unknown recipient skipped
 *   - dedup window: second call within window deduplicates
 *   - dedup window: same kind, different relatedEntityId fires twice
 *   - payload validator rejects missing fields
 */

import { describe, expect, it, vi } from 'vitest'
import type {
  Notification,
  PendingUpdate,
  User,
} from '@/lib/types'
import {
  broadcastNotification,
  createNotification,
  recipientsByRole,
  type CreateNotificationDeps,
} from './createNotification'

const NOW = new Date('2026-04-28T12:00:00.000Z')

function user(id: string, role: User['role'] = 'OpsHead', overrides: Partial<User> = {}): User {
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
    ...overrides,
  }
}

function makeDeps(overrides: Partial<CreateNotificationDeps> = {}): {
  deps: CreateNotificationDeps
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
  }) as unknown as CreateNotificationDeps['enqueue']
  let counter = 0
  return {
    deps: {
      notifications: [],
      users: [],
      enqueue,
      uuid: () => `uuid${++counter}`,
      now: () => NOW,
      dedupWindowMs: 60_000,
      ...overrides,
    },
    calls,
  }
}

const VALID_DR_PAYLOAD = {
  requestId: 'DR-1',
  requesterName: 'Vikram',
  mouId: 'MOU-1',
  schoolName: 'Test School',
  installmentSeq: 1,
  lineItemCount: 2,
  totalQuantity: 50,
}

describe('W4-E.5 createNotification: happy path', () => {
  it('writes a Notification with create audit and enqueues for the queue path', async () => {
    const recipient = user('opshead', 'OpsHead')
    const sender = user('vishwanath.g', 'SalesRep')
    const { deps, calls } = makeDeps({ users: [recipient, sender] })

    const result = await createNotification(
      {
        recipientUserId: recipient.id,
        senderUserId: sender.id,
        kind: 'dispatch-request-created',
        title: 'Test',
        body: 'Test body',
        actionUrl: '/admin/dispatch-requests/DR-1',
        payload: VALID_DR_PAYLOAD,
        relatedEntityId: 'DR-1',
      },
      deps,
    )

    expect(result.created.length).toBe(1)
    expect(result.skipped).toEqual([])
    const n = result.created[0]!
    expect(n.recipientUserId).toBe(recipient.id)
    expect(n.senderUserId).toBe(sender.id)
    expect(n.readAt).toBeNull()
    expect(n.auditLog[0]!.action).toBe('create')
    expect(calls.length).toBe(1)
    expect(calls[0]!.entity).toBe('notification')
  })
})

describe('W4-E.5 self-exclusion', () => {
  it('drops the recipient when senderUserId === recipientUserId (real user)', async () => {
    const u = user('pradeep.r', 'Admin')
    const { deps, calls } = makeDeps({ users: [u] })

    const result = await createNotification(
      {
        recipientUserId: u.id,
        senderUserId: u.id,
        kind: 'dispatch-request-approved',
        title: 'Self',
        body: '',
        actionUrl: '/x',
        payload: {
          requestId: 'DR-1',
          reviewerName: u.name,
          mouId: 'MOU-1',
          schoolName: 'X',
          conversionDispatchId: 'DSP-1',
        },
        relatedEntityId: 'DR-1',
      },
      deps,
    )

    expect(result.created).toEqual([])
    expect(result.skipped).toEqual([{ recipientUserId: u.id, reason: 'self' }])
    expect(calls.length).toBe(0)
  })

  it('does NOT exclude when senderUserId is system (broadcast fires for system-affected user)', async () => {
    const u = user('misba.m', 'Admin')
    const { deps, calls } = makeDeps({ users: [u] })

    const result = await createNotification(
      {
        recipientUserId: u.id,
        senderUserId: 'system',
        kind: 'escalation-assigned',
        title: 'Escalation',
        body: 'kit-condition rating 1',
        actionUrl: '/escalations/ESC-1',
        payload: {
          escalationId: 'ESC-1',
          mouId: 'MOU-1',
          schoolName: null,
          lane: 'OPS',
          level: 'L1',
          severity: 'high',
          description: 'kit-condition rating 1 for installment 1; auto-escalated.',
        },
        relatedEntityId: 'ESC-1',
      },
      deps,
    )

    expect(result.created.length).toBe(1)
    expect(result.skipped).toEqual([])
    expect(calls.length).toBe(1)
  })
})

describe('W4-E.5 recipient gates', () => {
  it('skips inactive recipients', async () => {
    const u = user('inactive', 'OpsHead', { active: false })
    const sender = user('sender', 'Admin')
    const { deps } = makeDeps({ users: [u, sender] })

    const result = await createNotification(
      {
        recipientUserId: u.id,
        senderUserId: sender.id,
        kind: 'dispatch-request-approved',
        title: 'X', body: 'X', actionUrl: '/x',
        payload: {
          requestId: 'DR-1', reviewerName: 'X',
          mouId: 'MOU-1', schoolName: 'X', conversionDispatchId: 'DSP-1',
        },
        relatedEntityId: 'DR-1',
      },
      deps,
    )
    expect(result.skipped[0]?.reason).toBe('inactive-recipient')
  })

  it('skips unknown recipients (not in users.json)', async () => {
    const sender = user('sender', 'Admin')
    const { deps } = makeDeps({ users: [sender] })
    const result = await createNotification(
      {
        recipientUserId: 'not-in-users',
        senderUserId: sender.id,
        kind: 'dispatch-request-approved',
        title: 'X', body: 'X', actionUrl: '/x',
        payload: {
          requestId: 'DR-1', reviewerName: 'X',
          mouId: 'MOU-1', schoolName: 'X', conversionDispatchId: 'DSP-1',
        },
        relatedEntityId: 'DR-1',
      },
      deps,
    )
    expect(result.skipped[0]?.reason).toBe('unknown-recipient')
  })
})

describe('W4-E.5 dedup window', () => {
  it('second call within window deduplicates same kind+recipient+entity', async () => {
    const recipient = user('opshead', 'OpsHead')
    const sender = user('sender', 'Admin')
    const existing: Notification = {
      id: 'NTF-old',
      recipientUserId: recipient.id,
      senderUserId: sender.id,
      kind: 'dispatch-request-created',
      title: 'old',
      body: 'old',
      actionUrl: '/x',
      payload: { ...VALID_DR_PAYLOAD },
      createdAt: new Date(NOW.getTime() - 10_000).toISOString(),
      readAt: null,
      auditLog: [],
    }
    const { deps } = makeDeps({ users: [recipient, sender], notifications: [existing] })

    const result = await createNotification(
      {
        recipientUserId: recipient.id,
        senderUserId: sender.id,
        kind: 'dispatch-request-created',
        title: 'new', body: '', actionUrl: '/x',
        payload: VALID_DR_PAYLOAD,
        relatedEntityId: 'DR-1',
      },
      deps,
    )

    expect(result.created).toEqual([])
    expect(result.skipped[0]?.reason).toBe('duplicate')
  })

  it('different relatedEntityId fires anew (no dedup)', async () => {
    const recipient = user('opshead', 'OpsHead')
    const sender = user('sender', 'Admin')
    const existing: Notification = {
      id: 'NTF-old',
      recipientUserId: recipient.id,
      senderUserId: sender.id,
      kind: 'dispatch-request-created',
      title: 'old', body: '', actionUrl: '/x',
      payload: { ...VALID_DR_PAYLOAD },
      createdAt: new Date(NOW.getTime() - 10_000).toISOString(),
      readAt: null,
      auditLog: [],
    }
    const { deps } = makeDeps({ users: [recipient, sender], notifications: [existing] })

    const differentEntity = { ...VALID_DR_PAYLOAD, requestId: 'DR-2' }
    const result = await createNotification(
      {
        recipientUserId: recipient.id,
        senderUserId: sender.id,
        kind: 'dispatch-request-created',
        title: 'new', body: '', actionUrl: '/x',
        payload: differentEntity,
        relatedEntityId: 'DR-2',
      },
      deps,
    )

    expect(result.created.length).toBe(1)
  })
})

describe('W4-E.5 payload validator', () => {
  it('throws when required field missing', async () => {
    const u = user('opshead', 'OpsHead')
    const sender = user('sender', 'Admin')
    const { deps } = makeDeps({ users: [u, sender] })
    await expect(
      createNotification(
        {
          recipientUserId: u.id,
          senderUserId: sender.id,
          kind: 'dispatch-request-created',
          title: 'X', body: 'X', actionUrl: '/x',
          payload: { requestId: 'DR-1' },
          relatedEntityId: 'DR-1',
        },
        deps,
      ),
    ).rejects.toThrow(/Invalid payload for kind=dispatch-request-created/)
  })
})

describe('W4-E.5 broadcast + recipientsByRole', () => {
  it('broadcastNotification fans out to multiple recipients with single payload validation', async () => {
    const r1 = user('a', 'OpsHead')
    const r2 = user('b', 'Admin')
    const sender = user('sender', 'SalesRep')
    const { deps, calls } = makeDeps({ users: [r1, r2, sender] })

    const result = await broadcastNotification(
      {
        recipientUserIds: [r1.id, r2.id],
        senderUserId: sender.id,
        kind: 'dispatch-request-created',
        title: 'Broadcast', body: '', actionUrl: '/x',
        payload: VALID_DR_PAYLOAD,
        relatedEntityId: 'DR-1',
      },
      deps,
    )
    expect(result.created.length).toBe(2)
    expect(calls.length).toBe(2)
  })

  it('recipientsByRole filters active + role; honours testingOverride grants', async () => {
    const opsHead = user('opshead', 'OpsHead')
    const opsEmpOverride = user('misba', 'OpsEmployee', {
      testingOverride: true,
      testingOverridePermissions: ['OpsHead'],
    })
    const finance = user('finance', 'Finance')
    const inactive = user('inactiveAdmin', 'Admin', { active: false })
    const all = [opsHead, opsEmpOverride, finance, inactive]
    const out = recipientsByRole(all, ['Admin', 'OpsHead'])
    expect(out).toContain(opsHead.id)
    expect(out).toContain(opsEmpOverride.id)
    expect(out).not.toContain(finance.id)
    expect(out).not.toContain(inactive.id)
  })
})
