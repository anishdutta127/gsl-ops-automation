/*
 * /admin/sales-team/new (Phase C5b).
 *
 * Server Component. Uses FormCard with the SalesPerson shape.
 * Territories are a comma-list (free-form arrays); programmes are
 * a checkbox-group (5-value Programme enum).
 *
 * Permission gate: Admin or OpsHead per 'sales-rep:create'. Other
 * viewers redirect to /admin/sales-team.
 */

import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/session'
import { FormCard, type FormCardField } from '@/components/ops/FormCard'
import { TopNav } from '@/components/ops/TopNav'
import { PageHeader } from '@/components/ops/PageHeader'

const ERROR_MESSAGES: Record<string, string> = {
  permission: 'You do not have permission to create sales reps.',
  'unknown-user': 'Session user not found. Please log in again.',
  'duplicate-id': 'A sales rep with that id already exists.',
  'invalid-id-format': 'Id must start with "sp-" and use lowercase letters, digits, and hyphens.',
  'invalid-email': 'Email is not in a valid format.',
  'missing-name': 'Name is required.',
  'invalid-territories': 'Territories must be a non-empty comma-separated list.',
  'invalid-programmes': 'Pick at least one programme.',
  'invalid-joined-date': 'Joined date must be a calendar date (YYYY-MM-DD).',
}

const PROGRAMMES = [
  { value: 'STEAM', label: 'STEAM' },
  { value: 'Young Pioneers', label: 'Young Pioneers' },
  { value: 'Harvard HBPE', label: 'Harvard HBPE' },
  { value: 'TinkRworks', label: 'TinkRworks' },
  { value: 'VEX', label: 'VEX' },
]

export default async function NewSalesPersonPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = await searchParams
  const user = await getCurrentUser()
  if (!user) redirect('/login?next=%2Fadmin%2Fsales-team%2Fnew')

  const errorKey = typeof sp.error === 'string' ? sp.error : null
  const errorMessage = errorKey ? ERROR_MESSAGES[errorKey] ?? `Failed: ${errorKey}` : null

  const fields: FormCardField[] = [
    {
      name: 'id', label: 'Id', type: 'text', required: true,
      pattern: '^sp-[a-z0-9-]+$',
      placeholder: 'sp-priya',
      hint: 'Format: sp-... (lowercase letters, digits, hyphens after the prefix).',
    },
    { name: 'name', label: 'Name', type: 'text', required: true },
    { name: 'email', label: 'Email', type: 'email', required: true },
    { name: 'phone', label: 'Phone', type: 'tel', placeholder: '+91-98000-00099' },
    {
      name: 'territories', label: 'Territories', type: 'comma-list', required: true,
      placeholder: 'Pune, Mumbai, Nashik',
      hint: 'Comma-separated list of cities or regions.',
    },
    {
      name: 'programmes', label: 'Programmes', type: 'checkbox-group', required: true,
      options: PROGRAMMES,
      hint: 'Pick at least one programme this rep can sell.',
    },
    {
      name: 'joinedDate', label: 'Joined date', type: 'date', required: true,
      hint: 'YYYY-MM-DD.',
    },
  ]

  return (
    <>
      <TopNav currentPath="/admin" />
      <main id="main-content">
        <PageHeader
          title="New sales rep"
          subtitle="Self-serve per Item 8. Admin or OpsHead."
          breadcrumb={[
            { label: 'Dashboard', href: '/' },
            { label: 'Admin', href: '/admin' },
            { label: 'Sales team', href: '/admin/sales-team' },
            { label: 'New' },
          ]}
        />
        <div className="mx-auto max-w-screen-md px-4 py-6">
          <FormCard
            action="/api/admin/sales-team/create"
            submitLabel="Create rep"
            fields={fields}
            cancelHref="/admin/sales-team"
            errorMessage={errorMessage}
          />
        </div>
      </main>
    </>
  )
}
