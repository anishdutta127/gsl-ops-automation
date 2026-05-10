/*
 * /admin/data-snapshot (Gate 2 Step 4).
 *
 * Admin-only surface that displays the gsl-mou-system snapshot stored at
 * src/data/_snapshots/mou-system/_meta.json. Counts, timestamp, diff
 * against the previous snapshot, and the chain-candidate list flagged
 * for manual reconciliation.
 *
 * The snapshot is for VERIFICATION purposes during the parallel-build
 * window: the mouSystem-namespace libs run on this data to assert
 * identical totals, identical PI numbers vs gsl-mou-system. Pranav,
 * Shubhangi, and Anita continue daily MOU/PI/payment work on
 * gsl-mou-system.vercel.app; nothing here flips that.
 *
 * Refresh: invoked from Anish's local machine via
 *   `node scripts/cutover-snapshot.mjs`
 * The button on this page documents the command rather than running
 * a server action, because the source data lives outside the Vercel
 * runtime (it is on Anish's local gsl-mou-system clone) and a server
 * action would require a network bridge or CI runner. Cleaner to keep
 * the import as a CLI step Anish triggers manually.
 */

import fs from 'node:fs'
import path from 'node:path'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { Database, RefreshCw } from 'lucide-react'
import { getCurrentUser } from '@/lib/auth/session'
import { canManageUsers } from '@/lib/access'
import { TopNav } from '@/components/ops/TopNav'
import { PageHeader } from '@/components/ops/PageHeader'

interface SnapshotMeta {
  snapshotTakenAt: string
  sourceDirectory: string
  counts: Record<string, number>
  diffsAgainstPreviousSnapshot: Record<string, { added: string[]; removed: string[] }>
  chainCandidates: Array<{ schoolId: string; name: string }>
  notes: string[]
}

function loadMeta(): SnapshotMeta | null {
  const p = path.join(process.cwd(), 'src/data/_snapshots/mou-system/_meta.json')
  if (!fs.existsSync(p)) return null
  try {
    return JSON.parse(fs.readFileSync(p, 'utf-8')) as SnapshotMeta
  } catch {
    return null
  }
}

const COUNT_LABELS: Record<string, string> = {
  mous: 'MOUs',
  schools: 'Schools',
  school_groups: 'School Groups',
  payments: 'Payments',
  payment_logs: 'Payment logs',
  agreements: 'Agreements',
  signed_values: 'Signed values',
  vex_products: 'VEX products',
  vex_pis: 'VEX PIs',
  vex_dispatches: 'VEX dispatches',
  vex_orders: 'VEX orders',
  adjustments: 'Adjustments',
  sales_team: 'Sales team',
}

export default async function DataSnapshotPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login?next=%2Fadmin%2Fdata-snapshot')
  // Admin-only per Gate 1 access matrix. canManageUsers gates Admin role.
  if (!canManageUsers(user)) notFound()

  const meta = loadMeta()
  const diffs = meta?.diffsAgainstPreviousSnapshot ?? {}
  const hasDiffs = Object.values(diffs).some(
    (d) => d.added.length > 0 || d.removed.length > 0,
  )

  return (
    <>
      <TopNav currentPath="/admin" />
      <main id="main-content">
        <PageHeader
          title="Data snapshot"
          breadcrumb={[{ label: 'Admin', href: '/admin' }, { label: 'Data snapshot' }]}
        />
        <div className="mx-auto max-w-screen-xl space-y-6 px-4 py-6 sm:px-6">
          <header className="rounded-md border border-border bg-card p-6">
            <div className="flex items-start gap-3">
              <Database aria-hidden className="size-5 shrink-0 text-brand-navy" />
              <div className="flex-1">
                <h1 className="font-heading text-2xl font-bold text-brand-navy">
                  gsl-mou-system snapshot
                </h1>
                <p className="mt-1 text-sm text-slate-700">
                  Read-only snapshot of every entity from gsl-mou-system, stored at
                  <code className="ml-1 rounded bg-muted px-1 py-0.5 text-xs">
                    src/data/_snapshots/mou-system/
                  </code>
                  . Used by the mouSystem libs for verification only; the live
                  source-of-truth for MOUs, payments, and PIs stays on
                  gsl-mou-system.vercel.app until Gate 5 cutover.
                </p>
              </div>
            </div>
          </header>

          {meta === null ? (
            <section className="rounded-md border border-amber-200 bg-amber-50 p-6">
              <h2 className="font-heading text-lg font-semibold text-amber-900">
                No snapshot found
              </h2>
              <p className="mt-2 text-sm text-amber-900">
                Run the snapshot script on Anish&apos;s local machine to populate this page:
              </p>
              <pre className="mt-3 overflow-x-auto rounded bg-amber-100 p-3 text-xs text-amber-900">
                node scripts/cutover-snapshot.mjs
              </pre>
            </section>
          ) : (
            <>
              <section className="rounded-md border border-border bg-card p-6">
                <h2 className="font-heading text-lg font-semibold text-brand-navy">
                  Last snapshot
                </h2>
                <dl className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Taken at
                    </dt>
                    <dd className="mt-0.5 text-sm text-foreground" data-testid="snapshot-taken-at">
                      {meta.snapshotTakenAt}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Source
                    </dt>
                    <dd className="mt-0.5 text-xs font-mono text-slate-700">
                      {meta.sourceDirectory}
                    </dd>
                  </div>
                </dl>
              </section>

              <section className="rounded-md border border-border bg-card p-6">
                <h2 className="font-heading text-lg font-semibold text-brand-navy">
                  Entity counts
                </h2>
                <ul
                  className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3"
                  data-testid="snapshot-counts"
                >
                  {Object.entries(meta.counts).map(([key, n]) => (
                    <li
                      key={key}
                      className="flex items-baseline justify-between rounded border border-border bg-muted/30 px-3 py-2"
                    >
                      <span className="text-sm text-slate-700">
                        {COUNT_LABELS[key] ?? key}
                      </span>
                      <span className="font-mono text-sm font-semibold text-brand-navy">
                        {n.toLocaleString('en-IN')}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>

              <section className="rounded-md border border-border bg-card p-6">
                <h2 className="font-heading text-lg font-semibold text-brand-navy">
                  Refresh snapshot
                </h2>
                <p className="mt-2 text-sm text-slate-700">
                  Run the snapshot script on Anish&apos;s local machine. The source data
                  (gsl-mou-system) lives outside the Vercel runtime, so the import is a
                  CLI step rather than a server action. The button below copies the
                  command for convenience.
                </p>
                <div className="mt-3 flex items-center gap-2">
                  <RefreshCw aria-hidden className="size-4 shrink-0 text-slate-500" />
                  <code
                    className="flex-1 overflow-x-auto rounded border border-border bg-muted px-3 py-2 text-xs"
                    data-testid="snapshot-refresh-command"
                  >
                    node scripts/cutover-snapshot.mjs
                  </code>
                </div>
              </section>

              <section className="rounded-md border border-border bg-card p-6">
                <h2 className="font-heading text-lg font-semibold text-brand-navy">
                  Diff vs previous snapshot
                </h2>
                {hasDiffs ? (
                  <ul
                    className="mt-3 divide-y divide-border"
                    data-testid="snapshot-diffs"
                  >
                    {Object.entries(diffs)
                      .filter(([, d]) => d.added.length > 0 || d.removed.length > 0)
                      .map(([key, d]) => (
                        <li key={key} className="py-3">
                          <div className="font-mono text-xs font-semibold text-brand-navy">
                            {key}
                          </div>
                          {d.added.length > 0 ? (
                            <p className="mt-1 text-sm text-emerald-700">
                              +{d.added.length} added: {d.added.slice(0, 5).join(', ')}
                              {d.added.length > 5 ? ` +${d.added.length - 5} more` : ''}
                            </p>
                          ) : null}
                          {d.removed.length > 0 ? (
                            <p className="mt-1 text-sm text-amber-700">
                              -{d.removed.length} removed (needs investigation):{' '}
                              {d.removed.slice(0, 5).join(', ')}
                              {d.removed.length > 5 ? ` +${d.removed.length - 5} more` : ''}
                            </p>
                          ) : null}
                        </li>
                      ))}
                  </ul>
                ) : (
                  <p
                    className="mt-3 text-sm text-slate-600"
                    data-testid="snapshot-no-diff"
                  >
                    No diff. The current snapshot matches the previous one record-for-record.
                  </p>
                )}
              </section>

              {meta.chainCandidates.length > 0 ? (
                <section className="rounded-md border border-amber-200 bg-amber-50 p-6">
                  <h2 className="font-heading text-lg font-semibold text-amber-900">
                    Chain candidates flagged for review
                  </h2>
                  <p className="mt-2 text-sm text-amber-900">
                    These schools may be chain MOUs (Narayana, Techno India, etc.) and
                    need manual SchoolGroup reconciliation before Gate 5 cutover. The
                    1:1 default backfill is in place; chain consolidation is the
                    follow-up.
                  </p>
                  <ul
                    className="mt-3 space-y-1 text-sm"
                    data-testid="snapshot-chain-candidates"
                  >
                    {meta.chainCandidates.map((c) => (
                      <li key={c.schoolId} className="font-mono text-xs">
                        <span className="font-semibold">{c.schoolId}</span>:{' '}
                        <span className="font-sans">{c.name}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              <section className="rounded-md border border-border bg-card p-6">
                <h2 className="font-heading text-lg font-semibold text-brand-navy">
                  Notes
                </h2>
                <ul className="mt-3 space-y-1 text-sm text-slate-700">
                  {meta.notes.map((n, i) => (
                    <li key={i} className="flex gap-2">
                      <span aria-hidden className="text-slate-400">·</span>
                      <span>{n}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-sm text-slate-600">
                  See{' '}
                  <Link
                    href="https://github.com/anishdutta127/gsl-ops-automation/blob/main/docs/MERGE_PLAN.md"
                    className="text-brand-navy hover:underline"
                  >
                    MERGE_PLAN.md §9
                  </Link>{' '}
                  for the cutover plan.
                </p>
              </section>
            </>
          )}
        </div>
      </main>
    </>
  )
}
