/*
 * Override approver lookup (Gate 5A.5 Step 4).
 *
 * The dispatch override flow requires a designated approver who can
 * bypass the payment gate on trial / pilot / urgent-partnership MOUs.
 * Today the seat sits with Shashank S. (the operations head); the
 * default constant below records that assignment.
 *
 * Lookup precedence:
 *   1. stage_responsibility.json row with stage='dispatch-override-approver'
 *      and a non-null responsibleUserId. (Edit at /admin/stage-responsibility.)
 *   2. DEFAULT_OVERRIDE_APPROVER_USER_ID constant.
 *
 * The synthetic stage value is a cast-only addition; it does NOT
 * extend the LifecycleStage enum. Lifecycle-stage iteration filters
 * to known values via STAGE_ORDER membership so the synthetic row is
 * ignored everywhere except this helper. See docs/role-decisions.md
 * for the rationale: pilot wants one configurable approver, not a
 * new lifecycle stage in the master tracker.
 *
 * Returns the User.id string. Pair with users.json to resolve the
 * human-readable name when needed at render time.
 */

import type { StageResponsibility } from '@/lib/types'
import responsibilityJson from '@/data/stage_responsibility.json'

export const DEFAULT_OVERRIDE_APPROVER_USER_ID = 'shashank.s'

export const OVERRIDE_APPROVER_STAGE_KEY = 'dispatch-override-approver' as const

interface SystemResponsibilityRow {
  stage: string
  responsibleUserId: string | null
}

export function getDispatchOverrideApproverUserId(
  source: ReadonlyArray<StageResponsibility | SystemResponsibilityRow> = responsibilityJson as unknown as StageResponsibility[],
): string {
  for (const row of source) {
    if (row.stage === OVERRIDE_APPROVER_STAGE_KEY) {
      if (row.responsibleUserId && row.responsibleUserId.trim() !== '') {
        return row.responsibleUserId
      }
    }
  }
  return DEFAULT_OVERRIDE_APPROVER_USER_ID
}
