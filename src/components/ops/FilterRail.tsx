/*
 * FilterRail.
 *
 * Generic URL-driven chip filter rail. Used by /mous, /schools,
 * /escalations list pages. Each dimension renders as a section with
 * toggleable chips; each chip is a Link whose href adds/removes that
 * value from the dimension's comma-separated query param. No
 * client-side state; refresh preserves filter state via URL.
 *
 * Optional free-text search field is a separate <form> submitting to
 * the same path with the q= param updated; hidden inputs preserve
 * other dimensions through the submit.
 *
 * Phase B decision (kept-separate-from-AuditFilterRail): the audit
 * route's filter rail has two text-input forms (User typeahead +
 * free-text search) PLUS its chip dimensions, AND a custom
 * ParsedFilters URL builder that supports date-range presets and
 * a quick-filter preset registry. None of those generalize cleanly
 * to a chip-only model without bloating this component's API. The
 * chip-rendering code IS shape-similar; both stay tested.
 */

import Link from 'next/link'
import { cn } from '@/lib/utils'

export interface FilterDimensionOption {
  value: string
  label: string
  count?: number
}

export interface FilterDimension {
  key: string                 // query param name
  label: string               // section heading
  options: FilterDimensionOption[]
}

interface FilterRailProps {
  basePath: string
  dimensions: FilterDimension[]
  active: Record<string, string[]>      // dimension.key -> selected values
  search?: { value: string; placeholder: string; paramName?: string }
}

function buildHref(
  basePath: string,
  active: Record<string, string[]>,
  search: string | undefined,
  searchParamName: string,
  patch: { key: string; value: string | null } | null,
): string {
  const next: Record<string, string[]> = { ...active }

  if (patch) {
    const cur = next[patch.key] ?? []
    if (patch.value === null) {
      next[patch.key] = []
    } else if (cur.includes(patch.value)) {
      next[patch.key] = cur.filter((v) => v !== patch.value)
    } else {
      next[patch.key] = [...cur, patch.value]
    }
  }

  const params = new URLSearchParams()
  for (const [k, vs] of Object.entries(next)) {
    if (vs.length > 0) params.set(k, vs.join(','))
  }
  if (search && search.length > 0) params.set(searchParamName, search)

  const qs = params.toString()
  return qs ? `${basePath}?${qs}` : basePath
}

export function FilterRail({
  basePath,
  dimensions,
  active,
  search,
}: FilterRailProps) {
  const searchParamName = search?.paramName ?? 'q'
  const hasAnyFilter =
    Object.values(active).some((v) => v.length > 0) ||
    (search?.value && search.value.length > 0)

  return (
    <aside
      aria-label="Filters"
      className="w-full shrink-0 border-b border-border bg-muted/20 p-4 sm:w-60 sm:border-b-0 sm:border-r"
    >
      {dimensions.map((dim) => (
        <section key={dim.key} className="mb-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {dim.label}
          </h3>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {dim.options.map((opt) => {
              const isActive = (active[dim.key] ?? []).includes(opt.value)
              const href = buildHref(
                basePath,
                active,
                search?.value,
                searchParamName,
                { key: dim.key, value: opt.value },
              )
              return (
                <li key={opt.value}>
                  <Link
                    href={href}
                    aria-pressed={isActive}
                    className={cn(
                      'inline-flex min-h-9 items-center rounded-full border px-3 py-1 text-xs font-medium',
                      'focus:outline-none focus:ring-2 focus:ring-brand-navy',
                      isActive
                        ? 'border-brand-navy bg-brand-navy text-white'
                        : 'border-border bg-card text-foreground hover:bg-muted',
                    )}
                  >
                    {opt.label}
                    {typeof opt.count === 'number' ? (
                      <span className="ml-1 text-[11px] text-muted-foreground">({opt.count})</span>
                    ) : null}
                  </Link>
                </li>
              )
            })}
          </ul>
        </section>
      ))}

      {search ? (
        <section className="mb-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Search
          </h3>
          <form action={basePath} method="get" className="mt-2 space-y-1">
            {Object.entries(active).map(([k, vs]) =>
              vs.length > 0 ? (
                <input key={k} type="hidden" name={k} value={vs.join(',')} />
              ) : null,
            )}
            <label htmlFor={`${basePath}-search`} className="sr-only">{search.placeholder}</label>
            <input
              id={`${basePath}-search`}
              name={searchParamName}
              defaultValue={search.value}
              placeholder={search.placeholder}
              className="w-full rounded-md border border-border bg-card px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-brand-navy"
            />
            <button
              type="submit"
              className="w-full rounded-md border border-border bg-card px-2 py-1 text-xs font-medium hover:bg-muted focus:outline-none focus:ring-2 focus:ring-brand-navy"
            >
              Search
            </button>
          </form>
        </section>
      ) : null}

      {hasAnyFilter ? (
        <Link
          href={basePath}
          className="block text-center text-xs font-medium text-brand-navy underline-offset-2 hover:underline focus:outline-none focus:ring-2 focus:ring-brand-navy"
        >
          Clear all filters
        </Link>
      ) : null}
    </aside>
  )
}
