/*
 * DashboardTemplates (W4-I.5 Phase 2 commit 4 + Phase 3 P3C5).
 *
 * Communication Templates section. 2-column grid of template preview
 * cards (Welcome Note + Thank You Note) sourced from the Phase 2
 * static previews. Edit Template + Create new template hand off to
 * /admin/templates/[id]/edit and /admin/templates/new respectively
 * (both surfaces exist post-P3C3).
 *
 * P3C5: re-enabled from the P2.1 disabled stubs. Edit and Create
 * are now functional <Link> elements.
 */

import Link from 'next/link'
import { Mail, Plus } from 'lucide-react'
import type { CommunicationTemplatePreview } from '@/lib/dashboard/dashboardData'

export interface DashboardTemplatesProps {
  templates: ReadonlyArray<CommunicationTemplatePreview>
  /** Where the Create-new affordance points; default targets the new form. */
  createHref?: string
}

function editHrefFor(preview: CommunicationTemplatePreview): string {
  // The preview ids match the seeded template ids ('welcome' ->
  // 'TPL-WELCOME-DEFAULT' etc.). Keep the mapping local rather than
  // changing the preview shape.
  if (preview.key === 'welcome') return '/admin/templates/TPL-WELCOME-DEFAULT/edit'
  if (preview.key === 'thank-you') return '/admin/templates/TPL-THANK-YOU-DEFAULT/edit'
  return preview.editHref
}

export function DashboardTemplates({
  templates,
  createHref = '/admin/templates/new',
}: DashboardTemplatesProps) {
  return (
    <section
      aria-labelledby="comm-templates-heading"
      data-testid="dashboard-templates"
      className="rounded-xl border border-border bg-card shadow-sm"
    >
      <header className="border-b border-border px-4 py-3 sm:px-5">
        <h2
          id="comm-templates-heading"
          className="font-heading text-base font-semibold text-brand-navy"
        >
          Communication Templates
        </h2>
        <p className="text-xs text-muted-foreground">
          Reusable templates editable by the operations team.
        </p>
      </header>
      <div className="grid grid-cols-1 gap-3 p-3 sm:grid-cols-2 sm:p-4">
        {templates.map((t) => (
          <article
            key={t.key}
            data-testid={`template-card-${t.key}`}
            className="flex flex-col rounded-lg border border-border bg-card p-4 transition hover:bg-muted/30"
          >
            <div className="mb-2 flex items-center gap-2">
              <span aria-hidden className="inline-flex size-8 items-center justify-center rounded-md bg-brand-teal/15 text-brand-navy">
                <Mail className="size-4" />
              </span>
              <h3 className="font-heading text-sm font-semibold text-brand-navy">
                {t.name}
              </h3>
            </div>
            <p className="mb-3 line-clamp-3 text-xs text-muted-foreground">
              {t.preview}
            </p>
            <div className="mt-auto">
              <Link
                href={editHrefFor(t)}
                data-testid={`template-edit-${t.key}`}
                className="inline-flex min-h-9 items-center rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-brand-navy hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
              >
                Edit Template
              </Link>
            </div>
          </article>
        ))}
      </div>
      <footer className="border-t border-border p-3 sm:p-4">
        <Link
          href={createHref}
          data-testid="template-create-cta"
          className="inline-flex min-h-11 items-center gap-1.5 rounded-md border border-dashed border-brand-navy/30 bg-card px-3 py-2 text-sm font-medium text-brand-navy hover:bg-brand-navy/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
        >
          <Plus aria-hidden className="size-4" />
          Create new template
        </Link>
      </footer>
    </section>
  )
}
