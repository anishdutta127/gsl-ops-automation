/*
 * /reports/dispatch-performance (Gate 5A Step 1).
 *
 * Turnaround analytics over KitDispatch + a stalled dispatches list.
 * Ops-owned report; Finance/Sales department users hit redirect.
 */

import { redirect } from 'next/navigation'
import type { KitDispatch, MOU } from '@/lib/types'
import mousJson from '@/data/mous.json'
import kitDispatchesJson from '@/data/kit_dispatches.json'
import { getCurrentUser } from '@/lib/auth/session'
import { TopNav } from '@/components/ops/TopNav'
import { canAccessReport } from '@/lib/reports/access'
import {
  defaultFyOptions,
  fyOptionsFor,
  parseReportFilters,
  reportSubtitle,
  serializeReportFilters,
} from '@/lib/reports/filters'
import { computeDispatchPerformance } from '@/lib/reports/dispatchPerformance'
import { ReportFilterRail } from '@/components/reports/ReportFilterRail'
import { CsvExportLink } from '@/components/reports/CsvExportLink'

const allMous = mousJson as unknown as MOU[]
const allDispatches = kitDispatchesJson as unknown as KitDispatch[]

function fmtDays(n: number | null): string {
  return n === null ? 'n/a' : `${n.toFixed(1)} days`
}

export default async function DispatchPerformanceReport({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>
}) {
  const user = await getCurrentUser()
  if (!user) redirect('/login?next=%2Freports%2Fdispatch-performance')
  if (!canAccessReport(user, 'dispatch-performance')) {
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

  const result = computeDispatchPerformance({
    dispatches: allDispatches,
    mous: allMous,
    filters,
    now,
  })
  const qs = serializeReportFilters(filters)

  return (
    <>
      <TopNav currentPath="/reports" />
      <section data-testid="dispatch-performance-report">
        <div className="mx-auto flex max-w-screen-xl flex-col gap-6 px-4 py-6 sm:px-6">
          <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="font-heading text-2xl font-bold text-brand-navy">
                Dispatch performance
              </h1>
              <p className="mt-1 text-sm text-slate-600">{subtitle}</p>
            </div>
            <CsvExportLink slug="dispatch-performance" queryString={qs} />
          </header>

          <ReportFilterRail
            basePath="/reports/dispatch-performance"
            initialFilters={filters}
            fyOptions={fyOptions}
          />

          <section
            data-testid="dispatch-performance-headline"
            aria-label="Headline averages"
            className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
          >
            <Card
              label="Avg sign-to-dispatch"
              value={fmtDays(result.headline.avgDaysSignToDispatch)}
            />
            <Card
              label="Avg dispatch-to-delivered"
              value={fmtDays(result.headline.avgDaysDispatchToDelivered)}
            />
            <Card label="Dispatches" value={String(result.headline.dispatchCount)} />
            <Card label="Delivered" value={String(result.headline.deliveredCount)} />
          </section>

          <section
            data-testid="dispatch-performance-programme"
            aria-label="Programme-wise turnaround"
            className="rounded-lg border border-border bg-card p-4 sm:p-5"
          >
            <h2 className="font-heading text-base font-semibold text-brand-navy">
              Programme-wise turnaround
            </h2>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase text-slate-500">
                    <th className="pb-2 pr-3 font-medium">Programme</th>
                    <th className="pb-2 pr-3 font-medium">Count</th>
                    <th className="pb-2 pr-3 font-medium">
                      Avg sign-to-dispatch
                    </th>
                    <th className="pb-2 font-medium">
                      Avg dispatch-to-delivered
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {result.programmes.map((p) => (
                    <tr key={p.programme}>
                      <td className="py-2 pr-3 font-medium text-brand-navy">
                        {p.programme}
                      </td>
                      <td className="py-2 pr-3 text-slate-700">{p.count}</td>
                      <td className="py-2 pr-3 text-slate-700">
                        {fmtDays(p.avgDaysSignToDispatch)}
                      </td>
                      <td className="py-2 text-slate-700">
                        {fmtDays(p.avgDaysDispatchToDelivered)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section
            data-testid="dispatch-performance-stalled"
            aria-label="Stalled dispatches"
            className="rounded-lg border border-border bg-card p-4 sm:p-5"
          >
            <div className="flex items-center justify-between">
              <h2 className="font-heading text-base font-semibold text-brand-navy">
                Stalled dispatches (over 14 days)
              </h2>
              <span className="text-xs text-slate-600">
                {result.stalled.length} stalled
              </span>
            </div>
            {result.stalled.length === 0 ? (
              <p className="mt-3 text-sm text-slate-600">
                No stalled dispatches.
              </p>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase text-slate-500">
                      <th className="pb-2 pr-3 font-medium">School</th>
                      <th className="pb-2 pr-3 font-medium">MOU id</th>
                      <th className="pb-2 pr-3 font-medium">Status</th>
                      <th className="pb-2 pr-3 font-medium">Days at status</th>
                      <th className="pb-2 font-medium">Last activity</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {result.stalled.map((s) => (
                      <tr key={s.dispatchId}>
                        <td className="py-2 pr-3 font-medium text-brand-navy">
                          {s.schoolName}
                        </td>
                        <td className="py-2 pr-3 font-mono text-xs text-slate-600">
                          {s.mouId}
                        </td>
                        <td className="py-2 pr-3 text-slate-700">
                          {s.dispatchStatus}
                        </td>
                        <td className="py-2 pr-3 text-slate-700">
                          {s.daysAtStatus}
                        </td>
                        <td className="py-2 text-slate-700">
                          {s.lastActivity?.slice(0, 10) ?? '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </section>
    </>
  )
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 font-heading text-xl font-bold text-brand-navy">
        {value}
      </div>
    </div>
  )
}
