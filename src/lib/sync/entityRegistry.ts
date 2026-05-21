/*
 * W4-I.3.A entity registry.
 *
 * Maps each PendingUpdateEntity to the canonical JSON file path under
 * src/data/. The drain runner uses this to know which file to mutate
 * for each pending entry. Order matches PendingUpdateEntity union in
 * types.ts to keep the two definitions in lock-step.
 *
 * Excluded from drain: piCounter is an OBJECT (not an array) and is
 * already mutated atomically inside `issuePiNumberAtomic`; it never
 * goes through enqueueUpdate. If a queue entry with entity 'piCounter'
 * appears, it is left in the queue and surfaced as an anomaly.
 */

import type { PendingUpdateEntity } from '@/lib/types'

export const ARRAY_ENTITY_TO_PATH: Record<
  Exclude<PendingUpdateEntity, 'piCounter' | 'piCounterMap'>,
  string
> = {
  salesTeam: 'src/data/sales_team.json',
  mou: 'src/data/mous.json',
  school: 'src/data/schools.json',
  schoolGroup: 'src/data/school_groups.json',
  communication: 'src/data/communications.json',
  escalation: 'src/data/escalations.json',
  ccRule: 'src/data/cc_rules.json',
  feedback: 'src/data/feedback.json',
  magicLinkToken: 'src/data/magic_link_tokens.json',
  dispatch: 'src/data/dispatches.json',
  dispatchRequest: 'src/data/dispatch_requests.json',
  mouImportReview: 'src/data/mou_import_review.json',
  payment: 'src/data/payments.json',
  paymentLog: 'src/data/payment_logs.json',
  user: 'src/data/users.json',
  lifecycleRule: 'src/data/lifecycle_rules.json',
  intakeRecord: 'src/data/intake_records.json',
  schoolSpoc: 'src/data/school_spocs.json',
  notification: 'src/data/notifications.json',
  salesOpportunity: 'src/data/sales_opportunities.json',
  inventoryItem: 'src/data/inventory_items.json',
  communicationTemplate: 'src/data/communication_templates.json',
  kitDispatch: 'src/data/kit_dispatches.json',
  // Gate 2 entity migrations
  adjustment: 'src/data/adjustments.json',
  signedValues: 'src/data/signed_values.json',
  vexProduct: 'src/data/vex_products.json',
  vexPi: 'src/data/vex_pis.json',
  vexDispatch: 'src/data/vex_dispatches.json',
  vexOrder: 'src/data/vex_orders.json',
  vendor: 'src/data/vendors.json',
  agreement: 'src/data/agreements.json',
  piIssue: 'src/data/pi_issues.json',
  // Gate 4.9: stage responsibility config. Array of one row per
  // lifecycle stage; the lib synthesises `id=stage` on the payload so
  // the drain's by-id upsert matches.
  stageResponsibility: 'src/data/stage_responsibility.json',
  // Phase 5 (2026-05-19, Pranav review #4): student-count change events.
  // Append-only audit log; the MOU points at events via
  // mou.studentCountEventIds.
  studentCountEvent: 'src/data/student_count_events.json',
  // Phase 6F Part 4: per-(user, day, item) homepage interaction log.
  // Drives rollover + urgency promotion + dismissal-vs-promotion
  // honour. Append-only; entries keyed by date + userId + itemId.
  homepageActionLog: 'src/data/homepage_action_log.json',
}

export function pathForEntity(entity: PendingUpdateEntity): string | null {
  // piCounter + piCounterMap are object-shaped, not arrays; the drain
  // only handles arrays. Counter writes go through atomic counter-
  // increment helpers, not enqueueUpdate.
  if (entity === 'piCounter' || entity === 'piCounterMap') return null
  return ARRAY_ENTITY_TO_PATH[entity] ?? null
}
