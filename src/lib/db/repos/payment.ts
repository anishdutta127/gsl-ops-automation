/*
 * Payment repo (Phase 7).
 *
 * Financial-critical. JSONB: partial_payments (PartialPaymentEntry[]),
 * audit_log. Extensive numeric/timestamp fields with NUMERIC(14,2)
 * postgres storage. Read parity proves the mapper; write parity
 * round-trips the JSONB + audit append to confirm no silent
 * corruption.
 */

import type { Payment, AuditEntry } from '@/lib/types'
import { currentBackend } from '../backend'
import { getSql } from '../client'
import { enqueueUpdate } from '@/lib/pendingUpdates'
import paymentsJson from '@/data/payments.json'

const jsonPayments = paymentsJson as unknown as Payment[]

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any

interface PaymentRow {
  id: string
  mou_id: string
  school_name: string
  programme: Payment['programme']
  instalment_label: string
  instalment_seq: number
  total_instalments: number
  description: string | null
  due_date_raw: string | null
  due_date_iso: string | null
  expected_amount: string | number
  received_amount: string | number | null
  received_date: string | null
  payment_mode: Payment['paymentMode']
  bank_reference: string | null
  pi_number: string | null
  tax_invoice_number: string | null
  status: Payment['status']
  notes: string | null
  pi_sent_date: string | null
  pi_sent_to: string | null
  pi_generated_at: string | null
  pi_voided_at: string | null
  pi_void_reason: string | null
  student_count_actual: number | null
  partial_payments: Json
  bank_amount: string | number | null
  tds_amount: string | number | null
  tds_certificate_ref: string | null
  tds_rate: string | number | null
  percent_share: string | number | null
  nominal_amount: string | number | null
  adjustment_from_locked_installments: string | number | null
  net_due: string | number | null
  locked_at: string | null
  is_locked: boolean
  audit_log: Json
}

function num(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined) return null
  if (typeof v === 'number') return v
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function dateStr(v: unknown): string | null {
  if (v === null || v === undefined) return null
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  return typeof v === 'string' && v !== '' ? v : null
}

function rowToPayment(r: PaymentRow): Payment {
  return {
    id: r.id,
    mouId: r.mou_id,
    schoolName: r.school_name,
    programme: r.programme,
    instalmentLabel: r.instalment_label,
    instalmentSeq: r.instalment_seq,
    totalInstalments: r.total_instalments,
    description: r.description ?? '',
    dueDateRaw: dateStr(r.due_date_raw),
    dueDateIso: dateStr(r.due_date_iso),
    expectedAmount: num(r.expected_amount) ?? 0,
    receivedAmount: num(r.received_amount),
    receivedDate: dateStr(r.received_date),
    paymentMode: r.payment_mode,
    bankReference: r.bank_reference,
    piNumber: r.pi_number,
    taxInvoiceNumber: r.tax_invoice_number,
    status: r.status,
    notes: r.notes,
    piSentDate: dateStr(r.pi_sent_date),
    piSentTo: r.pi_sent_to,
    piGeneratedAt: dateStr(r.pi_generated_at),
    piVoidedAt: dateStr(r.pi_voided_at),
    piVoidReason: r.pi_void_reason,
    studentCountActual: r.student_count_actual,
    partialPayments: Array.isArray(r.partial_payments) ? r.partial_payments : null,
    bankAmount: num(r.bank_amount),
    tdsAmount: num(r.tds_amount),
    tdsCertificateRef: r.tds_certificate_ref ?? null,
    tdsRate: num(r.tds_rate),
    percentShare: num(r.percent_share),
    nominalAmount: num(r.nominal_amount),
    adjustmentFromLockedInstallments: num(r.adjustment_from_locked_installments),
    netDue: num(r.net_due),
    lockedAt: dateStr(r.locked_at),
    isLocked: !!r.is_locked,
    auditLog: Array.isArray(r.audit_log) ? r.audit_log : null,
  } as Payment
}

export const paymentRepo = {
  async findAll(): Promise<Payment[]> {
    if (currentBackend() === 'postgres') {
      const sql = getSql()
      const rows = await sql<PaymentRow[]>`SELECT * FROM payments ORDER BY id`
      return rows.map(rowToPayment)
    }
    return jsonPayments
  },

  async findById(id: string): Promise<Payment | null> {
    if (currentBackend() === 'postgres') {
      const sql = getSql()
      const rows = await sql<PaymentRow[]>`SELECT * FROM payments WHERE id = ${id}`
      return rows[0] ? rowToPayment(rows[0]) : null
    }
    return jsonPayments.find((p) => p.id === id) ?? null
  },

  async findByMouId(mouId: string): Promise<Payment[]> {
    if (currentBackend() === 'postgres') {
      const sql = getSql()
      const rows = await sql<PaymentRow[]>`
        SELECT * FROM payments WHERE mou_id = ${mouId} ORDER BY instalment_seq
      `
      return rows.map(rowToPayment)
    }
    return jsonPayments.filter((p) => p.mouId === mouId)
  },

  async findByStatus(status: Payment['status']): Promise<Payment[]> {
    if (currentBackend() === 'postgres') {
      const sql = getSql()
      const rows = await sql<PaymentRow[]>`
        SELECT * FROM payments WHERE status = ${status} ORDER BY id
      `
      return rows.map(rowToPayment)
    }
    return jsonPayments.filter((p) => p.status === status)
  },

  async create(p: Payment, opts?: { queuedBy?: string }): Promise<void> {
    if (currentBackend() === 'postgres') {
      const sql = getSql()
      await sql`
        INSERT INTO payments (
          id, mou_id, school_name, programme, instalment_label, instalment_seq,
          total_instalments, description, due_date_raw, due_date_iso,
          expected_amount, received_amount, received_date, payment_mode,
          bank_reference, pi_number, tax_invoice_number, status, notes,
          pi_sent_date, pi_sent_to, pi_generated_at, pi_voided_at, pi_void_reason,
          student_count_actual, partial_payments, bank_amount, tds_amount,
          tds_certificate_ref, tds_rate, percent_share, nominal_amount,
          adjustment_from_locked_installments, net_due, locked_at, is_locked, audit_log
        ) VALUES (
          ${p.id}, ${p.mouId}, ${p.schoolName}, ${p.programme}, ${p.instalmentLabel}, ${p.instalmentSeq},
          ${p.totalInstalments}, ${p.description ?? null}, ${p.dueDateRaw ?? null}, ${p.dueDateIso ?? null},
          ${p.expectedAmount}, ${p.receivedAmount ?? null}, ${p.receivedDate ?? null}, ${p.paymentMode ?? null},
          ${p.bankReference ?? null}, ${p.piNumber ?? null}, ${p.taxInvoiceNumber ?? null}, ${p.status}, ${p.notes ?? null},
          ${p.piSentDate ?? null}, ${p.piSentTo ?? null}, ${p.piGeneratedAt ?? null}, ${p.piVoidedAt ?? null}, ${p.piVoidReason ?? null},
          ${p.studentCountActual ?? null}, ${sql.json((p.partialPayments ?? []) as never)}::jsonb, ${p.bankAmount ?? null}, ${p.tdsAmount ?? null},
          ${p.tdsCertificateRef ?? null}, ${p.tdsRate ?? null}, ${p.percentShare ?? null}, ${p.nominalAmount ?? null},
          ${p.adjustmentFromLockedInstallments ?? null}, ${p.netDue ?? null}, ${p.lockedAt ?? null}, ${!!p.isLocked},
          ${sql.json((p.auditLog ?? []) as never)}::jsonb
        ) ON CONFLICT (id) DO NOTHING
      `
      return
    }
    await enqueueUpdate({
      queuedBy: opts?.queuedBy ?? 'system',
      entity: 'payment',
      operation: 'create',
      payload: p as unknown as Record<string, unknown>,
    })
  },

  async update(p: Payment, opts?: { queuedBy?: string }): Promise<void> {
    if (currentBackend() === 'postgres') {
      const sql = getSql()
      await sql`
        UPDATE payments SET
          mou_id = ${p.mouId},
          school_name = ${p.schoolName},
          programme = ${p.programme},
          instalment_label = ${p.instalmentLabel},
          instalment_seq = ${p.instalmentSeq},
          total_instalments = ${p.totalInstalments},
          description = ${p.description ?? null},
          due_date_raw = ${p.dueDateRaw ?? null},
          due_date_iso = ${p.dueDateIso ?? null},
          expected_amount = ${p.expectedAmount},
          received_amount = ${p.receivedAmount ?? null},
          received_date = ${p.receivedDate ?? null},
          payment_mode = ${p.paymentMode ?? null},
          bank_reference = ${p.bankReference ?? null},
          pi_number = ${p.piNumber ?? null},
          tax_invoice_number = ${p.taxInvoiceNumber ?? null},
          status = ${p.status},
          notes = ${p.notes ?? null},
          pi_sent_date = ${p.piSentDate ?? null},
          pi_sent_to = ${p.piSentTo ?? null},
          pi_generated_at = ${p.piGeneratedAt ?? null},
          pi_voided_at = ${p.piVoidedAt ?? null},
          pi_void_reason = ${p.piVoidReason ?? null},
          student_count_actual = ${p.studentCountActual ?? null},
          partial_payments = ${sql.json((p.partialPayments ?? []) as never)}::jsonb,
          bank_amount = ${p.bankAmount ?? null},
          tds_amount = ${p.tdsAmount ?? null},
          tds_certificate_ref = ${p.tdsCertificateRef ?? null},
          tds_rate = ${p.tdsRate ?? null},
          percent_share = ${p.percentShare ?? null},
          nominal_amount = ${p.nominalAmount ?? null},
          adjustment_from_locked_installments = ${p.adjustmentFromLockedInstallments ?? null},
          net_due = ${p.netDue ?? null},
          locked_at = ${p.lockedAt ?? null},
          is_locked = ${!!p.isLocked},
          audit_log = ${sql.json((p.auditLog ?? []) as never)}::jsonb
        WHERE id = ${p.id}
      `
      return
    }
    await enqueueUpdate({
      queuedBy: opts?.queuedBy ?? 'system',
      entity: 'payment',
      operation: 'update',
      payload: p as unknown as Record<string, unknown>,
    })
  },

  async appendAudit(id: string, entry: AuditEntry, opts?: { queuedBy?: string }): Promise<void> {
    if (currentBackend() === 'postgres') {
      const sql = getSql()
      await sql`
        UPDATE payments SET audit_log = audit_log || ${sql.json([entry] as never)}::jsonb
        WHERE id = ${id}
      `
      return
    }
    const p = jsonPayments.find((x) => x.id === id)
    if (!p) return
    const updated: Payment = { ...p, auditLog: [...(p.auditLog ?? []), entry] }
    await enqueueUpdate({
      queuedBy: opts?.queuedBy ?? 'system',
      entity: 'payment',
      operation: 'update',
      payload: updated as unknown as Record<string, unknown>,
    })
  },

  async updatePartial(
    id: string,
    patch: Partial<Payment>,
    opts?: { queuedBy?: string },
  ): Promise<void> {
    if (currentBackend() === 'postgres') {
      const sql = getSql()
      const CAMEL_TO_SNAKE: Record<string, string> = {
        mouId: 'mou_id', schoolName: 'school_name',
        programme: 'programme', instalmentLabel: 'instalment_label',
        instalmentSeq: 'instalment_seq',
        totalInstalments: 'total_instalments',
        description: 'description', dueDateRaw: 'due_date_raw',
        dueDateIso: 'due_date_iso', expectedAmount: 'expected_amount',
        receivedAmount: 'received_amount',
        receivedDate: 'received_date', paymentMode: 'payment_mode',
        bankReference: 'bank_reference', piNumber: 'pi_number',
        taxInvoiceNumber: 'tax_invoice_number', status: 'status',
        notes: 'notes', piSentDate: 'pi_sent_date',
        piSentTo: 'pi_sent_to', piGeneratedAt: 'pi_generated_at',
        piVoidedAt: 'pi_voided_at', piVoidReason: 'pi_void_reason',
        studentCountActual: 'student_count_actual',
        bankAmount: 'bank_amount', tdsAmount: 'tds_amount',
        tdsCertificateRef: 'tds_certificate_ref', tdsRate: 'tds_rate',
        percentShare: 'percent_share', nominalAmount: 'nominal_amount',
        adjustmentFromLockedInstallments: 'adjustment_from_locked_installments',
        netDue: 'net_due', lockedAt: 'locked_at', isLocked: 'is_locked',
      }
      const setObj: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(patch)) {
        if (k === 'id' || k === 'auditLog') continue
        if (k === 'partialPayments') {
          setObj['partial_payments'] = sql.json((v ?? []) as never)
          continue
        }
        const col = CAMEL_TO_SNAKE[k]
        if (!col) continue
        setObj[col] = v ?? null
      }
      if (Object.keys(setObj).length === 0) return
      await sql`UPDATE payments SET ${sql(setObj)} WHERE id = ${id}`
      return
    }
    const cur = jsonPayments.find((x) => x.id === id)
    if (!cur) return
    await enqueueUpdate({
      queuedBy: opts?.queuedBy ?? 'system',
      entity: 'payment',
      operation: 'update',
      payload: { ...cur, ...patch } as unknown as Record<string, unknown>,
    })
  },

  async updateWithAudit(
    id: string,
    patch: Partial<Payment>,
    audit: AuditEntry,
    opts?: { queuedBy?: string },
  ): Promise<void> {
    if (currentBackend() === 'postgres') {
      await this.updatePartial(id, patch, opts)
      await this.appendAudit(id, audit, opts)
      return
    }
    const cur = jsonPayments.find((x) => x.id === id)
    if (!cur) return
    await enqueueUpdate({
      queuedBy: opts?.queuedBy ?? 'system',
      entity: 'payment',
      operation: 'update',
      payload: {
        ...cur, ...patch,
        auditLog: [...(cur.auditLog ?? []), audit],
      } as unknown as Record<string, unknown>,
    })
  },

  /**
   * Atomic recordPartialReceipt (Anish 2026-05-24 anti-race fix).
   *
   * Concurrent recordPartialReceipt callers would otherwise race on
   * partial_payments + received_amount + status (the classic RMW
   * pattern: read row, append partial in-memory, recompute received,
   * UPDATE - last-writer-wins, lost-partial-payment).
   *
   * This method does the entire mutation server-side in ONE UPDATE
   * statement, so:
   * - partial_payments grows via `|| jsonb_build_array(...)` concat
   *     (atomic, never lost).
   * - received_amount is incremented via `COALESCE(received_amount,0)
   *     + $delta` (atomic, additive - no read needed).
   * - status is recomputed in-row using the post-increment value vs
   *     expected_amount (no race on the comparison either).
   * - audit_log is appended via the same concat primitive.
   *
   * Empirical proof of the race-without-this-fix: verify-rmw-races.mjs
   * showed payments.partial_payments survived 3/10 parallel writes. With
   * this method, 10/10 survive (see verify-rmw-races.mjs after-fix run).
   *
   * Trade-off: receivedDate, paymentMode, bankReference, notes are
   * LAST-WRITER-WINS scalar overwrites. That's correct semantics: the
   * last partial recorded "owns" the most recent metadata for the
   * payment row as a whole. The per-partial detail (date, mode, ref,
   * notes) is preserved inside the partial_payments[] array element.
   */
  async recordPartialReceipt(
    id: string,
    args: {
      partial: import('@/lib/types').PartialPaymentEntry
      receivedDate?: string | null
      paymentMode?: Payment['paymentMode']
      bankReference?: string | null
      notes?: string | null
      audit: AuditEntry
      queuedBy?: string
    },
  ): Promise<void> {
    if (currentBackend() === 'postgres') {
      const sql = getSql()
      const partial = args.partial
      const amount = Number(partial.amount ?? 0)
      await sql`
        UPDATE payments SET
          partial_payments = partial_payments || ${sql.json([partial] as never)}::jsonb,
          received_amount = COALESCE(received_amount, 0) + ${amount},
          received_date = ${args.receivedDate ?? null},
          payment_mode = ${args.paymentMode ?? null},
          bank_reference = ${args.bankReference ?? null},
          notes = ${args.notes ?? null},
          status = CASE
            WHEN COALESCE(received_amount, 0) + ${amount} + 0.01 >= expected_amount THEN 'Paid'
            ELSE 'Partial'
          END,
          audit_log = audit_log || ${sql.json([args.audit] as never)}::jsonb
        WHERE id = ${id}
      `
      return
    }
    // json mode: full-row enqueue (unchanged from the lib's prior shape).
    // Race risk in json mode is bounded by the queue drainer's serial
    // apply. Acceptable for json-mode dev/testing.
    const cur = jsonPayments.find((x) => x.id === id)
    if (!cur) return
    const prevPartials = cur.partialPayments ?? []
    const allPartials = [...prevPartials, args.partial]
    const cumulative = allPartials.reduce((s, p) => s + Number(p.amount ?? 0), 0)
    const nextStatus: Payment['status'] =
      cumulative + 0.01 >= cur.expectedAmount ? 'Paid' : 'Partial'
    await enqueueUpdate({
      queuedBy: args.queuedBy ?? 'system',
      entity: 'payment',
      operation: 'update',
      payload: {
        ...cur,
        partialPayments: allPartials,
        receivedAmount: cumulative,
        receivedDate: args.receivedDate ?? cur.receivedDate,
        paymentMode: args.paymentMode ?? cur.paymentMode,
        bankReference: args.bankReference ?? cur.bankReference,
        notes: args.notes ?? cur.notes,
        status: nextStatus,
        auditLog: [...(cur.auditLog ?? []), args.audit],
      } as unknown as Record<string, unknown>,
    })
  },
}
