/*
 * School creation (Phase C5b).
 *
 * Adds a new School record to schools.json. Permission gate
 * 'school:create' (Admin via wildcard, OpsHead via explicit grant).
 *
 * ID convention: 'SCH-<TOKEN>' uppercase per pre-seeded fixtures
 * (SCH-GREENFIELD-PUNE, SCH-SPRINGWOOD-KOL). The reviewer types the
 * id; auto-generation deferred.
 *
 * Region: free-form string at the type level, but the form constrains
 * input to East / North / South-West (the three SPOC-DB regions). The
 * lib accepts any non-empty string so future region growth doesn't
 * require a code change here.
 */

import type { AuditEntry, School, User } from '@/lib/types'
import schoolsJson from '@/data/schools.json'
import usersJson from '@/data/users.json'
import { enqueueUpdate } from '@/lib/pendingUpdates'
import { canPerform } from '@/lib/auth/permissions'

const ID_PATTERN = /^SCH-[A-Z0-9-]+$/
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PIN_PATTERN = /^\d{6}$/
const PAN_PATTERN = /^[A-Z]{5}\d{4}[A-Z]$/
const GST_PATTERN = /^\d{2}[A-Z]{5}\d{4}[A-Z]\d[A-Z]\d$/

export interface CreateSchoolArgs {
  id: string
  name: string
  legalEntity: string | null
  city: string
  state: string
  region: string
  pinCode: string | null
  contactPerson: string | null
  email: string | null
  phone: string | null
  billingName: string | null
  pan: string | null
  gstNumber: string | null
  notes: string | null
  createdBy: string
}

export type CreateSchoolFailureReason =
  | 'permission'
  | 'unknown-user'
  | 'duplicate-id'
  | 'invalid-id-format'
  | 'missing-name'
  | 'missing-city'
  | 'missing-state'
  | 'missing-region'
  | 'invalid-pin'
  | 'invalid-email'
  | 'invalid-pan'
  | 'invalid-gst'

export type CreateSchoolResult =
  | { ok: true; school: School }
  | { ok: false; reason: CreateSchoolFailureReason }

export interface CreateSchoolDeps {
  schools: School[]
  users: User[]
  enqueue: typeof enqueueUpdate
  now: () => Date
}

const defaultDeps: CreateSchoolDeps = {
  schools: schoolsJson as unknown as School[],
  users: usersJson as unknown as User[],
  enqueue: enqueueUpdate,
  now: () => new Date(),
}

export async function createSchool(
  args: CreateSchoolArgs,
  deps: CreateSchoolDeps = defaultDeps,
): Promise<CreateSchoolResult> {
  const user = deps.users.find((u) => u.id === args.createdBy)
  if (!user) return { ok: false, reason: 'unknown-user' }
  if (!canPerform(user, 'school:create')) {
    return { ok: false, reason: 'permission' }
  }

  if (!ID_PATTERN.test(args.id)) {
    return { ok: false, reason: 'invalid-id-format' }
  }
  if (deps.schools.some((s) => s.id === args.id)) {
    return { ok: false, reason: 'duplicate-id' }
  }
  if (typeof args.name !== 'string' || args.name.trim() === '') {
    return { ok: false, reason: 'missing-name' }
  }
  if (typeof args.city !== 'string' || args.city.trim() === '') {
    return { ok: false, reason: 'missing-city' }
  }
  if (typeof args.state !== 'string' || args.state.trim() === '') {
    return { ok: false, reason: 'missing-state' }
  }
  if (typeof args.region !== 'string' || args.region.trim() === '') {
    return { ok: false, reason: 'missing-region' }
  }
  if (args.pinCode !== null && !PIN_PATTERN.test(args.pinCode)) {
    return { ok: false, reason: 'invalid-pin' }
  }
  if (args.email !== null && !EMAIL_PATTERN.test(args.email)) {
    return { ok: false, reason: 'invalid-email' }
  }
  if (args.pan !== null && !PAN_PATTERN.test(args.pan)) {
    return { ok: false, reason: 'invalid-pan' }
  }
  if (args.gstNumber !== null && !GST_PATTERN.test(args.gstNumber)) {
    return { ok: false, reason: 'invalid-gst' }
  }

  const ts = deps.now().toISOString()
  const auditEntry: AuditEntry = {
    timestamp: ts,
    user: args.createdBy,
    action: 'create',
    after: {
      name: args.name,
      city: args.city,
      state: args.state,
      region: args.region,
    },
  }

  const school: School = {
    id: args.id,
    name: args.name.trim(),
    legalEntity: args.legalEntity?.trim() || null,
    city: args.city.trim(),
    state: args.state.trim(),
    region: args.region.trim(),
    pinCode: args.pinCode,
    contactPerson: args.contactPerson?.trim() || null,
    email: args.email,
    phone: args.phone?.trim() || null,
    billingName: args.billingName?.trim() || null,
    pan: args.pan,
    gstNumber: args.gstNumber,
    notes: args.notes?.trim() || null,
    active: true,
    createdAt: ts,
    auditLog: [auditEntry],
  }

  await deps.enqueue({
    queuedBy: args.createdBy,
    entity: 'school',
    operation: 'create',
    payload: school as unknown as Record<string, unknown>,
  })

  return { ok: true, school }
}
