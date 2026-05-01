import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('@/lib/templates/markCommunicationSent', () => ({
  markCommunicationSent: vi.fn(),
}))
vi.mock('@/lib/auth/session', () => ({
  getCurrentSession: vi.fn(),
}))

import { POST } from './route'
import { markCommunicationSent } from '@/lib/templates/markCommunicationSent'
import { getCurrentSession } from '@/lib/auth/session'

const markMock = markCommunicationSent as ReturnType<typeof vi.fn>
const sessionMock = getCurrentSession as ReturnType<typeof vi.fn>

function buildRequest(body: Record<string, string>): Request {
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(body)) params.set(k, v)
  return new Request('http://localhost/api/mou/MOU-X/communication-sent', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  })
}

const ctx = { params: Promise.resolve({ mouId: 'MOU-X' }) }

beforeEach(() => {
  vi.clearAllMocks()
  sessionMock.mockResolvedValue({ sub: 'misba.m', email: 'm@x.test', name: 'Misba', role: 'OpsHead' })
})

describe('POST /api/mou/[mouId]/communication-sent (W4-I.5 P3C4)', () => {
  it('happy path: 303 to launcher with ?sent=1 on success', async () => {
    markMock.mockResolvedValue({ ok: true, mou: {} })
    const res = await POST(
      buildRequest({
        templateId: 'TPL-WELCOME-DEFAULT',
        recipient: 'spoc@school.test',
        subject: 'Welcome',
        filledVariables: 'schoolName,programme',
      }),
      ctx,
    )
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toBe(
      'http://localhost/mous/MOU-X/send-template/TPL-WELCOME-DEFAULT?sent=1',
    )
  })

  it('passes templateId + recipient + subject + filled CSV through', async () => {
    markMock.mockResolvedValue({ ok: true, mou: {} })
    await POST(
      buildRequest({
        templateId: 'T', recipient: 'r@x.test', subject: 'S',
        filledVariables: 'a,b',
      }),
      ctx,
    )
    expect(markMock.mock.calls[0]![0]).toMatchObject({
      mouId: 'MOU-X',
      templateId: 'T',
      recipient: 'r@x.test',
      subject: 'S',
      filledVariablesCsv: 'a,b',
      sentBy: 'misba.m',
    })
  })

  it('lib failure -> 303 back with error param', async () => {
    markMock.mockResolvedValue({ ok: false, reason: 'mou-not-found' })
    const res = await POST(
      buildRequest({ templateId: 'T', recipient: 'r', subject: 'S' }),
      ctx,
    )
    expect(res.headers.get('location')).toContain('error=mou-not-found')
  })

  it('missing templateId -> 303 back with missing-template', async () => {
    const res = await POST(
      buildRequest({ recipient: 'r', subject: 'S' }),
      ctx,
    )
    expect(res.headers.get('location')).toContain('error=missing-template')
  })

  it('redirects unauthenticated to /login', async () => {
    sessionMock.mockResolvedValue(null)
    const res = await POST(
      buildRequest({ templateId: 'T', recipient: 'r', subject: 'S' }),
      ctx,
    )
    expect(res.headers.get('location')).toContain('/login')
    expect(res.headers.get('location')).toContain('next=%2Fmous%2FMOU-X')
  })
})
