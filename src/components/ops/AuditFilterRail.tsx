/*
 * AuditFilterRail (DESIGN.md "Surface 5 / Admin audit route / Filter rail").
 *
 * Server Component. URL-driven: each chip is a Link whose href toggles
 * that filter in the query string. No client-side state. Phase 1
 * trade-off: simpler hydration, fully server-rendered, every state
 * has a shareable URL.
 *
 * The user typeahead and free-text search are <form> submits that
 * post to /admin/audit with the relevant query param; same Server-
 * Component-only flow.
 */

import Link from 'next/link'
import type { ParsedFilters } from '@/lib/audit/urlFilters'
import { QUICK_FILTERS } from '@/lib/audit/urlFilters'
import { cn } from '@/lib/utils'

interface AuditFilterRailProps {
  filters: ParsedFilters
  knownEntities: string[]
  knownActions: string[]
}

const DAYS_PRESETS: Array<{ label: string; days: number | null; key: string }> = [
  { label: 'Last 24h', days: 1, key: '1' },
  { label: 'Last 7 days', days: 7, key: '7' },
  { label: 'Last 30 days', days: 30, key: '30' },
  { label: 'All', days: null, key: 'all' },
]

function buildHref(
  filters: ParsedFilters,
  patch: Partial<Record<string, string | null>>,
): string {
  const params = new URLSearchParams()

  function setOrSkip(key: string, value: string | null | undefined) {
    if (value === null) return
    if (value === undefined) return
    if (value === '') return
    params.set(key, value)
  }

  // Start from current state
  if (filters.quickFilter) setOrSkip('filter', filters.quickFilter)
  if (filters.entity.length > 0) setOrSkip('entity', filters.entity.join(','))
  if (filters.action.length > 0) setOrSkip('action', filters.action.join(','))
  if (filters.user) setOrSkip('user', filters.user)
  if (filters.search) setOrSkip('q', filters.search)
  if (filters.daysWindow !== null) setOrSkip('days', String(filters.daysWindow))
  else setOrSkip('days', 'all')
  if (filters.startDate) setOrSkip('start', filters.startDate)
  if (filters.endDate) setOrSkip('end', filters.endDate)

  // Apply patch (null = remove)
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) {
      params.delete(k)
    } else if (v !== undefined) {
      params.set(k, v)
    }
  }

  const qs = params.toString()
  return qs ? `/admin/audit?${qs}` : '/admin/audit'
}

function toggleListValue(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((x) => x !== value) : [...list, value]
}

export function AuditFilterRail({
  filters,
  knownEntities,
  knownActions,
}: AuditFilterRailProps) {
  return (
    <aside className="w-full shrink-0 border-b border-slate-200 bg-slate-50 p-4 sm:w-60 sm:border-b-0 sm:border-r">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--signal-neutral)]">
        Quick filters
      </h2>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {Object.keys(QUICK_FILTERS).map((id) => {
          const active = filters.quickFilter === id
          const href = active
            ? buildHref(filters, { filter: null })
            : buildHref(
                {
                  ...filters,
                  quickFilter: id,
                  entity: [],
                  action: [],
                  daysWindow: filters.daysWindow,
                },
                { filter: id, entity: null, action: null },
              )
          return (
            <Link
              key={id}
              href={href}
              className={cn(
                'rounded-full border px-2.5 py-1 text-xs font-medium',
                'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2',
                'focus-visible:outline-[var(--brand-navy)]',
                active
                  ? 'border-[var(--brand-teal)] bg-[var(--brand-teal)] text-[var(--brand-navy)]'
                  : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100',
              )}
            >
              {id}
            </Link>
          )
        })}
      </div>

      <h2 className="mt-4 text-xs font-semibold uppercase tracking-wider text-[var(--signal-neutral)]">
        Date range
      </h2>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {DAYS_PRESETS.map((preset) => {
          const active =
            preset.days === null ? filters.daysWindow === null : filters.daysWindow === preset.days
          const href = buildHref(filters, {
            days: preset.days === null ? 'all' : String(preset.days),
            start: null,
            end: null,
          })
          return (
            <Link
              key={preset.key}
              href={href}
              className={cn(
                'rounded-full border px-2.5 py-1 text-xs font-medium',
                'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2',
                'focus-visible:outline-[var(--brand-navy)]',
                active
                  ? 'border-[var(--brand-navy)] bg-[var(--brand-navy)] text-white'
                  : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100',
              )}
            >
              {preset.label}
            </Link>
          )
        })}
      </div>

      <h2 className="mt-4 text-xs font-semibold uppercase tracking-wider text-[var(--signal-neutral)]">
        Entity
      </h2>
      <ul className="mt-2 flex flex-wrap gap-1.5">
        {knownEntities.map((ent) => {
          const active = filters.entity.includes(ent)
          const next = toggleListValue(filters.entity, ent)
          const href = buildHref(filters, { entity: next.length > 0 ? next.join(',') : null })
          return (
            <li key={ent}>
              <Link
                href={href}
                aria-pressed={active}
                className={cn(
                  'rounded-md border px-2 py-0.5 text-xs',
                  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2',
                  'focus-visible:outline-[var(--brand-navy)]',
                  active
                    ? 'border-[var(--brand-navy)] bg-[var(--brand-navy)]/10 text-[var(--brand-navy)]'
                    : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100',
                )}
              >
                {ent}
              </Link>
            </li>
          )
        })}
      </ul>

      <h2 className="mt-4 text-xs font-semibold uppercase tracking-wider text-[var(--signal-neutral)]">
        Action
      </h2>
      <ul className="mt-2 flex flex-wrap gap-1.5">
        {knownActions.map((act) => {
          const active = filters.action.includes(act)
          const next = toggleListValue(filters.action, act)
          const href = buildHref(filters, { action: next.length > 0 ? next.join(',') : null })
          return (
            <li key={act}>
              <Link
                href={href}
                aria-pressed={active}
                className={cn(
                  'rounded-md border px-2 py-0.5 text-[11px] font-mono',
                  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2',
                  'focus-visible:outline-[var(--brand-navy)]',
                  active
                    ? 'border-[var(--brand-navy)] bg-[var(--brand-navy)]/10 text-[var(--brand-navy)]'
                    : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100',
                )}
              >
                {act}
              </Link>
            </li>
          )
        })}
      </ul>

      <h2 className="mt-4 text-xs font-semibold uppercase tracking-wider text-[var(--signal-neutral)]">
        User
      </h2>
      <form action="/admin/audit" method="get" className="mt-2">
        <PreserveFilters filters={filters} omit={['user']} />
        <label htmlFor="audit-user-input" className="sr-only">
          Filter by acting user id
        </label>
        <input
          id="audit-user-input"
          name="user"
          defaultValue={filters.user ?? ''}
          placeholder="user id (e.g., misba.m)"
          className="w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-navy)]"
        />
        <button
          type="submit"
          className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium hover:bg-slate-100"
        >
          Apply user filter
        </button>
      </form>

      <h2 className="mt-4 text-xs font-semibold uppercase tracking-wider text-[var(--signal-neutral)]">
        Search
      </h2>
      <form action="/admin/audit" method="get" className="mt-2">
        <PreserveFilters filters={filters} omit={['q']} />
        <label htmlFor="audit-search-input" className="sr-only">
          Free-text search across action, entity, notes
        </label>
        <input
          id="audit-search-input"
          name="q"
          defaultValue={filters.search ?? ''}
          placeholder="search action / entity / notes"
          className="w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-navy)]"
        />
        <button
          type="submit"
          className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium hover:bg-slate-100"
        >
          Search
        </button>
      </form>

      <Link
        href="/admin/audit"
        className="mt-4 block text-center text-xs font-medium text-[var(--brand-navy)] underline-offset-2 hover:underline"
      >
        Clear all filters
      </Link>
    </aside>
  )
}

function PreserveFilters({
  filters,
  omit,
}: {
  filters: ParsedFilters
  omit: string[]
}) {
  const inputs: Array<{ name: string; value: string }> = []
  if (filters.quickFilter && !omit.includes('filter')) {
    inputs.push({ name: 'filter', value: filters.quickFilter })
  }
  if (filters.entity.length > 0 && !omit.includes('entity')) {
    inputs.push({ name: 'entity', value: filters.entity.join(',') })
  }
  if (filters.action.length > 0 && !omit.includes('action')) {
    inputs.push({ name: 'action', value: filters.action.join(',') })
  }
  if (filters.user && !omit.includes('user')) {
    inputs.push({ name: 'user', value: filters.user })
  }
  if (filters.search && !omit.includes('q')) {
    inputs.push({ name: 'q', value: filters.search })
  }
  if (filters.daysWindow !== null && !omit.includes('days')) {
    inputs.push({ name: 'days', value: String(filters.daysWindow) })
  }
  if (filters.startDate && !omit.includes('start')) {
    inputs.push({ name: 'start', value: filters.startDate })
  }
  if (filters.endDate && !omit.includes('end')) {
    inputs.push({ name: 'end', value: filters.endDate })
  }
  return (
    <>
      {inputs.map((i) => (
        <input key={i.name} type="hidden" name={i.name} value={i.value} />
      ))}
    </>
  )
}
