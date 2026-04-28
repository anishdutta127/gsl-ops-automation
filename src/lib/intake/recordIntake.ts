/*
 * IntakeRecord write path (W4-C.2).
 *
 * Operator captures the 22-field intake form at /mous/[id]/intake and
 * the route handler calls into this lib. We:
 *
 *   1. Validate every required field (returns first failure, not a
 *      structured map; the form's blur-time validation already catches
 *      most issues client-side; the server is the safety net).
 *   2. Normalise the phone number to E.164 where possible (strips
 *      spaces, '+91 ' prefix); preserves raw text in the audit notes
 *      when the input cannot be normalised.
 *   3. Detect variances against the MOU baseline (studentsAtIntake vs
 *      studentsMou; productConfirmed vs programme; gslTrainingMode vs
 *      trainerModel) and surface them in the result so the form can
 *      render the warning banner. Variances do not block the save.
 *   4. Write a 'intake-captured' AuditEntry to BOTH the IntakeRecord
 *      and the parent MOU (so the MOU detail page surfaces the event
 *      without requiring an aggregate join).
 *   5. Enqueue the create.
 *
 * Permission: visible to every authenticated user (W3-B). The audit
 * entry captures attribution; no role gate.
 *
 * Idempotency: each MOU has at most one IntakeRecord in Phase 1.
 * Re-submitting on a MOU that already has one returns failure
 * 'already-recorded'; operators edit the existing record (edit-mode
 * lands in W4-D polish if needed).
 */

import type {
  AuditEntry,
  GslTrainingMode,
  IntakeRecord,
  MOU,
  Programme,
  SubmissionStatus,
  TrainerModel,
  User,
} from '@/lib/types'
import mousJson from '@/data/mous.json'
import intakeRecordsJson from '@/data/intake_records.json'
import usersJson from '@/data/users.json'
import salesTeamJson from '@/data/sales_team.json'
import { enqueueUpdate } from '@/lib/pendingUpdates'
import {
  broadcastNotification,
  recipientsByRole,
} from '@/lib/notifications/createNotification'

const VALID_SUBMISSION_STATUSES: ReadonlyArray<SubmissionStatus> = [
  'Submitted',
  'Pending',
  'In Transit',
  'Not Applicable',
]
const VALID_TRAINING_MODES: ReadonlyArray<GslTrainingMode> = [
  'GSL Trainer',
  'Train The Trainer (TTT)',
]
const VALID_PROGRAMMES: ReadonlyArray<Programme> = [
  'STEAM',
  'TinkRworks',
  'Young Pioneers',
  'Harvard HBPE',
  'VEX',
]

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const URL_HOST_ALLOW = ['drive.google.com', 'sharepoint.com', 'dropbox.com', 'onedrive.live.com']

export interface RecordIntakeArgs {
  mouId: string
  salesOwnerId: string
  location: string
  grades: string
  recipientName: string
  recipientDesignation: string
  recipientEmail: string
  studentsAtIntake: number
  durationYears: number
  startDate: string
  endDate: string
  physicalSubmissionStatus: SubmissionStatus
  softCopySubmissionStatus: SubmissionStatus
  productConfirmed: Programme
  gslTrainingMode: GslTrainingMode
  schoolPointOfContactName: string
  schoolPointOfContactPhone: string
  signedMouUrl: string
  recordedBy: string
}

export type RecordIntakeFailureReason =
  | 'unknown-user'
  | 'mou-not-found'
  | 'unknown-sales-owner'
  | 'invalid-email'
  | 'invalid-url'
  | 'invalid-students'
  | 'invalid-duration'
  | 'invalid-date'
  | 'date-order'
  | 'invalid-mode'
  | 'invalid-product'
  | 'invalid-status'
  | 'missing-text'
  | 'already-recorded'

export interface RecordIntakeVariances {
  studentsVariance: number               // signed (positive = intake > MOU baseline)
  productMismatch: boolean
  trainingModeMismatch: boolean
}

export type RecordIntakeOutcome =
  | { ok: true; record: IntakeRecord; variances: RecordIntakeVariances }
  | { ok: false; reason: RecordIntakeFailureReason }

export interface RecordIntakeDeps {
  mous: MOU[]
  intakeRecords: IntakeRecord[]
  users: User[]
  salesTeamIds: Set<string>
  enqueue: typeof enqueueUpdate
  now: () => Date
  /** UUIDv4 generator; default uses crypto.randomUUID for production. */
  randomUuid: () => string
}

const defaultDeps: RecordIntakeDeps = {
  mous: mousJson as unknown as MOU[],
  intakeRecords: intakeRecordsJson as unknown as IntakeRecord[],
  users: usersJson as unknown as User[],
  salesTeamIds: new Set(
    (salesTeamJson as unknown as Array<{ id: string }>).map((s) => s.id),
  ),
  enqueue: enqueueUpdate,
  now: () => new Date(),
  randomUuid: () => crypto.randomUUID(),
}

/**
 * Map W4-C form's GslTrainingMode to MOU.trainerModel for variance check.
 * Returns null when the MOU's trainerModel is null or 'Bootcamp' / 'Other'
 * (no comparable form value; treat as no-variance).
 */
function trainerModeMatches(
  formMode: GslTrainingMode,
  mouMode: TrainerModel | null,
): boolean {
  if (mouMode === null) return true   // no baseline; cannot diverge
  if (formMode === 'GSL Trainer' && mouMode === 'GSL-T') return true
  if (formMode === 'Train The Trainer (TTT)' && mouMode === 'TT') return true
  return false
}

/**
 * Normalise a free-text phone string to E.164 where possible.
 * Strips whitespace, dashes, parentheses; prepends +91 for 10-digit
 * Indian numbers. Returns the trimmed raw input unchanged when
 * normalisation rules do not match.
 */
export function normalisePhone(raw: string): string {
  const cleaned = raw.replace(/[\s\-()]+/g, '').trim()
  if (cleaned === '') return ''
  if (/^\+\d{10,15}$/.test(cleaned)) return cleaned
  if (/^91\d{10}$/.test(cleaned)) return `+${cleaned}`
  if (/^\d{10}$/.test(cleaned)) return `+91${cleaned}`
  return cleaned
}

function isValidUrl(value: string): boolean {
  try {
    const u = new URL(value)
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return false
    return URL_HOST_ALLOW.some((host) => u.hostname === host || u.hostname.endsWith(`.${host}`))
  } catch {
    return false
  }
}

export async function recordIntake(
  args: RecordIntakeArgs,
  deps: RecordIntakeDeps = defaultDeps,
): Promise<RecordIntakeOutcome> {
  const user = deps.users.find((u) => u.id === args.recordedBy)
  if (!user) return { ok: false, reason: 'unknown-user' }

  const mou = deps.mous.find((m) => m.id === args.mouId)
  if (!mou) return { ok: false, reason: 'mou-not-found' }

  // Idempotency check: each MOU has at most one IntakeRecord.
  const existing = deps.intakeRecords.find((r) => r.mouId === args.mouId)
  if (existing) return { ok: false, reason: 'already-recorded' }

  if (!deps.salesTeamIds.has(args.salesOwnerId)) {
    return { ok: false, reason: 'unknown-sales-owner' }
  }

  // Required-text validation
  const requiredTextFields: Array<keyof RecordIntakeArgs> = [
    'location', 'grades', 'recipientName', 'recipientDesignation',
    'schoolPointOfContactName', 'schoolPointOfContactPhone', 'signedMouUrl',
  ]
  for (const f of requiredTextFields) {
    if (typeof args[f] !== 'string' || (args[f] as string).trim() === '') {
      return { ok: false, reason: 'missing-text' }
    }
  }

  if (!EMAIL_RE.test(args.recipientEmail)) {
    return { ok: false, reason: 'invalid-email' }
  }
  if (!isValidUrl(args.signedMouUrl)) {
    return { ok: false, reason: 'invalid-url' }
  }
  if (!Number.isFinite(args.studentsAtIntake) || args.studentsAtIntake <= 0) {
    return { ok: false, reason: 'invalid-students' }
  }
  if (
    !Number.isInteger(args.durationYears)
    || args.durationYears < 1
    || args.durationYears > 10
  ) {
    return { ok: false, reason: 'invalid-duration' }
  }
  if (!ISO_DATE_RE.test(args.startDate) || !ISO_DATE_RE.test(args.endDate)) {
    return { ok: false, reason: 'invalid-date' }
  }
  if (args.endDate <= args.startDate) {
    return { ok: false, reason: 'date-order' }
  }
  if (
    !VALID_SUBMISSION_STATUSES.includes(args.physicalSubmissionStatus)
    || !VALID_SUBMISSION_STATUSES.includes(args.softCopySubmissionStatus)
  ) {
    return { ok: false, reason: 'invalid-status' }
  }
  if (!VALID_PROGRAMMES.includes(args.productConfirmed)) {
    return { ok: false, reason: 'invalid-product' }
  }
  if (!VALID_TRAINING_MODES.includes(args.gslTrainingMode)) {
    return { ok: false, reason: 'invalid-mode' }
  }

  // Variance detection (does not block save).
  const variances: RecordIntakeVariances = {
    studentsVariance: args.studentsAtIntake - mou.studentsMou,
    productMismatch: args.productConfirmed !== mou.programme,
    trainingModeMismatch: !trainerModeMatches(args.gslTrainingMode, mou.trainerModel),
  }

  const ts = deps.now().toISOString()
  const phoneNormalised = normalisePhone(args.schoolPointOfContactPhone)

  const audit: AuditEntry = {
    timestamp: ts,
    user: args.recordedBy,
    action: 'intake-captured',
    after: {
      salesOwnerId: args.salesOwnerId,
      studentsAtIntake: args.studentsAtIntake,
      durationYears: args.durationYears,
      productConfirmed: args.productConfirmed,
      gslTrainingMode: args.gslTrainingMode,
    },
    notes: [
      variances.studentsVariance !== 0
        ? `Students variance ${variances.studentsVariance >= 0 ? '+' : ''}${variances.studentsVariance} vs MOU baseline ${mou.studentsMou}.`
        : '',
      variances.productMismatch
        ? `Product mismatch: intake='${args.productConfirmed}', MOU='${mou.programme}'.`
        : '',
      variances.trainingModeMismatch
        ? `Training mode mismatch: intake='${args.gslTrainingMode}', MOU.trainerModel='${mou.trainerModel ?? 'null'}'.`
        : '',
    ].filter((s) => s !== '').join(' ') || undefined,
  }

  const record: IntakeRecord = {
    id: deps.randomUuid(),
    mouId: args.mouId,
    completedAt: ts,
    completedBy: args.recordedBy,
    salesOwnerId: args.salesOwnerId,
    location: args.location.trim(),
    grades: args.grades.trim(),
    recipientName: args.recipientName.trim(),
    recipientDesignation: args.recipientDesignation.trim(),
    recipientEmail: args.recipientEmail.trim().toLowerCase(),
    studentsAtIntake: args.studentsAtIntake,
    durationYears: args.durationYears,
    startDate: args.startDate,
    endDate: args.endDate,
    physicalSubmissionStatus: args.physicalSubmissionStatus,
    softCopySubmissionStatus: args.softCopySubmissionStatus,
    productConfirmed: args.productConfirmed,
    gslTrainingMode: args.gslTrainingMode,
    schoolPointOfContactName: args.schoolPointOfContactName.trim(),
    schoolPointOfContactPhone: phoneNormalised,
    signedMouUrl: args.signedMouUrl.trim(),
    thankYouEmailSentAt: null,
    auditLog: [audit],
  }

  // Mirror the audit entry on the parent MOU so /mous/[id] surfaces the
  // intake event without requiring an aggregate join.
  const updatedMou: MOU = {
    ...mou,
    auditLog: [...mou.auditLog, audit],
  }

  await deps.enqueue({
    queuedBy: args.recordedBy,
    entity: 'intakeRecord',
    operation: 'create',
    payload: record as unknown as Record<string, unknown>,
  })
  await deps.enqueue({
    queuedBy: args.recordedBy,
    entity: 'mou',
    operation: 'update',
    payload: updatedMou as unknown as Record<string, unknown>,
  })

  // W4-E.5 notify Admin + OpsHead so they can flow the MOU into the
  // dispatch-prep stage. Self-exclusion suppresses if the recorder
  // already carries OpsHead/Admin (most pilot operators do).
  const hasAnyVariance =
    variances.studentsVariance !== 0
    || variances.productMismatch
    || variances.trainingModeMismatch
  await broadcastNotification({
    recipientUserIds: recipientsByRole(deps.users, ['Admin', 'OpsHead']),
    senderUserId: args.recordedBy,
    kind: 'intake-completed',
    title: `Intake completed for ${mou.schoolName}`,
    body: `${user.name} captured intake for ${mou.schoolName} (${args.studentsAtIntake} students${hasAnyVariance ? '; variance vs MOU' : ''}).`,
    actionUrl: `/mous/${mou.id}`,
    payload: {
      intakeRecordId: record.id,
      mouId: mou.id,
      schoolName: mou.schoolName,
      completedByName: user.name,
      studentsAtIntake: args.studentsAtIntake,
      hasVariance: hasAnyVariance,
    },
    relatedEntityId: record.id,
  }).catch((err) => {
    console.error('[recordIntake] notification fan-out failed', err)
  })

  return { ok: true, record, variances }
}
