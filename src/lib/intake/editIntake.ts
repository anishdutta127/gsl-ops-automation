/*
 * W4-I.4 MM3 editIntake.
 *
 * Patch-based IntakeRecord editor. Misba's MM3 ask added gradeBreakdown
 * + rechargeableBatteries to power the kit allocation table; the 23
 * historical IntakeRecords land with both fields = null and operators
 * backfill them through this lib. The editable surface also covers the
 * SPOC name + phone (so corrections to the kit-allocation row's contact
 * column don't require dropping into the source data) and the location
 * + grades free-text fields. The 22-field create form's other inputs
 * (recipient details, durationYears, signedMouUrl, etc.) are left out
 * of the edit lib for now; D-026 captures the round-2 vocabulary work.
 *
 * Permission: visible to every authenticated user (W3-B baseline,
 * mirrors recordIntake). Audit attribution captures who edited.
 */

import type {
  AuditEntry,
  IntakeRecord,
  PendingUpdate,
  User,
} from '@/lib/types'
import intakeRecordsJson from '@/data/intake_records.json'
import usersJson from '@/data/users.json'
import { enqueueUpdate } from '@/lib/pendingUpdates'
import { normalisePhone } from './recordIntake'

export interface EditIntakePatch {
  location?: string
  grades?: string
  schoolPointOfContactName?: string
  schoolPointOfContactPhone?: string
  studentsAtIntake?: number
  /**
   * Pass [] to clear (stored as null), an array of {grade, students}
   * pairs to set, or omit to leave unchanged.
   */
  gradeBreakdown?: { grade: number; students: number }[] | null
  rechargeableBatteries?: number | null
}

export interface EditIntakeArgs {
  id: string
  patch: EditIntakePatch
  editedBy: string
  notes?: string | null
}

export type EditIntakeFailureReason =
  | 'unknown-user'
  | 'intake-not-found'
  | 'missing-text'
  | 'invalid-students'
  | 'invalid-grade-breakdown'
  | 'invalid-batteries'
  | 'no-changes'

export type EditIntakeResult =
  | { ok: true; record: IntakeRecord; changedFields: string[] }
  | { ok: false; reason: EditIntakeFailureReason }

export interface EditIntakeDeps {
  intakeRecords: IntakeRecord[]
  users: User[]
  enqueue: (params: {
    queuedBy: string
    entity: import('@/lib/types').PendingUpdateEntity
    operation: 'create' | 'update' | 'delete'
    payload: Record<string, unknown>
  }) => Promise<PendingUpdate>
  now: () => Date
}

const defaultDeps: EditIntakeDeps = {
  intakeRecords: intakeRecordsJson as unknown as IntakeRecord[],
  users: usersJson as unknown as User[],
  enqueue: enqueueUpdate,
  now: () => new Date(),
}

function isValidGradeBreakdown(
  value: { grade: number; students: number }[] | null,
): boolean {
  if (value === null) return true
  if (!Array.isArray(value)) return false
  for (const row of value) {
    if (typeof row !== 'object' || row === null) return false
    if (!Number.isInteger(row.grade) || row.grade < 1 || row.grade > 12) return false
    if (!Number.isFinite(row.students) || row.students < 0) return false
  }
  return true
}

/**
 * Diff two gradeBreakdown arrays for change detection. Order matters:
 * the operator-edited form sends a canonical [{grade:1,...},{grade:2,...},...]
 * shape; we compare by index so reordering counts as a change.
 */
function gradeBreakdownDiffers(
  a: { grade: number; students: number }[] | null,
  b: { grade: number; students: number }[] | null,
): boolean {
  if (a === null && b === null) return false
  if (a === null || b === null) return true
  if (a.length !== b.length) return true
  for (let i = 0; i < a.length; i++) {
    if (a[i]!.grade !== b[i]!.grade) return true
    if (a[i]!.students !== b[i]!.students) return true
  }
  return false
}

export async function editIntake(
  args: EditIntakeArgs,
  deps: EditIntakeDeps = defaultDeps,
): Promise<EditIntakeResult> {
  const user = deps.users.find((u) => u.id === args.editedBy)
  if (!user) return { ok: false, reason: 'unknown-user' }

  const existing = deps.intakeRecords.find((r) => r.id === args.id)
  if (!existing) return { ok: false, reason: 'intake-not-found' }

  const next: IntakeRecord = { ...existing }

  if (args.patch.location !== undefined) {
    const v = args.patch.location.trim()
    if (v === '') return { ok: false, reason: 'missing-text' }
    next.location = v
  }
  if (args.patch.grades !== undefined) {
    const v = args.patch.grades.trim()
    if (v === '') return { ok: false, reason: 'missing-text' }
    next.grades = v
  }
  if (args.patch.schoolPointOfContactName !== undefined) {
    const v = args.patch.schoolPointOfContactName.trim()
    if (v === '') return { ok: false, reason: 'missing-text' }
    next.schoolPointOfContactName = v
  }
  if (args.patch.schoolPointOfContactPhone !== undefined) {
    const v = args.patch.schoolPointOfContactPhone.trim()
    if (v === '') return { ok: false, reason: 'missing-text' }
    next.schoolPointOfContactPhone = normalisePhone(v)
  }
  if (args.patch.studentsAtIntake !== undefined) {
    if (
      !Number.isFinite(args.patch.studentsAtIntake)
      || args.patch.studentsAtIntake <= 0
    ) {
      return { ok: false, reason: 'invalid-students' }
    }
    next.studentsAtIntake = args.patch.studentsAtIntake
  }
  if (args.patch.gradeBreakdown !== undefined) {
    const cleaned = args.patch.gradeBreakdown
    // Normalise empty array to null so we never persist []. Operators
    // sometimes submit the form with all 10 grades blank; treat that
    // as "clear the breakdown".
    const normalised = cleaned === null || cleaned.length === 0 ? null : cleaned
    if (!isValidGradeBreakdown(normalised)) {
      return { ok: false, reason: 'invalid-grade-breakdown' }
    }
    next.gradeBreakdown = normalised
  }
  if (args.patch.rechargeableBatteries !== undefined) {
    const v = args.patch.rechargeableBatteries
    if (v !== null && (!Number.isFinite(v) || v < 0)) {
      return { ok: false, reason: 'invalid-batteries' }
    }
    next.rechargeableBatteries = v
  }

  // Build changed-fields diff. gradeBreakdown needs custom equality
  // (array of objects); other fields use !== which is fine for the
  // primitives we touch here.
  const changedFields: string[] = []
  const before: Record<string, unknown> = {}
  const after: Record<string, unknown> = {}
  const scalarKeys: Array<keyof EditIntakePatch> = [
    'location', 'grades', 'schoolPointOfContactName',
    'schoolPointOfContactPhone', 'studentsAtIntake', 'rechargeableBatteries',
  ]
  for (const key of scalarKeys) {
    if (existing[key as keyof IntakeRecord] !== next[key as keyof IntakeRecord]) {
      changedFields.push(key)
      before[key] = existing[key as keyof IntakeRecord]
      after[key] = next[key as keyof IntakeRecord]
    }
  }
  if (gradeBreakdownDiffers(existing.gradeBreakdown, next.gradeBreakdown)) {
    changedFields.push('gradeBreakdown')
    before.gradeBreakdown = existing.gradeBreakdown
    after.gradeBreakdown = next.gradeBreakdown
  }

  if (changedFields.length === 0) {
    return { ok: false, reason: 'no-changes' }
  }

  const ts = deps.now().toISOString()
  const audit: AuditEntry = {
    timestamp: ts,
    user: args.editedBy,
    action: 'intake-edited',
    before,
    after,
    notes: args.notes ?? `Edited fields: ${changedFields.join(', ')}.`,
  }

  const updated: IntakeRecord = {
    ...next,
    auditLog: [...existing.auditLog, audit],
  }

  await deps.enqueue({
    queuedBy: args.editedBy,
    entity: 'intakeRecord',
    operation: 'update',
    payload: updated as unknown as Record<string, unknown>,
  })

  return { ok: true, record: updated, changedFields }
}
