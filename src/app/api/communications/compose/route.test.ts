import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('@/lib/communications/composeFeedbackRequest', () => ({
  composeFeedbackRequest: vi.fn(),
}))

vi.mock('@/lib/auth/session', () => ({
  getCurrentSession: vi.fn(),
}))

import { POST } from './route'
import { composeFeedbackRequest } from '@/lib/communications/composeFeedbackRequest'
import { getCurrentSession } from '@/lib/auth/session'

const composeMock = composeFeedbackRequest as ReturnType<typeof vi.fn>
const sessionMock = getCurrentSession as ReturnType<typeof vi.fn>

function buildRequest(body: Record<string, string>): Request {
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(body)) params.set(k, v)
  return new Request('http://localhost/api/communications/compose', {
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

describe('POST /api/communications/compose', () => {
  it('happy path: 303 to /mous/<id>/feedback-request?communicationId=COM-FBR-...', async () => {
    composeMock.mockResolvedValue({
      ok: true,
      communication: { id: 'COM-FBR-abc123' },
      magicLinkToken: { id: 'MLT-FB-abc123' },
      email: { subject: 'X', html: '', text: '' },
      whatsapp: 'Hi',
      magicLinkUrl: 'https://x/feedback/MLT-FB-abc123?h=y',
    })
    const res = await POST(buildRequest({ mouId: 'MOU-X', installmentSeq: '1' }))
    expect(res.status).toBe(303)
    const loc = res.headers.get('location') ?? ''
    expect(loc).toContain('/mous/MOU-X/feedback-request')
    expect(loc).toContain('communicationId=COM-FBR-abc123')
  })

  it('lib failure (school-email-missing) -> 303 back with error param', async () => {
    composeMock.mockResolvedValue({ ok: false, reason: 'school-email-missing' })
    const res = await POST(buildRequest({ mouId: 'MOU-X', installmentSeq: '1' }))
    expect(res.headers.get('location')).toContain('error=school-email-missing')
  })

  it('permission denied -> 303 with error=permission', async () => {
    composeMock.mockResolvedValue({ ok: false, reason: 'permission' })
    const res = await POST(buildRequest({ mouId: 'MOU-X', installmentSeq: '1' }))
    expect(res.headers.get('location')).toContain('error=permission')
  })

  it('missing mouId -> 303 to /dashboard with error=missing-mou (no lib call)', async () => {
    const res = await POST(buildRequest({ installmentSeq: '1' }))
    expect(res.headers.get('location')).toContain('error=missing-mou')
    expect(composeMock).not.toHaveBeenCalled()
  })

  it('non-numeric installmentSeq -> 303 with error=invalid-installment-seq (no lib call)', async () => {
    const res = await POST(buildRequest({ mouId: 'MOU-X', installmentSeq: 'abc' }))
    expect(res.headers.get('location')).toContain('error=invalid-installment-seq')
    expect(composeMock).not.toHaveBeenCalled()
  })

  it('rejects unauthenticated request to /login with next preserved', async () => {
    sessionMock.mockResolvedValue(null)
    const res = await POST(buildRequest({ mouId: 'MOU-X', installmentSeq: '1' }))
    const loc = res.headers.get('location') ?? ''
    expect(loc).toContain('/login')
    expect(loc).toContain('next=%2Fmous%2FMOU-X%2Ffeedback-request')
  })
})
