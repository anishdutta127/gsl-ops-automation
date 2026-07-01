/*
 * Contract test: the in-SQL status CASE in vexPiRepo.recordVexPayment MUST stay
 * byte-for-byte equivalent to nudgeVexPiStatusOnPayment. The SQL cannot call JS,
 * so the two derivations are duplicated; this test is the guard that they never
 * drift (the gate-pass3 lesson: cover a JS<->SQL bridge with a contract test).
 *
 * `sqlCaseReplica` mirrors the SQL exactly:
 *
 *   status = CASE
 *     WHEN received + amount >= total - PAID_TOLERANCE
 *       THEN CASE WHEN status IN ('Delivery Pending','Partially Dispatched','Completed')
 *                 THEN status ELSE 'Delivery Pending' END
 *     WHEN status = 'Generated' THEN 'Payment Pending'
 *     ELSE status
 *   END
 *
 * If you change the SQL CASE, change this replica in the same edit; the assert
 * over the full status x balance grid will fail loudly if they diverge.
 */

import { describe, expect, it } from 'vitest'
import type { VexPiStatus } from '@/lib/types'
import { PAID_TOLERANCE, nudgeVexPiStatusOnPayment } from '@/lib/vex/vexPiStatus'

const STATUSES: VexPiStatus[] = [
  'Generated',
  'Payment Pending',
  'Delivery Pending',
  'Partially Dispatched',
  'Completed',
]

function sqlCaseReplica(received: number, amount: number, total: number, status: VexPiStatus): VexPiStatus {
  if (received + amount >= total - PAID_TOLERANCE) {
    return status === 'Delivery Pending' || status === 'Partially Dispatched' || status === 'Completed'
      ? status
      : 'Delivery Pending'
  }
  if (status === 'Generated') return 'Payment Pending'
  return status
}

describe('recordVexPayment SQL status CASE <-> nudgeVexPiStatusOnPayment', () => {
  const totals = [1000, 114284.18, 4.72]
  const balances: Array<[number, number]> = [
    [0, 0],
    [0, 1000],
    [0, 114284],
    [400, 0],
    [400, 600],
    [99998, 0],
    [1000, 200],
    [1200, 0],
  ]
  it('agree across the full status x balance grid', () => {
    for (const total of totals) {
      for (const [received, amount] of balances) {
        for (const status of STATUSES) {
          const fromSql = sqlCaseReplica(received, amount, total, status)
          const fromJs = nudgeVexPiStatusOnPayment(received + amount, total, status)
          expect(fromJs, `received=${received} amount=${amount} total=${total} status=${status}`).toBe(fromSql)
        }
      }
    }
  })
})
