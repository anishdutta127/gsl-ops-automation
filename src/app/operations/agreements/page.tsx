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

import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/session'
import { canEditFinanceData } from '@/lib/access'
import { TopNav } from '@/components/ops/TopNav'
import { PageHeader } from '@/components/ops/PageHeader'
import { EmptyState } from '@/components/ops/EmptyState'
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
            // Add agreement is a Phase 1.1 deferral. The create flow
            // is not wired and the route does not exist; rendering an
            // enabled CTA would 404 on click. Render the affordance
            // as a disabled badge so Finance can see it's coming
            // without hitting a dead link (Gate 5A.5 audit fix B9).
            canEdit ? (
              <span
                title="Agreement create lands in Phase 1.1. For now, ask Anish to seed the row; edit fields land via Edit on the detail page."
                aria-disabled="true"
                className="inline-flex min-h-11 cursor-not-allowed items-center gap-1.5 rounded-md border border-dashed border-border bg-muted px-3 py-2 text-sm font-medium text-muted-foreground"
                data-testid="agreement-add-disabled"
              >
                Add agreement (Phase 1.1)
              </span>
            ) : null
          }
        />
        <div className="mx-auto max-w-screen-xl space-y-4 px-4 py-6 sm:px-6">
          {agreements.length === 0 ? (
            <EmptyState
              title="No agreements yet"
              description={
                canEdit
                  ? 'Agreement create lands in Phase 1.1. Ask Anish to seed the first row; field edits land via the per-row detail page.'
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

