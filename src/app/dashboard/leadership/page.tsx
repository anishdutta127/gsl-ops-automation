/*
 * /dashboard/leadership (Gate 3.5 Step 2 rebuild; Step 8 extracted
 * the body to LeadershipOverview so /admin can reuse it).
 *
 * Reads the canonical data files, computes leadership KPIs +
 * attention items, and renders the shared LeadershipOverview.
 */

import { redirect } from 'next/navigation'
// P4 batch 2 (2026-05-24): live repo reads replace static JSON imports.
import { mouRepo } from '@/lib/db/repos/mou'
import { paymentRepo } from '@/lib/db/repos/payment'
import { schoolRepo } from '@/lib/db/repos/school'
import { escalationRepo } from '@/lib/db/repos/escalation'
import { kitDispatchRepo } from '@/lib/db/repos/kitDispatch'
import { getCurrentUser } from '@/lib/auth/session'
import { TopNav } from '@/components/ops/TopNav'
import {
  computeAttentionItems,
  computeDeliveryHealth,
  computeFinancialHealth,
} from '@/lib/dashboard/leadershipData'
import { LeadershipOverview } from '@/components/dashboard/LeadershipOverview'

const CURRENT_FY = '2026-27'

export default async function LeadershipDashboard() {
  const user = await getCurrentUser()
  if (!user) redirect('/login?next=%2Fdashboard%2Fleadership')

  const now = new Date()
  const [allMous, allPayments, allSchools, allEscalations, allKitDispatches] =
    await Promise.all([
      mouRepo.findAll(),
      paymentRepo.findAll(),
      schoolRepo.findAll(),
      escalationRepo.findAll(),
      kitDispatchRepo.findAll(),
    ])
  const financial = computeFinancialHealth({
    mous: allMous,
    payments: allPayments,
    fy: CURRENT_FY,
    now,
  })
  const delivery = computeDeliveryHealth({
    mous: allMous,
    schools: allSchools,
    escalations: allEscalations,
    dispatches: allKitDispatches,
    payments: allPayments,
    now,
  })
  const attention = computeAttentionItems({
    mous: allMous,
    schools: allSchools,
    escalations: allEscalations,
    dispatches: allKitDispatches,
    payments: allPayments,
    now,
  })

  return (
    <>
      <TopNav currentPath="/dashboard/leadership" />
      <main id="main-content" data-testid="leadership-dashboard">
        <div className="mx-auto max-w-screen-xl px-4 py-6 sm:px-6">
          <header className="mb-6">
            <h1 className="font-heading text-2xl font-bold text-brand-navy">
              Leadership console
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              The platform at a glance. Three checks, two tiles, nothing else.
            </p>
          </header>
          <LeadershipOverview
            financial={financial}
            delivery={delivery}
            attention={attention}
            fyLabel={CURRENT_FY}
          />
        </div>
      </main>
    </>
  )
}
