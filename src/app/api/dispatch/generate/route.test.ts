/*
 * /api/dispatch/generate route handler tests.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('@/lib/dispatch/raiseDispatch', () => ({
  raiseDispatch: vi.fn(),
}))

vi.mock('@/lib/auth/session', () => ({
  getCurrentSession: vi.fn(),
}))

import { POST } from './route'
import { raiseDispatch } from '@/lib/dispatch/raiseDispatch'
import { getCurrentSession } from '@/lib/auth/session'
import { DispatchTemplateMissingError } from '@/lib/dispatch/templates'

const raiseMock = raiseDispatch as ReturnType<typeof vi.fn>
const sessionMock = getCurrentSession as ReturnType<typeof vi.fn>

function buildRequest(body: Record<string, string>): Request {
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(body)) params.set(k, v)
  return new Request('http://localhost/api/dispatch/generate', {
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

describe('POST /api/dispatch/generate', () => {
  it('happy path: 200 with .docx Content-Disposition + filename derived from dispatch id', async () => {
    const fakeBytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04])
    raiseMock.mockResolvedValue({
      ok: true,
      dispatch: { id: 'DSP-MOU-X-i1' },
      docxBytes: fakeBytes,
      wasAlreadyRaised: false,
    })
    const res = await POST(buildRequest({ mouId: 'MOU-X', installmentSeq: '1' }))
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('wordprocessingml')
    const disposition = res.headers.get('content-disposition') ?? ''
    expect(disposition).toContain('DSP-MOU-X-i1.docx')
    expect(res.headers.get('x-already-raised')).toBe('false')
  })

  it('idempotent re-render: x-already-raised header set to true', async () => {
    const fakeBytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04])
    raiseMock.mockResolvedValue({
      ok: true,
      dispatch: { id: 'DSP-MOU-X-i1' },
      docxBytes: fakeBytes,
      wasAlreadyRaised: true,
    })
    const res = await POST(buildRequest({ mouId: 'MOU-X', installmentSeq: '1' }))
    expect(res.status).toBe(200)
    expect(res.headers.get('x-already-raised')).toBe('true')
  })

  it('lib failure (gate-locked) -> 303 to /mous/<id>/dispatch with error param', async () => {
    raiseMock.mockResolvedValue({ ok: false, reason: 'gate-locked' })
    const res = await POST(buildRequest({ mouId: 'MOU-X', installmentSeq: '1' }))
    expect(res.status).toBe(303)
    const loc = res.headers.get('location') ?? ''
    expect(loc).toContain('/mous/MOU-X/dispatch')
    expect(loc).toContain('error=gate-locked')
  })

  it('permission denied -> 303 with error=permission', async () => {
    raiseMock.mockResolvedValue({ ok: false, reason: 'permission' })
    const res = await POST(buildRequest({ mouId: 'MOU-X', installmentSeq: '1' }))
    expect(res.headers.get('location')).toContain('error=permission')
  })

  it('template-missing -> 500 JSON with operator-copyable message', async () => {
    raiseMock.mockResolvedValue({
      ok: false,
      reason: 'template-missing',
      templateError: new DispatchTemplateMissingError('dispatch-v1', 'public/ops-templates/dispatch-template.docx'),
    })
    const res = await POST(buildRequest({ mouId: 'MOU-X', installmentSeq: '1' }))
    expect(res.status).toBe(500)
    const json = await res.json()
    expect(json.error).toBe('template-missing')
    expect(json.message).toContain('public/ops-templates/dispatch-template.docx')
  })

  it('missing mouId -> 303 to /dashboard with error=missing-mou (no lib call)', async () => {
    const res = await POST(buildRequest({ installmentSeq: '1' }))
    expect(res.headers.get('location')).toContain('error=missing-mou')
    expect(raiseMock).not.toHaveBeenCalled()
  })

  it('non-numeric installmentSeq -> 303 with error=invalid-installment-seq (no lib call)', async () => {
    const res = await POST(buildRequest({ mouId: 'MOU-X', installmentSeq: 'abc' }))
    expect(res.headers.get('location')).toContain('error=invalid-installment-seq')
    expect(raiseMock).not.toHaveBeenCalled()
  })

  it('rejects unauthenticated request to /login with next preserved', async () => {
    sessionMock.mockResolvedValue(null)
    const res = await POST(buildRequest({ mouId: 'MOU-X', installmentSeq: '1' }))
    const loc = res.headers.get('location') ?? ''
    expect(loc).toContain('/login')
    expect(loc).toContain('next=%2Fmous%2FMOU-X')
  })
})
