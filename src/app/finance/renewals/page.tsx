/*
 * /finance/renewals (Gate 4.95 Session 4).
 *
 * Drilldown from the Finance dashboard's "See renewals" link in the
 * RenewalNeededPanel. Bucketed view of MOUs that need renewal action,
 * with inline per-row Mark as Renewed + Decline forms. Renewals are
 * owned by Sales; this surface is the accounts-team early warning.
 *
 * Filter rail reuses FinanceFilterBar so dashboard -> drilldown click-
 * through preserves filter context. Additional renewal-specific filters
 * (sales rep, renewal-status, expired-vs-soon segment) live below the
 * shared bar as URL-mirrored selects.
 */

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { CheckCircle2 } from 'lucide-react'
import type { MOU, SalesPerson } from '@/lib/types'
// P4 batch 3a (2026-05-24): live repo reads.
import { mouRepo } from '@/lib/db/repos/mou'
import { paymentRepo } from '@/lib/db/repos/payment'
import { salesTeamRepo } from '@/lib/db/repos/salesTeam'
import { getCurrentUser } from '@/lib/auth/session'
import { canAccessFinance } from '@/lib/access'
import { TopNav } from '@/components/ops/TopNav'
import { PageHeader } from '@/components/ops/PageHeader'
import { EmptyState } from '@/components/ops/EmptyState'
import { StatusChip, type StatusChipTone } from '@/components/ops/StatusChip'
import {
  applyFilters,
  fyOptionsList,
  parseFinanceFilters,
} from '@/lib/dashboard/financeDashboardData'
import { FinanceFilterBar } from '@/components/dashboard/FinanceFilterBar'
import { formatDate, formatRs } from '@/lib/format'
import {
  bucketRenewals,
  countActionable,
  type RenewalBucket,
  type RenewalRow,
  type RenewalStatusComputed,
} from '@/lib/finance/renewalsData'

const BUCKET_ORDER: RenewalBucket[] = [
  'expired',
  'week',
  'month',
  'ninety',
  'beyond',
]

const BUCKET_TITLE: Record<RenewalBucket, string> = {
  expired: 'Already expired',
  week: 'This week',
  month: 'This month',
  ninety: 'Next 90 days',
  beyond: 'Beyond',
}

const RENEWAL_STATUSES: RenewalStatusComputed[] = [
  'Not yet',
  'Discussion',
  'Renewed',
  'Declined',
]

function renewalStatusTone(s: RenewalStatusComputed): StatusChipTone {
  switch (s) {
    case 'Renewed':
      return 'ok'
    case 'Discussion':
      return 'attention'
    case 'Declined':
      return 'alert'
    case 'Not yet':
    default:
      return 'neutral'
  }
}

function programmePillClass(p: MOU['programme']): string {
  switch (p) {
    case 'STEAM':
      return 'bg-brand-teal/15 text-brand-navy'
    case 'Young Pioneers':
      return 'bg-violet-100 text-violet-700'
    case 'Harvard HBPE':
      return 'bg-amber-100 text-amber-700'
    case 'Robotics':
      return 'bg-indigo-100 text-indigo-700'
    default:
      return 'bg-slate-100 text-slate-700'
  }
}

function mouStatusTone(s: MOU['status']): StatusChipTone {
  switch (s) {
    case 'Active':
      return 'ok'
    case 'Draft':
    case 'Pending Signature':
      return 'attention'
    case 'Expired':
      return 'alert'
    case 'Completed':
    case 'Renewed':
      return 'navy'
    default:
      return 'neutral'
  }
}

interface ExtraFilters {
  reps: string[]
  statuses: RenewalStatusComputed[]
  expiredOnly: boolean
  soonOnly: boolean
}

function parseExtraFilters(
  params: Record<string, string | string[] | undefined>,
): ExtraFilters {
  const toList = (v: string | string[] | undefined): string[] => {
    if (v === undefined) return []
    if (Array.isArray(v)) return v.flatMap((s) => s.split(',')).filter(Boolean)
    return v.split(',').filter(Boolean)
  }
  const reps = toList(params.rep)
  const statusesRaw = toList(params.rs)
  const statuses = statusesRaw.filter((s): s is RenewalStatusComputed =>
    (RENEWAL_STATUSES as string[]).includes(s),
  )
  const view = typeof params.view === 'string' ? params.view : null
  return {
    reps,
    statuses,
    expiredOnly: view === 'expired',
    soonOnly: view === 'soon',
  }
}

export default async function FinanceRenewalsPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>
}) {
  const user = await getCurrentUser()
  if (!user) redirect('/login?next=%2Ffinance%2Frenewals')
  if (!canAccessFinance(user)) redirect('/?notice=finance-access-required')

  const [allMous, allPayments, allSalesTeam] = await Promise.all([
    mouRepo.findAll(),
    paymentRepo.findAll(),
    salesTeamRepo.findAll(),
  ])

  const now = new Date()
  const filters = parseFinanceFilters(searchParams ?? {})
  const extra = parseExtraFilters(searchParams ?? {})
  const fyOptions = fyOptionsList(allMous, now)

  const { filteredMous } = applyFilters({
    mous: allMous,
    payments: allPayments,
    filters,
  })

  const buckets = bucketRenewals({ mous: filteredMous, now })

  // Sales rep options derived from the filter-narrowed MOU set.
  const repIdsInView = new Set<string>()
  for (const m of filteredMous) {
    if (m.salesPersonId) repIdsInView.add(m.salesPersonId)
  }
  const repOptions = allSalesTeam
    .filter((r) => repIdsInView.has(r.id))
    .sort((a, b) => a.name.localeCompare(b.name))
  const repNameById = new Map(allSalesTeam.map((r) => [r.id, r.name]))

  function rowMatchesExtra(row: RenewalRow): boolean {
    if (extra.reps.length > 0) {
      if (!row.salesPersonId || !extra.reps.includes(row.salesPersonId))
        return false
    }
    if (extra.statuses.length > 0) {
      if (!extra.statuses.includes(row.renewalStatus)) return false
    }
    if (extra.expiredOnly && !row.isExpired) return false
    if (extra.soonOnly && row.isExpired) return false
    return true
  }

  const filteredBuckets: Record<RenewalBucket, RenewalRow[]> = {
    expired: buckets.expired.filter(rowMatchesExtra),
    week: buckets.week.filter(rowMatchesExtra),
    month: buckets.month.filter(rowMatchesExtra),
    ninety: buckets.ninety.filter(rowMatchesExtra),
    beyond: buckets.beyond.filter(rowMatchesExtra),
  }
  const actionable = countActionable(filteredBuckets)

  return (
    <>
      <TopNav currentPath="/dashboard/finance" />
      <div data-testid="finance-renewals">
        <PageHeader
          title="Renewal needed"
          subtitle={`${actionable} MOUs need attention in the next 90 days. Renewals are owned by sales; this view is the accounts-team early warning.`}
          breadcrumb={[
            { label: 'Dashboard', href: '/' },
            { label: 'Finance', href: '/dashboard/finance' },
            { label: 'Renewals' },
          ]}
        />

        <div className="mx-auto flex max-w-screen-xl flex-col gap-6 px-4 py-6 sm:px-6">
          <FinanceFilterBar initialFilters={filters} fyOptions={fyOptions} />

          <RenewalExtraFilters
            repOptions={repOptions}
            selected={extra}
          />

          {actionable === 0 && filteredBuckets.beyond.length === 0 ? (
            <section
              data-testid="renewals-empty"
              className="rounded-lg border border-border bg-card"
            >
              <EmptyState
                icon={<CheckCircle2 aria-hidden className="size-6 text-signal-ok" />}
                title="No MOUs match the current filters"
                description="Adjust the filter bar or rep / status selectors to widen the view."
              />
            </section>
          ) : null}

          {BUCKET_ORDER.map((bucket) => (
            <BucketSection
              key={bucket}
              bucket={bucket}
              rows={filteredBuckets[bucket]}
              repNameById={repNameById}
            />
          ))}
        </div>
      </div>
    </>
  )
}

function RenewalExtraFilters({
  repOptions,
  selected,
}: {
  repOptions: SalesPerson[]
  selected: ExtraFilters
}) {
  // Server-rendered form that preserves the shared FinanceFilterBar
  // params (programme / sales channel / fy / from / to) via hidden
  // inputs so submitting this form does not blow away the dashboard
  // filter context.
  return (
    <form
      data-testid="renewals-extra-filters"
      method="get"
      action="/finance/renewals"
      className="rounded-lg border border-border bg-card p-4"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-4">
        <label className="flex min-w-[12rem] flex-col gap-1 text-xs text-slate-600">
          <span>Sales rep</span>
          <select
            name="rep"
            multiple
            data-testid="renewals-filter-rep"
            defaultValue={selected.reps}
            className="min-h-11 rounded-md border border-border bg-white px-2 py-1 text-sm text-brand-navy focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal sm:min-h-0"
          >
            {repOptions.map((rep) => (
              <option key={rep.id} value={rep.id}>
                {rep.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex min-w-[12rem] flex-col gap-1 text-xs text-slate-600">
          <span>Renewal status</span>
          <select
            name="rs"
            multiple
            data-testid="renewals-filter-status"
            defaultValue={selected.statuses}
            className="min-h-11 rounded-md border border-border bg-white px-2 py-1 text-sm text-brand-navy focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal sm:min-h-0"
          >
            {RENEWAL_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>

        <div
          role="radiogroup"
          aria-label="Expired or expiring soon"
          className="flex flex-col gap-1 text-xs text-slate-600"
        >
          <span>View</span>
          <div className="inline-flex overflow-hidden rounded-md border border-border">
            <ViewSegmentRadio
              value=""
              label="All"
              current={
                selected.expiredOnly
                  ? 'expired'
                  : selected.soonOnly
                    ? 'soon'
                    : ''
              }
            />
            <ViewSegmentRadio
              value="expired"
              label="Expired"
              current={
                selected.expiredOnly
                  ? 'expired'
                  : selected.soonOnly
                    ? 'soon'
                    : ''
              }
            />
            <ViewSegmentRadio
              value="soon"
              label="Expiring soon"
              current={
                selected.expiredOnly
                  ? 'expired'
                  : selected.soonOnly
                    ? 'soon'
                    : ''
              }
            />
          </div>
        </div>

        <div className="flex gap-2 sm:ml-auto">
          <button
            type="submit"
            data-testid="renewals-extra-apply"
            className="inline-flex min-h-11 items-center rounded-md bg-brand-navy px-4 py-2 text-sm font-semibold text-white hover:bg-brand-navy/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal"
          >
            Apply
          </button>
          <Link
            href="/finance/renewals"
            data-testid="renewals-extra-reset"
            className="inline-flex min-h-11 items-center rounded-md border border-border bg-white px-4 py-2 text-sm font-medium text-brand-navy hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal"
          >
            Reset
          </Link>
        </div>
      </div>
    </form>
  )
}

function ViewSegmentRadio({
  value,
  label,
  current,
}: {
  value: string
  label: string
  current: string
}) {
  const active = current === value
  return (
    <label
      className={
        active
          ? 'inline-flex min-h-11 items-center justify-center bg-brand-navy px-3 py-2 text-xs font-semibold text-white sm:min-h-0'
          : 'inline-flex min-h-11 items-center justify-center bg-white px-3 py-2 text-xs font-medium text-brand-navy hover:bg-slate-50 sm:min-h-0'
      }
    >
      <input
        type="radio"
        name="view"
        value={value}
        defaultChecked={active}
        className="sr-only"
      />
      {label}
    </label>
  )
}

function BucketSection({
  bucket,
  rows,
  repNameById,
}: {
  bucket: RenewalBucket
  rows: RenewalRow[]
  repNameById: Map<string, string>
}) {
  const heading = (
    <div className="flex items-baseline justify-between gap-3">
      <h2 className="font-heading text-base font-semibold text-brand-navy">
        {BUCKET_TITLE[bucket]}
      </h2>
      <span
        data-testid={`renewals-bucket-count-${bucket}`}
        className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700"
      >
        {rows.length}
      </span>
    </div>
  )

  const body =
    rows.length === 0 ? (
      <p
        data-testid={`renewals-bucket-empty-${bucket}`}
        className="mt-3 text-sm text-slate-600"
      >
        No MOUs in this bucket.
      </p>
    ) : (
      <ul className="mt-3 flex flex-col gap-2">
        {rows.map((row) => (
          <li key={row.mouId}>
            <RenewalRowCard row={row} repNameById={repNameById} />
          </li>
        ))}
      </ul>
    )

  if (bucket === 'beyond') {
    return (
      <details
        data-testid={`renewals-bucket-${bucket}`}
        className="rounded-lg border border-border bg-card p-4 sm:p-5"
      >
        <summary className="cursor-pointer list-none">{heading}</summary>
        {body}
      </details>
    )
  }

  return (
    <section
      data-testid={`renewals-bucket-${bucket}`}
      className="rounded-lg border border-border bg-card p-4 sm:p-5"
    >
      {heading}
      {body}
    </section>
  )
}

function RenewalRowCard({
  row,
  repNameById,
}: {
  row: RenewalRow
  repNameById: Map<string, string>
}) {
  const repName = row.salesPersonId
    ? (repNameById.get(row.salesPersonId) ?? row.salesPersonId)
    : 'Unassigned'

  return (
    <div
      data-testid={`renewals-row-${row.mouId}`}
      className="rounded-md border border-border bg-white p-3 transition-shadow hover:shadow-md"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <Link
          href={`/mous/${row.mouId}`}
          className="min-w-0 flex-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal"
        >
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${programmePillClass(row.programme)}`}
            >
              {row.programme}
            </span>
            <StatusChip tone={mouStatusTone(row.status)} label={row.status} />
            <StatusChip
              tone={renewalStatusTone(row.renewalStatus)}
              label={row.renewalStatus}
              testId={`renewals-row-status-${row.mouId}`}
            />
          </div>
          <div className="mt-1 truncate font-semibold text-brand-navy">
            {row.schoolName}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
            <span>Ends {formatDate(row.endDate)}</span>
            <span>Rep: {repName}</span>
            <span>{formatRs(row.contractValue, { compact: true })}</span>
          </div>
        </Link>
        <div className="shrink-0 text-right">
          <ExpiryChip
            isExpired={row.isExpired}
            daysToExpiry={row.daysToExpiry}
          />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-start gap-2 border-t border-border pt-3">
        <form
          action={`/api/mou/${row.mouId}/mark-renewed`}
          method="post"
          className="flex"
        >
          <input type="hidden" name="returnTo" value="/finance/renewals" />
          <button
            type="submit"
            data-testid={`renewals-row-mark-${row.mouId}`}
            disabled={row.renewalStatus === 'Renewed'}
            className="inline-flex min-h-11 items-center rounded-md bg-brand-teal px-3 py-2 text-xs font-semibold text-brand-navy hover:bg-brand-teal/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 sm:min-h-0"
          >
            Mark as Renewed
          </button>
        </form>

        <details className="flex-1">
          <summary
            data-testid={`renewals-row-decline-summary-${row.mouId}`}
            className="inline-flex min-h-11 cursor-pointer items-center rounded-md border border-border bg-white px-3 py-2 text-xs font-medium text-brand-navy hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal sm:min-h-0"
          >
            Decline to renew
          </summary>
          <form
            action={`/api/mou/${row.mouId}/decline-renewal`}
            method="post"
            className="mt-2 flex flex-col gap-2 sm:flex-row"
          >
            <input type="hidden" name="returnTo" value="/finance/renewals" />
            <label
              className="flex flex-1 flex-col gap-1 text-xs text-slate-600"
            >
              <span>Reason</span>
              <input
                type="text"
                name="reason"
                required
                placeholder="Why is renewal off the table?"
                data-testid={`renewals-row-decline-reason-${row.mouId}`}
                className="min-h-11 rounded-md border border-border bg-white px-2 py-1 text-sm text-brand-navy focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal sm:min-h-0"
              />
            </label>
            <button
              type="submit"
              data-testid={`renewals-row-decline-submit-${row.mouId}`}
              className="inline-flex min-h-11 items-center self-end rounded-md bg-signal-alert px-3 py-2 text-xs font-semibold text-white hover:bg-signal-alert/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal sm:min-h-0"
            >
              Confirm decline
            </button>
          </form>
        </details>

        <button
          type="button"
          disabled
          data-testid={`renewals-row-followup-${row.mouId}`}
          title="Coming in Phase 1.1"
          aria-disabled="true"
          className="inline-flex min-h-11 cursor-not-allowed items-center rounded-md border border-border bg-slate-50 px-3 py-2 text-xs font-medium text-slate-400 sm:min-h-0"
        >
          Schedule follow-up
        </button>
      </div>
    </div>
  )
}

function ExpiryChip({
  isExpired,
  daysToExpiry,
}: {
  isExpired: boolean
  daysToExpiry: number | null
}) {
  if (daysToExpiry === null) {
    return <StatusChip tone="neutral" label="no end date" withDot={false} />
  }
  if (isExpired) {
    const ago = Math.abs(daysToExpiry)
    return <StatusChip tone="alert" label={`Expired ${ago}d ago`} withDot={false} />
  }
  return <StatusChip tone="attention" label={`Expires in ${daysToExpiry}d`} withDot={false} />
}
