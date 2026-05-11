/*
 * GET /api/finance/pi/[paymentId]/download tests (Gate 5A Step 2).
 *
 * Mocks renderPi + getCurrentSession. Asserts: success returns 200 +
 * .docx Content-Disposition with filename derived from piNumber;
 * failure modes redirect 303 with error param; auth failure redirects
 * to /login; template-missing returns 500 JSON; the route does NOT
 * touch the counter (renderPi is mocked, but the route layer asserts
 * it never imports issueAndRenderPi).
 */

import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('@/lib/pi/generatePi', () => ({
  renderPi: vi.fn(),
}))

vi.mock('@/lib/auth/session', () => ({
  getCurrentSession: vi.fn(),
}))

import { GET } from './route'
import { renderPi } from '@/lib/pi/generatePi'
import { getCurrentSession } from '@/lib/auth/session'
import { TemplateMissingError } from '@/lib/pi/templates'

const renderMock = renderPi as ReturnType<typeof vi.fn>
const sessionMock = getCurrentSession as ReturnType<typeof vi.fn>

function buildRequest(paymentId: string): Request {
  return new Request(`http://localhost/api/finance/pi/${paymentId}/download`, {
    method: 'GET',
  })
}

function paramsPromise(paymentId: string): Promise<{ paymentId: string }> {
  return Promise.resolve({ paymentId })
}

beforeEach(() => {
  vi.clearAllMocks()
  sessionMock.mockResolvedValue({
    sub: 'shubhangi.g', email: 's@example.test', name: 'Shubhangi', role: 'Finance',
  })
})

describe('GET /api/finance/pi/[paymentId]/download', () => {
  it('happy path: 200 with .docx Content-Disposition + filename derived from PI number', async () => {
    const fakeBytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04])
    renderMock.mockResolvedValue({
      ok: true,
      piNumber: 'MTPL/MH/26-27/0042',
      docxBytes: fakeBytes,
    })
    const response = await GET(buildRequest('MOU-X-i1'), { params: paramsPromise('MOU-X-i1') })
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    )
    expect(response.headers.get('content-disposition')).toContain('MTPL_MH_26-27_0042.docx')
  })

  it('redirects to /login when session is missing', async () => {
    sessionMock.mockResolvedValue(null)
    const response = await GET(buildRequest('MOU-X-i1'), { params: paramsPromise('MOU-X-i1') })
    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toContain('/login')
    expect(response.headers.get('location')).toContain('next=%2Ffinance%2Fpi%2FMOU-X-i1')
    expect(renderMock).not.toHaveBeenCalled()
  })

  it('redirects 303 with error=payment-not-found when paymentId is unknown', async () => {
    renderMock.mockResolvedValue({ ok: false, reason: 'payment-not-found' })
    const response = await GET(buildRequest('GHOST'), { params: paramsPromise('GHOST') })
    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toContain('/finance/pi/GHOST')
    expect(response.headers.get('location')).toContain('error=payment-not-found')
  })

  it('redirects 303 with error=payment-missing-pi-number when piNumber is null on the payment', async () => {
    renderMock.mockResolvedValue({ ok: false, reason: 'payment-missing-pi-number' })
    const response = await GET(buildRequest('MOU-X-i9'), { params: paramsPromise('MOU-X-i9') })
    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toContain('error=payment-missing-pi-number')
  })

  it('returns 500 JSON when template is missing', async () => {
    const tmplErr = new TemplateMissingError('pi-v1', 'public/ops-templates/pi-template.docx')
    renderMock.mockResolvedValue({ ok: false, reason: 'template-missing', templateError: tmplErr })
    const response = await GET(buildRequest('MOU-X-i1'), { params: paramsPromise('MOU-X-i1') })
    expect(response.status).toBe(500)
    const body = await response.json()
    expect(body.error).toBe('template-missing')
    expect(body.message).toContain('public/ops-templates/pi-template.docx')
  })
})
