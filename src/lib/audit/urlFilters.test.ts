import { describe, expect, it } from 'vitest'
import type { AuditRowData } from './aggregate'
import {
  applyFilters,
  describeFilters,
  parseUrlFilters,
  QUICK_FILTERS,
} from './urlFilters'

function makeRow(
  partial: Partial<AuditRowData> & {
    timestamp?: string
    user?: string
    action?: string
  },
): AuditRowData {
  return {
    entry: {
      timestamp: partial.timestamp ?? '2026-04-25T10:00:00Z',
      user: partial.user ?? 'misba.m',
      action:
        (partial.action as AuditRowData['entry']['action']) ?? 'whatsapp-draft-copied',
      notes: 'placeholder',
    },
    entityType: partial.entityType ?? 'Communication',
    entityId: partial.entityId ?? 'COM-001',
    entityLabel: partial.entityLabel ?? 'Test Communication',
    entityHref: partial.entityHref ?? '/test',
    laneOfEntry: partial.laneOfEntry,
  }
}

describe('parseUrlFilters', () => {
  it('returns empty / default when no params provided', () => {
    const f = parseUrlFilters({})
    expect(f.entity).toEqual([])
    expect(f.action).toEqual([])
    expect(f.user).toBe(null)
    expect(f.search).toBe(null)
    expect(f.daysWindow).toBe(7)
    expect(f.startDate).toBe(null)
    expect(f.endDate).toBe(null)
    expect(f.cursor).toBe(null)
    expect(f.quickFilter).toBe(null)
  })

  it('parses comma-separated entity and action lists', () => {
    const f = parseUrlFilters({
      entity: 'MOU,School',
      action: 'p2-override,cc-rule-toggle-on',
    })
    expect(f.entity).toEqual(['MOU', 'School'])
    expect(f.action).toEqual(['p2-override', 'cc-rule-toggle-on'])
  })

  it('parses days as integer; "all" sets daysWindow to null', () => {
    expect(parseUrlFilters({ days: '30' }).daysWindow).toBe(30)
    expect(parseUrlFilters({ days: 'all' }).daysWindow).toBe(null)
    // Invalid -> default 7
    expect(parseUrlFilters({ days: 'not-a-number' }).daysWindow).toBe(7)
  })

  it('expands quick-filter shortcut to its preset', () => {
    const f = parseUrlFilters({ filter: 'communication-copy' })
    expect(f.entity).toEqual(['Communication'])
    expect(f.action).toEqual(['whatsapp-draft-copied'])
    expect(f.daysWindow).toBe(7)
    expect(f.quickFilter).toBe('communication-copy')
  })

  it('direct params override quick-filter expansion', () => {
    const f = parseUrlFilters({
      filter: 'communication-copy',
      entity: 'MOU',
    })
    expect(f.entity).toEqual(['MOU'])
    // action falls through to quick-filter expansion since not directly set
    expect(f.action).toEqual(['whatsapp-draft-copied'])
  })

  it('passes through search, user, cursor, start, end', () => {
    const f = parseUrlFilters({
      q: 'Narayana',
      user: 'ameet.z',
      cursor: '2026-04-20T00:00:00Z',
      start: '2026-04-01',
      end: '2026-04-30',
    })
    expect(f.search).toBe('Narayana')
    expect(f.user).toBe('ameet.z')
    expect(f.cursor).toBe('2026-04-20T00:00:00Z')
    expect(f.startDate).toBe('2026-04-01')
    expect(f.endDate).toBe('2026-04-30')
  })

  it('all four canonical quick-filter ids resolve to a preset', () => {
    expect(QUICK_FILTERS['communication-copy']).toBeDefined()
    expect(QUICK_FILTERS['p2-overrides']).toBeDefined()
    expect(QUICK_FILTERS['cc-rule-toggles']).toBeDefined()
    expect(QUICK_FILTERS['import-auto-links']).toBeDefined()
  })
})

describe('applyFilters', () => {
  const now = new Date('2026-04-25T12:00:00Z')

  it('returns all rows when filters are empty / default', () => {
    const rows = [
      makeRow({ timestamp: '2026-04-25T11:00:00Z' }),
      makeRow({ timestamp: '2026-04-24T11:00:00Z', entityId: 'COM-002' }),
    ]
    const result = applyFilters(rows, parseUrlFilters({}), now)
    expect(result).toHaveLength(2)
  })

  it('narrows by entity type', () => {
    const rows = [
      makeRow({ entityType: 'Communication' }),
      makeRow({ entityType: 'MOU', entityId: 'M-1' }),
    ]
    const result = applyFilters(
      rows,
      parseUrlFilters({ entity: 'MOU' }),
      now,
    )
    expect(result).toHaveLength(1)
    expect(result[0]?.entityType).toBe('MOU')
  })

  it('narrows by action', () => {
    const rows = [
      makeRow({ action: 'whatsapp-draft-copied' }),
      makeRow({ action: 'p2-override', entityId: 'D-1' }),
    ]
    const result = applyFilters(
      rows,
      parseUrlFilters({ action: 'p2-override' }),
      now,
    )
    expect(result).toHaveLength(1)
    expect(result[0]?.entry.action).toBe('p2-override')
  })

  it('narrows by user', () => {
    const rows = [
      makeRow({ user: 'misba.m' }),
      makeRow({ user: 'ameet.z', entityId: 'C-2' }),
    ]
    const result = applyFilters(
      rows,
      parseUrlFilters({ user: 'ameet.z' }),
      now,
    )
    expect(result).toHaveLength(1)
    expect(result[0]?.entry.user).toBe('ameet.z')
  })

  it('narrows by days window (last N days)', () => {
    const rows = [
      makeRow({ timestamp: '2026-04-24T00:00:00Z' }), // 1d ago
      makeRow({ timestamp: '2026-04-15T00:00:00Z', entityId: 'X-2' }), // 10d ago
      makeRow({ timestamp: '2026-03-15T00:00:00Z', entityId: 'X-3' }), // 41d ago
    ]
    expect(applyFilters(rows, parseUrlFilters({ days: '7' }), now)).toHaveLength(1)
    expect(applyFilters(rows, parseUrlFilters({ days: '30' }), now)).toHaveLength(2)
    expect(applyFilters(rows, parseUrlFilters({ days: 'all' }), now)).toHaveLength(3)
  })

  it('narrows by free-text search across action / entityLabel / notes', () => {
    const rows = [
      makeRow({ entityLabel: 'Narayana Asansol', entityId: 'X-1' }),
      makeRow({ entityLabel: 'Greenfield Pune', entityId: 'X-2' }),
      makeRow({ entityLabel: 'Other', entityId: 'X-3' }),
    ]
    rows[2]!.entry = { ...rows[2]!.entry, notes: 'Narayana mentioned in notes' }
    const result = applyFilters(rows, parseUrlFilters({ q: 'narayana' }), now)
    expect(result.map((r) => r.entityId).sort()).toEqual(['X-1', 'X-3'])
  })

  it('narrows by cursor (excludes entries newer than cursor)', () => {
    const rows = [
      makeRow({ timestamp: '2026-04-25T11:00:00Z', entityId: 'A' }),
      makeRow({ timestamp: '2026-04-25T10:00:00Z', entityId: 'B' }),
      makeRow({ timestamp: '2026-04-25T09:00:00Z', entityId: 'C' }),
    ]
    const result = applyFilters(
      rows,
      parseUrlFilters({ cursor: '2026-04-25T10:30:00Z', days: 'all' }),
      now,
    )
    expect(result.map((r) => r.entityId)).toEqual(['B', 'C'])
  })

  it('quick-filter "communication-copy" matches Communication + whatsapp-draft-copied + 7d', () => {
    const rows = [
      makeRow({
        entityType: 'Communication',
        action: 'whatsapp-draft-copied',
        timestamp: '2026-04-24T00:00:00Z',
      }),
      makeRow({
        entityType: 'Communication',
        action: 'pi-issued',
        timestamp: '2026-04-24T00:00:00Z',
        entityId: 'C-2',
      }),
      makeRow({
        entityType: 'Dispatch',
        action: 'whatsapp-draft-copied',
        timestamp: '2026-04-24T00:00:00Z',
        entityId: 'D-1',
      }),
    ]
    const result = applyFilters(
      rows,
      parseUrlFilters({ filter: 'communication-copy' }),
      now,
    )
    expect(result).toHaveLength(1)
    expect(result[0]?.entityType).toBe('Communication')
    expect(result[0]?.entry.action).toBe('whatsapp-draft-copied')
  })
})

describe('describeFilters', () => {
  it('produces no chips when filters are at default', () => {
    const f = parseUrlFilters({})
    expect(describeFilters(f)).toHaveLength(0)
  })

  it('emits a chip per active filter; each carries a remove href', () => {
    const f = parseUrlFilters({
      entity: 'MOU',
      action: 'p2-override',
      user: 'ameet.z',
      q: 'narayana',
      days: '30',
    })
    const chips = describeFilters(f)
    expect(chips.length).toBeGreaterThanOrEqual(5)
    for (const chip of chips) {
      expect(chip.removeHref.startsWith('/admin/audit')).toBe(true)
    }
  })

  it('quick-filter chip is its own removable label', () => {
    const f = parseUrlFilters({ filter: 'p2-overrides' })
    const chips = describeFilters(f)
    const quick = chips.find((c) => c.label.includes('quick:'))
    expect(quick).toBeDefined()
    expect(quick?.label).toContain('p2-overrides')
  })
})
