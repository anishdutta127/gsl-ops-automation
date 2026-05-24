/*
 * /kanban (Gate 5A.7 Step 2 unification).
 *
 * Single canonical Kanban route hosting two views via a top pill toggle:
 *   - 'lifecycle' (default): 10-column MOU lifecycle pipeline with
 *     drag-to-advance. Surface A pre-unification, formerly the only view.
 *   - 'operations': 6-column KitDispatch workflow Kanban, read-only.
 *     Surface B pre-unification, formerly at /dashboard/ops/kanban.
 *
 * View is parsed from `?view=`; missing or any other value falls back
 * to 'lifecycle'. /dashboard/ops/kanban is a permanent redirect to
 * /kanban?view=operations so deep links survive.
 *
 * Server Component. Reads src/data/*.json at request time. Per-MOU
 * stage derivation is pure (bucketByLifecycle / bucketByOperations).
 *
 * UI gating: per W3-B every authenticated user sees this page; the
 * middleware handles unauthenticated -> /login. No role redirects.
 */

import { redirect } from 'next/navigation'
import type {
  Communication,
  Dispatch,
  Feedback,
  IntakeRecord,
  KitDispatch,
  MOU,
  Payment,
  SalesPerson,
  School,
  StageResponsibility,
  User,
} from '@/lib/types'
import { mouRepo } from '@/lib/db/repos/mou'
import { dispatchRepo } from '@/lib/db/repos/dispatch'
import { paymentRepo } from '@/lib/db/repos/payment'
import { schoolRepo } from '@/lib/db/repos/school'
import { salesTeamRepo } from '@/lib/db/repos/salesTeam'
import { kitDispatchRepo } from '@/lib/db/repos/kitDispatch'
import { userRepo } from '@/lib/db/repos/user'
import {
  communicationRepo,
  feedbackRepo,
  intakeRecordRepo,
  stageResponsibilityRepo,
} from '@/lib/db/repos/leafRepos'
import { getCurrentUser } from '@/lib/auth/session'
import { KANBAN_COLUMNS, type KanbanStageKey } from '@/lib/kanban/deriveStage'
import { bucketByLifecycle } from '@/lib/kanban/columnBuckets'
import { stageEnteredDate, daysSince } from '@/lib/kanban/stageEnteredDate'
import { isOverdue } from '@/lib/kanban/stageDurations'
import {
  buildOpsWorkflowKanban,
  parseKanbanFilters,
} from '@/lib/kanban/opsWorkflowKanban'
import {
  buildOpsOwnerOptions,
  buildSalesRepOptions,
  parseOpsAugmentFilters,
} from '@/lib/dashboard/opsAugmentData'
import { TopNav } from '@/components/ops/TopNav'
import { PageHeader } from '@/components/ops/PageHeader'
import { KanbanBoard, type KanbanCardMeta } from '@/components/ops/KanbanBoard'
import { FilterRail, type FilterDimension } from '@/components/ops/FilterRail'
import { EmptyState } from '@/components/ops/EmptyState'
import { KanbanViewToggle, type KanbanViewMode } from '@/components/ops/KanbanViewToggle'
import { OpsKanbanFilterRail } from '@/components/dashboard/ops/OpsKanbanFilterRail'
import { OpsWorkflowKanbanBoard } from '@/components/dashboard/ops/OpsWorkflowKanbanBoard'
import {
  applyDimensionFilters,
  parseDimensions,
} from '@/lib/filterParsing'
import { SUPER_REGION_MEMBERS } from '@/lib/regions'

interface KanbanData {
  allMous: MOU[]
  allDispatches: Dispatch[]
  allPayments: Payment[]
  allCommunications: Communication[]
  allFeedback: Feedback[]
  allIntakeRecords: IntakeRecord[]
  allSchools: School[]
  allSalesTeam: SalesPerson[]
  allKitDispatches: KitDispatch[]
  allUsers: User[]
  allStageResponsibility: StageResponsibility[]
}

const DIMENSION_KEYS = ['region', 'programme', 'salesRep', 'status'] as const

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

function parseView(sp: Record<string, string | string[] | undefined>): KanbanViewMode {
  const raw = sp.view
  const value = Array.isArray(raw) ? raw[0] : raw
  return value === 'operations' ? 'operations' : 'lifecycle'
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

export default async function KanbanPage({ searchParams }: PageProps) {
  const user = await getCurrentUser()
  if (!user) redirect('/login?next=%2Fkanban')

  const sp = await searchParams
  const view = parseView(sp)

  const [
    allMous,
    allDispatches,
    allPayments,
    allCommunications,
    allFeedback,
    allIntakeRecords,
    allSchools,
    allSalesTeam,
    allKitDispatches,
    allUsers,
    allStageResponsibility,
  ] = await Promise.all([
    mouRepo.findAll(),
    dispatchRepo.findAll(),
    paymentRepo.findAll(),
    communicationRepo.findAll() as unknown as Promise<Communication[]>,
    feedbackRepo.findAll() as unknown as Promise<Feedback[]>,
    intakeRecordRepo.findAll() as unknown as Promise<IntakeRecord[]>,
    schoolRepo.findAll(),
    salesTeamRepo.findAll(),
    kitDispatchRepo.findAll(),
    userRepo.findAll(),
    stageResponsibilityRepo.findAll() as unknown as Promise<StageResponsibility[]>,
  ])

  const data: KanbanData = {
    allMous,
    allDispatches,
    allPayments,
    allCommunications,
    allFeedback,
    allIntakeRecords,
    allSchools,
    allSalesTeam,
    allKitDispatches,
    allUsers,
    allStageResponsibility,
  }

  if (view === 'operations') {
    return renderOperationsView(sp, data)
  }
  return renderLifecycleView(sp, data)
}

// ===========================================================================
// Lifecycle view (formerly the only /kanban view)
// ===========================================================================

function renderLifecycleView(
  sp: Record<string, string | string[] | undefined>,
  data: KanbanData,
) {
  const {
    allMous,
    allDispatches,
    allPayments,
    allCommunications,
    allFeedback,
    allIntakeRecords,
    allSchools,
    allSalesTeam,
  } = data
  const active = parseDimensions(sp, DIMENSION_KEYS as unknown as string[])

  const deps = {
    dispatches: allDispatches,
    payments: allPayments,
    communications: allCommunications,
    feedback: allFeedback,
    intakeRecords: allIntakeRecords,
  }

  const schoolById = new Map(allSchools.map((s) => [s.id, s]))
  const activeMous = allMous.filter((m) => m.cohortStatus === 'active')

  const filteredMous = applyDimensionFilters(activeMous, active, {
    region: (m) => schoolById.get(m.schoolId)?.region ?? null,
    programme: (m) => m.programme,
    salesRep: (m) => m.salesPersonId,
    status: (m) => m.status,
  })

  const initialBuckets: Record<KanbanStageKey, MOU[]> = {
    'pre-ops': [],
    'mou-signed': [],
    'post-signing-intake': [],
    'actuals-confirmed': [],
    'cross-verification': [],
    'invoice-raised': [],
    'payment-received': [],
    'kit-dispatched': [],
    'delivery-acknowledged': [],
    'feedback-submitted': [],
  }
  const cardMeta: Record<string, KanbanCardMeta> = {}
  const now = new Date()
  for (const mou of filteredMous) {
    const stage = bucketByLifecycle(mou, deps)
    if (stage === 'cross-verification' && process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.warn(`[kanban] MOU ${mou.id} derived to 'cross-verification'; expected auto-skip via inheritance. Investigate stageEnteredDate for this record.`)
    }
    initialBuckets[stage].push(mou)
    const entered = stageEnteredDate(mou, deps, stage)
    const days = daysSince(entered, now)
    cardMeta[mou.id] = {
      daysInStage: days,
      overdue: isOverdue(stage, days),
    }
  }

  const hasAnyFilter = Object.values(active).some((vs) => vs.length > 0)
  const subtitle = hasAnyFilter
    ? `${filteredMous.length} of ${activeMous.length} active MOUs match the current filters across ${KANBAN_COLUMNS.length} stages`
    : `${activeMous.length} active MOUs across ${KANBAN_COLUMNS.length} stages`

  const dimensions: FilterDimension[] = [
    {
      key: 'region',
      label: 'Region',
      shortcuts: [
        { key: 'NE', label: 'NE', values: SUPER_REGION_MEMBERS.NE },
        { key: 'SW', label: 'SW', values: SUPER_REGION_MEMBERS.SW },
      ],
      options: ['East', 'North', 'South-West'].map((v) => ({ value: v, label: v })),
    },
    {
      key: 'programme',
      label: 'Programme',
      options: ['STEAM', 'TinkRworks', 'Young Pioneers', 'Harvard HBPE', 'VEX'].map((v) => ({
        value: v,
        label: v,
      })),
    },
    {
      key: 'salesRep',
      label: 'Sales rep',
      options: allSalesTeam
        .filter((s) => s.active)
        .map((s) => ({ value: s.id, label: s.name })),
    },
    {
      key: 'status',
      label: 'Status',
      options: ['Active', 'Pending Signature', 'Completed', 'Expired', 'Renewed'].map((v) => ({
        value: v,
        label: v,
      })),
    },
  ]

  return (
    <>
      <TopNav currentPath="/kanban" />
      <main id="main-content">
        <PageHeader title="MOU Pipeline" subtitle={subtitle} />
        <div className="mx-auto flex max-w-screen-2xl flex-col gap-4 px-4 py-6 lg:flex-row">
          <FilterRail
            basePath="/kanban"
            dimensions={dimensions}
            active={active}
          />
          <div className="min-w-0 flex-1 space-y-4">
            <KanbanViewToggle view="lifecycle" searchParams={sp} />
            <p
              className="text-sm text-muted-foreground"
              data-testid="kanban-interaction-hint"
            >
              Click to open. Drag the grip to move.
            </p>
            {hasAnyFilter && filteredMous.length === 0 ? (
              <div data-testid="kanban-empty-filters">
                <EmptyState
                  title="No MOUs match these filters."
                  description="Adjust filters or clear them to see the full pipeline."
                />
              </div>
            ) : (
              <KanbanBoard initialBuckets={initialBuckets} cardMeta={cardMeta} />
            )}
          </div>
        </div>
      </main>
    </>
  )
}

// ===========================================================================
// Operations view (formerly /dashboard/ops/kanban)
// ===========================================================================

function renderOperationsView(
  sp: Record<string, string | string[] | undefined>,
  data: KanbanData,
) {
  const {
    allMous,
    allPayments,
    allKitDispatches,
    allUsers,
    allSalesTeam,
    allStageResponsibility,
    allSchools,
  } = data
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
      <TopNav currentPath="/kanban" />
      <main id="main-content">
        <div data-testid="ops-kanban-page">
          <header className="border-b border-border bg-card">
            <div className="mx-auto max-w-screen-2xl px-4 py-5 sm:px-6">
              <h1 className="font-heading text-2xl font-semibold text-brand-navy">
                Active operations
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
            <KanbanViewToggle view="operations" searchParams={sp} />
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
      </main>
    </>
  )
}
