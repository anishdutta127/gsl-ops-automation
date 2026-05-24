/*
 * /reports/payment-aging (Gate 5A Step 1).
 *
 * Outstanding amounts by age bucket, schools overdue more than 30
 * days, unpaid PIs, and the top 10 overdue accounts. Finance-owned
 * report; Sales/Ops department users hit redirect.
 */

import { redirect } from 'next/navigation'
import { mouRepo } from '@/lib/db/repos/mou'
import { paymentRepo } from '@/lib/db/repos/payment'
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
import { computePaymentAging } from '@/lib/reports/paymentAging'
import { ReportFilterRail } from '@/components/reports/ReportFilterRail'
import { CsvExportLink } from '@/components/reports/CsvExportLink'

export default async function PaymentAgingReport({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>
}) {
  const user = await getCurrentUser()
  if (!user) redirect('/login?next=%2Freports%2Fpayment-aging')
  if (!canAccessReport(user, 'payment-aging')) {
    redirect('/?notice=report-access-required')
  }

  const now = new Date()
  const filters = parseReportFilters(searchParams ?? {})
  const [allMous, allPayments] = await Promise.all([
    mouRepo.findAll(),
    paymentRepo.findAll(),
  ])
  const fyOptions = defaultFyOptions(allMous, now)
  if (filters.fy && !fyOptions.includes(filters.fy)) {
    const widened = fyOptionsFor(allMous, now)
    fyOptions.splice(0, fyOptions.length, ...widened.slice(0, 5))
  }
  const subtitle = reportSubtitle(filters, now)

  const result = computePaymentAging({
    payments: allPayments,
    mous: allMous,
    filters,
    now,
  })
  const qs = serializeReportFilters(filters)

  return (
    <>
      <TopNav currentPath="/reports" />
      <section data-testid="payment-aging-report">
        <div className="mx-auto flex max-w-screen-xl flex-col gap-6 px-4 py-6 sm:px-6">
          <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="font-heading text-2xl font-bold text-brand-navy">
                Payment aging
              </h1>
              <p className="mt-1 text-sm text-slate-600">{subtitle}</p>
            </div>
            <CsvExportLink slug="payment-aging" queryString={qs} />
          </header>

          <ReportFilterRail
            basePath="/reports/payment-aging"
            initialFilters={filters}
            fyOptions={fyOptions}
          />

          <section
            data-testid="payment-aging-buckets"
            aria-label="Aging buckets"
            className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
          >
            {result.buckets.map((b) => (
              <div
                key={b.label}
                className="rounded-lg border border-border bg-card p-4"
                data-testid={`payment-aging-bucket-${b.label.replace(/[^a-z0-9]+/gi, '-')}`}
              >
                <div className="text-xs text-slate-500">{b.label}</div>
                <div className="mt-1 font-heading text-xl font-bold text-brand-navy">
                  {formatRs(b.totalAmount)}
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  {b.count} item{b.count === 1 ? '' : 's'}
                </div>
              </div>
            ))}
          </section>

          <section
            data-testid="payment-aging-overdue-schools"
            aria-label="Schools overdue more than 30 days"
            className="rounded-lg border border-border bg-card p-4 sm:p-5"
          >
            <h2 className="font-heading text-base font-semibold text-brand-navy">
              Schools overdue more than 30 days
            </h2>
            {result.overdueSchools.length === 0 ? (
              <p className="mt-3 text-sm text-slate-600">
                No schools overdue beyond 30 days.
              </p>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase text-slate-500">
                      <th className="pb-2 pr-3 font-medium">School</th>
                      <th className="pb-2 pr-3 font-medium">MOU id</th>
                      <th className="pb-2 pr-3 font-medium">Total overdue</th>
                      <th className="pb-2 pr-3 font-medium">Max days</th>
                      <th className="pb-2 font-medium">Overdue count</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {result.overdueSchools.map((s) => (
                      <tr key={`${s.schoolName}-${s.mouId}`}>
                        <td className="py-2 pr-3 font-medium text-brand-navy">
                          {s.schoolName}
                        </td>
                        <td className="py-2 pr-3 font-mono text-xs text-slate-600">
                          {s.mouId}
                        </td>
                        <td className="py-2 pr-3 text-slate-700">
                          {formatRs(s.totalOverdue)}
                        </td>
                        <td className="py-2 pr-3 text-slate-700">
                          {s.maxDaysOverdue}
                        </td>
                        <td className="py-2 text-slate-700">{s.overdueCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section
            data-testid="payment-aging-unpaid-pis"
            aria-label="PIs issued but unpaid"
            className="rounded-lg border border-border bg-card p-4 sm:p-5"
          >
            <h2 className="font-heading text-base font-semibold text-brand-navy">
              PIs issued but unpaid
            </h2>
            {result.unpaidPis.length === 0 ? (
              <p className="mt-3 text-sm text-slate-600">
                No unpaid PIs in the selected window.
              </p>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase text-slate-500">
                      <th className="pb-2 pr-3 font-medium">PI number</th>
                      <th className="pb-2 pr-3 font-medium">School</th>
                      <th className="pb-2 pr-3 font-medium">MOU id</th>
                      <th className="pb-2 pr-3 font-medium">Instalment</th>
                      <th className="pb-2 pr-3 font-medium">Days since PI</th>
                      <th className="pb-2 font-medium">Expected amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {result.unpaidPis.map((p) => (
                      <tr key={p.paymentId}>
                        <td className="py-2 pr-3 font-mono text-xs text-slate-700">
                          {p.piNumber ?? '-'}
                        </td>
                        <td className="py-2 pr-3 font-medium text-brand-navy">
                          {p.schoolName}
                        </td>
                        <td className="py-2 pr-3 font-mono text-xs text-slate-600">
                          {p.mouId}
                        </td>
                        <td className="py-2 pr-3 text-slate-700">
                          {p.instalmentLabel}
                        </td>
                        <td className="py-2 pr-3 text-slate-700">
                          {p.daysSincePi}
                        </td>
                        <td className="py-2 text-slate-700">
                          {formatRs(p.expectedAmount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section
            data-testid="payment-aging-top10"
            aria-label="Top 10 overdue accounts"
            className="rounded-lg border border-border bg-card p-4 sm:p-5"
          >
            <h2 className="font-heading text-base font-semibold text-brand-navy">
              Top 10 overdue accounts
            </h2>
            {result.topTen.length === 0 ? (
              <p className="mt-3 text-sm text-slate-600">
                No overdue accounts.
              </p>
            ) : (
              <ol className="mt-3 space-y-2">
                {result.topTen.map((s, i) => (
                  <li
                    key={`${s.schoolName}-${s.mouId}`}
                    className="flex items-center justify-between gap-3 rounded border border-border bg-white p-2 text-sm"
                  >
                    <span className="flex items-center gap-2">
                      <span className="size-6 shrink-0 rounded-full bg-signal-alert/10 text-center text-xs font-bold leading-6 text-signal-alert">
                        {i + 1}
                      </span>
                      <span>
                        <span className="block font-medium text-brand-navy">
                          {s.schoolName}
                        </span>
                        <span className="block font-mono text-xs text-slate-500">
                          {s.mouId}
                        </span>
                      </span>
                    </span>
                    <span className="text-right">
                      <span className="block font-medium text-brand-navy">
                        {formatRs(s.totalOverdue)}
                      </span>
                      <span className="block text-xs text-slate-500">
                        max {s.maxDaysOverdue}d
                      </span>
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      </section>
    </>
  )
}
