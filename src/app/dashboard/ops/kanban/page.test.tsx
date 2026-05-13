/*
 * /dashboard/ops/kanban page tests (Gate 5A.7 Step 2 unification).
 *
 * Post-unification this route is a permanent redirect to
 * /kanban?view=operations. The page's only job is forwarding the
 * incoming search params alongside the view=operations sentinel.
 *
 * Column-rendering / filter-rail / mobile-accordion assertions that
 * lived here pre-unification have moved to src/app/kanban/page.test.tsx
 * (the operations view is now rendered from that file).
 */

import { describe, expect, it, vi, beforeEach } from 'vitest'

const redirectMock = vi.fn((path: string) => { throw new Error(`REDIRECT:${path}`) })

vi.mock('next/navigation', () => ({
  redirect: (p: string) => redirectMock(p),
}))

beforeEach(() => {
  vi.clearAllMocks()
})

const noSp = Promise.resolve({})

describe('/dashboard/ops/kanban redirect (Gate 5A.7 Step 2)', () => {
  it('redirects to /kanban?view=operations on an empty querystring', async () => {
    const { default: Page } = await import('./page')
    await expect(Page({ searchParams: noSp })).rejects.toThrow(
      'REDIRECT:/kanban?view=operations',
    )
  })

  it('forwards additional search params (programme filter) into the redirect target', async () => {
    const { default: Page } = await import('./page')
    await expect(
      Page({ searchParams: Promise.resolve({ p: 'STEAM' }) }),
    ).rejects.toThrow('REDIRECT:/kanban?view=operations&p=STEAM')
  })

  it('overrides any incoming view= param with view=operations', async () => {
    const { default: Page } = await import('./page')
    await expect(
      Page({ searchParams: Promise.resolve({ view: 'lifecycle', p: 'STEAM' }) }),
    ).rejects.toThrow('REDIRECT:/kanban?view=operations&p=STEAM')
  })

  it('forwards array-valued search params verbatim', async () => {
    const { default: Page } = await import('./page')
    await expect(
      Page({ searchParams: Promise.resolve({ region: ['East', 'North'] }) }),
    ).rejects.toThrow('REDIRECT:/kanban?view=operations&region=East&region=North')
  })
})
