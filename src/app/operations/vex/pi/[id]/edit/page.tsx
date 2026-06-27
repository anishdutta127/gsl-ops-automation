/*
 * /operations/vex/pi/[id]/edit (Pass 2). Edit a generated VEX PI. Finance only.
 * A voided PI is not editable.
 */

import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/session'
import { canEditFinanceData } from '@/lib/access'
import { TopNav } from '@/components/ops/TopNav'
import { PageHeader } from '@/components/ops/PageHeader'
import type { VexDispatch, VexPi } from '@/lib/mouSystem/types'
import { vexPiRepo } from '@/lib/db/repos/vexPi'
import { vexDispatchRepo } from '@/lib/db/repos/leafRepos'
import { VexPiEditForm } from './VexPiEditForm'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function VexPiEditPage({ params }: PageProps) {
  const { id } = await params
  const user = await getCurrentUser()
  if (!user) redirect(`/login?next=${encodeURIComponent(`/operations/vex/pi/${id}/edit`)}`)
  if (!canEditFinanceData(user)) redirect(`/operations/vex/pi/${id}`)

  const [allPis, allDispatches] = await Promise.all([
    vexPiRepo.findAll() as unknown as Promise<VexPi[]>,
    vexDispatchRepo.findAll() as unknown as Promise<VexDispatch[]>,
  ])
  const pi = allPis.find((p) => p.id === id)
  if (!pi) notFound()
  if (pi.voidedAt) redirect(`/operations/vex/pi/${id}`)

  const dispatchedByPart: Record<string, number> = {}
  for (const d of allDispatches) {
    if (d.piId !== pi.id || d.voidedAt) continue
    for (const it of d.items ?? []) dispatchedByPart[it.partNumber] = (dispatchedByPart[it.partNumber] ?? 0) + it.qty
  }

  return (
    <>
      <TopNav currentPath="/operations" />
      <main id="main-content">
        <PageHeader
          title={`Edit ${pi.piNumber}`}
          breadcrumb={[
            { label: 'Operations', href: '/operations' },
            { label: 'VEX', href: '/operations/vex' },
            { label: pi.piNumber, href: `/operations/vex/pi/${pi.id}` },
            { label: 'Edit' },
          ]}
          subtitle="Totals are re-derived on save. A quantity cannot drop below what is already dispatched."
        />
        <div className="mx-auto max-w-screen-xl space-y-4 px-4 py-6 sm:px-6">
          <Link href={`/operations/vex/pi/${pi.id}`} className="text-sm text-muted-foreground hover:text-brand-navy">
            Back to PI
          </Link>
          <VexPiEditForm pi={pi} dispatchedByPart={dispatchedByPart} />
        </div>
      </main>
    </>
  )
}
