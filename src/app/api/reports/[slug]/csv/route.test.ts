import { describe, expect, it, vi, beforeEach } from 'vitest'

const getCurrentUserMock = vi.fn()

vi.mock('@/lib/auth/session', () => ({
  getCurrentUser: () => getCurrentUserMock(),
}))

import { GET } from './route'

beforeEach(() => {
  vi.clearAllMocks()
  getCurrentUserMock.mockResolvedValue({
    id: 'admin',
    name: 'A',
    email: 'a@example.test',
    role: 'Admin',
    department: null,
    testingOverride: false,
    active: true,
    passwordHash: 'X',
    createdAt: '2026-04-01T00:00:00Z',
    auditLog: [],
  })
})

function buildRequest(slug: string, qs = ''): Request {
  return new Request(`http://localhost/api/reports/${slug}/csv${qs}`, {
    method: 'GET',
  })
}

describe('GET /api/reports/[slug]/csv', () => {
  it('returns 401 unauthenticated', async () => {
    getCurrentUserMock.mockResolvedValue(null)
    const res = await GET(buildRequest('fy-summary'), {
      params: Promise.resolve({ slug: 'fy-summary' }),
    })
    expect(res.status).toBe(401)
  })

  it('returns 404 for unknown slug', async () => {
    const res = await GET(buildRequest('nope'), {
      params: Promise.resolve({ slug: 'nope' }),
    })
    expect(res.status).toBe(404)
  })

  it('returns 403 when user lacks access', async () => {
    getCurrentUserMock.mockResolvedValue({
      id: 'sales',
      name: 'S',
      email: 's@example.test',
      role: 'SalesRep',
      department: 'sales',
      testingOverride: false,
      active: true,
      passwordHash: 'X',
      createdAt: '2026-04-01T00:00:00Z',
      auditLog: [],
    })
    const res = await GET(buildRequest('payment-aging'), {
      params: Promise.resolve({ slug: 'payment-aging' }),
    })
    expect(res.status).toBe(403)
  })

  it('serves fy-summary CSV with content-disposition', async () => {
    const res = await GET(buildRequest('fy-summary', '?fy=2026-27'), {
      params: Promise.resolve({ slug: 'fy-summary' }),
    })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/csv')
    const disp = res.headers.get('content-disposition') ?? ''
    expect(disp).toContain('fy-summary-')
    expect(disp).toContain('fy2026-27')
  })

  it('serves sales-performance CSV', async () => {
    const res = await GET(buildRequest('sales-performance'), {
      params: Promise.resolve({ slug: 'sales-performance' }),
    })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/csv')
    const body = await res.text()
    expect(body.split('\n')[0]).toContain('Rep')
  })

  it('serves dispatch-performance CSV', async () => {
    const res = await GET(buildRequest('dispatch-performance'), {
      params: Promise.resolve({ slug: 'dispatch-performance' }),
    })
    expect(res.status).toBe(200)
    const body = await res.text()
    expect(body.split('\n')[0]).toContain('Section')
  })

  it('serves payment-aging CSV', async () => {
    const res = await GET(buildRequest('payment-aging'), {
      params: Promise.resolve({ slug: 'payment-aging' }),
    })
    expect(res.status).toBe(200)
    const body = await res.text()
    expect(body.split('\n')[0]).toContain('Section')
  })

  it('serves escalations CSV', async () => {
    const res = await GET(buildRequest('escalations'), {
      params: Promise.resolve({ slug: 'escalations' }),
    })
    expect(res.status).toBe(200)
    const body = await res.text()
    expect(body.split('\n')[0]).toContain('Section')
  })

  it('uses from-to suffix when from/to are set', async () => {
    const res = await GET(
      buildRequest('fy-summary', '?from=2026-04-01&to=2026-06-30'),
      { params: Promise.resolve({ slug: 'fy-summary' }) },
    )
    const disp = res.headers.get('content-disposition') ?? ''
    expect(disp).toContain('2026-04-01-to-2026-06-30')
  })
})
