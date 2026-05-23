/*
 * KitDispatch repo (Phase 7).
 *
 * Heavy JSONB load: allocations, dispatch_summary, shipment_tracking,
 * pod, audit_log. Created lazily at first-allocation-submit time
 * (DISPATCH-<mouId> format).
 *
 * This is the entity the Phase 6H bug class lived on (the warehouse-
 * email + challan-upload silent-corruption-on-write was here).
 * Write-parity round-trip is the proof that bug class is dead in
 * the postgres path.
 */

import type { KitDispatch, AuditEntry } from '@/lib/types'
import { currentBackend } from '../backend'
import { getSql } from '../client'
import { enqueueUpdate } from '@/lib/pendingUpdates'
import kitDispatchesJson from '@/data/kit_dispatches.json'

const jsonKitDispatches = kitDispatchesJson as unknown as KitDispatch[]

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any

interface KitDispatchRow {
  id: string
  mou_id: string
  school_id: string
  school_name: string
  product_selected: KitDispatch['productSelected'] | null
  dispatch_status: KitDispatch['dispatchStatus']
  allocations: Json
  sales_approval_status: KitDispatch['salesApprovalStatus'] | null
  sales_approved_by: string | null
  sales_approved_at: string | null
  sales_rejection_reason: string | null
  dispatch_summary: Json
  shipment_tracking: Json
  pod: Json
  import_notes: string | null
  created_at: string
  audit_log: Json
}

function rowToKitDispatch(r: KitDispatchRow): KitDispatch {
  return {
    id: r.id,
    mouId: r.mou_id,
    schoolId: r.school_id,
    schoolName: r.school_name,
    productSelected: (r.product_selected ?? 'TinkRworks') as KitDispatch['productSelected'],
    dispatchStatus: r.dispatch_status,
    allocations: Array.isArray(r.allocations) ? r.allocations : [],
    salesApprovalStatus: (r.sales_approval_status ?? 'Pending') as KitDispatch['salesApprovalStatus'],
    salesApprovedBy: r.sales_approved_by,
    salesApprovedAt: r.sales_approved_at,
    salesRejectionReason: r.sales_rejection_reason,
    dispatchSummary: r.dispatch_summary ?? null,
    shipmentTracking: r.shipment_tracking ?? null,
    pod: r.pod ?? null,
    auditLog: Array.isArray(r.audit_log) ? r.audit_log : [],
    createdAt: r.created_at,
    importNotes: r.import_notes ?? null,
  } as KitDispatch
}

export const kitDispatchRepo = {
  async findAll(): Promise<KitDispatch[]> {
    if (currentBackend() === 'postgres') {
      const sql = getSql()
      const rows = await sql<KitDispatchRow[]>`SELECT * FROM kit_dispatches ORDER BY id`
      return rows.map(rowToKitDispatch)
    }
    return jsonKitDispatches
  },

  async findById(id: string): Promise<KitDispatch | null> {
    if (currentBackend() === 'postgres') {
      const sql = getSql()
      const rows = await sql<KitDispatchRow[]>`SELECT * FROM kit_dispatches WHERE id = ${id}`
      return rows[0] ? rowToKitDispatch(rows[0]) : null
    }
    return jsonKitDispatches.find((k) => k.id === id) ?? null
  },

  async findByMouId(mouId: string): Promise<KitDispatch | null> {
    if (currentBackend() === 'postgres') {
      const sql = getSql()
      const rows = await sql<KitDispatchRow[]>`SELECT * FROM kit_dispatches WHERE mou_id = ${mouId}`
      return rows[0] ? rowToKitDispatch(rows[0]) : null
    }
    return jsonKitDispatches.find((k) => k.mouId === mouId) ?? null
  },

  async create(k: KitDispatch, opts?: { queuedBy?: string }): Promise<void> {
    if (currentBackend() === 'postgres') {
      const sql = getSql()
      await sql`
        INSERT INTO kit_dispatches (id, mou_id, school_id, school_name, product_selected,
                                    dispatch_status, allocations, sales_approval_status,
                                    sales_approved_by, sales_approved_at, sales_rejection_reason,
                                    dispatch_summary, shipment_tracking, pod, import_notes,
                                    created_at, audit_log)
        VALUES (
          ${k.id}, ${k.mouId}, ${k.schoolId}, ${k.schoolName},
          ${k.productSelected ?? null}, ${k.dispatchStatus ?? 'Draft'},
          ${sql.json((k.allocations ?? []) as never)}::jsonb,
          ${k.salesApprovalStatus ?? 'Pending'},
          ${k.salesApprovedBy ?? null}, ${k.salesApprovedAt ?? null},
          ${k.salesRejectionReason ?? null},
          ${k.dispatchSummary == null ? null : sql.json(k.dispatchSummary as never)}::jsonb,
          ${k.shipmentTracking == null ? null : sql.json(k.shipmentTracking as never)}::jsonb,
          ${k.pod == null ? null : sql.json(k.pod as never)}::jsonb,
          ${k.importNotes ?? null},
          ${k.createdAt || sql`NOW()`},
          ${sql.json((k.auditLog ?? []) as never)}::jsonb
        )
      `
      return
    }
    await enqueueUpdate({
      queuedBy: opts?.queuedBy ?? 'system',
      entity: 'kitDispatch',
      operation: 'create',
      payload: k as unknown as Record<string, unknown>,
    })
  },

  async update(k: KitDispatch, opts?: { queuedBy?: string }): Promise<void> {
    if (currentBackend() === 'postgres') {
      const sql = getSql()
      await sql`
        UPDATE kit_dispatches SET
          school_name = ${k.schoolName},
          product_selected = ${k.productSelected ?? null},
          dispatch_status = ${k.dispatchStatus},
          allocations = ${sql.json((k.allocations ?? []) as never)}::jsonb,
          sales_approval_status = ${k.salesApprovalStatus ?? null},
          sales_approved_by = ${k.salesApprovedBy ?? null},
          sales_approved_at = ${k.salesApprovedAt ?? null},
          sales_rejection_reason = ${k.salesRejectionReason ?? null},
          dispatch_summary = ${k.dispatchSummary == null ? null : sql.json(k.dispatchSummary as never)}::jsonb,
          shipment_tracking = ${k.shipmentTracking == null ? null : sql.json(k.shipmentTracking as never)}::jsonb,
          pod = ${k.pod == null ? null : sql.json(k.pod as never)}::jsonb,
          import_notes = ${k.importNotes ?? null},
          audit_log = ${sql.json((k.auditLog ?? []) as never)}::jsonb
        WHERE id = ${k.id}
      `
      return
    }
    await enqueueUpdate({
      queuedBy: opts?.queuedBy ?? 'system',
      entity: 'kitDispatch',
      operation: 'update',
      payload: k as unknown as Record<string, unknown>,
    })
  },

  async appendAudit(id: string, entry: AuditEntry): Promise<void> {
    if (currentBackend() === 'postgres') {
      const sql = getSql()
      await sql`
        UPDATE kit_dispatches SET audit_log = audit_log || ${sql.json([entry] as never)}::jsonb
        WHERE id = ${id}
      `
      return
    }
    const k = jsonKitDispatches.find((x) => x.id === id)
    if (!k) return
    const updated: KitDispatch = { ...k, auditLog: [...(k.auditLog ?? []), entry] }
    await enqueueUpdate({
      queuedBy: 'system',
      entity: 'kitDispatch',
      operation: 'update',
      payload: updated as unknown as Record<string, unknown>,
    })
  },
}
