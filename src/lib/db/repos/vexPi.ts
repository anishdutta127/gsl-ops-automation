/*
 * VexPi repo (Phase 7).
 *
 * VEX kit billing entity. Shares the MTPL PI counter with programme PIs
 * per GST entity (see counterRepo.bumpPiCounter). JSONB-heavy:
 * line_items (VexPiLineItem[]), payment_log_ids (string[]), audit_log.
 * NUMERIC monetary fields with string-to-number coercion via num().
 */

import type { VexPi, AuditEntry } from '@/lib/types'
import { currentBackend } from '../backend'
import { getSql } from '../client'
import { enqueueUpdate } from '@/lib/pendingUpdates'
import { PAID_TOLERANCE, nudgeVexPiStatusOnPayment } from '@/lib/vex/vexPiStatus'
import vexPisJson from '@/data/vex_pis.json'

const jsonVexPis = vexPisJson as unknown as VexPi[]

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any

interface VexPiRow {
  id: string
  pi_number: string | null
  entity_key: VexPi['entityKey'] | null
  issue_date: string | null
  school_name: string | null
  shipping_address: string | null
  billing_name: string | null
  billing_address: string | null
  school_gst_number: string | null
  contact_person: string | null
  contact_no: string | null
  line_items: Json
  subtotal: string | number | null
  freight_charges: string | number | null
  taxable_value: string | number | null
  gst_pct: string | number | null
  gst_amount: string | number | null
  total: string | number | null
  status: VexPi['status'] | null
  generated_by: string | null
  generated_at: string | null
  payment_received_amount: string | number | null
  payment_log_ids: Json
  notes: string | null
  audit_log: Json
}

function num(v: string | number | null | undefined): number {
  if (v === null || v === undefined) return 0
  if (typeof v === 'number') return v
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function dateStr(v: unknown): string | null {
  if (v === null || v === undefined) return null
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  return typeof v === 'string' && v !== '' ? v : null
}

function rowToVexPi(r: VexPiRow): VexPi {
  return {
    id: r.id,
    piNumber: r.pi_number ?? '',
    entityKey: (r.entity_key ?? 'MH') as VexPi['entityKey'],
    issueDate: dateStr(r.issue_date) ?? '',
    schoolName: r.school_name ?? '',
    shippingAddress: r.shipping_address ?? '',
    billingName: r.billing_name ?? '',
    billingAddress: r.billing_address ?? '',
    schoolGstNumber: r.school_gst_number,
    contactPerson: r.contact_person ?? '',
    contactNo: r.contact_no ?? '',
    lineItems: Array.isArray(r.line_items) ? r.line_items : [],
    subtotal: num(r.subtotal),
    freightCharges: num(r.freight_charges),
    taxableValue: num(r.taxable_value),
    gstPct: num(r.gst_pct),
    gstAmount: num(r.gst_amount),
    total: num(r.total),
    status: (r.status ?? 'Generated') as VexPi['status'],
    generatedBy: r.generated_by ?? 'system',
    generatedAt: dateStr(r.generated_at) ?? '',
    paymentReceivedAmount: num(r.payment_received_amount),
    paymentLogIds: Array.isArray(r.payment_log_ids) ? r.payment_log_ids : [],
    notes: r.notes,
    auditLog: Array.isArray(r.audit_log) ? r.audit_log : [],
  }
}

export const vexPiRepo = {
  async findAll(): Promise<VexPi[]> {
    if (currentBackend() === 'postgres') {
      const sql = getSql()
      const rows = await sql<VexPiRow[]>`SELECT * FROM vex_pis ORDER BY id`
      return rows.map(rowToVexPi)
    }
    return jsonVexPis
  },

  async findById(id: string): Promise<VexPi | null> {
    if (currentBackend() === 'postgres') {
      const sql = getSql()
      const rows = await sql<VexPiRow[]>`SELECT * FROM vex_pis WHERE id = ${id}`
      return rows[0] ? rowToVexPi(rows[0]) : null
    }
    return jsonVexPis.find((v) => v.id === id) ?? null
  },

  async findByEntityKey(entityKey: VexPi['entityKey']): Promise<VexPi[]> {
    if (currentBackend() === 'postgres') {
      const sql = getSql()
      const rows = await sql<VexPiRow[]>`
        SELECT * FROM vex_pis WHERE entity_key = ${entityKey} ORDER BY id
      `
      return rows.map(rowToVexPi)
    }
    return jsonVexPis.filter((v) => v.entityKey === entityKey)
  },

  async create(v: VexPi): Promise<void> {
    if (currentBackend() === 'postgres') {
      const sql = getSql()
      await sql`
        INSERT INTO vex_pis (id, pi_number, entity_key, issue_date, school_name,
                             shipping_address, billing_name, billing_address,
                             school_gst_number, contact_person, contact_no,
                             line_items, subtotal, freight_charges, taxable_value,
                             gst_pct, gst_amount, total, status, generated_by,
                             generated_at, payment_received_amount, payment_log_ids,
                             notes, audit_log)
        VALUES (
          ${v.id}, ${v.piNumber || null}, ${v.entityKey ?? null},
          ${v.issueDate || null}, ${v.schoolName || null},
          ${v.shippingAddress || null}, ${v.billingName || null},
          ${v.billingAddress || null}, ${v.schoolGstNumber ?? null},
          ${v.contactPerson || null}, ${v.contactNo || null},
          ${sql.json((v.lineItems ?? []) as never)}::jsonb,
          ${v.subtotal ?? null}, ${v.freightCharges ?? null},
          ${v.taxableValue ?? null}, ${v.gstPct ?? null},
          ${v.gstAmount ?? null}, ${v.total ?? null},
          ${v.status ?? null}, ${v.generatedBy ?? null},
          ${v.generatedAt || null}, ${v.paymentReceivedAmount ?? null},
          ${sql.json((v.paymentLogIds ?? []) as never)}::jsonb,
          ${v.notes ?? null},
          ${sql.json((v.auditLog ?? []) as never)}::jsonb
        )
      `
      return
    }
    await enqueueUpdate({
      queuedBy: 'system',
      entity: 'vexPi',
      operation: 'create',
      payload: v as unknown as Record<string, unknown>,
    })
  },

  async update(v: VexPi, opts?: { queuedBy?: string }): Promise<void> {
    if (currentBackend() === 'postgres') {
      const sql = getSql()
      await sql`
        UPDATE vex_pis SET
          pi_number = ${v.piNumber || null},
          entity_key = ${v.entityKey ?? null},
          issue_date = ${v.issueDate || null},
          school_name = ${v.schoolName || null},
          shipping_address = ${v.shippingAddress || null},
          billing_name = ${v.billingName || null},
          billing_address = ${v.billingAddress || null},
          school_gst_number = ${v.schoolGstNumber ?? null},
          contact_person = ${v.contactPerson || null},
          contact_no = ${v.contactNo || null},
          line_items = ${sql.json((v.lineItems ?? []) as never)}::jsonb,
          subtotal = ${v.subtotal ?? null},
          freight_charges = ${v.freightCharges ?? null},
          taxable_value = ${v.taxableValue ?? null},
          gst_pct = ${v.gstPct ?? null},
          gst_amount = ${v.gstAmount ?? null},
          total = ${v.total ?? null},
          status = ${v.status ?? null},
          generated_by = ${v.generatedBy ?? null},
          generated_at = ${v.generatedAt || null},
          payment_received_amount = ${v.paymentReceivedAmount ?? null},
          payment_log_ids = ${sql.json((v.paymentLogIds ?? []) as never)}::jsonb,
          notes = ${v.notes ?? null},
          audit_log = ${sql.json((v.auditLog ?? []) as never)}::jsonb
        WHERE id = ${v.id}
      `
      return
    }
    await enqueueUpdate({
      queuedBy: opts?.queuedBy ?? 'system',
      entity: 'vexPi',
      operation: 'update',
      payload: v as unknown as Record<string, unknown>,
    })
  },

  /**
   * Atomic partial update: patches ONLY the columns present in `patch`
   * (camelCase keys mapped to snake_case), leaving every other column
   * untouched. Pairs with appendAudit() to satisfy the bridge's
   * dispatchAuditedUpdate (RepoWithAtomic), which patches scalar fields
   * here then atomically concats new audit entries via appendAudit. This
   * is the path the dispatch->Delivered PI roll-up enqueues through.
   * Mirrors vexDispatchRepo.updatePartial.
   */
  async updatePartial(
    id: string,
    patch: Partial<VexPi>,
    opts?: { queuedBy?: string },
  ): Promise<void> {
    if (currentBackend() === 'postgres') {
      const sql = getSql()
      const CAMEL_TO_SNAKE: Record<string, string> = {
        piNumber: 'pi_number', entityKey: 'entity_key', issueDate: 'issue_date',
        schoolName: 'school_name', shippingAddress: 'shipping_address',
        billingName: 'billing_name', billingAddress: 'billing_address',
        schoolGstNumber: 'school_gst_number', contactPerson: 'contact_person',
        contactNo: 'contact_no', lineItems: 'line_items', subtotal: 'subtotal',
        freightCharges: 'freight_charges', taxableValue: 'taxable_value',
        gstPct: 'gst_pct', gstAmount: 'gst_amount', total: 'total',
        status: 'status', generatedBy: 'generated_by', generatedAt: 'generated_at',
        paymentReceivedAmount: 'payment_received_amount',
        paymentLogIds: 'payment_log_ids', notes: 'notes',
        voidedAt: 'voided_at', voidedBy: 'voided_by', voidReason: 'void_reason',
      }
      const JSONB_COLS = new Set(['lineItems', 'paymentLogIds'])
      const setObj: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(patch)) {
        if (k === 'id' || k === 'auditLog') continue
        const col = CAMEL_TO_SNAKE[k]
        if (!col) continue
        setObj[col] = JSONB_COLS.has(k)
          ? (v == null ? null : sql.json(v as never))
          : (v ?? null)
      }
      if (Object.keys(setObj).length === 0) return
      await sql`UPDATE vex_pis SET ${sql(setObj)} WHERE id = ${id}`
      return
    }
    const v = jsonVexPis.find((x) => x.id === id)
    if (!v) return
    await enqueueUpdate({
      queuedBy: opts?.queuedBy ?? 'system',
      entity: 'vexPi',
      operation: 'update',
      payload: { ...v, ...patch } as unknown as Record<string, unknown>,
    })
  },

  /**
   * void: soft-delete tombstone (Pass 2, migration 021). Sets voided_at/by +
   * reason, zeroes the balance, clears payment_log_ids, and appends an audit
   * entry, in ONE UPDATE. Callers (voidVexPi) cascade-void the PI's pre-ship
   * dispatches + payment_logs BEFORE this. Never a hard DELETE.
   */
  async void(
    id: string,
    args: { voidedAt: string; voidedBy: string; voidReason: string; audit: AuditEntry },
  ): Promise<void> {
    if (currentBackend() === 'postgres') {
      const sql = getSql()
      await sql`
        UPDATE vex_pis SET
          voided_at = ${args.voidedAt},
          voided_by = ${args.voidedBy},
          void_reason = ${args.voidReason},
          payment_received_amount = 0,
          payment_log_ids = ${sql.json([] as never)}::jsonb,
          audit_log = audit_log || ${sql.json([args.audit] as never)}::jsonb
        WHERE id = ${id}
      `
      return
    }
    const v = jsonVexPis.find((x) => x.id === id)
    if (!v) return
    const updated: VexPi = {
      ...v,
      voidedAt: args.voidedAt,
      voidedBy: args.voidedBy,
      voidReason: args.voidReason,
      paymentReceivedAmount: 0,
      paymentLogIds: [],
      auditLog: [...(v.auditLog ?? []), args.audit],
    }
    await enqueueUpdate({
      queuedBy: args.voidedBy,
      entity: 'vexPi',
      operation: 'update',
      payload: updated as unknown as Record<string, unknown>,
    })
  },

  async appendAudit(id: string, entry: AuditEntry): Promise<void> {
    if (currentBackend() === 'postgres') {
      const sql = getSql()
      await sql`
        UPDATE vex_pis SET audit_log = audit_log || ${sql.json([entry] as never)}::jsonb
        WHERE id = ${id}
      `
      return
    }
    const v = jsonVexPis.find((x) => x.id === id)
    if (!v) return
    const updated: VexPi = { ...v, auditLog: [...(v.auditLog ?? []), entry] }
    await enqueueUpdate({
      queuedBy: 'system',
      entity: 'vexPi',
      operation: 'update',
      payload: updated as unknown as Record<string, unknown>,
    })
  },

  /**
   * Atomic recordVexPayment (Anish 2026-05-24 RMW-race fix - MONEY route).
   *
   * Concurrent payment-recording on the same VexPi would otherwise race
   * on payment_log_ids + payment_received_amount + status: classic RMW
   * pattern - read pi, push logId, recompute amount + status, write
   * back, last-writer-wins, lost payment_log_id.
   *
   * This method does the entire mutation server-side in ONE UPDATE:
   *   - payment_log_ids grows via `|| jsonb_build_array(logId)` (atomic).
   *   - payment_received_amount += $amount (atomic additive).
   *   - status is recomputed in-row using the post-increment value vs
   *     pi.total (no race on the comparison).
   *   - audit_log is appended via the same concat primitive.
   *
   * Empirical proof of the race-without-this-fix: verify-rmw-races.mjs
   * showed vex_pis.payment_log_ids survived 1/10 parallel writes.
   * With this method: 10/10 (see verify-vex-payment-atomic.mjs).
   *
   * Status transition mirrors nudgeVexPiStatusOnPayment (@/lib/vex/vexPiStatus),
   * kept byte-for-byte in sync by a contract test:
   *   - fully paid (received >= total - PAID_TOLERANCE): keep any status already
   *     at/beyond Delivery Pending (Completed / Partially Dispatched); else
   *     Delivery Pending. The tolerance stops a whole-rupee receipt against a
   *     paise-carrying total stranding at Payment Pending.
   *   - partial AND status was 'Generated': 'Payment Pending'.
   *   - otherwise: preserve current status.
   */
  async recordVexPayment(
    id: string,
    args: {
      logId: string
      amount: number
      audit: AuditEntry
      queuedBy?: string
    },
  ): Promise<void> {
    if (currentBackend() === 'postgres') {
      const sql = getSql()
      await sql`
        UPDATE vex_pis SET
          payment_log_ids = payment_log_ids || ${sql.json([args.logId] as never)}::jsonb,
          payment_received_amount = ROUND(
            (COALESCE(payment_received_amount, 0) + ${args.amount})::numeric, 2
          ),
          status = CASE
            WHEN COALESCE(payment_received_amount, 0) + ${args.amount} >= total - ${PAID_TOLERANCE}
              THEN CASE
                WHEN status IN ('Delivery Pending', 'Partially Dispatched', 'Completed') THEN status
                ELSE 'Delivery Pending'
              END
            WHEN status = 'Generated' THEN 'Payment Pending'
            ELSE status
          END,
          audit_log = audit_log || ${sql.json([args.audit] as never)}::jsonb
        WHERE id = ${id}
      `
      return
    }
    // json mode: full-row enqueue (drainer serialises).
    const v = jsonVexPis.find((x) => x.id === id)
    if (!v) return
    const newAmount = Math.round((v.paymentReceivedAmount + args.amount) * 100) / 100
    const newStatus = nudgeVexPiStatusOnPayment(newAmount, v.total, v.status)
    const updated: VexPi = {
      ...v,
      paymentLogIds: [...(v.paymentLogIds ?? []), args.logId],
      paymentReceivedAmount: newAmount,
      status: newStatus,
      auditLog: [...(v.auditLog ?? []), args.audit],
    }
    await enqueueUpdate({
      queuedBy: args.queuedBy ?? 'system',
      entity: 'vexPi',
      operation: 'update',
      payload: updated as unknown as Record<string, unknown>,
    })
  },
}
