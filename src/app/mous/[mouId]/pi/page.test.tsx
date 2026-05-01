import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { User } from '@/lib/types'

const getCurrentUserMock = vi.fn()
const notFoundMock = vi.fn(() => { throw new Error('NEXT_NOT_FOUND') })

vi.mock('@/lib/auth/session', () => ({ getCurrentUser: () => getCurrentUserMock() }))
vi.mock('next/navigation', () => ({ notFound: () => notFoundMock() }))
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

  it('SalesRep on own MOU now 404s (W4-I.4 MM2: PI gated to Finance + Admin)', async () => {
    // Pre-W4-I.4 the W3-B "every user sees every page" baseline let
    // SalesRep render the PI form even though canPerform() rejected
    // the submit. MM2 re-gates the page so PI is invisible to non-
    // Finance / non-Admin roles.
    getCurrentUserMock.mockResolvedValue(user('SalesRep', 'sp-roveena'))
    const { default: Page } = await import('./page')
    await expect(
      Page({ params: Promise.resolve({ mouId: 'MOU-STEAM-2627-001' }) }),
    ).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('OpsHead 404s (W4-I.4 MM2: PI gated to Finance + Admin)', async () => {
    getCurrentUserMock.mockResolvedValue(user('OpsHead', 'misba.m'))
    const { default: Page } = await import('./page')
    await expect(
      Page({ params: Promise.resolve({ mouId: 'MOU-STEAM-2627-001' }) }),
    ).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('OpsEmployee 404s (W4-I.4 MM2: PI gated to Finance + Admin)', async () => {
    getCurrentUserMock.mockResolvedValue(user('OpsEmployee', 'ops-emp.x'))
    const { default: Page } = await import('./page')
    await expect(
      Page({ params: Promise.resolve({ mouId: 'MOU-STEAM-2627-001' }) }),
    ).rejects.toThrow('NEXT_NOT_FOUND')
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
