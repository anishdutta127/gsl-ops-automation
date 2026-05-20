/*
 * Phase 6B regression: reconciliation invariant on /schools/[schoolId]
 * header tiles. For any school with linked payments,
 * contractValue equals receivedTotal plus balanceOutstanding within
 * Rs 1 tolerance.
 *
 * Approach: run deriveSchoolFinancials against EVERY school in
 * src/data, asserting the invariant per school. Catches a future
 * refactor that accidentally desynchronises the three tiles.
 */

import { describe, expect, it } from 'vitest'
import type { MOU, Payment, School } from '@/lib/types'
import schoolsJson from '@/data/schools.json'
import mousJson from '@/data/mous.json'
import paymentsJson from '@/data/payments.json'
import { deriveSchoolFinancials } from './financials'

const allSchools = schoolsJson as unknown as School[]
const allMous = mousJson as unknown as MOU[]
const allPayments = paymentsJson as unknown as Payment[]

describe('deriveSchoolFinancials reconciliation invariant', () => {
  it('Contract = Received + Balance within Rs 1 tolerance for every non-over-paid school', () => {
    let checked = 0
    let withPayments = 0
    let overPaid = 0
    for (const school of allSchools) {
      const schoolMous = allMous.filter((m) => m.schoolId === school.id)
      const mouIds = new Set(schoolMous.map((m) => m.id))
      const schoolPayments = allPayments.filter((p) => mouIds.has(p.mouId))
      const f = deriveSchoolFinancials({ schoolMous, schoolPayments })
      checked += 1
      if (schoolPayments.some((p) => (p.receivedAmount ?? 0) > 0)) {
        withPayments += 1
      }
      // Over-paid case: balance is clamped to 0 so the strict equality
      // does not hold. Tracked separately below; not a reconciliation
      // bug, a finance signal.
      if (f.received > f.contractValue + 1) {
        overPaid += 1
        continue
      }
      const diff = Math.abs(f.contractValue - (f.received + f.balance))
      expect(diff).toBeLessThanOrEqual(1)
    }
    expect(checked).toBeGreaterThan(0)
    // Sanity: at least one school in the dataset has actual receipts,
    // otherwise the test would pass trivially (everything zero).
    expect(withPayments).toBeGreaterThan(0)
    // Sanity: the over-paid bucket exists in the dataset (Pranav
    // backfill outstanding). If this hits zero in the future, either
    // the finance backfill landed or the data was reset; review
    // before lowering this expectation.
    expect(overPaid).toBeGreaterThan(0)
  })

  it('Blue Angels Global School: Contract 7,20,000 / Received 1,80,000 / Balance 5,40,000 reconcile', () => {
    const school = allSchools.find((s) => s.id === 'SCH-BLUE_ANGELS_GLOBAL_S')
    expect(school).toBeDefined()
    if (!school) return
    const schoolMous = allMous.filter((m) => m.schoolId === school.id)
    const mouIds = new Set(schoolMous.map((m) => m.id))
    const schoolPayments = allPayments.filter((p) => mouIds.has(p.mouId))
    const f = deriveSchoolFinancials({ schoolMous, schoolPayments })
    expect(f.contractValue).toBe(720000)
    expect(f.received).toBe(180000)
    expect(f.balance).toBe(540000)
    expect(f.contractValue).toBe(f.received + f.balance)
  })

  it('empty case: school with no MOUs and no payments returns all zeros that reconcile', () => {
    const f = deriveSchoolFinancials({ schoolMous: [], schoolPayments: [] })
    expect(f.contractValue).toBe(0)
    expect(f.received).toBe(0)
    expect(f.balance).toBe(0)
  })

  it('over-paid case: received > contract clamps balance to 0 and surfaces a non-reconciling diff for finance to notice', () => {
    const m = {
      id: 'MOU-X', contractValue: 100,
    } as unknown as MOU
    const p1 = { mouId: 'MOU-X', receivedAmount: 150 } as unknown as Payment
    const f = deriveSchoolFinancials({ schoolMous: [m], schoolPayments: [p1] })
    expect(f.contractValue).toBe(100)
    expect(f.received).toBe(150)
    expect(f.balance).toBe(0)
    // Diff is non-zero in this case, intentionally: Contract < Received
    // means finance should investigate (over-receipt, adjustment, etc.).
    expect(f.contractValue - (f.received + f.balance)).toBe(-50)
  })
})
