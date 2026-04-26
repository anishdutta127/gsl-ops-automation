/*
 * /admin/school-groups (Phase C5b).
 *
 * Server Component. Lists every SchoolGroup with member count + an
 * Edit members link to the per-group edit page.
 *
 * Permission gate: Admin or OpsHead.
 */

import { redirect } from 'next/navigation'
import Link from 'next/link'
import type { SchoolGroup } from '@/lib/types'
import schoolGroupsJson from '@/data/school_groups.json'
import { getCurrentUser } from '@/lib/auth/session'
import { effectiveRoles } from '@/lib/auth/permissions'

const groups = schoolGroupsJson as unknown as SchoolGroup[]

export default async function SchoolGroupsListPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login?next=%2Fadmin%2Fschool-groups')

  const roles = effectiveRoles(user)
  const allowed = roles.includes('Admin') || roles.includes('OpsHead')
  if (!allowed) redirect('/dashboard')

  return (
    <div className="p-6 max-w-4xl">
      <header className="mb-4 flex items-baseline justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--brand-navy)]">School groups</h1>
          <p className="mt-1 text-sm text-slate-700">
            {groups.length} groups. Used for chain MOUs spanning multiple campuses.
          </p>
        </div>
        <Link
          href="/admin/school-groups/new"
          className="inline-flex items-center rounded-md bg-[var(--brand-navy)] px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-navy)] min-h-[44px]"
        >
          New group
        </Link>
      </header>

      {groups.length === 0 ? (
        <p className="rounded-md border border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-600">
          No school groups yet.
        </p>
      ) : (
        <ul className="rounded-md border border-slate-200 bg-white">
          {groups.map((group) => (
            <li key={group.id} className="border-b border-slate-200 last:border-b-0">
              <div className="flex items-stretch">
                <div className="flex-1 px-4 py-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-medium text-[var(--brand-navy)]">
                      {group.name}
                    </span>
                    <span className="text-xs text-slate-500">{group.id}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-slate-700">
                    Region: {group.region} · {group.memberSchoolIds.length} members
                    {group.groupMouId ? ` · MOU ${group.groupMouId}` : ''}
                  </p>
                  {group.notes ? (
                    <p className="mt-0.5 text-xs text-slate-600">{group.notes}</p>
                  ) : null}
                </div>
                <Link
                  href={`/admin/school-groups/${group.id}`}
                  className="flex items-center px-4 text-xs font-medium text-[var(--brand-navy)] hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-navy)] min-h-[44px]"
                >
                  Edit members
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
