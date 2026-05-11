/*
 * /operations/agreements/[id] (Gate 2 Step 7 Surface 5 detail).
 *
 * Single agreement detail + edit. Edit affordance gates on
 * canEditFinanceData.
 */

import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/session'
import { canEditFinanceData } from '@/lib/access'
import { TopNav } from '@/components/ops/TopNav'
import { PageHeader } from '@/components/ops/PageHeader'
import type { Agreement, Vendor } from '@/lib/types'
import agreementsJson from '@/data/agreements.json'
import vendorsJson from '@/data/vendors.json'
import { AgreementEditForm } from './AgreementEditForm'

const allAgreements = agreementsJson as unknown as Agreement[]
const allVendors = vendorsJson as unknown as Vendor[]

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function AgreementDetailPage({ params }: PageProps) {
  const { id } = await params
  const user = await getCurrentUser()
  if (!user) {
    redirect(`/login?next=${encodeURIComponent(`/operations/agreements/${id}`)}`)
  }
  const agreement = allAgreements.find((a) => a.id === id)
  if (!agreement) notFound()
  const canEdit = canEditFinanceData(user)

  return (
    <>
      <TopNav currentPath="/operations" />
      <main id="main-content">
        <PageHeader
          title={agreement.partyName}
          subtitle={`${agreement.type} / ${agreement.natureOfAgreement}`}
          breadcrumb={[
            { label: 'Operations', href: '/operations' },
            { label: 'Agreements', href: '/operations/agreements' },
            { label: agreement.partyName },
          ]}
        />
        <div className="mx-auto max-w-screen-xl space-y-6 px-4 py-6 sm:px-6">
          <div>
            <Link
              href="/operations/agreements"
              className="text-sm text-muted-foreground hover:text-brand-navy"
            >
              Back to agreements
            </Link>
          </div>

          <AgreementEditForm
            agreement={agreement}
            vendors={allVendors}
            canEdit={canEdit}
          />
        </div>
      </main>
    </>
  )
}
