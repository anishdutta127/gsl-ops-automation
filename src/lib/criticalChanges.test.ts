import { describe, expect, it } from 'vitest'
import {
  collectCriticalChanges,
  isCriticalAudit,
  summariseCriticalAudit,
  topNCriticalChanges,
  withinTrailingWindow,
} from './criticalChanges'
import type { AuditEntry } from '@/lib/types'

function entry(overrides: Partial<AuditEntry> = {}): AuditEntry {
  return {
    timestamp: '2026-05-01T10:00:00Z',
    user: 'u',
    action: 'update' as AuditEntry['action'],
    ...overrides,
  }
}

describe('isCriticalAudit', () => {
  it('flags status_change', () => {
    expect(isCriticalAudit(entry({ action: 'status_change' }))).toBe(true)
  })

  it('flags actuals-confirmed', () => {
    expect(isCriticalAudit(entry({ action: 'actuals-confirmed' }))).toBe(true)
  })

  it('flags pi-issued', () => {
    expect(isCriticalAudit(entry({ action: 'pi-issued' }))).toBe(true)
  })

  it('flags generic update that touches a critical field', () => {
    expect(
      isCriticalAudit(
        entry({
          action: 'update',
          before: { spWithTax: 5000 },
          after: { spWithTax: 5500 },
        }),
      ),
    ).toBe(true)
  })

  it('flags generic update touching School master data', () => {
    expect(
      isCriticalAudit(
        entry({
          action: 'update',
          before: { contactPerson: 'Old SPOC' },
          after: { contactPerson: 'New SPOC' },
        }),
      ),
    ).toBe(true)
  })

  it('does not flag a routine notes-only edit', () => {
    expect(
      isCriticalAudit(
        entry({
          action: 'update',
          before: { notes: 'foo' },
          after: { notes: 'bar' },
        }),
      ),
    ).toBe(false)
  })

  it('does not flag plain create', () => {
    expect(isCriticalAudit(entry({ action: 'create' }))).toBe(false)
  })
})

describe('summariseCriticalAudit', () => {
  it('prefers notes when present', () => {
    expect(
      summariseCriticalAudit(
        entry({ notes: 'Actuals confirmed by SalesHead.' }),
      ),
    ).toBe('Actuals confirmed by SalesHead.')
  })

  it('builds a diff summary when notes absent', () => {
    const s = summariseCriticalAudit(
      entry({
        action: 'update',
        before: { spWithTax: 5000 },
        after: { spWithTax: 5500 },
      }),
    )
    expect(s).toContain('spWithTax')
    expect(s).toContain('5000')
    expect(s).toContain('5500')
  })

  it('caps at 3 field diffs', () => {
    const s = summariseCriticalAudit(
      entry({
        action: 'update',
        before: { a: 1, b: 2, c: 3, d: 4 },
        after: { a: 10, b: 20, c: 30, d: 40 },
      }),
    )
    // Three diffs comma-separated.
    expect(s.split(',').length).toBeLessThanOrEqual(3)
  })
})

describe('collectCriticalChanges', () => {
  it('filters non-critical entries and sorts newest first', () => {
    const log: AuditEntry[] = [
      entry({ timestamp: '2026-04-01T00:00:00Z', action: 'create' }),
      entry({ timestamp: '2026-04-10T00:00:00Z', action: 'pi-issued' }),
      entry({ timestamp: '2026-04-05T00:00:00Z', action: 'status_change' }),
      entry({
        timestamp: '2026-04-15T00:00:00Z',
        action: 'update',
        before: { notes: 'x' },
        after: { notes: 'y' },
      }), // non-critical
    ]
    const out = collectCriticalChanges({
      entityType: 'mou',
      entityId: 'MOU-1',
      entityLabel: 'Sunrise High',
      hrefBase: '/mous',
      auditLog: log,
    })
    expect(out).toHaveLength(2)
    expect(out[0]?.timestamp).toBe('2026-04-10T00:00:00Z')
    expect(out[0]?.action).toBe('pi-issued')
    expect(out[0]?.href).toBe('/mous/MOU-1')
    expect(out[1]?.action).toBe('status_change')
  })
})

describe('topNCriticalChanges', () => {
  it('returns top N entries', () => {
    const log = Array.from({ length: 10 }, (_, i) => ({
      entityType: 'mou' as const,
      entityId: `M-${i}`,
      entityLabel: `Sch ${i}`,
      timestamp: `2026-05-${String(i + 1).padStart(2, '0')}T00:00:00Z`,
      user: 'u',
      action: 'pi-issued',
      summary: '',
      href: `/mous/M-${i}`,
    }))
    expect(topNCriticalChanges(log, 3)).toHaveLength(3)
    expect(topNCriticalChanges(log, 0)).toHaveLength(0)
  })
})

describe('withinTrailingWindow', () => {
  it('keeps entries inside the window', () => {
    const now = new Date('2026-05-11T10:00:00Z')
    const ONE_DAY = 24 * 60 * 60 * 1000
    const out = withinTrailingWindow(
      [
        {
          entityType: 'mou',
          entityId: 'M-1',
          entityLabel: 'X',
          timestamp: '2026-05-10T15:00:00Z', // within last 24h
          user: 'u',
          action: 'pi-issued',
          summary: '',
          href: '/mous/M-1',
        },
        {
          entityType: 'mou',
          entityId: 'M-2',
          entityLabel: 'Y',
          timestamp: '2026-05-01T00:00:00Z', // 10 days old
          user: 'u',
          action: 'pi-issued',
          summary: '',
          href: '/mous/M-2',
        },
      ],
      now,
      ONE_DAY,
    )
    expect(out).toHaveLength(1)
    expect(out[0]?.entityId).toBe('M-1')
  })
})
