/*
 * /finance/schools-receipts (Gate 4.95 Session 4).
 *
 * Drilldown from the Finance dashboard's "Contract value" KPI card.
 * Receipt status by school: contract value, received amount, outstanding,
 * % received, last payment date, next instalment due, health pill.
 *
 * Mobile-first: the table collapses to a per-row card stack at narrow
 * widths via the responsive utility classes on the wrapper. Each row
 * links into the existing school detail page.
 */

import Link from 'next/link'
import { redirect } from 'next/navigation'
// P4 batch 3a (2026-05-24): live repo reads.
import { mouRepo } from '@/lib/db/repos/mou'
import { paymentRepo } from '@/lib/db/repos/payment'
import { schoolRepo } from '@/lib/db/repos/school'
import { getCurrentUser } from '@/lib/auth/session'
import { canAccessFinance } from '@/lib/access'
import { TopNav } from '@/components/ops/TopNav'
import { PageHeader } from '@/components/ops/PageHeader'
import { StatusChip, type StatusChipTone } from '@/components/ops/StatusChip'
import {
  fyOptionsList,
  parseFinanceFilters,
} from '@/lib/dashboard/financeDashboardData'
import { FinanceFilterBar } from '@/components/dashboard/FinanceFilterBar'
import { formatDate, formatRs } from '@/lib/format'
import {
  computeSchoolReceipts,
  isSchoolReceiptSortKey,
  type SchoolReceiptRow,
  type SchoolReceiptSortKey,
  type SchoolReceiptStatus,
} from '@/lib/finance/schoolsReceiptsData'

const SORT_LABEL: Record<SchoolReceiptSortKey, string> = {
  'contract-desc': 'Contract value (high to low)',
  'outstanding-desc': 'Outstanding (high to low)',
  'received-asc': 'Percent received (low to high)',
  'last-payment-desc': 'Last payment (most recent)',
  'name-asc': 'School name (A to Z)',
}

const SORT_KEYS: SchoolReceiptSortKey[] = [
  'name-asc',
  'contract-desc',
  'outstanding-desc',
  'received-asc',
  'last-payment-desc',
]

function statusTone(s: SchoolReceiptStatus): StatusChipTone {
  switch (s) {
    case 'Healthy':
      return 'ok'
    case 'At Risk':
      return 'attention'
    case 'Overdue':
      return 'alert'
    case 'Closed':
      return 'neutral'
  }
}

export default async function FinanceSchoolsReceiptsPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>
}) {
  const user = await getCurrentUser()
  if (!user) redirect('/login?next=%2Ffinance%2Fschools-receipts')
  if (!canAccessFinance(user)) redirect('/?notice=finance-access-required')

  const [allMous, allPayments, allSchools] = await Promise.all([
    mouRepo.findAll(),
    paymentRepo.findAll(),
    schoolRepo.findAll(),
  ])

  const now = new Date()
  const filters = parseFinanceFilters(searchParams ?? {})
  const fyOptions = fyOptionsList(allMous, now)

  const sortRaw =
    typeof searchParams?.sort === 'string' ? searchParams.sort : null
  const sortBy: SchoolReceiptSortKey = isSchoolReceiptSortKey(sortRaw)
    ? sortRaw
    : 'name-asc'

  const rows = computeSchoolReceipts({
    mous: allMous,
    payments: allPayments,
    schools: allSchools,
    filters,
    now,
    sortBy,
  })

  return (
    <>
      <TopNav currentPath="/dashboard/finance" />
      <div data-testid="finance-schools-receipts">
        <PageHeader
          title="Schools and receipts"
          subtitle="Receipt status by school. Drill into the registry to action."
          breadcrumb={[
            { label: 'Dashboard', href: '/' },
            { label: 'Finance', href: '/dashboard/finance' },
            { label: 'Schools and receipts' },
          ]}
        />

        <div className="mx-auto flex max-w-screen-xl flex-col gap-6 px-4 py-6 sm:px-6">
          <FinanceFilterBar initialFilters={filters} fyOptions={fyOptions} />

          <SortSelector currentSort={sortBy} />

          {rows.length === 0 ? (
            <section
              data-testid="schools-receipts-empty"
              className="rounded-lg border border-border bg-card p-6 text-center text-sm text-slate-600"
            >
              No schools match the current filters.
            </section>
          ) : (
            <section
              data-testid="schools-receipts-table"
              aria-labelledby="schools-receipts-heading"
              className="rounded-lg border border-border bg-card p-4 sm:p-5"
            >
              <h2
                id="schools-receipts-heading"
                className="sr-only"
              >
                Schools and receipts table
              </h2>
              <div className="hidden md:block">
                <DesktopTable rows={rows} />
              </div>
              <div className="flex flex-col gap-3 md:hidden">
                {rows.map((row) => (
                  <MobileCard key={row.schoolId} row={row} />
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </>
  )
}

function SortSelector({ currentSort }: { currentSort: SchoolReceiptSortKey }) {
  // GET form so the user's filter URL params survive submission; the
  // hidden inputs would otherwise be lost when the sort dropdown
  // changes. Keeping the sort as a separate form lets the
  // FinanceFilterBar (a client component) own its own state without
  // contention.
  return (
    <form
      method="get"
      action="/finance/schools-receipts"
      data-testid="schools-receipts-sort-form"
      className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-end"
    >
      <label className="flex flex-col gap-1 text-xs text-slate-600">
        <span>Sort by</span>
        <select
          name="sort"
          defaultValue={currentSort}
          data-testid="schools-receipts-sort"
          className="min-h-11 rounded-md border border-border bg-white px-2 py-1 text-sm text-brand-navy focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal sm:min-h-0"
        >
          {SORT_KEYS.map((key) => (
            <option key={key} value={key}>
              {SORT_LABEL[key]}
            </option>
          ))}
        </select>
      </label>
      <button
        type="submit"
        className="inline-flex min-h-11 items-center self-start rounded-md border border-border bg-white px-3 py-2 text-xs font-semibold text-brand-navy hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal sm:self-end"
      >
        Apply sort
      </button>
    </form>
  )
}

function DesktopTable({ rows }: { rows: SchoolReceiptRow[] }) {
  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-slate-600">
          <th className="py-2 pr-3">School</th>
          <th className="py-2 pr-3">Region</th>
          <th className="py-2 pr-3">Programmes</th>
          <th className="py-2 pr-3 text-right">Contract</th>
          <th className="py-2 pr-3 text-right">Received</th>
          <th className="py-2 pr-3 text-right">Outstanding</th>
          <th className="py-2 pr-3 text-right">%</th>
          <th className="py-2 pr-3">Last payment</th>
          <th className="py-2 pr-3">Next due</th>
          <th className="py-2 pr-3">Status</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr
            key={row.schoolId}
            data-testid={`schools-receipts-row-${row.schoolId}`}
            className="border-b border-border last:border-b-0 hover:bg-slate-50"
          >
            <td className="py-2 pr-3">
              <Link
                href={`/schools/${row.schoolId}`}
                className="font-semibold text-brand-navy hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal"
              >
                {row.schoolName}
              </Link>
            </td>
            <td className="py-2 pr-3 text-slate-700">{row.region}</td>
            <td className="py-2 pr-3 text-slate-700">
              {row.programmes.join(', ')}
            </td>
            <td className="py-2 pr-3 text-right font-medium text-brand-navy">
              {formatRs(row.totalContractValue, { compact: true })}
            </td>
            <td className="py-2 pr-3 text-right text-signal-ok">
              {formatRs(row.receivedAmount, { compact: true })}
            </td>
            <td className="py-2 pr-3 text-right text-amber-600">
              {formatRs(row.outstanding, { compact: true })}
            </td>
            <td className="py-2 pr-3 text-right text-slate-700">
              {row.receivedPct.toFixed(1)}%
            </td>
            <td className="py-2 pr-3 text-slate-700">
              {row.lastPaymentDate ? formatDate(row.lastPaymentDate) : '-'}
            </td>
            <td className="py-2 pr-3 text-slate-700">
              {row.nextInstalmentDue
                ? `${formatDate(row.nextInstalmentDue.dueDateIso)} (${formatRs(row.nextInstalmentDue.amount, { compact: true })})`
                : '-'}
            </td>
            <td className="py-2 pr-3">
              <StatusChip
                tone={statusTone(row.status)}
                label={row.status}
                testId={`schools-receipts-status-${row.schoolId}`}
              />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function MobileCard({ row }: { row: SchoolReceiptRow }) {
  return (
    <Link
      href={`/schools/${row.schoolId}`}
      data-testid={`schools-receipts-card-${row.schoolId}`}
      className="block rounded-md border border-border bg-white p-3 transition-shadow hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-brand-navy">{row.schoolName}</div>
          <div className="mt-0.5 text-xs text-slate-600">
            {row.region} · {row.programmes.join(', ')}
          </div>
        </div>
        <StatusChip tone={statusTone(row.status)} label={row.status} />
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        <dt className="text-slate-500">Contract</dt>
        <dd className="text-right font-medium text-brand-navy">
          {formatRs(row.totalContractValue, { compact: true })}
        </dd>
        <dt className="text-slate-500">Received</dt>
        <dd className="text-right text-signal-ok">
          {formatRs(row.receivedAmount, { compact: true })}
        </dd>
        <dt className="text-slate-500">Outstanding</dt>
        <dd className="text-right text-amber-600">
          {formatRs(row.outstanding, { compact: true })}
        </dd>
        <dt className="text-slate-500">% received</dt>
        <dd className="text-right text-slate-700">
          {row.receivedPct.toFixed(1)}%
        </dd>
        <dt className="text-slate-500">Last payment</dt>
        <dd className="text-right text-slate-700">
          {row.lastPaymentDate ? formatDate(row.lastPaymentDate) : '-'}
        </dd>
        <dt className="text-slate-500">Next due</dt>
        <dd className="text-right text-slate-700">
          {row.nextInstalmentDue
            ? formatDate(row.nextInstalmentDue.dueDateIso)
            : '-'}
        </dd>
      </dl>
    </Link>
  )
}
