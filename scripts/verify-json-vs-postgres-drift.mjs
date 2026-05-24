#!/usr/bin/env node
/*
 * Cutover-gate Part 6 prep: quantify JSON-vs-postgres drift.
 *
 * Per Anish 2026-05-24: "Has src/data/ JSON changed in production
 * since the staging seed was taken? If production JSON has moved
 * (new MOUs, new payments logged on the live JSON system while we've
 * been building), the production seed must capture those. Quantify
 * what's changed."
 *
 * For each entity table:
 *   1. Count rows in current src/data/<entity>.json (production
 *      source of truth at this moment).
 *   2. Count rows in staging postgres.
 *   3. Diff = JSON_rows - postgres_rows (positive = pending unseeded;
 *      negative = staging had test-fixture inserts that weren't
 *      cleaned; zero = aligned).
 *
 * NOTE on negatives: staging postgres has some temp fixtures from
 * concurrency tests (KIT-OCC-*, CC-OCC-*, etc.); those are short-lived
 * INSERT+cleanup. Persistent diffs come from either:
 *   - Production JSON drift since staging seed (positive diff)
 *   - Persistent fixture rows that escaped cleanup (negative diff)
 *
 * The output drives the Part 6 re-seed checklist: any entity with
 * JSON_rows != postgres_rows needs the fresh production seed to
 * capture it.
 */

import { readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import dns from 'node:dns'
import { Resolver } from 'node:dns/promises'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '..')
const DATA_DIR = join(REPO_ROOT, 'src', 'data')

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

// Mapping: JSON filename -> postgres table name. Some entities have
// special shapes (counters live in mou-system snapshot; pending_updates
// is the queue; sync_health is the heartbeat log). The table here is
// the live-entity table that the Part 6 re-seed needs to capture.
const entities = [
  { file: 'mous.json', table: 'mous' },
  { file: 'schools.json', table: 'schools' },
  { file: 'payments.json', table: 'payments' },
  { file: 'users.json', table: 'users' },
  { file: 'sales_team.json', table: 'sales_team' },
  { file: 'school_groups.json', table: 'school_groups' },
  { file: 'school_spocs.json', table: 'school_spocs' },
  { file: 'dispatches.json', table: 'dispatches' },
  { file: 'dispatch_requests.json', table: 'dispatch_requests' },
  { file: 'kit_dispatches.json', table: 'kit_dispatches' },
  { file: 'intake_records.json', table: 'intake_records' },
  { file: 'communications.json', table: 'communications' },
  { file: 'communication_templates.json', table: 'communication_templates' },
  { file: 'magic_link_tokens.json', table: 'magic_link_tokens' },
  { file: 'feedback.json', table: 'feedback' },
  { file: 'escalations.json', table: 'escalations' },
  { file: 'notifications.json', table: 'notifications' },
  { file: 'cc_rules.json', table: 'cc_rules' },
  { file: 'lifecycle_rules.json', table: 'lifecycle_rules' },
  { file: 'sales_opportunities.json', table: 'sales_opportunities' },
  { file: 'inventory_items.json', table: 'inventory_items' },
  { file: 'adjustments.json', table: 'adjustments' },
  { file: 'signed_values.json', table: 'signed_values' },
  { file: 'vendors.json', table: 'vendors' },
  { file: 'agreements.json', table: 'agreements' },
  { file: 'vex_products.json', table: 'vex_products' },
  { file: 'vex_pis.json', table: 'vex_pis' },
  { file: 'vex_dispatches.json', table: 'vex_dispatches' },
  { file: 'vex_orders.json', table: 'vex_orders' },
  { file: 'payment_logs.json', table: 'payment_logs' },
  { file: 'student_count_events.json', table: 'student_count_events' },
  { file: 'mou_import_review.json', table: 'mou_import_review' },
  { file: 'stage_responsibility.json', table: 'stage_responsibility' },
  { file: 'chain_dismissals.json', table: 'chain_dismissals' },
  { file: 'reminder_thresholds.json', table: 'reminder_thresholds' },
  { file: 'homepage_action_log.json', table: 'homepage_action_log' },
  // Excluded: pending_updates (queue), sync_health (heartbeat log -
  // staging has its own test entries; not a drift concern), counters
  // (single-row map, hand-maintained), feedback_responses (legacy).
]

async function jsonRowCount(file) {
  try {
    const raw = await readFile(join(DATA_DIR, file), 'utf-8')
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) return parsed.length
    // Object-shape (e.g., stage_responsibility may be keyed map): count keys
    return Object.keys(parsed).length
  } catch (e) {
    return null
  }
}

async function sqlRowCount(table) {
  try {
    const r = await sql`SELECT COUNT(*)::int AS n FROM ${sql(table)}`
    return Number(r[0].n)
  } catch (e) {
    return null
  }
}

const results = []
let totalDiff = 0
console.log('==========================================================')
console.log('JSON-vs-postgres drift quantification (cutover prep)')
console.log('==========================================================')
console.log()
console.log('entity'.padEnd(28), 'json'.padStart(7), 'pg'.padStart(7), 'diff'.padStart(7), 'note')
console.log('-'.repeat(70))

for (const e of entities) {
  const jr = await jsonRowCount(e.file)
  const pr = await sqlRowCount(e.table)
  if (jr === null) {
    console.log(`${e.table.padEnd(28)} ${'???'.padStart(7)} ${String(pr).padStart(7)} ${'(missing JSON)'.padStart(7)}`)
    continue
  }
  if (pr === null) {
    console.log(`${e.table.padEnd(28)} ${String(jr).padStart(7)} ${'???'.padStart(7)} ${'(missing table)'.padStart(7)}`)
    continue
  }
  const diff = jr - pr
  const note = diff === 0 ? '' : (diff > 0 ? `+${diff} pending re-seed` : `${diff} (staging has extras)`)
  console.log(`${e.table.padEnd(28)} ${String(jr).padStart(7)} ${String(pr).padStart(7)} ${String(diff).padStart(7)}  ${note}`)
  results.push({ entity: e.table, json: jr, postgres: pr, diff, note })
  totalDiff += Math.abs(diff)
}

console.log()
console.log('==========================================================')
console.log(`Total entities checked: ${results.length}`)
console.log(`Entities with diff != 0: ${results.filter((r) => r.diff !== 0).length}`)
console.log(`Sum |diff|:              ${totalDiff}`)
console.log()
console.log('JSON > postgres (need re-seed to capture):')
for (const r of results.filter((rr) => rr.diff > 0)) {
  console.log(`  ${r.entity}: +${r.diff}`)
}
console.log()
console.log('postgres > JSON (staging has extra rows; likely concurrency-test fixtures):')
for (const r of results.filter((rr) => rr.diff < 0)) {
  console.log(`  ${r.entity}: ${r.diff}`)
}
console.log()
console.log('Interpretation:')
console.log('  - Positive diff = production JSON has rows not yet in staging postgres.')
console.log('    These would be picked up by the Part 6 fresh production seed.')
console.log('  - Negative diff = staging postgres has rows not in JSON (test fixtures,')
console.log('    stray inserts that escaped cleanup). These do NOT affect production')
console.log('    cutover since production seeds from JSON to its own fresh Neon branch.')

await sql.end({ timeout: 5 })
