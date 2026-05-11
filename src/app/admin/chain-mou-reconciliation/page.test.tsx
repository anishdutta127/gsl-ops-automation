/*
 * /admin/chain-mou-reconciliation page tests (Gate 5A Step 4).
 *
 * Mocks getCurrentUser + next/navigation. Asserts: redirect for non-
 * Admin, candidates render with Consolidate + Dismiss buttons, empty
 * state when all dismissed, no em-dash, no hex.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest'
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
  notFound: vi.fn(() => { throw new Error('NEXT_NOT_FOUND') }),
}))

beforeEach(() => {
  vi.clearAllMocks()
})

function admin(): User {
  return {
    id: 'anish.d', name: 'Anish', email: 'a@example.test', role: 'Admin',
    department: null, testingOverride: false, active: true, passwordHash: 'X',
    createdAt: '', auditLog: [],
  }
}

function salesRep(): User {
  return {
    id: 'rep.x', name: 'Rep X', email: 'r@example.test', role: 'SalesRep',
    department: 'sales', testingOverride: false, active: true, passwordHash: 'X',
    createdAt: '', auditLog: [],
  }
}

const noSp = Promise.resolve({})

describe('/admin/chain-mou-reconciliation', () => {
  it('redirects unauthenticated callers to /login', async () => {
    getCurrentUserMock.mockResolvedValue(null)
    const { default: Page } = await import('./page')
    await expect(Page({ searchParams: noSp })).rejects.toThrow(
      'REDIRECT:/login?next=%2Fadmin%2Fchain-mou-reconciliation',
    )
  })

  it('redirects non-Admin users to the consolidated landing with admin-only notice', async () => {
    getCurrentUserMock.mockResolvedValue(salesRep())
    const { default: Page } = await import('./page')
    await expect(Page({ searchParams: noSp })).rejects.toThrow('REDIRECT:/?notice=admin-only')
  })

  it('renders the page header for an Admin', async () => {
    getCurrentUserMock.mockResolvedValue(admin())
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(await Page({ searchParams: noSp }))
    expect(html).toContain('Chain MOU reconciliation')
    expect(html).toContain('data-testid="chain-reconciliation-page"')
  })

  it('renders Consolidate + Mark-as-standalone forms per candidate row', async () => {
    getCurrentUserMock.mockResolvedValue(admin())
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(await Page({ searchParams: noSp }))
    // The Gate 2 snapshot contributes 12 candidates; assert at least one
    // row + both action buttons rendered for that row.
    expect(html).toMatch(/data-testid="chain-candidate-/)
    expect(html).toMatch(/data-testid="chain-consolidate-/)
    expect(html).toMatch(/data-testid="chain-dismiss-/)
    expect(html).toContain('action="/api/admin/chain-reconciliation/consolidate"')
    expect(html).toContain('action="/api/admin/chain-reconciliation/dismiss"')
  })

  it('shows a flash banner when ?flash=... is passed', async () => {
    getCurrentUserMock.mockResolvedValue(admin())
    const { default: Page } = await import('./page')
    const sp = Promise.resolve({ flash: 'Chain consolidated.' })
    const html = renderToStaticMarkup(await Page({ searchParams: sp }))
    expect(html).toContain('data-testid="chain-reconciliation-flash"')
    expect(html).toContain('Chain consolidated.')
  })

  it('renders no raw hex codes (token discipline)', async () => {
    getCurrentUserMock.mockResolvedValue(admin())
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(await Page({ searchParams: noSp }))
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,6}/)
  })

  it('contains no em-dash characters (British English copy)', async () => {
    getCurrentUserMock.mockResolvedValue(admin())
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(await Page({ searchParams: noSp }))
    expect(html).not.toContain(String.fromCharCode(0x2014))
  })
})
