/*
 * /reports/sales-performance (Gate 5A Step 1).
 *
 * Per-rep MOU performance: count + total contract value + average
 * MOU size + average payment lag in days. Top 5 + bottom 5 derive
 * from the same rollup. Conversion rate is intentionally deferred
 * until the Sales module ships.
 */

import { redirect } from 'next/navigation'
import type { MOU, Payment } from '@/lib/types'
import mousJson from '@/data/mous.json'
import paymentsJson from '@/data/payments.json'
import salesTeamJson from '@/data/sales_team.json'
import { getCurrentUser } from '@/lib/auth/session'
import { TopNav } from '@/components/ops/TopNav'
import { formatRs } from '@/lib/format'
import { canAccessReport } from '@/lib/reports/access'
import {
  defaultFyOptions,
  fyOptionsFor,
  parseReportFilters,
  reportSubtitle,
  serializeReportFilters,
} from '@/lib/reports/filters'
import { computeSalesPerformance } from '@/lib/reports/salesPerformance'
import { ReportFilterRail } from '@/components/reports/ReportFilterRail'
import { CsvExportLink } from '@/components/reports/CsvExportLink'

const allMous = mousJson as unknown as MOU[]
const allPayments = paymentsJson as unknown as Payment[]
const allSalesTeam = salesTeamJson as unknown as Array<{
  id: string
  name: string
  email?: string
  active?: boolean
}>

export default async function SalesPerformanceReport({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>
}) {
  const user = await getCurrentUser()
  if (!user) redirect('/login?next=%2Freports%2Fsales-performance')
  if (!canAccessReport(user, 'sales-performance')) {
    redirect('/?notice=report-access-required')
  }

  const now = new Date()
  const filters = parseReportFilters(searchParams ?? {})
  const fyOptions = defaultFyOptions(allMous, now)
  if (filters.fy && !fyOptions.includes(filters.fy)) {
    const widened = fyOptionsFor(allMous, now)
    fyOptions.splice(0, fyOptions.length, ...widened.slice(0, 5))
  }
  const subtitle = reportSubtitle(filters, now)

  const result = computeSalesPerformance({
    mous: allMous,
    payments: allPayments,
    salesTeam: allSalesTeam,
    filters,
    now,
  })
  const qs = serializeReportFilters(filters)

  return (
    <>
      <TopNav currentPath="/reports" />
      <section data-testid="sales-performance-report">
        <div className="mx-auto flex max-w-screen-xl flex-col gap-6 px-4 py-6 sm:px-6">
          <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="font-heading text-2xl font-bold text-brand-navy">
                Sales performance
              </h1>
              <p className="mt-1 text-sm text-slate-600">{subtitle}</p>
            </div>
            <CsvExportLink slug="sales-performance" queryString={qs} />
          </header>

          <ReportFilterRail
            basePath="/reports/sales-performance"
            initialFilters={filters}
            fyOptions={fyOptions}
          />

          <section
            data-testid="sales-performance-table"
            aria-label="Per-rep performance"
            className="rounded-lg border border-border bg-card p-4 sm:p-5"
          >
            <h2 className="font-heading text-base font-semibold text-brand-navy">
              Per-rep performance
            </h2>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase text-slate-500">
                    <th className="pb-2 pr-3 font-medium">Sales rep</th>
                    <th className="pb-2 pr-3 font-medium">MOUs signed</th>
                    <th className="pb-2 pr-3 font-medium">Total value</th>
                    <th className="pb-2 pr-3 font-medium">Avg MOU size</th>
                    <th className="pb-2 font-medium">Avg payment lag</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {result.rows.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-3 text-center text-slate-500">
                        No MOUs in the selected window.
                      </td>
                    </tr>
                  ) : (
                    result.rows.map((r) => (
                      <tr key={r.repId}>
                        <td className="py-2 pr-3 font-medium text-brand-navy">
                          {r.repName}
                        </td>
                        <td className="py-2 pr-3 text-slate-700">
                          {r.mouCount}
                        </td>
                        <td className="py-2 pr-3 text-slate-700">
                          {formatRs(r.totalContractValue)}
                        </td>
                        <td className="py-2 pr-3 text-slate-700">
                          {formatRs(Math.round(r.averageMouSize))}
                        </td>
                        <td className="py-2 text-slate-700">
                          {r.averagePaymentLagDays !== null
                            ? `${r.averagePaymentLagDays.toFixed(1)} days`
                            : 'n/a'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <LeaderboardSection
              testId="sales-performance-top5"
              title="Top 5 by signed value"
              rows={result.top5}
              emptyMessage="No reps with signed MOUs."
            />
            <LeaderboardSection
              testId="sales-performance-bottom5"
              title="Bottom 5 (active reps only)"
              rows={result.bottom5}
              emptyMessage="No reps with signed MOUs."
            />
          </div>

          <section
            data-testid="sales-performance-conversion-placeholder"
            className="rounded-lg border border-border bg-card p-4 text-sm text-slate-600"
          >
            Conversion rate available after Sales module ships.
          </section>
        </div>
      </section>
    </>
  )
}

interface LeaderboardSectionProps {
  testId: string
  title: string
  rows: Array<{
    repId: string
    repName: string
    mouCount: number
    totalContractValue: number
  }>
  emptyMessage: string
}

function LeaderboardSection({
  testId,
  title,
  rows,
  emptyMessage,
}: LeaderboardSectionProps) {
  return (
    <section
      data-testid={testId}
      className="rounded-lg border border-border bg-card p-4 sm:p-5"
    >
      <h2 className="font-heading text-base font-semibold text-brand-navy">
        {title}
      </h2>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">{emptyMessage}</p>
      ) : (
        <ol className="mt-3 space-y-2">
          {rows.map((r, i) => (
            <li
              key={r.repId}
              className="flex items-center justify-between gap-3 rounded border border-border bg-white p-2 text-sm"
            >
              <span className="flex items-center gap-2">
                <span className="size-6 shrink-0 rounded-full bg-brand-teal/10 text-center text-xs font-bold leading-6 text-brand-teal">
                  {i + 1}
                </span>
                <span className="font-medium text-brand-navy">{r.repName}</span>
              </span>
              <span className="text-right">
                <span className="block font-medium text-brand-navy">
                  {formatRs(r.totalContractValue)}
                </span>
                <span className="block text-xs text-slate-500">
                  {r.mouCount} MOU{r.mouCount === 1 ? '' : 's'}
                </span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
