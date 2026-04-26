import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('@/lib/schoolGroups/schoolGroup', () => ({
  createSchoolGroup: vi.fn(),
}))
vi.mock('@/lib/auth/session', () => ({
  getCurrentSession: vi.fn(),
}))

import { POST } from './route'
import { createSchoolGroup } from '@/lib/schoolGroups/schoolGroup'
import { getCurrentSession } from '@/lib/auth/session'

const createMock = createSchoolGroup as ReturnType<typeof vi.fn>
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
  return new Request('http://localhost/api/admin/school-groups/create', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  sessionMock.mockResolvedValue({ sub: 'misba.m', email: 'm@example.test', name: 'Misba', role: 'OpsHead' })
})

describe('POST /api/admin/school-groups/create', () => {
  it('happy path: 303 to /admin/school-groups on success', async () => {
    createMock.mockResolvedValue({ ok: true, group: { id: 'SG-X' } })
    const res = await POST(buildRequest({
      id: 'SG-X', name: 'X', region: 'East',
    }))
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toBe('http://localhost/admin/school-groups')
  })

  it('reads multiple memberSchoolIds checkbox values', async () => {
    createMock.mockResolvedValue({ ok: true, group: { id: 'SG-X' } })
    await POST(buildRequest({
      id: 'SG-X', name: 'X', region: 'East',
      memberSchoolIds: ['SCH-A', 'SCH-B', 'SCH-C'],
    }))
    const args = createMock.mock.calls[0]![0]
    expect(args.memberSchoolIds).toEqual(['SCH-A', 'SCH-B', 'SCH-C'])
  })

  it('lib failure -> 303 back with error param', async () => {
    createMock.mockResolvedValue({ ok: false, reason: 'invalid-member-school-ids' })
    const res = await POST(buildRequest({
      id: 'SG-X', name: 'X', region: 'East',
      memberSchoolIds: 'SCH-GHOST',
    }))
    expect(res.headers.get('location')).toContain('error=invalid-member-school-ids')
  })

  it('rejects unauthenticated request to /login', async () => {
    sessionMock.mockResolvedValue(null)
    const res = await POST(buildRequest({
      id: 'SG-X', name: 'X', region: 'East',
    }))
    expect(res.headers.get('location')).toContain('next=%2Fadmin%2Fschool-groups%2Fnew')
  })
})
