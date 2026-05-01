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

vi.mock('@/data/school_groups.json', () => ({
  default: [
    { id: 'SG-NARAYANA_WB', name: 'Narayana WB', region: 'East', createdAt: '', createdBy: 'anish.d', memberSchoolIds: ['SCH-A', 'SCH-B'], groupMouId: 'MOU-X', notes: 'Pre-seeded.', auditLog: [] },
    { id: 'SG-EMPTY', name: 'Empty Group', region: 'North', createdAt: '', createdBy: 'anish.d', memberSchoolIds: [], groupMouId: null, notes: null, auditLog: [] },
  ],
}))


beforeEach(() => {
  vi.clearAllMocks()
  cookiesMock.mockResolvedValue({ get: () => ({ value: 'mock-jwt' }) })
})

async function loadPage() {
  return (await import('./page')).default
}

describe('/admin/school-groups list', () => {
  it('OpsHead sees groups with member counts + Edit links', async () => {
    verifyMock.mockResolvedValue({ sub: 'misba.m', email: 'm@example.test', name: 'Misba', role: 'OpsHead' })
    const Page = await loadPage()
    const html = renderToStaticMarkup(await Page())
    expect(html).toContain('Narayana WB')
    expect(html).toContain('2 members')
    expect(html).toContain('0 members')
    expect(html).toContain('href="/admin/school-groups/SG-NARAYANA_WB"')
    expect(html).toContain('Edit members')
  })

  it('renders New group CTA', async () => {
    verifyMock.mockResolvedValue({ sub: 'misba.m', email: 'm@example.test', name: 'Misba', role: 'OpsHead' })
    const Page = await loadPage()
    const html = renderToStaticMarkup(await Page())
    expect(html).toContain('href="/admin/school-groups/new"')
  })

  it('SalesRep also sees the page (Phase 1 W3-B: UI gates disabled)', async () => {
    verifyMock.mockResolvedValue({ sub: 'sp-vikram', email: 'v@example.test', name: 'Vikram', role: 'SalesRep' })
    const Page = await loadPage()
    const html = renderToStaticMarkup(await Page())
    expect(html).toContain('Narayana WB')
  })
})
