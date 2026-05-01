/*
 * /sales-pipeline/[id]/mark-lost (W4-F.3 mark-as-lost flow).
 *
 * Renders a form with mandatory lossReason + optional notes. Submit
 * calls markOpportunityLostAction; the row stays visible (no delete)
 * but downstream filters can suppress lost rows on /sales-pipeline.
 */

import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, AlertTriangle, XCircle } from 'lucide-react'
import salesOpportunitiesJson from '@/data/sales_opportunities.json'
import type { SalesOpportunity } from '@/lib/types'
import { getCurrentUser } from '@/lib/auth/session'
import { canPerform } from '@/lib/auth/permissions'
import { TopNav } from '@/components/ops/TopNav'
import { PageHeader } from '@/components/ops/PageHeader'
import { OpsButton, opsButtonClass } from '@/components/ops/OpsButton'
import { markOpportunityLostAction } from '../../actions'

const allOpportunities = salesOpportunitiesJson as unknown as SalesOpportunity[]

const ERROR_FLASH: Record<string, string> = {
  permission: 'You do not have permission to mark this opportunity as lost.',
  'not-creator-and-not-lead': 'Only the creator or a SalesHead/Admin can mark this row as lost.',
  'missing-loss-reason': 'A loss reason is required.',
  'already-lost': 'This opportunity is already marked as lost.',
}

interface PageProps {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function OpportunityMarkLostPage({ params, searchParams }: PageProps) {
  const { id } = await params
  const sp = await searchParams
  const user = await getCurrentUser()
  if (!user) redirect(`/login?next=%2Fsales-pipeline%2F${encodeURIComponent(id)}%2Fmark-lost`)
  if (!canPerform(user, 'sales-opportunity:mark-lost')) {
    redirect(`/sales-pipeline/${encodeURIComponent(id)}?error=permission`)
  }

  const opp = allOpportunities.find((o) => o.id === id)
  if (!opp) return notFound()

  const canActOnAnyRow = user.role === 'Admin' || user.role === 'SalesHead'
  if (!canActOnAnyRow && opp.createdBy !== user.id) {
    redirect(`/sales-pipeline/${encodeURIComponent(id)}?error=not-creator-and-not-lead`)
  }
  if (opp.lossReason !== null) {
    redirect(`/sales-pipeline/${encodeURIComponent(id)}?error=already-lost`)
  }

  const errorKey = typeof sp.error === 'string' ? sp.error : null

  return (
    <>
      <TopNav currentPath="/sales-pipeline" />
      <PageHeader
        title="Mark as lost"
        breadcrumb={[
          { label: 'Sales pipeline', href: '/sales-pipeline' },
          { label: opp.id, href: `/sales-pipeline/${encodeURIComponent(opp.id)}` },
          { label: 'Mark as lost' },
        ]}
      />
      <div className="mx-auto flex max-w-screen-md flex-col gap-4 px-4 py-6">
        <Link
          href={`/sales-pipeline/${encodeURIComponent(opp.id)}`}
          className="inline-flex items-center gap-1 text-sm text-brand-navy hover:underline"
        >
          <ArrowLeft aria-hidden className="size-4" /> Back to detail
        </Link>

        {errorKey ? (
          <p
            role="alert"
            data-testid="opp-mark-lost-error"
            className="flex items-start gap-2 rounded-md border border-signal-alert bg-signal-alert/10 p-2 text-xs text-signal-alert"
          >
            <AlertTriangle aria-hidden className="size-4 shrink-0" />
            <span>{ERROR_FLASH[errorKey] ?? `Failed: ${errorKey}`}</span>
          </p>
        ) : null}

        <p className="flex items-start gap-2 rounded-md border border-border bg-muted/30 p-3 text-xs text-foreground">
          <XCircle aria-hidden className="size-4 shrink-0 text-muted-foreground" />
          <span>
            You are about to mark <strong>{opp.schoolName}</strong> ({opp.id}) as lost. The row stays visible for history;
            downstream filters on /sales-pipeline can suppress lost rows.
          </span>
        </p>

        <form
          action={markOpportunityLostAction}
          className="flex flex-col gap-4 rounded-md border border-border bg-card p-4"
        >
          <input type="hidden" name="id" value={opp.id} />

          <div>
            <label htmlFor="lossReason" className="block text-sm font-medium">
              Loss reason <span aria-hidden className="text-signal-alert">*</span>
            </label>
            <input
              id="lossReason" name="lossReason" type="text" required
              data-testid="mark-lost-reason"
              placeholder="e.g., 'School chose competitor' or 'Budget cut'"
              className="mt-1 block w-full rounded-md border border-input bg-card px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Free-text. Captured verbatim in the audit log.
            </p>
          </div>

          <div>
            <label htmlFor="notes" className="block text-sm font-medium">
              Additional notes (optional)
            </label>
            <textarea
              id="notes" name="notes" rows={3}
              data-testid="mark-lost-notes"
              className="mt-1 block w-full rounded-md border border-input bg-card px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <OpsButton
              type="submit"
              variant="destructive"
              size="md"
              data-testid="mark-lost-submit"
            >
              Mark as lost
            </OpsButton>
            <Link
              href={`/sales-pipeline/${encodeURIComponent(opp.id)}`}
              className={opsButtonClass({ variant: 'outline', size: 'md' })}
            >
              Cancel
            </Link>
          </div>
        </form>
      </div>
    </>
  )
}
