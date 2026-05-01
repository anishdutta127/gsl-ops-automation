/*
 * DashboardTemplates (W4-I.5 Phase 2 commit 4 + Phase 2.1).
 *
 * Communication Templates section. 2-column grid of template preview
 * cards (Welcome Note + Thank You Note) sourced from the Phase 2
 * static previews. The "Edit Template" affordance per card and the
 * "+ Create new template" CTA at the bottom are disabled until
 * Phase 3 ships the template editor at /admin/templates.
 *
 * W4-I.5 Phase 2.1: each Phase 3-dependent affordance renders as a
 * disabled button with a "Coming soon" badge so the operator sees
 * the workflow exists without hitting a 404.
 *
 * TODO(W4-I.5 Phase 3): re-enable Edit Template + Create new template
 * as <Link href={...}> once the editor ships. Drop the disabled
 * styling and Coming-soon badge.
 */

import { Mail, Plus, Clock } from 'lucide-react'
import type { CommunicationTemplatePreview } from '@/lib/dashboard/dashboardData'

export interface DashboardTemplatesProps {
  templates: ReadonlyArray<CommunicationTemplatePreview>
  /** Phase 3 will use this to point at the real editor. Ignored in P2.1. */
  createHref?: string
}

export function DashboardTemplates({
  templates,
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
            <div className="mt-auto flex items-center gap-2">
              <button
                type="button"
                disabled
                aria-disabled="true"
                title="Coming in next update"
                data-testid={`template-edit-${t.key}`}
                className="inline-flex min-h-9 cursor-not-allowed items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-brand-navy opacity-60"
              >
                Edit Template
              </button>
              <span
                className="inline-flex items-center gap-1 rounded-full bg-brand-navy/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-brand-navy"
                data-testid={`template-edit-${t.key}-coming-soon`}
              >
                <Clock aria-hidden className="size-2.5" />
                Coming soon
              </span>
            </div>
          </article>
        ))}
      </div>
      <footer className="border-t border-border p-3 sm:p-4">
        <button
          type="button"
          disabled
          aria-disabled="true"
          title="Coming in next update"
          data-testid="template-create-cta"
          className="inline-flex min-h-11 cursor-not-allowed items-center gap-1.5 rounded-md border border-dashed border-brand-navy/30 bg-card px-3 py-2 text-sm font-medium text-brand-navy opacity-60"
        >
          <Plus aria-hidden className="size-4" />
          Create new template
          <span
            className="ml-2 inline-flex items-center gap-1 rounded-full bg-brand-navy/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-brand-navy"
            data-testid="template-create-coming-soon"
          >
            <Clock aria-hidden className="size-2.5" />
            Coming soon
          </span>
        </button>
      </footer>
    </section>
  )
}
