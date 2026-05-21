/*
 * / Action-first homepage (Phase 6F Part 3).
 *
 * Replaces the Gate 3.6 five-zone landing per Ameet's directive: when
 * a user opens the platform, they see what they need to do today, not
 * aggregated metrics. The legacy 5-zone surface moves to
 * /dashboard/overview and is linked from this page's footer.
 *
 * Data flow: the engine at src/lib/homepage/actionQueue.ts produces
 * the ActionItem[] from the canonical data files. This page resolves
 * the user view, splits the queue into "Your queue" / "Team blockers"
 * (Leadership view uses the LeadershipAggregate component instead),
 * and renders the cards.
 *
 * Single-<main> rule: the root layout owns the only <main>; this
 * page returns its content inside a fragment + <div>.
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
} from '@/lib/types'
import mousJson from '@/data/mous.json'
import paymentsJson from '@/data/payments.json'
import paymentLogsJson from '@/data/payment_logs.json'
import schoolsJson from '@/data/schools.json'
import escalationsJson from '@/data/escalations.json'
import dispatchesJson from '@/data/dispatches.json'
import kitDispatchesJson from '@/data/kit_dispatches.json'
import { getCurrentUser } from '@/lib/auth/session'
import { TopNav } from '@/components/ops/TopNav'
import { ActionQueueLayout } from '@/components/homepage/ActionQueueLayout'
import { LeadershipAggregate } from '@/components/homepage/LeadershipAggregate'
import { buildActionQueue, resolveHomepageView } from '@/lib/homepage/actionQueue'
import { NO_OP_AI_INSIGHTS } from '@/lib/homepage/aiInsights'

const allMous = mousJson as unknown as MOU[]
const allPayments = paymentsJson as unknown as Payment[]
const allPaymentLogs = paymentLogsJson as unknown as PaymentLog[]
const allSchools = schoolsJson as unknown as School[]
const allEscalations = escalationsJson as unknown as Escalation[]
const allDispatches = dispatchesJson as unknown as Dispatch[]
const allKitDispatches = kitDispatchesJson as unknown as KitDispatch[]

function partOfDay(now: Date): string {
  const hour = now.getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

function todayLine(now: Date): string {
  // British spelling, no em-dash. eg "Thursday 21 May 2026".
  const weekday = now.toLocaleDateString('en-GB', { weekday: 'long' })
  const day = now.getDate()
  const month = now.toLocaleDateString('en-GB', { month: 'long' })
  const year = now.getFullYear()
  return `${weekday} ${day} ${month} ${year}`
}

const ROLE_TAG: Record<ReturnType<typeof resolveHomepageView>, string> = {
  admin: 'Admin',
  leadership: 'Leadership',
  finance: 'Finance',
  ops: 'Ops',
  sales: 'Sales',
}

export default async function HomePage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login?next=%2F')

  const now = new Date()

  const { view, items } = await buildActionQueue(
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
      },
    },
    NO_OP_AI_INSIGHTS,
  )

  const greeting = `${partOfDay(now)}, ${user.name.split(' ')[0]}`
  const today = todayLine(now)

  // Leadership users get the platform-pulse aggregate instead of a
  // personal queue.
  if (view === 'leadership') {
    return (
      <>
        <TopNav currentPath="/" />
        <LeadershipAggregate
          greeting={greeting}
          todayLine={today}
          items={items}
          fallbackOverviewHref="/dashboard/overview"
        />
      </>
    )
  }

  // For Finance / Ops / Sales / Admin, partition the queue into
  // "Your queue" (items tagged to your role) vs "Team blockers"
  // (items tagged Both - they're system-wide signals every role
  // should see, but in the queue layout we surface them on the right
  // so the user's department-specific work dominates the left
  // column). Admin sees everything in "Your queue" (no Team column).
  const yourQueue =
    view === 'admin'
      ? items.filter((i) => i.category !== 'ai-insight')
      : items.filter((i) => i.role === view && i.category !== 'ai-insight')
  const teamBlockers =
    view === 'admin'
      ? []
      : items.filter((i) => i.role === 'both' && i.category !== 'ai-insight')
  const aiInsights = items.filter((i) => i.category === 'ai-insight')

  return (
    <>
      <TopNav currentPath="/" />
      <ActionQueueLayout
        greeting={greeting}
        todayLine={today}
        roleTag={ROLE_TAG[view]}
        yourQueue={yourQueue}
        teamBlockers={teamBlockers}
        aiInsights={aiInsights}
        fallbackOverviewHref="/dashboard/overview"
      />
    </>
  )
}
