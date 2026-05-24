#!/usr/bin/env node
/*
 * Part 6 post-apply verification (per Anish 2026-05-24 #2).
 *
 * Runs AFTER the seed --apply COMMITS to the production Neon branch
 * and BEFORE the DATA_BACKEND=postgres env flip. Anish reviews this
 * output and gives the explicit GO for the flip - the flip does NOT
 * auto-follow the seed.
 *
 * Spot-checks the same high-stakes records we verified at staging
 * seed time:
 *
 *   1. The 9 archive payments (from 5 restored archived MOUs):
 *      total row count + sum of receivedAmount + per-mouId breakdown.
 *      Expected from current src/data/payments.json snapshot:
 *      MOU-STEAM-2526-001 (2 rows), MOU-STEAM-2526-027 (1 row),
 *      MOU-YP-2526-001/002/003 (2 rows each). Total 9. Sum received
 *      = 1,286,651 (will recompute from JSON at runtime in case of
 *      drift between this script being written and actual cutover).
 *
 *   2. Partial-balance sanity: any payment row with partial_payments
 *      JSONB array has length matching the JSON snapshot.
 *
 *   3. pi_counter_map.priorFiscalYears['2526'].entities intact:
 *      MH.next + UP.next match the JSON.
 *
 *   4. The 5 restored archived MOUs visible with cohort_status='archived'
 *      and the recovery importNotes.
 *
 *   5. Final entity row counts vs JSON snapshot (per-table diff).
 *      Anything materially different (>= 5% delta) gets flagged.
 *
 * Usage (Part 6 procedure step 2.5 - between seed apply and env flip):
 *   DATABASE_URL='<production postgres -pooler URL>' \
 *     node scripts/verify-seed-post-apply.mjs
 *
 * Exit code 0 iff every spot-check passes. Otherwise 1; Anish reviews
 * the failure output and decides whether to roll back the seed (point-
 * in-time restore from the pre-cutover Neon snapshot) or proceed.
 */

import { readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import dns from 'node:dns'
import { Resolver } from 'node:dns/promises'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '..')
const DATA = join(REPO_ROOT, 'src', 'data')

const pr = new Resolver(); pr.setServers(['1.1.1.1', '8.8.8.8'])
const orig = dns.lookup
dns.lookup = function (h, o, cb) {
  const callback = typeof o === 'function' ? o : cb
  const opts = typeof o === 'object' ? o : {}
  orig(h, opts, (e, a, f) => {
    if (!e) return callback(e, a, f)
    pr.resolve4(h).then((addrs) => {
      if (!addrs?.length) return callback(e)
      if (opts.all) callback(null, addrs.map((a) => ({ address: a, family: 4 })))
      else callback(null, addrs[0], 4)
    }).catch(() => callback(e))
  })
}
const postgres = (await import('postgres')).default
const sql = postgres(process.env.DATABASE_URL, {
  max: 1, prepare: false, connect_timeout: 30,
})

async function load(file) {
  return JSON.parse(await readFile(join(DATA, file), 'utf-8'))
}

const ARCHIVED_MOU_IDS = [
  'MOU-STEAM-2526-001',
  'MOU-STEAM-2526-027',
  'MOU-YP-2526-001',
  'MOU-YP-2526-002',
  'MOU-YP-2526-003',
]

const fails = []
function check(name, actual, expected, eps = 0) {
  const ok = typeof actual === 'number'
    ? Math.abs(actual - expected) <= Math.max(eps, 0.01)
    : JSON.stringify(actual) === JSON.stringify(expected)
  const tag = ok ? 'PASS' : 'FAIL'
  console.log(`  [${tag}] ${name}: actual=${JSON.stringify(actual)} expected=${JSON.stringify(expected)}`)
  if (!ok) fails.push({ name, actual, expected })
}

console.log('==========================================================')
console.log('Part 6 post-apply verification (Anish #2 spot-checks)')
console.log('==========================================================')

// --- 1. 9 archive payments -----------------------------------------------
console.log()
console.log('--- 1. Archive payments (the 9 rows from the 5 restored MOUs) ---')
{
  const jsonPayments = await load('payments.json')
  const arch = jsonPayments.filter((p) => ARCHIVED_MOU_IDS.includes(p.mouId))
  const expectedTotal = arch.length
  const expectedSumReceived = arch.reduce((s, p) => s + (p.receivedAmount ?? 0), 0)
  const expectedByMou = ARCHIVED_MOU_IDS.reduce((m, id) => {
    m[id] = arch.filter((p) => p.mouId === id).length
    return m
  }, {})

  const r = await sql`
    SELECT COUNT(*)::int AS n, COALESCE(SUM(received_amount), 0)::numeric AS sum_received
    FROM payments WHERE mou_id = ANY(${ARCHIVED_MOU_IDS})
  `
  const byMou = {}
  for (const id of ARCHIVED_MOU_IDS) {
    const c = await sql`SELECT COUNT(*)::int AS n FROM payments WHERE mou_id = ${id}`
    byMou[id] = Number(c[0].n)
  }
  check('archive payment count', Number(r[0].n), expectedTotal)
  check('archive payment sum-received (Rs)', Number(r[0].sum_received), expectedSumReceived)
  check('archive payment breakdown by mouId', byMou, expectedByMou)
}

// --- 2. Partial-balance sanity ------------------------------------------
console.log()
console.log('--- 2. Partial-balance sanity (per-row partial_payments JSONB intact) ---')
{
  const jsonPayments = await load('payments.json')
  const withPartials = jsonPayments.filter((p) => (p.partialPayments?.length ?? 0) > 0)
  console.log(`  ${withPartials.length} JSON payment rows carry partial_payments arrays`)
  let anyFail = false
  for (const p of withPartials.slice(0, 10)) {
    const r = await sql`
      SELECT jsonb_array_length(partial_payments) AS len,
        COALESCE((SELECT SUM((elem->>'amount')::numeric) FROM jsonb_array_elements(partial_payments) elem), 0) AS sum_amt
      FROM payments WHERE id = ${p.id}
    `
    if (r.length === 0) { console.log(`  [FAIL] ${p.id}: not in postgres`); anyFail = true; continue }
    const expectedLen = p.partialPayments.length
    const expectedSum = p.partialPayments.reduce((s, x) => s + Number(x.amount ?? 0), 0)
    const actualLen = Number(r[0].len)
    const actualSum = Number(r[0].sum_amt)
    const ok = actualLen === expectedLen && Math.abs(actualSum - expectedSum) < 0.01
    if (!ok) { console.log(`  [FAIL] ${p.id}: len ${actualLen}/${expectedLen} sum ${actualSum}/${expectedSum}`); anyFail = true }
  }
  if (!anyFail) console.log(`  [PASS] first ${Math.min(10, withPartials.length)} sampled rows match JSON snapshot`)
  if (anyFail) fails.push({ name: 'partial-balance sanity', actual: 'mismatches', expected: 'all match' })
}

// --- 3. pi_counter_map.priorFiscalYears['2526'] -------------------------
console.log()
console.log('--- 3. pi_counter_map.priorFiscalYears.2526 intact ---')
{
  let jsonMap
  try { jsonMap = await load('pi_counter_map.json') } catch { jsonMap = null }
  if (!jsonMap) {
    console.log('  [SKIP] pi_counter_map.json not found in src/data')
  } else {
    const expectedPrior = jsonMap.priorFiscalYears?.['2526']?.entities ?? null
    const r = await sql`SELECT value FROM counters WHERE key = 'pi_counter_map'`
    if (r.length === 0) {
      console.log('  [FAIL] counters row with key=pi_counter_map missing')
      fails.push({ name: 'pi_counter_map present', actual: 'missing row', expected: 'present' })
    } else {
      const actualPrior = r[0].value?.priorFiscalYears?.['2526']?.entities ?? null
      check('priorFiscalYears.2526.entities', actualPrior, expectedPrior)
    }
  }
}

// --- 4. 5 restored archived MOUs ---------------------------------------
console.log()
console.log('--- 4. 5 restored archived MOUs visible ---')
{
  const r = await sql`
    SELECT id, cohort_status, import_notes FROM mous
    WHERE id = ANY(${ARCHIVED_MOU_IDS}) ORDER BY id
  `
  check('archived MOU count', r.length, 5)
  for (const row of r) {
    const archivedFlag = row.cohort_status === 'archived'
    const recoveryNote = (row.import_notes ?? '').includes('Phase 7 archive recovery')
    const tag = archivedFlag && recoveryNote ? 'PASS' : 'FAIL'
    console.log(`  [${tag}] ${row.id}: cohort_status=${row.cohort_status} notes-prefix-ok=${recoveryNote}`)
    if (!(archivedFlag && recoveryNote)) {
      fails.push({ name: `archived MOU ${row.id} shape`, actual: { cohort_status: row.cohort_status, recoveryNote }, expected: { cohort_status: 'archived', recoveryNote: true } })
    }
  }
}

// --- 5. Final entity counts vs JSON snapshot ---------------------------
console.log()
console.log('--- 5. Entity row-counts vs JSON snapshot (any |diff|>=5% flagged) ---')
{
  const entities = [
    ['mous', 'mous.json'], ['schools', 'schools.json'], ['payments', 'payments.json'],
    ['users', 'users.json'], ['sales_team', 'sales_team.json'],
    ['school_groups', 'school_groups.json'], ['school_spocs', 'school_spocs.json'],
    ['dispatches', 'dispatches.json'], ['dispatch_requests', 'dispatch_requests.json'],
    ['kit_dispatches', 'kit_dispatches.json'], ['intake_records', 'intake_records.json'],
    ['communications', 'communications.json'], ['communication_templates', 'communication_templates.json'],
    ['magic_link_tokens', 'magic_link_tokens.json'], ['feedback', 'feedback.json'],
    ['escalations', 'escalations.json'], ['notifications', 'notifications.json'],
    ['cc_rules', 'cc_rules.json'], ['lifecycle_rules', 'lifecycle_rules.json'],
    ['sales_opportunities', 'sales_opportunities.json'], ['inventory_items', 'inventory_items.json'],
    ['adjustments', 'adjustments.json'], ['signed_values', 'signed_values.json'],
    ['vendors', 'vendors.json'], ['agreements', 'agreements.json'],
    ['vex_products', 'vex_products.json'], ['vex_pis', 'vex_pis.json'],
    ['vex_dispatches', 'vex_dispatches.json'], ['vex_orders', 'vex_orders.json'],
    ['payment_logs', 'payment_logs.json'], ['student_count_events', 'student_count_events.json'],
    ['mou_import_review', 'mou_import_review.json'],
    ['stage_responsibility', 'stage_responsibility.json'], ['chain_dismissals', 'chain_dismissals.json'],
    ['reminder_thresholds', 'reminder_thresholds.json'],
  ]
  for (const [table, file] of entities) {
    let jsonRows
    try { jsonRows = await load(file) } catch { continue }
    const expectedN = Array.isArray(jsonRows) ? jsonRows.length : Object.keys(jsonRows).length
    const r = await sql`SELECT COUNT(*)::int AS n FROM ${sql(table)}`
    const actualN = Number(r[0].n)
    const tag = actualN === expectedN ? 'PASS' : 'INFO'
    const note = actualN === expectedN ? '' : ` (diff ${actualN - expectedN})`
    console.log(`  [${tag}] ${table}: pg=${actualN} json=${expectedN}${note}`)
    // Per-entity flag only if material drift (>= 5% AND > 1 row)
    if (Math.abs(actualN - expectedN) >= Math.max(2, expectedN * 0.05)) {
      fails.push({ name: `${table} material row-count drift`, actual: actualN, expected: expectedN })
    }
  }
}

console.log()
console.log('==========================================================')
if (fails.length === 0) {
  console.log('OVERALL: PASS - Anish, the seed verified against the JSON snapshot.')
  console.log('         Next step requires YOUR explicit GO to proceed to the env flip.')
  console.log('==========================================================')
  await sql.end({ timeout: 5 })
  process.exit(0)
} else {
  console.log(`OVERALL: ${fails.length} FAIL(s). Review BEFORE deciding on rollback or proceed:`)
  for (const f of fails) console.log(` - ${f.name}`)
  console.log('==========================================================')
  await sql.end({ timeout: 5 })
  process.exit(1)
}
