#!/usr/bin/env node

/*
 * scripts/sync-queue.mjs
 *
 * Manual-recovery wrapper for the W4-I.3.A drain runner. Triggers the
 * deployed /api/admin/sync-queue endpoint (W4-I.3.B), which calls the
 * shared drainQueue lib. Same code path as the Vercel cron firing; this
 * script exists for ad-hoc operator-triggered drains (network blip,
 * cron paused for maintenance, post-incident recovery).
 *
 * Authentication: requires CRON_SECRET env var matching the value set
 * in Vercel. The endpoint rejects requests without a matching bearer
 * token. Without the secret, the script exits with a clear error.
 *
 * Target URL: GSL_OPS_BASE_URL env var; falls back to
 * https://gsl-ops-automation.vercel.app for production deploys. For
 * local testing against `next dev`, set GSL_OPS_BASE_URL=http://localhost:3000.
 *
 * Exit codes:
 *   0: drain reported ok=true
 *   1: drain reported ok=false (some entries still in queue)
 *   2: endpoint returned non-2xx
 *   3: environment misconfigured (missing CRON_SECRET)
 */

const baseUrl = process.env.GSL_OPS_BASE_URL ?? 'https://gsl-ops-automation.vercel.app'
const secret = process.env.CRON_SECRET

if (!secret) {
  console.error('ERROR: CRON_SECRET env var is required.')
  console.error('Set the same value that is configured in Vercel for the /api/admin/sync-queue endpoint.')
  process.exit(3)
}

const url = `${baseUrl.replace(/\/$/, '')}/api/admin/sync-queue`
const startedAt = new Date().toISOString()

console.log(`[sync-queue] POST ${url}`)
console.log(`[sync-queue] startedAt=${startedAt}`)

let response
try {
  response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ triggeredBy: 'cli' }),
  })
} catch (err) {
  console.error(`[sync-queue] fetch failed: ${err instanceof Error ? err.message : String(err)}`)
  process.exit(2)
}

const text = await response.text()
if (!response.ok) {
  console.error(`[sync-queue] HTTP ${response.status}: ${text.slice(0, 500)}`)
  process.exit(2)
}

let body
try {
  body = JSON.parse(text)
} catch {
  console.error(`[sync-queue] response was not JSON: ${text.slice(0, 500)}`)
  process.exit(2)
}

console.log(`[sync-queue] ok=${body.ok} drained=${body.drainedCount} remaining=${body.remainingCount} duration=${body.durationMs}ms`)
if (Array.isArray(body.perEntity)) {
  for (const r of body.perEntity) {
    console.log(`[sync-queue]   ${r.entity}: drained=${r.drained} skipped=${r.skipped} failed=${r.failed}${r.error ? ' error=' + r.error : ''}`)
  }
}
if (Array.isArray(body.anomalies) && body.anomalies.length > 0) {
  console.log('[sync-queue] anomalies:')
  for (const a of body.anomalies) console.log(`[sync-queue]   - ${a}`)
}

process.exit(body.ok ? 0 : 1)
