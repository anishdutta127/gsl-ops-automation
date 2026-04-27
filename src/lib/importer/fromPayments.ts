/*
 * Upstream-payment -> Ops-payment adapter (Week 3).
 *
 * Used by scripts/import-week3.mjs to seed the Ops payments fixture
 * from the gsl-mou-system upstream. Pure function: takes a
 * RawUpstreamPayment, returns the structured Ops `Payment`.
 *
 * Status enum: upstream uses { Received | Pending | Overdue |
 * Partial }, all of which are subsets of Ops's seven-value
 * PaymentStatus enum, so no transform needed.
 *
 * Field gap: upstream omits auditLog, partialPayments,
 * piGeneratedAt, piSentDate, piSentTo, studentCountActual. Ops
 * defaults each to null (or empty array for partialPayments) at
 * import; operators backfill via the existing reconcile flow as
 * payments are re-confirmed during the pilot.
 *
 * piGeneratedAt heuristic: when piNumber is non-null but
 * piGeneratedAt is null, the import sets piGeneratedAt to the
 * import timestamp. This is a best-effort backfill: legacy PI
 * issuance dates are unrecoverable, but stamping with the import
 * date keeps "PI was issued at some point before now" visible to
 * the lifecycle helper. Documented in the audit entry.
 */

import type {
  AuditEntry,
  Payment,
  PaymentMode,
  PaymentStatus,
  Programme,
} from '@/lib/types'

export interface RawUpstreamPayment {
  id: string
  mouId: string
  schoolName: string
  programme: string
  instalmentLabel: string
  instalmentSeq: number
  totalInstalments: number
  description: string
  dueDateRaw?: string | null
  dueDateIso?: string | null
  expectedAmount: number
  receivedAmount?: number | null
  receivedDate?: string | null
  paymentMode?: string | null
  bankReference?: string | null
  piNumber?: string | null
  taxInvoiceNumber?: string | null
  status: string
  notes?: string | null
}

const VALID_STATUS: ReadonlySet<string> = new Set([
  'Received', 'Pending', 'Overdue', 'Partial', 'Due Soon', 'PI Sent', 'Paid',
])

const VALID_MODES: ReadonlySet<string> = new Set([
  'Bank Transfer', 'Cheque', 'UPI', 'Cash', 'Zoho', 'Razorpay', 'Other',
])

export interface PaymentImportAnomaly {
  paymentId: string
  kind: 'unknown-status' | 'unknown-mode' | 'pi-without-date'
  detail: string
}

export interface PaymentImportResult {
  payment: Payment
  anomalies: PaymentImportAnomaly[]
}

export function importPayment(
  raw: RawUpstreamPayment,
  importTimestamp: string,
): PaymentImportResult {
  const anomalies: PaymentImportAnomaly[] = []

  // Status pass-through with anomaly surface for non-canonical values
  let status: PaymentStatus = 'Pending'
  if (typeof raw.status === 'string' && VALID_STATUS.has(raw.status)) {
    status = raw.status as PaymentStatus
  } else {
    anomalies.push({
      paymentId: raw.id,
      kind: 'unknown-status',
      detail: `status "${String(raw.status)}" not in canonical enum; defaulted to Pending`,
    })
  }

  // Payment mode pass-through with anomaly surface
  let paymentMode: PaymentMode | null = null
  if (typeof raw.paymentMode === 'string' && raw.paymentMode !== '') {
    if (VALID_MODES.has(raw.paymentMode)) {
      paymentMode = raw.paymentMode as PaymentMode
    } else {
      anomalies.push({
        paymentId: raw.id,
        kind: 'unknown-mode',
        detail: `paymentMode "${raw.paymentMode}" not in canonical enum; nulled`,
      })
    }
  }

  // PI date heuristic: if piNumber is set but no piGeneratedAt is
  // recoverable, stamp the import timestamp so lifecycle stage 4
  // (invoice-raised) is visible. Documented in the auditLog.
  let piGeneratedAt: string | null = null
  if (typeof raw.piNumber === 'string' && raw.piNumber !== '') {
    piGeneratedAt = importTimestamp
    anomalies.push({
      paymentId: raw.id,
      kind: 'pi-without-date',
      detail: `piNumber "${raw.piNumber}" present but no piGeneratedAt upstream; stamped to import timestamp`,
    })
  }

  const auditLog: AuditEntry[] = [{
    timestamp: importTimestamp,
    user: 'system',
    action: 'create',
    notes: `Imported from gsl-mou-system as part of Week 3 backfill.${
      piGeneratedAt !== null ? ' piGeneratedAt stamped to import timestamp (legacy PI issuance date unrecoverable).' : ''
    }`,
  }]

  const payment: Payment = {
    id: raw.id,
    mouId: raw.mouId,
    schoolName: raw.schoolName,
    programme: raw.programme as Programme,
    instalmentLabel: raw.instalmentLabel,
    instalmentSeq: raw.instalmentSeq,
    totalInstalments: raw.totalInstalments,
    description: raw.description,
    dueDateRaw: raw.dueDateRaw ?? null,
    dueDateIso: raw.dueDateIso ?? null,
    expectedAmount: raw.expectedAmount,
    receivedAmount: raw.receivedAmount ?? null,
    receivedDate: raw.receivedDate ?? null,
    paymentMode,
    bankReference: raw.bankReference ?? null,
    piNumber: raw.piNumber ?? null,
    taxInvoiceNumber: raw.taxInvoiceNumber ?? null,
    status,
    notes: raw.notes ?? null,
    piSentDate: null,
    piSentTo: null,
    piGeneratedAt,
    studentCountActual: null,
    partialPayments: null,
    auditLog,
  }

  return { payment, anomalies }
}
