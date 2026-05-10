/*
 * /dashboard/leadership (Gate 1 Step 3 dept dashboard skeleton).
 *
 * Leadership lands here on login. Phase 1 ships the layout + neutral
 * accent + cross-functional primary action links. Gate 5 populates
 * the Leadership Console with aggregate KPIs across all stages.
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
    label: 'Reports',
    href: '/reports',
    description: 'Cross-functional analytics and aggregate KPIs.',
  },
  {
    label: 'Operations Control Dashboard',
    href: '/',
    description: 'School onboarding, orders, shipments, inventory at a glance.',
  },
  {
    label: 'Escalations',
    href: '/escalations',
    description: 'Open tickets across every department.',
  },
  {
    label: 'Active MOUs',
    href: '/mous',
    description: 'Lifecycle hub spanning sign through completion.',
  },
]

export default async function LeadershipDashboard() {
  const user = await getCurrentUser()
  if (!user) redirect('/login?next=%2Fdashboard%2Fleadership')

  return (
    <>
      <TopNav currentPath="/dashboard/leadership" />
      <main id="main-content">
        <DepartmentDashboardSkeleton
          user={user}
          stageDepartment="cross-functional"
          title="Leadership console"
          subtitle="Read-most surface across Sales, Ops, and Finance. Selective edits via reports + escalation oversight."
          primaryActions={PRIMARY_ACTIONS}
          recentActivity={[]}
        />
      </main>
    </>
  )
}
