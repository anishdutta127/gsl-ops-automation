/*
 * GUARD: the product portfolio is DISPATCH TRACKING ONLY. No product
 * field may reach any pricing/PI codepath - pricing stays per-student.
 *
 * This was a hard constraint of the Step 1 rework: "Do not let the product
 * model touch the pricing/PI/money logic we've spent weeks getting right."
 *
 * The guard is a source scan: it reads every pricing / PI / recalc module
 * and asserts none of them reference an MOU-product field. A source scan
 * (rather than a behavioural test) is the faithful expression of the
 * invariant - it proves the pricing code literally cannot read products,
 * not merely that it happens to produce the same number today.
 *
 * If a future change makes a pricing module read products, this test fails
 * loudly and the author must justify breaking the dispatch-tracking-only
 * boundary.
 */

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Every module on a pricing / PI / money codepath. Adding a new pricing
// module? Add it here so the guard keeps covering the surface.
const PRICING_PI_FILES = [
  'src/lib/mouSystem/pricing.ts',
  'src/lib/mouSystem/recalc.ts',
  'src/lib/mouSystem/installments.ts',
  'src/lib/mouSystem/pi.ts',
  'src/lib/mouSystem/reconcile.ts',
  'src/lib/mouSystem/attribution.ts',
  'src/lib/pi/generatePi.ts',
  'src/lib/pi/templates.ts',
  'src/lib/pi/blockers.ts',
  'src/lib/finance/computePendingPi.ts',
  'src/lib/mou/studentCountRecalc.ts',
]

// Tokens that are unambiguously MOU-product fields. A pricing module
// mentioning any of these is reading the product portfolio - forbidden.
// (VEX PI line items use partNumber/productName, never these tokens, so
// the VEX programme is not implicated.)
const FORBIDDEN = [
  'productSelection',
  'MouProduct',
  'perGradeQuantity',
  'gradeSpecific',
  '.products',
  'deriveProductSelection',
]

describe('products are dispatch-tracking only (pricing/PI isolation guard)', () => {
  for (const rel of PRICING_PI_FILES) {
    it(`${rel} reads no MOU-product field`, () => {
      const src = readFileSync(resolve(process.cwd(), rel), 'utf8')
      const offenders = FORBIDDEN.filter((tok) => src.includes(tok))
      expect(
        offenders,
        `${rel} must not reference MOU-product fields (found: ${offenders.join(', ')}). `
          + 'Products are dispatch-tracking only; pricing stays per-student.',
      ).toEqual([])
    })
  }
})
