/*
 * /schools/[schoolId] detail page.
 *
 * School details + GSTIN status + chain membership + active MOUs +
 * audit log. All roles can read; OpsHead+ also see an "Edit"
 * action linking to /schools/[id]/edit.
 */

import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { MOU, School, SchoolGroup, User } from '@/lib/types'
import schoolsJson from '@/data/schools.json'
import schoolGroupsJson from '@/data/school_groups.json'
import mousJson from '@/data/mous.json'
import { getCurrentUser } from '@/lib/auth/session'
import { TopNav } from '@/components/ops/TopNav'
import { PageHeader } from '@/components/ops/PageHeader'
import { DetailHeaderCard } from '@/components/ops/DetailHeaderCard'
import { AuditLogPanel } from '@/components/ops/AuditLogPanel'

const allSchools = schoolsJson as unknown as School[]
const allSchoolGroups = schoolGroupsJson as unknown as SchoolGroup[]
const allMous = mousJson as unknown as MOU[]

interface PageProps {
  params: Promise<{ schoolId: string }>
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

const NOTICE_COPY: Record<string, string> = {
  saved: 'Saved. Will reflect everywhere within ~5 minutes.',
}

function canEdit(user: User | null): boolean {
  if (!user) return false
  if (user.role === 'Admin' || user.role === 'OpsHead') return true
  if (user.testingOverride && user.testingOverridePermissions?.includes('OpsHead')) return true
  return false
}

export default async function SchoolDetailPage({ params, searchParams }: PageProps) {
  const { schoolId } = await params
  const sp = (await searchParams) ?? {}
  const noticeKey = typeof sp.notice === 'string' ? sp.notice : null
  const noticeMessage = noticeKey ? NOTICE_COPY[noticeKey] ?? null : null
  const school = allSchools.find((s) => s.id === schoolId)
  if (!school) notFound()

  const user = await getCurrentUser()
  const group = allSchoolGroups.find((g) => g.memberSchoolIds.includes(school.id))
  const schoolMous = allMous.filter((m) => m.schoolId === school.id)

  const gstStatus = school.gstNumber === null
    ? <span className="text-signal-alert">Missing; PI generation blocked</span>
    : <span className="font-mono text-xs">{school.gstNumber}</span>

  const statusBadge = school.active ? (
    <span className="inline-flex items-center rounded-full border border-signal-ok bg-card px-3 py-1 text-xs font-semibold text-signal-ok">Active</span>
  ) : (
    <span className="inline-flex items-center rounded-full border border-signal-neutral bg-card px-3 py-1 text-xs font-semibold text-signal-neutral">Inactive</span>
  )

  return (
    <>
      <TopNav currentPath="/schools" />
      <main id="main-content">
        {noticeMessage ? (
          <div
            role="status"
            data-testid="school-detail-notice"
            data-notice={noticeKey}
            className="border-b border-border bg-emerald-50 px-4 py-3 text-sm text-emerald-900"
          >
            {noticeMessage}
          </div>
        ) : null}
        <PageHeader
          title={school.name}
          breadcrumb={[
            { label: 'Schools', href: '/schools' },
            { label: school.id },
          ]}
        />
        <div className="mx-auto flex max-w-screen-xl flex-col gap-4 px-4 py-6">

          <DetailHeaderCard
            title={school.id}
            subtitle={`${school.city}, ${school.state} · ${school.region}`}
            statusBadge={statusBadge}
            metadata={[
              { label: 'Legal entity', value: school.legalEntity ?? 'not set' },
              { label: 'Billing name', value: school.billingName ?? 'not set' },
              { label: 'GSTIN', value: gstStatus },
              { label: 'PAN', value: school.pan ? <span className="font-mono text-xs">{school.pan}</span> : 'not set' },
              { label: 'Contact', value: school.contactPerson ?? 'not set' },
              { label: 'Email', value: school.email ?? 'not set' },
              { label: 'Phone', value: school.phone ?? 'not set' },
              { label: 'PIN code', value: school.pinCode ?? 'not set' },
              {
                label: 'Chain membership',
                value: group ? (
                  <span>
                    {group.name} <span className="font-mono text-xs text-muted-foreground">({group.id})</span>
                  </span>
                ) : (
                  'Stand-alone'
                ),
              },
            ]}
            actions={
              canEdit(user) ? (
                <Link
                  href={`/schools/${school.id}/edit`}
                  className="inline-flex min-h-11 items-center rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted focus:outline-none focus:ring-2 focus:ring-brand-navy"
                >
                  Edit
                </Link>
              ) : null
            }
          />

          {school.notes ? (
            <section className="rounded-lg border border-border bg-card p-4">
              <h3 className="mb-1 font-heading text-sm font-semibold text-brand-navy">Notes</h3>
              <p className="text-sm text-foreground">{school.notes}</p>
            </section>
          ) : null}

          <section aria-labelledby="mous-heading" className="rounded-lg border border-border bg-card p-4 sm:p-6">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 id="mous-heading" className="font-heading text-base font-semibold text-brand-navy">
                MOUs ({schoolMous.length})
              </h3>
              {/* Gate 3.5 Step 4: school-scoped MOU drafting entry. Pre-
                  fills the school via the schoolId query param so the
                  wizard does not need re-search. */}
              <Link
                href={`/mous/new?schoolId=${encodeURIComponent(school.id)}`}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-brand-teal bg-brand-teal px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-teal/90 focus:outline-none focus:ring-2 focus:ring-brand-navy"
                data-testid="school-new-mou-cta"
              >
                + Draft new MOU
              </Link>
            </div>
            {schoolMous.length === 0 ? (
              <p className="text-sm text-muted-foreground">No MOUs for this school.</p>
            ) : (
              <ul className="divide-y divide-border">
                {schoolMous.map((m) => (
                  <li key={m.id} className="py-2 text-sm">
                    <Link
                      href={`/mous/${m.id}`}
                      className="text-brand-navy hover:underline focus:outline-none focus:ring-2 focus:ring-brand-navy"
                    >
                      <span className="font-mono text-xs">{m.id}</span>
                      <span className="ml-2">{m.programme}{m.programmeSubType ? ' / ' + m.programmeSubType : ''}</span>
                      <span className="ml-2 rounded-sm bg-muted px-1.5 py-0.5 text-[11px]">{m.status}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="audit-heading">
            <h3 id="audit-heading" className="mb-2 font-heading text-base font-semibold text-brand-navy">
              Audit log
            </h3>
            <AuditLogPanel entries={school.auditLog} />
          </section>

        </div>
      </main>
    </>
  )
}
