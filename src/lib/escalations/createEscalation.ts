/*
 * createEscalation (Gate 4 Step 5).
 *
 * Manual-origin escalation create flow backing /escalations/new. Pre-
 * Gate-4 escalations only landed in the system via the two auto-create
 * paths (feedback rating <=2, p2-override). This lib lets any logged-in
 * user raise a ticket directly.
 *
 * Persistence: enqueueUpdate, single canonical sink. SLA target date
 * is computed from severity by escalations/sla.ts so the contract
 * lives in one place. Audit entry is 'create' on the new escalation;
 * downstream Step 4 (workflow handoff) reads this entry for the
 * "raised by X" banner copy.
 *
 * Permission gate: 'escalation:create'. Per Gate 1 the action is open
 * to every authenticated user (so Sales can raise a ticket on Ops, Ops
 * on Finance, etc.) while resolution stays scoped to the owning dept
 * via the existing 'escalation:resolve' gate.
 *
 * Notification fan-out happens at the caller (server action / API
 * route) AFTER this lib persists, because the canonical broadcast
 * helper lives in src/lib/notifications/createNotification.ts and
 * importing it here would create a circular dep with the trigger
 * wiring tests.
 */

import crypto from 'node:crypto'
import type {
  AuditEntry,
  Escalation,
  EscalationCategory,
  EscalationLane,
  EscalationLevel,
  EscalationSeverity,
  EscalationStage,
  EscalationType,
  PendingUpdate,
  User,
} from '@/lib/types'
import escalationsJson from '@/data/escalations.json'
import usersJson from '@/data/users.json'
import { canPerform } from '@/lib/auth/permissions'
import { enqueueUpdate } from '@/lib/pendingUpdates'
import { computeSlaTargetDate } from './sla'

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
const VALID_DEPARTMENTS: ReadonlyArray<'sales' | 'ops' | 'finance'> = [
  'sales',
  'ops',
  'finance',
]

// Lane mapping: ops + finance escalations land on the OPS lane; sales
// land on the SALES lane. Phase 1 escalation list filters route on
// lane, so we collapse finance under OPS until the Sales module
// returns and finance gets its own visibility lane.
function laneForDepartment(dept: 'sales' | 'ops' | 'finance'): EscalationLane {
  if (dept === 'sales') return 'SALES'
  return 'OPS'
}

export interface CreateEscalationArgs {
  description: string
  severity: EscalationSeverity
  category: EscalationCategory | null
  type: EscalationType | null
  ownedByDepartment: 'sales' | 'ops' | 'finance'
  schoolId: string | null
  mouId: string | null
  assignedTo: string | null
  createdBy: string
  /** Default 'mou-signed' so Gate 1's stage taxonomy stays valid.
   *  Caller may override (e.g., 'kit-dispatch' when raising against a dispatch). */
  stage?: EscalationStage
}

export type CreateEscalationFailureReason =
  | 'permission'
  | 'unknown-user'
  | 'missing-description'
  | 'invalid-severity'
  | 'invalid-category'
  | 'invalid-type'
  | 'invalid-department'

export type CreateEscalationResult =
  | { ok: true; escalation: Escalation }
  | { ok: false; reason: CreateEscalationFailureReason }

export interface CreateEscalationDeps {
  escalations: Escalation[]
  users: User[]
  enqueue: (params: {
    queuedBy: string
    entity: import('@/lib/types').PendingUpdateEntity
    operation: 'create' | 'update' | 'delete'
    payload: Record<string, unknown>
  }) => Promise<PendingUpdate>
  uuid: () => string
  now: () => Date
}

const defaultDeps: CreateEscalationDeps = {
  escalations: escalationsJson as unknown as Escalation[],
  users: usersJson as unknown as User[],
  enqueue: enqueueUpdate,
  uuid: () => crypto.randomUUID(),
  now: () => new Date(),
}

function nullIfBlank(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null
  const trimmed = String(value).trim()
  return trimmed === '' ? null : trimmed
}

export async function createEscalation(
  args: CreateEscalationArgs,
  deps: CreateEscalationDeps = defaultDeps,
): Promise<CreateEscalationResult> {
  const user = deps.users.find((u) => u.id === args.createdBy)
  if (!user) return { ok: false, reason: 'unknown-user' }
  if (!canPerform(user, 'escalation:create')) {
    return { ok: false, reason: 'permission' }
  }

  const description = args.description.trim()
  if (description === '') return { ok: false, reason: 'missing-description' }
  if (!VALID_SEVERITIES.includes(args.severity)) {
    return { ok: false, reason: 'invalid-severity' }
  }
  if (args.category !== null && !VALID_CATEGORIES.includes(args.category)) {
    return { ok: false, reason: 'invalid-category' }
  }
  if (args.type !== null && !VALID_TYPES.includes(args.type)) {
    return { ok: false, reason: 'invalid-type' }
  }
  if (!VALID_DEPARTMENTS.includes(args.ownedByDepartment)) {
    return { ok: false, reason: 'invalid-department' }
  }

  const ts = deps.now().toISOString()
  const id = `ESC-${deps.uuid().slice(0, 8).toUpperCase()}`
  const lane = laneForDepartment(args.ownedByDepartment)
  const level: EscalationLevel = args.severity === 'critical' ? 'L3'
    : args.severity === 'high' ? 'L2'
    : 'L1'

  const slaTargetDate = computeSlaTargetDate({
    createdAt: ts,
    severity: args.severity,
  })

  const audit: AuditEntry = {
    timestamp: ts,
    user: args.createdBy,
    action: 'create',
    after: {
      kind: 'manual',
      severity: args.severity,
      category: args.category,
      ownedByDepartment: args.ownedByDepartment,
    },
    notes: `Manually raised by ${args.createdBy}.`,
  }

  const escalation: Escalation = {
    id,
    createdAt: ts,
    createdBy: args.createdBy,
    schoolId: nullIfBlank(args.schoolId) ?? '',
    mouId: nullIfBlank(args.mouId),
    stage: args.stage ?? 'mou-signed',
    lane,
    level,
    origin: 'manual',
    originId: null,
    severity: args.severity,
    description,
    assignedTo: nullIfBlank(args.assignedTo),
    notifiedEmails: [],
    status: 'Open',
    category: args.category,
    type: args.type,
    ownedByDepartment: args.ownedByDepartment,
    slaTargetDate,
    slaBreached: false,
    waitingOn: null,
    resolutionNotes: null,
    resolvedAt: null,
    resolvedBy: null,
    auditLog: [audit],
  }

  await deps.enqueue({
    queuedBy: args.createdBy,
    entity: 'escalation',
    operation: 'create',
    payload: escalation as unknown as Record<string, unknown>,
  })

  return { ok: true, escalation }
}

export const __testing__ = {
  VALID_SEVERITIES,
  VALID_CATEGORIES,
  VALID_TYPES,
  VALID_DEPARTMENTS,
  laneForDepartment,
}
