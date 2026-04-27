import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { User } from '@/lib/types'

const getCurrentUserMock = vi.fn()

vi.mock('@/lib/auth/session', () => ({
  getCurrentUser: () => getCurrentUserMock(),
}))
vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => { throw new Error(`REDIRECT:${url}`) }),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
}))
vi.mock('@/components/ops/TopNav', () => ({ TopNav: () => null }))

beforeEach(() => {
  vi.clearAllMocks()
})

function admin(): User {
  return {
    id: 'anish.d', name: 'Anish', email: 'a@example.test', role: 'Admin',
    testingOverride: false, active: true, passwordHash: 'X', createdAt: '', auditLog: [],
  }
}

function salesRep(): User {
  return {
    id: 'sp-vikram', name: 'Vikram', email: 'v@example.test', role: 'SalesRep',
    testingOverride: false, active: true, passwordHash: 'X', createdAt: '', auditLog: [],
  }
}

describe('/ kanban homepage', () => {
  it('renders 9 stage columns with the Pre-Ops Legacy column first', async () => {
    getCurrentUserMock.mockResolvedValue(admin())
    const { default: HomePage } = await import('./page')
    const html = renderToStaticMarkup(await HomePage())
    expect(html).toContain('data-testid="kanban-board"')
    expect(html).toContain('data-testid="stage-column-pre-ops"')
    expect(html).toContain('data-testid="stage-column-mou-signed"')
    expect(html).toContain('data-testid="stage-column-actuals-confirmed"')
    expect(html).toContain('data-testid="stage-column-cross-verification"')
    expect(html).toContain('data-testid="stage-column-invoice-raised"')
    expect(html).toContain('data-testid="stage-column-payment-received"')
    expect(html).toContain('data-testid="stage-column-kit-dispatched"')
    expect(html).toContain('data-testid="stage-column-delivery-acknowledged"')
    expect(html).toContain('data-testid="stage-column-feedback-submitted"')
  })

  it('Pre-Ops column uses the "Needs triage" badge framing rather than a numeric stage label', async () => {
    getCurrentUserMock.mockResolvedValue(admin())
    const { default: HomePage } = await import('./page')
    const html = renderToStaticMarkup(await HomePage())
    expect(html).toContain('Needs triage:')
  })

  it('renders MouCards inside columns from the real fixture', async () => {
    getCurrentUserMock.mockResolvedValue(admin())
    const { default: HomePage } = await import('./page')
    const html = renderToStaticMarkup(await HomePage())
    expect(html).toContain('data-testid="mou-card"')
    // Real fixture has MOU-STEAM-2627-001 at "Mutahhary Public School Baroo".
    expect(html).toContain('MOU-STEAM-2627-001')
  })

  it('SalesRep also sees the kanban (Phase 1 W3-B: UI gates disabled)', async () => {
    getCurrentUserMock.mockResolvedValue(salesRep())
    const { default: HomePage } = await import('./page')
    const html = renderToStaticMarkup(await HomePage())
    expect(html).toContain('data-testid="kanban-board"')
  })

  it('redirects unauthenticated viewer to /login with next=/', async () => {
    getCurrentUserMock.mockResolvedValue(null)
    const { default: HomePage } = await import('./page')
    await expect(HomePage()).rejects.toThrow('REDIRECT:/login?next=%2F')
  })

  it('contains no raw hex codes (token discipline)', async () => {
    getCurrentUserMock.mockResolvedValue(admin())
    const { default: HomePage } = await import('./page')
    const html = renderToStaticMarkup(await HomePage())
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,6}\b/)
  })

  it('column counts sum to total MOU count from fixture', async () => {
    getCurrentUserMock.mockResolvedValue(admin())
    const { default: HomePage } = await import('./page')
    const html = renderToStaticMarkup(await HomePage())
    // Title shows "<n> active MOUs across 9 stages" post-W4-A.3; the count
    // is the active-cohort filter result (51 in the W4-A.2 fixture).
    expect(html).toMatch(/\d+ active MOUs across 9 stages/)
  })

  it('renders the kanban / overview tab strip with Kanban active (W3-F)', async () => {
    getCurrentUserMock.mockResolvedValue(admin())
    const { default: HomePage } = await import('./page')
    const html = renderToStaticMarkup(await HomePage())
    expect(html).toContain('data-testid="kanban-overview-tabs"')
    expect(html).toContain('data-testid="tab-kanban"')
    expect(html).toContain('data-testid="tab-overview"')
    expect(html).toMatch(
      /data-testid="tab-kanban"[^>]*aria-current="page"|aria-current="page"[^>]*data-testid="tab-kanban"/,
    )
  })

  it('renders the click-vs-drag interaction hint above the kanban (W3-F.5)', async () => {
    getCurrentUserMock.mockResolvedValue(admin())
    const { default: HomePage } = await import('./page')
    const html = renderToStaticMarkup(await HomePage())
    expect(html).toContain('data-testid="kanban-interaction-hint"')
    expect(html).toContain('Click a card to open its details')
    expect(html).toContain('Drag the grip icon')
  })
})
