/*
 * SmartSuggestionsPanel (W4-I.5 P3C4).
 *
 * Renders on the MOU detail page when getSmartTemplateSuggestions
 * returns at least one match. Each suggestion is a clickable card
 * that hands off to the template launcher with the MOU + template
 * pre-bound. The panel is silent when there are no matches (does
 * not render an empty header).
 */

import Link from 'next/link'
import { Sparkles, ArrowRight } from 'lucide-react'
import type { SmartSuggestion } from '@/lib/templates/smartSuggestions'

export interface SmartSuggestionsPanelProps {
  mouId: string
  suggestions: SmartSuggestion[]
}

export function SmartSuggestionsPanel({ mouId, suggestions }: SmartSuggestionsPanelProps) {
  if (suggestions.length === 0) return null
  return (
    <section
      aria-labelledby="smart-suggestions-heading"
      data-testid="smart-suggestions-panel"
      className="rounded-xl border border-brand-teal/40 bg-brand-teal/5 p-4 sm:p-5"
    >
      <header className="mb-3 flex items-start gap-2">
        <span aria-hidden className="inline-flex size-8 shrink-0 items-center justify-center rounded-md bg-brand-teal/20 text-brand-navy">
          <Sparkles className="size-4" />
        </span>
        <div className="min-w-0">
          <h3
            id="smart-suggestions-heading"
            className="font-heading text-sm font-semibold text-brand-navy"
          >
            Smart suggestions
          </h3>
          <p className="text-xs text-muted-foreground">
            Based on this MOU&apos;s lifecycle stage, the following templates are recommended.
          </p>
        </div>
      </header>
      <ul className="flex flex-col gap-2">
        {suggestions.map((s) => (
          <li key={s.template.id}>
            <Link
              href={`/mous/${encodeURIComponent(mouId)}/send-template/${encodeURIComponent(s.template.id)}`}
              data-testid={`smart-suggestion-${s.useCase}`}
              className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2.5 transition hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-brand-navy">{s.template.name}</span>
                <span className="block text-xs text-muted-foreground">{s.reason}</span>
              </span>
              <ArrowRight aria-hidden className="size-4 shrink-0 text-muted-foreground" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
