import { describe, expect, it, vi, beforeEach } from 'vitest'
import { POST } from './route'

const sessionMock = vi.fn()
vi.mock('@/lib/auth/session', () => ({
  getCurrentSession: () => sessionMock(),
}))

const editMock = vi.fn()
vi.mock('@/lib/lifecycleRules/editLifecycleRule', () => ({
  editLifecycleRule: (args: unknown) => editMock(args),
}))

beforeEach(() => {
  vi.clearAllMocks()
})

function formReq(body: Record<string, string>): Request {
  const form = new URLSearchParams(body)
  return new Request('http://localhost/api/admin/lifecycle-rules/invoice-raised/edit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  })
}

const ctx = { params: Promise.resolve({ stageFromKey: 'invoice-raised' }) }

describe('POST /api/admin/lifecycle-rules/[stageFromKey]/edit', () => {
  it('redirects unauthenticated viewer to /login with next=/admin/lifecycle-rules', async () => {
    sessionMock.mockResolvedValue(null)
    const res = await POST(formReq({ defaultDays: '45' }), ctx)
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toContain('/login')
    expect(res.headers.get('location')).toContain('next=%2Fadmin%2Flifecycle-rules')
  })

  it('on success redirects to /admin/lifecycle-rules?saved=<stage>', async () => {
    sessionMock.mockResolvedValue({ sub: 'anish.d' })
    editMock.mockResolvedValue({ ok: true, rule: { stageFromKey: 'invoice-raised', defaultDays: 45 } })
    const res = await POST(formReq({ defaultDays: '45', changeNotes: 'School cohort' }), ctx)
    expect(res.status).toBe(303)
    const location = res.headers.get('location') ?? ''
    expect(location).toContain('/admin/lifecycle-rules')
    expect(location).toContain('saved=invoice-raised')
  })

  it('on lib failure redirects with ?error=<reason>&stage=<key>', async () => {
    sessionMock.mockResolvedValue({ sub: 'anish.d' })
    editMock.mockResolvedValue({ ok: false, reason: 'invalid-days' })
    const res = await POST(formReq({ defaultDays: '999' }), ctx)
    expect(res.status).toBe(303)
    const location = res.headers.get('location') ?? ''
    expect(location).toContain('error=invalid-days')
    expect(location).toContain('stage=invoice-raised')
  })

  it('non-numeric defaultDays redirects with ?error=invalid-days without calling lib', async () => {
    sessionMock.mockResolvedValue({ sub: 'anish.d' })
    const res = await POST(formReq({ defaultDays: 'not-a-number' }), ctx)
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toContain('error=invalid-days')
    expect(editMock).not.toHaveBeenCalled()
  })
})
