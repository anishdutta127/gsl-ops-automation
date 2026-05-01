/*
 * /admin/cc-rules/[ruleId] (Phase C5a-1).
 *
 * Detail + edit page. Same minimal-shape conventions as /new: scopeValue
 * is one input parsed at the API layer; contexts is a checkbox group;
 * ccUserIds is comma-separated text with a datalist.
 *
 * Permission gate: Admin or OpsHead (cc-rule:edit). Inputs are
 * pre-filled with the existing rule values; fields the user does not
 * change pass through unchanged (the API trims the patch to fields
 * whose values differ).
 */

import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import type { CcRule, SalesPerson, User } from '@/lib/types'
import ccRulesJson from '@/data/cc_rules.json'
import usersJson from '@/data/users.json'
import salesTeamJson from '@/data/sales_team.json'
import { getCurrentUser } from '@/lib/auth/session'
import { TopNav } from '@/components/ops/TopNav'
import { PageHeader } from '@/components/ops/PageHeader'
import { OpsButton, opsButtonClass } from '@/components/ops/OpsButton'

const rules = ccRulesJson as unknown as CcRule[]
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
  permission: 'You do not have permission to edit cc rules.',
  'unknown-user': 'Session user not found. Please log in again.',
  'rule-not-found': 'Rule was not found in the directory.',
  'invalid-sheet': 'Sheet is not a valid value.',
  'invalid-scope': 'Scope is not a valid value.',
  'invalid-contexts': 'Pick at least one context.',
  'invalid-scope-value': 'Scope value is required and may not be blank.',
  'invalid-cc-user-ids': 'Cc user ids must all resolve in users or sales team.',
  'missing-source-rule-text': 'Source rule text is required.',
  'no-change': 'No fields were changed.',
}

function scopeValueToInput(value: string | string[]): string {
  return Array.isArray(value) ? value.join(', ') : value
}

export default async function CcRuleDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ ruleId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { ruleId } = await params
  const sp = await searchParams

  const user = await getCurrentUser()
  if (!user) redirect(`/login?next=%2Fadmin%2Fcc-rules%2F${encodeURIComponent(ruleId)}`)

  const rule = rules.find((r) => r.id === ruleId)
  if (!rule) notFound()

  const errorKey = typeof sp.error === 'string' ? sp.error : null
  const errorMessage = errorKey ? ERROR_MESSAGES[errorKey] ?? `Failed: ${errorKey}` : null

  const ccUserOptions: Array<{ id: string; label: string }> = [
    ...users.map((u) => ({ id: u.id, label: `${u.name} (${u.id})` })),
    ...salesTeam.map((s) => ({ id: s.id, label: `${s.name} (${s.id})` })),
  ]

  const contextSet = new Set(rule.contexts)

  return (
    <>
      <TopNav currentPath="/admin" />
      <main id="main-content">
        <PageHeader
          title={rule.id}
          subtitle={`Created ${rule.createdAt.slice(0, 10)} by ${rule.createdBy}. ${rule.enabled ? 'Currently enabled.' : 'Currently disabled.'}`}
          breadcrumb={[
            { label: 'Dashboard', href: '/' },
            { label: 'Admin', href: '/admin' },
            { label: 'CC rules', href: '/admin/cc-rules' },
            { label: rule.id },
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
        action={`/api/cc-rules/${encodeURIComponent(rule.id)}/edit`}
        className="mt-6 space-y-5"
      >
        <Field label="Sheet" htmlFor="cc-sheet">
          <select
            id="cc-sheet"
            name="sheet"
            defaultValue={rule.sheet}
            className="w-full min-h-11 rounded-md border border-input bg-card px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
          >
            {SHEETS.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </Field>

        <Field label="Scope" htmlFor="cc-scope">
          <select
            id="cc-scope"
            name="scope"
            defaultValue={rule.scope}
            className="w-full min-h-11 rounded-md border border-input bg-card px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
          >
            {SCOPES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </Field>

        <Field
          label="Scope value"
          htmlFor="cc-scope-value"
          hint='Comma-separate multi-value scopes. Single token for region or single school.'
        >
          <input
            id="cc-scope-value"
            name="scopeValue"
            type="text"
            defaultValue={scopeValueToInput(rule.scopeValue)}
            className="w-full min-h-11 rounded-md border border-input bg-card px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
          />
        </Field>

        <Field label="Contexts" htmlFor="cc-contexts">
          <fieldset id="cc-contexts" className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {CONTEXTS.map((c) => (
              <label key={c} className="inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="contexts"
                  value={c}
                  defaultChecked={contextSet.has(c)}
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
          hint="Comma-separated. Must resolve in users or sales team."
        >
          <input
            id="cc-user-ids"
            name="ccUserIds"
            type="text"
            defaultValue={rule.ccUserIds.join(', ')}
            list="cc-user-id-options"
            className="w-full min-h-11 rounded-md border border-input bg-card px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
          />
          <datalist id="cc-user-id-options">
            {ccUserOptions.map((o) => (
              <option key={o.id} value={o.id} label={o.label} />
            ))}
          </datalist>
        </Field>

        <Field label="Source rule text" htmlFor="cc-source-text">
          <textarea
            id="cc-source-text"
            name="sourceRuleText"
            rows={3}
            defaultValue={rule.sourceRuleText}
            className="w-full min-h-11 rounded-md border border-input bg-card px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
          />
        </Field>

        <div className="flex items-center gap-3">
          <OpsButton type="submit" variant="primary" size="md">
            Save changes
          </OpsButton>
          <Link
            href="/admin/cc-rules"
            className={opsButtonClass({ variant: 'outline', size: 'md' })}
          >
            Cancel
          </Link>
        </div>
      </form>

      <section className="mt-10">
        <h2 className="text-lg font-semibold text-brand-navy">Audit history</h2>
        {rule.auditLog.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No audit entries yet.</p>
        ) : (
          <ul className="mt-2 divide-y divide-border rounded-md border border-border bg-card">
            {rule.auditLog.map((entry, idx) => (
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
