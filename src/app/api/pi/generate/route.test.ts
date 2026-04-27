/*
 * /api/pi/generate route handler tests.
 *
 * Mocks generatePi + getCurrentSession. Asserts: success returns
 * 200 + .docx Content-Disposition; user-facing failures redirect
 * 303 with error param; template-missing returns 500 JSON; auth
 * failures redirect to /login.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('@/lib/pi/generatePi', () => ({
  generatePi: vi.fn(),
}))

vi.mock('@/lib/auth/session', () => ({
  getCurrentSession: vi.fn(),
}))

import { POST } from './route'
import { generatePi } from '@/lib/pi/generatePi'
import { getCurrentSession } from '@/lib/auth/session'
import { TemplateMissingError } from '@/lib/pi/templates'

const generateMock = generatePi as ReturnType<typeof vi.fn>
const sessionMock = getCurrentSession as ReturnType<typeof vi.fn>

function buildRequest(body: Record<string, string>): Request {
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(body)) params.set(k, v)
  return new Request('http://localhost/api/pi/generate', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  sessionMock.mockResolvedValue({
    sub: 'shubhangi.g', email: 's@example.test', name: 'Shubhangi', role: 'Finance',
  })
})

describe('POST /api/pi/generate', () => {
  it('happy path: 200 with .docx Content-Disposition + filename derived from PI number', async () => {
    const fakeBytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00, 0x00, 0x00])
    generateMock.mockResolvedValue({
      ok: true,
      piNumber: 'GSL/OPS/26-27/0001',
      payment: { id: 'MOU-X-i1' },
      docxBytes: fakeBytes,
    })
    const res = await POST(buildRequest({ mouId: 'MOU-X', instalmentSeq: '1' }))
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('wordprocessingml')
    const disposition = res.headers.get('content-disposition') ?? ''
    expect(disposition).toContain('attachment')
    expect(disposition).toContain('GSL_OPS_26-27_0001.docx')
  })

  it('lib failure (wrong-status) -> 303 to /mous/<id>/pi with error param', async () => {
    // W4-A.6: gstin-required no longer exists as a failure reason; use
    // wrong-status as the representative non-template failure path.
    generateMock.mockResolvedValue({ ok: false, reason: 'wrong-status' })
    const res = await POST(buildRequest({ mouId: 'MOU-X', instalmentSeq: '1' }))
    expect(res.status).toBe(303)
    const loc = res.headers.get('location') ?? ''
    expect(loc).toContain('/mous/MOU-X/pi')
    expect(loc).toContain('error=wrong-status')
  })

  it('permission denied -> 303 with error=permission', async () => {
    generateMock.mockResolvedValue({ ok: false, reason: 'permission' })
    const res = await POST(buildRequest({ mouId: 'MOU-X', instalmentSeq: '1' }))
    expect(res.headers.get('location')).toContain('error=permission')
  })

  it('template-missing -> 500 JSON with operator-copyable message', async () => {
    generateMock.mockResolvedValue({
      ok: false,
      reason: 'template-missing',
      templateError: new TemplateMissingError('pi-v1', 'public/ops-templates/pi-template.docx'),
    })
    const res = await POST(buildRequest({ mouId: 'MOU-X', instalmentSeq: '1' }))
    expect(res.status).toBe(500)
    const json = await res.json()
    expect(json.error).toBe('template-missing')
    expect(json.message).toContain('public/ops-templates/pi-template.docx')
    expect(json.message).toContain('not yet authored')
  })

  it('missing mouId -> 303 to / (kanban) with error=missing-mou (no lib call)', async () => {
    const res = await POST(buildRequest({ instalmentSeq: '1' }))
    expect(res.headers.get('location')).toContain('error=missing-mou')
    expect(generateMock).not.toHaveBeenCalled()
  })

  it('non-numeric instalmentSeq -> 303 with error=invalid-instalment-seq (no lib call)', async () => {
    const res = await POST(buildRequest({ mouId: 'MOU-X', instalmentSeq: 'abc' }))
    expect(res.headers.get('location')).toContain('error=invalid-instalment-seq')
    expect(generateMock).not.toHaveBeenCalled()
  })

  it('rejects unauthenticated request to /login with next preserved', async () => {
    sessionMock.mockResolvedValue(null)
    const res = await POST(buildRequest({ mouId: 'MOU-X', instalmentSeq: '1' }))
    const loc = res.headers.get('location') ?? ''
    expect(loc).toContain('/login')
    expect(loc).toContain('next=%2Fmous%2FMOU-X')
  })
})
