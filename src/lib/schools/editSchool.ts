/*
 * W4-I.4 MM4 editSchool.
 *
 * Patch-based School editor. Misba reported that saving any change on
 * /schools/[id]/edit returned 404; root cause was the missing
 * /api/schools/[id] route handler (the page.tsx noted a "501 stub" that
 * was never authored). MM4 adds both the route and this lib so school
 * edits land in the queue and replicate downstream.
 *
 * Permission gate: 'school:edit' (OpsHead + Admin via the matrix).
 *
 * Field-level scoping for GSTIN: Misba flagged that Ops/Implementation
 * does not require the GSTIN number. The matrix already restricts
 * 'mou:generate-pi' to Finance + Admin; we keep the parallel rule here
 * so a non-Finance/non-Admin caller cannot mutate gstNumber even if
 * the field somehow lands in the patch (defence in depth - the form
 * already omits the input). Without this guard the page hide would be
 * cosmetic only.
 */

import type {
  AuditEntry,
  PendingUpdate,
  School,
  User,
} from '@/lib/types'
import schoolsJson from '@/data/schools.json'
import usersJson from '@/data/users.json'
import { canPerform } from '@/lib/auth/permissions'
import { enqueueUpdate } from '@/lib/pendingUpdates'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PIN_PATTERN = /^\d{6}$/
const PAN_PATTERN = /^[A-Z]{5}\d{4}[A-Z]$/
const GST_PATTERN = /^\d{2}[A-Z]{5}\d{4}[A-Z]\d[A-Z]\d$/

/**
 * Roles permitted to view + mutate gstNumber. Mirrors the
 * 'mou:generate-pi' grant set (Finance + Admin) because GSTIN is the
 * Finance-side field that PI generation depends on.
 */
function canEditGstin(user: User): boolean {
  return user.role === 'Admin' || user.role === 'Finance'
}

/**
 * Patch-able fields. id, createdAt, auditLog are not editable via this
 * path (id is immutable; createdAt is set on create; auditLog is
 * append-only). The `active` boolean is editable because the existing
 * /schools/[id]/edit form has always carried the checkbox; restricting
 * it would silently break the deactivate flow operators expect.
 */
export interface EditSchoolPatch {
  name?: string
  legalEntity?: string | null
  city?: string
  state?: string
  region?: string
  pinCode?: string | null
  contactPerson?: string | null
  email?: string | null
  phone?: string | null
  billingName?: string | null
  pan?: string | null
  gstNumber?: string | null
  notes?: string | null
  active?: boolean
}

export interface EditSchoolArgs {
  id: string
  patch: EditSchoolPatch
  editedBy: string
  notes?: string | null
}

export type EditSchoolFailureReason =
  | 'permission'
  | 'unknown-user'
  | 'school-not-found'
  | 'missing-name'
  | 'missing-city'
  | 'missing-state'
  | 'missing-region'
  | 'invalid-pin'
  | 'invalid-email'
  | 'invalid-pan'
  | 'invalid-gst'
  | 'no-changes'

export type EditSchoolResult =
  | { ok: true; school: School; changedFields: string[] }
  | { ok: false; reason: EditSchoolFailureReason }

export interface EditSchoolDeps {
  schools: School[]
  users: User[]
  enqueue: (params: {
    queuedBy: string
    entity: import('@/lib/types').PendingUpdateEntity
    operation: 'create' | 'update' | 'delete'
    payload: Record<string, unknown>
  }) => Promise<PendingUpdate>
  now: () => Date
}

const defaultDeps: EditSchoolDeps = {
  schools: schoolsJson as unknown as School[],
  users: usersJson as unknown as User[],
  enqueue: enqueueUpdate,
  now: () => new Date(),
}

function nullIfBlank(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null
  const trimmed = String(value).trim()
  return trimmed === '' ? null : trimmed
}

export async function editSchool(
  args: EditSchoolArgs,
  deps: EditSchoolDeps = defaultDeps,
): Promise<EditSchoolResult> {
  const user = deps.users.find((u) => u.id === args.editedBy)
  if (!user) return { ok: false, reason: 'unknown-user' }
  if (!canPerform(user, 'school:edit')) {
    return { ok: false, reason: 'permission' }
  }

  const existing = deps.schools.find((s) => s.id === args.id)
  if (!existing) return { ok: false, reason: 'school-not-found' }

  // Drop gstNumber from the patch when the caller cannot edit it. This
  // keeps the form-hide and the server-side rule consistent without
  // failing the request loudly (the page hides the field; a stale
  // browser tab could still submit one).
  const patch: EditSchoolPatch = { ...args.patch }
  if (!canEditGstin(user)) {
    delete patch.gstNumber
  }

  const next: School = { ...existing }

  if (patch.name !== undefined) {
    const v = patch.name.trim()
    if (v === '') return { ok: false, reason: 'missing-name' }
    next.name = v
  }
  if (patch.legalEntity !== undefined) {
    next.legalEntity = nullIfBlank(patch.legalEntity)
  }
  if (patch.city !== undefined) {
    const v = patch.city.trim()
    if (v === '') return { ok: false, reason: 'missing-city' }
    next.city = v
  }
  if (patch.state !== undefined) {
    const v = patch.state.trim()
    if (v === '') return { ok: false, reason: 'missing-state' }
    next.state = v
  }
  if (patch.region !== undefined) {
    const v = patch.region.trim()
    if (v === '') return { ok: false, reason: 'missing-region' }
    next.region = v
  }
  if (patch.pinCode !== undefined) {
    const v = nullIfBlank(patch.pinCode)
    if (v !== null && !PIN_PATTERN.test(v)) {
      return { ok: false, reason: 'invalid-pin' }
    }
    next.pinCode = v
  }
  if (patch.contactPerson !== undefined) {
    next.contactPerson = nullIfBlank(patch.contactPerson)
  }
  if (patch.email !== undefined) {
    const v = nullIfBlank(patch.email)
    if (v !== null && !EMAIL_PATTERN.test(v)) {
      return { ok: false, reason: 'invalid-email' }
    }
    next.email = v
  }
  if (patch.phone !== undefined) {
    next.phone = nullIfBlank(patch.phone)
  }
  if (patch.billingName !== undefined) {
    next.billingName = nullIfBlank(patch.billingName)
  }
  if (patch.pan !== undefined) {
    const v = nullIfBlank(patch.pan)
    if (v !== null && !PAN_PATTERN.test(v)) {
      return { ok: false, reason: 'invalid-pan' }
    }
    next.pan = v
  }
  if (patch.gstNumber !== undefined) {
    const v = nullIfBlank(patch.gstNumber)
    if (v !== null && !GST_PATTERN.test(v)) {
      return { ok: false, reason: 'invalid-gst' }
    }
    next.gstNumber = v
  }
  if (patch.notes !== undefined) {
    next.notes = nullIfBlank(patch.notes)
  }
  if (patch.active !== undefined) {
    next.active = patch.active
  }

  const editableKeys: Array<keyof EditSchoolPatch> = [
    'name', 'legalEntity', 'city', 'state', 'region', 'pinCode',
    'contactPerson', 'email', 'phone', 'billingName', 'pan',
    'gstNumber', 'notes', 'active',
  ]
  const changedFields: string[] = []
  const before: Record<string, unknown> = {}
  const after: Record<string, unknown> = {}
  for (const key of editableKeys) {
    if (existing[key as keyof School] !== next[key as keyof School]) {
      changedFields.push(key)
      before[key] = existing[key as keyof School]
      after[key] = next[key as keyof School]
    }
  }

  if (changedFields.length === 0) {
    return { ok: false, reason: 'no-changes' }
  }

  const ts = deps.now().toISOString()
  const audit: AuditEntry = {
    timestamp: ts,
    user: args.editedBy,
    action: 'update',
    before,
    after,
    notes: args.notes ?? `Edited fields: ${changedFields.join(', ')}.`,
  }

  const updated: School = {
    ...next,
    auditLog: [...existing.auditLog, audit],
  }

  await deps.enqueue({
    queuedBy: args.editedBy,
    entity: 'school',
    operation: 'update',
    payload: updated as unknown as Record<string, unknown>,
  })

  return { ok: true, school: updated, changedFields }
}
