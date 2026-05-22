/*
 * /today action-queue drill-down (Phase 6F.1).
 *
 * Phase 6F shipped the action queue as the front door at /. Phase 6F.1
 * restores the 5-zone landing as the front door and moves the full
 * action queue here. Operators reach this page via the collapsible
 * "Needs attention" strip on / (View all) or via direct link.
 *
 * Data flow + role partitioning are unchanged from the original
 * Phase 6F /page.tsx. Single-<main> rule still applies: the root
 * layout owns the only <main>; this page returns its content inside a
 * fragment + <div>.
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
import { TopNav } from '@/components/ops/TopNav'
import { ActionQueueLayout } from '@/components/homepage/ActionQueueLayout'
import { LeadershipAggregate } from '@/components/homepage/LeadershipAggregate'
import { buildActionQueue, resolveHomepageView } from '@/lib/homepage/actionQueue'
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

export default async function TodayPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login?next=%2Ftoday')

  const now = new Date()

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

  // Phase 6F Part 4 (preserved in 6F.1): apply rollover + dismissal
  // honour. Items the user has dismissed today stay hidden UNLESS they
  // promoted to overdue. Items unactioned across multiple days get a
  // higher urgencyScore + a "Carried over" pill.
  const todayIso = now.toISOString().slice(0, 10)
  const log = homepageActionLogJson as unknown as ActionLogEntry[]
  const promoted = applyRollover(rawItems, { todayIso, user: { id: user.id }, log })
  const items = applyDismissals(promoted, { todayIso, user: { id: user.id }, log })

  const greeting = `${partOfDay(now)}, ${user.name.split(' ')[0]}`
  const today = todayLine(now)

  // Leadership users get the platform-pulse aggregate instead of a
  // personal queue.
  if (view === 'leadership') {
    return (
      <>
        <TopNav currentPath="/today" />
        <LeadershipAggregate
          greeting={greeting}
          todayLine={today}
          items={items}
          fallbackOverviewHref="/"
        />
      </>
    )
  }

  // For Finance / Ops / Sales / Admin, partition the queue into
  // "Your queue" (items tagged to your role) vs "Team blockers"
  // (items tagged Both). Admin sees everything in "Your queue" (no
  // Team column).
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
      <TopNav currentPath="/today" />
      <ActionQueueLayout
        greeting={greeting}
        todayLine={today}
        roleTag={ROLE_TAG[view]}
        yourQueue={yourQueue}
        teamBlockers={teamBlockers}
        aiInsights={aiInsights}
        fallbackOverviewHref="/"
      />
    </>
  )
}
