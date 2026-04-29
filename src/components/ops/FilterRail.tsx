/*
 * FilterRail.
 *
 * Generic URL-driven chip filter rail. Used by /mous, /schools,
 * /escalations, /sales-pipeline list pages and the /kanban home.
 * Each dimension renders as a section with toggleable chips; each
 * chip is a Link whose href adds/removes that value from the
 * dimension's comma-separated query param. No client-side state;
 * refresh preserves filter state via URL.
 *
 * Multi-select shape: the chip-toggle pattern is multi-select by
 * default; clicking accumulates values into a comma-separated
 * URL list (?region=North,East). applyDimensionFilters does
 * AND-across-dimensions, OR-within-dimension. Phase X kept this
 * pattern over a Notion-style chip-with-dropdown-checkbox UX for
 * three reasons: (1) chip-toggle is already in production on four
 * pages, switching would force a coordinated migration; (2) toggling
 * a chip is one click, dropdown+checkbox+apply is three; (3) the
 * URL state surfaces every selection visibly without an extra
 * "open the dropdown to see what's selected" step. Notion-style
 * stays in BACKLOG.md as a v2 trigger if the chip-toggle pattern
 * starts to feel limiting under real use.
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
 *
 * Phase X super-region shortcuts: each dimension can supply an
 * optional `shortcuts` row that renders ABOVE the chips. A shortcut
 * carries a list of primary values (e.g. NE -> [North, East]).
 * Click-behaviour replaces the dimension's selection with those
 * values exactly (not toggle-add); click again to clear. Used for
 * Ameet's NE / SW super-region toggle on Region across kanban,
 * /mous, /schools, /sales-pipeline.
 */

import Link from 'next/link'
import { cn } from '@/lib/utils'

export interface FilterDimensionOption {
  value: string
  label: string
  count?: number
}

export interface FilterDimensionShortcut {
  /** Stable identifier (used for testid + key). */
  key: string
  label: string
  /** Primary dimension values this shortcut maps to. */
  values: readonly string[]
}

export interface FilterDimension {
  key: string                 // query param name
  label: string               // section heading
  options: FilterDimensionOption[]
  /** Optional super-set buttons rendered above the chip list. */
  shortcuts?: readonly FilterDimensionShortcut[]
}

interface FilterRailProps {
  basePath: string
  dimensions: FilterDimension[]
  active: Record<string, string[]>      // dimension.key -> selected values
  search?: { value: string; placeholder: string; paramName?: string }
}

type Patch =
  | { kind: 'toggle'; key: string; value: string }
  | { kind: 'set'; key: string; values: readonly string[] }
  | { kind: 'clear-key'; key: string }
  | null

function buildHref(
  basePath: string,
  active: Record<string, string[]>,
  search: string | undefined,
  searchParamName: string,
  patch: Patch,
): string {
  const next: Record<string, string[]> = { ...active }

  if (patch) {
    if (patch.kind === 'toggle') {
      const cur = next[patch.key] ?? []
      if (cur.includes(patch.value)) {
        next[patch.key] = cur.filter((v) => v !== patch.value)
      } else {
        next[patch.key] = [...cur, patch.value]
      }
    } else if (patch.kind === 'set') {
      next[patch.key] = [...patch.values]
    } else if (patch.kind === 'clear-key') {
      next[patch.key] = []
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

function shortcutIsActive(shortcut: FilterDimensionShortcut, current: readonly string[]): boolean {
  if (current.length !== shortcut.values.length) return false
  for (const v of shortcut.values) {
    if (!current.includes(v)) return false
  }
  return true
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
      {dimensions.map((dim) => {
        const current = active[dim.key] ?? []
        return (
          <section key={dim.key} className="mb-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {dim.label}
            </h3>
            {dim.shortcuts && dim.shortcuts.length > 0 ? (
              <ul
                className="mt-2 flex flex-wrap gap-1.5"
                data-testid={`filter-shortcuts-${dim.key}`}
              >
                {dim.shortcuts.map((sc) => {
                  const isActive = shortcutIsActive(sc, current)
                  const href = buildHref(
                    basePath,
                    active,
                    search?.value,
                    searchParamName,
                    isActive
                      ? { kind: 'clear-key', key: dim.key }
                      : { kind: 'set', key: dim.key, values: sc.values },
                  )
                  return (
                    <li key={sc.key}>
                      <Link
                        href={href}
                        aria-pressed={isActive}
                        data-testid={`filter-shortcut-${dim.key}-${sc.key}`}
                        className={cn(
                          'inline-flex min-h-9 items-center rounded-md border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide',
                          'focus:outline-none focus:ring-2 focus:ring-brand-navy',
                          isActive
                            ? 'border-brand-teal bg-brand-teal/15 text-brand-navy'
                            : 'border-dashed border-border bg-card text-muted-foreground hover:bg-muted',
                        )}
                      >
                        {sc.label}
                      </Link>
                    </li>
                  )
                })}
              </ul>
            ) : null}
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {dim.options.map((opt) => {
                const isActive = current.includes(opt.value)
                const href = buildHref(
                  basePath,
                  active,
                  search?.value,
                  searchParamName,
                  { kind: 'toggle', key: dim.key, value: opt.value },
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
        )
      })}

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
