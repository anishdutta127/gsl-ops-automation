/*
 * POST /api/sync/tick (Phase E manual-trigger pattern).
 *
 * Form target for the "Run health check now" button on /admin.
 * Permission gate: 'system:trigger-sync' (Admin + OpsHead).
 *
 * Reads pi_counter.json + pending_updates.json from disk, plus the
 * most recent prior counter snapshot from sync_health.json (the
 * last 'import' or 'health' entry whose pi_counter was captured).
 * For Phase 1 simplified, we treat the in-memory pi_counter as
 * the prior baseline (no snapshot history): the monotonicity
 * check only fires when prior tick was within the same fiscal
 * year and the next value regressed.
 *
 * On read errors (file missing, JSON parse fail), the report
 * surfaces jsonValid=false with the offending file in anomalies.
 * Counter monotonicity uses the prior sync_health entry's
 * captured pi_counter when present.
 */

import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { NextResponse } from 'next/server'
import type { PendingUpdate, PiCounter, User } from '@/lib/types'
import usersJson from '@/data/users.json'
import { canPerform } from '@/lib/auth/permissions'
import { getCurrentSession } from '@/lib/auth/session'
import { checkHealth } from '@/lib/syncHealth/checkHealth'
import {
  appendSyncHealth,
  type SyncHealthEntry,
} from '@/lib/syncHealth/appendEntry'

const users = usersJson as unknown as User[]

const PI_COUNTER_PATH = 'src/data/pi_counter.json'
const PENDING_UPDATES_PATH = 'src/data/pending_updates.json'
const SYNC_HEALTH_PATH = 'src/data/sync_health.json'

async function readJsonFile<T>(relPath: string): Promise<{ raw: string | null; parsed: T | null }> {
  try {
    const full = path.join(process.cwd(), relPath)
    const raw = await readFile(full, 'utf-8')
    try {
      const parsed = JSON.parse(raw) as T
      return { raw, parsed }
    } catch {
      return { raw, parsed: null }
    }
  } catch {
    return { raw: null, parsed: null }
  }
}

function priorCounterFromHistory(
  history: SyncHealthEntry[] | null,
): PiCounter | null {
  if (!history || history.length === 0) return null
  // Walk backwards looking for a previously-recorded counter in
  // healthChecks. Phase 1 doesn't currently capture pi_counter
  // values in the entry, so this returns null until Phase 1.1
  // adds that field. Kept as a hook so monotonicity can engage
  // once history is populated.
  return null
}

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

  const counterFile = await readJsonFile<PiCounter>(PI_COUNTER_PATH)
  const queueFile = await readJsonFile<PendingUpdate[]>(PENDING_UPDATES_PATH)
  const historyFile = await readJsonFile<SyncHealthEntry[]>(SYNC_HEALTH_PATH)

  const now = new Date()
  const report = checkHealth({
    piCounter: counterFile.parsed,
    piCounterRaw: counterFile.raw,
    pendingUpdates: queueFile.parsed,
    pendingUpdatesRaw: queueFile.raw,
    priorCounter: priorCounterFromHistory(historyFile.parsed),
    now,
  })

  const entry: SyncHealthEntry = {
    at: now.toISOString(),
    kind: 'health',
    ok: report.ok,
    triggeredBy: session.sub,
    importSummary: null,
    healthChecks: report.checks,
    anomalies: report.anomalies,
  }

  try {
    await appendSyncHealth(entry)
  } catch {
    // Health-check write failure should not 500 the route; the
    // report content is still surfaced via the redirect param.
  }

  const url = new URL('/admin', request.url)
  url.searchParams.set('synced', report.ok ? 'health-ok' : 'health-anomaly')
  return NextResponse.redirect(url, { status: 303 })
}
