/*
 * GET /api/health
 *
 * Binary health endpoint for uptime monitors. Returns 200 with a
 * tiny status object; never exercises the queue, JSON validity, or
 * any other system-state check. The graded data-integrity view is
 * a dashboard tile (Phase C) where humans can read it; uptime
 * monitors want a 200/500 binary, not a /warn/ status.
 */

import pkg from '../../../../package.json'

const VERSION = pkg.version

export async function GET() {
  return Response.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: VERSION,
  })
}
