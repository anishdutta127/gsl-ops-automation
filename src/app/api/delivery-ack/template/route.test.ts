import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('@/lib/deliveryAck/generateDeliveryAck', () => ({
  generateDeliveryAck: vi.fn(),
}))

vi.mock('@/lib/auth/session', () => ({
  getCurrentSession: vi.fn(),
}))

import { POST } from './route'
import { generateDeliveryAck } from '@/lib/deliveryAck/generateDeliveryAck'
import { getCurrentSession } from '@/lib/auth/session'
import { DeliveryAckTemplateMissingError } from '@/lib/deliveryAck/templates'

const generateMock = generateDeliveryAck as ReturnType<typeof vi.fn>
const sessionMock = getCurrentSession as ReturnType<typeof vi.fn>

function buildRequest(body: Record<string, string>): Request {
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(body)) params.set(k, v)
  return new Request('http://localhost/api/delivery-ack/template', {
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

describe('POST /api/delivery-ack/template', () => {
  it('happy path: 200 with .docx Content-Disposition + filename derived from dispatch id', async () => {
    const fakeBytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04])
    generateMock.mockResolvedValue({
      ok: true,
      dispatch: { id: 'DSP-MOU-X-i1' },
      docxBytes: fakeBytes,
    })
    const res = await POST(buildRequest({ dispatchId: 'DSP-MOU-X-i1', mouId: 'MOU-X' }))
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('wordprocessingml')
    const disposition = res.headers.get('content-disposition') ?? ''
    expect(disposition).toContain('DSP-MOU-X-i1-handover.docx')
  })

  it('lib failure (wrong-stage) -> 303 with error param', async () => {
    generateMock.mockResolvedValue({ ok: false, reason: 'wrong-stage' })
    const res = await POST(buildRequest({ dispatchId: 'DSP-MOU-X-i1', mouId: 'MOU-X' }))
    expect(res.status).toBe(303)
    const loc = res.headers.get('location') ?? ''
    expect(loc).toContain('/mous/MOU-X/delivery-ack')
    expect(loc).toContain('error=wrong-stage')
  })

  it('permission denied -> 303 with error=permission', async () => {
    generateMock.mockResolvedValue({ ok: false, reason: 'permission' })
    const res = await POST(buildRequest({ dispatchId: 'DSP-MOU-X-i1', mouId: 'MOU-X' }))
    expect(res.headers.get('location')).toContain('error=permission')
  })

  it('template-missing -> 500 JSON with operator-copyable message', async () => {
    generateMock.mockResolvedValue({
      ok: false,
      reason: 'template-missing',
      templateError: new DeliveryAckTemplateMissingError(
        'delivery-ack-v1',
        'public/ops-templates/delivery-ack-template.docx',
      ),
    })
    const res = await POST(buildRequest({ dispatchId: 'DSP-MOU-X-i1', mouId: 'MOU-X' }))
    expect(res.status).toBe(500)
    const json = await res.json()
    expect(json.error).toBe('template-missing')
    expect(json.message).toContain('delivery-ack-template.docx')
  })

  it('missing dispatchId -> 303 with error=missing-dispatch (no lib call)', async () => {
    const res = await POST(buildRequest({ mouId: 'MOU-X' }))
    expect(res.headers.get('location')).toContain('error=missing-dispatch')
    expect(generateMock).not.toHaveBeenCalled()
  })

  it('rejects unauthenticated request to /login with next preserved', async () => {
    sessionMock.mockResolvedValue(null)
    const res = await POST(buildRequest({ dispatchId: 'DSP-X', mouId: 'MOU-X' }))
    const loc = res.headers.get('location') ?? ''
    expect(loc).toContain('/login')
    expect(loc).toContain('next=%2Fmous%2FMOU-X%2Fdelivery-ack')
  })
})
