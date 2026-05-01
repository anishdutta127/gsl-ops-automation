/*
 * /admin/templates/[id]/edit (W4-I.5 P3C3).
 *
 * Edit form pre-filled from the existing CommunicationTemplate.
 * Mirrors the create form's field set with the useCase locked
 * (changing useCase post-create would invalidate the variable
 * declaration; require a new template instead).
 *
 * Permission gate: 'template:edit'.
 */

import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft, AlertTriangle } from 'lucide-react'
import { getCurrentUser } from '@/lib/auth/session'
import { canPerform } from '@/lib/auth/permissions'
import { TopNav } from '@/components/ops/TopNav'
import { PageHeader } from '@/components/ops/PageHeader'
import templatesJson from '@/data/communication_templates.json'
import { availableVariablesFor } from '@/lib/templates/applyVariables'
import { editTemplateAction } from '../../actions'
import type { CommunicationTemplate } from '@/lib/types'

const allTemplates = templatesJson as unknown as CommunicationTemplate[]

const RECIPIENTS = [
  { value: 'spoc', label: 'Intake / school SPOC' },
  { value: 'sales-owner', label: 'Sales owner' },
  { value: 'school-email', label: 'School general email' },
  { value: 'custom', label: 'Custom (operator types at send-time)' },
] as const

const ERROR_MESSAGES: Record<string, string> = {
  permission: 'You do not have permission to edit templates.',
  'template-not-found': 'Template not found.',
  'missing-name': 'Name is required.',
  'missing-subject': 'Subject is required.',
  'missing-body': 'Body is required.',
  'invalid-recipient': 'Pick a valid default recipient.',
  'no-changes': 'No fields changed.',
}

const FIELD_INPUT_CLASS =
  'block w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy'
const FIELD_LABEL_CLASS = 'block text-sm font-medium text-brand-navy mb-1'

interface PageProps {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function TemplateEditPage({ params, searchParams }: PageProps) {
  const { id } = await params
  const sp = await searchParams
  const user = await getCurrentUser()
  if (!user) redirect(`/login?next=%2Fadmin%2Ftemplates%2F${encodeURIComponent(id)}%2Fedit`)
  if (!canPerform(user, 'template:edit')) {
    redirect('/admin/templates?error=permission')
  }

  const template = allTemplates.find((t) => t.id === id)
  if (!template) notFound()

  const errorKey = typeof sp.error === 'string' ? sp.error : null
  const errorMessage = errorKey ? ERROR_MESSAGES[errorKey] ?? `Failed: ${errorKey}` : null
  const variableHint = availableVariablesFor(template.useCase)

  return (
    <>
      <TopNav currentPath="/admin" />
      <main id="main-content">
        <PageHeader
          title={`Edit: ${template.name}`}
          breadcrumb={[
            { label: 'Dashboard', href: '/' },
            { label: 'Admin', href: '/admin' },
            { label: 'Templates', href: '/admin/templates' },
            { label: template.name },
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
              data-testid="template-edit-error"
              className="flex items-start gap-2 rounded-md border border-signal-alert bg-signal-alert/10 p-2 text-sm text-signal-alert"
            >
              <AlertTriangle aria-hidden className="size-4 shrink-0" />
              <span>{errorMessage}</span>
            </p>
          ) : null}

          <p className="text-xs text-muted-foreground">
            <span className="font-mono">{template.id}</span>
            {' '}<span aria-hidden>&middot;</span>{' '}
            Use case <strong>{template.useCase}</strong> (immutable; create a new template if
            you need a different use case).
          </p>

          <form
            action={editTemplateAction}
            className="space-y-4 rounded-lg border border-border bg-card p-4 sm:p-6"
            data-testid="template-edit-form"
          >
            <input type="hidden" name="id" value={template.id} />

            <div>
              <label htmlFor="name" className={FIELD_LABEL_CLASS}>
                Name <span aria-hidden className="text-signal-alert">*</span>
              </label>
              <input
                id="name" name="name" type="text" required
                defaultValue={template.name}
                className={FIELD_INPUT_CLASS}
              />
            </div>

            <div>
              <label htmlFor="defaultRecipient" className={FIELD_LABEL_CLASS}>
                Default recipient <span aria-hidden className="text-signal-alert">*</span>
              </label>
              <select
                id="defaultRecipient" name="defaultRecipient" required
                defaultValue={template.defaultRecipient}
                className={FIELD_INPUT_CLASS}
              >
                {RECIPIENTS.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="subject" className={FIELD_LABEL_CLASS}>
                Subject <span aria-hidden className="text-signal-alert">*</span>
              </label>
              <input
                id="subject" name="subject" type="text" required
                defaultValue={template.subject}
                className={FIELD_INPUT_CLASS}
              />
            </div>

            <div>
              <label htmlFor="bodyMarkdown" className={FIELD_LABEL_CLASS}>
                Body (Markdown) <span aria-hidden className="text-signal-alert">*</span>
              </label>
              <textarea
                id="bodyMarkdown" name="bodyMarkdown" required rows={12}
                defaultValue={template.bodyMarkdown}
                className={FIELD_INPUT_CLASS}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Available variables for use case <strong>{template.useCase}</strong>:{' '}
                <code className="text-xs">{variableHint.join(', ')}</code>
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="defaultCcRules" className={FIELD_LABEL_CLASS}>Default CC contexts</label>
                <input
                  id="defaultCcRules" name="defaultCcRules" type="text"
                  defaultValue={template.defaultCcRules.join(', ')}
                  className={FIELD_INPUT_CLASS}
                />
              </div>
              <div>
                <label htmlFor="variables" className={FIELD_LABEL_CLASS}>Variables</label>
                <input
                  id="variables" name="variables" type="text"
                  defaultValue={template.variables.join(', ')}
                  className={FIELD_INPUT_CLASS}
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                id="active" name="active" type="checkbox"
                defaultChecked={template.active}
                className="size-4 rounded border-input text-brand-navy focus:ring-2 focus:ring-brand-navy"
              />
              <label htmlFor="active" className="text-sm text-foreground">
                Active (surfaced on the launcher picker). Uncheck to deactivate.
              </label>
            </div>

            <div className="flex flex-wrap gap-2 border-t border-border pt-4">
              <button
                type="submit"
                data-testid="template-edit-submit"
                className="inline-flex min-h-11 items-center rounded-md bg-brand-teal px-4 py-2 text-sm font-medium text-brand-navy hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
              >
                Save changes
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
