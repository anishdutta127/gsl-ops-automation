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

  it('SalesRep on own MOU also sees the form (Phase 1 W3-B: UI gates disabled)', async () => {
    // sp-roveena owns MOU-STEAM-2627-001 post Week 3 import. Pre-W3-B
    // SalesRep got an inline role-locked message; post-W3-B the form
    // renders for any authenticated user. Server-side canPerform() in
    // lib/pi/generatePi.ts still enforces at submit time.
    getCurrentUserMock.mockResolvedValue(user('SalesRep', 'sp-roveena'))
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(
      await Page({ params: Promise.resolve({ mouId: 'MOU-STEAM-2627-001' }) }),
    )
    expect(html).toContain('<form')
    expect(html).toContain('Generate PI')
  })

  it('renders Phase 1 stub note', async () => {
    getCurrentUserMock.mockResolvedValue(user('Admin', 'anish.d'))
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(
      await Page({ params: Promise.resolve({ mouId: 'MOU-STEAM-2627-001' }) }),
    )
    expect(html).toContain('Phase 1 note')
    expect(html).toContain('wired in Phase D')
  })

  it('GSTIN missing surfaces alert (school SCH-MAPLELEAF-BLR has null gstNumber)', async () => {
    getCurrentUserMock.mockResolvedValue(user('Admin', 'anish.d'))
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(
      await Page({ params: Promise.resolve({ mouId: 'MOU-STEAM-2627-005' }) }),
    )
    expect(html).toContain('GSTIN required')
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
