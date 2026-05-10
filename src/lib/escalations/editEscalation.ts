/*
 * W4-I.4 MM5 editEscalation.
 *
 * Patch-based Escalation editor for the new ticketing-system fields
 * (status, category, type) plus the fields operators routinely tweak
 * during a ticket's lifecycle (severity, assignedTo, description,
 * resolutionNotes). Mirrors the editOpportunity (W4-F.3) shape.
 *
 * Permission gate: 'escalation:resolve' (Admin via wildcard,
 * Leadership, OpsHead, SalesHead, TrainerHead). Lane-scoped roles
 * still see only their own lane on the list/detail (enforced by the
 * page-level isVisibleToUser check); the lib trusts that gate.
 *
 * Auto-fields are NOT editable: id, createdAt, createdBy, schoolId,
 * mouId, lane, level, origin, originId, notifiedEmails, auditLog.
 * resolvedAt / resolvedBy are auto-populated when status flips to
 * 'Closed' (mirrors the resolveEscalation pattern that pre-MM5 lib
 * authoring would have used).
 *
 * Status / category / type are stored verbatim. Status enum-validates
 * against the MM5 vocabulary; category and type are free-text per the
 * minimal-container pattern (D-026 enumerates after round 2).
 */

import type {
  AuditEntry,
  Escalation,
  EscalationCategory,
  EscalationSeverity,
  EscalationStatus,
  EscalationType,
  PendingUpdate,
  User,
} from '@/lib/types'
import escalationsJson from '@/data/escalations.json'
import usersJson from '@/data/users.json'
import { canPerform } from '@/lib/auth/permissions'
import { enqueueUpdate } from '@/lib/pendingUpdates'

const VALID_STATUSES: ReadonlyArray<EscalationStatus> = [
  'Open',
  'WIP',
  'Closed',
  'Transferred',
  'Dispatched',
  'In Transit',
]
const VALID_SEVERITIES: ReadonlyArray<EscalationSeverity> = [
  'critical',
  'high',
  'medium',
  'low',
]
const VALID_CATEGORIES: ReadonlyArray<EscalationCategory> = [
  'Dispatch Delay',
  'Payment Issue',
  'Quality Complaint',
  'Training Issue',
  'School Communication',
  'Inventory Shortfall',
  'Vendor Issue',
  'Other',
]
const VALID_TYPES: ReadonlyArray<EscalationType> = [
  'Internal',
  'Customer-facing',
  'Vendor-facing',
  'Regulatory',
  'Operational',
]

export interface EditEscalationPatch {
  status?: EscalationStatus
  category?: EscalationCategory | null
  type?: EscalationType | null
  severity?: EscalationSeverity
  assignedTo?: string | null
  description?: string
  /**
   * Free-text "Waiting on what/whom?". Populated when status is the
   * "Waiting on Someone Else" relabel of `Transferred`
   * (Swati-feedback batch).
   */
  waitingOn?: string | null
  resolutionNotes?: string | null
}

export interface EditEscalationArgs {
  id: string
  patch: EditEscalationPatch
  editedBy: string
  notes?: string | null
}

export type EditEscalationFailureReason =
  | 'permission'
  | 'unknown-user'
  | 'escalation-not-found'
  | 'invalid-status'
  | 'invalid-severity'
  | 'invalid-category'
  | 'invalid-type'
  | 'missing-description'
  | 'no-changes'

export type EditEscalationResult =
  | { ok: true; escalation: Escalation; changedFields: string[] }
  | { ok: false; reason: EditEscalationFailureReason }

export interface EditEscalationDeps {
  escalations: Escalation[]
  users: User[]
  enqueue: (params: {
    queuedBy: string
    entity: import('@/lib/types').PendingUpdateEntity
    operation: 'create' | 'update' | 'delete'
    payload: Record<string, unknown>
  }) => Promise<PendingUpdate>
  now: () => Date
}

const defaultDeps: EditEscalationDeps = {
  escalations: escalationsJson as unknown as Escalation[],
  users: usersJson as unknown as User[],
  enqueue: enqueueUpdate,
  now: () => new Date(),
}

function nullIfBlank(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null
  const trimmed = String(value).trim()
  return trimmed === '' ? null : trimmed
}

export async function editEscalation(
  args: EditEscalationArgs,
  deps: EditEscalationDeps = defaultDeps,
): Promise<EditEscalationResult> {
  const user = deps.users.find((u) => u.id === args.editedBy)
  if (!user) return { ok: false, reason: 'unknown-user' }
  if (!canPerform(user, 'escalation:resolve')) {
    return { ok: false, reason: 'permission' }
  }

  const existing = deps.escalations.find((e) => e.id === args.id)
  if (!existing) return { ok: false, reason: 'escalation-not-found' }

  const next: Escalation = { ...existing }
  const ts = deps.now().toISOString()

  if (args.patch.status !== undefined) {
    if (!VALID_STATUSES.includes(args.patch.status)) {
      return { ok: false, reason: 'invalid-status' }
    }
    next.status = args.patch.status
  }
  if (args.patch.category !== undefined) {
    if (args.patch.category !== null && !VALID_CATEGORIES.includes(args.patch.category)) {
      return { ok: false, reason: 'invalid-category' }
    }
    next.category = args.patch.category
  }
  if (args.patch.type !== undefined) {
    if (args.patch.type !== null && !VALID_TYPES.includes(args.patch.type)) {
      return { ok: false, reason: 'invalid-type' }
    }
    next.type = args.patch.type
  }
  if (args.patch.severity !== undefined) {
    if (!VALID_SEVERITIES.includes(args.patch.severity)) {
      return { ok: false, reason: 'invalid-severity' }
    }
    next.severity = args.patch.severity
  }
  if (args.patch.assignedTo !== undefined) {
    next.assignedTo = nullIfBlank(args.patch.assignedTo)
  }
  if (args.patch.description !== undefined) {
    const v = args.patch.description.trim()
    if (v === '') return { ok: false, reason: 'missing-description' }
    next.description = v
  }
  if (args.patch.waitingOn !== undefined) {
    next.waitingOn = nullIfBlank(args.patch.waitingOn)
  }
  if (args.patch.resolutionNotes !== undefined) {
    next.resolutionNotes = nullIfBlank(args.patch.resolutionNotes)
  }

  // Auto-derive resolvedAt / resolvedBy when status flips to Closed
  // and the existing record was not already Closed. Once Closed, the
  // resolvedAt / resolvedBy stay frozen even if the operator edits
  // category or type after closing.
  if (
    next.status === 'Closed'
    && existing.status !== 'Closed'
  ) {
    next.resolvedAt = ts
    next.resolvedBy = args.editedBy
  }

  const editableKeys: Array<keyof EditEscalationPatch> = [
    'status', 'category', 'type', 'severity', 'assignedTo',
    'description', 'waitingOn', 'resolutionNotes',
  ]
  const changedFields: string[] = []
  const before: Record<string, unknown> = {}
  const after: Record<string, unknown> = {}
  for (const key of editableKeys) {
    if (existing[key as keyof Escalation] !== next[key as keyof Escalation]) {
      changedFields.push(key)
      before[key] = existing[key as keyof Escalation]
      after[key] = next[key as keyof Escalation]
    }
  }
  if (existing.resolvedAt !== next.resolvedAt) {
    changedFields.push('resolvedAt')
    before.resolvedAt = existing.resolvedAt
    after.resolvedAt = next.resolvedAt
  }
  if (existing.resolvedBy !== next.resolvedBy) {
    changedFields.push('resolvedBy')
    before.resolvedBy = existing.resolvedBy
    after.resolvedBy = next.resolvedBy
  }

  if (changedFields.length === 0) {
    return { ok: false, reason: 'no-changes' }
  }

  const audit: AuditEntry = {
    timestamp: ts,
    user: args.editedBy,
    action: 'escalation-edited',
    before,
    after,
    notes: args.notes ?? `Edited fields: ${changedFields.join(', ')}.`,
  }

  const updated: Escalation = {
    ...next,
    auditLog: [...existing.auditLog, audit],
  }

  await deps.enqueue({
    queuedBy: args.editedBy,
    entity: 'escalation',
    operation: 'update',
    payload: updated as unknown as Record<string, unknown>,
  })

  return { ok: true, escalation: updated, changedFields }
}
