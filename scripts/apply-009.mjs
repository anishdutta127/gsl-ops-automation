// One-shot script: apply migration 009 to production postgres.
// Run: node scripts/apply-009.mjs
import postgres from 'postgres'
import { readFileSync } from 'fs'

const envContent = readFileSync('.env.local', 'utf8')
const match = envContent.match(/^DATABASE_URL=(.+)$/m)
if (!match) { console.error('DATABASE_URL not found'); process.exit(1) }
const url = match[1].replace(/^"/, '').replace(/"$/, '')
console.log('Endpoint:', url.split('@')[1].split('/')[0])

const sql = postgres(url, { ssl: 'require', connect_timeout: 30 })

const auditCreate = JSON.stringify([{
  timestamp: '2026-05-27T00:00:00Z',
  user: 'anish.d',
  action: 'create',
  notes: 'FY 25-26 validated import. Source: gsl_2526_import_ready.json.',
}])

const auditFlag = JSON.stringify([{
  timestamp: '2026-05-27T00:00:00Z',
  user: 'anish.d',
  action: 'import-flag',
  notes: 'FY 25-26 import: possible duplicate of MOU-STEAM-2526-049. Flagged for Pranav review: genuine second engagement or data duplicate?',
}])

const auditCorrection = JSON.stringify([{
  timestamp: '2026-05-27T00:00:00Z',
  user: 'anish.d',
  action: 'import-correction',
  before: { received: 3290523 },
  after: { received: 0 },
  notes: 'FY 25-26 import: source received was erroneous (5.7x sales). Set blank pending Pranav real number.',
}])

try {
  // 1. INSERT Laxmipat Singhania Academy
  console.log('\n1. INSERT MOU-STEAM-2526-071 (Laxmipat Singhania)...')
  await sql`INSERT INTO mous (
    id, school_id, school_name, programme, programme_sub_type,
    school_scope, school_group_id, status, cohort_status, academic_year,
    start_date, end_date, students_mou, students_actual,
    students_variance, students_variance_pct,
    sp_without_tax, sp_with_tax, contract_value,
    received, tds, balance, received_pct,
    payment_schedule, audit_log
  ) VALUES (
    'MOU-STEAM-2526-071', 'SCH-LAXMIPAT_SINGHANIA_A', 'Laxmipat Singhania Academy',
    'STEAM', NULL, 'SINGLE', NULL, 'Active', 'archived', '2025-26',
    '2025-04-01', '2026-03-31', 420, 420, 0, 0,
    1694.92, 2000, 769440, 704232, 0, 65208, 91.5,
    '50-50 half-yearly',
    ${sql.json(JSON.parse(auditCreate))}
  ) ON CONFLICT (id) DO NOTHING`
  console.log('   OK')

  // 2. INSERT NARAYANA SCHOOL
  console.log('2. INSERT MOU-STEAM-2526-072 (NARAYANA SCHOOL)...')
  await sql`INSERT INTO mous (
    id, school_id, school_name, programme, programme_sub_type,
    school_scope, school_group_id, status, cohort_status, academic_year,
    start_date, end_date, students_mou, students_actual,
    students_variance, students_variance_pct,
    sp_without_tax, sp_with_tax, contract_value,
    received, tds, balance, received_pct,
    payment_schedule, audit_log
  ) VALUES (
    'MOU-STEAM-2526-072', 'SCH-NARAYANA_SCHOOL', 'NARAYANA SCHOOL',
    'STEAM', NULL, 'SINGLE', NULL, 'Active', 'archived', '2025-26',
    '2025-04-01', '2026-03-31', 2000, 819, -1181, -0.5905,
    847.46, 1000, 966420, 180000, 0, 786420, 18.6,
    '50-50 half-yearly',
    ${sql.json(JSON.parse(auditCreate))}
  ) ON CONFLICT (id) DO NOTHING`
  console.log('   OK')

  // 3. FIX: studentsMou 0 -> NULL for 18 schools
  console.log('3. UPDATE 18 studentsMou 0 -> NULL...')
  const ids = [
    'MOU-STEAM-2526-025','MOU-STEAM-2526-026','MOU-STEAM-2526-029','MOU-STEAM-2526-030',
    'MOU-STEAM-2526-031','MOU-STEAM-2526-034','MOU-STEAM-2526-035','MOU-STEAM-2526-037',
    'MOU-STEAM-2526-038','MOU-STEAM-2526-042','MOU-STEAM-2526-044','MOU-STEAM-2526-045',
    'MOU-STEAM-2526-052','MOU-STEAM-2526-060','MOU-STEAM-2526-064','MOU-STEAM-2526-065',
    'MOU-STEAM-2526-066','MOU-STEAM-2526-068',
  ]
  const r3 = await sql`UPDATE mous SET students_mou = NULL WHERE id = ANY(${ids}) AND students_mou = 0`
  console.log('   Rows affected:', r3.count)

  // 4. FIX: Julien Eglin received -> 0
  console.log('4. UPDATE Julien Eglin received 3290523 -> 0...')
  const r4 = await sql.unsafe(
    `UPDATE mous SET received = 0, balance = contract_value, received_pct = 0, audit_log = audit_log || $1::jsonb WHERE id = 'MOU-STEAM-2526-007' AND received = 3290523`,
    [auditCorrection],
  )
  console.log('   Rows affected:', r4.count)

  // 5. FLAG: Sagaya Matha duplicate
  console.log('5. FLAG Sagaya Matha 070...')
  const r5 = await sql.unsafe(
    `UPDATE mous SET audit_log = audit_log || $1::jsonb WHERE id = 'MOU-STEAM-2526-070'`,
    [auditFlag],
  )
  console.log('   Rows affected:', r5.count)

  // === VERIFICATION ===
  console.log('\n=== VERIFICATION QUERIES ===')

  console.log('\n(a) Test account:')
  const users = await sql`SELECT id, name, email, role, department, active FROM users WHERE email = 'gsl-testing@getsetlearn.info'`
  users.forEach(r => console.log('  ', r.id, '|', r.name, '|', r.email, '|', r.role, '| dept=' + r.department, '| active=' + r.active))

  console.log('\n(b) Two new MOUs:')
  const newMous = await sql`SELECT id, school_name, students_mou, students_actual, contract_value::numeric, received::numeric FROM mous WHERE id IN ('MOU-STEAM-2526-071', 'MOU-STEAM-2526-072') ORDER BY id`
  newMous.forEach(r => console.log('  ', r.id, '|', r.school_name, '| mou=' + r.students_mou, '| actual=' + r.students_actual, '| contract=' + r.contract_value, '| received=' + r.received))

  console.log('\n(c) Julien Eglin Road received:')
  const julien = await sql`SELECT id, school_name, received::numeric FROM mous WHERE id = 'MOU-STEAM-2526-007'`
  julien.forEach(r => console.log('  ', r.id, '|', r.school_name, '| received=' + r.received))

  console.log('\n(d) studentsMou IS NULL count:')
  const nullCount = await sql`SELECT COUNT(*)::int AS cnt FROM mous WHERE id LIKE 'MOU-STEAM-2526-%' AND students_mou IS NULL`
  console.log('  Count:', nullCount[0].cnt)

  console.log('\n(e) 25-26 STEAM totals (excl 070):')
  const totals = await sql`SELECT COUNT(*)::int AS schools, ROUND(SUM(contract_value))::bigint AS total_sales, ROUND(SUM(received))::bigint AS total_received FROM mous WHERE id LIKE 'MOU-STEAM-2526-%' AND id != 'MOU-STEAM-2526-070'`
  console.log('  Schools:', totals[0].schools, '| Sales:', totals[0].total_sales, '| Received:', totals[0].total_received)

  console.log('\nExpected: 69 schools | Sales 29196420 | Received 20994790')

  await sql.end()
  console.log('\nAll done.')
} catch (e) {
  console.error('FATAL:', e.message)
  await sql.end()
  process.exit(1)
}
