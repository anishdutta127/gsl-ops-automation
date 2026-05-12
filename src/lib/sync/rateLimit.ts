/*
 * In-memory rate limit for /api/sync/trigger (Gate 5A.5 Step 2).
 *
 * Per-user 1-call-per-60-seconds window. Vercel serverless functions
 * run a fresh module instance per cold start, so the limit is best-
 * effort: a user spamming Sync now across multiple concurrent function
 * containers could occasionally exceed it. That is acceptable because
 * the downstream drainQueue is idempotent and cheap on an empty queue;
 * the rate limit exists to protect against accidental double-click
 * floods, not malicious abuse.
 */

const WINDOW_MS = 60_000

const lastTriggerAt = new Map<string, number>()

export interface RateLimitOk {
  ok: true
}

export interface RateLimitBlocked {
  ok: false
  retryAfterMs: number
}

export type RateLimitResult = RateLimitOk | RateLimitBlocked

export function checkSyncTriggerRate(
  userId: string,
  now: number = Date.now(),
): RateLimitResult {
  const last = lastTriggerAt.get(userId)
  if (last !== undefined && now - last < WINDOW_MS) {
    return { ok: false, retryAfterMs: WINDOW_MS - (now - last) }
  }
  lastTriggerAt.set(userId, now)
  return { ok: true }
}

export function __resetSyncTriggerRateLimit(): void {
  lastTriggerAt.clear()
}
