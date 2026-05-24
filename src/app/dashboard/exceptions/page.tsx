/*
 * /dashboard/exceptions
 *
 * Full flat list of every exception that the dashboard preview
 * truncated. Same aggregator (buildExceptionFeed); same per-role
 * scoping. Useful as an inner navigation target from email pings
 * ("View all exceptions").
 */

import type { Communication, Feedback } from '@/lib/types'
// P4 batch 2 (2026-05-24): live repo reads.
import { mouRepo } from '@/lib/db/repos/mou'
import { schoolRepo } from '@/lib/db/repos/school'
import { dispatchRepo } from '@/lib/db/repos/dispatch'
import { paymentRepo } from '@/lib/db/repos/payment'
import { communicationRepo, feedbackRepo } from '@/lib/db/repos/leafRepos'
import { getCurrentUser } from '@/lib/auth/session'
import { buildExceptionFeed } from '@/lib/dashboard/exceptions'
import { TopNav } from '@/components/ops/TopNav'
import { PageHeader } from '@/components/ops/PageHeader'
import { ExceptionRow } from '@/components/ops/ExceptionRow'

export default async function ExceptionsPage() {
  const user = await getCurrentUser()
  const [mous, schools, dispatches, payments, communications, feedback] =
    await Promise.all([
      mouRepo.findAll(),
      schoolRepo.findAll(),
      dispatchRepo.findAll(),
      paymentRepo.findAll(),
      communicationRepo.findAll() as Promise<Communication[]>,
      feedbackRepo.findAll() as Promise<Feedback[]>,
    ])
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
            { label: 'Overview', href: '/overview' },
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
