/*
 * /admin/templates list page (W4-I.5 P3C3).
 *
 * Lists every CommunicationTemplate, filterable by useCase via the
 * ?useCase= query (matches the dashboard launcher's deep-link
 * pattern). Each row links to /admin/templates/[id]/edit.
 *
 * UI gating: server-side requires authenticated user; the create
 * link is gated on canPerform('template:edit'). Non-editor viewers
 * still see the list (Phase 1 W3-B baseline; templates are reference
 * material everyone can browse).
 */

import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowRight, Plus } from 'lucide-react'
import type {
  CommunicationTemplate,
  TemplateUseCase,
} from '@/lib/types'
import templatesJson from '@/data/communication_templates.json'
import { getCurrentUser } from '@/lib/auth/session'
import { canPerform } from '@/lib/auth/permissions'
import { TopNav } from '@/components/ops/TopNav'
import { PageHeader } from '@/components/ops/PageHeader'
import { StatusChip } from '@/components/ops/StatusChip'

const allTemplates = templatesJson as unknown as CommunicationTemplate[]

const USE_CASES: ReadonlyArray<TemplateUseCase> = [
  'welcome', 'thank-you', 'follow-up', 'payment-reminder',
  'dispatch-confirmation', 'feedback-request', 'custom',
]

const USE_CASE_LABEL: Record<TemplateUseCase, string> = {
  welcome: 'Welcome',
  'thank-you': 'Thank You',
  'follow-up': 'Follow-up',
  'payment-reminder': 'Payment Reminder',
  'dispatch-confirmation': 'Dispatch Confirmation',
  'feedback-request': 'Feedback Request',
  custom: 'Custom',
}

const ERROR_MESSAGES: Record<string, string> = {
  permission: 'You do not have permission to edit templates.',
  'missing-id': 'Template id is required.',
}

const FLASH_MESSAGES: Record<string, (id: string) => string> = {
  created: (id) => `Template ${id} created.`,
  edited: (id) => `Template ${id} updated.`,
}

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function TemplatesListPage({ searchParams }: PageProps) {
  const user = await getCurrentUser()
  if (!user) redirect('/login?next=%2Fadmin%2Ftemplates')

  const sp = await searchParams
  const useCaseFilter = typeof sp.useCase === 'string'
    && USE_CASES.includes(sp.useCase as TemplateUseCase)
    ? (sp.useCase as TemplateUseCase)
    : null
  const errorKey = typeof sp.error === 'string' ? sp.error : null
  const errorMessage = errorKey ? ERROR_MESSAGES[errorKey] ?? `Failed: ${errorKey}` : null
  const createdId = typeof sp.created === 'string' ? sp.created : null
  const editedId = typeof sp.edited === 'string' ? sp.edited : null
  const flashId = createdId ?? editedId
  const flashKey = createdId ? 'created' : editedId ? 'edited' : null
  const flashMessage = flashKey && flashId ? FLASH_MESSAGES[flashKey]!(flashId) : null

  const rows = useCaseFilter
    ? allTemplates.filter((t) => t.useCase === useCaseFilter)
    : allTemplates

  const canEdit = canPerform(user, 'template:edit')

  return (
    <>
      <TopNav currentPath="/admin" />
      <main id="main-content">
        <PageHeader
          title="Communication Templates"
          subtitle={`${rows.length} of ${allTemplates.length} template${allTemplates.length === 1 ? '' : 's'}`}
          breadcrumb={[
            { label: 'Dashboard', href: '/' },
            { label: 'Admin', href: '/admin' },
            { label: 'Templates' },
          ]}
          actions={canEdit ? (
            <Link
              href="/admin/templates/new"
              data-testid="template-list-create"
              className="inline-flex min-h-11 items-center gap-1.5 rounded-md bg-brand-navy px-3 py-2 text-sm font-semibold text-white hover:bg-brand-navy/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
            >
              <Plus aria-hidden className="size-4" />
              New template
            </Link>
          ) : null}
        />
        <div className="mx-auto max-w-screen-xl space-y-4 px-4 py-6">
          {flashMessage ? (
            <p
              role="status"
              data-testid="template-list-flash"
              className="rounded-md border border-signal-ok bg-card p-3 text-sm text-foreground"
            >
              {flashMessage}
            </p>
          ) : null}
          {errorMessage ? (
            <p
              role="alert"
              data-testid="template-list-error"
              className="rounded-md border border-signal-alert bg-signal-alert/10 px-3 py-2 text-sm text-signal-alert"
            >
              {errorMessage}
            </p>
          ) : null}

          <nav aria-label="Filter by use case" className="flex flex-wrap items-center gap-2">
            <Link
              href="/admin/templates"
              data-testid="usecase-chip-all"
              className={
                'inline-flex min-h-9 items-center rounded-full border px-3 py-1.5 text-xs font-medium '
                + (useCaseFilter === null
                  ? 'border-brand-navy bg-brand-navy text-white'
                  : 'border-border bg-card text-foreground hover:bg-muted')
              }
            >
              All ({allTemplates.length})
            </Link>
            {USE_CASES.map((u) => {
              const count = allTemplates.filter((t) => t.useCase === u).length
              return (
                <Link
                  key={u}
                  href={`/admin/templates?useCase=${u}`}
                  data-testid={`usecase-chip-${u}`}
                  className={
                    'inline-flex min-h-9 items-center rounded-full border px-3 py-1.5 text-xs font-medium '
                    + (useCaseFilter === u
                      ? 'border-brand-navy bg-brand-navy text-white'
                      : 'border-border bg-card text-foreground hover:bg-muted')
                  }
                >
                  {USE_CASE_LABEL[u]} ({count})
                </Link>
              )
            })}
          </nav>

          {rows.length === 0 ? (
            <p className="rounded-md border border-border bg-card px-4 py-6 text-sm text-muted-foreground">
              No templates match the current filter.
            </p>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border bg-card">
              {rows.map((t) => (
                <li
                  key={t.id}
                  data-testid={`template-row-${t.id}`}
                  className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-heading text-sm font-semibold text-brand-navy">
                        {t.name}
                      </h3>
                      <span className="inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        {USE_CASE_LABEL[t.useCase]}
                      </span>
                      {!t.active ? (
                        <StatusChip
                          tone="neutral"
                          label="Inactive"
                          withDot={false}
                          testId={`template-row-${t.id}-inactive`}
                        />
                      ) : null}
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                      <span className="font-mono">{t.id}</span>
                      {' '}<span aria-hidden>&middot;</span>{' '}
                      Subject: {t.subject}
                    </p>
                  </div>
                  {canEdit ? (
                    <Link
                      href={`/admin/templates/${encodeURIComponent(t.id)}/edit`}
                      data-testid={`template-row-${t.id}-edit`}
                      className="inline-flex min-h-9 items-center gap-1 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-brand-navy hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
                    >
                      Edit
                      <ArrowRight aria-hidden className="size-3" />
                    </Link>
                  ) : (
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Read only
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
    </>
  )
}
