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
}

function canEdit(user: User | null): boolean {
  if (!user) return false
  if (user.role === 'Admin' || user.role === 'OpsHead') return true
  if (user.testingOverride && user.testingOverridePermissions?.includes('OpsHead')) return true
  return false
}

export default async function SchoolDetailPage({ params }: PageProps) {
  const { schoolId } = await params
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
            <h3 id="mous-heading" className="mb-3 font-heading text-base font-semibold text-brand-navy">
              MOUs ({schoolMous.length})
            </h3>
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
