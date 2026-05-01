/*
 * W4-I.5 Phase 3 smart template suggestions.
 *
 * For a given MOU + related entities, returns a ranked list of
 * CommunicationTemplate matches. The dashboard / MOU detail surface
 * uses this to suggest the right template at the right lifecycle
 * moment without forcing the operator to pick from the full list.
 *
 * Match rules (per the W4-I.5 P3 brief):
 *   - Pending Signature MOU                                 -> welcome
 *   - PI generated + payment awaited > 14 days              -> payment-reminder
 *   - Dispatch raised > 7 days ago + not delivered          -> dispatch-confirmation
 *   - Programme live + 30 days post-start                   -> feedback-request
 *
 * Each match returns a SmartSuggestion with the underlying template
 * (active templates only), a human-readable reason, and a weight
 * for sorting (higher = more urgent / immediate).
 *
 * Pure function; no I/O. Caller composes the entities before calling.
 */

import type {
  CommunicationTemplate,
  Dispatch,
  IntakeRecord,
  MOU,
  Payment,
  TemplateUseCase,
} from '@/lib/types'

const DAY_MS = 24 * 60 * 60 * 1000
const PAYMENT_REMINDER_DAYS = 14
const DISPATCH_CONFIRMATION_DAYS = 7
const FEEDBACK_REQUEST_DAYS = 30

export interface SmartSuggestion {
  template: CommunicationTemplate
  useCase: TemplateUseCase
  reason: string
  weight: number
}

export interface SmartSuggestionInputs {
  mou: MOU
  templates: CommunicationTemplate[]
  intake: IntakeRecord | null
  dispatches: Dispatch[]
  payments: Payment[]
  now: Date
}

/**
 * Pick the first active template matching the useCase. Returns null
 * when no active template exists for that useCase (suggestion is
 * suppressed in that scenario).
 */
function pickTemplate(
  templates: CommunicationTemplate[],
  useCase: TemplateUseCase,
): CommunicationTemplate | null {
  return templates.find((t) => t.useCase === useCase && t.active) ?? null
}

function daysBetween(later: Date, earlierIso: string | null): number | null {
  if (!earlierIso) return null
  const earlier = new Date(earlierIso).getTime()
  if (!Number.isFinite(earlier)) return null
  return Math.floor((later.getTime() - earlier) / DAY_MS)
}

export function getSmartTemplateSuggestions(
  input: SmartSuggestionInputs,
): SmartSuggestion[] {
  const { mou, templates, dispatches, payments, now } = input
  const out: SmartSuggestion[] = []

  // Rule 1: Pending Signature MOU -> Welcome Note. Highest weight
  // because welcome is a precondition for the rest of the lifecycle.
  if (mou.status === 'Pending Signature') {
    const template = pickTemplate(templates, 'welcome')
    if (template) {
      out.push({
        template, useCase: 'welcome', weight: 100,
        reason: 'MOU is Pending Signature. Send the welcome note to the school SPOC.',
      })
    }
  }

  // Rule 2: PI generated + payment awaited > 14 days -> payment reminder.
  // Pick the oldest unpaid payment with a piSentDate > 14d ago.
  for (const p of payments) {
    if (p.mouId !== mou.id) continue
    if (p.status !== 'PI Sent' && p.status !== 'Pending' && p.status !== 'Overdue') continue
    const days = daysBetween(now, p.piSentDate)
    if (days === null || days < PAYMENT_REMINDER_DAYS) continue
    const template = pickTemplate(templates, 'payment-reminder')
    if (template) {
      out.push({
        template, useCase: 'payment-reminder', weight: 80,
        reason: `PI ${p.piNumber ?? p.id} sent ${days} days ago and payment is still awaited.`,
      })
    }
    break  // one payment-reminder suggestion per MOU is enough
  }

  // Rule 3: Dispatch raised > 7 days ago + not delivered -> dispatch
  // confirmation. Pick the earliest matching dispatch.
  for (const d of dispatches) {
    if (d.mouId !== mou.id) continue
    const dispatchedDays = daysBetween(now, d.dispatchedAt)
    if (dispatchedDays === null || dispatchedDays < DISPATCH_CONFIRMATION_DAYS) continue
    if (d.deliveredAt !== null || d.acknowledgedAt !== null) continue
    const template = pickTemplate(templates, 'dispatch-confirmation')
    if (template) {
      out.push({
        template, useCase: 'dispatch-confirmation', weight: 70,
        reason: `Dispatch ${d.id} shipped ${dispatchedDays} days ago without delivery acknowledgement.`,
      })
    }
    break
  }

  // Rule 4: Programme live + 30 days post-start -> feedback request.
  // Programme-live = Active MOU with a startDate in the past + at
  // least one delivered dispatch.
  if (mou.status === 'Active') {
    const startDays = daysBetween(now, mou.startDate)
    const hasDelivered = dispatches.some(
      (d) => d.mouId === mou.id && (d.stage === 'delivered' || d.stage === 'acknowledged'),
    )
    if (startDays !== null && startDays >= FEEDBACK_REQUEST_DAYS && hasDelivered) {
      const template = pickTemplate(templates, 'feedback-request')
      if (template) {
        out.push({
          template, useCase: 'feedback-request', weight: 60,
          reason: `Programme started ${startDays} days ago and at least one dispatch has been delivered.`,
        })
      }
    }
  }

  return out.sort((a, b) => b.weight - a.weight)
}
