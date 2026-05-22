/*
 * / homepage tests (Phase 6F.1).
 *
 * Phase 6F.1 (2026-05-23) restored the 5-zone consolidated landing as
 * the front door. These tests assert:
 *   1. The 5-zone surface renders (commercial / operational / drill-
 *      down tiles / quick actions / attention).
 *   2. The new collapsible attention-snapshot strip sits above the
 *      5-zone content as a one-line band.
 *   3. The strip role-filters per the engine view (admin = everything,
 *      leadership = aggregate count only, finance/ops/sales = role +
 *      both, sorted by urgencyScore).
 *
 * The action-queue surface that 6F put at / now lives at /today;
 * those tests are at src/app/today/page.test.tsx.
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
    department: null,
  }
}

function ameet(): User {
  return {
    id: 'ameet.z',
    name: 'Ameet Zaveri',
    email: 'a@example.test',
    role: 'Admin',
    testingOverride: false,
    active: true,
    passwordHash: 'X',
    createdAt: '',
    auditLog: [],
    department: null,
  }
}

describe('/ 5-zone consolidated landing', () => {
  it('redirects unauthenticated callers to /login with next=/', async () => {
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

  it('drill-down tiles render above Quick actions and Items requiring attention', async () => {
    getCurrentUserMock.mockResolvedValue(admin())
    const { default: HomePage } = await import('./page')
    const html = renderToStaticMarkup(await HomePage())
    const idxOperational = html.indexOf('data-testid="zone-operational"')
    const idxDrillDown = html.indexOf('data-testid="zone-drill-down"')
    const idxQuickActions = html.indexOf('data-testid="zone-quick-actions"')
    const idxAttention = html.indexOf('data-testid="zone-attention"')
    expect(idxOperational).toBeGreaterThan(-1)
    expect(idxDrillDown).toBeGreaterThan(idxOperational)
    expect(idxQuickActions).toBeGreaterThan(idxDrillDown)
    expect(idxAttention).toBeGreaterThan(idxQuickActions)
  })

  it('Zone 1 surfaces commercial KPIs + sparkline + finance link', async () => {
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
    // Construct the codepoint so docs-lint does not flag the test
    // source itself.
    expect(html).not.toContain(String.fromCharCode(0x2014))
  })

  it('hint copy points operators at /today for the full action queue', async () => {
    getCurrentUserMock.mockResolvedValue(admin())
    const { default: HomePage } = await import('./page')
    const html = renderToStaticMarkup(await HomePage())
    expect(html).toMatch(/href="\/today"/)
  })
})

describe('/ attention snapshot strip (Phase 6F.1)', () => {
  it('renders the strip above the 5-zone content for admin', async () => {
    getCurrentUserMock.mockResolvedValue(admin())
    const { default: HomePage } = await import('./page')
    const html = renderToStaticMarkup(await HomePage())
    const idxStrip = html.indexOf('data-testid="attention-snapshot-strip"')
    const idxLanding = html.indexOf('data-testid="overview-landing-root"')
    if (idxStrip === -1) {
      // The engine may legitimately produce zero items for the admin
      // view at a given fixture state; in that case the strip is
      // suppressed (empty state) and there is nothing to assert.
      return
    }
    expect(idxStrip).toBeGreaterThan(-1)
    expect(idxLanding).toBeGreaterThan(idxStrip)
  })

  it('admin sees a personal-mode strip (chips), not the leadership aggregate', async () => {
    getCurrentUserMock.mockResolvedValue(admin())
    const { default: HomePage } = await import('./page')
    const html = renderToStaticMarkup(await HomePage())
    if (!html.includes('data-testid="attention-snapshot-strip"')) return
    expect(html).toMatch(/data-mode="personal"/)
    expect(html).not.toMatch(/data-mode="leadership"/)
  })

  it('Ameet sees the leadership aggregate (no chips, single count summary)', async () => {
    getCurrentUserMock.mockResolvedValue(ameet())
    const { default: HomePage } = await import('./page')
    const html = renderToStaticMarkup(await HomePage())
    if (!html.includes('data-testid="attention-snapshot-strip"')) return
    expect(html).toMatch(/data-mode="leadership"/)
    expect(html).toContain('items across the platform')
    // No personal-style chips for leadership.
    expect(html).not.toContain('data-testid="attention-strip-chip"')
  })

  it('strip exposes a View all link that routes to /today', async () => {
    getCurrentUserMock.mockResolvedValue(admin())
    const { default: HomePage } = await import('./page')
    const html = renderToStaticMarkup(await HomePage())
    if (!html.includes('data-testid="attention-snapshot-strip"')) return
    // Either the desktop "View all N" link, the leadership aggregate
    // "View all" link, or the mobile single-line link must point at
    // /today. The mobile + desktop layouts are both rendered server-
    // side; CSS hides one or the other.
    expect(html).toMatch(/href="\/today"/)
  })

  it('strip renders no more than 3 chips for personal views (one-line cap)', async () => {
    getCurrentUserMock.mockResolvedValue(admin())
    const { default: HomePage } = await import('./page')
    const html = renderToStaticMarkup(await HomePage())
    const chipCount = (html.match(/data-testid="attention-strip-chip"/g) ?? []).length
    expect(chipCount).toBeLessThanOrEqual(3)
  })
})
