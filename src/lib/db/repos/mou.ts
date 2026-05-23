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
  student_count_event_ids: Json
  audit_log: Json
}

function num(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined) return null
  if (typeof v === 'number') return v
  const n = Number(v)
  return Number.isFinite(n) ? n : null
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
    effectiveDate: r.effective_date ?? null,
    startDate: r.start_date ?? '',
    endDate: r.end_date ?? '',
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
    generatedAt: r.generated_at ?? '',
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

  async update(m: MOU): Promise<void> {
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
          student_count_event_ids = ${sql.json((m.studentCountEventIds ?? []) as never)}::jsonb,
          audit_log = ${sql.json((m.auditLog ?? []) as never)}::jsonb
        WHERE id = ${m.id}
      `
      return
    }
    await enqueueUpdate({
      queuedBy: 'system',
      entity: 'mou',
      operation: 'update',
      payload: m as unknown as Record<string, unknown>,
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
