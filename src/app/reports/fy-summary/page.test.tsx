import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

const getCurrentUserMock = vi.fn()
const redirectMock = vi.fn((p: string) => {
  throw new Error(`REDIRECT:${p}`)
})

vi.mock('@/lib/auth/session', () => ({
  getCurrentUser: () => getCurrentUserMock(),
}))

vi.mock('next/navigation', () => ({
  redirect: (p: string) => redirectMock(p),
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/reports/fy-summary',
}))

vi.mock('@/components/ops/TopNav', () => ({
  TopNav: () => null,
}))

beforeEach(() => {
  vi.clearAllMocks()
  getCurrentUserMock.mockResolvedValue({
    id: 'admin',
    name: 'Admin',
    email: 'a@example.test',
    role: 'Admin',
    department: null,
    testingOverride: false,
    active: true,
    passwordHash: 'X',
    createdAt: '2026-04-01T00:00:00Z',
    auditLog: [],
  })
})

describe('/reports/fy-summary', () => {
  it('redirects unauthenticated user to /login', async () => {
    getCurrentUserMock.mockResolvedValue(null)
    const { default: Page } = await import('./page')
    await expect(Page({ searchParams: {} })).rejects.toThrow(
      'REDIRECT:/login?next=%2Freports%2Ffy-summary',
    )
  })

  it('renders for Admin role (any access)', async () => {
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(await Page({ searchParams: {} }))
    expect(html).toContain('data-testid="fy-summary-report"')
    expect(html).toContain('FY summary')
  })

  it('renders the filter rail + headline cards', async () => {
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(await Page({ searchParams: {} }))
    expect(html).toContain('data-testid="report-filter-rail"')
    expect(html).toContain('data-testid="fy-summary-headline"')
    expect(html).toContain('data-testid="fy-summary-programme-breakdown"')
    expect(html).toContain('data-testid="fy-summary-monthly-receipts"')
  })

  it('CSV export link href includes the slug', async () => {
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(
      await Page({ searchParams: { fy: '2026-27' } }),
    )
    expect(html).toContain('data-testid="csv-export-fy-summary"')
    expect(html).toContain('/api/reports/fy-summary/csv?fy=2026-27')
  })

  it('contains no em-dash characters', async () => {
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(await Page({ searchParams: {} }))
    expect(html).not.toContain(String.fromCharCode(0x2014))
  })

  it('contains no raw hex colour codes', async () => {
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(await Page({ searchParams: {} }))
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,6}/)
  })
})
