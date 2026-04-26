/*
 * /api/cc-rules/create route handler tests.
 *
 * Mocks createCcRule + getCurrentSession. Asserts redirect targets
 * (success, failure with error param, no-session with next).
 */

import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('@/lib/ccRules/createCcRule', () => ({
  createCcRule: vi.fn(),
}))

vi.mock('@/lib/auth/session', () => ({
  getCurrentSession: vi.fn(),
}))

import { POST } from './route'
import { createCcRule } from '@/lib/ccRules/createCcRule'
import { getCurrentSession } from '@/lib/auth/session'

const createMock = createCcRule as ReturnType<typeof vi.fn>
const sessionMock = getCurrentSession as ReturnType<typeof vi.fn>

function buildRequest(body: Record<string, string | string[]>): Request {
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(body)) {
    if (Array.isArray(v)) {
      for (const item of v) params.append(k, item)
    } else {
      params.set(k, v)
    }
  }
  return new Request('http://localhost/api/cc-rules/create', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  sessionMock.mockResolvedValue({
    sub: 'anish.d', email: 'a@example.test', name: 'Anish', role: 'Admin',
  })
})

describe('POST /api/cc-rules/create', () => {
  it('happy path: 303 redirect to /admin/cc-rules on success', async () => {
    createMock.mockResolvedValue({ ok: true, rule: { id: 'CCR-X' } })
    const res = await POST(buildRequest({
      id: 'CCR-X', sheet: 'East', scope: 'region',
      scopeValue: 'East', contexts: ['all-communications'],
      ccUserIds: 'anish.d', sourceRuleText: 'X',
    }))
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toBe('http://localhost/admin/cc-rules')
  })

  it('parses comma-separated scopeValue into array', async () => {
    createMock.mockResolvedValue({ ok: true, rule: { id: 'CCR-X' } })
    await POST(buildRequest({
      id: 'CCR-X', sheet: 'South-West', scope: 'sub-region',
      scopeValue: 'Raipur, Pune, Nagpur',
      contexts: ['all-communications'], ccUserIds: 'anish.d',
      sourceRuleText: 'X',
    }))
    const args = createMock.mock.calls[0]![0]
    expect(args.scopeValue).toEqual(['Raipur', 'Pune', 'Nagpur'])
  })

  it('keeps single-token scopeValue as string', async () => {
    createMock.mockResolvedValue({ ok: true, rule: { id: 'CCR-X' } })
    await POST(buildRequest({
      id: 'CCR-X', sheet: 'South-West', scope: 'sub-region',
      scopeValue: 'Bangalore',
      contexts: ['all-communications'], ccUserIds: 'anish.d',
      sourceRuleText: 'X',
    }))
    const args = createMock.mock.calls[0]![0]
    expect(args.scopeValue).toBe('Bangalore')
  })

  it('lib failure -> 303 to /new with error param', async () => {
    createMock.mockResolvedValue({ ok: false, reason: 'permission' })
    const res = await POST(buildRequest({
      id: 'CCR-X', sheet: 'East', scope: 'region', scopeValue: 'East',
      contexts: ['all-communications'], ccUserIds: 'anish.d',
      sourceRuleText: 'X',
    }))
    expect(res.status).toBe(303)
    const loc = res.headers.get('location') ?? ''
    expect(loc).toContain('/admin/cc-rules/new')
    expect(loc).toContain('error=permission')
  })

  it('rejects unauthenticated request to /login with next preserved', async () => {
    sessionMock.mockResolvedValue(null)
    const res = await POST(buildRequest({
      id: 'CCR-X', sheet: 'East', scope: 'region', scopeValue: 'East',
      contexts: ['all-communications'], ccUserIds: 'anish.d',
      sourceRuleText: 'X',
    }))
    expect(res.status).toBe(303)
    const loc = res.headers.get('location') ?? ''
    expect(loc).toContain('/login')
    expect(loc).toContain('next=%2Fadmin%2Fcc-rules%2Fnew')
    expect(createMock).not.toHaveBeenCalled()
  })
})
