/*
 * /work/finance - Finance daily priority queue (Step 3).
 *
 * 4 urgency-ordered tiles + the active tile's list. Reads instalment status
 * + the Step 2 Ops->Finance dispatch handoff. No pricing/PI logic touched.
 */

import { redirect } from 'next/navigation'
import { TopNav } from '@/components/ops/TopNav'
import { PageHeader } from '@/components/ops/PageHeader'
import { RoleQueueBoard } from '@/components/dashboard/RoleQueueBoard'
import { mouRepo } from '@/lib/db/repos/mou'
import { paymentRepo } from '@/lib/db/repos/payment'
import { getCurrentUser } from '@/lib/auth/session'
import { computeFinanceQueue } from '@/lib/dashboard/roleQueues'

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function FinanceWorkPage({ searchParams }: PageProps) {
  const user = await getCurrentUser()
  if (!user) redirect('/login?next=%2Fwork%2Ffinance')
  const sp = await searchParams
  const activeTile = typeof sp.tile === 'string' ? sp.tile : null

  const [mous, payments] = await Promise.all([
    mouRepo.findAll(),
    paymentRepo.findAll(),
  ])
  const tiles = computeFinanceQueue({ mous, payments })

  return (
    <>
      <TopNav currentPath="/work/finance" />
      <main id="main-content">
        <PageHeader title="Finance - my work" subtitle="Your daily priorities. Click a tile to focus the list." />
        <div className="mx-auto max-w-screen-xl px-4 py-6">
          <RoleQueueBoard basePath="/work/finance" tiles={tiles} activeTileKey={activeTile} />
        </div>
      </main>
    </>
  )
}
