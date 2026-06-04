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
  Feedback,
  MOU,
  School,
  SchoolGroup,
  User,
} from '@/lib/types'
import { mouRepo } from '@/lib/db/repos/mou'
import { schoolRepo } from '@/lib/db/repos/school'
import { dispatchRepo } from '@/lib/db/repos/dispatch'
import { paymentRepo } from '@/lib/db/repos/payment'
import {
  communicationRepo,
  feedbackRepo,
  schoolGroupRepo,
} from '@/lib/db/repos/leafRepos'
import { getCurrentUser } from '@/lib/auth/session'
import { canEditFinanceData } from '@/lib/access'
import { TopNav } from '@/components/ops/TopNav'
import { PageHeader } from '@/components/ops/PageHeader'
import { FilterRail, type FilterDimension } from '@/components/ops/FilterRail'
import { EmptyState } from '@/components/ops/EmptyState'
import { opsButtonClass } from '@/components/ops/OpsButton'
import { YearPickerPills } from '@/components/ops/YearPickerPills'
import { MouRegistryBucketsPanel } from '@/components/ops/MouRegistryBucketsPanel'
import {
  parseDimensions,
  applyDimensionFilters,
  applyTextSearch,
} from '@/lib/filterParsing'
import { SUPER_REGION_MEMBERS } from '@/lib/regions'
import {
  deriveStage,
  KANBAN_COLUMNS,
  type KanbanStageKey,
} from '@/lib/kanban/deriveStage'
import {
  filterMousByFinancialYear,
  getAllRelevantFinancialYears,
  getCurrentFinancialYear,
} from '@/lib/mou/yearMembership'
import Link from 'next/link'
import { Plus } from 'lucide-react'

const KANBAN_STAGE_KEYS = new Set<string>(KANBAN_COLUMNS.map((c) => c.key))

// Step 5: extra Gate 2 dimensions (school-group, year).
// 'region' continues to carry the NE / SW super-region shortcut.
const DIMENSION_KEYS = ['status', 'programme', 'region', 'schoolGroup', 'year'] as const


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
  const [
    allMous,
    allSchools,
    allDispatches,
    allPayments,
    allCommunications,
    allFeedback,
    allSchoolGroups,
  ] = await Promise.all([
    mouRepo.findAll(),
    schoolRepo.findAll(),
    dispatchRepo.findAll(),
    paymentRepo.findAll(),
    communicationRepo.findAll() as Promise<Communication[]>,
    feedbackRepo.findAll() as Promise<Feedback[]>,
    schoolGroupRepo.findAll() as Promise<SchoolGroup[]>,
  ])
  const schoolById = new Map(allSchools.map((s) => [s.id, s]))
  // Step 2 (2026-06-04, Pranav): uniform data across all years - the
  // active/archived cohort split is retired, so the list shows every MOU
  // and bifurcates by the year picker below. cohortStatus stays on the
  // record as a dormant field (its readers survive); we simply stop
  // filtering on it. Past behaviour reached archived rows via /mous/archive.
  const cohortFiltered = allMous
  const scoped = scopeMousForUser(cohortFiltered, user)

  // Phase 3 (2026-05-19): year picker. Resolve the active FY from
  // ?year=, defaulting to today's FY when absent or unknown. The
  // relevant-FY list is derived from MOU + Payment data so a year only
  // appears as a pill when at least one MOU lives in it.
  const relevantYears = getAllRelevantFinancialYears(scoped, allPayments)
  const currentFy = getCurrentFinancialYear()
  const yearParam = typeof sp.year === 'string' ? sp.year : null
  const activeYear = yearParam && relevantYears.includes(yearParam)
    ? yearParam
    : relevantYears.includes(currentFy)
      ? currentFy
      : relevantYears[0] ?? currentFy
  const yearFiltered = filterMousByFinancialYear(scoped, allPayments, activeYear)

  const active = parseDimensions(sp, DIMENSION_KEYS as unknown as string[])
  const search = typeof sp.q === 'string' ? sp.q : ''

  // W3-C C3: kanban column-header navigation lands here with ?stage=<key>.
  // Filter scoped MOUs to those whose deriveStage matches the requested key.
  // Year filter applies first; stage + dimension + text search chain on top.
  const stageParam = typeof sp.stage === 'string' && KANBAN_STAGE_KEYS.has(sp.stage)
    ? (sp.stage as KanbanStageKey)
    : null
  const stageFiltered = stageParam !== null
    ? yearFiltered.filter((m) =>
        deriveStage(m, {
          dispatches: allDispatches,
          payments: allPayments,
          communications: allCommunications,
          feedback: allFeedback,
        }) === stageParam,
      )
    : yearFiltered

  const filtered = applyTextSearch(
    applyDimensionFilters(stageFiltered, active, {
      status: (m) => m.status,
      programme: (m) => m.programme,
      region: (m) => regionFor(m, schoolById),
      schoolGroup: (m) => m.schoolGroupId,
      // 'year' is intentionally absent here. The pill row above the
      // table drives the FY filter via yearMembership.ts; the legacy
      // ?year= URL is consumed by the pill resolver upstream.
    }),
    search,
    (m) => [m.id, m.schoolName, m.programmeSubType ?? '', m.notes ?? ''],
  )

  const stageLabel = stageParam !== null
    ? KANBAN_COLUMNS.find((c) => c.key === stageParam)?.label ?? stageParam
    : null

  // School-group filter options come from the year-filtered set so
  // groups with no MOUs in the active year are not offered.
  const groupIdsInUse = new Set<string>()
  for (const m of yearFiltered) {
    if (m.schoolGroupId) groupIdsInUse.add(m.schoolGroupId)
  }
  const schoolGroupOptions = allSchoolGroups
    .filter((g) => groupIdsInUse.has(g.id))
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))

  const dimensions: FilterDimension[] = [
    {
      key: 'status',
      label: 'Status',
      // 2026-05-19 stabilisation (Bug 9): 'Draft' restored to the chip
      // options. W4-B.4 dropped it because zero imported MOUs carried
      // the status, but the wizard's Save Draft button now produces
      // them (MOU-STEAM-2627-DRAFT-001 etc.) and Pranav reported he had
      // no way to find his saved drafts. Filter chip + the Drafts CTA
      // above the table cover both discovery paths.
      options: ['Draft', 'Active', 'Pending Signature', 'Completed', 'Expired', 'Renewed'].map((v) => ({
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
      shortcuts: [
        { key: 'NE', label: 'NE', values: SUPER_REGION_MEMBERS.NE },
        { key: 'SW', label: 'SW', values: SUPER_REGION_MEMBERS.SW },
      ],
      options: ['East', 'North', 'South-West'].map((v) => ({ value: v, label: v })),
    },
    // Phase 3 (2026-05-19): the year dimension is retired from the chip
    // rail and replaced by the YearPickerPills above the table. The
    // `year` key remains in DIMENSION_KEYS so legacy bookmarked links
    // like /mous?year=2026-27 parse cleanly; that param now drives the
    // pill picker rather than the chip rail.
    {
      key: 'schoolGroup',
      label: 'School group',
      options: schoolGroupOptions.map((g) => ({ value: g.id, label: g.name })),
    },
  ]


  return (
    <>
      <TopNav currentPath="/mous" />
      <main id="main-content">
        <PageHeader
          title={stageLabel !== null ? `MOUs at ${stageLabel}` : `MOUs - FY ${activeYear}`}
          subtitle={
            stageLabel !== null
              ? `${filtered.length} MOUs at the ${stageLabel} stage. Filtered from the MOU Pipeline.`
              : `${filtered.length} of ${yearFiltered.length} matching in FY ${activeYear}`
          }
        />
        <YearPickerPills
          years={relevantYears}
          activeYear={activeYear}
          otherParams={sp}
        />
        <div className="mx-auto flex max-w-screen-xl items-center justify-end gap-2 px-4 pt-2">
          {/* Step 2 (2026-06-04, Pranav): the system is NOT opening to sales
              for drafting. Finance enters signed MOUs only via upload+save.
              The "Generate MOU" draft wizard entry is hidden (the wizard
              code stays dormant), and the Drafts / View archived CTAs are
              retired (uniform data across years - see cohort note above).
              "Add MOU" is the new primary creation path, Finance-gated. */}
          {user && canEditFinanceData(user) ? (
            <Link
              href="/mous/upload"
              className={opsButtonClass({ variant: 'primary', size: 'sm' })}
              data-testid="add-mou-link"
            >
              <Plus aria-hidden className="size-4" />
              Add MOU
            </Link>
          ) : null}
        </div>
        <div className="mx-auto flex max-w-screen-xl flex-col gap-4 px-4 py-6 sm:flex-row">
          <FilterRail
            basePath="/mous"
            dimensions={dimensions}
            active={active}
            search={{ value: search, placeholder: 'Search id / school / notes' }}
          />
          <div className="min-w-0 flex-1">
            <MouRegistryBucketsPanel
              rows={filtered}
              activeYear={activeYear}
              allPayments={allPayments}
              rowHref={(m) => `/mous/${m.id}?fy=${encodeURIComponent(activeYear)}`}
              empty={
                yearFiltered.length === 0 && activeYear !== currentFy && relevantYears.includes(currentFy) ? (
                  <EmptyState
                    title={`No MOUs for FY ${activeYear} yet.`}
                    description="Switch to the current year to see active MOUs."
                    action={
                      <Link
                        href={`/mous?year=${encodeURIComponent(currentFy)}`}
                        className={opsButtonClass({ variant: 'outline', size: 'sm' })}
                        data-testid="empty-year-switch-current"
                      >
                        Go to FY {currentFy} {'→'}
                      </Link>
                    }
                  />
                ) : (
                  <EmptyState
                    title="No MOUs match your filters."
                    description="Try broadening the programme or region, or clearing filters to see the full list."
                  />
                )
              }
            />
          </div>
        </div>
      </main>
    </>
  )
}
