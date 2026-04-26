/*
 * SchoolGroup creation + membership editing (Phase C5b).
 *
 * Two paired helpers in one file:
 *
 * - createSchoolGroup: gated on 'school-group:create'. Initial members
 *   are validated against schools.json (each schoolId must resolve).
 *   memberSchoolIds may be empty at creation per existing fixture
 *   convention ("members to be added when first chain MOU is signed").
 *
 * - editSchoolGroupMembers: gated on 'school-group:edit-members'.
 *   Takes a target memberSchoolIds list (the new full set, not a
 *   diff) and replaces the existing list. The audit entry captures
 *   added + removed deltas computed inside.
 *
 * ID convention 'SG-<TOKEN>'. groupMouId is null at creation;
 * downstream MOU import flow sets it when a chain MOU lands.
 */

import type {
  AuditEntry,
  School,
  SchoolGroup,
  User,
} from '@/lib/types'
import schoolGroupsJson from '@/data/school_groups.json'
import schoolsJson from '@/data/schools.json'
import usersJson from '@/data/users.json'
import { enqueueUpdate } from '@/lib/pendingUpdates'
import { canPerform } from '@/lib/auth/permissions'

const ID_PATTERN = /^SG-[A-Z0-9_-]+$/

// -- create -----------------------------------------------------------------

export interface CreateSchoolGroupArgs {
  id: string
  name: string
  region: string
  memberSchoolIds: string[]
  notes: string | null
  createdBy: string
}

export type CreateSchoolGroupFailureReason =
  | 'permission'
  | 'unknown-user'
  | 'duplicate-id'
  | 'invalid-id-format'
  | 'missing-name'
  | 'missing-region'
  | 'invalid-member-school-ids'

export type CreateSchoolGroupResult =
  | { ok: true; group: SchoolGroup }
  | { ok: false; reason: CreateSchoolGroupFailureReason }

// -- edit-members -----------------------------------------------------------

export interface EditSchoolGroupMembersArgs {
  groupId: string
  memberSchoolIds: string[]
  editedBy: string
  notes?: string
}

export type EditSchoolGroupMembersFailureReason =
  | 'permission'
  | 'unknown-user'
  | 'group-not-found'
  | 'invalid-member-school-ids'
  | 'no-change'

export type EditSchoolGroupMembersResult =
  | { ok: true; group: SchoolGroup; added: string[]; removed: string[] }
  | { ok: false; reason: EditSchoolGroupMembersFailureReason }

// -- shared deps ------------------------------------------------------------

export interface SchoolGroupDeps {
  groups: SchoolGroup[]
  schools: School[]
  users: User[]
  enqueue: typeof enqueueUpdate
  now: () => Date
}

const defaultDeps: SchoolGroupDeps = {
  groups: schoolGroupsJson as unknown as SchoolGroup[],
  schools: schoolsJson as unknown as School[],
  users: usersJson as unknown as User[],
  enqueue: enqueueUpdate,
  now: () => new Date(),
}

function uniqueAndKnown(
  ids: string[],
  schools: School[],
): { ok: true; ids: string[] } | { ok: false } {
  if (!Array.isArray(ids)) return { ok: false }
  const seen = new Set<string>()
  const known = new Set(schools.map((s) => s.id))
  const cleaned: string[] = []
  for (const raw of ids) {
    if (typeof raw !== 'string') return { ok: false }
    const id = raw.trim()
    if (id === '') return { ok: false }
    if (!known.has(id)) return { ok: false }
    if (seen.has(id)) continue
    seen.add(id)
    cleaned.push(id)
  }
  return { ok: true, ids: cleaned }
}

// -- create implementation --------------------------------------------------

export async function createSchoolGroup(
  args: CreateSchoolGroupArgs,
  deps: SchoolGroupDeps = defaultDeps,
): Promise<CreateSchoolGroupResult> {
  const user = deps.users.find((u) => u.id === args.createdBy)
  if (!user) return { ok: false, reason: 'unknown-user' }
  if (!canPerform(user, 'school-group:create')) {
    return { ok: false, reason: 'permission' }
  }

  if (!ID_PATTERN.test(args.id)) {
    return { ok: false, reason: 'invalid-id-format' }
  }
  if (deps.groups.some((g) => g.id === args.id)) {
    return { ok: false, reason: 'duplicate-id' }
  }
  if (typeof args.name !== 'string' || args.name.trim() === '') {
    return { ok: false, reason: 'missing-name' }
  }
  if (typeof args.region !== 'string' || args.region.trim() === '') {
    return { ok: false, reason: 'missing-region' }
  }

  const memberCheck = uniqueAndKnown(args.memberSchoolIds ?? [], deps.schools)
  if (!memberCheck.ok) {
    return { ok: false, reason: 'invalid-member-school-ids' }
  }

  const ts = deps.now().toISOString()
  const auditEntry: AuditEntry = {
    timestamp: ts,
    user: args.createdBy,
    action: 'create',
    after: {
      name: args.name,
      region: args.region,
      memberSchoolIds: memberCheck.ids,
    },
  }

  const group: SchoolGroup = {
    id: args.id,
    name: args.name.trim(),
    region: args.region.trim(),
    createdAt: ts,
    createdBy: args.createdBy,
    memberSchoolIds: memberCheck.ids,
    groupMouId: null,
    notes: args.notes?.trim() || null,
    auditLog: [auditEntry],
  }

  await deps.enqueue({
    queuedBy: args.createdBy,
    entity: 'schoolGroup',
    operation: 'create',
    payload: group as unknown as Record<string, unknown>,
  })

  return { ok: true, group }
}

// -- edit-members implementation --------------------------------------------

export async function editSchoolGroupMembers(
  args: EditSchoolGroupMembersArgs,
  deps: SchoolGroupDeps = defaultDeps,
): Promise<EditSchoolGroupMembersResult> {
  const user = deps.users.find((u) => u.id === args.editedBy)
  if (!user) return { ok: false, reason: 'unknown-user' }
  if (!canPerform(user, 'school-group:edit-members')) {
    return { ok: false, reason: 'permission' }
  }

  const group = deps.groups.find((g) => g.id === args.groupId)
  if (!group) return { ok: false, reason: 'group-not-found' }

  const memberCheck = uniqueAndKnown(args.memberSchoolIds ?? [], deps.schools)
  if (!memberCheck.ok) {
    return { ok: false, reason: 'invalid-member-school-ids' }
  }

  const before = new Set(group.memberSchoolIds)
  const after = new Set(memberCheck.ids)
  const added = memberCheck.ids.filter((id) => !before.has(id))
  const removed = group.memberSchoolIds.filter((id) => !after.has(id))

  if (added.length === 0 && removed.length === 0) {
    return { ok: false, reason: 'no-change' }
  }

  const ts = deps.now().toISOString()
  const auditEntry: AuditEntry = {
    timestamp: ts,
    user: args.editedBy,
    action: 'update',
    before: { memberSchoolIds: group.memberSchoolIds },
    after: { memberSchoolIds: memberCheck.ids },
    notes: args.notes,
  }

  const next: SchoolGroup = {
    ...group,
    memberSchoolIds: memberCheck.ids,
    auditLog: [...group.auditLog, auditEntry],
  }

  await deps.enqueue({
    queuedBy: args.editedBy,
    entity: 'schoolGroup',
    operation: 'update',
    payload: next as unknown as Record<string, unknown>,
  })

  return { ok: true, group: next, added, removed }
}
