/*
 * W4-F.3 editOpportunity.
 *
 * Edits any of the 12 mutable fields on a SalesOpportunity. Captures
 * a structured diff (changed fields + before/after VERBATIM strings,
 * no normalisation) on the audit entry so future analysis of "what
 * status vocabulary did operators actually use?" stays faithful.
 *
 * Permission gate: 'sales-opportunity:edit'. Lib enforces own-row
 * vs any-row via createdBy comparison: SalesRep can only edit own;
 * SalesHead + Admin can edit any.
 *
 * Auto-fields are NOT editable: id, createdAt, createdBy,
 * conversionMouId, auditLog, lossReason (use markOpportunityLost
 * for the lost transition). Status / recceStatus / gslModel /
 * approvalNotes stay free-text per Anish option C.
 */

import type {
  AuditEntry,
  PendingUpdate,
  Programme,
  SalesOpportunity,
  SalesPerson,
  User,
} from '@/lib/types'
import salesOpportunitiesJson from '@/data/sales_opportunities.json'
import salesTeamJson from '@/data/sales_team.json'
import usersJson from '@/data/users.json'
import { canPerform } from '@/lib/auth/permissions'
import { enqueueUpdate } from '@/lib/pendingUpdates'
import { REGION_OPTIONS } from './createOpportunity'

const VALID_PROGRAMMES: ReadonlyArray<Programme> = [
  'STEAM',
  'TinkRworks',
  'Young Pioneers',
  'Harvard HBPE',
  'VEX',
]
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * The 12 fields the edit form can touch. Every other field on
 * SalesOpportunity is auto-managed (id, createdAt, createdBy,
 * conversionMouId, lossReason, auditLog).
 */
export interface EditOpportunityPatch {
  schoolName?: string
  schoolId?: string | null
  city?: string
  state?: string
  region?: string
  salesRepId?: string
  programmeProposed?: Programme | null
  gslModel?: string | null
  commitmentsMade?: string | null
  outOfScopeRequirements?: string | null
  recceStatus?: string | null
  recceCompletedAt?: string | null
  status?: string
  approvalNotes?: string | null
  schoolMatchDismissed?: boolean
}

export interface EditOpportunityArgs {
  id: string
  patch: EditOpportunityPatch
  editedBy: string                  // User.id
  /** Free-text note attached to the audit entry. */
  notes?: string | null
}

export type EditOpportunityFailureReason =
  | 'permission'
  | 'unknown-user'
  | 'opportunity-not-found'
  | 'not-creator-and-not-lead'      // SalesRep editing another rep's row
  | 'unknown-sales-rep'
  | 'invalid-region'
  | 'invalid-programme'
  | 'invalid-recce-completed-at'
  | 'missing-school-name'
  | 'missing-city'
  | 'missing-state'
  | 'missing-status'
  | 'no-changes'

export type EditOpportunityResult =
  | { ok: true; opportunity: SalesOpportunity; changedFields: string[] }
  | { ok: false; reason: EditOpportunityFailureReason }

export interface EditOpportunityDeps {
  opportunities: SalesOpportunity[]
  salesPersons: SalesPerson[]
  users: User[]
  enqueue: (params: {
    queuedBy: string
    entity: import('@/lib/types').PendingUpdateEntity
    operation: 'create' | 'update' | 'delete'
    payload: Record<string, unknown>
  }) => Promise<PendingUpdate>
  now: () => Date
}

const defaultDeps: EditOpportunityDeps = {
  opportunities: salesOpportunitiesJson as unknown as SalesOpportunity[],
  salesPersons: salesTeamJson as unknown as SalesPerson[],
  users: usersJson as unknown as User[],
  enqueue: enqueueUpdate,
  now: () => new Date(),
}

/**
 * Roles that can edit any opportunity (not just own). SalesHead is
 * the team lead; Admin via wildcard. Other roles need
 * canPerform('sales-opportunity:edit') AND createdBy match.
 */
function canEditAnyRow(user: User): boolean {
  return user.role === 'Admin' || user.role === 'SalesHead'
}

function nullIfBlank(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null
  const trimmed = String(value).trim()
  return trimmed === '' ? null : trimmed
}

export async function editOpportunity(
  args: EditOpportunityArgs,
  deps: EditOpportunityDeps = defaultDeps,
): Promise<EditOpportunityResult> {
  const user = deps.users.find((u) => u.id === args.editedBy)
  if (!user) return { ok: false, reason: 'unknown-user' }
  if (!canPerform(user, 'sales-opportunity:edit')) {
    return { ok: false, reason: 'permission' }
  }

  const existing = deps.opportunities.find((o) => o.id === args.id)
  if (!existing) return { ok: false, reason: 'opportunity-not-found' }

  if (!canEditAnyRow(user) && existing.createdBy !== args.editedBy) {
    return { ok: false, reason: 'not-creator-and-not-lead' }
  }

  // Compute the proposed next state, validating per-field.
  const next: SalesOpportunity = { ...existing }

  if (args.patch.schoolName !== undefined) {
    const v = args.patch.schoolName.trim()
    if (v === '') return { ok: false, reason: 'missing-school-name' }
    next.schoolName = v
  }
  if (args.patch.schoolId !== undefined) {
    next.schoolId = args.patch.schoolId
  }
  if (args.patch.city !== undefined) {
    const v = args.patch.city.trim()
    if (v === '') return { ok: false, reason: 'missing-city' }
    next.city = v
  }
  if (args.patch.state !== undefined) {
    const v = args.patch.state.trim()
    if (v === '') return { ok: false, reason: 'missing-state' }
    next.state = v
  }
  if (args.patch.region !== undefined) {
    if (!REGION_OPTIONS.includes(args.patch.region)) {
      return { ok: false, reason: 'invalid-region' }
    }
    next.region = args.patch.region
  }
  if (args.patch.salesRepId !== undefined) {
    if (!deps.salesPersons.find((s) => s.id === args.patch.salesRepId)) {
      return { ok: false, reason: 'unknown-sales-rep' }
    }
    next.salesRepId = args.patch.salesRepId
  }
  if (args.patch.programmeProposed !== undefined) {
    if (
      args.patch.programmeProposed !== null
      && !VALID_PROGRAMMES.includes(args.patch.programmeProposed)
    ) {
      return { ok: false, reason: 'invalid-programme' }
    }
    next.programmeProposed = args.patch.programmeProposed
  }
  if (args.patch.gslModel !== undefined) {
    next.gslModel = nullIfBlank(args.patch.gslModel)
  }
  if (args.patch.commitmentsMade !== undefined) {
    next.commitmentsMade = nullIfBlank(args.patch.commitmentsMade)
  }
  if (args.patch.outOfScopeRequirements !== undefined) {
    next.outOfScopeRequirements = nullIfBlank(args.patch.outOfScopeRequirements)
  }
  if (args.patch.recceStatus !== undefined) {
    next.recceStatus = nullIfBlank(args.patch.recceStatus)
  }
  if (args.patch.recceCompletedAt !== undefined) {
    if (
      args.patch.recceCompletedAt !== null
      && args.patch.recceCompletedAt !== ''
      && !ISO_DATE_RE.test(args.patch.recceCompletedAt)
    ) {
      return { ok: false, reason: 'invalid-recce-completed-at' }
    }
    next.recceCompletedAt = args.patch.recceCompletedAt && args.patch.recceCompletedAt !== ''
      ? args.patch.recceCompletedAt
      : null
  }
  if (args.patch.status !== undefined) {
    const v = args.patch.status.trim()
    if (v === '') return { ok: false, reason: 'missing-status' }
    next.status = v
  }
  if (args.patch.approvalNotes !== undefined) {
    next.approvalNotes = nullIfBlank(args.patch.approvalNotes)
  }
  if (args.patch.schoolMatchDismissed !== undefined) {
    next.schoolMatchDismissed = args.patch.schoolMatchDismissed
  }

  // Compute changed fields by comparing current vs next (skip auto-fields).
  const changedFields: string[] = []
  const before: Record<string, unknown> = {}
  const after: Record<string, unknown> = {}
  const editableKeys: Array<keyof EditOpportunityPatch> = [
    'schoolName', 'schoolId', 'city', 'state', 'region', 'salesRepId',
    'programmeProposed', 'gslModel', 'commitmentsMade',
    'outOfScopeRequirements', 'recceStatus', 'recceCompletedAt',
    'status', 'approvalNotes', 'schoolMatchDismissed',
  ]
  for (const key of editableKeys) {
    if (existing[key as keyof SalesOpportunity] !== next[key as keyof SalesOpportunity]) {
      changedFields.push(key)
      before[key] = existing[key as keyof SalesOpportunity]
      after[key] = next[key as keyof SalesOpportunity]
    }
  }

  if (changedFields.length === 0) {
    return { ok: false, reason: 'no-changes' }
  }

  const ts = deps.now().toISOString()
  const audit: AuditEntry = {
    timestamp: ts,
    user: args.editedBy,
    action: 'opportunity-edited',
    before,
    after,
    notes: args.notes ?? `Edited fields: ${changedFields.join(', ')}.`,
  }

  const updated: SalesOpportunity = {
    ...next,
    auditLog: [...existing.auditLog, audit],
  }

  await deps.enqueue({
    queuedBy: args.editedBy,
    entity: 'salesOpportunity',
    operation: 'update',
    payload: updated as unknown as Record<string, unknown>,
  })

  return { ok: true, opportunity: updated, changedFields }
}
