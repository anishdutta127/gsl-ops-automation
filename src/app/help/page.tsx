/*
 * /help (Phase F follow-up).
 *
 * In-app reference. Visible to all authenticated users via the
 * TopNav Help link. Renders the four content arrays from
 * src/content/help.ts as scannable sections. Mobile-responsive
 * (max-width 768px on small screens; flows to wider on desktop).
 *
 * Phase 1.1 may add: search across content; filter capabilities
 * by current viewer role; CMS-style content editing for non-
 * developers. Today the content lives in code so updates flow
 * through normal commit / deploy.
 */

import { redirect } from 'next/navigation'
import { Activity, BookOpen, HelpCircle, Workflow } from 'lucide-react'
import { getCurrentUser } from '@/lib/auth/session'
import { TopNav } from '@/components/ops/TopNav'
import { PageHeader } from '@/components/ops/PageHeader'
import {
  HELP_CAPABILITIES,
  HELP_FEEDBACK,
  HELP_GLOSSARY,
  HELP_WORKFLOWS,
} from '@/content/help'

export default async function HelpPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login?next=%2Fhelp')

  return (
    <>
      <TopNav currentPath="/help" />
      <main id="main-content">
        <PageHeader
          title="Help"
          subtitle="Quick reference: what you can do, how to do it, and what the terms mean."
        />
        <div className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-6">

          <nav aria-label="Help sections" className="rounded-lg border border-border bg-card p-4 text-sm">
            <p className="mb-2 font-semibold text-[var(--brand-navy)]">On this page</p>
            <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2">
              <li><a href="#capabilities" className="text-[var(--brand-navy)] underline-offset-2 hover:underline">What can I do?</a></li>
              <li><a href="#workflows" className="text-[var(--brand-navy)] underline-offset-2 hover:underline">How do I do X?</a></li>
              <li><a href="#glossary" className="text-[var(--brand-navy)] underline-offset-2 hover:underline">What does X mean?</a></li>
              <li><a href="#feedback" className="text-[var(--brand-navy)] underline-offset-2 hover:underline">Something is broken</a></li>
            </ul>
          </nav>

          <section aria-labelledby="capabilities">
            <h2 id="capabilities" className="flex items-center gap-2 text-xl font-bold text-[var(--brand-navy)]">
              <BookOpen aria-hidden className="size-5" />
              What can I do?
            </h2>
            <p className="mt-1 text-sm text-slate-700">
              Each tester is logged in with a role. The role determines the buttons you see.
            </p>
            <ul className="mt-4 space-y-4">
              {HELP_CAPABILITIES.map((c) => (
                <li key={c.role} className="rounded-md border border-slate-200 bg-white p-4">
                  <h3 className="text-base font-semibold text-[var(--brand-navy)]">{c.role}</h3>
                  <p className="mt-1 text-sm text-slate-700">{c.summary}</p>
                  <ul className="mt-2 list-disc pl-5 text-xs text-slate-700">
                    {c.examples.map((ex) => (
                      <li key={ex}>{ex}</li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="workflows">
            <h2 id="workflows" className="flex items-center gap-2 text-xl font-bold text-[var(--brand-navy)]">
              <Workflow aria-hidden className="size-5" />
              How do I do X?
            </h2>
            <p className="mt-1 text-sm text-slate-700">
              Step-by-step for the common workflows.
            </p>
            <ul className="mt-4 space-y-4">
              {HELP_WORKFLOWS.map((w) => (
                <li key={w.task} className="rounded-md border border-slate-200 bg-white p-4">
                  <h3 className="text-base font-semibold text-[var(--brand-navy)]">{w.task}</h3>
                  <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-slate-700">
                    {w.steps.map((step, i) => (
                      <li key={i}>{step}</li>
                    ))}
                  </ol>
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="glossary">
            <h2 id="glossary" className="flex items-center gap-2 text-xl font-bold text-[var(--brand-navy)]">
              <Activity aria-hidden className="size-5" />
              What does X mean?
            </h2>
            <dl className="mt-4 grid grid-cols-1 gap-3">
              {HELP_GLOSSARY.map((g) => (
                <div key={g.term} className="rounded-md border border-slate-200 bg-white p-3">
                  <dt className="text-sm font-semibold text-[var(--brand-navy)]">{g.term}</dt>
                  <dd className="mt-1 text-sm text-slate-700">{g.definition}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section aria-labelledby="feedback">
            <h2 id="feedback" className="flex items-center gap-2 text-xl font-bold text-[var(--brand-navy)]">
              <HelpCircle aria-hidden className="size-5" />
              Something is broken or confusing
            </h2>
            <ul className="mt-4 space-y-3">
              {HELP_FEEDBACK.map((f) => (
                <li key={f.question} className="rounded-md border border-slate-200 bg-white p-3">
                  <p className="text-sm font-semibold text-[var(--brand-navy)]">{f.question}</p>
                  <p className="mt-1 text-sm text-slate-700">{f.answer}</p>
                </li>
              ))}
            </ul>
          </section>

        </div>
      </main>
    </>
  )
}
