/*
 * /today action-queue drill-down tests (Phase 6F.1).
 *
 * Phase 6F.1 (2026-05-23) moved the action-first queue from `/` to
 * `/today`; the front door now hosts the 5-zone landing. These tests
 * follow the relocation. The greeting, role tag, queue partitioning,
 * and leadership-aggregate branch behave the same; only the URL and
 * the unauthenticated-redirect target change.
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

describe('/today action-queue drill-down', () => {
  it('redirects unauthenticated callers to /login with next=/today', async () => {
    getCurrentUserMock.mockResolvedValue(null)
    const { default: TodayPage } = await import('./page')
    await expect(TodayPage()).rejects.toThrow('REDIRECT:/login?next=%2Ftoday')
  })

  it('admin sees the action-queue root with a greeting', async () => {
    getCurrentUserMock.mockResolvedValue(admin())
    const { default: TodayPage } = await import('./page')
    const html = renderToStaticMarkup(await TodayPage())
    expect(html).toContain('data-testid="action-queue-root"')
    expect(html).toMatch(/Good (morning|afternoon|evening), Anish/)
    expect(html).toContain('Admin') // role tag chip
  })

  it('admin queue includes the null-productSelection data-quality card', async () => {
    getCurrentUserMock.mockResolvedValue(admin())
    const { default: TodayPage } = await import('./page')
    const html = renderToStaticMarkup(await TodayPage())
    expect(html).toContain('data-quality:null-productSelection')
    expect(html).toContain('/admin/product-backfill')
  })

  it('Ameet sees the leadership aggregate instead of a personal queue', async () => {
    getCurrentUserMock.mockResolvedValue(ameet())
    const { default: TodayPage } = await import('./page')
    const html = renderToStaticMarkup(await TodayPage())
    expect(html).toContain('data-testid="leadership-aggregate-root"')
    expect(html).toContain('data-testid="platform-pulse"')
    expect(html).not.toContain('data-testid="action-queue-root"')
  })

  it('footer link to the 5-zone overview points back to / (where the landing lives post-6F.1)', async () => {
    getCurrentUserMock.mockResolvedValue(admin())
    const { default: TodayPage } = await import('./page')
    const html = renderToStaticMarkup(await TodayPage())
    expect(html).toContain('href="/"')
    expect(html).not.toContain('href="/dashboard/overview"')
  })

  it('contains no em-dash characters', async () => {
    getCurrentUserMock.mockResolvedValue(admin())
    const { default: TodayPage } = await import('./page')
    const html = renderToStaticMarkup(await TodayPage())
    expect(html).not.toContain(String.fromCharCode(0x2014))
  })
})
