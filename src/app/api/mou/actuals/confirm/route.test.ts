/*
 * /api/mou/actuals/confirm route handler tests.
 *
 * Mocks confirmActuals + getCurrentSession. Asserts: success →
 * 303 redirect to detail; failure → 303 redirect back to /actuals
 * with error param; no session → 303 redirect to /login with next.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('@/lib/mou/confirmActuals', () => ({
  confirmActuals: vi.fn(),
}))

vi.mock('@/lib/auth/session', () => ({
  getCurrentSession: vi.fn(),
}))

import { POST } from './route'
import { confirmActuals } from '@/lib/mou/confirmActuals'
import { getCurrentSession } from '@/lib/auth/session'

const confirmMock = confirmActuals as ReturnType<typeof vi.fn>
const sessionMock = getCurrentSession as ReturnType<typeof vi.fn>

function buildRequest(body: Record<string, string>): Request {
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(body)) params.set(k, v)
  return new Request('http://localhost/api/mou/actuals/confirm', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  sessionMock.mockResolvedValue({ sub: 'pratik.d', email: 'p@example.test', name: 'Pratik', role: 'SalesHead' })
})

describe('POST /api/mou/actuals/confirm', () => {
  it('happy path: 303 redirect to /mous/<id> on success', async () => {
    confirmMock.mockResolvedValue({ ok: true, mou: {}, needsDriftReview: false, variancePct: 0 })
    const res = await POST(buildRequest({ mouId: 'MOU-X', studentsActual: '200' }))
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toBe('http://localhost/mous/MOU-X')
  })

  it('rejects unauthenticated request to /login with next preserved', async () => {
    sessionMock.mockResolvedValue(null)
    const res = await POST(buildRequest({ mouId: 'MOU-X', studentsActual: '200' }))
    expect(res.status).toBe(303)
    const loc = res.headers.get('location') ?? ''
    expect(loc).toContain('/login')
    expect(loc).toContain('next=%2Fmous%2FMOU-X%2Factuals')
  })

  it('lib failure (permission) -> 303 to /actuals with error param', async () => {
    confirmMock.mockResolvedValue({ ok: false, reason: 'permission' })
    const res = await POST(buildRequest({ mouId: 'MOU-X', studentsActual: '200' }))
    expect(res.status).toBe(303)
    const loc = res.headers.get('location') ?? ''
    expect(loc).toContain('/mous/MOU-X/actuals')
    expect(loc).toContain('error=permission')
  })

  it('non-numeric studentsActual -> 303 with error=invalid-students (no lib call)', async () => {
    const res = await POST(buildRequest({ mouId: 'MOU-X', studentsActual: 'abc' }))
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toContain('error=invalid-students')
    expect(confirmMock).not.toHaveBeenCalled()
  })

  it('missing mouId -> 303 to / (kanban) with error=missing-mou', async () => {
    const res = await POST(buildRequest({ studentsActual: '200' }))
    expect(res.status).toBe(303)
    const loc = res.headers.get('location') ?? ''
    // W3-G: missing-mouId fallback redirects to / (kanban homepage)
    // rather than /dashboard. Assert the path component, not just the
    // substring, so a future "?next=/" doesn't accidentally match.
    expect(new URL(loc).pathname).toBe('/')
    expect(loc).toContain('error=missing-mou')
  })
})
