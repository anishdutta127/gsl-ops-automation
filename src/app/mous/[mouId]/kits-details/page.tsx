/*
 * /mous/[mouId]/kits-details (Gate 3 Step 1).
 *
 * Late-stage edit surface for Product Selection + Grade-wise Student
 * Distribution. Sales fills here when the data was not ready at MOU
 * draft time. Server-side gate: canEditMOU (Sales + Admin).
 *
 * Per joint spec section 1: optional data; submit-empty persists
 * null on both fields.
 */

import { notFound } from 'next/navigation'
import type { MOU, User } from '@/lib/types'
import { mouRepo } from '@/lib/db/repos/mou'
import { TopNav } from '@/components/ops/TopNav'
import { PageHeader } from '@/components/ops/PageHeader'
import { getCurrentUser } from '@/lib/auth/session'
import { canEditMOU } from '@/lib/access'
import { KitsDetailsForm } from './KitsDetailsForm'

interface PageProps {
  params: Promise<{ mouId: string }>
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

function isVisibleToUser(mou: MOU, user: User | null): boolean {
  if (!user) return false
  if (user.role === 'SalesRep') return mou.salesPersonId === user.id
  return true
}

const ERROR_COPY: Record<string, string> = {
  permission: 'You do not have permission to edit kits-dispatch details.',
  'invalid-product': 'Product selection must be TinkRworks, Cretile, or Both.',
  'invalid-gradewise': 'Grade-wise rows must have valid grade (1-12) and non-negative students.',
}

export default async function KitsDetailsPage({ params, searchParams }: PageProps) {
  const { mouId } = await params
  const sp = (await searchParams) ?? {}
  const user = await getCurrentUser()
  const mou = await mouRepo.findById(mouId)
  if (!mou || !isVisibleToUser(mou, user)) notFound()
  if (!user || !canEditMOU(user)) notFound()

  const errorKey = typeof sp.error === 'string' ? sp.error : null
  const errorMessage = errorKey ? (ERROR_COPY[errorKey] ?? null) : null
  const noticeKey = typeof sp.notice === 'string' ? sp.notice : null

  return (
    <>
      <TopNav currentPath="/mous" />
      <main id="main-content">
        <PageHeader
          title={`${mou.schoolName} · Kits dispatch details`}
          breadcrumb={[
            { label: 'MOUs', href: '/mous' },
            { label: mou.id, href: `/mous/${mou.id}` },
            { label: 'Kits details' },
          ]}
        />
        <div className="mx-auto flex max-w-screen-md flex-col gap-4 px-4 py-6">
          {errorMessage && (
            <div className="rounded-md border border-signal-alert/40 bg-red-50 px-4 py-2.5 text-sm text-signal-alert">
              {errorMessage}
            </div>
          )}
          {noticeKey === 'saved' && (
            <div className="rounded-md border border-emerald-500/40 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-900">
              Saved. Will reflect everywhere within ~5 minutes.
            </div>
          )}
          <p className="text-sm text-slate-600">
            Product Selection drives the allocation dropdowns in the Kits for Dispatch
            module. Grade-wise distribution is optional and can be left blank for now;
            Ops will fill it in at allocation time if needed.
          </p>
          <KitsDetailsForm
            mouId={mou.id}
            initialProductSelection={mou.productSelection ?? null}
            initialGradewiseDistribution={mou.gradewiseDistribution ?? null}
          />
        </div>
      </main>
    </>
  )
}
