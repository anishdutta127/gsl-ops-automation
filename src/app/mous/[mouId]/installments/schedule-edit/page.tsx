/*
 * /mous/[mouId]/installments/schedule-edit (Gate 5A.6 Step 1).
 *
 * Payment schedule editor. Two modes:
 *   - no-PI: rows editable (add / remove / change %, due date, notes).
 *   - PI-issued: locked by default; "Override locked schedule" reveals
 *     a reason-required form that re-allocates percentages over the
 *     existing rows and creates Adjustment records for re-priced locked
 *     instalments via the recalc engine.
 *
 * Permission:
 *   - View: every authenticated user with access to the MOU (W3-B
 *     testing mode opens the surface).
 *   - Save (no-PI): canEditMOU OR canEditFinanceData.
 *   - Override: canEditFinanceData (Finance + Admin wildcard).
 */

import { notFound, redirect } from 'next/navigation'
import type { MOU, Payment, User } from '@/lib/types'
import { mouRepo } from '@/lib/db/repos/mou'
import { paymentRepo } from '@/lib/db/repos/payment'
import { TopNav } from '@/components/ops/TopNav'
import { PageHeader } from '@/components/ops/PageHeader'
import { DetailHeaderCard } from '@/components/ops/DetailHeaderCard'
import { getCurrentUser } from '@/lib/auth/session'
import { canEditFinanceData, canEditMOU } from '@/lib/access'
import { formatRs } from '@/lib/format'
import { ScheduleEditorForm } from './ScheduleEditorForm'

interface PageProps {
  params: Promise<{ mouId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

const ERROR_MESSAGES: Record<string, string> = {
  permission: 'You do not have permission to edit this schedule.',
  'unknown-user': 'Session user not found. Please log in again.',
  'mou-not-found': 'MOU not found.',
  'pi-issued-requires-override':
    'This MOU has at least one PI issued. Use the Override flow to edit.',
  'invalid-rows':
    'One or more rows had invalid values. Percentage must be 0-100 and dates yyyy-mm-dd.',
  'pct-sum-out-of-range':
    'Total percentage must sum to 100% (within 0.5% tolerance).',
  'missing-reason':
    'Override reason is required (minimum 10 characters).',
  'override-requires-existing-rows':
    'Override mode requires existing instalments. Add or remove rows is disabled.',
  'invalid-mode': 'Unknown save mode.',
}

function isVisibleToUser(mou: MOU, user: User | null): boolean {
  if (!user) return false
  if (user.role === 'SalesRep') return mou.salesPersonId === user.id
  return true
}

function isPiIssued(p: Payment): boolean {
  return p.piNumber !== null || p.piSentDate !== null
}

export default async function ScheduleEditorPage({ params, searchParams }: PageProps) {
  const { mouId } = await params
  const sp = await searchParams
  const user = await getCurrentUser()
  if (!user) redirect(`/login?next=${encodeURIComponent(`/mous/${mouId}/installments/schedule-edit`)}`)
  const [allMous, allPayments] = await Promise.all([
    mouRepo.findAll(),
    paymentRepo.findAll(),
  ])
  const mou = allMous.find((m) => m.id === mouId)
  if (!mou || !isVisibleToUser(mou, user)) notFound()

  const installments = allPayments
    .filter((p) => p.mouId === mou.id)
    .sort((a, b) => a.instalmentSeq - b.instalmentSeq)

  const lockedRows = installments.filter(isPiIssued).length
  const isLocked = lockedRows > 0

  const errorKey = typeof sp.error === 'string' ? sp.error : null
  const errorMessage = errorKey
    ? ERROR_MESSAGES[errorKey] ?? `Failed: ${errorKey}`
    : null
  const saved = typeof sp.saved === 'string' && sp.saved === '1'
  const savedTouched = typeof sp.touched === 'string' ? Number(sp.touched) : 0
  const savedCreated = typeof sp.created === 'string' ? Number(sp.created) : 0
  const savedDeleted = typeof sp.deleted === 'string' ? Number(sp.deleted) : 0
  const savedAdjustments = typeof sp.adjustments === 'string' ? Number(sp.adjustments) : 0

  const canSaveNoPi = canEditMOU(user) || canEditFinanceData(user)
  const canOverride = canEditFinanceData(user)

  const totalExpected = installments.reduce((s, p) => s + p.expectedAmount, 0)

  return (
    <>
      <TopNav currentPath="/mous" />
      <main id="main-content">
        <PageHeader
          title={`${mou.schoolName} – Edit instalment schedule`}
          breadcrumb={[
            { label: 'MOUs', href: '/mous' },
            { label: mou.id, href: `/mous/${mou.id}` },
            { label: 'Instalments', href: `/mous/${mou.id}/installments` },
            { label: 'Edit schedule' },
          ]}
        />
        <div className="mx-auto flex max-w-screen-xl flex-col gap-4 px-4 py-6">
          <DetailHeaderCard
            title={mou.id}
            subtitle={`Edit the per-instalment percentage, due date, and notes. Contract value is ${formatRs(mou.contractValue)}; row amounts are derived as contract × % / 100.`}
            metadata={[
              { label: 'Contract value', value: formatRs(mou.contractValue) },
              { label: 'Instalments on file', value: String(installments.length) },
              { label: 'PI-issued rows', value: String(lockedRows) },
              { label: 'Total expected', value: formatRs(totalExpected) },
            ]}
          />

          {saved ? (
            <p
              role="status"
              data-testid="schedule-saved-flash"
              className="rounded-md border border-signal-ok bg-card p-3 text-sm text-foreground"
            >
              Schedule saved. {savedTouched} updated, {savedCreated} created,{' '}
              {savedDeleted} removed, {savedAdjustments} adjustment row(s) created.
              Will reflect everywhere within ~5 minutes.
            </p>
          ) : null}
          {errorMessage !== null ? (
            <p
              role="alert"
              data-testid="schedule-error-flash"
              className="rounded-md border border-signal-alert bg-card p-3 text-sm text-signal-alert"
            >
              {errorMessage}
            </p>
          ) : null}

          {isLocked ? (
            <p
              role="status"
              data-testid="locked-banner"
              className="rounded-md border border-signal-attention bg-card p-3 text-sm text-foreground"
            >
              <strong>Locked.</strong> {lockedRows} of {installments.length} instalments
              already have a PI issued. Use the override flow below to re-allocate
              percentages; the system will create adjustment entries so issued PIs stay
              numerically correct.
            </p>
          ) : null}

          <ScheduleEditorForm
            mouId={mou.id}
            contractValue={mou.contractValue}
            installments={installments.map((p) => ({
              paymentId: p.id,
              pctDue: round2((p.expectedAmount / Math.max(1, mou.contractValue)) * 100),
              dueDateIso: p.dueDateIso,
              notes: p.notes,
              piNumber: p.piNumber,
              piSentDate: p.piSentDate,
              status: p.status,
              expectedAmount: p.expectedAmount,
              receivedAmount: p.receivedAmount,
            }))}
            isLocked={isLocked}
            canSaveNoPi={canSaveNoPi}
            canOverride={canOverride}
          />
        </div>
      </main>
    </>
  )
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
