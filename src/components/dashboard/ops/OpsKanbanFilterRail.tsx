'use client'

/*
 * OpsKanbanFilterRail (Gate 4.95 Session 3 Step 6).
 *
 * Client-side filter rail for /kanban?view=operations. Hosts the Kanban's
 * own filter dimensions: programme chips, region chips (with NE / SW
 * super-region shortcuts), sales rep + ops owner multi-selects, and
 * from / to date inputs. URL-mirrored via router.push so deep links
 * and back-forward navigation are deterministic.
 *
 * Mirrors the OpsFilterBar pattern from Session 3 Step 3 but folds in
 * programme + date dimensions specific to this page; the Kanban does
 * not share the dashboard's existing fiscalYear / Apply chrome.
 */

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import type { Programme } from '@/lib/types'
import {
  OPS_PRIMARY_REGIONS,
  type OpsRepOption,
} from '@/lib/dashboard/opsAugmentData'
import { SUPER_REGIONS, type SuperRegion } from '@/lib/regions'

const PROGRAMME_OPTIONS: ReadonlyArray<Programme> = [
  'STEAM',
  'Young Pioneers',
  'Harvard HBPE',
  'Robotics',
]

interface OpsKanbanFilterRailProps {
  initialProgrammes: Programme[]
  initialRegions: string[]
  initialSuperRegions: SuperRegion[]
  initialSalesRepIds: string[]
  initialOpsOwnerIds: string[]
  initialFromDate: string | null
  initialToDate: string | null
  salesRepOptions: OpsRepOption[]
  opsOwnerOptions: OpsRepOption[]
}

export function OpsKanbanFilterRail({
  initialProgrammes,
  initialRegions,
  initialSuperRegions,
  initialSalesRepIds,
  initialOpsOwnerIds,
  initialFromDate,
  initialToDate,
  salesRepOptions,
  opsOwnerOptions,
}: OpsKanbanFilterRailProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [programmes, setProgrammes] = useState<Programme[]>(initialProgrammes)
  const [regions, setRegions] = useState<string[]>(initialRegions)
  const [superRegions, setSuperRegions] = useState<SuperRegion[]>(initialSuperRegions)
  const [salesRepIds, setSalesRepIds] = useState<string[]>(initialSalesRepIds)
  const [opsOwnerIds, setOpsOwnerIds] = useState<string[]>(initialOpsOwnerIds)
  const [fromDate, setFromDate] = useState<string>(initialFromDate ?? '')
  const [toDate, setToDate] = useState<string>(initialToDate ?? '')

  function toggleProgramme(p: Programme) {
    setProgrammes((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]))
  }
  function toggleRegion(r: string) {
    setRegions((prev) => (prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]))
  }
  function toggleSuperRegion(s: SuperRegion) {
    setSuperRegions((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]))
  }

  function buildHref(): string {
    const params = new URLSearchParams()
    params.set('view', 'operations')
    if (programmes.length > 0) params.set('p', programmes.join(','))
    if (regions.length > 0) params.set('region', regions.join(','))
    if (superRegions.length > 0) params.set('sr', superRegions.join(','))
    if (salesRepIds.length > 0) params.set('rep', salesRepIds.join(','))
    if (opsOwnerIds.length > 0) params.set('owner', opsOwnerIds.join(','))
    if (fromDate) params.set('from', fromDate)
    if (toDate) params.set('to', toDate)
    return `/kanban?${params.toString()}`
  }

  function apply() {
    router.push(buildHref())
  }

  function reset() {
    setProgrammes([])
    setRegions([])
    setSuperRegions([])
    setSalesRepIds([])
    setOpsOwnerIds([])
    setFromDate('')
    setToDate('')
    router.push('/kanban?view=operations')
  }

  // Suppress unused warning when no extra search params surface; the
  // hook call itself is required for client-side navigation behaviour.
  void searchParams

  return (
    <section
      data-testid="ops-kanban-filter-rail"
      aria-label="Workflow Kanban filters"
      className="rounded-lg border border-border bg-card p-4 sm:p-5"
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Programme
          </span>
          {PROGRAMME_OPTIONS.map((p) => {
            const active = programmes.includes(p)
            return (
              <button
                key={p}
                type="button"
                onClick={() => toggleProgramme(p)}
                aria-pressed={active}
                data-testid={`kanban-chip-programme-${p}`}
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

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Region
          </span>
          {SUPER_REGIONS.map((sr) => {
            const active = superRegions.includes(sr.key)
            return (
              <button
                key={sr.key}
                type="button"
                onClick={() => toggleSuperRegion(sr.key)}
                aria-pressed={active}
                data-testid={`kanban-chip-super-${sr.key}`}
                className={
                  active
                    ? 'inline-flex min-h-11 items-center rounded-full bg-brand-navy px-3 py-1 text-xs font-medium text-white hover:bg-brand-navy/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal sm:min-h-0'
                    : 'inline-flex min-h-11 items-center rounded-full border border-border bg-white px-3 py-1 text-xs text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal sm:min-h-0'
                }
              >
                {sr.label}
              </button>
            )
          })}
          <span aria-hidden className="text-slate-400">|</span>
          {OPS_PRIMARY_REGIONS.map((r) => {
            const active = regions.includes(r)
            return (
              <button
                key={r}
                type="button"
                onClick={() => toggleRegion(r)}
                aria-pressed={active}
                data-testid={`kanban-chip-region-${r}`}
                className={
                  active
                    ? 'inline-flex min-h-11 items-center rounded-full bg-brand-navy px-3 py-1 text-xs font-medium text-white hover:bg-brand-navy/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal sm:min-h-0'
                    : 'inline-flex min-h-11 items-center rounded-full border border-border bg-white px-3 py-1 text-xs text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal sm:min-h-0'
                }
              >
                {r}
              </button>
            )
          })}
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-4">
          <label className="flex flex-col gap-1 text-xs text-slate-600">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Sales rep
            </span>
            <select
              multiple
              value={salesRepIds}
              onChange={(e) =>
                setSalesRepIds(
                  Array.from(e.target.selectedOptions).map((o) => o.value),
                )
              }
              data-testid="kanban-select-sales-rep"
              className="min-h-11 min-w-[14rem] rounded-md border border-input bg-card px-2 py-1 text-sm text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal sm:min-h-0"
              size={Math.min(4, Math.max(2, salesRepOptions.length))}
            >
              {salesRepOptions.map((o) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-600">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Ops owner
            </span>
            <select
              multiple
              value={opsOwnerIds}
              onChange={(e) =>
                setOpsOwnerIds(
                  Array.from(e.target.selectedOptions).map((o) => o.value),
                )
              }
              data-testid="kanban-select-ops-owner"
              className="min-h-11 min-w-[14rem] rounded-md border border-input bg-card px-2 py-1 text-sm text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal sm:min-h-0"
              size={Math.min(4, Math.max(2, opsOwnerOptions.length))}
            >
              {opsOwnerOptions.map((o) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-600">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              From
            </span>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              data-testid="kanban-input-from"
              className="min-h-11 rounded-md border border-border bg-white px-2 py-1 text-sm text-brand-navy focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal sm:min-h-0"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-600">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              To
            </span>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              data-testid="kanban-input-to"
              className="min-h-11 rounded-md border border-border bg-white px-2 py-1 text-sm text-brand-navy focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal sm:min-h-0"
            />
          </label>
          <div className="ml-auto flex gap-2">
            <button
              type="button"
              onClick={apply}
              data-testid="kanban-filter-apply"
              className="inline-flex min-h-11 items-center rounded-md bg-brand-navy px-4 py-2 text-xs font-semibold text-white hover:bg-brand-navy/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal"
            >
              Apply
            </button>
            <button
              type="button"
              onClick={reset}
              data-testid="kanban-filter-reset"
              className="inline-flex min-h-11 items-center rounded-md border border-border bg-white px-4 py-2 text-xs font-medium text-brand-navy hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal"
            >
              Reset
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}
