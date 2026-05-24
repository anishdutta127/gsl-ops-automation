/*
 * /mous/[mouId]/installments/[paymentId]/mark-pi-sent (Step 5).
 *
 * Tiny standalone form for the "Mark PI sent" affordance on the
 * instalments tracker. Mirrors gsl-mou-system's inline-collapse form
 * field-by-field (sent date + sent to) but renders as a full page in
 * Ops because the instalments table itself is a server component.
 *
 * Server-side gate: canEditMOU. Submit POSTs to /api/mou/installments/
 * mark-pi-sent which writes through `applyInstallmentPatch`.
 */

import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { MOU, User } from '@/lib/types'
import { mouRepo } from '@/lib/db/repos/mou'
import { paymentRepo } from '@/lib/db/repos/payment'
import { TopNav } from '@/components/ops/TopNav'
import { PageHeader } from '@/components/ops/PageHeader'
import { DetailHeaderCard } from '@/components/ops/DetailHeaderCard'
import { opsButtonClass } from '@/components/ops/OpsButton'
import { getCurrentUser } from '@/lib/auth/session'
import { canEditMOU } from '@/lib/access'
import { formatRs, formatDate } from '@/lib/format'

interface PageProps {
  params: Promise<{ mouId: string; paymentId: string }>
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

function isVisibleToUser(mou: MOU, user: User | null): boolean {
  if (!user) return false
  if (user.role === 'SalesRep') return mou.salesPersonId === user.id
  return true
}

const ERROR_COPY: Record<string, string> = {
  'missing-fields': 'Sent date is required.',
  'installment-not-found': 'Instalment not found.',
  permission: 'You do not have permission to mark a PI sent.',
  'unknown-user': 'Session expired. Please sign in again.',
}

const FIELD_INPUT_CLASS =
  'block w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand-navy'
const FIELD_LABEL_CLASS = 'block text-sm font-medium text-brand-navy mb-1'

export default async function MarkPiSentPage({ params, searchParams }: PageProps) {
  const { mouId, paymentId } = await params
  const sp = (await searchParams) ?? {}
  const user = await getCurrentUser()
  const [allMous, allPayments] = await Promise.all([
    mouRepo.findAll(),
    paymentRepo.findAll(),
  ])
  const mou = allMous.find((m) => m.id === mouId)
  if (!mou || !isVisibleToUser(mou, user)) notFound()
  if (!user || !canEditMOU(user)) notFound()
  const payment = allPayments.find((p) => p.id === paymentId && p.mouId === mou.id)
  if (!payment) notFound()

  const errorKey = typeof sp.error === 'string' ? sp.error : null
  const errorMessage = errorKey ? ERROR_COPY[errorKey] ?? null : null
  const today = new Date().toISOString().slice(0, 10)

  return (
    <>
      <TopNav currentPath="/mous" />
      <main id="main-content">
        <PageHeader
          title={`${mou.schoolName} {'·'} Mark PI sent`}
          breadcrumb={[
            { label: 'MOUs', href: '/mous' },
            { label: mou.id, href: `/mous/${mou.id}` },
            { label: 'Instalments', href: `/mous/${mou.id}/installments` },
            { label: payment.instalmentLabel },
          ]}
        />
        <div className="mx-auto flex max-w-screen-md flex-col gap-4 px-4 py-6">
          <DetailHeaderCard
            title={payment.instalmentLabel}
            subtitle={`${mou.id} · ${payment.description}`}
            metadata={[
              { label: 'Expected', value: formatRs(payment.expectedAmount) },
              {
                label: 'Due date',
                value: payment.dueDateIso ? formatDate(payment.dueDateIso) : (payment.dueDateRaw ?? '-'),
              },
              { label: 'Current PI number', value: payment.piNumber ?? '-' },
              {
                label: 'Current sent date',
                value: payment.piSentDate ? formatDate(payment.piSentDate) : '-',
              },
            ]}
          />

          {errorMessage ? (
            <p
              role="alert"
              className="rounded-md border border-signal-alert/40 bg-red-50 px-4 py-2.5 text-sm text-signal-alert"
            >
              {errorMessage}
            </p>
          ) : null}

          <form
            action="/api/mou/installments/mark-pi-sent"
            method="POST"
            className="space-y-4 rounded-lg border border-border bg-card p-4 sm:p-6"
          >
            <input type="hidden" name="mouId" value={mou.id} />
            <input type="hidden" name="paymentId" value={payment.id} />
            <div>
              <label htmlFor="piSentDate" className={FIELD_LABEL_CLASS}>
                Sent date
              </label>
              <input
                id="piSentDate"
                name="piSentDate"
                type="date"
                defaultValue={payment.piSentDate ?? today}
                required
                className={FIELD_INPUT_CLASS}
              />
            </div>
            <div>
              <label htmlFor="piSentTo" className={FIELD_LABEL_CLASS}>
                Sent to (email or name)
              </label>
              <input
                id="piSentTo"
                name="piSentTo"
                type="text"
                defaultValue={payment.piSentTo ?? ''}
                placeholder="accounts@example.com"
                className={FIELD_INPUT_CLASS}
              />
            </div>
            <div className="flex flex-wrap gap-2 border-t border-border pt-4">
              <button
                type="submit"
                className="inline-flex min-h-11 items-center rounded-md bg-brand-navy px-4 py-2 text-sm font-semibold text-white hover:bg-brand-navy/90 focus:outline-none focus:ring-2 focus:ring-brand-navy"
              >
                Save
              </button>
              <Link
                href={`/mous/${mou.id}/installments`}
                className={opsButtonClass({ variant: 'outline', size: 'md' })}
              >
                Cancel
              </Link>
            </div>
          </form>
        </div>
      </main>
    </>
  )
}
