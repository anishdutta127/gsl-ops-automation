/*
 * /escalations/new (Gate 4 Step 5).
 *
 * Manual escalation create form. Reachable from the consolidated
 * landing Zone 4 quick-action (re-routed from /escalations after this
 * route exists) and from the /escalations list page's primary CTA.
 *
 * Form posts to createEscalationAction in /escalations/actions.ts.
 * On success the action fans out a notification to the owning dept
 * (or assignedTo if specified) and redirects to the new detail page.
 * On any validation failure the action 303-redirects back here with
 * an ?error=... query parameter.
 *
 * Visibility (Gate 1): every authenticated user can raise a ticket;
 * resolution stays scoped to the owning dept via escalation:resolve.
 */

import { redirect } from 'next/navigation'
import { AlertCircle } from 'lucide-react'
import type { MOU, School, User } from '@/lib/types'
import mousJson from '@/data/mous.json'
import schoolsJson from '@/data/schools.json'
import usersJson from '@/data/users.json'
import { getCurrentUser } from '@/lib/auth/session'
import { canPerform } from '@/lib/auth/permissions'
import { TopNav } from '@/components/ops/TopNav'
import { PageHeader } from '@/components/ops/PageHeader'
import { OpsButton, opsButtonClass } from '@/components/ops/OpsButton'
import { slaWindowHours } from '@/lib/escalations/sla'
import { createEscalationAction } from '../actions'

const allMous = mousJson as unknown as MOU[]
const allSchools = schoolsJson as unknown as School[]
const allUsers = usersJson as unknown as User[]

const ERROR_COPY: Record<string, string> = {
  'missing-description': 'Description is required.',
  'invalid-severity': 'Pick a severity.',
  'invalid-category': 'Pick a valid category.',
  'invalid-type': 'Pick a valid type.',
  'invalid-department': 'Pick the owning department.',
  permission: 'You do not have permission to raise an escalation.',
}

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function NewEscalationPage({ searchParams }: PageProps) {
  const user = await getCurrentUser()
  if (!user) redirect('/login?next=%2Fescalations%2Fnew')
  if (!canPerform(user, 'escalation:create')) {
    redirect('/escalations?error=permission')
  }

  const sp = await searchParams
  const errorKey = typeof sp.error === 'string' ? sp.error : null
  const errorMessage = errorKey ? ERROR_COPY[errorKey] ?? `Failed: ${errorKey}` : null

  const presetSchoolId = typeof sp.schoolId === 'string' ? sp.schoolId : ''
  const presetMouId = typeof sp.mouId === 'string' ? sp.mouId : ''

  const activeMous = allMous
    .filter((m) => m.cohortStatus === 'active')
    .sort((a, b) => a.schoolName.localeCompare(b.schoolName))
  const activeSchools = allSchools
    .filter((s) => s.active)
    .sort((a, b) => a.name.localeCompare(b.name))
  const activeUsers = allUsers
    .filter((u) => u.active)
    .sort((a, b) => a.name.localeCompare(b.name))

  return (
    <>
      <TopNav currentPath="/escalations" />
      <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6">
        <PageHeader
          title="Raise an escalation"
          subtitle="Log a ticket against a school, MOU, or cross-team blocker."
          breadcrumb={[
            { label: 'Dashboard', href: '/' },
            { label: 'Escalations', href: '/escalations' },
            { label: 'New' },
          ]}
        />

        {errorMessage ? (
          <div
            role="alert"
            data-testid="escalation-form-error"
            className="mt-4 flex items-start gap-2 rounded-md border border-signal-alert bg-signal-alert/10 p-3 text-sm text-signal-alert"
          >
            <AlertCircle aria-hidden className="size-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        ) : null}

        <form
          action={createEscalationAction}
          method="POST"
          data-testid="escalation-create-form"
          className="mt-6 space-y-5"
        >
          <Field
            label="Description"
            hint="One or two sentences. Edit later from the detail page."
            required
          >
            <textarea
              name="description"
              required
              rows={4}
              minLength={1}
              maxLength={2000}
              data-testid="field-description"
              className="block w-full resize-y rounded-md border border-border bg-white px-3 py-2 text-sm text-brand-navy focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
              placeholder="What happened, what is blocked, what needs to happen next."
            />
          </Field>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Severity" required>
              <select
                name="severity"
                required
                defaultValue=""
                data-testid="field-severity"
                className="block w-full rounded-md border border-border bg-white px-3 py-2 text-sm text-brand-navy focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
              >
                <option value="" disabled>Pick severity</option>
                <option value="critical">P0 critical ({slaWindowHours('critical')}h SLA)</option>
                <option value="high">P1 high ({slaWindowHours('high')}h SLA)</option>
                <option value="medium">P2 medium ({slaWindowHours('medium') / 24}d SLA)</option>
                <option value="low">P3 low ({slaWindowHours('low') / 24}d SLA)</option>
              </select>
            </Field>

            <Field label="Owning department" required>
              <select
                name="ownedByDepartment"
                required
                defaultValue=""
                data-testid="field-department"
                className="block w-full rounded-md border border-border bg-white px-3 py-2 text-sm text-brand-navy focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
              >
                <option value="" disabled>Pick department</option>
                <option value="sales">Sales</option>
                <option value="ops">Operations</option>
                <option value="finance">Finance</option>
              </select>
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Category">
              <select
                name="category"
                defaultValue=""
                data-testid="field-category"
                className="block w-full rounded-md border border-border bg-white px-3 py-2 text-sm text-brand-navy focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
              >
                <option value="">(none)</option>
                <option value="Dispatch Delay">Dispatch Delay</option>
                <option value="Payment Issue">Payment Issue</option>
                <option value="Quality Complaint">Quality Complaint</option>
                <option value="Training Issue">Training Issue</option>
                <option value="School Communication">School Communication</option>
                <option value="Inventory Shortfall">Inventory Shortfall</option>
                <option value="Vendor Issue">Vendor Issue</option>
                <option value="Other">Other</option>
              </select>
            </Field>

            <Field label="Type">
              <select
                name="type"
                defaultValue=""
                data-testid="field-type"
                className="block w-full rounded-md border border-border bg-white px-3 py-2 text-sm text-brand-navy focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
              >
                <option value="">(none)</option>
                <option value="Internal">Internal</option>
                <option value="Customer-facing">Customer-facing</option>
                <option value="Vendor-facing">Vendor-facing</option>
                <option value="Regulatory">Regulatory</option>
                <option value="Operational">Operational</option>
              </select>
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="School (optional)">
              <select
                name="schoolId"
                defaultValue={presetSchoolId}
                data-testid="field-school"
                className="block w-full rounded-md border border-border bg-white px-3 py-2 text-sm text-brand-navy focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
              >
                <option value="">(none)</option>
                {activeSchools.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="MOU (optional)">
              <select
                name="mouId"
                defaultValue={presetMouId}
                data-testid="field-mou"
                className="block w-full rounded-md border border-border bg-white px-3 py-2 text-sm text-brand-navy focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
              >
                <option value="">(none)</option>
                {activeMous.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.schoolName}: {m.id}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <Field
            label="Assign to (optional)"
            hint="Leave blank to fan-out a notification to the entire owning department."
          >
            <select
              name="assignedTo"
              defaultValue=""
              data-testid="field-assigned-to"
              className="block w-full rounded-md border border-border bg-white px-3 py-2 text-sm text-brand-navy focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
            >
              <option value="">(none, notify department)</option>
              {activeUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}: {u.role}
                </option>
              ))}
            </select>
          </Field>

          <div className="flex items-center justify-end gap-3 border-t border-border pt-4">
            <a
              href="/escalations"
              className={opsButtonClass({ variant: 'outline', size: 'md' })}
              data-testid="cancel-escalation"
            >
              Cancel
            </a>
            <OpsButton
              variant="primary"
              size="md"
              type="submit"
              data-testid="submit-escalation"
            >
              Raise escalation
            </OpsButton>
          </div>
        </form>
      </div>
    </>
  )
}

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string
  hint?: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <span className="mb-1 inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-slate-600">
        {label}
        {required ? <span className="text-signal-alert" aria-hidden>*</span> : null}
      </span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-slate-500">{hint}</span> : null}
    </label>
  )
}
