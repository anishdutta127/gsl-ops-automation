/*
 * /operations/review (Step 2, item 6).
 *
 * Ops queue for the two-process model: every MOU Finance has entered that
 * is awaiting Ops review (opsReviewStatus 'Pending for review' / 'In
 * Review'). Opening a row lands on the per-MOU Ops review screen.
 */

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { TopNav } from '@/components/ops/TopNav'
import { PageHeader } from '@/components/ops/PageHeader'
import { StatusChip } from '@/components/ops/StatusChip'
import { mouRepo } from '@/lib/db/repos/mou'
import { getCurrentUser } from '@/lib/auth/session'

const OPEN_STATES = new Set(['Pending for review', 'In Review'])

export default async function OpsReviewQueuePage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login?next=%2Foperations%2Freview')

  const mous = await mouRepo.findAll()
  const pending = mous
    .filter((m) => OPEN_STATES.has(m.opsReviewStatus ?? ''))
    .sort((a, b) => a.schoolName.localeCompare(b.schoolName))

  return (
    <>
      <TopNav currentPath="/operations" />
      <main id="main-content">
        <PageHeader
          title="Ops review queue"
          subtitle="MOUs entered by Finance, awaiting Ops product assignment + dispatch alignment."
          breadcrumb={[{ label: 'Operations', href: '/operations' }, { label: 'Review' }]}
        />
        <div className="mx-auto max-w-screen-lg px-4 py-6">
          {pending.length === 0 ? (
            <div className="rounded-md border border-border bg-card p-8 text-center text-sm text-slate-500" data-testid="ops-review-empty">
              Nothing pending Ops review.
            </div>
          ) : (
            <div className="overflow-hidden rounded-md border border-border bg-card" data-testid="ops-review-queue">
              <table className="min-w-full text-sm">
                <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-slate-600">
                  <tr>
                    <th className="px-4 py-2 font-medium">School</th>
                    <th className="px-4 py-2 font-medium">MOU</th>
                    <th className="px-4 py-2 font-medium">Programme / Year</th>
                    <th className="px-4 py-2 font-medium">Status</th>
                    <th className="px-4 py-2 font-medium">Products</th>
                  </tr>
                </thead>
                <tbody>
                  {pending.map((m) => (
                    <tr key={m.id} className="border-b border-border/60 hover:bg-muted/30">
                      <td className="px-4 py-2">
                        <Link href={`/operations/review/${m.id}`} className="font-medium text-brand-navy underline-offset-2 hover:underline">
                          {m.schoolName}
                        </Link>
                      </td>
                      <td className="px-4 py-2 text-slate-600">{m.id}</td>
                      <td className="px-4 py-2 text-slate-600">{m.programme} - {m.academicYear}</td>
                      <td className="px-4 py-2">
                        <StatusChip tone="attention" label={m.opsReviewStatus ?? 'Pending for review'} withDot={false} />
                      </td>
                      <td className="px-4 py-2 text-slate-600">{(m.products?.length ?? 0)} assigned</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </>
  )
}
