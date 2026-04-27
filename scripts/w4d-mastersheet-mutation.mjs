#!/usr/bin/env node

/*
 * W4-D.8 Phase 2: Mastersheet backfill MUTATION.
 *
 * Reads scripts/w4d-mastersheet-verification-table-2026-04-27.json (the
 * Phase 1 read-only output Anish row-by-row signed off on 2026-04-28)
 * and writes Dispatch records into src/data/dispatches.json plus the
 * _fixtures mirror. Mirrors a 'dispatch-backfilled-from-mastersheet'
 * audit entry on each created Dispatch and on the parent MOU.
 *
 * Anish's resolutions for the 6 MANUAL-REVIEW rows + the 4 BD Memorial
 * QUARANTINE rows are hardcoded as ANISH_RESOLUTIONS below.
 *
 * Output:
 *   - 18 AUTO-IMPORTs land directly per the verification table
 *   - 4 Julien chain rows land on archived 2526 targets per Anish
 *   - 1 St. Johns TWs row 17 SKIPPED (Anish: suspected duplicate of
 *     Cretile row 17)
 *   - 1 Contai row QUARANTINED (Anish: not sure on renewal status)
 *   - 4 BD Memorial branches QUARANTINED per D-002
 *
 * Total Dispatches written: 22 (18 auto + 4 Julien)
 * Total quarantines:        5 (4 BDM + 1 Contai)
 * Total skipped:            1 (St. Johns TWs row 17)
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const REPO_ROOT = resolve(import.meta.dirname, '..')
const VERIFICATION_PATH = resolve(REPO_ROOT, 'scripts/w4d-mastersheet-verification-table-2026-04-27.json')
const MOUS_PATH = resolve(REPO_ROOT, 'src/data/mous.json')
const FIXTURES_MOUS_PATH = resolve(REPO_ROOT, 'src/data/_fixtures/mous.json')
const DISPATCHES_PATH = resolve(REPO_ROOT, 'src/data/dispatches.json')
const FIXTURES_DISPATCHES_PATH = resolve(REPO_ROOT, 'src/data/_fixtures/dispatches.json')
const REPORT_PATH = resolve(REPO_ROOT, 'scripts/w4d-mastersheet-mutation-report-2026-04-27.json')
const TS = '2026-04-28T15:30:00.000Z'

// ------------------------------------------------------------------
// Anish's row-by-row resolutions (locked sign-off 2026-04-28).
// Keyed by `${sheet}#${rowNumber}`.
// ------------------------------------------------------------------
const ANISH_RESOLUTIONS = {
  // Julien chain: defaulted to archived 2526 per AY heuristic. Anish
  // flagged D-011 (brand identity) and D-012 (Elgin/Eglin spelling) for
  // round 2 cleanup. Land the 4 records on the archived MOUs.
  'TWs#6': { decision: 'IMPORT', target: 'archived', mouId: 'MOU-STEAM-2526-007' },
  'TWs#7': { decision: 'IMPORT', target: 'archived', mouId: 'MOU-STEAM-2526-008' },
  'TWs#8': { decision: 'IMPORT', target: 'archived', mouId: 'MOU-STEAM-2526-009' },
  'TWs#9': { decision: 'IMPORT', target: 'archived', mouId: 'MOU-STEAM-2526-010' },
  // St. Johns TWs row 17: SKIP (suspected duplicate of Cretile row 17).
  // D-013 captures the round 2 confirmation question.
  'TWs#17': { decision: 'SKIP', reason: 'suspected duplicate of Cretile row 17 (St. Johns High School). D-013 flags for round 2 confirmation.' },
  // Contai Cretile row 15: QUARANTINE per Anish's not-sure-on-renewal.
  // D-014 captures the round 2 confirmation question.
  'Cretile#15': { decision: 'QUARANTINE', reason: 'Contai Public School renewal status uncertain; D-014 flags for round 2 confirmation.' },
}

function dispatchIdFor(sheet, rowNumber) {
  return `DIS-BF-${sheet}-r${rowNumber}`
}

function backfillDispatch({ sheet, rowNumber, mouId, schoolId, lineItems, notes, dateRaised, confidence, mouCanonicalName }) {
  const totalQuantity = lineItems.reduce((sum, li) => {
    if (li.kind === 'flat') return sum + li.quantity
    return sum + li.gradeAllocations.reduce((s, a) => s + a.quantity, 0)
  }, 0)

  const audit = {
    timestamp: TS,
    user: 'system-pre-w4d',
    action: 'dispatch-backfilled-from-mastersheet',
    after: {
      sheet,
      rowNumber,
      mouTarget: mouId,
      mouCanonicalName,
      lineItemCount: lineItems.length,
      totalQuantity,
      confidence,
      source: 'W4-D.8 verification table Anish-signed 2026-04-28',
    },
    notes: `Backfilled historical delivery from Mastersheet ${sheet} sheet row ${rowNumber}. Confidence: ${confidence}. Pre-system delivery; precise dates not captured.`,
  }

  return {
    id: dispatchIdFor(sheet, rowNumber),
    mouId,
    schoolId,
    installmentSeq: 1,
    stage: 'delivered',
    installment1Paid: true,
    overrideEvent: null,
    poRaisedAt: dateRaised ?? null,
    dispatchedAt: null,
    deliveredAt: null,
    acknowledgedAt: null,
    acknowledgementUrl: null,
    notes,
    lineItems,
    requestId: null,
    raisedBy: 'system-pre-w4d',
    raisedFrom: 'pre-w4d',
    auditLog: [audit],
  }
}

function mirroredMouAudit({ sheet, rowNumber, dispatchId, lineItemCount, totalQuantity, confidence }) {
  return {
    timestamp: TS,
    user: 'system-pre-w4d',
    action: 'dispatch-backfilled-from-mastersheet',
    after: {
      dispatchId,
      sheet,
      rowNumber,
      lineItemCount,
      totalQuantity,
      confidence,
    },
    notes: `Mastersheet backfill landed historical delivery (${sheet} row ${rowNumber}).`,
  }
}

function main() {
  const verification = JSON.parse(readFileSync(VERIFICATION_PATH, 'utf-8'))
  const mous = JSON.parse(readFileSync(MOUS_PATH, 'utf-8'))
  const dispatches = JSON.parse(readFileSync(DISPATCHES_PATH, 'utf-8'))
  const mouById = new Map(mous.map((m) => [m.id, m]))

  const result = {
    generatedAt: TS,
    purpose: 'W4-D.8 Phase 2 mutation report. Anish-signed Phase 1 verification table drives every decision; ANISH_RESOLUTIONS hardcodes the 6 MANUAL-REVIEW + 4 QUARANTINE row-level decisions.',
    created: [],
    skipped: [],
    quarantined: [],
  }

  // Existing Dispatch ids (collision guard).
  const existingIds = new Set(dispatches.map((d) => d.id))

  for (const row of verification.rows) {
    const key = `${row.sheet}#${row.rowNumber}`
    const resolution = ANISH_RESOLUTIONS[key] ?? null

    // Determine final disposition.
    let disposition // 'IMPORT' | 'SKIP' | 'QUARANTINE'
    let mouId = null
    let target = null

    if (resolution) {
      disposition = resolution.decision
      mouId = resolution.mouId ?? null
      target = resolution.target ?? null
    } else if (row.recommendation === 'AUTO-IMPORT') {
      disposition = 'IMPORT'
      mouId = row.targetMouId
      target = row.target
    } else if (row.recommendation === 'QUARANTINE') {
      disposition = 'QUARANTINE'
    } else {
      // MANUAL-REVIEW with no Anish-resolution -> implicit quarantine guard.
      // Should not happen given ANISH_RESOLUTIONS covers every MANUAL-REVIEW row.
      disposition = 'QUARANTINE'
      console.warn(`[w4d.8.mut] WARN: ${key} is MANUAL-REVIEW with no resolution; quarantining defensively.`)
    }

    if (disposition === 'SKIP') {
      result.skipped.push({
        sheet: row.sheet,
        rowNumber: row.rowNumber,
        schoolRaw: row.schoolRaw,
        reason: resolution?.reason ?? 'no reason provided',
      })
      continue
    }

    if (disposition === 'QUARANTINE') {
      result.quarantined.push({
        sheet: row.sheet,
        rowNumber: row.rowNumber,
        schoolRaw: row.schoolRaw,
        reason: resolution?.reason ?? row.reasoning,
      })
      continue
    }

    // disposition === 'IMPORT'
    const targetMou = mouById.get(mouId)
    if (!targetMou) {
      throw new Error(`Resolution targets MOU ${mouId} which is not in mous.json (${key})`)
    }

    const dispatchId = dispatchIdFor(row.sheet, row.rowNumber)
    if (existingIds.has(dispatchId)) {
      throw new Error(`Dispatch id ${dispatchId} already exists in dispatches.json. Bailing out to avoid duplicate.`)
    }
    existingIds.add(dispatchId)

    const confidence = resolution
      ? `Anish-resolved ${target} (${resolution.decision === 'IMPORT' ? 'manual-review reso' : ''})`
      : (row.confidence ?? 'medium')

    const dispatch = backfillDispatch({
      sheet: row.sheet,
      rowNumber: row.rowNumber,
      mouId,
      schoolId: targetMou.schoolId,
      lineItems: row.lineItems,
      notes: `W4-D.8 backfill from Mastersheet ${row.sheet} sheet row ${row.rowNumber}. ${target === 'archived' ? 'Historical pre-system delivery on archived MOU.' : 'Active 2627 cohort delivery.'}`,
      dateRaised: row.dateRaised,
      confidence,
      mouCanonicalName: targetMou.schoolName,
    })

    dispatches.push(dispatch)

    const lineItemCount = dispatch.lineItems.length
    const totalQuantity = dispatch.auditLog[0].after.totalQuantity
    targetMou.auditLog = targetMou.auditLog ?? []
    targetMou.auditLog.push(mirroredMouAudit({
      sheet: row.sheet,
      rowNumber: row.rowNumber,
      dispatchId,
      lineItemCount,
      totalQuantity,
      confidence,
    }))

    result.created.push({
      dispatchId,
      sheet: row.sheet,
      rowNumber: row.rowNumber,
      schoolRaw: row.schoolRaw,
      mouId,
      mouCanonicalName: targetMou.schoolName,
      lineItemCount,
      totalQuantity,
      confidence,
    })
  }

  // Write outputs.
  writeFileSync(DISPATCHES_PATH, JSON.stringify(dispatches, null, 2) + '\n', 'utf-8')
  writeFileSync(FIXTURES_DISPATCHES_PATH, JSON.stringify(dispatches, null, 2) + '\n', 'utf-8')
  writeFileSync(MOUS_PATH, JSON.stringify(mous, null, 2) + '\n', 'utf-8')
  writeFileSync(FIXTURES_MOUS_PATH, JSON.stringify(mous, null, 2) + '\n', 'utf-8')
  writeFileSync(REPORT_PATH, JSON.stringify(result, null, 2) + '\n', 'utf-8')

  console.log(`[w4d.8.mut] created:    ${result.created.length}`)
  console.log(`[w4d.8.mut] skipped:    ${result.skipped.length}`)
  console.log(`[w4d.8.mut] quarantined:${result.quarantined.length}`)
  console.log(`[w4d.8.mut] total Dispatches now: ${dispatches.length} (was ${dispatches.length - result.created.length})`)
  console.log(`[w4d.8.mut] report:     ${REPORT_PATH}`)
}

main()
