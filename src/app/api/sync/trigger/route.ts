/*
 * POST /api/sync/trigger (Gate 5A.5 Step 2).
 *
 * User-callable safety net: any authenticated user can force an
 * immediate drain of pending_updates.json rather than waiting for
 * the 5-minute GitHub Actions cron. Misba's W3-B feedback flagged
 * that "I edited and nothing shows up" without a manual fallback
 * felt broken even when the cron was healthy.
 *
 * Auth: session cookie (getCurrentSession). Any active user. The
 * drain itself is idempotent and cheap on an empty queue, so we do
 * not gate by role.
 *
 * Rate limit: one call per user per 60s window (in-memory; see
 * lib/sync/rateLimit.ts for the trade-off).
 *
 * Response shape:
 *   200 { ok: true, drained, remaining, durationMs, ranAt }
 *   401 { ok: false, reason: 'unauthorized' }
 *   429 { ok: false, reason: 'rate-limited', retryAfterMs }
 *
 * On drainQueue anomalies the body still returns ok:true because
 * the trigger itself succeeded; anomalies surface in the `anomalies`
 * array so the client can show them.
 */

import { NextResponse } from 'next/server'
import { drainQueue } from '@/lib/sync/drainQueue'
import { getCurrentSession } from '@/lib/auth/session'
import { checkSyncTriggerRate } from '@/lib/sync/rateLimit'
import { userRepo } from '@/lib/db/repos/user'

export async function POST() {
  const session = await getCurrentSession()
  if (!session) {
    return NextResponse.json(
      { ok: false, reason: 'unauthorized' },
      { status: 401 },
    )
  }

  const users = await userRepo.findAll()
  const user = users.find((u) => u.id === session.sub)
  if (!user || !user.active) {
    return NextResponse.json(
      { ok: false, reason: 'unauthorized' },
      { status: 401 },
    )
  }

  const rate = checkSyncTriggerRate(user.id)
  if (!rate.ok) {
    return NextResponse.json(
      {
        ok: false,
        reason: 'rate-limited',
        retryAfterMs: rate.retryAfterMs,
      },
      {
        status: 429,
        headers: { 'Retry-After': String(Math.ceil(rate.retryAfterMs / 1000)) },
      },
    )
  }

  const result = await drainQueue({ triggeredBy: `manual:${user.id}` })
  return NextResponse.json({
    ok: true,
    drained: result.drainedCount,
    remaining: result.remainingCount,
    failed: result.failedCount,
    durationMs: result.durationMs,
    ranAt: result.finishedAt,
    anomalies: result.anomalies,
  })
}
