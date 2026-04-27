/*
 * /dashboard (W3-F alias).
 *
 * Bookmark-compatibility alias for /overview. Pre-W3-F /dashboard
 * was the Leadership Console homepage; W3-F moves the kanban to /
 * and the Leadership Console to /overview as a sibling tab. This
 * route stays addressable so existing bookmarks, audit-log links,
 * and external references continue to work; it renders the same
 * OverviewContent body and the same tab strip with Overview active.
 *
 * The currentPath="/dashboard" prop on TopNav keeps any future
 * /dashboard-rooted nav highlight working; activeTab="overview"
 * makes the in-content tab indicator agree with the canonical
 * /overview tab. Identical data slice, identical aggregation libs.
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

export default async function DashboardPage() {
  const user = await getCurrentUser()
  // W4-A.3: see /overview for the active vs allMous split rationale.
  const activeMous = mous.filter((m) => m.cohortStatus === 'active')
  return (
    <>
      <TopNav currentPath="/dashboard" />
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
