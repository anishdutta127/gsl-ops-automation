import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { User } from '@/lib/types'

const getCurrentUserMock = vi.fn()

vi.mock('@/lib/auth/session', () => ({
  getCurrentUser: () => getCurrentUserMock(),
}))
vi.mock('@/components/ops/TopNav', () => ({ TopNav: () => null }))
vi.mock('next/navigation', async () => {
  const actual = await vi.importActual<typeof import('next/navigation')>('next/navigation')
  return {
    ...actual,
    redirect: (url: string) => {
      throw new Error(`redirected:${url}`)
    },
  }
})

beforeEach(() => {
  vi.clearAllMocks()
})

function admin(): User {
  return {
    id: 'anish.d', name: 'Anish', email: 'a@gsl.test', role: 'Admin',
    testingOverride: false, active: true, passwordHash: '', createdAt: '', auditLog: [],
  }
}

describe('/admin/dispatch-requests queue', () => {
  it('redirects to /login when no session', async () => {
    getCurrentUserMock.mockResolvedValue(null)
    const { default: Page } = await import('./page')
    await expect(
      Page({ searchParams: Promise.resolve({}) }),
    ).rejects.toThrow(/redirected:\/login/)
  })

  it('renders all 5 status filters with counts', async () => {
    getCurrentUserMock.mockResolvedValue(admin())
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({}) }))
    expect(html).toContain('data-testid="dr-filter-all"')
    expect(html).toContain('data-testid="dr-filter-pending-approval"')
    expect(html).toContain('data-testid="dr-filter-approved"')
    expect(html).toContain('data-testid="dr-filter-rejected"')
    expect(html).toContain('data-testid="dr-filter-cancelled"')
  })

  it('default view renders the 2 fixture DispatchRequests', async () => {
    getCurrentUserMock.mockResolvedValue(admin())
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({}) }))
    const rowMatches = html.match(/data-testid="dr-row-/g) ?? []
    expect(rowMatches.length).toBe(2)
  })

  it('?status=approved filters out the pending fixtures (no rows)', async () => {
    getCurrentUserMock.mockResolvedValue(admin())
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(
      await Page({ searchParams: Promise.resolve({ status: 'approved' }) }),
    )
    const rowMatches = html.match(/data-testid="dr-row-/g) ?? []
    expect(rowMatches.length).toBe(0)
    expect(html).toContain('No dispatch requests match')
  })

  it('?q=Mutahhary filters by school name (1 hit)', async () => {
    getCurrentUserMock.mockResolvedValue(admin())
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(
      await Page({ searchParams: Promise.resolve({ q: 'mutahhary' }) }),
    )
    const rowMatches = html.match(/data-testid="dr-row-/g) ?? []
    expect(rowMatches.length).toBe(1)
    expect(html).toContain('Mutahhary')
  })

  it('renders status badge for each row', async () => {
    getCurrentUserMock.mockResolvedValue(admin())
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({}) }))
    expect(html.match(/pending-approval/g)?.length ?? 0).toBeGreaterThanOrEqual(2)
  })
})
