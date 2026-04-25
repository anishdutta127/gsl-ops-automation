/*
 * Middleware sliding-refresh tests.
 *
 * Mocks @/lib/crypto/jwt to control verifySessionToken's `iat`
 * field and to spy on issueSessionToken. Asserts:
 *   - iat older than 1 day -> response carries Set-Cookie with the
 *     fresh JWT (refresh fired)
 *   - iat younger than 1 day -> NO Set-Cookie (refresh skipped)
 *   - public routes are not gated and do not trigger refresh
 *   - missing cookie -> redirects to /login?next=<path>
 *   - invalid token -> redirects + clears cookie
 */

import { describe, expect, it, vi, beforeEach } from 'vitest'

const verifyMock = vi.fn()
const issueMock = vi.fn(async (_params: unknown) => 'new-rotated-token')

vi.mock('@/lib/crypto/jwt', () => ({
  SESSION_COOKIE_NAME: 'gsl_ops_session',
  verifySessionToken: (token: string) => verifyMock(token),
  issueSessionToken: (params: unknown) => issueMock(params),
  sessionCookieOptions: () => ({
    httpOnly: true,
    secure: false,
    sameSite: 'strict' as const,
    path: '/',
    maxAge: 604800,
  }),
}))

import { middleware } from './middleware'
import { NextRequest } from 'next/server'

function makeRequest(path: string, cookieValue?: string): NextRequest {
  const headers: Record<string, string> = {}
  if (cookieValue) headers.cookie = `gsl_ops_session=${cookieValue}`
  return new NextRequest(`http://localhost${path}`, { headers })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('middleware sliding-refresh', () => {
  it('iat older than 1 day -> Set-Cookie with new token', async () => {
    const now = Math.floor(Date.now() / 1000)
    verifyMock.mockResolvedValue({
      sub: 'anish.d',
      email: 'anish.d@example.test',
      name: 'Anish',
      role: 'Admin',
      iat: now - 2 * 86400, // 2 days old
    })
    const res = await middleware(makeRequest('/dashboard', 'old-token'))
    expect(issueMock).toHaveBeenCalledTimes(1)
    const setCookie = res.headers.get('set-cookie') ?? ''
    expect(setCookie).toContain('gsl_ops_session=new-rotated-token')
  })

  it('iat under 1 day -> no Set-Cookie (refresh skipped)', async () => {
    const now = Math.floor(Date.now() / 1000)
    verifyMock.mockResolvedValue({
      sub: 'anish.d',
      email: 'anish.d@example.test',
      name: 'Anish',
      role: 'Admin',
      iat: now - 6 * 3600, // 6 hours old
    })
    const res = await middleware(makeRequest('/dashboard', 'fresh-token'))
    expect(issueMock).not.toHaveBeenCalled()
    expect(res.headers.get('set-cookie') ?? '').not.toContain(
      'gsl_ops_session=new-rotated-token',
    )
  })

  it('iat exactly at threshold -> no refresh (boundary is strict greater)', async () => {
    const now = Math.floor(Date.now() / 1000)
    verifyMock.mockResolvedValue({
      sub: 'anish.d',
      email: 'anish.d@example.test',
      name: 'Anish',
      role: 'Admin',
      iat: now - 86400, // exactly 1 day old
    })
    await middleware(makeRequest('/dashboard', 'boundary-token'))
    expect(issueMock).not.toHaveBeenCalled()
  })
})

describe('middleware auth gating', () => {
  it('missing cookie redirects to /login?next=<path>', async () => {
    const res = await middleware(makeRequest('/dashboard'))
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('/login')
    expect(res.headers.get('location')).toContain('next=%2Fdashboard')
  })

  it('invalid token redirects + clears cookie', async () => {
    verifyMock.mockResolvedValue(null)
    const res = await middleware(makeRequest('/dashboard', 'bad-token'))
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('/login')
    expect(res.headers.get('set-cookie') ?? '').toContain('gsl_ops_session=')
    expect(res.headers.get('set-cookie')?.toLowerCase() ?? '').toMatch(
      /max-age=0|expires=/,
    )
  })

  it('/login is public, no verify call, no refresh attempt', async () => {
    const res = await middleware(makeRequest('/login'))
    // NextResponse.next() does not redirect; status is whatever the underlying
    // response is. We just assert no verify/issue calls happened.
    expect(verifyMock).not.toHaveBeenCalled()
    expect(issueMock).not.toHaveBeenCalled()
    expect(res.headers.get('location')).toBeNull()
  })

  it('/feedback/<token> is public', async () => {
    await middleware(makeRequest('/feedback/some-token'))
    expect(verifyMock).not.toHaveBeenCalled()
  })

  it('/portal/status/<token> is public', async () => {
    await middleware(makeRequest('/portal/status/some-token'))
    expect(verifyMock).not.toHaveBeenCalled()
  })
})
