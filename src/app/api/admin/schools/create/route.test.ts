import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('@/lib/schools/createSchool', () => ({
  createSchool: vi.fn(),
}))
vi.mock('@/lib/auth/session', () => ({
  getCurrentSession: vi.fn(),
}))

import { POST } from './route'
import { createSchool } from '@/lib/schools/createSchool'
import { getCurrentSession } from '@/lib/auth/session'

const createMock = createSchool as ReturnType<typeof vi.fn>
const sessionMock = getCurrentSession as ReturnType<typeof vi.fn>

function buildRequest(body: Record<string, string>): Request {
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(body)) params.set(k, v)
  return new Request('http://localhost/api/admin/schools/create', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  sessionMock.mockResolvedValue({ sub: 'misba.m', email: 'm@example.test', name: 'Misba', role: 'OpsHead' })
})

describe('POST /api/admin/schools/create', () => {
  it('happy path: 303 to /admin/schools on success', async () => {
    createMock.mockResolvedValue({ ok: true, school: { id: 'SCH-X' } })
    const res = await POST(buildRequest({
      id: 'SCH-X', name: 'X', city: 'Pune', state: 'MH', region: 'South-West',
    }))
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toBe('http://localhost/admin/schools')
  })

  it('normalises empty optional strings to null', async () => {
    createMock.mockResolvedValue({ ok: true, school: { id: 'SCH-X' } })
    await POST(buildRequest({
      id: 'SCH-X', name: 'X', city: 'Pune', state: 'MH', region: 'South-West',
      legalEntity: '', pinCode: '', email: '', pan: '', gstNumber: '', notes: '',
    }))
    const args = createMock.mock.calls[0]![0]
    expect(args.legalEntity).toBeNull()
    expect(args.pinCode).toBeNull()
    expect(args.email).toBeNull()
    expect(args.pan).toBeNull()
    expect(args.gstNumber).toBeNull()
    expect(args.notes).toBeNull()
  })

  it('lib failure -> 303 back with error param', async () => {
    createMock.mockResolvedValue({ ok: false, reason: 'invalid-gst' })
    const res = await POST(buildRequest({
      id: 'SCH-X', name: 'X', city: 'Pune', state: 'MH', region: 'South-West',
      gstNumber: 'BADGST',
    }))
    expect(res.headers.get('location')).toContain('error=invalid-gst')
  })

  it('rejects unauthenticated request to /login', async () => {
    sessionMock.mockResolvedValue(null)
    const res = await POST(buildRequest({
      id: 'SCH-X', name: 'X', city: 'Pune', state: 'MH', region: 'South-West',
    }))
    expect(res.headers.get('location')).toContain('next=%2Fadmin%2Fschools%2Fnew')
  })
})
