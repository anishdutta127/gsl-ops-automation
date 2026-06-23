/*
 * YearPickerPills (Phase 3 quick-wins, 2026-05-19).
 *
 * Pill row for choosing the active FY filter on /mous. Server-
 * component compatible: each pill is a Link that toggles the
 * `?year=<fyTag>` URL param. The brief asked for a dropdown on
 * mobile (375px); the audit chose pills-that-wrap instead because the
 * dropdown variant needs client state and the production data has
 * three FYs (2024-25, 2025-26, 2026-27) which wrap cleanly even at
 * the narrowest viewport.
 *
 * Other URL params on the current request are forwarded verbatim
 * (status / programme / region / search / etc.) so existing chip
 * filters chain on top of the year filter without resetting.
 */

import Link from 'next/link'

interface YearPickerPillsProps {
  /** FYs that have at least one MOU in production data. Sorted desc. */
  years: string[]
  /** The active year tag, as resolved by the page. */
  activeYear: string
  /** All non-year query params on the current request, to preserve when toggling. */
  otherParams: Record<string, string | string[] | undefined>
  /** Base path the pills should navigate to. Defaults to `/mous`. */
  basePath?: string
}

function buildHref(
  basePath: string,
  fyTag: string,
  otherParams: Record<string, string | string[] | undefined>,
): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(otherParams)) {
    if (key === 'year') continue
    if (value === undefined) continue
    if (Array.isArray(value)) {
      for (const v of value) search.append(key, v)
    } else {
      search.set(key, value)
    }
  }
  search.set('year', fyTag)
  return `${basePath}?${search.toString()}`
}

export function YearPickerPills({
  years,
  activeYear,
  otherParams,
  basePath = '/mous',
}: YearPickerPillsProps) {
  if (years.length === 0) return null
  return (
    <nav
      aria-label="Financial year filter"
      data-testid="year-picker-pills"
      className="mx-auto flex max-w-screen-xl flex-wrap items-center gap-2 px-4 pt-3"
    >
      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Financial year
      </span>
      {years.map((fy) => {
        const isActive = fy === activeYear
        return (
          <Link
            key={fy}
            href={buildHref(basePath, fy, otherParams)}
            data-testid={`year-pill-${fy}`}
            data-active={isActive ? 'true' : 'false'}
            aria-current={isActive ? 'page' : undefined}
            className={
              isActive
                ? 'inline-flex min-h-9 items-center rounded-full bg-brand-navy px-3 py-1 text-xs font-medium text-white hover:bg-brand-navy/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal'
                : 'inline-flex min-h-9 items-center rounded-full border border-border bg-white px-3 py-1 text-xs text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal'
            }
          >
            FY {fy}
          </Link>
        )
      })}
      {/* "All years": clears the FY scope so MOUs from any year are findable
          (Task 2: the breakdown counts all years, the list defaulted to current). */}
      {(() => {
        const isActive = activeYear === 'all'
        return (
          <Link
            href={buildHref(basePath, 'all', otherParams)}
            data-testid="year-pill-all"
            data-active={isActive ? 'true' : 'false'}
            aria-current={isActive ? 'page' : undefined}
            className={
              isActive
                ? 'inline-flex min-h-9 items-center rounded-full bg-brand-navy px-3 py-1 text-xs font-medium text-white hover:bg-brand-navy/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal'
                : 'inline-flex min-h-9 items-center rounded-full border border-border bg-white px-3 py-1 text-xs text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal'
            }
          >
            All years
          </Link>
        )
      })()}
    </nav>
  )
}
