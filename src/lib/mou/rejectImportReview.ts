/*
 * MouImportReviewItem rejection (Phase C5a-2).
 *
 * Marks a quarantined import-review item as resolution: 'rejected'
 * with reviewer attribution + a structured RejectionReason and
 * optional notes. Notes are required when reason === 'other' so the
 * one-off case is captured legibly. Future analytics ("what % of
 * rejections are data-quality vs duplicate") read RejectionReason
 * directly.
 *
 * Permission gate: 'mou-import-review:resolve' (Admin via wildcard,
 * OpsHead via explicit grant per permissions.ts line 92).
 *
 * Items are matched by the queuedAt + rawRecord.id tuple (queuedAt
 * alone is not unique if a record bounces between quarantine
 * categories; rawRecord.id uniquely identifies the source MOU).
 *
 * Per DESIGN.md "Audit log conventions" the resolved* fields plus
 * RejectionReason + rejectionNotes are themselves the audit anchor
 * for this event; MouImportReviewItem does not carry its own
 * auditLog, matching the existing fixture shape.
 */

import type {
  MouImportReviewItem,
  RejectionReason,
  User,
} from '@/lib/types'
import mouImportReviewJson from '@/data/mou_import_review.json'
import usersJson from '@/data/users.json'
import { enqueueUpdate } from '@/lib/pendingUpdates'
import { canPerform } from '@/lib/auth/permissions'

const VALID_REASONS: ReadonlyArray<RejectionReason> = [
  'data-quality-issue',
  'duplicate-of-existing',
  'out-of-scope',
  'awaiting-source-correction',
  'other',
]

export interface RejectImportReviewArgs {
  queuedAt: string
  rawRecordId: string
  rejectionReason: RejectionReason
  rejectionNotes?: string
  rejectedBy: string
}

export type RejectImportReviewFailureReason =
  | 'permission'
  | 'unknown-user'
  | 'item-not-found'
  | 'already-resolved'
  | 'invalid-rejection-reason'
  | 'notes-required'

export type RejectImportReviewResult =
  | { ok: true; item: MouImportReviewItem }
  | { ok: false; reason: RejectImportReviewFailureReason }

export interface RejectImportReviewDeps {
  items: MouImportReviewItem[]
  users: User[]
  enqueue: typeof enqueueUpdate
  now: () => Date
}

const defaultDeps: RejectImportReviewDeps = {
  items: mouImportReviewJson as unknown as MouImportReviewItem[],
  users: usersJson as unknown as User[],
  enqueue: enqueueUpdate,
  now: () => new Date(),
}

function rawRecordId(item: MouImportReviewItem): string | null {
  if (typeof item.rawRecord !== 'object' || item.rawRecord === null) return null
  const id = (item.rawRecord as { id?: unknown }).id
  return typeof id === 'string' ? id : null
}

export async function rejectImportReview(
  args: RejectImportReviewArgs,
  deps: RejectImportReviewDeps = defaultDeps,
): Promise<RejectImportReviewResult> {
  const user = deps.users.find((u) => u.id === args.rejectedBy)
  if (!user) return { ok: false, reason: 'unknown-user' }
  if (!canPerform(user, 'mou-import-review:resolve')) {
    return { ok: false, reason: 'permission' }
  }

  if (!VALID_REASONS.includes(args.rejectionReason)) {
    return { ok: false, reason: 'invalid-rejection-reason' }
  }

  const trimmedNotes = (args.rejectionNotes ?? '').trim()
  if (args.rejectionReason === 'other' && trimmedNotes === '') {
    return { ok: false, reason: 'notes-required' }
  }

  const item = deps.items.find(
    (i) => i.queuedAt === args.queuedAt && rawRecordId(i) === args.rawRecordId,
  )
  if (!item) return { ok: false, reason: 'item-not-found' }

  if (item.resolution !== null) {
    return { ok: false, reason: 'already-resolved' }
  }

  const ts = deps.now().toISOString()
  const updated: MouImportReviewItem = {
    ...item,
    resolution: 'rejected',
    resolvedAt: ts,
    resolvedBy: args.rejectedBy,
    rejectionReason: args.rejectionReason,
    rejectionNotes: trimmedNotes === '' ? null : trimmedNotes,
  }

  await deps.enqueue({
    queuedBy: args.rejectedBy,
    entity: 'mouImportReview',
    operation: 'update',
    payload: updated as unknown as Record<string, unknown>,
  })

  return { ok: true, item: updated }
}
