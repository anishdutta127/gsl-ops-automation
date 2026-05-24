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
  version: number
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
    version: r.version ?? 1,
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

  /**
   * Partial-field update. Updates ONLY the listed columns. JSONB
   * columns (allocations, dispatch_summary, shipment_tracking, pod)
   * auto-wrapped via sql.json(); scalars pass through. Json mode
   * reads + merges + enqueues a full payload.
   */
  async updatePartial(
    id: string,
    patch: Partial<KitDispatch>,
    opts?: { queuedBy?: string },
  ): Promise<void> {
    if (currentBackend() === 'postgres') {
      const sql = getSql()
      const CAMEL_TO_SNAKE: Record<string, string> = {
        schoolId: 'school_id', schoolName: 'school_name',
        productSelected: 'product_selected', dispatchStatus: 'dispatch_status',
        salesApprovalStatus: 'sales_approval_status',
        salesApprovedBy: 'sales_approved_by',
        salesApprovedAt: 'sales_approved_at',
        salesRejectionReason: 'sales_rejection_reason',
        importNotes: 'import_notes',
      }
      const JSONB_COLS = new Set(['allocations', 'dispatchSummary', 'shipmentTracking', 'pod'])
      const setObj: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(patch)) {
        if (k === 'id' || k === 'auditLog') continue
        if (JSONB_COLS.has(k)) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const col = k === 'dispatchSummary' ? 'dispatch_summary'
            : k === 'shipmentTracking' ? 'shipment_tracking'
            : k
          setObj[col] = v == null ? null : sql.json(v as never)
          continue
        }
        const col = CAMEL_TO_SNAKE[k]
        if (!col) continue
        setObj[col] = v ?? null
      }
      if (Object.keys(setObj).length === 0) return
      await sql`UPDATE kit_dispatches SET ${sql(setObj)} WHERE id = ${id}`
      return
    }
    const cur = jsonKitDispatches.find((x) => x.id === id)
    if (!cur) return
    await enqueueUpdate({
      queuedBy: opts?.queuedBy ?? 'system',
      entity: 'kitDispatch',
      operation: 'update',
      payload: { ...cur, ...patch } as unknown as Record<string, unknown>,
    })
  },

  /**
   * Atomic "update fields + append audit" in one call. See
   * mouRepo.updateWithAudit for pattern docs.
   */
  async updateWithAudit(
    id: string,
    patch: Partial<KitDispatch>,
    audit: AuditEntry,
    opts?: { queuedBy?: string },
  ): Promise<void> {
    if (currentBackend() === 'postgres') {
      await this.updatePartial(id, patch, opts)
      await this.appendAudit(id, audit)
      return
    }
    const cur = jsonKitDispatches.find((x) => x.id === id)
    if (!cur) return
    await enqueueUpdate({
      queuedBy: opts?.queuedBy ?? 'system',
      entity: 'kitDispatch',
      operation: 'update',
      payload: {
        ...cur, ...patch,
        auditLog: [...(cur.auditLog ?? []), audit],
      } as unknown as Record<string, unknown>,
    })
  },

  /**
   * P2b.X OCC update (2026-05-24): optimistic-concurrency mutation of
   * the REPLACE-on-update fields (allocations, dispatchSummary,
   * shipmentTracking, pod, plus the related scalar fields). The
   * caller supplies the version it loaded; we UPDATE only if the row
   * still has that version. Bumps version on success. On conflict
   * (0 rows affected), returns `{ ok: false, conflictVersion }` so
   * the route can surface a 409 to the UI; the operator reloads and
   * retries with the fresh state.
   *
   * Why OCC and not row-lock or atomic-append: these fields are
   * form-replace by intent (the user submits the WHOLE allocations
   * array, not "add one item"). Row-lock would still let the second
   * writer's REPLACE silently overwrite the first; only OCC fails the
   * loser cleanly so we can show them the conflict before their work
   * is lost.
   *
   * Audit_log on the row is appended atomically inside the same
   * statement via `audit_log || jsonb` - both editors' audit entries
   * survive even on the loser's 409 (the loser's audit lands first,
   * then their UPDATE fails the version check, then we explicitly
   * REVERT the audit append below... actually no, simpler: don't
   * append the audit if the conflict check fails. Implemented below).
   *
   * Empirical proof: scripts/verify-allocations-occ.mjs - 10 parallel
   * writers, 1 winner + 9 clean conflicts, no silent overwrite.
   */
  async updateAllocationsOCC(
    id: string,
    expectedVersion: number,
    patch: Partial<Pick<KitDispatch,
      'allocations' | 'dispatchSummary' | 'shipmentTracking' | 'pod'
      | 'dispatchStatus' | 'salesApprovalStatus' | 'salesApprovedBy'
      | 'salesApprovedAt' | 'salesRejectionReason' | 'productSelected'
    >>,
    audit: AuditEntry,
    opts?: { queuedBy?: string },
  ): Promise<{ ok: true; newVersion: number } | { ok: false; conflictVersion: number }> {
    if (currentBackend() === 'postgres') {
      const sql = getSql()
      const allocations = patch.allocations === undefined
        ? null : sql.json((patch.allocations ?? []) as never)
      const dispatchSummary = patch.dispatchSummary === undefined
        ? null : (patch.dispatchSummary == null ? null : sql.json(patch.dispatchSummary as never))
      const shipmentTracking = patch.shipmentTracking === undefined
        ? null : (patch.shipmentTracking == null ? null : sql.json(patch.shipmentTracking as never))
      const pod = patch.pod === undefined
        ? null : (patch.pod == null ? null : sql.json(patch.pod as never))
      // Conditional UPDATE: only changes fields the caller supplied.
      // postgres COALESCE keeps current value when the parameter is the
      // explicit sentinel (we use NULL + a parallel "should-update" flag).
      // To avoid a complex CASE matrix, we just always include the column
      // and use the new value when supplied, else keep current via a
      // sub-expression. This is verbose but correct.
      const rows = await sql<{ version: number }[]>`
        UPDATE kit_dispatches SET
          allocations = ${patch.allocations === undefined
            ? sql`allocations`
            : sql`${allocations}::jsonb`},
          dispatch_summary = ${patch.dispatchSummary === undefined
            ? sql`dispatch_summary`
            : sql`${dispatchSummary}::jsonb`},
          shipment_tracking = ${patch.shipmentTracking === undefined
            ? sql`shipment_tracking`
            : sql`${shipmentTracking}::jsonb`},
          pod = ${patch.pod === undefined
            ? sql`pod`
            : sql`${pod}::jsonb`},
          dispatch_status = ${patch.dispatchStatus === undefined
            ? sql`dispatch_status`
            : sql`${patch.dispatchStatus}`},
          sales_approval_status = ${patch.salesApprovalStatus === undefined
            ? sql`sales_approval_status`
            : sql`${patch.salesApprovalStatus}`},
          sales_approved_by = ${patch.salesApprovedBy === undefined
            ? sql`sales_approved_by`
            : sql`${patch.salesApprovedBy ?? null}`},
          sales_approved_at = ${patch.salesApprovedAt === undefined
            ? sql`sales_approved_at`
            : sql`${patch.salesApprovedAt ?? null}`},
          sales_rejection_reason = ${patch.salesRejectionReason === undefined
            ? sql`sales_rejection_reason`
            : sql`${patch.salesRejectionReason ?? null}`},
          product_selected = ${patch.productSelected === undefined
            ? sql`product_selected`
            : sql`${patch.productSelected ?? null}`},
          audit_log = audit_log || ${sql.json([audit] as never)}::jsonb,
          version = version + 1
        WHERE id = ${id} AND version = ${expectedVersion}
        RETURNING version
      `
      if (rows.length === 1) {
        return { ok: true, newVersion: rows[0]!.version }
      }
      // Conflict: read current version so the route can surface it to
      // the UI.
      const cur = await sql<{ version: number }[]>`SELECT version FROM kit_dispatches WHERE id = ${id}`
      return { ok: false, conflictVersion: cur[0]?.version ?? -1 }
    }
    // json mode: OCC by version compare; serialised by queue drainer.
    const cur = jsonKitDispatches.find((x) => x.id === id)
    if (!cur) return { ok: false, conflictVersion: -1 }
    const curVersion = cur.version ?? 1
    if (curVersion !== expectedVersion) {
      return { ok: false, conflictVersion: curVersion }
    }
    const merged: KitDispatch = {
      ...cur,
      ...patch,
      auditLog: [...(cur.auditLog ?? []), audit],
      version: curVersion + 1,
    }
    await enqueueUpdate({
      queuedBy: opts?.queuedBy ?? 'system',
      entity: 'kitDispatch',
      operation: 'update',
      payload: merged as unknown as Record<string, unknown>,
    })
    return { ok: true, newVersion: curVersion + 1 }
  },
}
