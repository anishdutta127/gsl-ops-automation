/*
 * Escalation repo (Phase 7).
 *
 * JSONB: notified_emails (string[]), comments (EscalationComment[]),
 * audit_log. The comments JSONB is the W4 step-15 thread; comment
 * inserts append both to comments[] and to auditLog[], so write-parity
 * checks both round-trip.
 */

import type { Escalation, AuditEntry } from '@/lib/types'
import { currentBackend } from '../backend'
import { getSql } from '../client'
import { enqueueUpdate } from '@/lib/pendingUpdates'
import escalationsJson from '@/data/escalations.json'

const jsonEscalations = escalationsJson as unknown as Escalation[]

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any

interface EscalationRow {
  id: string
  created_at: string
  created_by: string | null
  school_id: string
  mou_id: string | null
  stage: Escalation['stage'] | null
  lane: Escalation['lane'] | null
  level: Escalation['level'] | null
  origin: Escalation['origin'] | null
  origin_id: string | null
  severity: Escalation['severity']
  description: string | null
  assigned_to: string | null
  notified_emails: Json
  status: Escalation['status']
  category: Escalation['category']
  type: Escalation['type']
  owned_by_department: Escalation['ownedByDepartment'] | null
  transferred_from_department: Escalation['transferredFromDepartment']
  transferred_to_department: Escalation['transferredToDepartment']
  transferred_at: string | null
  transfer_reason: string | null
  sla_target_date: string | null
  sla_breached: boolean | null
  waiting_on: string | null
  resolution_notes: string | null
  resolved_at: string | null
  resolved_by: string | null
  comments: Json
  audit_log: Json
}

function rowToEscalation(r: EscalationRow): Escalation {
  return {
    id: r.id,
    createdAt: typeof r.created_at === 'string' ? r.created_at : new Date(r.created_at as unknown as Date).toISOString(),
    createdBy: r.created_by ?? 'system',
    schoolId: r.school_id,
    mouId: r.mou_id,
    stage: (r.stage ?? 'Other') as Escalation['stage'],
    lane: (r.lane ?? 'OPS') as Escalation['lane'],
    level: (r.level ?? 1) as Escalation['level'],
    origin: (r.origin ?? 'manual') as Escalation['origin'],
    originId: r.origin_id,
    severity: r.severity,
    description: r.description ?? '',
    assignedTo: r.assigned_to,
    notifiedEmails: Array.isArray(r.notified_emails) ? r.notified_emails : [],
    status: r.status,
    category: r.category,
    type: r.type,
    ownedByDepartment: r.owned_by_department ?? undefined,
    transferredFromDepartment: r.transferred_from_department ?? null,
    transferredToDepartment: r.transferred_to_department ?? null,
    transferredAt: r.transferred_at,
    transferReason: r.transfer_reason,
    slaTargetDate: r.sla_target_date ?? undefined,
    slaBreached: r.sla_breached ?? undefined,
    waitingOn: r.waiting_on,
    resolutionNotes: r.resolution_notes,
    resolvedAt: r.resolved_at,
    resolvedBy: r.resolved_by,
    auditLog: Array.isArray(r.audit_log) ? r.audit_log : [],
    comments: Array.isArray(r.comments) ? r.comments : [],
  } as Escalation
}

export const escalationRepo = {
  async findAll(): Promise<Escalation[]> {
    if (currentBackend() === 'postgres') {
      const sql = getSql()
      const rows = await sql<EscalationRow[]>`SELECT * FROM escalations ORDER BY id`
      return rows.map(rowToEscalation)
    }
    return jsonEscalations
  },

  async findById(id: string): Promise<Escalation | null> {
    if (currentBackend() === 'postgres') {
      const sql = getSql()
      const rows = await sql<EscalationRow[]>`SELECT * FROM escalations WHERE id = ${id}`
      return rows[0] ? rowToEscalation(rows[0]) : null
    }
    return jsonEscalations.find((e) => e.id === id) ?? null
  },

  async findByMouId(mouId: string): Promise<Escalation[]> {
    if (currentBackend() === 'postgres') {
      const sql = getSql()
      const rows = await sql<EscalationRow[]>`
        SELECT * FROM escalations WHERE mou_id = ${mouId} ORDER BY created_at DESC
      `
      return rows.map(rowToEscalation)
    }
    return jsonEscalations.filter((e) => e.mouId === mouId)
  },

  async findOpen(): Promise<Escalation[]> {
    if (currentBackend() === 'postgres') {
      const sql = getSql()
      const rows = await sql<EscalationRow[]>`
        SELECT * FROM escalations WHERE status NOT IN ('Closed') ORDER BY id
      `
      return rows.map(rowToEscalation)
    }
    return jsonEscalations.filter((e) => e.status !== 'Closed')
  },

  async update(e: Escalation, opts?: { queuedBy?: string }): Promise<void> {
    if (currentBackend() === 'postgres') {
      const sql = getSql()
      await sql`
        UPDATE escalations SET
          created_by = ${e.createdBy ?? null},
          school_id = ${e.schoolId},
          mou_id = ${e.mouId ?? null},
          stage = ${e.stage ?? null},
          lane = ${e.lane ?? null},
          level = ${e.level ?? null},
          origin = ${e.origin ?? null},
          origin_id = ${e.originId ?? null},
          severity = ${e.severity},
          description = ${e.description ?? null},
          assigned_to = ${e.assignedTo ?? null},
          notified_emails = ${sql.json((e.notifiedEmails ?? []) as never)}::jsonb,
          status = ${e.status},
          category = ${e.category ?? null},
          type = ${e.type ?? null},
          owned_by_department = ${e.ownedByDepartment ?? null},
          transferred_from_department = ${e.transferredFromDepartment ?? null},
          transferred_to_department = ${e.transferredToDepartment ?? null},
          transferred_at = ${e.transferredAt ?? null},
          transfer_reason = ${e.transferReason ?? null},
          sla_target_date = ${e.slaTargetDate ?? null},
          sla_breached = ${e.slaBreached ?? null},
          waiting_on = ${e.waitingOn ?? null},
          resolution_notes = ${e.resolutionNotes ?? null},
          resolved_at = ${e.resolvedAt ?? null},
          resolved_by = ${e.resolvedBy ?? null},
          comments = ${sql.json((e.comments ?? []) as never)}::jsonb,
          audit_log = ${sql.json((e.auditLog ?? []) as never)}::jsonb
        WHERE id = ${e.id}
      `
      return
    }
    await enqueueUpdate({
      queuedBy: opts?.queuedBy ?? 'system',
      entity: 'escalation',
      operation: 'update',
      payload: e as unknown as Record<string, unknown>,
    })
  },

  async appendAudit(id: string, entry: AuditEntry): Promise<void> {
    if (currentBackend() === 'postgres') {
      const sql = getSql()
      await sql`
        UPDATE escalations SET audit_log = audit_log || ${sql.json([entry] as never)}::jsonb
        WHERE id = ${id}
      `
      return
    }
    const e = jsonEscalations.find((x) => x.id === id)
    if (!e) return
    const updated: Escalation = { ...e, auditLog: [...(e.auditLog ?? []), entry] }
    await enqueueUpdate({
      queuedBy: 'system',
      entity: 'escalation',
      operation: 'update',
      payload: updated as unknown as Record<string, unknown>,
    })
  },
}
