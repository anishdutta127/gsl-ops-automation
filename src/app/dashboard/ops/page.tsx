/*
 * /dashboard/ops Operations Control Dashboard (Gate 3.6 Step 4).
 *
 * Pre-Gate-3.6 this URL was a redirect to / and the dashboard
 * itself rendered at /. Gate 3.6 replaces / with the consolidated
 * landing and moves this dashboard here so the deep Ops workspace
 * stays a click away.
 *
 * Composition (top to bottom): DashboardHeader (title + Open Kanban
 * Board CTA + FY + date range), DashboardFilterRow (programme chips +
 * Apply / Reset), DashboardStatCards (6 cards), Recent MOU Updates +
 * Action Centre (middle row), Orders and Shipment Tracker + Comm
 * Automation (third row), Communication Templates grid, footer.
 *
 * Filters propagate via URL searchParams (parseDashboardFilters);
 * server re-renders against the new params on Apply. No client-side
 * filter state.
 */

import { redirect } from 'next/navigation'
import type { DispatchRequest, SalesOpportunity, StageResponsibility } from '@/lib/types'
// P4 batch 2 (2026-05-24): live repo reads.
import { mouRepo } from '@/lib/db/repos/mou'
import { schoolRepo } from '@/lib/db/repos/school'
import { dispatchRepo } from '@/lib/db/repos/dispatch'
import { escalationRepo } from '@/lib/db/repos/escalation'
import { inventoryItemRepo } from '@/lib/db/repos/inventoryItem'
import { kitDispatchRepo } from '@/lib/db/repos/kitDispatch'
import { paymentRepo } from '@/lib/db/repos/payment'
import { userRepo } from '@/lib/db/repos/user'
import { salesTeamRepo } from '@/lib/db/repos/salesTeam'
import {
  dispatchRequestRepo,
  salesOpportunityRepo,
  stageResponsibilityRepo,
} from '@/lib/db/repos/leafRepos'
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
  productOptionsForFilters,
} from '@/lib/dashboard/dashboardData'
import {
  applyOpsAugmentFilters,
  buildOpsOwnerOptions,
  buildSalesRepOptions,
  computeOpsProgrammeBreakdown,
  isOpsAugmentFiltersEmpty,
  parseOpsAugmentFilters,
} from '@/lib/dashboard/opsAugmentData'
import { DashboardHeader } from '@/components/ops/dashboard/DashboardHeader'
import { DashboardFilterRow } from '@/components/ops/dashboard/DashboardFilterRow'
import { DashboardStatCards } from '@/components/ops/dashboard/DashboardStatCards'
import { DashboardRecentMous } from '@/components/ops/dashboard/DashboardRecentMous'
import { DashboardActionCenter } from '@/components/ops/dashboard/DashboardActionCenter'
import { DashboardOrdersTracker } from '@/components/ops/dashboard/DashboardOrdersTracker'
import { DashboardCommunicationPanel } from '@/components/ops/dashboard/DashboardCommunicationPanel'
import { DashboardTemplates } from '@/components/ops/dashboard/DashboardTemplates'
import { OpsFilterBar } from '@/components/dashboard/OpsFilterBar'
import { OpsProgrammeBreakdown } from '@/components/dashboard/OpsProgrammeBreakdown'
import { OpsKanbanTile } from '@/components/dashboard/OpsKanbanTile'

// Module-scope consts removed; everything loaded inside the server
// component below via Promise.all([...repo.findAll()]).

const DATE_DISPLAY = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
})

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function OpsDashboardPage({ searchParams }: PageProps) {
  const user = await getCurrentUser()
  if (!user) redirect('/login?next=%2Fdashboard%2Fops')

  const sp = await searchParams
  // P4 batch 2 (2026-05-24): live repo reads.
  const [
    allMous, allSchools, allDispatches, allDispatchRequests, allEscalations,
    allInventoryItems, allOpportunities, allSalesTeam, allKitDispatches,
    allPayments, allUsers, allStageResponsibility,
  ] = await Promise.all([
    mouRepo.findAll(),
    schoolRepo.findAll(),
    dispatchRepo.findAll(),
    dispatchRequestRepo.findAll() as Promise<DispatchRequest[]>,
    escalationRepo.findAll(),
    inventoryItemRepo.findAll(),
    salesOpportunityRepo.findAll() as Promise<SalesOpportunity[]>,
    salesTeamRepo.findAll(),
    kitDispatchRepo.findAll(),
    paymentRepo.findAll(),
    userRepo.findAll(),
    stageResponsibilityRepo.findAll() as Promise<StageResponsibility[]>,
  ])
  const filters = parseDashboardFilters(sp)
  const augmentFilters = parseOpsAugmentFilters(sp)
  const now = new Date()
  const todayLabel = DATE_DISPLAY.format(now)

  const slices = computeSlices({
    mous: allMous,
    schools: allSchools,
    dispatches: allDispatches,
    escalations: allEscalations,
    filters,
  })

  // Intersect the augmentation dimensions (region / sales rep / ops
  // owner) against the existing slice. The augmentation lib returns
  // the post-filter MOU id set; we narrow the slice in-place so all
  // downstream builders (stat cards, recent MOUs, orders tracker)
  // see the same scope.
  const augmentResult = applyOpsAugmentFilters({
    mous: slices.filteredMous,
    schools: allSchools,
    filters: augmentFilters,
    stageResponsibility: allStageResponsibility,
    dispatches: allKitDispatches,
    paymentsForStage: allPayments.map((p) => ({
      mouId: p.mouId,
      instalmentSeq: p.instalmentSeq,
      status: p.status,
      dueDateIso: p.dueDateIso,
      piGeneratedAt: p.piGeneratedAt,
    })),
    now,
  })
  if (!augmentResult.passthrough) {
    slices.filteredMous = slices.filteredMous.filter((m) =>
      augmentResult.filteredMouIds.has(m.id),
    )
    slices.filteredSchoolIds = new Set(slices.filteredMous.map((m) => m.schoolId))
    slices.filteredDispatches = slices.filteredDispatches.filter(
      (d) => d.mouId !== null && augmentResult.filteredMouIds.has(d.mouId),
    )
    slices.filteredEscalations = slices.filteredEscalations.filter((e) =>
      e.mouId === null
        ? slices.filteredSchoolIds.has(e.schoolId)
        : augmentResult.filteredMouIds.has(e.mouId),
    )
  }
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
  void buildSalesPipelineSummary({ opportunities: allOpportunities, now })
  const fyOptions = fiscalYearOptions(allMous)
  const fiscalYearForHeader = filters.fiscalYear ?? 'all'
  const productOptions = productOptionsForFilters({
    inventoryItems: allInventoryItems,
    dispatches: allDispatches,
  })
  const salesRepOptions = buildSalesRepOptions(allSalesTeam)
  const opsOwnerOptions = buildOpsOwnerOptions(allUsers)
  const programmeBreakdown = computeOpsProgrammeBreakdown({
    mous: slices.filteredMous,
    kitDispatches: allKitDispatches,
  })
  const filterActive =
    filters.fiscalYear !== null
    || filters.programme !== null
    || filters.fromDate !== null
    || filters.toDate !== null
    || filters.products.length > 0
    || !isOpsAugmentFiltersEmpty(augmentFilters)
  const activeKanbanCardCount = allKitDispatches.filter(
    (d) => d.dispatchStatus !== 'Delivered',
  ).length

  return (
    <>
      <TopNav currentPath="/dashboard/ops" />
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
        <DashboardFilterRow
          activeProgramme={filters.programme}
          basePath="/dashboard/ops"
          productOptions={productOptions}
          activeProducts={filters.products}
        />
        <OpsFilterBar
          initialRegions={augmentFilters.regions}
          initialSuperRegions={augmentFilters.superRegions}
          initialSalesRepIds={augmentFilters.salesRepIds}
          initialOpsOwnerIds={augmentFilters.opsOwnerIds}
          salesRepOptions={salesRepOptions}
          opsOwnerOptions={opsOwnerOptions}
        />
        <div className="mx-auto max-w-screen-2xl space-y-6 px-4 py-6 sm:px-6">
          <OpsKanbanTile totalActiveCards={activeKanbanCardCount} />
          <DashboardStatCards cards={cards} />
          <OpsProgrammeBreakdown rows={programmeBreakdown} filterActive={filterActive} />
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
