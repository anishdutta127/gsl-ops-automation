/*
 * AI insights provider (Phase 6F Part 2 stub).
 *
 * The homepage calls listInsights(context) and renders whatever
 * ActionItem[] comes back. The provider chosen at this call site is
 * the only swap point: a future ChatGPT / Anthropic / local rules
 * implementation replaces NO_OP_AI_INSIGHTS without touching the
 * homepage code itself.
 *
 * See HOMEPAGE_REDESIGN_PLAN.md for the provider catalogue + the
 * decision rationale for keeping the surface implementation-agnostic.
 */

import type { AiInsightProvider } from './types'

/**
 * Default provider used in Phase 6F. Returns an empty array; the
 * homepage's Category 5 column renders an "All clear" tile in the
 * absence of any insights. No external I/O, no API key, safe in
 * every environment.
 */
export const NO_OP_AI_INSIGHTS: AiInsightProvider = {
  id: 'no-op',
  listInsights: async () => [],
}
