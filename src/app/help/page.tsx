/*
 * /help (W3-E orientation doc).
 *
 * Renders the seven sections from src/content/help.ts as a single
 * scrollable page with jump-anchor navigation. Mobile-responsive
 * (single-column flow under 768px; sticky sidebar on tablet+).
 * Browser-native Cmd-F handles in-section search per W3-E scope.
 *
 * Visible to all authenticated users via the TopNav Help link. UI
 * gating off per W3-B; the doc serves every role.
 */

import { redirect } from 'next/navigation'
import {
  BookOpen,
  Compass,
  HelpCircle,
  ListChecks,
  Sparkles,
  TimerReset,
  UserCog,
  Workflow,
} from 'lucide-react'
import { getCurrentUser } from '@/lib/auth/session'
import { TopNav } from '@/components/ops/TopNav'
import { PageHeader } from '@/components/ops/PageHeader'
import {
  HELP_CHANGEABLE,
  HELP_CHANGE_SEMANTICS,
  HELP_FEEDBACK,
  HELP_GLOSSARY,
  HELP_INTRO,
  HELP_LIFECYCLE_FOOTER,
  HELP_LIFECYCLE_INTRO,
  HELP_LIFECYCLE_STAGES,
  HELP_ROLES,
  HELP_WORKFLOWS,
} from '@/content/help'

const SECTION_LINKS = [
  { href: '#what-is-this', label: 'What is this system?' },
  { href: '#lifecycle-stages', label: 'The 8 lifecycle stages' },
  { href: '#glossary', label: 'Glossary' },
  { href: '#workflows', label: 'Common workflows' },
  { href: '#what-i-can-change', label: 'What I can change' },
  { href: '#change-semantics', label: 'When I make a change' },
  { href: '#contact', label: 'Who to contact' },
] as const

export default async function HelpPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login?next=%2Fhelp')

  return (
    <>
      <TopNav currentPath="/help" />
      <main id="main-content">
        <PageHeader
          title="Help"
          subtitle="Plain-language reference: what you can do, how to do it, and what the terms mean."
        />
        <div className="mx-auto flex max-w-screen-xl flex-col gap-6 px-4 py-6 lg:flex-row">

          <aside
            aria-label="Help sections"
            className="rounded-lg border border-border bg-card p-4 text-sm lg:sticky lg:top-4 lg:h-fit lg:w-64 lg:shrink-0"
            data-testid="help-jump-nav"
          >
            <p className="mb-2 font-semibold text-brand-navy">On this page</p>
            <ul className="space-y-1">
              {SECTION_LINKS.map((link) => (
                <li key={link.href}>
                  <a
                    href={link.href}
                    className="block min-h-11 rounded-md px-2 py-1 text-brand-navy hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-muted-foreground">
              Use Cmd-F (Mac) or Ctrl-F (Windows) to search this page.
            </p>
          </aside>

          <div className="min-w-0 flex-1 space-y-10">

            <section aria-labelledby="what-is-this">
              <h2 id="what-is-this" className="flex items-center gap-2 font-heading text-2xl font-bold text-brand-navy">
                <Compass aria-hidden className="size-6" />
                What is this system?
              </h2>
              {HELP_INTRO.oneParagraph.map((p, i) => (
                <p key={i} className="mt-3 text-sm leading-relaxed text-foreground">
                  {p}
                </p>
              ))}

              <h3 className="mt-6 font-heading text-lg font-semibold text-brand-navy">Where you&rsquo;ll spend time</h3>
              <ul className="mt-3 space-y-3">
                {HELP_ROLES.map((r) => (
                  <li key={r.role} className="rounded-md border border-border bg-card p-4">
                    <h4 className="font-heading text-base font-semibold text-brand-navy">{r.role}</h4>
                    <p className="mt-1 text-sm text-foreground">{r.framing}</p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      <span className="font-semibold text-foreground">Workstream:</span> {r.workstream}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      <span className="font-semibold text-foreground">Where you&rsquo;ll spend time:</span> {r.whereTime}
                    </p>
                  </li>
                ))}
              </ul>
            </section>

            <section aria-labelledby="lifecycle-stages">
              <h2 id="lifecycle-stages" className="flex items-center gap-2 font-heading text-2xl font-bold text-brand-navy">
                <TimerReset aria-hidden className="size-6" />
                The 8 lifecycle stages
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-foreground">{HELP_LIFECYCLE_INTRO}</p>
              <ol className="mt-4 space-y-3">
                {HELP_LIFECYCLE_STAGES.map((stage) => (
                  <li
                    key={stage.key}
                    className="rounded-md border border-border bg-card p-4"
                    data-testid={`help-stage-${stage.key}`}
                  >
                    <h3 className="font-heading text-base font-semibold text-brand-navy">
                      <span className="mr-2 font-mono text-xs text-muted-foreground">{stage.number}</span>
                      {stage.title}
                    </h3>
                    <p className="mt-1 text-sm text-foreground">{stage.whatHappens}</p>
                    <dl className="mt-2 grid grid-cols-1 gap-1 text-xs sm:grid-cols-2">
                      <div><dt className="inline font-semibold text-foreground">Who: </dt><dd className="inline text-muted-foreground">{stage.whoInvolved}</dd></div>
                      <div><dt className="inline font-semibold text-foreground">System tracks: </dt><dd className="inline text-muted-foreground">{stage.systemTracks}</dd></div>
                      <div className="sm:col-span-2"><dt className="inline font-semibold text-foreground">Typical time: </dt><dd className="inline text-muted-foreground">{stage.typicalDays}</dd></div>
                    </dl>
                  </li>
                ))}
              </ol>
              <p className="mt-4 text-xs text-muted-foreground">{HELP_LIFECYCLE_FOOTER}</p>
            </section>

            <section aria-labelledby="glossary">
              <h2 id="glossary" className="flex items-center gap-2 font-heading text-2xl font-bold text-brand-navy">
                <BookOpen aria-hidden className="size-6" />
                Glossary
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-foreground">
                Alphabetical. {HELP_GLOSSARY.length} terms. Use Cmd-F to jump.
              </p>
              <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2" data-testid="help-glossary-list">
                {HELP_GLOSSARY.map((g) => (
                  <div key={g.term} className="rounded-md border border-border bg-card p-3">
                    <dt className="text-sm font-semibold text-brand-navy">{g.term}</dt>
                    <dd className="mt-1 text-sm text-foreground">{g.definition}</dd>
                  </div>
                ))}
              </dl>
            </section>

            <section aria-labelledby="workflows">
              <h2 id="workflows" className="flex items-center gap-2 font-heading text-2xl font-bold text-brand-navy">
                <Workflow aria-hidden className="size-6" />
                Common workflows
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-foreground">
                Step-by-step for the {HELP_WORKFLOWS.length} most common things you&rsquo;ll do.
              </p>
              <ul className="mt-4 space-y-4" data-testid="help-workflow-list">
                {HELP_WORKFLOWS.map((w) => (
                  <li key={w.task} className="rounded-md border border-border bg-card p-4">
                    <h3 className="font-heading text-base font-semibold text-brand-navy">{w.task}</h3>
                    {w.precondition ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        <span className="font-semibold text-foreground">Pre-check:</span> {w.precondition}
                      </p>
                    ) : null}
                    <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-foreground">
                      {w.steps.map((step, i) => (
                        <li key={i}>{step}</li>
                      ))}
                    </ol>
                  </li>
                ))}
              </ul>
            </section>

            <section aria-labelledby="what-i-can-change">
              <h2 id="what-i-can-change" className="flex items-center gap-2 font-heading text-2xl font-bold text-brand-navy">
                <UserCog aria-hidden className="size-6" />
                What I can change
              </h2>
              <ul className="mt-4 space-y-3">
                {HELP_CHANGEABLE.map((c, i) => (
                  <li key={i} className="rounded-md border border-border bg-card p-3">
                    <p className="text-sm font-semibold text-brand-navy">{c.what}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      <span className="font-semibold text-foreground">Where:</span> {c.where}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      <span className="font-semibold text-foreground">Who can edit:</span> {c.whoCanEdit}
                    </p>
                  </li>
                ))}
              </ul>
            </section>

            <section aria-labelledby="change-semantics">
              <h2 id="change-semantics" className="flex items-center gap-2 font-heading text-2xl font-bold text-brand-navy">
                <Sparkles aria-hidden className="size-6" />
                When I make a change
              </h2>
              {HELP_CHANGE_SEMANTICS.map((p, i) => (
                <p key={i} className="mt-3 text-sm leading-relaxed text-foreground">{p}</p>
              ))}
            </section>

            <section aria-labelledby="contact">
              <h2 id="contact" className="flex items-center gap-2 font-heading text-2xl font-bold text-brand-navy">
                <HelpCircle aria-hidden className="size-6" />
                Who to contact
              </h2>
              <ul className="mt-4 space-y-3" data-testid="help-feedback-list">
                {HELP_FEEDBACK.map((f) => (
                  <li key={f.question} className="rounded-md border border-border bg-card p-3">
                    <p className="text-sm font-semibold text-brand-navy">{f.question}</p>
                    <p className="mt-1 text-sm text-foreground">{f.answer}</p>
                  </li>
                ))}
              </ul>
            </section>

            <footer className="mt-10 rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
              <ListChecks aria-hidden className="mr-1 inline size-3" />
              This guide reflects the system as of {HELP_INTRO.systemAsOfDate}.
              If something looks different, the system was updated more recently than this doc;
              tell Anish on Teams and we&rsquo;ll update.
            </footer>

          </div>
        </div>
      </main>
    </>
  )
}
