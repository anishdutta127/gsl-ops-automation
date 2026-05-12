/*
 * Queue freshness state classification (Gate 5A.5 Step 2).
 *
 * Reads pending_updates.json + sync_health.json snapshots and
 * produces a tri-state bucket for the top-nav freshness indicator
 * and the /admin/queue-status detail page. Pure function so both
 * surfaces compute identically and stay testable.
 *
 * Buckets:
 *   - 'synced'  -> last drain succeeded within 15 minutes AND queue is empty
 *   - 'pending' -> queue has at least one unprocessed write
 *   - 'stalled' -> last drain older than 15 minutes (cron not firing
 *                  OR cron firing with persistent anomalies)
 *
 * Edge case: queue is empty AND last drain is older than 15 minutes
 * is still 'stalled' because the cron should be firing every 5 min
 * regardless of queue contents. The presence of recent sync_health
 * entries is the heartbeat signal.
 */

import type { PendingUpdate } from '@/lib/types'
import type { SyncHealthEntry } from '@/lib/syncHealth/appendEntry'

export const STALL_THRESHOLD_MINUTES = 15

export type FreshnessBucket = 'synced' | 'pending' | 'stalled'

export interface FreshnessState {
  bucket: FreshnessBucket
  lastDrainAt: string | null
  lastDrainOk: boolean
  ageMinutes: number | null
  queueDepth: number
  oldestPendingMinutes: number | null
}

export function computeFreshnessState(args: {
  pending: PendingUpdate[]
  history: SyncHealthEntry[]
  now: Date
}): FreshnessState {
  const { pending, history, now } = args
  const nowMs = now.getTime()
  const queueDepth = pending.length

  let oldestPendingMinutes: number | null = null
  if (queueDepth > 0) {
    const oldestTs = pending
      .map((p) => new Date(p.queuedAt).getTime())
      .filter((t) => Number.isFinite(t))
      .reduce((min, t) => (t < min ? t : min), Number.POSITIVE_INFINITY)
    if (Number.isFinite(oldestTs)) {
      oldestPendingMinutes = Math.max(0, (nowMs - oldestTs) / 60_000)
    }
  }

  const latestSync = history
    .slice()
    .reverse()
    .find((e) => e.kind === 'sync')

  let ageMinutes: number | null = null
  if (latestSync) {
    const t = new Date(latestSync.at).getTime()
    if (Number.isFinite(t)) {
      ageMinutes = Math.max(0, (nowMs - t) / 60_000)
    }
  }

  let bucket: FreshnessBucket
  if (queueDepth > 0) {
    bucket = 'pending'
  } else if (ageMinutes === null || ageMinutes > STALL_THRESHOLD_MINUTES) {
    bucket = 'stalled'
  } else {
    bucket = 'synced'
  }

  return {
    bucket,
    lastDrainAt: latestSync?.at ?? null,
    lastDrainOk: latestSync?.ok ?? false,
    ageMinutes,
    queueDepth,
    oldestPendingMinutes,
  }
}

export function formatAgeMinutes(ageMinutes: number | null): string {
  if (ageMinutes === null) return 'never'
  if (ageMinutes < 1) return 'just now'
  if (ageMinutes < 60) return `${Math.floor(ageMinutes)} min ago`
  const hours = Math.floor(ageMinutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'yesterday'
  return `${days}d ago`
}
