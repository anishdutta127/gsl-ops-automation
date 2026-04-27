/*
 * Homepage (Week 3 W3-C C1 + W3-F): kanban board with tabbed nav.
 *
 * 9 columns: 8 lifecycle stages + Pre-Ops Legacy holding bay. Every
 * Active MOU lands in exactly one column; Pre-Ops cards render
 * one-way exit per the W3-C design (drag in C2 will block drop into
 * Pre-Ops). W3-F moves the Leadership Console to /overview and
 * renders a Kanban / Overview tab strip at the top of both routes
 * so testers can switch view without losing context.
 *
 * Server Component. Reads src/data/*.json at request time. Per-MOU
 * stage derivation is pure (deriveStage). The page itself is
 * deterministic across runs given identical fixture state.
 *
 * UI gating: per W3-B every authenticated user sees this page; the
 * middleware handles unauthenticated -> /login. No role redirects.
 */

import { redirect } from 'next/navigation'
import type {
  Communication,
  Dispatch,
  Feedback,
  MOU,
  Payment,
} from '@/lib/types'
import mousJson from '@/data/mous.json'
import dispatchesJson from '@/data/dispatches.json'
import paymentsJson from '@/data/payments.json'
import communicationsJson from '@/data/communications.json'
import feedbackJson from '@/data/feedback.json'
import { getCurrentUser } from '@/lib/auth/session'
import { deriveStage, KANBAN_COLUMNS, type KanbanStageKey } from '@/lib/kanban/deriveStage'
import { stageEnteredDate, daysSince } from '@/lib/kanban/stageEnteredDate'
import { isOverdue } from '@/lib/kanban/stageDurations'
import { getIncompleteSchools } from '@/lib/schools/dataCompleteness'
import schoolsJson from '@/data/schools.json'
import type { School } from '@/lib/types'
import { TopNav } from '@/components/ops/TopNav'
import { PageHeader } from '@/components/ops/PageHeader'
import { KanbanOverviewTabs } from '@/components/ops/KanbanOverviewTabs'
import { KanbanBoard, type KanbanCardMeta } from '@/components/ops/KanbanBoard'
import { SchoolsNeedingDataTile } from '@/components/ops/SchoolsNeedingDataTile'

const allMous = mousJson as unknown as MOU[]
const allDispatches = dispatchesJson as unknown as Dispatch[]
const allPayments = paymentsJson as unknown as Payment[]
const allCommunications = communicationsJson as unknown as Communication[]
const allFeedback = feedbackJson as unknown as Feedback[]
const allSchools = schoolsJson as unknown as School[]

export default async function HomePage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login?next=%2F')

  const deps = {
    dispatches: allDispatches,
    payments: allPayments,
    communications: allCommunications,
    feedback: allFeedback,
  }

  const initialBuckets: Record<KanbanStageKey, MOU[]> = {
    'pre-ops': [],
    'mou-signed': [],
    'actuals-confirmed': [],
    'cross-verification': [],
    'invoice-raised': [],
    'payment-received': [],
    'kit-dispatched': [],
    'delivery-acknowledged': [],
    'feedback-submitted': [],
  }
  const cardMeta: Record<string, KanbanCardMeta> = {}
  const now = new Date()
  for (const mou of allMous) {
    const stage = deriveStage(mou, deps)
    initialBuckets[stage].push(mou)
    const entered = stageEnteredDate(mou, deps, stage)
    const days = daysSince(entered, now)
    cardMeta[mou.id] = {
      daysInStage: days,
      overdue: isOverdue(stage, days),
    }
  }

  const incompleteSchoolCount = getIncompleteSchools(allSchools, 1).length

  return (
    <>
      <TopNav currentPath="/" />
      <main id="main-content">
        <PageHeader
          title="Kanban"
          subtitle={`${allMous.length} MOUs across ${KANBAN_COLUMNS.length} stages`}
        />
        <KanbanOverviewTabs activeTab="kanban" />
        <div className="mx-auto max-w-screen-2xl space-y-4 px-4 py-6">
          <SchoolsNeedingDataTile count={incompleteSchoolCount} total={allSchools.length} />
          <KanbanBoard initialBuckets={initialBuckets} cardMeta={cardMeta} />
        </div>
      </main>
    </>
  )
}
