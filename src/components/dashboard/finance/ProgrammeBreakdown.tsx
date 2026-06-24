/*
 * ProgrammeBreakdown (Gate 4.95 Session 2, Row 6 of /dashboard/finance).
 *
 * One row per Programme (4 canonical values; VEX is rendered in its
 * own tile, not here). Horizontal bar scales by MOU count relative to
 * the largest programme in the filtered set. A filter footnote appears
 * when any filter chip / window is active.
 */

import { formatRs } from '@/lib/format'
import type { ProgrammeBreakdownRow } from '@/lib/dashboard/financeDashboardData'

interface Props {
  rows: ProgrammeBreakdownRow[]
  filterActive: boolean
}

const PROGRAMME_PILL_CLASS: Record<string, string> = {
  STEAM: 'bg-brand-teal/15 text-brand-navy',
  'Young Pioneers': 'bg-violet-100 text-violet-700',
  'Harvard HBPE': 'bg-amber-100 text-amber-700',
  Robotics: 'bg-indigo-100 text-indigo-700',
}

function programmePillClass(programme: string): string {
  return PROGRAMME_PILL_CLASS[programme] ?? 'bg-slate-100 text-slate-700'
}

export function ProgrammeBreakdown({ rows, filterActive }: Props) {
  return (
    <section
      data-testid="programme-breakdown"
      aria-labelledby="programme-breakdown-heading"
      className="rounded-lg border border-border bg-card p-4 sm:p-5"
    >
      <h2
        id="programme-breakdown-heading"
        className="font-heading text-base font-semibold text-brand-navy"
      >
        Programme breakdown
      </h2>
      <ul className="mt-4 flex flex-col gap-3">
        {rows.map((row) => (
          <li
            key={row.programme}
            data-testid={`programme-row-${row.programme}`}
            className="flex flex-col gap-1"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <span
                  className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${programmePillClass(row.programme)}`}
                  style={{ minWidth: '60px', justifyContent: 'center' }}
                >
                  {row.programme}
                </span>
                <span className="truncate text-sm text-slate-700">
                  {row.mouCount} MOUs · {row.studentsCount} students
                </span>
              </div>
              <span className="shrink-0 font-heading text-sm font-bold text-brand-navy">
                {formatRs(row.contractValue, { compact: true })}
              </span>
            </div>
            <div
              className="h-2 w-full overflow-hidden rounded-full bg-slate-100"
              role="img"
              aria-label={`${row.programme}: ${row.mouCount} MOUs`}
            >
              <div
                className="h-full rounded-full bg-brand-teal"
                style={{ width: `${row.barPct}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
      {filterActive && (
        <p className="mt-4 text-xs text-slate-500">
          Filtered view. Clear the filters above to see every programme.
        </p>
      )}
    </section>
  )
}
