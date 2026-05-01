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
import type { SalesPerson, User } from '@/lib/types'
import usersJson from '@/data/users.json'
import salesTeamJson from '@/data/sales_team.json'
import { TopNav } from '@/components/ops/TopNav'
import { PageHeader } from '@/components/ops/PageHeader'
import { OpsButton, opsButtonClass } from '@/components/ops/OpsButton'

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

  const errorKey = typeof sp.error === 'string' ? sp.error : null
  const errorMessage = errorKey ? ERROR_MESSAGES[errorKey] ?? `Failed: ${errorKey}` : null

  const ccUserOptions: Array<{ id: string; label: string; group: 'Users' | 'Sales team' }> = [
    ...users.map((u) => ({ id: u.id, label: `${u.name} (${u.id})`, group: 'Users' as const })),
    ...salesTeam.map((s) => ({ id: s.id, label: `${s.name} (${s.id})`, group: 'Sales team' as const })),
  ]

  return (
    <>
      <TopNav currentPath="/admin" />
      <main id="main-content">
        <PageHeader
          title="New CC rule"
          subtitle="Admin-only during the first 30 days post-launch (Item 8)."
          breadcrumb={[
            { label: 'Dashboard', href: '/' },
            { label: 'Admin', href: '/admin' },
            { label: 'CC rules', href: '/admin/cc-rules' },
            { label: 'New' },
          ]}
        />
        <div className="mx-auto max-w-screen-md px-4 py-6">

      {errorMessage ? (
        <p
          role="alert"
          className="mt-4 rounded-md border border-signal-alert bg-signal-alert/10 px-3 py-2 text-sm text-signal-alert"
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
            className="w-full min-h-11 rounded-md border border-input bg-card px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
          />
        </Field>

        <Field label="Sheet" htmlFor="cc-sheet">
          <select
            id="cc-sheet"
            name="sheet"
            required
            defaultValue=""
            className="w-full min-h-11 rounded-md border border-input bg-card px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
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
            className="w-full min-h-11 rounded-md border border-input bg-card px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
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
            className="w-full min-h-11 rounded-md border border-input bg-card px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
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
                  className="size-4 rounded border-input text-brand-navy focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-navy"
                />
                <span className="text-foreground">{c}</span>
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
            className="w-full min-h-11 rounded-md border border-input bg-card px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
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
            className="w-full min-h-11 rounded-md border border-input bg-card px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
          />
        </Field>

        <div className="flex items-center gap-3">
          <OpsButton type="submit" variant="primary" size="md">
            Create rule
          </OpsButton>
          <Link
            href="/admin/cc-rules"
            className={opsButtonClass({ variant: 'outline', size: 'md' })}
          >
            Cancel
          </Link>
        </div>
      </form>
        </div>
      </main>
    </>
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
        className="block text-sm font-medium text-brand-navy"
      >
        {label}
      </label>
      {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
      <div className="mt-1.5">{children}</div>
    </div>
  )
}
