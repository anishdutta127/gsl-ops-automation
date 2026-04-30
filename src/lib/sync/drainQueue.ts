/*
 * W4-I.3.A queue drain runner.
 *
 * Reads pending_updates.json from the repo via the GitHub Contents API,
 * groups entries by entity, applies each entity batch to the canonical
 * JSON file, then trims drained entries from pending_updates.json.
 * Per-entity isolation: a failure on one entity (network, rate limit,
 * malformed payload) leaves the other entities' work in place; failed
 * entries stay in the queue for the next tick.
 *
 * Idempotency by construction:
 *   - 'create' for an id already present in the entity file is skipped.
 *   - 'update' replaces by id; missing-id falls through as a defensive
 *      append so a stale 'create' lost upstream is recoverable.
 *   - 'delete' filters by id; absent id is a no-op.
 * Running drainQueue twice on the same pending list is therefore safe;
 * the second run drains nothing and leaves entity files untouched.
 *
 * Commit shape:
 *   - Per-entity write: `chore(sync): apply <entity> batch (n=N)`. NOT
 *     prefixed with `chore(queue):`, so Vercel's ignoreCommand does not
 *     skip the rebuild and the new state goes live on the next deploy.
 *   - Pending-trim write: `chore(queue): drain <total> entries`. Queue
 *     prefix preserved because this is queue-housekeeping, not an entity
 *     state change; rebuild is already triggered by the entity commits.
 *
 * Sync-health: appends one SyncHealthEntry of kind 'sync' summarising
 * the drain (drained count, failed count, anomalies). The dashboard
 * freshness tile reads the latest entry of any kind.
 */

import type { PendingUpdate, PendingUpdateEntity } from '@/lib/types'
import { atomicUpdateJson, readJsonFromGitHub } from '@/lib/githubQueue'
import {
  appendSyncHealth,
  type SyncHealthEntry,
} from '@/lib/syncHealth/appendEntry'
import { pathForEntity } from './entityRegistry'

const PENDING_UPDATES_PATH = 'src/data/pending_updates.json'

export interface PerEntityResult {
  entity: PendingUpdateEntity
  drained: number
  skipped: number
  failed: number
  error?: string
}

export interface DrainResult {
  ok: boolean
  drainedCount: number
  failedCount: number
  remainingCount: number
  perEntity: PerEntityResult[]
  anomalies: string[]
  triggeredBy: string
  startedAt: string
  finishedAt: string
  durationMs: number
}

export interface DrainDeps {
  read: <T>(path: string) => Promise<T | null>
  atomicUpdate: typeof atomicUpdateJson
  appendHealth: (entry: SyncHealthEntry) => Promise<unknown>
  now: () => Date
}

export const defaultDrainDeps: DrainDeps = {
  read: readJsonFromGitHub,
  atomicUpdate: atomicUpdateJson,
  appendHealth: appendSyncHealth,
  now: () => new Date(),
}

interface EntityRecord {
  id: string
  [k: string]: unknown
}

function applyOneToList(
  list: EntityRecord[],
  pending: PendingUpdate,
): { list: EntityRecord[]; outcome: 'drained' | 'skipped' } {
  const payload = pending.payload as EntityRecord
  const id = typeof payload.id === 'string' ? payload.id : null
  if (id === null) {
    return { list, outcome: 'skipped' }
  }
  if (pending.operation === 'create') {
    if (list.some((r) => r.id === id)) {
      return { list, outcome: 'skipped' }
    }
    return { list: [...list, payload], outcome: 'drained' }
  }
  if (pending.operation === 'update') {
    const idx = list.findIndex((r) => r.id === id)
    if (idx >= 0) {
      const next = list.slice()
      next[idx] = payload
      return { list: next, outcome: 'drained' }
    }
    return { list: [...list, payload], outcome: 'drained' }
  }
  if (pending.operation === 'delete') {
    return { list: list.filter((r) => r.id !== id), outcome: 'drained' }
  }
  return { list, outcome: 'skipped' }
}

export async function drainQueue(
  args: { triggeredBy: string },
  deps: DrainDeps = defaultDrainDeps,
): Promise<DrainResult> {
  const startedAt = deps.now()
  const startMs = startedAt.getTime()

  let pending: PendingUpdate[] = []
  try {
    const fetched = await deps.read<PendingUpdate[]>(PENDING_UPDATES_PATH)
    pending = Array.isArray(fetched) ? fetched : []
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const finishedAt = deps.now()
    const result: DrainResult = {
      ok: false,
      drainedCount: 0,
      failedCount: 0,
      remainingCount: 0,
      perEntity: [],
      anomalies: [`pending-updates read failed: ${message}`],
      triggeredBy: args.triggeredBy,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      durationMs: finishedAt.getTime() - startMs,
    }
    await safeAppendHealth(deps, result)
    return result
  }

  if (pending.length === 0) {
    const finishedAt = deps.now()
    const result: DrainResult = {
      ok: true,
      drainedCount: 0,
      failedCount: 0,
      remainingCount: 0,
      perEntity: [],
      anomalies: [],
      triggeredBy: args.triggeredBy,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      durationMs: finishedAt.getTime() - startMs,
    }
    await safeAppendHealth(deps, result)
    return result
  }

  const sorted = pending.slice().sort((a, b) => a.queuedAt.localeCompare(b.queuedAt))

  const groups = new Map<PendingUpdateEntity, PendingUpdate[]>()
  for (const entry of sorted) {
    const list = groups.get(entry.entity) ?? []
    list.push(entry)
    groups.set(entry.entity, list)
  }

  const perEntity: PerEntityResult[] = []
  const anomalies: string[] = []
  const drainedIds = new Set<string>()

  for (const [entity, entries] of Array.from(groups.entries())) {
    const filePath = pathForEntity(entity)
    if (filePath === null) {
      perEntity.push({
        entity,
        drained: 0,
        skipped: 0,
        failed: entries.length,
        error: 'unknown-entity',
      })
      anomalies.push(
        `entity '${entity}' has no registry path; ${entries.length} entries left in queue`,
      )
      continue
    }

    let drainedThisEntity = 0
    let skippedThisEntity = 0
    try {
      await deps.atomicUpdate<EntityRecord[]>(
        filePath,
        (current) => {
          let working = Array.isArray(current) ? current : []
          drainedThisEntity = 0
          skippedThisEntity = 0
          for (const entry of entries) {
            const { list, outcome } = applyOneToList(working, entry)
            working = list
            if (outcome === 'drained') drainedThisEntity++
            else skippedThisEntity++
          }
          return {
            next: working,
            commitMessage: `chore(sync): apply ${entity} batch (n=${entries.length})`,
          }
        },
        { defaultValue: [] as EntityRecord[], maxRetries: 3 },
      )
      for (const entry of entries) drainedIds.add(entry.id)
      perEntity.push({
        entity,
        drained: drainedThisEntity,
        skipped: skippedThisEntity,
        failed: 0,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      perEntity.push({
        entity,
        drained: 0,
        skipped: 0,
        failed: entries.length,
        error: message,
      })
      anomalies.push(`${entity} batch failed: ${message}`)
    }
  }

  let remainingCount = pending.length - drainedIds.size
  if (drainedIds.size > 0) {
    try {
      await deps.atomicUpdate<PendingUpdate[]>(
        PENDING_UPDATES_PATH,
        (current) => {
          const list = Array.isArray(current) ? current : []
          const next = list.filter((p) => !drainedIds.has(p.id))
          remainingCount = next.length
          return {
            next,
            commitMessage: `chore(queue): drain ${drainedIds.size} entries`,
          }
        },
        { defaultValue: [] as PendingUpdate[], maxRetries: 3 },
      )
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      anomalies.push(`pending-trim failed: ${message}`)
    }
  }

  const finishedAt = deps.now()
  const result: DrainResult = {
    ok: anomalies.length === 0,
    drainedCount: drainedIds.size,
    failedCount: perEntity.reduce((s, r) => s + r.failed, 0),
    remainingCount,
    perEntity,
    anomalies,
    triggeredBy: args.triggeredBy,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startMs,
  }
  await safeAppendHealth(deps, result)
  return result
}

async function safeAppendHealth(deps: DrainDeps, result: DrainResult): Promise<void> {
  const entry: SyncHealthEntry = {
    at: result.finishedAt,
    kind: 'sync',
    ok: result.ok,
    triggeredBy: result.triggeredBy,
    importSummary: null,
    healthChecks: null,
    anomalies: [
      ...result.anomalies,
      `drained=${result.drainedCount} remaining=${result.remainingCount} duration=${result.durationMs}ms`,
    ],
  }
  try {
    await deps.appendHealth(entry)
  } catch {
    // Health-write failure must not 500 the drain; the result still
    // surfaces via the route handler / CLI exit code.
  }
}
