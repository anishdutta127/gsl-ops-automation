/*
 * POST /api/admin/sync-queue (W4-I.3.B).
 *
 * Cron-only endpoint. Vercel cron sends `Authorization: Bearer
 * $CRON_SECRET` automatically when the cron is configured against a
 * project that has CRON_SECRET set as an environment variable. This
 * route validates the bearer token and then invokes the shared
 * drainQueue lib.
 *
 * Auth model:
 *   - 500 if CRON_SECRET is not configured (fail-loud rather than
 *     run unauthenticated). Vercel deploy must set the env var first.
 *   - 401 if Authorization header missing or does not match.
 *   - 200 + JSON DrainResult on a valid call. ok=false in the body
 *     when the drain found anomalies; the caller (cron) sees a 200
 *     either way and reads the JSON to surface failures.
 *
 * The CLI wrapper at scripts/sync-queue.mjs uses the same auth path.
 *
 * No session-cookie auth on this route: it is not user-callable from
 * the UI. /admin's "Run health check now" + "Run import sync now"
 * buttons hit /api/sync/tick + /api/mou/import-tick which keep their
 * session-based auth. Auto-drain is a separate code path.
 */

import { NextResponse } from 'next/server'
import { drainQueue } from '@/lib/sync/drainQueue'

interface IncomingBody {
  triggeredBy?: unknown
}

export async function POST(request: Request) {
  const expected = process.env.CRON_SECRET
  if (!expected || expected.trim() === '') {
    return NextResponse.json(
      { ok: false, reason: 'cron-secret-not-configured' },
      { status: 500 },
    )
  }

  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${expected}`) {
    return NextResponse.json(
      { ok: false, reason: 'unauthorized' },
      { status: 401 },
    )
  }

  let triggeredBy = 'cron'
  try {
    const body = (await request.json()) as IncomingBody
    if (typeof body.triggeredBy === 'string' && body.triggeredBy.trim() !== '') {
      triggeredBy = body.triggeredBy.trim()
    }
  } catch {
    // No body or invalid JSON; cron sends none, that is fine.
  }

  const result = await drainQueue({ triggeredBy })
  return NextResponse.json(result)
}
