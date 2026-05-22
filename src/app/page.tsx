/*
 * / homepage (Phase 6F.1 restore + new attention snapshot strip).
 *
 * Phase 6F.1 reverts the front door to the 5-zone consolidated landing
 * (commercial position, operational position, drill-down tiles, quick
 * actions, attention list). Phase 6F's full action queue moves to
 * /today; the queue engine still drives a collapsible "Needs
 * attention" strip on top of this page so the daily action signal
 * stays glanceable without overwhelming the front door.
 *
 * Data flow + zone composition are the same as the pre-6F landing
 * (which 6F preserved at /dashboard/overview, now redirected back
 * here).
 *
 * Single-<main> rule still applies: the root layout owns the only
 * <main>; this page wraps its content in fragments + <div>s.
 */

import { redirect } from 'next/navigation'
import type {
  Dispatch,
  Escalation,
  KitDispatch,
  MOU,
  Payment,
  PaymentLog,
  School,
  User,
} from '@/lib/types'
import mousJson from '@/data/mous.json'
import paymentsJson from '@/data/payments.json'
import paymentLogsJson from '@/data/payment_logs.json'
import schoolsJson from '@/data/schools.json'
import escalationsJson from '@/data/escalations.json'
import dispatchesJson from '@/data/dispatches.json'
import kitDispatchesJson from '@/data/kit_dispatches.json'
import homepageActionLogJson from '@/data/homepage_action_log.json'
import usersJson from '@/data/users.json'
import { getCurrentUser } from '@/lib/auth/session'
import { canEditMOU } from '@/lib/access'
import { TopNav } from '@/components/ops/TopNav'
import { ConsolidatedLanding } from '@/components/dashboard/ConsolidatedLanding'
import { AttentionSnapshotStrip } from '@/components/homepage/AttentionSnapshotStrip'
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
import { buildActionQueue } from '@/lib/homepage/actionQueue'
import { NO_OP_AI_INSIGHTS } from '@/lib/homepage/aiInsights'
import {
  applyDismissals,
  applyRollover,
  type ActionLogEntry,
} from '@/lib/homepage/rollover'

const allMous = mousJson as unknown as MOU[]
const allPayments = paymentsJson as unknown as Payment[]
const allPaymentLogs = paymentLogsJson as unknown as PaymentLog[]
const allSchools = schoolsJson as unknown as School[]
const allEscalations = escalationsJson as unknown as Escalation[]
const allDispatches = dispatchesJson as unknown as Dispatch[]
const allKitDispatches = kitDispatchesJson as unknown as KitDispatch[]
const allUsers = usersJson as unknown as User[]

export default async function HomePage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login?next=%2F')

  const now = new Date()
  const fy = currentFiscalYear(now)

  // 5-zone data: identical to the pre-6F landing.
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

  // Action-queue snapshot data: the strip surfaces the top items the
  // user owns, with the engine's role-tagging + rollover applied.
  const { view, items: rawItems } = await buildActionQueue(
    {
      now,
      user,
      data: {
        mous: allMous,
        payments: allPayments,
        paymentLogs: allPaymentLogs,
        schools: allSchools,
        dispatches: allDispatches,
        kitDispatches: allKitDispatches,
        escalations: allEscalations,
        users: allUsers,
      },
    },
    NO_OP_AI_INSIGHTS,
  )
  const todayIso = now.toISOString().slice(0, 10)
  const log = homepageActionLogJson as unknown as ActionLogEntry[]
  const promoted = applyRollover(rawItems, { todayIso, user: { id: user.id }, log })
  const stripItems = applyDismissals(promoted, {
    todayIso,
    user: { id: user.id },
    log,
  })

  return (
    <>
      <TopNav currentPath="/" />
      <AttentionSnapshotStrip view={view} items={stripItems} />
      <div
        className="mx-auto max-w-screen-xl px-4 py-6 sm:px-6"
        data-testid="overview-landing-root"
      >
        <header className="mb-5">
          <h1 className="font-heading text-2xl font-bold text-brand-navy">
            GSL Ops Platform - overview
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Welcome, {user.name}. Today&apos;s signal across commercial,
            operational, and attention. Action queue lives at{' '}
            <a href="/today" className="text-brand-navy underline-offset-2 hover:underline">
              /today
            </a>
            .
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
