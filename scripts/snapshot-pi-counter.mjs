#!/usr/bin/env node
/*
 * Phase 6B cutover: snapshot the PI counter from gsl-mou-system into
 * gsl-ops-automation. The PI counter is the shared resource between
 * the two systems during the parallel-build window; on cutover day Ops
 * takes over PI issuance and the counter freezes on the legacy side
 * (banner + read-only routes). Any drift between systems at this
 * moment becomes a duplicate PI number in finance's audit trail: a
 * GST audit disaster.
 *
 * What it does:
 *   1. Reads source pi_counter.json from gsl-mou-system/src/data/.
 *   2. Scans source vex_pis.json + payments.json for every issued PI
 *      number and computes the highest seq per (entity, FY) from the
 *      actual ledger.
 *   3. Verifies legacy counter.next === maxIssued + 1 for each prefix.
 *      Surfaces any mismatch as a hard error (anomaly).
 *   4. Writes src/data/pi_counter_map.json from the verified legacy
 *      counter values.
 *   5. Prints a per-prefix diff vs the previous Ops counter map so the
 *      reviewer sees exactly what changed.
 *
 * Discipline:
 *   - Read-only against the legacy system. Never writes back to it.
 *   - Idempotent: running twice produces identical output if source
 *     unchanged.
 *   - Fails loudly: if the legacy counter doesn't match issued PIs,
 *     halts with no write. The operator investigates BEFORE cutover.
 *   - Preserves source fiscalYear format ("2627" without dash) since
 *     the format-side join uses company.fiscalYear ("26-27") and the
 *     counter map field is informational metadata.
 *
 * Usage:
 *   node scripts/snapshot-pi-counter.mjs
 *   node scripts/snapshot-pi-counter.mjs --source <path>   # alt source
 *   node scripts/snapshot-pi-counter.mjs --dry-run         # report only
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..')
const DEFAULT_SOURCE = 'C:/Users/anish/Projects/gsl-mou-system/src/data'
const TARGET_PATH = path.join(REPO_ROOT, 'src/data/pi_counter_map.json')

const args = process.argv.slice(2)
const sourceFlag = args.indexOf('--source')
const sourceDir = sourceFlag >= 0 ? args[sourceFlag + 1] : DEFAULT_SOURCE
const dryRun = args.includes('--dry-run')

function readJson(filename) {
  const p = path.join(sourceDir, filename)
  if (!fs.existsSync(p)) return null
  return JSON.parse(fs.readFileSync(p, 'utf-8'))
}

function readTargetJson() {
  if (!fs.existsSync(TARGET_PATH)) return null
  return JSON.parse(fs.readFileSync(TARGET_PATH, 'utf-8'))
}

// Parse a piNumber like "MTPL/MH/26-27/0001" into { prefix, entity, fy, seq }.
// Returns null on anything that doesn't match the expected shape.
function parsePiNumber(piNumber) {
  if (typeof piNumber !== 'string') return null
  const m = piNumber.match(/^MTPL\/(MH|UP)\/(\d{2}-\d{2})\/(\d+)$/)
  if (!m) return null
  return {
    entity: m[1],
    fy: m[2].replace('-', ''),
    seq: Number(m[3]),
  }
}

// Scan a list of records for piNumber fields and group highest seq per (entity, fy).
function scanForHighestSeq(records, source) {
  const highest = new Map()
  for (const rec of records) {
    const parsed = parsePiNumber(rec.piNumber)
    if (!parsed) continue
    const key = `${parsed.entity}/${parsed.fy}`
    const prev = highest.get(key)
    if (!prev || parsed.seq > prev.seq) {
      highest.set(key, { ...parsed, sourceId: rec.id ?? '(no id)', source })
    }
  }
  return highest
}

function mergeHighest(a, b) {
  const out = new Map(a)
  for (const [key, val] of b.entries()) {
    const prev = out.get(key)
    if (!prev || val.seq > prev.seq) out.set(key, val)
  }
  return out
}

function main() {
  console.log(`source: ${sourceDir}`)
  console.log(`target: ${TARGET_PATH}`)
  console.log(`dry-run: ${dryRun}`)
  console.log('')

  const legacyCounter = readJson('pi_counter.json')
  if (!legacyCounter) {
    throw new Error(`Legacy pi_counter.json not found at ${sourceDir}`)
  }
  const vexPis = readJson('vex_pis.json') ?? []
  const payments = readJson('payments.json') ?? []
  const prevTarget = readTargetJson()

  console.log('legacy counter (source of truth):')
  console.log(JSON.stringify(legacyCounter, null, 2))
  console.log('')

  // Scan the ledger for the highest seq per (entity, fy).
  const vexHigh = scanForHighestSeq(vexPis, 'vex_pis.json')
  const payHigh = scanForHighestSeq(payments, 'payments.json')
  const allHigh = mergeHighest(vexHigh, payHigh)

  console.log('highest issued PI per prefix (from ledger):')
  for (const [key, val] of [...allHigh.entries()].sort()) {
    console.log(
      `  ${key}: seq ${val.seq} (${val.source} ${val.sourceId})`,
    )
  }
  console.log('')

  // Verify legacy counter matches highest issued + 1 for each entity
  // whose counter is tracked. Counter FY is one value (not per-entity);
  // we verify each tracked entity against issued PIs of THAT FY.
  const counterFy = legacyCounter.fiscalYear
  const anomalies = []
  for (const [entityKey, { next }] of Object.entries(legacyCounter.entities)) {
    const key = `${entityKey}/${counterFy}`
    const high = allHigh.get(key)
    const issuedMax = high ? high.seq : 0
    const expectedNext = issuedMax + 1
    if (next !== expectedNext) {
      anomalies.push({
        entityKey,
        fy: counterFy,
        counterNext: next,
        ledgerMax: issuedMax,
        expectedNext,
      })
    }
  }

  if (anomalies.length > 0) {
    console.error('ANOMALY: legacy counter does not match issued PI ledger.')
    for (const a of anomalies) {
      console.error(
        `  ${a.entityKey}/${a.fy}: counter.next=${a.counterNext}, ledger max=${a.ledgerMax}, expected next=${a.expectedNext}`,
      )
    }
    console.error('')
    console.error('No write. Investigate before cutover.')
    process.exit(2)
  }
  console.log('verification: legacy counter matches ledger for every tracked entity.')
  console.log('')

  // Build the target counter map. Preserve the comment + structure
  // shape that Ops already uses; refresh with legacy values verbatim.
  const target = {
    _comment:
      'Phase 6B cutover snapshot of gsl-mou-system/src/data/pi_counter.json (verified against vex_pis.json + payments.json ledger). Ops is now the source of truth; legacy is read-only post-banner.',
    fiscalYear: legacyCounter.fiscalYear,
    entities: legacyCounter.entities,
  }

  console.log('diff vs previous Ops counter map:')
  if (!prevTarget) {
    console.log('  (no prev; writing fresh)')
  } else {
    const prevEntities = prevTarget.entities ?? {}
    const allKeys = new Set([
      ...Object.keys(prevEntities),
      ...Object.keys(target.entities),
    ])
    let anyDiff = false
    for (const key of [...allKeys].sort()) {
      const prev = prevEntities[key]?.next
      const next = target.entities[key]?.next
      if (prev !== next) {
        console.log(`  ${key}: ${prev ?? '(absent)'} -> ${next ?? '(absent)'}`)
        anyDiff = true
      } else {
        console.log(`  ${key}: ${prev} (unchanged)`)
      }
    }
    if (prevTarget.fiscalYear !== target.fiscalYear) {
      console.log(
        `  fiscalYear: ${prevTarget.fiscalYear} -> ${target.fiscalYear}`,
      )
      anyDiff = true
    }
    if (!anyDiff) {
      console.log('  (no advance; Ops counter is already aligned with legacy)')
    }
  }
  console.log('')

  if (dryRun) {
    console.log('dry-run complete. no files written.')
    return
  }
  fs.writeFileSync(
    TARGET_PATH,
    JSON.stringify(target, null, 2) + '\n',
    'utf-8',
  )
  console.log(`wrote ${TARGET_PATH}`)
}

try {
  main()
} catch (err) {
  console.error('snapshot-pi-counter failed:', err.message)
  process.exit(1)
}
