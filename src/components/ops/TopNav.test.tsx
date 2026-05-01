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
  it('renders Dashboard / Kanban / MOUs / Schools / Escalations links for any user (W4-I.5 P2C5)', async () => {
    getCurrentUserMock.mockResolvedValue(makeUser({ role: 'SalesRep' }))
    const { TopNav } = await import('./TopNav')
    const html = renderToStaticMarkup(await TopNav({ currentPath: '/' }))
    expect(html).toContain('>Dashboard<')
    expect(html).toContain('>Kanban<')
    expect(html).toContain('href="/mous"')
    expect(html).toContain('href="/schools"')
    expect(html).toContain('href="/escalations"')
  })

  it('Dashboard link points at / (W4-I.5 P2C5: dashboard is now the homepage)', async () => {
    getCurrentUserMock.mockResolvedValue(makeUser())
    const { TopNav } = await import('./TopNav')
    const html = renderToStaticMarkup(await TopNav({ currentPath: '/' }))
    expect(html).toMatch(/href="\/"[^>]*>Dashboard<|>Dashboard<[^>]*href="\/"/)
    // The pre-W4-I.5 "Home" label is gone.
    expect(html).not.toContain('>Home<')
  })

  it('Kanban link points at /kanban (W4-I.5 P2C5)', async () => {
    getCurrentUserMock.mockResolvedValue(makeUser())
    const { TopNav } = await import('./TopNav')
    const html = renderToStaticMarkup(await TopNav({ currentPath: '/' }))
    expect(html).toMatch(/href="\/kanban"[^>]*>Kanban<|>Kanban<[^>]*href="\/kanban"/)
  })

  it('GSL Ops logo links to /', async () => {
    getCurrentUserMock.mockResolvedValue(makeUser())
    const { TopNav } = await import('./TopNav')
    const html = renderToStaticMarkup(await TopNav({ currentPath: '/' }))
    expect(html).toMatch(/href="\/"[^>]*>GSL Ops<|>GSL Ops<[^>]*href="\/"/)
  })

  it('hides Admin link for SalesRep', async () => {
    getCurrentUserMock.mockResolvedValue(makeUser({ role: 'SalesRep' }))
    const { TopNav } = await import('./TopNav')
    const html = renderToStaticMarkup(await TopNav({ currentPath: '/' }))
    expect(html).not.toContain('href="/admin"')
  })

  it('shows Admin link for Admin role', async () => {
    getCurrentUserMock.mockResolvedValue(makeUser({ role: 'Admin' }))
    const { TopNav } = await import('./TopNav')
    const html = renderToStaticMarkup(await TopNav({ currentPath: '/' }))
    expect(html).toContain('href="/admin"')
  })

  it('shows Admin link for OpsHead', async () => {
    getCurrentUserMock.mockResolvedValue(makeUser({ role: 'OpsHead' }))
    const { TopNav } = await import('./TopNav')
    const html = renderToStaticMarkup(await TopNav({ currentPath: '/' }))
    expect(html).toContain('href="/admin"')
  })

  it('shows Help link for any authenticated user (SalesRep included)', async () => {
    getCurrentUserMock.mockResolvedValue(makeUser({ role: 'SalesRep' }))
    const { TopNav } = await import('./TopNav')
    const html = renderToStaticMarkup(await TopNav({ currentPath: '/' }))
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

  it('Dashboard link is aria-current="page" when currentPath is exactly /', async () => {
    getCurrentUserMock.mockResolvedValue(makeUser())
    const { TopNav } = await import('./TopNav')
    const html = renderToStaticMarkup(await TopNav({ currentPath: '/' }))
    expect(html).toMatch(/aria-current="page"[^>]*>[^<]*Dashboard/)
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
