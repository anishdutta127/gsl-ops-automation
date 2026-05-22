/*
 * /dashboard/overview redirect tests (Phase 6F.1).
 *
 * Phase 6F.1 collapsed this route to a redirect now that the 5-zone
 * landing lives at /. The tests assert the redirect target + the
 * searchParams pass-through, mirroring the /dashboard redirect tests.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest'

const redirectMock = vi.fn((path: string) => {
  throw new Error(`REDIRECT:${path}`)
})

vi.mock('next/navigation', () => ({
  redirect: (p: string) => redirectMock(p),
}))

beforeEach(() => {
  vi.clearAllMocks()
})

describe('/dashboard/overview redirect (Phase 6F.1)', () => {
  it('redirects to / when no searchParams', async () => {
    const { default: OverviewRedirect } = await import('./page')
    await expect(
      OverviewRedirect({ searchParams: Promise.resolve({}) }),
    ).rejects.toThrow('REDIRECT:/')
  })

  it('forwards searchParams as a query string', async () => {
    const { default: OverviewRedirect } = await import('./page')
    await expect(
      OverviewRedirect({
        searchParams: Promise.resolve({ programme: 'STEAM', fiscalYear: '2026-27' }),
      }),
    ).rejects.toThrow(
      /REDIRECT:\/\?(programme=STEAM&fiscalYear=2026-27|fiscalYear=2026-27&programme=STEAM)/,
    )
  })
})
