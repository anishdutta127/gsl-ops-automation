/*
 * /escalations list page.
 *
 * Filters: lane, level, status, plus an "assignedTo" dimension that
 * accepts the literal value "me" to filter by current user.
 *
 * Per-role scoping (lane-aware): OpsHead -> OPS only, SalesHead ->
 * SALES, TrainerHead -> ACADEMICS, Admin / Leadership -> all. Other
 * roles see no escalations (Phase 1 scope).
 */

import type { Escalation, School, User } from '@/lib/types'
import escalationsJson from '@/data/escalations.json'
import schoolsJson from '@/data/schools.json'
import { getCurrentUser } from '@/lib/auth/session'
import { TopNav } from '@/components/ops/TopNav'
import { PageHeader } from '@/components/ops/PageHeader'
import { FilterRail, type FilterDimension } from '@/components/ops/FilterRail'
import { EntityListTable, type ColumnDef } from '@/components/ops/EntityListTable'
import { EmptyState } from '@/components/ops/EmptyState'
import { StatusChip } from '@/components/ops/StatusChip'
import { LaneBadge } from '@/components/ops/LaneBadge'
import {
  ESCALATION_SEVERITY_TONE,
  ESCALATION_STATUS_TONE,
} from '@/lib/ui/escalationTones'
import {
  parseDimensions,
  applyDimensionFilters,
  applyTextSearch,
} from '@/lib/filterParsing'

const allEscalations = escalationsJson as unknown as Escalation[]
const allSchools = schoolsJson as unknown as School[]

const DIMENSION_KEYS = ['lane', 'level', 'status', 'assignedTo'] as const

function scopeForUser(escalations: Escalation[], user: User | null): Escalation[] {
  if (!user) return []
  if (user.role === 'Admin' || user.role === 'Leadership') return escalations
  const roles = new Set<string>([user.role])
  if (user.testingOverride && user.testingOverridePermissions) {
    for (const r of user.testingOverridePermissions) roles.add(r)
  }
  if (roles.has('OpsHead')) return escalations.filter((e) => e.lane === 'OPS')
  if (roles.has('SalesHead')) return escalations.filter((e) => e.lane === 'SALES')
  if (roles.has('TrainerHead')) return escalations.filter((e) => e.lane === 'ACADEMICS')
  return []
}

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function EscalationsListPage({ searchParams }: PageProps) {
  const sp = await searchParams
  const user = await getCurrentUser()
  const schoolById = new Map(allSchools.map((s) => [s.id, s]))
  const scoped = scopeForUser(allEscalations, user)

  const active = parseDimensions(sp, DIMENSION_KEYS as unknown as string[])
  const search = typeof sp.q === 'string' ? sp.q : ''

  const filtered = applyTextSearch(
    applyDimensionFilters(scoped, active, {
      lane: (e) => e.lane,
      level: (e) => e.level,
      status: (e) => e.status,
      assignedTo: (e) => (user && e.assignedTo === user.id ? 'me' : null),
    }),
    search,
    (e) => [e.id, e.description, e.schoolId, e.assignedTo ?? ''],
  )

  const dimensions: FilterDimension[] = [
    {
      key: 'lane',
      label: 'Lane',
      options: [
        { value: 'OPS', label: 'OPS' },
        { value: 'SALES', label: 'SALES' },
        { value: 'ACADEMICS', label: 'ACADEMICS' },
      ],
    },
    {
      key: 'level',
      label: 'Level',
      options: [
        { value: 'L1', label: 'L1' },
        { value: 'L2', label: 'L2' },
        { value: 'L3', label: 'L3' },
      ],
    },
    {
      key: 'status',
      label: 'Status',
      // W4-I.4 MM5: Misba ticketing-system status vocabulary.
      // Swati-feedback batch: filter chip labels relabel via
      // ESCALATION_STATUS_TONE so the chip matches the row chip; the
      // stored enum value is unchanged.
      options: [
        { value: 'Open', label: ESCALATION_STATUS_TONE.Open.label },
        { value: 'WIP', label: ESCALATION_STATUS_TONE.WIP.label },
        { value: 'Closed', label: ESCALATION_STATUS_TONE.Closed.label },
        {
          value: 'Transfer to Other Department',
          label: ESCALATION_STATUS_TONE['Transfer to Other Department'].label,
        },
        { value: 'Dispatched', label: ESCALATION_STATUS_TONE.Dispatched.label },
        { value: 'In Transit', label: ESCALATION_STATUS_TONE['In Transit'].label },
      ],
    },
    {
      key: 'assignedTo',
      label: 'Assigned to',
      options: [{ value: 'me', label: 'Assigned to me' }],
    },
  ]

  const columns: ColumnDef<Escalation>[] = [
    {
      key: 'id',
      header: 'Escalation id',
      render: (e) => <span className="font-mono text-xs">{e.id}</span>,
    },
    {
      key: 'school',
      header: 'School',
      render: (e) => schoolById.get(e.schoolId)?.name ?? e.schoolId,
    },
    {
      key: 'lane',
      header: 'Lane / Level',
      render: (e) => (
        <span className="inline-flex items-center gap-2">
          <LaneBadge lane={e.lane} />
          <span className="text-xs text-muted-foreground">{e.level}</span>
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (e) => {
        const meta = ESCALATION_STATUS_TONE[e.status]
        return <StatusChip tone={meta.tone} label={meta.label} withDot={false} />
      },
    },
    {
      key: 'category',
      header: 'Category',
      render: (e) => e.category ?? <span className="text-muted-foreground">-</span>,
    },
    {
      key: 'type',
      header: 'Type',
      render: (e) => e.type ?? <span className="text-muted-foreground">-</span>,
    },
    {
      key: 'severity',
      header: 'Severity',
      render: (e) => {
        const meta = ESCALATION_SEVERITY_TONE[e.severity]
        return <StatusChip tone={meta.tone} label={meta.label} withDot={false} />
      },
    },
    {
      key: 'assigned',
      header: 'Assigned to',
      render: (e) => e.assignedTo ?? <span className="text-muted-foreground">unassigned</span>,
    },
  ]

  return (
    <>
      <TopNav currentPath="/escalations" />
      <main id="main-content">
        <PageHeader
          title="Escalations"
          subtitle={`${filtered.length} of ${scoped.length} matching`}
        />
        <div className="mx-auto flex max-w-screen-xl flex-col gap-4 px-4 py-6 sm:flex-row">
          <FilterRail
            basePath="/escalations"
            dimensions={dimensions}
            active={active}
            search={{ value: search, placeholder: 'Search id / description / assignee' }}
          />
          <div className="min-w-0 flex-1">
            <EntityListTable
              rows={filtered}
              columns={columns}
              rowHref={(e) => `/escalations/${e.id}`}
              rowKey={(e) => e.id}
              caption="Escalations"
              empty={
                <EmptyState
                  title={
                    scoped.length === 0
                      ? 'No escalations found.'
                      : 'No escalations match your filters.'
                  }
                  description={
                    scoped.length === 0
                      ? 'Operations are running smoothly for your lane.'
                      : 'Try clearing the lane, level, or status filter to widen the view.'
                  }
                />
              }
            />
          </div>
        </div>
      </main>
    </>
  )
}
