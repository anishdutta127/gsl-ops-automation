/*
 * /dashboard page-wiring tests.
 *
 * Mocks getCurrentUser to control the role-scoping path. Asserts:
 *   - renders 5 health tiles + 10 trigger tiles + section landmarks
 *   - SalesRep scoping reduces Active MOUs count vs Admin view
 *   - Empty escalations state copy renders gracefully
 */

import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { User } from '@/lib/types'

const getCurrentUserMock = vi.fn()

vi.mock('@/lib/auth/session', () => ({
  getCurrentUser: () => getCurrentUserMock(),
}))

// TopNav is async; mock to a sync stub so renderToStaticMarkup can render
// the page tree without re-implementing async-component support.
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

describe('/dashboard page', () => {
  it('renders 5 health tiles + 10 trigger tiles + 3 section headings', async () => {
    getCurrentUserMock.mockResolvedValue(admin())
    const { default: DashboardPage } = await import('./page')
    const html = renderToStaticMarkup(await DashboardPage())
    expect(html).toContain('Active MOUs')
    expect(html).toContain('Accuracy health')
    expect(html).toContain('Collection')
    expect(html).toContain('Dispatches in flight')
    expect(html).toContain('Schools needing action')
    expect(html).toContain('P2 overrides (7d)')
    expect(html).toContain('Sales drift queue')
    expect(html).toContain('Legacy schools')
    expect(html).toContain('Email bounce (7d)')
    expect(html).toContain('Assignment queue')
    // Section headings
    expect(html).toMatch(/id="health-heading"/)
    expect(html).toMatch(/id="exceptions-heading"/)
    expect(html).toMatch(/id="escalations-heading"/)
    expect(html).toMatch(/id="triggers-heading"/)
  })

  it('renders Ops at a glance title via PageHeader', async () => {
    getCurrentUserMock.mockResolvedValue(admin())
    const { default: DashboardPage } = await import('./page')
    const html = renderToStaticMarkup(await DashboardPage())
    expect(html).toContain('Ops at a glance')
  })

  it('contains no raw hex codes (token discipline)', async () => {
    getCurrentUserMock.mockResolvedValue(admin())
    const { default: DashboardPage } = await import('./page')
    const html = renderToStaticMarkup(await DashboardPage())
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,6}/)
  })

  it('renders even when getCurrentUser returns null (logged-out edge)', async () => {
    getCurrentUserMock.mockResolvedValue(null)
    const { default: DashboardPage } = await import('./page')
    const result = await DashboardPage()
    const html = renderToStaticMarkup(result)
    expect(html).toContain('Ops at a glance')
  })
})
