#!/usr/bin/env node
/*
 * Phase 6D Part 6: backfill dueDateIso on legacy YP-2526 payment rows.
 *
 * Context: Phase 6C.1 surfaced that the 4-column panel on /mous and
 * /mous/archive renders "-" for YP-2526 row buckets even though those
 * rows carry valid Series B piNumber + receivedAmount values. The
 * cause is dueDateIso === null on those rows (legacy Week 3 backfill
 * imported them without parsed due dates), so getYearSpecificInstalments
 * returns empty and the year-scoped buckets contribute 0.
 *
 * This script walks every Payment with dueDateIso === null whose
 * piNumber matches the Series B pattern (MTPL/25-26/<seq>), looks up
 * the parent MOU's academicYear, and derives a due date from the
 * instalment number using the standard Pranav 4-instalment cadence:
 *
 *   Instalment 1 -> month 3 of the AY (June for AY 2025-26)
 *   Instalment 2 -> month 6 of the AY (September)
 *   Instalment 3 -> month 9 of the AY (December)
 *   Instalment 4 -> month 12 of the AY (March of the following year)
 *
 * MOUs with non-standard instalment counts (1 or 2 instalments instead
 * of 4) fall back to even spacing of the same calendar window:
 *
 *   1 instalment   -> month 6 of the AY (mid-year due date)
 *   2 instalments  -> months 3 and 9 of the AY
 *   3 instalments  -> months 3, 6, 9
 *   4+ instalments -> months 3, 6, 9, 12, ... (clamped to year)
 *
 * Modes:
 *   --dry-run (default): prints planned updates, writes nothing.
 *     Pranav / Anish reviews; CC pauses for CONFIRM.
 *   --apply: writes the dueDateIso + dueDateRaw fields to
 *     src/data/payments.json. Each touched row gets an auditLog entry
 *     with action='due-date-backfill-phase-6d'.
 *
 * Discipline:
 *   - Idempotent: running twice produces zero updates on the second
 *     pass (rows that already have dueDateIso are skipped).
 *   - Conservative: only touches rows where piNumber matches the
 *     Series B no-entity pattern. Programme PI rows + VEX PI rows are
 *     not modified.
 *   - Audited: every change is reversible by re-reading the auditLog
 *     before-after entries.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..')
const PAYMENTS_PATH = path.join(REPO_ROOT, 'src/data/payments.json')
const MOUS_PATH = path.join(REPO_ROOT, 'src/data/mous.json')

const args = process.argv.slice(2)
const APPLY = args.includes('--apply')
const DRY = !APPLY

const SERIES_B_PATTERN = /^MTPL\/25-26\/\d+/

// Standard month cadence (1-indexed from April, the FY start).
// For AY 2025-26 (April 2025 to March 2026):
//   month 3 of AY = June 2025
//   month 6 of AY = September 2025
//   month 9 of AY = December 2025
//   month 12 of AY = March 2026
function isoForAyMonth(academicYear, ayMonth) {
  // academicYear shape: '2025-26'
  const m = academicYear.match(/^(\d{4})-(\d{2})$/)
  if (!m) return null
  const startYear = Number(m[1])
  // April is month 0 of the AY (calendar 04). Adding ayMonth offsets:
  //   ayMonth=3 -> April + 2 months = June (start year)
  //   ayMonth=6 -> September (start year)
  //   ayMonth=9 -> December (start year)
  //   ayMonth=12 -> March (start year + 1)
  // We use (ayMonth - 1) as the offset from April so ayMonth=1 gives
  // April itself.
  const offsetMonths = ayMonth - 1
  const calendarMonth = 4 + offsetMonths // 1-indexed calendar month
  const calendarYear = startYear + Math.floor((calendarMonth - 1) / 12)
  const monthNum = ((calendarMonth - 1) % 12) + 1
  return `${calendarYear}-${String(monthNum).padStart(2, '0')}-01`
}

// Per-brief canonical mapping: instalment 1 -> AY month 3 (June for
// AY 2025-26), instalment 2 -> AY month 6 (September), instalment 3
// -> AY month 9 (December), instalment 4 -> AY month 12 (March of the
// year after). The mapping is constant per seq, independent of total
// instalment count. This matches Pranav's most common Excel cadence
// (Jun/Sep/Dec/Mar) and lines up cleanly with the standard
// quarterly-instalment finance pattern.
//
// For 5+ instalment MOUs we extend the pattern by 3-month steps,
// clamping to month 12 of the AY.
function ayMonthForInstalment(_totalInstalments, instalmentSeq) {
  if (instalmentSeq === 1) return 3
  if (instalmentSeq === 2) return 6
  if (instalmentSeq === 3) return 9
  if (instalmentSeq === 4) return 12
  return 12 // 5+ instalments fold to March end-of-FY
}

function main() {
  const payments = JSON.parse(fs.readFileSync(PAYMENTS_PATH, 'utf-8'))
  const mous = JSON.parse(fs.readFileSync(MOUS_PATH, 'utf-8'))
  const mouById = new Map(mous.map((m) => [m.id, m]))

  const plan = []
  const ts = new Date().toISOString()

  for (const p of payments) {
    if (p.dueDateIso !== null && p.dueDateIso !== undefined) continue
    if (!p.piNumber || !SERIES_B_PATTERN.test(String(p.piNumber))) continue
    const mou = mouById.get(p.mouId)
    if (!mou) {
      plan.push({
        paymentId: p.id,
        action: 'skip-no-mou',
        reason: `parent MOU ${p.mouId} not in mous.json (orphan)`,
      })
      continue
    }
    const ay = mou.academicYear
    if (!ay) {
      plan.push({
        paymentId: p.id,
        action: 'skip-no-ay',
        reason: `MOU ${p.mouId} has no academicYear`,
      })
      continue
    }
    const totalInsts = p.totalInstalments ?? 1
    const ayMonth = ayMonthForInstalment(totalInsts, p.instalmentSeq)
    const newIso = isoForAyMonth(ay, ayMonth)
    if (!newIso) {
      plan.push({
        paymentId: p.id,
        action: 'skip-bad-ay',
        reason: `Could not parse academicYear='${ay}'`,
      })
      continue
    }
    plan.push({
      paymentId: p.id,
      action: 'update',
      mouId: p.mouId,
      schoolName: p.schoolName,
      piNumber: p.piNumber,
      instalmentSeq: p.instalmentSeq,
      totalInstalments: totalInsts,
      academicYear: ay,
      ayMonth,
      before: { dueDateIso: p.dueDateIso ?? null, dueDateRaw: p.dueDateRaw ?? null },
      after: { dueDateIso: newIso, dueDateRaw: newIso },
    })
  }

  const updates = plan.filter((x) => x.action === 'update')
  const skips = plan.filter((x) => x.action !== 'update')

  console.log(`mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}`)
  console.log(`scan: ${payments.length} payments total`)
  console.log(`targets: piNumber matches /^MTPL\\/25-26\\/\\d+/ AND dueDateIso is null`)
  console.log('')
  console.log(`updates planned: ${updates.length}`)
  console.log(`skips: ${skips.length}`)
  if (skips.length > 0) {
    console.log('  skip reasons:')
    for (const s of skips) console.log(`    - ${s.paymentId}: ${s.reason}`)
  }
  console.log('')
  console.log('Sample 5 before/after pairs:')
  for (const u of updates.slice(0, 5)) {
    console.log(
      `  ${u.paymentId} (${u.schoolName}, ${u.piNumber}, instalment ${u.instalmentSeq} of ${u.totalInstalments}, AY ${u.academicYear})`,
    )
    console.log(
      `    before: dueDateIso=${u.before.dueDateIso} dueDateRaw=${u.before.dueDateRaw}`,
    )
    console.log(
      `    after:  dueDateIso=${u.after.dueDateIso} dueDateRaw=${u.after.dueDateRaw}`,
    )
  }
  console.log('')

  if (DRY) {
    console.log('DRY-RUN complete. No files written. Re-run with --apply to commit.')
    return
  }

  // Apply: write back.
  const paymentsById = new Map(payments.map((p) => [p.id, p]))
  for (const u of updates) {
    const p = paymentsById.get(u.paymentId)
    if (!p) continue
    p.dueDateIso = u.after.dueDateIso
    p.dueDateRaw = u.after.dueDateRaw
    const audit = {
      timestamp: ts,
      user: 'system',
      action: 'due-date-backfill-phase-6d',
      before: u.before,
      after: u.after,
      notes: `Phase 6D Part 6: derived dueDateIso from MOU.academicYear=${u.academicYear} + instalment ${u.instalmentSeq} of ${u.totalInstalments} (ayMonth=${u.ayMonth}).`,
    }
    p.auditLog = Array.isArray(p.auditLog) ? [...p.auditLog, audit] : [audit]
  }
  fs.writeFileSync(
    PAYMENTS_PATH,
    JSON.stringify(payments, null, 2) + '\n',
    'utf-8',
  )
  console.log(`APPLIED: wrote ${updates.length} updates to ${PAYMENTS_PATH}`)
}

main()
