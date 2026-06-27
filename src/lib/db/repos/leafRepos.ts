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
  Adjustment, Agreement, AuditEntry, Feedback, MagicLinkToken, PaymentLog,
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

/**
 * Audited-leaf-repo factory (P2b). Extends makeLeafRepo with the
 * atomic write surface (updatePartial / updateWithAudit / appendAudit)
 * that libs migrating from deps.enqueue can call directly.
 *
 * cfg.camelToSnake: per-entity column rename map for snake_case
 * cfg.jsonbCols: column names that need sql.json() wrapping
 * cfg.entity: PendingUpdateEntity for the json-mode enqueue fallback
 */
interface AuditedLeafConfig<T> extends LeafConfig<T> {
  entity: string
  camelToSnake: Record<string, string>
  jsonbCols?: ReadonlySet<string>
}

function makeAuditedLeafRepo<T extends { id?: string; auditLog?: AuditEntry[] }>(
  cfg: AuditedLeafConfig<T>,
) {
  const base = makeLeafRepo<T>(cfg)
  const jsonbCols = cfg.jsonbCols ?? new Set<string>()
  return {
    ...base,
    /**
     * Insert a new row. In postgres mode this builds the INSERT from the
     * same camelToSnake + jsonbCols config that drives updatePartial
     * (proven row-building), so every audited-leaf entity gets a working
     * create without a bespoke INSERT each. The id column and audit_log
     * are always included; `version` is omitted so the DB default applies.
     * json mode enqueues a create (drainer-shape unchanged).
     *
     * Without this, dispatchToRepo threw on create for these entities and
     * the write fell into the disabled-cron dead-letter queue: silent loss.
     */
    async create(entity: T, opts?: { queuedBy?: string }): Promise<void> {
      if (currentBackend() === 'postgres') {
        const sql = getSql()
        const e = entity as Row
        const row: Record<string, unknown> = {}
        const idCol = cfg.idColumn ?? 'id'
        if (e.id !== undefined) row[idCol] = e.id
        for (const [camel, col] of Object.entries(cfg.camelToSnake)) {
          const v = e[camel]
          if (v === undefined) continue
          row[col] = jsonbCols.has(camel) ? (v == null ? null : sql.json(v as never)) : (v ?? null)
        }
        row['audit_log'] = sql.json(((e.auditLog as unknown[]) ?? []) as never)
        await sql`INSERT INTO ${sql(cfg.table)} ${sql(row)}`
        return
      }
      await enqueueUpdate({
        queuedBy: opts?.queuedBy ?? 'system',
        entity: cfg.entity as never,
        operation: 'create',
        payload: entity as unknown as Record<string, unknown>,
      })
    },
    async appendAudit(id: string, entry: AuditEntry, opts?: { queuedBy?: string }): Promise<void> {
      if (currentBackend() === 'postgres') {
        const sql = getSql()
        await sql`
          UPDATE ${sql(cfg.table)} SET audit_log = audit_log || ${sql.json([entry] as never)}::jsonb
          WHERE id = ${id}
        `
        return
      }
      const cur = (cfg.json as Row[]).find((r) => r.id === id) as T | undefined
      if (!cur) return
      const updated = { ...cur, auditLog: [...(cur.auditLog ?? []), entry] }
      await enqueueUpdate({
        queuedBy: opts?.queuedBy ?? 'system',
        entity: cfg.entity as never,
        operation: 'update',
        payload: updated as unknown as Record<string, unknown>,
      })
    },
    async updatePartial(
      id: string,
      patch: Partial<T>,
      opts?: { queuedBy?: string },
    ): Promise<void> {
      if (currentBackend() === 'postgres') {
        const sql = getSql()
        const setObj: Record<string, unknown> = {}
        for (const [k, v] of Object.entries(patch)) {
          if (k === 'id' || k === 'auditLog') continue
          const col = cfg.camelToSnake[k]
          if (!col) continue
          if (jsonbCols.has(k)) {
            setObj[col] = v == null ? null : sql.json(v as never)
          } else {
            setObj[col] = v ?? null
          }
        }
        if (Object.keys(setObj).length === 0) return
        await sql`UPDATE ${sql(cfg.table)} SET ${sql(setObj)} WHERE id = ${id}`
        return
      }
      const cur = (cfg.json as Row[]).find((r) => r.id === id) as T | undefined
      if (!cur) return
      await enqueueUpdate({
        queuedBy: opts?.queuedBy ?? 'system',
        entity: cfg.entity as never,
        operation: 'update',
        payload: { ...cur, ...patch } as unknown as Record<string, unknown>,
      })
    },
    async updateWithAudit(
      id: string,
      patch: Partial<T>,
      audit: AuditEntry,
      opts?: { queuedBy?: string },
    ): Promise<void> {
      if (currentBackend() === 'postgres') {
        await this.updatePartial(id, patch, opts)
        await this.appendAudit(id, audit, opts)
        return
      }
      const cur = (cfg.json as Row[]).find((r) => r.id === id) as T | undefined
      if (!cur) return
      await enqueueUpdate({
        queuedBy: opts?.queuedBy ?? 'system',
        entity: cfg.entity as never,
        operation: 'update',
        payload: {
          ...cur, ...patch,
          auditLog: [...(cur.auditLog ?? []), audit],
        } as unknown as Record<string, unknown>,
      })
    },
    /**
     * P2b.X OCC (2026-05-24): version-checked atomic update + audit
     * append. For REPLACE-on-update form-submit fields where two
     * editors can clobber each other silently. The caller supplies
     * the version they loaded; we UPDATE only if the row still has
     * that version, bumping on success.
     *
     * Returns `{ok:true, newVersion}` if the conditional UPDATE
     * matched 1 row (RETURNING), else `{ok:false, conflictVersion}`
     * read from a follow-up SELECT so the route can surface a 409.
     *
     * Requires the table to have a `version INTEGER NOT NULL DEFAULT 1`
     * column. Audit + scalar/JSONB updates land in the same UPDATE
     * statement; on conflict NOTHING lands (the loser's audit is NOT
     * recorded - correct: their write didn't happen).
     *
     * Json mode: enqueues a full payload through the same shape.
     */
    async updateWithAuditOCC(
      id: string,
      expectedVersion: number,
      patch: Partial<T>,
      audit: AuditEntry,
      opts?: { queuedBy?: string },
    ): Promise<{ ok: true; newVersion: number } | { ok: false; conflictVersion: number }> {
      if (currentBackend() === 'postgres') {
        const sql = getSql()
        const setObj: Record<string, unknown> = {}
        for (const [k, v] of Object.entries(patch)) {
          if (k === 'id' || k === 'auditLog' || k === 'version') continue
          const col = cfg.camelToSnake[k]
          if (!col) continue
          if (jsonbCols.has(k)) {
            setObj[col] = v == null ? null : sql.json(v as never)
          } else {
            setObj[col] = v ?? null
          }
        }
        // Always include audit_log and version updates; scalar patch
        // may be empty (e.g., audit-only retry from UI), still OCC-checked.
        const rows = await sql<{ version: number }[]>`
          UPDATE ${sql(cfg.table)} SET
            ${Object.keys(setObj).length > 0 ? sql`${sql(setObj)},` : sql``}
            audit_log = audit_log || ${sql.json([audit] as never)}::jsonb,
            version = version + 1
          WHERE id = ${id} AND version = ${expectedVersion}
          RETURNING version
        `
        if (rows.length === 1) {
          return { ok: true, newVersion: rows[0]!.version }
        }
        const cur = await sql<{ version: number }[]>`
          SELECT version FROM ${sql(cfg.table)} WHERE id = ${id}
        `
        return { ok: false, conflictVersion: cur[0]?.version ?? -1 }
      }
      // json mode: in-memory version compare + queue enqueue.
      const cur = (cfg.json as Row[]).find((r) => r.id === id) as (T & { version?: number }) | undefined
      if (!cur) return { ok: false, conflictVersion: -1 }
      const curVersion = cur.version ?? 1
      if (curVersion !== expectedVersion) {
        return { ok: false, conflictVersion: curVersion }
      }
      const merged = {
        ...cur, ...patch,
        auditLog: [...((cur.auditLog as AuditEntry[]) ?? []), audit],
        version: curVersion + 1,
      }
      await enqueueUpdate({
        queuedBy: opts?.queuedBy ?? 'system',
        entity: cfg.entity as never,
        operation: 'update',
        payload: merged as unknown as Record<string, unknown>,
      })
      return { ok: true, newVersion: curVersion + 1 }
    },
  }
}

// ---------------------------------------------------------------------------
// Standard array-shaped, id-keyed leaf entities (15 of 24)
// ---------------------------------------------------------------------------

export const communicationTemplateRepo = makeAuditedLeafRepo({
  table: 'communication_templates',
  json: communicationTemplatesJson as unknown[] as Row[],
  entity: 'communicationTemplate',
  camelToSnake: {
    name: 'name', useCase: 'use_case', subject: 'subject',
    bodyMarkdown: 'body_markdown', defaultRecipient: 'default_recipient',
    defaultCcRules: 'default_cc_rules', variables: 'variables',
    lastEditedBy: 'last_edited_by', lastEditedAt: 'last_edited_at',
    active: 'active',
  },
  jsonbCols: new Set(['defaultCcRules', 'variables']),
})

export const ccRuleRepo = makeAuditedLeafRepo({
  table: 'cc_rules',
  json: ccRulesJson as unknown[] as Row[],
  entity: 'ccRule',
  camelToSnake: {
    sheet: 'sheet', scope: 'scope', scopeValue: 'scope_value',
    contexts: 'contexts', ccUserIds: 'cc_user_ids',
    enabled: 'enabled', sourceRuleText: 'source_rule_text',
    disabledAt: 'disabled_at', disabledBy: 'disabled_by',
    disabledReason: 'disabled_reason',
  },
  jsonbCols: new Set(['contexts', 'ccUserIds']),
})

export const schoolGroupRepo = makeAuditedLeafRepo({
  table: 'school_groups',
  json: schoolGroupsJson as unknown[] as Row[],
  entity: 'schoolGroup',
  camelToSnake: {
    name: 'name', region: 'region', memberSchoolIds: 'member_school_ids',
    groupMouId: 'group_mou_id', notes: 'notes',
    primaryContact: 'primary_contact', primaryEmail: 'primary_email',
    primaryPhone: 'primary_phone', gstNumber: 'gst_number',
  },
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
  // void: soft-delete tombstone (Pass 1, migration 020). Sets voided_at/by +
  // reason and appends an audit entry. The row is KEPT; callers reverse the
  // log's balance effect (decrement the VexPi / require the instalment
  // unmatched) BEFORE calling this. Never a hard DELETE.
  async void(
    id: string,
    args: { voidedAt: string; voidedBy: string; voidReason: string; audit: AuditEntry },
  ): Promise<void> {
    if (currentBackend() === 'postgres') {
      const sql = getSql()
      await sql`
        UPDATE payment_logs SET
          voided_at = ${args.voidedAt},
          voided_by = ${args.voidedBy},
          void_reason = ${args.voidReason},
          audit_log = audit_log || ${sql.json([args.audit] as never)}::jsonb
        WHERE id = ${id}
      `
      return
    }
    const log = (paymentLogsJson as unknown[] as PaymentLog[]).find((p) => p.id === id)
    if (!log) return
    const updated: PaymentLog = {
      ...log,
      voidedAt: args.voidedAt,
      voidedBy: args.voidedBy,
      voidReason: args.voidReason,
      auditLog: [...(log.auditLog ?? []), args.audit],
    }
    await enqueueUpdate({
      queuedBy: args.voidedBy,
      entity: 'paymentLog',
      operation: 'update',
      payload: updated as unknown as Record<string, unknown>,
    })
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

export const dispatchRequestRepo = makeAuditedLeafRepo({
  table: 'dispatch_requests',
  json: dispatchRequestsJson as unknown[] as Row[],
  entity: 'dispatchRequest',
  camelToSnake: {
    mouId: 'mou_id', schoolId: 'school_id', requestedBy: 'requested_by',
    requestedAt: 'requested_at', requestReason: 'request_reason',
    instalmentSeq: 'instalment_seq', lineItems: 'line_items', status: 'status',
    conversionDispatchId: 'conversion_dispatch_id',
    rejectionReason: 'rejection_reason', reviewedBy: 'reviewed_by',
    reviewedAt: 'reviewed_at', notes: 'notes',
  },
  jsonbCols: new Set(['lineItems']),
})

export const intakeRecordRepo = makeAuditedLeafRepo({
  table: 'intake_records',
  json: intakeRecordsJson as unknown[] as Row[],
  entity: 'intakeRecord',
  camelToSnake: {
    mouId: 'mou_id', completedAt: 'completed_at',
    completedBy: 'completed_by', salesOwnerId: 'sales_owner_id',
    location: 'location', grades: 'grades',
    recipientName: 'recipient_name',
    recipientDesignation: 'recipient_designation',
    recipientEmail: 'recipient_email',
    studentsAtIntake: 'students_at_intake',
    durationYears: 'duration_years',
    startDate: 'start_date', endDate: 'end_date',
    physicalSubmissionStatus: 'physical_submission_status',
    softCopySubmissionStatus: 'soft_copy_submission_status',
    productConfirmed: 'product_confirmed',
    gslTrainingMode: 'gsl_training_mode',
    schoolPointOfContactName: 'school_point_of_contact_name',
    schoolPointOfContactPhone: 'school_point_of_contact_phone',
    signedMouUrl: 'signed_mou_url',
    thankYouEmailSentAt: 'thank_you_email_sent_at',
    gradeBreakdown: 'grade_breakdown',
    rechargeableBatteries: 'rechargeable_batteries',
  },
  jsonbCols: new Set(['grades', 'gradeBreakdown']),
})

export const communicationRepo = makeAuditedLeafRepo({
  table: 'communications',
  json: communicationsJson as unknown[] as Row[],
  entity: 'communication',
  camelToSnake: {
    type: 'type', schoolId: 'school_id', mouId: 'mou_id',
    instalmentSeq: 'instalment_seq', channel: 'channel',
    subject: 'subject', bodyEmail: 'body_email',
    bodyWhatsApp: 'body_whats_app',
    toEmail: 'to_email', toPhone: 'to_phone',
    ccEmails: 'cc_emails', queuedAt: 'queued_at',
    queuedBy: 'queued_by', sentAt: 'sent_at',
    copiedAt: 'copied_at', status: 'status',
    bounceDetail: 'bounce_detail',
  },
  jsonbCols: new Set(['ccEmails']),
})

// magicLinkToken: short-lived auth primitive. create() + update() for
// usage tracking (status-view increments view_count; feedback-submit
// flips used_at + used_by_ip).
//
// P3 OCC trace 2026-05-24: view_count is a non-billing counter; two
// simultaneous status-view clicks on the same magic link race the
// increment and produce an off-by-one (e.g., count goes 3 -> 4
// instead of 3 -> 5). This is a DELIBERATE ACCEPT, not an oversight:
//   - view_count is not security-relevant (auth gating is on
//     used_at / expires_at, not on count).
//   - off-by-one in an audit-trail counter has zero material impact.
//   - the writers (status-view route, feedback-submit) are single-click
//     events per recipient; the race window is bounded to genuine
//     double-clicks within ~50ms.
// used_at and used_by_ip: writers set deterministic values
// (ts = now(); ip = request IP); concurrent writes are idempotent.
// No fix planned. If view_count ever becomes billing-relevant, this
// note tells the future dev where to add the atomic-increment fix
// (`UPDATE ... SET view_count = view_count + 1 WHERE id = ...`).
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

export const feedbackRepo = {
  ...makeLeafRepo({
    table: 'feedback',
    json: feedbackJson as unknown[] as Row[],
  }),
  // SPOC feedback submissions enqueue a feedback create; without a postgres
  // create path the write threw in dispatchToRepo and fell into the disabled
  // dead-letter queue (silent loss). Explicit INSERT (feedbackRepo is a plain
  // read-only leaf, no camelToSnake config to drive a generic insert).
  async create(f: Feedback, opts?: { queuedBy?: string }): Promise<void> {
    if (currentBackend() === 'postgres') {
      const sql = getSql()
      await sql`
        INSERT INTO feedback (id, school_id, mou_id, instalment_seq, submitted_at,
          submitted_by, submitter_email, ratings, overall_comment,
          magic_link_token_id, audit_log)
        VALUES (
          ${f.id}, ${f.schoolId}, ${f.mouId}, ${f.installmentSeq ?? null},
          ${f.submittedAt}, ${f.submittedBy}, ${f.submitterEmail ?? null},
          ${sql.json((f.ratings ?? []) as never)}::jsonb,
          ${f.overallComment ?? null}, ${f.magicLinkTokenId ?? null},
          ${sql.json((f.auditLog ?? []) as never)}::jsonb
        )
      `
      return
    }
    await enqueueUpdate({
      queuedBy: opts?.queuedBy ?? 'system',
      entity: 'feedback',
      operation: 'create',
      payload: f as unknown as Record<string, unknown>,
    })
  },
}

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
  // void: soft-delete tombstone (Pass 2, migration 021). Used by voidVexPi to
  // cascade-void a PRE-SHIP dispatch when its parent PI is voided. Never a hard
  // DELETE (the pi_id FK is ON DELETE RESTRICT).
  async void(
    id: string,
    args: { voidedAt: string; voidedBy: string; voidReason: string; audit: AuditEntry },
  ): Promise<void> {
    if (currentBackend() === 'postgres') {
      const sql = getSql()
      await sql`
        UPDATE vex_dispatches SET
          voided_at = ${args.voidedAt},
          voided_by = ${args.voidedBy},
          void_reason = ${args.voidReason},
          audit_log = audit_log || ${sql.json([args.audit] as never)}::jsonb
        WHERE id = ${id}
      `
      return
    }
    const cur = (vexDispatchesJson as unknown[] as VexDispatch[]).find((d) => d.id === id)
    if (!cur) return
    const updated: VexDispatch = {
      ...cur,
      voidedAt: args.voidedAt,
      voidedBy: args.voidedBy,
      voidReason: args.voidReason,
      auditLog: [...(cur.auditLog ?? []), args.audit],
    }
    await enqueueUpdate({
      queuedBy: args.voidedBy,
      entity: 'vexDispatch',
      operation: 'update',
      payload: updated as unknown as Record<string, unknown>,
    })
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

export const salesOpportunityRepo = makeAuditedLeafRepo({
  table: 'sales_opportunities',
  json: salesOpportunitiesJson as unknown[] as Row[],
  entity: 'salesOpportunity',
  camelToSnake: {
    schoolName: 'school_name', schoolId: 'school_id',
    city: 'city', state: 'state', region: 'region',
    salesRepId: 'sales_rep_id',
    programmeProposed: 'programme_proposed',
    gslModel: 'gsl_model', commitmentsMade: 'commitments_made',
    outOfScopeRequirements: 'out_of_scope_requirements',
    recceStatus: 'recce_status',
    recceCompletedAt: 'recce_completed_at', status: 'status',
    approvalNotes: 'approval_notes',
    conversionMouId: 'conversion_mou_id', lossReason: 'loss_reason',
    schoolMatchDismissed: 'school_match_dismissed',
  },
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

// mou_import_review: array shape; PK is `queued_at`. P3 OCC adds
// NULL-check resolution guard.
export const mouImportReviewRepo = {
  ...makeLeafRepo({
    table: 'mou_import_review',
    json: mouImportReviewJson as unknown[] as Row[],
    idColumn: 'queued_at',
    orderBy: 'queued_at',
  }),
  /**
   * P3 OCC (2026-05-24): /admin/mou-import-review queue admin page is
   * a per-entry resolve flow (rejectImportReview / approveImportReview).
   * Two admins resolving the same review entry concurrently would
   * otherwise both pass the in-memory `if (item.resolution !== null)`
   * check and both write a resolution silently.
   *
   * NULL-check OCC: conditional UPDATE matches only when both
   * `resolution IS NULL AND resolved_at IS NULL`. Same pattern as
   * dispatches.override_event setOverrideEventIfNull.
   *
   * **Important**: this REPLACES the in-memory `already-resolved` check
   * in the lib (which becomes a fast-path UX check). The data-layer
   * guard is the binding correctness check.
   *
   * Matching rows: queued_at + a raw_record id sentinel. The lib reads
   * the item by (queuedAt, rawRecordId); we accept queuedAt as the
   * primary key and rely on the in-memory dedup match for rawRecordId
   * (rawRecordId only varies when the queue has duplicate timestamps,
   * which is rare in practice but possible at sub-millisecond rates).
   */
  async resolveIfPending(
    queuedAt: string,
    rawRecordId: string | null,
    resolution: 'imported' | 'rejected' | 'punted-upstream' | 'approved-as-single',
    fields: {
      resolvedAt: string
      resolvedBy: string
      rejectionReason?: string | null
      rejectionNotes?: string | null
    },
  ): Promise<{ ok: true } | { ok: false; reason: 'already-resolved' | 'item-not-found' }> {
    if (currentBackend() === 'postgres') {
      const sql = getSql()
      // mou_import_review uses BIGSERIAL `id` PK in postgres but the
      // lib keys by (queued_at + rawRecordId) so we filter by the
      // composite. The data-layer guard adds resolution IS NULL.
      const rows = await sql<{ id: number }[]>`
        UPDATE mou_import_review SET
          resolution = ${resolution},
          resolved_at = ${fields.resolvedAt},
          resolved_by = ${fields.resolvedBy},
          rejection_reason = ${fields.rejectionReason ?? null},
          rejection_notes = ${fields.rejectionNotes ?? null}
        WHERE queued_at = ${queuedAt}
          ${rawRecordId !== null ? sql`AND raw_record->>'id' = ${rawRecordId}` : sql``}
          AND resolution IS NULL
          AND resolved_at IS NULL
        RETURNING id
      `
      if (rows.length === 1) return { ok: true }
      const exists = await sql<{ id: number; resolution: string | null }[]>`
        SELECT id, resolution FROM mou_import_review
        WHERE queued_at = ${queuedAt}
        ${rawRecordId !== null ? sql`AND raw_record->>'id' = ${rawRecordId}` : sql``}
      `
      if (exists.length === 0) return { ok: false, reason: 'item-not-found' }
      return { ok: false, reason: 'already-resolved' }
    }
    // json mode: in-memory atomic snapshot.
    const items = mouImportReviewJson as unknown[] as Array<{
      queuedAt: string; rawRecord?: { id?: unknown }; resolution: string | null
    }>
    const item = items.find((i) => {
      const rrid = (i.rawRecord && typeof i.rawRecord === 'object'
        && typeof i.rawRecord.id === 'string') ? i.rawRecord.id : null
      return i.queuedAt === queuedAt && (rawRecordId === null || rrid === rawRecordId)
    })
    if (!item) return { ok: false, reason: 'item-not-found' }
    if (item.resolution !== null) return { ok: false, reason: 'already-resolved' }
    // The full-row update goes through the queue.
    const updated = {
      ...item,
      resolution, resolvedAt: fields.resolvedAt, resolvedBy: fields.resolvedBy,
      rejectionReason: fields.rejectionReason ?? null,
      rejectionNotes: fields.rejectionNotes ?? null,
    }
    await enqueueUpdate({
      queuedBy: fields.resolvedBy,
      entity: 'mouImportReview',
      operation: 'update',
      payload: updated as unknown as Record<string, unknown>,
    })
    return { ok: true }
  },
}

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
  /**
   * Atomic appendAudit by composite PK. Concurrent appends via the
   * audit_log || jsonb concat are race-safe.
   */
  async appendAuditByKey(
    stageFromKey: string,
    stageToKey: string,
    entry: AuditEntry,
    opts?: { queuedBy?: string },
  ): Promise<void> {
    if (currentBackend() === 'postgres') {
      const sql = getSql()
      await sql`
        UPDATE lifecycle_rules
        SET audit_log = audit_log || ${sql.json([entry] as never)}::jsonb
        WHERE stage_from_key = ${stageFromKey} AND stage_to_key = ${stageToKey}
      `
      return
    }
    const cur = (lifecycleRulesJson as unknown[] as Row[]).find(
      (r) => r.stageFromKey === stageFromKey && r.stageToKey === stageToKey,
    )
    if (!cur) return
    const updated = { ...cur, auditLog: [...(cur.auditLog ?? []), entry] }
    await enqueueUpdate({
      queuedBy: opts?.queuedBy ?? 'system',
      entity: 'lifecycleRule',
      operation: 'update',
      payload: updated as unknown as Record<string, unknown>,
    })
  },
  async updatePartialByKey(
    stageFromKey: string,
    stageToKey: string,
    patch: Record<string, unknown>,
    opts?: { queuedBy?: string },
  ): Promise<void> {
    if (currentBackend() === 'postgres') {
      const sql = getSql()
      const CAMEL_TO_SNAKE: Record<string, string> = {
        defaultDays: 'default_days', customNotes: 'custom_notes',
        lastEditedAt: 'last_edited_at', lastEditedBy: 'last_edited_by',
      }
      const setObj: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(patch)) {
        const col = CAMEL_TO_SNAKE[k]
        if (!col) continue
        setObj[col] = v ?? null
      }
      if (Object.keys(setObj).length === 0) return
      await sql`UPDATE lifecycle_rules SET ${sql(setObj)}
        WHERE stage_from_key = ${stageFromKey} AND stage_to_key = ${stageToKey}`
      return
    }
    const cur = (lifecycleRulesJson as unknown[] as Row[]).find(
      (r) => r.stageFromKey === stageFromKey && r.stageToKey === stageToKey,
    )
    if (!cur) return
    await enqueueUpdate({
      queuedBy: opts?.queuedBy ?? 'system',
      entity: 'lifecycleRule',
      operation: 'update',
      payload: { ...cur, ...patch } as unknown as Record<string, unknown>,
    })
  },
  async updateWithAuditByKey(
    stageFromKey: string,
    stageToKey: string,
    patch: Record<string, unknown>,
    audit: AuditEntry,
    opts?: { queuedBy?: string },
  ): Promise<void> {
    if (currentBackend() === 'postgres') {
      await this.updatePartialByKey(stageFromKey, stageToKey, patch, opts)
      await this.appendAuditByKey(stageFromKey, stageToKey, audit, opts)
      return
    }
    const cur = (lifecycleRulesJson as unknown[] as Row[]).find(
      (r) => r.stageFromKey === stageFromKey && r.stageToKey === stageToKey,
    )
    if (!cur) return
    await enqueueUpdate({
      queuedBy: opts?.queuedBy ?? 'system',
      entity: 'lifecycleRule',
      operation: 'update',
      payload: {
        ...cur, ...patch,
        auditLog: [...(cur.auditLog ?? []), audit],
      } as unknown as Record<string, unknown>,
    })
  },
}

// stage_responsibility: PK is `stage`. P3 OCC adds version + audit-on-update.
export const stageResponsibilityRepo = {
  ...makeLeafRepo({
    table: 'stage_responsibility',
    json: stageResponsibilityJson as unknown[] as Row[],
    idColumn: 'stage',
    orderBy: 'stage',
  }),
  /**
   * P3 OCC (2026-05-24): /admin/stage-responsibility is leadership-only
   * config. Two leadership members editing the same stage's
   * responsible_department + responsible_user_id concurrently would
   * otherwise clobber. Version-OCC same pattern as cc_rules.
   *
   * stage_responsibility's audit JSONB column is named just `audit`
   * (not `audit_log`), so this method targets that column directly.
   * The PK is `stage` (TEXT), not `id`.
   */
  async updateWithAuditOCC(
    stage: string,
    expectedVersion: number,
    patch: {
      responsibleDepartment?: string | null
      responsibleUserId?: string | null
      escalationDepartment?: string | null
      notes?: string | null
      updatedAt?: string | null
      updatedBy?: string | null
    },
    audit: AuditEntry,
    opts?: { queuedBy?: string },
  ): Promise<{ ok: true; newVersion: number } | { ok: false; conflictVersion: number }> {
    if (currentBackend() === 'postgres') {
      const sql = getSql()
      const setObj: Record<string, unknown> = {}
      if (patch.responsibleDepartment !== undefined) setObj.responsible_department = patch.responsibleDepartment ?? null
      if (patch.responsibleUserId !== undefined) setObj.responsible_user_id = patch.responsibleUserId ?? null
      if (patch.escalationDepartment !== undefined) setObj.escalation_department = patch.escalationDepartment ?? null
      if (patch.notes !== undefined) setObj.notes = patch.notes ?? null
      if (patch.updatedAt !== undefined) setObj.updated_at = patch.updatedAt ?? null
      if (patch.updatedBy !== undefined) setObj.updated_by = patch.updatedBy ?? null
      const rows = await sql<{ version: number }[]>`
        UPDATE stage_responsibility SET
          ${Object.keys(setObj).length > 0 ? sql`${sql(setObj)},` : sql``}
          audit = audit || ${sql.json([audit] as never)}::jsonb,
          version = version + 1
        WHERE stage = ${stage} AND version = ${expectedVersion}
        RETURNING version
      `
      if (rows.length === 1) return { ok: true, newVersion: rows[0]!.version }
      const cur = await sql<{ version: number }[]>`
        SELECT version FROM stage_responsibility WHERE stage = ${stage}
      `
      return { ok: false, conflictVersion: cur[0]?.version ?? -1 }
    }
    // json mode: in-memory version compare + queue enqueue.
    const cur = (stageResponsibilityJson as unknown[] as Row[]).find(
      (r) => r.stage === stage,
    )
    if (!cur) return { ok: false, conflictVersion: -1 }
    const curVersion = (cur.version as number | undefined) ?? 1
    if (curVersion !== expectedVersion) return { ok: false, conflictVersion: curVersion }
    const merged = {
      ...cur, ...patch,
      audit: [...(Array.isArray(cur.audit) ? cur.audit : []), audit],
      version: curVersion + 1,
    }
    await enqueueUpdate({
      queuedBy: opts?.queuedBy ?? 'system',
      entity: 'stageResponsibility',
      operation: 'update',
      payload: { ...merged, id: stage } as Record<string, unknown>,
    })
    return { ok: true, newVersion: curVersion + 1 }
  },
}

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
