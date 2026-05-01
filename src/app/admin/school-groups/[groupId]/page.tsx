/*
 * /admin/school-groups/[groupId] (Phase C5b).
 *
 * Server Component. Edit-members surface for an existing SchoolGroup.
 * Renders the full schools.json directory as a checkbox-group with
 * current members pre-checked. Submit POSTs to
 * /api/admin/school-groups/[groupId]/edit-members which computes the
 * added + removed deltas via the lib.
 *
 * Permission gate: Admin or OpsHead per 'school-group:edit-members'.
 *
 * The audit history for this group is rendered below the form. Group
 * id, name, region, and groupMouId are NOT editable here; full record
 * editing is a Phase 1.1 surface if needed.
 */

import { notFound, redirect } from 'next/navigation'
import type { School, SchoolGroup } from '@/lib/types'
import schoolGroupsJson from '@/data/school_groups.json'
import schoolsJson from '@/data/schools.json'
import { getCurrentUser } from '@/lib/auth/session'
import { FormCard, type FormCardField } from '@/components/ops/FormCard'
import { TopNav } from '@/components/ops/TopNav'
import { PageHeader } from '@/components/ops/PageHeader'

const groups = schoolGroupsJson as unknown as SchoolGroup[]
const schools = schoolsJson as unknown as School[]

const ERROR_MESSAGES: Record<string, string> = {
  permission: 'You do not have permission to edit school group members.',
  'unknown-user': 'Session user not found. Please log in again.',
  'group-not-found': 'School group was not found.',
  'invalid-member-school-ids': 'One or more selected schools are not in the directory.',
  'no-change': 'Member list is unchanged.',
}

export default async function SchoolGroupEditPage({
  params,
  searchParams,
}: {
  params: Promise<{ groupId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { groupId } = await params
  const sp = await searchParams

  const user = await getCurrentUser()
  if (!user) redirect(`/login?next=%2Fadmin%2Fschool-groups%2F${encodeURIComponent(groupId)}`)

  const group = groups.find((g) => g.id === groupId)
  if (!group) notFound()

  const errorKey = typeof sp.error === 'string' ? sp.error : null
  const errorMessage = errorKey ? ERROR_MESSAGES[errorKey] ?? `Failed: ${errorKey}` : null

  const schoolOptions = schools.map((s) => ({
    value: s.id,
    label: `${s.name} (${s.id})`,
  }))

  const fields: FormCardField[] = [
    {
      name: 'memberSchoolIds', label: 'Member schools', type: 'checkbox-group',
      options: schoolOptions,
      defaultValue: group.memberSchoolIds,
    },
    {
      name: 'notes', label: 'Notes', type: 'textarea', rows: 2,
      hint: 'Optional. Captured in the audit entry for this edit.',
    },
  ]

  const subtitle = `${group.id} · Region ${group.region} · ${group.memberSchoolIds.length} current members${group.groupMouId ? ` · MOU ${group.groupMouId}` : ''}.`

  return (
    <>
      <TopNav currentPath="/admin" />
      <main id="main-content">
        <PageHeader
          title={group.name}
          subtitle={subtitle}
          breadcrumb={[
            { label: 'Dashboard', href: '/' },
            { label: 'Admin', href: '/admin' },
            { label: 'School groups', href: '/admin/school-groups' },
            { label: group.name },
          ]}
        />
        <div className="mx-auto max-w-screen-md px-4 py-6">
          <FormCard
            action={`/api/admin/school-groups/${encodeURIComponent(group.id)}/edit-members`}
            submitLabel="Save members"
            fields={fields}
            cancelHref="/admin/school-groups"
            errorMessage={errorMessage}
          />

          <section className="mt-10">
            <h2 className="text-lg font-semibold text-brand-navy">Audit history</h2>
            {group.auditLog.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">No audit entries yet.</p>
            ) : (
              <ul className="mt-2 divide-y divide-border rounded-md border border-border bg-card">
                {group.auditLog.map((entry, idx) => (
                  <li key={`${entry.timestamp}-${idx}`} className="px-3 py-2 text-xs">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-medium text-brand-navy">{entry.action}</span>
                      <span className="text-muted-foreground">{entry.timestamp}</span>
                    </div>
                    <div className="mt-0.5 text-foreground">
                      by {entry.user}
                      {entry.notes ? `: ${entry.notes}` : ''}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </main>
    </>
  )
}
