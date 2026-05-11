/*
 * OpsProgrammeBreakdown (Gate 4.95 Session 3 Step 3).
 *
 * One row per programme (incl. VEX). Each row shows MOU count + active
 * students total + active dispatch value + a relative horizontal bar.
 * Whole row is a Link so a click drills into the programme's MOU list
 * (or the dispatch view for VEX, which lives outside the Programme enum).
 */

import Link from 'next/link'
import { formatRs } from '@/lib/format'
import type { OpsProgrammeBreakdownRow } from '@/lib/dashboard/opsAugmentData'

interface OpsProgrammeBreakdownProps {
  rows: OpsProgrammeBreakdownRow[]
  filterActive: boolean
}

export function OpsProgrammeBreakdown({ rows, filterActive }: OpsProgrammeBreakdownProps) {
  return (
    <section
      data-testid="ops-programme-breakdown"
      aria-labelledby="ops-programme-breakdown-heading"
      className="rounded-lg border border-border bg-card p-4 sm:p-5"
    >
      <header className="flex items-center justify-between">
        <h2
          id="ops-programme-breakdown-heading"
          className="font-heading text-base font-semibold text-brand-navy"
        >
          Programme breakdown
        </h2>
        <span className="text-xs text-slate-500">
          Click a row to drill into the registry
        </span>
      </header>
      <ul className="mt-3 flex flex-col divide-y divide-border">
        {rows.map((r) => (
          <li key={r.programme}>
            <Link
              href={r.href}
              data-testid={`ops-programme-row-${r.programme}`}
              className="grid grid-cols-[7rem_1fr_auto] items-center gap-3 py-2 text-sm hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal"
            >
              <span className="inline-flex w-fit items-center rounded-full bg-brand-navy/10 px-2 py-0.5 text-[11px] font-medium text-brand-navy">
                {r.programme}
              </span>
              <div className="flex flex-col gap-1">
                <span className="text-xs text-slate-700">
                  {r.mouCount} {r.mouCount === 1 ? 'MOU' : 'MOUs'} · {r.studentsCount} students
                </span>
                <div
                  className="h-2 rounded-full bg-slate-100"
                  aria-hidden
                >
                  <div
                    className="h-full rounded-full bg-brand-teal"
                    style={{ width: r.barPct + '%' }}
                  />
                </div>
              </div>
              <span className="font-medium text-brand-navy">
                {formatRs(r.activeDispatchValue)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {filterActive ? (
        <p className="mt-3 text-xs text-slate-500" data-testid="ops-programme-filter-footnote">
          Filtered view. Clear the filters above to see every programme.
        </p>
      ) : null}
    </section>
  )
}
