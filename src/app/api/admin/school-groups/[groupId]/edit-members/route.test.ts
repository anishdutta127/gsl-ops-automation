import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('@/lib/schoolGroups/schoolGroup', () => ({
  editSchoolGroupMembers: vi.fn(),
}))
vi.mock('@/lib/auth/session', () => ({
  getCurrentSession: vi.fn(),
}))

import { POST } from './route'
import { editSchoolGroupMembers } from '@/lib/schoolGroups/schoolGroup'
import { getCurrentSession } from '@/lib/auth/session'

const editMock = editSchoolGroupMembers as ReturnType<typeof vi.fn>
const sessionMock = getCurrentSession as ReturnType<typeof vi.fn>

function buildRequest(body: Record<string, string | string[]>): Request {
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(body)) {
    if (Array.isArray(v)) {
      for (const item of v) params.append(k, item)
    } else {
      params.set(k, v)
    }
  }
  return new Request('http://localhost/api/admin/school-groups/SG-X/edit-members', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  sessionMock.mockResolvedValue({ sub: 'misba.m', email: 'm@example.test', name: 'Misba', role: 'OpsHead' })
})

describe('POST /api/admin/school-groups/[groupId]/edit-members', () => {
  it('happy path: 303 to detail on success', async () => {
    editMock.mockResolvedValue({ ok: true, group: { id: 'SG-X' }, added: ['SCH-A'], removed: [] })
    const res = await POST(
      buildRequest({ memberSchoolIds: ['SCH-A', 'SCH-B'] }),
      { params: Promise.resolve({ groupId: 'SG-X' }) },
    )
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toBe('http://localhost/admin/school-groups/SG-X')
  })

  it('reads memberSchoolIds as repeated values', async () => {
    editMock.mockResolvedValue({ ok: true, group: { id: 'SG-X' }, added: [], removed: [] })
    await POST(
      buildRequest({ memberSchoolIds: ['SCH-A', 'SCH-B', 'SCH-C'] }),
      { params: Promise.resolve({ groupId: 'SG-X' }) },
    )
    const args = editMock.mock.calls[0]![0]
    expect(args.memberSchoolIds).toEqual(['SCH-A', 'SCH-B', 'SCH-C'])
  })

  it('passes empty member list (full removal) through', async () => {
    editMock.mockResolvedValue({ ok: true, group: { id: 'SG-X' }, added: [], removed: ['SCH-A'] })
    await POST(
      buildRequest({}),
      { params: Promise.resolve({ groupId: 'SG-X' }) },
    )
    const args = editMock.mock.calls[0]![0]
    expect(args.memberSchoolIds).toEqual([])
  })

  it('lib failure -> 303 back with error param', async () => {
    editMock.mockResolvedValue({ ok: false, reason: 'no-change' })
    const res = await POST(
      buildRequest({ memberSchoolIds: ['SCH-A'] }),
      { params: Promise.resolve({ groupId: 'SG-X' }) },
    )
    expect(res.headers.get('location')).toContain('error=no-change')
  })

  it('rejects unauthenticated request to /login', async () => {
    sessionMock.mockResolvedValue(null)
    const res = await POST(
      buildRequest({ memberSchoolIds: ['SCH-A'] }),
      { params: Promise.resolve({ groupId: 'SG-X' }) },
    )
    expect(res.headers.get('location')).toContain('next=%2Fadmin%2Fschool-groups%2FSG-X')
  })
})
