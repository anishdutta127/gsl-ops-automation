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
  SchoolGroup,
  User,
} from '@/lib/types'
import mousJson from '@/data/mous.json'
import schoolsJson from '@/data/schools.json'
import dispatchesJson from '@/data/dispatches.json'
import paymentsJson from '@/data/payments.json'
import communicationsJson from '@/data/communications.json'
import feedbackJson from '@/data/feedback.json'
import schoolGroupsJson from '@/data/school_groups.json'
import { getCurrentUser } from '@/lib/auth/session'
import { canEditMOU } from '@/lib/access'
import { TopNav } from '@/components/ops/TopNav'
import { PageHeader } from '@/components/ops/PageHeader'
import { FilterRail, type FilterDimension } from '@/components/ops/FilterRail'
import { EntityListTable, type ColumnDef } from '@/components/ops/EntityListTable'
import { EmptyState } from '@/components/ops/EmptyState'
import { StatusChip } from '@/components/ops/StatusChip'
import { opsButtonClass } from '@/components/ops/OpsButton'
import { YearPickerPills } from '@/components/ops/YearPickerPills'
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
import { mouStatusTone } from '@/lib/ui/mouStatusTone'
import { formatRs } from '@/lib/format'
import {
  filterMousByFinancialYear,
  getAllRelevantFinancialYears,
  getCurrentFinancialYear,
  getYearSpecificInstalments,
} from '@/lib/mou/yearMembership'
import {
  deriveMouBucketAmounts,
  sumRegistryBuckets,
} from '@/lib/mou/mouRegistryBuckets'
import Link from 'next/link'
import { Archive, FileEdit, Plus } from 'lucide-react'

const allMous = mousJson as unknown as MOU[]
const allSchools = schoolsJson as unknown as School[]
const allDispatches = dispatchesJson as unknown as Dispatch[]
const allPayments = paymentsJson as unknown as Payment[]
const allCommunications = communicationsJson as unknown as Communication[]
const allFeedback = feedbackJson as unknown as Feedback[]
const allSchoolGroups = schoolGroupsJson as unknown as SchoolGroup[]
const KANBAN_STAGE_KEYS = new Set<string>(KANBAN_COLUMNS.map((c) => c.key))

// Step 5: extra Gate 2 dimensions (school-group, year).
// 'region' continues to carry the NE / SW super-region shortcut.
const DIMENSION_KEYS = ['status', 'programme', 'region', 'schoolGroup', 'year'] as const

function RegistryFooterTotals({
  totals,
  activeYear,
  stacked,
}: {
  totals: {
    piNoPayYes: number
    piYesPayYes: number
    piYesPayNo: number
    piNoPayNo: number
    expectedTotal: number
    rowCount: number
  }
  activeYear: string
  stacked?: boolean
}) {
  const sum =
    totals.piNoPayYes +
    totals.piYesPayYes +
    totals.piYesPayNo +
    totals.piNoPayNo
  const reconciles = Math.abs(sum - totals.expectedTotal) <= 1
  if (stacked) {
    return (
      <div
        className="rounded-md border border-border bg-muted/30 p-3 text-sm"
        data-testid="registry-footer-totals-mobile"
      >
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Totals across {totals.rowCount} visible MOU(s) for FY {activeYear}
        </p>
        <dl className="mt-2 space-y-1">
          <div className="flex justify-between">
            <dt className="text-amber-700">PI not raised, payment received</dt>
            <dd className="font-mono tabular-nums text-amber-700">{formatRs(totals.piNoPayYes)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-emerald-700">PI raised, payment received</dt>
            <dd className="font-mono tabular-nums text-emerald-700">{formatRs(totals.piYesPayYes)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-brand-navy">PI raised, payment not received</dt>
            <dd className="font-mono tabular-nums text-brand-navy">{formatRs(totals.piYesPayNo)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">PI not raised, payment not received</dt>
            <dd className="font-mono tabular-nums text-muted-foreground">{formatRs(totals.piNoPayNo)}</dd>
          </div>
          <div className="mt-1 flex justify-between border-t border-border pt-1">
            <dt className="font-semibold">Expected total (sum)</dt>
            <dd
              className="font-mono tabular-nums font-semibold"
              data-testid="registry-footer-expected-mobile"
            >
              {formatRs(totals.expectedTotal)} ({reconciles ? 'reconciles' : 'mismatch'})
            </dd>
          </div>
        </dl>
      </div>
    )
  }
  return (
    <div
      className="mt-3 overflow-x-auto rounded-md border border-border bg-muted/30"
      data-testid="registry-footer-totals"
    >
      <table className="min-w-full text-sm">
        <tbody>
          <tr>
            <td
              className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground"
              colSpan={4}
            >
              Totals across {totals.rowCount} visible MOU(s) for FY {activeYear}
            </td>
            <td
              className="px-3 py-2 text-right font-mono tabular-nums text-amber-700"
              data-testid="registry-footer-pi-no-pay-yes"
            >
              {formatRs(totals.piNoPayYes)}
            </td>
            <td
              className="px-3 py-2 text-right font-mono tabular-nums text-emerald-700"
              data-testid="registry-footer-pi-yes-pay-yes"
            >
              {formatRs(totals.piYesPayYes)}
            </td>
            <td
              className="px-3 py-2 text-right font-mono tabular-nums text-brand-navy"
              data-testid="registry-footer-pi-yes-pay-no"
            >
              {formatRs(totals.piYesPayNo)}
            </td>
            <td
              className="px-3 py-2 text-right font-mono tabular-nums text-muted-foreground"
              data-testid="registry-footer-pi-no-pay-no"
            >
              {formatRs(totals.piNoPayNo)}
            </td>
            <td className="px-3 py-2" />
          </tr>
          <tr>
            <td
              className="border-t border-border px-3 py-2 text-left text-xs text-muted-foreground"
              colSpan={4}
            >
              Expected total (sum of four columns){' '}
              <span data-testid="registry-footer-reconciles">
                {reconciles ? '· reconciles' : '· mismatch'}
              </span>
            </td>
            <td
              className="border-t border-border px-3 py-2 text-right font-mono tabular-nums font-semibold"
              colSpan={4}
              data-testid="registry-footer-expected"
            >
              {formatRs(totals.expectedTotal)}
            </td>
            <td className="border-t border-border px-3 py-2" />
          </tr>
        </tbody>
      </table>
    </div>
  )
}

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

  // Year-aware columns (Phase 3): when the active year is set, each row
  // surfaces year-scoped financials derived from the instalments due in
  // that FY. The lifetime contract value renders below the year amount
  // as small secondary text so multi-year MOUs do not lose the
  // headline number.
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
    {
      key: 'status',
      header: 'Status',
      render: (m) => (
        <StatusChip tone={mouStatusTone(m.status)} label={m.status} withDot={false} />
      ),
    },
    {
      key: 'yearContract',
      header: `FY ${activeYear} contract`,
      align: 'right',
      render: (m) => {
        const ys = getYearSpecificInstalments(m, activeYear, allPayments)
        const total = ys.reduce((s, p) => s + p.expectedAmount, 0)
        const lifetime = m.contractValue
        return (
          <span className="tabular-nums" data-testid={`year-contract-${m.id}`}>
            {total > 0 ? formatRs(total) : <span className="text-muted-foreground">{'-'}</span>}
            {lifetime > total ? (
              <span className="ml-1 block text-[11px] text-muted-foreground">
                lifetime {formatRs(lifetime)}
              </span>
            ) : null}
          </span>
        )
      },
    },
    // Phase 6C: four-column PI x Payment matrix per Pranav review #2.
    // Replaces the legacy received / balance / instalments columns.
    {
      key: 'piNoPayYes',
      header: 'PI not raised, payment received',
      align: 'right',
      render: (m) => {
        const ys = getYearSpecificInstalments(m, activeYear, allPayments)
        const b = deriveMouBucketAmounts(ys)
        return (
          <span
            className="tabular-nums text-amber-700"
            data-testid={`bucket-pi-no-pay-yes-${m.id}`}
          >
            {b.piNoPayYes > 0 ? formatRs(b.piNoPayYes) : '-'}
          </span>
        )
      },
    },
    {
      key: 'piYesPayYes',
      header: 'PI raised, payment received',
      align: 'right',
      render: (m) => {
        const ys = getYearSpecificInstalments(m, activeYear, allPayments)
        const b = deriveMouBucketAmounts(ys)
        return (
          <span
            className="tabular-nums text-emerald-700"
            data-testid={`bucket-pi-yes-pay-yes-${m.id}`}
          >
            {b.piYesPayYes > 0 ? formatRs(b.piYesPayYes) : '-'}
          </span>
        )
      },
    },
    {
      key: 'piYesPayNo',
      header: 'PI raised, payment not received',
      align: 'right',
      render: (m) => {
        const ys = getYearSpecificInstalments(m, activeYear, allPayments)
        const b = deriveMouBucketAmounts(ys)
        return (
          <span
            className="tabular-nums text-brand-navy"
            data-testid={`bucket-pi-yes-pay-no-${m.id}`}
          >
            {b.piYesPayNo > 0 ? formatRs(b.piYesPayNo) : '-'}
          </span>
        )
      },
    },
    {
      key: 'piNoPayNo',
      header: 'PI not raised, payment not received',
      align: 'right',
      render: (m) => {
        const ys = getYearSpecificInstalments(m, activeYear, allPayments)
        const b = deriveMouBucketAmounts(ys)
        return (
          <span
            className="tabular-nums text-muted-foreground"
            data-testid={`bucket-pi-no-pay-no-${m.id}`}
          >
            {b.piNoPayNo > 0 ? formatRs(b.piNoPayNo) : '-'}
          </span>
        )
      },
    },
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
          {/* The "+ New MOU" CTA is gated by canEditMOU so users without
              MOU-edit rights (e.g. Finance / Ops department) do not see
              a button that 404s on click. The /mous/new page itself
              calls notFound() for the same set of users; this CTA gate
              keeps the surface honest. */}
          {user && canEditMOU(user) ? (
            <Link
              href="/mous/new"
              className={opsButtonClass({ variant: 'primary', size: 'sm' })}
              data-testid="new-mou-link"
            >
              <Plus aria-hidden className="size-4" />
              New MOU
            </Link>
          ) : null}
          {/* 2026-05-19 stabilisation (Bug 9): drafts CTA. Pranav saved a
              draft via the wizard and could not find it. This applies the
              status=Draft filter so saved drafts surface immediately;
              the existing chip in the filter rail clears it. Count comes
              from the user-scoped + cohort-filtered set so a SalesRep
              only sees their own draft count. */}
          {user && canEditMOU(user) ? (
            <Link
              href="/mous?status=Draft"
              className={opsButtonClass({ variant: 'outline', size: 'sm' })}
              data-testid="drafts-link"
            >
              <FileEdit aria-hidden className="size-4" />
              {`Drafts (${scoped.filter((m) => m.status === 'Draft').length})`}
            </Link>
          ) : null}
          <Link
            href="/mous/archive"
            className={opsButtonClass({ variant: 'outline', size: 'sm' })}
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
            {/* Phase 6C: 4-column registry footer totals. Computed
                once on the server across the visible (filtered) rows
                so the footer reflects whatever year + filter the user
                is looking at. */}
            {(() => {
              const visibleBuckets = filtered.map((m) => ({
                buckets: deriveMouBucketAmounts(
                  getYearSpecificInstalments(m, activeYear, allPayments),
                ),
              }))
              const totals = sumRegistryBuckets(visibleBuckets)
              return (
                <>
                  {/* Desktop / tablet: existing table. */}
                  <div className="hidden md:block">
                    <EntityListTable
                      rows={filtered}
                      columns={columns}
                      rowHref={(m) => `/mous/${m.id}?fy=${encodeURIComponent(activeYear)}`}
                      rowKey={(m) => m.id}
                      caption="MOUs"
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
                    {filtered.length > 0 ? (
                      <RegistryFooterTotals
                        totals={totals}
                        activeYear={activeYear}
                      />
                    ) : null}
                  </div>

                  {/* Mobile: card stack per MOU. */}
                  <div className="md:hidden">
                    {filtered.length === 0 ? (
                      <EmptyState
                        title="No MOUs match your filters."
                        description="Broaden the filters or clear them."
                      />
                    ) : (
                      <ul
                        className="space-y-3"
                        data-testid="mous-mobile-cards"
                      >
                        {filtered.map((m) => {
                          const ys = getYearSpecificInstalments(m, activeYear, allPayments)
                          const b = deriveMouBucketAmounts(ys)
                          return (
                            <li
                              key={m.id}
                              className="rounded-lg border border-border bg-card p-3"
                              data-testid={`mou-mobile-card-${m.id}`}
                            >
                              <Link
                                href={`/mous/${m.id}?fy=${encodeURIComponent(activeYear)}`}
                                className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
                              >
                                <div className="flex items-baseline justify-between gap-2">
                                  <span className="font-semibold text-brand-navy">
                                    {m.schoolName}
                                  </span>
                                  <StatusChip
                                    tone={mouStatusTone(m.status)}
                                    label={m.status}
                                    withDot={false}
                                  />
                                </div>
                                <p className="mt-1 text-xs text-muted-foreground">
                                  {m.id} {'·'} {m.programme}
                                  {m.programmeSubType ? ` / ${m.programmeSubType}` : ''}
                                </p>
                                <dl className="mt-3 grid grid-cols-1 gap-1 text-sm">
                                  <div className="flex justify-between">
                                    <dt className="text-amber-700">
                                      PI not raised, payment received
                                    </dt>
                                    <dd className="font-mono tabular-nums text-amber-700">
                                      {b.piNoPayYes > 0 ? formatRs(b.piNoPayYes) : '-'}
                                    </dd>
                                  </div>
                                  <div className="flex justify-between">
                                    <dt className="text-emerald-700">
                                      PI raised, payment received
                                    </dt>
                                    <dd className="font-mono tabular-nums text-emerald-700">
                                      {b.piYesPayYes > 0 ? formatRs(b.piYesPayYes) : '-'}
                                    </dd>
                                  </div>
                                  <div className="flex justify-between">
                                    <dt className="text-brand-navy">
                                      PI raised, payment not received
                                    </dt>
                                    <dd className="font-mono tabular-nums text-brand-navy">
                                      {b.piYesPayNo > 0 ? formatRs(b.piYesPayNo) : '-'}
                                    </dd>
                                  </div>
                                  <div className="flex justify-between">
                                    <dt className="text-muted-foreground">
                                      PI not raised, payment not received
                                    </dt>
                                    <dd className="font-mono tabular-nums text-muted-foreground">
                                      {b.piNoPayNo > 0 ? formatRs(b.piNoPayNo) : '-'}
                                    </dd>
                                  </div>
                                </dl>
                              </Link>
                            </li>
                          )
                        })}
                      </ul>
                    )}
                    {filtered.length > 0 ? (
                      <div className="mt-4">
                        <RegistryFooterTotals
                          totals={totals}
                          activeYear={activeYear}
                          stacked
                        />
                      </div>
                    ) : null}
                  </div>
                </>
              )
            })()}
          </div>
        </div>
      </main>
    </>
  )
}
