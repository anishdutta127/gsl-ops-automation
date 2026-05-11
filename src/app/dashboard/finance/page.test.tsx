/*
 * Gate 4.95 Session 2: Finance dashboard rebuild tests.
 *
 * Asserts the full Gate 4.95 layout renders: filter bar, KPI strip,
 * high-priority alerts, top overdue + renewal panels, amount receipt
 * summary, VEX kit orders, programme breakdown, plus the preserved
 * two-card middle layout and the Tally footer.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

const getCurrentUserMock = vi.fn()
const redirectMock = vi.fn((path: string) => {
  throw new Error(`REDIRECT:${path}`)
})

vi.mock('@/lib/auth/session', () => ({
  getCurrentUser: () => getCurrentUserMock(),
}))

vi.mock('next/navigation', () => ({
  redirect: (p: string) => redirectMock(p),
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/dashboard/finance',
}))

vi.mock('@/components/ops/TopNav', () => ({
  TopNav: () => null,
}))

beforeEach(() => {
  vi.clearAllMocks()
  getCurrentUserMock.mockResolvedValue({
    id: 'finance-test',
    name: 'Finance Test',
    email: 'finance@example.test',
    role: 'Finance',
    department: 'finance',
    testingOverride: false,
    active: true,
    passwordHash: 'X',
    createdAt: '2026-04-01T00:00:00Z',
    auditLog: [],
  })
})

describe('FinanceDashboard rebuild (Gate 4.95 Session 2)', () => {
  it('redirects unauthenticated callers to /login', async () => {
    getCurrentUserMock.mockResolvedValue(null)
    const { default: FinanceDashboard } = await import('./page')
    await expect(FinanceDashboard({ searchParams: {} })).rejects.toThrow(
      'REDIRECT:/login?next=%2Fdashboard%2Ffinance',
    )
  })

  it('renders the page shell + header + subtitle', async () => {
    const { default: FinanceDashboard } = await import('./page')
    const html = renderToStaticMarkup(await FinanceDashboard({ searchParams: {} }))
    expect(html).toContain('data-testid="finance-dashboard"')
    expect(html).toContain('Finance workspace')
    expect(html).toMatch(/<p class="[^"]*">As of \d{4}-\d{2}-\d{2}<\/p>/)
  })

  it('renders the filter bar', async () => {
    const { default: FinanceDashboard } = await import('./page')
    const html = renderToStaticMarkup(await FinanceDashboard({ searchParams: {} }))
    expect(html).toContain('data-testid="finance-filter-bar"')
  })

  it('renders the KPI strip with 4 testids', async () => {
    const { default: FinanceDashboard } = await import('./page')
    const html = renderToStaticMarkup(await FinanceDashboard({ searchParams: {} }))
    expect(html).toContain('data-testid="kpi-active-mous"')
    expect(html).toContain('data-testid="kpi-contract-value"')
    expect(html).toContain('data-testid="kpi-collected"')
    expect(html).toContain('data-testid="kpi-open-alerts"')
  })

  it('renders the high-priority alerts panel', async () => {
    const { default: FinanceDashboard } = await import('./page')
    const html = renderToStaticMarkup(await FinanceDashboard({ searchParams: {} }))
    expect(html).toContain('data-testid="high-priority-alerts-panel"')
  })

  it('renders the top-overdue + renewal panels', async () => {
    const { default: FinanceDashboard } = await import('./page')
    const html = renderToStaticMarkup(await FinanceDashboard({ searchParams: {} }))
    expect(html).toContain('data-testid="top-overdue-payments-panel"')
    expect(html).toContain('data-testid="renewal-needed-panel"')
  })

  it('renders the amount receipt summary + VEX kit orders + programme breakdown', async () => {
    const { default: FinanceDashboard } = await import('./page')
    const html = renderToStaticMarkup(await FinanceDashboard({ searchParams: {} }))
    expect(html).toContain('data-testid="amount-receipt-summary"')
    expect(html).toContain('data-testid="vex-kit-orders-tile"')
    expect(html).toContain('data-testid="programme-breakdown"')
  })

  it('preserves the existing two-card layout (Payments + PIs)', async () => {
    const { default: FinanceDashboard } = await import('./page')
    const html = renderToStaticMarkup(await FinanceDashboard({ searchParams: {} }))
    expect(html).toContain('data-testid="payments-attention-card"')
    expect(html).toContain('data-testid="pis-awaiting-card"')
  })

  it('renders the Tally export footer CTA', async () => {
    const { default: FinanceDashboard } = await import('./page')
    const html = renderToStaticMarkup(await FinanceDashboard({ searchParams: {} }))
    expect(html).toContain('data-testid="tally-export-cta"')
    expect(html).toMatch(/Last Tally export:/)
  })

  it('contains no em-dash characters (British English copy)', async () => {
    const { default: FinanceDashboard } = await import('./page')
    const html = renderToStaticMarkup(await FinanceDashboard({ searchParams: {} }))
    // Construct em-dash from its codepoint so this test file doesn't
    // trip the docs-lint em-dash-zero rule on itself.
    expect(html).not.toContain(String.fromCharCode(0x2014))
  })

  it('contains no raw hex colour codes (token discipline)', async () => {
    const { default: FinanceDashboard } = await import('./page')
    const html = renderToStaticMarkup(await FinanceDashboard({ searchParams: {} }))
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,6}/)
  })
})
