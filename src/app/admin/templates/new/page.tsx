/*
 * /admin/templates/new (W4-I.5 P3C3).
 *
 * Create form for a new CommunicationTemplate. UseCase dropdown
 * drives a hint about which variables are available; the operator
 * can edit the variables list freely (the lib defaults to the
 * useCase allow-list when the field is empty on submit).
 *
 * Permission gate: 'template:edit' (Admin + OpsHead). Non-editors
 * redirect to the list page with ?error=permission.
 */

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowLeft, AlertTriangle } from 'lucide-react'
import { getCurrentUser } from '@/lib/auth/session'
import { canPerform } from '@/lib/auth/permissions'
import { TopNav } from '@/components/ops/TopNav'
import { PageHeader } from '@/components/ops/PageHeader'
import { availableVariablesFor } from '@/lib/templates/applyVariables'
import { createTemplateAction } from '../actions'
import type { TemplateUseCase } from '@/lib/types'

const USE_CASES: ReadonlyArray<{ value: TemplateUseCase; label: string }> = [
  { value: 'welcome', label: 'Welcome' },
  { value: 'thank-you', label: 'Thank You' },
  { value: 'follow-up', label: 'Follow-up' },
  { value: 'payment-reminder', label: 'Payment Reminder' },
  { value: 'dispatch-confirmation', label: 'Dispatch Confirmation' },
  { value: 'feedback-request', label: 'Feedback Request' },
  { value: 'custom', label: 'Custom' },
]

const RECIPIENTS = [
  { value: 'spoc', label: 'Intake / school SPOC' },
  { value: 'sales-owner', label: 'Sales owner' },
  { value: 'school-email', label: 'School general email' },
  { value: 'custom', label: 'Custom (operator types at send-time)' },
] as const

const ERROR_MESSAGES: Record<string, string> = {
  permission: 'You do not have permission to create templates.',
  'unknown-user': 'Session user not found. Please log in again.',
  'duplicate-id': 'A template with this id already exists.',
  'invalid-use-case': 'Pick a valid use case from the dropdown.',
  'invalid-recipient': 'Pick a valid default recipient.',
  'missing-name': 'Name is required.',
  'missing-subject': 'Subject is required.',
  'missing-body': 'Body is required.',
}

const FIELD_INPUT_CLASS =
  'block w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy'
const FIELD_LABEL_CLASS = 'block text-sm font-medium text-brand-navy mb-1'

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function TemplateNewPage({ searchParams }: PageProps) {
  const user = await getCurrentUser()
  if (!user) redirect('/login?next=%2Fadmin%2Ftemplates%2Fnew')
  if (!canPerform(user, 'template:edit')) {
    redirect('/admin/templates?error=permission')
  }

  const sp = await searchParams
  const errorKey = typeof sp.error === 'string' ? sp.error : null
  const errorMessage = errorKey ? ERROR_MESSAGES[errorKey] ?? `Failed: ${errorKey}` : null

  // Default useCase preview: 'welcome'. The form is server-rendered;
  // changing the dropdown after load does not refresh the variable
  // hint until submit. The lib still validates availableVariablesFor
  // the picked useCase on submit, so the hint is illustrative rather
  // than gating.
  const defaultUseCase: TemplateUseCase = 'welcome'
  const variableHint = availableVariablesFor(defaultUseCase)

  return (
    <>
      <TopNav currentPath="/admin" />
      <main id="main-content">
        <PageHeader
          title="New template"
          breadcrumb={[
            { label: 'Dashboard', href: '/' },
            { label: 'Admin', href: '/admin' },
            { label: 'Templates', href: '/admin/templates' },
            { label: 'New' },
          ]}
        />
        <div className="mx-auto flex max-w-screen-md flex-col gap-4 px-4 py-6">
          <Link
            href="/admin/templates"
            className="inline-flex items-center gap-1 text-sm text-brand-navy hover:underline"
          >
            <ArrowLeft aria-hidden className="size-4" /> Back to list
          </Link>

          {errorMessage ? (
            <p
              role="alert"
              data-testid="template-new-error"
              className="flex items-start gap-2 rounded-md border border-signal-alert bg-signal-alert/10 p-2 text-sm text-signal-alert"
            >
              <AlertTriangle aria-hidden className="size-4 shrink-0" />
              <span>{errorMessage}</span>
            </p>
          ) : null}

          <form
            action={createTemplateAction}
            className="space-y-4 rounded-lg border border-border bg-card p-4 sm:p-6"
            data-testid="template-new-form"
          >
            <div>
              <label htmlFor="name" className={FIELD_LABEL_CLASS}>
                Name <span aria-hidden className="text-signal-alert">*</span>
              </label>
              <input
                id="name" name="name" type="text" required
                className={FIELD_INPUT_CLASS}
                placeholder="e.g. Payment Reminder (gentle)"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="useCase" className={FIELD_LABEL_CLASS}>
                  Use case <span aria-hidden className="text-signal-alert">*</span>
                </label>
                <select id="useCase" name="useCase" required defaultValue={defaultUseCase} className={FIELD_INPUT_CLASS}>
                  {USE_CASES.map((u) => (
                    <option key={u.value} value={u.value}>{u.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="defaultRecipient" className={FIELD_LABEL_CLASS}>
                  Default recipient <span aria-hidden className="text-signal-alert">*</span>
                </label>
                <select id="defaultRecipient" name="defaultRecipient" required defaultValue="spoc" className={FIELD_INPUT_CLASS}>
                  {RECIPIENTS.map((r) => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label htmlFor="subject" className={FIELD_LABEL_CLASS}>
                Subject <span aria-hidden className="text-signal-alert">*</span>
              </label>
              <input
                id="subject" name="subject" type="text" required
                className={FIELD_INPUT_CLASS}
                placeholder="e.g. Welcome to the {{programme}} programme, {{schoolName}}"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Use double-brace placeholders, e.g. <code>{'{{schoolName}}'}</code>.
              </p>
            </div>

            <div>
              <label htmlFor="bodyMarkdown" className={FIELD_LABEL_CLASS}>
                Body (Markdown) <span aria-hidden className="text-signal-alert">*</span>
              </label>
              <textarea
                id="bodyMarkdown" name="bodyMarkdown" required rows={10}
                className={FIELD_INPUT_CLASS}
                placeholder="Dear {{recipientName}},..."
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Available variables for the default use case ({defaultUseCase}):{' '}
                <code className="text-xs">{variableHint.join(', ')}</code>
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="defaultCcRules" className={FIELD_LABEL_CLASS}>Default CC contexts</label>
                <input
                  id="defaultCcRules" name="defaultCcRules" type="text"
                  className={FIELD_INPUT_CLASS}
                  placeholder="welcome-note, all-communications"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Comma-separated CC-rule context keys (matches existing CcRule contexts).
                </p>
              </div>
              <div>
                <label htmlFor="variables" className={FIELD_LABEL_CLASS}>Variables</label>
                <input
                  id="variables" name="variables" type="text"
                  className={FIELD_INPUT_CLASS}
                  placeholder="schoolName, programme, salesOwnerName"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Leave blank to use the default set for the chosen use case.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                id="active" name="active" type="checkbox" defaultChecked
                className="size-4 rounded border-input text-brand-navy focus:ring-2 focus:ring-brand-navy"
              />
              <label htmlFor="active" className="text-sm text-foreground">
                Active (surfaced on the launcher picker)
              </label>
            </div>

            <div className="flex flex-wrap gap-2 border-t border-border pt-4">
              <button
                type="submit"
                data-testid="template-new-submit"
                className="inline-flex min-h-11 items-center rounded-md bg-brand-teal px-4 py-2 text-sm font-medium text-brand-navy hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
              >
                Create template
              </button>
              <Link
                href="/admin/templates"
                className="inline-flex min-h-11 items-center rounded-md border border-border bg-card px-4 py-2 text-sm font-medium hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
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
