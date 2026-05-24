#!/usr/bin/env node
/*
 * CUTOVER-READY GATE - consolidated single-pass harness.
 *
 * Per Anish 2026-05-24: "Run the FULL consolidated harness against
 * staging-postgres in one pass - every write suite (the 7 OCC + 2
 * atomic + all concurrency tests) AND every read-parity suite (51/51)
 * together, not piecemeal. I want one green run that exercises the
 * entire surface at once, confirming nothing regressed across the
 * batches as they accumulated."
 *
 * This script spawns each harness as a child node process, captures
 * exit code + tail of output, and emits a consolidated PASS/FAIL.
 *
 * Suites in order (write-side first, then read-side):
 * - WRITE: P2b concurrency (19 entities)
 * - WRITE: OCC #1/#2/#3 proofs (cc_rules, communication_templates, override_event set+ack)
 * - WRITE: OCC #4 cross-flow (dispatch_summary)
 * - WRITE: OCC #5/#6/#7 proofs (vex_products, stage_responsibility, mou_import_review)
 * - WRITE: partial_payments atomic (money)
 * - WRITE: vex_pis payment atomic (money)
 * - WRITE: allocations OCC (SQL primitive)
 * - WRITE: allocations OCC (route-equivalent)
 * - READ: p4 money parity (10 drifted + 5 control + 3 dashboard rollups)
 * - READ: p4 aggregate parity (8 surfaces, 33 checks)
 *
 * Race-survey (verify-rmw-races.mjs) is INFORMATIONAL only - it shows
 * raw-SQL RMW races on fields that are either fixed (partial_payments,
 * payment_log_ids - now atomic) or proven-safe-by-call-trace (line_items,
 * payment_schedule write-once) or OCC-fixed (allocations,
 * dispatch_summary, cc_user_ids, default_cc_rules, override_event,
 * stage_responsibility, vex_products, mou_import_review). It does NOT
 * gate the cutover; its purpose is the historical reference of "yes
 * the raw RMW pattern races; here's the fix per field".
 */

import { spawn } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '..')

const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
const OUT_DIR = join(REPO_ROOT, '.verification', `gate-${ts}`)
await mkdir(OUT_DIR, { recursive: true })

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) {
  console.error('DATABASE_URL is required')
  process.exit(2)
}

console.log('='.repeat(72))
console.log(`CUTOVER-READY GATE - ${ts}`)
console.log('='.repeat(72))
console.log(`Output: ${OUT_DIR}`)
console.log(`DB host: ${new URL(DATABASE_URL.replace(/^postgres/, 'http')).host}`)
console.log()

const suites = [
  // WRITE side
  { id: 'p2b-concurrency', label: 'P2b concurrency (19 entities)', script: 'scripts/verify-p2b-concurrency.mjs', gating: true },
  { id: 'occ-123', label: 'OCC #1/#2/#3 (cc_rules / communication_templates / override_event set+ack)', script: 'scripts/verify-occ-123-proofs.mjs', gating: true },
  { id: 'occ-4', label: 'OCC #4 cross-flow (dispatch_summary, 6 writers / 4 sub-flows)', script: 'scripts/verify-occ-4-dispatch-summary.mjs', gating: true },
  { id: 'occ-567', label: 'OCC #5/#6/#7 (vex_products / stage_responsibility / mou_import_review)', script: 'scripts/verify-occ-567-proofs.mjs', gating: true },
  { id: 'partial-pay', label: 'Money atomic: partial_payments (3-layer)', script: 'scripts/verify-partial-payments-atomic.mjs', gating: true },
  { id: 'vex-pay', label: 'Money atomic: vex_pis.payment_log_ids (3-layer)', script: 'scripts/verify-vex-payment-atomic.mjs', gating: true },
  { id: 'alloc-occ-sql', label: 'Allocations OCC (SQL primitive)', script: 'scripts/verify-allocations-occ.mjs', gating: true },
  { id: 'alloc-occ-repo', label: 'Allocations OCC (route-equivalent)', script: 'scripts/verify-allocations-occ-repo.mjs', gating: true },
  // READ side
  { id: 'p4-money', label: 'P4 money parity (10 drifted + 5 control + 3 dashboard rollups)', script: 'scripts/verify-p4-money-parity.mjs', gating: true },
  { id: 'p4-agg', label: 'P4 aggregate parity (8 surfaces, 33 checks)', script: 'scripts/verify-p4-aggregate-parity.mjs', gating: true },
  // INFORMATIONAL (non-gating, documents the raw-RMW race that the fixes above target)
  { id: 'rmw-survey', label: 'RMW race survey (INFORMATIONAL only - see notes)', script: 'scripts/verify-rmw-races.mjs', gating: false },
]

function runSuite(s) {
  return new Promise((res) => {
    const t0 = Date.now()
    const child = spawn(process.execPath, [s.script], {
      cwd: REPO_ROOT,
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let out = ''
    child.stdout.on('data', (d) => { out += d.toString() })
    child.stderr.on('data', (d) => { out += d.toString() })
    child.on('close', (code) => {
      res({ ...s, exitCode: code, durationMs: Date.now() - t0, output: out })
    })
  })
}

const results = []
for (const s of suites) {
  process.stdout.write(`[${s.id.padEnd(18)}] running... `)
  const r = await runSuite(s)
  const tag = r.exitCode === 0 ? 'PASS' : (s.gating ? 'FAIL' : 'INFO')
  console.log(`${tag} (${(r.durationMs / 1000).toFixed(1)}s)  ${r.label}`)
  results.push(r)
  await writeFile(join(OUT_DIR, `${s.id}.log`), r.output, 'utf-8')
}

console.log()
console.log('='.repeat(72))
console.log('CONSOLIDATED RESULT')
console.log('='.repeat(72))

const gatingResults = results.filter((r) => r.gating)
const passingGating = gatingResults.filter((r) => r.exitCode === 0)
const failingGating = gatingResults.filter((r) => r.exitCode !== 0)
const informational = results.filter((r) => !r.gating)

console.log(`Gating suites:        ${passingGating.length} / ${gatingResults.length} PASS`)
console.log(`Informational suites: ${informational.length} ran (results in .log files)`)

if (failingGating.length > 0) {
  console.log()
  console.log('FAILING GATING SUITES:')
  for (const r of failingGating) {
    console.log(` - ${r.id}: exit ${r.exitCode}`)
    console.log(`    log: ${join(OUT_DIR, `${r.id}.log`)}`)
    console.log(`    tail: ${r.output.split('\n').slice(-3).join(' | ').slice(0, 200)}`)
  }
}

const summary = {
  ts, outDir: OUT_DIR, suites: results.map((r) => ({
    id: r.id, label: r.label, script: r.script, gating: r.gating,
    exitCode: r.exitCode, durationMs: r.durationMs,
    pass: r.exitCode === 0,
  })),
  gating: { passed: passingGating.length, total: gatingResults.length },
}
await writeFile(join(OUT_DIR, 'summary.json'), JSON.stringify(summary, null, 2), 'utf-8')

console.log()
console.log(`Summary JSON: ${join(OUT_DIR, 'summary.json')}`)
console.log()
if (failingGating.length === 0) {
  console.log('GATE STATUS: GREEN (all gating suites PASS)')
  process.exit(0)
} else {
  console.log('GATE STATUS: RED (one or more gating suites FAIL - cutover blocked)')
  process.exit(1)
}
