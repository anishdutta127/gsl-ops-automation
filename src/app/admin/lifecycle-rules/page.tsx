/*
 * /admin/lifecycle-rules (W3-D).
 *
 * Edit-in-place per row. Each rule lists its from-stage and to-stage
 * labels (using the kanban column-label vocabulary), the current
 * defaultDays, last-changed timestamp + user, optional customNotes,
 * and an inline number+textarea form posting to
 * /api/admin/lifecycle-rules/[stageFromKey]/edit.
 *
 * UI gating disabled per W3-B: any authenticated user reaches this
 * page. Server-side enforcement at submit time still requires
 * Admin (lifecycle-rule:edit is Admin-only via the wildcard);
 * non-Admin submits redirect back with ?error=permission.
 *
 * Page header copy makes the retroactive-recompute semantic explicit:
 * changing a rule shifts which MOUs render as overdue on next render.
 */

import { redirect } from 'next/navigation'
import Link from 'next/link'
import type { LifecycleRule, User } from '@/lib/types'
import lifecycleRulesJson from '@/data/lifecycle_rules.json'
import usersJson from '@/data/users.json'
import { getCurrentUser } from '@/lib/auth/session'
import { KANBAN_COLUMNS } from '@/lib/kanban/deriveStage'

const allRules = lifecycleRulesJson as unknown as LifecycleRule[]
const allUsers = usersJson as unknown as User[]

const STAGE_LABEL_BY_KEY: Record<string, string> = {
  ...Object.fromEntries(KANBAN_COLUMNS.map((c) => [c.key, c.label])),
  // Virtual closure marker (post-feedback); not a real kanban column.
  'mou-closed': 'MOU closed',
}

const ERROR_MESSAGES: Record<string, string> = {
  'invalid-days': 'Default days must be a whole number between 1 and 365.',
  'rule-not-found': 'Rule was not found.',
  'unknown-user': 'Session user not found. Please log in again.',
  permission: 'Editing lifecycle rules requires the Admin role.',
  'no-change': 'Submitted value matches the current value; no change recorded.',
}

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

function userNameById(id: string): string {
  const u = allUsers.find((x) => x.id === id)
  return u ? u.name : id
}

function relativeTime(iso: string, now: Date): string {
  const ms = now.getTime() - new Date(iso).getTime()
  if (!Number.isFinite(ms) || ms < 0) return iso.slice(0, 10)
  const days = Math.floor(ms / (24 * 60 * 60 * 1000))
  if (days === 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 30) return `${days} days ago`
  if (days < 365) return `${Math.floor(days / 30)} months ago`
  return iso.slice(0, 10)
}

const FIELD_INPUT_CLASS =
  'block w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy'
const FIELD_LABEL_CLASS = 'block text-sm font-medium text-brand-navy mb-1'

export default async function LifecycleRulesPage({ searchParams }: PageProps) {
  const sp = await searchParams
  const user = await getCurrentUser()
  if (!user) redirect('/login?next=%2Fadmin%2Flifecycle-rules')

  const errorKey = typeof sp.error === 'string' ? sp.error : null
  const errorStage = typeof sp.stage === 'string' ? sp.stage : null
  const errorMessage = errorKey ? ERROR_MESSAGES[errorKey] ?? `Failed: ${errorKey}` : null

  const savedStage = typeof sp.saved === 'string' ? sp.saved : null

  const now = new Date()

  return (
    <div className="mx-auto max-w-3xl p-6">
      <header className="mb-4">
        <h1 className="text-2xl font-bold text-brand-navy">Lifecycle rules</h1>
        <p className="mt-2 rounded-md border border-signal-attention bg-card p-3 text-sm text-foreground">
          Changing a rule&rsquo;s duration retroactively recomputes overdue badges across all MOUs at that stage.
          The audit log records who changed what and when.
        </p>
      </header>

      {savedStage ? (
        <p
          role="status"
          className="mb-4 rounded-md border border-signal-ok bg-card p-3 text-sm text-foreground"
          data-testid="rules-saved-flash"
        >
          Rule for <strong>{STAGE_LABEL_BY_KEY[savedStage] ?? savedStage}</strong> saved.
          Kanban overdue badges will reflect the new duration on next render.
        </p>
      ) : null}

      <ul className="space-y-3">
        {allRules.map((rule) => {
          const fromLabel = STAGE_LABEL_BY_KEY[rule.stageFromKey] ?? rule.stageFromKey
          const toLabel = STAGE_LABEL_BY_KEY[rule.stageToKey] ?? rule.stageToKey
          const showError = errorMessage && errorStage === rule.stageFromKey
          return (
            <li
              key={rule.stageFromKey}
              className="rounded-lg border border-border bg-card p-4"
              data-testid={`rule-${rule.stageFromKey}`}
            >
              <header className="mb-3 flex items-baseline justify-between gap-3">
                <div>
                  <h2 className="font-heading text-base font-semibold text-brand-navy">
                    {fromLabel} <span className="text-muted-foreground">to</span> {toLabel}
                  </h2>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Last changed {relativeTime(rule.updatedAt, now)} by {userNameById(rule.updatedBy)}
                  </p>
                </div>
                <span
                  className="inline-flex rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-foreground"
                  data-testid={`rule-${rule.stageFromKey}-current`}
                >
                  {rule.defaultDays} days
                </span>
              </header>

              {rule.customNotes ? (
                <p className="mb-3 text-xs text-muted-foreground">{rule.customNotes}</p>
              ) : null}

              {showError ? (
                <p
                  role="alert"
                  className="mb-3 rounded-md border border-signal-alert bg-card p-2 text-xs text-signal-alert"
                  data-testid={`rule-${rule.stageFromKey}-error`}
                >
                  {errorMessage}
                </p>
              ) : null}

              <form
                action={`/api/admin/lifecycle-rules/${rule.stageFromKey}/edit`}
                method="POST"
                className="grid grid-cols-1 gap-3 sm:grid-cols-2"
                data-testid={`rule-${rule.stageFromKey}-form`}
              >
                <div>
                  <label htmlFor={`days-${rule.stageFromKey}`} className={FIELD_LABEL_CLASS}>
                    Default days
                  </label>
                  <input
                    id={`days-${rule.stageFromKey}`}
                    name="defaultDays"
                    type="number"
                    min="1"
                    max="365"
                    step="1"
                    defaultValue={rule.defaultDays}
                    required
                    className={FIELD_INPUT_CLASS}
                  />
                </div>
                <div>
                  <label htmlFor={`notes-${rule.stageFromKey}`} className={FIELD_LABEL_CLASS}>
                    Change notes (optional)
                  </label>
                  <input
                    id={`notes-${rule.stageFromKey}`}
                    name="changeNotes"
                    type="text"
                    placeholder="e.g., school cohort runs 45-day cycles"
                    className={FIELD_INPUT_CLASS}
                  />
                </div>
                <div className="sm:col-span-2 flex flex-wrap gap-2 border-t border-border pt-3">
                  <button
                    type="submit"
                    className="inline-flex min-h-11 items-center rounded-md bg-brand-teal px-4 py-2 text-sm font-medium text-brand-navy hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
                  >
                    Save
                  </button>
                  <Link
                    href="/admin/lifecycle-rules"
                    className="inline-flex min-h-11 items-center rounded-md border border-border bg-card px-4 py-2 text-sm font-medium hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
                  >
                    Cancel
                  </Link>
                </div>
              </form>
            </li>
          )
        })}
      </ul>

      <p className="mt-6 text-xs text-muted-foreground">
        Pre-Ops Legacy triage budget (30 days) stays hardcoded in code as a special case;
        the W3-D collection lists only forward-stage transitions.
      </p>
    </div>
  )
}
