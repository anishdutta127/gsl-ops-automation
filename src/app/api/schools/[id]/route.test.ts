import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('@/lib/schools/editSchool', () => ({
  editSchool: vi.fn(),
}))
vi.mock('@/lib/auth/session', () => ({
  getCurrentSession: vi.fn(),
}))

import { POST } from './route'
import { editSchool } from '@/lib/schools/editSchool'
import { getCurrentSession } from '@/lib/auth/session'

const editMock = editSchool as ReturnType<typeof vi.fn>
const sessionMock = getCurrentSession as ReturnType<typeof vi.fn>

function buildRequest(body: Record<string, string>): Request {
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(body)) params.set(k, v)
  return new Request('http://localhost/api/schools/SCH-X', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  })
}

const ctx = { params: Promise.resolve({ id: 'SCH-X' }) }

beforeEach(() => {
  vi.clearAllMocks()
  sessionMock.mockResolvedValue({ sub: 'misba.m', email: 'm@example.test', name: 'Misba', role: 'OpsHead' })
})

describe('POST /api/schools/[id] (W4-I.4 MM4)', () => {
  it('happy path: 303 to /schools/[id] on success', async () => {
    editMock.mockResolvedValue({ ok: true, school: { id: 'SCH-X' }, changedFields: ['name'] })
    const res = await POST(buildRequest({
      name: 'New', city: 'Pune', state: 'MH', region: 'South-West',
    }), ctx)
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toBe('http://localhost/schools/SCH-X')
  })

  it('passes school id from route param to editSchool', async () => {
    editMock.mockResolvedValue({ ok: true, school: {}, changedFields: ['name'] })
    await POST(buildRequest({
      name: 'New', city: 'Pune', state: 'MH', region: 'South-West',
    }), ctx)
    expect(editMock.mock.calls[0]![0].id).toBe('SCH-X')
    expect(editMock.mock.calls[0]![0].editedBy).toBe('misba.m')
  })

  it('omits gstNumber from patch when the form did not send it (Ops case)', async () => {
    editMock.mockResolvedValue({ ok: true, school: {}, changedFields: ['name'] })
    await POST(buildRequest({
      name: 'New', city: 'Pune', state: 'MH', region: 'South-West',
    }), ctx)
    const patch = editMock.mock.calls[0]![0].patch
    expect(patch.gstNumber).toBeUndefined()
  })

  it('includes gstNumber when the form sent it (Finance/Admin case)', async () => {
    editMock.mockResolvedValue({ ok: true, school: {}, changedFields: ['gstNumber'] })
    await POST(buildRequest({
      name: 'New', city: 'Pune', state: 'MH', region: 'South-West',
      gstNumber: '29AAAAA0000A1Z5',
    }), ctx)
    const patch = editMock.mock.calls[0]![0].patch
    expect(patch.gstNumber).toBe('29AAAAA0000A1Z5')
  })

  it('normalises blank gstNumber to null when sent', async () => {
    editMock.mockResolvedValue({ ok: true, school: {}, changedFields: ['gstNumber'] })
    await POST(buildRequest({
      name: 'New', city: 'Pune', state: 'MH', region: 'South-West',
      gstNumber: '',
    }), ctx)
    const patch = editMock.mock.calls[0]![0].patch
    expect(patch.gstNumber).toBeNull()
  })

  it('active checkbox: present -> true, absent -> false', async () => {
    editMock.mockResolvedValue({ ok: true, school: {}, changedFields: ['active'] })
    await POST(buildRequest({
      name: 'New', city: 'Pune', state: 'MH', region: 'South-West',
      active: 'on',
    }), ctx)
    expect(editMock.mock.calls[0]![0].patch.active).toBe(true)

    vi.clearAllMocks()
    sessionMock.mockResolvedValue({ sub: 'misba.m', email: 'm@example.test', name: 'Misba', role: 'OpsHead' })
    editMock.mockResolvedValue({ ok: true, school: {}, changedFields: ['active'] })
    await POST(buildRequest({
      name: 'New', city: 'Pune', state: 'MH', region: 'South-West',
    }), ctx)
    expect(editMock.mock.calls[0]![0].patch.active).toBe(false)
  })

  it('lib failure -> 303 back to edit page with error param', async () => {
    editMock.mockResolvedValue({ ok: false, reason: 'invalid-gst' })
    const res = await POST(buildRequest({
      name: 'New', city: 'Pune', state: 'MH', region: 'South-West',
      gstNumber: 'BAD',
    }), ctx)
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toBe('http://localhost/schools/SCH-X/edit?error=invalid-gst')
  })

  it('rejects unauthenticated request -> /login with next param', async () => {
    sessionMock.mockResolvedValue(null)
    const res = await POST(buildRequest({
      name: 'New', city: 'Pune', state: 'MH', region: 'South-West',
    }), ctx)
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toContain('/login')
    expect(res.headers.get('location')).toContain('next=%2Fschools%2FSCH-X%2Fedit')
  })
})
