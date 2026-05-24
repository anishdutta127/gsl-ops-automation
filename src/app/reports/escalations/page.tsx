/*
 * /reports/escalations (Gate 5A Step 1).
 *
 * Department x severity matrix, resolution time stats, category
 * breakdown, and trending categories. Cross-functional report: every
 * active user with a Reports tab can read it.
 */

import { redirect } from 'next/navigation'
import { escalationRepo } from '@/lib/db/repos/escalation'
import { mouRepo } from '@/lib/db/repos/mou'
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
import { computeEscalationsReport } from '@/lib/reports/escalations'
import { ReportFilterRail } from '@/components/reports/ReportFilterRail'
import { CsvExportLink } from '@/components/reports/CsvExportLink'

const DEPT_COLS: ReadonlyArray<'sales' | 'ops' | 'finance'> = [
  'sales',
  'ops',
  'finance',
]

const SEV_ROWS: ReadonlyArray<'critical' | 'high' | 'medium' | 'low'> = [
  'critical',
  'high',
  'medium',
  'low',
]

function severityClass(sev: 'critical' | 'high' | 'medium' | 'low'): string {
  if (sev === 'critical') return 'text-signal-alert'
  if (sev === 'high') return 'text-signal-attention'
  return 'text-slate-700'
}

export default async function EscalationsReportPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>
}) {
  const user = await getCurrentUser()
  if (!user) redirect('/login?next=%2Freports%2Fescalations')
  if (!canAccessReport(user, 'escalations')) {
    redirect('/?notice=report-access-required')
  }

  const now = new Date()
  const filters = parseReportFilters(searchParams ?? {})
  const [allEscalations, allMous] = await Promise.all([
    escalationRepo.findAll(),
    mouRepo.findAll(),
  ])
  const fyOptions = defaultFyOptions(allMous, now)
  if (filters.fy && !fyOptions.includes(filters.fy)) {
    const widened = fyOptionsFor(allMous, now)
    fyOptions.splice(0, fyOptions.length, ...widened.slice(0, 5))
  }
  const subtitle = reportSubtitle(filters, now)

  const result = computeEscalationsReport({
    escalations: allEscalations,
    filters,
    now,
  })
  const qs = serializeReportFilters(filters)

  return (
    <>
      <TopNav currentPath="/reports" />
      <section data-testid="escalations-report">
        <div className="mx-auto flex max-w-screen-xl flex-col gap-6 px-4 py-6 sm:px-6">
          <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="font-heading text-2xl font-bold text-brand-navy">
                Escalations report
              </h1>
              <p className="mt-1 text-sm text-slate-600">{subtitle}</p>
            </div>
            <CsvExportLink slug="escalations" queryString={qs} />
          </header>

          <ReportFilterRail
            basePath="/reports/escalations"
            initialFilters={filters}
            fyOptions={fyOptions}
          />

          <section
            data-testid="escalations-matrix"
            aria-label="Open escalations by department and severity"
            className="rounded-lg border border-border bg-card p-4 sm:p-5"
          >
            <div className="flex items-center justify-between">
              <h2 className="font-heading text-base font-semibold text-brand-navy">
                Open by department and severity
              </h2>
              <span className="text-xs text-slate-600">
                {result.matrix.totalOpen} total
              </span>
            </div>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase text-slate-500">
                    <th className="pb-2 pr-3 font-medium">Severity</th>
                    {DEPT_COLS.map((d) => (
                      <th key={d} className="pb-2 pr-3 font-medium capitalize">
                        {d}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {SEV_ROWS.map((sev) => (
                    <tr key={sev}>
                      <td
                        className={
                          'py-2 pr-3 font-medium capitalize ' + severityClass(sev)
                        }
                      >
                        {sev}
                      </td>
                      {DEPT_COLS.map((dept) => (
                        <td key={dept} className="py-2 pr-3 text-slate-700">
                          {result.matrix.cells[dept][sev]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section
            data-testid="escalations-resolution"
            aria-label="Average resolution time"
            className="grid grid-cols-1 gap-3 sm:grid-cols-3"
          >
            <Card
              label="Avg resolution"
              value={
                result.resolution.avgDays !== null
                  ? `${result.resolution.avgDays.toFixed(1)} days`
                  : 'n/a'
              }
            />
            <Card
              label="Median resolution"
              value={
                result.resolution.medianDays !== null
                  ? `${result.resolution.medianDays.toFixed(1)} days`
                  : 'n/a'
              }
            />
            <Card
              label="Closed in window"
              value={String(result.resolution.count)}
            />
          </section>

          <section
            data-testid="escalations-categories"
            aria-label="Categories breakdown"
            className="rounded-lg border border-border bg-card p-4 sm:p-5"
          >
            <h2 className="font-heading text-base font-semibold text-brand-navy">
              Categories breakdown
            </h2>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase text-slate-500">
                    <th className="pb-2 pr-3 font-medium">Category</th>
                    <th className="pb-2 pr-3 font-medium">Open</th>
                    <th className="pb-2 font-medium">Closed in window</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {result.categories.map((c) => (
                    <tr key={c.category}>
                      <td className="py-2 pr-3 font-medium text-brand-navy">
                        {c.category}
                      </td>
                      <td className="py-2 pr-3 text-slate-700">{c.open}</td>
                      <td className="py-2 text-slate-700">{c.closed}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section
            data-testid="escalations-trending"
            aria-label="Trending categories"
            className="rounded-lg border border-border bg-card p-4 sm:p-5"
          >
            <h2 className="font-heading text-base font-semibold text-brand-navy">
              Trending categories
            </h2>
            {result.trending.length === 0 ? (
              <p className="mt-3 text-sm text-slate-600">
                No category is trending up versus the prior window.
              </p>
            ) : (
              <ul className="mt-3 space-y-2">
                {result.trending.map((t) => (
                  <li
                    key={t.category}
                    className="flex items-center justify-between gap-3 rounded border border-border bg-white p-2 text-sm"
                  >
                    <span className="font-medium text-brand-navy">
                      {t.category}
                    </span>
                    <span className="text-right">
                      <span className="block font-medium text-brand-navy">
                        {t.current} vs {t.prior}
                      </span>
                      <span className="block text-xs text-signal-attention">
                        {t.deltaPct !== null
                          ? `${t.deltaPct >= 0 ? '+' : ''}${t.deltaPct.toFixed(1)}%`
                          : 'new'}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
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
