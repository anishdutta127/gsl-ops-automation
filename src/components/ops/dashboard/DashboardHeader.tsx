/*
 * DashboardHeader (W4-I.5 Phase 2 commit 1).
 *
 * Title + subtitle on the left; today's date + Financial Year selector
 * + From / To date pickers on the right. The whole header is a single
 * <form method="GET"> so the right-side controls submit current
 * dashboard filters back to the URL on Apply (the filter row hosts the
 * Apply / Reset buttons; the header inputs share their <form> via
 * matching `form="dashboard-filters"` attribute on the inputs).
 *
 * Reference layout: top of the dashboard, ahead of the filter chip row.
 * Visual: large heading + small muted subtitle (left), three labelled
 * input groups stacked vertically (right). FY dropdown carries the
 * existing academicYear values; date pickers default to whatever the
 * URL passed (or to current FY span on first load; handled by the
 * caller passing `defaultFromDate` / `defaultToDate`).
 */

import type { ReactNode } from 'react'

export interface DashboardHeaderProps {
  title: string
  subtitle: string
  todayLabel: string
  fiscalYearOptions: ReadonlyArray<string>
  /** Current selected FY from URL ('all' or e.g. '2026-27'). */
  fiscalYear: string
  fromDate: string
  toDate: string
}

const FIELD_LABEL_CLASS = 'text-[10px] font-semibold uppercase tracking-wider text-muted-foreground'
const INPUT_CLASS = 'mt-0.5 block min-h-9 rounded-md border border-input bg-card px-2 py-1 text-sm text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy'

export function DashboardHeader({
  title,
  subtitle,
  todayLabel,
  fiscalYearOptions,
  fiscalYear,
  fromDate,
  toDate,
}: DashboardHeaderProps): ReactNode {
  return (
    <header
      className="border-b border-border bg-card"
      data-testid="dashboard-header"
    >
      <div className="mx-auto max-w-screen-2xl px-4 py-5 sm:px-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Operations Workspace
            </p>
            <h1 className="mt-0.5 font-heading text-2xl font-semibold text-brand-navy sm:text-3xl">
              {title}
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{subtitle}</p>
          </div>

          {/* Top-right controls. The selects + date inputs share the
              `form="dashboard-filters"` attribute so they submit with
              the programme chip + Apply button hosted in the filter
              row below. */}
          <div className="flex flex-col gap-3 text-xs sm:items-end">
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col">
                <span className={FIELD_LABEL_CLASS}>Financial Year</span>
                <select
                  name="fiscalYear"
                  form="dashboard-filters"
                  defaultValue={fiscalYear}
                  className={INPUT_CLASS}
                  data-testid="dashboard-fy"
                >
                  <option value="all">All FYs</option>
                  {fiscalYearOptions.map((y) => (
                    <option key={y} value={y}>{`FY ${y}`}</option>
                  ))}
                </select>
              </label>
              <div className="flex flex-col">
                <span className={FIELD_LABEL_CLASS}>Today</span>
                <span
                  className="mt-0.5 inline-flex min-h-9 items-center rounded-md border border-transparent px-1 py-1 text-sm font-medium text-foreground"
                  data-testid="dashboard-today"
                >
                  {todayLabel}
                </span>
              </div>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col">
                <span className={FIELD_LABEL_CLASS}>From Date</span>
                <input
                  type="date"
                  name="fromDate"
                  form="dashboard-filters"
                  defaultValue={fromDate}
                  className={INPUT_CLASS}
                  data-testid="dashboard-from-date"
                />
              </label>
              <label className="flex flex-col">
                <span className={FIELD_LABEL_CLASS}>To Date</span>
                <input
                  type="date"
                  name="toDate"
                  form="dashboard-filters"
                  defaultValue={toDate}
                  className={INPUT_CLASS}
                  data-testid="dashboard-to-date"
                />
              </label>
            </div>
          </div>
        </div>
      </div>
    </header>
  )
}
