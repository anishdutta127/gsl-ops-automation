/*
 * GUARD: the Step 2 Ops review track (opsReviewStatus) must stay OUT of
 * the money/PI gate. The whole reason it is a separate field (not a new
 * MouStatus value) is that MouStatus feeds PI_BLOCKED_STATUSES; an Ops
 * value reaching that list would gate PI generation on Ops state.
 *
 * Two assertions:
 *  1. PI_BLOCKED_STATUSES is exactly the 4 MouStatus values it always was.
 *  2. No pricing / PI module references opsReviewStatus / ops_review_status.
 */

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { PI_BLOCKED_STATUSES } from './pi'

const PRICING_PI_FILES = [
  'src/lib/mouSystem/pricing.ts',
  'src/lib/mouSystem/recalc.ts',
  'src/lib/mouSystem/installments.ts',
  'src/lib/mouSystem/pi.ts',
  'src/lib/pi/generatePi.ts',
  'src/lib/pi/templates.ts',
  'src/lib/pi/blockers.ts',
  'src/lib/finance/computePendingPi.ts',
]

describe('Ops review track is isolated from the money/PI gate', () => {
  it('PI_BLOCKED_STATUSES is unchanged (the 4 MouStatus values only)', () => {
    expect([...PI_BLOCKED_STATUSES]).toEqual([
      'Draft',
      'Sent for Signing',
      'Awaiting Signature',
      'Pending Signature',
    ])
  })

  for (const rel of PRICING_PI_FILES) {
    it(`${rel} does not read opsReviewStatus`, () => {
      const src = readFileSync(resolve(process.cwd(), rel), 'utf8')
      const offenders = ['opsReviewStatus', 'ops_review_status'].filter((t) => src.includes(t))
      expect(offenders, `${rel} must not reference the Ops review track`).toEqual([])
    })
  }
})
