/*
 * Audit-entry aggregator for /admin/audit.
 *
 * Walks every entity that carries auditLog and emits a flat list of
 * AuditRowData entries with the metadata the audit page renders. Per
 * step 8 architecture, src/data/*.json are the storage; we read them
 * synchronously at request time (Server Component context).
 *
 * Phase 1 entity coverage:
 *   MOU, School, SchoolGroup, Communication, Escalation, Dispatch,
 *   Feedback, CcRule. User audit-events are not yet emitted (login /
 *   logout / user-create flows land later); when they do, add a
 *   Users branch here.
 *
 * laneOfEntry assignment:
 *   - Escalation: from the entity's own .lane field.
 *   - Dispatch: hardcoded 'OPS' (P2 overrides + dispatch lifecycle
 *     are OPS domain regardless of who triggered).
 *   - CcRule: hardcoded 'OPS' (CcRule administration is Ops Head).
 *   - Other entities: undefined; canViewAuditEntry treats absence as
 *     "shared / no specific lane".
 */

import type {
  AuditEntry,
  CcRule,
  Communication,
  Dispatch,
  Escalation,
  EscalationLane,
  Feedback,
  MOU,
  School,
  SchoolGroup,
} from '@/lib/types'
import mousJson from '@/data/mous.json'
import schoolsJson from '@/data/schools.json'
import schoolGroupsJson from '@/data/school_groups.json'
import communicationsJson from '@/data/communications.json'
import escalationsJson from '@/data/escalations.json'
import dispatchesJson from '@/data/dispatches.json'
import feedbackJson from '@/data/feedback.json'
import ccRulesJson from '@/data/cc_rules.json'

// JSON imports come back with widened string types (action: string,
// status: string, etc.), but the entity types declare narrow unions.
// Cast through unknown to assert each fixture matches its entity
// type by construction; the seed-dev pipeline guarantees this and
// runtime drift would surface elsewhere.
const mousData = mousJson as unknown as MOU[]
const schoolsData = schoolsJson as unknown as School[]
const schoolGroupsData = schoolGroupsJson as unknown as SchoolGroup[]
const communicationsData = communicationsJson as unknown as Communication[]
const escalationsData = escalationsJson as unknown as Escalation[]
const dispatchesData = dispatchesJson as unknown as Dispatch[]
const feedbackData = feedbackJson as unknown as Feedback[]
const ccRulesData = ccRulesJson as unknown as CcRule[]

export interface AuditRowData {
  entry: AuditEntry
  entityType: string
  entityId: string
  entityLabel: string
  entityHref: string
  laneOfEntry?: EscalationLane
}

interface EntityWithAudit {
  auditLog?: AuditEntry[] | null
}

function pushFromEntity<T extends EntityWithAudit>(
  out: AuditRowData[],
  records: readonly T[],
  toMeta: (record: T) => Omit<AuditRowData, 'entry'>,
): void {
  for (const record of records) {
    const log = record.auditLog ?? []
    for (const entry of log) {
      out.push({ entry, ...toMeta(record) })
    }
  }
}

export function collectAuditRows(): AuditRowData[] {
  const out: AuditRowData[] = []

  pushFromEntity(out, mousData, (mou) => ({
    entityType: 'MOU',
    entityId: mou.id,
    entityLabel: `${mou.id} (${mou.schoolName})`,
    entityHref: `/mous/${mou.id}`,
  }))

  pushFromEntity(out, schoolsData, (school) => ({
    entityType: 'School',
    entityId: school.id,
    entityLabel: school.name,
    entityHref: `/schools/${school.id}`,
  }))

  pushFromEntity(out, schoolGroupsData, (group) => ({
    entityType: 'SchoolGroup',
    entityId: group.id,
    entityLabel: group.name,
    entityHref: `/admin/school-groups/${group.id}`,
  }))

  pushFromEntity(out, communicationsData, (comm) => ({
    entityType: 'Communication',
    entityId: comm.id,
    entityLabel: `${comm.type} (${comm.id})`,
    entityHref: comm.mouId ? `/mous/${comm.mouId}` : `/schools/${comm.schoolId}`,
  }))

  pushFromEntity(out, escalationsData, (esc) => ({
    entityType: 'Escalation',
    entityId: esc.id,
    entityLabel: esc.id,
    entityHref: `/escalations/${esc.id}`,
    laneOfEntry: esc.lane as EscalationLane,
  }))

  pushFromEntity(out, dispatchesData, (dis) => ({
    entityType: 'Dispatch',
    entityId: dis.id,
    entityLabel: dis.id,
    entityHref: dis.mouId ? `/mous/${dis.mouId}/dispatch` : `/schools/${dis.schoolId}`,
    laneOfEntry: 'OPS' as EscalationLane,
  }))

  pushFromEntity(out, feedbackData, (fb) => ({
    entityType: 'Feedback',
    entityId: fb.id,
    entityLabel: fb.id,
    entityHref: `/mous/${fb.mouId}/feedback-request`,
  }))

  pushFromEntity(out, ccRulesData, (rule) => ({
    entityType: 'CcRule',
    entityId: rule.id,
    entityLabel: rule.id,
    entityHref: `/admin/cc-rules/${rule.id}`,
    laneOfEntry: 'OPS' as EscalationLane,
  }))

  // Sort newest first; stable secondary by entityId for determinism.
  out.sort((a, b) => {
    const t = b.entry.timestamp.localeCompare(a.entry.timestamp)
    if (t !== 0) return t
    return a.entityId.localeCompare(b.entityId)
  })

  return out
}
