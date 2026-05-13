/*
 * /admin/sales-team/reassign (Gate 5A.6 Step 14).
 *
 * Bulk MOU reassignment surface. Query: ?fromRepId=<repId>. Lists every
 * MOU owned by the given sales-person; the operator multi-selects and
 * picks a destination rep. Submit triggers per-MOU enqueue updates with
 * the new salesPersonId + an audit entry on each touched MOU.
 *
 * Permission: Admin role (canManageUsers proxy).
 */

import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { MOU, SalesPerson, User } from '@/lib/types'
import mousJson from '@/data/mous.json'
import salesTeamJson from '@/data/sales_team.json'
import { TopNav } from '@/components/ops/TopNav'
import { PageHeader } from '@/components/ops/PageHeader'
import { getCurrentUser } from '@/lib/auth/session'
import { canManageUsers } from '@/lib/access'
import { formatRs } from '@/lib/format'

const allMous = mousJson as unknown as MOU[]
const allReps = salesTeamJson as unknown as SalesPerson[]

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

const ERROR_MESSAGES: Record<string, string> = {
  'no-from-rep': 'Pick a source rep from the dropdown first.',
  'no-to-rep': 'Pick a destination rep.',
  'no-mous-selected': 'Select at least one MOU to reassign.',
  'queue-failure': 'Some MOUs failed to enqueue. Retry the remainder.',
  permission: 'Only Admin can perform bulk reassignment.',
}

function isAdmin(u: User | null): boolean {
  return u !== null && u.role === 'Admin'
}

export default async function ReassignMousPage({ searchParams }: PageProps) {
  const user = await getCurrentUser()
  if (!user) redirect('/login?next=%2Fadmin%2Fsales-team%2Freassign')
  if (!canManageUsers(user) && !isAdmin(user)) {
    redirect('/admin?error=permission')
  }

  const sp = await searchParams
  const fromRepId = typeof sp.fromRepId === 'string' ? sp.fromRepId : ''
  const errorKey = typeof sp.error === 'string' ? sp.error : null
  const errorMessage = errorKey ? ERROR_MESSAGES[errorKey] ?? `Failed: ${errorKey}` : null
  const reassignedCount = typeof sp.reassigned === 'string' ? Number(sp.reassigned) : 0
  const toRep = typeof sp.toRepName === 'string' ? sp.toRepName : null

  const activeReps = allReps
    .filter((r) => r.active !== false)
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))

  const sourceMous = fromRepId === ''
    ? []
    : allMous
        .filter((m) => m.salesPersonId === fromRepId && m.cohortStatus === 'active')
        .sort((a, b) => a.schoolName.localeCompare(b.schoolName))

  const fromRep = activeReps.find((r) => r.id === fromRepId) ?? null

  return (
    <>
      <TopNav currentPath="/admin" />
      <main id="main-content">
        <PageHeader
          title="Bulk MOU reassignment"
          subtitle="Pick a source rep, select the MOUs to move, choose the destination rep, and submit."
          breadcrumb={[
            { label: 'Admin', href: '/admin' },
            { label: 'Sales team', href: '/admin/sales-team' },
            { label: 'Reassign MOUs' },
          ]}
        />
        <div className="mx-auto flex max-w-screen-xl flex-col gap-4 px-4 py-6">
          {errorMessage ? (
            <p
              role="alert"
              data-testid="reassign-error"
              className="rounded-md border border-signal-alert bg-card p-3 text-sm text-signal-alert"
            >
              {errorMessage}
            </p>
          ) : null}
          {reassignedCount > 0 ? (
            <p
              role="status"
              data-testid="reassign-flash"
              className="rounded-md border border-signal-ok bg-card p-3 text-sm text-foreground"
            >
              Reassigned {reassignedCount} MOU{reassignedCount === 1 ? '' : 's'}
              {toRep ? ` to ${toRep}` : ''}. Will reflect everywhere within ~5 minutes.
            </p>
          ) : null}

          <form method="GET" className="flex flex-wrap items-end gap-3 rounded-md border border-border bg-card p-4">
            <div className="grow min-w-[240px]">
              <label htmlFor="fromRepId" className="block text-xs font-medium text-brand-navy mb-1">
                Source rep
              </label>
              <select
                id="fromRepId"
                name="fromRepId"
                defaultValue={fromRepId}
                className="block w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
                data-testid="from-rep-select"
              >
                <option value="">– Select –</option>
                {activeReps.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} ({r.id})
                  </option>
                ))}
              </select>
            </div>
            <button
              type="submit"
              className="inline-flex min-h-11 items-center rounded-md bg-brand-navy px-4 py-2 text-sm font-semibold text-white hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
              data-testid="load-source-button"
            >
              Load MOUs
            </button>
          </form>

          {fromRepId !== '' && fromRep === null ? (
            <p className="rounded-md border border-signal-attention bg-card p-3 text-sm text-foreground">
              Rep {fromRepId} not found or inactive.
            </p>
          ) : null}

          {fromRep ? (
            <form
              method="POST"
              action="/api/admin/sales-team/reassign"
              className="space-y-4 rounded-lg border border-border bg-card p-4 sm:p-6"
              data-testid="reassign-form"
            >
              <div>
                <h2 className="font-heading text-base font-semibold text-brand-navy">
                  Source: {fromRep.name} ({fromRep.id})
                </h2>
                <p className="text-xs text-muted-foreground">
                  {sourceMous.length} active MOU{sourceMous.length === 1 ? '' : 's'} on file.
                </p>
              </div>
              <input type="hidden" name="fromRepId" value={fromRep.id} />

              {sourceMous.length === 0 ? (
                <p className="text-sm text-muted-foreground">No active MOUs to reassign.</p>
              ) : (
                <div className="overflow-x-auto rounded-md border border-border">
                  <table className="w-full text-sm">
                    <thead className="border-b border-border bg-muted text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2.5 font-medium">
                          <span className="sr-only">Select</span>
                        </th>
                        <th className="px-3 py-2.5 font-medium">MOU</th>
                        <th className="px-3 py-2.5 font-medium">School</th>
                        <th className="px-3 py-2.5 font-medium">Programme</th>
                        <th className="px-3 py-2.5 font-medium">Status</th>
                        <th className="px-3 py-2.5 font-medium text-right">Contract</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {sourceMous.map((m) => (
                        <tr key={m.id}>
                          <td className="px-3 py-2.5">
                            <label className="inline-flex items-center">
                              <input
                                type="checkbox"
                                name="mouIds"
                                value={m.id}
                                className="size-4 accent-brand-navy"
                                data-testid={`reassign-cb-${m.id}`}
                              />
                              <span className="sr-only">Reassign {m.id}</span>
                            </label>
                          </td>
                          <td className="px-3 py-2.5 font-mono text-xs text-foreground">{m.id}</td>
                          <td className="px-3 py-2.5 text-foreground">{m.schoolName}</td>
                          <td className="px-3 py-2.5 text-xs text-muted-foreground">{m.programme}</td>
                          <td className="px-3 py-2.5 text-xs text-muted-foreground">{m.status}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{formatRs(m.contractValue)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 border-t border-border pt-3">
                <div>
                  <label htmlFor="toRepId" className="block text-xs font-medium text-brand-navy mb-1">
                    Destination rep
                  </label>
                  <select
                    id="toRepId"
                    name="toRepId"
                    required
                    className="block w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
                    data-testid="to-rep-select"
                  >
                    <option value="">– Select –</option>
                    {activeReps.filter((r) => r.id !== fromRep.id).map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name} ({r.id})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="submit"
                  disabled={sourceMous.length === 0}
                  className="inline-flex min-h-11 items-center rounded-md bg-brand-teal px-4 py-2 text-sm font-semibold text-brand-navy hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
                  data-testid="reassign-submit"
                >
                  Reassign selected
                </button>
                <Link
                  href="/admin/sales-team"
                  className="inline-flex min-h-11 items-center rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
                >
                  Back to sales team
                </Link>
              </div>
            </form>
          ) : null}
        </div>
      </main>
    </>
  )
}
