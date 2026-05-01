/*
 * /admin/sales-team (Phase C5b).
 *
 * Server Component. Lists every SalesPerson record. Permission gate:
 * Admin or OpsHead. Other viewers redirect to /dashboard.
 *
 * W4-I.5 P4C2: TopNav + PageHeader + breadcrumb.
 */

import { redirect } from 'next/navigation'
import Link from 'next/link'
import type { SalesPerson } from '@/lib/types'
import salesTeamJson from '@/data/sales_team.json'
import { getCurrentUser } from '@/lib/auth/session'
import { TopNav } from '@/components/ops/TopNav'
import { PageHeader } from '@/components/ops/PageHeader'
import { opsButtonClass } from '@/components/ops/OpsButton'

const reps = salesTeamJson as unknown as SalesPerson[]

export default async function SalesTeamListPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login?next=%2Fadmin%2Fsales-team')

  const activeCount = reps.filter((r) => r.active).length

  return (
    <>
      <TopNav currentPath="/admin" />
      <main id="main-content">
        <PageHeader
          title="Sales team"
          subtitle={`${reps.length} reps, ${activeCount} active.`}
          breadcrumb={[
            { label: 'Dashboard', href: '/' },
            { label: 'Admin', href: '/admin' },
            { label: 'Sales team' },
          ]}
          actions={
            <Link
              href="/admin/sales-team/new"
              className={opsButtonClass({ variant: 'primary', size: 'md' })}
            >
              New rep
            </Link>
          }
        />
        <div className="mx-auto max-w-screen-md px-4 py-6">
          {reps.length === 0 ? (
            <p className="rounded-md border border-border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
              No sales reps yet.
            </p>
          ) : (
            <ul className="rounded-md border border-border bg-card">
              {reps.map((rep) => (
                <li key={rep.id} className="border-b border-border px-4 py-3 last:border-b-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-medium text-brand-navy">
                      {rep.name}
                    </span>
                    <span className="text-xs text-muted-foreground">{rep.id}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-foreground">{rep.email}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Territories: {rep.territories.join(', ')}{' '}
                    <span aria-hidden>&middot;</span>{' '}
                    Programmes: {rep.programmes.join(', ')}
                    {rep.active ? '' : ' (inactive)'}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
    </>
  )
}
