/*
 * /dashboard/leadership (Gate 3.5 Step 2 rebuild; Step 8 extracted
 * the body to LeadershipOverview so /admin can reuse it).
 *
 * Reads the canonical data files, computes leadership KPIs +
 * attention items, and renders the shared LeadershipOverview.
 */

import { redirect } from 'next/navigation'
import type { Escalation, KitDispatch, MOU, Payment, School } from '@/lib/types'
import mousJson from '@/data/mous.json'
import paymentsJson from '@/data/payments.json'
import schoolsJson from '@/data/schools.json'
import escalationsJson from '@/data/escalations.json'
import kitDispatchesJson from '@/data/kit_dispatches.json'
import { getCurrentUser } from '@/lib/auth/session'
import { TopNav } from '@/components/ops/TopNav'
import {
  computeAttentionItems,
  computeDeliveryHealth,
  computeFinancialHealth,
} from '@/lib/dashboard/leadershipData'
import { LeadershipOverview } from '@/components/dashboard/LeadershipOverview'

const allMous = mousJson as unknown as MOU[]
const allPayments = paymentsJson as unknown as Payment[]
const allSchools = schoolsJson as unknown as School[]
const allEscalations = escalationsJson as unknown as Escalation[]
const allKitDispatches = kitDispatchesJson as unknown as KitDispatch[]

const CURRENT_FY = '2026-27'

export default async function LeadershipDashboard() {
  const user = await getCurrentUser()
  if (!user) redirect('/login?next=%2Fdashboard%2Fleadership')

  const now = new Date()
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
