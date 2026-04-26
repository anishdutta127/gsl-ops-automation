/*
 * /api/cc-rules/[ruleId]/toggle route handler tests.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('@/lib/ccRules/toggleCcRule', () => ({
  toggleCcRule: vi.fn(),
}))

vi.mock('@/lib/auth/session', () => ({
  getCurrentSession: vi.fn(),
}))

import { POST } from './route'
import { toggleCcRule } from '@/lib/ccRules/toggleCcRule'
import { getCurrentSession } from '@/lib/auth/session'

const toggleMock = toggleCcRule as ReturnType<typeof vi.fn>
const sessionMock = getCurrentSession as ReturnType<typeof vi.fn>

function buildRequest(body: Record<string, string>): Request {
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(body)) params.set(k, v)
  return new Request('http://localhost/api/cc-rules/CCR-X/toggle', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  sessionMock.mockResolvedValue({
    sub: 'misba.m', email: 'm@example.test', name: 'Misba', role: 'OpsHead',
  })
})

describe('POST /api/cc-rules/[ruleId]/toggle', () => {
  it('happy path enable: 303 to /admin/cc-rules on success', async () => {
    toggleMock.mockResolvedValue({ ok: true, rule: { id: 'CCR-X' } })
    const res = await POST(
      buildRequest({ enabled: 'true' }),
      { params: Promise.resolve({ ruleId: 'CCR-X' }) },
    )
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toBe('http://localhost/admin/cc-rules')
    const args = toggleMock.mock.calls[0]![0]
    expect(args.enabled).toBe(true)
  })

  it('disable with reason: passes reason through to lib', async () => {
    toggleMock.mockResolvedValue({ ok: true, rule: { id: 'CCR-X' } })
    await POST(
      buildRequest({ enabled: 'false', reason: 'paused for review' }),
      { params: Promise.resolve({ ruleId: 'CCR-X' }) },
    )
    const args = toggleMock.mock.calls[0]![0]
    expect(args.enabled).toBe(false)
    expect(args.reason).toBe('paused for review')
  })

  it('invalid enabled value -> error=invalid-enabled without lib call', async () => {
    const res = await POST(
      buildRequest({ enabled: 'maybe' }),
      { params: Promise.resolve({ ruleId: 'CCR-X' }) },
    )
    expect(res.headers.get('location')).toContain('error=invalid-enabled')
    expect(toggleMock).not.toHaveBeenCalled()
  })

  it('lib failure -> 303 with error param + ruleId', async () => {
    toggleMock.mockResolvedValue({ ok: false, reason: 'reason-required' })
    const res = await POST(
      buildRequest({ enabled: 'false' }),
      { params: Promise.resolve({ ruleId: 'CCR-X' }) },
    )
    const loc = res.headers.get('location') ?? ''
    expect(loc).toContain('error=reason-required')
    expect(loc).toContain('ruleId=CCR-X')
  })

  it('rejects unauthenticated request to /login with next preserved', async () => {
    sessionMock.mockResolvedValue(null)
    const res = await POST(
      buildRequest({ enabled: 'true' }),
      { params: Promise.resolve({ ruleId: 'CCR-X' }) },
    )
    const loc = res.headers.get('location') ?? ''
    expect(loc).toContain('/login')
    expect(loc).toContain('next=%2Fadmin%2Fcc-rules')
  })
})
