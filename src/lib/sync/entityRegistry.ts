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
  Exclude<PendingUpdateEntity, 'piCounter'>,
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
}

export function pathForEntity(entity: PendingUpdateEntity): string | null {
  if (entity === 'piCounter') return null
  return ARRAY_ENTITY_TO_PATH[entity] ?? null
}
