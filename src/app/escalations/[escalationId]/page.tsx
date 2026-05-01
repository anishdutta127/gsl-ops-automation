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
import { canPerform } from '@/lib/auth/permissions'
import { TopNav } from '@/components/ops/TopNav'
import { PageHeader } from '@/components/ops/PageHeader'
import { DetailHeaderCard } from '@/components/ops/DetailHeaderCard'
import { LaneBadge } from '@/components/ops/LaneBadge'
import { AuditLogPanel } from '@/components/ops/AuditLogPanel'
import { StatusChip, type StatusChipTone } from '@/components/ops/StatusChip'
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

const SEVERITY_TONE: Record<Escalation['severity'], { tone: StatusChipTone; label: string }> = {
  high:   { tone: 'alert',     label: 'High' },
  medium: { tone: 'attention', label: 'Medium' },
  low:    { tone: 'neutral',   label: 'Low' },
}

// W4-I.4 MM5: Misba ticketing-system status vocabulary.
const STATUS_TONE: Record<Escalation['status'], { tone: StatusChipTone; label: string }> = {
  Open:    { tone: 'alert',     label: 'Open' },
  WIP:     { tone: 'attention', label: 'WIP' },
  Closed:  { tone: 'ok',        label: 'Closed' },
  'Transfer to Other Department': { tone: 'attention', label: 'Transfer to Other Department' },
  Dispatched:   { tone: 'attention', label: 'Dispatched' },
  'In Transit': { tone: 'attention', label: 'In Transit' },
}

export default async function EscalationDetailPage({ params }: PageProps) {
  const { escalationId } = await params
  const user = await getCurrentUser()
  const esc = allEscalations.find((e) => e.id === escalationId)
  if (!esc || !isVisibleToUser(esc, user)) notFound()

  const school = allSchools.find((s) => s.id === esc.schoolId)
  const mou = esc.mouId ? allMous.find((m) => m.id === esc.mouId) : null

  const statusMeta = STATUS_TONE[esc.status]
  const severityMeta = SEVERITY_TONE[esc.severity]
  const canEdit = user ? canPerform(user, 'escalation:resolve') : false

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
