/*
 * Page-wiring tests for /admin/cc-rules (Phase C5a-1).
 *
 * Concerns:
 *  - Role gate redirects non-Admin/non-OpsHead viewers
 *  - Admin sees the "New rule" CTA; OpsHead does not
 *  - The list renders rule rows with the toggle in disabled state
 *  - The C5a-2 inline note about toggle persistence is present
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
    { id: 'pradeep.r', name: 'Pradeep', email: 'p@example.test', role: 'OpsHead', testingOverride: false, active: true, passwordHash: 'X', createdAt: '', auditLog: [] },
    { id: 'sp-vikram', name: 'Vikram', email: 'v@example.test', role: 'SalesRep', testingOverride: false, active: true, passwordHash: 'X', createdAt: '', auditLog: [] },
  ],
}))

vi.mock('@/data/cc_rules.json', () => ({
  default: [
    {
      id: 'CCR-NORTH-DELHI', sheet: 'North', scope: 'sub-region',
      scopeValue: ['Delhi'], contexts: ['all-communications'],
      ccUserIds: ['anish.d'], enabled: true,
      sourceRuleText: 'Cc Anish on Delhi comms',
      createdAt: '2026-04-15T00:00:00Z', createdBy: 'import',
      disabledAt: null, disabledBy: null, disabledReason: null,
      auditLog: [],
    },
    {
      id: 'CCR-EAST-OFF', sheet: 'East', scope: 'region',
      scopeValue: 'East', contexts: ['welcome-note'],
      ccUserIds: ['anish.d'], enabled: false,
      sourceRuleText: 'East rule (currently off)',
      createdAt: '2026-04-15T00:00:00Z', createdBy: 'import',
      disabledAt: '2026-04-20T00:00:00Z', disabledBy: 'anish.d',
      disabledReason: 'paused for review', auditLog: [],
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

describe('/admin/cc-rules list', () => {
  it('Admin sees rule rows + the "New rule" CTA', async () => {
    verifyMock.mockResolvedValue({ sub: 'anish.d', email: 'a@example.test', name: 'Anish', role: 'Admin' })
    const Page = await loadPage()
    const html = renderToStaticMarkup(await Page())
    expect(html).toContain('CCR-NORTH-DELHI')
    expect(html).toContain('CCR-EAST-OFF')
    expect(html).toContain('2 rules, 1 enabled')
    expect(html).toContain('New rule')
  })

  it('OpsHead sees rule rows but NO "New rule" CTA (Admin-only)', async () => {
    verifyMock.mockResolvedValue({ sub: 'pradeep.r', email: 'p@example.test', name: 'Pradeep', role: 'OpsHead' })
    const Page = await loadPage()
    const html = renderToStaticMarkup(await Page())
    expect(html).toContain('CCR-NORTH-DELHI')
    expect(html).not.toContain('New rule')
  })

  it('SalesRep is redirected to /dashboard', async () => {
    verifyMock.mockResolvedValue({ sub: 'sp-vikram', email: 'v@example.test', name: 'Vikram', role: 'SalesRep' })
    const Page = await loadPage()
    await expect(Page()).rejects.toThrow('REDIRECT:/dashboard')
  })

  it('renders the C5a-2 deferral note for toggle persistence', async () => {
    verifyMock.mockResolvedValue({ sub: 'anish.d', email: 'a@example.test', name: 'Anish', role: 'Admin' })
    const Page = await loadPage()
    const html = renderToStaticMarkup(await Page())
    expect(html).toContain('toggle persistence wires in C5a-2')
  })

  it('uses CSS variables, no raw hex (DESIGN.md negative match)', async () => {
    verifyMock.mockResolvedValue({ sub: 'anish.d', email: 'a@example.test', name: 'Anish', role: 'Admin' })
    const Page = await loadPage()
    const html = renderToStaticMarkup(await Page())
    expect(html).not.toMatch(/#[0-9a-fA-F]{6}\b/)
    expect(html).not.toMatch(/#[0-9a-fA-F]{3}\b/)
  })
})
