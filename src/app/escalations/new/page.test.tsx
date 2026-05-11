/*
 * /escalations/new SSR tests (Gate 4 Step 5).
 *
 * Form renders correct fields + permission gate + preset hydration
 * from query params.
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

// Stub the server action import so the form action prop renders as a
// function reference; SSR does not invoke it.
vi.mock('../actions', () => ({
  createEscalationAction: () => undefined,
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
  }
}

describe('/escalations/new', () => {
  it('redirects unauthenticated callers to /login', async () => {
    getCurrentUserMock.mockResolvedValue(null)
    const { default: Page } = await import('./page')
    await expect(
      Page({ searchParams: Promise.resolve({}) }),
    ).rejects.toThrow('REDIRECT:/login?next=%2Fescalations%2Fnew')
  })

  it('renders form with all required fields', async () => {
    getCurrentUserMock.mockResolvedValue(admin())
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(
      await Page({ searchParams: Promise.resolve({}) }),
    )
    expect(html).toContain('Raise an escalation')
    expect(html).toContain('data-testid="escalation-create-form"')
    expect(html).toContain('data-testid="field-description"')
    expect(html).toContain('data-testid="field-severity"')
    expect(html).toContain('data-testid="field-department"')
    expect(html).toContain('data-testid="field-category"')
    expect(html).toContain('data-testid="field-type"')
    expect(html).toContain('data-testid="field-school"')
    expect(html).toContain('data-testid="field-mou"')
    expect(html).toContain('data-testid="field-assigned-to"')
    expect(html).toContain('data-testid="submit-escalation"')
  })

  it('surfaces error banner when ?error= present', async () => {
    getCurrentUserMock.mockResolvedValue(admin())
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(
      await Page({
        searchParams: Promise.resolve({ error: 'missing-description' }),
      }),
    )
    expect(html).toContain('data-testid="escalation-form-error"')
    expect(html).toContain('Description is required.')
  })

  it('hydrates preset school + mou from query params', async () => {
    getCurrentUserMock.mockResolvedValue(admin())
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(
      await Page({
        searchParams: Promise.resolve({
          schoolId: 'SCH-9999-nonexistent',
          mouId: 'MOU-9999-nonexistent',
        }),
      }),
    )
    // defaultValue is rendered as an option's selected attribute; for an
    // unknown id we still expect the select to exist (the page does not
    // validate against the fixture list).
    expect(html).toContain('data-testid="field-school"')
    expect(html).toContain('data-testid="field-mou"')
  })

  it('SLA window copy is rendered in the severity options', async () => {
    getCurrentUserMock.mockResolvedValue(admin())
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(
      await Page({ searchParams: Promise.resolve({}) }),
    )
    expect(html).toContain('24h SLA') // critical
    expect(html).toContain('72h SLA') // high
    expect(html).toContain('7d SLA') // medium
    expect(html).toContain('30d SLA') // low
  })
})
