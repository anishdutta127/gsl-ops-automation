/*
 * /admin/queue-status (Gate 5A.5 Step 2).
 *
 * Full queue visibility surface: current depth, per-pending-write
 * table, last drain timestamp, recent sync_health anomalies, and
 * a prominent Sync-now button. Admin-only because the per-entry
 * details expose internal write payloads.
 *
 * Reads pending_updates.json + sync_health.json from disk on each
 * request so the surface always reflects the live queue, not a
 * compile-time snapshot.
 */

import { readFile } from 'node:fs/promises'
import path from 'node:path'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Activity, AlertTriangle, CheckCircle2, CircleDashed, UserCheck } from 'lucide-react'
import { getCurrentUser } from '@/lib/auth/session'
import { canManageUsers } from '@/lib/access'
// P4 batch 2 (2026-05-24): live repo read replaces static JSON.
import { userRepo } from '@/lib/db/repos/user'
import type { PendingUpdate } from '@/lib/types'
import type { SyncHealthEntry } from '@/lib/syncHealth/appendEntry'
import {
  computeFreshnessState,
  formatAgeMinutes,
} from '@/lib/sync/freshnessState'
import { TopNav } from '@/components/ops/TopNav'
import { PageHeader } from '@/components/ops/PageHeader'
import { SyncNowButton } from '@/components/ops/SyncNowButton'

const PENDING_PATH = 'src/data/pending_updates.json'
const HEALTH_PATH = 'src/data/sync_health.json'

async function readJson<T>(relPath: string): Promise<T | null> {
  try {
    const full = path.join(process.cwd(), relPath)
    const raw = await readFile(full, 'utf-8')
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

export default async function QueueStatusPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login?next=%2Fadmin%2Fqueue-status')
  if (!canManageUsers(user)) redirect('/admin?error=permission')

  const pending = (await readJson<PendingUpdate[]>(PENDING_PATH)) ?? []
  const history = (await readJson<SyncHealthEntry[]>(HEALTH_PATH)) ?? []
  const now = new Date()
  const state = computeFreshnessState({ pending, history, now })

  const sortedPending = pending
    .slice()
    .sort((a, b) => a.queuedAt.localeCompare(b.queuedAt))

  const recentHistory = history.slice(-10).reverse()

  // Phase 6G Part 5: pending SSO user reviews counter. New users
  // auto-created by the Microsoft sign-in callback land with
  // requiresAdminReview=true; admin promotes them by editing
  // users.json. JSON dump at /api/admin/pending-user-reviews lets
  // an admin see the full list until a real approval UI ships.
  const allUsers = await userRepo.findAll()
  const pendingReviewCount = allUsers.filter((u) => u.requiresAdminReview === true).length

  return (
    <>
      <TopNav currentPath="/admin/queue-status" />
      <PageHeader
        title="Queue status"
        subtitle="Pending writes, last drain, sync anomalies."
        breadcrumb={[
          { label: 'Admin', href: '/admin' },
          { label: 'Queue status' },
        ]}
      />

      <div className="mx-auto max-w-screen-xl space-y-6 px-4 py-6">
        <section
          className="rounded-xl border border-border bg-card p-4 shadow-sm sm:p-6"
          aria-labelledby="queue-summary-heading"
          data-testid="queue-status-summary"
        >
          <header className="mb-3 flex items-baseline justify-between gap-3">
            <h2
              id="queue-summary-heading"
              className="font-heading text-base font-semibold text-brand-navy"
            >
              Current state
            </h2>
            <SyncNowButton variant="primary" />
          </header>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-md border border-border p-3">
              <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
                {state.bucket === 'synced' ? (
                  <CheckCircle2 aria-hidden className="size-4 text-signal-ok" />
                ) : state.bucket === 'pending' ? (
                  <CircleDashed
                    aria-hidden
                    className="size-4 text-signal-attention"
                  />
                ) : (
                  <AlertTriangle aria-hidden className="size-4 text-signal-alert" />
                )}
                <span>Bucket</span>
              </div>
              <p className="mt-1 font-heading text-xl font-semibold text-brand-navy">
                {state.bucket === 'synced'
                  ? 'Synced'
                  : state.bucket === 'pending'
                    ? 'Pending'
                    : 'Stalled'}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {state.bucket === 'synced'
                  ? 'Cron firing on schedule; queue empty.'
                  : state.bucket === 'pending'
                    ? 'Writes waiting for the next drain.'
                    : 'No recent drain; check Vercel logs.'}
              </p>
            </div>

            <div className="rounded-md border border-border p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Queue depth
              </p>
              <p className="mt-1 font-heading text-xl font-semibold text-brand-navy">
                {state.queueDepth}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {state.queueDepth === 0
                  ? 'No pending writes.'
                  : `Oldest: ${formatAgeMinutes(state.oldestPendingMinutes)}`}
              </p>
            </div>

            <div className="rounded-md border border-border p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Last drain
              </p>
              <p className="mt-1 font-heading text-xl font-semibold text-brand-navy">
                {formatAgeMinutes(state.ageMinutes)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {state.lastDrainAt === null
                  ? 'No sync recorded.'
                  : state.lastDrainOk
                    ? 'Last drain: ok'
                    : 'Last drain: anomaly'}
              </p>
            </div>
          </div>

          {/* Phase 6G Part 5: pending SSO user reviews counter. */}
          <div
            className="mt-4 rounded-md border border-border p-3"
            data-testid="pending-user-reviews-tile"
          >
            <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
              <UserCheck aria-hidden className="size-4 text-brand-navy" />
              <span>Pending user reviews</span>
            </div>
            <p className="mt-1 font-heading text-xl font-semibold text-brand-navy">
              {pendingReviewCount}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {pendingReviewCount === 0
                ? 'No new SSO sign-ins waiting for approval.'
                : 'New users auto-created by Microsoft sign-in are inactive until promoted.'}
            </p>
            {pendingReviewCount > 0 && (
              <Link
                href="/api/admin/pending-user-reviews"
                className="mt-2 inline-block text-xs font-medium text-brand-navy underline-offset-2 hover:underline"
                data-testid="pending-user-reviews-link"
              >
                View pending users (JSON)
              </Link>
            )}
          </div>
        </section>

        <section
          className="rounded-xl border border-border bg-card p-4 shadow-sm sm:p-6"
          aria-labelledby="pending-table-heading"
          data-testid="queue-status-pending"
        >
          <h2
            id="pending-table-heading"
            className="mb-3 font-heading text-base font-semibold text-brand-navy"
          >
            Pending writes
          </h2>
          {sortedPending.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Queue is empty. New writes appear here until the next drain.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th scope="col" className="px-2 py-1">Entity</th>
                    <th scope="col" className="px-2 py-1">Operation</th>
                    <th scope="col" className="px-2 py-1">Target id</th>
                    <th scope="col" className="px-2 py-1">Queued by</th>
                    <th scope="col" className="px-2 py-1">Queued at</th>
                    <th scope="col" className="px-2 py-1">Age</th>
                    <th scope="col" className="px-2 py-1">Retries</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {sortedPending.map((p) => {
                    const ageMs = now.getTime() - new Date(p.queuedAt).getTime()
                    const ageMinutes = Number.isFinite(ageMs)
                      ? ageMs / 60_000
                      : null
                    const targetId =
                      typeof (p.payload as { id?: unknown }).id === 'string'
                        ? ((p.payload as { id: string }).id)
                        : '(no id)'
                    return (
                      <tr key={p.id} data-testid={`queue-row-${p.id}`}>
                        <td className="px-2 py-2 text-foreground">{p.entity}</td>
                        <td className="px-2 py-2 text-foreground">{p.operation}</td>
                        <td className="px-2 py-2 font-mono text-xs text-foreground">
                          {targetId}
                        </td>
                        <td className="px-2 py-2 text-foreground">{p.queuedBy}</td>
                        <td className="px-2 py-2 text-xs text-muted-foreground">
                          {p.queuedAt.slice(0, 16).replace('T', ' ')}
                        </td>
                        <td className="px-2 py-2 text-xs text-muted-foreground">
                          {formatAgeMinutes(ageMinutes)}
                        </td>
                        <td className="px-2 py-2 text-foreground">
                          {p.retryCount}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section
          className="rounded-xl border border-border bg-card p-4 shadow-sm sm:p-6"
          aria-labelledby="history-heading"
          data-testid="queue-status-history"
        >
          <h2
            id="history-heading"
            className="mb-3 font-heading text-base font-semibold text-brand-navy"
          >
            Recent sync history
          </h2>
          {recentHistory.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No sync entries logged yet.
            </p>
          ) : (
            <ul className="space-y-2 text-sm">
              {recentHistory.map((entry, idx) => (
                <li
                  key={`${entry.at}-${idx}`}
                  className="flex items-start gap-2 border-b border-border pb-2 last:border-0"
                >
                  <Activity
                    aria-hidden
                    className={
                      'mt-0.5 size-4 shrink-0 '
                      + (entry.ok ? 'text-signal-ok' : 'text-signal-alert')
                    }
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-foreground">
                      <span className="font-medium">{entry.kind}</span>
                      {' '}at {entry.at.slice(0, 16).replace('T', ' ')} UTC
                      {' by '}
                      <span className="text-muted-foreground">
                        {entry.triggeredBy}
                      </span>
                      {' ('}
                      <span
                        className={
                          entry.ok ? 'text-signal-ok' : 'text-signal-alert'
                        }
                      >
                        {entry.ok ? 'ok' : 'anomaly'}
                      </span>
                      {')'}
                    </p>
                    {entry.anomalies.length > 0 ? (
                      <ul className="mt-1 list-disc pl-5 text-xs text-muted-foreground">
                        {entry.anomalies.map((a, i) => (
                          <li key={i}>{a}</li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  )
}
