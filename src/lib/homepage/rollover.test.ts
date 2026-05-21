/*
 * Rollover + urgency promotion tests (Phase 6F Part 4).
 */

import { describe, expect, it } from 'vitest'
import {
  applyDismissals,
  applyRollover,
  consecutiveUnactionedDays,
  isDismissalActive,
  type ActionLogEntry,
  type RolloverContext,
} from './rollover'
import type { ActionItem } from './types'

function item(overrides: Partial<ActionItem> = {}): ActionItem {
  return {
    id: 'today:instalments-due-today',
    category: 'today',
    role: 'finance',
    title: '3 instalments due today',
    count: 3,
    ctaLabel: 'Review',
    ctaHref: '/finance/payments?dueOn=2026-05-21',
    meta: {},
    urgencyScore: 800,
    ...overrides,
  }
}

function ctx(opts: { today: string; userId?: string; log?: ActionLogEntry[] }): RolloverContext {
  return {
    todayIso: opts.today,
    user: { id: opts.userId ?? 'pranav.b' },
    log: opts.log ?? [],
  }
}

describe('consecutiveUnactionedDays', () => {
  it('returns 0 when there is no prior log entry for the item', () => {
    const r = consecutiveUnactionedDays('today:foo', ctx({ today: '2026-05-21' }))
    expect(r).toBe(0)
  })

  it('counts seen + dismissed states as unactioned days', () => {
    const log: ActionLogEntry[] = [
      { date: '2026-05-20', userId: 'pranav.b', itemId: 'today:foo', category: 'today', state: 'seen' },
      { date: '2026-05-19', userId: 'pranav.b', itemId: 'today:foo', category: 'today', state: 'dismissed' },
      { date: '2026-05-18', userId: 'pranav.b', itemId: 'today:foo', category: 'today', state: 'seen' },
    ]
    const r = consecutiveUnactionedDays('today:foo', ctx({ today: '2026-05-21', log }))
    expect(r).toBe(3)
  })

  it('resets the streak at the first actioned state', () => {
    const log: ActionLogEntry[] = [
      { date: '2026-05-20', userId: 'pranav.b', itemId: 'today:foo', category: 'today', state: 'seen' },
      { date: '2026-05-19', userId: 'pranav.b', itemId: 'today:foo', category: 'today', state: 'actioned' },
      { date: '2026-05-18', userId: 'pranav.b', itemId: 'today:foo', category: 'today', state: 'seen' },
    ]
    const r = consecutiveUnactionedDays('today:foo', ctx({ today: '2026-05-21', log }))
    expect(r).toBe(1)
  })

  it('ignores entries from other users', () => {
    const log: ActionLogEntry[] = [
      { date: '2026-05-20', userId: 'misba.m', itemId: 'today:foo', category: 'today', state: 'seen' },
    ]
    const r = consecutiveUnactionedDays('today:foo', ctx({ today: '2026-05-21', userId: 'pranav.b', log }))
    expect(r).toBe(0)
  })

  it('ignores today\'s own entry (only past days carry over)', () => {
    const log: ActionLogEntry[] = [
      { date: '2026-05-21', userId: 'pranav.b', itemId: 'today:foo', category: 'today', state: 'seen' },
    ]
    const r = consecutiveUnactionedDays('today:foo', ctx({ today: '2026-05-21', log }))
    expect(r).toBe(0)
  })
})

describe('applyRollover', () => {
  it('does not change an item with no prior unactioned days', () => {
    const items = [item()]
    const r = applyRollover(items, ctx({ today: '2026-05-21' }))
    expect(r[0]?.urgencyScore).toBe(800)
    expect(r[0]?.meta.urgencyDays).toBeUndefined()
  })

  it('bumps urgencyScore by +1 per persisted day and surfaces a carry-over subtitle', () => {
    const log: ActionLogEntry[] = [
      { date: '2026-05-20', userId: 'pranav.b', itemId: 'today:instalments-due-today', category: 'today', state: 'seen' },
    ]
    const r = applyRollover([item()], ctx({ today: '2026-05-21', log }))
    expect(r[0]?.urgencyScore).toBe(801)
    expect(r[0]?.meta.urgencyDays).toBe(1)
    expect(r[0]?.category).toBe('today') // not yet promoted
  })

  it('promotes a Today-category item to Overdue on day 3 of carry-over (Anish 2026-05-21 GO)', () => {
    const log: ActionLogEntry[] = [
      { date: '2026-05-20', userId: 'pranav.b', itemId: 'today:instalments-due-today', category: 'today', state: 'seen' },
      { date: '2026-05-19', userId: 'pranav.b', itemId: 'today:instalments-due-today', category: 'today', state: 'seen' },
      { date: '2026-05-18', userId: 'pranav.b', itemId: 'today:instalments-due-today', category: 'today', state: 'seen' },
    ]
    const r = applyRollover([item()], ctx({ today: '2026-05-21', log }))
    expect(r[0]?.category).toBe('overdue')
    expect(r[0]?.urgencyScore).toBeGreaterThanOrEqual(1000) // category boost lifted score above Overdue floor
  })

  it('does not double-promote an item already in Overdue', () => {
    const log: ActionLogEntry[] = [
      { date: '2026-05-20', userId: 'pranav.b', itemId: 'overdue:foo', category: 'overdue', state: 'seen' },
      { date: '2026-05-19', userId: 'pranav.b', itemId: 'overdue:foo', category: 'overdue', state: 'seen' },
      { date: '2026-05-18', userId: 'pranav.b', itemId: 'overdue:foo', category: 'overdue', state: 'seen' },
    ]
    const r = applyRollover([item({ id: 'overdue:foo', category: 'overdue', urgencyScore: 1000 })], ctx({ today: '2026-05-21', log }))
    // urgencyScore is +3 for the 3 days; no extra category boost because already Overdue.
    expect(r[0]?.category).toBe('overdue')
    expect(r[0]?.urgencyScore).toBe(1003)
  })
})

describe('isDismissalActive', () => {
  it('returns false when no dismissal is on record', () => {
    const r = isDismissalActive('today:foo', 'today', ctx({ today: '2026-05-21' }))
    expect(r).toBe(false)
  })

  it('returns true when a same-day dismissal exists and the item has not promoted to overdue', () => {
    const log: ActionLogEntry[] = [
      { date: '2026-05-21', userId: 'pranav.b', itemId: 'today:foo', category: 'today', state: 'dismissed' },
    ]
    const r = isDismissalActive('today:foo', 'today', ctx({ today: '2026-05-21', log }))
    expect(r).toBe(true)
  })

  it('Anish 2026-05-21 GO: a same-day dismissal is bypassed if the item has promoted to overdue', () => {
    const log: ActionLogEntry[] = [
      { date: '2026-05-21', userId: 'pranav.b', itemId: 'today:foo', category: 'today', state: 'dismissed' },
    ]
    const r = isDismissalActive('today:foo', 'overdue', ctx({ today: '2026-05-21', log }))
    expect(r).toBe(false)
  })

  it('returns false when dismissal happened more than a day ago', () => {
    const log: ActionLogEntry[] = [
      { date: '2026-05-19', userId: 'pranav.b', itemId: 'today:foo', category: 'today', state: 'dismissed' },
    ]
    const r = isDismissalActive('today:foo', 'today', ctx({ today: '2026-05-21', log }))
    expect(r).toBe(false)
  })
})

describe('applyDismissals', () => {
  it('filters out items dismissed today that are not in overdue category', () => {
    const log: ActionLogEntry[] = [
      { date: '2026-05-21', userId: 'pranav.b', itemId: 'today:foo', category: 'today', state: 'dismissed' },
    ]
    const a = item({ id: 'today:foo', category: 'today' })
    const b = item({ id: 'today:bar', category: 'today' })
    const r = applyDismissals([a, b], ctx({ today: '2026-05-21', log }))
    expect(r.map((x) => x.id)).toEqual(['today:bar'])
  })

  it('keeps an item that promoted to overdue even if it was dismissed today', () => {
    const log: ActionLogEntry[] = [
      { date: '2026-05-21', userId: 'pranav.b', itemId: 'today:foo', category: 'today', state: 'dismissed' },
    ]
    const a = item({ id: 'today:foo', category: 'overdue' })
    const r = applyDismissals([a], ctx({ today: '2026-05-21', log }))
    expect(r.map((x) => x.id)).toEqual(['today:foo'])
  })
})

describe('Day-1 + Day-4 scenario (brief spec)', () => {
  it('an unactioned today-item on day 1 persists with promoted urgencyScore on day 2; by day 4 has promoted to overdue', () => {
    const baseItem = item({ id: 'today:instalments-due-today', category: 'today', urgencyScore: 800 })

    // Day 2: prior day was seen + not actioned.
    const day2Log: ActionLogEntry[] = [
      { date: '2026-05-20', userId: 'pranav.b', itemId: 'today:instalments-due-today', category: 'today', state: 'seen' },
    ]
    const day2 = applyRollover([baseItem], ctx({ today: '2026-05-21', log: day2Log }))
    expect(day2[0]?.category).toBe('today')
    expect(day2[0]?.urgencyScore).toBe(801)

    // Day 4: three prior days seen, no action; now category promotes to overdue.
    const day4Log: ActionLogEntry[] = [
      { date: '2026-05-22', userId: 'pranav.b', itemId: 'today:instalments-due-today', category: 'today', state: 'seen' },
      { date: '2026-05-21', userId: 'pranav.b', itemId: 'today:instalments-due-today', category: 'today', state: 'seen' },
      { date: '2026-05-20', userId: 'pranav.b', itemId: 'today:instalments-due-today', category: 'today', state: 'seen' },
    ]
    const day4 = applyRollover([baseItem], ctx({ today: '2026-05-23', log: day4Log }))
    expect(day4[0]?.category).toBe('overdue')
  })
})
