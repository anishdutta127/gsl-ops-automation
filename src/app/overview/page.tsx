/*
 * /overview (W3-F).
 *
 * The Leadership Console content (5 health tiles + exception feed +
 * open-escalation list + 10 trigger tiles) lives here post W3-F.
 * Pre-W3-F this content was the homepage at /dashboard; W3-F moves
 * it to /overview as a sibling tab to the new kanban homepage at /.
 *
 * /dashboard aliases this route for bookmark compatibility (same
 * content, same tab-active state).
 */

import type {
  Communication,
  Dispatch,
  Escalation,
  Feedback,
  MOU,
  Payment,
  School,
} from '@/lib/types'
import mousJson from '@/data/mous.json'
import schoolsJson from '@/data/schools.json'
import dispatchesJson from '@/data/dispatches.json'
import paymentsJson from '@/data/payments.json'
import communicationsJson from '@/data/communications.json'
import feedbackJson from '@/data/feedback.json'
import escalationsJson from '@/data/escalations.json'
import { getCurrentUser } from '@/lib/auth/session'
import { TopNav } from '@/components/ops/TopNav'
import { PageHeader } from '@/components/ops/PageHeader'
import { KanbanOverviewTabs } from '@/components/ops/KanbanOverviewTabs'
import { OverviewContent } from '@/components/ops/OverviewContent'

const mous = mousJson as unknown as MOU[]
const schools = schoolsJson as unknown as School[]
const dispatches = dispatchesJson as unknown as Dispatch[]
const payments = paymentsJson as unknown as Payment[]
const communications = communicationsJson as unknown as Communication[]
const feedback = feedbackJson as unknown as Feedback[]
const escalations = escalationsJson as unknown as Escalation[]

export default async function OverviewPage() {
  const user = await getCurrentUser()
  // W4-A.3: health tiles + exception feed + trigger tiles operate on the
  // operationally-current cohort. Archived MOUs (prior-AY) are not in the
  // pursuit anymore, so their counts would distort the at-a-glance read.
  // Open escalations, however, are NOT filtered here; see the escalation
  // list section, which keeps every open escalation regardless of cohort
  // (an unresolved 2025-26 escalation still needs closing).
  const activeMous = mous.filter((m) => m.cohortStatus === 'active')
  return (
    <>
      <TopNav currentPath="/overview" />
      <main id="main-content">
        <PageHeader title="Ops at a glance" subtitle={user ? `Signed in as ${user.name}` : undefined} />
        <KanbanOverviewTabs activeTab="overview" />
        <OverviewContent
          user={user}
          mous={activeMous}
          allMous={mous}
          schools={schools}
          dispatches={dispatches}
          payments={payments}
          communications={communications}
          feedback={feedback}
          escalations={escalations}
        />
      </main>
    </>
  )
}
