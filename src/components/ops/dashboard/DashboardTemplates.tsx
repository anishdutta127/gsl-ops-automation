/*
 * DashboardTemplates (W4-I.5 Phase 2 commit 4).
 *
 * Communication Templates section. 2-column grid of template preview
 * cards. Each card shows an envelope icon + name + preview text +
 * "Edit Template" link. A "+ Create new template" CTA sits at the
 * bottom.
 *
 * Phase 2 ships the static welcome + thank-you previews from
 * src/content. Phase 3 swaps these with live CommunicationTemplate
 * entities loaded from data/communication_templates.json (entity
 * created in Phase 3).
 */

import Link from 'next/link'
import { Mail, Plus } from 'lucide-react'
import type { CommunicationTemplatePreview } from '@/lib/dashboard/dashboardData'

export interface DashboardTemplatesProps {
  templates: ReadonlyArray<CommunicationTemplatePreview>
  /** Where the Create-new affordance points; Phase 3 wires the editor. */
  createHref?: string
}

export function DashboardTemplates({
  templates,
  createHref = '/admin/templates?action=create',
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
                href={t.editHref}
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
