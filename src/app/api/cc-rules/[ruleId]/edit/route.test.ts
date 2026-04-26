/*
 * /api/cc-rules/[ruleId]/edit route handler tests.
 *
 * Mocks editCcRule + getCurrentSession. Asserts patch shape (only
 * present fields are passed), redirect targets, and auth flow.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('@/lib/ccRules/editCcRule', () => ({
  editCcRule: vi.fn(),
}))

vi.mock('@/lib/auth/session', () => ({
  getCurrentSession: vi.fn(),
}))

import { POST } from './route'
import { editCcRule } from '@/lib/ccRules/editCcRule'
import { getCurrentSession } from '@/lib/auth/session'

const editMock = editCcRule as ReturnType<typeof vi.fn>
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
  return new Request('http://localhost/api/cc-rules/CCR-X/edit', {
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

describe('POST /api/cc-rules/[ruleId]/edit', () => {
  it('happy path: 303 redirect to detail on success', async () => {
    editMock.mockResolvedValue({ ok: true, rule: { id: 'CCR-X' } })
    const res = await POST(
      buildRequest({ sourceRuleText: 'Updated' }),
      { params: Promise.resolve({ ruleId: 'CCR-X' }) },
    )
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toBe('http://localhost/admin/cc-rules/CCR-X')
  })

  it('omits fields not present in the form (patch only carries submitted fields)', async () => {
    editMock.mockResolvedValue({ ok: true, rule: { id: 'CCR-X' } })
    await POST(
      buildRequest({ sourceRuleText: 'Updated' }),
      { params: Promise.resolve({ ruleId: 'CCR-X' }) },
    )
    const args = editMock.mock.calls[0]![0]
    expect(args.patch).toEqual({ sourceRuleText: 'Updated' })
  })

  it('lib failure -> 303 to detail with error param', async () => {
    editMock.mockResolvedValue({ ok: false, reason: 'no-change' })
    const res = await POST(
      buildRequest({ sourceRuleText: 'Same' }),
      { params: Promise.resolve({ ruleId: 'CCR-X' }) },
    )
    expect(res.status).toBe(303)
    const loc = res.headers.get('location') ?? ''
    expect(loc).toContain('/admin/cc-rules/CCR-X')
    expect(loc).toContain('error=no-change')
  })

  it('rejects unauthenticated request to /login with next preserved', async () => {
    sessionMock.mockResolvedValue(null)
    const res = await POST(
      buildRequest({ sourceRuleText: 'X' }),
      { params: Promise.resolve({ ruleId: 'CCR-X' }) },
    )
    expect(res.status).toBe(303)
    const loc = res.headers.get('location') ?? ''
    expect(loc).toContain('/login')
    expect(loc).toContain('next=%2Fadmin%2Fcc-rules%2FCCR-X')
    expect(editMock).not.toHaveBeenCalled()
  })
})
