import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('@/lib/intake/editIntake', () => ({
  editIntake: vi.fn(),
}))
vi.mock('@/lib/auth/session', () => ({
  getCurrentSession: vi.fn(),
}))

import { POST } from './route'
import { editIntake } from '@/lib/intake/editIntake'
import { getCurrentSession } from '@/lib/auth/session'

const editMock = editIntake as ReturnType<typeof vi.fn>
const sessionMock = getCurrentSession as ReturnType<typeof vi.fn>

function buildRequest(body: Record<string, string>): Request {
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(body)) params.set(k, v)
  return new Request('http://localhost/api/mou/MOU-STEAM-2627-027/intake-edit', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  })
}

const ctx = { params: Promise.resolve({ mouId: 'MOU-STEAM-2627-027' }) }

beforeEach(() => {
  vi.clearAllMocks()
  sessionMock.mockResolvedValue({ sub: 'misba.m', email: 'm@example.test', name: 'Misba', role: 'OpsHead' })
})

describe('POST /api/mou/[mouId]/intake-edit (W4-I.4 MM3)', () => {
  it('happy path: 303 to /mous/[id]/dispatch on success', async () => {
    editMock.mockResolvedValue({ ok: true, record: { id: 'IR-W4C-001' }, changedFields: ['rechargeableBatteries'] })
    const res = await POST(
      buildRequest({ rechargeableBatteries: '25' }),
      ctx,
    )
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toContain('/mous/MOU-STEAM-2627-027/dispatch')
    expect(res.headers.get('location')).toContain('intakeEdited=1')
  })

  it('collapses grade1..grade10 into gradeBreakdown array', async () => {
    editMock.mockResolvedValue({ ok: true, record: {}, changedFields: ['gradeBreakdown'] })
    await POST(
      buildRequest({
        grade1: '17', grade2: '21', grade3: '20',
        grade4: '15', grade5: '24', grade6: '25',
        grade7: '26', grade8: '25', grade9: '0', grade10: '0',
      }),
      ctx,
    )
    const patch = editMock.mock.calls[0]![0].patch
    expect(patch.gradeBreakdown).toEqual([
      { grade: 1, students: 17 }, { grade: 2, students: 21 },
      { grade: 3, students: 20 }, { grade: 4, students: 15 },
      { grade: 5, students: 24 }, { grade: 6, students: 25 },
      { grade: 7, students: 26 }, { grade: 8, students: 25 },
      { grade: 9, students: 0 }, { grade: 10, students: 0 },
    ])
  })

  it('omits empty grade fields from the breakdown (partial backfill)', async () => {
    editMock.mockResolvedValue({ ok: true, record: {}, changedFields: ['gradeBreakdown'] })
    await POST(
      buildRequest({
        grade1: '10', grade2: '', grade3: '20',
        grade4: '', grade5: '', grade6: '',
        grade7: '', grade8: '', grade9: '', grade10: '',
      }),
      ctx,
    )
    const patch = editMock.mock.calls[0]![0].patch
    expect(patch.gradeBreakdown).toEqual([
      { grade: 1, students: 10 },
      { grade: 3, students: 20 },
    ])
  })

  it('blank rechargeableBatteries -> null in patch', async () => {
    editMock.mockResolvedValue({ ok: true, record: {}, changedFields: ['rechargeableBatteries'] })
    await POST(buildRequest({ rechargeableBatteries: '' }), ctx)
    const patch = editMock.mock.calls[0]![0].patch
    expect(patch.rechargeableBatteries).toBeNull()
  })

  it('intake-not-found -> 303 back with error param', async () => {
    const res = await POST(
      buildRequest({ rechargeableBatteries: '5' }),
      { params: Promise.resolve({ mouId: 'MOU-NONEXISTENT' }) },
    )
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toContain('error=intake-not-found')
  })

  it('lib failure -> 303 back with error param', async () => {
    editMock.mockResolvedValue({ ok: false, reason: 'invalid-batteries' })
    const res = await POST(buildRequest({ rechargeableBatteries: '5' }), ctx)
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toContain('error=invalid-batteries')
  })

  it('redirects unauthenticated request to /login', async () => {
    sessionMock.mockResolvedValue(null)
    const res = await POST(buildRequest({ rechargeableBatteries: '5' }), ctx)
    expect(res.headers.get('location')).toContain('/login')
    expect(res.headers.get('location')).toContain('next=%2Fmous%2FMOU-STEAM-2627-027%2Fintake%2Fedit')
  })
})
