/*
 * /dashboard redirect tests (W4-I.5 P2C5).
 *
 * The route is a permanent redirect to /. Verifies the redirect
 * triggers and forwards searchParams so saved filter URLs survive
 * the migration.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest'

const redirectMock = vi.fn((path: string) => { throw new Error(`REDIRECT:${path}`) })

vi.mock('next/navigation', () => ({
  redirect: (p: string) => redirectMock(p),
}))

beforeEach(() => {
  vi.clearAllMocks()
})

describe('/dashboard redirect (W4-I.5 P2C5)', () => {
  it('redirects to / when no searchParams', async () => {
    const { default: DashboardRedirect } = await import('./page')
    await expect(DashboardRedirect({ searchParams: Promise.resolve({}) })).rejects.toThrow('REDIRECT:/')
  })

  it('forwards searchParams as a query string', async () => {
    const { default: DashboardRedirect } = await import('./page')
    await expect(
      DashboardRedirect({ searchParams: Promise.resolve({ programme: 'STEAM', fiscalYear: '2026-27' }) }),
    ).rejects.toThrow(/REDIRECT:\/\?(programme=STEAM&fiscalYear=2026-27|fiscalYear=2026-27&programme=STEAM)/)
  })
})
