/*
 * EditHistoryReveal tests (Gate 4.7 Step 4).
 */

import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { AuditEntry } from '@/lib/types'
import { EditHistoryReveal } from './EditHistoryReveal'

const entry = (overrides: Partial<AuditEntry> = {}): AuditEntry => ({
  timestamp: '2026-04-01T10:00:00Z',
  user: 'misba.m',
  action: 'update',
  ...overrides,
})

describe('EditHistoryReveal', () => {
  it('renders empty state when no entries match the field', () => {
    const html = renderToStaticMarkup(
      <EditHistoryReveal entries={[]} field="studentsMou" />,
    )
    expect(html).toContain('No previous changes recorded')
  })

  it('renders count + before/after for matching entries', () => {
    const entries = [
      entry({
        timestamp: '2026-04-10T00:00:00Z',
        before: { studentsMou: 100 },
        after: { studentsMou: 120 },
      }),
      entry({
        timestamp: '2026-04-05T00:00:00Z',
        before: { studentsMou: 80 },
        after: { studentsMou: 100 },
      }),
    ]
    const html = renderToStaticMarkup(
      <EditHistoryReveal entries={entries} field="studentsMou" />,
    )
    expect(html).toContain('Last changed 2 times')
    expect(html).toContain('100')
    expect(html).toContain('120')
  })

  it('matches when field is in an array of keys', () => {
    const entries = [
      entry({
        before: { spWithTax: 5000 },
        after: { spWithTax: 5500 },
      }),
    ]
    const html = renderToStaticMarkup(
      <EditHistoryReveal
        entries={entries}
        field={['spWithoutTax', 'spWithTax']}
      />,
    )
    expect(html).toContain('Last changed 1 time')
  })

  it('skips entries that touch unrelated fields', () => {
    const entries = [
      entry({
        before: { notes: 'old' },
        after: { notes: 'new' },
      }),
    ]
    const html = renderToStaticMarkup(
      <EditHistoryReveal entries={entries} field="studentsMou" />,
    )
    expect(html).toContain('No previous changes recorded')
  })

  it('sorts newest first', () => {
    const entries = [
      entry({
        timestamp: '2026-04-01T00:00:00Z',
        before: { studentsMou: 50 },
        after: { studentsMou: 60 },
      }),
      entry({
        timestamp: '2026-05-01T00:00:00Z',
        before: { studentsMou: 60 },
        after: { studentsMou: 70 },
      }),
    ]
    const html = renderToStaticMarkup(
      <EditHistoryReveal
        entries={entries}
        field="studentsMou"
        testIdSlug="mou-students"
      />,
    )
    // First row in the rendered HTML should be the May entry (newest).
    const mayIdx = html.indexOf('2026-05-01')
    const aprIdx = html.indexOf('2026-04-01')
    expect(mayIdx).toBeGreaterThan(-1)
    expect(aprIdx).toBeGreaterThan(-1)
    expect(mayIdx).toBeLessThan(aprIdx)
  })

  it('caps at 10 rows with overflow caption', () => {
    const entries = Array.from({ length: 15 }, (_, i) =>
      entry({
        timestamp: `2026-04-${String(i + 1).padStart(2, '0')}T00:00:00Z`,
        before: { studentsMou: i },
        after: { studentsMou: i + 1 },
      }),
    )
    const html = renderToStaticMarkup(
      <EditHistoryReveal entries={entries} field="studentsMou" />,
    )
    expect(html).toContain('5 earlier change')
  })
})
