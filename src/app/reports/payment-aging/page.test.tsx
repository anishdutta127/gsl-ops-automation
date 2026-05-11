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
  usePathname: () => '/reports/payment-aging',
}))

vi.mock('@/components/ops/TopNav', () => ({
  TopNav: () => null,
}))

beforeEach(() => {
  vi.clearAllMocks()
  getCurrentUserMock.mockResolvedValue({
    id: 'admin',
    name: 'A',
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

describe('/reports/payment-aging', () => {
  it('redirects unauthenticated user', async () => {
    getCurrentUserMock.mockResolvedValue(null)
    const { default: Page } = await import('./page')
    await expect(Page({ searchParams: {} })).rejects.toThrow(
      'REDIRECT:/login?next=%2Freports%2Fpayment-aging',
    )
  })

  it('redirects Ops department user', async () => {
    getCurrentUserMock.mockResolvedValue({
      id: 'o',
      name: 'O',
      email: 'o@example.test',
      role: 'OpsHead',
      department: 'ops',
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

  it('renders the buckets + overdue + unpaid PIs + top 10 sections', async () => {
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(await Page({ searchParams: {} }))
    expect(html).toContain('data-testid="payment-aging-report"')
    expect(html).toContain('data-testid="payment-aging-buckets"')
    expect(html).toContain('data-testid="payment-aging-overdue-schools"')
    expect(html).toContain('data-testid="payment-aging-unpaid-pis"')
    expect(html).toContain('data-testid="payment-aging-top10"')
  })

  it('CSV export link points to the correct slug', async () => {
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(await Page({ searchParams: {} }))
    expect(html).toContain('data-testid="csv-export-payment-aging"')
    expect(html).toContain('/api/reports/payment-aging/csv')
  })

  it('renders filter rail', async () => {
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(await Page({ searchParams: {} }))
    expect(html).toContain('data-testid="report-filter-rail"')
  })

  it('contains no em-dash and no hex codes', async () => {
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(await Page({ searchParams: {} }))
    expect(html).not.toContain(String.fromCharCode(0x2014))
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,6}/)
  })
})
