/*
 * Homepage action queue type contracts (Phase 6F Part 2).
 *
 * The action queue is a flat list of ActionItem entries the homepage
 * renders as cards. Each item carries enough to render the card
 * (title, count, CTA) plus the metadata the engine needs to sort,
 * group, and (in Part 4) carry-over with promoted urgency.
 *
 * See HOMEPAGE_REDESIGN_PLAN.md for the per-category data sources +
 * field-level filter mappings.
 */

import type {
  Dispatch,
  Escalation,
  KitDispatch,
  MOU,
  Payment,
  PaymentLog,
  School,
  User,
} from '@/lib/types'

/** The card-stripe category. Ordered roughly by urgency. */
export type ActionCategory =
  | 'overdue'         // Category 1: red. Past due, escalating, > threshold.
  | 'today'           // Category 2: amber. Action expected today.
  | 'this-week'       // Category 3: blue. Within the next 7 days.
  | 'data-quality'    // Category 4: grey. System-health gaps the operator owns.
  | 'ai-insight'      // Category 5: purple. Provider-generated; empty in 6F.

/**
 * Role tag on the item. The homepage filters by the requesting user's
 * resolved view: Admin sees everything, Leadership sees an aggregate,
 * Finance / Ops / Sales see their tag + 'both'. Sales items are
 * portfolio-scoped to the requesting sales user's MOUs (see
 * HOMEPAGE_REDESIGN_PLAN.md section 4).
 */
export type ActionRole = 'finance' | 'ops' | 'sales' | 'both'

export interface ActionItem {
  /**
   * Stable identifier. Used by the daily action log to track
   * carry-over and by the dismissal store to mark an item dismissed.
   * Pattern: `<category>:<source>:<subject>` (eg
   * 'overdue:instalment-past-due:MOU-STEAM-2627-001-i1', or
   * 'data-quality:null-productSelection:bulk').
   */
  id: string
  category: ActionCategory
  role: ActionRole
  /** One-line plain English title. Used as the card heading. */
  title: string
  /**
   * Number to surface in the count badge. For grouped items ("12 PI
   * backfills") this is the group count; for single-entity items it
   * is 1.
   */
  count: number
  /** Button text. Verb-led: "Review", "Match", "Issue PI". */
  ctaLabel: string
  /**
   * Deep link to the filtered work surface. The CTA does NOT mutate
   * state; it routes the operator to the page where they can act.
   */
  ctaHref: string
  /**
   * Free-form metadata the card may surface as a one-line context
   * subtitle. Keep small; the homepage is not a detail page. Reserved
   * keys: `subtitle` (string rendered under the title), `urgencyDays`
   * (number rendered as "Carried over from yesterday · Nth day" once
   * Part 4 lands), `salesPersonId` (set on portfolio-scoped sales
   * cards; used by the engine, never rendered).
   */
  meta: Record<string, unknown>
  /**
   * Sort key within the same category. Higher = more urgent. Computed
   * deterministically by the query function; Part 4 will bump this
   * +1 per day an item persists unactioned.
   */
  urgencyScore: number
}

/** Snapshot of the canonical data files the engine reads. */
export interface ActionQueueData {
  mous: MOU[]
  payments: Payment[]
  paymentLogs: PaymentLog[]
  schools: School[]
  dispatches: Dispatch[]
  kitDispatches: KitDispatch[]
  escalations: Escalation[]
}

export interface ActionQueueContext {
  /** Server time. Tests inject a fixed value. */
  now: Date
  user: User
  data: ActionQueueData
}

/**
 * AI insights provider contract (Phase 6F Part 2 stub). Future
 * implementations (ChatGPT / Anthropic / local rules engine) plug in
 * at the lib boundary without touching the homepage. See the plan
 * doc for the provider catalogue.
 */
export type AiInsightContext = ActionQueueContext

export interface AiInsightProvider {
  readonly id: string
  listInsights(context: AiInsightContext): Promise<ActionItem[]>
}
