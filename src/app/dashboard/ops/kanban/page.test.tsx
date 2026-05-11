/*
 * /dashboard/ops/kanban page tests (Gate 4.95 Session 3 Step 6).
 *
 * Verifies the workflow Kanban renders the 6 columns, the filter rail,
 * the page chrome (header + subtitle), and that URL filters narrow
 * the rendered cards. British English copy is asserted (no em-dash);
 * token discipline is asserted (no raw hex codes in the markup).
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
  useRouter: vi.fn(() => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  })),
  useSearchParams: vi.fn(() => new URLSearchParams()),
  usePathname: vi.fn(() => '/dashboard/ops/kanban'),
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

describe('/dashboard/ops/kanban Workflow Kanban view (Gate 4.95 Session 3 Step 6)', () => {
  it('redirects unauthenticated callers to /login', async () => {
    getCurrentUserMock.mockResolvedValue(null)
    const { default: Page } = await import('./page')
    await expect(Page({ searchParams: noSp })).rejects.toThrow(
      'REDIRECT:/login?next=%2Fdashboard%2Fops%2Fkanban',
    )
  })

  it('renders the page header "Workflow Kanban view" + subtitle copy', async () => {
    getCurrentUserMock.mockResolvedValue(admin())
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(await Page({ searchParams: noSp }))
    expect(html).toContain('Workflow Kanban view')
    expect(html).toContain('Track active dispatches by stage.')
    expect(html).toContain('data-testid="ops-kanban-page"')
    expect(html).toContain('data-testid="ops-kanban-subtitle"')
  })

  it('renders all 6 column testids in canonical order', async () => {
    getCurrentUserMock.mockResolvedValue(admin())
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(await Page({ searchParams: noSp }))
    expect(html).toContain('data-testid="kanban-column-awaiting-actuals"')
    expect(html).toContain('data-testid="kanban-column-allocation-in-progress"')
    expect(html).toContain('data-testid="kanban-column-pending-sales-approval"')
    expect(html).toContain('data-testid="kanban-column-ready-for-dispatch"')
    expect(html).toContain('data-testid="kanban-column-in-transit"')
    expect(html).toContain('data-testid="kanban-column-delivered"')
    // Canonical order: awaiting first, delivered last.
    const idxAwaiting = html.indexOf('kanban-column-awaiting-actuals')
    const idxDelivered = html.indexOf('kanban-column-delivered')
    expect(idxAwaiting).toBeLessThan(idxDelivered)
  })

  it('renders the filter rail testid + Apply + Reset + programme chips', async () => {
    getCurrentUserMock.mockResolvedValue(admin())
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(await Page({ searchParams: noSp }))
    expect(html).toContain('data-testid="ops-kanban-filter-rail"')
    expect(html).toContain('data-testid="kanban-filter-apply"')
    expect(html).toContain('data-testid="kanban-filter-reset"')
    expect(html).toContain('data-testid="kanban-chip-programme-STEAM"')
    expect(html).toContain('data-testid="kanban-chip-programme-Young Pioneers"')
    expect(html).toContain('data-testid="kanban-chip-programme-Harvard HBPE"')
    expect(html).toContain('data-testid="kanban-chip-programme-Robotics"')
    expect(html).toContain('data-testid="kanban-chip-super-NE"')
    expect(html).toContain('data-testid="kanban-chip-super-SW"')
    expect(html).toContain('data-testid="kanban-chip-region-East"')
    expect(html).toContain('data-testid="kanban-input-from"')
    expect(html).toContain('data-testid="kanban-input-to"')
    expect(html).toContain('data-testid="kanban-select-sales-rep"')
    expect(html).toContain('data-testid="kanban-select-ops-owner"')
  })

  it('renders the mobile accordion structure', async () => {
    getCurrentUserMock.mockResolvedValue(admin())
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(await Page({ searchParams: noSp }))
    expect(html).toContain('data-testid="kanban-accordion-awaiting-actuals"')
    expect(html).toContain('data-testid="kanban-accordion-delivered"')
  })

  it('renders at least one kanban card from the fixture set', async () => {
    getCurrentUserMock.mockResolvedValue(admin())
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(await Page({ searchParams: noSp }))
    // Fixture has 100+ active MOUs and no kit dispatches at this commit,
    // so every active MOU buckets into 'awaiting-actuals'.
    expect(html).toMatch(/data-testid="kanban-card-/)
  })

  it('?p=Robotics programme filter narrows the rendered cards to zero (no Robotics in fixture)', async () => {
    getCurrentUserMock.mockResolvedValue(admin())
    const { default: Page } = await import('./page')
    const allHtml = renderToStaticMarkup(await Page({ searchParams: noSp }))
    const filteredHtml = renderToStaticMarkup(
      await Page({ searchParams: Promise.resolve({ p: 'Robotics' }) }),
    )
    const allCount = (allHtml.match(/data-testid="kanban-card-/g) ?? []).length
    const filteredCount =
      (filteredHtml.match(/data-testid="kanban-card-/g) ?? []).length
    // Robotics has zero MOUs in the active fixture, so the programme filter
    // should knock the card count down to zero while the unfiltered view
    // still renders cards.
    expect(allCount).toBeGreaterThan(0)
    expect(filteredCount).toBe(0)
  })

  it('?p=STEAM marks the STEAM programme chip as pressed', async () => {
    getCurrentUserMock.mockResolvedValue(admin())
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(
      await Page({ searchParams: Promise.resolve({ p: 'STEAM' }) }),
    )
    // The pressed chip carries aria-pressed="true" via the client-side state
    // initialised from initialProgrammes.
    expect(html).toMatch(
      /data-testid="kanban-chip-programme-STEAM"[^>]*aria-pressed="true"|aria-pressed="true"[^>]*data-testid="kanban-chip-programme-STEAM"/,
    )
  })

  it('contains no em-dash characters (British English copy)', async () => {
    getCurrentUserMock.mockResolvedValue(admin())
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(await Page({ searchParams: noSp }))
    expect(html).not.toContain(String.fromCharCode(0x2014))
  })

  it('contains no raw hex codes (token discipline)', async () => {
    getCurrentUserMock.mockResolvedValue(admin())
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(await Page({ searchParams: noSp }))
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,6}/)
  })

  it('does NOT add a second <main> element (single-main rule)', async () => {
    getCurrentUserMock.mockResolvedValue(admin())
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(await Page({ searchParams: noSp }))
    // The root layout owns the only <main>. This page wrapper must use
    // <div> or <section>, not <main>.
    expect(html).not.toMatch(/<main[\s>]/)
  })
})
