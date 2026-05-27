/*
 * /mous/[mouId]/actuals page tests.
 *
 * Post-Round-2 Part A: the actuals page is a redirect to /student-count.
 * The form, drift badge, and error handling now live on the student-count
 * page. This test verifies the redirect fires.
 */

import { describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  }),
}))

describe('/mous/[mouId]/actuals page', () => {
  it('redirects to /mous/[mouId]/student-count', async () => {
    const { default: Page } = await import('./page')
    await expect(
      Page({ params: Promise.resolve({ mouId: 'MOU-X' }) }),
    ).rejects.toThrow('NEXT_REDIRECT:/mous/MOU-X/student-count')
  })
})
