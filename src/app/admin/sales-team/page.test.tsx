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

vi.mock('@/data/sales_team.json', () => ({
  default: [
    { id: 'sp-vikram', name: 'Vikram T.', email: 'v@example.test', phone: null, territories: ['Pune'], programmes: ['STEAM'], active: true, joinedDate: '2025-06-01' },
    { id: 'sp-old', name: 'Old Hire', email: 'old@example.test', phone: null, territories: ['Mumbai'], programmes: ['VEX'], active: false, joinedDate: '2024-01-01' },
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

describe('/admin/sales-team list', () => {
  it('OpsHead sees rep rows with the right counts', async () => {
    verifyMock.mockResolvedValue({ sub: 'misba.m', email: 'm@example.test', name: 'Misba', role: 'OpsHead' })
    const Page = await loadPage()
    const html = renderToStaticMarkup(await Page())
    expect(html).toContain('2 reps, 1 active')
    expect(html).toContain('Vikram T.')
    expect(html).toContain('sp-vikram')
    expect(html).toContain('Pune')
    expect(html).toContain('STEAM')
    expect(html).toContain('inactive')
  })

  it('renders the New rep CTA', async () => {
    verifyMock.mockResolvedValue({ sub: 'misba.m', email: 'm@example.test', name: 'Misba', role: 'OpsHead' })
    const Page = await loadPage()
    const html = renderToStaticMarkup(await Page())
    expect(html).toContain('New rep')
    expect(html).toContain('href="/admin/sales-team/new"')
  })

  it('SalesRep also sees the page (Phase 1 W3-B: UI gates disabled)', async () => {
    verifyMock.mockResolvedValue({ sub: 'sp-vikram', email: 'v@example.test', name: 'Vikram', role: 'SalesRep' })
    const Page = await loadPage()
    const html = renderToStaticMarkup(await Page())
    expect(html).toContain('Vikram T.')
  })
})
