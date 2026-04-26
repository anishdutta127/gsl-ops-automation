import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('@/lib/deliveryAck/acknowledgeDispatch', () => ({
  acknowledgeDispatch: vi.fn(),
}))

vi.mock('@/lib/auth/session', () => ({
  getCurrentSession: vi.fn(),
}))

import { POST } from './route'
import { acknowledgeDispatch } from '@/lib/deliveryAck/acknowledgeDispatch'
import { getCurrentSession } from '@/lib/auth/session'

const ackMock = acknowledgeDispatch as ReturnType<typeof vi.fn>
const sessionMock = getCurrentSession as ReturnType<typeof vi.fn>

function buildRequest(body: Record<string, string>): Request {
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(body)) params.set(k, v)
  return new Request('http://localhost/api/delivery-ack/acknowledge', {
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

describe('POST /api/delivery-ack/acknowledge', () => {
  it('happy path: 303 to delivery-ack page with acknowledged=DSP-...', async () => {
    ackMock.mockResolvedValue({
      ok: true,
      dispatch: { id: 'DSP-MOU-X-i1', stage: 'acknowledged' },
    })
    const res = await POST(buildRequest({
      dispatchId: 'DSP-MOU-X-i1',
      mouId: 'MOU-X',
      signedHandoverFormUrl: 'https://drive.google.com/file/d/abc/view',
    }))
    expect(res.status).toBe(303)
    const loc = res.headers.get('location') ?? ''
    expect(loc).toContain('/mous/MOU-X/delivery-ack')
    expect(loc).toContain('acknowledged=DSP-MOU-X-i1')
  })

  it('lib failure (invalid-url) -> 303 with error=invalid-url', async () => {
    ackMock.mockResolvedValue({ ok: false, reason: 'invalid-url' })
    const res = await POST(buildRequest({
      dispatchId: 'DSP-MOU-X-i1',
      mouId: 'MOU-X',
      signedHandoverFormUrl: 'not-a-url',
    }))
    expect(res.headers.get('location')).toContain('error=invalid-url')
  })

  it('lib failure (already-acknowledged) -> 303 with error=already-acknowledged', async () => {
    ackMock.mockResolvedValue({ ok: false, reason: 'already-acknowledged' })
    const res = await POST(buildRequest({
      dispatchId: 'DSP-MOU-X-i1',
      mouId: 'MOU-X',
      signedHandoverFormUrl: 'https://drive.google.com/file',
    }))
    expect(res.headers.get('location')).toContain('error=already-acknowledged')
  })

  it('permission denied -> 303 with error=permission', async () => {
    ackMock.mockResolvedValue({ ok: false, reason: 'permission' })
    const res = await POST(buildRequest({
      dispatchId: 'DSP-MOU-X-i1',
      mouId: 'MOU-X',
      signedHandoverFormUrl: 'https://drive.google.com/file',
    }))
    expect(res.headers.get('location')).toContain('error=permission')
  })

  it('missing dispatchId -> error=missing-dispatch (no lib call)', async () => {
    const res = await POST(buildRequest({
      mouId: 'MOU-X',
      signedHandoverFormUrl: 'https://drive.google.com/file',
    }))
    expect(res.headers.get('location')).toContain('error=missing-dispatch')
    expect(ackMock).not.toHaveBeenCalled()
  })

  it('missing URL -> error=missing-url (no lib call)', async () => {
    const res = await POST(buildRequest({
      dispatchId: 'DSP-MOU-X-i1',
      mouId: 'MOU-X',
    }))
    expect(res.headers.get('location')).toContain('error=missing-url')
    expect(ackMock).not.toHaveBeenCalled()
  })

  it('rejects unauthenticated request to /login', async () => {
    sessionMock.mockResolvedValue(null)
    const res = await POST(buildRequest({
      dispatchId: 'DSP-X',
      mouId: 'MOU-X',
      signedHandoverFormUrl: 'https://drive.google.com/file',
    }))
    const loc = res.headers.get('location') ?? ''
    expect(loc).toContain('/login')
    expect(loc).toContain('next=%2Fmous%2FMOU-X%2Fdelivery-ack')
  })
})
