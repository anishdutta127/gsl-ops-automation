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
  Info,
  MessageSquare,
  Receipt,
  Sparkles,
  Truck,
} from 'lucide-react'
import type {
  Adjustment,
  AuditEntry,
  CommunicationTemplate,
  Dispatch,
  Escalation,
  Feedback,
  IntakeRecord,
  KitDispatch,
  MOU,
  Payment,
  School,
  User,
} from '@/lib/types'
import { formatSkuBreakdown } from '@/lib/dispatch/formatLineItems'
import mousJson from '@/data/mous.json'
import schoolsJson from '@/data/schools.json'
import dispatchesJson from '@/data/dispatches.json'
import kitDispatchesJson from '@/data/kit_dispatches.json'
import paymentsJson from '@/data/payments.json'
import feedbackJson from '@/data/feedback.json'
import intakeRecordsJson from '@/data/intake_records.json'
import templatesJson from '@/data/communication_templates.json'
import escalationsJson from '@/data/escalations.json'
import usersJson from '@/data/users.json'
import adjustmentsJson from '@/data/adjustments.json'
import { RecalcSummary } from '@/components/mou-system/RecalcSummary'
import { canEditMOU } from '@/lib/access'
import { deriveScheduleSummary } from '@/lib/mou/scheduleSummary'
import { getCurrentUser } from '@/lib/auth/session'
import {
  canApproveDispatchOverride,
  canEditFinanceData,
  canGeneratePI,
  canRequestDispatchOverride,
} from '@/lib/access'
import { readOverride } from '@/lib/mou/dispatchOverride'
import { getDispatchOverrideApproverUserId } from '@/lib/mou/overrideApprover'
import { DispatchOverrideSection } from '@/components/ops/DispatchOverrideSection'
import { computeLifecycle } from '@/lib/portal/lifecycleProgress'
import { formatRs, formatDate } from '@/lib/format'
import { TopNav } from '@/components/ops/TopNav'
import { PageHeader } from '@/components/ops/PageHeader'
import { DetailHeaderCard } from '@/components/ops/DetailHeaderCard'
import { LifecycleProgress } from '@/components/ops/LifecycleProgress'
import { StatusTracker, MOU_DETAIL_ANCHORS } from '@/components/StatusTracker'
import { computeStage } from '@/lib/statusTracker'
import { computeWorkflowState } from '@/lib/workflowState'
import { collectCriticalChanges, topNCriticalChanges } from '@/lib/criticalChanges'
import { EditHistoryReveal } from '@/components/audit/EditHistoryReveal'
import { getResponsiblePartyForMou } from '@/lib/stageResponsibility'
import { canPerform } from '@/lib/auth/permissions'
import { AuditLogPanel } from '@/components/ops/AuditLogPanel'
import { StatusNotesSection } from '@/components/ops/StatusNotesSection'
import { StatusChip } from '@/components/ops/StatusChip'
import { opsButtonClass } from '@/components/ops/OpsButton'
import { getSmartTemplateSuggestions } from '@/lib/templates/smartSuggestions'
import { mouStatusTone } from '@/lib/ui/mouStatusTone'

const allMous = mousJson as unknown as MOU[]
const allSchools = schoolsJson as unknown as School[]
const allDispatches = dispatchesJson as unknown as Dispatch[]
const allKitDispatches = kitDispatchesJson as unknown as KitDispatch[]
const allPayments = paymentsJson as unknown as Payment[]
const allFeedback = feedbackJson as unknown as Feedback[]
const allUsers = usersJson as unknown as User[]
const allIntakeRecords = intakeRecordsJson as unknown as IntakeRecord[]
const allTemplates = templatesJson as unknown as CommunicationTemplate[]
const allEscalations = escalationsJson as unknown as Escalation[]
const allAdjustments = adjustmentsJson as unknown as Adjustment[]

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
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

const NOTICE_COPY: Record<string, string> = {
  'pi-finance-only':
    'PI generation is a Finance function. If you need a PI raised, please reach out to accounts.',
  saved: 'Saved. Will reflect everywhere within ~5 minutes.',
  'reminder-sent':
    'Reminder sent to the owning department. Will reflect on their notification bell within ~5 minutes.',
  'reminder-not-eligible':
    'No reminder needed at this stage. The workflow banner only emits reminders when a handoff is overdue.',
  'reminder-cooldown':
    'A reminder was already sent for this stage within the last 24 hours.',
  // Gate 5A.5 Step 4 (dispatch override flow).
  'override-requested':
    'Dispatch override request submitted. Will reflect on the approver’s bell within ~5 minutes.',
  'override-already-requested':
    'A dispatch override request was already in flight for this MOU; no change.',
  'override-approved':
    'Dispatch override approved. The status tracker now bypasses the payment-pending and instalment-1-received stages.',
  'override-already-approved':
    'Dispatch override was already approved; no change.',
  'override-rejected':
    'Dispatch override rejected. Reason has been recorded; Sales / Ops may submit a new request.',
  'override-already-rejected':
    'Dispatch override was already rejected; no change.',
}

const ERROR_COPY: Record<string, string> = {
  'override-permission':
    'You do not have permission to perform that override action.',
  'override-empty-reason':
    'The override reason cannot be empty. Please add context and resubmit.',
  'override-invalid-state':
    'The override is not in a state that allows that action. Refresh the page to see the current status.',
  'mou-not-found': 'That MOU could not be found.',
}

function isVisibleToUser(mou: MOU, user: User | null): boolean {
  if (!user) return false
  if (user.role === 'SalesRep') return mou.salesPersonId === user.id
  return true
}

export default async function MouDetailPage({ params, searchParams }: PageProps) {
  const { mouId } = await params
  const sp = (await searchParams) ?? {}
  const noticeKey = typeof sp.notice === 'string' ? sp.notice : null
  const noticeMessage = noticeKey ? NOTICE_COPY[noticeKey] ?? null : null
  const errorKey = typeof sp.error === 'string' ? sp.error : null
  const errorMessage = errorKey ? ERROR_COPY[errorKey] ?? null : null
  const user = await getCurrentUser()
  const mou = allMous.find((m) => m.id === mouId)
  if (!mou || !isVisibleToUser(mou, user)) {
    notFound()
  }

  const school = allSchools.find((s) => s.id === mou.schoolId)
  const installments = allPayments.filter((p) => p.mouId === mou.id)
  const installmentDispatches = allDispatches.filter((d) => d.mouId === mou.id)
  const mouKitDispatches = allKitDispatches.filter((d) => d.mouId === mou.id)
  const mouFeedback = allFeedback.filter((f) => f.mouId === mou.id)
  const mouEscalations = allEscalations.filter((e) => e.mouId === mou.id)

  // Gate 4 Step 1 + 3 + 4: master status tracker stage + workflow banner +
  // top-5 critical change log surfaced at the head of the detail body so
  // operators see lifecycle position, next expected action, and recent
  // material changes without hunting through the audit log.
  const trackerNow = new Date()
  const lifecycleStage = computeStage({
    mou,
    payments: installments,
    dispatches: mouKitDispatches,
    now: trackerNow,
  })
  const workflowBanner = computeWorkflowState({
    mou,
    payments: installments,
    dispatches: mouKitDispatches,
    now: trackerNow,
  })
  const criticalChanges = topNCriticalChanges(
    collectCriticalChanges({
      entityType: 'mou',
      entityId: mou.id,
      entityLabel: mou.schoolName,
      hrefBase: '/mous',
      auditLog: mou.auditLog,
    }),
    5,
  )

  // Gate 5A.5 Step 4: dispatch override state + permission gates.
  const overrideState = readOverride(mou)
  const overrideApproverUserId = getDispatchOverrideApproverUserId()
  const overrideApproverUser = allUsers.find(
    (u) => u.id === overrideApproverUserId,
  )
  const overrideApproverDisplayName =
    overrideApproverUser?.name ?? overrideApproverUserId
  const overrideRequester = overrideState.requestedBy
    ? allUsers.find((u) => u.id === overrideState.requestedBy) ?? null
    : null
  const overrideResponderId =
    overrideState.approvedBy ?? overrideState.rejectedBy
  const overrideResponder = overrideResponderId
    ? allUsers.find((u) => u.id === overrideResponderId) ?? null
    : null
  const canRequestOverride = user ? canRequestDispatchOverride(user) : false
  const canApproveOverride = user
    ? canApproveDispatchOverride(user, overrideApproverUserId)
    : false

  // Gate 4.9 Step 4: who currently owns the stage this MOU is at.
  const responsibility = getResponsiblePartyForMou({
    mou,
    payments: installments,
    dispatches: mouKitDispatches,
    now: trackerNow,
  })
  const responsibleUserName = responsibility.responsibleUserId
    ? allUsers.find((u) => u.id === responsibility.responsibleUserId)?.name ?? responsibility.responsibleUserId
    : null
  const canConfigureResponsibility = user ? canPerform(user, 'stage-responsibility:configure') : false

  const i1 = installments.find((p) => p.instalmentSeq === 1)
  const i1Dispatch = installmentDispatches.find((d) => d.installmentSeq === 1)
  const i1Feedback = mouFeedback.find((f) => f.installmentSeq === 1)
  const intakeRecord = allIntakeRecords.find((r) => r.mouId === mou.id)
  // Gate 1 Step 4 (MM2): hide the PI action button from roles that
  // lack the canGeneratePI department gate. canGeneratePI catches the
  // dept-scoped Admin case (Misba: Admin role + ops department) that
  // the canPerform wildcard would miss. Server-side canPerform at
  // lib/pi/generatePi.ts stays as defence in depth.
  const canGeneratePi = user ? canGeneratePI(user) : false
  const canEditMou = user ? canEditMOU(user) : false
  // Gate 5A.9 Step 1: schedule editor entry point. Either Sales or Finance
  // edit-gates can save in no-PI mode; Finance is required to override
  // once a PI is issued. Show the button whenever either gate passes, the
  // schedule editor itself surfaces override-vs-no-PI mode at runtime.
  const canSaveSchedule = user
    ? canEditMOU(user) || canEditFinanceData(user)
    : false
  const isMouSigned =
    mou.status !== 'Pending Signature' && mou.status !== 'Draft'
  const mouAdjustments = allAdjustments.filter(
    (a) => a.mouId === mou.id && a.status === 'Active',
  )
  const totalReceivedRs = installments.reduce((s, p) => s + (p.receivedAmount ?? 0), 0)
  const totalAdjustmentsRs = mouAdjustments.reduce((s, a) => s + a.amountDelta, 0)
  const balanceDuePreviousInstalments = totalAdjustmentsRs

  // 2026-05-19 stabilisation (Bug 5): Pranav reported the detail KPI tiles
  // showed mou.received (bank-only, from the legacy Pranav import) while
  // the Instalments tab summed p.receivedAmount (TDS-inclusive, each row
  // carries the full receipt amount). Detail "Received" and "Balance"
  // tiles now derive from installments so the two views agree. Stored
  // mou.received / mou.balance / mou.receivedPct fields are left alone;
  // a TDS-aware backfill of those stored fields is tracked separately.
  const receivedFromInstallments = totalReceivedRs
  const balanceFromInstallments = Math.max(0, mou.contractValue - receivedFromInstallments)
  const receivedPctFromInstallments = mou.contractValue > 0
    ? Math.round((receivedFromInstallments / mou.contractValue) * 100)
    : 0

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

        {noticeMessage ? (
          <div className="border-b border-border bg-amber-50">
            <div
              className="mx-auto flex max-w-screen-xl items-start gap-2 px-4 py-3 text-sm text-amber-900"
              role="status"
              data-testid="mou-detail-notice"
              data-notice={noticeKey}
            >
              <Info aria-hidden className="size-4 shrink-0 text-amber-700" />
              <span>{noticeMessage}</span>
            </div>
          </div>
        ) : null}
        {errorMessage ? (
          <div className="border-b border-border bg-red-50">
            <div
              className="mx-auto flex max-w-screen-xl items-start gap-2 px-4 py-3 text-sm text-red-900"
              role="alert"
              data-testid="mou-detail-error"
              data-error={errorKey}
            >
              <AlertCircle aria-hidden className="size-4 shrink-0 text-red-700" />
              <span>{errorMessage}</span>
            </div>
          </div>
        ) : null}

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
                {canEditMou ? (
                  <Link
                    href={`/mous/${mou.id}/draft`}
                    className={actionBtnClass}
                    data-testid="action-draft-annexure"
                  >
                    Annexure
                  </Link>
                ) : null}
                {canEditMou ? (
                  <Link
                    href={`/mous/${mou.id}/signed-values`}
                    className={actionBtnClass}
                    data-testid="action-signed-values"
                  >
                    Signed values
                  </Link>
                ) : null}
                <Link
                  href={`/mous/${mou.id}/installments`}
                  className={actionBtnClass}
                  data-testid="action-installments"
                >
                  Instalments
                </Link>
                {canSaveSchedule && isMouSigned && installments.length === 0 ? (
                  <Link
                    href={`/mous/${mou.id}/installments/schedule-edit`}
                    className={opsButtonClass({ variant: 'primary', size: 'md' })}
                    data-testid="action-set-schedule"
                  >
                    Set schedule
                  </Link>
                ) : null}
                {canSaveSchedule && installments.length > 0 ? (
                  <Link
                    href={`/mous/${mou.id}/installments/schedule-edit`}
                    className={actionBtnClass}
                    data-testid="action-edit-schedule"
                  >
                    Edit schedule
                  </Link>
                ) : null}
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

        {/* Gate 4 Step 1 + 3 + 4: master tracker, workflow banner, and
            critical-change log. Sit above the two-column body so they
            are the first thing the operator reads after the action bar. */}
        <div
          className="mx-auto max-w-screen-xl space-y-3 px-4 pt-6"
          data-testid="mou-detail-gate4-block"
        >
          <section
            aria-labelledby="status-tracker-heading"
            className="rounded-lg border border-border bg-card p-4 sm:p-5"
            data-testid="mou-status-tracker-section"
          >
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2
                id="status-tracker-heading"
                className="text-xs font-semibold uppercase tracking-wide text-slate-600"
              >
                Master status tracker
              </h2>
              {/* Gate 4.9 Step 4: "Owned by" pill. Click navigates to
                  /admin/stage-responsibility when the viewer has the
                  configure permission; renders inert otherwise. */}
              {canConfigureResponsibility ? (
                <Link
                  href="/admin/stage-responsibility"
                  data-testid="mou-owned-by-pill"
                  data-owner-dept={responsibility.responsibleDepartment}
                  title={`Stage '${responsibility.stage}' is owned by ${responsibleUserName ?? responsibility.responsibleDepartment} per stage responsibility config. Configure at /admin/stage-responsibility.`}
                  className="inline-flex items-center gap-1.5 rounded-full border border-brand-navy/20 bg-slate-100 px-3 py-1 text-xs font-medium text-brand-navy hover:bg-slate-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
                >
                  Owned by{' '}
                  <span className="font-semibold">
                    {responsibleUserName ?? responsibility.responsibleDepartment}
                  </span>
                </Link>
              ) : (
                <span
                  data-testid="mou-owned-by-pill"
                  data-owner-dept={responsibility.responsibleDepartment}
                  title={`Stage '${responsibility.stage}' is owned by ${responsibleUserName ?? responsibility.responsibleDepartment} per stage responsibility config.`}
                  className="inline-flex items-center gap-1.5 rounded-full border border-brand-navy/20 bg-slate-100 px-3 py-1 text-xs font-medium text-brand-navy"
                >
                  Owned by{' '}
                  <span className="font-semibold">
                    {responsibleUserName ?? responsibility.responsibleDepartment}
                  </span>
                </span>
              )}
            </div>
            <StatusTracker
              current={lifecycleStage}
              anchors={MOU_DETAIL_ANCHORS}
              mouId={mou.id}
              testId="mou-status-tracker"
            />
          </section>

          <DispatchOverrideSection
            mouId={mou.id}
            override={overrideState}
            approverUserId={overrideApproverUserId}
            approverDisplayName={overrideApproverDisplayName}
            requesterDisplayName={overrideRequester?.name ?? null}
            responderDisplayName={overrideResponder?.name ?? null}
            canRequest={canRequestOverride}
            canApprove={canApproveOverride}
          />

          {workflowBanner ? (
            <section
              role="status"
              aria-labelledby="workflow-banner-heading"
              data-testid="mou-workflow-banner"
              data-owner={workflowBanner.owner}
              className="flex flex-col gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0 flex-1">
                <h3
                  id="workflow-banner-heading"
                  className="font-heading text-sm font-semibold text-amber-900"
                >
                  {workflowBanner.headline}
                </h3>
                <p className="mt-0.5 text-xs text-amber-800">{workflowBanner.body}</p>
                <p className="mt-1 text-[11px] uppercase tracking-wide text-amber-700">
                  Owner: {workflowBanner.owner}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {workflowBanner.cta ? (
                  <Link
                    href={workflowBanner.cta.href}
                    className={opsButtonClass({ variant: 'outline', size: 'sm' })}
                    data-testid="workflow-banner-cta"
                  >
                    {workflowBanner.cta.label}
                  </Link>
                ) : null}
                {workflowBanner.reminderEligible ? (
                  <form
                    method="POST"
                    action="/api/workflow/send-reminder"
                    className="flex"
                  >
                    <input type="hidden" name="mouId" value={mou.id} />
                    <input
                      type="hidden"
                      name="stage"
                      value={workflowBanner.currentStage}
                    />
                    <button
                      type="submit"
                      data-testid="workflow-send-reminder"
                      className={opsButtonClass({ variant: 'primary', size: 'sm' })}
                    >
                      Send reminder
                    </button>
                  </form>
                ) : null}
              </div>
            </section>
          ) : null}

          {criticalChanges.length > 0 ? (
            <section
              aria-labelledby="critical-changes-heading"
              data-testid="mou-critical-changes"
              className="rounded-lg border border-border bg-card p-4"
            >
              <h3
                id="critical-changes-heading"
                className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600"
              >
                Recent critical changes
              </h3>
              <ul className="divide-y divide-border text-xs">
                {criticalChanges.map((c, i) => (
                  <li
                    key={`${c.timestamp}-${i}`}
                    className="flex items-baseline gap-2 py-1.5"
                    data-testid={`critical-change-row-${i}`}
                  >
                    <span className="text-slate-500">{c.timestamp.slice(0, 10)}</span>
                    <span className="font-medium text-brand-navy">{c.action}</span>
                    <span className="truncate text-slate-700">{c.summary}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
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
                    label: (
                      <span
                        className="inline-flex items-center gap-1"
                        title={
                          'Single: one school, one programme.\n' +
                          'Multi-school: one signing, multiple branches.\n' +
                          'Multi-programme: one school, several programmes.\n' +
                          'Govt-Tender: state or district level.'
                        }
                      >
                        Scope
                        <Info
                          aria-label="Scope definitions"
                          className="size-3 text-muted-foreground"
                        />
                      </span>
                    ),
                    value:
                      mou.schoolScope === 'GROUP' && mou.schoolGroupId
                        ? `GROUP (${mou.schoolGroupId})`
                        : 'SINGLE',
                  },
                  {
                    label: (
                      <span className="inline-flex items-baseline gap-1">
                        Sales person
                        <EditHistoryReveal
                          entries={mou.auditLog}
                          field="salesPersonId"
                          testIdSlug="mou-sales-person"
                        />
                      </span>
                    ),
                    value: mou.salesPersonId ?? 'unassigned',
                  },
                  { label: 'Trainer model', value: mou.trainerModel ?? 'not set' },
                  {
                    label: (
                      <span className="inline-flex items-baseline gap-1">
                        Students MOU / actual
                        <EditHistoryReveal
                          entries={mou.auditLog}
                          field={['studentsMou', 'studentsActual']}
                          testIdSlug="mou-students"
                        />
                      </span>
                    ),
                    value: `${mou.studentsMou.toLocaleString('en-IN')} / ${
                      mou.studentsActual === null
                        ? 'n/a'
                        : mou.studentsActual.toLocaleString('en-IN')
                    }`,
                  },
                  {
                    label: (
                      <span className="inline-flex items-baseline gap-1">
                        Contract value
                        <EditHistoryReveal
                          entries={mou.auditLog}
                          field={['contractValue', 'spWithTax', 'spWithoutTax']}
                          testIdSlug="mou-contract-value"
                        />
                      </span>
                    ),
                    value: formatRs(mou.contractValue),
                  },
                  {
                    label: 'Received',
                    value: `${formatRs(receivedFromInstallments)} (${receivedPctFromInstallments}%)`,
                  },
                  { label: 'Balance', value: formatRs(balanceFromInstallments) },
                  {
                    label: 'Start / End',
                    value: `${formatDate(mou.startDate)} - ${formatDate(mou.endDate)}`,
                  },
                  {
                    label: 'Payment schedule',
                    value:
                      deriveScheduleSummary(installments, mou.contractValue, mou.paymentSchedule) ||
                      'not set',
                  },
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

              {installments.length > 0 && mou.spWithTax > 0 ? (
                <section aria-labelledby="recalc-heading">
                  <h3
                    id="recalc-heading"
                    className="mb-2 font-heading text-base font-semibold text-brand-navy"
                  >
                    Recalc preview
                  </h3>
                  <RecalcSummary
                    studentsMou={mou.studentsMou}
                    studentsActual={mou.studentsActual}
                    perStudentPrice={mou.spWithTax}
                    installments={installments}
                  />
                </section>
              ) : null}

              {(installments.length > 0 || mouAdjustments.length > 0) ? (
                <section
                  aria-labelledby="paid-summary-heading"
                  className="rounded-lg border border-border bg-card p-4 sm:p-6"
                  data-testid="paid-adjustments-summary"
                >
                  <h3
                    id="paid-summary-heading"
                    className="mb-3 font-heading text-base font-semibold text-brand-navy"
                  >
                    Paid + adjustments summary
                  </h3>
                  <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
                    <div>
                      <dt className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Total received
                      </dt>
                      <dd className="font-mono tabular-nums">{formatRs(totalReceivedRs)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Active adjustments
                      </dt>
                      <dd className="font-mono tabular-nums">
                        {mouAdjustments.length === 0 ? (
                          <span className="text-muted-foreground">{formatRs(0)}</span>
                        ) : (
                          formatRs(totalAdjustmentsRs)
                        )}
                        {mouAdjustments.length > 0 ? (
                          <span className="ml-2 text-xs text-muted-foreground">
                            ({mouAdjustments.length} record{mouAdjustments.length === 1 ? '' : 's'})
                          </span>
                        ) : null}
                      </dd>
                    </div>
                    <div>
                      <dt
                        className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                        title="Sum of active adjustments applied to the next unpaid PI. Negative = credit to the school; positive = additional charge."
                      >
                        Balance due previous instalments
                      </dt>
                      <dd className="font-mono tabular-nums">
                        {formatRs(balanceDuePreviousInstalments)}
                      </dd>
                    </div>
                  </dl>
                  {mouAdjustments.length > 0 ? (
                    <ul className="mt-3 divide-y divide-border border-t border-border pt-2 text-xs">
                      {mouAdjustments.map((a) => (
                        <li key={a.id} className="py-1.5">
                          <span className="font-mono text-[11px] text-muted-foreground">{a.id}</span>{' '}
                          <span className="text-foreground">{a.reason}</span>{' '}
                          <span className="text-muted-foreground">
                            ({formatRs(a.beforeAmount)} {'→'} {formatRs(a.afterAmount)})
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </section>
              ) : null}

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
                emptyHint="Active Schools - Onboarding not captured yet."
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
                        Prospective Enrolments
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
                  {installmentDispatches.map((d) => {
                    const skuBreakdown = formatSkuBreakdown(d.lineItems)
                    return (
                      <li key={d.id} className="py-2 text-sm">
                        <div className="flex flex-wrap items-baseline gap-2">
                          <span className="font-mono text-xs text-muted-foreground">
                            Kit Batch {d.installmentSeq}
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
                        {skuBreakdown ? (
                          <p className="mt-1 text-xs text-muted-foreground">
                            {skuBreakdown}
                          </p>
                        ) : null}
                      </li>
                    )
                  })}
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
