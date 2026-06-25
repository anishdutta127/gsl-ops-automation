/**
 * @vitest-environment node
 */

/*
 * appendAudit concurrency test (Phase 7).
 *
 * Requirement: N parallel calls to userRepo.appendAudit must result
 * in N entries appended to the target user's audit_log, with no
 * lost writes. The legacy json + queue path is a read-modify-write
 * (read users.json, append, write back via enqueueUpdate) which is
 * known-unsafe under concurrent calls (Phase 6H bug class). The
 * postgres path uses JSONB array concat on the server (audit_log =
 * audit_log || $1::jsonb) which is atomic per UPDATE.
 *
 * This test is the proof that the postgres path eliminates the
 * concurrency hazard. It runs against the staging branch and
 * commits writes; the user's audit_log is captured before and
 * restored after.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { userRepo } from '../user'
import { hasPostgres, withBackend } from '../../__test__/parity'
import { getSql, closeSql } from '../../client'
import type { AuditEntry } from '@/lib/types'

const POSTGRES_AVAILABLE = hasPostgres()
const desc = POSTGRES_AVAILABLE ? describe : describe.skip

desc('userRepo.appendAudit concurrency (postgres)', () => {
  // Use a test user whose audit log we are free to mutate. anish.d
  // has a small audit history we'll restore after.
  const TEST_USER_ID = 'anish.d'
  let originalAuditLog: AuditEntry[] | null = null

  beforeAll(async () => {
    process.env.DATA_BACKEND = 'postgres'
    const sql = getSql()
    const rows = await sql<{ audit_log: AuditEntry[] }[]>`
      SELECT audit_log FROM users WHERE id = ${TEST_USER_ID}
    `
    originalAuditLog = rows[0]?.audit_log ?? []
  })

  afterAll(async () => {
    if (originalAuditLog !== null) {
      const sql = getSql()
      await sql`
        UPDATE users SET audit_log = ${sql.json(originalAuditLog as unknown as Parameters<typeof sql.json>[0])}::jsonb
        WHERE id = ${TEST_USER_ID}
      `
    }
    delete process.env.DATA_BACKEND
    await closeSql()
  })

  it('10 parallel appendAudit calls leave 10 entries appended (no lost writes)', async () => {
    const before = await withBackend('postgres', () => userRepo.findById(TEST_USER_ID))
    const baselineLength = before?.auditLog.length ?? 0

    const N = 10
    const entries: AuditEntry[] = Array.from({ length: N }, (_, i) => ({
      timestamp: new Date(Date.now() + i).toISOString(),
      user: 'test-concurrency',
      action: 'update',
      notes: `concurrency-test-${i}`,
    }))
    const calls = entries.map((e) =>
      withBackend('postgres', () => userRepo.appendAudit(TEST_USER_ID, e)),
    )
    await Promise.all(calls)

    const after = await withBackend('postgres', () => userRepo.findById(TEST_USER_ID))
    expect(after).toBeTruthy()
    const newLength = after!.auditLog.length
    expect(newLength - baselineLength, `${N} parallel appends should add ${N} entries`).toBe(N)

    // Every test-concurrency entry is present (the postgres ||
    // operator concatenates them all; the legacy json path would
    // lose all but one).
    const ours = after!.auditLog.filter(
      (e) => e.user === 'test-concurrency' && e.notes?.startsWith('concurrency-test-'),
    )
    expect(ours.length).toBe(N)
    const notesSet = new Set(ours.map((e) => e.notes))
    for (let i = 0; i < N; i++) {
      expect(notesSet.has(`concurrency-test-${i}`)).toBe(true)
    }
  }, 30_000)
})
