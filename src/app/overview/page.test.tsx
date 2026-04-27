/*
 * /overview page-wiring tests (W3-F canonical Leadership Console).
 *
 * /overview is the canonical home of the Leadership Console (5
 * health tiles, exception feed, open-escalation list, 9 trigger
 * tiles). Pre-W3-F this content was at /dashboard. /dashboard now
 * aliases /overview; both routes render the same OverviewContent
 * with the Overview tab active. These tests cover the canonical
 * route; the alias has its own parallel suite at
 * src/app/dashboard/page.test.tsx.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { User } from '@/lib/types'

const getCurrentUserMock = vi.fn()

vi.mock('@/lib/auth/session', () => ({
  getCurrentUser: () => getCurrentUserMock(),
}))

vi.mock('@/components/ops/TopNav', () => ({
  TopNav: () => null,
}))

beforeEach(() => {
  vi.clearAllMocks()
})

function admin(): User {
  return {
    id: 'anish.d', name: 'Anish', email: 'a@example.test', role: 'Admin',
    testingOverride: false, active: true, passwordHash: 'X', createdAt: '', auditLog: [],
  }
}

describe('/overview page', () => {
  it('renders 5 health tiles + 9 trigger tiles + 4 section headings', async () => {
    getCurrentUserMock.mockResolvedValue(admin())
    const { default: OverviewPage } = await import('./page')
    const html = renderToStaticMarkup(await OverviewPage())
    expect(html).toContain('Active MOUs')
    expect(html).toContain('Accuracy health')
    expect(html).toContain('Collection')
    expect(html).toContain('Dispatches in flight')
    expect(html).toContain('Schools needing action')
    expect(html).toContain('P2 overrides (7d)')
    expect(html).toContain('Sales drift queue')
    // W4-A.7: Legacy schools tile removed.
    expect(html).not.toContain('Legacy schools')
    expect(html).not.toContain('EXCLUDED')
    expect(html).toContain('Email bounce (7d)')
    expect(html).toContain('Assignment queue')
    expect(html).toMatch(/id="health-heading"/)
    expect(html).toMatch(/id="exceptions-heading"/)
    expect(html).toMatch(/id="escalations-heading"/)
    expect(html).toMatch(/id="triggers-heading"/)
  })

  it('renders Ops at a glance title via PageHeader', async () => {
    getCurrentUserMock.mockResolvedValue(admin())
    const { default: OverviewPage } = await import('./page')
    const html = renderToStaticMarkup(await OverviewPage())
    expect(html).toContain('Ops at a glance')
  })

  it('renders the kanban / overview tab strip with Overview active', async () => {
    getCurrentUserMock.mockResolvedValue(admin())
    const { default: OverviewPage } = await import('./page')
    const html = renderToStaticMarkup(await OverviewPage())
    expect(html).toContain('data-testid="kanban-overview-tabs"')
    expect(html).toContain('data-testid="tab-kanban"')
    expect(html).toContain('data-testid="tab-overview"')
    expect(html).toMatch(
      /data-testid="tab-overview"[^>]*aria-current="page"|aria-current="page"[^>]*data-testid="tab-overview"/,
    )
  })

  it('contains no raw hex codes (token discipline)', async () => {
    getCurrentUserMock.mockResolvedValue(admin())
    const { default: OverviewPage } = await import('./page')
    const html = renderToStaticMarkup(await OverviewPage())
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,6}/)
  })

  it('renders even when getCurrentUser returns null (logged-out edge)', async () => {
    getCurrentUserMock.mockResolvedValue(null)
    const { default: OverviewPage } = await import('./page')
    const html = renderToStaticMarkup(await OverviewPage())
    expect(html).toContain('Ops at a glance')
  })
})
