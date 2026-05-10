/*
 * /dashboard/finance (Gate 1 Step 3 dept dashboard skeleton).
 *
 * Finance department lands here on login. Phase 1 ships the layout +
 * dept-aware accent + primary action links. Gate 5 populates KPIs
 * and dept-scoped exception feed; Gate 2 wires the PI generation +
 * payment matching modules under /finance.
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
    label: 'Finance workspace',
    href: '/finance',
    description: 'PI generation, payment matching, Tally export, adjustments.',
  },
  {
    label: 'Inventory',
    href: '/admin/inventory',
    description: 'Per-SKU stock + reorder thresholds.',
  },
  {
    label: 'Active MOUs',
    href: '/mous',
    description: 'Read-only access to MOU lifecycle for context.',
  },
  {
    label: 'Execute dispatches',
    href: '/dispatch',
    description: 'Post-payment release authorisation.',
  },
]

export default async function FinanceDashboard() {
  const user = await getCurrentUser()
  if (!user) redirect('/login?next=%2Fdashboard%2Ffinance')

  return (
    <>
      <TopNav currentPath="/dashboard/finance" />
      <main id="main-content">
        <DepartmentDashboardSkeleton
          user={user}
          stageDepartment="finance"
          title="Finance workspace"
          subtitle="Generate PIs, match payments, manage adjustments, and authorise dispatch release."
          primaryActions={PRIMARY_ACTIONS}
          recentActivity={[]}
        />
      </main>
    </>
  )
}
