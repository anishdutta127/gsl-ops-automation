/*
 * Rollover + urgency promotion (Phase 6F Part 4).
 *
 * The action queue carries memory across days. When an item appears
 * today and the user does not action it (no CTA click, no dismissal
 * via the menu), tomorrow that same item appears at a higher
 * urgencyScore and with a "Carried over from yesterday - 2nd day"
 * subtitle. After 3 consecutive days unactioned, the item is
 * promoted to the 'overdue' category regardless of its original
 * category.
 *
 * State lives in src/data/homepage_action_log.json: one entry per
 * (user, day, item) tuple, recording whether the user actioned the
 * item (clicked CTA) or dismissed it. The log is append-only; the
 * homepage's request-time code looks back at the previous days'
 * entries to compute carry-over for the current day.
 *
 * Dismissal is honoured for 24 hours (1 calendar day) BUT bypassed
 * if the item's urgency promotes (e.g. an instalment slides from
 * "Today" to "Overdue" overnight). Anish 2026-05-21 GO: dismissal
 * is subordinate to urgency promotion.
 */

import type { ActionItem } from './types'

export interface ActionLogEntry {
  /** ISO date 'YYYY-MM-DD' the entry covers. */
  date: string
  /** User who saw the item that day. */
  userId: string
  /** ActionItem.id */
  itemId: string
  /** ActionItem.category at the time the entry was written. */
  category: ActionItem['category']
  /** 'actioned' means the CTA was clicked. 'dismissed' means the user
   *  hit the dismiss control. 'seen' means it was rendered but the
   *  user did neither (default; written by the homepage on render).
   */
  state: 'seen' | 'actioned' | 'dismissed'
}

export interface RolloverContext {
  /** Today's date as a UTC ISO 'YYYY-MM-DD'. */
  todayIso: string
  user: { id: string }
  /** The entire homepage_action_log.json content (or a slice). */
  log: ActionLogEntry[]
}

const DAY_MS = 24 * 60 * 60 * 1000

function parseIso(s: string): number {
  const [y, m, d] = s.slice(0, 10).split('-').map(Number)
  return Date.UTC(y!, (m ?? 1) - 1, d ?? 1)
}

function daysBetween(a: string, b: string): number {
  return Math.round((parseIso(a) - parseIso(b)) / DAY_MS)
}

/**
 * For a given itemId, count how many of the past `windowDays` days
 * (excluding today) the user saw the item without actioning. A
 * 'seen' or 'dismissed' state counts as not actioned; 'actioned'
 * resets the streak (returns 0).
 *
 * The function walks back from yesterday and stops at the first
 * 'actioned' entry. Gaps in the log (days the user did not open
 * the homepage) do not break the streak; only an explicit
 * 'actioned' resets it.
 */
export function consecutiveUnactionedDays(
  itemId: string,
  ctx: RolloverContext,
  windowDays = 30,
): number {
  const sameItem = ctx.log
    .filter((e) => e.userId === ctx.user.id && e.itemId === itemId)
    .filter((e) => e.date < ctx.todayIso) // strictly before today
    .sort((a, b) => (a.date < b.date ? 1 : -1)) // newest first

  if (sameItem.length === 0) return 0
  let streak = 0
  let lastDate: string | null = null
  for (const entry of sameItem) {
    if (entry.state === 'actioned') break
    if (lastDate !== null) {
      // ensure consecutive days
      const gap = daysBetween(lastDate, entry.date)
      if (gap > 1) {
        // Per the rule above, gaps do not break the streak. The check
        // here would only matter if we wanted to require strict
        // contiguity; we explicitly do NOT.
      }
    }
    streak += 1
    lastDate = entry.date
    if (streak >= windowDays) break
  }
  return streak
}

const PROMOTION_THRESHOLD_DAYS = 3

/**
 * Apply per-item carry-over decoration:
 *   - Bump urgencyScore by +1 per day persisted.
 *   - Surface "Carried over from yesterday - Nth day" subtitle (via meta.urgencyDays).
 *   - On day 4+, promote category to 'overdue' (Anish 2026-05-21 GO).
 *
 * The function is pure; it does not mutate the input.
 */
export function applyRollover(
  items: ActionItem[],
  ctx: RolloverContext,
): ActionItem[] {
  return items.map((item) => {
    const carriedDays = consecutiveUnactionedDays(item.id, ctx)
    if (carriedDays === 0) return item
    const promoted: ActionItem = {
      ...item,
      urgencyScore: item.urgencyScore + carriedDays,
      meta: {
        ...item.meta,
        urgencyDays: carriedDays,
      },
    }
    if (carriedDays >= PROMOTION_THRESHOLD_DAYS && promoted.category !== 'overdue') {
      promoted.category = 'overdue'
      promoted.urgencyScore += 200 // category boost so it sorts among Overdue
    }
    return promoted
  })
}

/**
 * Should a dismissed item be re-surfaced today? Returns true when
 * the dismissal happened > 24h ago, OR when the item has promoted
 * to 'overdue' since being dismissed (Anish 2026-05-21 GO: urgency
 * promotion overrides dismissal).
 */
export function isDismissalActive(
  itemId: string,
  currentCategory: ActionItem['category'],
  ctx: RolloverContext,
): boolean {
  const sameItem = ctx.log
    .filter((e) => e.userId === ctx.user.id && e.itemId === itemId && e.state === 'dismissed')
    .sort((a, b) => (a.date < b.date ? 1 : -1))
  if (sameItem.length === 0) return false
  const mostRecent = sameItem[0]!
  // Within 24h means same calendar day for our day-bucketed log.
  if (daysBetween(ctx.todayIso, mostRecent.date) > 0) return false
  // Same-day dismissal IS active UNLESS the item has now promoted to overdue.
  if (currentCategory === 'overdue') return false
  return true
}

/**
 * Convenience wrapper: filter out items whose dismissal is still
 * active, after applyRollover has determined the current category.
 */
export function applyDismissals(
  items: ActionItem[],
  ctx: RolloverContext,
): ActionItem[] {
  return items.filter((item) => !isDismissalActive(item.id, item.category, ctx))
}
