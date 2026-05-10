/*
 * /finance/pi/[paymentId] (Gate 2 Step 6).
 *
 * View a generated PI. [paymentId] is the Payment.id of the
 * instalment that holds the PI (PI metadata lives on the Payment
 * record). Renders:
 *
 *   - PI metadata (number, school, MOU, instalment label, issue date,
 *     amount, paid status, GST entity routing).
 *   - Audit history (Payment.auditLog filtered to PI-related actions).
 *   - Re-issue form (POST /api/finance/pi/[paymentId]/reissue) gated
 *     by canEditFinanceData + isPiParallelBuildLocked. Native confirm
 *     dialog copy matches the brief.
 *   - View-only sections (metadata, audit) visible to every
 *     canAccessFinance user.
 *
 * STEP6_QUESTIONS Q6: a separate .docx download button is deferred for
 * Phase 1 because the existing generatePi.ts pipeline advances the
 * counter on every call. Phase 1.1 splits out a non-counter-advancing
 * renderer for view-only download.
 */

import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { Info } from 'lucide-react'
import type { MOU, Payment, School } from '@/lib/types'
import mousJson from '@/data/mous.json'
import paymentsJson from '@/data/payments.json'
import schoolsJson from '@/data/schools.json'
import { getCurrentUser } from '@/lib/auth/session'
import { canAccessFinance, canEditFinanceData } from '@/lib/access'
import {
  isPiParallelBuildLocked,
  parallelBuildLockMessage,
} from '@/lib/pi/parallelBuildLock'
import { getEntity, getEntityForProgramme } from '@/lib/mouSystem/company'
import { TopNav } from '@/components/ops/TopNav'
import { PageHeader } from '@/components/ops/PageHeader'
import { DetailHeaderCard } from '@/components/ops/DetailHeaderCard'
import { StatusChip, type StatusChipTone } from '@/components/ops/StatusChip'
import { formatRs, formatDate } from '@/lib/format'
import { ReissueButton } from './ReissueButton'

const allMous = mousJson as unknown as MOU[]
const allPayments = paymentsJson as unknown as Payment[]
const allSchools = schoolsJson as unknown as School[]

interface PageProps {
  params: Promise<{ paymentId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

const STATUS_TONE: Record<Payment['status'], StatusChipTone> = {
  Received: 'ok',
  Paid: 'ok',
  Partial: 'attention',
  'PI Sent': 'navy',
  'Due Soon': 'attention',
  Pending: 'neutral',
  Overdue: 'alert',
}

const ERROR_COPY: Record<string, string> = {
  permission: 'You do not have permission to re-issue PIs. Finance + Admin only.',
  'unknown-user': 'Session expired. Sign in again.',
  'payment-not-found': 'PI no longer exists. Refresh the list.',
  'mou-not-found': 'Parent MOU no longer exists.',
  'parallel-build-locked': 'PI generation is locked during the parallel-build window.',
}

export default async function FinancePiViewPage({ params, searchParams }: PageProps) {
  const { paymentId } = await params
  const sp = await searchParams
  const user = await getCurrentUser()
  if (!user) redirect(`/login?next=${encodeURIComponent(`/finance/pi/${paymentId}`)}`)
  if (!canAccessFinance(user)) redirect('/?notice=finance-access-required')

  const payment = allPayments.find((p) => p.id === paymentId)
  if (!payment) notFound()
  const mou = allMous.find((m) => m.id === payment.mouId) ?? null
  const school = mou ? allSchools.find((s) => s.id === mou.schoolId) ?? null : null

  const canEdit = canEditFinanceData(user)
  const parallelBuildLocked = isPiParallelBuildLocked()

  const entityKey = mou ? getEntityForProgramme(mou.programme) : null
  const entity = entityKey ? getEntity(entityKey) : null

  const piAuditEntries = (payment.auditLog ?? []).filter(
    (a) => a.action === 'pi-issued' || a.action === 'pi-reissued' || a.action === 'create',
  )

  const reissuedPi = typeof sp.reissued === 'string' ? sp.reissued : null
  const voidedPi = typeof sp.voided === 'string' ? sp.voided : null
  const errorKey = typeof sp.error === 'string' ? sp.error : null
  const errorMessage = errorKey ? ERROR_COPY[errorKey] ?? `Failed: ${errorKey}` : null

  return (
    <>
      <TopNav currentPath="/finance" />
      <main id="main-content">
        <PageHeader
          title={payment.piNumber ?? '(no PI number on record)'}
          breadcrumb={[
            { label: 'Dashboard', href: '/' },
            { label: 'Finance', href: '/finance' },
            { label: 'PI' },
            { label: payment.id },
          ]}
        />
        <div className="mx-auto flex max-w-screen-xl flex-col gap-4 px-4 py-6">
          {reissuedPi ? (
            <p
              role="status"
              data-testid="pi-reissued-flash"
              className="flex items-start gap-2 rounded-md border border-signal-ok bg-signal-ok/10 p-3 text-sm text-signal-ok"
            >
              <Info aria-hidden className="size-4 shrink-0" />
              <span>
                PI re-issued. Old number voided; counter advanced.
                {voidedPi !== null ? (
                  <>
                    {' '}Old: <span className="font-mono">{voidedPi}</span> -&gt; new:{' '}
                    <span className="font-mono">{reissuedPi}</span>.
                  </>
                ) : null}
              </span>
            </p>
          ) : null}

          {errorMessage ? (
            <p
              role="alert"
              className="flex items-start gap-2 rounded-md border border-signal-alert bg-signal-alert/10 p-3 text-sm text-signal-alert"
            >
              <Info aria-hidden className="size-4 shrink-0" />
              <span>{errorMessage}</span>
            </p>
          ) : null}

          <DetailHeaderCard
            title={payment.piNumber ?? '(no PI on file)'}
            subtitle="Proforma Invoice for the instalment"
            metadata={[
              { label: 'School', value: payment.schoolName },
              {
                label: 'MOU',
                value: (
                  <Link href={`/mous/${payment.mouId}`} className="font-mono text-xs text-brand-navy hover:underline">
                    {payment.mouId}
                  </Link>
                ),
              },
              { label: 'Programme', value: payment.programme },
              { label: 'Instalment', value: payment.instalmentLabel },
              { label: 'Issue date', value: payment.piGeneratedAt ? formatDate(payment.piGeneratedAt) : '-' },
              { label: 'Expected amount', value: formatRs(payment.expectedAmount) },
              {
                label: 'Status',
                value: (
                  <StatusChip
                    tone={STATUS_TONE[payment.status]}
                    label={payment.status}
                    withDot={false}
                  />
                ),
              },
              entity
                ? {
                    label: 'Issuing entity',
                    value: (
                      <span className="font-mono text-xs">
                        {entity.label} · {entity.gstin} · prefix {entity.piPrefix}
                      </span>
                    ),
                  }
                : { label: 'Issuing entity', value: '-' },
            ]}
          />

          <section
            aria-labelledby="reissue-heading"
            className="rounded-md border border-border bg-card p-4 sm:p-6"
          >
            <h2 id="reissue-heading" className="font-heading text-base font-semibold text-brand-navy">
              Re-issue PI
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Re-issuing voids the current PI number and advances the per-entity counter. Use when the underlying instalment economics changed (price, student count) and the existing PI is no longer valid.
            </p>

            {parallelBuildLocked ? (
              <div
                role="status"
                data-testid="pi-parallel-build-banner"
                className="mt-3 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
              >
                <Info aria-hidden className="size-4 shrink-0 text-amber-700" />
                <div>
                  <p className="font-semibold">Locked during parallel-build window</p>
                  <p className="mt-1">{parallelBuildLockMessage()}</p>
                </div>
              </div>
            ) : !canEdit ? (
              <p
                role="status"
                className="mt-3 rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground"
              >
                Re-issue is restricted to Finance + Admin. View-only access is fine.
              </p>
            ) : (
              <div className="mt-3">
                <ReissueButton paymentId={payment.id} oldPiNumber={payment.piNumber} />
              </div>
            )}
          </section>

          <section
            aria-labelledby="audit-heading"
            className="rounded-md border border-border bg-card p-4 sm:p-6"
          >
            <h2 id="audit-heading" className="font-heading text-base font-semibold text-brand-navy">
              PI history
            </h2>
            {piAuditEntries.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">No PI-related audit entries on this instalment.</p>
            ) : (
              <ul className="mt-3 space-y-2.5">
                {piAuditEntries
                  .slice()
                  .reverse()
                  .map((entry, i) => (
                    <li key={`${entry.timestamp}-${i}`} className="rounded-md border border-border bg-muted/20 p-3 text-xs">
                      <p className="font-mono text-[11px] text-muted-foreground">
                        {entry.timestamp.slice(0, 16).replace('T', ' ')} · {entry.user}
                      </p>
                      <p className="mt-1 font-medium text-brand-navy">{entry.action}</p>
                      {entry.notes ? (
                        <p className="mt-0.5 text-muted-foreground">{entry.notes}</p>
                      ) : null}
                    </li>
                  ))}
              </ul>
            )}
          </section>

          {school ? (
            <p className="text-xs text-muted-foreground">
              School billing details on the PI are derived from{' '}
              <Link href={`/schools/${school.id}/edit`} className="text-brand-navy hover:underline">
                /schools/{school.id}/edit
              </Link>
              . Update GSTIN / PAN / address there before re-issuing if those fields are wrong.
            </p>
          ) : null}
        </div>
      </main>
    </>
  )
}
