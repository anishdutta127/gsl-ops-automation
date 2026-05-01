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
  notFound: vi.fn(() => {
    throw new Error('NOT_FOUND')
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
    { id: 'SCH-C', name: 'Charlie', legalEntity: null, city: 'X', state: 'X', region: 'East', pinCode: null, contactPerson: null, email: null, phone: null, billingName: null, pan: null, gstNumber: null, notes: null, active: true, createdAt: '', auditLog: [] },
  ],
}))

vi.mock('@/data/school_groups.json', () => ({
  default: [
    {
      id: 'SG-CHAIN', name: 'Chain Group', region: 'East',
      createdAt: '2026-04-15T00:00:00Z', createdBy: 'anish.d',
      memberSchoolIds: ['SCH-A', 'SCH-B'], groupMouId: null, notes: null,
      auditLog: [
        { timestamp: '2026-04-15T00:00:00Z', user: 'anish.d', action: 'create', notes: 'Initial seed' },
      ],
    },
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

describe('/admin/school-groups/[groupId] edit-members', () => {
  it('OpsHead sees the form with current members pre-checked', async () => {
    verifyMock.mockResolvedValue({ sub: 'misba.m', email: 'm@example.test', name: 'Misba', role: 'OpsHead' })
    const Page = await loadPage()
    const html = renderToStaticMarkup(
      await Page({
        params: Promise.resolve({ groupId: 'SG-CHAIN' }),
        searchParams: Promise.resolve({}),
      }),
    )
    expect(html).toContain('Chain Group')
    expect(html).toContain('action="/api/admin/school-groups/SG-CHAIN/edit-members"')
    expect(html).toContain('value="SCH-A"')
    expect(html).toContain('value="SCH-C"')
    // SCH-A and SCH-B should be pre-checked, SCH-C should not
    const checkedCount = (html.match(/checked=""/g) ?? []).length
    expect(checkedCount).toBe(2)
  })

  it('audit history section renders existing entries', async () => {
    verifyMock.mockResolvedValue({ sub: 'misba.m', email: 'm@example.test', name: 'Misba', role: 'OpsHead' })
    const Page = await loadPage()
    const html = renderToStaticMarkup(
      await Page({
        params: Promise.resolve({ groupId: 'SG-CHAIN' }),
        searchParams: Promise.resolve({}),
      }),
    )
    expect(html).toContain('Audit history')
    expect(html).toContain('Initial seed')
  })

  it('SalesRep also sees the page (Phase 1 W3-B: UI gates disabled)', async () => {
    verifyMock.mockResolvedValue({ sub: 'sp-vikram', email: 'v@example.test', name: 'Vikram', role: 'SalesRep' })
    const Page = await loadPage()
    const html = renderToStaticMarkup(
      await Page({
        params: Promise.resolve({ groupId: 'SG-CHAIN' }),
        searchParams: Promise.resolve({}),
      }),
    )
    expect(html).toContain('SG-CHAIN')
  })

  it('unknown groupId triggers notFound', async () => {
    verifyMock.mockResolvedValue({ sub: 'misba.m', email: 'm@example.test', name: 'Misba', role: 'OpsHead' })
    const Page = await loadPage()
    await expect(
      Page({
        params: Promise.resolve({ groupId: 'SG-NOPE' }),
        searchParams: Promise.resolve({}),
      }),
    ).rejects.toThrow('NOT_FOUND')
  })

  it('error=no-change surfaces a friendly message', async () => {
    verifyMock.mockResolvedValue({ sub: 'misba.m', email: 'm@example.test', name: 'Misba', role: 'OpsHead' })
    const Page = await loadPage()
    const html = renderToStaticMarkup(
      await Page({
        params: Promise.resolve({ groupId: 'SG-CHAIN' }),
        searchParams: Promise.resolve({ error: 'no-change' }),
      }),
    )
    expect(html).toContain('Member list is unchanged')
  })
})
