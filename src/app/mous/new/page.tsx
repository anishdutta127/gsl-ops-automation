/*
 * /mous/new (Step 5).
 *
 * Pick-a-template page. Mirrors gsl-mou-system's /mous/new exactly:
 * one card per registered MOU template, click navigates to the
 * generator wizard. Template registry is the per-programme map in
 * `src/lib/mouSystem/templates.ts` (3 entries: STEAM-v3, YP-v3,
 * HBPE-v3) preserved verbatim from gsl-mou-system.
 *
 * Per-role: any user with `canEditMOU` reaches this page. Non-Sales
 * roles see it too (Misba, Anish) because they sometimes draft on
 * behalf of Sales.
 */

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { TopNav } from '@/components/ops/TopNav'
import { PageHeader } from '@/components/ops/PageHeader'
import { listTemplates } from '@/lib/mouSystem/templates'
import { getCurrentUser } from '@/lib/auth/session'
import { canEditMOU } from '@/lib/access'

export default async function PickTemplatePage() {
  const user = await getCurrentUser()
  if (!user || !canEditMOU(user)) {
    notFound()
  }
  const templates = listTemplates()

  return (
    <>
      <TopNav currentPath="/mous" />
      <main id="main-content">
        <PageHeader
          title="Generate MOU"
          subtitle="Deterministic draft. Pick a template, fill the form, preview and edit the Annexure."
          breadcrumb={[
            { label: 'MOUs', href: '/mous' },
            { label: 'New' },
          ]}
        />
        <div className="mx-auto max-w-screen-xl px-4 py-6">
          <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {templates.map((t) => {
              const requiredCount = Object.values(t.placeholders).filter((p) => p.required).length
              return (
                <li key={t.id}>
                  <Link
                    href={`/mous/new/${encodeURIComponent(t.id)}`}
                    className="block rounded-lg border border-border bg-card p-5 transition-colors hover:border-brand-teal focus:outline-none focus:ring-2 focus:ring-brand-navy"
                    data-testid={`template-card-${t.id}`}
                  >
                    <span className="block font-heading text-sm font-semibold text-brand-navy">
                      {t.displayName}
                    </span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {t.programme} {'·'} {t.id}
                    </span>
                    <span className="mt-3 block text-sm text-foreground">
                      {requiredCount} required fields. Main body locks after generation; Annexure stays
                      editable.
                    </span>
                  </Link>
                </li>
              )
            })}
          </ol>
          <p className="mt-6 text-xs text-muted-foreground">
            Templates are versioned. To add a new template, drop the .docx in{' '}
            <code className="rounded bg-muted px-1 py-0.5 text-[11px]">public/mou-templates/</code> and
            register it in <code className="rounded bg-muted px-1 py-0.5 text-[11px]">src/lib/mouSystem/templates.ts</code>.
          </p>
        </div>
      </main>
    </>
  )
}
