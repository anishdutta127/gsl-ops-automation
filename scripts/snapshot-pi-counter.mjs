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

// Phase 6B: Series B parser. The pre-system FY 25-26 PIs in Ops
// payments.json carry the no-entity-prefix shape: MTPL/25-26/<seq>.
// Original entity attribution is ambiguous in source data; this
// parser returns the seq only, callers seed both MH and UP at
// (highest seq + 1) as a defensive double-seed.
function parseSeriesBPiNumber(piNumber) {
  if (typeof piNumber !== 'string') return null
  const m = piNumber.match(/^MTPL\/(\d{2}-\d{2})\/(\d+)$/)
  if (!m) return null
  return {
    fy: m[1].replace('-', ''),
    seq: Number(m[2]),
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

// Phase 6B: scan Ops payments.json for Series B (MTPL/25-26/<seq>,
// no entity prefix). Returns the highest seq found across all Series
// B rows, or 0 if none. Source data is in Ops, not legacy, because
// the Pratik Excel import landed Series B into Ops payments only.
function scanSeriesBHighest() {
  const opsPaymentsPath = path.join(REPO_ROOT, 'src/data/payments.json')
  if (!fs.existsSync(opsPaymentsPath)) return 0
  const opsPayments = JSON.parse(fs.readFileSync(opsPaymentsPath, 'utf-8'))
  let highest = 0
  for (const p of opsPayments) {
    const parsed = parseSeriesBPiNumber(p.piNumber)
    if (parsed && parsed.fy === '2526' && parsed.seq > highest) {
      highest = parsed.seq
    }
  }
  return highest
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
  const seriesBHighest = scanSeriesBHighest()

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

  // Build the target counter map. Phase 6B adds priorFiscalYears
  // with FY 25-26 defensive double-seed (both entities at
  // seriesBHighest+1) so a future Reissue against a FY 25-26 MOU
  // cannot collide with the historic Series B numbers regardless of
  // which entity Pratik originally used.
  const priorSeed = seriesBHighest + 1
  const target = {
    _comment:
      "Phase 6B cutover snapshot of gsl-mou-system/src/data/pi_counter.json (verified against vex_pis.json + payments.json ledger). Ops is now the source of truth; legacy is read-only post-banner. priorFiscalYears['2526'] is a defensive double-seed (both MH and UP at next=" +
      priorSeed +
      ') past the historic Series B max (MTPL/25-26/' +
      seriesBHighest +
      ' in Ops payments.json, on YP MOUs; original entity attribution is ambiguous in source data, so seeding both protects against collision regardless of which entity Pratik historically used).',
    fiscalYear: legacyCounter.fiscalYear,
    entities: legacyCounter.entities,
    priorFiscalYears: {
      ...(prevTarget?.priorFiscalYears ?? {}),
      // Only seed 2526 if not already present, OR if the existing
      // seed is below the scanned series B max+1 (guarded against
      // accidentally lowering a counter that's been advanced live).
      2526: (() => {
        const existing = prevTarget?.priorFiscalYears?.['2526']?.entities
        const mhExisting = existing?.MH?.next ?? 0
        const upExisting = existing?.UP?.next ?? 0
        return {
          entities: {
            MH: { next: Math.max(priorSeed, mhExisting) },
            UP: { next: Math.max(priorSeed, upExisting) },
          },
        }
      })(),
    },
  }
  console.log(
    `series B (MTPL/25-26/<seq> in Ops payments.json) highest seq: ${seriesBHighest}`,
  )
  console.log(`priorFiscalYears['2526'] seed (defensive double): ${priorSeed}`)
  console.log('')

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
