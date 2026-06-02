import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { User } from '@/lib/types'

// vitest.setup.ts ships a global TopNav mock so page tests do not have to
// re-add it per-file. This suite tests TopNav itself; un-mock to restore
// the real implementation.
vi.unmock('@/components/ops/TopNav')

// QueueFreshnessIndicator is an async Server Component (reads JSON at
// request time); renderToStaticMarkup cannot resolve nested async
// Server Components, so stub it. It has its own dedicated test file.
vi.mock('@/components/ops/QueueFreshnessIndicator', () => ({
  QueueFreshnessIndicator: () => null,
}))

// The sidebar components (SidebarDesktop / SidebarMobile) read the live
// pathname via usePathname. Drive it from a hoisted ref so each test can
// assert active highlighting for a chosen route.
const { pathRef } = vi.hoisted(() => ({ pathRef: { current: '/' } }))
vi.mock('next/navigation', () => ({
  usePathname: () => pathRef.current,
}))

const getCurrentUserMock = vi.fn()
vi.mock('@/lib/auth/session', () => ({
  getCurrentUser: () => getCurrentUserMock(),
}))

beforeEach(() => {
  vi.clearAllMocks()
  pathRef.current = '/'
})

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'anish.d',
    name: 'Anish Dutta',
    email: 'anish.d@example.test',
    role: 'Admin',
    department: null,
    testingOverride: false,
    active: true,
    passwordHash: 'X',
    createdAt: '',
    auditLog: [],
    ...overrides,
  }
}

async function renderNav(path = '/'): Promise<string> {
  pathRef.current = path
  const { TopNav } = await import('./TopNav')
  return renderToStaticMarkup(await TopNav({ currentPath: path }))
}

describe('TopNav shell: top utility bar', () => {
  it('renders the GSL Ops wordmark linking to /', async () => {
    getCurrentUserMock.mockResolvedValue(makeUser())
    const html = await renderNav()
    expect(html).toMatch(/data-testid="topnav-wordmark"[^>]*href="\/"/)
    expect(html).toContain('GSL Ops')
  })

  it('renders the command-palette placeholder (non-functional, disabled)', async () => {
    getCurrentUserMock.mockResolvedValue(makeUser())
    const html = await renderNav()
    expect(html).toContain('data-testid="command-palette-placeholder"')
    expect(html).toMatch(
      /disabled[^>]*data-testid="command-palette-placeholder"|data-testid="command-palette-placeholder"[^>]*disabled/,
    )
  })

  it('renders the Sign out button posting to /api/logout', async () => {
    getCurrentUserMock.mockResolvedValue(makeUser())
    const html = await renderNav()
    expect(html).toContain('action="/api/logout"')
    expect(html).toContain('Sign out')
  })

  it('renders the mobile nav trigger', async () => {
    getCurrentUserMock.mockResolvedValue(makeUser())
    const html = await renderNav()
    expect(html).toContain('data-testid="topnav-mobile-trigger"')
  })

  it('contains no raw hex codes (token discipline)', async () => {
    getCurrentUserMock.mockResolvedValue(makeUser())
    const html = await renderNav()
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,6}/)
  })
})

describe('TopNav shell: left-nav zones and items', () => {
  it('renders the five zones', async () => {
    getCurrentUserMock.mockResolvedValue(makeUser())
    const html = await renderNav()
    for (const zone of [
      'nav-zone-watch',
      'nav-zone-finance',
      'nav-zone-operations',
      'nav-zone-records',
      'nav-zone-admin',
    ]) {
      expect(html).toContain(`data-testid="${zone}"`)
    }
  })

  it('carries the .app-sidebar offset hook on the desktop rail', async () => {
    getCurrentUserMock.mockResolvedValue(makeUser())
    const html = await renderNav()
    expect(html).toContain('data-testid="sidebar-desktop"')
    expect(html).toContain('app-sidebar')
  })

  it('unburies Pipeline (/kanban), Attention (/exceptions) and Pulse (/leadership)', async () => {
    getCurrentUserMock.mockResolvedValue(makeUser())
    const html = await renderNav()
    expect(html).toContain('href="/kanban"')
    expect(html).toContain('href="/dashboard/exceptions"')
    expect(html).toContain('href="/dashboard/leadership"')
  })

  it('points work + records items at existing routes', async () => {
    getCurrentUserMock.mockResolvedValue(makeUser())
    const html = await renderNav()
    for (const href of [
      '/finance',
      '/finance/payments',
      '/finance/pi/pending',
      '/operations',
      '/dispatch/kits',
      '/operations/vex',
      '/mous',
      '/schools',
      '/admin',
    ]) {
      expect(html).toContain(`href="${href}"`)
    }
  })

  it('keeps the same nav for every role (Admin link visible to a SalesRep)', async () => {
    getCurrentUserMock.mockResolvedValue(makeUser({ role: 'SalesRep', department: 'sales' }))
    const html = await renderNav()
    expect(html).toContain('href="/admin"')
  })
})

describe('TopNav shell: active highlighting (longest-match)', () => {
  it('marks MOUs active on a deep MOU route', async () => {
    getCurrentUserMock.mockResolvedValue(makeUser())
    const html = await renderNav('/mous/MOU-STEAM-2526-001')
    expect(html).toMatch(/data-testid="nav-mous"[^>]*data-active="true"/)
    expect(html).toMatch(
      /aria-current="page"[^>]*data-testid="nav-mous"|data-testid="nav-mous"[^>]*aria-current="page"/,
    )
  })

  it('marks Pipeline active on /kanban', async () => {
    getCurrentUserMock.mockResolvedValue(makeUser())
    const html = await renderNav('/kanban')
    expect(html).toMatch(/data-testid="nav-pipeline"[^>]*data-active="true"/)
  })

  it('marks Payments (not the Finance index) active on /finance/payments', async () => {
    getCurrentUserMock.mockResolvedValue(makeUser())
    const html = await renderNav('/finance/payments')
    expect(html).toMatch(/data-testid="nav-fin-payments"[^>]*data-active="true"/)
    expect(html).toMatch(/data-testid="nav-fin-home"[^>]*data-active="false"/)
  })
})

describe('TopNav shell: department dot (orientation hint)', () => {
  it('shows a Finance dot for a Finance user', async () => {
    getCurrentUserMock.mockResolvedValue(makeUser({ role: 'Finance', department: 'finance' }))
    const html = await renderNav()
    expect(html).toContain('data-testid="nav-zone-finance-dot"')
    expect(html).not.toContain('data-testid="nav-zone-operations-dot"')
  })

  it('shows an Operations dot for an Ops user', async () => {
    getCurrentUserMock.mockResolvedValue(makeUser({ role: 'OpsHead', department: 'ops' }))
    const html = await renderNav()
    expect(html).toContain('data-testid="nav-zone-operations-dot"')
    expect(html).not.toContain('data-testid="nav-zone-finance-dot"')
  })

  it('shows no dots for a null-department Admin', async () => {
    getCurrentUserMock.mockResolvedValue(makeUser({ role: 'Admin', department: null }))
    const html = await renderNav()
    expect(html).not.toContain('data-testid="nav-zone-finance-dot"')
    expect(html).not.toContain('data-testid="nav-zone-operations-dot"')
  })
})
