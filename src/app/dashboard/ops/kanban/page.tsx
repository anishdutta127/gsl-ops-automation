/*
 * /dashboard/ops/kanban (Gate 4.95 Session 3 Step 6).
 *
 * Workflow Kanban view: 6 columns tracking each MOU through the
 * KitDispatch lifecycle (awaiting actuals -> allocation -> sales
 * approval -> ready for dispatch -> in transit -> delivered).
 *
 * Distinct from /kanban (the legacy 9-column MOU pipeline Kanban from
 * W4-I.5); this one is dispatch-focused and the operational answer to
 * "where is this MOU stuck and who owns the next move?".
 *
 * Server component. Reads src/data/*.json at request time; the
 * augmentation + Kanban filters narrow the MOU set before bucketing
 * via buildOpsWorkflowKanban (pure lib). The filter rail is the only
 * client component on the page.
 */

import { redirect } from 'next/navigation'
import type {
  KitDispatch,
  MOU,
  Payment,
  SalesPerson,
  School,
  StageResponsibility,
  User,
} from '@/lib/types'
import mousJson from '@/data/mous.json'
import paymentsJson from '@/data/payments.json'
import kitDispatchesJson from '@/data/kit_dispatches.json'
import schoolsJson from '@/data/schools.json'
import usersJson from '@/data/users.json'
import salesTeamJson from '@/data/sales_team.json'
import stageResponsibilityJson from '@/data/stage_responsibility.json'
import { getCurrentUser } from '@/lib/auth/session'
import { TopNav } from '@/components/ops/TopNav'
import {
  buildOpsOwnerOptions,
  buildSalesRepOptions,
  parseOpsAugmentFilters,
} from '@/lib/dashboard/opsAugmentData'
import {
  buildOpsWorkflowKanban,
  parseKanbanFilters,
} from '@/lib/kanban/opsWorkflowKanban'
import { OpsKanbanFilterRail } from '@/components/dashboard/ops/OpsKanbanFilterRail'
import { OpsWorkflowKanbanBoard } from '@/components/dashboard/ops/OpsWorkflowKanbanBoard'

const allMous = mousJson as unknown as MOU[]
const allPayments = paymentsJson as unknown as Payment[]
const allKitDispatches = kitDispatchesJson as unknown as KitDispatch[]
const allSchools = schoolsJson as unknown as School[]
const allUsers = usersJson as unknown as User[]
const allSalesTeam = salesTeamJson as unknown as SalesPerson[]
const allStageResponsibility = stageResponsibilityJson as unknown as StageResponsibility[]

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

function serializeQueryString(
  sp: Record<string, string | string[] | undefined>,
): string {
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(sp)) {
    if (v === undefined) continue
    if (Array.isArray(v)) {
      for (const item of v) params.append(k, item)
    } else {
      params.set(k, v)
    }
  }
  return params.toString()
}

export default async function OpsKanbanPage({ searchParams }: PageProps) {
  const user = await getCurrentUser()
  if (!user) redirect('/login?next=%2Fdashboard%2Fops%2Fkanban')

  const sp = await searchParams
  const augmentFilters = parseOpsAugmentFilters(sp)
  const kanbanFilters = parseKanbanFilters(sp)
  const now = new Date()

  const { buckets, totalCards, filterActive } = buildOpsWorkflowKanban({
    mous: allMous,
    payments: allPayments,
    dispatches: allKitDispatches,
    users: allUsers,
    salesTeam: allSalesTeam,
    stageResponsibility: allStageResponsibility,
    schools: allSchools,
    augmentFilters,
    kanbanFilters,
    now,
  })

  const salesRepOptions = buildSalesRepOptions(allSalesTeam)
  const opsOwnerOptions = buildOpsOwnerOptions(allUsers)
  const queryString = serializeQueryString(sp)

  const subtitle = filterActive
    ? `${totalCards} active MOUs match the current filters.`
    : `${totalCards} active MOUs across six workflow stages.`

  return (
    <>
      <TopNav currentPath="/dashboard/ops/kanban" />
      <div data-testid="ops-kanban-page">
        <header className="border-b border-border bg-card">
          <div className="mx-auto max-w-screen-2xl px-4 py-5 sm:px-6">
            <h1 className="font-heading text-2xl font-semibold text-brand-navy">
              Workflow Kanban view
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Track active dispatches by stage.
            </p>
            <p className="mt-2 text-xs text-muted-foreground" data-testid="ops-kanban-subtitle">
              {subtitle}
            </p>
          </div>
        </header>
        <div className="mx-auto flex max-w-screen-2xl flex-col gap-4 px-4 py-6 sm:px-6">
          <OpsKanbanFilterRail
            initialProgrammes={kanbanFilters.programmes}
            initialRegions={augmentFilters.regions}
            initialSuperRegions={augmentFilters.superRegions}
            initialSalesRepIds={augmentFilters.salesRepIds}
            initialOpsOwnerIds={augmentFilters.opsOwnerIds}
            initialFromDate={kanbanFilters.fromDate}
            initialToDate={kanbanFilters.toDate}
            salesRepOptions={salesRepOptions}
            opsOwnerOptions={opsOwnerOptions}
          />
          <OpsWorkflowKanbanBoard
            columns={buckets}
            filterActive={filterActive}
            currentQueryString={queryString}
          />
        </div>
      </div>
    </>
  )
}
