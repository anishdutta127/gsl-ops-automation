/*
 * Page-wiring tests for /admin/cc-rules/[ruleId] (Phase C5a-1).
 *
 * Concerns:
 *  - Role gate (Admin or OpsHead, others redirected)
 *  - Form pre-fills with rule values
 *  - Form posts to /api/cc-rules/<id>/edit
 *  - Audit log section renders
 *  - Unknown ruleId triggers notFound()
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
  notFound: vi.fn(() => {
    throw new Error('NOT_FOUND')
  }),
}))

vi.mock('@/data/users.json', () => ({
  default: [
    { id: 'anish.d', name: 'Anish', email: 'a@example.test', role: 'Admin', testingOverride: false, active: true, passwordHash: 'X', createdAt: '', auditLog: [] },
    { id: 'misba.m', name: 'Misba', email: 'm@example.test', role: 'OpsHead', testingOverride: false, active: true, passwordHash: 'X', createdAt: '', auditLog: [] },
    { id: 'sp-vikram', name: 'Vikram', email: 'v@example.test', role: 'SalesRep', testingOverride: false, active: true, passwordHash: 'X', createdAt: '', auditLog: [] },
  ],
}))

vi.mock('@/data/sales_team.json', () => ({
  default: [],
}))

vi.mock('@/data/cc_rules.json', () => ({
  default: [
    {
      id: 'CCR-NORTH-DELHI', sheet: 'North', scope: 'sub-region',
      scopeValue: ['Delhi', 'Gurugram'], contexts: ['all-communications'],
      ccUserIds: ['anish.d'], enabled: true,
      sourceRuleText: 'Cc Anish on Delhi+Gurugram comms',
      createdAt: '2026-04-15T00:00:00Z', createdBy: 'anish.d',
      disabledAt: null, disabledBy: null, disabledReason: null,
      auditLog: [
        {
          timestamp: '2026-04-15T00:00:00Z',
          user: 'anish.d',
          action: 'cc-rule-created',
          notes: 'Initial seed',
        },
      ],
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

describe('/admin/cc-rules/[ruleId] detail/edit', () => {
  it('OpsHead sees the edit form pre-filled with rule values', async () => {
    verifyMock.mockResolvedValue({ sub: 'misba.m', email: 'm@example.test', name: 'Misba', role: 'OpsHead' })
    const Page = await loadPage()
    const html = renderToStaticMarkup(
      await Page({
        params: Promise.resolve({ ruleId: 'CCR-NORTH-DELHI' }),
        searchParams: Promise.resolve({}),
      }),
    )
    expect(html).toContain('CCR-NORTH-DELHI')
    expect(html).toContain('action="/api/cc-rules/CCR-NORTH-DELHI/edit"')
    expect(html).toContain('Delhi, Gurugram')
    expect(html).toContain('Cc Anish on Delhi+Gurugram comms')
  })

  it('audit history section renders existing entries', async () => {
    verifyMock.mockResolvedValue({ sub: 'misba.m', email: 'm@example.test', name: 'Misba', role: 'OpsHead' })
    const Page = await loadPage()
    const html = renderToStaticMarkup(
      await Page({
        params: Promise.resolve({ ruleId: 'CCR-NORTH-DELHI' }),
        searchParams: Promise.resolve({}),
      }),
    )
    expect(html).toContain('Audit history')
    expect(html).toContain('cc-rule-created')
    expect(html).toContain('Initial seed')
  })

  it('SalesRep also sees the page (Phase 1 W3-B: UI gates disabled)', async () => {
    verifyMock.mockResolvedValue({ sub: 'sp-vikram', email: 'v@example.test', name: 'Vikram', role: 'SalesRep' })
    const Page = await loadPage()
    const html = renderToStaticMarkup(
      await Page({
        params: Promise.resolve({ ruleId: 'CCR-NORTH-DELHI' }),
        searchParams: Promise.resolve({}),
      }),
    )
    expect(html).toContain('CCR-NORTH-DELHI')
  })

  it('unknown ruleId triggers notFound', async () => {
    verifyMock.mockResolvedValue({ sub: 'anish.d', email: 'a@example.test', name: 'Anish', role: 'Admin' })
    const Page = await loadPage()
    await expect(
      Page({
        params: Promise.resolve({ ruleId: 'CCR-DOES-NOT-EXIST' }),
        searchParams: Promise.resolve({}),
      }),
    ).rejects.toThrow('NOT_FOUND')
  })

  it('error=no-change surfaces a friendly message', async () => {
    verifyMock.mockResolvedValue({ sub: 'misba.m', email: 'm@example.test', name: 'Misba', role: 'OpsHead' })
    const Page = await loadPage()
    const html = renderToStaticMarkup(
      await Page({
        params: Promise.resolve({ ruleId: 'CCR-NORTH-DELHI' }),
        searchParams: Promise.resolve({ error: 'no-change' }),
      }),
    )
    expect(html).toContain('No fields were changed')
  })
})
