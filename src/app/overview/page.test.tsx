/*
 * /overview redirect tests (W4-I.5 P2C5).
 *
 * The route is a permanent redirect to /. Pre-W4-I.5 this hosted
 * the Leadership Console (5 health tiles + exception feed + 9
 * trigger tiles). Post-P2C5 it forwards to the Operations Control
 * Dashboard at /.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest'

const redirectMock = vi.fn((path: string) => { throw new Error(`REDIRECT:${path}`) })

vi.mock('next/navigation', () => ({
  redirect: (p: string) => redirectMock(p),
}))

beforeEach(() => {
  vi.clearAllMocks()
})

describe('/overview redirect (W4-I.5 P2C5)', () => {
  it('redirects to /', async () => {
    const { default: OverviewRedirect } = await import('./page')
    await expect(OverviewRedirect()).rejects.toThrow('REDIRECT:/')
  })
})
