/*
 * /operations/agreements (Gate 2 Step 7 Surface 5).
 *
 * Vendor + NDA agreement registry. Mirrors gsl-mou-system's
 * AgreementsView shape (type / partyName / nature / start / end /
 * days-to-expiry status). Renewal callout: agreements with
 * daysToExpiry < 60 surface in an amber banner at top.
 *
 * Phase 1: list + add + edit. Edit dialog lives at
 * /operations/agreements/[id]. New agreements via
 * /operations/agreements/new (Phase 1.1 if needed; for now Finance
 * authors directly via the [id] page after queue-creating a stub).
 */

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Plus } from 'lucide-react'
import { getCurrentUser } from '@/lib/auth/session'
import { canEditFinanceData } from '@/lib/access'
import { TopNav } from '@/components/ops/TopNav'
import { PageHeader } from '@/components/ops/PageHeader'
import { EmptyState } from '@/components/ops/EmptyState'
import { opsButtonClass } from '@/components/ops/OpsButton'
import type { Agreement } from '@/lib/types'
import agreementsJson from '@/data/agreements.json'
import { AgreementsClient } from './AgreementsClient'

const agreements = agreementsJson as unknown as Agreement[]

export default async function AgreementsPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login?next=%2Foperations%2Fagreements')
  const canEdit = canEditFinanceData(user)

  return (
    <>
      <TopNav currentPath="/operations" />
      <main id="main-content">
        <PageHeader
          title="Vendor and NDA agreements"
          subtitle="Every vendor contract and non-disclosure agreement in one place. Renewal warnings at 60 days."
          breadcrumb={[
            { label: 'Operations', href: '/operations' },
            { label: 'Agreements' },
          ]}
          actions={
            // Gate 5A.6 Step 12: agreement create is now live; the Phase 1.1
            // disabled-badge has been promoted to a real link.
            canEdit ? (
              <Link
                href="/operations/agreements/new"
                className={opsButtonClass({ variant: 'action', size: 'md' })}
                data-testid="agreement-new-cta"
              >
                <Plus aria-hidden className="size-4" /> New agreement
              </Link>
            ) : null
          }
        />
        <div className="mx-auto max-w-screen-xl space-y-4 px-4 py-6 sm:px-6">
          {agreements.length === 0 ? (
            <EmptyState
              title="No agreements yet"
              description={
                canEdit
                  ? 'Add the first agreement via the "+ New agreement" button above.'
                  : 'Agreements will appear here once Finance adds them.'
              }
            />
          ) : (
            <AgreementsClient agreements={agreements} />
          )}
        </div>
      </main>
    </>
  )
}

