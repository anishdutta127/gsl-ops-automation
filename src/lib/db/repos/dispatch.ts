/*
 * Dispatch repo (Phase 7).
 *
 * JSONB: line_items (DispatchLineItem[] discriminated union: flat or per-grade),
 * override_event, audit_log. Note the column is named `instalment_seq` in our
 * schema but the TypeScript field is `installmentSeq` (double-L); the mapper
 * handles the rename.
 */

import type { Dispatch, AuditEntry } from '@/lib/types'
import { currentBackend } from '../backend'
import { getSql } from '../client'
import { enqueueUpdate } from '@/lib/pendingUpdates'
import dispatchesJson from '@/data/dispatches.json'

const jsonDispatches = dispatchesJson as unknown as Dispatch[]

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any

interface DispatchRow {
  id: string
  mou_id: string | null
  school_id: string
  instalment_seq: number | null
  stage: Dispatch['stage']
  installment1_paid: boolean | null
  override_event: Json
  po_raised_at: string | null
  dispatched_at: string | null
  delivered_at: string | null
  acknowledged_at: string | null
  acknowledgement_url: string | null
  notes: string | null
  line_items: Json
  request_id: string | null
  raised_by: string | null
  raised_from: Dispatch['raisedFrom'] | null
  audit_log: Json
}

function rowToDispatch(r: DispatchRow): Dispatch {
  return {
    id: r.id,
    mouId: r.mou_id,
    schoolId: r.school_id,
    installmentSeq: r.instalment_seq ?? 0,
    stage: r.stage,
    installment1Paid: !!r.installment1_paid,
    overrideEvent: r.override_event ?? null,
    poRaisedAt: r.po_raised_at,
    dispatchedAt: r.dispatched_at,
    deliveredAt: r.delivered_at,
    acknowledgedAt: r.acknowledged_at,
    acknowledgementUrl: r.acknowledgement_url,
    notes: r.notes,
    lineItems: Array.isArray(r.line_items) ? r.line_items : [],
    requestId: r.request_id,
    raisedBy: r.raised_by ?? 'system',
    raisedFrom: (r.raised_from ?? 'pre-w4d') as Dispatch['raisedFrom'],
    auditLog: Array.isArray(r.audit_log) ? r.audit_log : [],
  } as Dispatch
}

export const dispatchRepo = {
  async findAll(): Promise<Dispatch[]> {
    if (currentBackend() === 'postgres') {
      const sql = getSql()
      const rows = await sql<DispatchRow[]>`SELECT * FROM dispatches ORDER BY id`
      return rows.map(rowToDispatch)
    }
    return jsonDispatches
  },

  async findById(id: string): Promise<Dispatch | null> {
    if (currentBackend() === 'postgres') {
      const sql = getSql()
      const rows = await sql<DispatchRow[]>`SELECT * FROM dispatches WHERE id = ${id}`
      return rows[0] ? rowToDispatch(rows[0]) : null
    }
    return jsonDispatches.find((d) => d.id === id) ?? null
  },

  async findByMouId(mouId: string): Promise<Dispatch[]> {
    if (currentBackend() === 'postgres') {
      const sql = getSql()
      const rows = await sql<DispatchRow[]>`
        SELECT * FROM dispatches WHERE mou_id = ${mouId} ORDER BY id
      `
      return rows.map(rowToDispatch)
    }
    return jsonDispatches.filter((d) => d.mouId === mouId)
  },

  async update(d: Dispatch, opts?: { queuedBy?: string }): Promise<void> {
    if (currentBackend() === 'postgres') {
      const sql = getSql()
      await sql`
        UPDATE dispatches SET
          mou_id = ${d.mouId ?? null},
          school_id = ${d.schoolId},
          instalment_seq = ${d.installmentSeq ?? null},
          stage = ${d.stage},
          installment1_paid = ${!!d.installment1Paid},
          override_event = ${d.overrideEvent == null ? null : sql.json(d.overrideEvent as never)}::jsonb,
          po_raised_at = ${d.poRaisedAt ?? null},
          dispatched_at = ${d.dispatchedAt ?? null},
          delivered_at = ${d.deliveredAt ?? null},
          acknowledged_at = ${d.acknowledgedAt ?? null},
          acknowledgement_url = ${d.acknowledgementUrl ?? null},
          notes = ${d.notes ?? null},
          line_items = ${sql.json((d.lineItems ?? []) as never)}::jsonb,
          request_id = ${d.requestId ?? null},
          raised_by = ${d.raisedBy ?? null},
          raised_from = ${d.raisedFrom ?? null},
          audit_log = ${sql.json((d.auditLog ?? []) as never)}::jsonb
        WHERE id = ${d.id}
      `
      return
    }
    await enqueueUpdate({
      queuedBy: opts?.queuedBy ?? 'system',
      entity: 'dispatch',
      operation: 'update',
      payload: d as unknown as Record<string, unknown>,
    })
  },

  async appendAudit(id: string, entry: AuditEntry, opts?: { queuedBy?: string }): Promise<void> {
    if (currentBackend() === 'postgres') {
      const sql = getSql()
      await sql`
        UPDATE dispatches SET audit_log = audit_log || ${sql.json([entry] as never)}::jsonb
        WHERE id = ${id}
      `
      return
    }
    const d = jsonDispatches.find((x) => x.id === id)
    if (!d) return
    const updated: Dispatch = { ...d, auditLog: [...(d.auditLog ?? []), entry] }
    await enqueueUpdate({
      queuedBy: opts?.queuedBy ?? 'system',
      entity: 'dispatch',
      operation: 'update',
      payload: updated as unknown as Record<string, unknown>,
    })
  },

  async updatePartial(
    id: string,
    patch: Partial<Dispatch>,
    opts?: { queuedBy?: string },
  ): Promise<void> {
    if (currentBackend() === 'postgres') {
      const sql = getSql()
      const CAMEL_TO_SNAKE: Record<string, string> = {
        mouId: 'mou_id', schoolId: 'school_id',
        installmentSeq: 'instalment_seq', stage: 'stage',
        installment1Paid: 'installment1_paid',
        poRaisedAt: 'po_raised_at', dispatchedAt: 'dispatched_at',
        deliveredAt: 'delivered_at', acknowledgedAt: 'acknowledged_at',
        acknowledgementUrl: 'acknowledgement_url', notes: 'notes',
        requestId: 'request_id', raisedBy: 'raised_by',
        raisedFrom: 'raised_from',
      }
      const setObj: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(patch)) {
        if (k === 'id' || k === 'auditLog') continue
        if (k === 'lineItems') {
          setObj['line_items'] = v == null ? sql.json([] as never) : sql.json(v as never)
          continue
        }
        if (k === 'overrideEvent') {
          setObj['override_event'] = v == null ? null : sql.json(v as never)
          continue
        }
        const col = CAMEL_TO_SNAKE[k]
        if (!col) continue
        setObj[col] = v ?? null
      }
      if (Object.keys(setObj).length === 0) return
      await sql`UPDATE dispatches SET ${sql(setObj)} WHERE id = ${id}`
      return
    }
    const cur = jsonDispatches.find((x) => x.id === id)
    if (!cur) return
    await enqueueUpdate({
      queuedBy: opts?.queuedBy ?? 'system',
      entity: 'dispatch',
      operation: 'update',
      payload: { ...cur, ...patch } as unknown as Record<string, unknown>,
    })
  },

  async updateWithAudit(
    id: string,
    patch: Partial<Dispatch>,
    audit: AuditEntry,
    opts?: { queuedBy?: string },
  ): Promise<void> {
    if (currentBackend() === 'postgres') {
      await this.updatePartial(id, patch, opts)
      await this.appendAudit(id, audit)
      return
    }
    const cur = jsonDispatches.find((x) => x.id === id)
    if (!cur) return
    await enqueueUpdate({
      queuedBy: opts?.queuedBy ?? 'system',
      entity: 'dispatch',
      operation: 'update',
      payload: {
        ...cur, ...patch,
        auditLog: [...(cur.auditLog ?? []), audit],
      } as unknown as Record<string, unknown>,
    })
  },
}
