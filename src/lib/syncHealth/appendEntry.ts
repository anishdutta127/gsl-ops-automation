/*
 * Sync-health entry append (Phase E manual-trigger pattern).
 *
 * Both /api/mou/import-tick and /api/sync/tick land entries here.
 * The fixture file is an append-only rolling log capped at 50
 * entries; the dashboard freshness tile reads the last entry to
 * surface "last sync N minutes ago".
 *
 * Persistence goes through `atomicUpdateJson` directly (not the
 * pending-updates queue), because sync_health.json is a system-
 * generated log, not an entity that needs queue-consumer
 * processing. Each tick writes the file atomically via the
 * Contents API; the dashboard reads it on next render.
 *
 * Schema: SyncHealthEntry distinguishes 'import' from 'health'
 * via the `kind` field; both share the at + ok + triggeredBy +
 * anomalies fields and one of the kind-specific summary objects.
 */

import { atomicUpdateJson } from '@/lib/githubQueue'

const SYNC_HEALTH_PATH = 'src/data/sync_health.json'
const MAX_ENTRIES = 50

export type SyncHealthEntryKind = 'import' | 'health'

export interface ImportSummary {
  written: number
  quarantined: number
  filtered: number
  autoLinkedSchoolIds: string[]
  errors: string[]
}

export interface HealthChecks {
  jsonValid: boolean
  counterMonotonic: boolean
  queueDepth: number
  oldestPendingMinutes: number | null
}

export interface SyncHealthEntry {
  at: string
  kind: SyncHealthEntryKind
  ok: boolean
  triggeredBy: string
  importSummary: ImportSummary | null
  healthChecks: HealthChecks | null
  anomalies: string[]
}

export interface AppendSyncHealthDeps {
  atomicUpdate: typeof atomicUpdateJson
}

const defaultDeps: AppendSyncHealthDeps = {
  atomicUpdate: atomicUpdateJson,
}

export async function appendSyncHealth(
  entry: SyncHealthEntry,
  deps: AppendSyncHealthDeps = defaultDeps,
): Promise<SyncHealthEntry[]> {
  const { next } = await deps.atomicUpdate<SyncHealthEntry[]>(
    SYNC_HEALTH_PATH,
    (current) => {
      const list = Array.isArray(current) ? current : []
      const appended = [...list, entry]
      const trimmed = appended.length > MAX_ENTRIES
        ? appended.slice(-MAX_ENTRIES)
        : appended
      return {
        next: trimmed,
        commitMessage: `chore(sync-health): ${entry.kind} ${entry.ok ? 'ok' : 'anomaly'}`,
      }
    },
    { defaultValue: [] as SyncHealthEntry[], maxRetries: 3 },
  )
  return next
}
