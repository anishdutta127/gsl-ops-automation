/*
 * Sync-runner health check (Phase E / Q-G observability).
 *
 * Pure function. Reads injected snapshots of pi_counter.json +
 * pending_updates.json + a prior pi_counter snapshot, computes the
 * report. The /api/sync/tick route reads the current files from
 * disk before invoking; tests inject deterministic snapshots.
 *
 * Checks performed:
 *   1. JSON validity. The route handler does the parse + type
 *      coerce; a parse failure surfaces here as
 *      `jsonValid: false` with the offending file in `anomalies`.
 *      When this lib is invoked, the snapshots are already parsed
 *      (or null if parse failed); we just report.
 *   2. Counter monotonicity. Today's `pi_counter.next` must be >=
 *      the prior snapshot's value. A regression (today < prior) is
 *      a financial-data integrity bug; surfaces as anomaly.
 *   3. Queue depth. `pending_updates.json.length`. High values
 *      (>50 default) signal queue consumer stuck; surfaces as
 *      anomaly with the count.
 *   4. Stale pending updates. Any update queued >24h still in
 *      pending state. Surfaces oldest-pending-minutes; anomaly if
 *      threshold exceeded.
 *
 * Phase 1 thresholds (deps-injected so tests can vary them):
 *   queueDepthThreshold:    50
 *   stalePendingMinutes:    24 * 60   (24 hours)
 */

import type { PendingUpdate, PiCounter } from '@/lib/types'

export interface SyncHealthChecks {
  jsonValid: boolean
  counterMonotonic: boolean
  queueDepth: number
  oldestPendingMinutes: number | null
}

export interface SyncHealthReport {
  at: string
  ok: boolean
  checks: SyncHealthChecks
  anomalies: string[]
}

export interface CheckHealthInput {
  piCounter: PiCounter | null              // null when JSON parse failed
  piCounterRaw: string | null              // raw file contents for parse-error reporting
  pendingUpdates: PendingUpdate[] | null   // null when JSON parse failed
  pendingUpdatesRaw: string | null
  priorCounter: PiCounter | null           // most recent prior snapshot for monotonicity
  now: Date
}

export interface CheckHealthOptions {
  queueDepthThreshold?: number
  stalePendingMinutes?: number
}

const DEFAULT_QUEUE_DEPTH_THRESHOLD = 50
const DEFAULT_STALE_PENDING_MINUTES = 24 * 60

export function checkHealth(
  input: CheckHealthInput,
  options: CheckHealthOptions = {},
): SyncHealthReport {
  const queueDepthThreshold = options.queueDepthThreshold ?? DEFAULT_QUEUE_DEPTH_THRESHOLD
  const stalePendingMinutes = options.stalePendingMinutes ?? DEFAULT_STALE_PENDING_MINUTES

  const anomalies: string[] = []

  const counterParseOk = input.piCounter !== null
  const queueParseOk = input.pendingUpdates !== null
  const jsonValid = counterParseOk && queueParseOk

  if (!counterParseOk) {
    anomalies.push(
      `pi_counter.json failed to parse: raw length ${input.piCounterRaw?.length ?? 0}`,
    )
  }
  if (!queueParseOk) {
    anomalies.push(
      `pending_updates.json failed to parse: raw length ${input.pendingUpdatesRaw?.length ?? 0}`,
    )
  }

  let counterMonotonic = true
  if (input.piCounter !== null && input.priorCounter !== null) {
    const cur = input.piCounter
    const prior = input.priorCounter
    if (
      cur.fiscalYear === prior.fiscalYear &&
      cur.prefix === prior.prefix &&
      cur.next < prior.next
    ) {
      counterMonotonic = false
      anomalies.push(
        `pi_counter regression: prior ${prior.next}, current ${cur.next} (same fiscal-year + prefix)`,
      )
    }
  }

  const queueDepth = input.pendingUpdates ? input.pendingUpdates.length : 0
  if (queueDepth > queueDepthThreshold) {
    anomalies.push(
      `queue depth ${queueDepth} exceeds threshold ${queueDepthThreshold}; consumer may be stuck`,
    )
  }

  let oldestPendingMinutes: number | null = null
  if (input.pendingUpdates && input.pendingUpdates.length > 0) {
    const nowMs = input.now.getTime()
    let oldest = -Infinity
    for (const update of input.pendingUpdates) {
      const queuedMs = new Date(update.queuedAt).getTime()
      if (Number.isFinite(queuedMs)) {
        const ageMin = (nowMs - queuedMs) / 60_000
        if (ageMin > oldest) oldest = ageMin
      }
    }
    if (oldest >= 0 && Number.isFinite(oldest)) {
      oldestPendingMinutes = Math.floor(oldest)
      if (oldestPendingMinutes > stalePendingMinutes) {
        anomalies.push(
          `oldest pending update is ${oldestPendingMinutes} minutes old; exceeds stale threshold ${stalePendingMinutes}`,
        )
      }
    }
  }

  return {
    at: input.now.toISOString(),
    ok: anomalies.length === 0,
    checks: {
      jsonValid,
      counterMonotonic,
      queueDepth,
      oldestPendingMinutes,
    },
    anomalies,
  }
}
