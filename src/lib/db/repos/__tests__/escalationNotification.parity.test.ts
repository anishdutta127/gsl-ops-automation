/**
 * @vitest-environment node
 */

/*
 * Parity + write-parity for escalations + notifications.
 *
 * escalation: comments JSONB + notified_emails JSONB + audit_log
 * notification: payload JSONB + audit_log
 *
 * Read-parity asserts deep-equal IDs/shapes; write-parity mutates
 * a JSONB field, writes, reads back, and asserts the round-trip.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { escalationRepo } from '../escalation'
import { notificationRepo } from '../notification'
import { hasPostgres, withBackend, parityEqual } from '../../__test__/parity'
import { closeSql, getSql } from '../../client'
import type { Escalation, Notification } from '@/lib/types'

const desc = hasPostgres() ? describe : describe.skip

// ---------------------------------------------------------------------------
// escalation read parity
// ---------------------------------------------------------------------------

// Documented divergence: 4 of 5 demo escalations reference demo
// schools (SCH-RIVERDALE-MUM, SCH-OAKWOOD-DEL, SCH-MAPLELEAF-BLR,
// SCH-CEDARHEIGHTS-CHN) that were deliberately not seeded into postgres.
// Same pattern as the dispatch demo orphans. ESC-002 is the only
// escalation present in both backends.
const ESCALATION_JSON_ONLY = ['ESC-001', 'ESC-003', 'ESC-004', 'ESC-005']

desc('escalationRepo parity', () => {
  it('findAll: postgres set is json minus the 4 documented demo escalations', async () => {
    const j = await withBackend('json', () => escalationRepo.findAll())
    const p = await withBackend('postgres', () => escalationRepo.findAll())
    const jIds = new Set(j.map((e) => e.id))
    const pIds = new Set(p.map((e) => e.id))
    const jOnly = [...jIds].filter((id) => !pIds.has(id)).sort()
    expect(jOnly).toEqual(ESCALATION_JSON_ONLY.slice().sort())
    const pOnly = [...pIds].filter((id) => !jIds.has(id)).sort()
    expect(pOnly).toEqual([])
  })

  it('findById (ESC-002 which survived): same shape', async () => {
    const j = await withBackend('json', () => escalationRepo.findById('ESC-002'))
    const p = await withBackend('postgres', () => escalationRepo.findById('ESC-002'))
    expect(j).toBeTruthy()
    expect(p).toBeTruthy()
    parityEqual(j!.severity, p!.severity)
    parityEqual(j!.status, p!.status)
    parityEqual(j!.schoolId, p!.schoolId)
    parityEqual(j!.notifiedEmails, p!.notifiedEmails)
  })

  it('findOpen: postgres set is subset of json set (no Closed leaking through)', async () => {
    const p = await withBackend('postgres', () => escalationRepo.findOpen())
    for (const e of p) expect(e.status).not.toBe('Closed')
  })
})

desc('escalationRepo write-parity (postgres-only)', () => {
  let original: Escalation | null = null
  let TARGET = ''

  beforeAll(async () => {
    process.env.DATA_BACKEND = 'postgres'
    original = await escalationRepo.findById('ESC-002')
    TARGET = original?.id ?? ''
  })

  afterAll(async () => {
    if (original) await escalationRepo.update(original)
    delete process.env.DATA_BACKEND
    await closeSql()
  })

  it('comments + notifiedEmails JSONB round-trip exactly + audit appends', async () => {
    if (!original) throw new Error('no escalations seeded')
    const newComment = {
      id: 'CMT-PARITY-1',
      timestamp: '2026-05-23T10:00:00Z',
      authorUserId: 'parity-test',
      body: 'Round-trip comment body with [special] chars and unicode chars',
    }
    const mutated: Escalation = {
      ...original,
      notifiedEmails: ['parity1@example.com', 'parity2@example.com'],
      comments: [...(original.comments ?? []), newComment],
      auditLog: [
        ...(original.auditLog ?? []),
        { timestamp: '2026-05-23T10:00:00Z', user: 'parity-test', action: 'comment-added', notes: newComment.id },
      ],
    }
    await escalationRepo.update(mutated)
    const readBack = await escalationRepo.findById(TARGET)
    parityEqual(readBack!.notifiedEmails, mutated.notifiedEmails)
    parityEqual(readBack!.comments, mutated.comments)
    expect(readBack!.auditLog?.length).toBe((original.auditLog?.length ?? 0) + 1)
  }, 30_000)
})

// ---------------------------------------------------------------------------
// notification read parity
// ---------------------------------------------------------------------------

desc('notificationRepo parity', () => {
  it('findAll: same id set', async () => {
    const j = await withBackend('json', () => notificationRepo.findAll())
    const p = await withBackend('postgres', () => notificationRepo.findAll())
    expect(p.map((n) => n.id).sort()).toEqual(j.map((n) => n.id).sort())
  })

  it('findById: same payload object', async () => {
    const all = await withBackend('json', () => notificationRepo.findAll())
    const target = all[0]
    if (!target) return
    const j = await withBackend('json', () => notificationRepo.findById(target.id))
    const p = await withBackend('postgres', () => notificationRepo.findById(target.id))
    parityEqual(j!.kind, p!.kind)
    parityEqual(j!.title, p!.title)
    parityEqual(j!.payload, p!.payload)
  })

  it('findByRecipient unread: subset of full set', async () => {
    const all = await withBackend('json', () => notificationRepo.findAll())
    const userId = all[0]?.recipientUserId
    if (!userId) return
    const jAll = await withBackend('json', () => notificationRepo.findByRecipient(userId))
    const pAll = await withBackend('postgres', () => notificationRepo.findByRecipient(userId))
    expect(pAll.map((n) => n.id).sort()).toEqual(jAll.map((n) => n.id).sort())
    const jUnread = await withBackend('json', () => notificationRepo.findByRecipient(userId, { unreadOnly: true }))
    const pUnread = await withBackend('postgres', () => notificationRepo.findByRecipient(userId, { unreadOnly: true }))
    expect(pUnread.map((n) => n.id).sort()).toEqual(jUnread.map((n) => n.id).sort())
  })
})

desc('notificationRepo write-parity (postgres-only): create + JSONB round-trip', () => {
  const TEST_ID = 'NTF-PARITY-TEST-001'

  beforeAll(async () => {
    process.env.DATA_BACKEND = 'postgres'
    const sql = getSql()
    await sql`DELETE FROM notifications WHERE id = ${TEST_ID}`
  })

  afterAll(async () => {
    const sql = getSql()
    await sql`DELETE FROM notifications WHERE id = ${TEST_ID}`
    delete process.env.DATA_BACKEND
    await closeSql()
  })

  it('create then findById: payload JSONB and auditLog round-trip exactly', async () => {
    const all = await notificationRepo.findAll()
    const seedRecipient = all[0]?.recipientUserId
    if (!seedRecipient) throw new Error('no notifications seeded; needed for FK')
    const rec: Notification = {
      id: TEST_ID,
      recipientUserId: seedRecipient,
      senderUserId: 'system',
      kind: 'intake-form-completed',
      title: 'Parity test',
      body: 'Round-trip body',
      actionUrl: '/intake/parity-test',
      payload: {
        mouId: 'MOU-TEST-001',
        nested: { a: 1, b: [2, 3], c: null, d: 'string' },
        array: [{ x: 1 }, { y: 'two' }],
      },
      createdAt: '2026-05-23T11:00:00Z',
      readAt: null,
      auditLog: [{ timestamp: '2026-05-23T11:00:00Z', user: 'parity', action: 'create' }],
    }
    await notificationRepo.create(rec)
    const readBack = await notificationRepo.findById(TEST_ID)
    expect(readBack).toBeTruthy()
    parityEqual(readBack!.payload, rec.payload)
    parityEqual(readBack!.kind, rec.kind)
    parityEqual(readBack!.title, rec.title)
    expect(readBack!.auditLog?.length).toBe(1)
  }, 30_000)
})
