/*
 * /dashboard/admin redirect tests (Gate 3.6 Step 4).
 *
 * Verifies the alias forwards every authenticated landing to /.
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

describe('/dashboard/admin redirect (Gate 3.6)', () => {
  it('redirects to /', async () => {
    const { default: AdminRedirect } = await import('./page')
    await expect(AdminRedirect()).rejects.toThrow('REDIRECT:/')
  })
})
