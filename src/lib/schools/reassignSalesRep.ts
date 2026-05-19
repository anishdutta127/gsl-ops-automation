/*
 * Salesperson reassignment for a school.
 *
 * Two scopes:
 *
 *   - 'future-only' (default): writes a 'sales-rep-reassigned' audit
 *     entry on the school. Existing MOUs keep their original rep.
 *     getCurrentSalesRepForSchool reads the audit log and returns the
 *     new rep for any future MOU draft.
 *
 *   - 'all-mous': as above, plus every MOU at this school gets its
 *     salesPersonId rewritten with its own 'sales-rep-reassigned' audit
 *     entry. Destructive of the historical signal, hence opt-in.
 *
 * Permission: canEditMOU OR canEditFinanceData (Sales + Finance + Admin
 * wildcard). Both layers agree: the school detail page CTA renders
 * under the same gate.
 *
 * No-op detection: when the incoming newSalesPersonId equals the
 * current derivation, returns reason 'no-change'. Callers can surface
 * that as a friendly notice rather than a stack trace.
 *
 * Notifications: deferred per the gate audit. The audit log captures
 * the change; a follow-up gate adds a new NotificationKind.
 */

import type {
  AuditEntry,
  MOU,
  PendingUpdate,
  PendingUpdateEntity,
  SalesPerson,
  School,
  User,
} from '@/lib/types'
import schoolsJson from '@/data/schools.json'
import mousJson from '@/data/mous.json'
import usersJson from '@/data/users.json'
import salesTeamJson from '@/data/sales_team.json'
import { canEditFinanceData, canEditMOU } from '@/lib/access'
import { enqueueUpdate } from '@/lib/pendingUpdates'
import { getCurrentSalesRepForSchool } from './currentSalesRep'

export type ReassignScope = 'future-only' | 'all-mous'

export interface ReassignSalesRepArgs {
  schoolId: string
  /** Pass null to unassign; passes through to audit and (for 'all-mous') to MOU rows. */
  newSalesPersonId: string | null
  scope: ReassignScope
  reason: string | null
  reassignedBy: string
}

export type ReassignFailureReason =
  | 'permission'
  | 'unknown-user'
  | 'school-not-found'
  | 'unknown-sales-rep'
  | 'inactive-sales-rep'
  | 'no-change'

export interface ReassignResult {
  ok: true
  school: School
  updatedMouIds: string[]
  previousSalesPersonId: string | null
}

export type ReassignSalesRepResult =
  | ReassignResult
  | { ok: false; reason: ReassignFailureReason }

export interface ReassignDeps {
  schools: School[]
  mous: MOU[]
  users: User[]
  salesTeam: SalesPerson[]
  enqueue: (params: {
    queuedBy: string
    entity: PendingUpdateEntity
    operation: 'create' | 'update' | 'delete'
    payload: Record<string, unknown>
  }) => Promise<PendingUpdate>
  now: () => Date
}

const defaultDeps: ReassignDeps = {
  schools: schoolsJson as unknown as School[],
  mous: mousJson as unknown as MOU[],
  users: usersJson as unknown as User[],
  salesTeam: salesTeamJson as unknown as SalesPerson[],
  enqueue: enqueueUpdate,
  now: () => new Date(),
}

export async function reassignSalesRep(
  args: ReassignSalesRepArgs,
  deps: ReassignDeps = defaultDeps,
): Promise<ReassignSalesRepResult> {
  const user = deps.users.find((u) => u.id === args.reassignedBy)
  if (!user) return { ok: false, reason: 'unknown-user' }
  if (!canEditMOU(user) && !canEditFinanceData(user)) {
    return { ok: false, reason: 'permission' }
  }

  const school = deps.schools.find((s) => s.id === args.schoolId)
  if (!school) return { ok: false, reason: 'school-not-found' }

  if (args.newSalesPersonId !== null) {
    const rep = deps.salesTeam.find((sp) => sp.id === args.newSalesPersonId)
    if (!rep) return { ok: false, reason: 'unknown-sales-rep' }
    if (!rep.active) return { ok: false, reason: 'inactive-sales-rep' }
  }

  const schoolMous = deps.mous.filter((m) => m.schoolId === school.id)
  const previousSalesPersonId = getCurrentSalesRepForSchool(school, schoolMous)
  if (previousSalesPersonId === args.newSalesPersonId) {
    return { ok: false, reason: 'no-change' }
  }

  const ts = deps.now().toISOString()
  const schoolAudit: AuditEntry = {
    timestamp: ts,
    user: args.reassignedBy,
    action: 'sales-rep-reassigned',
    before: { salesPersonId: previousSalesPersonId, scope: args.scope },
    after: { salesPersonId: args.newSalesPersonId, scope: args.scope },
    notes:
      args.reason && args.reason.trim() !== ''
        ? `Sales rep reassigned (${args.scope}): ${args.reason.trim()}`
        : `Sales rep reassigned (${args.scope}).`,
  }
  const updatedSchool: School = {
    ...school,
    auditLog: [...school.auditLog, schoolAudit],
  }
  await deps.enqueue({
    queuedBy: args.reassignedBy,
    entity: 'school',
    operation: 'update',
    payload: updatedSchool as unknown as Record<string, unknown>,
  })

  const updatedMouIds: string[] = []
  if (args.scope === 'all-mous') {
    for (const mou of schoolMous) {
      // Skip rows that already match the target to avoid burning audit
      // entries for no functional change.
      if (mou.salesPersonId === args.newSalesPersonId) continue
      const mouAudit: AuditEntry = {
        timestamp: ts,
        user: args.reassignedBy,
        action: 'sales-rep-reassigned',
        before: { salesPersonId: mou.salesPersonId },
        after: { salesPersonId: args.newSalesPersonId },
        notes:
          args.reason && args.reason.trim() !== ''
            ? `Cascaded from school reassignment: ${args.reason.trim()}`
            : 'Cascaded from school reassignment.',
      }
      const updatedMou: MOU = {
        ...mou,
        salesPersonId: args.newSalesPersonId,
        auditLog: [...mou.auditLog, mouAudit],
      }
      await deps.enqueue({
        queuedBy: args.reassignedBy,
        entity: 'mou',
        operation: 'update',
        payload: updatedMou as unknown as Record<string, unknown>,
      })
      updatedMouIds.push(mou.id)
    }
  }

  return {
    ok: true,
    school: updatedSchool,
    updatedMouIds,
    previousSalesPersonId,
  }
}
