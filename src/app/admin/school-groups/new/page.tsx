/*
 * /admin/school-groups/new (Phase C5b).
 *
 * Server Component. FormCard with the SchoolGroup create shape.
 * memberSchoolIds is a checkbox-group sourced from schools.json
 * (multi-select-against-fixture per the FormCard scope shapes). Empty
 * member list at creation is allowed; the edit-members surface fills
 * in members later when a chain MOU lands.
 *
 * Permission gate: Admin or OpsHead per 'school-group:create'.
 */

import { redirect } from 'next/navigation'
import type { School } from '@/lib/types'
import schoolsJson from '@/data/schools.json'
import { getCurrentUser } from '@/lib/auth/session'
import { FormCard, type FormCardField } from '@/components/ops/FormCard'
import { TopNav } from '@/components/ops/TopNav'
import { PageHeader } from '@/components/ops/PageHeader'

const schools = schoolsJson as unknown as School[]

const REGIONS = [
  { value: 'East', label: 'East' },
  { value: 'North', label: 'North' },
  { value: 'South-West', label: 'South-West' },
]

const ERROR_MESSAGES: Record<string, string> = {
  permission: 'You do not have permission to create school groups.',
  'unknown-user': 'Session user not found. Please log in again.',
  'duplicate-id': 'A school group with that id already exists.',
  'invalid-id-format': 'Id must start with "SG-" and use uppercase letters, digits, hyphens, or underscores.',
  'missing-name': 'Name is required.',
  'missing-region': 'Region is required.',
  'invalid-member-school-ids': 'One or more selected schools are not in the directory.',
}

export default async function NewSchoolGroupPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = await searchParams
  const user = await getCurrentUser()
  if (!user) redirect('/login?next=%2Fadmin%2Fschool-groups%2Fnew')

  const errorKey = typeof sp.error === 'string' ? sp.error : null
  const errorMessage = errorKey ? ERROR_MESSAGES[errorKey] ?? `Failed: ${errorKey}` : null

  const schoolOptions = schools.map((s) => ({
    value: s.id,
    label: `${s.name} (${s.id})`,
  }))

  const fields: FormCardField[] = [
    {
      name: 'id', label: 'Id', type: 'text', required: true,
      pattern: '^SG-[A-Z0-9_-]+$',
      placeholder: 'SG-NARAYANA_WB',
      hint: 'Format: SG-... (uppercase letters, digits, hyphens, or underscores).',
    },
    { name: 'name', label: 'Name', type: 'text', required: true },
    { name: 'region', label: 'Region', type: 'select', required: true, options: REGIONS },
    {
      name: 'memberSchoolIds', label: 'Member schools', type: 'checkbox-group',
      options: schoolOptions,
      hint: 'Optional at creation. Members can be added later via the edit-members surface.',
    },
    { name: 'notes', label: 'Notes', type: 'textarea', rows: 3 },
  ]

  return (
    <>
      <TopNav currentPath="/admin" />
      <main id="main-content">
        <PageHeader
          title="New school group"
          subtitle="Self-serve per Item 8. Admin or OpsHead."
          breadcrumb={[
            { label: 'Dashboard', href: '/' },
            { label: 'Admin', href: '/admin' },
            { label: 'School groups', href: '/admin/school-groups' },
            { label: 'New' },
          ]}
        />
        <div className="mx-auto max-w-screen-md px-4 py-6">
          <FormCard
            action="/api/admin/school-groups/create"
            submitLabel="Create group"
            fields={fields}
            cancelHref="/admin/school-groups"
            errorMessage={errorMessage}
          />
        </div>
      </main>
    </>
  )
}
