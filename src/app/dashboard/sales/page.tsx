/*
 * /dashboard/sales (Gate 1 Step 3 dept dashboard skeleton).
 *
 * Sales department lands here on login. Phase 1 ships the layout +
 * dept-aware accent + primary action links. Gate 5 populates KPIs
 * and dept-scoped exception feed.
 */

import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/session'
import { TopNav } from '@/components/ops/TopNav'
import {
  DepartmentDashboardSkeleton,
  type PrimaryAction,
} from '@/components/ops/DepartmentDashboardSkeleton'

const PRIMARY_ACTIONS: PrimaryAction[] = [
  {
    label: 'Sales pipeline',
    href: '/sales-pipeline',
    description: 'Pre-MOU opportunities, drafts, and signed registry.',
  },
  {
    label: 'Active MOUs',
    href: '/mous',
    description: 'Lifecycle hub for every signed MOU.',
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
        <DepartmentDashboardSkeleton
          user={user}
          stageDepartment="sales"
          title="Sales workspace"
          subtitle="Track your pipeline, signed MOUs, school master, and dispatch approvals."
          primaryActions={PRIMARY_ACTIONS}
          recentActivity={[]}
        />
      </main>
    </>
  )
}
