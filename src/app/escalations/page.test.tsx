import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { User } from '@/lib/types'

const getCurrentUserMock = vi.fn()

vi.mock('@/lib/auth/session', () => ({
  getCurrentUser: () => getCurrentUserMock(),
}))

vi.mock('@/components/ops/TopNav', () => ({ TopNav: () => null }))

beforeEach(() => {
  vi.clearAllMocks()
})

function user(role: User['role'], extra: Partial<User> = {}): User {
  return {
    id: extra.id ?? `${role.toLowerCase()}-x`,
    name: role, email: `x@example.test`, role,
    testingOverride: false, active: true, passwordHash: 'X',
    createdAt: '', auditLog: [], ...extra,
  }
}

describe('/escalations list page', () => {
  it('Admin sees all escalations', async () => {
    getCurrentUserMock.mockResolvedValue(user('Admin'))
    const { default: EscPage } = await import('./page')
    const html = renderToStaticMarkup(await EscPage({ searchParams: Promise.resolve({}) }))
    // Fixture has 5 escalations across lanes
    expect(html.match(/<tr[^>]*>/g)?.length).toBeGreaterThan(1)
  })

  it('OpsHead sees only OPS-lane escalations', async () => {
    getCurrentUserMock.mockResolvedValue(user('OpsHead'))
    const { default: EscPage } = await import('./page')
    const html = renderToStaticMarkup(await EscPage({ searchParams: Promise.resolve({}) }))
    // ESC-001 is OPS lane per fixture; row body renders "<lane> / <level>"
    expect(html).toContain('OPS / L')
    expect(html).not.toContain('ACADEMICS / L')
    expect(html).not.toContain('SALES / L')
  })

  it('SalesRep sees no escalations (empty state copy)', async () => {
    getCurrentUserMock.mockResolvedValue(user('SalesRep'))
    const { default: EscPage } = await import('./page')
    const html = renderToStaticMarkup(await EscPage({ searchParams: Promise.resolve({}) }))
    expect(html).toContain('Your role has no visible escalations')
  })

  it('lane filter narrows list', async () => {
    getCurrentUserMock.mockResolvedValue(user('Admin'))
    const { default: EscPage } = await import('./page')
    const html = renderToStaticMarkup(
      await EscPage({ searchParams: Promise.resolve({ lane: 'OPS' }) }),
    )
    expect(html).toContain('OPS / L')
    expect(html).not.toContain('ACADEMICS / L')
    expect(html).not.toContain('SALES / L')
  })

  it('contains no raw hex codes (token discipline)', async () => {
    getCurrentUserMock.mockResolvedValue(user('Admin'))
    const { default: EscPage } = await import('./page')
    const html = renderToStaticMarkup(await EscPage({ searchParams: Promise.resolve({}) }))
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,6}/)
  })
})
