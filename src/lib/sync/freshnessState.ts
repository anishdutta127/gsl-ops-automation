/*
 * Queue freshness state classification (Gate 5A.5 Step 2; threshold
 * tuned post-walkthrough Fix 2).
 *
 * Reads pending_updates.json + sync_health.json snapshots and
 * produces a tri-state bucket consumed by /admin/queue-status. The
 * top-nav indicator no longer surfaces these buckets visually (see
 * QueueFreshnessIndicatorClient and walkthrough Fix 1); the bucket
 * is still classified here so the Admin debugging surface can
 * highlight a genuinely stalled drain.
 *
 * Buckets:
 *   - 'synced'  -> last drain succeeded within STALL_THRESHOLD_MINUTES AND queue is empty
 *   - 'pending' -> queue has at least one unprocessed write
 *   - 'stalled' -> last drain older than STALL_THRESHOLD_MINUTES (cron
 *                  not firing OR cron firing with persistent anomalies)
 *
 * Threshold rationale (docs/gate-5a.5/SYNC_DIAGNOSTIC.md): cron is
 * configured for every-5-minutes but GitHub Actions free-tier delivery
 * routinely shows 2-3 hour gaps under load. A 15-minute threshold
 * (the W3-B initial value) cried wolf on routine scheduler variance.
 * 180 minutes flags genuine multi-hour outages without false alarms.
 *
 * Edge case: queue is empty AND last drain is older than the threshold
 * is still 'stalled' because the heartbeat signal is the presence of
 * recent sync_health entries, not the queue contents.
 */

import type { PendingUpdate } from '@/lib/types'
import type { SyncHealthEntry } from '@/lib/syncHealth/appendEntry'

export const STALL_THRESHOLD_MINUTES = 180

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
