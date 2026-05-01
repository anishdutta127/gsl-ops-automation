/*
 * DashboardCommunicationPanel (W4-I.5 Phase 2 commit 3 + Phase 2.1).
 *
 * Three stacked send-template buttons: Welcome (navy), Thank You
 * (teal, the recommended action), Follow-up (white outline).
 *
 * W4-I.5 Phase 2.1: each button is currently disabled because the
 * Phase 3 template launcher (variable substitution + mailto E2 +
 * /admin/templates target) is not yet built. Buttons render greyed
 * with a "Coming soon" badge so operators see the affordance exists
 * and the workflow is on its way. The CommunicationButton.href in
 * the lib still carries the eventual Phase 3 target; the component
 * ignores it until Phase 3 lands.
 *
 * TODO(W4-I.5 Phase 3): re-enable as <Link href={b.href}> once the
 * template launcher ships. Drop the Coming-soon badge, keep the
 * VARIANT_CLASS map.
 */

import { Send, ArrowRight, Clock } from 'lucide-react'
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
          <button
            key={b.key}
            type="button"
            disabled
            aria-disabled="true"
            title="Coming in next update"
            data-testid={`comm-button-${b.key}`}
            className={
              'inline-flex min-h-11 cursor-not-allowed items-center justify-between rounded-md px-3 py-2 text-sm font-semibold opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 '
              + VARIANT_CLASS[b.variant]
            }
          >
            <span className="inline-flex items-center gap-2">
              <span>{b.label}</span>
              <span
                className="inline-flex items-center gap-1 rounded-full bg-card/80 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-brand-navy"
                data-testid={`comm-button-${b.key}-coming-soon`}
              >
                <Clock aria-hidden className="size-2.5" />
                Coming soon
              </span>
            </span>
            <ArrowRight aria-hidden className="size-4" />
          </button>
        ))}
      </div>
    </section>
  )
}
