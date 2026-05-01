/*
 * /mous/[mouId] detail page (W4-I.5 P4C4 restructure).
 *
 * Layout:
 *   PageHeader (breadcrumb)
 *   Sticky action bar (md+ sticky; mobile static): MOU id + programme +
 *     status chip + action buttons + status notes textarea.
 *   Two-column body (md+):
 *     Left  (60%): metadata grid + lifecycle progress + audit log
 *     Right (40%): collapsible cards (Smart Suggestions, Intake,
 *                  Instalments, Dispatches, Communications, Escalations).
 *                  Each card defaults open when it has data, collapsed
 *                  when empty. Native <details>/<summary> so collapse
 *                  works without client state.
 *   Mobile: single column; sticky bar renders normally and scrolls.
 *
 * Per-role scoping: SalesRep accessing a MOU not assigned to them
 * gets the same not-found path as a non-existent id (no leak of
 * existence). Other roles see all.
 *
 * Audit log virtualization: AuditLogPanel uses a max-h-96 native
 * overflow-y-auto container; no react-window-style virtualization
 * exists in the codebase. The Phase 1.1 trigger (RUNBOOK §10) for
 * pagination is 30 entries in production.
 */

import type { ReactNode } from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  AlertCircle,
  ArrowRight,
  ChevronDown,
  ClipboardCheck,
  MessageSquare,
  Receipt,
  Sparkles,
  Truck,
} from 'lucide-react'
import type {
  AuditEntry,
  CommunicationTemplate,
  Dispatch,
  Escalation,
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
import templatesJson from '@/data/communication_templates.json'
import escalationsJson from '@/data/escalations.json'
import usersJson from '@/data/users.json'
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
import { StatusChip } from '@/components/ops/StatusChip'
import { opsButtonClass } from '@/components/ops/OpsButton'
import { getSmartTemplateSuggestions } from '@/lib/templates/smartSuggestions'
import { mouStatusTone } from '@/lib/ui/mouStatusTone'

const allMous = mousJson as unknown as MOU[]
const allSchools = schoolsJson as unknown as School[]
const allDispatches = dispatchesJson as unknown as Dispatch[]
const allPayments = paymentsJson as unknown as Payment[]
const allFeedback = feedbackJson as unknown as Feedback[]
const allUsers = usersJson as unknown as User[]
const allIntakeRecords = intakeRecordsJson as unknown as IntakeRecord[]
const allTemplates = templatesJson as unknown as CommunicationTemplate[]
const allEscalations = escalationsJson as unknown as Escalation[]

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

interface CommunicationRow {
  timestamp: string
  user: string
  templateName: string
  useCase: string
  recipient: string
  subject: string
}

function extractCommEntries(auditLog: AuditEntry[]): CommunicationRow[] {
  const out: CommunicationRow[] = []
  for (const entry of auditLog) {
    if (entry.action !== 'communication-sent') continue
    const after = (entry.after ?? {}) as Record<string, unknown>
    out.push({
      timestamp: entry.timestamp,
      user: entry.user,
      templateName: typeof after.templateName === 'string' ? after.templateName : '(unknown template)',
      useCase: typeof after.useCase === 'string' ? after.useCase : 'custom',
      recipient: typeof after.recipient === 'string' ? after.recipient : '',
      subject: typeof after.subject === 'string' ? after.subject : '',
    })
  }
  return out.sort((a, b) => (a.timestamp < b.timestamp ? 1 : a.timestamp > b.timestamp ? -1 : 0))
}

interface CollapsibleCardProps {
  title: string
  icon: ReactNode
  count?: number
  hasData: boolean
  emptyHint?: string
  testId?: string
  children: ReactNode
}

/**
 * Right-column card primitive. Native <details>/<summary> so the
 * collapse state is browser-native (no React client state, survives
 * navigation, chevron animates via Tailwind's group-open variant).
 * Defaults open when hasData is true; collapsed when empty.
 */
function CollapsibleCard({
  title,
  icon,
  count,
  hasData,
  emptyHint = 'No records yet.',
  testId,
  children,
}: CollapsibleCardProps) {
  return (
    <details
      className="group rounded-lg border border-border bg-card"
      open={hasData}
      data-testid={testId}
    >
      <summary className="flex cursor-pointer items-center gap-2 rounded-t-lg px-4 py-3 hover:bg-muted/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy">
        <span aria-hidden className="text-brand-navy">
          {icon}
        </span>
        <h3 className="font-heading text-sm font-semibold text-brand-navy">{title}</h3>
        {count !== undefined ? (
          <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
            {count}
          </span>
        ) : null}
        <ChevronDown
          aria-hidden
          className="ml-auto size-4 text-muted-foreground transition-transform group-open:rotate-180"
        />
      </summary>
      <div className="border-t border-border px-4 py-3">
        {hasData ? children : <p className="text-xs text-muted-foreground">{emptyHint}</p>}
      </div>
    </details>
  )
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
  const mouEscalations = allEscalations.filter((e) => e.mouId === mou.id)

  const i1 = installments.find((p) => p.instalmentSeq === 1)
  const i1Dispatch = installmentDispatches.find((d) => d.installmentSeq === 1)
  const i1Feedback = mouFeedback.find((f) => f.installmentSeq === 1)
  const intakeRecord = allIntakeRecords.find((r) => r.mouId === mou.id)
  // W4-I.4 MM2: hide the PI action button from roles that lack the
  // matrix grant (everyone except Finance + Admin). Server-side gate
  // in lib/pi/generatePi.ts and the PI page route still enforce.
  const canGeneratePi = user ? canPerform(user, 'mou:generate-pi') : false

  const smartSuggestions = getSmartTemplateSuggestions({
    mou,
    templates: allTemplates,
    intake: intakeRecord ?? null,
    dispatches: installmentDispatches,
    payments: installments,
    now: new Date(),
  })

  const commEntries = extractCommEntries(mou.auditLog)

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

  const actionBtnClass = opsButtonClass({ variant: 'outline', size: 'md' })

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

        {/* Sticky action bar. md+ sticks below TopNav (top-12 = 48px
            matches TopNav min-h-12). Mobile leaves it static so the
            page scrolls naturally. */}
        <div
          className="border-b border-border bg-muted md:sticky md:top-12 md:z-30"
          data-testid="mou-detail-action-bar"
        >
          <div className="mx-auto max-w-screen-xl space-y-3 px-4 py-3">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <h2 className="font-heading text-base font-semibold text-brand-navy">
                {mou.id}
              </h2>
              <span className="text-sm text-muted-foreground">
                {mou.programme}
                {mou.programmeSubType ? ` / ${mou.programmeSubType}` : ''}
                {' · AY '}
                {mou.academicYear}
              </span>
              <StatusChip
                tone={mouStatusTone(mou.status)}
                label={mou.status}
                testId="mou-detail-status-chip"
              />
              <div className="ml-auto flex flex-wrap items-center gap-2">
                <Link href={`/mous/${mou.id}/actuals`} className={actionBtnClass}>
                  Actuals
                </Link>
                {canGeneratePi ? (
                  <Link href={`/mous/${mou.id}/pi`} className={actionBtnClass}>
                    PI
                  </Link>
                ) : null}
                <Link href={`/mous/${mou.id}/dispatch`} className={actionBtnClass}>
                  Dispatch
                </Link>
                <Link href={`/mous/${mou.id}/feedback-request`} className={actionBtnClass}>
                  Feedback
                </Link>
                <Link href={`/mous/${mou.id}/delivery-ack`} className={actionBtnClass}>
                  Delivery ack
                </Link>
              </div>
            </div>
            <StatusNotesSection
              mouId={mou.id}
              initialNotes={mou.delayNotes}
              initialMetaLine={lastDelayNotesUpdate(mou)}
            />
          </div>
        </div>

        {/* Two-column body. md:grid-cols-5 with col-span-3 / col-span-2
            yields 60% / 40%. Mobile collapses to single column. */}
        <div className="mx-auto max-w-screen-xl px-4 py-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-5">
            <div className="space-y-4 md:col-span-3">
              <DetailHeaderCard
                title={mou.id}
                subtitle={`${mou.programme}${mou.programmeSubType ? ' / ' + mou.programmeSubType : ''} · AY ${mou.academicYear}`}
                metadata={[
                  {
                    label: 'School',
                    value: school ? (
                      <Link
                        href={`/schools/${school.id}`}
                        className="text-brand-navy hover:underline focus:outline-none focus:ring-2 focus:ring-brand-navy"
                      >
                        {school.name}
                      </Link>
                    ) : (
                      mou.schoolName
                    ),
                  },
                  {
                    label: 'Scope',
                    value:
                      mou.schoolScope === 'GROUP' && mou.schoolGroupId
                        ? `GROUP (${mou.schoolGroupId})`
                        : 'SINGLE',
                  },
                  { label: 'Sales person', value: mou.salesPersonId ?? 'unassigned' },
                  { label: 'Trainer model', value: mou.trainerModel ?? 'not set' },
                  {
                    label: 'Students MOU / actual',
                    value: `${mou.studentsMou.toLocaleString('en-IN')} / ${
                      mou.studentsActual === null
                        ? 'n/a'
                        : mou.studentsActual.toLocaleString('en-IN')
                    }`,
                  },
                  { label: 'Contract value', value: formatRs(mou.contractValue) },
                  { label: 'Received', value: `${formatRs(mou.received)} (${mou.receivedPct}%)` },
                  { label: 'Balance', value: formatRs(mou.balance) },
                  {
                    label: 'Start / End',
                    value: `${formatDate(mou.startDate)} - ${formatDate(mou.endDate)}`,
                  },
                  { label: 'Payment schedule', value: mou.paymentSchedule || 'not set' },
                ]}
              />

              <section
                aria-labelledby="lifecycle-heading"
                className="rounded-lg border border-border bg-card p-4 sm:p-6"
              >
                <h3
                  id="lifecycle-heading"
                  className="mb-4 font-heading text-base font-semibold text-brand-navy"
                >
                  Lifecycle (instalment 1)
                </h3>
                <LifecycleProgress stages={lifecycle} />
              </section>

              <section aria-labelledby="audit-heading">
                <h3
                  id="audit-heading"
                  className="mb-2 font-heading text-base font-semibold text-brand-navy"
                >
                  Audit log
                </h3>
                <AuditLogPanel entries={mou.auditLog} />
              </section>
            </div>

            {/* Right column: related entities. <details> primitive keeps
                collapse state native; defaults open when the card has
                data, collapsed when empty. */}
            <aside className="space-y-3 md:col-span-2" aria-label="Related entities">
              <CollapsibleCard
                title="Smart suggestions"
                icon={<Sparkles className="size-4" />}
                count={smartSuggestions.length}
                hasData={smartSuggestions.length > 0}
                emptyHint="No template suggestions for this stage."
                testId="card-smart-suggestions"
              >
                <ul className="flex flex-col gap-2">
                  {smartSuggestions.map((s) => (
                    <li key={s.template.id}>
                      <Link
                        href={`/mous/${encodeURIComponent(mou.id)}/send-template/${encodeURIComponent(s.template.id)}`}
                        data-testid={`smart-suggestion-${s.useCase}`}
                        className="flex items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-2 transition hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-semibold text-brand-navy">
                            {s.template.name}
                          </span>
                          <span className="block text-xs text-muted-foreground">{s.reason}</span>
                        </span>
                        <ArrowRight aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </CollapsibleCard>

              <CollapsibleCard
                title="Intake"
                icon={<ClipboardCheck className="size-4" />}
                hasData={intakeRecord !== undefined}
                emptyHint="Post-signing intake not captured yet."
                testId="card-intake"
              >
                {intakeRecord ? (
                  <dl className="grid grid-cols-1 gap-2 text-sm">
                    <div>
                      <dt className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Completed
                      </dt>
                      <dd>{formatDate(intakeRecord.completedAt)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Recipient
                      </dt>
                      <dd>
                        {intakeRecord.recipientName} · {intakeRecord.recipientDesignation}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Students at intake
                      </dt>
                      <dd>{intakeRecord.studentsAtIntake.toLocaleString('en-IN')}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Grades / duration
                      </dt>
                      <dd>
                        {intakeRecord.grades} · {intakeRecord.durationYears}y
                      </dd>
                    </div>
                  </dl>
                ) : null}
              </CollapsibleCard>

              <CollapsibleCard
                title="Instalments"
                icon={<Receipt className="size-4" />}
                count={installments.length}
                hasData={installments.length > 0}
                emptyHint="No instalments captured yet."
                testId="card-instalments"
              >
                <ul className="divide-y divide-border">
                  {installments.map((p) => (
                    <li key={p.id} className="py-2 text-sm">
                      <span className="font-mono text-xs text-muted-foreground">
                        {p.instalmentLabel}
                      </span>{' '}
                      <span className="text-foreground">{formatRs(p.expectedAmount)}</span>{' '}
                      <span className="text-muted-foreground">due {formatDate(p.dueDateIso)}</span>{' '}
                      <span className="ml-2 rounded-sm bg-muted px-1.5 py-0.5 text-[11px]">
                        {p.status}
                      </span>
                    </li>
                  ))}
                </ul>
              </CollapsibleCard>

              <CollapsibleCard
                title="Dispatches"
                icon={<Truck className="size-4" />}
                count={installmentDispatches.length}
                hasData={installmentDispatches.length > 0}
                emptyHint="No dispatch records yet."
                testId="card-dispatches"
              >
                <ul className="divide-y divide-border">
                  {installmentDispatches.map((d) => (
                    <li key={d.id} className="py-2 text-sm">
                      <div className="flex flex-wrap items-baseline gap-2">
                        <span className="font-mono text-xs text-muted-foreground">
                          Inst {d.installmentSeq}
                        </span>
                        <span className="rounded-sm bg-muted px-1.5 py-0.5 text-[11px]">
                          {d.stage}
                        </span>
                        {d.dispatchedAt ? (
                          <span className="text-xs text-muted-foreground">
                            dispatched {formatDate(d.dispatchedAt)}
                          </span>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              </CollapsibleCard>

              <CollapsibleCard
                title="Communications"
                icon={<MessageSquare className="size-4" />}
                count={commEntries.length}
                hasData={commEntries.length > 0}
                emptyHint="No template communications sent yet."
                testId="card-communications"
              >
                <ul className="divide-y divide-border">
                  {commEntries.map((e, i) => (
                    <li
                      key={`${e.timestamp}-${i}`}
                      data-testid={`communications-row-${i}`}
                      className="flex flex-col gap-1 py-2 text-sm"
                    >
                      <div className="flex flex-wrap items-baseline gap-2">
                        <span className="font-medium text-brand-navy">{e.templateName}</span>
                        <span className="inline-flex items-center rounded-full border border-border bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          {e.useCase}
                        </span>
                        <span className="ml-auto text-xs text-muted-foreground">
                          {formatDate(e.timestamp)}
                        </span>
                      </div>
                      {e.subject ? (
                        <p className="text-xs text-foreground">
                          <span className="text-muted-foreground">Subject:</span> {e.subject}
                        </p>
                      ) : null}
                      {e.recipient ? (
                        <p className="text-xs text-muted-foreground">
                          <span className="font-medium">To:</span>{' '}
                          <span className="break-all">{e.recipient}</span>
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </CollapsibleCard>

              <CollapsibleCard
                title="Escalations"
                icon={<AlertCircle className="size-4" />}
                count={mouEscalations.length}
                hasData={mouEscalations.length > 0}
                emptyHint="No escalations against this MOU."
                testId="card-escalations"
              >
                <ul className="divide-y divide-border">
                  {mouEscalations.map((e) => (
                    <li key={e.id} className="py-2 text-sm">
                      <Link
                        href={`/escalations/${e.id}`}
                        className="block rounded-md px-1 py-0.5 hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
                      >
                        <div className="flex flex-wrap items-baseline gap-2">
                          <span className="font-mono text-xs text-muted-foreground">{e.id}</span>
                          <span className="rounded-sm bg-muted px-1.5 py-0.5 text-[11px]">
                            {e.status}
                          </span>
                          <span className="rounded-sm bg-muted px-1.5 py-0.5 text-[11px]">
                            {e.severity}
                          </span>
                        </div>
                        <p className="mt-0.5 truncate text-xs text-foreground">{e.description}</p>
                      </Link>
                    </li>
                  ))}
                </ul>
              </CollapsibleCard>
            </aside>
          </div>
        </div>
      </main>
    </>
  )
}
