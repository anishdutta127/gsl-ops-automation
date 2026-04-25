/*
 * Q-G Test 3: reconcileShortlist (TODO scaffold).
 *
 * This is a Q-G test scaffold landed via Item 15b. The subject is
 * `src/lib/reconcile.ts` which is Phase 1 implementation work
 * scheduled for Week 2 (NOT Week 1 scaffolding scope per step 10
 * Item 7). When the lib lands, replace each it.todo() with real
 * assertions per the given/when/then comments below.
 *
 * Vitest reports it.todo() as informational ("4 todo") without
 * blocking CI. Pattern chosen so the 9-test Q-G suite is
 * structurally complete + discoverable today, while implementation
 * + assertions land naturally when the subject does.
 *
 * Per step 8 eng review Q-G Test 3:
 *   "shortlist stability and top-3 accuracy"
 */

import { describe, it } from 'vitest'

describe('Q-G Test 3: reconcileShortlist (Week 2 scope)', () => {
  it.todo(
    'produces a deterministic ranked list (same input -> same order)',
    /*
     * Given: payments.json with 10 unmatched entries; pis.json with
     *        15 pending.
     * When:  shortlist helper runs twice for a specific payment
     *        amount, with identical inputs.
     * Then:  both runs return identical orderings (stable sort
     *        across ties).
     *
     * Test fixture suggestion: write a small fixed payments.json +
     * pis.json into a tmp dir, call reconcileShortlist twice with
     * the same payment amount, deep-equal the results.
     */
  )

  it.todo(
    'known-correct PI appears in top 3 candidates',
    /*
     * Given: a payment amount with a known-matching PI (same amount
     *        within tolerance, same school region, recent date).
     * When:  shortlist helper runs.
     * Then:  the known-correct PI is in result[0..2] (top 3 by
     *        match likelihood).
     *
     * The "known-correct PI" is injected explicitly into the
     * fixture to avoid relying on real production data.
     */
  )

  it.todo(
    'tolerance widening surfaces additional candidates',
    /*
     * Given: a payment amount that is 1.05x a known PI (5% over,
     *        likely GST gross-vs-net delta) and the default
     *        tolerance is 1%.
     * When:  shortlist runs with default tolerance, then with
     *        widened tolerance to 10%.
     * Then:  the widened call produces a strict superset of
     *        candidates that includes the known PI.
     *
     * Reconcile UI exposes a tolerance slider for this exact case
     * (ground-truth report flagged GST net-vs-gross as a common
     * mismatch source).
     */
  )
})
