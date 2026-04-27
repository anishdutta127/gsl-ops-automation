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
    {
      id: 'SCH-A', name: 'Alpha School', legalEntity: null, city: 'Pune', state: 'MH',
      region: 'South-West', pinCode: '411001', contactPerson: 'P', email: null, phone: null,
      billingName: null, pan: null, gstNumber: '27AAAPL1234C1ZX', notes: null,
      active: true, createdAt: '2026-04-15T00:00:00Z', auditLog: [],
    },
    {
      id: 'SCH-B', name: 'Beta School', legalEntity: null, city: 'Delhi', state: 'Delhi',
      region: 'North', pinCode: null, contactPerson: null, email: null, phone: null,
      billingName: null, pan: null, gstNumber: null, notes: null,
      active: true, createdAt: '2026-04-15T00:00:00Z', auditLog: [],
    },
  ],
}))

beforeEach(() => {
  vi.clearAllMocks()
  cookiesMock.mockResolvedValue({ get: () => ({ value: 'mock-jwt' }) })
})

async function loadPage() {
  return (await import('./page')).default
}

describe('/admin/schools list', () => {
  it('OpsHead sees school rows + GSTIN missing count', async () => {
    verifyMock.mockResolvedValue({ sub: 'misba.m', email: 'm@example.test', name: 'Misba', role: 'OpsHead' })
    const Page = await loadPage()
    const html = renderToStaticMarkup(await Page())
    expect(html).toContain('2 schools, 2 active')
    expect(html).toContain('1 missing GSTIN')
    expect(html).toContain('Alpha School')
    expect(html).toContain('SCH-A')
  })

  it('renders New school CTA + Edit links to /schools/[id]/edit', async () => {
    verifyMock.mockResolvedValue({ sub: 'misba.m', email: 'm@example.test', name: 'Misba', role: 'OpsHead' })
    const Page = await loadPage()
    const html = renderToStaticMarkup(await Page())
    expect(html).toContain('href="/admin/schools/new"')
    expect(html).toContain('href="/schools/SCH-A/edit"')
  })

  it('SalesRep also sees the page (Phase 1 W3-B: UI gates disabled)', async () => {
    verifyMock.mockResolvedValue({ sub: 'sp-vikram', email: 'v@example.test', name: 'Vikram', role: 'SalesRep' })
    const Page = await loadPage()
    const html = renderToStaticMarkup(await Page())
    expect(html).toContain('Alpha School')
  })
})
