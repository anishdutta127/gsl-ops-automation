/*
 * /work/admin - Admin oversight (Step 3).
 *
 * Admin sees across both teams, but still organised, not the old cluttered
 * everything-page. Two calm tile rows (Ops + Finance) whose tiles deep-link
 * into the respective role dashboard's filtered list.
 */

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { TopNav } from '@/components/ops/TopNav'
import { PageHeader } from '@/components/ops/PageHeader'
import { mouRepo } from '@/lib/db/repos/mou'
import { paymentRepo } from '@/lib/db/repos/payment'
import { kitDispatchRepo } from '@/lib/db/repos/kitDispatch'
import { welcomeNoteRepo } from '@/lib/db/repos/step3'
import { getCurrentUser } from '@/lib/auth/session'
import { computeOpsQueue, computeFinanceQueue, type QueueTile, type TileTone } from '@/lib/dashboard/roleQueues'

const COUNT_TONE: Record<TileTone, string> = {
  alert: 'text-signal-alert', attention: 'text-amber-700', navy: 'text-brand-navy',
  neutral: 'text-slate-600', ok: 'text-emerald-700',
}

function TileRow({ tiles, basePath, label }: { tiles: QueueTile[]; basePath: string; label: string }) {
  const total = tiles.reduce((s, t) => s + t.count, 0)
  return (
    <section className="space-y-2" data-testid={`overview-${label.toLowerCase()}`}>
      <div className="flex items-center gap-2">
        <h2 className="font-heading text-sm font-semibold text-brand-navy">{label}</h2>
        <Link href={basePath} className="text-xs text-brand-navy underline-offset-2 hover:underline">open {label} board ({total})</Link>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tiles.map((t) => (
          <Link key={t.key} href={`${basePath}?tile=${encodeURIComponent(t.key)}`}
            className="flex flex-col rounded-lg border border-border bg-card p-4 hover:shadow-sm"
            data-testid={`admin-tile-${label.toLowerCase()}-${t.key}`}>
            <span className={'text-3xl font-semibold ' + COUNT_TONE[t.tone]}>{t.count}</span>
            <span className="mt-1 text-sm font-medium text-brand-navy">{t.label}</span>
          </Link>
        ))}
      </div>
    </section>
  )
}

export default async function AdminWorkPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login?next=%2Fwork%2Fadmin')

  const [mous, payments, kitDispatches, welcomeNotes] = await Promise.all([
    mouRepo.findAll(),
    paymentRepo.findAll(),
    kitDispatchRepo.findAll(),
    welcomeNoteRepo.findAll(),
  ])
  const opsTiles = computeOpsQueue({ mous, kitDispatches, welcomeNotes })
  const financeTiles = computeFinanceQueue({ mous, payments })

  return (
    <>
      <TopNav currentPath="/work/admin" />
      <main id="main-content">
        <PageHeader title="Admin - oversight" subtitle="Cross-team priorities at a glance. Tiles deep-link into each team's board." />
        <div className="mx-auto max-w-screen-xl space-y-8 px-4 py-6">
          <TileRow tiles={opsTiles} basePath="/work/ops" label="Ops" />
          <TileRow tiles={financeTiles} basePath="/work/finance" label="Finance" />
        </div>
      </main>
    </>
  )
}
