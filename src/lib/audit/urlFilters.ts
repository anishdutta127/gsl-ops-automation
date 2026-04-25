/*
 * URL query-string parsing + filter application for /admin/audit.
 *
 * URL params (all optional; combine with AND):
 *   entity=A,B,C        list of entity types
 *   action=A,B,C        list of audit actions
 *   user=<userId>       single acting-user id
 *   q=<freetext>        case-insensitive substring search across
 *                       action, entityLabel, entityId, notes
 *   days=N              time window: only entries within last N days
 *                       Special values: "all" (no window). Default
 *                       when nothing provided: 7.
 *   start=<iso>         custom range start (YYYY-MM-DD or ISO)
 *   end=<iso>           custom range end
 *   filter=<id>         quick-filter shortcut; expands to a preset
 *                       (entity + action + days). Direct params
 *                       above OVERRIDE the quick-filter expansion.
 *   cursor=<iso>        pagination: only entries with timestamp <
 *                       cursor (older than the last shown row)
 *
 * URL filters can NEVER widen the user's role-allowed set: callers
 * apply canViewAuditEntry first, then applyFilters here. The
 * filters narrow only.
 */

import type { AuditRowData } from './aggregate'

export const QUICK_FILTERS: Record<
  string,
  { entity?: string[]; action?: string[]; days?: number }
> = {
  'communication-copy': {
    entity: ['Communication'],
    action: ['whatsapp-draft-copied'],
    days: 7,
  },
  'p2-overrides': {
    entity: ['Dispatch'],
    action: ['p2-override', 'p2-override-acknowledged'],
    days: 30,
  },
  'cc-rule-toggles': {
    entity: ['CcRule'],
    action: ['cc-rule-toggle-on', 'cc-rule-toggle-off', 'cc-rule-created'],
  },
  'import-auto-links': {
    entity: ['MOU'],
    action: ['auto-link-exact-match', 'manual-relink', 'gslt-cretile-normalisation'],
  },
}

export interface ParsedFilters {
  entity: string[]
  action: string[]
  user: string | null
  search: string | null
  daysWindow: number | null
  startDate: string | null
  endDate: string | null
  cursor: string | null
  quickFilter: string | null
}

type SearchParam = string | string[] | undefined

function asString(v: SearchParam): string | null {
  if (typeof v === 'string') return v
  if (Array.isArray(v) && typeof v[0] === 'string') return v[0]
  return null
}

function asList(v: SearchParam): string[] {
  const s = asString(v)
  if (!s) return []
  return s.split(',').map((x) => x.trim()).filter(Boolean)
}

// Three-valued: 'all' means user explicitly opted out of a window;
// a number means user picked that many days; null means absent.
function asDays(v: SearchParam): number | 'all' | null {
  const s = asString(v)
  if (!s) return null
  if (s === 'all') return 'all'
  const n = parseInt(s, 10)
  if (Number.isFinite(n) && n > 0) return n
  return null
}

export function parseUrlFilters(
  search: Record<string, SearchParam>,
): ParsedFilters {
  const quickFilterId = asString(search.filter)
  const quick = quickFilterId ? QUICK_FILTERS[quickFilterId] ?? {} : {}

  const directEntity = asList(search.entity)
  const directAction = asList(search.action)
  const directDays = asDays(search.days)

  const daysWindow: number | null =
    directDays === 'all'
      ? null
      : directDays !== null
        ? directDays
        : quick.days !== undefined
          ? quick.days
          : 7

  return {
    entity: directEntity.length > 0 ? directEntity : (quick.entity ?? []),
    action: directAction.length > 0 ? directAction : (quick.action ?? []),
    user: asString(search.user),
    search: asString(search.q),
    daysWindow,
    startDate: asString(search.start),
    endDate: asString(search.end),
    cursor: asString(search.cursor),
    quickFilter: quickFilterId,
  }
}

export function applyFilters(
  rows: AuditRowData[],
  filters: ParsedFilters,
  now: Date = new Date(),
): AuditRowData[] {
  const cutoff =
    filters.daysWindow !== null
      ? new Date(now.getTime() - filters.daysWindow * 24 * 60 * 60 * 1000).toISOString()
      : null

  const needle = filters.search ? filters.search.toLowerCase() : null

  return rows.filter((row) => {
    if (filters.entity.length > 0 && !filters.entity.includes(row.entityType)) return false
    if (filters.action.length > 0 && !filters.action.includes(row.entry.action)) return false
    if (filters.user && row.entry.user !== filters.user) return false
    if (cutoff !== null && row.entry.timestamp < cutoff) return false
    if (filters.startDate && row.entry.timestamp < filters.startDate) return false
    if (filters.endDate && row.entry.timestamp > filters.endDate) return false
    if (filters.cursor && row.entry.timestamp >= filters.cursor) return false
    if (needle) {
      const haystack = [
        row.entry.action,
        row.entityLabel,
        row.entityId,
        row.entry.notes ?? '',
      ]
        .join(' ')
        .toLowerCase()
      if (!haystack.includes(needle)) return false
    }
    return true
  })
}

/**
 * Builds a description of the current filter state for the chip-summary
 * banner above the results pane. Returns a list of {label, removeHref}.
 */
export function describeFilters(
  filters: ParsedFilters,
  baseHref: string = '/admin/audit',
): Array<{ label: string; removeHref: string }> {
  const out: Array<{ label: string; removeHref: string }> = []

  function build(remove: keyof ParsedFilters | string): string {
    const params = new URLSearchParams()
    if (filters.quickFilter && remove !== 'filter' && remove !== 'quickFilter') {
      params.set('filter', filters.quickFilter)
    }
    if (filters.entity.length > 0 && remove !== 'entity') params.set('entity', filters.entity.join(','))
    if (filters.action.length > 0 && remove !== 'action') params.set('action', filters.action.join(','))
    if (filters.user && remove !== 'user') params.set('user', filters.user)
    if (filters.search && remove !== 'search') params.set('q', filters.search)
    if (filters.daysWindow !== null && remove !== 'daysWindow') params.set('days', String(filters.daysWindow))
    if (filters.startDate && remove !== 'startDate') params.set('start', filters.startDate)
    if (filters.endDate && remove !== 'endDate') params.set('end', filters.endDate)
    const qs = params.toString()
    return qs ? `${baseHref}?${qs}` : baseHref
  }

  if (filters.quickFilter) {
    out.push({ label: `quick: ${filters.quickFilter}`, removeHref: build('filter') })
  }
  if (filters.entity.length > 0) {
    out.push({ label: `entity: ${filters.entity.join('+')}`, removeHref: build('entity') })
  }
  if (filters.action.length > 0) {
    out.push({ label: `action: ${filters.action.join('+')}`, removeHref: build('action') })
  }
  if (filters.user) {
    out.push({ label: `user: ${filters.user}`, removeHref: build('user') })
  }
  if (filters.search) {
    out.push({ label: `search: "${filters.search}"`, removeHref: build('search') })
  }
  if (filters.daysWindow !== null && filters.daysWindow !== 7) {
    out.push({ label: `last ${filters.daysWindow}d`, removeHref: build('daysWindow') })
  }
  if (filters.startDate || filters.endDate) {
    out.push({
      label: `range: ${filters.startDate ?? '...'} -> ${filters.endDate ?? '...'}`,
      removeHref: build('startDate'),
    })
  }
  return out
}
