/*
 * /schools list page.
 *
 * Filters: region, group membership (yes / no), GSTIN status
 * (captured / null), search (name + city + state).
 *
 * No per-role scoping: school directory is reference data; all
 * roles see all schools.
 *
 * W4-A.6 removed the ?incomplete=yes triage mode + the
 * dataCompleteness lib. PI generation no longer blocks on missing
 * GSTIN, so the "Schools needing data" surface no longer earns its
 * keep. Operators who want to find a missing-GSTIN school can apply
 * the GSTIN=Missing filter chip on this page.
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
import { SUPER_REGION_MEMBERS } from '@/lib/regions'

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

  const memberSchoolIds = new Set(
    allSchoolGroups.flatMap((g) => g.memberSchoolIds),
  )

  const baseFiltered = applyDimensionFilters(allSchools, active, {
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
      shortcuts: [
        { key: 'NE', label: 'NE', values: SUPER_REGION_MEMBERS.NE },
        { key: 'SW', label: 'SW', values: SUPER_REGION_MEMBERS.SW },
      ],
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
        { value: 'missing', label: 'Missing' },
      ],
    },
  ]

  const columns: ColumnDef<School>[] = [
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
          <span className="text-muted-foreground">Missing</span>
        ) : (
          <span className="font-mono text-xs">{s.gstNumber}</span>
        ),
    },
  ]

  return (
    <>
      <TopNav currentPath="/schools" />
      <main id="main-content">
        <PageHeader
          title="Schools"
          subtitle={`${filtered.length} of ${allSchools.length} matching`}
        />
        <div className="mx-auto flex max-w-screen-xl flex-col gap-4 px-4 py-6 sm:flex-row">
          <FilterRail
            basePath="/schools"
            dimensions={dimensions}
            active={active}
            search={{ value: search, placeholder: 'Search name / city / id' }}
          />
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
