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
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/reports/sales-performance',
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

describe('/reports/sales-performance', () => {
  it('redirects unauthenticated user to /login', async () => {
    getCurrentUserMock.mockResolvedValue(null)
    const { default: Page } = await import('./page')
    await expect(Page({ searchParams: {} })).rejects.toThrow(
      'REDIRECT:/login?next=%2Freports%2Fsales-performance',
    )
  })

  it('redirects Finance department user (lacks access)', async () => {
    getCurrentUserMock.mockResolvedValue({
      id: 'fin',
      name: 'F',
      email: 'f@example.test',
      role: 'Finance',
      department: 'finance',
      testingOverride: false,
      active: true,
      passwordHash: 'X',
      createdAt: '2026-04-01T00:00:00Z',
      auditLog: [],
    })
    const { default: Page } = await import('./page')
    await expect(Page({ searchParams: {} })).rejects.toThrow(
      'REDIRECT:/?notice=report-access-required',
    )
  })

  it('renders header + filter bar + per-rep table', async () => {
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(await Page({ searchParams: {} }))
    expect(html).toContain('data-testid="sales-performance-report"')
    expect(html).toContain('data-testid="report-filter-rail"')
    expect(html).toContain('data-testid="sales-performance-table"')
  })

  it('renders top5 + bottom5 + conversion-placeholder sections', async () => {
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(await Page({ searchParams: {} }))
    expect(html).toContain('data-testid="sales-performance-top5"')
    expect(html).toContain('data-testid="sales-performance-bottom5"')
    expect(html).toContain(
      'data-testid="sales-performance-conversion-placeholder"',
    )
  })

  it('CSV export link href points to the correct slug', async () => {
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(await Page({ searchParams: {} }))
    expect(html).toContain('data-testid="csv-export-sales-performance"')
    expect(html).toContain('/api/reports/sales-performance/csv')
  })

  it('contains no em-dash and no hex codes', async () => {
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(await Page({ searchParams: {} }))
    expect(html).not.toContain(String.fromCharCode(0x2014))
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,6}/)
  })
})
