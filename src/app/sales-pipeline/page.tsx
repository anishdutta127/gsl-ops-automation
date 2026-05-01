/*
 * /sales-pipeline (W4-F.2 list page).
 *
 * Server component. Lists SalesOpportunity rows.
 *
 * Phase X filter shape:
 *   - FilterRail aside: Region (multi-select, NE / SW shortcuts),
 *     Programme (multi-select), free-text search (q).
 *   - Top bar (preserved from W4-F): State toggle (active / lost /
 *     all), Owner select (mine / all / sp-XXX).
 *
 * The Owner select is intentionally kept OUTSIDE FilterRail because
 * it carries the SalesRep "mine" default scope semantic; the
 * salesRep dimension on the kanban / mous list is a flat
 * multi-select with no role-aware default, but here a SalesRep with
 * an empty filter must see only their own opportunities by default
 * and opt into wider scope via ?owner=all. Migrating this control
 * is a Phase 1.1 unification triggered when the "mine" default is
 * no longer the dominant SalesRep workflow.
 *
 * Status dimension is omitted: opportunity.status is free-text in
 * Phase 1 (D-026 captures the post-round-2 formalisation). Adding
 * a chip set off free-text would be premature.
 */

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Briefcase, Plus, AlertTriangle, CheckCircle2 } from 'lucide-react'
import salesOpportunitiesJson from '@/data/sales_opportunities.json'
import salesTeamJson from '@/data/sales_team.json'
import type { Programme, SalesOpportunity, SalesPerson } from '@/lib/types'
import { getCurrentUser } from '@/lib/auth/session'
import { canPerform } from '@/lib/auth/permissions'
import { TopNav } from '@/components/ops/TopNav'
import { PageHeader } from '@/components/ops/PageHeader'
import { FilterRail, type FilterDimension } from '@/components/ops/FilterRail'
import { EmptyState } from '@/components/ops/EmptyState'
import { StatusChip } from '@/components/ops/StatusChip'
import { opsButtonClass } from '@/components/ops/OpsButton'
import { REGION_OPTIONS } from '@/lib/salesOpportunity/createOpportunity'
import {
  applyDimensionFilters,
  applyTextSearch,
  parseDimensions,
} from '@/lib/filterParsing'
import { SUPER_REGION_MEMBERS } from '@/lib/regions'

const allOpportunities = salesOpportunitiesJson as unknown as SalesOpportunity[]
const allSalesTeam = salesTeamJson as unknown as SalesPerson[]

const DIMENSION_KEYS = ['region', 'programme'] as const

const PROGRAMME_OPTIONS: ReadonlyArray<Programme> = [
  'STEAM',
  'TinkRworks',
  'Young Pioneers',
  'Harvard HBPE',
  'VEX',
]

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
  const owner = typeof sp.owner === 'string' ? sp.owner : isSalesRep ? 'mine' : 'all'
  const q = typeof sp.q === 'string' ? sp.q : ''
  const rawState = typeof sp.state === 'string' ? sp.state : 'active'
  const stateFilter: 'active' | 'lost' | 'all' =
    rawState === 'lost' ? 'lost' : rawState === 'all' ? 'all' : 'active'
  const errorKey = typeof sp.error === 'string' ? sp.error : null
  const createdFlash = sp.created === '1'
  const highlightId = typeof sp.id === 'string' ? sp.id : null

  const active = parseDimensions(sp, DIMENSION_KEYS as unknown as string[])

  const ownerScoped = allOpportunities.filter((o) => {
    if (owner === 'mine' && o.createdBy !== user.id) return false
    if (owner !== 'mine' && owner !== 'all') {
      if (o.salesRepId !== owner) return false
    }
    if (stateFilter === 'active' && o.lossReason !== null) return false
    if (stateFilter === 'lost' && o.lossReason === null) return false
    return true
  })

  const dimensionFiltered = applyDimensionFilters(ownerScoped, active, {
    region: (o) => o.region,
    programme: (o) => o.programmeProposed,
  })

  const filtered = applyTextSearch(
    dimensionFiltered,
    q,
    (o) => [o.schoolName, o.city, o.status],
  )

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

  const dimensions: FilterDimension[] = [
    {
      key: 'region',
      label: 'Region',
      shortcuts: [
        { key: 'NE', label: 'NE', values: SUPER_REGION_MEMBERS.NE },
        { key: 'SW', label: 'SW', values: SUPER_REGION_MEMBERS.SW },
      ],
      // 6-value pipeline taxonomy per createOpportunity.REGION_OPTIONS;
      // forward-looking pipeline data scouts schools in regions where
      // MOUs do not yet exist, hence the broader enum than the 3-value
      // school taxonomy.
      options: REGION_OPTIONS.map((v) => ({ value: v, label: v })),
    },
    {
      key: 'programme',
      label: 'Programme',
      options: PROGRAMME_OPTIONS.map((v) => ({ value: v, label: v })),
    },
  ]

  return (
    <>
      <TopNav currentPath="/sales-pipeline" />
      <PageHeader
        title="Sales pipeline"
        breadcrumb={[{ label: 'Sales pipeline' }]}
      />
      <div className="mx-auto flex max-w-screen-xl flex-col gap-4 px-4 py-6">
        <p className="flex items-start gap-2 rounded-md border border-border bg-muted/30 p-3 text-sm text-foreground">
          <Briefcase aria-hidden className="size-4 shrink-0 text-muted-foreground" />
          <span>
            Pre-MOU pipeline tracker. {allOpportunities.length} total opportunities; {filtered.length} match the current filter.
            Workflow vocabulary (status / recce / approval) is free-text in Phase 1; D-026 captures the post-round-2 formalisation.
          </span>
        </p>

        {createdFlash ? (
          <p
            role="status"
            data-testid="sales-pipeline-created-flash"
            className="flex items-start gap-2 rounded-md border border-signal-ok bg-signal-ok/10 p-2 text-xs text-signal-ok"
          >
            <CheckCircle2 aria-hidden className="size-4 shrink-0" />
            <span>Opportunity created.</span>
          </p>
        ) : null}

        {errorKey ? (
          <p
            role="alert"
            data-testid="sales-pipeline-error"
            className="flex items-start gap-2 rounded-md border border-signal-alert bg-signal-alert/10 p-2 text-xs text-signal-alert"
          >
            <AlertTriangle aria-hidden className="size-4 shrink-0" />
            <span>{ERROR_FLASH[errorKey] ?? `Failed: ${errorKey}`}</span>
          </p>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2" role="group" aria-label="State filter">
            {(['active', 'lost', 'all'] as const).map((s) => {
              const isActive = s === stateFilter
              const qs = new URLSearchParams()
              if (s !== 'active') qs.set('state', s)
              if (owner !== (isSalesRep ? 'mine' : 'all')) qs.set('owner', owner)
              for (const [k, vs] of Object.entries(active)) {
                if (vs.length > 0) qs.set(k, vs.join(','))
              }
              if (q !== '') qs.set('q', q)
              const tail = qs.toString()
              const href = tail === '' ? '/sales-pipeline' : `/sales-pipeline?${tail}`
              return (
                <Link
                  key={s}
                  href={href}
                  aria-current={isActive ? 'page' : undefined}
                  data-testid={`state-filter-${s}`}
                  className={opsButtonClass({
                    variant: isActive ? 'primary' : 'outline',
                    size: 'md',
                  })}
                >
                  {s === 'active' ? 'Active' : s === 'lost' ? 'Lost' : 'All'}
                </Link>
              )
            })}
          </div>

          {canCreate ? (
            <Link
              href="/sales-pipeline/new"
              data-testid="sales-pipeline-new-link"
              className={opsButtonClass({ variant: 'primary', size: 'md' })}
            >
              <Plus aria-hidden className="size-4" />
              New opportunity
            </Link>
          ) : null}
        </div>

        <form method="GET" className="flex flex-wrap items-center gap-2">
          {stateFilter !== 'active' ? <input type="hidden" name="state" value={stateFilter} /> : null}
          {Object.entries(active).map(([k, vs]) =>
            vs.length > 0 ? (
              <input key={k} type="hidden" name={k} value={vs.join(',')} />
            ) : null,
          )}
          {q !== '' ? <input type="hidden" name="q" value={q} /> : null}
          <label htmlFor="owner-filter" className="text-xs text-muted-foreground">
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
          <button type="submit" className={opsButtonClass({ variant: 'outline', size: 'md' })}>
            Apply
          </button>
        </form>

        <div className="flex flex-col gap-4 sm:flex-row">
          <FilterRail
            basePath="/sales-pipeline"
            dimensions={dimensions}
            active={active}
            search={{ value: q, placeholder: 'Search school / city / status' }}
          />
          <div className="min-w-0 flex-1">
            {filtered.length === 0 ? (
              <div
                data-testid="sales-pipeline-empty"
                className="rounded-md border border-border bg-card"
              >
                <EmptyState
                  title={
                    allOpportunities.length === 0
                      ? 'No opportunities yet.'
                      : 'No opportunities match your filters.'
                  }
                  description={
                    allOpportunities.length === 0
                      ? 'Click New opportunity to start tracking a school you are scouting.'
                      : 'Try the Active state, clear the search, or switch the owner to All.'
                  }
                />
              </div>
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
                          ? 'bg-muted/30'
                          : ''
                      }
                    >
                      <Link
                        href={`/sales-pipeline/${encodeURIComponent(o.id)}`}
                        className="block min-h-11 px-4 py-3 hover:bg-muted focus:outline-none focus:ring-2 focus:ring-brand-navy"
                      >
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <span className="text-sm font-medium">
                            {o.schoolName}
                            {isLost ? (
                              <span className="ml-2 inline-block">
                                <StatusChip tone="neutral" label="Lost" withDot={false} />
                              </span>
                            ) : null}
                          </span>
                          <span className="font-mono text-xs text-muted-foreground">{o.id}</span>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {o.city}, {o.state} ({o.region}) · {repName(o.salesRepId)}
                          {o.programmeProposed ? ` · ${o.programmeProposed}` : ''}
                        </p>
                        <p className="mt-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                          Status: <span className="text-foreground normal-case">{o.status}</span>
                          {' · '}Updated {lastUpdated(o)}
                        </p>
                        {isLost ? (
                          <p className="mt-1 text-[11px] italic text-muted-foreground">
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
        </div>
      </div>
    </>
  )
}
