// One-shot: migrate 6 JSON-only draft MOUs + 1 signed_values into postgres.
// Run: node scripts/migrate-orphans.mjs
import postgres from 'postgres'
import { readFileSync } from 'fs'

const envContent = readFileSync('.env.local', 'utf8')
const match = envContent.match(/^DATABASE_URL=(.+)$/m)
const url = match[1].replace(/^"/, '').replace(/"$/, '')
const endpoint = url.split('@')[1].split('/')[0]
console.log('Endpoint:', endpoint)
if (!endpoint.includes('ep-shiny-waterfall')) { console.error('ABORT: not production'); process.exit(1) }

const sql = postgres(url, { ssl: 'require', connect_timeout: 30 })

const mous = JSON.parse(readFileSync('src/data/mous.json', 'utf8'))
const svs = JSON.parse(readFileSync('src/data/signed_values.json', 'utf8'))

const ORPHAN_IDS = [
  'MOU-STEAM-2627-DRAFT-001', 'MOU-YP-2627-DRAFT-001',
  'MOU-STEAM-2627-DRAFT-002', 'MOU-YP-2627-DRAFT-002',
  'MOU-YP-2627-DRAFT-003', 'MOU-YP-2627-DRAFT-004',
]

try {
  console.log('\n=== Pre-state: confirm orphans not in postgres ===')
  const pre = await sql`SELECT id FROM mous WHERE id = ANY(${ORPHAN_IDS})`
  console.log('Already in postgres:', pre.length, pre.length > 0 ? pre.map(r => r.id).join(', ') : '(none)')

  console.log('\n=== Inserting 6 draft MOUs ===')
  let inserted = 0
  for (const id of ORPHAN_IDS) {
    const m = mous.find(x => x.id === id)
    if (!m) { console.log('  SKIP ' + id + ' (not in local JSON)'); continue }
    const exists = await sql`SELECT id FROM mous WHERE id = ${id}`
    if (exists.length > 0) { console.log('  SKIP ' + id + ' (already in postgres)'); continue }

    await sql`INSERT INTO mous (
      id, school_id, school_name, programme, programme_sub_type,
      school_scope, school_group_id, status, cohort_status, academic_year,
      start_date, end_date, number_of_years,
      students_mou, students_actual, students_variance, students_variance_pct,
      sp_without_tax, sp_with_tax, contract_value, received, tds, balance, received_pct,
      payment_schedule, trainer_model, sales_person_id,
      template_version, generated_at, notes, delay_notes, days_to_expiry,
      product_selection, draft_variables,
      payment_schedules, yearly_pricing, billing_block,
      gradewise_distribution, student_count_event_ids, audit_log
    ) VALUES (
      ${m.id}, ${m.schoolId || 'SCH-PLACEHOLDER-DRAFT'}, ${m.schoolName || ''},
      ${m.programme}, ${m.programmeSubType ?? null},
      ${m.schoolScope ?? 'SINGLE'}, ${m.schoolGroupId ?? null},
      ${m.status}, ${m.cohortStatus ?? 'active'}, ${m.academicYear ?? null},
      ${m.startDate ?? null}, ${m.endDate ?? null}, ${m.numberOfYears ?? null},
      ${m.studentsMou ?? null}, ${m.studentsActual ?? null},
      ${m.studentsVariance ?? null}, ${m.studentsVariancePct ?? null},
      ${m.spWithoutTax ?? null}, ${m.spWithTax ?? null},
      ${m.contractValue ?? null}, ${m.received ?? 0}, ${m.tds ?? 0},
      ${m.balance ?? null}, ${m.receivedPct ?? 0},
      ${m.paymentSchedule == null ? null : sql.json(m.paymentSchedule)}::jsonb,
      ${m.trainerModel ?? null}, ${m.salesPersonId || null},
      ${m.templateVersion ?? null}, ${m.generatedAt ?? null},
      ${m.notes ?? null}, ${m.delayNotes ?? null}, ${m.daysToExpiry ?? null},
      ${m.productSelection ?? null},
      ${m.draftVariables == null ? null : sql.json(m.draftVariables)}::jsonb,
      ${m.paymentSchedules == null ? null : sql.json(m.paymentSchedules)}::jsonb,
      ${m.yearlyPricing == null ? null : sql.json(m.yearlyPricing)}::jsonb,
      ${m.billingBlock == null ? null : sql.json(m.billingBlock)}::jsonb,
      ${m.gradewiseDistribution == null ? null : sql.json(m.gradewiseDistribution)}::jsonb,
      ${sql.json(m.studentCountEventIds ?? [])}::jsonb,
      ${sql.json(m.auditLog ?? [])}::jsonb
    )`
    inserted++
    console.log('  INSERTED ' + id + ' | ' + (m.schoolName || '(blank)') + ' | ' + m.programme)
  }
  console.log('Total inserted:', inserted)

  console.log('\n=== Inserting signed_values orphan ===')
  const sv = svs.find(s => s.mouId === 'MOU-YP-2627-DRAFT-003')
  if (sv) {
    const svExists = await sql`SELECT mou_id FROM signed_values WHERE mou_id = ${sv.mouId}`
    if (svExists.length > 0) {
      console.log('  SKIP (already in postgres)')
    } else {
      await sql`INSERT INTO signed_values (
        mou_id, signed_date, signed_by, price_per_student, student_count,
        duration, signed_scan_url, captured_at, notes
      ) VALUES (
        ${sv.mouId}, ${sv.signedDate}, ${sv.signedBy}, ${sv.pricePerStudent},
        ${sv.studentCount}, ${1}, ${sv.signedScanUrl ?? null},
        ${sv.capturedAt}, ${sv.notes ?? null}
      )`
      console.log('  INSERTED signed_values for ' + sv.mouId)
    }
  }

  console.log('\n=== Post-state verification ===')
  const post = await sql`SELECT id, school_name, status, programme FROM mous WHERE id = ANY(${ORPHAN_IDS}) ORDER BY id`
  console.log('Draft MOUs now in postgres:', post.length)
  post.forEach(r => console.log('  ' + r.id + ' | ' + (r.school_name || '(blank)') + ' | ' + r.programme + ' | ' + r.status))

  const postSv = await sql`SELECT mou_id, signed_by, price_per_student FROM signed_values WHERE mou_id = ${'MOU-YP-2627-DRAFT-003'}`
  console.log('Signed values in postgres:', postSv.length > 0 ? postSv[0].mou_id + ' by ' + postSv[0].signed_by : 'NOT FOUND')

  await sql.end()
  console.log('\nOrphan migration complete.')
} catch (e) {
  console.error('FATAL:', e.message)
  await sql.end()
  process.exit(1)
}
