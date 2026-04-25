/*
 * /dashboard/exceptions
 *
 * Full flat list of every exception that the dashboard preview
 * truncated. Same aggregator (buildExceptionFeed); same per-role
 * scoping. Useful as an inner navigation target from email pings
 * ("View all exceptions").
 */

import type {
  Communication,
  Dispatch,
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
import { getCurrentUser } from '@/lib/auth/session'
import { buildExceptionFeed } from '@/lib/dashboard/exceptions'
import { TopNav } from '@/components/ops/TopNav'
import { PageHeader } from '@/components/ops/PageHeader'
import { ExceptionRow } from '@/components/ops/ExceptionRow'

const mous = mousJson as unknown as MOU[]
const schools = schoolsJson as unknown as School[]
const dispatches = dispatchesJson as unknown as Dispatch[]
const payments = paymentsJson as unknown as Payment[]
const communications = communicationsJson as unknown as Communication[]
const feedback = feedbackJson as unknown as Feedback[]

export default async function ExceptionsPage() {
  const user = await getCurrentUser()
  const exceptions = buildExceptionFeed({
    mous, schools, dispatches, payments, communications, feedback, user,
  })

  return (
    <>
      <TopNav currentPath="/dashboard/exceptions" />
      <main id="main-content">
        <PageHeader
          title="All exceptions"
          subtitle={`${exceptions.length} item${exceptions.length === 1 ? '' : 's'} needing attention`}
          breadcrumb={[
            { label: 'Dashboard', href: '/dashboard' },
            { label: 'Exceptions' },
          ]}
        />
        <div className="mx-auto max-w-screen-xl px-4 py-6">
          <div className="overflow-hidden rounded-lg border border-border bg-card">
            {exceptions.length === 0 ? (
              <p className="px-4 py-12 text-center text-sm text-muted-foreground">
                No exceptions right now.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {exceptions.map((e) => (
                  <li key={e.id}>
                    <ExceptionRow
                      schoolName={e.schoolName}
                      description={e.description}
                      daysSince={e.daysSince}
                      priority={e.priority}
                      iconType={e.iconType}
                      href={e.href}
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </main>
    </>
  )
}
