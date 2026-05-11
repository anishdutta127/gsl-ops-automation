'use client'

/*
 * ReportFilterRail (Gate 5A Step 1).
 *
 * Shared filter rail across the 5 report routes. URL-mirrored: Apply
 * pushes the serialised filter to the current route; Reset clears the
 * query string. Mobile-first stacking; Apply / Reset sit right-aligned
 * on >=sm.
 *
 * Department filter is included on every report for consistency even
 * when the report does not branch on it (per brief).
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  REPORT_DEPTS,
  type ReportDept,
  type ReportFilters,
} from '@/lib/reports/filters'

interface ReportFilterRailProps {
  basePath: string
  initialFilters: ReportFilters
  fyOptions: string[]
}

function serialize(f: ReportFilters): string {
  const params = new URLSearchParams()
  if (f.fy) params.set('fy', f.fy)
  if (f.dept !== 'All') params.set('dept', f.dept)
  if (f.from) params.set('from', f.from)
  if (f.to) params.set('to', f.to)
  return params.toString()
}

export function ReportFilterRail({
  basePath,
  initialFilters,
  fyOptions,
}: ReportFilterRailProps) {
  const router = useRouter()
  const [fy, setFy] = useState<string>(initialFilters.fy ?? '')
  const [dept, setDept] = useState<ReportDept>(initialFilters.dept)
  const [from, setFrom] = useState<string>(initialFilters.from ?? '')
  const [to, setTo] = useState<string>(initialFilters.to ?? '')

  function apply() {
    const qs = serialize({
      fy: fy || null,
      dept,
      from: from || null,
      to: to || null,
    })
    router.push(qs ? `${basePath}?${qs}` : basePath)
  }

  function reset() {
    setFy('')
    setDept('All')
    setFrom('')
    setTo('')
    router.push(basePath)
  }

  return (
    <section
      data-testid="report-filter-rail"
      aria-label="Report filters"
      className="rounded-lg border border-border bg-card p-4"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end sm:gap-3">
        <label className="flex flex-col gap-1 text-xs text-slate-600">
          <span>Fiscal year</span>
          <select
            value={fy}
            onChange={(e) => setFy(e.target.value)}
            className="min-h-11 rounded-md border border-border bg-white px-2 py-1 text-sm text-brand-navy focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal sm:min-h-0"
            data-testid="report-filter-fy"
          >
            <option value="">All FYs</option>
            {fyOptions.map((opt) => (
              <option key={opt} value={opt}>
                FY {opt}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate-600">
          <span>Department</span>
          <select
            value={dept}
            onChange={(e) => setDept(e.target.value as ReportDept)}
            className="min-h-11 rounded-md border border-border bg-white px-2 py-1 text-sm text-brand-navy focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal sm:min-h-0"
            data-testid="report-filter-dept"
          >
            {REPORT_DEPTS.map((d) => (
              <option key={d} value={d}>
                {d === 'All' ? 'All' : d.charAt(0).toUpperCase() + d.slice(1)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate-600">
          <span>From</span>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="min-h-11 rounded-md border border-border bg-white px-2 py-1 text-sm text-brand-navy focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal sm:min-h-0"
            data-testid="report-filter-from"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate-600">
          <span>To</span>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="min-h-11 rounded-md border border-border bg-white px-2 py-1 text-sm text-brand-navy focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal sm:min-h-0"
            data-testid="report-filter-to"
          />
        </label>
        <div className="flex gap-2 sm:ml-auto">
          <button
            type="button"
            onClick={apply}
            data-testid="report-filter-apply"
            className="inline-flex min-h-11 items-center rounded-md bg-brand-navy px-4 py-2 text-sm font-semibold text-white hover:bg-brand-navy/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal"
          >
            Apply
          </button>
          <button
            type="button"
            onClick={reset}
            data-testid="report-filter-reset"
            className="inline-flex min-h-11 items-center rounded-md border border-border bg-white px-4 py-2 text-sm font-medium text-brand-navy hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal"
          >
            Reset
          </button>
        </div>
      </div>
    </section>
  )
}
