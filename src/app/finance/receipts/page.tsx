/*
 * /finance/receipts (Gate 4.95 Session 4).
 *
 * Drilldown from the Finance dashboard's Amount Receipt Summary
 * "Open drilldown" link. Instalment-level receipt status with aging
 * buckets and sort options. Row click drills to the per-MOU
 * installments page.
 */

import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { MOU, Payment } from '@/lib/types'
import mousJson from '@/data/mous.json'
import paymentsJson from '@/data/payments.json'
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
  computeReceipts,
  isReceiptSortKey,
  type AgingBucket,
  type ReceiptRow,
  type ReceiptSortKey,
  type ReceiptStatus,
} from '@/lib/finance/receiptsData'

const allMous = mousJson as unknown as MOU[]
const allPayments = paymentsJson as unknown as Payment[]

const SORT_LABEL: Record<ReceiptSortKey, string> = {
  'due-asc': 'Due date (earliest first)',
  'due-desc': 'Due date (latest first)',
  'balance-desc': 'Balance (high to low)',
  'school-asc': 'School (A to Z)',
}

const SORT_KEYS: ReceiptSortKey[] = [
  'due-asc',
  'due-desc',
  'balance-desc',
  'school-asc',
]

const AGING_TITLE: Record<AgingBucket, string> = {
  today: 'Due today',
  '1-3': '1 to 3 days overdue',
  '3-7': '3 to 7 days',
  '7-30': '7 to 30 days',
  '30+': '30+ days',
}

const AGING_ORDER: AgingBucket[] = ['today', '1-3', '3-7', '7-30', '30+']

function statusTone(s: ReceiptStatus): StatusChipTone {
  switch (s) {
    case 'Paid':
      return 'ok'
    case 'Partial':
      return 'attention'
    case 'Overdue':
      return 'alert'
    case 'Pending':
    default:
      return 'neutral'
  }
}

export default async function FinanceReceiptsPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>
}) {
  const user = await getCurrentUser()
  if (!user) redirect('/login?next=%2Ffinance%2Freceipts')
  if (!canAccessFinance(user)) redirect('/?notice=finance-access-required')

  const now = new Date()
  const filters = parseFinanceFilters(searchParams ?? {})
  const fyOptions = fyOptionsList(allMous, now)

  const sortRaw =
    typeof searchParams?.sort === 'string' ? searchParams.sort : null
  const sortBy: ReceiptSortKey = isReceiptSortKey(sortRaw) ? sortRaw : 'due-asc'

  const { rows, aging } = computeReceipts({
    mous: allMous,
    payments: allPayments,
    filters,
    now,
    sortBy,
  })

  return (
    <>
      <TopNav currentPath="/dashboard/finance" />
      <div data-testid="finance-receipts">
        <PageHeader
          title="Receipts"
          subtitle="Instalment-level receipt status."
          breadcrumb={[
            { label: 'Dashboard', href: '/' },
            { label: 'Finance', href: '/dashboard/finance' },
            { label: 'Receipts' },
          ]}
        />

        <div className="mx-auto flex max-w-screen-xl flex-col gap-6 px-4 py-6 sm:px-6">
          <FinanceFilterBar initialFilters={filters} fyOptions={fyOptions} />

          <AgingSummaryTiles aging={aging} />

          <SortSelector currentSort={sortBy} />

          {rows.length === 0 ? (
            <section
              data-testid="receipts-empty"
              className="rounded-lg border border-border bg-card p-6 text-center text-sm text-slate-600"
            >
              No instalments match the current filters.
            </section>
          ) : (
            <section
              data-testid="receipts-table"
              aria-labelledby="receipts-heading"
              className="rounded-lg border border-border bg-card p-4 sm:p-5"
            >
              <h2 id="receipts-heading" className="sr-only">
                Receipts table
              </h2>
              <div className="hidden md:block">
                <DesktopTable rows={rows} />
              </div>
              <div className="flex flex-col gap-3 md:hidden">
                {rows.map((row) => (
                  <MobileCard key={row.paymentId} row={row} />
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </>
  )
}

function AgingSummaryTiles({
  aging,
}: {
  aging: { total: number; byBucket: Record<AgingBucket, { count: number; amount: number }> }
}) {
  return (
    <section
      data-testid="receipts-aging"
      aria-label="Aging summary"
      className="grid grid-cols-2 gap-3 sm:grid-cols-5 sm:gap-4"
    >
      {AGING_ORDER.map((bucket) => {
        const slot = aging.byBucket[bucket]
        const tone =
          bucket === 'today'
            ? 'text-slate-700'
            : bucket === '1-3'
              ? 'text-amber-600'
              : bucket === '3-7'
                ? 'text-amber-700'
                : 'text-signal-alert'
        return (
          <div
            key={bucket}
            data-testid={`receipts-aging-${bucket}`}
            className="rounded-lg border border-border bg-card p-3"
          >
            <div className="text-[11px] uppercase tracking-wide text-slate-600">
              {AGING_TITLE[bucket]}
            </div>
            <div
              className={`mt-1 font-heading text-xl font-bold ${tone}`}
            >
              {slot.count}
            </div>
            <div className="mt-1 text-xs text-slate-500">
              {formatRs(slot.amount, { compact: true })}
            </div>
          </div>
        )
      })}
    </section>
  )
}

function SortSelector({ currentSort }: { currentSort: ReceiptSortKey }) {
  return (
    <form
      method="get"
      action="/finance/receipts"
      data-testid="receipts-sort-form"
      className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-end"
    >
      <label className="flex flex-col gap-1 text-xs text-slate-600">
        <span>Sort by</span>
        <select
          name="sort"
          defaultValue={currentSort}
          data-testid="receipts-sort"
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

function rowHref(row: ReceiptRow): string {
  return `/mous/${row.mouId}/installments`
}

function DesktopTable({ rows }: { rows: ReceiptRow[] }) {
  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-slate-600">
          <th className="py-2 pr-3">School + instalment</th>
          <th className="py-2 pr-3 text-right">Expected</th>
          <th className="py-2 pr-3 text-right">Received</th>
          <th className="py-2 pr-3 text-right">Balance</th>
          <th className="py-2 pr-3">Due date</th>
          <th className="py-2 pr-3">Received date</th>
          <th className="py-2 pr-3">Status</th>
          <th className="py-2 pr-3">PI number</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr
            key={row.paymentId}
            data-testid={`receipts-row-${row.paymentId}`}
            className="border-b border-border last:border-b-0 hover:bg-slate-50"
          >
            <td className="py-2 pr-3">
              <Link
                href={rowHref(row)}
                className="font-medium text-brand-navy hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal"
              >
                {row.schoolName}
              </Link>
              <div className="text-xs text-slate-500">
                {row.mouId} · {row.instalmentLabel}
              </div>
            </td>
            <td className="py-2 pr-3 text-right font-medium text-brand-navy">
              {formatRs(row.expectedAmount, { compact: true })}
            </td>
            <td className="py-2 pr-3 text-right text-signal-ok">
              {formatRs(row.receivedAmount, { compact: true })}
            </td>
            <td className="py-2 pr-3 text-right text-amber-600">
              {formatRs(row.balance, { compact: true })}
            </td>
            <td className="py-2 pr-3 text-slate-700">
              {row.dueDateIso ? formatDate(row.dueDateIso) : '-'}
            </td>
            <td className="py-2 pr-3 text-slate-700">
              {row.receivedDate ? formatDate(row.receivedDate) : '-'}
            </td>
            <td className="py-2 pr-3">
              <StatusChip
                tone={statusTone(row.status)}
                label={row.status}
                testId={`receipts-status-${row.paymentId}`}
              />
            </td>
            <td className="py-2 pr-3 text-xs text-slate-700">
              {row.piNumber ?? '-'}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function MobileCard({ row }: { row: ReceiptRow }) {
  return (
    <Link
      href={rowHref(row)}
      data-testid={`receipts-card-${row.paymentId}`}
      className="block rounded-md border border-border bg-white p-3 transition-shadow hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-brand-navy">{row.schoolName}</div>
          <div className="mt-0.5 text-xs text-slate-600">
            {row.mouId} · {row.instalmentLabel}
          </div>
        </div>
        <StatusChip tone={statusTone(row.status)} label={row.status} />
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        <dt className="text-slate-500">Expected</dt>
        <dd className="text-right font-medium text-brand-navy">
          {formatRs(row.expectedAmount, { compact: true })}
        </dd>
        <dt className="text-slate-500">Received</dt>
        <dd className="text-right text-signal-ok">
          {formatRs(row.receivedAmount, { compact: true })}
        </dd>
        <dt className="text-slate-500">Balance</dt>
        <dd className="text-right text-amber-600">
          {formatRs(row.balance, { compact: true })}
        </dd>
        <dt className="text-slate-500">Due</dt>
        <dd className="text-right text-slate-700">
          {row.dueDateIso ? formatDate(row.dueDateIso) : '-'}
        </dd>
        <dt className="text-slate-500">Received</dt>
        <dd className="text-right text-slate-700">
          {row.receivedDate ? formatDate(row.receivedDate) : '-'}
        </dd>
        <dt className="text-slate-500">PI</dt>
        <dd className="text-right text-slate-700">{row.piNumber ?? '-'}</dd>
      </dl>
    </Link>
  )
}
