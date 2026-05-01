/*
 * DashboardFilterRow (W4-I.5 Phase 2 commit 1).
 *
 * Programme chip row with All / STEAM / TinkRworks / Young Pioneers /
 * Harvard HBPE / VEX. Selected chip = navy fill + white text;
 * unselected = white card with subtle border. Apply Filters / Reset
 * buttons on the right.
 *
 * Reference layout uses Bootcamps + Events as mock data; the real
 * Programme enum (Anish W4-I.5 P2 decision) substitutes those with
 * the operationally-current programmes. Documenting the reference
 * mismatch here so future readers don't reintroduce mock chips.
 *
 * Form architecture: <form id="dashboard-filters"> hosts hidden
 * inputs that mirror the chip selection (the chip is a styled radio).
 * Header inputs (FY, fromDate, toDate) reference this form via
 * `form="dashboard-filters"` so a single Apply submit captures
 * everything. method="GET" so URL stays the source of truth and the
 * Server Component re-renders against the new searchParams.
 *
 * Reset = a sibling Link to the dashboard root with no params.
 */

import Link from 'next/link'
import type { Programme } from '@/lib/types'
import { PROGRAMME_OPTIONS } from '@/lib/dashboard/dashboardData'

export interface DashboardFilterRowProps {
  /** Active programme from URL (null = All). */
  activeProgramme: Programme | null
  /** Path the form posts to (defaults to '/dashboard'; P2C5 will swap to '/'). */
  basePath?: string
}

export function DashboardFilterRow({
  activeProgramme,
  basePath = '/dashboard',
}: DashboardFilterRowProps) {
  // Each chip is a radio input visually styled as a pill button. The
  // 'all' chip carries no programme value (so it submits as no
  // `programme` query param, which the parser treats as 'no filter').
  const chips: Array<{ key: string; label: string; value: '' | Programme }> = [
    { key: 'all', label: 'All Programmes', value: '' },
    ...PROGRAMME_OPTIONS.map((p) => ({ key: p, label: p, value: p as Programme })),
  ]

  return (
    <div
      className="border-b border-border bg-card"
      data-testid="dashboard-filters"
    >
      <div className="mx-auto max-w-screen-2xl px-4 py-3 sm:px-6">
        <form
          id="dashboard-filters"
          method="GET"
          action={basePath}
          className="flex flex-wrap items-center justify-between gap-3"
        >
          <fieldset className="flex flex-wrap items-center gap-2">
            <legend className="sr-only">Programme filter</legend>
            {chips.map((c) => {
              const checked = c.value === '' ? activeProgramme === null : activeProgramme === c.value
              return (
                <label
                  key={c.key}
                  className={
                    'inline-flex cursor-pointer items-center rounded-full border px-3 py-1.5 text-xs font-medium transition focus-within:ring-2 focus-within:ring-brand-navy '
                    + (checked
                      ? 'border-brand-navy bg-brand-navy text-white'
                      : 'border-border bg-card text-foreground hover:bg-muted')
                  }
                  data-testid={`dashboard-chip-${c.key}`}
                >
                  <input
                    type="radio"
                    name="programme"
                    value={c.value}
                    defaultChecked={checked}
                    className="sr-only"
                  />
                  {c.label}
                </label>
              )
            })}
          </fieldset>
          <div className="flex items-center gap-2">
            <button
              type="submit"
              className="inline-flex min-h-9 items-center rounded-md bg-brand-navy px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-navy/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
              data-testid="dashboard-apply"
            >
              Apply Filters
            </button>
            <Link
              href={basePath}
              className="inline-flex min-h-9 items-center rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
              data-testid="dashboard-reset"
            >
              Reset
            </Link>
          </div>
        </form>
      </div>
    </div>
  )
}
