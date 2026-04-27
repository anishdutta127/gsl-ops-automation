/*
 * /login page Server Component tests.
 *
 * Mocks next/headers cookies(), next/navigation redirect(), and
 * @/lib/crypto/jwt verifySessionToken to control the already-
 * logged-in detect path. Asserts:
 *   - valid session + valid next -> redirect to next
 *   - valid session + invalid next -> redirect to / (W3-G default)
 *   - valid session + missing next -> redirect to / (W3-G default)
 *   - no cookie -> renders form
 *   - error=invalid -> inline error message rendered
 *   - valid next on form -> hidden input present so /api/login can
 *     forward
 */

import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

const cookieGetMock = vi.fn()
const verifyMock = vi.fn()
const redirectMock = vi.fn((path: string) => {
  throw new Error(`REDIRECT:${path}`)
})

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({ get: cookieGetMock })),
}))

vi.mock('next/navigation', () => ({
  redirect: (path: string) => redirectMock(path),
}))

vi.mock('@/lib/crypto/jwt', () => ({
  SESSION_COOKIE_NAME: 'gsl_ops_session',
  verifySessionToken: (token: string) => verifyMock(token),
}))

beforeEach(() => {
  vi.clearAllMocks()
})

describe('/login page (already-logged-in detect)', () => {
  it('valid session + valid next: redirects to next', async () => {
    cookieGetMock.mockReturnValue({ value: 'real-token' })
    verifyMock.mockResolvedValue({
      sub: 'anish.d',
      email: 'anish.d@example.test',
      name: 'Anish',
      role: 'Admin',
    })
    const { default: LoginPage } = await import('./page')
    await expect(
      LoginPage({
        searchParams: Promise.resolve({ next: '/admin/audit' }),
      }),
    ).rejects.toThrow('REDIRECT:/admin/audit')
  })

  it('valid session + invalid next: redirects to / (kanban-first default)', async () => {
    cookieGetMock.mockReturnValue({ value: 'real-token' })
    verifyMock.mockResolvedValue({
      sub: 'anish.d',
      email: 'anish.d@example.test',
      name: 'Anish',
      role: 'Admin',
    })
    const { default: LoginPage } = await import('./page')
    await expect(
      LoginPage({
        searchParams: Promise.resolve({ next: '//evil.com' }),
      }),
    ).rejects.toThrow('REDIRECT:/')
  })

  it('valid session + missing next: redirects to / (kanban-first default)', async () => {
    cookieGetMock.mockReturnValue({ value: 'real-token' })
    verifyMock.mockResolvedValue({
      sub: 'anish.d',
      email: 'anish.d@example.test',
      name: 'Anish',
      role: 'Admin',
    })
    const { default: LoginPage } = await import('./page')
    await expect(
      LoginPage({ searchParams: Promise.resolve({}) }),
    ).rejects.toThrow('REDIRECT:/')
  })

  it('no cookie: renders the form (no redirect thrown)', async () => {
    cookieGetMock.mockReturnValue(undefined)
    const { default: LoginPage } = await import('./page')
    const result = await LoginPage({ searchParams: Promise.resolve({}) })
    const html = renderToStaticMarkup(result)
    expect(html).toContain('<form')
    expect(html).toContain('name="email"')
    expect(html).toContain('name="password"')
    expect(html).toContain('Sign in')
    expect(redirectMock).not.toHaveBeenCalled()
  })

  it('cookie present but verify fails: renders the form', async () => {
    cookieGetMock.mockReturnValue({ value: 'expired-token' })
    verifyMock.mockResolvedValue(null)
    const { default: LoginPage } = await import('./page')
    const result = await LoginPage({ searchParams: Promise.resolve({}) })
    const html = renderToStaticMarkup(result)
    expect(html).toContain('<form')
    expect(redirectMock).not.toHaveBeenCalled()
  })

  it('error=invalid renders inline "Invalid email or password" alert', async () => {
    cookieGetMock.mockReturnValue(undefined)
    const { default: LoginPage } = await import('./page')
    const result = await LoginPage({
      searchParams: Promise.resolve({ error: 'invalid' }),
    })
    const html = renderToStaticMarkup(result)
    expect(html).toContain('Invalid email or password')
    expect(html).toContain('role="alert"')
  })

  it('preserves valid next as hidden input on form', async () => {
    cookieGetMock.mockReturnValue(undefined)
    const { default: LoginPage } = await import('./page')
    const result = await LoginPage({
      searchParams: Promise.resolve({ next: '/admin/audit' }),
    })
    const html = renderToStaticMarkup(result)
    expect(html).toContain('name="next"')
    expect(html).toContain('value="/admin/audit"')
  })

  it('does NOT preserve invalid next as hidden input', async () => {
    cookieGetMock.mockReturnValue(undefined)
    const { default: LoginPage } = await import('./page')
    const result = await LoginPage({
      searchParams: Promise.resolve({ next: '//evil.com' }),
    })
    const html = renderToStaticMarkup(result)
    expect(html).not.toContain('value="//evil.com"')
    // Hidden input absent entirely
    expect(html).not.toMatch(/name="next"\s+value/)
  })

  it('no raw hex codes in rendered HTML (token discipline)', async () => {
    cookieGetMock.mockReturnValue(undefined)
    const { default: LoginPage } = await import('./page')
    const result = await LoginPage({ searchParams: Promise.resolve({}) })
    const html = renderToStaticMarkup(result)
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,6}/)
  })
})
