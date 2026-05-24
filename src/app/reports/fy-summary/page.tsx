/*
 * /reports/fy-summary (Gate 5A Step 1).
 *
 * Headline FY numbers, programme-wise breakdown, 12-month receipts,
 * and YoY comparison. Cross-functional report: every active user
 * with a Reports tab can read it.
 */

import { redirect } from 'next/navigation'
import { mouRepo } from '@/lib/db/repos/mou'
import { paymentRepo } from '@/lib/db/repos/payment'
import { kitDispatchRepo } from '@/lib/db/repos/kitDispatch'
import { schoolRepo } from '@/lib/db/repos/school'
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
import { computeFySummary } from '@/lib/reports/fySummary'
import { ReportFilterRail } from '@/components/reports/ReportFilterRail'
import { CsvExportLink } from '@/components/reports/CsvExportLink'

function pct(n: number): string {
  return `${n.toFixed(1)}%`
}

export default async function FySummaryReport({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>
}) {
  const user = await getCurrentUser()
  if (!user) redirect('/login?next=%2Freports%2Ffy-summary')
  if (!canAccessReport(user, 'fy-summary')) {
    redirect('/?notice=report-access-required')
  }

  const now = new Date()
  const filters = parseReportFilters(searchParams ?? {})
  const [allMous, allPayments, allDispatches, allSchools] = await Promise.all([
    mouRepo.findAll(),
    paymentRepo.findAll(),
    kitDispatchRepo.findAll(),
    schoolRepo.findAll(),
  ])
  const fyOptions = defaultFyOptions(allMous, now)
  // Fallback so the dropdown still shows historical FY data even when
  // pruned. defaultFyOptions is current+prior 2; if filters.fy is older
  // than that, surface it too.
  if (filters.fy && !fyOptions.includes(filters.fy)) {
    const widened = fyOptionsFor(allMous, now)
    fyOptions.splice(0, fyOptions.length, ...widened.slice(0, 5))
  }
  const subtitle = reportSubtitle(filters, now)

  const result = computeFySummary({
    mous: allMous,
    payments: allPayments,
    dispatches: allDispatches,
    schools: allSchools,
    filters,
    now,
  })
  const qs = serializeReportFilters(filters)
  const maxMonthly = result.monthlyReceipts.reduce(
    (m, p) => Math.max(m, p.amount),
    0,
  )

  return (
    <>
      <TopNav currentPath="/reports" />
      <section data-testid="fy-summary-report">
        <div className="mx-auto flex max-w-screen-xl flex-col gap-6 px-4 py-6 sm:px-6">
          <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="font-heading text-2xl font-bold text-brand-navy">
                FY summary
              </h1>
              <p className="mt-1 text-sm text-slate-600">{subtitle}</p>
            </div>
            <CsvExportLink slug="fy-summary" queryString={qs} />
          </header>

          <ReportFilterRail
            basePath="/reports/fy-summary"
            initialFilters={filters}
            fyOptions={fyOptions}
          />

          <section
            data-testid="fy-summary-headline"
            aria-label="Headline numbers"
            className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
          >
            <HeadlineCard
              label="Signed contract value"
              value={formatRs(result.headline.signedContractValue)}
            />
            <HeadlineCard
              label="Received"
              value={formatRs(result.headline.received)}
            />
            <HeadlineCard
              label="Outstanding"
              value={formatRs(result.headline.outstanding)}
            />
            <HeadlineCard
              label="MOUs / schools / dispatches"
              value={`${result.headline.mouCount} / ${result.headline.schoolCount} / ${result.headline.dispatchCount}`}
            />
          </section>

          <section
            data-testid="fy-summary-programme-breakdown"
            aria-label="Programme breakdown"
            className="rounded-lg border border-border bg-card p-4 sm:p-5"
          >
            <h2 className="font-heading text-base font-semibold text-brand-navy">
              Programme-wise breakdown
            </h2>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase text-slate-500">
                    <th className="pb-2 pr-3 font-medium">Programme</th>
                    <th className="pb-2 pr-3 font-medium">MOUs</th>
                    <th className="pb-2 pr-3 font-medium">Students</th>
                    <th className="pb-2 pr-3 font-medium">Contract value</th>
                    <th className="pb-2 pr-3 font-medium">Received</th>
                    <th className="pb-2 pr-3 font-medium">Outstanding</th>
                    <th className="pb-2 font-medium">% Received</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {result.programmes.map((p) => (
                    <tr key={p.programme}>
                      <td className="py-2 pr-3 font-medium text-brand-navy">
                        {p.programme}
                      </td>
                      <td className="py-2 pr-3 text-slate-700">{p.mouCount}</td>
                      <td className="py-2 pr-3 text-slate-700">
                        {p.studentsActual}
                      </td>
                      <td className="py-2 pr-3 text-slate-700">
                        {formatRs(p.contractValue)}
                      </td>
                      <td className="py-2 pr-3 text-slate-700">
                        {formatRs(p.received)}
                      </td>
                      <td className="py-2 pr-3 text-slate-700">
                        {formatRs(p.outstanding)}
                      </td>
                      <td className="py-2 text-slate-700">{pct(p.receivedPct)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section
            data-testid="fy-summary-monthly-receipts"
            aria-label="Monthly receipts"
            className="rounded-lg border border-border bg-card p-4 sm:p-5"
          >
            <h2 className="font-heading text-base font-semibold text-brand-navy">
              Monthly receipts (last 12 months)
            </h2>
            <ul className="mt-3 space-y-1.5">
              {result.monthlyReceipts.map((m) => {
                const width =
                  maxMonthly > 0 ? Math.round((m.amount / maxMonthly) * 100) : 0
                return (
                  <li
                    key={m.month}
                    className="flex items-center gap-3 text-xs"
                  >
                    <span className="w-16 shrink-0 font-mono text-slate-600">
                      {m.month}
                    </span>
                    <span className="flex h-3 flex-1 overflow-hidden rounded bg-slate-100">
                      <span
                        className="h-full bg-brand-teal"
                        style={{ width: `${width}%` }}
                      />
                    </span>
                    <span className="w-28 shrink-0 text-right font-medium text-brand-navy">
                      {formatRs(m.amount, { compact: true })}
                    </span>
                  </li>
                )
              })}
            </ul>
          </section>

          {result.yoy.priorFy && result.yoy.priorSigned > 0 ? (
            <section
              data-testid="fy-summary-yoy"
              aria-label="Year on year"
              className="rounded-lg border border-border bg-card p-4 sm:p-5"
            >
              <h2 className="font-heading text-base font-semibold text-brand-navy">
                Year on year
              </h2>
              <dl className="mt-2 grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
                <div>
                  <dt className="text-xs text-slate-500">
                    Prior FY {result.yoy.priorFy}
                  </dt>
                  <dd className="font-medium text-brand-navy">
                    {formatRs(result.yoy.priorSigned)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">
                    Current FY {result.effectiveFy ?? '-'}
                  </dt>
                  <dd className="font-medium text-brand-navy">
                    {formatRs(result.yoy.currentSigned)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Delta</dt>
                  <dd className="font-medium text-brand-navy">
                    {result.yoy.deltaPct !== null
                      ? `${result.yoy.deltaPct.toFixed(1)}%`
                      : 'n/a'}
                  </dd>
                </div>
              </dl>
            </section>
          ) : null}
        </div>
      </section>
    </>
  )
}

function HeadlineCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 font-heading text-xl font-bold text-brand-navy">
        {value}
      </div>
    </div>
  )
}
