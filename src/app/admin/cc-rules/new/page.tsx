/*
 * /admin/cc-rules/new (Phase C5a-1).
 *
 * Server Component. Minimal-shape form per scope decision: one form,
 * not five scope-conditional sub-forms. scopeValue is a single text
 * input parsed at the API layer (comma-separated to string[], single
 * token to string).
 *
 * Admin-only for the first 30 days post-launch (Item 8). Non-Admin
 * viewers redirect to /admin/cc-rules. POST target is
 * /api/cc-rules/create which enforces the same gate inside
 * createCcRule.
 */

import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getCurrentUser } from '@/lib/auth/session'
import { effectiveRoles } from '@/lib/auth/permissions'
import type { SalesPerson, User } from '@/lib/types'
import usersJson from '@/data/users.json'
import salesTeamJson from '@/data/sales_team.json'

const users = usersJson as unknown as User[]
const salesTeam = salesTeamJson as unknown as SalesPerson[]

const SHEETS = ['South-West', 'East', 'North', 'derived'] as const
const SCOPES = [
  'region',
  'sub-region',
  'school',
  'training-mode',
  'sr-no-range',
] as const
const CONTEXTS = [
  'welcome-note',
  'three-ping-cadence',
  'dispatch-notification',
  'feedback-request',
  'closing-letter',
  'escalation-notification',
  'all-communications',
] as const

const ERROR_MESSAGES: Record<string, string> = {
  permission: 'Only Admin can create rules during the first 30 days post-launch.',
  'unknown-user': 'Session user not found. Please log in again.',
  'duplicate-id': 'A rule with that id already exists. Pick a different id.',
  'invalid-id-format': 'Id must start with "CCR-" and use uppercase letters, digits, and hyphens.',
  'invalid-sheet': 'Sheet is not a valid value.',
  'invalid-scope': 'Scope is not a valid value.',
  'invalid-contexts': 'Pick at least one context.',
  'invalid-scope-value': 'Scope value is required and may not be blank.',
  'invalid-cc-user-ids': 'Cc user ids must all resolve in users or sales team.',
  'missing-source-rule-text': 'Source rule text is required.',
}

export default async function NewCcRulePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = await searchParams
  const user = await getCurrentUser()
  if (!user) redirect('/login?next=%2Fadmin%2Fcc-rules%2Fnew')

  const roles = effectiveRoles(user)
  if (!roles.includes('Admin')) redirect('/admin/cc-rules')

  const errorKey = typeof sp.error === 'string' ? sp.error : null
  const errorMessage = errorKey ? ERROR_MESSAGES[errorKey] ?? `Failed: ${errorKey}` : null

  const ccUserOptions: Array<{ id: string; label: string; group: 'Users' | 'Sales team' }> = [
    ...users.map((u) => ({ id: u.id, label: `${u.name} (${u.id})`, group: 'Users' as const })),
    ...salesTeam.map((s) => ({ id: s.id, label: `${s.name} (${s.id})`, group: 'Sales team' as const })),
  ]

  return (
    <div className="p-6 max-w-3xl">
      <p className="mb-2 text-xs">
        <Link
          href="/admin/cc-rules"
          className="text-[var(--brand-navy)] underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-navy)]"
        >
          Back to CC rules
        </Link>
      </p>
      <h1 className="text-2xl font-bold text-[var(--brand-navy)]">New CC rule</h1>
      <p className="mt-1 text-sm text-slate-700">
        Admin-only during the first 30 days post-launch (Item 8).
      </p>

      {errorMessage ? (
        <p
          role="alert"
          className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
        >
          {errorMessage}
        </p>
      ) : null}

      <form
        method="POST"
        action="/api/cc-rules/create"
        className="mt-6 space-y-5"
      >
        <Field label="Id" htmlFor="cc-id" hint='Format: CCR-... (e.g., "CCR-NORTH-DELHI"). Uppercase, digits, hyphens after the prefix.'>
          <input
            id="cc-id"
            name="id"
            type="text"
            required
            pattern="^CCR-[A-Z0-9-]+$"
            placeholder="CCR-NORTH-DELHI"
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-navy)]"
          />
        </Field>

        <Field label="Sheet" htmlFor="cc-sheet">
          <select
            id="cc-sheet"
            name="sheet"
            required
            defaultValue=""
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-navy)]"
          >
            <option value="" disabled>
              Choose a sheet
            </option>
            {SHEETS.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </Field>

        <Field label="Scope" htmlFor="cc-scope">
          <select
            id="cc-scope"
            name="scope"
            required
            defaultValue=""
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-navy)]"
          >
            <option value="" disabled>
              Choose a scope
            </option>
            {SCOPES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </Field>

        <Field
          label="Scope value"
          htmlFor="cc-scope-value"
          hint='Comma-separate multi-value scopes (e.g., "Raipur, Pune, Nagpur"). Single token for region or single school (e.g., "East" or "SCH-DPS-DELHI").'
        >
          <input
            id="cc-scope-value"
            name="scopeValue"
            type="text"
            required
            placeholder="Raipur, Pune, Nagpur"
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-navy)]"
          />
        </Field>

        <Field label="Contexts" htmlFor="cc-contexts" hint="Pick at least one. The cc fan-out fires only for matching context types.">
          <fieldset id="cc-contexts" className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {CONTEXTS.map((c) => (
              <label key={c} className="inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="contexts"
                  value={c}
                  className="size-4 rounded border-slate-300 text-[var(--brand-navy)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-navy)]"
                />
                <span className="text-slate-800">{c}</span>
              </label>
            ))}
          </fieldset>
        </Field>

        <Field
          label="Cc user ids"
          htmlFor="cc-user-ids"
          hint='Comma-separated. Each id must resolve in users.json or sales_team.json. Pick from the list below for reference.'
        >
          <input
            id="cc-user-ids"
            name="ccUserIds"
            type="text"
            required
            placeholder="anish.d, sp-vikram"
            list="cc-user-id-options"
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-navy)]"
          />
          <datalist id="cc-user-id-options">
            {ccUserOptions.map((o) => (
              <option key={o.id} value={o.id} label={o.label} />
            ))}
          </datalist>
        </Field>

        <Field
          label="Source rule text"
          htmlFor="cc-source-text"
          hint="Verbatim text from the SPOC DB rule. Audit anchor."
        >
          <textarea
            id="cc-source-text"
            name="sourceRuleText"
            required
            rows={3}
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-navy)]"
          />
        </Field>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            className="inline-flex items-center rounded-md bg-[var(--brand-navy)] px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-navy)] min-h-[44px]"
          >
            Create rule
          </button>
          <Link
            href="/admin/cc-rules"
            className="text-sm text-slate-700 underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-navy)]"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  )
}

function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string
  htmlFor: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="block text-sm font-medium text-[var(--brand-navy)]"
      >
        {label}
      </label>
      {hint ? <p className="mt-0.5 text-xs text-slate-600">{hint}</p> : null}
      <div className="mt-1.5">{children}</div>
    </div>
  )
}
