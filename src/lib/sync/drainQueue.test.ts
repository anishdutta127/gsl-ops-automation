/*
 * W4-I.3.A drain queue tests.
 *
 * Covers:
 *   1. Empty queue is a clean no-op (still appends a sync_health entry).
 *   2. Single create lands in the matching entity file.
 *   3. Duplicate create on the same id is skipped (idempotency).
 *   4. Update replaces by id; missing id falls through as defensive append.
 *   5. Delete filters by id; missing id is a no-op.
 *   6. Multiple entities drain into separate files in one tick.
 *   7. Entries arriving in unsorted queuedAt order get sorted before apply.
 *   8. Per-entity isolation: a failure on one entity does not bleed.
 *   9. Unknown-entity entries stay in queue and surface as anomaly.
 *  10. Queue-trim writes only the un-drained entries; failures stay.
 *  11. Pending-read failure surfaces ok=false + anomaly.
 *  12. Re-running drain on already-drained queue is a clean no-op.
 *  13. Commit-message contract: per-entity uses chore(sync), trim uses chore(queue).
 *  14. SyncHealth entry kind is 'sync'.
 */

import { describe, it, expect } from 'vitest'
import type { PendingUpdate } from '@/lib/types'
import type { SyncHealthEntry } from '@/lib/syncHealth/appendEntry'
import { drainQueue, type DrainDeps } from './drainQueue'

interface MockState {
  files: Map<string, unknown>
  commits: Array<{ path: string; message: string }>
  health: SyncHealthEntry[]
  failOnPath?: string
  failPendingRead?: boolean
}

function newState(): MockState {
  return {
    files: new Map(),
    commits: [],
    health: [],
  }
}

function makeDeps(state: MockState, frozenNow = '2026-04-30T10:00:00.000Z'): DrainDeps {
  return {
    read: async <T>(path: string): Promise<T | null> => {
      if (state.failPendingRead && path === 'src/data/pending_updates.json') {
        throw new Error('simulated read failure')
      }
      return (state.files.get(path) as T) ?? null
    },
    atomicUpdate: (async <T>(
      path: string,
      mutate: (current: T) => { next: T; commitMessage: string },
      options: { defaultValue: T; maxRetries?: number },
    ) => {
      if (state.failOnPath === path) {
        throw new Error(`simulated upstream failure on ${path}`)
      }
      const current = (state.files.get(path) as T) ?? options.defaultValue
      const { next, commitMessage } = mutate(current)
      state.files.set(path, next)
      state.commits.push({ path, message: commitMessage })
      return { next, commitSha: 'sha-' + state.commits.length }
    }) as DrainDeps['atomicUpdate'],
    appendHealth: async (entry: SyncHealthEntry) => {
      state.health.push(entry)
      return state.health
    },
    now: () => new Date(frozenNow),
  }
}

function pending(
  partial: Partial<PendingUpdate> & {
    entity: PendingUpdate['entity']
    operation: PendingUpdate['operation']
    payload: Record<string, unknown>
  },
): PendingUpdate {
  return {
    id: partial.id ?? 'pu-' + Math.random().toString(36).slice(2, 10),
    queuedAt: partial.queuedAt ?? '2026-04-30T09:00:00.000Z',
    queuedBy: partial.queuedBy ?? 'misba.m',
    retryCount: partial.retryCount ?? 0,
    entity: partial.entity,
    operation: partial.operation,
    payload: partial.payload,
  }
}

describe('drainQueue', () => {
  it('empty queue is a no-op (no commits, sync-health entry written)', async () => {
    const state = newState()
    state.files.set('src/data/pending_updates.json', [])
    const deps = makeDeps(state)

    const result = await drainQueue({ triggeredBy: 'cron' }, deps)

    expect(result.ok).toBe(true)
    expect(result.drainedCount).toBe(0)
    expect(result.remainingCount).toBe(0)
    expect(state.commits).toHaveLength(0)
    expect(state.health).toHaveLength(1)
    expect(state.health[0]?.kind).toBe('sync')
  })

  it('single create lands in the matching entity file', async () => {
    const state = newState()
    state.files.set('src/data/schools.json', [{ id: 'SCH-EXISTING', name: 'Existing' }])
    state.files.set('src/data/pending_updates.json', [
      pending({
        entity: 'school',
        operation: 'create',
        payload: { id: 'SCH-NEW', name: 'New School' },
      }),
    ])
    const deps = makeDeps(state)

    const result = await drainQueue({ triggeredBy: 'cron' }, deps)

    const schools = state.files.get('src/data/schools.json') as Array<{ id: string }>
    expect(schools.map((s) => s.id)).toEqual(['SCH-EXISTING', 'SCH-NEW'])
    expect(result.drainedCount).toBe(1)
    expect(result.remainingCount).toBe(0)
    expect(result.perEntity[0]?.entity).toBe('school')
    expect(result.perEntity[0]?.drained).toBe(1)
  })

  it('duplicate create on same id is skipped (idempotency)', async () => {
    const state = newState()
    state.files.set('src/data/schools.json', [])
    state.files.set('src/data/pending_updates.json', [
      pending({
        id: 'pu-1',
        queuedAt: '2026-04-30T09:00:00.000Z',
        entity: 'school',
        operation: 'create',
        payload: { id: 'SCH-DUP', name: 'Dup' },
      }),
      pending({
        id: 'pu-2',
        queuedAt: '2026-04-30T09:00:15.000Z',
        entity: 'school',
        operation: 'create',
        payload: { id: 'SCH-DUP', name: 'Dup' },
      }),
    ])
    const deps = makeDeps(state)

    const result = await drainQueue({ triggeredBy: 'cron' }, deps)

    const schools = state.files.get('src/data/schools.json') as Array<{ id: string }>
    expect(schools).toHaveLength(1)
    expect(result.perEntity[0]?.drained).toBe(1)
    expect(result.perEntity[0]?.skipped).toBe(1)
    // Both pending entries are removed because both were processed.
    expect(result.remainingCount).toBe(0)
  })

  it('update replaces by id; missing id falls through as defensive append', async () => {
    const state = newState()
    state.files.set('src/data/schools.json', [
      { id: 'SCH-A', name: 'Old' },
      { id: 'SCH-B', name: 'B' },
    ])
    state.files.set('src/data/pending_updates.json', [
      pending({
        entity: 'school',
        operation: 'update',
        payload: { id: 'SCH-A', name: 'New' },
      }),
      pending({
        entity: 'school',
        operation: 'update',
        payload: { id: 'SCH-MISSING', name: 'Defensive', auditLog: [] },
      }),
    ])
    const deps = makeDeps(state)

    await drainQueue({ triggeredBy: 'cron' }, deps)

    const schools = state.files.get('src/data/schools.json') as Array<{
      id: string
      name: string
      auditLog?: Array<{ action: string; notes?: string; user: string }>
    }>
    expect(schools.find((s) => s.id === 'SCH-A')?.name).toBe('New')

    const defensive = schools.find((s) => s.id === 'SCH-MISSING')
    expect(defensive?.name).toBe('Defensive')
    // Registered behaviour (W4-I.3.B): defensive append annotates the
    // audit log with a 'create-by-fallback' entry so future readers
    // understand the semantic mismatch.
    const fallback = defensive?.auditLog?.find(
      (a) => a.action === 'create-by-fallback',
    )
    expect(fallback).toBeDefined()
    expect(fallback?.user).toBe('sync-drain')
    expect(fallback?.notes).toContain('SCH-MISSING')
    expect(fallback?.notes).toContain('create-by-fallback')
  })

  it('delete filters by id; missing id is a no-op', async () => {
    const state = newState()
    state.files.set('src/data/schools.json', [
      { id: 'SCH-A', name: 'A' },
      { id: 'SCH-B', name: 'B' },
    ])
    state.files.set('src/data/pending_updates.json', [
      pending({
        entity: 'school',
        operation: 'delete',
        payload: { id: 'SCH-A' },
      }),
      pending({
        entity: 'school',
        operation: 'delete',
        payload: { id: 'SCH-GONE' },
      }),
    ])
    const deps = makeDeps(state)

    await drainQueue({ triggeredBy: 'cron' }, deps)

    const schools = state.files.get('src/data/schools.json') as Array<{ id: string }>
    expect(schools.map((s) => s.id)).toEqual(['SCH-B'])
  })

  it('multiple entities drain into separate files in one tick', async () => {
    const state = newState()
    state.files.set('src/data/schools.json', [])
    state.files.set('src/data/sales_opportunities.json', [])
    state.files.set('src/data/pending_updates.json', [
      pending({
        entity: 'school',
        operation: 'create',
        payload: { id: 'SCH-A', name: 'A' },
      }),
      pending({
        entity: 'salesOpportunity',
        operation: 'create',
        payload: { id: 'OPP-1', schoolName: 'A' },
      }),
    ])
    const deps = makeDeps(state)

    const result = await drainQueue({ triggeredBy: 'cron' }, deps)

    expect(state.files.get('src/data/schools.json')).toHaveLength(1)
    expect(state.files.get('src/data/sales_opportunities.json')).toHaveLength(1)
    expect(result.drainedCount).toBe(2)
    expect(result.perEntity).toHaveLength(2)
  })

  it('entries are sorted by queuedAt before apply', async () => {
    const state = newState()
    state.files.set('src/data/schools.json', [])
    state.files.set('src/data/pending_updates.json', [
      pending({
        queuedAt: '2026-04-30T09:00:30.000Z',
        entity: 'school',
        operation: 'update',
        payload: { id: 'SCH-A', name: 'Second' },
      }),
      pending({
        queuedAt: '2026-04-30T09:00:00.000Z',
        entity: 'school',
        operation: 'create',
        payload: { id: 'SCH-A', name: 'First' },
      }),
    ])
    const deps = makeDeps(state)

    await drainQueue({ triggeredBy: 'cron' }, deps)

    const schools = state.files.get('src/data/schools.json') as Array<{
      id: string
      name: string
    }>
    expect(schools[0]?.name).toBe('Second')
  })

  it('per-entity isolation: failure on one entity does not bleed to another', async () => {
    const state = newState()
    state.files.set('src/data/schools.json', [])
    state.files.set('src/data/sales_opportunities.json', [])
    state.files.set('src/data/pending_updates.json', [
      pending({
        id: 'pu-school',
        entity: 'school',
        operation: 'create',
        payload: { id: 'SCH-A', name: 'A' },
      }),
      pending({
        id: 'pu-opp',
        entity: 'salesOpportunity',
        operation: 'create',
        payload: { id: 'OPP-1', schoolName: 'A' },
      }),
    ])
    state.failOnPath = 'src/data/schools.json'
    const deps = makeDeps(state)

    const result = await drainQueue({ triggeredBy: 'cron' }, deps)

    expect(state.files.get('src/data/sales_opportunities.json')).toHaveLength(1)
    expect(result.failedCount).toBe(1)
    expect(result.drainedCount).toBe(1)
    expect(result.remainingCount).toBe(1)
    const remainingPending = state.files.get(
      'src/data/pending_updates.json',
    ) as PendingUpdate[]
    expect(remainingPending.map((p) => p.id)).toEqual(['pu-school'])
  })

  it('unknown-entity entries stay in queue and surface as anomaly', async () => {
    const state = newState()
    state.files.set('src/data/pending_updates.json', [
      pending({
        id: 'pu-bad',
        entity: 'piCounter',
        operation: 'update',
        payload: { id: 'whatever' },
      }),
    ])
    const deps = makeDeps(state)

    const result = await drainQueue({ triggeredBy: 'cron' }, deps)

    expect(result.ok).toBe(false)
    expect(result.anomalies.some((a) => a.includes('piCounter'))).toBe(true)
    expect(result.remainingCount).toBe(1)
  })

  it('pending-read failure surfaces ok=false with anomaly', async () => {
    const state = newState()
    state.failPendingRead = true
    const deps = makeDeps(state)

    const result = await drainQueue({ triggeredBy: 'cron' }, deps)

    expect(result.ok).toBe(false)
    expect(result.anomalies[0]).toMatch(/pending-updates read failed/)
    expect(state.commits).toHaveLength(0)
    expect(state.health).toHaveLength(1)
  })

  it('re-running drain on already-drained queue is a clean no-op', async () => {
    const state = newState()
    state.files.set('src/data/schools.json', [])
    state.files.set('src/data/pending_updates.json', [
      pending({
        entity: 'school',
        operation: 'create',
        payload: { id: 'SCH-A', name: 'A' },
      }),
    ])
    const deps = makeDeps(state)

    await drainQueue({ triggeredBy: 'cron' }, deps)
    const commitsAfterFirst = state.commits.length
    const result = await drainQueue({ triggeredBy: 'cron' }, deps)

    expect(result.drainedCount).toBe(0)
    expect(state.commits.length).toBe(commitsAfterFirst)
  })

  it('commit messages match contract: chore(sync) per-entity, chore(queue) for trim', async () => {
    const state = newState()
    state.files.set('src/data/schools.json', [])
    state.files.set('src/data/pending_updates.json', [
      pending({
        entity: 'school',
        operation: 'create',
        payload: { id: 'SCH-A', name: 'A' },
      }),
    ])
    const deps = makeDeps(state)

    await drainQueue({ triggeredBy: 'cron' }, deps)

    const messages = state.commits.map((c) => c.message)
    expect(messages.some((m) => m.startsWith('chore(sync): apply school batch'))).toBe(true)
    expect(messages.some((m) => m.startsWith('chore(queue): drain '))).toBe(true)
  })

  it('sync-health entry has kind sync and includes drained / remaining counts', async () => {
    const state = newState()
    state.files.set('src/data/schools.json', [])
    state.files.set('src/data/pending_updates.json', [
      pending({
        entity: 'school',
        operation: 'create',
        payload: { id: 'SCH-A', name: 'A' },
      }),
    ])
    const deps = makeDeps(state)

    await drainQueue({ triggeredBy: 'cron' }, deps)

    expect(state.health).toHaveLength(1)
    const entry = state.health[0]!
    expect(entry.kind).toBe('sync')
    expect(entry.ok).toBe(true)
    expect(entry.anomalies.some((a) => /drained=1.*remaining=0/.test(a))).toBe(true)
  })
})
