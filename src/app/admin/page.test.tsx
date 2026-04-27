/*
 * Page-wiring tests for /admin.
 *
 * Phase 1 W3-B: UI gates removed; every authenticated user sees the
 * directory of admin areas. Tests assert positive rendering for each
 * representative role plus the unauthenticated -> /login redirect.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

const cookiesMock = vi.fn()
const verifyMock = vi.fn()

vi.mock('next/headers', () => ({
  cookies: cookiesMock,
}))

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
    { id: 'anish.d', name: 'Anish', email: 'a@example.test', role: 'Admin', testingOverride: false, active: true, passwordHash: 'X', createdAt: '', auditLog: [] },
    { id: 'misba.m', name: 'Misba', email: 'm@example.test', role: 'OpsEmployee', testingOverride: true, testingOverridePermissions: ['OpsHead'], active: true, passwordHash: 'X', createdAt: '', auditLog: [] },
    { id: 'pratik.d', name: 'Pratik', email: 'p@example.test', role: 'SalesHead', testingOverride: false, active: true, passwordHash: 'X', createdAt: '', auditLog: [] },
    { id: 'sp-vikram', name: 'Vikram', email: 'v@example.test', role: 'SalesRep', testingOverride: false, active: true, passwordHash: 'X', createdAt: '', auditLog: [] },
  ],
}))

beforeEach(() => {
  vi.clearAllMocks()
  cookiesMock.mockResolvedValue({
    get: () => ({ value: 'mock-jwt' }),
  })
})

async function loadPage() {
  return (await import('./page')).default
}

describe('/admin landing', () => {
  it('Admin sees the directory of admin areas', async () => {
    verifyMock.mockResolvedValue({ sub: 'anish.d', email: 'a@example.test', name: 'Anish', role: 'Admin' })
    const Page = await loadPage()
    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({}) }))
    expect(html).toContain('Welcome, Anish.')
    expect(html).toContain('CC rules')
    expect(html).toContain('Audit log')
    expect(html).toContain('Phase 1 placeholder')
  })

  it('OpsEmployee with testingOverride [OpsHead] is allowed (Misba)', async () => {
    verifyMock.mockResolvedValue({ sub: 'misba.m', email: 'm@example.test', name: 'Misba', role: 'OpsEmployee' })
    const Page = await loadPage()
    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({}) }))
    expect(html).toContain('Welcome, Misba.')
  })

  it('SalesHead also sees the page (Phase 1 W3-B: UI gates disabled)', async () => {
    verifyMock.mockResolvedValue({ sub: 'pratik.d', email: 'p@example.test', name: 'Pratik', role: 'SalesHead' })
    const Page = await loadPage()
    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({}) }))
    expect(html).toContain('Welcome, Pratik.')
  })

  it('SalesRep also sees the page (Phase 1 W3-B: UI gates disabled)', async () => {
    verifyMock.mockResolvedValue({ sub: 'sp-vikram', email: 'v@example.test', name: 'Vikram', role: 'SalesRep' })
    const Page = await loadPage()
    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({}) }))
    expect(html).toContain('Welcome, Vikram.')
  })

  it('unauthenticated viewer redirected to /login with next=/admin', async () => {
    cookiesMock.mockResolvedValue({ get: () => undefined })
    const Page = await loadPage()
    await expect(Page({ searchParams: Promise.resolve({}) })).rejects.toThrow('REDIRECT:/login?next=%2Fadmin')
  })

  it('Admin sees the System sync panel with both trigger buttons', async () => {
    verifyMock.mockResolvedValue({ sub: 'anish.d', email: 'a@example.test', name: 'Anish', role: 'Admin' })
    const Page = await loadPage()
    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({}) }))
    expect(html).toContain('System sync')
    expect(html).toContain('action="/api/mou/import-tick"')
    expect(html).toContain('action="/api/sync/tick"')
    expect(html).toContain('Run import sync now')
    expect(html).toContain('Run health check now')
  })

  it('synced=import-ok query param surfaces a green flash', async () => {
    verifyMock.mockResolvedValue({ sub: 'anish.d', email: 'a@example.test', name: 'Anish', role: 'Admin' })
    const Page = await loadPage()
    const html = renderToStaticMarkup(
      await Page({ searchParams: Promise.resolve({ synced: 'import-ok' }) }),
    )
    expect(html).toContain('Import sync completed without anomalies')
  })

  it('synced=health-anomaly query param surfaces an amber flash', async () => {
    verifyMock.mockResolvedValue({ sub: 'anish.d', email: 'a@example.test', name: 'Anish', role: 'Admin' })
    const Page = await loadPage()
    const html = renderToStaticMarkup(
      await Page({ searchParams: Promise.resolve({ synced: 'health-anomaly' }) }),
    )
    expect(html).toContain('Health check found anomalies')
  })

  it('error=permission query param surfaces a red flash', async () => {
    verifyMock.mockResolvedValue({ sub: 'anish.d', email: 'a@example.test', name: 'Anish', role: 'Admin' })
    const Page = await loadPage()
    const html = renderToStaticMarkup(
      await Page({ searchParams: Promise.resolve({ error: 'permission' }) }),
    )
    expect(html).toContain('do not have permission to trigger sync')
  })
})
