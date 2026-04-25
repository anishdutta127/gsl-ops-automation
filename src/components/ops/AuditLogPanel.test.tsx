import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { AuditLogPanel } from './AuditLogPanel'
import type { AuditEntry } from '@/lib/types'

describe('AuditLogPanel', () => {
  it('renders empty state when entries is empty', () => {
    const html = renderToStaticMarkup(<AuditLogPanel entries={[]} />)
    expect(html).toContain('No audit entries yet.')
  })

  it('renders timestamp + user + action for each entry', () => {
    const entries: AuditEntry[] = [
      { timestamp: '2026-04-25T10:00:00Z', user: 'anish.d', action: 'create' },
      { timestamp: '2026-04-26T11:30:00Z', user: 'misba.m', action: 'update' },
    ]
    const html = renderToStaticMarkup(<AuditLogPanel entries={entries} />)
    expect(html).toContain('anish.d')
    expect(html).toContain('misba.m')
    expect(html).toContain('create')
    expect(html).toContain('update')
    expect(html).toMatch(/<ol[^>]*>/)
  })

  it('renders notes line when entry has notes', () => {
    const entries: AuditEntry[] = [
      { timestamp: '2026-04-25T10:00:00Z', user: 'system', action: 'auto-link-exact-match', notes: 'Linked via Pune match' },
    ]
    const html = renderToStaticMarkup(<AuditLogPanel entries={entries} />)
    expect(html).toContain('Linked via Pune match')
  })

  it('renders <details>/<summary> when entry has before/after diff', () => {
    const entries: AuditEntry[] = [
      {
        timestamp: '2026-04-25T10:00:00Z',
        user: 'ameet.z',
        action: 'p2-override',
        before: { overrideEvent: null },
        after: { overrideEvent: { reason: 'r' } },
      },
    ]
    const html = renderToStaticMarkup(<AuditLogPanel entries={entries} />)
    expect(html).toContain('<details')
    expect(html).toContain('<summary')
    expect(html).toContain('Show before / after')
    expect(html).toContain('Before')
    expect(html).toContain('After')
  })

  it('does NOT render <details> when entry has no before/after', () => {
    const entries: AuditEntry[] = [
      { timestamp: '2026-04-25T10:00:00Z', user: 'system', action: 'create' },
    ]
    const html = renderToStaticMarkup(<AuditLogPanel entries={entries} />)
    expect(html).not.toContain('<details')
  })

  it('container has max-h-96 with overflow scroll (Phase 1 scale guard)', () => {
    const entries: AuditEntry[] = [
      { timestamp: '2026-04-25T10:00:00Z', user: 'a', action: 'create' },
    ]
    const html = renderToStaticMarkup(<AuditLogPanel entries={entries} />)
    expect(html).toContain('max-h-96')
    expect(html).toContain('overflow-y-auto')
  })

  it('contains no raw hex codes (token discipline)', () => {
    const entries: AuditEntry[] = [
      {
        timestamp: '2026-04-25T10:00:00Z',
        user: 'a',
        action: 'p2-override',
        before: { x: 1 },
        after: { x: 2 },
        notes: 'n',
      },
    ]
    const html = renderToStaticMarkup(<AuditLogPanel entries={entries} />)
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,6}/)
  })
})
