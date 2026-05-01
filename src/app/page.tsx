/*
 * / Operations Control Dashboard (W4-I.5 P2C5 route migration).
 *
 * Pre-W4-I.5 this route was the kanban; P2C5 moved the kanban to
 * /kanban and the new dashboard here. /dashboard and /overview
 * redirect to / for bookmark + audit-link compatibility.
 *
 * Composition (top to bottom): DashboardHeader (title + Open Kanban
 * Board CTA + FY + date range), DashboardFilterRow (programme chips +
 * Apply / Reset), DashboardStatCards (6 cards), Recent MOU Updates +
 * Action Centre (middle row), Orders and Shipment Tracker + Comm
 * Automation (third row), Communication Templates grid, Sales
 * Pipeline summary, footer.
 *
 * Filters propagate via URL searchParams (parseDashboardFilters);
 * server re-renders against the new params on Apply. No client-side
 * filter state.
 */

import { redirect } from 'next/navigation'
import type {
  Dispatch,
  DispatchRequest,
  Escalation,
  InventoryItem,
  MOU,
  SalesOpportunity,
  SalesPerson,
  School,
} from '@/lib/types'
import mousJson from '@/data/mous.json'
import schoolsJson from '@/data/schools.json'
import dispatchesJson from '@/data/dispatches.json'
import dispatchRequestsJson from '@/data/dispatch_requests.json'
import escalationsJson from '@/data/escalations.json'
import inventoryItemsJson from '@/data/inventory_items.json'
import salesOpportunitiesJson from '@/data/sales_opportunities.json'
import salesTeamJson from '@/data/sales_team.json'
import { getCurrentUser } from '@/lib/auth/session'
import { TopNav } from '@/components/ops/TopNav'
import {
  buildActionCenter,
  buildOrdersTracker,
  buildRecentMouUpdates,
  buildSalesPipelineSummary,
  buildStatCards,
  COMMUNICATION_BUTTONS,
  COMMUNICATION_TEMPLATE_PREVIEWS,
  computeSlices,
  fiscalYearOptions,
  parseDashboardFilters,
} from '@/lib/dashboard/dashboardData'
import { DashboardHeader } from '@/components/ops/dashboard/DashboardHeader'
import { DashboardFilterRow } from '@/components/ops/dashboard/DashboardFilterRow'
import { DashboardStatCards } from '@/components/ops/dashboard/DashboardStatCards'
import { DashboardRecentMous } from '@/components/ops/dashboard/DashboardRecentMous'
import { DashboardActionCenter } from '@/components/ops/dashboard/DashboardActionCenter'
import { DashboardOrdersTracker } from '@/components/ops/dashboard/DashboardOrdersTracker'
import { DashboardCommunicationPanel } from '@/components/ops/dashboard/DashboardCommunicationPanel'
import { DashboardTemplates } from '@/components/ops/dashboard/DashboardTemplates'
import { DashboardSalesPipelineSummary } from '@/components/ops/dashboard/DashboardSalesPipelineSummary'

const allMous = mousJson as unknown as MOU[]
const allSchools = schoolsJson as unknown as School[]
const allDispatches = dispatchesJson as unknown as Dispatch[]
const allDispatchRequests = dispatchRequestsJson as unknown as DispatchRequest[]
const allEscalations = escalationsJson as unknown as Escalation[]
const allInventoryItems = inventoryItemsJson as unknown as InventoryItem[]
const allOpportunities = salesOpportunitiesJson as unknown as SalesOpportunity[]
const allSalesTeam = salesTeamJson as unknown as SalesPerson[]

const DATE_DISPLAY = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
})

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function HomePage({ searchParams }: PageProps) {
  const user = await getCurrentUser()
  if (!user) redirect('/login?next=%2F')

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
  const recentMous = buildRecentMouUpdates({ slices, salesTeam: allSalesTeam })
  const actionCenter = buildActionCenter({
    slices,
    dispatchRequests: allDispatchRequests,
    inventoryItems: allInventoryItems,
    now,
  })
  const orderRows = buildOrdersTracker({
    slices, schools: allSchools, mous: allMous, now,
  })
  const salesPipelineSummary = buildSalesPipelineSummary({
    opportunities: allOpportunities, now,
  })
  const fyOptions = fiscalYearOptions(allMous)
  const fiscalYearForHeader = filters.fiscalYear ?? 'all'

  return (
    <>
      <TopNav currentPath="/" />
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
        <DashboardFilterRow activeProgramme={filters.programme} basePath="/" />
        <div className="mx-auto max-w-screen-2xl space-y-6 px-4 py-6 sm:px-6">
          <DashboardStatCards cards={cards} />
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <DashboardRecentMous
                rows={recentMous}
                totalCount={slices.filteredMous.length}
              />
            </div>
            <DashboardActionCenter data={actionCenter} />
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <DashboardOrdersTracker
                rows={orderRows}
                totalCount={slices.filteredDispatches.length}
              />
            </div>
            <DashboardCommunicationPanel buttons={COMMUNICATION_BUTTONS} />
          </div>
          <DashboardTemplates templates={COMMUNICATION_TEMPLATE_PREVIEWS} />
          <DashboardSalesPipelineSummary data={salesPipelineSummary} />
        </div>
        <footer
          className="border-t border-border bg-card"
          data-testid="dashboard-footer"
        >
          <div className="mx-auto max-w-screen-2xl px-4 py-4 text-xs text-muted-foreground sm:px-6">
            Operations Control Dashboard <span aria-hidden>&middot;</span> Internal use only
          </div>
        </footer>
      </main>
    </>
  )
}
