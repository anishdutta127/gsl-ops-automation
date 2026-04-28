/*
 * /sales-pipeline (W4-F.2 list page).
 *
 * Server component. Lists SalesOpportunity rows with three filters:
 *   ?owner=<sp-... | all | mine>     default 'mine' for SalesRep,
 *                                     'all' for SalesHead / Admin
 *   ?region=<South-West | East | ...> default unset (all regions)
 *   ?q=<status search>                 free-text contains-match against
 *                                      status / schoolName / city
 *
 * Each row links to /sales-pipeline/[id]. The "New opportunity"
 * button surfaces only when the user has sales-opportunity:create.
 *
 * Phase 1 W3-B keeps UI gates loose; the page renders for every
 * authenticated user (sales-opportunity:view is baseline-granted to
 * every role).
 */

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Briefcase, Plus, AlertTriangle, CheckCircle2 } from 'lucide-react'
import salesOpportunitiesJson from '@/data/sales_opportunities.json'
import salesTeamJson from '@/data/sales_team.json'
import type { SalesOpportunity, SalesPerson } from '@/lib/types'
import { getCurrentUser } from '@/lib/auth/session'
import { canPerform } from '@/lib/auth/permissions'
import { TopNav } from '@/components/ops/TopNav'
import { PageHeader } from '@/components/ops/PageHeader'
import { REGION_OPTIONS } from '@/lib/salesOpportunity/createOpportunity'

const allOpportunities = salesOpportunitiesJson as unknown as SalesOpportunity[]
const allSalesTeam = salesTeamJson as unknown as SalesPerson[]

const ERROR_FLASH: Record<string, string> = {
  permission: 'You do not have permission to perform this action.',
  'invalid-region': 'Region must be one of the listed values.',
  'invalid-programme': 'Programme must be one of STEAM / TinkRworks / Young Pioneers / Harvard HBPE / VEX or left blank.',
  'missing-school-name': 'School name is required.',
  'missing-city': 'City is required.',
  'missing-state': 'State is required.',
  'missing-status': 'Status is required.',
  'unknown-sales-rep': 'Sales rep is not in sales_team.json.',
  'invalid-recce-completed-at': 'Recce completed date must be ISO yyyy-mm-dd.',
}

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function SalesPipelinePage({ searchParams }: PageProps) {
  const user = await getCurrentUser()
  if (!user) redirect('/login?next=%2Fsales-pipeline')

  const sp = await searchParams
  const isSalesRep = user.role === 'SalesRep'
  const rawOwner = typeof sp.owner === 'string' ? sp.owner : isSalesRep ? 'mine' : 'all'
  const owner = rawOwner
  const region = typeof sp.region === 'string' ? sp.region : 'all'
  const q = typeof sp.q === 'string' ? sp.q.toLowerCase().trim() : ''
  const rawState = typeof sp.state === 'string' ? sp.state : 'active'
  const stateFilter: 'active' | 'lost' | 'all' =
    rawState === 'lost' ? 'lost' : rawState === 'all' ? 'all' : 'active'
  const errorKey = typeof sp.error === 'string' ? sp.error : null
  const createdFlash = sp.created === '1'
  const highlightId = typeof sp.id === 'string' ? sp.id : null

  const filtered = allOpportunities.filter((o) => {
    if (owner === 'mine' && o.createdBy !== user.id) return false
    if (owner !== 'mine' && owner !== 'all') {
      // Specific sales-rep id (e.g., sp-vikram)
      if (o.salesRepId !== owner) return false
    }
    if (region !== 'all' && o.region !== region) return false
    if (stateFilter === 'active' && o.lossReason !== null) return false
    if (stateFilter === 'lost' && o.lossReason === null) return false
    if (q !== '') {
      const hay = `${o.schoolName} ${o.city} ${o.status}`.toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })

  filtered.sort((a, b) => {
    const aTs = a.auditLog[a.auditLog.length - 1]?.timestamp ?? a.createdAt
    const bTs = b.auditLog[b.auditLog.length - 1]?.timestamp ?? b.createdAt
    return bTs.localeCompare(aTs)
  })

  const ownerOptions = [
    { id: 'mine', label: 'My opportunities' },
    { id: 'all', label: 'All' },
    ...allSalesTeam
      .filter((s) => s.active)
      .map((s) => ({ id: s.id, label: s.name })),
  ]

  function repName(id: string): string {
    return allSalesTeam.find((s) => s.id === id)?.name ?? id
  }
  function lastUpdated(o: SalesOpportunity): string {
    const ts = o.auditLog[o.auditLog.length - 1]?.timestamp ?? o.createdAt
    return new Date(ts).toLocaleString('en-IN')
  }

  const canCreate = canPerform(user, 'sales-opportunity:create')

  return (
    <>
      <TopNav currentPath="/sales-pipeline" />
      <PageHeader
        title="Sales pipeline"
        breadcrumb={[{ label: 'Sales pipeline' }]}
      />
      <div className="mx-auto flex max-w-screen-xl flex-col gap-4 px-4 py-6">
        <p className="flex items-start gap-2 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
          <Briefcase aria-hidden className="size-4 shrink-0 text-slate-500" />
          <span>
            Pre-MOU pipeline tracker. {allOpportunities.length} total opportunities; {filtered.length} match the current filter.
            Workflow vocabulary (status / recce / approval) is free-text in Phase 1; D-026 captures the post-round-2 formalisation.
          </span>
        </p>

        {createdFlash ? (
          <p
            role="status"
            data-testid="sales-pipeline-created-flash"
            className="flex items-start gap-2 rounded-md border border-emerald-300 bg-emerald-50 p-2 text-xs text-emerald-900"
          >
            <CheckCircle2 aria-hidden className="size-4 shrink-0" />
            <span>Opportunity created.</span>
          </p>
        ) : null}

        {errorKey ? (
          <p
            role="alert"
            data-testid="sales-pipeline-error"
            className="flex items-start gap-2 rounded-md border border-rose-300 bg-rose-50 p-2 text-xs text-rose-900"
          >
            <AlertTriangle aria-hidden className="size-4 shrink-0" />
            <span>{ERROR_FLASH[errorKey] ?? `Failed: ${errorKey}`}</span>
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2" role="group" aria-label="State filter">
          {(['active', 'lost', 'all'] as const).map((s) => {
            const isActive = s === stateFilter
            const qs = new URLSearchParams()
            if (s !== 'active') qs.set('state', s)
            if (owner !== (isSalesRep ? 'mine' : 'all')) qs.set('owner', owner)
            if (region !== 'all') qs.set('region', region)
            if (q !== '') qs.set('q', q)
            const tail = qs.toString()
            const href = tail === '' ? '/sales-pipeline' : `/sales-pipeline?${tail}`
            return (
              <Link
                key={s}
                href={href}
                aria-current={isActive ? 'page' : undefined}
                data-testid={`state-filter-${s}`}
                className={
                  isActive
                    ? 'inline-flex min-h-11 items-center rounded-md bg-brand-navy px-3 py-2 text-sm font-medium text-white'
                    : 'inline-flex min-h-11 items-center rounded-md border border-border bg-card px-3 py-2 text-sm font-medium text-foreground hover:bg-muted focus:outline-none focus:ring-2 focus:ring-brand-navy'
                }
              >
                {s === 'active' ? 'Active' : s === 'lost' ? 'Lost' : 'All'}
              </Link>
            )
          })}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <form method="GET" className="flex flex-wrap items-center gap-2">
            {stateFilter !== 'active' ? <input type="hidden" name="state" value={stateFilter} /> : null}
            <label htmlFor="owner-filter" className="text-xs text-slate-600">
              Sales rep
            </label>
            <select
              id="owner-filter"
              name="owner"
              defaultValue={owner}
              data-testid="owner-filter"
              className="rounded-md border border-input bg-card px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
            >
              {ownerOptions.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>

            <label htmlFor="region-filter" className="ml-2 text-xs text-slate-600">
              Region
            </label>
            <select
              id="region-filter"
              name="region"
              defaultValue={region}
              data-testid="region-filter"
              className="rounded-md border border-input bg-card px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
            >
              <option value="all">All</option>
              {REGION_OPTIONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>

            <label htmlFor="q-filter" className="ml-2 text-xs text-slate-600">
              Search
            </label>
            <input
              id="q-filter"
              type="search"
              name="q"
              defaultValue={q}
              placeholder="status, school, city"
              data-testid="q-filter"
              className="block rounded-md border border-input bg-card px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
            />
            <button
              type="submit"
              className="inline-flex min-h-11 items-center rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted focus:outline-none focus:ring-2 focus:ring-brand-navy"
            >
              Apply
            </button>
          </form>

          {canCreate ? (
            <Link
              href="/sales-pipeline/new"
              data-testid="sales-pipeline-new-link"
              className="inline-flex min-h-11 items-center gap-1 rounded-md bg-brand-navy px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-navy"
            >
              <Plus aria-hidden className="size-4" />
              New opportunity
            </Link>
          ) : null}
        </div>

        {filtered.length === 0 ? (
          <p
            data-testid="sales-pipeline-empty"
            className="rounded-md border border-border bg-card p-6 text-center text-sm text-muted-foreground"
          >
            {allOpportunities.length === 0
              ? "No opportunities yet. Click 'New opportunity' to track a school."
              : 'No opportunities match the current filter.'}
          </p>
        ) : (
          <ul
            className="divide-y divide-border rounded-md border border-border bg-card"
            data-testid="sales-pipeline-list"
          >
            {filtered.map((o) => {
              const isHighlighted = highlightId === o.id
              const isLost = o.lossReason !== null
              return (
                <li
                  key={o.id}
                  id={`opp-${o.id}`}
                  data-testid={`opp-row-${o.id}`}
                  data-highlighted={isHighlighted ? 'true' : undefined}
                  className={
                    isHighlighted
                      ? 'bg-brand-teal/10'
                      : isLost
                      ? 'bg-slate-50/50'
                      : ''
                  }
                >
                  <Link
                    href={`/sales-pipeline/${encodeURIComponent(o.id)}`}
                    className="block min-h-11 px-4 py-3 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-brand-navy"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="text-sm font-medium">
                        {o.schoolName}
                        {isLost ? (
                          <span className="ml-2 rounded-sm border border-slate-300 bg-slate-100 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                            Lost
                          </span>
                        ) : null}
                      </span>
                      <span className="font-mono text-xs text-slate-500">{o.id}</span>
                    </div>
                    <p className="mt-1 text-xs text-slate-600">
                      {o.city}, {o.state} ({o.region}) · {repName(o.salesRepId)}
                      {o.programmeProposed ? ` · ${o.programmeProposed}` : ''}
                    </p>
                    <p className="mt-1 text-[11px] uppercase tracking-wide text-slate-500">
                      Status: <span className="text-slate-800 normal-case">{o.status}</span>
                      {' · '}Updated {lastUpdated(o)}
                    </p>
                    {isLost ? (
                      <p className="mt-1 text-[11px] italic text-slate-500">
                        Loss reason: {o.lossReason}
                      </p>
                    ) : null}
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </>
  )
}
