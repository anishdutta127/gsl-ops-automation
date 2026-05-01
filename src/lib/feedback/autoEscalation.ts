/*
 * Feedback auto-escalation hook (Update 3, promoted from Phase 1.1
 * to Phase 1).
 *
 * On every Feedback write, scan ratings[] for entries with
 * `rating !== null && rating <= 2`. For the worst rating (lowest
 * value; ties broken by FeedbackCategory canonical order), create
 * an Escalation routed to the corresponding lane.
 *
 * Lane mapping (per step 8 Q-I):
 *   training-quality  -> ACADEMICS
 *   trainer-rapport   -> ACADEMICS
 *   delivery-timing   -> OPS
 *   kit-condition     -> OPS
 *
 * Severity:
 *   Any rating === 1   -> 'high'
 *   Otherwise (lowest === 2) -> 'medium'
 *
 * The Escalation is enqueued via the standard write path (queue +
 * Contents API). escalationLevelDefault('OPS' | 'ACADEMICS', 'L1')
 * returns null today; that is by design (L1 is dynamic per case);
 * callers downstream populate notifiedEmails via the lane fan-out
 * resolver.
 */

import crypto from 'node:crypto'
import type {
  AuditEntry,
  Escalation,
  EscalationLane,
  EscalationSeverity,
  Feedback,
  FeedbackCategory,
  FeedbackRating,
} from '@/lib/types'
import { enqueueUpdate } from '@/lib/pendingUpdates'
import { createNotification } from '@/lib/notifications/createNotification'
import { escalationLevelDefault } from '@/lib/auth/permissions'

const CATEGORY_TO_LANE: Record<FeedbackCategory, EscalationLane> = {
  'training-quality': 'ACADEMICS',
  'kit-condition': 'OPS',
  'delivery-timing': 'OPS',
  'trainer-rapport': 'ACADEMICS',
}

const CATEGORY_ORDER: FeedbackCategory[] = [
  'training-quality',
  'kit-condition',
  'delivery-timing',
  'trainer-rapport',
]

function pickWorstRating(ratings: FeedbackRating[]): FeedbackRating | null {
  const low = ratings.filter(
    (r) => r.rating !== null && r.rating <= 2,
  )
  if (low.length === 0) return null

  let worst = low[0]!
  for (let i = 1; i < low.length; i++) {
    const candidate = low[i]!
    const candidateRating = candidate.rating ?? 5
    const worstRating = worst.rating ?? 5
    if (candidateRating < worstRating) {
      worst = candidate
    } else if (candidateRating === worstRating) {
      const cIdx = CATEGORY_ORDER.indexOf(candidate.category)
      const wIdx = CATEGORY_ORDER.indexOf(worst.category)
      if (cIdx < wIdx) worst = candidate
    }
  }
  return worst
}

export interface AutoEscalationOptions {
  now?: Date
  // Test injection: override enqueue (defaults to enqueueUpdate from
  // the queue path).
  enqueue?: typeof enqueueUpdate
}

export async function feedbackAutoEscalation(
  feedback: Feedback,
  options: AutoEscalationOptions = {},
): Promise<Escalation | null> {
  const worst = pickWorstRating(feedback.ratings)
  if (worst === null) return null

  const now = options.now ?? new Date()
  const ts = now.toISOString()
  const enqueue = options.enqueue ?? enqueueUpdate

  const lane = CATEGORY_TO_LANE[worst.category]
  const severity: EscalationSeverity = feedback.ratings.some(
    (r) => r.rating === 1,
  )
    ? 'high'
    : 'medium'

  const commentSuffix = worst.comment ? ` "${worst.comment}"` : ''
  const description = `Feedback rating ${worst.rating} on ${worst.category} for installment ${feedback.installmentSeq}; auto-escalated.${commentSuffix}`

  const auditEntry: AuditEntry = {
    timestamp: ts,
    user: 'system',
    action: 'auto-create-from-feedback',
    notes: `Auto-created via feedbackAutoEscalation hook (Update 3) from Feedback ${feedback.id}.`,
  }

  const escalation: Escalation = {
    id: `ESC-AUTO-${crypto.randomUUID().slice(0, 8)}`,
    createdAt: ts,
    createdBy: 'system',
    schoolId: feedback.schoolId,
    mouId: feedback.mouId,
    stage: 'feedback-escalation',
    lane,
    level: 'L1',
    origin: 'feedback',
    originId: feedback.id,
    severity,
    description,
    assignedTo: null,
    notifiedEmails: [],
    status: 'Open',
    category: null,
    type: null,
    resolutionNotes: null,
    resolvedAt: null,
    resolvedBy: null,
    auditLog: [auditEntry],
  }

  await enqueue({
    queuedBy: 'system',
    entity: 'escalation',
    operation: 'create',
    payload: escalation as unknown as Record<string, unknown>,
  })

  // W4-E.5 notify the lane head (L2 default; L1 is dynamic and not
  // resolved at auto-create time) so the escalation gets eyes
  // immediately. createdBy='system' bypasses the self-exclusion;
  // sender='system' is the literal that broadcastNotification
  // recognises.
  const laneHead = escalationLevelDefault(lane, 'L2')
  if (laneHead) {
    await createNotification({
      recipientUserId: laneHead,
      senderUserId: 'system',
      kind: 'escalation-assigned',
      title: `Escalation: ${worst.category} (rating ${worst.rating ?? 'N/A'})`,
      body: description,
      actionUrl: `/escalations/${escalation.id}`,
      payload: {
        escalationId: escalation.id,
        mouId: feedback.mouId,
        schoolName: null,
        lane,
        level: 'L1',
        severity,
        description,
      },
      relatedEntityId: escalation.id,
    }).catch((err) => {
      console.error('[feedbackAutoEscalation] notification failed', err)
    })
  }

  return escalation
}
