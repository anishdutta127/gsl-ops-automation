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

export const studentCountEventRepo = makeLeafRepo({
  table: 'student_count_events',
  json: studentCountEventsJson as unknown[] as Row[],
})

export const paymentLogRepo = makeLeafRepo({
  table: 'payment_logs',
  json: paymentLogsJson as unknown[] as Row[],
  numericCols: new Set(['amount']),
})

export const adjustmentRepo = makeLeafRepo({
  table: 'adjustments',
  json: adjustmentsJson as unknown[] as Row[],
  numericCols: new Set(['amount_delta', 'before_amount', 'after_amount']),
})

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

export const magicLinkTokenRepo = makeLeafRepo({
  table: 'magic_link_tokens',
  json: magicLinkTokensJson as unknown[] as Row[],
})

export const feedbackRepo = makeLeafRepo({
  table: 'feedback',
  json: feedbackJson as unknown[] as Row[],
})

export const vexDispatchRepo = makeLeafRepo({
  table: 'vex_dispatches',
  json: vexDispatchesJson as unknown[] as Row[],
  numericCols: new Set(['freight']),
})

export const vexOrderRepo = makeLeafRepo({
  table: 'vex_orders',
  json: vexOrdersJson as unknown[] as Row[],
})

export const agreementRepo = makeLeafRepo({
  table: 'agreements',
  json: agreementsJson as unknown[] as Row[],
})

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
