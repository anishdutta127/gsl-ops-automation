/*
 * /admin/mou-status (W4-A.5).
 *
 * Bulk + per-row cohortStatus management for the operations team.
 * Visible to every authenticated user (W3-B); the per-row flip and
 * the bulk-action submit both go through the same lib mutator
 * (setCohortStatus) which gates on 'mou:edit-cohort-status'
 * (Admin-only via wildcard). Non-Admin operators see the page +
 * the form; submit redirects back with ?error=permission so the
 * server-side enforcement is the live gate, not the UI.
 *
 * Filters:
 *   - cohortStatus chip: 'all' | 'active' | 'archived' (default 'all')
 *   - q (search by id or schoolName)
 *
 * Layout:
 *   - filter rail at the top
 *   - table with checkbox column + per-row flip button
 *   - bulk-action bar at the bottom (sticky on tall lists)
 *
 * Per Anish's W4-A brief, Pre-Ops Legacy MOUs are valid candidates
 * for cohort flipping (a Pre-Ops MOU on Anish's 51-list stays
 * cohort='active'; one off the list is cohort='archived').
 */

import Link from 'next/link'
import { ArrowLeft, RotateCcw, Archive, CheckSquare } from 'lucide-react'
import type { MOU } from '@/lib/types'
import mousJson from '@/data/mous.json'
import { TopNav } from '@/components/ops/TopNav'
import { PageHeader } from '@/components/ops/PageHeader'
import { EmptyState } from '@/components/ops/EmptyState'

const allMous = mousJson as unknown as MOU[]

type CohortFilter = 'all' | 'active' | 'archived'

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

const ERROR_MESSAGES: Record<string, string> = {
  permission: 'Editing cohort status requires the Admin role.',
  'unknown-user': 'Session user not found. Please log in again.',
  'mou-not-found': 'MOU not found.',
  'no-change': 'Submitted target matches the current value; no change recorded.',
  'invalid-target': 'Submitted target is not a valid cohort status.',
  'missing-mou': 'MOU id is required.',
  'no-selection': 'No MOUs were selected for the bulk action.',
  'partial-failure': 'Some flips failed (likely permission); see audit log for details.',
}

export default async function AdminMouStatusPage({ searchParams }: PageProps) {
  const sp = await searchParams
  const cohortFilterRaw = typeof sp.cohort === 'string' ? sp.cohort : 'all'
  const cohort: CohortFilter = (['all', 'active', 'archived'] as const).includes(cohortFilterRaw as CohortFilter)
    ? (cohortFilterRaw as CohortFilter)
    : 'all'
  const search = (typeof sp.q === 'string' ? sp.q : '').toLowerCase()

  const errorKey = typeof sp.error === 'string' ? sp.error : null
  const errorMessage = errorKey ? ERROR_MESSAGES[errorKey] ?? `Failed: ${errorKey}` : null

  const flipped = typeof sp.flipped === 'string' ? sp.flipped : null
  const flippedTo = typeof sp.to === 'string' ? sp.to : null
  const bulkCount = typeof sp.bulkCount === 'string' ? sp.bulkCount : null
  const bulkTarget = typeof sp.bulkTarget === 'string' ? sp.bulkTarget : null

  const matched = allMous
    .filter((m) => {
      if (cohort === 'active') return m.cohortStatus === 'active'
      if (cohort === 'archived') return m.cohortStatus === 'archived'
      return true
    })
    .filter((m) => {
      if (search === '') return true
      return (
        m.id.toLowerCase().includes(search)
        || m.schoolName.toLowerCase().includes(search)
      )
    })
    .slice()
    .sort((a, b) => a.id.localeCompare(b.id))

  const cohortCounts = {
    all: allMous.length,
    active: allMous.filter((m) => m.cohortStatus === 'active').length,
    archived: allMous.filter((m) => m.cohortStatus === 'archived').length,
  }

  const filterHref = (next: CohortFilter): string => {
    const qs = new URLSearchParams()
    if (next !== 'all') qs.set('cohort', next)
    if (search !== '') qs.set('q', search)
    const tail = qs.toString()
    return tail === '' ? '/admin/mou-status' : `/admin/mou-status?${tail}`
  }

  return (
    <>
      <TopNav currentPath="/admin" />
      <main id="main-content">
        <PageHeader
          title="MOU cohort status"
          subtitle="Flip individual MOUs between active and archived cohorts. Per-row + bulk affordances both Admin-gated."
          breadcrumb={[
            { label: 'Admin', href: '/admin' },
            { label: 'MOU status' },
          ]}
        />
        <div className="mx-auto max-w-screen-xl px-4 py-6">
          <Link
            href="/admin"
            className="mb-4 inline-flex min-h-11 items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
          >
            <ArrowLeft aria-hidden className="size-4" /> Back to Admin
          </Link>

          {flipped !== null && flippedTo !== null ? (
            <p
              role="status"
              data-testid="mou-status-flash"
              className="mb-4 rounded-md border border-signal-ok bg-card p-3 text-sm text-foreground"
            >
              {flipped} flipped to <strong>{flippedTo}</strong>.
            </p>
          ) : null}
          {bulkCount !== null && bulkTarget !== null ? (
            <p
              role="status"
              data-testid="mou-status-bulk-flash"
              className="mb-4 rounded-md border border-signal-ok bg-card p-3 text-sm text-foreground"
            >
              {bulkCount} MOUs flipped to <strong>{bulkTarget}</strong>. Audit log captures every change.
            </p>
          ) : null}
          {errorMessage ? (
            <p
              role="alert"
              data-testid="mou-status-error-flash"
              className="mb-4 rounded-md border border-signal-alert bg-card p-3 text-sm text-signal-alert"
            >
              {errorMessage}
            </p>
          ) : null}

          <nav aria-label="Cohort filter" className="mb-3 flex flex-wrap gap-2">
            {(['all', 'active', 'archived'] as const).map((opt) => (
              <Link
                key={opt}
                href={filterHref(opt)}
                className={
                  'inline-flex min-h-11 items-center rounded-full border px-3 py-1 text-xs font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy '
                  + (cohort === opt
                    ? 'border-brand-navy bg-brand-navy text-white'
                    : 'border-border bg-card text-foreground hover:bg-muted')
                }
                data-testid={`cohort-filter-${opt}`}
                aria-current={cohort === opt ? 'page' : undefined}
              >
                {opt.charAt(0).toUpperCase() + opt.slice(1)}
                <span className="ml-1.5 text-[10px] opacity-80">{cohortCounts[opt]}</span>
              </Link>
            ))}
          </nav>

          <form action="/admin/mou-status" method="GET" className="mb-4 flex gap-2" role="search">
            {cohort !== 'all' ? (
              <input type="hidden" name="cohort" value={cohort} />
            ) : null}
            <input
              type="search"
              name="q"
              defaultValue={search}
              placeholder="Search id or school name"
              aria-label="Search MOUs"
              className="block w-full max-w-sm rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
            />
            <button
              type="submit"
              className="inline-flex min-h-11 items-center rounded-md border border-border bg-card px-4 py-2 text-sm font-medium hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
            >
              Search
            </button>
          </form>

          {matched.length === 0 ? (
            <EmptyState
              title="No MOUs match the current filters."
              description="Adjust the cohort chip or clear the search."
            />
          ) : (
            <form
              action="/api/admin/mou-status/bulk"
              method="POST"
              data-testid="bulk-form"
            >
              <div className="overflow-x-auto rounded-lg border border-border bg-card">
                <table className="w-full text-left text-sm" aria-label="MOU cohort status">
                  <thead className="border-b border-border bg-muted/40 text-xs font-medium text-muted-foreground">
                    <tr>
                      <th scope="col" className="w-10 px-3 py-2">
                        <span className="sr-only">Select</span>
                      </th>
                      <th scope="col" className="px-3 py-2">MOU id</th>
                      <th scope="col" className="px-3 py-2">School</th>
                      <th scope="col" className="px-3 py-2">Programme</th>
                      <th scope="col" className="px-3 py-2">AY</th>
                      <th scope="col" className="px-3 py-2">Cohort</th>
                      <th scope="col" className="px-3 py-2 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {matched.map((m) => {
                      const flipTarget = m.cohortStatus === 'active' ? 'archived' : 'active'
                      return (
                        <tr key={m.id} data-testid={`mou-status-row-${m.id}`}>
                          <td className="px-3 py-2">
                            <input
                              type="checkbox"
                              name="mouIds"
                              value={m.id}
                              aria-label={`Select ${m.id} for bulk action`}
                              className="size-4 rounded border-input"
                              data-testid={`bulk-select-${m.id}`}
                            />
                          </td>
                          <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{m.id}</td>
                          <td className="px-3 py-2 font-medium text-foreground">
                            <Link
                              href={`/mous/${m.id}`}
                              className="hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
                            >
                              {m.schoolName}
                            </Link>
                          </td>
                          <td className="px-3 py-2">
                            {m.programme}
                            {m.programmeSubType ? <span className="text-muted-foreground"> / {m.programmeSubType}</span> : null}
                          </td>
                          <td className="px-3 py-2">{m.academicYear}</td>
                          <td className="px-3 py-2">
                            <span
                              className={
                                'inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold '
                                + (m.cohortStatus === 'active'
                                  ? 'border-signal-ok text-signal-ok'
                                  : 'border-border bg-muted text-muted-foreground')
                              }
                              data-testid={`cohort-badge-${m.id}`}
                            >
                              {m.cohortStatus}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right">
                            <span className="inline-flex">
                              <button
                                type="submit"
                                formAction="/api/mou/cohort-status"
                                formMethod="POST"
                                name="mouId"
                                value={m.id}
                                className="inline-flex min-h-11 items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
                                data-testid={`flip-${m.id}`}
                                aria-label={`Flip ${m.id} to ${flipTarget}`}
                              >
                                {flipTarget === 'active' ? (
                                  <RotateCcw aria-hidden className="size-3.5" />
                                ) : (
                                  <Archive aria-hidden className="size-3.5" />
                                )}
                                Mark {flipTarget}
                              </button>
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <div
                className="mt-4 flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/30 p-3"
                data-testid="bulk-actions-bar"
              >
                <CheckSquare aria-hidden className="size-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Bulk action on selected:</span>
                <button
                  type="submit"
                  name="target"
                  value="active"
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
                  data-testid="bulk-mark-active"
                >
                  <RotateCcw aria-hidden className="size-3.5" />
                  Mark selected active
                </button>
                <button
                  type="submit"
                  name="target"
                  value="archived"
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
                  data-testid="bulk-mark-archived"
                >
                  <Archive aria-hidden className="size-3.5" />
                  Mark selected archived
                </button>
              </div>
            </form>
          )}

          <p className="mt-6 text-xs text-muted-foreground">
            Operators can also reactivate a single archived MOU directly from{' '}
            <Link href="/mous/archive" className="text-brand-navy hover:underline">
              /mous/archive
            </Link>
            . Bulk flips audit-log per row and respect the same Admin gate.
          </p>
        </div>
      </main>
    </>
  )
}
