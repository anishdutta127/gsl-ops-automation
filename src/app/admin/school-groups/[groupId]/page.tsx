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
import Link from 'next/link'
import type { School, SchoolGroup } from '@/lib/types'
import schoolGroupsJson from '@/data/school_groups.json'
import schoolsJson from '@/data/schools.json'
import { getCurrentUser } from '@/lib/auth/session'
import { FormCard, type FormCardField } from '@/components/ops/FormCard'

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

  return (
    <div className="p-6 max-w-3xl">
      <p className="mb-2 text-xs">
        <Link
          href="/admin/school-groups"
          className="text-[var(--brand-navy)] underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-navy)]"
        >
          Back to school groups
        </Link>
      </p>
      <h1 className="text-2xl font-bold text-[var(--brand-navy)]">{group.name}</h1>
      <p className="mt-1 text-sm text-slate-700">
        {group.id} · Region {group.region} · {group.memberSchoolIds.length} current members
        {group.groupMouId ? ` · MOU ${group.groupMouId}` : ''}.
      </p>

      <div className="mt-6">
        <FormCard
          action={`/api/admin/school-groups/${encodeURIComponent(group.id)}/edit-members`}
          submitLabel="Save members"
          fields={fields}
          cancelHref="/admin/school-groups"
          errorMessage={errorMessage}
        />
      </div>

      <section className="mt-10">
        <h2 className="text-lg font-semibold text-[var(--brand-navy)]">Audit history</h2>
        {group.auditLog.length === 0 ? (
          <p className="mt-2 text-sm text-slate-600">No audit entries yet.</p>
        ) : (
          <ul className="mt-2 divide-y divide-slate-200 rounded-md border border-slate-200 bg-white">
            {group.auditLog.map((entry, idx) => (
              <li key={`${entry.timestamp}-${idx}`} className="px-3 py-2 text-xs">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-medium text-[var(--brand-navy)]">{entry.action}</span>
                  <span className="text-slate-500">{entry.timestamp}</span>
                </div>
                <div className="mt-0.5 text-slate-700">
                  by {entry.user}
                  {entry.notes ? `: ${entry.notes}` : ''}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
