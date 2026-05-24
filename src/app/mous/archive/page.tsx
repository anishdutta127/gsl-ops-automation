/*
 * /mous/archive (W4-A.4 + Phase 6C.1).
 *
 * Read-and-reactivate surface for MOUs whose cohortStatus is
 * 'archived'. Phase 6C.1 wires the 4-column PI x Payment status
 * panel onto this page so Pranav's FY 25-26 historical invoicing
 * state (all of which is cohortStatus='archived') surfaces with the
 * same panel that /mous uses for active cohorts.
 *
 * Year picker behaves identically to /mous: relevant years are
 * derived from the archived MOUs + their instalments; default is
 * the FY with the most archived data unless the URL carries
 * ?year=. Filter cohort first (archived), then year-window via
 * getYearSpecificInstalments.
 *
 * Reactivate action stays a per-row form submitting to
 * /api/mou/cohort-status with target='active'. The shared panel
 * accepts an actionColumn prop for the desktop table + a
 * mobileAction prop for the mobile card.
 */

import Link from 'next/link'
import { Archive, RotateCcw } from 'lucide-react'
import type { MOU } from '@/lib/types'
import { mouRepo } from '@/lib/db/repos/mou'
import { paymentRepo } from '@/lib/db/repos/payment'
import { getCurrentUser } from '@/lib/auth/session'
import { TopNav } from '@/components/ops/TopNav'
import { PageHeader } from '@/components/ops/PageHeader'
import { EmptyState } from '@/components/ops/EmptyState'
import { YearPickerPills } from '@/components/ops/YearPickerPills'
import { MouRegistryBucketsPanel } from '@/components/ops/MouRegistryBucketsPanel'
import {
  filterMousByFinancialYear,
  getAllRelevantFinancialYears,
  getCurrentFinancialYear,
} from '@/lib/mou/yearMembership'

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

function ReactivateButton({ mou }: { mou: MOU }) {
  return (
    <form action="/api/mou/cohort-status" method="POST" className="inline-flex">
      <input type="hidden" name="mouId" value={mou.id} />
      <input type="hidden" name="target" value="active" />
      <input type="hidden" name="returnTo" value="/mous/archive" />
      <button
        type="submit"
        className="inline-flex min-h-11 items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
        data-testid={`reactivate-${mou.id}`}
        aria-label={`Reactivate ${mou.schoolName}`}
      >
        <RotateCcw aria-hidden className="size-3.5" />
        Reactivate
      </button>
    </form>
  )
}

export default async function MousArchivePage({ searchParams }: PageProps) {
  const sp = await searchParams
  const user = await getCurrentUser()
  const errorKey = typeof sp.error === 'string' ? sp.error : null
  const errorMouId = typeof sp.mouId === 'string' ? sp.mouId : null
  const errorMessage = errorKey ? ERROR_MESSAGES[errorKey] ?? `Failed: ${errorKey}` : null
  const flipped = typeof sp.flipped === 'string' ? sp.flipped : null
  const flippedTo = typeof sp.to === 'string' ? sp.to : null

  const [allMous, allPayments] = await Promise.all([
    mouRepo.findAll(),
    paymentRepo.findAll(),
  ])

  // Phase 6C.1: year picker on archive, mirroring /mous behaviour.
  // Cohort filter is fixed to 'archived'; the active year defaults
  // to whichever FY has the most archived instalments unless the
  // URL carries ?year=.
  const archivedAll = allMous.filter((m) => m.cohortStatus === 'archived')
  const relevantYears = getAllRelevantFinancialYears(archivedAll, allPayments)
  const currentFy = getCurrentFinancialYear()
  const yearParam = typeof sp.year === 'string' ? sp.year : null
  const activeYear =
    yearParam && relevantYears.includes(yearParam)
      ? yearParam
      : relevantYears[0] ?? currentFy
  const yearFiltered = filterMousByFinancialYear(
    archivedAll,
    allPayments,
    activeYear,
  )

  return (
    <>
      <TopNav currentPath="/mous" />
      <main id="main-content">
        <PageHeader
          title="Archived MOUs"
          subtitle={`${archivedAll.length} archived MOUs across prior cohorts. ${yearFiltered.length} in FY ${activeYear}. Reactivate to bring back into the active list.`}
          breadcrumb={[
            { label: 'MOUs', href: '/mous' },
            { label: 'Archive' },
          ]}
        />
        {relevantYears.length > 0 ? (
          <YearPickerPills
            years={relevantYears}
            activeYear={activeYear}
            otherParams={sp}
          />
        ) : null}
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

          <MouRegistryBucketsPanel
            rows={yearFiltered}
            activeYear={activeYear}
            allPayments={allPayments}
            rowHref={(m) => `/mous/${m.id}?fy=${encodeURIComponent(activeYear)}`}
            actionColumn={{
              header: 'Reactivate',
              render: (m) => <ReactivateButton mou={m} />,
            }}
            mobileAction={(m) => <ReactivateButton mou={m} />}
            footerScopeLabel={`${yearFiltered.length} archived MOU(s) for FY ${activeYear}`}
            empty={
              archivedAll.length === 0 ? (
                <EmptyState
                  title="No archived MOUs."
                  description="Archived MOUs land here when their cohort transitions out of operationally-current pursuit."
                />
              ) : (
                <EmptyState
                  title={`No archived MOUs in FY ${activeYear}.`}
                  description="Switch the year picker to see archived MOUs from a different FY."
                />
              )
            }
          />

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
