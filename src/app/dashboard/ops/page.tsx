/*
 * /dashboard/ops (Gate 1 Step 3 dept dashboard skeleton).
 *
 * Ops department lands here on login. Phase 1 ships the layout +
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
    label: 'Raise dispatch',
    href: '/dispatch',
    description: 'Kit dispatch requests and shipment tracking.',
  },
  {
    label: 'Operations workspace',
    href: '/operations',
    description: 'Schools, escalations, VEX, vendors, inventory in one place.',
  },
  {
    label: 'Escalations',
    href: '/escalations',
    description: 'Categorise, transition, and transfer tickets.',
  },
  {
    label: 'Active MOUs',
    href: '/mous',
    description: 'Read-only access to MOU lifecycle for context.',
  },
]

export default async function OpsDashboard() {
  const user = await getCurrentUser()
  if (!user) redirect('/login?next=%2Fdashboard%2Fops')

  return (
    <>
      <TopNav currentPath="/dashboard/ops" />
      <main id="main-content">
        <DepartmentDashboardSkeleton
          user={user}
          stageDepartment="ops"
          title="Operations workspace"
          subtitle="Drive dispatches, escalations, schools, and inventory through the pipeline."
          primaryActions={PRIMARY_ACTIONS}
          recentActivity={[]}
        />
      </main>
    </>
  )
}
