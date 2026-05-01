/*
 * /dashboard: Operations Control Dashboard (W4-I.5 Phase 2).
 *
 * P2 commit 1: scaffold with header (FY + date range), programme
 * filter chips, and 6 stat cards. Subsequent commits add the Recent
 * MOU Updates table + Action Center (commit 2), Orders Tracker +
 * Communication Automation panel (commit 3), Communication Templates
 * grid + Sales Pipeline summary (commit 4). Route migration to /
 * lands in commit 5.
 *
 * Pre-W4-I.5 this route was an alias of /overview (which still serves
 * the legacy 5-tile + exception feed body). The new dashboard lives
 * here while built; commit 5 will redirect /overview here too. See
 * D-XXX (OverviewContent migration audit) for what migrated cleanly
 * vs reshaped vs deferred.
 *
 * Filters propagate via URL searchParams (parseDashboardFilters);
 * server re-renders against the new params on Apply. No client-side
 * filter state.
 */

import { redirect } from 'next/navigation'
import type {
  Dispatch,
  Escalation,
  InventoryItem,
  MOU,
  School,
} from '@/lib/types'
import mousJson from '@/data/mous.json'
import schoolsJson from '@/data/schools.json'
import dispatchesJson from '@/data/dispatches.json'
import escalationsJson from '@/data/escalations.json'
import inventoryItemsJson from '@/data/inventory_items.json'
import { getCurrentUser } from '@/lib/auth/session'
import { TopNav } from '@/components/ops/TopNav'
import {
  buildStatCards,
  computeSlices,
  fiscalYearOptions,
  parseDashboardFilters,
} from '@/lib/dashboard/dashboardData'
import { DashboardHeader } from '@/components/ops/dashboard/DashboardHeader'
import { DashboardFilterRow } from '@/components/ops/dashboard/DashboardFilterRow'
import { DashboardStatCards } from '@/components/ops/dashboard/DashboardStatCards'

const allMous = mousJson as unknown as MOU[]
const allSchools = schoolsJson as unknown as School[]
const allDispatches = dispatchesJson as unknown as Dispatch[]
const allEscalations = escalationsJson as unknown as Escalation[]
const allInventoryItems = inventoryItemsJson as unknown as InventoryItem[]

const DATE_DISPLAY = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
})

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function DashboardPage({ searchParams }: PageProps) {
  const user = await getCurrentUser()
  if (!user) redirect('/login?next=%2Fdashboard')

  const sp = await searchParams
  const filters = parseDashboardFilters(sp)
  const now = new Date()
  const todayLabel = DATE_DISPLAY.format(now)

  const slices = computeSlices({
    mous: allMous,
    schools: allSchools,
    dispatches: allDispatches,
    escalations: allEscalations,
    filters,
  })
  const cards = buildStatCards({
    slices,
    schools: allSchools,
    inventoryItems: allInventoryItems,
    now,
  })
  const fyOptions = fiscalYearOptions(allMous)
  const fiscalYearForHeader = filters.fiscalYear ?? 'all'

  return (
    <>
      <TopNav currentPath="/dashboard" />
      <main id="main-content">
        <DashboardHeader
          title="Operations Control Dashboard"
          subtitle="Track school onboarding, orders, shipments, inventory, and communication in one place."
          todayLabel={todayLabel}
          fiscalYearOptions={fyOptions}
          fiscalYear={fiscalYearForHeader}
          fromDate={filters.fromDate ?? ''}
          toDate={filters.toDate ?? ''}
        />
        <DashboardFilterRow activeProgramme={filters.programme} basePath="/dashboard" />
        <div className="mx-auto max-w-screen-2xl space-y-6 px-4 py-6 sm:px-6">
          <DashboardStatCards cards={cards} />
        </div>
      </main>
    </>
  )
}
