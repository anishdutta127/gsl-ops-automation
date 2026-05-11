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
  usePathname: () => '/reports/escalations',
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

describe('/reports/escalations', () => {
  it('redirects unauthenticated user', async () => {
    getCurrentUserMock.mockResolvedValue(null)
    const { default: Page } = await import('./page')
    await expect(Page({ searchParams: {} })).rejects.toThrow(
      'REDIRECT:/login?next=%2Freports%2Fescalations',
    )
  })

  it('renders for cross-functional access (Finance user)', async () => {
    getCurrentUserMock.mockResolvedValue({
      id: 'f',
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
    const html = renderToStaticMarkup(await Page({ searchParams: {} }))
    expect(html).toContain('data-testid="escalations-report"')
  })

  it('renders the matrix + resolution + categories + trending sections', async () => {
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(await Page({ searchParams: {} }))
    expect(html).toContain('data-testid="escalations-matrix"')
    expect(html).toContain('data-testid="escalations-resolution"')
    expect(html).toContain('data-testid="escalations-categories"')
    expect(html).toContain('data-testid="escalations-trending"')
  })

  it('renders filter rail and CSV export link', async () => {
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(await Page({ searchParams: {} }))
    expect(html).toContain('data-testid="report-filter-rail"')
    expect(html).toContain('data-testid="csv-export-escalations"')
    expect(html).toContain('/api/reports/escalations/csv')
  })

  it('renders header with title', async () => {
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(await Page({ searchParams: {} }))
    expect(html).toContain('Escalations report')
  })

  it('contains no em-dash and no hex codes', async () => {
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(await Page({ searchParams: {} }))
    expect(html).not.toContain(String.fromCharCode(0x2014))
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,6}/)
  })
})
