/*
 * /mous list page.
 *
 * Filters: status (MouStatus), programme, region (derived from
 * school.region), search (free-text against id + schoolName +
 * programmeSubType + notes).
 *
 * Per-role scoping: SalesRep sees only own-assigned MOUs
 * (salesPersonId === user.id); other roles see all.
 *
 * Phase 1 simplification: stage filter uses MOU.status (Draft /
 * Active / Completed / Expired / Renewed / Pending Signature). A
 * later phase may compute a derived "lifecycle stage" combining
 * status + dispatch + payment state, but that is out of scope here.
 *
 * W4-A.3 cohort filter: defaults to cohortStatus === 'active'.
 * The MouStatus filter (Active / Pending Signature / Completed / etc.)
 * is orthogonal to cohort and stays as-is. Operators reach archived
 * MOUs via the dedicated /mous/archive surface (W4-A.4); the
 * existing kanban-stage deep-link (?stage=...) keeps the active-only
 * default so the kanban-to-list jump stays consistent with the
 * kanban's own filter.
 */

import type {
  Communication,
  Dispatch,
  Feedback,
  MOU,
  Payment,
  School,
  User,
} from '@/lib/types'
import mousJson from '@/data/mous.json'
import schoolsJson from '@/data/schools.json'
import dispatchesJson from '@/data/dispatches.json'
import paymentsJson from '@/data/payments.json'
import communicationsJson from '@/data/communications.json'
import feedbackJson from '@/data/feedback.json'
import { getCurrentUser } from '@/lib/auth/session'
import { TopNav } from '@/components/ops/TopNav'
import { PageHeader } from '@/components/ops/PageHeader'
import { FilterRail, type FilterDimension } from '@/components/ops/FilterRail'
import { EntityListTable, type ColumnDef } from '@/components/ops/EntityListTable'
import { EmptyState } from '@/components/ops/EmptyState'
import {
  parseDimensions,
  applyDimensionFilters,
  applyTextSearch,
} from '@/lib/filterParsing'
import {
  deriveStage,
  KANBAN_COLUMNS,
  type KanbanStageKey,
} from '@/lib/kanban/deriveStage'
import Link from 'next/link'
import { Archive } from 'lucide-react'

const allMous = mousJson as unknown as MOU[]
const allSchools = schoolsJson as unknown as School[]
const allDispatches = dispatchesJson as unknown as Dispatch[]
const allPayments = paymentsJson as unknown as Payment[]
const allCommunications = communicationsJson as unknown as Communication[]
const allFeedback = feedbackJson as unknown as Feedback[]
const KANBAN_STAGE_KEYS = new Set<string>(KANBAN_COLUMNS.map((c) => c.key))

const DIMENSION_KEYS = ['status', 'programme', 'region'] as const

function scopeMousForUser(mous: MOU[], user: User | null): MOU[] {
  if (!user) return mous
  if (user.role === 'SalesRep') {
    return mous.filter((m) => m.salesPersonId === user.id)
  }
  return mous
}

function regionFor(mou: MOU, schoolById: Map<string, School>): string | null {
  const s = schoolById.get(mou.schoolId)
  return s?.region ?? null
}

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function MousListPage({ searchParams }: PageProps) {
  const sp = await searchParams
  const user = await getCurrentUser()
  const schoolById = new Map(allSchools.map((s) => [s.id, s]))
  // W4-A.3: cohort default is 'active'. Operators visit /mous/archive for
  // archived rows; the main /mous list never shows them, even via filter.
  const cohortFiltered = allMous.filter((m) => m.cohortStatus === 'active')
  const scoped = scopeMousForUser(cohortFiltered, user)

  const active = parseDimensions(sp, DIMENSION_KEYS as unknown as string[])
  const search = typeof sp.q === 'string' ? sp.q : ''

  // W3-C C3: kanban column-header navigation lands here with ?stage=<key>.
  // Filter scoped MOUs to those whose deriveStage matches the requested key.
  const stageParam = typeof sp.stage === 'string' && KANBAN_STAGE_KEYS.has(sp.stage)
    ? (sp.stage as KanbanStageKey)
    : null
  const stageFiltered = stageParam !== null
    ? scoped.filter((m) =>
        deriveStage(m, {
          dispatches: allDispatches,
          payments: allPayments,
          communications: allCommunications,
          feedback: allFeedback,
        }) === stageParam,
      )
    : scoped

  const filtered = applyTextSearch(
    applyDimensionFilters(stageFiltered, active, {
      status: (m) => m.status,
      programme: (m) => m.programme,
      region: (m) => regionFor(m, schoolById),
    }),
    search,
    (m) => [m.id, m.schoolName, m.programmeSubType ?? '', m.notes ?? ''],
  )

  const stageLabel = stageParam !== null
    ? KANBAN_COLUMNS.find((c) => c.key === stageParam)?.label ?? stageParam
    : null

  const dimensions: FilterDimension[] = [
    {
      key: 'status',
      label: 'Status',
      // 'Draft' is dropped as a chip option in W4-B.4: zero MOUs in the
      // imported cohort carry that status. The MouStatus type still
      // includes 'Draft' for forward compatibility (a future intake
      // form may produce drafts pre-signature).
      options: ['Active', 'Pending Signature', 'Completed', 'Expired', 'Renewed'].map((v) => ({
        value: v,
        label: v,
      })),
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
      key: 'region',
      label: 'Region',
      options: ['East', 'North', 'South-West'].map((v) => ({ value: v, label: v })),
    },
  ]

  const columns: ColumnDef<MOU>[] = [
    {
      key: 'id',
      header: 'MOU id',
      render: (m) => <span className="font-mono text-xs">{m.id}</span>,
    },
    { key: 'school', header: 'School', render: (m) => m.schoolName },
    {
      key: 'programme',
      header: 'Programme',
      render: (m) => (
        <span>
          {m.programme}
          {m.programmeSubType ? <span className="text-muted-foreground"> / {m.programmeSubType}</span> : null}
        </span>
      ),
    },
    { key: 'status', header: 'Status', render: (m) => m.status },
    {
      key: 'students',
      header: 'Students',
      align: 'right',
      render: (m) =>
        m.studentsActual !== null
          ? `${m.studentsActual.toLocaleString('en-IN')} / ${m.studentsMou.toLocaleString('en-IN')}`
          : `n/a / ${m.studentsMou.toLocaleString('en-IN')}`,
    },
  ]

  return (
    <>
      <TopNav currentPath="/mous" />
      <main id="main-content">
        <PageHeader
          title={stageLabel !== null ? `MOUs at ${stageLabel}` : 'MOUs'}
          subtitle={
            stageLabel !== null
              ? `${filtered.length} MOUs at the ${stageLabel} stage. Filtered from the kanban.`
              : `${filtered.length} of ${scoped.length} matching`
          }
        />
        <div className="mx-auto flex max-w-screen-xl items-center justify-end px-4 pt-2">
          <Link
            href="/mous/archive"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
            data-testid="archive-link"
          >
            <Archive aria-hidden className="size-4" />
            View archived
          </Link>
        </div>
        <div className="mx-auto flex max-w-screen-xl flex-col gap-4 px-4 py-6 sm:flex-row">
          <FilterRail
            basePath="/mous"
            dimensions={dimensions}
            active={active}
            search={{ value: search, placeholder: 'Search id / school / notes' }}
          />
          <div className="min-w-0 flex-1">
            <EntityListTable
              rows={filtered}
              columns={columns}
              rowHref={(m) => `/mous/${m.id}`}
              rowKey={(m) => m.id}
              caption="MOUs"
              empty={
                <EmptyState
                  title="No MOUs match the current filters."
                  description="Adjust filters or clear them to see the full list."
                />
              }
            />
          </div>
        </div>
      </main>
    </>
  )
}
