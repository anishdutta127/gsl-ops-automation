/*
 * /dashboard/sales (Gate 1 Step 3 dept dashboard; Gate 3.5 Step 3 placeholder).
 *
 * Sales department lands here on login. Gate 3.5 Step 3 hides the
 * Sales Pipeline tile (per Anish: Sales module returns later). The
 * placeholder card surfaces the MOU drafting path for now; the
 * remaining three primary actions (MOUs, Schools, Approve dispatches)
 * stay so Sales reps can keep doing their non-pipeline work.
 */

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowRight, Info } from 'lucide-react'
import { getCurrentUser } from '@/lib/auth/session'
import { TopNav } from '@/components/ops/TopNav'
import {
  DepartmentDashboardSkeleton,
  type PrimaryAction,
} from '@/components/ops/DepartmentDashboardSkeleton'

const PRIMARY_ACTIONS: PrimaryAction[] = [
  {
    label: 'Active MOUs',
    href: '/mous',
    description: 'Lifecycle hub for every signed MOU.',
  },
  {
    label: 'Draft new MOU',
    href: '/mous/new',
    description: 'Start a new MOU from scratch or for an existing school.',
  },
  {
    label: 'Schools',
    href: '/schools',
    description: 'Edit school master data and SPOC contacts.',
  },
  {
    label: 'Approve dispatches',
    href: '/dispatch',
    description: 'Sales sign-off on Ops dispatch requests.',
  },
]

export default async function SalesDashboard() {
  const user = await getCurrentUser()
  if (!user) redirect('/login?next=%2Fdashboard%2Fsales')

  return (
    <>
      <TopNav currentPath="/dashboard/sales" />
      <main id="main-content">
        <div className="mx-auto max-w-screen-xl px-4 pt-6 sm:px-6">
          <div
            data-testid="sales-pipeline-placeholder"
            className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
          >
            <div className="flex items-start gap-2">
              <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
              <div className="flex-1">
                <p className="font-medium">Sales module coming in next phase.</p>
                <p className="mt-1 text-amber-800">
                  Pre-MOU pipeline tracking is paused while we settle the
                  operations + finance core. For now, use{' '}
                  <Link
                    href="/mous/new"
                    className="font-semibold underline-offset-2 hover:underline"
                  >
                    MOU drafting
                    <ArrowRight aria-hidden className="ml-0.5 inline size-3" />
                  </Link>{' '}
                  to record signed MOUs.
                </p>
              </div>
            </div>
          </div>
        </div>
        <DepartmentDashboardSkeleton
          user={user}
          stageDepartment="sales"
          title="Sales workspace"
          subtitle="Active MOUs, schools, and dispatch approvals. Pipeline tracking returns in the next phase."
          primaryActions={PRIMARY_ACTIONS}
          recentActivity={[]}
        />
      </main>
    </>
  )
}
