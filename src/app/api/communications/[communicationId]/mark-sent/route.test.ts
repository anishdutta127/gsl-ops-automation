import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('@/lib/communications/markSent', () => ({
  markCommunicationSent: vi.fn(),
}))

vi.mock('@/lib/auth/session', () => ({
  getCurrentSession: vi.fn(),
}))

import { POST } from './route'
import { markCommunicationSent } from '@/lib/communications/markSent'
import { getCurrentSession } from '@/lib/auth/session'

const markMock = markCommunicationSent as ReturnType<typeof vi.fn>
const sessionMock = getCurrentSession as ReturnType<typeof vi.fn>

function buildRequest(body: Record<string, string>): Request {
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(body)) params.set(k, v)
  return new Request('http://localhost/api/communications/COM-FBR-001/mark-sent', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  sessionMock.mockResolvedValue({
    sub: 'pradeep.r', email: 'p@example.test', name: 'Pradeep', role: 'OpsHead',
  })
})

describe('POST /api/communications/[communicationId]/mark-sent', () => {
  it('happy path: 303 back to feedback-request page with marked=sent', async () => {
    markMock.mockResolvedValue({ ok: true, communication: { id: 'COM-FBR-001', status: 'sent' } })
    const res = await POST(
      buildRequest({ mouId: 'MOU-X' }),
      { params: Promise.resolve({ communicationId: 'COM-FBR-001' }) },
    )
    expect(res.status).toBe(303)
    const loc = res.headers.get('location') ?? ''
    expect(loc).toContain('/mous/MOU-X/feedback-request')
    expect(loc).toContain('communicationId=COM-FBR-001')
    expect(loc).toContain('marked=sent')
  })

  it('lib failure (already-sent) -> 303 with error=already-sent', async () => {
    markMock.mockResolvedValue({ ok: false, reason: 'already-sent' })
    const res = await POST(
      buildRequest({ mouId: 'MOU-X' }),
      { params: Promise.resolve({ communicationId: 'COM-FBR-001' }) },
    )
    expect(res.headers.get('location')).toContain('error=already-sent')
  })

  it('permission denied -> 303 with error=permission', async () => {
    markMock.mockResolvedValue({ ok: false, reason: 'permission' })
    const res = await POST(
      buildRequest({ mouId: 'MOU-X' }),
      { params: Promise.resolve({ communicationId: 'COM-FBR-001' }) },
    )
    expect(res.headers.get('location')).toContain('error=permission')
  })

  it('rejects unauthenticated request to /login', async () => {
    sessionMock.mockResolvedValue(null)
    const res = await POST(
      buildRequest({ mouId: 'MOU-X' }),
      { params: Promise.resolve({ communicationId: 'COM-FBR-001' }) },
    )
    const loc = res.headers.get('location') ?? ''
    expect(loc).toContain('/login')
    expect(loc).toContain('next=%2Fmous%2FMOU-X%2Ffeedback-request')
  })
})
