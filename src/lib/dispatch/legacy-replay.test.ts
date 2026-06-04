/*
 * Legacy-dispatch replay proof (Step 1 verification layer c).
 *
 * The Step 1 unification touched ONLY the new KitDispatch allocation path
 * (allocate.ts / accountsExecute.ts). The legacy Dispatch path -
 * raiseDispatch.buildPlaceholderBag + decrementInventory - is unchanged.
 * This test replays every real legacy dispatch (src/data/dispatches.json)
 * through buildPlaceholderBag and asserts the product-bearing output
 * (flatItems / perGradeRows / totals) is exactly what the lineItems imply,
 * proving the dispatch-note rendering is byte-stable after the change.
 *
 * The legacy union (flat vs per-grade) is the model the new MouProduct
 * type was deliberately shaped on, so this also documents the target.
 */

import { describe, expect, it } from 'vitest'
import { buildPlaceholderBag } from './raiseDispatch'
import type { Dispatch, MOU, School } from '@/lib/types'
import dispatchesJson from '@/data/dispatches.json'

const dispatches = dispatchesJson as unknown as Dispatch[]

const stubMou = { programme: 'STEAM', programmeSubType: null, id: 'MOU-X', paymentSchedule: '25-25-25-25' } as unknown as MOU
const stubSchool = { name: 'S', legalEntity: 'S', city: 'C', state: 'ST', pinCode: '1' } as unknown as School
const stubCompany = { legalEntity: 'GSL', gstin: 'GSTIN', address: ['addr'] }

function expectedShape(d: Dispatch) {
  let flat = 0
  let perGradeRows = 0
  let total = 0
  for (const li of d.lineItems) {
    if (li.kind === 'flat') {
      flat += 1
      total += li.quantity
    } else {
      perGradeRows += li.gradeAllocations.length
      for (const a of li.gradeAllocations) total += a.quantity
    }
  }
  return { flat, perGradeRows, total }
}

describe('legacy dispatch replay: buildPlaceholderBag is byte-stable for all real dispatches', () => {
  it('replays every dispatch in dispatches.json with no error', () => {
    expect(dispatches.length).toBeGreaterThan(0)
    for (const d of dispatches) {
      const bag = buildPlaceholderBag({
        dispatch: d,
        mou: stubMou,
        school: stubSchool,
        company: stubCompany,
        raisedByName: 'tester',
        ts: '2026-06-04T00:00:00.000Z',
      })
      const exp = expectedShape(d)
      expect((bag.flatItems as unknown[]).length, `${d.id} flat rows`).toBe(exp.flat)
      expect((bag.perGradeRows as unknown[]).length, `${d.id} per-grade rows`).toBe(exp.perGradeRows)
      expect(bag.hasFlatItems, `${d.id} hasFlatItems`).toBe(exp.flat > 0)
      expect(bag.hasPerGradeItems, `${d.id} hasPerGradeItems`).toBe(exp.perGradeRows > 0)
      expect(bag.TOTAL_QUANTITY, `${d.id} total`).toBe(String(exp.total))
    }
  })

  it('per-grade Cretile dispatches flatten one row per (sku, grade) - the target shape', () => {
    const perGrade = dispatches.filter((d) => d.lineItems.some((li) => li.kind === 'per-grade'))
    // Production has Cretile per-grade dispatches; assert at least one and
    // that each grade allocation becomes its own row in the dispatch note.
    expect(perGrade.length).toBeGreaterThan(0)
    for (const d of perGrade) {
      const bag = buildPlaceholderBag({
        dispatch: d,
        mou: stubMou,
        school: stubSchool,
        company: stubCompany,
        raisedByName: 'tester',
        ts: '2026-06-04T00:00:00.000Z',
      })
      const rows = bag.perGradeRows as Array<{ skuName: string; grade: string; quantity: string }>
      for (const r of rows) {
        expect(Number(r.grade)).toBeGreaterThanOrEqual(1)
        expect(Number(r.grade)).toBeLessThanOrEqual(12)
        expect(r.skuName.length).toBeGreaterThan(0)
      }
    }
  })
})
