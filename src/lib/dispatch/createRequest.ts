/*
 * W4-D.2 createRequest: Sales-side DispatchRequest submission.
 *
 * Persists a new DispatchRequest in 'pending-approval' status with the
 * 8 cross-validation rules from the W4-D recon evaluated:
 *
 *   V1 cohortStatus active                 -> error  (blocks submit)
 *   V2 mou.salesPersonId set                -> error  (blocks submit)
 *   V3 intake completed                    -> warning (allows submit)
 *   V4 line-item SKU aligns with programme -> warning (allows submit)
 *   V5 student count variance > 10%         -> warning (allows submit)
 *   V6 per-grade fits intake grades range  -> warning (allows submit)
 *   V7 submitter == intake's salesOwner    -> audit-only (no banner)
 *   V8 duplicate pending DR (same MOU+inst) -> warning (allows submit)
 *
 * Errors prevent persistence; warnings persist with the DR + are
 * mirrored on the audit entry for the round-2 testing review.
 *
 * Permission gate: 'dispatch-request:create' (Admin wildcard +
 * SalesHead + SalesRep). Failures return ok: false; the UI surfaces
 * a generic message because UI gating is removed (W3-B).
 */

import type {
  AuditEntry,
  DispatchLineItem,
  DispatchRequest,
  IntakeRecord,
  MOU,
  SalesPerson,
  School,
  User,
} from '@/lib/types'
import mousJson from '@/data/mous.json'
import schoolsJson from '@/data/schools.json'
import usersJson from '@/data/users.json'
import intakeRecordsJson from '@/data/intake_records.json'
import dispatchRequestsJson from '@/data/dispatch_requests.json'
import salesTeamJson from '@/data/sales_team.json'
import { enqueueUpdate } from '@/lib/pendingUpdates'
import { canPerform } from '@/lib/auth/permissions'
import {
  broadcastNotification,
  recipientsByRole,
} from '@/lib/notifications/createNotification'

export interface CreateRequestArgs {
  mouId: string
  installmentSeq: number
  requestReason: string
  lineItems: DispatchLineItem[]
  notes: string | null
  requestedBy: string
}

export type CreateRequestFailureReason =
  | 'permission'
  | 'unknown-user'
  | 'mou-not-found'
  | 'school-not-found'
  | 'mou-not-active-cohort'        // V1
  | 'mou-no-sales-owner'           // V2
  | 'invalid-line-items'
  | 'invalid-installment-seq'
  | 'missing-reason'

export type CreateRequestWarning =
  | 'intake-not-completed'         // V3
  | 'kit-type-programme-mismatch'  // V4
  | 'student-count-variance-high'  // V5
  | 'grade-out-of-intake-range'    // V6
  | 'duplicate-pending-request'    // V8

export type CreateRequestResult =
  | { ok: true; request: DispatchRequest; warnings: CreateRequestWarning[] }
  | { ok: false; reason: CreateRequestFailureReason }

export interface CreateRequestDeps {
  mous: MOU[]
  schools: School[]
  users: User[]
  intakeRecords: IntakeRecord[]
  dispatchRequests: DispatchRequest[]
  salesPersons: SalesPerson[]
  enqueue: typeof enqueueUpdate
  now: () => Date
}

const defaultDeps: CreateRequestDeps = {
  mous: mousJson as unknown as MOU[],
  schools: schoolsJson as unknown as School[],
  users: usersJson as unknown as User[],
  intakeRecords: intakeRecordsJson as unknown as IntakeRecord[],
  dispatchRequests: dispatchRequestsJson as unknown as DispatchRequest[],
  salesPersons: salesTeamJson as unknown as SalesPerson[],
  enqueue: enqueueUpdate,
  now: () => new Date(),
}

function totalLineItemQuantity(items: DispatchLineItem[]): number {
  let total = 0
  for (const i of items) {
    if (i.kind === 'flat') total += i.quantity
    else for (const a of i.gradeAllocations) total += a.quantity
  }
  return total
}

/**
 * Heuristic for V4 (kit type aligns with programme). Cretile sub-type
 * surfaces 'cretile' tokens; TWs flat dispatches surface 'tinkr' / 'tws'.
 * Other programmes (Young Pioneers, HBPE, VEX) have no consistent SKU
 * naming yet; V4 is best-effort, not authoritative.
 */
function lineItemMismatchesProgramme(
  items: DispatchLineItem[],
  mou: MOU,
): boolean {
  const programme = mou.programme
  const subType = mou.programmeSubType
  for (const item of items) {
    const sku = item.skuName.toLowerCase()
    if (programme === 'TinkRworks') {
      if (!sku.includes('tinkr') && !sku.includes('tws') && !sku.includes('tink')) return true
    } else if (programme === 'STEAM' && subType === 'GSLT-Cretile') {
      if (!sku.includes('cretile') && !sku.includes('grade')) return true
    } else if (programme === 'STEAM') {
      if (!sku.includes('steam') && !sku.includes('cretile') && !sku.includes('kit')) return true
    }
    // Young Pioneers / HBPE / VEX: no heuristic; V4 stays silent.
  }
  return false
}

function intakeGradesOutOfRange(
  items: DispatchLineItem[],
  intakeGradesText: string,
): boolean {
  const grades = (intakeGradesText.match(/\d+/g) ?? []).map(Number)
  if (grades.length === 0) return false
  const min = Math.min(...grades)
  const max = Math.max(...grades)
  for (const item of items) {
    if (item.kind === 'per-grade') {
      for (const a of item.gradeAllocations) {
        if (a.grade < min || a.grade > max) return true
      }
    }
  }
  return false
}

export async function createRequest(
  args: CreateRequestArgs,
  deps: CreateRequestDeps = defaultDeps,
): Promise<CreateRequestResult> {
  // Identity + permission
  const user = deps.users.find((u) => u.id === args.requestedBy)
  if (!user) return { ok: false, reason: 'unknown-user' }
  if (!canPerform(user, 'dispatch-request:create')) {
    return { ok: false, reason: 'permission' }
  }

  // Shape validation
  if (args.lineItems.length === 0) return { ok: false, reason: 'invalid-line-items' }
  if (!Number.isFinite(args.installmentSeq) || args.installmentSeq <= 0) {
    return { ok: false, reason: 'invalid-installment-seq' }
  }
  if (args.requestReason.trim() === '') return { ok: false, reason: 'missing-reason' }

  // V1 cohortStatus active (hard error)
  const mou = deps.mous.find((m) => m.id === args.mouId)
  if (!mou) return { ok: false, reason: 'mou-not-found' }
  if (mou.cohortStatus !== 'active') return { ok: false, reason: 'mou-not-active-cohort' }

  // V2 mou.salesPersonId set (hard error)
  if (!mou.salesPersonId) return { ok: false, reason: 'mou-no-sales-owner' }

  const school = deps.schools.find((s) => s.id === mou.schoolId)
  if (!school) return { ok: false, reason: 'school-not-found' }

  // Warnings
  const warnings: CreateRequestWarning[] = []
  const intake = deps.intakeRecords.find((ir) => ir.mouId === args.mouId)

  // V3 intake completed
  if (!intake || !intake.completedAt) warnings.push('intake-not-completed')

  // V4 line-item programme heuristic
  if (lineItemMismatchesProgramme(args.lineItems, mou)) {
    warnings.push('kit-type-programme-mismatch')
  }

  // V5 student count variance > 10%
  const totalQty = totalLineItemQuantity(args.lineItems)
  const baseline = (intake?.studentsAtIntake ?? mou.studentsActual ?? mou.studentsMou) || 0
  if (baseline > 0) {
    const variance = Math.abs(totalQty - baseline) / baseline
    if (variance > 0.10) warnings.push('student-count-variance-high')
  }

  // V6 per-grade allocations within intake grades range
  if (intake && intakeGradesOutOfRange(args.lineItems, intake.grades)) {
    warnings.push('grade-out-of-intake-range')
  }

  // V7 submitter is intake's sales owner (audit-only). Map salesOwnerId
  // to its email and compare with user.email. Same person => no flag.
  let v7Triggered = false
  if (intake) {
    const intakeOwner = deps.salesPersons.find((sp) => sp.id === intake.salesOwnerId)
    if (intakeOwner && intakeOwner.email !== user.email) v7Triggered = true
  }

  // V8 duplicate pending DR for same MOU+installment
  const existingPending = deps.dispatchRequests.find(
    (dr) =>
      dr.mouId === args.mouId
      && dr.installmentSeq === args.installmentSeq
      && dr.status === 'pending-approval',
  )
  if (existingPending) warnings.push('duplicate-pending-request')

  // Persist
  const ts = deps.now().toISOString()
  const tsCompact = ts.replace(/[-:.TZ]/g, '').slice(0, 14)
  const id = `DR-${args.mouId}-i${args.installmentSeq}-${tsCompact}`

  const auditNotes: string[] = []
  if (warnings.length > 0) auditNotes.push(`Warnings on submission: ${warnings.join(', ')}.`)
  if (v7Triggered) auditNotes.push('V7: submitter is not the intake salesOwner (audit-only).')

  const auditEntry: AuditEntry = {
    timestamp: ts,
    user: args.requestedBy,
    action: 'dispatch-request-created',
    after: {
      lineItemCount: args.lineItems.length,
      totalQuantity: totalQty,
      installmentSeq: args.installmentSeq,
    },
    notes: auditNotes.length > 0 ? auditNotes.join(' ') : undefined,
  }

  const request: DispatchRequest = {
    id,
    mouId: args.mouId,
    schoolId: school.id,
    requestedBy: args.requestedBy,
    requestedAt: ts,
    requestReason: args.requestReason.trim(),
    installmentSeq: args.installmentSeq,
    lineItems: args.lineItems,
    status: 'pending-approval',
    conversionDispatchId: null,
    rejectionReason: null,
    reviewedBy: null,
    reviewedAt: null,
    notes: args.notes,
    auditLog: [auditEntry],
  }

  await deps.enqueue({
    queuedBy: args.requestedBy,
    entity: 'dispatchRequest',
    operation: 'create',
    payload: request as unknown as Record<string, unknown>,
  })

  // W4-E.5 notification fan-out: tell active Admin + OpsHead users that
  // a new request needs review. Best-effort; failure does NOT roll the
  // DispatchRequest write back. Self-exclusion in
  // broadcastNotification suppresses the case where the requester has
  // Admin/OpsHead role themselves (e.g., Pradeep).
  await broadcastNotification(
    {
      recipientUserIds: recipientsByRole(deps.users, ['Admin', 'OpsHead']),
      senderUserId: args.requestedBy,
      kind: 'dispatch-request-created',
      title: `New dispatch request for ${mou.schoolName}`,
      body: `${user.name} submitted DR ${id} (${args.lineItems.length} line items, qty ${totalQty}, instalment ${args.installmentSeq}).`,
      actionUrl: `/admin/dispatch-requests/${id}`,
      payload: {
        requestId: id,
        requesterName: user.name,
        mouId: mou.id,
        schoolName: mou.schoolName,
        installmentSeq: args.installmentSeq,
        lineItemCount: args.lineItems.length,
        totalQuantity: totalQty,
      },
      relatedEntityId: id,
    },
  ).catch((err) => {
    // Notifications are best-effort; log + continue. A stricter
    // production setup might surface this through a dead-letter
    // queue, but Phase 1's manual-trigger pattern means a missed
    // notification is recoverable: the operator still sees the
    // request on /admin/dispatch-requests when they next look.
    console.error('[createRequest] notification fan-out failed', err)
  })

  return { ok: true, request, warnings }
}

/**
 * Severity declaration for the 8 validation rules. Used by the W4-D.2
 * page render + tests to enumerate which rules surface as banners vs
 * audit-only entries. Matches the W4-D recon table.
 */
export const VALIDATION_RULES = [
  { id: 'V1', code: 'mou-not-active-cohort', severity: 'error' as const },
  { id: 'V2', code: 'mou-no-sales-owner', severity: 'error' as const },
  { id: 'V3', code: 'intake-not-completed', severity: 'warning' as const },
  { id: 'V4', code: 'kit-type-programme-mismatch', severity: 'warning' as const },
  { id: 'V5', code: 'student-count-variance-high', severity: 'warning' as const },
  { id: 'V6', code: 'grade-out-of-intake-range', severity: 'warning' as const },
  { id: 'V7', code: 'submitter-not-intake-owner', severity: 'audit-only' as const },
  { id: 'V8', code: 'duplicate-pending-request', severity: 'warning' as const },
] as const
