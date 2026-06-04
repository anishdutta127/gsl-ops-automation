/*
 * MOU repo (Phase 7).
 *
 * The central entity. JSONB-heavy: payment_schedule, payment_schedules,
 * yearly_pricing, billing_block, draft_variables, dispatch_override,
 * gradewise_distribution, student_count_event_ids, audit_log all
 * become JSONB columns. Read-parity covers the row mapper; write-
 * parity covers the round-trip (the bug class this migration exists
 * to kill).
 */

import type { MOU, AuditEntry } from '@/lib/types'
import { currentBackend } from '../backend'
import { getSql } from '../client'
import { enqueueUpdate } from '@/lib/pendingUpdates'
import mousJson from '@/data/mous.json'

const jsonMous = mousJson as unknown as MOU[]

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any

interface MouRow {
  id: string
  school_id: string
  school_name: string
  programme: MOU['programme']
  programme_sub_type: string | null
  school_scope: 'SINGLE' | 'GROUP'
  school_group_id: string | null
  status: MOU['status']
  cohort_status: 'active' | 'archived'
  academic_year: string | null
  effective_date: string | null
  start_date: string | null
  end_date: string | null
  number_of_years: number | null
  students_mou: number | null
  students_actual: number | null
  students_variance: number | null
  students_variance_pct: string | number | null
  sp_without_tax: string | number | null
  sp_with_tax: string | number | null
  contract_value: string | number | null
  received: string | number | null
  tds: string | number | null
  balance: string | number | null
  received_pct: string | number | null
  trainer_model: string | null
  sales_person_id: string | null
  template_version: string | null
  generated_at: string | null
  notes: string | null
  delay_notes: string | null
  days_to_expiry: number | null
  sales_channel: string | null
  school_crm_id: string | null
  signed_mou_pdf_path: string | null
  import_notes: string | null
  product_selection: 'TinkRworks' | 'Cretile' | 'Both' | null
  payment_schedule: Json
  payment_schedules: Json
  yearly_pricing: Json
  billing_block: Json
  draft_variables: Json
  dispatch_override: Json
  gradewise_distribution: Json
  products: Json
  student_count_event_ids: Json
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

function rowToMou(r: MouRow): MOU {
  return {
    id: r.id,
    schoolId: r.school_id,
    schoolName: r.school_name,
    programme: r.programme,
    programmeSubType: (r.programme_sub_type ?? undefined) as MOU['programmeSubType'],
    schoolScope: r.school_scope,
    schoolGroupId: r.school_group_id ?? null,
    status: r.status,
    cohortStatus: r.cohort_status,
    academicYear: r.academic_year ?? '',
    effectiveDate: dateStr(r.effective_date),
    startDate: dateStr(r.start_date) ?? '',
    endDate: dateStr(r.end_date) ?? '',
    numberOfYears: r.number_of_years ?? null,
    studentsMou: r.students_mou ?? 0,
    studentsActual: r.students_actual ?? 0,
    studentsVariance: r.students_variance ?? 0,
    studentsVariancePct: num(r.students_variance_pct) ?? 0,
    spWithoutTax: num(r.sp_without_tax) ?? 0,
    spWithTax: num(r.sp_with_tax) ?? 0,
    contractValue: num(r.contract_value) ?? 0,
    received: num(r.received) ?? 0,
    tds: num(r.tds) ?? 0,
    balance: num(r.balance) ?? 0,
    receivedPct: num(r.received_pct) ?? 0,
    trainerModel: (r.trainer_model ?? null) as MOU['trainerModel'],
    salesPersonId: r.sales_person_id ?? '',
    templateVersion: r.template_version ?? '',
    generatedAt: dateStr(r.generated_at) ?? '',
    notes: r.notes ?? '',
    delayNotes: r.delay_notes ?? null,
    daysToExpiry: r.days_to_expiry ?? null,
    salesChannel: (r.sales_channel ?? null) as MOU['salesChannel'],
    schoolCrmId: r.school_crm_id ?? null,
    signedMouPdfPath: r.signed_mou_pdf_path ?? null,
    importNotes: r.import_notes ?? null,
    productSelection: r.product_selection ?? null,
    paymentSchedule: r.payment_schedule ?? null,
    paymentSchedules: r.payment_schedules ?? null,
    yearlyPricing: r.yearly_pricing ?? null,
    billingBlock: r.billing_block ?? null,
    draftVariables: r.draft_variables ?? null,
    dispatchOverride: r.dispatch_override ?? undefined,
    gradewiseDistribution: r.gradewise_distribution ?? null,
    products: r.products ?? null,
    studentCountEventIds: Array.isArray(r.student_count_event_ids)
      ? r.student_count_event_ids
      : [],
    auditLog: Array.isArray(r.audit_log) ? r.audit_log : [],
  } as MOU
}

export const mouRepo = {
  async findAll(): Promise<MOU[]> {
    if (currentBackend() === 'postgres') {
      const sql = getSql()
      const rows = await sql<MouRow[]>`SELECT * FROM mous ORDER BY id`
      return rows.map(rowToMou)
    }
    return jsonMous
  },

  async findById(id: string): Promise<MOU | null> {
    if (currentBackend() === 'postgres') {
      const sql = getSql()
      const rows = await sql<MouRow[]>`SELECT * FROM mous WHERE id = ${id}`
      return rows[0] ? rowToMou(rows[0]) : null
    }
    return jsonMous.find((m) => m.id === id) ?? null
  },

  async findBySchoolId(schoolId: string): Promise<MOU[]> {
    if (currentBackend() === 'postgres') {
      const sql = getSql()
      const rows = await sql<MouRow[]>`
        SELECT * FROM mous WHERE school_id = ${schoolId} ORDER BY id
      `
      return rows.map(rowToMou)
    }
    return jsonMous.filter((m) => m.schoolId === schoolId)
  },

  async findActiveCohort(): Promise<MOU[]> {
    if (currentBackend() === 'postgres') {
      const sql = getSql()
      const rows = await sql<MouRow[]>`
        SELECT * FROM mous WHERE cohort_status = 'active' ORDER BY id
      `
      return rows.map(rowToMou)
    }
    return jsonMous.filter((m) => m.cohortStatus === 'active')
  },

  async create(
    m: MOU,
    opts?: { queuedBy?: string; sql?: ReturnType<typeof getSql> },
  ): Promise<void> {
    if (currentBackend() === 'postgres') {
      // Round 4 follow-up: opts.sql lets the caller pass a transaction-
      // scoped client so the MOU insert can be atomic with a paired
      // school insert (inline-create flow in saveDraftMou).
      const sql = opts?.sql ?? getSql()
      await sql`
        INSERT INTO mous (
          id, school_id, school_name, programme, programme_sub_type,
          school_scope, school_group_id, status, cohort_status, academic_year,
          effective_date, start_date, end_date, number_of_years,
          students_mou, students_actual, students_variance, students_variance_pct,
          sp_without_tax, sp_with_tax, contract_value, received, tds, balance, received_pct,
          trainer_model, sales_person_id, template_version, generated_at,
          notes, delay_notes, days_to_expiry, sales_channel, school_crm_id,
          signed_mou_pdf_path, import_notes, product_selection,
          payment_schedule, payment_schedules, yearly_pricing, billing_block,
          draft_variables, dispatch_override, gradewise_distribution, products,
          student_count_event_ids, audit_log
        ) VALUES (
          ${m.id}, ${m.schoolId}, ${m.schoolName}, ${m.programme}, ${m.programmeSubType ?? null},
          ${m.schoolScope ?? 'SINGLE'}, ${m.schoolGroupId ?? null}, ${m.status}, ${m.cohortStatus ?? 'active'}, ${m.academicYear ?? null},
          ${m.effectiveDate ?? null}, ${m.startDate ?? null}, ${m.endDate ?? null}, ${m.numberOfYears ?? null},
          ${m.studentsMou ?? null}, ${m.studentsActual ?? null}, ${m.studentsVariance ?? null}, ${m.studentsVariancePct ?? null},
          ${m.spWithoutTax ?? null}, ${m.spWithTax ?? null}, ${m.contractValue ?? null}, ${m.received ?? null}, ${m.tds ?? null}, ${m.balance ?? null}, ${m.receivedPct ?? null},
          ${m.trainerModel ?? null}, ${m.salesPersonId || null}, ${m.templateVersion || null}, ${m.generatedAt || null},
          ${m.notes ?? null}, ${m.delayNotes ?? null}, ${m.daysToExpiry ?? null}, ${m.salesChannel ?? null}, ${m.schoolCrmId ?? null},
          ${m.signedMouPdfPath ?? null}, ${m.importNotes ?? null}, ${m.productSelection ?? null},
          ${m.paymentSchedule == null ? null : sql.json(m.paymentSchedule as never)}::jsonb,
          ${m.paymentSchedules == null ? null : sql.json(m.paymentSchedules as never)}::jsonb,
          ${m.yearlyPricing == null ? null : sql.json(m.yearlyPricing as never)}::jsonb,
          ${m.billingBlock == null ? null : sql.json(m.billingBlock as never)}::jsonb,
          ${m.draftVariables == null ? null : sql.json(m.draftVariables as never)}::jsonb,
          ${m.dispatchOverride == null ? null : sql.json(m.dispatchOverride as never)}::jsonb,
          ${m.gradewiseDistribution == null ? null : sql.json(m.gradewiseDistribution as never)}::jsonb,
          ${m.products == null ? null : sql.json(m.products as never)}::jsonb,
          ${sql.json((m.studentCountEventIds ?? []) as never)}::jsonb,
          ${sql.json((m.auditLog ?? []) as never)}::jsonb
        ) ON CONFLICT (id) DO NOTHING
      `
      return
    }
    await enqueueUpdate({
      queuedBy: opts?.queuedBy ?? 'system',
      entity: 'mou',
      operation: 'create',
      payload: m as unknown as Record<string, unknown>,
    })
  },

  async update(m: MOU, opts?: { queuedBy?: string }): Promise<void> {
    if (currentBackend() === 'postgres') {
      const sql = getSql()
      await sql`
        UPDATE mous SET
          school_id = ${m.schoolId},
          school_name = ${m.schoolName},
          programme = ${m.programme},
          programme_sub_type = ${m.programmeSubType ?? null},
          school_scope = ${m.schoolScope ?? 'SINGLE'},
          school_group_id = ${m.schoolGroupId ?? null},
          status = ${m.status},
          cohort_status = ${m.cohortStatus ?? 'active'},
          academic_year = ${m.academicYear ?? null},
          effective_date = ${m.effectiveDate ?? null},
          start_date = ${m.startDate ?? null},
          end_date = ${m.endDate ?? null},
          number_of_years = ${m.numberOfYears ?? null},
          students_mou = ${m.studentsMou ?? null},
          students_actual = ${m.studentsActual ?? null},
          students_variance = ${m.studentsVariance ?? null},
          students_variance_pct = ${m.studentsVariancePct ?? null},
          sp_without_tax = ${m.spWithoutTax ?? null},
          sp_with_tax = ${m.spWithTax ?? null},
          contract_value = ${m.contractValue ?? null},
          received = ${m.received ?? null},
          tds = ${m.tds ?? null},
          balance = ${m.balance ?? null},
          received_pct = ${m.receivedPct ?? null},
          trainer_model = ${m.trainerModel ?? null},
          sales_person_id = ${m.salesPersonId || null},
          template_version = ${m.templateVersion || null},
          generated_at = ${m.generatedAt || null},
          notes = ${m.notes ?? null},
          delay_notes = ${m.delayNotes ?? null},
          days_to_expiry = ${m.daysToExpiry ?? null},
          sales_channel = ${m.salesChannel ?? null},
          school_crm_id = ${m.schoolCrmId ?? null},
          signed_mou_pdf_path = ${m.signedMouPdfPath ?? null},
          import_notes = ${m.importNotes ?? null},
          product_selection = ${m.productSelection ?? null},
          payment_schedule = ${m.paymentSchedule == null ? null : sql.json(m.paymentSchedule as never)}::jsonb,
          payment_schedules = ${m.paymentSchedules == null ? null : sql.json(m.paymentSchedules as never)}::jsonb,
          yearly_pricing = ${m.yearlyPricing == null ? null : sql.json(m.yearlyPricing as never)}::jsonb,
          billing_block = ${m.billingBlock == null ? null : sql.json(m.billingBlock as never)}::jsonb,
          draft_variables = ${m.draftVariables == null ? null : sql.json(m.draftVariables as never)}::jsonb,
          dispatch_override = ${m.dispatchOverride == null ? null : sql.json(m.dispatchOverride as never)}::jsonb,
          gradewise_distribution = ${m.gradewiseDistribution == null ? null : sql.json(m.gradewiseDistribution as never)}::jsonb,
          products = ${m.products == null ? null : sql.json(m.products as never)}::jsonb,
          student_count_event_ids = ${sql.json((m.studentCountEventIds ?? []) as never)}::jsonb,
          audit_log = ${sql.json((m.auditLog ?? []) as never)}::jsonb
        WHERE id = ${m.id}
      `
      return
    }
    await enqueueUpdate({
      queuedBy: opts?.queuedBy ?? 'system',
      entity: 'mou',
      operation: 'update',
      payload: m as unknown as Record<string, unknown>,
    })
  },

  /**
   * Partial update by field name. Updates ONLY the listed fields,
   * leaving every other column (including audit_log) untouched.
   *
   * Use this in routes that want to atomically update a subset of
   * fields without racing on read-modify-write of the whole row.
   * The companion call for the audit entry is `appendAudit`, which
   * uses JSONB `||` concat at SQL level so concurrent appends do not
   * lose entries.
   *
   * Json-mode: read the current row, merge the patch, enqueue a full
   * update (since the drainer's replace-by-id semantics overwrites
   * the row; we never want to lose fields). Postgres-mode: dynamic
   * UPDATE that touches only the patched columns.
   *
   * JSONB columns: payment_schedule, payment_schedules, yearly_pricing,
   * billing_block, draft_variables, dispatch_override,
   * gradewise_distribution, student_count_event_ids. These are wrapped
   * with sql.json() before sending.
   */
  async updatePartial(
    id: string,
    patch: Partial<MOU>,
    opts?: { queuedBy?: string },
  ): Promise<void> {
    if (currentBackend() === 'postgres') {
      const sql = getSql()
      const JSONB_COLS = new Set([
        'payment_schedule', 'payment_schedules', 'yearly_pricing',
        'billing_block', 'draft_variables', 'dispatch_override',
        'gradewise_distribution', 'products', 'student_count_event_ids',
      ])
      const CAMEL_TO_SNAKE: Record<string, string> = {
        schoolId: 'school_id', schoolName: 'school_name', programme: 'programme',
        programmeSubType: 'programme_sub_type', schoolScope: 'school_scope',
        schoolGroupId: 'school_group_id', status: 'status', cohortStatus: 'cohort_status',
        academicYear: 'academic_year', effectiveDate: 'effective_date',
        startDate: 'start_date', endDate: 'end_date', numberOfYears: 'number_of_years',
        studentsMou: 'students_mou', studentsActual: 'students_actual',
        studentsVariance: 'students_variance', studentsVariancePct: 'students_variance_pct',
        spWithoutTax: 'sp_without_tax', spWithTax: 'sp_with_tax',
        contractValue: 'contract_value', received: 'received', tds: 'tds',
        balance: 'balance', receivedPct: 'received_pct', trainerModel: 'trainer_model',
        salesPersonId: 'sales_person_id', templateVersion: 'template_version',
        generatedAt: 'generated_at', notes: 'notes', delayNotes: 'delay_notes',
        daysToExpiry: 'days_to_expiry', salesChannel: 'sales_channel',
        schoolCrmId: 'school_crm_id', signedMouPdfPath: 'signed_mou_pdf_path',
        importNotes: 'import_notes', productSelection: 'product_selection',
        paymentSchedule: 'payment_schedule', paymentSchedules: 'payment_schedules',
        yearlyPricing: 'yearly_pricing', billingBlock: 'billing_block',
        draftVariables: 'draft_variables', dispatchOverride: 'dispatch_override',
        gradewiseDistribution: 'gradewise_distribution', products: 'products',
        studentCountEventIds: 'student_count_event_ids',
      }
      const TIMESTAMP_COLS = new Set([
        'effective_date', 'start_date', 'end_date', 'generated_at',
      ])
      const updates: { col: string; val: unknown; jsonb: boolean }[] = []
      for (const [k, v] of Object.entries(patch)) {
        if (k === 'id' || k === 'auditLog') continue
        const col = CAMEL_TO_SNAKE[k]
        if (!col) continue
        updates.push({ col, val: v, jsonb: JSONB_COLS.has(col) })
      }
      if (updates.length === 0) return
      // postgres.js: build the SET clause via the sql() helper. JSONB
      // columns must be wrapped with sql.json() so they're sent as
      // JSONB, not as text. Scalars pass through unchanged.
      // Timestamp columns: empty strings from rowToMou's null fallback
      // must be converted back to null, otherwise postgres.js throws
      // RangeError: Invalid time value during Date serialization.
      const setObj: Record<string, unknown> = {}
      for (const u of updates) {
        if (u.jsonb) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          setObj[u.col] = u.val == null ? null : sql.json(u.val as never)
        } else if (TIMESTAMP_COLS.has(u.col) && u.val === '') {
          setObj[u.col] = null
        } else {
          setObj[u.col] = u.val ?? null
        }
      }
      await sql`UPDATE mous SET ${sql(setObj)} WHERE id = ${id}`
      return
    }
    const m = jsonMous.find((x) => x.id === id)
    if (!m) return
    await enqueueUpdate({
      queuedBy: opts?.queuedBy ?? 'system',
      entity: 'mou',
      operation: 'update',
      payload: { ...m, ...patch } as unknown as Record<string, unknown>,
    })
  },

  /**
   * Atomic "update fields + append audit entry" in a single logical call.
   *
   * Postgres mode: two SQL statements; the audit `||` concat is atomic
   * and the partial UPDATE only touches the listed columns. Two
   * parallel callers cannot race because (a) the SET doesn't touch
   * columns the other caller is touching and (b) the audit concat is
   * server-side, not client-side spread.
   *
   * Json mode: a single enqueueUpdate carrying the full merged payload.
   * The drainer's replace-by-id semantics work correctly because we
   * spread the existing MOU and apply both the patch and the audit
   * entry in one snapshot. Two parallel json-mode callers DO race
   * here (last writer wins), but json mode is the legacy path and
   * already had this property pre-Part-7.
   */
  async updateWithAudit(
    id: string,
    patch: Partial<MOU>,
    audit: AuditEntry,
    opts?: { queuedBy?: string },
  ): Promise<void> {
    if (currentBackend() === 'postgres') {
      await this.updatePartial(id, patch, opts)
      await this.appendAudit(id, audit)
      return
    }
    const m = jsonMous.find((x) => x.id === id)
    if (!m) return
    const updated: MOU = {
      ...m,
      ...patch,
      auditLog: [...(m.auditLog ?? []), audit],
    }
    await enqueueUpdate({
      queuedBy: opts?.queuedBy ?? 'system',
      entity: 'mou',
      operation: 'update',
      payload: updated as unknown as Record<string, unknown>,
    })
  },

  async appendAudit(id: string, entry: AuditEntry): Promise<void> {
    if (currentBackend() === 'postgres') {
      const sql = getSql()
      await sql`
        UPDATE mous SET audit_log = audit_log || ${sql.json([entry] as never)}::jsonb
        WHERE id = ${id}
      `
      return
    }
    const m = jsonMous.find((x) => x.id === id)
    if (!m) return
    const updated: MOU = { ...m, auditLog: [...(m.auditLog ?? []), entry] }
    await enqueueUpdate({
      queuedBy: 'system',
      entity: 'mou',
      operation: 'update',
      payload: updated as unknown as Record<string, unknown>,
    })
  },
}
