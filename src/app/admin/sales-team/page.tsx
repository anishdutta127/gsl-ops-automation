/*
 * /admin/sales-team (Phase C5b).
 *
 * Server Component. Lists every SalesPerson record. Permission gate:
 * Admin or OpsHead. Other viewers redirect to /dashboard.
 */

import { redirect } from 'next/navigation'
import Link from 'next/link'
import type { SalesPerson } from '@/lib/types'
import salesTeamJson from '@/data/sales_team.json'
import { getCurrentUser } from '@/lib/auth/session'
import { effectiveRoles } from '@/lib/auth/permissions'

const reps = salesTeamJson as unknown as SalesPerson[]

export default async function SalesTeamListPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login?next=%2Fadmin%2Fsales-team')

  const roles = effectiveRoles(user)
  const allowed = roles.includes('Admin') || roles.includes('OpsHead')
  if (!allowed) redirect('/dashboard')

  const activeCount = reps.filter((r) => r.active).length

  return (
    <div className="p-6 max-w-4xl">
      <header className="mb-4 flex items-baseline justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--brand-navy)]">Sales team</h1>
          <p className="mt-1 text-sm text-slate-700">
            {reps.length} reps, {activeCount} active.
          </p>
        </div>
        <Link
          href="/admin/sales-team/new"
          className="inline-flex items-center rounded-md bg-[var(--brand-navy)] px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-navy)] min-h-[44px]"
        >
          New rep
        </Link>
      </header>

      {reps.length === 0 ? (
        <p className="rounded-md border border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-600">
          No sales reps yet.
        </p>
      ) : (
        <ul className="rounded-md border border-slate-200 bg-white">
          {reps.map((rep) => (
            <li key={rep.id} className="border-b border-slate-200 px-4 py-3 last:border-b-0">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-medium text-[var(--brand-navy)]">
                  {rep.name}
                </span>
                <span className="text-xs text-slate-500">{rep.id}</span>
              </div>
              <p className="mt-0.5 text-xs text-slate-700">{rep.email}</p>
              <p className="mt-1 text-xs text-slate-600">
                Territories: {rep.territories.join(', ')} ·{' '}
                Programmes: {rep.programmes.join(', ')}
                {rep.active ? '' : ' · inactive'}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
