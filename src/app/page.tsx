/*
 * / Consolidated landing (Gate 3.6).
 *
 * Pre-Gate-3.6 this URL hosted the Operations Control Dashboard.
 * Gate 3.6 replaces it with a deliberately-designed five-zone
 * orientation surface: Commercial position, Operational position,
 * Items requiring attention, Quick actions, drill-down tiles to
 * the dedicated dept dashboards. The Operations Control Dashboard
 * moved to /dashboard/ops.
 *
 * Design intent: orient any user (Leadership, Ops, Finance, Admin)
 * in five seconds and route them to their workspace in one click.
 *
 * Data flow: every zone is computed at request time from the
 * canonical data files via `src/lib/dashboard/landingData.ts`. No
 * filter UI on the landing itself: filters belong on the deeper
 * department dashboards where analysis happens.
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

export default async function HomePage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login?next=%2F')

  const now = new Date()
  const fy = currentFiscalYear(now)

  const commercial = computeCommercialPosition({
    mous: allMous,
    payments: allPayments,
    fy,
    now,
  })
  const operational = computeOperationalPosition({
    mous: allMous,
    dispatches: allKitDispatches,
    payments: allPayments,
    now,
  })
  // Gate 4.7 Step 3: collect critical changes in the last 24h across
  // every MOU. Cap at 5 per MOU (top-most recent) and 50 overall so
  // the interleave doesn't blow up on a heavy-activity day; the
  // landing zone itself further caps total visible items to 5.
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

  // Per CLAUDE.md "Single-<main> rule": the root layout owns the only
  // <main id="main-content">. This page wraps its content in a <div>
  // so the skip-link target stays valid.
  return (
    <>
      <TopNav currentPath="/" />
      <div className="mx-auto max-w-screen-xl px-4 py-6 sm:px-6" data-testid="landing-root">
        <header className="mb-5">
          <h1 className="font-heading text-2xl font-bold text-brand-navy">
            GSL Ops Platform
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Welcome, {user.name}. Today&apos;s signal across commercial,
            operational, and attention.
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
