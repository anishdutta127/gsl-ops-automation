/*
 * / action-first homepage tests (Phase 6F Part 3).
 *
 * Replaces the legacy 5-zone landing tests (now at
 * /dashboard/overview/page.test.tsx). These exercise the new
 * action-queue surface: greeting, role tag, queue partitioning,
 * and the leadership aggregate branch for Ameet.
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
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND')
  }),
}))

vi.mock('@/components/ops/TopNav', () => ({
  TopNav: () => null,
}))

beforeEach(() => {
  vi.clearAllMocks()
})

function admin(): User {
  return {
    id: 'anish.d',
    name: 'Anish',
    email: 'a@example.test',
    role: 'Admin',
    testingOverride: false,
    active: true,
    passwordHash: 'X',
    createdAt: '',
    auditLog: [],
    department: null,
  }
}

function ameet(): User {
  return {
    id: 'ameet.z',
    name: 'Ameet Zaveri',
    email: 'a@example.test',
    role: 'Admin',
    testingOverride: false,
    active: true,
    passwordHash: 'X',
    createdAt: '',
    auditLog: [],
    department: null,
  }
}

describe('/ action-first homepage', () => {
  it('redirects unauthenticated callers to /login', async () => {
    getCurrentUserMock.mockResolvedValue(null)
    const { default: HomePage } = await import('./page')
    await expect(HomePage()).rejects.toThrow('REDIRECT:/login?next=%2F')
  })

  it('admin sees the action-queue root with a greeting', async () => {
    getCurrentUserMock.mockResolvedValue(admin())
    const { default: HomePage } = await import('./page')
    const html = renderToStaticMarkup(await HomePage())
    expect(html).toContain('data-testid="action-queue-root"')
    expect(html).toMatch(/Good (morning|afternoon|evening), Anish/)
    expect(html).toContain('Admin') // role tag chip
  })

  it('admin queue includes the null-productSelection data-quality card', async () => {
    // The fixture data carries MOUs with null productSelection in
    // src/data/mous.json; the engine surfaces them as a card. The
    // homepage admin partition pushes all non-AI items to "Your queue".
    getCurrentUserMock.mockResolvedValue(admin())
    const { default: HomePage } = await import('./page')
    const html = renderToStaticMarkup(await HomePage())
    expect(html).toContain('data-quality:null-productSelection')
    expect(html).toContain('/admin/product-backfill')
  })

  it('Ameet sees the leadership aggregate instead of a personal queue', async () => {
    getCurrentUserMock.mockResolvedValue(ameet())
    const { default: HomePage } = await import('./page')
    const html = renderToStaticMarkup(await HomePage())
    expect(html).toContain('data-testid="leadership-aggregate-root"')
    expect(html).toContain('data-testid="platform-pulse"')
    expect(html).not.toContain('data-testid="action-queue-root"')
  })

  it('footer links to /dashboard/overview (legacy 5-zone surface)', async () => {
    getCurrentUserMock.mockResolvedValue(admin())
    const { default: HomePage } = await import('./page')
    const html = renderToStaticMarkup(await HomePage())
    expect(html).toContain('href="/dashboard/overview"')
  })

  it('contains no em-dash characters', async () => {
    getCurrentUserMock.mockResolvedValue(admin())
    const { default: HomePage } = await import('./page')
    const html = renderToStaticMarkup(await HomePage())
    // Construct the dash from its codepoint so docs-lint does not
    // trip on the test source itself.
    expect(html).not.toContain(String.fromCharCode(0x2014))
  })
})
