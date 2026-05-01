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

vi.mock('@/data/schools.json', () => ({
  default: [
    { id: 'SCH-A', name: 'Alpha', legalEntity: null, city: 'X', state: 'X', region: 'East', pinCode: null, contactPerson: null, email: null, phone: null, billingName: null, pan: null, gstNumber: null, notes: null, active: true, createdAt: '', auditLog: [] },
    { id: 'SCH-B', name: 'Beta', legalEntity: null, city: 'X', state: 'X', region: 'East', pinCode: null, contactPerson: null, email: null, phone: null, billingName: null, pan: null, gstNumber: null, notes: null, active: true, createdAt: '', auditLog: [] },
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

describe('/admin/school-groups/new', () => {
  it('OpsHead sees form with member checkboxes from schools.json', async () => {
    verifyMock.mockResolvedValue({ sub: 'misba.m', email: 'm@example.test', name: 'Misba', role: 'OpsHead' })
    const Page = await loadPage()
    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({}) }))
    expect(html).toContain('action="/api/admin/school-groups/create"')
    expect(html).toContain('value="SCH-A"')
    expect(html).toContain('value="SCH-B"')
    expect(html).toContain('Alpha')
    expect(html).toContain('Beta')
  })

  it('SalesRep also sees the form (Phase 1 W3-B: UI gates disabled)', async () => {
    verifyMock.mockResolvedValue({ sub: 'sp-vikram', email: 'v@example.test', name: 'Vikram', role: 'SalesRep' })
    const Page = await loadPage()
    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({}) }))
    expect(html).toContain('<form')
  })

  it('error=invalid-member-school-ids surfaces a friendly message', async () => {
    verifyMock.mockResolvedValue({ sub: 'misba.m', email: 'm@example.test', name: 'Misba', role: 'OpsHead' })
    const Page = await loadPage()
    const html = renderToStaticMarkup(
      await Page({ searchParams: Promise.resolve({ error: 'invalid-member-school-ids' }) }),
    )
    expect(html).toContain('not in the directory')
  })
})
