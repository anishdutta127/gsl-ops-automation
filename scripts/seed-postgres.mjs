#!/usr/bin/env node
/*
 * Phase 7 Part 3: seed the Postgres database from the canonical
 * src/data/*.json files.
 *
 * Inserts in dependency order so FK constraints are satisfied. Uses
 * ON CONFLICT (id) DO NOTHING so re-running the seed is a no-op.
 *
 * Modes:
 *   --dry-run (default): wrap every insert in a transaction and
 *     ROLLBACK at the end. Prints per-table inserted/skipped/failed
 *     counts. The database is left untouched.
 *   --apply: COMMIT the transaction. Use ONLY against the staging
 *     branch first; only against production at cutover (Part 6).
 *
 * Connection: reads DATABASE_URL from .env.local. The Vercel runtime
 * gets DATABASE_URL via Vercel env (added at Part 6 cutover).
 *
 * Output ends with a Markdown summary table the operator can paste
 * directly into the review thread for Anish.
 */

import { readFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import dns from 'node:dns'
import { Resolver } from 'node:dns/promises'
import postgres from 'postgres'

// ---------------------------------------------------------------------------
// .env.local loader (no dotenv dep)
// ---------------------------------------------------------------------------
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
}

// ---------------------------------------------------------------------------
// DNS fallback (local resolver refuses Neon hostnames; use public DNS)
// ---------------------------------------------------------------------------
const publicResolver = new Resolver()
publicResolver.setServers(['1.1.1.1', '8.8.8.8'])
const originalLookup = dns.lookup
dns.lookup = function patchedLookup(hostname, opts, cb) {
  if (typeof opts === 'function') { cb = opts; opts = {} }
  if (typeof opts === 'number') opts = { family: opts }
  originalLookup.call(dns, hostname, opts, (err, addr, fam) => {
    if (!err) return cb(err, addr, fam)
    publicResolver.resolve4(hostname).then((addrs) => {
      if (!addrs?.length) return cb(err)
      if (opts && opts.all) cb(null, addrs.map((a) => ({ address: a, family: 4 })))
      else cb(null, addrs[0], 4)
    }).catch(() => cb(err))
  })
}

const url = process.env.DATABASE_URL
if (!url) {
  console.error('DATABASE_URL is not set in .env.local.')
  process.exit(1)
}

const APPLY = process.argv.includes('--apply')
const MODE = APPLY ? 'APPLY' : 'DRY-RUN'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DATA_DIR = resolve('src/data')

function loadJson(name) {
  return JSON.parse(readFileSync(join(DATA_DIR, name), 'utf8'))
}

function iso(s) {
  if (s === null || s === undefined || s === '') return null
  return s
}
function num(s) {
  if (s === null || s === undefined || s === '') return null
  return s
}
function intOrNull(s) {
  if (s === null || s === undefined || s === '') return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}
function boolOrNull(v) {
  if (v === null || v === undefined) return null
  return !!v
}
function arrTextOrEmpty(a) {
  if (!Array.isArray(a)) return []
  return a.map((x) => String(x))
}
function jsonbOrNull(v) {
  if (v === null || v === undefined) return null
  return v
}
function jsonbDefault(v, fallback) {
  if (v === null || v === undefined) return fallback
  return v
}

// ---------------------------------------------------------------------------
// Per-entity loaders.
// Each fn returns { table, inserted, skipped, failed, failedExamples }.
// All inserts go through sql.begin() so a top-level rollback is clean
// on dry-run.
// ---------------------------------------------------------------------------

// Demo-cohort orphans, signed off by Anish 2026-05-23 as "accept the
// loss". Six fictional schools (Greenfield/Pune, Oakwood/Delhi, etc.)
// were created for Phase 1 UI demos and never wired into the real
// schools master; rows in mous/dispatches/communications/feedback/
// escalations/dispatch_requests/magic_link_tokens that reference them
// are intentional discards. The allowlist below lets the dry-run +
// staging-apply runs read "1,205 inserted, 38 intentionally skipped"
// rather than "38 failed", so the eventual production-cutover run
// is unambiguously green and nobody has to re-triage these 38 rows
// under pressure.
const EXPECTED_ORPHAN_IDS = {
  mous: new Set([
    'MOU-STEAM-2627-DRAFT-001','MOU-STEAM-2627-DRAFT-002',
    'MOU-YP-2627-DRAFT-001','MOU-YP-2627-DRAFT-002',
    'MOU-YP-2627-DRAFT-003','MOU-YP-2627-DRAFT-004',
  ]),
  signed_values: new Set([
    'MOU-YP-2627-DRAFT-003',
  ]),
  dispatch_requests: new Set([
    'DR-MOU-STEAM-2627-001-i1-20260427100000',
    'DR-MOU-STEAM-2627-009-i1-20260426093000',
  ]),
  dispatches: new Set(['DIS-001','DIS-002','DIS-004','DIS-005']),
  communications: new Set([
    'COM-WLC-001','COM-T30-001','COM-T14-001','COM-T7-001','COM-ACR-001',
    'COM-PIS-001','COM-PRC-001','COM-DSR-001','COM-DAR-001','COM-FBR-001',
    'COM-CLT-001','COM-WAD-001','COM-WAD-002','COM-BNC-001',
  ]),
  magic_link_tokens: new Set(['MLT-FB-001','MLT-SV-001']),
  feedback: new Set(['FBK-001','FBK-002','FBK-005','FBK-006','FBK-007']),
  escalations: new Set(['ESC-001','ESC-003','ESC-004','ESC-005']),
}

function rowKey(name, row) {
  if (name === 'signed_values') return row.mouId
  if (name === 'lifecycle_rules') return `${row.stageFromKey}>${row.stageToKey}`
  if (name === 'stage_responsibility') return row.stage
  if (name === 'reminder_thresholds') return row.kind
  if (name === 'counters') return row.key
  if (name === 'chain_dismissals') return row.schoolId
  if (name === 'vex_products') return row.partNumber
  return row.id
}

function isExpectedOrphan(name, row) {
  const set = EXPECTED_ORPHAN_IDS[name]
  if (!set) return false
  return set.has(rowKey(name, row))
}

async function seedTable(sql, name, rows, perRow) {
  let inserted = 0, skipped = 0, expectedSkipped = 0, failed = 0
  const failedExamples = []
  let savepointN = 0
  for (const row of rows) {
    savepointN += 1
    const spName = `sp_${name}_${savepointN}`
    await sql.unsafe(`SAVEPOINT ${spName}`)
    try {
      const res = await perRow(sql, row)
      if (res && res.count > 0) inserted += 1
      else skipped += 1
      await sql.unsafe(`RELEASE SAVEPOINT ${spName}`)
    } catch (err) {
      await sql.unsafe(`ROLLBACK TO SAVEPOINT ${spName}`)
      if (isExpectedOrphan(name, row)) {
        expectedSkipped += 1
      } else {
        failed += 1
        if (failedExamples.length < 3) {
          failedExamples.push({
            id: rowKey(name, row) ?? '(no-id)',
            error: err.message.slice(0, 240),
          })
        }
      }
    }
  }
  return { table: name, source: rows.length, inserted, skipped, expectedSkipped, failed, failedExamples }
}

// ---------------------------------------------------------------------------
// Seeders (dependency order)
// ---------------------------------------------------------------------------

const seeders = []

// Layer 1: independents

seeders.push(async (sql) => {
  const rows = loadJson('users.json')
  return seedTable(sql, 'users', rows, async (sql, u) => {
    return await sql`
      INSERT INTO users (id, name, email, role, department, active, password_hash,
                         testing_override, testing_override_permissions,
                         azure_ad_object_id, requires_admin_review, audit_log, created_at)
      VALUES (${u.id}, ${u.name}, ${u.email}, ${u.role},
              ${u.department ?? null}, ${boolOrNull(u.active) ?? true},
              ${u.passwordHash ?? null},
              ${!!u.testingOverride},
              ${sql.json(jsonbDefault(u.testingOverridePermissions, []))}::jsonb,
              ${u.azureAdObjectId ?? null},
              ${!!u.requiresAdminReview},
              ${sql.json(jsonbDefault(u.auditLog, []))}::jsonb,
              ${iso(u.createdAt) ?? sql`NOW()`})
      ON CONFLICT (id) DO NOTHING
    `
  })
})

seeders.push(async (sql) => {
  const rows = loadJson('sales_team.json')
  return seedTable(sql, 'sales_team', rows, async (sql, r) => {
    return await sql`
      INSERT INTO sales_team (id, name, email, phone, territories, programmes, active, joined_date, audit_log)
      VALUES (${r.id}, ${r.name}, ${r.email}, ${r.phone ?? null},
              ${arrTextOrEmpty(r.territories)},
              ${arrTextOrEmpty(r.programmes)},
              ${boolOrNull(r.active) ?? true},
              ${iso(r.joinedDate)},
              ${sql.json(jsonbDefault(r.auditLog, []))}::jsonb)
      ON CONFLICT (id) DO NOTHING
    `
  })
})

seeders.push(async (sql) => {
  const rows = loadJson('schools.json')
  return seedTable(sql, 'schools', rows, async (sql, s) => {
    return await sql`
      INSERT INTO schools (id, name, legal_entity, city, state, region, pin_code,
                           contact_person, email, phone, billing_name, pan, gst_number,
                           notes, active, audit_log, created_at)
      VALUES (${s.id}, ${s.name}, ${s.legalEntity ?? null}, ${s.city ?? null}, ${s.state ?? null},
              ${s.region ?? null}, ${s.pinCode ?? null}, ${s.contactPerson ?? null},
              ${s.email ?? null}, ${s.phone ?? null}, ${s.billingName ?? null},
              ${s.pan ?? null}, ${s.gstNumber ?? null}, ${s.notes ?? null},
              ${boolOrNull(s.active) ?? true},
              ${sql.json(jsonbDefault(s.auditLog, []))}::jsonb,
              ${iso(s.createdAt) ?? sql`NOW()`})
      ON CONFLICT (id) DO NOTHING
    `
  })
})

seeders.push(async (sql) => {
  const rows = loadJson('vendors.json')
  return seedTable(sql, 'vendors', rows, async (sql, v) => {
    return await sql`
      INSERT INTO vendors (id, name, legal_entity, category, primary_contact, primary_email,
                           primary_phone, address, pan, gst_number, bank_account, ifsc, notes,
                           active, created_at, audit_log)
      VALUES (${v.id}, ${v.name}, ${v.legalEntity ?? null}, ${v.category ?? null},
              ${v.primaryContact ?? null}, ${v.primaryEmail ?? null}, ${v.primaryPhone ?? null},
              ${v.address ?? null}, ${v.pan ?? null}, ${v.gstNumber ?? null},
              ${v.bankAccount ?? null}, ${v.ifsc ?? null}, ${v.notes ?? null},
              ${boolOrNull(v.active) ?? true},
              ${iso(v.createdAt) ?? sql`NOW()`},
              ${sql.json(jsonbDefault(v.auditLog, []))}::jsonb)
      ON CONFLICT (id) DO NOTHING
    `
  })
})

seeders.push(async (sql) => {
  const rows = loadJson('inventory_items.json')
  return seedTable(sql, 'inventory_items', rows, async (sql, i) => {
    return await sql`
      INSERT INTO inventory_items (id, sku_name, category, cretile_grade, mastersheet_source_name,
                                   current_stock, reorder_threshold, notes, active,
                                   last_updated_at, last_updated_by, import_notes, audit_log)
      VALUES (${i.id}, ${i.skuName}, ${i.category},
              ${intOrNull(i.cretileGrade)}, ${i.mastersheetSourceName ?? null},
              ${intOrNull(i.currentStock) ?? 0}, ${intOrNull(i.reorderThreshold)},
              ${i.notes ?? null}, ${boolOrNull(i.active) ?? true},
              ${iso(i.lastUpdatedAt)}, ${i.lastUpdatedBy ?? null},
              ${i.importNotes ?? null},
              ${sql.json(jsonbDefault(i.auditLog, []))}::jsonb)
      ON CONFLICT (id) DO NOTHING
    `
  })
})

seeders.push(async (sql) => {
  const rows = loadJson('vex_products.json')
  return seedTable(sql, 'vex_products', rows, async (sql, p) => {
    return await sql`
      INSERT INTO vex_products (part_number, name, default_unit_price, active)
      VALUES (${p.partNumber}, ${p.name}, ${num(p.defaultUnitPrice)}, ${boolOrNull(p.active) ?? true})
      ON CONFLICT (part_number) DO NOTHING
    `
  })
})

seeders.push(async (sql) => {
  const rows = loadJson('communication_templates.json')
  return seedTable(sql, 'communication_templates', rows, async (sql, t) => {
    return await sql`
      INSERT INTO communication_templates (id, name, use_case, subject, body_markdown,
                                           default_recipient, default_cc_rules, variables,
                                           created_by, created_at, last_edited_by, last_edited_at,
                                           active, audit_log)
      VALUES (${t.id}, ${t.name}, ${t.useCase}, ${t.subject ?? null}, ${t.bodyMarkdown ?? ''},
              ${t.defaultRecipient ?? null},
              ${sql.json(jsonbDefault(t.defaultCcRules, []))}::jsonb,
              ${sql.json(jsonbDefault(t.variables, []))}::jsonb,
              ${t.createdBy ?? null}, ${iso(t.createdAt) ?? sql`NOW()`},
              ${t.lastEditedBy ?? null}, ${iso(t.lastEditedAt)},
              ${boolOrNull(t.active) ?? true},
              ${sql.json(jsonbDefault(t.auditLog, []))}::jsonb)
      ON CONFLICT (id) DO NOTHING
    `
  })
})

seeders.push(async (sql) => {
  const rows = loadJson('lifecycle_rules.json')
  return seedTable(sql, 'lifecycle_rules', rows, async (sql, l) => {
    return await sql`
      INSERT INTO lifecycle_rules (stage_from_key, stage_to_key, default_days, custom_notes,
                                   created_at, created_by, last_edited_at, last_edited_by, audit_log)
      VALUES (${l.stageFromKey}, ${l.stageToKey}, ${intOrNull(l.defaultDays) ?? 0},
              ${l.customNotes ?? null}, ${iso(l.createdAt) ?? sql`NOW()`},
              ${l.createdBy ?? null}, ${iso(l.lastEditedAt)}, ${l.lastEditedBy ?? null},
              ${sql.json(jsonbDefault(l.auditLog, []))}::jsonb)
      ON CONFLICT (stage_from_key, stage_to_key) DO NOTHING
    `
  })
})

seeders.push(async (sql) => {
  const rows = loadJson('stage_responsibility.json')
  return seedTable(sql, 'stage_responsibility', rows, async (sql, r) => {
    return await sql`
      INSERT INTO stage_responsibility (stage, responsible_department, responsible_user_id,
                                        escalation_department, notes, updated_at, updated_by, audit)
      VALUES (${r.stage}, ${r.responsibleDepartment ?? null},
              ${r.responsibleUserId ?? null}, ${r.escalationDepartment ?? null},
              ${r.notes ?? null}, ${iso(r.updatedAt)}, ${r.updatedBy ?? null},
              ${sql.json(jsonbDefault(r.audit, []))}::jsonb)
      ON CONFLICT (stage) DO NOTHING
    `
  })
})

seeders.push(async (sql) => {
  const rows = loadJson('cc_rules.json')
  return seedTable(sql, 'cc_rules', rows, async (sql, r) => {
    return await sql`
      INSERT INTO cc_rules (id, sheet, scope, scope_value, contexts, cc_user_ids, enabled,
                            source_rule_text, created_at, created_by, disabled_at, disabled_by,
                            disabled_reason, audit_log)
      VALUES (${r.id}, ${r.sheet}, ${r.scope}, ${r.scopeValue ?? null},
              ${sql.json(jsonbDefault(r.contexts, []))}::jsonb,
              ${sql.json(jsonbDefault(r.ccUserIds, []))}::jsonb,
              ${boolOrNull(r.enabled) ?? true}, ${r.sourceRuleText ?? null},
              ${iso(r.createdAt) ?? sql`NOW()`}, ${r.createdBy ?? null},
              ${iso(r.disabledAt)}, ${r.disabledBy ?? null}, ${r.disabledReason ?? null},
              ${sql.json(jsonbDefault(r.auditLog, []))}::jsonb)
      ON CONFLICT (id) DO NOTHING
    `
  })
})

seeders.push(async (sql) => {
  const obj = loadJson('reminder_thresholds.json')
  const rows = Object.entries(obj).map(([kind, v]) => ({ kind, ...v }))
  return seedTable(sql, 'reminder_thresholds', rows, async (sql, r) => {
    return await sql`
      INSERT INTO reminder_thresholds (kind, threshold_days, anchor_event, description)
      VALUES (${r.kind}, ${intOrNull(r.thresholdDays) ?? 0}, ${r.anchorEvent ?? ''}, ${r.description ?? null})
      ON CONFLICT (kind) DO NOTHING
    `
  })
})

// Layer 2: school_groups + school_spocs (FK to schools)

seeders.push(async (sql) => {
  const rows = loadJson('school_groups.json')
  return seedTable(sql, 'school_groups', rows, async (sql, g) => {
    return await sql`
      INSERT INTO school_groups (id, name, region, member_school_ids, group_mou_id, notes,
                                 primary_contact, primary_email, primary_phone, gst_number,
                                 created_at, created_by, audit_log)
      VALUES (${g.id}, ${g.name}, ${g.region ?? null},
              ${arrTextOrEmpty(g.memberSchoolIds)},
              ${g.groupMouId ?? null}, ${g.notes ?? null},
              ${g.primaryContact ?? null}, ${g.primaryEmail ?? null}, ${g.primaryPhone ?? null},
              ${g.gstNumber ?? null},
              ${iso(g.createdAt) ?? sql`NOW()`}, ${g.createdBy ?? null},
              ${sql.json(jsonbDefault(g.auditLog, []))}::jsonb)
      ON CONFLICT (id) DO NOTHING
    `
  })
})

seeders.push(async (sql) => {
  const rows = loadJson('school_spocs.json')
  return seedTable(sql, 'school_spocs', rows, async (sql, s) => {
    return await sql`
      INSERT INTO school_spocs (id, school_id, name, designation, email, phone, role, active,
                                source_sheet, source_row, created_at, created_by, audit_log)
      VALUES (${s.id}, ${s.schoolId}, ${s.name}, ${s.designation ?? null}, ${s.email},
              ${s.phone ?? null}, ${s.role ?? 'primary'}, ${boolOrNull(s.active) ?? true},
              ${s.sourceSheet ?? null}, ${intOrNull(s.sourceRow)},
              ${iso(s.createdAt) ?? sql`NOW()`}, ${s.createdBy ?? null},
              ${sql.json(jsonbDefault(s.auditLog, []))}::jsonb)
      ON CONFLICT (id) DO NOTHING
    `
  })
})

// Layer 3: mous (FK to schools, school_groups, sales_team)
//
// Phase 7 Part 3 Pause 2 follow-up: 5 historical 2025-26 MOUs were
// stripped from src/data/mous.json but their payment rows (and PIs:
// MTPL/25-26/1, /2, /4) still reference them in src/data/payments.json.
// Restore them from src/data/_snapshots/mou-system/mous.json (the
// pre-W4-A.2 snapshot of 152 rows) tagged with cohortStatus='archived'
// so they land before their payments and the FK chain holds.
//
// Counter safety: the seed never calls issuePiNumberAtomic. It only
// INSERTs the pi_number field verbatim from the source JSON. The
// pi_counter / pi_counter_map values get copied into the `counters`
// table as JSONB blobs at the end of the seed, including their
// priorFiscalYears['2526'] entries. No PI number is minted by the
// seed; restoring historical PI records is data import, not issuance.

const RESTORE_ARCHIVED_MOU_IDS = new Set([
  'MOU-STEAM-2526-001',
  'MOU-STEAM-2526-027',
  'MOU-YP-2526-001',
  'MOU-YP-2526-002',
  'MOU-YP-2526-003',
])

seeders.push(async (sql) => {
  const current = loadJson('mous.json')
  const currentIds = new Set(current.map((m) => m.id))
  const snapshot = loadJson('_snapshots/mou-system/mous.json')
  const restored = snapshot
    .filter((m) => RESTORE_ARCHIVED_MOU_IDS.has(m.id) && !currentIds.has(m.id))
    .map((m) => ({
      ...m,
      cohortStatus: 'archived',
      importNotes: 'Phase 7 archive recovery: restored from _snapshots/mou-system pre-W4-A.2 snapshot. Parent of payment rows that survived in payments.json.',
    }))
  const rows = [...current, ...restored]
  return seedTable(sql, 'mous', rows, async (sql, m) => {
    return await sql`
      INSERT INTO mous (
        id, school_id, school_name, programme, programme_sub_type, school_scope, school_group_id,
        status, cohort_status, academic_year, effective_date, start_date, end_date, number_of_years,
        students_mou, students_actual, students_variance, students_variance_pct,
        sp_without_tax, sp_with_tax, contract_value, received, tds, balance, received_pct,
        trainer_model, sales_person_id, template_version, generated_at, notes, delay_notes,
        days_to_expiry, sales_channel, school_crm_id, signed_mou_pdf_path, import_notes,
        product_selection, payment_schedule, payment_schedules, yearly_pricing, billing_block,
        draft_variables, dispatch_override, gradewise_distribution, student_count_event_ids, audit_log
      )
      VALUES (
        ${m.id}, ${m.schoolId}, ${m.schoolName}, ${m.programme},
        ${m.programmeSubType ?? null}, ${m.schoolScope ?? 'SINGLE'},
        ${m.schoolGroupId ?? null}, ${m.status ?? 'Draft'},
        ${m.cohortStatus ?? 'active'}, ${m.academicYear ?? null},
        ${iso(m.effectiveDate)}, ${iso(m.startDate)}, ${iso(m.endDate)},
        ${intOrNull(m.numberOfYears)},
        ${intOrNull(m.studentsMou)}, ${intOrNull(m.studentsActual)},
        ${intOrNull(m.studentsVariance)}, ${num(m.studentsVariancePct)},
        ${num(m.spWithoutTax)}, ${num(m.spWithTax)}, ${num(m.contractValue)},
        ${num(m.received)}, ${num(m.tds)}, ${num(m.balance)}, ${num(m.receivedPct)},
        ${m.trainerModel ?? null}, ${m.salesPersonId ?? null}, ${m.templateVersion ?? null},
        ${iso(m.generatedAt)}, ${m.notes ?? null}, ${m.delayNotes ?? null},
        ${intOrNull(m.daysToExpiry)}, ${m.salesChannel ?? null}, ${m.schoolCrmId ?? null},
        ${m.signedMouPdfPath ?? null}, ${m.importNotes ?? null},
        ${m.productSelection ?? null},
        ${m.paymentSchedule == null ? null : sql.json(m.paymentSchedule)}::jsonb,
        ${m.paymentSchedules == null ? null : sql.json(m.paymentSchedules)}::jsonb,
        ${m.yearlyPricing == null ? null : sql.json(m.yearlyPricing)}::jsonb,
        ${m.billingBlock == null ? null : sql.json(m.billingBlock)}::jsonb,
        ${m.draftVariables == null ? null : sql.json(m.draftVariables)}::jsonb,
        ${m.dispatchOverride == null ? null : sql.json(m.dispatchOverride)}::jsonb,
        ${m.gradewiseDistribution == null ? null : sql.json(m.gradewiseDistribution)}::jsonb,
        ${sql.json(jsonbDefault(m.studentCountEventIds, []))}::jsonb,
        ${sql.json(jsonbDefault(m.auditLog, []))}::jsonb
      )
      ON CONFLICT (id) DO NOTHING
    `
  })
})

// Layer 4: payments (FK to mous)

seeders.push(async (sql) => {
  const rows = loadJson('payments.json')
  return seedTable(sql, 'payments', rows, async (sql, p) => {
    return await sql`
      INSERT INTO payments (
        id, mou_id, school_name, programme, instalment_label, instalment_seq, total_instalments,
        description, due_date_raw, due_date_iso, expected_amount, received_amount, received_date,
        payment_mode, bank_reference, pi_number, tax_invoice_number, status, notes,
        pi_sent_date, pi_sent_to, pi_generated_at, pi_voided_at, pi_void_reason,
        student_count_actual, partial_payments, bank_amount, tds_amount, tds_certificate_ref,
        tds_rate, percent_share, nominal_amount, adjustment_from_locked_installments,
        net_due, locked_at, is_locked, audit_log
      )
      VALUES (
        ${p.id}, ${p.mouId}, ${p.schoolName ?? ''}, ${p.programme ?? ''},
        ${p.instalmentLabel ?? ''}, ${intOrNull(p.instalmentSeq) ?? 1},
        ${intOrNull(p.totalInstalments) ?? 1}, ${p.description ?? null},
        ${p.dueDateRaw ?? null}, ${iso(p.dueDateIso)},
        ${num(p.expectedAmount) ?? 0}, ${num(p.receivedAmount)}, ${iso(p.receivedDate)},
        ${p.paymentMode ?? null}, ${p.bankReference ?? null}, ${p.piNumber ?? null},
        ${p.taxInvoiceNumber ?? null}, ${p.status ?? 'Pending'}, ${p.notes ?? null},
        ${iso(p.piSentDate)}, ${p.piSentTo ?? null}, ${iso(p.piGeneratedAt)},
        ${iso(p.piVoidedAt)}, ${p.piVoidReason ?? null},
        ${intOrNull(p.studentCountActual)},
        ${sql.json(jsonbDefault(p.partialPayments, []))}::jsonb,
        ${num(p.bankAmount)}, ${num(p.tdsAmount)}, ${p.tdsCertificateRef ?? null},
        ${num(p.tdsRate)}, ${num(p.percentShare)}, ${num(p.nominalAmount)},
        ${num(p.adjustmentFromLockedInstallments)}, ${num(p.netDue)},
        ${iso(p.lockedAt)}, ${!!p.isLocked},
        ${sql.json(jsonbDefault(p.auditLog, []))}::jsonb
      )
      ON CONFLICT (id) DO NOTHING
    `
  })
})

// Layer 5: signed_values + student_count_events (FK to mous + payments)

seeders.push(async (sql) => {
  const rows = loadJson('signed_values.json')
  return seedTable(sql, 'signed_values', rows, async (sql, s) => {
    return await sql`
      INSERT INTO signed_values (mou_id, signed_date, signed_by, price_per_student, student_count,
                                 duration, signed_scan_url, captured_at, notes)
      VALUES (${s.mouId}, ${iso(s.signedDate)}, ${s.signedBy ?? null},
              ${num(s.pricePerStudent)}, ${intOrNull(s.studentCount)},
              ${intOrNull(s.duration)}, ${s.signedScanUrl ?? null},
              ${iso(s.capturedAt)}, ${s.notes ?? null})
      ON CONFLICT (mou_id) DO NOTHING
    `
  })
})

seeders.push(async (sql) => {
  const rows = loadJson('student_count_events.json')
  return seedTable(sql, 'student_count_events', rows, async (sql, e) => {
    return await sql`
      INSERT INTO student_count_events (id, mou_id, new_count, previous_count, effective_date,
                                        recorded_at, recorded_by, reason, related_installment_id,
                                        notes, recalc_impact, audit_log)
      VALUES (${e.id}, ${e.mouId}, ${intOrNull(e.newCount) ?? 0}, ${intOrNull(e.previousCount)},
              ${iso(e.effectiveDate)}, ${iso(e.recordedAt) ?? sql`NOW()`},
              ${e.recordedBy ?? null}, ${e.reason ?? null}, ${e.relatedInstallmentId ?? null},
              ${e.notes ?? null},
              ${e.recalcImpact == null ? null : sql.json(e.recalcImpact)}::jsonb,
              ${sql.json(jsonbDefault(e.auditLog, []))}::jsonb)
      ON CONFLICT (id) DO NOTHING
    `
  })
})

// Layer 6: dispatch_requests, dispatches, kit_dispatches, intake_records

seeders.push(async (sql) => {
  const rows = loadJson('dispatch_requests.json')
  return seedTable(sql, 'dispatch_requests', rows, async (sql, d) => {
    return await sql`
      INSERT INTO dispatch_requests (id, mou_id, school_id, requested_by, requested_at,
                                     request_reason, instalment_seq, line_items, status,
                                     conversion_dispatch_id, rejection_reason, reviewed_by,
                                     reviewed_at, notes, audit_log)
      VALUES (${d.id}, ${d.mouId}, ${d.schoolId}, ${d.requestedBy}, ${iso(d.requestedAt)},
              ${d.requestReason ?? null}, ${intOrNull(d.instalmentSeq)},
              ${sql.json(jsonbDefault(d.lineItems, []))}::jsonb,
              ${d.status ?? 'pending-approval'},
              ${d.conversionDispatchId ?? null}, ${d.rejectionReason ?? null},
              ${d.reviewedBy ?? null}, ${iso(d.reviewedAt)}, ${d.notes ?? null},
              ${sql.json(jsonbDefault(d.auditLog, []))}::jsonb)
      ON CONFLICT (id) DO NOTHING
    `
  })
})

seeders.push(async (sql) => {
  const rows = loadJson('dispatches.json')
  return seedTable(sql, 'dispatches', rows, async (sql, d) => {
    return await sql`
      INSERT INTO dispatches (id, mou_id, school_id, instalment_seq, stage, installment1_paid,
                              override_event, po_raised_at, dispatched_at, delivered_at,
                              acknowledged_at, acknowledgement_url, notes, line_items, request_id,
                              raised_by, raised_from, audit_log)
      VALUES (${d.id}, ${d.mouId ?? null}, ${d.schoolId}, ${intOrNull(d.instalmentSeq)},
              ${d.stage ?? 'pending'},
              ${boolOrNull(d.installment1Paid)},
              ${d.overrideEvent == null ? null : sql.json(d.overrideEvent)}::jsonb,
              ${iso(d.poRaisedAt)}, ${iso(d.dispatchedAt)}, ${iso(d.deliveredAt)},
              ${iso(d.acknowledgedAt)}, ${d.acknowledgementUrl ?? null}, ${d.notes ?? null},
              ${sql.json(jsonbDefault(d.lineItems, []))}::jsonb,
              ${d.requestId ?? null}, ${d.raisedBy ?? null}, ${d.raisedFrom ?? null},
              ${sql.json(jsonbDefault(d.auditLog, []))}::jsonb)
      ON CONFLICT (id) DO NOTHING
    `
  })
})

seeders.push(async (sql) => {
  const rows = loadJson('kit_dispatches.json')
  return seedTable(sql, 'kit_dispatches', rows, async (sql, k) => {
    return await sql`
      INSERT INTO kit_dispatches (id, mou_id, school_id, school_name, product_selected,
                                  dispatch_status, allocations, sales_approval_status,
                                  sales_approved_by, sales_approved_at, sales_rejection_reason,
                                  dispatch_summary, shipment_tracking, pod, import_notes,
                                  created_at, audit_log)
      VALUES (${k.id}, ${k.mouId}, ${k.schoolId}, ${k.schoolName ?? ''},
              ${k.productSelected ?? null}, ${k.dispatchStatus ?? 'Draft'},
              ${sql.json(jsonbDefault(k.allocations, []))}::jsonb,
              ${k.salesApprovalStatus ?? null}, ${k.salesApprovedBy ?? null},
              ${iso(k.salesApprovedAt)}, ${k.salesRejectionReason ?? null},
              ${k.dispatchSummary == null ? null : sql.json(k.dispatchSummary)}::jsonb,
              ${k.shipmentTracking == null ? null : sql.json(k.shipmentTracking)}::jsonb,
              ${k.pod == null ? null : sql.json(k.pod)}::jsonb,
              ${k.importNotes ?? null},
              ${iso(k.createdAt) ?? sql`NOW()`},
              ${sql.json(jsonbDefault(k.auditLog, []))}::jsonb)
      ON CONFLICT (id) DO NOTHING
    `
  })
})

seeders.push(async (sql) => {
  const rows = loadJson('intake_records.json')
  return seedTable(sql, 'intake_records', rows, async (sql, i) => {
    return await sql`
      INSERT INTO intake_records (id, mou_id, completed_at, completed_by, sales_owner_id,
                                  location, grades, recipient_name, recipient_designation,
                                  recipient_email, students_at_intake, duration_years,
                                  start_date, end_date, physical_submission_status,
                                  soft_copy_submission_status, product_confirmed, gsl_training_mode,
                                  school_point_of_contact_name, school_point_of_contact_phone,
                                  signed_mou_url, thank_you_email_sent_at, grade_breakdown,
                                  rechargeable_batteries, audit_log)
      VALUES (${i.id}, ${i.mouId}, ${iso(i.completedAt) ?? sql`NOW()`}, ${i.completedBy ?? null},
              ${i.salesOwnerId ?? null}, ${i.location ?? null},
              ${i.grades == null ? null : sql.json(i.grades)}::jsonb,
              ${i.recipientName ?? null}, ${i.recipientDesignation ?? null},
              ${i.recipientEmail ?? null}, ${intOrNull(i.studentsAtIntake)},
              ${intOrNull(i.durationYears)}, ${iso(i.startDate)}, ${iso(i.endDate)},
              ${i.physicalSubmissionStatus ?? null}, ${i.softCopySubmissionStatus ?? null},
              ${i.productConfirmed ?? null}, ${i.gslTrainingMode ?? null},
              ${i.schoolPointOfContactName ?? null}, ${i.schoolPointOfContactPhone ?? null},
              ${i.signedMouUrl ?? null}, ${iso(i.thankYouEmailSentAt)},
              ${i.gradeBreakdown == null ? null : sql.json(i.gradeBreakdown)}::jsonb,
              ${intOrNull(i.rechargeableBatteries)},
              ${sql.json(jsonbDefault(i.auditLog, []))}::jsonb)
      ON CONFLICT (id) DO NOTHING
    `
  })
})

// Layer 7: communications first (FK only to schools + mous), then
// magic_link_tokens (FK to mous + communications, so must wait for both).

seeders.push(async (sql) => {
  const rows = loadJson('communications.json')
  return seedTable(sql, 'communications', rows, async (sql, c) => {
    return await sql`
      INSERT INTO communications (id, type, school_id, mou_id, instalment_seq, channel, subject,
                                  body_email, body_whats_app, to_email, to_phone, cc_emails,
                                  queued_at, queued_by, sent_at, copied_at, status, bounce_detail,
                                  audit_log)
      VALUES (${c.id}, ${c.type}, ${c.schoolId}, ${c.mouId ?? null},
              ${intOrNull(c.instalmentSeq)}, ${c.channel ?? null}, ${c.subject ?? null},
              ${c.bodyEmail ?? null}, ${c.bodyWhatsApp ?? null},
              ${c.toEmail ?? null}, ${c.toPhone ?? null},
              ${sql.json(jsonbDefault(c.ccEmails, []))}::jsonb,
              ${iso(c.queuedAt) ?? sql`NOW()`}, ${c.queuedBy ?? null},
              ${iso(c.sentAt)}, ${iso(c.copiedAt)}, ${c.status ?? 'queued'},
              ${c.bounceDetail ?? null},
              ${sql.json(jsonbDefault(c.auditLog, []))}::jsonb)
      ON CONFLICT (id) DO NOTHING
    `
  })
})

seeders.push(async (sql) => {
  const rows = loadJson('magic_link_tokens.json')
  return seedTable(sql, 'magic_link_tokens', rows, async (sql, t) => {
    return await sql`
      INSERT INTO magic_link_tokens (id, purpose, mou_id, instalment_seq, spoc_email, issued_at,
                                     expires_at, used_at, used_by_ip, last_viewed_at, view_count,
                                     communication_id)
      VALUES (${t.id}, ${t.purpose}, ${t.mouId}, ${intOrNull(t.instalmentSeq)},
              ${t.spocEmail ?? null},
              ${iso(t.issuedAt) ?? sql`NOW()`}, ${iso(t.expiresAt) ?? sql`NOW() + INTERVAL '30 days'`},
              ${iso(t.usedAt)}, ${t.usedByIp ?? null}, ${iso(t.lastViewedAt)},
              ${intOrNull(t.viewCount) ?? 0}, ${t.communicationId ?? null})
      ON CONFLICT (id) DO NOTHING
    `
  })
})

// Layer 8: feedback (FK to schools, mous, magic_link_tokens), escalations, notifications

// FBK-004 is fixture data: schoolId references the demo SCH-CEDARHEIGHTS-CHN
// orphan cohort, submitterEmail uses the RFC-reserved example.test domain,
// no auditLog or magicLinkTokenId. Skip at read time per Anish 2026-05-23 GO.
// Do not modify source feedback.json.
const SKIP_FEEDBACK_IDS = new Set(['FBK-004'])

seeders.push(async (sql) => {
  const rows = loadJson('feedback.json').filter((f) => !SKIP_FEEDBACK_IDS.has(f.id))
  return seedTable(sql, 'feedback', rows, async (sql, f) => {
    return await sql`
      INSERT INTO feedback (id, school_id, mou_id, instalment_seq, submitted_at, submitted_by,
                            submitter_email, ratings, overall_comment, magic_link_token_id, audit_log)
      VALUES (${f.id}, ${f.schoolId}, ${f.mouId}, ${intOrNull(f.instalmentSeq)},
              ${iso(f.submittedAt) ?? sql`NOW()`}, ${f.submittedBy ?? 'spoc'},
              ${f.submitterEmail ?? null},
              ${sql.json(jsonbDefault(f.ratings, []))}::jsonb,
              ${f.overallComment ?? null}, ${f.magicLinkTokenId ?? null},
              ${sql.json(jsonbDefault(f.auditLog, []))}::jsonb)
      ON CONFLICT (id) DO NOTHING
    `
  })
})

seeders.push(async (sql) => {
  const rows = loadJson('escalations.json')
  return seedTable(sql, 'escalations', rows, async (sql, e) => {
    return await sql`
      INSERT INTO escalations (id, created_at, created_by, school_id, mou_id, stage, lane, level,
                               origin, origin_id, severity, description, assigned_to, notified_emails,
                               status, category, type, owned_by_department, transferred_from_department,
                               transferred_to_department, transferred_at, transfer_reason,
                               sla_target_date, sla_breached, waiting_on, resolution_notes,
                               resolved_at, resolved_by, comments, audit_log)
      VALUES (${e.id}, ${iso(e.createdAt) ?? sql`NOW()`}, ${e.createdBy ?? null},
              ${e.schoolId}, ${e.mouId ?? null},
              ${e.stage ?? null}, ${e.lane ?? null}, ${intOrNull(e.level)},
              ${e.origin ?? null}, ${e.originId ?? null}, ${e.severity ?? 'low'},
              ${e.description ?? null}, ${e.assignedTo ?? null},
              ${sql.json(jsonbDefault(e.notifiedEmails, []))}::jsonb,
              ${e.status ?? 'Open'}, ${e.category ?? null}, ${e.type ?? null},
              ${e.ownedByDepartment ?? null}, ${e.transferredFromDepartment ?? null},
              ${e.transferredToDepartment ?? null}, ${iso(e.transferredAt)}, ${e.transferReason ?? null},
              ${iso(e.slaTargetDate)}, ${boolOrNull(e.slaBreached)},
              ${e.waitingOn ?? null}, ${e.resolutionNotes ?? null},
              ${iso(e.resolvedAt)}, ${e.resolvedBy ?? null},
              ${sql.json(jsonbDefault(e.comments, []))}::jsonb,
              ${sql.json(jsonbDefault(e.auditLog, []))}::jsonb)
      ON CONFLICT (id) DO NOTHING
    `
  })
})

seeders.push(async (sql) => {
  const rows = loadJson('notifications.json')
  return seedTable(sql, 'notifications', rows, async (sql, n) => {
    return await sql`
      INSERT INTO notifications (id, recipient_user_id, sender_user_id, kind, title, body,
                                 action_url, payload, created_at, read_at, audit_log)
      VALUES (${n.id}, ${n.recipientUserId}, ${n.senderUserId ?? null}, ${n.kind ?? 'reminder-due'},
              ${n.title ?? ''}, ${n.body ?? null}, ${n.actionUrl ?? null},
              ${sql.json(jsonbDefault(n.payload, {}))}::jsonb,
              ${iso(n.createdAt) ?? sql`NOW()`}, ${iso(n.readAt)},
              ${sql.json(jsonbDefault(n.auditLog, []))}::jsonb)
      ON CONFLICT (id) DO NOTHING
    `
  })
})

// Layer 9: payment_logs, adjustments

seeders.push(async (sql) => {
  const rows = loadJson('payment_logs.json')
  return seedTable(sql, 'payment_logs', rows, async (sql, p) => {
    return await sql`
      INSERT INTO payment_logs (id, date, amount, mode, reference, narration, sales_person_id,
                                matched_installment_ids, unmatched, audit_log)
      VALUES (${p.id}, ${iso(p.date) ?? sql`NOW()`}, ${num(p.amount) ?? 0},
              ${p.mode ?? null}, ${p.reference ?? null}, ${p.narration ?? null},
              ${p.salesPersonId ?? null},
              ${sql.json(jsonbDefault(p.matchedInstallmentIds, []))}::jsonb,
              ${boolOrNull(p.unmatched) ?? true},
              ${sql.json(jsonbDefault(p.auditLog, []))}::jsonb)
      ON CONFLICT (id) DO NOTHING
    `
  })
})

seeders.push(async (sql) => {
  const rows = loadJson('adjustments.json')
  return seedTable(sql, 'adjustments', rows, async (sql, a) => {
    return await sql`
      INSERT INTO adjustments (id, mou_id, school_id, triggered_by_event, triggered_at, triggered_by,
                               original_installment_id, applied_to_installment_id, amount_delta,
                               reason, before_amount, after_amount, status)
      VALUES (${a.id}, ${a.mouId}, ${a.schoolId}, ${a.triggeredByEvent ?? 'manual'},
              ${iso(a.triggeredAt) ?? sql`NOW()`}, ${a.triggeredBy ?? null},
              ${a.originalInstallmentId}, ${a.appliedToInstallmentId ?? null},
              ${num(a.amountDelta) ?? 0}, ${a.reason ?? null},
              ${num(a.beforeAmount) ?? 0}, ${num(a.afterAmount) ?? 0},
              ${a.status ?? 'Active'})
      ON CONFLICT (id) DO NOTHING
    `
  })
})

// Layer 10: VEX

seeders.push(async (sql) => {
  const rows = loadJson('vex_pis.json')
  return seedTable(sql, 'vex_pis', rows, async (sql, p) => {
    return await sql`
      INSERT INTO vex_pis (id, pi_number, entity_key, issue_date, school_name, shipping_address,
                           billing_name, billing_address, school_gst_number, contact_person,
                           contact_no, line_items, subtotal, freight_charges, taxable_value,
                           gst_pct, gst_amount, total, status, generated_by, generated_at,
                           payment_received_amount, payment_log_ids, notes, audit_log)
      VALUES (${p.id}, ${p.piNumber ?? null}, ${p.entityKey ?? null}, ${iso(p.issueDate)},
              ${p.schoolName ?? null}, ${p.shippingAddress ?? null}, ${p.billingName ?? null},
              ${p.billingAddress ?? null}, ${p.schoolGstNumber ?? null},
              ${p.contactPerson ?? null}, ${p.contactNo ?? null},
              ${sql.json(jsonbDefault(p.lineItems, []))}::jsonb,
              ${num(p.subtotal)}, ${num(p.freightCharges)}, ${num(p.taxableValue)},
              ${num(p.gstPct)}, ${num(p.gstAmount)}, ${num(p.total)},
              ${p.status ?? null}, ${p.generatedBy ?? null}, ${iso(p.generatedAt)},
              ${num(p.paymentReceivedAmount)},
              ${sql.json(jsonbDefault(p.paymentLogIds, []))}::jsonb,
              ${p.notes ?? null},
              ${sql.json(jsonbDefault(p.auditLog, []))}::jsonb)
      ON CONFLICT (id) DO NOTHING
    `
  })
})

seeders.push(async (sql) => {
  const rows = loadJson('vex_dispatches.json')
  return seedTable(sql, 'vex_dispatches', rows, async (sql, d) => {
    return await sql`
      INSERT INTO vex_dispatches (id, pi_id, items, freight, mode, status, requested_by,
                                  requested_at, tax_invoice_number, tax_invoice_path, invoiced_at,
                                  notes, supporting_doc_path, warehouse_email_sent_at,
                                  warehouse_email_sent_by, audit_log)
      VALUES (${d.id}, ${d.piId},
              ${sql.json(jsonbDefault(d.items, []))}::jsonb,
              ${num(d.freight)}, ${d.mode ?? null}, ${d.status ?? null},
              ${d.requestedBy ?? null}, ${iso(d.requestedAt)},
              ${d.taxInvoiceNumber ?? null}, ${d.taxInvoicePath ?? null}, ${iso(d.invoicedAt)},
              ${d.notes ?? null}, ${d.supportingDocPath ?? null},
              ${iso(d.warehouseEmailSentAt)}, ${d.warehouseEmailSentBy ?? null},
              ${sql.json(jsonbDefault(d.auditLog, []))}::jsonb)
      ON CONFLICT (id) DO NOTHING
    `
  })
})

seeders.push(async (sql) => {
  const rows = loadJson('vex_orders.json')
  return seedTable(sql, 'vex_orders', rows, async (sql, o) => {
    return await sql`
      INSERT INTO vex_orders (id, order_date, school_id, school_name, school_name_normalised,
                              buyer_address, consignee_address, voucher_number, voucher_type,
                              line_items, subtotal, freight_charges, sgst, cgst, igst, round_off,
                              total, payment_received, payment_date, dispatch_status, dispatch_date,
                              invoice_date, sales_person_id, imported_from_tally, audit_log)
      VALUES (${o.id}, ${iso(o.orderDate)}, ${o.schoolId ?? null},
              ${o.schoolName ?? null}, ${o.schoolNameNormalised ?? null},
              ${o.buyerAddress ?? null}, ${o.consigneeAddress ?? null},
              ${o.voucherNumber ?? null}, ${o.voucherType ?? null},
              ${sql.json(jsonbDefault(o.lineItems, []))}::jsonb,
              ${num(o.subtotal)}, ${num(o.freightCharges)},
              ${num(o.sgst)}, ${num(o.cgst)}, ${num(o.igst)}, ${num(o.roundOff)},
              ${num(o.total)}, ${boolOrNull(o.paymentReceived)}, ${iso(o.paymentDate)},
              ${o.dispatchStatus ?? null}, ${iso(o.dispatchDate)}, ${iso(o.invoiceDate)},
              ${o.salesPersonId ?? null}, ${boolOrNull(o.importedFromTally) ?? true},
              ${sql.json(jsonbDefault(o.auditLog, []))}::jsonb)
      ON CONFLICT (id) DO NOTHING
    `
  })
})

// Layer 11: vendors-dependent, sales-pipeline, import review

seeders.push(async (sql) => {
  const rows = loadJson('agreements.json')
  return seedTable(sql, 'agreements', rows, async (sql, a) => {
    return await sql`
      INSERT INTO agreements (id, type, party_name, vendor_id, nature_of_agreement, product,
                              department, key_terms, start_date, end_date, tenure, notice_period,
                              vendor_location, physical_custody, document_url, days_to_expiry,
                              audit_log)
      VALUES (${a.id}, ${a.type ?? 'Vendor'}, ${a.partyName ?? null}, ${a.vendorId ?? null},
              ${a.natureOfAgreement ?? null}, ${a.product ?? null}, ${a.department ?? null},
              ${a.keyTerms ?? null}, ${iso(a.startDate)}, ${iso(a.endDate)},
              ${a.tenure ?? null}, ${a.noticePeriod ?? null},
              ${a.vendorLocation ?? null}, ${a.physicalCustody ?? null},
              ${a.documentUrl ?? null}, ${intOrNull(a.daysToExpiry)},
              ${sql.json(jsonbDefault(a.auditLog, []))}::jsonb)
      ON CONFLICT (id) DO NOTHING
    `
  })
})

seeders.push(async (sql) => {
  const rows = loadJson('sales_opportunities.json')
  return seedTable(sql, 'sales_opportunities', rows, async (sql, o) => {
    return await sql`
      INSERT INTO sales_opportunities (id, school_name, school_id, city, state, region,
                                       sales_rep_id, programme_proposed, gsl_model, commitments_made,
                                       out_of_scope_requirements, recce_status, recce_completed_at,
                                       status, approval_notes, conversion_mou_id, loss_reason,
                                       school_match_dismissed, created_at, created_by, audit_log)
      VALUES (${o.id}, ${o.schoolName ?? ''}, ${o.schoolId ?? null},
              ${o.city ?? null}, ${o.state ?? null}, ${o.region ?? null},
              ${o.salesRepId}, ${o.programmeProposed ?? null}, ${o.gslModel ?? null},
              ${o.commitmentsMade ?? null}, ${o.outOfScopeRequirements ?? null},
              ${o.recceStatus ?? null}, ${iso(o.recceCompletedAt)},
              ${o.status ?? null}, ${o.approvalNotes ?? null},
              ${o.conversionMouId ?? null}, ${o.lossReason ?? null},
              ${boolOrNull(o.schoolMatchDismissed)},
              ${iso(o.createdAt) ?? sql`NOW()`}, ${o.createdBy ?? null},
              ${sql.json(jsonbDefault(o.auditLog, []))}::jsonb)
      ON CONFLICT (id) DO NOTHING
    `
  })
})

seeders.push(async (sql) => {
  const rows = loadJson('mou_import_review.json')
  return seedTable(sql, 'mou_import_review', rows, async (sql, r) => {
    return await sql`
      INSERT INTO mou_import_review (queued_at, raw_record, validation_failed, quarantine_reason,
                                     candidates, resolved_at, resolved_by, resolution,
                                     rejection_reason, rejection_notes)
      VALUES (${iso(r.queuedAt) ?? sql`NOW()`}, ${sql.json(r.rawRecord ?? {})}::jsonb,
              ${r.validationFailed ?? null}, ${r.quarantineReason ?? null},
              ${r.candidates == null ? null : sql.json(r.candidates)}::jsonb,
              ${iso(r.resolvedAt)}, ${r.resolvedBy ?? null}, ${r.resolution ?? null},
              ${r.rejectionReason ?? null}, ${r.rejectionNotes ?? null})
    `
  })
})

// Layer 12: chain_dismissals, homepage_action_log, sync_health, counters

seeders.push(async (sql) => {
  const obj = loadJson('chain_dismissals.json')
  const rows = (obj.dismissedSchoolIds ?? []).map((id) => ({ schoolId: id }))
  return seedTable(sql, 'chain_dismissals', rows, async (sql, r) => {
    return await sql`
      INSERT INTO chain_dismissals (school_id) VALUES (${r.schoolId})
      ON CONFLICT (school_id) DO NOTHING
    `
  })
})

seeders.push(async (sql) => {
  const rows = loadJson('homepage_action_log.json')
  return seedTable(sql, 'homepage_action_log', rows, async (sql, h) => {
    return await sql`
      INSERT INTO homepage_action_log (date, user_id, item_id, seen_at, actioned_at, dismissed_at,
                                       promoted_to_overdue)
      VALUES (${h.date}, ${h.userId}, ${h.itemId},
              ${iso(h.seenAt)}, ${iso(h.actionedAt)}, ${iso(h.dismissedAt)},
              ${boolOrNull(h.promotedToOverdue)})
      ON CONFLICT (date, user_id, item_id) DO NOTHING
    `
  })
})

seeders.push(async (sql) => {
  const rows = loadJson('sync_health.json')
  return seedTable(sql, 'sync_health', rows, async (sql, s) => {
    return await sql`
      INSERT INTO sync_health (at, kind, ok, triggered_by, import_summary, health_checks, anomalies)
      VALUES (${iso(s.at) ?? sql`NOW()`}, ${s.kind ?? 'sync'}, ${!!s.ok},
              ${s.triggeredBy ?? null},
              ${s.importSummary == null ? null : sql.json(s.importSummary)}::jsonb,
              ${s.healthChecks == null ? null : sql.json(s.healthChecks)}::jsonb,
              ${sql.json(jsonbDefault(s.anomalies, []))}::jsonb)
    `
  })
})

seeders.push(async (sql) => {
  const counters = []
  try { counters.push({ key: 'pi_counter', value: loadJson('pi_counter.json') }) } catch {}
  try { counters.push({ key: 'pi_counter_map', value: loadJson('pi_counter_map.json') }) } catch {}
  return seedTable(sql, 'counters', counters, async (sql, c) => {
    return await sql`
      INSERT INTO counters (key, value) VALUES (${c.key}, ${sql.json(c.value)}::jsonb)
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
    `
  })
})

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const sql = postgres(url, { max: 1, onnotice: () => {} })

const results = []
const startedAt = Date.now()

try {
  console.log(`[seed] mode=${MODE} host=${url.match(/@([^/]+)/)?.[1] ?? '(unknown)'}`)

  await sql.begin(async (tx) => {
    for (const fn of seeders) {
      const r = await fn(tx)
      results.push(r)
      const ok = r.failed === 0 ? 'ok' : `FAIL(${r.failed})`
      console.log(
        `  ${r.table}: source=${r.source} inserted=${r.inserted} expected-skip=${r.expectedSkipped} failed=${r.failed} [${ok}]`,
      )
      if (r.failedExamples.length > 0) {
        for (const ex of r.failedExamples) {
          console.log(`    - ${ex.id}: ${ex.error}`)
        }
      }
    }
    if (!APPLY) {
      throw new Error('__dry_run_rollback__')
    }
  })
  console.log(`[seed] COMMITTED in ${Date.now() - startedAt}ms`)
} catch (err) {
  if (err.message === '__dry_run_rollback__') {
    console.log(`[seed] dry-run rollback complete in ${Date.now() - startedAt}ms (no rows persisted)`)
  } else {
    console.error('[seed] FAILED:', err.message)
    process.exit(1)
  }
} finally {
  // Markdown summary the operator can paste back to Anish for review.
  const totalSource = results.reduce((s, r) => s + r.source, 0)
  const totalInserted = results.reduce((s, r) => s + r.inserted, 0)
  const totalSkipped = results.reduce((s, r) => s + r.skipped, 0)
  const totalExpectedSkipped = results.reduce((s, r) => s + r.expectedSkipped, 0)
  const totalFailed = results.reduce((s, r) => s + r.failed, 0)
  console.log('')
  console.log('| Table | Source | Inserted | Expected-skip | Failed |')
  console.log('|---|---:|---:|---:|---:|')
  for (const r of results) {
    console.log(`| ${r.table} | ${r.source} | ${r.inserted} | ${r.expectedSkipped} | ${r.failed} |`)
  }
  console.log(`| **Totals** | **${totalSource}** | **${totalInserted}** | **${totalExpectedSkipped}** | **${totalFailed}** |`)
  if (totalSkipped > 0) {
    console.log('')
    console.log(`(${totalSkipped} additional rows were ON CONFLICT-skipped due to existing ids; re-run idempotency.)`)
  }
  await sql.end({ timeout: 5 })
}
