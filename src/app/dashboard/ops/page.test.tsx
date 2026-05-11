/*
 * /dashboard/ops page tests (Gate 3.6 Step 4 relocation).
 *
 * Pre-Gate-3.6 these tests targeted /. Gate 3.6 moves the
 * Operations Control Dashboard to /dashboard/ops and replaces /
 * with the consolidated landing. The dashboard composition
 * (header, filters, stat cards, recent MOUs, action centre,
 * orders tracker, comm panel, templates, footer, and the kanban
 * CTA in the header) is unchanged.
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

describe('/dashboard/ops Operations Control Dashboard (Gate 3.6 Step 4)', () => {
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
    // Gate 2 §7.1: Programme reduced to 4 values; the dashboard
    // chip row drops TinkRworks + VEX in favour of Robotics. Sales
    // pipeline + sales team retain VEX as a SalesProgramme.
    expect(html).toContain('data-testid="dashboard-chip-all"')
    expect(html).toContain('data-testid="dashboard-chip-STEAM"')
    expect(html).toContain('data-testid="dashboard-chip-Young Pioneers"')
    expect(html).toContain('data-testid="dashboard-chip-Harvard HBPE"')
    expect(html).toContain('data-testid="dashboard-chip-Robotics"')
    expect(html).not.toContain('data-testid="dashboard-chip-TinkRworks"')
    expect(html).not.toContain('data-testid="dashboard-chip-VEX"')
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
    await expect(DashboardPage({ searchParams: noSp })).rejects.toThrow('REDIRECT:/login?next=%2Fdashboard%2Fops')
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

  it('renders the Orders and Shipment Tracker table', async () => {
    getCurrentUserMock.mockResolvedValue(admin())
    const { default: DashboardPage } = await import('./page')
    const html = renderToStaticMarkup(await DashboardPage({ searchParams: noSp }))
    expect(html).toContain('data-testid="dashboard-orders-tracker"')
    expect(html).toContain('Orders and Shipment Tracker')
    expect(html).toContain('data-testid="orders-tracker-view-all"')
    // Real fixture row: at least one dispatch exists
    expect(html).toMatch(/data-testid="orders-row-/)
  })

  it('renders the Communication Automation panel with 3 send buttons', async () => {
    getCurrentUserMock.mockResolvedValue(admin())
    const { default: DashboardPage } = await import('./page')
    const html = renderToStaticMarkup(await DashboardPage({ searchParams: noSp }))
    expect(html).toContain('data-testid="dashboard-communication-panel"')
    expect(html).toContain('Communication Automation')
    expect(html).toContain('data-testid="comm-button-welcome"')
    expect(html).toContain('data-testid="comm-button-thank-you"')
    expect(html).toContain('data-testid="comm-button-follow-up"')
    expect(html).toContain('Send Welcome Note')
    expect(html).toContain('Send Thank You Note')
    expect(html).toContain('Send Follow-up Email')
  })

  it('renders the Communication Templates section with 2 preview cards + Create CTA', async () => {
    getCurrentUserMock.mockResolvedValue(admin())
    const { default: DashboardPage } = await import('./page')
    const html = renderToStaticMarkup(await DashboardPage({ searchParams: noSp }))
    expect(html).toContain('data-testid="dashboard-templates"')
    expect(html).toContain('Communication Templates')
    expect(html).toContain('data-testid="template-card-welcome"')
    expect(html).toContain('data-testid="template-card-thank-you"')
    expect(html).toContain('data-testid="template-edit-welcome"')
    expect(html).toContain('data-testid="template-create-cta"')
    expect(html).toContain('Create new template')
  })

  it('W4-I.5 P3C5: Edit Template + Create new template render as functional links (Phase 3 wired)', async () => {
    getCurrentUserMock.mockResolvedValue(admin())
    const { default: DashboardPage } = await import('./page')
    const html = renderToStaticMarkup(await DashboardPage({ searchParams: noSp }))
    // Re-enabled from P2.1 disabled stubs now that /admin/templates exists.
    // Anchor attribute order in SSR: data-testid, class, href.
    expect(html).toMatch(/data-testid="template-edit-welcome"[^>]*href="\/admin\/templates\/TPL-WELCOME-DEFAULT\/edit"/)
    expect(html).toMatch(/data-testid="template-edit-thank-you"[^>]*href="\/admin\/templates\/TPL-THANK-YOU-DEFAULT\/edit"/)
    expect(html).toMatch(/data-testid="template-create-cta"[^>]*href="\/admin\/templates\/new"/)
    // Coming soon badges removed in P3C5.
    expect(html).not.toContain('data-testid="template-edit-welcome-coming-soon"')
    expect(html).not.toContain('data-testid="template-create-coming-soon"')
  })

  it('W4-I.5 P3C5: Communication Automation send buttons are functional links (Phase 3 wired)', async () => {
    getCurrentUserMock.mockResolvedValue(admin())
    const { default: DashboardPage } = await import('./page')
    const html = renderToStaticMarkup(await DashboardPage({ searchParams: noSp }))
    expect(html).toMatch(/data-testid="comm-button-welcome"[^>]*href="\/admin\/templates\?useCase=welcome"/)
    expect(html).toMatch(/data-testid="comm-button-thank-you"[^>]*href="\/admin\/templates\?useCase=thank-you"/)
    expect(html).toMatch(/data-testid="comm-button-follow-up"[^>]*href="\/admin\/templates\?useCase=follow-up"/)
    expect(html).not.toContain('data-testid="comm-button-welcome-coming-soon"')
  })

  it('Gate 3.5 Step 3: Sales Pipeline summary card is hidden from the dashboard', async () => {
    // Per Anish, the Sales module returns later; the Pipeline summary
    // block is removed from this dashboard until then. Component file
    // preserved for the un-hide path (docs/gate-3.5/HIDDEN_ROUTES.md).
    getCurrentUserMock.mockResolvedValue(admin())
    const { default: DashboardPage } = await import('./page')
    const html = renderToStaticMarkup(await DashboardPage({ searchParams: noSp }))
    expect(html).not.toContain('data-testid="dashboard-sales-pipeline-summary"')
    expect(html).not.toContain('data-testid="sales-pipeline-summary-cta"')
  })

  it('renders the dashboard footer + the Open Kanban Board CTA in the header', async () => {
    getCurrentUserMock.mockResolvedValue(admin())
    const { default: DashboardPage } = await import('./page')
    const html = renderToStaticMarkup(await DashboardPage({ searchParams: noSp }))
    expect(html).toContain('data-testid="dashboard-footer"')
    expect(html).toContain('Internal use only')
    expect(html).toContain('data-testid="dashboard-kanban-cta"')
    expect(html).toContain('MOU Pipeline')
  })

  it('contains no raw hex codes (token discipline)', async () => {
    getCurrentUserMock.mockResolvedValue(admin())
    const { default: DashboardPage } = await import('./page')
    const html = renderToStaticMarkup(await DashboardPage({ searchParams: noSp }))
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,6}/)
  })
})
