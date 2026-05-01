/*
 * DashboardCommunicationPanel (W4-I.5 Phase 2 commit 3 + Phase 3 P3C5).
 *
 * Three stacked send-template buttons: Welcome (navy), Thank You
 * (teal, the recommended action), Follow-up (white outline). Each
 * links to /admin/templates with a useCase query so the launcher
 * picker opens preselected; the templates list page exists post-P3C3.
 *
 * P3C5: re-enabled from the P2.1 disabled stubs now that
 * /admin/templates exists. Buttons are functional <Link> elements
 * pointing at the filtered list.
 */

import Link from 'next/link'
import { Send, ArrowRight } from 'lucide-react'
import type { CommunicationButton } from '@/lib/dashboard/dashboardData'

const VARIANT_CLASS: Record<CommunicationButton['variant'], string> = {
  navy: 'bg-brand-navy text-white hover:bg-brand-navy/90 focus-visible:ring-brand-navy',
  teal: 'bg-brand-teal text-brand-navy hover:bg-brand-teal/90 focus-visible:ring-brand-navy',
  outline: 'bg-card text-brand-navy border border-border hover:bg-muted focus-visible:ring-brand-navy',
}

export interface DashboardCommunicationPanelProps {
  buttons: ReadonlyArray<CommunicationButton>
}

export function DashboardCommunicationPanel({ buttons }: DashboardCommunicationPanelProps) {
  return (
    <section
      aria-labelledby="comm-automation-heading"
      data-testid="dashboard-communication-panel"
      className="flex flex-col rounded-xl border border-border bg-card shadow-sm"
    >
      <header className="flex items-start gap-3 border-b border-border px-4 py-3 sm:px-5">
        <span aria-hidden className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-teal/15 text-brand-navy">
          <Send className="size-4" />
        </span>
        <div className="min-w-0">
          <h2
            id="comm-automation-heading"
            className="font-heading text-base font-semibold text-brand-navy"
          >
            Communication Automation
          </h2>
          <p className="text-xs text-muted-foreground">
            Send standard communication emails to schools based on onboarding or order updates.
          </p>
        </div>
      </header>
      <div className="flex flex-col gap-2 p-3 sm:p-4">
        {buttons.map((b) => (
          <Link
            key={b.key}
            href={b.href}
            data-testid={`comm-button-${b.key}`}
            className={
              'inline-flex min-h-11 items-center justify-between rounded-md px-3 py-2 text-sm font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 '
              + VARIANT_CLASS[b.variant]
            }
          >
            <span>{b.label}</span>
            <ArrowRight aria-hidden className="size-4" />
          </Link>
        ))}
      </div>
    </section>
  )
}
