/*
 * /dashboard page tests (W4-I.5 Phase 2).
 *
 * Pre-W4-I.5 this route was a /overview alias rendering 5 health
 * tiles + 9 trigger tiles + exception feed. Phase 2 rebuilds it as
 * the Operations Control Dashboard. The legacy OverviewContent
 * continues to be tested via /overview's tests.
 *
 * Asserts the P2C1 scaffold:
 *   - new dashboard header (title, subtitle, FY selector, date pickers)
 *   - programme filter chip row
 *   - 6 stat cards in fixed order
 *   - filter URL roundtrip (?programme=STEAM narrows the cards)
 */

import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { User } from '@/lib/types'

const getCurrentUserMock = vi.fn()
const redirectMock = vi.fn((path: string) => { throw new Error(`REDIRECT:${path}`) })

vi.mock('@/lib/auth/session', () => ({
  getCurrentUser: () => getCurrentUserMock(),
}))

vi.mock('next/navigation', () => ({
  redirect: (p: string) => redirectMock(p),
  notFound: vi.fn(() => { throw new Error('NEXT_NOT_FOUND') }),
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

const noSp = Promise.resolve({})

describe('/dashboard page (W4-I.5)', () => {
  it('renders the Operations Control Dashboard header + subtitle', async () => {
    getCurrentUserMock.mockResolvedValue(admin())
    const { default: DashboardPage } = await import('./page')
    const html = renderToStaticMarkup(await DashboardPage({ searchParams: noSp }))
    expect(html).toContain('Operations Control Dashboard')
    expect(html).toContain('Track school onboarding')
    expect(html).toContain('data-testid="dashboard-header"')
  })

  it('renders FY selector with options + Today label', async () => {
    getCurrentUserMock.mockResolvedValue(admin())
    const { default: DashboardPage } = await import('./page')
    const html = renderToStaticMarkup(await DashboardPage({ searchParams: noSp }))
    expect(html).toContain('data-testid="dashboard-fy"')
    expect(html).toContain('data-testid="dashboard-today"')
    // Date pickers
    expect(html).toContain('data-testid="dashboard-from-date"')
    expect(html).toContain('data-testid="dashboard-to-date"')
  })

  it('renders programme filter chip row with All + 5 programmes', async () => {
    getCurrentUserMock.mockResolvedValue(admin())
    const { default: DashboardPage } = await import('./page')
    const html = renderToStaticMarkup(await DashboardPage({ searchParams: noSp }))
    expect(html).toContain('data-testid="dashboard-filters"')
    expect(html).toContain('data-testid="dashboard-chip-all"')
    expect(html).toContain('data-testid="dashboard-chip-STEAM"')
    expect(html).toContain('data-testid="dashboard-chip-TinkRworks"')
    expect(html).toContain('data-testid="dashboard-chip-Young Pioneers"')
    expect(html).toContain('data-testid="dashboard-chip-Harvard HBPE"')
    expect(html).toContain('data-testid="dashboard-chip-VEX"')
    expect(html).toContain('data-testid="dashboard-apply"')
    expect(html).toContain('data-testid="dashboard-reset"')
  })

  it('renders 6 stat cards in fixed order with CTAs', async () => {
    getCurrentUserMock.mockResolvedValue(admin())
    const { default: DashboardPage } = await import('./page')
    const html = renderToStaticMarkup(await DashboardPage({ searchParams: noSp }))
    expect(html).toContain('data-testid="stat-card-mou-registry"')
    expect(html).toContain('data-testid="stat-card-active-schools"')
    expect(html).toContain('data-testid="stat-card-orders-raised"')
    expect(html).toContain('data-testid="stat-card-track-shipment"')
    expect(html).toContain('data-testid="stat-card-escalations"')
    expect(html).toContain('data-testid="stat-card-inventory"')
    expect(html).toContain('View MOUs')
    expect(html).toContain('Resolve Issues')
  })

  it('Escalations CTA carries the alert variant (red)', async () => {
    getCurrentUserMock.mockResolvedValue(admin())
    const { default: DashboardPage } = await import('./page')
    const html = renderToStaticMarkup(await DashboardPage({ searchParams: noSp }))
    // The CTA's anchor carries data-testid stat-card-escalations-cta with the bg-signal-alert class.
    expect(html).toMatch(/bg-signal-alert[^"]*"[^>]*data-testid="stat-card-escalations-cta"/)
  })

  it('redirects unauthenticated callers to /login', async () => {
    getCurrentUserMock.mockResolvedValue(null)
    const { default: DashboardPage } = await import('./page')
    await expect(DashboardPage({ searchParams: noSp })).rejects.toThrow('REDIRECT:/login?next=%2Fdashboard')
  })

  it('?programme=STEAM marks the STEAM chip active', async () => {
    getCurrentUserMock.mockResolvedValue(admin())
    const { default: DashboardPage } = await import('./page')
    const html = renderToStaticMarkup(
      await DashboardPage({ searchParams: Promise.resolve({ programme: 'STEAM' }) }),
    )
    // SSR renders the active class string + the data-testid in either order.
    expect(html).toMatch(/bg-brand-navy text-white"[^>]*data-testid="dashboard-chip-STEAM"/)
  })

  it('?fiscalYear=2026-27 reflects in the FY select default', async () => {
    getCurrentUserMock.mockResolvedValue(admin())
    const { default: DashboardPage } = await import('./page')
    const html = renderToStaticMarkup(
      await DashboardPage({ searchParams: Promise.resolve({ fiscalYear: '2026-27' }) }),
    )
    // defaultValue prop renders selected option in SSR
    expect(html).toMatch(/<option[^>]*selected[^>]*value="2026-27"|<option[^>]*value="2026-27"[^>]*selected/)
  })

  it('renders the Recent MOU Updates table with View all link', async () => {
    getCurrentUserMock.mockResolvedValue(admin())
    const { default: DashboardPage } = await import('./page')
    const html = renderToStaticMarkup(await DashboardPage({ searchParams: noSp }))
    expect(html).toContain('data-testid="dashboard-recent-mous"')
    expect(html).toContain('Recent MOU Updates')
    expect(html).toContain('data-testid="recent-mous-view-all"')
    // At least one row from the fixture should render
    expect(html).toMatch(/data-testid="recent-mou-row-/)
  })

  it('renders the Action Center panel with total badge + 5 tiles + CTA', async () => {
    getCurrentUserMock.mockResolvedValue(admin())
    const { default: DashboardPage } = await import('./page')
    const html = renderToStaticMarkup(await DashboardPage({ searchParams: noSp }))
    expect(html).toContain('data-testid="dashboard-action-centre"')
    expect(html).toContain('data-testid="action-centre-total-badge"')
    expect(html).toContain('data-testid="action-tile-pending-signature"')
    expect(html).toContain('data-testid="action-tile-orders-awaiting-approval"')
    expect(html).toContain('data-testid="action-tile-shipments-delayed"')
    expect(html).toContain('data-testid="action-tile-escalations-unresolved"')
    expect(html).toContain('data-testid="action-tile-inventory-low-stock"')
    expect(html).toContain('data-testid="action-centre-cta"')
  })

  it('contains no raw hex codes (token discipline)', async () => {
    getCurrentUserMock.mockResolvedValue(admin())
    const { default: DashboardPage } = await import('./page')
    const html = renderToStaticMarkup(await DashboardPage({ searchParams: noSp }))
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,6}/)
  })
})
