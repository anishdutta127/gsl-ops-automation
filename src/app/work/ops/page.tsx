/*
 * /work/ops - Ops daily priority queue (Step 3).
 *
 * The "My work" focus view: 4 urgency-ordered tiles + the active tile's
 * list. Reads Step 2 opsReviewStatus + dispatch/welcome status; no new
 * state, no wall of charts. The old /dashboard/ops stays dormant.
 */

import { redirect } from 'next/navigation'
import { TopNav } from '@/components/ops/TopNav'
import { PageHeader } from '@/components/ops/PageHeader'
import { RoleQueueBoard } from '@/components/dashboard/RoleQueueBoard'
import { mouRepo } from '@/lib/db/repos/mou'
import { kitDispatchRepo } from '@/lib/db/repos/kitDispatch'
import { welcomeNoteRepo } from '@/lib/db/repos/step3'
import { getCurrentUser } from '@/lib/auth/session'
import { computeOpsQueue } from '@/lib/dashboard/roleQueues'

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function OpsWorkPage({ searchParams }: PageProps) {
  const user = await getCurrentUser()
  if (!user) redirect('/login?next=%2Fwork%2Fops')
  const sp = await searchParams
  const activeTile = typeof sp.tile === 'string' ? sp.tile : null

  const [mous, kitDispatches, welcomeNotes] = await Promise.all([
    mouRepo.findAll(),
    kitDispatchRepo.findAll(),
    welcomeNoteRepo.findAll(),
  ])
  const tiles = computeOpsQueue({ mous, kitDispatches, welcomeNotes })

  return (
    <>
      <TopNav currentPath="/work/ops" />
      <main id="main-content">
        <PageHeader title="Ops - my work" subtitle="Your four daily priorities. Click a tile to focus the list." />
        <div className="mx-auto max-w-screen-xl px-4 py-6">
          <RoleQueueBoard basePath="/work/ops" tiles={tiles} activeTileKey={activeTile} />
        </div>
      </main>
    </>
  )
}
