'use client'

/*
 * OpsFilterBar (Gate 4.95 Session 3 Step 3).
 *
 * Secondary filter row mounted below the existing DashboardFilterRow
 * on /dashboard/ops. Hosts the three new augmentation dimensions: region
 * (with NE/SW super-region shortcuts), sales rep, and ops owner.
 *
 * Pattern mirrors FinanceFilterBar from Session 2: client component,
 * useRouter / useSearchParams for URL mirroring, local state for edits
 * with Apply + Reset. On Apply the new dimensions merge into the URL
 * alongside any existing dashboard filters (?fiscalYear=, ?programme=,
 * ?fromDate=, ?toDate=, ?products=); Reset clears only this bar's
 * dimensions so the existing filter chrome above is left intact.
 */

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  OPS_PRIMARY_REGIONS,
  type OpsRepOption,
} from '@/lib/dashboard/opsAugmentData'
import { SUPER_REGIONS, type SuperRegion } from '@/lib/regions'

interface OpsFilterBarProps {
  initialRegions: string[]
  initialSuperRegions: SuperRegion[]
  initialSalesRepIds: string[]
  initialOpsOwnerIds: string[]
  salesRepOptions: OpsRepOption[]
  opsOwnerOptions: OpsRepOption[]
}

function preserveOtherParams(
  existing: URLSearchParams,
  keysToOverride: string[],
): URLSearchParams {
  const out = new URLSearchParams()
  for (const [k, v] of Array.from(existing.entries())) {
    if (keysToOverride.includes(k)) continue
    out.append(k, v)
  }
  return out
}

export function OpsFilterBar({
  initialRegions,
  initialSuperRegions,
  initialSalesRepIds,
  initialOpsOwnerIds,
  salesRepOptions,
  opsOwnerOptions,
}: OpsFilterBarProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [regions, setRegions] = useState<string[]>(initialRegions)
  const [superRegions, setSuperRegions] = useState<SuperRegion[]>(initialSuperRegions)
  const [salesRepIds, setSalesRepIds] = useState<string[]>(initialSalesRepIds)
  const [opsOwnerIds, setOpsOwnerIds] = useState<string[]>(initialOpsOwnerIds)

  function toggleRegion(r: string) {
    setRegions((prev) => (prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]))
  }
  function toggleSuperRegion(s: SuperRegion) {
    setSuperRegions((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]))
  }

  function apply() {
    const existing = new URLSearchParams(
      searchParams ? Array.from(searchParams.entries()) : [],
    )
    const params = preserveOtherParams(existing, ['region', 'sr', 'rep', 'owner'])
    if (regions.length > 0) params.set('region', regions.join(','))
    if (superRegions.length > 0) params.set('sr', superRegions.join(','))
    if (salesRepIds.length > 0) params.set('rep', salesRepIds.join(','))
    if (opsOwnerIds.length > 0) params.set('owner', opsOwnerIds.join(','))
    const qs = params.toString()
    router.push(qs ? `/dashboard/ops?${qs}` : '/dashboard/ops')
  }

  function reset() {
    setRegions([])
    setSuperRegions([])
    setSalesRepIds([])
    setOpsOwnerIds([])
    const existing = new URLSearchParams(
      searchParams ? Array.from(searchParams.entries()) : [],
    )
    const params = preserveOtherParams(existing, ['region', 'sr', 'rep', 'owner'])
    const qs = params.toString()
    router.push(qs ? `/dashboard/ops?${qs}` : '/dashboard/ops')
  }

  return (
    <section
      data-testid="ops-augment-filter-bar"
      aria-label="Ops dashboard advanced filters"
      className="border-b border-border bg-card"
    >
      <div className="mx-auto flex max-w-screen-2xl flex-col gap-3 px-4 py-3 sm:px-6">
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
                data-testid={`ops-chip-super-${sr.key}`}
                className={
                  active
                    ? 'inline-flex min-h-9 items-center rounded-full bg-brand-navy px-3 py-1 text-xs font-medium text-white hover:bg-brand-navy/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal'
                    : 'inline-flex min-h-9 items-center rounded-full border border-border bg-white px-3 py-1 text-xs text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal'
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
                data-testid={`ops-chip-region-${r}`}
                className={
                  active
                    ? 'inline-flex min-h-9 items-center rounded-full bg-brand-navy px-3 py-1 text-xs font-medium text-white hover:bg-brand-navy/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal'
                    : 'inline-flex min-h-9 items-center rounded-full border border-border bg-white px-3 py-1 text-xs text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal'
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
              data-testid="ops-select-sales-rep"
              className="min-h-9 min-w-[14rem] rounded-md border border-input bg-card px-2 py-1 text-sm text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal"
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
              data-testid="ops-select-ops-owner"
              className="min-h-9 min-w-[14rem] rounded-md border border-input bg-card px-2 py-1 text-sm text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal"
              size={Math.min(4, Math.max(2, opsOwnerOptions.length))}
            >
              {opsOwnerOptions.map((o) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
          </label>
          <div className="ml-auto flex gap-2">
            <button
              type="button"
              onClick={apply}
              data-testid="ops-augment-apply"
              className="inline-flex min-h-9 items-center rounded-md bg-brand-navy px-4 py-2 text-xs font-semibold text-white hover:bg-brand-navy/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal"
            >
              Apply
            </button>
            <button
              type="button"
              onClick={reset}
              data-testid="ops-augment-reset"
              className="inline-flex min-h-9 items-center rounded-md border border-border bg-white px-4 py-2 text-xs font-medium text-brand-navy hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal"
            >
              Reset
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}

