/*
 * /admin/dispatch-requests (W4-D.3 queue).
 *
 * List of DispatchRequests with filters by status, sales rep, and
 * programme. Pending-first sort; one row per DR linking to the detail
 * page for approve / reject / cancel.
 *
 * Visible to every authenticated user (W3-B). Server-side enforcement
 * of approve/reject lives in reviewRequest.ts; cancel is gated by
 * ownership.
 */

import Link from 'next/link'
import { redirect } from 'next/navigation'
import type {
  DispatchRequest,
  MOU,
  SalesPerson,
  User,
} from '@/lib/types'
import dispatchRequestsJson from '@/data/dispatch_requests.json'
import mousJson from '@/data/mous.json'
import salesTeamJson from '@/data/sales_team.json'
import usersJson from '@/data/users.json'
import { getCurrentUser } from '@/lib/auth/session'
import { TopNav } from '@/components/ops/TopNav'
import { PageHeader } from '@/components/ops/PageHeader'

const allRequests = dispatchRequestsJson as unknown as DispatchRequest[]
const allMous = mousJson as unknown as MOU[]
const allSalesTeam = salesTeamJson as unknown as SalesPerson[]
const allUsers = usersJson as unknown as User[]

type StatusFilter = 'all' | 'pending-approval' | 'approved' | 'rejected' | 'cancelled'

const STATUS_FILTERS: ReadonlyArray<{ key: StatusFilter; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'pending-approval', label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'cancelled', label: 'Cancelled' },
]

const STATUS_BADGE_CLASS: Record<DispatchRequest['status'], string> = {
  'pending-approval': 'bg-signal-warn/15 text-signal-warn border-signal-warn/40',
  approved: 'bg-signal-ok/15 text-signal-ok border-signal-ok/40',
  rejected: 'bg-signal-alert/15 text-signal-alert border-signal-alert/40',
  cancelled: 'bg-muted text-muted-foreground border-border',
}

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function DispatchRequestsQueuePage({ searchParams }: PageProps) {
  const user = await getCurrentUser()
  if (!user) redirect('/login?next=/admin/dispatch-requests')

  const sp = await searchParams
  const rawStatus = typeof sp.status === 'string' ? sp.status : 'all'
  const status: StatusFilter = (STATUS_FILTERS.map((f) => f.key) as StatusFilter[]).includes(
    rawStatus as StatusFilter,
  )
    ? (rawStatus as StatusFilter)
    : 'all'
  const search = typeof sp.q === 'string' ? sp.q.toLowerCase() : ''

  // Filter
  const matched = allRequests
    .filter((r) => (status === 'all' ? true : r.status === status))
    .filter((r) => {
      if (search === '') return true
      const mou = allMous.find((m) => m.id === r.mouId)
      const schoolName = mou?.schoolName.toLowerCase() ?? ''
      return r.id.toLowerCase().includes(search) || schoolName.includes(search) || r.mouId.toLowerCase().includes(search)
    })
    .slice()
    .sort((a, b) => {
      // Pending first; then newest first
      if (a.status === 'pending-approval' && b.status !== 'pending-approval') return -1
      if (a.status !== 'pending-approval' && b.status === 'pending-approval') return 1
      return b.requestedAt.localeCompare(a.requestedAt)
    })

  const counts = {
    all: allRequests.length,
    'pending-approval': allRequests.filter((r) => r.status === 'pending-approval').length,
    approved: allRequests.filter((r) => r.status === 'approved').length,
    rejected: allRequests.filter((r) => r.status === 'rejected').length,
    cancelled: allRequests.filter((r) => r.status === 'cancelled').length,
  }

  function nameForUser(id: string): string {
    return allUsers.find((u) => u.id === id)?.name ?? id
  }
  function totalQty(items: DispatchRequest['lineItems']): number {
    let total = 0
    for (const i of items) {
      if (i.kind === 'flat') total += i.quantity
      else for (const a of i.gradeAllocations) total += a.quantity
    }
    return total
  }

  return (
    <>
      <TopNav currentPath="/admin" />
      <PageHeader
        title="Dispatch requests"
        breadcrumb={[
          { label: 'Admin', href: '/admin' },
          { label: 'Dispatch requests' },
        ]}
      />
      <div className="mx-auto flex max-w-screen-xl flex-col gap-4 px-4 py-6">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Status filter">
          {STATUS_FILTERS.map((f) => {
            const isActive = f.key === status
            const qs = new URLSearchParams()
            if (f.key !== 'all') qs.set('status', f.key)
            if (search !== '') qs.set('q', search)
            const tail = qs.toString()
            const href = tail === '' ? '/admin/dispatch-requests' : `/admin/dispatch-requests?${tail}`
            return (
              <Link
                key={f.key}
                href={href}
                data-testid={`dr-filter-${f.key}`}
                aria-current={isActive ? 'page' : undefined}
                className={
                  isActive
                    ? 'inline-flex min-h-11 items-center rounded-md bg-brand-navy px-3 py-2 text-sm font-medium text-white'
                    : 'inline-flex min-h-11 items-center rounded-md border border-border bg-card px-3 py-2 text-sm font-medium text-foreground hover:bg-muted focus:outline-none focus:ring-2 focus:ring-brand-navy'
                }
              >
                {f.label} ({counts[f.key]})
              </Link>
            )
          })}
        </div>

        <form method="GET" className="flex gap-2">
          <input
            type="search"
            name="q"
            defaultValue={typeof sp.q === 'string' ? sp.q : ''}
            placeholder="Search DR id, MOU id, or school..."
            className="block w-full max-w-md rounded-md border border-input bg-card px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
          />
          {status !== 'all' ? <input type="hidden" name="status" value={status} /> : null}
          <button
            type="submit"
            className="inline-flex min-h-11 items-center rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted focus:outline-none focus:ring-2 focus:ring-brand-navy"
          >
            Search
          </button>
        </form>

        {matched.length === 0 ? (
          <p className="rounded-md border border-border bg-card p-4 text-sm text-muted-foreground">
            No dispatch requests match the current filter.
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border bg-card">
            {matched.map((r) => {
              const mou = allMous.find((m) => m.id === r.mouId)
              const requesterName = nameForUser(r.requestedBy)
              const sp = allSalesTeam.find((s) => s.id === mou?.salesPersonId)
              const total = totalQty(r.lineItems)
              return (
                <li key={r.id} data-testid={`dr-row-${r.id}`} className="p-4">
                  <Link
                    href={`/admin/dispatch-requests/${r.id}`}
                    className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm font-medium text-brand-navy">{r.id}</span>
                      <span
                        className={`rounded-sm border px-2 py-0.5 text-xs ${STATUS_BADGE_CLASS[r.status]}`}
                      >
                        {r.status}
                      </span>
                    </div>
                    <p className="mt-1 text-sm">
                      <span className="font-medium">{mou?.schoolName ?? r.mouId}</span>{' '}
                      <span className="text-muted-foreground">·</span>{' '}
                      Inst {r.installmentSeq}{' '}
                      <span className="text-muted-foreground">·</span>{' '}
                      {r.lineItems.length} line item(s), total qty {total}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Requested by {requesterName}
                      {sp ? ` (sales: ${sp.name})` : ''} · {new Date(r.requestedAt).toLocaleString('en-IN')}
                    </p>
                    {r.requestReason ? (
                      <p className="mt-1 text-xs italic text-muted-foreground">&ldquo;{r.requestReason}&rdquo;</p>
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
