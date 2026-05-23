/*
 * Leaf entity repos (Phase 7, read-only).
 *
 * 24 scalar/leaf entities with read parity only. Write paths stay on
 * the GitHub Contents API queue in json-mode; postgres mode reads
 * straight from the seeded staging table. Call-site migration happens
 * in Part 5; here we only build the surface + prove read-parity.
 *
 * Shape-divergent entities (the JSON file has a different shape from
 * the postgres table) are documented inline and emit a normalised
 * shape on findAll() so parity tests can pass. Documented divergences:
 *
 *   - reminderThresholds: json is { kind: row } object, postgres is rows.
 *     Repo emits a row[] in both modes for parity.
 *   - chainDismissals: json is { dismissedSchoolIds: string[] }, postgres
 *     is per-row. Repo emits a row[] in both modes for parity.
 *   - stageResponsibility / lifecycleRules / signedValues: composite or
 *     non-id PKs; findById falls back to a key lookup helper.
 */

import { currentBackend } from '../backend'
import { getSql } from '../client'
import { enqueueUpdate } from '@/lib/pendingUpdates'
import type {
  Adjustment, Agreement, AuditEntry, MagicLinkToken, PaymentLog,
  StudentCountEvent, VexDispatch,
} from '@/lib/types'

import adjustmentsJson from '@/data/adjustments.json'
import agreementsJson from '@/data/agreements.json'
import ccRulesJson from '@/data/cc_rules.json'
import chainDismissalsJson from '@/data/chain_dismissals.json'
import communicationTemplatesJson from '@/data/communication_templates.json'
import communicationsJson from '@/data/communications.json'
import dispatchRequestsJson from '@/data/dispatch_requests.json'
import feedbackJson from '@/data/feedback.json'
import homepageActionLogJson from '@/data/homepage_action_log.json'
import intakeRecordsJson from '@/data/intake_records.json'
import lifecycleRulesJson from '@/data/lifecycle_rules.json'
import magicLinkTokensJson from '@/data/magic_link_tokens.json'
import mouImportReviewJson from '@/data/mou_import_review.json'
import paymentLogsJson from '@/data/payment_logs.json'
import reminderThresholdsJson from '@/data/reminder_thresholds.json'
import salesOpportunitiesJson from '@/data/sales_opportunities.json'
import schoolGroupsJson from '@/data/school_groups.json'
import schoolSpocsJson from '@/data/school_spocs.json'
import signedValuesJson from '@/data/signed_values.json'
import stageResponsibilityJson from '@/data/stage_responsibility.json'
import studentCountEventsJson from '@/data/student_count_events.json'
import syncHealthJson from '@/data/sync_health.json'
import vexDispatchesJson from '@/data/vex_dispatches.json'
import vexOrdersJson from '@/data/vex_orders.json'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>

function snakeToCamel(s: string): string {
  return s.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase())
}

/**
 * Generic row-to-entity mapper. snake_case columns become camelCase
 * fields, NUMERIC strings coerced to number for the keys in
 * `numericCols`, Date instances coerced to ISO strings.
 */
function mapRow<T>(row: Row, numericCols: ReadonlySet<string> = new Set()): T {
  const out: Row = {}
  for (const [k, v] of Object.entries(row)) {
    const cck = snakeToCamel(k)
    if (numericCols.has(k) && (typeof v === 'string' || typeof v === 'number')) {
      const n = typeof v === 'number' ? v : Number(v)
      out[cck] = Number.isFinite(n) ? n : null
    } else if (v instanceof Date) {
      out[cck] = v.toISOString()
    } else {
      out[cck] = v
    }
  }
  return out as T
}

interface LeafConfig<T> {
  table: string
  json: T[]
  numericCols?: ReadonlySet<string>
  /** column ordering for stable ORDER BY (defaults to 'id') */
  orderBy?: string
  /** primary-key column name for findById (defaults to 'id') */
  idColumn?: string
}

function makeLeafRepo<T>(cfg: LeafConfig<T>) {
  return {
    async findAll(): Promise<T[]> {
      if (currentBackend() === 'postgres') {
        const sql = getSql()
        const orderBy = cfg.orderBy ?? cfg.idColumn ?? 'id'
        const rows = await sql<Row[]>`
          SELECT * FROM ${sql(cfg.table)} ORDER BY ${sql(orderBy)}
        `
        return rows.map((r) => mapRow<T>(r, cfg.numericCols))
      }
      return cfg.json
    },
    async findById(id: string): Promise<T | null> {
      if (currentBackend() === 'postgres') {
        const sql = getSql()
        const col = cfg.idColumn ?? 'id'
        const rows = await sql<Row[]>`
          SELECT * FROM ${sql(cfg.table)} WHERE ${sql(col)} = ${id}
        `
        return rows[0] ? mapRow<T>(rows[0], cfg.numericCols) : null
      }
      const col = cfg.idColumn ?? 'id'
      return ((cfg.json as Row[]).find((r) => r[col] === id) as T) ?? null
    },
  }
}

// ---------------------------------------------------------------------------
// Standard array-shaped, id-keyed leaf entities (15 of 24)
// ---------------------------------------------------------------------------

export const communicationTemplateRepo = makeLeafRepo({
  table: 'communication_templates',
  json: communicationTemplatesJson as unknown[] as Row[],
})

export const ccRuleRepo = makeLeafRepo({
  table: 'cc_rules',
  json: ccRulesJson as unknown[] as Row[],
})

export const schoolGroupRepo = makeLeafRepo({
  table: 'school_groups',
  json: schoolGroupsJson as unknown[] as Row[],
})

export const schoolSpocRepo = makeLeafRepo({
  table: 'school_spocs',
  json: schoolSpocsJson as unknown[] as Row[],
})

// ---------------------------------------------------------------------------
// Phase 7 Part 5.B Priority 1: write-enabled repos for the 6 bridge-gap entities.
// Each carries find{All,ById} for parity-read PLUS create/update/appendAudit
// so the backend-aware enqueueUpdate bridge can dispatch their writes
// directly to postgres in postgres mode.
// ---------------------------------------------------------------------------

// studentCountEvent: append-only event ledger. create() only. JSONB cols:
// recalc_impact (object), audit_log (array).
export const studentCountEventRepo = {
  async findAll(): Promise<StudentCountEvent[]> {
    if (currentBackend() === 'postgres') {
      const sql = getSql()
      const rows = await sql<Row[]>`SELECT * FROM student_count_events ORDER BY id`
      return rows.map((r) => mapRow<StudentCountEvent>(r))
    }
    return studentCountEventsJson as unknown[] as StudentCountEvent[]
  },
  async findById(id: string): Promise<StudentCountEvent | null> {
    if (currentBackend() === 'postgres') {
      const sql = getSql()
      const rows = await sql<Row[]>`SELECT * FROM student_count_events WHERE id = ${id}`
      return rows[0] ? mapRow<StudentCountEvent>(rows[0]) : null
    }
    return ((studentCountEventsJson as unknown[] as StudentCountEvent[]).find((e) => e.id === id)) ?? null
  },
  async create(e: StudentCountEvent, opts?: { queuedBy?: string }): Promise<void> {
    if (currentBackend() === 'postgres') {
      const sql = getSql()
      await sql`
        INSERT INTO student_count_events (id, mou_id, new_count, previous_count,
          effective_date, recorded_at, recorded_by, reason, related_installment_id,
          notes, recalc_impact, audit_log)
        VALUES (
          ${e.id}, ${e.mouId}, ${e.newCount}, ${e.previousCount ?? null},
          ${e.effectiveDate || null}, ${e.recordedAt}, ${e.recordedBy ?? null},
          ${e.reason ?? null}, ${e.relatedInstallmentId ?? null},
          ${e.notes ?? null},
          ${e.recalcImpact == null ? null : sql.json(e.recalcImpact as never)}::jsonb,
          ${sql.json((e.auditLog ?? []) as never)}::jsonb
        )
      `
      return
    }
    await enqueueUpdate({
      queuedBy: opts?.queuedBy ?? 'system',
      entity: 'studentCountEvent',
      operation: 'create',
      payload: e as unknown as Record<string, unknown>,
    })
  },
}

// paymentLog: financial event ledger. create() + update() (for matching).
// JSONB cols: matched_installment_ids (array), audit_log (array).
export const paymentLogRepo = {
  async findAll(): Promise<PaymentLog[]> {
    if (currentBackend() === 'postgres') {
      const sql = getSql()
      const rows = await sql<Row[]>`SELECT * FROM payment_logs ORDER BY id`
      return rows.map((r) => mapRow<PaymentLog>(r, new Set(['amount'])))
    }
    return paymentLogsJson as unknown[] as PaymentLog[]
  },
  async findById(id: string): Promise<PaymentLog | null> {
    if (currentBackend() === 'postgres') {
      const sql = getSql()
      const rows = await sql<Row[]>`SELECT * FROM payment_logs WHERE id = ${id}`
      return rows[0] ? mapRow<PaymentLog>(rows[0], new Set(['amount'])) : null
    }
    return ((paymentLogsJson as unknown[] as PaymentLog[]).find((p) => p.id === id)) ?? null
  },
  async create(p: PaymentLog, opts?: { queuedBy?: string }): Promise<void> {
    if (currentBackend() === 'postgres') {
      const sql = getSql()
      const auditLog = ((p as unknown as { auditLog?: unknown[] }).auditLog ?? []) as never
      await sql`
        INSERT INTO payment_logs (id, date, amount, mode, reference, narration,
          sales_person_id, matched_installment_ids, unmatched, audit_log)
        VALUES (
          ${p.id}, ${p.date}, ${p.amount}, ${p.mode ?? null},
          ${p.reference ?? null}, ${p.narration ?? null},
          ${p.salesPersonId ?? null},
          ${sql.json((p.matchedInstallmentIds ?? []) as never)}::jsonb,
          ${!!p.unmatched},
          ${sql.json(auditLog)}::jsonb
        )
      `
      return
    }
    await enqueueUpdate({
      queuedBy: opts?.queuedBy ?? 'system',
      entity: 'paymentLog',
      operation: 'create',
      payload: p as unknown as Record<string, unknown>,
    })
  },
  async update(p: PaymentLog, opts?: { queuedBy?: string }): Promise<void> {
    if (currentBackend() === 'postgres') {
      const sql = getSql()
      const auditLog = ((p as unknown as { auditLog?: unknown[] }).auditLog ?? []) as never
      await sql`
        UPDATE payment_logs SET
          date = ${p.date}, amount = ${p.amount}, mode = ${p.mode ?? null},
          reference = ${p.reference ?? null}, narration = ${p.narration ?? null},
          sales_person_id = ${p.salesPersonId ?? null},
          matched_installment_ids = ${sql.json((p.matchedInstallmentIds ?? []) as never)}::jsonb,
          unmatched = ${!!p.unmatched},
          audit_log = ${sql.json(auditLog)}::jsonb
        WHERE id = ${p.id}
      `
      return
    }
    await enqueueUpdate({
      queuedBy: opts?.queuedBy ?? 'system',
      entity: 'paymentLog',
      operation: 'update',
      payload: p as unknown as Record<string, unknown>,
    })
  },
  async appendAudit(id: string, entry: AuditEntry): Promise<void> {
    if (currentBackend() === 'postgres') {
      const sql = getSql()
      await sql`
        UPDATE payment_logs SET audit_log = audit_log || ${sql.json([entry] as never)}::jsonb
        WHERE id = ${id}
      `
    }
  },
}

// adjustment: financial-ledger record. create() only (immutable except status).
export const adjustmentRepo = {
  async findAll(): Promise<Adjustment[]> {
    if (currentBackend() === 'postgres') {
      const sql = getSql()
      const rows = await sql<Row[]>`SELECT * FROM adjustments ORDER BY id`
      return rows.map((r) => mapRow<Adjustment>(r, new Set([
        'amount_delta', 'before_amount', 'after_amount',
      ])))
    }
    return adjustmentsJson as unknown[] as Adjustment[]
  },
  async findById(id: string): Promise<Adjustment | null> {
    if (currentBackend() === 'postgres') {
      const sql = getSql()
      const rows = await sql<Row[]>`SELECT * FROM adjustments WHERE id = ${id}`
      return rows[0] ? mapRow<Adjustment>(rows[0], new Set(['amount_delta', 'before_amount', 'after_amount'])) : null
    }
    return ((adjustmentsJson as unknown[] as Adjustment[]).find((a) => a.id === id)) ?? null
  },
  async create(a: Adjustment, opts?: { queuedBy?: string }): Promise<void> {
    if (currentBackend() === 'postgres') {
      const sql = getSql()
      await sql`
        INSERT INTO adjustments (id, mou_id, school_id, triggered_by_event,
          triggered_at, triggered_by, original_installment_id,
          applied_to_installment_id, amount_delta, reason,
          before_amount, after_amount, status)
        VALUES (
          ${a.id}, ${a.mouId}, ${a.schoolId}, ${a.triggeredByEvent},
          ${a.triggeredAt}, ${a.triggeredBy ?? null},
          ${a.originalInstallmentId}, ${a.appliedToInstallmentId ?? null},
          ${a.amountDelta}, ${a.reason ?? null},
          ${a.beforeAmount}, ${a.afterAmount}, ${a.status}
        )
      `
      return
    }
    await enqueueUpdate({
      queuedBy: opts?.queuedBy ?? 'system',
      entity: 'adjustment',
      operation: 'create',
      payload: a as unknown as Record<string, unknown>,
    })
  },
  async update(a: Adjustment, opts?: { queuedBy?: string }): Promise<void> {
    if (currentBackend() === 'postgres') {
      const sql = getSql()
      await sql`
        UPDATE adjustments SET
          status = ${a.status},
          reason = ${a.reason ?? null},
          applied_to_installment_id = ${a.appliedToInstallmentId ?? null}
        WHERE id = ${a.id}
      `
      return
    }
    await enqueueUpdate({
      queuedBy: opts?.queuedBy ?? 'system',
      entity: 'adjustment',
      operation: 'update',
      payload: a as unknown as Record<string, unknown>,
    })
  },
}

export const dispatchRequestRepo = makeLeafRepo({
  table: 'dispatch_requests',
  json: dispatchRequestsJson as unknown[] as Row[],
})

export const intakeRecordRepo = makeLeafRepo({
  table: 'intake_records',
  json: intakeRecordsJson as unknown[] as Row[],
})

export const communicationRepo = makeLeafRepo({
  table: 'communications',
  json: communicationsJson as unknown[] as Row[],
})

// magicLinkToken: short-lived auth primitive. create() + update() for
// usage tracking (status-view increments view_count; feedback-submit
// flips used_at + used_by_ip).
export const magicLinkTokenRepo = {
  async findAll(): Promise<MagicLinkToken[]> {
    if (currentBackend() === 'postgres') {
      const sql = getSql()
      const rows = await sql<Row[]>`SELECT * FROM magic_link_tokens ORDER BY id`
      return rows.map((r) => mapRow<MagicLinkToken>(r))
    }
    return magicLinkTokensJson as unknown[] as MagicLinkToken[]
  },
  async findById(id: string): Promise<MagicLinkToken | null> {
    if (currentBackend() === 'postgres') {
      const sql = getSql()
      const rows = await sql<Row[]>`SELECT * FROM magic_link_tokens WHERE id = ${id}`
      return rows[0] ? mapRow<MagicLinkToken>(rows[0]) : null
    }
    return ((magicLinkTokensJson as unknown[] as MagicLinkToken[]).find((t) => t.id === id)) ?? null
  },
  async create(t: MagicLinkToken, opts?: { queuedBy?: string }): Promise<void> {
    if (currentBackend() === 'postgres') {
      const sql = getSql()
      await sql`
        INSERT INTO magic_link_tokens (id, purpose, mou_id, instalment_seq,
          spoc_email, issued_at, expires_at, used_at, used_by_ip,
          last_viewed_at, view_count, communication_id)
        VALUES (
          ${t.id}, ${t.purpose}, ${t.mouId}, ${t.installmentSeq},
          ${t.spocEmail ?? null}, ${t.issuedAt}, ${t.expiresAt},
          ${t.usedAt ?? null}, ${t.usedByIp ?? null},
          ${t.lastViewedAt ?? null}, ${t.viewCount ?? 0},
          ${t.communicationId ?? null}
        )
      `
      return
    }
    await enqueueUpdate({
      queuedBy: opts?.queuedBy ?? 'system',
      entity: 'magicLinkToken',
      operation: 'create',
      payload: t as unknown as Record<string, unknown>,
    })
  },
  async update(t: MagicLinkToken, opts?: { queuedBy?: string }): Promise<void> {
    if (currentBackend() === 'postgres') {
      const sql = getSql()
      await sql`
        UPDATE magic_link_tokens SET
          used_at = ${t.usedAt ?? null},
          used_by_ip = ${t.usedByIp ?? null},
          last_viewed_at = ${t.lastViewedAt ?? null},
          view_count = ${t.viewCount ?? 0}
        WHERE id = ${t.id}
      `
      return
    }
    await enqueueUpdate({
      queuedBy: opts?.queuedBy ?? 'system',
      entity: 'magicLinkToken',
      operation: 'update',
      payload: t as unknown as Record<string, unknown>,
    })
  },
}

export const feedbackRepo = makeLeafRepo({
  table: 'feedback',
  json: feedbackJson as unknown[] as Row[],
})

// vexDispatch: VEX kit dispatch ledger. JSONB items + audit_log.
export const vexDispatchRepo = {
  async findAll(): Promise<VexDispatch[]> {
    if (currentBackend() === 'postgres') {
      const sql = getSql()
      const rows = await sql<Row[]>`SELECT * FROM vex_dispatches ORDER BY id`
      return rows.map((r) => mapRow<VexDispatch>(r, new Set(['freight'])))
    }
    return vexDispatchesJson as unknown[] as VexDispatch[]
  },
  async findById(id: string): Promise<VexDispatch | null> {
    if (currentBackend() === 'postgres') {
      const sql = getSql()
      const rows = await sql<Row[]>`SELECT * FROM vex_dispatches WHERE id = ${id}`
      return rows[0] ? mapRow<VexDispatch>(rows[0], new Set(['freight'])) : null
    }
    return ((vexDispatchesJson as unknown[] as VexDispatch[]).find((d) => d.id === id)) ?? null
  },
  async create(d: VexDispatch, opts?: { queuedBy?: string }): Promise<void> {
    if (currentBackend() === 'postgres') {
      const sql = getSql()
      await sql`
        INSERT INTO vex_dispatches (id, pi_id, items, freight, mode, status,
          requested_by, requested_at, tax_invoice_number, tax_invoice_path,
          invoiced_at, notes, supporting_doc_path, warehouse_email_sent_at,
          warehouse_email_sent_by, audit_log)
        VALUES (
          ${d.id}, ${d.piId},
          ${sql.json((d.items ?? []) as never)}::jsonb,
          ${d.freight ?? null}, ${d.mode ?? null}, ${d.status ?? null},
          ${d.requestedBy ?? null}, ${d.requestedAt ?? null},
          ${d.taxInvoiceNumber ?? null}, ${d.taxInvoicePath ?? null},
          ${d.invoicedAt ?? null}, ${d.notes ?? null},
          ${d.supportingDocPath ?? null},
          ${d.warehouseEmailSentAt ?? null}, ${d.warehouseEmailSentBy ?? null},
          ${sql.json((d.auditLog ?? []) as never)}::jsonb
        )
      `
      return
    }
    await enqueueUpdate({
      queuedBy: opts?.queuedBy ?? 'system',
      entity: 'vexDispatch',
      operation: 'create',
      payload: d as unknown as Record<string, unknown>,
    })
  },
  async update(d: VexDispatch, opts?: { queuedBy?: string }): Promise<void> {
    if (currentBackend() === 'postgres') {
      const sql = getSql()
      await sql`
        UPDATE vex_dispatches SET
          items = ${sql.json((d.items ?? []) as never)}::jsonb,
          freight = ${d.freight ?? null}, mode = ${d.mode ?? null},
          status = ${d.status ?? null},
          tax_invoice_number = ${d.taxInvoiceNumber ?? null},
          tax_invoice_path = ${d.taxInvoicePath ?? null},
          invoiced_at = ${d.invoicedAt ?? null}, notes = ${d.notes ?? null},
          supporting_doc_path = ${d.supportingDocPath ?? null},
          warehouse_email_sent_at = ${d.warehouseEmailSentAt ?? null},
          warehouse_email_sent_by = ${d.warehouseEmailSentBy ?? null},
          audit_log = ${sql.json((d.auditLog ?? []) as never)}::jsonb
        WHERE id = ${d.id}
      `
      return
    }
    await enqueueUpdate({
      queuedBy: opts?.queuedBy ?? 'system',
      entity: 'vexDispatch',
      operation: 'update',
      payload: d as unknown as Record<string, unknown>,
    })
  },
  async appendAudit(id: string, entry: AuditEntry): Promise<void> {
    if (currentBackend() === 'postgres') {
      const sql = getSql()
      await sql`
        UPDATE vex_dispatches SET audit_log = audit_log || ${sql.json([entry] as never)}::jsonb
        WHERE id = ${id}
      `
    }
  },
  async updatePartial(
    id: string,
    patch: Partial<VexDispatch>,
    opts?: { queuedBy?: string },
  ): Promise<void> {
    if (currentBackend() === 'postgres') {
      const sql = getSql()
      const CAMEL_TO_SNAKE: Record<string, string> = {
        piId: 'pi_id', freight: 'freight', mode: 'mode', status: 'status',
        requestedBy: 'requested_by', requestedAt: 'requested_at',
        taxInvoiceNumber: 'tax_invoice_number',
        taxInvoicePath: 'tax_invoice_path', invoicedAt: 'invoiced_at',
        notes: 'notes', supportingDocPath: 'supporting_doc_path',
        warehouseEmailSentAt: 'warehouse_email_sent_at',
        warehouseEmailSentBy: 'warehouse_email_sent_by',
      }
      const JSONB_COLS = new Set(['items'])
      const setObj: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(patch)) {
        if (k === 'id' || k === 'auditLog') continue
        if (k === 'items') {
          setObj['items'] = v == null ? null : sql.json(v as never)
          continue
        }
        const col = CAMEL_TO_SNAKE[k]
        if (!col) continue
        setObj[col] = v ?? null
        void JSONB_COLS
      }
      if (Object.keys(setObj).length === 0) return
      await sql`UPDATE vex_dispatches SET ${sql(setObj)} WHERE id = ${id}`
      return
    }
    const cur = (vexDispatchesJson as unknown[] as VexDispatch[]).find((d) => d.id === id)
    if (!cur) return
    await enqueueUpdate({
      queuedBy: opts?.queuedBy ?? 'system',
      entity: 'vexDispatch',
      operation: 'update',
      payload: { ...cur, ...patch } as unknown as Record<string, unknown>,
    })
  },
  async updateWithAudit(
    id: string,
    patch: Partial<VexDispatch>,
    audit: AuditEntry,
    opts?: { queuedBy?: string },
  ): Promise<void> {
    if (currentBackend() === 'postgres') {
      await this.updatePartial(id, patch, opts)
      await this.appendAudit(id, audit)
      return
    }
    const cur = (vexDispatchesJson as unknown[] as VexDispatch[]).find((d) => d.id === id)
    if (!cur) return
    await enqueueUpdate({
      queuedBy: opts?.queuedBy ?? 'system',
      entity: 'vexDispatch',
      operation: 'update',
      payload: {
        ...cur, ...patch,
        auditLog: [...(cur.auditLog ?? []), audit],
      } as unknown as Record<string, unknown>,
    })
  },
}

export const vexOrderRepo = makeLeafRepo({
  table: 'vex_orders',
  json: vexOrdersJson as unknown[] as Row[],
})

// agreement: vendor / NDA registry. JSONB audit_log.
export const agreementRepo = {
  async findAll(): Promise<Agreement[]> {
    if (currentBackend() === 'postgres') {
      const sql = getSql()
      const rows = await sql<Row[]>`SELECT * FROM agreements ORDER BY id`
      return rows.map((r) => mapRow<Agreement>(r))
    }
    return agreementsJson as unknown[] as Agreement[]
  },
  async findById(id: string): Promise<Agreement | null> {
    if (currentBackend() === 'postgres') {
      const sql = getSql()
      const rows = await sql<Row[]>`SELECT * FROM agreements WHERE id = ${id}`
      return rows[0] ? mapRow<Agreement>(rows[0]) : null
    }
    return ((agreementsJson as unknown[] as Agreement[]).find((a) => a.id === id)) ?? null
  },
  async create(a: Agreement, opts?: { queuedBy?: string }): Promise<void> {
    if (currentBackend() === 'postgres') {
      const sql = getSql()
      await sql`
        INSERT INTO agreements (id, type, party_name, vendor_id,
          nature_of_agreement, product, department, key_terms,
          start_date, end_date, tenure, notice_period, vendor_location,
          physical_custody, document_url, days_to_expiry, audit_log)
        VALUES (
          ${a.id}, ${a.type}, ${a.partyName ?? null}, ${a.vendorId ?? null},
          ${a.natureOfAgreement ?? null}, ${a.product ?? null},
          ${a.department ?? null}, ${a.keyTerms ?? null},
          ${a.startDate || null}, ${a.endDate ?? null},
          ${a.tenure ?? null}, ${a.noticePeriod ?? null},
          ${a.vendorLocation ?? null}, ${a.physicalCustody ?? null},
          ${a.documentUrl ?? null}, ${a.daysToExpiry ?? null},
          ${sql.json((a.auditLog ?? []) as never)}::jsonb
        )
      `
      return
    }
    await enqueueUpdate({
      queuedBy: opts?.queuedBy ?? 'system',
      entity: 'agreement',
      operation: 'create',
      payload: a as unknown as Record<string, unknown>,
    })
  },
  async update(a: Agreement, opts?: { queuedBy?: string }): Promise<void> {
    if (currentBackend() === 'postgres') {
      const sql = getSql()
      await sql`
        UPDATE agreements SET
          type = ${a.type}, party_name = ${a.partyName ?? null},
          vendor_id = ${a.vendorId ?? null},
          nature_of_agreement = ${a.natureOfAgreement ?? null},
          product = ${a.product ?? null}, department = ${a.department ?? null},
          key_terms = ${a.keyTerms ?? null},
          start_date = ${a.startDate || null}, end_date = ${a.endDate ?? null},
          tenure = ${a.tenure ?? null}, notice_period = ${a.noticePeriod ?? null},
          vendor_location = ${a.vendorLocation ?? null},
          physical_custody = ${a.physicalCustody ?? null},
          document_url = ${a.documentUrl ?? null},
          days_to_expiry = ${a.daysToExpiry ?? null},
          audit_log = ${sql.json((a.auditLog ?? []) as never)}::jsonb
        WHERE id = ${a.id}
      `
      return
    }
    await enqueueUpdate({
      queuedBy: opts?.queuedBy ?? 'system',
      entity: 'agreement',
      operation: 'update',
      payload: a as unknown as Record<string, unknown>,
    })
  },
  async appendAudit(id: string, entry: AuditEntry): Promise<void> {
    if (currentBackend() === 'postgres') {
      const sql = getSql()
      await sql`
        UPDATE agreements SET audit_log = audit_log || ${sql.json([entry] as never)}::jsonb
        WHERE id = ${id}
      `
    }
  },
  /**
   * Partial-field update. Same atomic-friendly pattern as
   * mouRepo.updatePartial: in postgres mode, UPDATEs ONLY the listed
   * scalar/JSONB columns (touching audit_log only when explicitly
   * passed). In json mode, reads + merges + enqueues a full payload
   * (drainer semantics unchanged).
   *
   * Pair with appendAudit() to close the JSONB RMW race: two parallel
   * callers no longer collide because (a) updatePartial only touches
   * the patched columns, and (b) appendAudit uses server-side
   * audit_log || concat.
   */
  async updatePartial(
    id: string,
    patch: Partial<Agreement>,
    opts?: { queuedBy?: string },
  ): Promise<void> {
    if (currentBackend() === 'postgres') {
      const sql = getSql()
      const CAMEL_TO_SNAKE: Record<string, string> = {
        type: 'type', partyName: 'party_name', vendorId: 'vendor_id',
        natureOfAgreement: 'nature_of_agreement', product: 'product',
        department: 'department', keyTerms: 'key_terms',
        startDate: 'start_date', endDate: 'end_date', tenure: 'tenure',
        noticePeriod: 'notice_period', vendorLocation: 'vendor_location',
        physicalCustody: 'physical_custody', documentUrl: 'document_url',
        daysToExpiry: 'days_to_expiry',
      }
      const setObj: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(patch)) {
        if (k === 'id' || k === 'auditLog') continue
        const col = CAMEL_TO_SNAKE[k]
        if (!col) continue
        setObj[col] = v ?? null
      }
      if (Object.keys(setObj).length === 0) return
      await sql`UPDATE agreements SET ${sql(setObj)} WHERE id = ${id}`
      return
    }
    const cur = (agreementsJson as unknown[] as Agreement[]).find((a) => a.id === id)
    if (!cur) return
    await enqueueUpdate({
      queuedBy: opts?.queuedBy ?? 'system',
      entity: 'agreement',
      operation: 'update',
      payload: { ...cur, ...patch } as unknown as Record<string, unknown>,
    })
  },
  /**
   * Atomic update + audit in one call. See mouRepo.updateWithAudit
   * for full pattern docs.
   */
  async updateWithAudit(
    id: string,
    patch: Partial<Agreement>,
    audit: AuditEntry,
    opts?: { queuedBy?: string },
  ): Promise<void> {
    if (currentBackend() === 'postgres') {
      await this.updatePartial(id, patch, opts)
      await this.appendAudit(id, audit)
      return
    }
    const cur = (agreementsJson as unknown[] as Agreement[]).find((a) => a.id === id)
    if (!cur) return
    await enqueueUpdate({
      queuedBy: opts?.queuedBy ?? 'system',
      entity: 'agreement',
      operation: 'update',
      payload: {
        ...cur, ...patch,
        auditLog: [...(cur.auditLog ?? []), audit],
      } as unknown as Record<string, unknown>,
    })
  },
}

export const salesOpportunityRepo = makeLeafRepo({
  table: 'sales_opportunities',
  json: salesOpportunitiesJson as unknown[] as Row[],
})

// homepage_action_log: composite PK (date, user_id, item_id) - no `id`.
// findAll orders by date then item_id for stability; findByKey is not
// exposed since the entity is append-only and never randomly read.
export const homepageActionLogRepo = {
  async findAll(): Promise<Row[]> {
    if (currentBackend() === 'postgres') {
      const sql = getSql()
      const rows = await sql<Row[]>`
        SELECT * FROM homepage_action_log ORDER BY date, user_id, item_id
      `
      return rows.map((r) => mapRow<Row>(r))
    }
    return homepageActionLogJson as unknown[] as Row[]
  },
}

// ---------------------------------------------------------------------------
// Non-array or non-standard-PK leaf entities (5 of 24)
// ---------------------------------------------------------------------------

// mou_import_review: array shape; PK is `queued_at`
export const mouImportReviewRepo = makeLeafRepo({
  table: 'mou_import_review',
  json: mouImportReviewJson as unknown[] as Row[],
  idColumn: 'queued_at',
  orderBy: 'queued_at',
})

// sync_health: BIGSERIAL id; ordered by 'at' for stability
export const syncHealthRepo = makeLeafRepo({
  table: 'sync_health',
  json: syncHealthJson as unknown[] as Row[],
  orderBy: 'at',
})

// lifecycle_rules: composite PK (stage_from_key, stage_to_key)
export const lifecycleRuleRepo = {
  async findAll(): Promise<Row[]> {
    if (currentBackend() === 'postgres') {
      const sql = getSql()
      const rows = await sql<Row[]>`
        SELECT * FROM lifecycle_rules ORDER BY stage_from_key, stage_to_key
      `
      return rows.map((r) => mapRow<Row>(r))
    }
    return lifecycleRulesJson as unknown[] as Row[]
  },
  async findByKey(stageFromKey: string, stageToKey: string): Promise<Row | null> {
    if (currentBackend() === 'postgres') {
      const sql = getSql()
      const rows = await sql<Row[]>`
        SELECT * FROM lifecycle_rules
        WHERE stage_from_key = ${stageFromKey} AND stage_to_key = ${stageToKey}
      `
      return rows[0] ? mapRow<Row>(rows[0]) : null
    }
    return (
      (lifecycleRulesJson as unknown[] as Row[]).find(
        (r) => r.stageFromKey === stageFromKey && r.stageToKey === stageToKey,
      ) ?? null
    )
  },
}

// stage_responsibility: PK is `stage`
export const stageResponsibilityRepo = makeLeafRepo({
  table: 'stage_responsibility',
  json: stageResponsibilityJson as unknown[] as Row[],
  idColumn: 'stage',
  orderBy: 'stage',
})

// signed_values: PK is `mou_id`
export const signedValueRepo = makeLeafRepo({
  table: 'signed_values',
  json: signedValuesJson as unknown[] as Row[],
  idColumn: 'mou_id',
  orderBy: 'mou_id',
  numericCols: new Set(['price_per_student']),
})

// reminder_thresholds: JSON is keyed-by-kind object; postgres is one row per kind.
// Adapter on findAll emits row[] from both backends for parity comparison.
export const reminderThresholdRepo = {
  async findAll(): Promise<Row[]> {
    if (currentBackend() === 'postgres') {
      const sql = getSql()
      const rows = await sql<Row[]>`SELECT * FROM reminder_thresholds ORDER BY kind`
      return rows.map((r) => mapRow<Row>(r))
    }
    const obj = reminderThresholdsJson as unknown as Record<string, Row>
    return Object.entries(obj).map(([kind, row]) => ({ kind, ...row }))
  },
  async findByKind(kind: string): Promise<Row | null> {
    const all = await this.findAll()
    return all.find((r) => r.kind === kind) ?? null
  },
}

// chain_dismissals: JSON has { _comment, dismissedSchoolIds: string[] };
// postgres is one row per dismissed schoolId.
// Adapter normalises to row[] of { schoolId } for parity comparison on findAll.
export const chainDismissalRepo = {
  async findAll(): Promise<Row[]> {
    if (currentBackend() === 'postgres') {
      const sql = getSql()
      const rows = await sql<Row[]>`SELECT * FROM chain_dismissals ORDER BY school_id`
      return rows.map((r) => mapRow<Row>(r))
    }
    const obj = chainDismissalsJson as unknown as { dismissedSchoolIds?: string[] }
    return (obj.dismissedSchoolIds ?? []).map((schoolId) => ({ schoolId }))
  },
  async isDismissed(schoolId: string): Promise<boolean> {
    const all = await this.findAll()
    return all.some((r) => r.schoolId === schoolId)
  },
}
