import { describe, expect, it } from 'vitest'
import type { KitDispatch, MOU, Payment, WelcomeNote } from '@/lib/types'
import { computeOpsQueue, computeFinanceQueue } from './roleQueues'

function mou(over: Partial<MOU>): MOU {
  return {
    id: 'MOU-X', schoolId: 'SCH-X', schoolName: 'School X', programme: 'STEAM',
    status: 'Active', academicYear: '2026-27', studentsMou: 100, contractValue: 100000,
    auditLog: [],
    ...over,
  } as MOU
}
function pay(over: Partial<Payment>): Payment {
  return { id: 'p', mouId: 'MOU-X', status: 'Pending', expectedAmount: 1000, receivedAmount: 0, ...over } as Payment
}

describe('computeOpsQueue', () => {
  it('counts Awaiting review from opsReviewStatus, urgency-ordered first', () => {
    const tiles = computeOpsQueue({
      mous: [mou({ id: 'A', opsReviewStatus: 'Pending for review' }), mou({ id: 'B' })],
      kitDispatches: [],
      welcomeNotes: [],
    })
    expect(tiles[0]!.key).toBe('awaiting-review') // most urgent
    expect(tiles.find((t) => t.key === 'awaiting-review')!.count).toBe(1)
    expect(tiles.find((t) => t.key === 'awaiting-review')!.items[0]!.href).toBe('/operations/review/A')
  })

  it('welcome-pending excludes MOUs with a sent welcome note', () => {
    const wn: WelcomeNote = { mouId: 'A', schoolId: 'S', noteText: 'x', status: 'sent', sentAt: 'now', sentBy: 'u', updatedAt: null, auditLog: [] }
    const tiles = computeOpsQueue({
      mous: [mou({ id: 'A' }), mou({ id: 'B' })],
      kitDispatches: [],
      welcomeNotes: [wn],
    })
    expect(tiles.find((t) => t.key === 'welcome-pending')!.count).toBe(1) // only B
  })

  it('ready-to-dispatch / in-transit read KitDispatch status', () => {
    const kds: KitDispatch[] = [
      { mouId: 'A', salesApprovalStatus: 'Approved', dispatchStatus: 'Not Started' } as KitDispatch,
      { mouId: 'B', salesApprovalStatus: 'Approved', dispatchStatus: 'In Transit' } as KitDispatch,
    ]
    const tiles = computeOpsQueue({ mous: [mou({ id: 'A' }), mou({ id: 'B' })], kitDispatches: kds, welcomeNotes: [] })
    expect(tiles.find((t) => t.key === 'ready-to-dispatch')!.count).toBe(1)
    expect(tiles.find((t) => t.key === 'in-transit')!.count).toBe(1)
  })
})

describe('computeFinanceQueue', () => {
  it('awaiting-setup = active MOUs with no instalments', () => {
    const tiles = computeFinanceQueue({
      mous: [mou({ id: 'A' }), mou({ id: 'B' })],
      payments: [pay({ mouId: 'A' })], // A has an instalment, B does not
    })
    expect(tiles.find((t) => t.key === 'awaiting-setup')!.count).toBe(1) // only B
  })

  it('awaiting-payment groups due instalments per MOU; overdue floats up', () => {
    const tiles = computeFinanceQueue({
      mous: [mou({ id: 'A' }), mou({ id: 'B' })],
      payments: [
        pay({ mouId: 'A', status: 'Overdue', expectedAmount: 5000 }),
        pay({ mouId: 'A', status: 'Pending', expectedAmount: 5000 }),
        pay({ mouId: 'B', status: 'Pending', expectedAmount: 1000 }),
      ],
    })
    const t = tiles.find((x) => x.key === 'awaiting-payment')!
    expect(t.count).toBe(2) // 2 MOUs with due instalments
    expect(t.items[0]!.meta).toContain('overdue') // overdue MOU first
    expect(tiles[0]!.urgency).toBe(1) // most urgent tile first
  })

  it('dispatch-requests reads opsReviewStatus=Submitted to Finance', () => {
    const tiles = computeFinanceQueue({
      mous: [mou({ id: 'A', opsReviewStatus: 'Submitted to Finance' })],
      payments: [pay({ mouId: 'A' })],
    })
    expect(tiles.find((t) => t.key === 'dispatch-requests')!.count).toBe(1)
  })
})
