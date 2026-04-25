/*
 * /admin/audit (DESIGN.md "Surface 5 / Admin audit route" + step 10
 * Item 5).
 *
 * Server Component. Reads the staff JWT from cookies, looks up the
 * full User record from src/data/users.json, aggregates audit
 * entries from every entity, applies role-based server-side filter
 * (canViewAuditEntry), then narrows further via URL query filters.
 * URL filters can never widen the role-allowed set; they only
 * narrow it.
 *
 * Per-user attribution rendering:
 *   - Admin / Leadership / OpsHead see acting-user emails in the
 *     row's user column.
 *   - SalesRep / OpsEmployee / SalesHead / Finance / TrainerHead
 *     see name + role only; email redacted.
 */

import { cookies } from 'next/headers'
import Link from 'next/link'
import { SESSION_COOKIE_NAME, verifySessionToken } from '@/lib/crypto/jwt'
import {
  applyFilters,
  describeFilters,
  parseUrlFilters,
  type ParsedFilters,
} from '@/lib/audit/urlFilters'
import { collectAuditRows, type AuditRowData } from '@/lib/audit/aggregate'
import {
  canViewAuditEntry,
  effectiveRoles,
} from '@/lib/auth/permissions'
import { AuditFilterRail } from '@/components/ops/AuditFilterRail'
import { AuditRow } from '@/components/ops/AuditRow'
import type { User } from '@/lib/types'
import usersData from '@/data/users.json'

const PAGE_SIZE = 50
const ENTITY_TYPES = [
  'MOU',
  'School',
  'SchoolGroup',
  'Communication',
  'Escalation',
  'Dispatch',
  'Feedback',
  'CcRule',
]
const KNOWN_ACTIONS = [
  'auto-link-exact-match',
  'manual-relink',
  'gslt-cretile-normalisation',
  'actuals-confirmed',
  'pi-issued',
  'dispatch-raised',
  'delivery-acknowledged',
  'feedback-submitted',
  'p2-override',
  'p2-override-acknowledged',
  'cc-rule-created',
  'cc-rule-toggle-on',
  'cc-rule-toggle-off',
  'whatsapp-draft-copied',
  'auto-create-from-feedback',
]

function lookupUser(userId: string): User | null {
  const found = (usersData as User[]).find((u) => u.id === userId)
  return found ?? null
}

function emailVisibleToRole(user: User): boolean {
  const roles = effectiveRoles(user)
  return (
    roles.includes('Admin') ||
    roles.includes('Leadership') ||
    roles.includes('OpsHead')
  )
}

function escapeCsv(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = await searchParams
  const cookieStore = await cookies()
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value
  const claims = token ? await verifySessionToken(token) : null

  if (!claims) {
    return (
      <div className="p-6">
        <p className="text-sm text-slate-700">
          Unauthorised. Please log in to view the audit route.
        </p>
      </div>
    )
  }

  const user = lookupUser(claims.sub)
  if (!user) {
    return (
      <div className="p-6">
        <p className="text-sm text-slate-700">
          User record not found for session subject {claims.sub}.
        </p>
      </div>
    )
  }

  const allRows = collectAuditRows()
  const visibleRows = allRows.filter((row) =>
    canViewAuditEntry(user, row.entry, { laneOfEntry: row.laneOfEntry }),
  )

  const filters = parseUrlFilters(sp)
  const filteredRows = applyFilters(visibleRows, filters)
  const pageRows = filteredRows.slice(0, PAGE_SIZE)
  const showLoadOlder = filteredRows.length > PAGE_SIZE
  const oldestShown = pageRows[pageRows.length - 1]?.entry.timestamp

  const showEmail = emailVisibleToRole(user)
  const filterChips = describeFilters(filters)

  return (
    <div className="flex min-h-screen flex-col sm:flex-row">
      <AuditFilterRail
        filters={filters}
        knownEntities={ENTITY_TYPES}
        knownActions={KNOWN_ACTIONS}
      />
      <section className="flex-1 p-4">
        <header className="mb-4">
          <h1 className="text-xl font-bold text-[var(--brand-navy)]">Audit log</h1>
          <p className="mt-1 text-xs text-slate-600">
            Showing {pageRows.length} of {filteredRows.length} entries you can see (
            {visibleRows.length} visible to your role; {allRows.length} total in
            the system).
          </p>
          {filterChips.length > 0 ? (
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {filterChips.map((chip) => (
                <li key={chip.label}>
                  <Link
                    href={chip.removeHref}
                    className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-white px-2 py-0.5 text-[11px] text-slate-700 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-navy)]"
                  >
                    <span>{chip.label}</span>
                    <span aria-label={`Remove ${chip.label} filter`}>×</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
          <ExportCsvLink rows={pageRows} showEmail={showEmail} />
        </header>

        {pageRows.length === 0 ? (
          <p className="rounded-md border border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-600">
            No audit entries match the current filters.
          </p>
        ) : (
          <ul className="border-t border-slate-200">
            {pageRows.map((row, idx) => {
              const entryUser = lookupUser(row.entry.user)
              const userMeta = entryUser
                ? {
                    name: entryUser.name,
                    role: entryUser.role,
                    email: entryUser.email,
                  }
                : {
                    name: row.entry.user,
                    role: 'OpsEmployee' as const,
                    email: null,
                  }
              return (
                <AuditRow
                  key={`${row.entityId}-${row.entry.timestamp}-${idx}`}
                  entry={row.entry}
                  user={userMeta}
                  entityLabel={row.entityLabel}
                  entityHref={row.entityHref}
                  showEmail={showEmail}
                />
              )
            })}
          </ul>
        )}

        {showLoadOlder && oldestShown ? (
          <div className="mt-4 text-center">
            <Link
              href={loadOlderHref(filters, oldestShown)}
              className="inline-flex items-center rounded-md border border-[var(--brand-navy)] bg-white px-4 py-2 text-sm font-medium text-[var(--brand-navy)] hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-navy)]"
            >
              Load older entries
            </Link>
          </div>
        ) : null}
      </section>
    </div>
  )
}

function loadOlderHref(filters: ParsedFilters, cursor: string): string {
  const params = new URLSearchParams()
  if (filters.quickFilter) params.set('filter', filters.quickFilter)
  if (filters.entity.length > 0) params.set('entity', filters.entity.join(','))
  if (filters.action.length > 0) params.set('action', filters.action.join(','))
  if (filters.user) params.set('user', filters.user)
  if (filters.search) params.set('q', filters.search)
  if (filters.daysWindow !== null) params.set('days', String(filters.daysWindow))
  else params.set('days', 'all')
  if (filters.startDate) params.set('start', filters.startDate)
  if (filters.endDate) params.set('end', filters.endDate)
  params.set('cursor', cursor)
  return `/admin/audit?${params.toString()}`
}

function ExportCsvLink({
  rows,
  showEmail,
}: {
  rows: AuditRowData[]
  showEmail: boolean
}) {
  const header = ['timestamp', 'user', showEmail ? 'email' : '', 'action', 'entity_type', 'entity_id', 'entity_label', 'notes']
    .filter(Boolean)
    .join(',')
  const lines = rows.map((row) => {
    const entryUser = lookupUser(row.entry.user)
    const cols: string[] = [
      row.entry.timestamp,
      row.entry.user,
      ...(showEmail ? [entryUser?.email ?? ''] : []),
      row.entry.action,
      row.entityType,
      row.entityId,
      row.entityLabel,
      row.entry.notes ?? '',
    ]
    return cols.map(escapeCsv).join(',')
  })
  const body = encodeURIComponent([header, ...lines].join('\n'))
  const href = `data:text/csv;charset=utf-8,${body}`
  return (
    <a
      href={href}
      download={`audit-export-${new Date().toISOString().slice(0, 10)}.csv`}
      className="mt-2 inline-block text-xs font-medium text-[var(--brand-navy)] underline-offset-2 hover:underline"
    >
      Export CSV
    </a>
  )
}
