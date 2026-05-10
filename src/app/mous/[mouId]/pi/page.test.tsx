import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { User } from '@/lib/types'

const getCurrentUserMock = vi.fn()
const notFoundMock = vi.fn(() => { throw new Error('NEXT_NOT_FOUND') })
const redirectMock = vi.fn((url: string) => { throw new Error(`NEXT_REDIRECT:${url}`) })

vi.mock('@/lib/auth/session', () => ({ getCurrentUser: () => getCurrentUserMock() }))
vi.mock('next/navigation', () => ({
  notFound: () => notFoundMock(),
  redirect: (url: string) => redirectMock(url),
}))
vi.mock('@/components/ops/TopNav', () => ({ TopNav: () => null }))

beforeEach(() => { vi.clearAllMocks() })

function user(role: User['role'], id = 'u'): User {
  return {
    id, name: id, email: `${id}@example.test`, role,
    testingOverride: false, active: true, passwordHash: 'X',
    createdAt: '', auditLog: [],
  }
}

describe('/mous/[mouId]/pi page', () => {
  it('Finance sees the form', async () => {
    getCurrentUserMock.mockResolvedValue(user('Finance', 'shubhangi.g'))
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(
      await Page({ params: Promise.resolve({ mouId: 'MOU-STEAM-2627-001' }) }),
    )
    expect(html).toContain('<form')
    expect(html).toContain('Generate PI')
  })

  it('SalesRep on own MOU redirects with notice (Gate 1 Step 4 MM2)', async () => {
    // Gate 1 Step 4 changes the PI gate from notFound() to a redirect
    // back to the MOU detail page with a ?notice=pi-finance-only param,
    // so the user sees an explanatory toast instead of a bare 404. The
    // canGeneratePI department gate fires (SalesRep has dept='sales',
    // not 'finance').
    getCurrentUserMock.mockResolvedValue(user('SalesRep', 'sp-roveena'))
    const { default: Page } = await import('./page')
    await expect(
      Page({ params: Promise.resolve({ mouId: 'MOU-STEAM-2627-001' }) }),
    ).rejects.toThrow(/NEXT_REDIRECT:\/mous\/MOU-STEAM-2627-001\?notice=pi-finance-only/)
  })

  it('OpsHead redirects with notice (Gate 1 Step 4 MM2)', async () => {
    getCurrentUserMock.mockResolvedValue(user('OpsHead', 'misba.m'))
    const { default: Page } = await import('./page')
    await expect(
      Page({ params: Promise.resolve({ mouId: 'MOU-STEAM-2627-001' }) }),
    ).rejects.toThrow(/NEXT_REDIRECT:\/mous\/MOU-STEAM-2627-001\?notice=pi-finance-only/)
  })

  it('OpsEmployee redirects with notice (Gate 1 Step 4 MM2)', async () => {
    getCurrentUserMock.mockResolvedValue(user('OpsEmployee', 'ops-emp.x'))
    const { default: Page } = await import('./page')
    await expect(
      Page({ params: Promise.resolve({ mouId: 'MOU-STEAM-2627-001' }) }),
    ).rejects.toThrow(/NEXT_REDIRECT:\/mous\/MOU-STEAM-2627-001\?notice=pi-finance-only/)
  })

  it('Admin role with department=ops redirects (Misba MM2 canonical case)', async () => {
    // The trusted-core-team Admin promotion (2026-04-27) made Misba
    // role=Admin; her MM2 redirect comes from her department='ops'.
    // canGeneratePI sees Admin + non-null department and treats her
    // as department-scoped, not as the cross-functional wildcard.
    const misba: User = {
      ...user('Admin', 'misba.m'),
      department: 'ops',
    }
    getCurrentUserMock.mockResolvedValue(misba)
    const { default: Page } = await import('./page')
    await expect(
      Page({ params: Promise.resolve({ mouId: 'MOU-STEAM-2627-001' }) }),
    ).rejects.toThrow(/NEXT_REDIRECT:\/mous\/MOU-STEAM-2627-001\?notice=pi-finance-only/)
  })

  it('no longer renders the Phase 1 stub note (W4-B.4: stale; API is wired)', async () => {
    getCurrentUserMock.mockResolvedValue(user('Admin', 'anish.d'))
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(
      await Page({ params: Promise.resolve({ mouId: 'MOU-STEAM-2627-001' }) }),
    )
    expect(html).not.toContain('Phase 1 note')
    expect(html).not.toContain('wired in Phase D')
  })

  it('GSTIN missing surfaces an inline note (W4-A.6: no longer a hard block)', async () => {
    getCurrentUserMock.mockResolvedValue(user('Admin', 'anish.d'))
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(
      await Page({ params: Promise.resolve({ mouId: 'MOU-STEAM-2627-005' }) }),
    )
    expect(html).toContain('data-testid="gstin-missing-note"')
    expect(html).toContain('To be added')
    // Old hard-block alert copy must be gone.
    expect(html).not.toContain('GSTIN required')
    expect(html).not.toContain('Missing; PI blocked')
  })

  it('contains no raw hex codes (token discipline)', async () => {
    getCurrentUserMock.mockResolvedValue(user('Admin', 'anish.d'))
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(
      await Page({ params: Promise.resolve({ mouId: 'MOU-STEAM-2627-001' }) }),
    )
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,6}/)
  })
})
