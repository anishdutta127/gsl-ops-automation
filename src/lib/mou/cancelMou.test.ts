import { describe, expect, it, vi } from 'vitest'
import type { MOU, Payment, User } from '@/lib/types'
import { cancelMou, type CancelMouDeps } from './cancelMou'

const ADMIN: User = {
  id: 'anish.d', name: 'Anish D.', email: 'a@x.in', role: 'Admin', department: null,
  testingOverride: false, active: true, passwordHash: '', createdAt: '2026-01-01T00:00:00Z', auditLog: [],
}
const OPS: User = { ...ADMIN, id: 'misba', name: 'Misba', department: 'ops' }

function pay(id: string, status: Payment['status']): Payment {
  return { id, mouId: 'MOU-X', status, receivedAmount: 1000, auditLog: [] } as unknown as Payment
}

function deps(over: Partial<CancelMouDeps> = {}): { deps: CancelMouDeps; enqueue: ReturnType<typeof vi.fn> } {
  const enqueue = vi.fn().mockResolvedValue(undefined)
  return {
    enqueue,
    deps: {
      mous: [{ id: 'MOU-X', status: 'Active', cohortStatus: 'active', auditLog: [], programme: 'STEAM' } as unknown as MOU],
      payments: [pay('MOU-X-i1', 'Paid'), pay('MOU-X-i2', 'Cancelled')],
      users: [ADMIN, OPS],
      enqueue: enqueue as unknown as CancelMouDeps['enqueue'],
      now: () => new Date('2026-06-24T00:00:00Z'),
      ...over,
    },
  }
}

describe('cancelMou (Phase 3 cancel + cascade)', () => {
  it('cancels the MOU (Cancelled + archived) and soft-deletes only non-Cancelled payments', async () => {
    const { deps: d, enqueue } = deps()
    const r = await cancelMou({ mouId: 'MOU-X', reason: 'wrong school entered', recordedBy: 'anish.d' }, d)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.mou.status).toBe('Cancelled')
    expect(r.mou.cohortStatus).toBe('archived')
    expect(r.cancelledPaymentIds).toEqual(['MOU-X-i1']) // i2 already Cancelled, skipped
    // 1 payment update + 1 mou update; payment enqueued BEFORE the mou (retry-safe order)
    expect(enqueue).toHaveBeenCalledTimes(2)
    expect(enqueue.mock.calls[0]![0].entity).toBe('payment')
    expect(enqueue.mock.calls[1]![0].entity).toBe('mou')
    expect(enqueue.mock.calls[1]![0].payload.status).toBe('Cancelled')
  })

  it('refuses a non-admin (department-scoped) user', async () => {
    const { deps: d, enqueue } = deps()
    const r = await cancelMou({ mouId: 'MOU-X', reason: 'a valid reason here', recordedBy: 'misba' }, d)
    expect(r).toEqual({ ok: false, reason: 'permission' })
    expect(enqueue).not.toHaveBeenCalled()
  })

  it('requires a reason of >= 10 chars', async () => {
    const { deps: d } = deps()
    const r = await cancelMou({ mouId: 'MOU-X', reason: 'short', recordedBy: 'anish.d' }, d)
    expect(r).toEqual({ ok: false, reason: 'missing-reason' })
  })

  it('refuses an already-cancelled MOU', async () => {
    const { deps: d } = deps({
      mous: [{ id: 'MOU-X', status: 'Cancelled', cohortStatus: 'archived', auditLog: [], programme: 'STEAM' } as unknown as MOU],
    })
    const r = await cancelMou({ mouId: 'MOU-X', reason: 'already done before', recordedBy: 'anish.d' }, d)
    expect(r).toEqual({ ok: false, reason: 'already-cancelled' })
  })
})
