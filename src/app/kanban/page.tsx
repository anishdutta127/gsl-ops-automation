/*
 * /kanban (W4-I.5 P2C5 route migration).
 *
 * Pre-W4-I.5 this content lived at /. P2C5 moved the new Operations
 * Control Dashboard to / and the kanban here. All functionality is
 * preserved verbatim; only the route URL and TopNav currentPath
 * change at this commit. The Kanban / Overview tab strip is removed
 * (the global TopNav now exposes Dashboard + Kanban directly).
 *
 * 9 columns: 8 lifecycle stages + Pre-Ops Legacy holding bay. Every
 * Active MOU lands in exactly one column; Pre-Ops cards render
 * one-way exit per the W3-C design (drag in C2 will block drop into
 * Pre-Ops).
 *
 * W4-A.3: filter cohortStatus === 'active' before bucketing. The
 * kanban is operationally driven; archived MOUs (prior-AY cohorts)
 * would distract from the current pursuit. Operators reach the
 * archive via /mous/archive (read + reactivate) or
 * /admin/mou-status (Admin bulk-edit).
 *
 * Server Component. Reads src/data/*.json at request time. Per-MOU
 * stage derivation is pure (deriveStage). The page itself is
 * deterministic across runs given identical fixture state.
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
  MOU,
  Payment,
  SalesPerson,
  School,
} from '@/lib/types'
import mousJson from '@/data/mous.json'
import dispatchesJson from '@/data/dispatches.json'
import paymentsJson from '@/data/payments.json'
import communicationsJson from '@/data/communications.json'
import feedbackJson from '@/data/feedback.json'
import intakeRecordsJson from '@/data/intake_records.json'
import schoolsJson from '@/data/schools.json'
import salesTeamJson from '@/data/sales_team.json'
import { getCurrentUser } from '@/lib/auth/session'
import { deriveStage, KANBAN_COLUMNS, type KanbanStageKey } from '@/lib/kanban/deriveStage'
import { stageEnteredDate, daysSince } from '@/lib/kanban/stageEnteredDate'
import { isOverdue } from '@/lib/kanban/stageDurations'
import { TopNav } from '@/components/ops/TopNav'
import { PageHeader } from '@/components/ops/PageHeader'
import { KanbanBoard, type KanbanCardMeta } from '@/components/ops/KanbanBoard'
import { FilterRail, type FilterDimension } from '@/components/ops/FilterRail'
import { EmptyState } from '@/components/ops/EmptyState'
import {
  applyDimensionFilters,
  parseDimensions,
} from '@/lib/filterParsing'
import { SUPER_REGION_MEMBERS } from '@/lib/regions'

const allMous = mousJson as unknown as MOU[]
const allDispatches = dispatchesJson as unknown as Dispatch[]
const allPayments = paymentsJson as unknown as Payment[]
const allCommunications = communicationsJson as unknown as Communication[]
const allFeedback = feedbackJson as unknown as Feedback[]
const allIntakeRecords = intakeRecordsJson as unknown as IntakeRecord[]
const allSchools = schoolsJson as unknown as School[]
const allSalesTeam = salesTeamJson as unknown as SalesPerson[]

const DIMENSION_KEYS = ['region', 'programme', 'salesRep', 'status'] as const

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function KanbanPage({ searchParams }: PageProps) {
  const user = await getCurrentUser()
  if (!user) redirect('/login?next=%2Fkanban')

  const sp = await searchParams
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

  // Phase X: filter the active cohort by Region (school-derived) /
  // Programme / Sales Rep / Status before bucketing. AND across
  // dimensions; OR within. Status mirrors the /mous list page (drops
  // 'Draft' from the chip set per W4-B.4).
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
    const stage = deriveStage(mou, deps)
    // W4-B.1 defensive check: cross-verification is auto-skipped by
    // deriveStage's first-non-null-wins logic (cross-verification's
    // enteredDate inherits from actuals-confirmed). If a card lands
    // here, the auto-skip regressed and operators see the placeholder
    // next-step text. Surface a non-prod-only warn so the failing
    // record can be investigated without polluting production logs.
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
      // School taxonomy is 3-value per SPOC DB; SW is already a
      // pre-collapsed combined region. See src/lib/types.ts School.region.
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
      // 'Draft' dropped per W4-B.4 (zero MOUs carry that status in the
      // imported cohort). Mirrors the /mous list chip set.
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
        <PageHeader title="Kanban" subtitle={subtitle} />
        <div className="mx-auto flex max-w-screen-2xl flex-col gap-4 px-4 py-6 lg:flex-row">
          <FilterRail
            basePath="/kanban"
            dimensions={dimensions}
            active={active}
          />
          <div className="min-w-0 flex-1 space-y-4">
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
                  description="Adjust filters or clear them to see the full kanban."
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
