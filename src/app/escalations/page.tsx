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
      options: [
        { value: 'open', label: 'Open' },
        { value: 'acknowledged', label: 'Acknowledged' },
        { value: 'resolved', label: 'Resolved' },
        { value: 'withdrawn', label: 'Withdrawn' },
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
      render: (e) => `${e.lane} / ${e.level}`,
    },
    { key: 'status', header: 'Status', render: (e) => e.status },
    { key: 'severity', header: 'Severity', render: (e) => e.severity },
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
                  title="No escalations match the current filters."
                  description={
                    scoped.length === 0
                      ? 'Your role has no visible escalations in this view.'
                      : 'Adjust filters or clear them to see the full list.'
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
