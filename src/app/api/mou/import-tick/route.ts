/*
 * POST /api/mou/import-tick (Phase E manual-trigger pattern).
 *
 * Form target for the "Run import sync now" button on /admin.
 * Permission gate: 'system:trigger-sync' (Admin + OpsHead per
 * permissions.ts). No bearer-token auth; uses normal session auth
 * because callers are logged-in users, not a cron daemon.
 *
 * Calls fromMou.importOnce() (Q-A lib), appends a 'import' kind
 * entry to sync_health.json, redirects back to /admin with a
 * status query param so the operator sees what just happened.
 *
 * Phase 1.1 trigger (per CLAUDE.md): when sister-project MOU
 * volume grows beyond manual-trigger comfort, add a GitHub
 * Actions cron runner that hits this same endpoint with a shared-
 * secret header. Lib code stays unchanged.
 */

import { NextResponse } from 'next/server'
import type { User } from '@/lib/types'
import usersJson from '@/data/users.json'
import { importOnce } from '@/lib/importer/fromMou'
import { canPerform } from '@/lib/auth/permissions'
import { getCurrentSession } from '@/lib/auth/session'
import { appendSyncHealth, type SyncHealthEntry } from '@/lib/syncHealth/appendEntry'

const users = usersJson as unknown as User[]

export async function POST(request: Request) {
  const session = await getCurrentSession()
  if (!session) {
    const url = new URL('/login', request.url)
    url.searchParams.set('next', '/admin')
    return NextResponse.redirect(url, { status: 303 })
  }

  const user = users.find((u) => u.id === session.sub)
  if (!user || !canPerform(user, 'system:trigger-sync')) {
    const url = new URL('/admin', request.url)
    url.searchParams.set('error', 'permission')
    return NextResponse.redirect(url, { status: 303 })
  }

  const ts = new Date().toISOString()
  let ok = true
  const anomalies: string[] = []

  try {
    const result = await importOnce()
    const entry: SyncHealthEntry = {
      at: ts,
      kind: 'import',
      ok: result.errors.length === 0,
      triggeredBy: session.sub,
      importSummary: {
        written: result.written.length,
        quarantined: result.quarantined.length,
        filtered: result.filtered,
        autoLinkedSchoolIds: result.autoLinkedSchoolIds,
        errors: result.errors.map((e) => e.message),
      },
      healthChecks: null,
      anomalies: result.errors.map((e) => `import error: ${e.message}`),
    }
    if (!entry.ok) ok = false
    if (entry.anomalies.length > 0) anomalies.push(...entry.anomalies)
    await appendSyncHealth(entry)
  } catch (err) {
    ok = false
    const message = err instanceof Error ? err.message : String(err)
    anomalies.push(`unhandled error: ${message}`)
    const entry: SyncHealthEntry = {
      at: ts,
      kind: 'import',
      ok: false,
      triggeredBy: session.sub,
      importSummary: null,
      healthChecks: null,
      anomalies,
    }
    try {
      await appendSyncHealth(entry)
    } catch {
      // Surface the original error via the redirect; do not double-throw.
    }
  }

  const url = new URL('/admin', request.url)
  url.searchParams.set('synced', ok ? 'import-ok' : 'import-anomaly')
  return NextResponse.redirect(url, { status: 303 })
}
