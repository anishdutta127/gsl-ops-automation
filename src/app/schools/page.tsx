/*
 * /schools list page.
 *
 * Filters: region, group membership (yes / no), GSTIN status
 * (captured / null), search (name + city + state).
 *
 * No per-role scoping: school directory is reference data; all
 * roles see all schools.
 */

import type { School, SchoolGroup } from '@/lib/types'
import schoolsJson from '@/data/schools.json'
import schoolGroupsJson from '@/data/school_groups.json'
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
import { getIncompleteSchools, missingFieldCount } from '@/lib/schools/dataCompleteness'

const allSchools = schoolsJson as unknown as School[]
const allSchoolGroups = schoolGroupsJson as unknown as SchoolGroup[]

const DIMENSION_KEYS = ['region', 'group', 'gstin'] as const

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function SchoolsListPage({ searchParams }: PageProps) {
  const sp = await searchParams
  const active = parseDimensions(sp, DIMENSION_KEYS as unknown as string[])
  const search = typeof sp.q === 'string' ? sp.q : ''
  const incompleteMode = sp.incomplete === 'yes'

  const memberSchoolIds = new Set(
    allSchoolGroups.flatMap((g) => g.memberSchoolIds),
  )

  // ?incomplete=yes overrides the dimension filters with the
  // dataCompleteness "most-missing first" sort. Text search still
  // applies on top so the operator can narrow within the triage list.
  const baseFiltered = incompleteMode
    ? getIncompleteSchools(allSchools, 1)
    : applyDimensionFilters(allSchools, active, {
        region: (s) => s.region,
        group: (s) => (memberSchoolIds.has(s.id) ? 'yes' : 'no'),
        gstin: (s) => (s.gstNumber === null ? 'missing' : 'captured'),
      })

  const filtered = applyTextSearch(
    baseFiltered,
    search,
    (s) => [s.name, s.city, s.state, s.id],
  )

  const dimensions: FilterDimension[] = [
    {
      key: 'region',
      label: 'Region',
      options: ['East', 'North', 'South-West'].map((v) => ({ value: v, label: v })),
    },
    {
      key: 'group',
      label: 'Chain membership',
      options: [
        { value: 'yes', label: 'In a chain' },
        { value: 'no', label: 'Stand-alone' },
      ],
    },
    {
      key: 'gstin',
      label: 'GSTIN',
      options: [
        { value: 'captured', label: 'Captured' },
        { value: 'missing', label: 'Missing (PI blocked)' },
      ],
    },
  ]

  const baseColumns: ColumnDef<School>[] = [
    {
      key: 'id',
      header: 'School id',
      render: (s) => <span className="font-mono text-xs">{s.id}</span>,
    },
    { key: 'name', header: 'Name', render: (s) => s.name },
    { key: 'city', header: 'City', render: (s) => `${s.city}, ${s.state}` },
    { key: 'region', header: 'Region', render: (s) => s.region },
    {
      key: 'gstin',
      header: 'GSTIN',
      render: (s) =>
        s.gstNumber === null ? (
          <span className="text-signal-alert">Missing</span>
        ) : (
          <span className="font-mono text-xs">{s.gstNumber}</span>
        ),
    },
  ]
  const incompleteColumn: ColumnDef<School> = {
    key: 'missing',
    header: 'Missing',
    render: (s) => {
      const count = missingFieldCount(s)
      return count === 0
        ? <span className="text-signal-ok">Complete</span>
        : <span className="text-signal-attention">{count} of 4</span>
    },
  }
  const columns = incompleteMode ? [...baseColumns, incompleteColumn] : baseColumns

  return (
    <>
      <TopNav currentPath="/schools" />
      <main id="main-content">
        <PageHeader
          title={incompleteMode ? 'Schools needing data' : 'Schools'}
          subtitle={
            incompleteMode
              ? `${filtered.length} schools missing one or more critical fields, sorted most-missing first.`
              : `${filtered.length} of ${allSchools.length} matching`
          }
        />
        <div className="mx-auto flex max-w-screen-xl flex-col gap-4 px-4 py-6 sm:flex-row">
          {incompleteMode ? null : (
            <FilterRail
              basePath="/schools"
              dimensions={dimensions}
              active={active}
              search={{ value: search, placeholder: 'Search name / city / id' }}
            />
          )}
          <div className="min-w-0 flex-1">
            <EntityListTable
              rows={filtered}
              columns={columns}
              rowHref={(s) => `/schools/${s.id}`}
              rowKey={(s) => s.id}
              caption="Schools"
              empty={
                <EmptyState
                  title="No schools match the current filters."
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
