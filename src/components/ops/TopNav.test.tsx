import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Department, User } from '@/lib/types'

// vitest.setup.ts ships a global TopNav mock so admin/page tests do not
// have to re-add it per-file. This suite tests TopNav itself; un-mock
// to restore the real implementation.
vi.unmock('@/components/ops/TopNav')

// Gate 5A.5 Step 2: TopNav now embeds QueueFreshnessIndicator (an async
// Server Component that reads sync_health.json + pending_updates.json
// at request time). renderToStaticMarkup cannot resolve nested async
// Server Components, so we stub it to a synchronous no-op for this
// suite. The indicator has its own dedicated test file covering the
// dropdown / Sync-now behaviour.
vi.mock('@/components/ops/QueueFreshnessIndicator', () => ({
  QueueFreshnessIndicator: () => null,
}))

const getCurrentUserMock = vi.fn()

vi.mock('@/lib/auth/session', () => ({
  getCurrentUser: () => getCurrentUserMock(),
}))

beforeEach(() => {
  vi.clearAllMocks()
})

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'anish.d', name: 'Anish Dutta', email: 'anish.d@example.test',
    role: 'Admin', department: null, testingOverride: false, active: true,
    passwordHash: 'X', createdAt: '', auditLog: [], ...overrides,
  }
}

describe('TopNav: Gate 1 Step 3 workflow-stage nav (Gate 3.5 Step 3 hides Pipeline)', () => {
  it('renders the five workflow stages for any authenticated user', async () => {
    getCurrentUserMock.mockResolvedValue(makeUser({ role: 'SalesRep', department: 'sales' }))
    const { TopNav } = await import('./TopNav')
    const html = renderToStaticMarkup(await TopNav({ currentPath: '/' }))
    expect(html).toContain('>MOUs<')
    expect(html).toContain('>Operations<')
    expect(html).toContain('>Finance<')
    expect(html).toContain('>Reports<')
    expect(html).toContain('>Admin<')
    expect(html).not.toContain('>Dispatch<')
  })

  it('every visible stage points at the documented route', async () => {
    getCurrentUserMock.mockResolvedValue(makeUser())
    const { TopNav } = await import('./TopNav')
    const html = renderToStaticMarkup(await TopNav({ currentPath: '/' }))
    // sales-pipeline NOT present in nav (Gate 3.5); routes still
    // reachable by direct URL per HIDDEN_ROUTES.md.
    expect(html).not.toContain('href="/sales-pipeline"')
    expect(html).toContain('href="/mous"')
    // Gate 4.95 Step 5: Finance + Operations + Dispatch tabs point to
    // their respective dashboard / list surfaces. Stage-tree paths
    // (/finance, /operations, /dispatch) stay reachable via direct URL
    // and still highlight the tab via activePaths.
    expect(html).toContain('href="/operations"')
    expect(html).toContain('href="/finance"')
    expect(html).toContain('href="/reports"')
    expect(html).toContain('href="/admin"')
  })

  it('Same nav exists for every role (no Admin-link gating in nav)', async () => {
    // Brief Gate 1 §"Operating principles": "Same nav exists for all
    // roles". Page-level gates still enforce write access; the nav is
    // the orientation surface, not the gate.
    getCurrentUserMock.mockResolvedValue(makeUser({ role: 'SalesRep', department: 'sales' }))
    const { TopNav } = await import('./TopNav')
    const html = renderToStaticMarkup(await TopNav({ currentPath: '/' }))
    expect(html).toContain('href="/admin"')
  })

  it('GSL Ops wordmark links to /', async () => {
    getCurrentUserMock.mockResolvedValue(makeUser())
    const { TopNav } = await import('./TopNav')
    const html = renderToStaticMarkup(await TopNav({ currentPath: '/' }))
    expect(html).toMatch(/data-testid="topnav-wordmark"[^>]*href="\/"/)
    expect(html).toContain('GSL Ops')
  })

  it('renders Sign out button posting to /api/logout', async () => {
    getCurrentUserMock.mockResolvedValue(makeUser())
    const { TopNav } = await import('./TopNav')
    const html = renderToStaticMarkup(await TopNav())
    expect(html).toContain('action="/api/logout"')
    expect(html).toContain('Sign out')
  })

  it('contains no raw hex codes (token discipline)', async () => {
    getCurrentUserMock.mockResolvedValue(makeUser())
    const { TopNav } = await import('./TopNav')
    const html = renderToStaticMarkup(await TopNav())
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,6}/)
  })

  it('renders Help link', async () => {
    getCurrentUserMock.mockResolvedValue(makeUser())
    const { TopNav } = await import('./TopNav')
    const html = renderToStaticMarkup(await TopNav({ currentPath: '/' }))
    expect(html).toContain('href="/help"')
  })
})

describe('TopNav: active-stage indicator', () => {
  it('marks the matching stage with aria-current="page"', async () => {
    getCurrentUserMock.mockResolvedValue(makeUser())
    const { TopNav } = await import('./TopNav')
    const html = renderToStaticMarkup(await TopNav({ currentPath: '/mous' }))
    expect(html).toMatch(
      /href="\/mous"[^>]*aria-current="page"|aria-current="page"[^>]*href="\/mous"/,
    )
  })

  it('descendant routes activate the parent stage (e.g., /mous/MOU-123)', async () => {
    getCurrentUserMock.mockResolvedValue(makeUser())
    const { TopNav } = await import('./TopNav')
    const html = renderToStaticMarkup(
      await TopNav({ currentPath: '/mous/MOU-STEAM-2526-001' }),
    )
    expect(html).toMatch(
      /href="\/mous"[^>]*aria-current="page"|aria-current="page"[^>]*href="\/mous"/,
    )
  })

  it('active stage carries data-stage-active="true"', async () => {
    getCurrentUserMock.mockResolvedValue(makeUser())
    const { TopNav } = await import('./TopNav')
    const html = renderToStaticMarkup(await TopNav({ currentPath: '/dispatch/kits' }))
    expect(html).toMatch(
      /data-testid="topnav-stage-operations"[^>]*data-stage-active="true"|data-stage-active="true"[^>]*data-testid="topnav-stage-operations"/,
    )
  })

  it('Gate 4.95: /finance/* highlights the Finance tab via activePaths', async () => {
    getCurrentUserMock.mockResolvedValue(makeUser())
    const { TopNav } = await import('./TopNav')
    const html = renderToStaticMarkup(
      await TopNav({ currentPath: '/finance/payments' }),
    )
    expect(html).toMatch(
      /data-testid="topnav-stage-finance"[^>]*data-stage-active="true"|data-stage-active="true"[^>]*data-testid="topnav-stage-finance"/,
    )
  })

  it('Gate 4.95: /operations/* highlights the Operations tab via activePaths', async () => {
    getCurrentUserMock.mockResolvedValue(makeUser())
    const { TopNav } = await import('./TopNav')
    const html = renderToStaticMarkup(
      await TopNav({ currentPath: '/operations/agreements' }),
    )
    expect(html).toMatch(
      /data-testid="topnav-stage-operations"[^>]*data-stage-active="true"|data-stage-active="true"[^>]*data-testid="topnav-stage-operations"/,
    )
  })

  it('/dispatch paths highlight the merged Operations tab', async () => {
    getCurrentUserMock.mockResolvedValue(makeUser())
    const { TopNav } = await import('./TopNav')
    const html = renderToStaticMarkup(await TopNav({ currentPath: '/dispatch' }))
    expect(html).toMatch(
      /data-testid="topnav-stage-operations"[^>]*data-stage-active="true"|data-stage-active="true"[^>]*data-testid="topnav-stage-operations"/,
    )
  })
})

describe('TopNav: department dot indicator', () => {
  function expectDot(html: string, stage: string): void {
    expect(html).toContain(`data-testid="topnav-dept-dot-${stage}"`)
  }

  function expectNoDot(html: string, stage: string): void {
    expect(html).not.toContain(`data-testid="topnav-dept-dot-${stage}"`)
  }

  it('Sales user gets no dots (Pipeline stage hidden Gate 3.5; sales is not a stage in any visible nav row)', async () => {
    // Pre-Gate-3.5 this test asserted a dot under the Pipeline stage.
    // With Pipeline hidden, Sales users land without any nav-stage dot;
    // their cross-functional work surfaces through the MOUs stage which has
    // no department dot (department = 'cross-functional').
    getCurrentUserMock.mockResolvedValue(
      makeUser({ role: 'SalesHead', department: 'sales' }),
    )
    const { TopNav } = await import('./TopNav')
    const html = renderToStaticMarkup(await TopNav({ currentPath: '/' }))
    expectNoDot(html, 'pipeline')
    expectNoDot(html, 'dispatch')
    expectNoDot(html, 'finance')
    expectNoDot(html, 'operations')
  })

  it('Ops user gets dot under merged Operations tab', async () => {
    getCurrentUserMock.mockResolvedValue(
      makeUser({ role: 'OpsHead', department: 'ops' }),
    )
    const { TopNav } = await import('./TopNav')
    const html = renderToStaticMarkup(await TopNav({ currentPath: '/' }))
    expectDot(html, 'operations')
    expectNoDot(html, 'finance')
  })

  it('Finance user gets a dot under Finance', async () => {
    getCurrentUserMock.mockResolvedValue(
      makeUser({ role: 'Finance', department: 'finance' }),
    )
    const { TopNav } = await import('./TopNav')
    const html = renderToStaticMarkup(await TopNav({ currentPath: '/' }))
    expectDot(html, 'finance')
    expectNoDot(html, 'pipeline')
    expectNoDot(html, 'dispatch')
  })

  it('Admin (department null) gets no dots; nav is undecorated', async () => {
    getCurrentUserMock.mockResolvedValue(makeUser({ role: 'Admin', department: null }))
    const { TopNav } = await import('./TopNav')
    const html = renderToStaticMarkup(await TopNav({ currentPath: '/' }))
    expectNoDot(html, 'pipeline')
    expectNoDot(html, 'dispatch')
    expectNoDot(html, 'finance')
    expectNoDot(html, 'operations')
  })

  it('Inactive user gets no dots even with a department', async () => {
    getCurrentUserMock.mockResolvedValue(
      makeUser({ role: 'OpsHead', department: 'ops' as Department, active: false }),
    )
    const { TopNav } = await import('./TopNav')
    const html = renderToStaticMarkup(await TopNav({ currentPath: '/' }))
    expectNoDot(html, 'dispatch')
    expectNoDot(html, 'operations')
  })
})

describe('TopNav: mobile drawer trigger', () => {
  it('renders the hamburger trigger button', async () => {
    getCurrentUserMock.mockResolvedValue(makeUser())
    const { TopNav } = await import('./TopNav')
    const html = renderToStaticMarkup(await TopNav({ currentPath: '/' }))
    expect(html).toContain('data-testid="topnav-mobile-trigger"')
  })
})
