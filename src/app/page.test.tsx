/*
 * / consolidated landing tests (Gate 3.6).
 *
 * Pre-Gate-3.6 the / route hosted the Operations Control
 * Dashboard; that surface moved to /dashboard/ops and these
 * tests now exercise the new five-zone landing.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { User } from '@/lib/types'

const getCurrentUserMock = vi.fn()
const redirectMock = vi.fn((path: string) => {
  throw new Error(`REDIRECT:${path}`)
})

vi.mock('@/lib/auth/session', () => ({
  getCurrentUser: () => getCurrentUserMock(),
}))

vi.mock('next/navigation', () => ({
  redirect: (p: string) => redirectMock(p),
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND')
  }),
}))

vi.mock('@/components/ops/TopNav', () => ({
  TopNav: () => null,
}))

beforeEach(() => {
  vi.clearAllMocks()
})

function admin(): User {
  return {
    id: 'anish.d',
    name: 'Anish',
    email: 'a@example.test',
    role: 'Admin',
    testingOverride: false,
    active: true,
    passwordHash: 'X',
    createdAt: '',
    auditLog: [],
  }
}

describe('/ consolidated landing (Gate 3.6)', () => {
  it('redirects unauthenticated callers to /login', async () => {
    getCurrentUserMock.mockResolvedValue(null)
    const { default: HomePage } = await import('./page')
    await expect(HomePage()).rejects.toThrow('REDIRECT:/login?next=%2F')
  })

  it('renders header with platform name + user name', async () => {
    getCurrentUserMock.mockResolvedValue(admin())
    const { default: HomePage } = await import('./page')
    const html = renderToStaticMarkup(await HomePage())
    expect(html).toContain('GSL Ops Platform')
    expect(html).toContain('Welcome, Anish')
  })

  it('renders all five landing zones', async () => {
    getCurrentUserMock.mockResolvedValue(admin())
    const { default: HomePage } = await import('./page')
    const html = renderToStaticMarkup(await HomePage())
    expect(html).toContain('data-testid="zone-commercial"')
    expect(html).toContain('data-testid="zone-operational"')
    expect(html).toContain('data-testid="zone-attention"')
    expect(html).toContain('data-testid="zone-quick-actions"')
    expect(html).toContain('data-testid="zone-drill-down"')
  })

  it('Zone 1 surfaces 4 KPIs + sparkline + finance link', async () => {
    getCurrentUserMock.mockResolvedValue(admin())
    const { default: HomePage } = await import('./page')
    const html = renderToStaticMarkup(await HomePage())
    expect(html).toContain('Commercial position')
    expect(html).toContain('data-testid="kpi-signed-contract"')
    expect(html).toContain('data-testid="kpi-received"')
    expect(html).toContain('data-testid="kpi-outstanding"')
    expect(html).toContain('data-testid="kpi-active-schools"')
    expect(html).toContain('data-testid="commercial-sparkline"')
    expect(html).toMatch(
      /data-testid="commercial-finance-link"[^>]*href="\/dashboard\/finance"|href="\/dashboard\/finance"[^>]*data-testid="commercial-finance-link"/,
    )
  })

  it('Zone 2 surfaces pipeline-by-stage + in-transit + pending-allocation columns', async () => {
    getCurrentUserMock.mockResolvedValue(admin())
    const { default: HomePage } = await import('./page')
    const html = renderToStaticMarkup(await HomePage())
    expect(html).toContain('Operational position')
    // Gate 4 Step 1: first column now reads MOUs in pipeline by stage,
    // backed by the statusTracker.bucketByStage helper.
    expect(html).toMatch(/data-testid="op-pipeline-by-stage"[^>]*href="\/mous"/)
    expect(html).toContain('data-testid="stage-bar"')
    expect(html).toMatch(
      /data-testid="op-in-transit"[^>]*href="\/dispatch\?status=In\+Transit"/,
    )
    expect(html).toMatch(
      /data-testid="op-pending-allocation"[^>]*href="\/dispatch\/kits"/,
    )
    expect(html).toMatch(
      /data-testid="operational-ops-link"[^>]*href="\/dashboard\/ops"|href="\/dashboard\/ops"[^>]*data-testid="operational-ops-link"/,
    )
  })

  it('Zone 3 attention surfaces empty state or items, never both', async () => {
    getCurrentUserMock.mockResolvedValue(admin())
    const { default: HomePage } = await import('./page')
    const html = renderToStaticMarkup(await HomePage())
    expect(html).toContain('Items requiring attention')
    // Either the empty state or attention items render; the heading is
    // always present.
    const hasItems = /data-testid="attention-item-/.test(html)
    const hasEmpty = /data-testid="attention-empty"/.test(html)
    expect(hasItems || hasEmpty).toBe(true)
    expect(hasItems && hasEmpty).toBe(false)
  })

  it('Zone 4 quick actions strip carries 5 outlined buttons with correct hrefs', async () => {
    getCurrentUserMock.mockResolvedValue(admin())
    const { default: HomePage } = await import('./page')
    const html = renderToStaticMarkup(await HomePage())
    expect(html).toContain('Quick actions')
    expect(html).toMatch(/data-testid="quick-new-mou"[^>]*href="\/mous\/new"/)
    expect(html).toMatch(
      /data-testid="quick-match-payment"[^>]*href="\/finance\/payments\/unmatched"/,
    )
    expect(html).toMatch(
      /data-testid="quick-raise-dispatch"[^>]*href="\/dispatch\/kits"/,
    )
    expect(html).toMatch(
      /data-testid="quick-raise-escalation"[^>]*href="\/escalations\/new"/,
    )
    expect(html).toMatch(
      /data-testid="quick-generate-pi"[^>]*href="\/finance\/pi\/pending"/,
    )
  })

  it('Zone 5 renders Finance, Ops, Leadership tiles with KPI numbers', async () => {
    getCurrentUserMock.mockResolvedValue(admin())
    const { default: HomePage } = await import('./page')
    const html = renderToStaticMarkup(await HomePage())
    expect(html).toMatch(/data-testid="tile-finance"[^>]*href="\/dashboard\/finance"/)
    expect(html).toMatch(/data-testid="tile-ops"[^>]*href="\/dashboard\/ops"/)
    expect(html).toMatch(
      /data-testid="tile-leadership"[^>]*href="\/dashboard\/leadership"/,
    )
    expect(html).toContain('Finance health')
    expect(html).toContain('Operations')
    expect(html).toContain('Leadership view')
    expect(html).toContain('Outstanding')
    expect(html).toContain('PIs awaiting')
    expect(html).toContain('Active dispatches')
  })

  it('contains no raw hex codes (token discipline)', async () => {
    getCurrentUserMock.mockResolvedValue(admin())
    const { default: HomePage } = await import('./page')
    const html = renderToStaticMarkup(await HomePage())
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,6}/)
  })

  it('contains no em-dash characters', async () => {
    getCurrentUserMock.mockResolvedValue(admin())
    const { default: HomePage } = await import('./page')
    const html = renderToStaticMarkup(await HomePage())
    // Construct the em-dash from its codepoint so this test file itself
    // doesn't trip the docs-lint em-dash-zero rule.
    expect(html).not.toContain('\u2014')
  })
})
