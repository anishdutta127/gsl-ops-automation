/*
 * /finance/pi/pending page tests (Gate 4 Step 6).
 *
 * Page-level permission gate + render. The computePendingPi shortlist
 * helper itself moved to src/lib/finance/computePendingPi.ts after the
 * Vercel prod build flagged it as a non-Next-allowed page export; its
 * tests live at src/lib/finance/computePendingPi.test.ts.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { User } from '@/lib/types'

const getCurrentUserMock = vi.fn()
const redirectMock = vi.fn((path: string) => {
  throw new Error(`REDIRECT:${path}`)
})

vi.mock('@/lib/auth/session', () => ({
  getCurrentUser: () => getCurrentUserMock(),
}))

vi.mock('next/navigation', () => ({
  redirect: (p: string) => redirectMock(p),
}))

vi.mock('@/components/ops/TopNav', () => ({
  TopNav: () => null,
}))

beforeEach(() => {
  vi.clearAllMocks()
})

function finance(): User {
  return {
    id: 'pranav.p',
    name: 'Pranav',
    email: 'p@example.test',
    role: 'Finance',
    testingOverride: false,
    active: true,
    passwordHash: 'X',
    createdAt: '',
    auditLog: [],
  }
}

describe('/finance/pi/pending page', () => {
  it('redirects unauthenticated callers to /login', async () => {
    getCurrentUserMock.mockResolvedValue(null)
    const { default: Page } = await import('./page')
    await expect(Page()).rejects.toThrow(
      'REDIRECT:/login?next=%2Ffinance%2Fpi%2Fpending',
    )
  })

  it('every authenticated user can view in testing mode (TESTING_OPEN_ACCESS default)', async () => {
    // VIEW gates open during testing per CLAUDE.md; only EDIT actions
    // stay department-scoped. A SalesRep should reach the page but the
    // inline Generate PI action is still gated by Finance ownership
    // downstream.
    getCurrentUserMock.mockResolvedValue({
      ...finance(),
      role: 'SalesRep',
      department: 'sales',
    } as User)
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(await Page())
    expect(html).toContain('Pending PIs')
  })

  it('renders header + page shell for Finance', async () => {
    getCurrentUserMock.mockResolvedValue(finance())
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(await Page())
    expect(html).toContain('Pending PIs')
    expect(html).toContain('data-testid="pending-pi-list"')
  })
})
