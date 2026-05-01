/*
 * Page-wiring tests for /admin/cc-rules/new (Phase C5a-1).
 *
 * Concerns:
 *  - Admin-only role gate (OpsHead redirected per the 30-day window
 *    encoded in cc-rule:create permission scope)
 *  - The form posts to /api/cc-rules/create with the expected fields
 *  - Error param surfaces a friendly message
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
    { id: 'misba.m', name: 'Misba', email: 'm@example.test', role: 'OpsHead', testingOverride: false, active: true, passwordHash: 'X', createdAt: '', auditLog: [] },
  ],
}))

vi.mock('@/data/sales_team.json', () => ({
  default: [
    { id: 'sp-vikram', name: 'Vikram', email: 'v@example.test', phone: null, territories: [], programmes: ['STEAM'], active: true, joinedDate: '2025-06-01' },
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

describe('/admin/cc-rules/new', () => {
  it('Admin sees the form posting to /api/cc-rules/create', async () => {
    verifyMock.mockResolvedValue({ sub: 'anish.d', email: 'a@example.test', name: 'Anish', role: 'Admin' })
    const Page = await loadPage()
    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({}) }))
    expect(html).toContain('action="/api/cc-rules/create"')
    expect(html).toContain('name="id"')
    expect(html).toContain('name="sheet"')
    expect(html).toContain('name="scope"')
    expect(html).toContain('name="scopeValue"')
    expect(html).toContain('name="contexts"')
    expect(html).toContain('name="ccUserIds"')
    expect(html).toContain('name="sourceRuleText"')
  })

  it('OpsHead also sees the form (Phase 1 W3-B: UI gates disabled)', async () => {
    verifyMock.mockResolvedValue({ sub: 'misba.m', email: 'm@example.test', name: 'Misba', role: 'OpsHead' })
    const Page = await loadPage()
    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({}) }))
    expect(html).toContain('<form')
  })

  it('error=duplicate-id surfaces a friendly message', async () => {
    verifyMock.mockResolvedValue({ sub: 'anish.d', email: 'a@example.test', name: 'Anish', role: 'Admin' })
    const Page = await loadPage()
    const html = renderToStaticMarkup(
      await Page({ searchParams: Promise.resolve({ error: 'duplicate-id' }) }),
    )
    expect(html).toContain('A rule with that id already exists')
  })

  it('the cc user datalist offers users + sales team ids', async () => {
    verifyMock.mockResolvedValue({ sub: 'anish.d', email: 'a@example.test', name: 'Anish', role: 'Admin' })
    const Page = await loadPage()
    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({}) }))
    expect(html).toContain('value="anish.d"')
    expect(html).toContain('value="sp-vikram"')
  })
})
