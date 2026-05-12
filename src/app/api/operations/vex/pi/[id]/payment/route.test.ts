/*
 * Gate 5A.5 persistence regression test.
 *
 * Pins that the VEX PI payment route:
 *   1. Enqueues TWO entries: a vexPi update (so the parent PI's
 *      paymentReceivedAmount + status reflect immediately) and a
 *      paymentLog create (so /finance/payment-logs surfaces it).
 *   2. Both payloads carry an `id` at the top level so the drain's
 *      applyOneToList can apply them.
 *
 * The pre-fix code enqueued only a partial paymentLog payload with no
 * id; the drain silently skipped it and the parent VexPi balance
 * never updated. Misba's "data not showing after 5 minutes" report
 * traced back to this drop.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { User } from '@/lib/types'
import type { VexPi } from '@/lib/mouSystem/types'
import vexPisJson from '@/data/vex_pis.json'

vi.mock('@/lib/auth/session', () => ({ getCurrentUser: vi.fn() }))
vi.mock('@/lib/pendingUpdates', () => ({ enqueueUpdate: vi.fn() }))

const samplePi = (vexPisJson as unknown as VexPi[])[0]!

const FINANCE_USER: User = {
  id: 'anish.d',
  name: 'Anish D.',
  email: 'anish.d@getsetlearn.info',
  role: 'Admin',
  department: null,
  testingOverride: false,
  active: true,
  passwordHash: '',
  createdAt: '2026-01-01T00:00:00Z',
  auditLog: [],
}

describe('POST /api/operations/vex/pi/[id]/payment (Gate 5A.5 persistence fix)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('enqueues both vexPi update and paymentLog create with ids', async () => {
    const { getCurrentUser } = await import('@/lib/auth/session')
    const { enqueueUpdate } = await import('@/lib/pendingUpdates')
    ;(getCurrentUser as ReturnType<typeof vi.fn>).mockResolvedValue(FINANCE_USER)

    const { POST } = await import('./route')
    const res = await POST(
      new Request(`http://localhost/api/operations/vex/pi/${samplePi.id}/payment`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          date: '2026-05-12',
          bankAmount: 1000,
          tdsAmount: 0,
          mode: 'Bank Transfer',
          reference: 'TEST-REF-001',
        }),
      }),
      { params: Promise.resolve({ id: samplePi.id }) },
    )
    expect(res.status).toBe(200)
    // Two enqueueUpdate calls: vexPi (parent balance update) +
    // paymentLog (audit row).
    expect(enqueueUpdate).toHaveBeenCalledTimes(2)
    const calls = (enqueueUpdate as ReturnType<typeof vi.fn>).mock.calls
    const vexPiCall = calls.find((c) => c[0].entity === 'vexPi')
    const paymentLogCall = calls.find((c) => c[0].entity === 'paymentLog')
    expect(vexPiCall).toBeDefined()
    expect(paymentLogCall).toBeDefined()
    expect(vexPiCall![0].payload.id).toBe(samplePi.id)
    expect(typeof vexPiCall![0].payload.paymentReceivedAmount).toBe('number')
    expect(vexPiCall![0].payload.paymentReceivedAmount).toBe(
      samplePi.paymentReceivedAmount + 1000,
    )
    expect(typeof paymentLogCall![0].payload.id).toBe('string')
    expect(paymentLogCall![0].payload.id).toMatch(/^VEXPL-/)
    expect(paymentLogCall![0].payload.vexPiId).toBe(samplePi.id)
  })
})
