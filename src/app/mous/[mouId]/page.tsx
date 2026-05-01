/*
 * /mous/[mouId] detail page.
 *
 * Renders the full MOU state with: PageHeader breadcrumb +
 * DetailHeaderCard (status pill + metadata grid + actions) +
 * LifecycleProgress (8 stages computed from related entities) +
 * AuditLogPanel (entity audit trail).
 *
 * Per-role scoping: SalesRep accessing a MOU not assigned to them
 * gets the same not-found path as a non-existent id (no leak of
 * existence). Other roles see all.
 */

import Link from 'next/link'
import { notFound } from 'next/navigation'
import type {
  Dispatch,
  Feedback,
  IntakeRecord,
  MOU,
  Payment,
  School,
  User,
} from '@/lib/types'
import mousJson from '@/data/mous.json'
import schoolsJson from '@/data/schools.json'
import dispatchesJson from '@/data/dispatches.json'
import paymentsJson from '@/data/payments.json'
import feedbackJson from '@/data/feedback.json'
import intakeRecordsJson from '@/data/intake_records.json'
import { getCurrentUser } from '@/lib/auth/session'
import { canPerform } from '@/lib/auth/permissions'
import { computeLifecycle } from '@/lib/portal/lifecycleProgress'
import { formatRs, formatDate } from '@/lib/format'
import { TopNav } from '@/components/ops/TopNav'
import { PageHeader } from '@/components/ops/PageHeader'
import { DetailHeaderCard } from '@/components/ops/DetailHeaderCard'
import { LifecycleProgress } from '@/components/ops/LifecycleProgress'
import { AuditLogPanel } from '@/components/ops/AuditLogPanel'
import { StatusNotesSection } from '@/components/ops/StatusNotesSection'
import usersJson from '@/data/users.json'

const allMous = mousJson as unknown as MOU[]
const allSchools = schoolsJson as unknown as School[]
const allDispatches = dispatchesJson as unknown as Dispatch[]
const allPayments = paymentsJson as unknown as Payment[]
const allFeedback = feedbackJson as unknown as Feedback[]
const allUsers = usersJson as unknown as User[]
const allIntakeRecords = intakeRecordsJson as unknown as IntakeRecord[]

function lastDelayNotesUpdate(mou: MOU): string | null {
  const usersById = new Map(allUsers.map((u) => [u.id, u.name]))
  for (let i = mou.auditLog.length - 1; i >= 0; i -= 1) {
    const entry = mou.auditLog[i]
    if (entry?.action !== 'mou-delay-notes-updated') continue
    const name = usersById.get(entry.user) ?? entry.user
    return `Last updated by ${name} on ${entry.timestamp.slice(0, 10)}`
  }
  return null
}

interface PageProps {
  params: Promise<{ mouId: string }>
}

function isVisibleToUser(mou: MOU, user: User | null): boolean {
  if (!user) return false
  if (user.role === 'SalesRep') return mou.salesPersonId === user.id
  return true
}

export default async function MouDetailPage({ params }: PageProps) {
  const { mouId } = await params
  const user = await getCurrentUser()
  const mou = allMous.find((m) => m.id === mouId)
  if (!mou || !isVisibleToUser(mou, user)) {
    notFound()
  }

  const school = allSchools.find((s) => s.id === mou.schoolId)
  const installments = allPayments.filter((p) => p.mouId === mou.id)
  const installmentDispatches = allDispatches.filter((d) => d.mouId === mou.id)
  const mouFeedback = allFeedback.filter((f) => f.mouId === mou.id)

  const i1 = installments.find((p) => p.instalmentSeq === 1)
  const i1Dispatch = installmentDispatches.find((d) => d.installmentSeq === 1)
  const i1Feedback = mouFeedback.find((f) => f.installmentSeq === 1)
  const intakeRecord = allIntakeRecords.find((r) => r.mouId === mou.id)
  // W4-I.4 MM2: hide the PI action button from roles that lack the
  // matrix grant (everyone except Finance + Admin). Server-side gate
  // in lib/pi/generatePi.ts and the PI page route still enforce.
  const canGeneratePi = user ? canPerform(user, 'mou:generate-pi') : false

  const lifecycle = computeLifecycle({
    mouSignedDate: mou.startDate,
    postSigningIntakeDate: intakeRecord?.completedAt ?? null,
    actualsConfirmedDate: mou.studentsActual !== null ? mou.startDate : null,
    crossVerifiedDate: mou.studentsActual !== null && mou.studentsVariance !== null ? mou.startDate : null,
    invoiceRaisedDate: i1?.piSentDate ?? null,
    invoiceNumber: i1?.piNumber ?? null,
    paymentReceivedDate: i1?.receivedDate ?? null,
    dispatchedDate: i1Dispatch?.dispatchedAt ?? null,
    deliveredDate: i1Dispatch?.deliveredAt ?? null,
    feedbackSubmittedDate: i1Feedback?.submittedAt ?? null,
    expectedNextActionDate: null,
  })

  const statusBadge = (
    <span className="inline-flex items-center rounded-full border border-brand-navy bg-card px-3 py-1 text-xs font-semibold text-brand-navy">
      {mou.status}
    </span>
  )

  return (
    <>
      <TopNav currentPath="/mous" />
      <main id="main-content">
        <PageHeader
          title={mou.schoolName}
          breadcrumb={[
            { label: 'MOUs', href: '/mous' },
            { label: mou.id },
          ]}
        />
        <div className="mx-auto flex max-w-screen-xl flex-col gap-4 px-4 py-6">

          <DetailHeaderCard
            title={mou.id}
            subtitle={`${mou.programme}${mou.programmeSubType ? ' / ' + mou.programmeSubType : ''} · AY ${mou.academicYear}`}
            statusBadge={statusBadge}
            metadata={[
              { label: 'School', value: school ? <Link href={`/schools/${school.id}`} className="text-brand-navy hover:underline focus:outline-none focus:ring-2 focus:ring-brand-navy">{school.name}</Link> : mou.schoolName },
              { label: 'Scope', value: mou.schoolScope === 'GROUP' && mou.schoolGroupId ? `GROUP (${mou.schoolGroupId})` : 'SINGLE' },
              { label: 'Sales person', value: mou.salesPersonId ?? 'unassigned' },
              { label: 'Trainer model', value: mou.trainerModel ?? 'not set' },
              { label: 'Students MOU / actual', value: `${mou.studentsMou.toLocaleString('en-IN')} / ${mou.studentsActual === null ? 'n/a' : mou.studentsActual.toLocaleString('en-IN')}` },
              { label: 'Contract value', value: formatRs(mou.contractValue) },
              { label: 'Received', value: `${formatRs(mou.received)} (${mou.receivedPct}%)` },
              { label: 'Balance', value: formatRs(mou.balance) },
              { label: 'Start / End', value: `${formatDate(mou.startDate)} - ${formatDate(mou.endDate)}` },
              { label: 'Payment schedule', value: mou.paymentSchedule || 'not set' },
            ]}
            actions={
              <>
                <Link href={`/mous/${mou.id}/actuals`} className="inline-flex min-h-11 items-center rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted focus:outline-none focus:ring-2 focus:ring-brand-navy">
                  Actuals
                </Link>
                {canGeneratePi ? (
                  <Link href={`/mous/${mou.id}/pi`} className="inline-flex min-h-11 items-center rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted focus:outline-none focus:ring-2 focus:ring-brand-navy">
                    PI
                  </Link>
                ) : null}
                <Link href={`/mous/${mou.id}/dispatch`} className="inline-flex min-h-11 items-center rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted focus:outline-none focus:ring-2 focus:ring-brand-navy">
                  Dispatch
                </Link>
                <Link href={`/mous/${mou.id}/feedback-request`} className="inline-flex min-h-11 items-center rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted focus:outline-none focus:ring-2 focus:ring-brand-navy">
                  Feedback
                </Link>
                <Link href={`/mous/${mou.id}/delivery-ack`} className="inline-flex min-h-11 items-center rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted focus:outline-none focus:ring-2 focus:ring-brand-navy">
                  Delivery ack
                </Link>
              </>
            }
          />

          <section aria-labelledby="lifecycle-heading" className="rounded-lg border border-border bg-card p-4 sm:p-6">
            <h3 id="lifecycle-heading" className="mb-4 font-heading text-base font-semibold text-brand-navy">
              Lifecycle (instalment 1)
            </h3>
            <LifecycleProgress stages={lifecycle} />
          </section>

          <StatusNotesSection
            mouId={mou.id}
            initialNotes={mou.delayNotes}
            initialMetaLine={lastDelayNotesUpdate(mou)}
          />

          <section aria-labelledby="installments-heading" className="rounded-lg border border-border bg-card p-4 sm:p-6">
            <h3 id="installments-heading" className="mb-3 font-heading text-base font-semibold text-brand-navy">
              Instalments
            </h3>
            {installments.length === 0 ? (
              <p className="text-sm text-muted-foreground">No instalments captured yet.</p>
            ) : (
              <ul className="divide-y divide-border">
                {installments.map((p) => (
                  <li key={p.id} className="py-2 text-sm">
                    <span className="font-mono text-xs text-muted-foreground">{p.instalmentLabel}</span>{' '}
                    <span className="text-foreground">{formatRs(p.expectedAmount)}</span>{' '}
                    <span className="text-muted-foreground">due {formatDate(p.dueDateIso)}</span>{' '}
                    <span className="ml-2 rounded-sm bg-muted px-1.5 py-0.5 text-[11px]">{p.status}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="audit-heading">
            <h3 id="audit-heading" className="mb-2 font-heading text-base font-semibold text-brand-navy">
              Audit log
            </h3>
            <AuditLogPanel entries={mou.auditLog} />
          </section>

        </div>
      </main>
    </>
  )
}
