import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('@/lib/salesTeam/createSalesPerson', () => ({
  createSalesPerson: vi.fn(),
}))
vi.mock('@/lib/auth/session', () => ({
  getCurrentSession: vi.fn(),
}))

import { POST } from './route'
import { createSalesPerson } from '@/lib/salesTeam/createSalesPerson'
import { getCurrentSession } from '@/lib/auth/session'

const createMock = createSalesPerson as ReturnType<typeof vi.fn>
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
  return new Request('http://localhost/api/admin/sales-team/create', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  sessionMock.mockResolvedValue({ sub: 'misba.m', email: 'm@example.test', name: 'Misba', role: 'OpsHead' })
})

describe('POST /api/admin/sales-team/create', () => {
  it('happy path: 303 to /admin/sales-team on success', async () => {
    createMock.mockResolvedValue({ ok: true, salesPerson: { id: 'sp-x' } })
    const res = await POST(buildRequest({
      id: 'sp-x', name: 'X', email: 'x@example.test', phone: '+91-98000-00099',
      territories: 'Pune, Mumbai', programmes: ['STEAM'], joinedDate: '2026-04-15',
    }))
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toBe('http://localhost/admin/sales-team')
  })

  it('parses comma-separated territories into array', async () => {
    createMock.mockResolvedValue({ ok: true, salesPerson: { id: 'sp-x' } })
    await POST(buildRequest({
      id: 'sp-x', name: 'X', email: 'x@example.test', phone: '',
      territories: 'Pune, Mumbai, Nashik', programmes: ['STEAM'], joinedDate: '2026-04-15',
    }))
    const args = createMock.mock.calls[0]![0]
    expect(args.territories).toEqual(['Pune', 'Mumbai', 'Nashik'])
  })

  it('reads multiple programmes checkbox values', async () => {
    createMock.mockResolvedValue({ ok: true, salesPerson: { id: 'sp-x' } })
    await POST(buildRequest({
      id: 'sp-x', name: 'X', email: 'x@example.test', phone: '',
      territories: 'Pune', programmes: ['STEAM', 'TinkRworks'], joinedDate: '2026-04-15',
    }))
    const args = createMock.mock.calls[0]![0]
    expect(args.programmes).toEqual(['STEAM', 'TinkRworks'])
  })

  it('lib failure -> 303 back with error param', async () => {
    createMock.mockResolvedValue({ ok: false, reason: 'duplicate-id' })
    const res = await POST(buildRequest({
      id: 'sp-x', name: 'X', email: 'x@example.test', phone: '',
      territories: 'Pune', programmes: ['STEAM'], joinedDate: '2026-04-15',
    }))
    expect(res.headers.get('location')).toContain('error=duplicate-id')
  })

  it('rejects unauthenticated request to /login with next preserved', async () => {
    sessionMock.mockResolvedValue(null)
    const res = await POST(buildRequest({
      id: 'sp-x', name: 'X', email: 'x@example.test', phone: '',
      territories: 'Pune', programmes: ['STEAM'], joinedDate: '2026-04-15',
    }))
    expect(res.headers.get('location')).toContain('next=%2Fadmin%2Fsales-team%2Fnew')
  })
})
