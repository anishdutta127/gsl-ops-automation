import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { User } from '@/lib/types'

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
    role: 'Admin', testingOverride: false, active: true, passwordHash: 'X',
    createdAt: '', auditLog: [], ...overrides,
  }
}

describe('TopNav', () => {
  it('renders Dashboard / MOUs / Schools / Escalations links for any user', async () => {
    getCurrentUserMock.mockResolvedValue(makeUser({ role: 'SalesRep' }))
    const { TopNav } = await import('./TopNav')
    const html = renderToStaticMarkup(await TopNav({ currentPath: '/dashboard' }))
    expect(html).toContain('href="/dashboard"')
    expect(html).toContain('href="/mous"')
    expect(html).toContain('href="/schools"')
    expect(html).toContain('href="/escalations"')
  })

  it('hides Admin link for SalesRep', async () => {
    getCurrentUserMock.mockResolvedValue(makeUser({ role: 'SalesRep' }))
    const { TopNav } = await import('./TopNav')
    const html = renderToStaticMarkup(await TopNav({ currentPath: '/dashboard' }))
    expect(html).not.toContain('href="/admin"')
  })

  it('shows Admin link for Admin role', async () => {
    getCurrentUserMock.mockResolvedValue(makeUser({ role: 'Admin' }))
    const { TopNav } = await import('./TopNav')
    const html = renderToStaticMarkup(await TopNav({ currentPath: '/dashboard' }))
    expect(html).toContain('href="/admin"')
  })

  it('shows Admin link for OpsHead', async () => {
    getCurrentUserMock.mockResolvedValue(makeUser({ role: 'OpsHead' }))
    const { TopNav } = await import('./TopNav')
    const html = renderToStaticMarkup(await TopNav({ currentPath: '/dashboard' }))
    expect(html).toContain('href="/admin"')
  })

  it('shows Help link for any authenticated user (SalesRep included)', async () => {
    getCurrentUserMock.mockResolvedValue(makeUser({ role: 'SalesRep' }))
    const { TopNav } = await import('./TopNav')
    const html = renderToStaticMarkup(await TopNav({ currentPath: '/dashboard' }))
    expect(html).toContain('href="/help"')
  })

  it('marks current path with aria-current="page"', async () => {
    getCurrentUserMock.mockResolvedValue(makeUser())
    const { TopNav } = await import('./TopNav')
    const html = renderToStaticMarkup(await TopNav({ currentPath: '/mous' }))
    // Allow either attribute order on the matching link element.
    expect(html).toMatch(
      /href="\/mous"[^>]*aria-current="page"|aria-current="page"[^>]*href="\/mous"/,
    )
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
})
