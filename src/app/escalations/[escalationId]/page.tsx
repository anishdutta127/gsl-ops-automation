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
import type { Escalation, MOU, School, User } from '@/lib/types'
import escalationsJson from '@/data/escalations.json'
import schoolsJson from '@/data/schools.json'
import mousJson from '@/data/mous.json'
import { getCurrentUser } from '@/lib/auth/session'
import { TopNav } from '@/components/ops/TopNav'
import { PageHeader } from '@/components/ops/PageHeader'
import { DetailHeaderCard } from '@/components/ops/DetailHeaderCard'
import { LaneBadge } from '@/components/ops/LaneBadge'
import { AuditLogPanel } from '@/components/ops/AuditLogPanel'
import { formatDate } from '@/lib/format'

const allEscalations = escalationsJson as unknown as Escalation[]
const allSchools = schoolsJson as unknown as School[]
const allMous = mousJson as unknown as MOU[]

interface PageProps {
  params: Promise<{ escalationId: string }>
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

const SEVERITY_BADGE: Record<Escalation['severity'], { label: string; className: string }> = {
  high: { label: 'High', className: 'border-signal-alert text-signal-alert' },
  medium: { label: 'Medium', className: 'border-signal-attention text-signal-attention' },
  low: { label: 'Low', className: 'border-signal-neutral text-signal-neutral' },
}

const STATUS_BADGE: Record<Escalation['status'], { label: string; className: string }> = {
  open: { label: 'Open', className: 'border-signal-alert text-signal-alert' },
  acknowledged: { label: 'Acknowledged', className: 'border-signal-attention text-signal-attention' },
  resolved: { label: 'Resolved', className: 'border-signal-ok text-signal-ok' },
  withdrawn: { label: 'Withdrawn', className: 'border-signal-neutral text-signal-neutral' },
}

export default async function EscalationDetailPage({ params }: PageProps) {
  const { escalationId } = await params
  const user = await getCurrentUser()
  const esc = allEscalations.find((e) => e.id === escalationId)
  if (!esc || !isVisibleToUser(esc, user)) notFound()

  const school = allSchools.find((s) => s.id === esc.schoolId)
  const mou = esc.mouId ? allMous.find((m) => m.id === esc.mouId) : null

  const statusMeta = STATUS_BADGE[esc.status]
  const severityMeta = SEVERITY_BADGE[esc.severity]

  const headerBadges = (
    <div className="flex flex-wrap items-center gap-2">
      <LaneBadge lane={esc.lane} size="md" />
      <span className="inline-flex items-center rounded-full border border-brand-navy bg-card px-2.5 py-1 text-xs font-semibold text-brand-navy">
        {esc.level}
      </span>
      <span className={`inline-flex items-center rounded-full border bg-card px-2.5 py-1 text-xs font-semibold ${statusMeta.className}`}>
        {statusMeta.label}
      </span>
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

          <DetailHeaderCard
            title={esc.description}
            subtitle={`${esc.stage} · created ${formatDate(esc.createdAt)} by ${esc.createdBy}`}
            statusBadge={headerBadges}
            metadata={[
              { label: 'School', value: school ? <Link href={`/schools/${school.id}`} className="text-brand-navy hover:underline focus:outline-none focus:ring-2 focus:ring-brand-navy">{school.name}</Link> : esc.schoolId },
              { label: 'MOU', value: mou ? <Link href={`/mous/${mou.id}`} className="text-brand-navy hover:underline focus:outline-none focus:ring-2 focus:ring-brand-navy"><span className="font-mono text-xs">{mou.id}</span></Link> : 'n/a' },
              { label: 'Origin', value: esc.origin },
              { label: 'Origin id', value: esc.originId ? <span className="font-mono text-xs">{esc.originId}</span> : 'n/a' },
              { label: 'Severity', value: <span className={`inline-flex items-center rounded-sm border px-2 py-0.5 text-xs font-semibold ${severityMeta.className}`}>{severityMeta.label}</span> },
              { label: 'Assigned to', value: esc.assignedTo ?? 'unassigned' },
            ]}
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

          {esc.status === 'resolved' || esc.status === 'withdrawn' ? (
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
