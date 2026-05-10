#!/usr/bin/env node
/*
 * Gate 2 Step 4: one-time data snapshot from gsl-mou-system into Ops.
 *
 * Reads every entity JSON from gsl-mou-system/src/data/ and writes the
 * transformed snapshot under src/data/_snapshots/mou-system/. The
 * snapshot is for VERIFICATION purposes during the parallel-build
 * window; Pranav, Shubhangi, Anita continue daily MOU/PI/payment work
 * on gsl-mou-system. The Ops mouSystem-namespace libs run on this
 * snapshot to prove identical totals, identical PI numbers, identical
 * adjustment behaviour vs the source.
 *
 * Discipline:
 *   - Idempotent: running twice produces identical output (sorted by
 *     id, deterministic _meta timestamp ordering only).
 *   - Verbatim by default: every field including auditLog preserved.
 *   - Programme reconciliation: 0 records use TinkRworks/VEX as
 *     Programme today, so no transform fires; the script verifies that
 *     and aborts if a TinkRworks/VEX MOU surfaces.
 *   - SchoolGroup backfill: every School gets a 1:1 SchoolGroup. Chain
 *     reconciliation (Narayana + B.D. Memorial precedent) is manual
 *     post-snapshot work, not part of the import.
 *   - Audit logs: preserved verbatim where the source carries them;
 *     untouched empty arrays where it does not.
 *
 * Usage:
 *   node scripts/cutover-snapshot.mjs
 *   node scripts/cutover-snapshot.mjs --source <path>   # alt source
 *   node scripts/cutover-snapshot.mjs --dry-run         # report only
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..')
const DEFAULT_SOURCE = 'C:/Users/anish/Projects/gsl-mou-system/src/data'
const SNAPSHOT_DIR = path.join(REPO_ROOT, 'src/data/_snapshots/mou-system')

const args = process.argv.slice(2)
const sourceFlag = args.indexOf('--source')
const sourceDir = sourceFlag >= 0 ? args[sourceFlag + 1] : DEFAULT_SOURCE
const dryRun = args.includes('--dry-run')

function readJson(filename) {
  const p = path.join(sourceDir, filename)
  if (!fs.existsSync(p)) return null
  const raw = fs.readFileSync(p, 'utf-8')
  return JSON.parse(raw)
}

function writeJson(filename, data) {
  if (dryRun) return
  if (!fs.existsSync(SNAPSHOT_DIR)) {
    fs.mkdirSync(SNAPSHOT_DIR, { recursive: true })
  }
  const p = path.join(SNAPSHOT_DIR, filename)
  fs.writeFileSync(p, JSON.stringify(data, null, 2) + '\n', 'utf-8')
}

function sortById(arr) {
  return arr.slice().sort((a, b) => {
    const aid = String(a.id ?? '')
    const bid = String(b.id ?? '')
    return aid < bid ? -1 : aid > bid ? 1 : 0
  })
}

// ----------------------------------------------------------------------------
// Programme verifier: 0 mou-system records carry TinkRworks/VEX as Programme.
// If the snapshot surfaces one, the import aborts so we surface it loudly.
// ----------------------------------------------------------------------------

function verifyProgrammes(mous) {
  const violations = mous.filter(
    (m) => m.programme === 'TinkRworks' || m.programme === 'VEX',
  )
  if (violations.length > 0) {
    throw new Error(
      `Programme reconciliation violation: ${violations.length} MOU record(s) carry TinkRworks/VEX as programme. ` +
        `Gate 2 §7.1 expects 0 such records. Investigate: ${violations.map((m) => m.id).join(', ')}`,
    )
  }
}

// ----------------------------------------------------------------------------
// SchoolGroup backfill: 1:1 by default. Chain MOUs (Narayana, etc.) need
// manual reconciliation in a follow-up pass; this script captures the
// straight 1:1 default + records the chain-candidate names for review.
// ----------------------------------------------------------------------------

function backfillSchoolGroups(schools) {
  const groups = []
  const chainCandidates = []
  for (const school of schools) {
    // Group id derived from school id; deterministic.
    const groupId = `SG-${school.id.replace(/^SCH-/, '')}`
    groups.push({
      id: groupId,
      name: school.name,
      region: 'unknown',
      createdAt: '2026-05-10T00:00:00Z',
      createdBy: 'system-cutover-snapshot',
      memberSchoolIds: [school.id],
      groupMouId: null,
      notes: null,
      primaryContact: school.contactPerson ?? null,
      primaryEmail: school.email ?? null,
      primaryPhone: school.phone ?? null,
      gstNumber: school.gstNumber ?? null,
      auditLog: [],
    })
    const lower = (school.name || '').toLowerCase()
    if (
      lower.includes('group of schools') ||
      lower.includes(' group') ||
      lower.includes('memorial') ||
      lower.includes('chain')
    ) {
      chainCandidates.push({ schoolId: school.id, name: school.name })
    }
  }
  return { groups: sortById(groups), chainCandidates }
}

// ----------------------------------------------------------------------------
// Diff: which mou-system records are NOT in the previous snapshot?
// Surfaces deltas across snapshot refreshes so the admin page can flag
// "needs investigation". Lossless: returns ids only, not full payloads.
// ----------------------------------------------------------------------------

function diffSnapshot(prev, next, key = 'id') {
  if (!prev) return { added: [], removed: [] }
  const prevIds = new Set(prev.map((x) => String(x[key])))
  const nextIds = new Set(next.map((x) => String(x[key])))
  const added = [...nextIds].filter((id) => !prevIds.has(id))
  const removed = [...prevIds].filter((id) => !nextIds.has(id))
  return { added, removed }
}

function loadPrevSnapshot(filename) {
  const p = path.join(SNAPSHOT_DIR, filename)
  if (!fs.existsSync(p)) return null
  return JSON.parse(fs.readFileSync(p, 'utf-8'))
}

// ----------------------------------------------------------------------------
// Main
// ----------------------------------------------------------------------------

function main() {
  console.log(`source: ${sourceDir}`)
  console.log(`target: ${SNAPSHOT_DIR}`)
  console.log(`dry-run: ${dryRun}`)
  console.log('')

  const sources = {
    mous: readJson('mous.json') ?? [],
    schools: readJson('schools.json') ?? [],
    payments: readJson('payments.json') ?? [],
    paymentLogs: readJson('payment_log.json') ?? [],
    agreements: readJson('agreements.json') ?? [],
    signedValues: readJson('signed_values.json') ?? [],
    vexProducts: readJson('vex_products.json') ?? [],
    vexPis: readJson('vex_pis.json') ?? [],
    vexDispatches: readJson('vex_dispatches.json') ?? [],
    vexOrders: readJson('vex_orders.json') ?? [],
    adjustments: readJson('adjustments.json') ?? [],
    salesTeam: readJson('sales_team.json') ?? [],
  }

  console.log('source counts:')
  for (const [k, v] of Object.entries(sources)) {
    console.log(`  ${k.padEnd(15)} ${Array.isArray(v) ? v.length : '(non-array)'}`)
  }
  console.log('')

  // Verify programme enum reconciliation.
  verifyProgrammes(sources.mous)

  // SchoolGroup backfill.
  const { groups: schoolGroups, chainCandidates } = backfillSchoolGroups(sources.schools)
  console.log(`schoolGroups backfill: ${schoolGroups.length} (1:1 of schools)`)
  if (chainCandidates.length > 0) {
    console.log(`  chain candidates flagged for review: ${chainCandidates.length}`)
    for (const c of chainCandidates) {
      console.log(`    - ${c.schoolId}: ${c.name}`)
    }
  }
  console.log('')

  // Compute diffs against previous snapshot.
  const diffs = {
    mous: diffSnapshot(loadPrevSnapshot('mous.json'), sources.mous),
    schools: diffSnapshot(loadPrevSnapshot('schools.json'), sources.schools),
    payments: diffSnapshot(loadPrevSnapshot('payments.json'), sources.payments),
    vexPis: diffSnapshot(loadPrevSnapshot('vex_pis.json'), sources.vexPis),
  }

  // Build target outputs (sorted by id for deterministic diffs).
  const out = {
    mous: sortById(sources.mous),
    schools: sortById(sources.schools),
    school_groups: schoolGroups,
    payments: sortById(sources.payments),
    payment_logs: sortById(sources.paymentLogs),
    agreements: sortById(sources.agreements),
    signed_values: sources.signedValues
      .slice()
      .sort((a, b) => (String(a.mouId) < String(b.mouId) ? -1 : 1)),
    vex_products: sources.vexProducts
      .slice()
      .sort((a, b) => (String(a.partNumber) < String(b.partNumber) ? -1 : 1)),
    vex_pis: sortById(sources.vexPis),
    vex_dispatches: sortById(sources.vexDispatches),
    vex_orders: sortById(sources.vexOrders),
    adjustments: sortById(sources.adjustments),
    sales_team: sortById(sources.salesTeam),
  }

  // Write each file.
  for (const [name, data] of Object.entries(out)) {
    writeJson(`${name}.json`, data)
  }

  // Write _meta.json.
  const meta = {
    snapshotTakenAt: new Date().toISOString(),
    sourceDirectory: sourceDir,
    counts: {
      mous: out.mous.length,
      schools: out.schools.length,
      school_groups: out.school_groups.length,
      payments: out.payments.length,
      payment_logs: out.payment_logs.length,
      agreements: out.agreements.length,
      signed_values: out.signed_values.length,
      vex_products: out.vex_products.length,
      vex_pis: out.vex_pis.length,
      vex_dispatches: out.vex_dispatches.length,
      vex_orders: out.vex_orders.length,
      adjustments: out.adjustments.length,
      sales_team: out.sales_team.length,
    },
    diffsAgainstPreviousSnapshot: diffs,
    chainCandidates,
    notes: [
      'Idempotent snapshot. Re-running produces identical output when source is unchanged.',
      'SchoolGroup backfill is 1:1; chain candidates listed for manual reconciliation.',
      'Programme enum verified: 0 records with TinkRworks/VEX as programme (Gate 2 §7.1).',
      'Audit logs preserved verbatim from source.',
    ],
  }
  writeJson('_meta.json', meta)

  console.log('snapshot summary:')
  for (const [k, n] of Object.entries(meta.counts)) {
    console.log(`  ${k.padEnd(15)} ${n}`)
  }
  console.log('')
  console.log('diffs vs previous snapshot:')
  for (const [k, d] of Object.entries(diffs)) {
    if (d.added.length === 0 && d.removed.length === 0) continue
    console.log(`  ${k}: +${d.added.length} -${d.removed.length}`)
    if (d.added.length > 0) console.log(`    added: ${d.added.slice(0, 5).join(', ')}${d.added.length > 5 ? ` +${d.added.length - 5} more` : ''}`)
    if (d.removed.length > 0) console.log(`    removed: ${d.removed.slice(0, 5).join(', ')}${d.removed.length > 5 ? ` +${d.removed.length - 5} more` : ''}`)
  }
  console.log('')
  console.log(dryRun ? 'dry-run complete. no files written.' : `snapshot written to ${SNAPSHOT_DIR}/`)
}

try {
  main()
} catch (err) {
  console.error('cutover-snapshot failed:', err.message)
  process.exit(1)
}
