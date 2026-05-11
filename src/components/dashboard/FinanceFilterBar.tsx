'use client'

/*
 * FinanceFilterBar (Gate 4.95 Session 2).
 *
 * URL-mirrored filter bar for /dashboard/finance. Local state mirrors
 * the initial filters; Apply serialises into search params and pushes
 * to the URL so deep links + back-forward navigation are deterministic.
 *
 * Layout:
 *   Row 1: FY dropdown + from/to date inputs + Apply + Reset.
 *   Row 2: Programme chips (5 values incl. VEX).
 *   Row 3: Sales channel chips (4 values).
 *
 * Mobile: chip rows wrap; Row 1 stacks the actions when there's not
 * enough horizontal space.
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  FINANCE_FILTER_PROGRAMMES,
  FINANCE_FILTER_SALES_CHANNELS,
  type FinanceFilterProgramme,
  type FinanceFilters,
} from '@/lib/dashboard/financeDashboardData'
import type { SalesChannel } from '@/lib/mouSystem/types'

interface FinanceFilterBarProps {
  initialFilters: FinanceFilters
  fyOptions: string[]
}

function serializeFilters(f: FinanceFilters): string {
  const params = new URLSearchParams()
  if (f.programmes.length > 0) params.set('p', f.programmes.join(','))
  if (f.salesChannels.length > 0) params.set('sc', f.salesChannels.join(','))
  if (f.fy) params.set('fy', f.fy)
  if (f.from) params.set('from', f.from)
  if (f.to) params.set('to', f.to)
  return params.toString()
}

export function FinanceFilterBar({
  initialFilters,
  fyOptions,
}: FinanceFilterBarProps) {
  const router = useRouter()
  const [programmes, setProgrammes] = useState<FinanceFilterProgramme[]>(
    initialFilters.programmes,
  )
  const [salesChannels, setSalesChannels] = useState<SalesChannel[]>(
    initialFilters.salesChannels,
  )
  const [fy, setFy] = useState<string>(initialFilters.fy ?? '')
  const [from, setFrom] = useState<string>(initialFilters.from ?? '')
  const [to, setTo] = useState<string>(initialFilters.to ?? '')

  function toggleProgramme(p: FinanceFilterProgramme) {
    setProgrammes((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p],
    )
  }

  function toggleSalesChannel(s: SalesChannel) {
    setSalesChannels((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s],
    )
  }

  function apply() {
    const qs = serializeFilters({
      programmes,
      salesChannels,
      fy: fy || null,
      from: from || null,
      to: to || null,
    })
    router.push(qs ? `/dashboard/finance?${qs}` : '/dashboard/finance')
  }

  function reset() {
    setProgrammes([])
    setSalesChannels([])
    setFy('')
    setFrom('')
    setTo('')
    router.push('/dashboard/finance')
  }

  return (
    <section
      data-testid="finance-filter-bar"
      aria-label="Finance dashboard filters"
      className="rounded-lg border border-border bg-card p-4"
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:gap-3">
          <label className="flex flex-col gap-1 text-xs text-slate-600">
            <span>Fiscal year</span>
            <select
              value={fy}
              onChange={(e) => setFy(e.target.value)}
              className="min-h-11 rounded-md border border-border bg-white px-2 py-1 text-sm text-brand-navy focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal sm:min-h-0"
              data-testid="filter-fy"
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
            <span>From</span>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="min-h-11 rounded-md border border-border bg-white px-2 py-1 text-sm text-brand-navy focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal sm:min-h-0"
              data-testid="filter-from"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-600">
            <span>To</span>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="min-h-11 rounded-md border border-border bg-white px-2 py-1 text-sm text-brand-navy focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal sm:min-h-0"
              data-testid="filter-to"
            />
          </label>
          <div className="flex gap-2 sm:ml-auto">
            <button
              type="button"
              onClick={apply}
              data-testid="filter-apply"
              className="inline-flex min-h-11 items-center rounded-md bg-brand-navy px-4 py-2 text-sm font-semibold text-white hover:bg-brand-navy/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal"
            >
              Apply
            </button>
            <button
              type="button"
              onClick={reset}
              data-testid="filter-reset"
              className="inline-flex min-h-11 items-center rounded-md border border-border bg-white px-4 py-2 text-sm font-medium text-brand-navy hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal"
            >
              Reset
            </button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="self-center text-[11px] uppercase tracking-wide text-slate-500">
            Programme
          </span>
          {FINANCE_FILTER_PROGRAMMES.map((p) => {
            const active = programmes.includes(p)
            return (
              <button
                key={p}
                type="button"
                onClick={() => toggleProgramme(p)}
                aria-pressed={active}
                data-testid={`filter-chip-programme-${p}`}
                className={
                  active
                    ? 'inline-flex min-h-11 items-center rounded-full bg-brand-navy px-3 py-1 text-xs font-medium text-white hover:bg-brand-navy/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal sm:min-h-0'
                    : 'inline-flex min-h-11 items-center rounded-full border border-border bg-white px-3 py-1 text-xs text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal sm:min-h-0'
                }
              >
                {p}
              </button>
            )
          })}
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="self-center text-[11px] uppercase tracking-wide text-slate-500">
            Sales channel
          </span>
          {FINANCE_FILTER_SALES_CHANNELS.map((s) => {
            const active = salesChannels.includes(s)
            return (
              <button
                key={s}
                type="button"
                onClick={() => toggleSalesChannel(s)}
                aria-pressed={active}
                data-testid={`filter-chip-channel-${s}`}
                className={
                  active
                    ? 'inline-flex min-h-11 items-center rounded-full bg-brand-navy px-3 py-1 text-xs font-medium text-white hover:bg-brand-navy/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal sm:min-h-0'
                    : 'inline-flex min-h-11 items-center rounded-full border border-border bg-white px-3 py-1 text-xs text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal sm:min-h-0'
                }
              >
                {s}
              </button>
            )
          })}
        </div>
      </div>
    </section>
  )
}
