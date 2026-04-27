/*
 * /api/login route handler tests.
 *
 * Mocks @/lib/auth/login authenticateLogin so we control the
 * pass/fail decision per case; mocks @/lib/crypto/jwt issueSessionToken
 * to avoid HMAC sign cost in tests. The route handler under test is
 * responsible for: form parsing, next-param validation, success
 * redirect target, error redirect target with preserved next, and
 * the cookie set on success.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth/login', () => ({
  authenticateLogin: vi.fn(),
}))

vi.mock('@/lib/crypto/jwt', () => ({
  SESSION_COOKIE_NAME: 'gsl_ops_session',
  issueSessionToken: vi.fn(async () => 'mock-jwt-token'),
  sessionCookieOptions: () => ({
    httpOnly: true,
    secure: false,
    sameSite: 'strict' as const,
    path: '/',
    maxAge: 604800,
  }),
}))

import { POST } from './route'
import { authenticateLogin } from '@/lib/auth/login'
import type { User } from '@/lib/types'

const mockAuthn = authenticateLogin as ReturnType<typeof vi.fn>

function fakeUser(): User {
  return {
    id: 'anish.d',
    name: 'Anish Dutta',
    email: 'anish.d@example.test',
    role: 'Admin',
    testingOverride: false,
    active: true,
    passwordHash: 'X',
    createdAt: '2026-01-01T00:00:00Z',
    auditLog: [],
  }
}

function buildRequest(body: Record<string, string>): Request {
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(body)) params.set(k, v)
  return new Request('http://localhost/api/login', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('POST /api/login', () => {
  it('happy path: 303 redirect to / (kanban-first default) with Set-Cookie', async () => {
    mockAuthn.mockResolvedValue({ ok: true, user: fakeUser() })
    const res = await POST(
      buildRequest({ email: 'anish.d@example.test', password: 'GSL#123' }),
    )
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toBe('http://localhost/')
    const setCookie = res.headers.get('set-cookie') ?? ''
    expect(setCookie).toContain('gsl_ops_session=mock-jwt-token')
  })

  it('happy path with valid next: redirects to next, cookie still set', async () => {
    mockAuthn.mockResolvedValue({ ok: true, user: fakeUser() })
    const res = await POST(
      buildRequest({
        email: 'anish.d@example.test',
        password: 'GSL#123',
        next: '/admin/audit?action=p2-override',
      }),
    )
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toBe(
      'http://localhost/admin/audit?action=p2-override',
    )
    expect(res.headers.get('set-cookie') ?? '').toContain('gsl_ops_session=')
  })

  it('happy path with INVALID next falls back to / (W3-G default), cookie still set', async () => {
    mockAuthn.mockResolvedValue({ ok: true, user: fakeUser() })
    const res = await POST(
      buildRequest({
        email: 'anish.d@example.test',
        password: 'GSL#123',
        next: '//evil.com/dashboard',
      }),
    )
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toBe('http://localhost/')
    expect(res.headers.get('set-cookie') ?? '').toContain('gsl_ops_session=')
  })

  it('rejects with 303 to /login?error=invalid on wrong password', async () => {
    mockAuthn.mockResolvedValue({ ok: false, reason: 'wrong-password' })
    const res = await POST(
      buildRequest({ email: 'anish.d@example.test', password: 'wrong' }),
    )
    expect(res.status).toBe(303)
    const loc = res.headers.get('location') ?? ''
    expect(loc).toContain('/login')
    expect(loc).toContain('error=invalid')
    expect(res.headers.get('set-cookie') ?? '').not.toContain('gsl_ops_session=')
  })

  it('rejects with 303 to /login on unknown user (same shape as wrong password)', async () => {
    mockAuthn.mockResolvedValue({ ok: false, reason: 'unknown-user' })
    const res = await POST(
      buildRequest({ email: 'nobody@example.test', password: 'GSL#123' }),
    )
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toContain('error=invalid')
  })

  it('rejects with 303 to /login on inactive user (same generic error, no enumeration)', async () => {
    mockAuthn.mockResolvedValue({ ok: false, reason: 'inactive' })
    const res = await POST(
      buildRequest({ email: 'inactive@example.test', password: 'GSL#123' }),
    )
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toContain('error=invalid')
    expect(res.headers.get('location')).not.toContain('inactive')
  })

  it('rejects with 303 on missing fields', async () => {
    mockAuthn.mockResolvedValue({ ok: false, reason: 'missing-fields' })
    const res = await POST(buildRequest({ email: '', password: '' }))
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toContain('error=invalid')
  })

  it('preserves valid next on reject path', async () => {
    mockAuthn.mockResolvedValue({ ok: false, reason: 'wrong-password' })
    const res = await POST(
      buildRequest({
        email: 'anish.d@example.test',
        password: 'wrong',
        next: '/admin/audit',
      }),
    )
    const loc = res.headers.get('location') ?? ''
    expect(loc).toContain('next=%2Fadmin%2Faudit')
  })

  it('drops invalid next on reject path (does not preserve unsafe value)', async () => {
    mockAuthn.mockResolvedValue({ ok: false, reason: 'wrong-password' })
    const res = await POST(
      buildRequest({
        email: 'anish.d@example.test',
        password: 'wrong',
        next: '//evil.com',
      }),
    )
    const loc = res.headers.get('location') ?? ''
    expect(loc).not.toContain('evil.com')
  })
})
