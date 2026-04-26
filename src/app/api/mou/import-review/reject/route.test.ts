/*
 * /api/mou/import-review/reject route handler tests.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('@/lib/mou/rejectImportReview', () => ({
  rejectImportReview: vi.fn(),
}))

vi.mock('@/lib/auth/session', () => ({
  getCurrentSession: vi.fn(),
}))

import { POST } from './route'
import { rejectImportReview } from '@/lib/mou/rejectImportReview'
import { getCurrentSession } from '@/lib/auth/session'

const rejectMock = rejectImportReview as ReturnType<typeof vi.fn>
const sessionMock = getCurrentSession as ReturnType<typeof vi.fn>

function buildRequest(body: Record<string, string>): Request {
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(body)) params.set(k, v)
  return new Request('http://localhost/api/mou/import-review/reject', {
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

describe('POST /api/mou/import-review/reject', () => {
  it('happy path: 303 to /admin/mou-import-review on success', async () => {
    rejectMock.mockResolvedValue({ ok: true, item: {} })
    const res = await POST(buildRequest({
      queuedAt: '2026-04-22T13:45:00Z',
      rawRecordId: 'MOU-VEX-2627-XX1',
      rejectionReason: 'data-quality-issue',
    }))
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toBe('http://localhost/admin/mou-import-review')
  })

  it('lib failure -> 303 back with error param', async () => {
    rejectMock.mockResolvedValue({ ok: false, reason: 'notes-required' })
    const res = await POST(buildRequest({
      queuedAt: '2026-04-22T13:45:00Z',
      rawRecordId: 'MOU-VEX-2627-XX1',
      rejectionReason: 'other',
    }))
    expect(res.status).toBe(303)
    const loc = res.headers.get('location') ?? ''
    expect(loc).toContain('/admin/mou-import-review')
    expect(loc).toContain('error=notes-required')
  })

  it('missing queuedAt -> error=missing-queued-at without lib call', async () => {
    const res = await POST(buildRequest({
      rawRecordId: 'MOU-X', rejectionReason: 'data-quality-issue',
    }))
    expect(res.headers.get('location')).toContain('error=missing-queued-at')
    expect(rejectMock).not.toHaveBeenCalled()
  })

  it('rejects unauthenticated request to /login with next preserved', async () => {
    sessionMock.mockResolvedValue(null)
    const res = await POST(buildRequest({
      queuedAt: '2026-04-22T13:45:00Z',
      rawRecordId: 'MOU-X', rejectionReason: 'data-quality-issue',
    }))
    expect(res.status).toBe(303)
    const loc = res.headers.get('location') ?? ''
    expect(loc).toContain('/login')
    expect(loc).toContain('next=%2Fadmin%2Fmou-import-review')
  })
})
