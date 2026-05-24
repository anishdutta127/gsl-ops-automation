/*
 * /escalations/[escalationId] detail page.
 *
 * Full escalation state: lane (LaneBadge) + level + severity +
 * stage + origin + cross-references + notifiedEmails snapshot +
 * resolution flow + audit log.
 *
 * Per-role scoping mirrors /escalations list: lane-aware
 * visibility. Out-of-scope escalation -> not-found path (no
 * existence leak).
 */

import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Escalation, User } from '@/lib/types'
import { escalationRepo } from '@/lib/db/repos/escalation'
import { schoolRepo } from '@/lib/db/repos/school'
import { mouRepo } from '@/lib/db/repos/mou'
import { getCurrentUser } from '@/lib/auth/session'
import { canPerform } from '@/lib/auth/permissions'
import { canManageEscalations, getDepartment } from '@/lib/access'
import { isSlaBreached, slaHoursRemaining } from '@/lib/escalations/sla'
import { TopNav } from '@/components/ops/TopNav'
import { PageHeader } from '@/components/ops/PageHeader'
import { DetailHeaderCard } from '@/components/ops/DetailHeaderCard'
import { LaneBadge } from '@/components/ops/LaneBadge'
import { AuditLogPanel } from '@/components/ops/AuditLogPanel'
import { StatusChip } from '@/components/ops/StatusChip'
import { formatDate } from '@/lib/format'
import {
  ESCALATION_SEVERITY_TONE,
  ESCALATION_STATUS_TONE,
} from '@/lib/ui/escalationTones'
import {
  claimEscalationAction,
  transferEscalationAction,
} from '../actions'

interface PageProps {
  params: Promise<{ escalationId: string }>
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

const NOTICE_COPY: Record<string, string> = {
  transferred:
    'Transferred. The receiving department has been notified; assignedTo cleared until claimed.',
  claimed: 'Claimed. Status flipped to WIP and assignedTo set to you.',
  edited: 'Saved. Will reflect everywhere within ~5 minutes.',
}

const ERROR_COPY: Record<string, string> = {
  permission: 'You do not have permission to perform that action.',
  'invalid-target': 'Pick a target department.',
  'missing-reason': 'A reason is required when transferring.',
  'same-department': 'Already owned by that department; nothing to transfer.',
  'already-closed': 'Closed escalations cannot be transferred.',
  'not-transferred': 'Only transferred escalations can be claimed.',
  'wrong-department': 'You must belong to the receiving department to claim.',
}

function isVisibleToUser(esc: Escalation, user: User | null): boolean {
  if (!user) return false
  if (user.role === 'Admin' || user.role === 'Leadership') return true
  const roles = new Set<string>([user.role])
  if (user.testingOverride && user.testingOverridePermissions) {
    for (const r of user.testingOverridePermissions) roles.add(r)
  }
  if (roles.has('OpsHead')) return esc.lane === 'OPS'
  if (roles.has('SalesHead')) return esc.lane === 'SALES'
  if (roles.has('TrainerHead')) return esc.lane === 'ACADEMICS'
  return false
}

const SEVERITY_TONE = ESCALATION_SEVERITY_TONE
const STATUS_TONE = ESCALATION_STATUS_TONE

export default async function EscalationDetailPage({ params, searchParams }: PageProps) {
  const { escalationId } = await params
  const sp = (await searchParams) ?? {}
  const noticeKey = typeof sp.notice === 'string' ? sp.notice : null
  const noticeMessage = noticeKey ? NOTICE_COPY[noticeKey] ?? null : null
  const errorKey = typeof sp.error === 'string' ? sp.error : null
  const errorMessage = errorKey ? ERROR_COPY[errorKey] ?? `Failed: ${errorKey}` : null
  const user = await getCurrentUser()
  const [allEscalations, allSchools, allMous] = await Promise.all([
    escalationRepo.findAll(),
    schoolRepo.findAll(),
    mouRepo.findAll(),
  ])
  const esc = allEscalations.find((e) => e.id === escalationId)
  if (!esc || !isVisibleToUser(esc, user)) notFound()

  const school = allSchools.find((s) => s.id === esc.schoolId)
  const mou = esc.mouId ? allMous.find((m) => m.id === esc.mouId) : null

  const statusMeta = STATUS_TONE[esc.status]
  const severityMeta = SEVERITY_TONE[esc.severity]
  const canEdit = user ? canPerform(user, 'escalation:resolve') : false
  const canManage = user ? canManageEscalations(user) : false
  // SLA chip + countdown banner. Closed escalations stop accruing
  // breach (the lib clamps remaining=0 + breached=false).
  const now = new Date()
  const slaBreached = esc.slaTargetDate
    ? isSlaBreached({ status: esc.status, slaTargetDate: esc.slaTargetDate, now })
    : false
  const slaHrs = esc.slaTargetDate
    ? slaHoursRemaining({ status: esc.status, slaTargetDate: esc.slaTargetDate, now })
    : null
  // Transfer flow visibility: transfer is only meaningful for open
  // tickets. Claim is only meaningful while a transfer is awaiting
  // pickup. Admin (null dept) can claim any transferred ticket; other
  // canManage users must be in the receiving department.
  const canTransfer = canManage && esc.status !== 'Transferred' && esc.status !== 'Closed'
  const userDept = user ? getDepartment(user) : null
  const isAdminWildcard = user?.role === 'Admin' && userDept === null
  const canClaim =
    canManage &&
    esc.status === 'Transferred' &&
    (isAdminWildcard || userDept === esc.ownedByDepartment)

  const headerBadges = (
    <div className="flex flex-wrap items-center gap-2">
      <LaneBadge lane={esc.lane} size="md" />
      <span className="inline-flex items-center rounded-full border border-brand-navy bg-card px-2.5 py-1 text-xs font-semibold text-brand-navy">
        {esc.level}
      </span>
      <StatusChip tone={statusMeta.tone} label={statusMeta.label} withDot={false} />
    </div>
  )

  return (
    <>
      <TopNav currentPath="/escalations" />
      <main id="main-content">
        <PageHeader
          title={esc.id}
          breadcrumb={[
            { label: 'Escalations', href: '/escalations' },
            { label: esc.id },
          ]}
        />
        <div className="mx-auto flex max-w-screen-xl flex-col gap-4 px-4 py-6">
          {noticeMessage ? (
            <div
              role="status"
              data-testid="esc-notice"
              data-notice={noticeKey}
              className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900"
            >
              {noticeMessage}
            </div>
          ) : null}
          {errorMessage ? (
            <div
              role="alert"
              data-testid="esc-error"
              data-error={errorKey}
              className="rounded-md border border-signal-alert bg-signal-alert/10 px-3 py-2 text-sm text-signal-alert"
            >
              {errorMessage}
            </div>
          ) : null}
          {esc.slaTargetDate ? (
            <div
              data-testid="esc-sla-banner"
              data-sla-breached={slaBreached ? 'true' : 'false'}
              className={
                'rounded-md border px-3 py-2 text-sm ' +
                (slaBreached
                  ? 'border-signal-alert bg-signal-alert/10 text-signal-alert'
                  : 'border-border bg-card text-foreground')
              }
            >
              <span className="font-semibold">SLA:</span>{' '}
              {esc.status === 'Closed' ? (
                <>Closed before SLA window expired.</>
              ) : slaBreached ? (
                <>
                  Breached by {Math.abs(slaHrs ?? 0)}h. Target was{' '}
                  {formatDate(esc.slaTargetDate)}.
                </>
              ) : (
                <>
                  {slaHrs ?? 0}h remaining. Target {formatDate(esc.slaTargetDate)}.
                </>
              )}
            </div>
          ) : null}

          <DetailHeaderCard
            title={esc.description}
            subtitle={`${esc.stage} · created ${formatDate(esc.createdAt)} by ${esc.createdBy}`}
            statusBadge={headerBadges}
            metadata={[
              { label: 'School', value: school ? <Link href={`/schools/${school.id}`} className="text-brand-navy hover:underline focus:outline-none focus:ring-2 focus:ring-brand-navy">{school.name}</Link> : esc.schoolId },
              { label: 'MOU', value: mou ? <Link href={`/mous/${mou.id}`} className="text-brand-navy hover:underline focus:outline-none focus:ring-2 focus:ring-brand-navy"><span className="font-mono text-xs">{mou.id}</span></Link> : 'n/a' },
              { label: 'Origin', value: esc.origin },
              { label: 'Origin id', value: esc.originId ? <span className="font-mono text-xs">{esc.originId}</span> : 'n/a' },
              { label: 'Category', value: esc.category ?? <span className="text-muted-foreground">not set</span> },
              { label: 'Type', value: esc.type ?? <span className="text-muted-foreground">not set</span> },
              { label: 'Severity', value: <StatusChip tone={severityMeta.tone} label={severityMeta.label} withDot={false} /> },
              { label: 'Assigned to', value: esc.assignedTo ?? 'unassigned' },
              ...(esc.waitingOn || esc.status === 'Transferred' ? [{
                label: 'Waiting on what/whom?',
                value: esc.waitingOn ?? <span className="text-muted-foreground">not set</span>,
              }] : []),
            ]}
            actions={canEdit ? (
              <Link
                href={`/escalations/${esc.id}/edit`}
                data-testid="esc-edit-link"
                className="inline-flex min-h-11 items-center rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted focus:outline-none focus:ring-2 focus:ring-brand-navy"
              >
                Edit
              </Link>
            ) : null}
          />

          <section aria-labelledby="notified-heading" className="rounded-lg border border-border bg-card p-4 sm:p-6">
            <h3 id="notified-heading" className="mb-2 font-heading text-base font-semibold text-brand-navy">
              Notified emails
            </h3>
            {esc.notifiedEmails.length === 0 ? (
              <p className="text-sm text-muted-foreground">No notifications recorded.</p>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {esc.notifiedEmails.map((email) => (
                  <li key={email} className="inline-flex items-center rounded-md border border-border bg-muted px-2 py-1 text-xs">
                    {email}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {esc.status === 'Closed' ? (
            <section aria-labelledby="resolution-heading" className="rounded-lg border border-border bg-card p-4 sm:p-6">
              <h3 id="resolution-heading" className="mb-2 font-heading text-base font-semibold text-brand-navy">
                Resolution
              </h3>
              <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Resolved at</dt>
                  <dd className="text-sm">{esc.resolvedAt ? formatDate(esc.resolvedAt) : 'n/a'}</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Resolved by</dt>
                  <dd className="text-sm">{esc.resolvedBy ?? 'n/a'}</dd>
                </div>
                {esc.resolutionNotes ? (
                  <div className="sm:col-span-2">
                    <dt className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Notes</dt>
                    <dd className="text-sm">{esc.resolutionNotes}</dd>
                  </div>
                ) : null}
              </dl>
            </section>
          ) : null}

          {canTransfer ? (
            <section
              aria-labelledby="transfer-heading"
              data-testid="esc-transfer-form"
              className="rounded-lg border border-border bg-card p-4 sm:p-6"
            >
              <h3
                id="transfer-heading"
                className="mb-3 font-heading text-base font-semibold text-brand-navy"
              >
                Transfer to another department
              </h3>
              <p className="mb-3 text-sm text-muted-foreground">
                Sets status to Transferred and clears the assignee. The receiving
                department must claim the ticket.
              </p>
              <form action={transferEscalationAction} className="space-y-3">
                <input type="hidden" name="id" value={esc.id} />
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block text-sm">
                    <span className="mb-1 block font-medium text-brand-navy">Target department</span>
                    <select
                      name="targetDepartment"
                      defaultValue=""
                      required
                      className="block w-full rounded-md border border-input bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-navy"
                    >
                      <option value="" disabled>Pick a department</option>
                      {(['sales', 'ops', 'finance'] as const)
                        .filter((d) => d !== esc.ownedByDepartment)
                        .map((d) => (
                          <option key={d} value={d}>{d}</option>
                        ))}
                    </select>
                  </label>
                </div>
                <label className="block text-sm">
                  <span className="mb-1 block font-medium text-brand-navy">Reason (required)</span>
                  <textarea
                    name="reason"
                    rows={2}
                    required
                    className="block w-full rounded-md border border-input bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-navy"
                  />
                </label>
                <button
                  type="submit"
                  className="inline-flex min-h-11 items-center rounded-md bg-brand-teal px-3 py-2 text-sm font-medium text-brand-navy hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-brand-navy"
                >
                  Transfer
                </button>
              </form>
            </section>
          ) : null}

          {esc.status === 'Transferred' ? (
            <section
              aria-labelledby="claim-heading"
              data-testid="esc-claim-section"
              className="rounded-lg border border-border bg-card p-4 sm:p-6"
            >
              <h3
                id="claim-heading"
                className="mb-2 font-heading text-base font-semibold text-brand-navy"
              >
                Awaiting claim by {esc.ownedByDepartment ?? 'unassigned'}
              </h3>
              {esc.transferReason ? (
                <p className="mb-2 text-sm text-foreground">
                  <span className="font-semibold">Reason:</span> {esc.transferReason}
                </p>
              ) : null}
              {esc.transferredAt ? (
                <p className="mb-3 text-xs text-muted-foreground">
                  Transferred at {formatDate(esc.transferredAt)} from{' '}
                  {esc.transferredFromDepartment ?? 'unassigned'}.
                </p>
              ) : null}
              {canClaim ? (
                <form action={claimEscalationAction}>
                  <input type="hidden" name="id" value={esc.id} />
                  <button
                    type="submit"
                    data-testid="esc-claim-button"
                    className="inline-flex min-h-11 items-center rounded-md bg-brand-teal px-3 py-2 text-sm font-medium text-brand-navy hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-brand-navy"
                  >
                    Claim this ticket
                  </button>
                </form>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Only members of the {esc.ownedByDepartment ?? 'receiving'} department can claim this ticket.
                </p>
              )}
            </section>
          ) : null}

          <section aria-labelledby="audit-heading">
            <h3 id="audit-heading" className="mb-2 font-heading text-base font-semibold text-brand-navy">
              Audit log
            </h3>
            <AuditLogPanel entries={esc.auditLog} />
          </section>

        </div>
      </main>
    </>
  )
}
