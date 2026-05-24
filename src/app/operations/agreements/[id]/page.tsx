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
import type { Agreement } from '@/lib/types'
import { vendorRepo } from '@/lib/db/repos/vendor'
import { agreementRepo } from '@/lib/db/repos/leafRepos'
import { AgreementEditForm } from './AgreementEditForm'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function AgreementDetailPage({ params }: PageProps) {
  const { id } = await params
  const user = await getCurrentUser()
  if (!user) {
    redirect(`/login?next=${encodeURIComponent(`/operations/agreements/${id}`)}`)
  }
  const [allAgreements, allVendors] = await Promise.all([
    agreementRepo.findAll() as unknown as Promise<Agreement[]>,
    vendorRepo.findAll(),
  ])
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
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Link
              href="/operations/agreements"
              className="text-sm text-muted-foreground hover:text-brand-navy"
            >
              Back to agreements
            </Link>
            {canEdit ? (
              <div className="flex flex-wrap gap-2">
                <Link
                  href={`/operations/agreements/new?renewedFrom=${encodeURIComponent(agreement.id)}`}
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-semibold text-brand-navy hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
                  data-testid="agreement-renew-cta"
                >
                  Renew agreement
                </Link>
                <form
                  action={`/api/operations/agreements/${encodeURIComponent(agreement.id)}/terminate`}
                  method="POST"
                  className="inline"
                >
                  <button
                    type="submit"
                    className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-signal-alert bg-card px-3 py-1.5 text-xs font-semibold text-signal-alert hover:bg-signal-alert/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-signal-alert"
                    data-testid="agreement-terminate-cta"
                  >
                    Mark terminated
                  </button>
                </form>
              </div>
            ) : null}
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
