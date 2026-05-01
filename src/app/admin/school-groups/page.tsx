/*
 * /admin/school-groups (Phase C5b).
 *
 * Server Component. Lists every SchoolGroup with member count + an
 * Edit members link to the per-group edit page.
 *
 * Permission gate: Admin or OpsHead.
 *
 * W4-I.5 P4C2: TopNav + PageHeader + breadcrumb.
 */

import { redirect } from 'next/navigation'
import Link from 'next/link'
import type { SchoolGroup } from '@/lib/types'
import schoolGroupsJson from '@/data/school_groups.json'
import { getCurrentUser } from '@/lib/auth/session'
import { TopNav } from '@/components/ops/TopNav'
import { PageHeader } from '@/components/ops/PageHeader'
import { opsButtonClass } from '@/components/ops/OpsButton'

const groups = schoolGroupsJson as unknown as SchoolGroup[]

export default async function SchoolGroupsListPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login?next=%2Fadmin%2Fschool-groups')

  return (
    <>
      <TopNav currentPath="/admin" />
      <main id="main-content">
        <PageHeader
          title="School groups"
          subtitle={`${groups.length} groups. Used for chain MOUs spanning multiple campuses.`}
          breadcrumb={[
            { label: 'Dashboard', href: '/' },
            { label: 'Admin', href: '/admin' },
            { label: 'School groups' },
          ]}
          actions={
            <Link
              href="/admin/school-groups/new"
              className={opsButtonClass({ variant: 'primary', size: 'md' })}
            >
              New group
            </Link>
          }
        />
        <div className="mx-auto max-w-screen-md px-4 py-6">
          {groups.length === 0 ? (
            <p className="rounded-md border border-border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
              No school groups yet.
            </p>
          ) : (
            <ul className="rounded-md border border-border bg-card">
              {groups.map((group) => (
                <li key={group.id} className="border-b border-border last:border-b-0">
                  <div className="flex items-stretch">
                    <div className="flex-1 px-4 py-3">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-sm font-medium text-brand-navy">
                          {group.name}
                        </span>
                        <span className="text-xs text-muted-foreground">{group.id}</span>
                      </div>
                      <p className="mt-0.5 text-xs text-foreground">
                        Region: {group.region}{' '}
                        <span aria-hidden>&middot;</span>{' '}
                        {group.memberSchoolIds.length} members
                        {group.groupMouId ? ` ${'·'} MOU ${group.groupMouId}` : ''}
                      </p>
                      {group.notes ? (
                        <p className="mt-0.5 text-xs text-muted-foreground">{group.notes}</p>
                      ) : null}
                    </div>
                    <Link
                      href={`/admin/school-groups/${group.id}`}
                      className="flex min-h-11 items-center px-4 text-xs font-medium text-brand-navy hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
                    >
                      Edit members
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
    </>
  )
}
