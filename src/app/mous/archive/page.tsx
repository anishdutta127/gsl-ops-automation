/*
 * /mous/archive (W4-A.4).
 *
 * Read-and-reactivate surface for MOUs whose cohortStatus is
 * 'archived'. NOT a kanban; archived MOUs are no longer
 * operationally driven, so a flat sortable table is the right
 * shape.
 *
 * Visible to every authenticated user (W3-B). The Reactivate
 * button submits to /api/mou/cohort-status with target='active';
 * the API gate is 'mou:edit-cohort-status' (Admin-only via
 * wildcard); non-Admin submits 303 back with ?error=permission.
 *
 * Default sort: most-recently-archived first. The archive
 * timestamp is read from the latest 'mou-cohort-status-changed'
 * audit entry where after.cohortStatus === 'archived'; falling
 * back to MOU.endDate or 'unknown' if no entry exists. Sortable
 * by school name + AY via ?sort= param (Phase 1 keeps it simple;
 * client-side table-header sort can land later if useful).
 *
 * Bulk-edit lives at /admin/mou-status; this page intentionally
 * keeps a single-row Reactivate flow for the common case (operator
 * spotted a wrongly-archived MOU and wants to bring it back).
 */

import Link from 'next/link'
import { Archive, RotateCcw } from 'lucide-react'
import type { MOU } from '@/lib/types'
import mousJson from '@/data/mous.json'
import { getCurrentUser } from '@/lib/auth/session'
import { TopNav } from '@/components/ops/TopNav'
import { PageHeader } from '@/components/ops/PageHeader'
import { EmptyState } from '@/components/ops/EmptyState'

const allMous = mousJson as unknown as MOU[]

type SortKey = 'archivedAt' | 'schoolName' | 'academicYear'

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

const ERROR_MESSAGES: Record<string, string> = {
  permission: 'Reactivating a MOU requires the Admin role. Contact Anish.',
  'unknown-user': 'Session user not found. Please log in again.',
  'mou-not-found': 'MOU not found.',
  'no-change': 'MOU is already active; no change recorded.',
  'invalid-target': 'Submitted target is not a valid cohort status.',
  'missing-mou': 'MOU id is required.',
}

function archivedAt(mou: MOU): string | null {
  for (let i = mou.auditLog.length - 1; i >= 0; i -= 1) {
    const entry = mou.auditLog[i]
    if (entry?.action !== 'mou-cohort-status-changed') continue
    const after = entry.after as { cohortStatus?: string } | undefined
    if (after?.cohortStatus === 'archived') return entry.timestamp
  }
  return null
}

function compareSort(a: MOU, b: MOU, key: SortKey): number {
  if (key === 'schoolName') {
    return a.schoolName.localeCompare(b.schoolName)
  }
  if (key === 'academicYear') {
    return a.academicYear.localeCompare(b.academicYear)
  }
  // archivedAt desc
  const ats = archivedAt(a) ?? ''
  const bts = archivedAt(b) ?? ''
  return bts.localeCompare(ats)
}

export default async function MousArchivePage({ searchParams }: PageProps) {
  const sp = await searchParams
  const user = await getCurrentUser()
  const sortKey = (typeof sp.sort === 'string' && (['archivedAt', 'schoolName', 'academicYear'] as const).includes(sp.sort as SortKey)
    ? sp.sort
    : 'archivedAt') as SortKey
  const errorKey = typeof sp.error === 'string' ? sp.error : null
  const errorMouId = typeof sp.mouId === 'string' ? sp.mouId : null
  const errorMessage = errorKey ? ERROR_MESSAGES[errorKey] ?? `Failed: ${errorKey}` : null

  const flipped = typeof sp.flipped === 'string' ? sp.flipped : null
  const flippedTo = typeof sp.to === 'string' ? sp.to : null

  const archived = allMous
    .filter((m) => m.cohortStatus === 'archived')
    .slice()
    .sort((a, b) => compareSort(a, b, sortKey))

  return (
    <>
      <TopNav currentPath="/mous" />
      <main id="main-content">
        <PageHeader
          title="Archived MOUs"
          subtitle={`${archived.length} archived MOUs across prior cohorts. Reactivate to bring back into the active list.`}
          breadcrumb={[
            { label: 'MOUs', href: '/mous' },
            { label: 'Archive' },
          ]}
        />
        <div className="mx-auto max-w-screen-xl px-4 py-6">
          {flipped !== null && flippedTo === 'active' ? (
            <p
              role="status"
              data-testid="archive-reactivate-flash"
              className="mb-4 rounded-md border border-signal-ok bg-card p-3 text-sm text-foreground"
            >
              {flipped} reactivated. It is now in the operationally-current cohort
              and will appear on the kanban and the main /mous list.
            </p>
          ) : null}
          {errorMessage ? (
            <p
              role="alert"
              data-testid="archive-error-flash"
              className="mb-4 rounded-md border border-signal-alert bg-card p-3 text-sm text-signal-alert"
            >
              {errorMessage}
              {errorMouId ? <span className="ml-1 text-muted-foreground">({errorMouId})</span> : null}
            </p>
          ) : null}

          {archived.length === 0 ? (
            <EmptyState
              title="No archived MOUs."
              description="Archived MOUs land here when their cohort transitions out of operationally-current pursuit."
            />
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border bg-card">
              <table className="w-full text-left text-sm" aria-label="Archived MOUs">
                <thead className="border-b border-border bg-muted/40 text-xs font-medium text-muted-foreground">
                  <tr>
                    <th scope="col" className="px-3 py-2">
                      <Link
                        href="/mous/archive?sort=schoolName"
                        className="hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
                        data-testid="sort-schoolName"
                        aria-current={sortKey === 'schoolName' ? 'true' : undefined}
                      >
                        School
                      </Link>
                    </th>
                    <th scope="col" className="px-3 py-2">MOU id</th>
                    <th scope="col" className="px-3 py-2">Programme</th>
                    <th scope="col" className="px-3 py-2">
                      <Link
                        href="/mous/archive?sort=academicYear"
                        className="hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
                        data-testid="sort-academicYear"
                        aria-current={sortKey === 'academicYear' ? 'true' : undefined}
                      >
                        AY
                      </Link>
                    </th>
                    <th scope="col" className="px-3 py-2">
                      <Link
                        href="/mous/archive?sort=archivedAt"
                        className="hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
                        data-testid="sort-archivedAt"
                        aria-current={sortKey === 'archivedAt' ? 'true' : undefined}
                      >
                        Archived
                      </Link>
                    </th>
                    <th scope="col" className="px-3 py-2 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {archived.map((m) => {
                    const at = archivedAt(m)
                    return (
                      <tr key={m.id} data-testid={`archive-row-${m.id}`}>
                        <td className="px-3 py-2 font-medium text-foreground">
                          <Link
                            href={`/mous/${m.id}`}
                            className="hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
                          >
                            {m.schoolName}
                          </Link>
                        </td>
                        <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{m.id}</td>
                        <td className="px-3 py-2">
                          {m.programme}
                          {m.programmeSubType ? <span className="text-muted-foreground"> / {m.programmeSubType}</span> : null}
                        </td>
                        <td className="px-3 py-2">{m.academicYear}</td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">
                          {at !== null ? at.slice(0, 10) : 'unknown'}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <form action="/api/mou/cohort-status" method="POST" className="inline-flex">
                            <input type="hidden" name="mouId" value={m.id} />
                            <input type="hidden" name="target" value="active" />
                            <input type="hidden" name="returnTo" value="/mous/archive" />
                            <button
                              type="submit"
                              className="inline-flex min-h-11 items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
                              data-testid={`reactivate-${m.id}`}
                              aria-label={`Reactivate ${m.schoolName}`}
                            >
                              <RotateCcw aria-hidden className="size-3.5" />
                              Reactivate
                            </button>
                          </form>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          <p className="mt-6 text-xs text-muted-foreground">
            <Archive aria-hidden className="mr-1 inline size-3.5" />
            Bulk cohort flips happen on <Link href="/admin/mou-status" className="text-brand-navy hover:underline">/admin/mou-status</Link> (Admin only).
            {user ? '' : ' Sign in to use the Reactivate action.'}
          </p>
        </div>
      </main>
    </>
  )
}
