/*
 * /admin/schools/new (Phase C5b).
 *
 * Server Component. Uses FormCard with the School create shape. The
 * 2-column edit grid in /schools/[id]/edit (C3) is intentionally NOT
 * mirrored here; FormCard is a vertical-stack primitive and the
 * trade-off favours consistency with the other admin-create surfaces
 * over visual fidelity to the edit page.
 *
 * Permission gate: Admin or OpsHead per 'school:create'.
 */

import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/session'
import { FormCard, type FormCardField } from '@/components/ops/FormCard'

const REGIONS = [
  { value: 'East', label: 'East' },
  { value: 'North', label: 'North' },
  { value: 'South-West', label: 'South-West' },
]

const ERROR_MESSAGES: Record<string, string> = {
  permission: 'You do not have permission to create schools.',
  'unknown-user': 'Session user not found. Please log in again.',
  'duplicate-id': 'A school with that id already exists.',
  'invalid-id-format': 'Id must start with "SCH-" and use uppercase letters, digits, and hyphens.',
  'missing-name': 'Name is required.',
  'missing-city': 'City is required.',
  'missing-state': 'State is required.',
  'missing-region': 'Region is required.',
  'invalid-pin': 'PIN code must be 6 digits.',
  'invalid-email': 'Email is not in a valid format.',
  'invalid-pan': 'PAN must match the AAAAA9999A pattern.',
  'invalid-gst': 'GSTIN must match the standard 15-character format.',
}

export default async function NewSchoolPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = await searchParams
  const user = await getCurrentUser()
  if (!user) redirect('/login?next=%2Fadmin%2Fschools%2Fnew')

  const errorKey = typeof sp.error === 'string' ? sp.error : null
  const errorMessage = errorKey ? ERROR_MESSAGES[errorKey] ?? `Failed: ${errorKey}` : null

  const fields: FormCardField[] = [
    {
      name: 'id', label: 'Id', type: 'text', required: true,
      pattern: '^SCH-[A-Z0-9-]+$',
      placeholder: 'SCH-NEW-DELHI',
      hint: 'Format: SCH-... (uppercase letters, digits, hyphens after the prefix).',
    },
    { name: 'name', label: 'Name', type: 'text', required: true },
    { name: 'legalEntity', label: 'Legal entity', type: 'text' },
    { name: 'city', label: 'City', type: 'text', required: true },
    { name: 'state', label: 'State', type: 'text', required: true },
    { name: 'region', label: 'Region', type: 'select', required: true, options: REGIONS },
    {
      name: 'pinCode', label: 'PIN code', type: 'text', pattern: '^[0-9]{6}$',
      inputMode: 'numeric', placeholder: '110001',
    },
    { name: 'contactPerson', label: 'Contact person (SPOC)', type: 'text' },
    { name: 'email', label: 'Email (SPOC)', type: 'email' },
    { name: 'phone', label: 'Phone (SPOC)', type: 'tel' },
    { name: 'billingName', label: 'Billing name', type: 'text' },
    { name: 'pan', label: 'PAN', type: 'text', pattern: '^[A-Z]{5}[0-9]{4}[A-Z]$' },
    {
      name: 'gstNumber', label: 'GSTIN', type: 'text',
      pattern: '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9][A-Z][0-9]$',
      hint: 'Optional at creation; PI generation blocks until set per Item F.',
    },
    { name: 'notes', label: 'Notes', type: 'textarea', rows: 3 },
  ]

  return (
    <div className="p-6 max-w-3xl">
      <h1 className="text-2xl font-bold text-[var(--brand-navy)]">New school</h1>
      <p className="mt-1 text-sm text-slate-700">
        Self-serve per Item 8. Admin or OpsHead.
      </p>
      <div className="mt-6">
        <FormCard
          action="/api/admin/schools/create"
          submitLabel="Create school"
          fields={fields}
          cancelHref="/admin/schools"
          errorMessage={errorMessage}
        />
      </div>
    </div>
  )
}
