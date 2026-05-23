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
    dueDateRaw: r.due_date_raw,
    dueDateIso: r.due_date_iso,
    expectedAmount: num(r.expected_amount) ?? 0,
    receivedAmount: num(r.received_amount),
    receivedDate: r.received_date,
    paymentMode: r.payment_mode,
    bankReference: r.bank_reference,
    piNumber: r.pi_number,
    taxInvoiceNumber: r.tax_invoice_number,
    status: r.status,
    notes: r.notes,
    piSentDate: r.pi_sent_date,
    piSentTo: r.pi_sent_to,
    piGeneratedAt: r.pi_generated_at,
    piVoidedAt: r.pi_voided_at,
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
    lockedAt: r.locked_at ?? null,
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

  async update(p: Payment): Promise<void> {
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
      queuedBy: 'system',
      entity: 'payment',
      operation: 'update',
      payload: p as unknown as Record<string, unknown>,
    })
  },

  async appendAudit(id: string, entry: AuditEntry): Promise<void> {
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
      queuedBy: 'system',
      entity: 'payment',
      operation: 'update',
      payload: updated as unknown as Record<string, unknown>,
    })
  },
}
