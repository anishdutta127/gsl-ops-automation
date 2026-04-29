/*
 * Page-wiring test for /admin/audit (Fix-15a).
 *
 * Concern: helper-level tests prove that applyFilters() narrows
 * correctly given inputs, and canViewAuditEntry() returns the
 * correct boolean per role. They do NOT prove that page.tsx
 * actually calls canViewAuditEntry() before applyFilters() with
 * the user resolved from the cookie. That call ordering is the
 * highest-risk wiring bug: a refactor that drops the role check
 * or applies URL filter first would expose Ops-only entries to
 * SalesRep / OpsEmployee viewers and the helper-level tests would
 * still all pass.
 *
 * Test pattern: vi.mock next/headers cookies() to return a fake
 * SalesRep session; vi.mock @/lib/crypto/jwt's verifySessionToken
 * to return SalesRep claims; render the page; assert that the
 * "visible to your role" count is 0 even when the URL specifies
 * an action (p2-override) that DOES exist in the audit fixtures
 * (DIS-002). If page.tsx ever drops canViewAuditEntry, the
 * "visible to your role" count would jump above 0 and this test
 * would fail.
 *
 * Decision rationale (deferred-to-smoke vs unit):
 *   Picked unit (option a from the Item 15 brief) because vi.mock
 *   handled both next/headers + crypto/jwt cleanly in <30 lines.
 *   Smoke fallback was the option-b plan if jsdom couldn't run
 *   the page module; it can.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

// Mocks must be hoisted via vi.mock + dynamic import below.
vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({
    get: () => ({ value: 'mock-jwt-token-for-test' }),
  })),
}))

vi.mock('@/lib/crypto/jwt', () => ({
  SESSION_COOKIE_NAME: 'gsl_ops_session',
  verifySessionToken: vi.fn(async () => ({
    sub: 'vishwanath.g',
    email: 'vishwanath.g@getsetlearn.info',
    name: 'Vishwanath G.',
    role: 'SalesRep' as const,
  })),
}))

// users.json carries vishwanath.g as Admin during round 2 testing per
// W4-I.1.7 / D-040. The wiring under test asserts that the page reads
// the role from users.json (not the JWT claim) and that SalesRep gets
// 0 visible entries; mock users.json so the synthetic SalesRep fixture
// drives the assertion regardless of the live data's round 2 promotion.
vi.mock('@/data/users.json', () => ({
  default: [
    {
      id: 'vishwanath.g',
      name: 'Vishwanath G.',
      email: 'vishwanath.g@getsetlearn.info',
      role: 'SalesRep',
      testingOverride: false,
      active: true,
      passwordHash: 'mock',
      createdAt: '2026-04-25T00:00:00Z',
      auditLog: [],
    },
  ],
}))

beforeEach(() => {
  vi.clearAllMocks()
})

describe('/admin/audit page wiring (Fix-15a)', () => {
  it('SalesRep viewing ?action=p2-override gets zero entries; role check ran first, URL filter could not widen', { timeout: 30000 }, async () => {
    const { default: AuditPage } = await import('./page')
    const result = await AuditPage({
      searchParams: Promise.resolve({ action: 'p2-override', days: 'all' }),
    })
    const html = renderToStaticMarkup(result)
    // The text "0 visible to your role" is the wiring assertion: even
    // though the audit fixtures contain a p2-override entry on DIS-002
    // (an OPS-lane Dispatch), the SalesRep role's canViewAuditEntry
    // returns false for OPS-lane entries; visible-to-role count stays 0.
    expect(html).toContain('0 visible to your role')
    expect(html).toContain('Showing 0 of 0 entries')
    expect(html).toContain('No audit entries match the current filters.')
  })

  it('SalesRep viewing the unfiltered audit page still gets zero visible entries', { timeout: 30000 }, async () => {
    const { default: AuditPage } = await import('./page')
    const result = await AuditPage({
      searchParams: Promise.resolve({ days: 'all' }),
    })
    const html = renderToStaticMarkup(result)
    expect(html).toContain('0 visible to your role')
  })
})
