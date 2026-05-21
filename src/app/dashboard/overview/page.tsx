/*
 * /dashboard/overview (Phase 6F Part 3).
 *
 * Home of the legacy 5-zone landing surface previously at `/`. Phase
 * 6F replaced `/` with an action-first daily queue per Ameet's
 * directive; this route preserves the orientation surface for the
 * users who want it. Linked from the homepage footer ("Looking for
 * the legacy 5-zone overview? Open the full overview dashboard.").
 *
 * Data flow + zone composition: identical to the pre-Phase-6F `/`.
 * Single-<main> rule still applies: the root layout owns the only
 * <main>; this page wraps in a <div>.
 */

import { redirect } from 'next/navigation'
import type {
  Escalation,
  KitDispatch,
  MOU,
  Payment,
  PaymentLog,
  School,
} from '@/lib/types'
import mousJson from '@/data/mous.json'
import paymentsJson from '@/data/payments.json'
import paymentLogsJson from '@/data/payment_logs.json'
import schoolsJson from '@/data/schools.json'
import escalationsJson from '@/data/escalations.json'
import kitDispatchesJson from '@/data/kit_dispatches.json'
import { getCurrentUser } from '@/lib/auth/session'
import { canEditMOU } from '@/lib/access'
import { TopNav } from '@/components/ops/TopNav'
import { ConsolidatedLanding } from '@/components/dashboard/ConsolidatedLanding'
import {
  computeCommercialPosition,
  computeLandingAttention,
  computeOperationalPosition,
  computeTileSlices,
  currentFiscalYear,
  type LandingCriticalChange,
} from '@/lib/dashboard/landingData'
import {
  collectCriticalChanges,
  withinTrailingWindow,
} from '@/lib/criticalChanges'

const allMous = mousJson as unknown as MOU[]
const allPayments = paymentsJson as unknown as Payment[]
const allPaymentLogs = paymentLogsJson as unknown as PaymentLog[]
const allSchools = schoolsJson as unknown as School[]
const allEscalations = escalationsJson as unknown as Escalation[]
const allKitDispatches = kitDispatchesJson as unknown as KitDispatch[]

export default async function OverviewPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login?next=%2Fdashboard%2Foverview')

  const now = new Date()
  const fy = currentFiscalYear(now)

  const commercial = computeCommercialPosition({ mous: allMous, payments: allPayments, fy, now })
  const operational = computeOperationalPosition({
    mous: allMous,
    dispatches: allKitDispatches,
    payments: allPayments,
    now,
  })
  const ONE_DAY_MS = 24 * 60 * 60 * 1000
  const recentCriticalChanges: LandingCriticalChange[] = []
  for (const mou of allMous) {
    if (!mou.auditLog || mou.auditLog.length === 0) continue
    const changes = collectCriticalChanges({
      entityType: 'mou',
      entityId: mou.id,
      entityLabel: mou.schoolName,
      hrefBase: '/mous',
      auditLog: mou.auditLog,
    })
    const recent = withinTrailingWindow(changes, now, ONE_DAY_MS)
    for (const c of recent.slice(0, 5)) {
      recentCriticalChanges.push({
        description: `${mou.schoolName}: ${c.action}`,
        href: c.href,
        timestamp: c.timestamp,
      })
      if (recentCriticalChanges.length >= 50) break
    }
    if (recentCriticalChanges.length >= 50) break
  }

  const attention = computeLandingAttention({
    mous: allMous,
    schools: allSchools,
    escalations: allEscalations,
    dispatches: allKitDispatches,
    payments: allPayments,
    now,
    recentCriticalChanges,
  })
  const tiles = computeTileSlices({
    mous: allMous,
    payments: allPayments,
    paymentLogs: allPaymentLogs,
    escalations: allEscalations,
    dispatches: allKitDispatches,
    commercial,
    operational,
  })

  return (
    <>
      <TopNav currentPath="/dashboard/overview" />
      <div className="mx-auto max-w-screen-xl px-4 py-6 sm:px-6" data-testid="overview-landing-root">
        <header className="mb-5">
          <h1 className="font-heading text-2xl font-bold text-brand-navy">
            GSL Ops Platform - overview
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Welcome, {user.name}. Today&apos;s signal across commercial,
            operational, and attention. Action queue lives on the homepage.
          </p>
        </header>
        <ConsolidatedLanding
          commercial={commercial}
          operational={operational}
          attention={attention}
          finance={tiles.finance}
          ops={tiles.ops}
          leadership={tiles.leadership}
          fyLabel={fy}
          canDraftMou={canEditMOU(user)}
        />
      </div>
    </>
  )
}
