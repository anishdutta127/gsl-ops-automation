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
import { opsButtonClass, type OpsButtonVariant } from '@/components/ops/OpsButton'

const VARIANT_MAP: Record<CommunicationButton['variant'], OpsButtonVariant> = {
  navy: 'primary',
  teal: 'action',
  outline: 'outline',
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
            className={opsButtonClass({
              variant: VARIANT_MAP[b.variant],
              size: 'md',
              className: 'w-full justify-between',
            })}
          >
            <span>{b.label}</span>
            <ArrowRight aria-hidden className="size-4" />
          </Link>
        ))}
      </div>
    </section>
  )
}
