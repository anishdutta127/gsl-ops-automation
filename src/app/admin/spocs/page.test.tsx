import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

const cookiesMock = vi.fn()
const verifyMock = vi.fn()

vi.mock('next/headers', () => ({ cookies: cookiesMock }))
vi.mock('@/lib/crypto/jwt', () => ({
  SESSION_COOKIE_NAME: 'gsl_ops_session',
  verifySessionToken: verifyMock,
}))
vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`)
  }),
}))

vi.mock('@/data/users.json', () => ({
  default: [
    { id: 'misba.m', name: 'Misba', email: 'm@example.test', role: 'OpsHead', testingOverride: false, active: true, passwordHash: 'X', createdAt: '', auditLog: [] },
    { id: 'sp-vikram', name: 'Vikram', email: 'v@example.test', role: 'SalesRep', testingOverride: false, active: true, passwordHash: 'X', createdAt: '', auditLog: [] },
  ],
}))

vi.mock('@/components/ops/TopNav', () => ({ TopNav: () => null }))

beforeEach(() => {
  vi.clearAllMocks()
  cookiesMock.mockResolvedValue({ get: () => ({ value: 'mock-jwt' }) })
})

async function loadPage() {
  return (await import('./page')).default
}

describe('/admin/spocs placeholder', () => {
  it('OpsHead sees the redirect copy explaining the deferral', async () => {
    verifyMock.mockResolvedValue({ sub: 'misba.m', email: 'm@example.test', name: 'Misba', role: 'OpsHead' })
    const Page = await loadPage()
    const html = renderToStaticMarkup(await Page())
    expect(html).toContain('SPOC editing happens via the school detail page')
    expect(html).toContain('href="/schools"')
    expect(html).toContain('deferred to Phase 1.1')
    expect(html).toContain('RUNBOOK')
  })

  it('SalesRep also sees the page (Phase 1 W3-B: UI gates disabled)', async () => {
    verifyMock.mockResolvedValue({ sub: 'sp-vikram', email: 'v@example.test', name: 'Vikram', role: 'SalesRep' })
    const Page = await loadPage()
    const html = renderToStaticMarkup(await Page())
    expect(html).toContain('SPOC editing happens via the school detail page')
  })
})
