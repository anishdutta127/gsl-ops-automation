/**
 * @vitest-environment node
 *
 * P2b smart-bridge unit test.
 *
 * Validates that when DATA_BACKEND=postgres, calling enqueueUpdate
 * with operation='update' and a payload whose auditLog grew by N entries
 * vs the row's current state translates into:
 *   - 1 call to repo.updatePartial(id, scalarPatchWithoutAuditLog)
 *   - N calls to repo.appendAudit(id, newEntry)
 *
 * This is the contract that makes the bridge race-safe: each lib's
 * full-row enqueue is decomposed into atomic primitives. Concurrent
 * callers no longer collide on the audit_log JSONB column because each
 * new entry goes through `audit_log || jsonb` server-side concat.
 *
 * The SQL primitive itself is exercised against staging by
 * scripts/verify-p2b-concurrency.mjs (17/17 entities at N=10).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const schoolMock = {
  findById: vi.fn(),
  updatePartial: vi.fn(),
  appendAudit: vi.fn(),
}

vi.mock('./db/backend', () => ({
  currentBackend: () => 'postgres',
}))

vi.mock('./db/repos/school', () => ({
  schoolRepo: schoolMock,
}))

// Avoid pulling in the real github-queue module (it tries to read env).
vi.mock('./githubQueue', () => ({
  appendToQueue: vi.fn(),
}))

describe('pendingUpdates smart-bridge (P2b)', () => {
  beforeEach(() => {
    schoolMock.findById.mockReset()
    schoolMock.updatePartial.mockReset()
    schoolMock.appendAudit.mockReset()
  })

  it('splits a 1-entry-grown update into updatePartial + 1 appendAudit', async () => {
    schoolMock.findById.mockResolvedValueOnce({
      id: 'SCH-001',
      name: 'Existing Name',
      auditLog: [{ timestamp: '2026-01-01', user: 'u1', action: 'seed' }],
    })
    const { enqueueUpdate } = await import('./pendingUpdates')
    await enqueueUpdate({
      queuedBy: 'tester',
      entity: 'school',
      operation: 'update',
      payload: {
        id: 'SCH-001',
        name: 'New Name',
        auditLog: [
          { timestamp: '2026-01-01', user: 'u1', action: 'seed' },
          { timestamp: '2026-05-24', user: 'tester', action: 'school-edited' },
        ],
      },
    })
    expect(schoolMock.findById).toHaveBeenCalledWith('SCH-001')
    expect(schoolMock.updatePartial).toHaveBeenCalledTimes(1)
    const partialPatch = schoolMock.updatePartial.mock.calls[0]![1] as Record<string, unknown>
    expect(partialPatch).toMatchObject({ id: 'SCH-001', name: 'New Name' })
    expect(partialPatch).not.toHaveProperty('auditLog')
    expect(schoolMock.appendAudit).toHaveBeenCalledTimes(1)
    expect(schoolMock.appendAudit.mock.calls[0]![1]).toMatchObject({
      action: 'school-edited',
      user: 'tester',
    })
  })

  it('emits 1 updatePartial + 1 appendAudit per call across N sequential lib calls', async () => {
    // N parallel calls is exercised against real postgres in
    // scripts/verify-p2b-concurrency.mjs (17/17 entities PASS). This
    // test asserts the per-call decomposition, sequentially: each
    // lib's full-row enqueue with auditLog grown by 1 produces exactly
    // 1 updatePartial + 1 appendAudit.
    const N = 10
    schoolMock.findById.mockImplementation(async () => ({
      id: 'SCH-002',
      name: 'X',
      auditLog: [],
    }))
    const { enqueueUpdate } = await import('./pendingUpdates')
    for (let i = 0; i < N; i++) {
      await enqueueUpdate({
        queuedBy: 'tester',
        entity: 'school',
        operation: 'update',
        payload: {
          id: 'SCH-002',
          name: 'X',
          auditLog: [
            { timestamp: `2026-05-24T00:00:${String(i).padStart(2, '0')}Z`,
              user: 'tester',
              action: 'school-edited',
              notes: `bridge-${i}` },
          ],
        },
      })
    }
    expect(schoolMock.updatePartial).toHaveBeenCalledTimes(N)
    expect(schoolMock.appendAudit).toHaveBeenCalledTimes(N)
    const actions = schoolMock.appendAudit.mock.calls.map((c) => (c[1] as { notes?: string }).notes)
    expect(actions.sort()).toEqual(Array.from({ length: N }, (_, i) => `bridge-${i}`).sort())
  })

  it('emits updatePartial only (no appendAudit) when audit did not grow', async () => {
    schoolMock.findById.mockResolvedValueOnce({
      id: 'SCH-003',
      name: 'before',
      auditLog: [{ timestamp: '2026-01-01', user: 'u1', action: 'seed' }],
    })
    const { enqueueUpdate } = await import('./pendingUpdates')
    await enqueueUpdate({
      queuedBy: 'tester',
      entity: 'school',
      operation: 'update',
      payload: {
        id: 'SCH-003',
        name: 'after',
        auditLog: [{ timestamp: '2026-01-01', user: 'u1', action: 'seed' }],
      },
    })
    expect(schoolMock.updatePartial).toHaveBeenCalledTimes(1)
    expect(schoolMock.appendAudit).not.toHaveBeenCalled()
  })
})
