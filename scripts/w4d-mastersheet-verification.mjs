#!/usr/bin/env node

/*
 * W4-D.8 Phase 1: Mastersheet backfill VERIFICATION TABLE.
 *
 * READ-ONLY. No data mutation. Produces a per-row verification table
 * for Anish to review row-by-row before any data lands.
 *
 *   Input:
 *     ops-data/Mastersheet-Implementation_-_AnishD.xlsx
 *       - Delivery Tracker TWs sheet (14 rows)
 *       - Delivery Tracker Cretile sheet (14 rows)
 *
 *   Output (read-only):
 *     scripts/w4d-mastersheet-verification-table-2026-04-27.json
 *     scripts/w4d-mastersheet-verification-table-2026-04-27.csv
 *
 * Independence axes vs the original W4-C.4 backfill:
 *   1. Hardcoded CANONICAL_51_LIST (snapshot from mous.json on 2026-04-28
 *      per W4-C.7 verification gate) gates active-cohort matching from
 *      drift on mous.json. Archived 92-list is read from mous.json since
 *      archived names aren't subject to ongoing operational curation.
 *   2. Name-based Jaccard token comparison (different metric from any
 *      production matching code path).
 *   3. AY heuristic per the W4-D.8 brief:
 *        TWs    -> if active 2627 candidate has no Dispatch on file,
 *                  recommend the archived 2526 candidate (historical
 *                  delivery; pre-W4 system).
 *        Cretile-> Date Of Request Raised >= 2026-04 means active 2627
 *                  (current academic year); else archived 2526.
 *   4. W4-C IntakeRecord cross-reference: if an IntakeRecord exists on
 *      the active 2627 candidate, the candidate is high-confidence.
 *
 * Special-case quarantines:
 *   - B.D. Memorial branches (Cretile rows 8-11): defer to D-002 in
 *     docs/W4-DEFERRED-ITEMS.md. Anish resolves the chain question
 *     separately before any of these 4 rows can land.
 *   - School name in neither active 51-list nor archived 92-list:
 *     QUARANTINE with reference to D-009 (added to deferred registry).
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { execFileSync } from 'node:child_process'

const REPO_ROOT = resolve(import.meta.dirname, '..')
const MASTERSHEET_PATH = resolve(REPO_ROOT, 'ops-data/Mastersheet-Implementation_-_AnishD.xlsx')
const MOUS_PATH = resolve(REPO_ROOT, 'src/data/mous.json')
const INTAKE_PATH = resolve(REPO_ROOT, 'src/data/intake_records.json')
const DISPATCHES_PATH = resolve(REPO_ROOT, 'src/data/dispatches.json')
const REPORT_JSON = resolve(REPO_ROOT, 'scripts/w4d-mastersheet-verification-table-2026-04-27.json')
const REPORT_CSV = resolve(REPO_ROOT, 'scripts/w4d-mastersheet-verification-table-2026-04-27.csv')

// ------------------------------------------------------------------
// Hardcoded active 51-list (W4-C.7 source-of-truth snapshot).
// ------------------------------------------------------------------
const CANONICAL_51_LIST = {
  'MOU-STEAM-2627-001': 'Mutahhary Public School Baroo',
  'MOU-STEAM-2627-002': 'Jnana Bharathi English School',
  'MOU-STEAM-2627-003': 'Mahrishi Dayanand School',
  'MOU-STEAM-2627-004': 'Techno India Group Public School Kalyani',
  'MOU-STEAM-2627-005': 'Techno India Group Public School Asansol',
  'MOU-STEAM-2627-006': 'Techno India Group Public School Panagarh',
  'MOU-STEAM-2627-007': 'St. Mary Convent School',
  'MOU-STEAM-2627-008': 'Loreto Day School BB',
  'MOU-STEAM-2627-009': 'Kavyapta Global School',
  'MOU-STEAM-2627-010': 'Embee Rosebud Hr. Sec. School',
  'MOU-STEAM-2627-011': 'The Learning Sanctuary',
  'MOU-STEAM-2627-012': 'Rootland Sec. School',
  'MOU-STEAM-2627-013': 'K.E Carmel School - Amtala',
  'MOU-STEAM-2627-014': 'K.E Carmel School - Suri',
  'MOU-STEAM-2627-015': 'Blue Angels Global School',
  'MOU-STEAM-2627-016': 'Tathastu Innovations (LAB ) Meerut',
  'MOU-STEAM-2627-017': 'Holy Child English Academy, Malda',
  'MOU-STEAM-2627-018': 'SD Senior Secondary School',
  'MOU-STEAM-2627-019': 'Christ Mission School',
  'MOU-STEAM-2627-020': 'Delhi World Public School, Barasat',
  'MOU-STEAM-2627-021': 'Jaffaria Academy of Modern Education - Kargil',
  'MOU-STEAM-2627-022': 'B.D Memorial Jr. School',
  'MOU-STEAM-2627-023': 'GNIMS Business School',
  'MOU-STEAM-2627-024': 'Guru Nanak Institute of Management Studies',
  'MOU-STEAM-2627-025': 'Lions Calcutta Greater Vidya Mandir',
  'MOU-STEAM-2627-026': 'B I T Global School',
  'MOU-STEAM-2627-027': 'Don Bosco Krishnanagar',
  'MOU-STEAM-2627-028': 'Loreto Day School Kolkata',
  'MOU-STEAM-2627-029': 'Carmel Convent High School, Durgapur',
  'MOU-STEAM-2627-030': 'Carmel School, Durgapur',
  'MOU-STEAM-2627-031': "St. Montfort's Sr. Secondary School, Baruipur",
  'MOU-STEAM-2627-032': 'Laxmipat Singhania Academy',
  'MOU-STEAM-2627-033': 'Julien Educational Trust, Eglin Road',
  'MOU-STEAM-2627-034': 'Julien Educational Trust, Kalyani',
  'MOU-STEAM-2627-035': 'Julien Educational Trust, Ganganagar',
  'MOU-STEAM-2627-036': 'Julien Educational Trust, Howrah',
  'MOU-STEAM-2627-037': 'Swarnim International School',
  'MOU-STEAM-2627-038': 'St. Paul’s Mission School',
  'MOU-STEAM-2627-039': "St. Paul's Boarding And Day School",
  'MOU-STEAM-2627-040': 'Berhampore City Public School',
  'MOU-STEAM-2627-041': 'Shaw Public School',
  'MOU-STEAM-2627-042': 'Sri R. N. Singh Memorial High School (For Class 8)',
  'MOU-STEAM-2627-043': 'Sri R. N. Singh Memorial High School',
  'MOU-STEAM-2627-044': 'Sumana Dutta Memorial Vivekananda International School',
  'MOU-STEAM-2627-045': 'Hariyana International Academy - Class 2 - 7',
  'MOU-STEAM-2627-046': 'The Scottish Church Collegiate School',
  'MOU-STEAM-2627-047': 'St. Johns High School',
  'MOU-STEAM-2627-048': 'Rishi Aurobindo Memorial Academy',
  'MOU-STEAM-2627-049': 'Darshan Academy, Devlali',
  'MOU-STEAM-2627-050': 'Young Horizons School',
  'MOU-STEAM-2627-051': 'Ramanarayana Education Trust',
}

// ------------------------------------------------------------------
// B.D. Memorial branch sentinel (deferred per D-002).
// ------------------------------------------------------------------
const BD_MEMORIAL_BRANCH_RE = /b\.?d\.?\s*memorial.*\b(bansdroni|golf garden|garia|vijaygarh)\b/i

// ------------------------------------------------------------------
// Tokeniser + Jaccard for name-based fuzzy match.
// ------------------------------------------------------------------
function normalize(s) {
  if (!s) return ''
  return String(s)
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function tokens(s) {
  const STOP = new Set([
    'school', 'schools', 'the', 'of', 'and', 'group', 'public',
    'sr', 'secondary', 'sec', 'senior', 'high', 'hr', 'st',
  ])
  return new Set(
    normalize(s)
      .split(/\s+/)
      .filter((t) => t.length >= 2 && !STOP.has(t)),
  )
}

function jaccard(a, b) {
  if (a.size === 0 && b.size === 0) return 1
  if (a.size === 0 || b.size === 0) return 0
  let intersect = 0
  for (const t of a) if (b.has(t)) intersect++
  return intersect / (a.size + b.size - intersect)
}

function bestCandidate(rawName, candidates) {
  // candidates: array of { id, schoolName }
  const target = tokens(rawName)
  let best = null
  for (const c of candidates) {
    const score = jaccard(target, tokens(c.schoolName))
    if (best === null || score > best.score) best = { ...c, score }
  }
  return best
}

// ------------------------------------------------------------------
// Mastersheet xlsx reader (Python child process; mirrors W4-C.4 path).
// ------------------------------------------------------------------
function readMastersheet() {
  const py = `
import openpyxl, json, sys
wb = openpyxl.load_workbook(r'${MASTERSHEET_PATH.replace(/\\/g, '/')}', data_only=True)

tws = []
ws = wb['Delivery Tracker TWs']
SKU_COLS = {
    8: 'Tech A Sketch', 9: 'Steam Academy', 10: 'Weather Station',
    11: 'Smart Lamp', 12: 'Tinkrsynth', 13: 'MorseCoding',
    14: 'Pampered Plant', 15: 'Launchpad',
    16: 'Art Electric Grade 1-2', 17: 'Art Electric Grade 3-5',
    18: 'Push Pull Pin', 19: 'Tinkrpython',
    20: 'TinkrBotScout', 21: 'Tinkrexplorer',
}
for ri in range(4, ws.max_row + 1):
    sr = ws.cell(ri, 1).value
    school = ws.cell(ri, 2).value
    if sr is None and school is None: continue
    if not school: continue
    line_items = []
    for ci, sku in SKU_COLS.items():
        v = ws.cell(ri, ci).value
        if isinstance(v, (int, float)) and v > 0:
            line_items.append({'kind': 'flat', 'skuName': sku, 'quantity': int(v)})
    tws.append({
        'sheet': 'TWs',
        'rowNumber': ri,
        'sr': sr,
        'school': school,
        'spocName': ws.cell(ri, 3).value,
        'spocPhone': str(ws.cell(ri, 4).value) if ws.cell(ri, 4).value else None,
        'address': ws.cell(ri, 5).value,
        'totalStudents': ws.cell(ri, 6).value,
        'trainingModel': ws.cell(ri, 7).value,
        'lineItems': line_items,
        'deliveryStatus': ws.cell(ri, 25).value,
        'dateRaised': None,
    })

cretile = []
ws = wb['Delivery Tracker Cretile']
for ri in range(4, ws.max_row + 1):
    sr = ws.cell(ri, 1).value
    school = ws.cell(ri, 3).value
    if sr is None and school is None: continue
    if not school: continue
    date_raised = ws.cell(ri, 2).value
    date_iso = date_raised.isoformat() if hasattr(date_raised, 'isoformat') else (str(date_raised) if date_raised else None)
    grade_alloc = []
    for grade in range(1, 11):
        v = ws.cell(ri, 9 + grade).value
        if isinstance(v, (int, float)) and v > 0:
            grade_alloc.append({'grade': grade, 'quantity': int(v)})
    line_items = []
    if grade_alloc:
        line_items.append({'kind': 'per-grade', 'skuName': 'Cretile Grade-band kit', 'gradeAllocations': grade_alloc})
    cretile.append({
        'sheet': 'Cretile',
        'rowNumber': ri,
        'sr': sr,
        'school': school,
        'spocName': ws.cell(ri, 7).value,
        'spocPhone': str(ws.cell(ri, 9).value) if ws.cell(ri, 9).value else None,
        'address': ws.cell(ri, 4).value,
        'totalStudents': ws.cell(ri, 20).value,
        'trainingModel': ws.cell(ri, 5).value,
        'lineItems': line_items,
        'deliveryStatus': ws.cell(ri, 22).value,
        'dateRaised': date_iso,
    })

sys.stdout.write(json.dumps({'tws': tws, 'cretile': cretile}, ensure_ascii=False))
`
  const stdout = execFileSync('python', ['-c', py], { encoding: 'utf-8', maxBuffer: 50 * 1024 * 1024 })
  return JSON.parse(stdout)
}

// ------------------------------------------------------------------
// Per-row classifier
// ------------------------------------------------------------------
function classifyRow(row, ctx) {
  const {
    activeCandidates,
    archivedCandidates,
    dispatchByMou,
    intakeByMou,
  } = ctx

  // Special-case 1: B.D. Memorial branch (D-002 deferred).
  if (BD_MEMORIAL_BRANCH_RE.test(row.school)) {
    return {
      recommendation: 'QUARANTINE',
      confidence: 'high',
      activeCandidate: null,
      archivedCandidate: null,
      hasIntake: false,
      hasDispatch: false,
      ayHeuristic: 'b.d. memorial branch',
      reasoning: 'B.D. Memorial branch (Bansdroni / Golf Garden / Garia / Vijaygarh). Defer to D-002 in W4-DEFERRED-ITEMS.md; Anish resolves the chain question separately before this row can land.',
    }
  }

  // Find candidates in both lists.
  const activeBest = bestCandidate(row.school, activeCandidates)
  const archivedBest = bestCandidate(row.school, archivedCandidates)

  const STRONG = 0.5
  // PLAUSIBLE 0.20: tuned so the 4 Julien Day rows (jaccard 0.29-0.40 due to
  // upstream "Eglin" typo + brand-name divergence "Day School" vs
  // "Educational Trust") classify consistently as MANUAL-REVIEW rather than
  // splitting between QUARANTINE (Elgin) and MANUAL-REVIEW (the other 3).
  // False-positives at this threshold land in MANUAL-REVIEW (Anish reviews);
  // QUARANTINE remains for genuinely zero-overlap rows + the BD Memorial
  // sentinel.
  const PLAUSIBLE = 0.2

  const activeIsStrong = activeBest !== null && activeBest.score >= STRONG
  const archivedIsStrong = archivedBest !== null && archivedBest.score >= STRONG
  const activeIsPlausible = activeBest !== null && activeBest.score >= PLAUSIBLE
  const archivedIsPlausible = archivedBest !== null && archivedBest.score >= PLAUSIBLE

  // No plausible candidate in either list -> QUARANTINE (D-009 catch-all).
  if (!activeIsPlausible && !archivedIsPlausible) {
    return {
      recommendation: 'QUARANTINE',
      confidence: 'high',
      activeCandidate: activeBest,
      archivedCandidate: archivedBest,
      hasIntake: false,
      hasDispatch: false,
      ayHeuristic: 'no candidate',
      reasoning: `School "${row.school}" matches neither active 51-list (best score ${activeBest?.score?.toFixed(2) ?? '0'}) nor archived 92-list (best score ${archivedBest?.score?.toFixed(2) ?? '0'}). Defer to D-009.`,
    }
  }

  const hasIntake = activeBest !== null && intakeByMou.has(activeBest.id)
  const hasDispatch = activeBest !== null && dispatchByMou.has(activeBest.id)

  // Apply AY heuristic per sheet.
  let ayPick = null  // 'active' | 'archived' | 'manual-review'
  let ayReason = ''
  if (row.sheet === 'Cretile') {
    // Cretile date heuristic: 2026-04+ -> active 2627
    if (row.dateRaised) {
      const d = new Date(row.dateRaised)
      const y = d.getUTCFullYear()
      const m = d.getUTCMonth() + 1
      const ayActive = y > 2026 || (y === 2026 && m >= 4)
      ayPick = ayActive ? 'active' : 'archived'
      ayReason = `Date Of Request Raised ${row.dateRaised.slice(0, 10)} ${ayActive ? '>= 2026-04 -> active 2627 cohort.' : '< 2026-04 -> archived 2526 cohort.'}`
    } else {
      ayPick = 'manual-review'
      ayReason = 'No date on Cretile row; cannot apply AY heuristic.'
    }
  } else {
    // TWs heuristic: if active candidate has no Dispatch, lean archived.
    if (activeIsStrong && hasDispatch) {
      ayPick = 'active'
      ayReason = `TWs row + active candidate ${activeBest.id} already has Dispatch on file -> likely the recorded delivery.`
    } else if (activeIsStrong && !hasDispatch && archivedIsPlausible) {
      ayPick = 'archived'
      ayReason = `TWs row + active candidate ${activeBest.id} is pre-dispatch (no Dispatch on file). Archived 2526 candidate exists; TWs delivery is likely the historical pre-system record.`
    } else if (activeIsStrong && !hasDispatch && !archivedIsPlausible) {
      ayPick = 'manual-review'
      ayReason = `TWs row + active candidate ${activeBest.id} is pre-dispatch and no archived 2526 counterpart. Either the TWs delivery is a current 2627 dispatch yet to be recorded (-> active) or a historical with no MOU record (-> quarantine D-009).`
    } else if (!activeIsStrong && archivedIsStrong) {
      ayPick = 'archived'
      ayReason = 'No active 2627 match; strong archived 2526 candidate -> historical delivery.'
    } else {
      ayPick = 'manual-review'
      ayReason = 'TWs row matches both active and archived candidates weakly; AY heuristic inconclusive.'
    }
  }

  // Build recommendation.
  if (ayPick === 'active' && activeIsStrong) {
    const conf = hasIntake ? 'high (intake-confirmed)' : (activeBest.score >= 0.8 ? 'high' : 'medium')
    return {
      recommendation: 'AUTO-IMPORT',
      target: 'active',
      targetMouId: activeBest.id,
      targetCanonicalName: activeBest.schoolName,
      confidence: conf,
      activeCandidate: activeBest,
      archivedCandidate: archivedBest,
      hasIntake,
      hasDispatch,
      ayHeuristic: ayReason,
      reasoning: `Match active 2627 ${activeBest.id} ("${activeBest.schoolName}") jaccard ${activeBest.score.toFixed(2)}. ${hasIntake ? 'INTAKE-CONFIRMED on this MOU. ' : ''}${ayReason}`,
    }
  }
  if (ayPick === 'archived' && archivedIsPlausible) {
    const conf = archivedBest.score >= 0.6 ? 'high' : 'medium'
    return {
      recommendation: 'AUTO-IMPORT',
      target: 'archived',
      targetMouId: archivedBest.id,
      targetCanonicalName: archivedBest.schoolName,
      confidence: conf,
      activeCandidate: activeBest,
      archivedCandidate: archivedBest,
      hasIntake,
      hasDispatch,
      ayHeuristic: ayReason,
      reasoning: `Match archived 2526 ${archivedBest.id} ("${archivedBest.schoolName}") jaccard ${archivedBest.score.toFixed(2)}. ${ayReason}`,
    }
  }

  // Otherwise MANUAL-REVIEW.
  return {
    recommendation: 'MANUAL-REVIEW',
    confidence: 'medium',
    activeCandidate: activeBest,
    archivedCandidate: archivedBest,
    hasIntake,
    hasDispatch,
    ayHeuristic: ayReason,
    reasoning: `${ayReason} Surface to Anish to pick between active ${activeBest?.id ?? 'none'} (jaccard ${activeBest?.score?.toFixed(2) ?? '0'}) and archived ${archivedBest?.id ?? 'none'} (jaccard ${archivedBest?.score?.toFixed(2) ?? '0'}).`,
  }
}

// ------------------------------------------------------------------
// CSV escape
// ------------------------------------------------------------------
function csvEscape(s) {
  if (s === null || s === undefined) return ''
  const v = String(s)
  if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`
  return v
}

// ------------------------------------------------------------------
// Main
// ------------------------------------------------------------------
function main() {
  const mous = JSON.parse(readFileSync(MOUS_PATH, 'utf-8'))
  const intakeRecords = JSON.parse(readFileSync(INTAKE_PATH, 'utf-8'))
  const dispatches = JSON.parse(readFileSync(DISPATCHES_PATH, 'utf-8'))

  // Build candidate lists. Active uses hardcoded snapshot (W4-C.7 source-
  // of-truth). Archived comes from mous.json (cohortStatus='archived').
  const activeCandidates = Object.entries(CANONICAL_51_LIST).map(([id, name]) => ({
    id,
    schoolName: name,
  }))
  const archivedCandidates = mous
    .filter((m) => m.cohortStatus === 'archived')
    .map((m) => ({ id: m.id, schoolName: m.schoolName }))

  const intakeByMou = new Set(intakeRecords.map((ir) => ir.mouId))
  const dispatchByMou = new Set(dispatches.map((d) => d.mouId).filter((x) => x !== null))

  const ctx = { activeCandidates, archivedCandidates, dispatchByMou, intakeByMou }

  const sheets = readMastersheet()
  const rows = [...sheets.tws, ...sheets.cretile]

  const verifications = rows.map((row) => {
    const verdict = classifyRow(row, ctx)
    return {
      sheet: row.sheet,
      rowNumber: row.rowNumber,
      sr: row.sr,
      schoolRaw: row.school,
      spocName: row.spocName,
      spocPhone: row.spocPhone,
      totalStudents: row.totalStudents,
      trainingModel: row.trainingModel,
      lineItems: row.lineItems,
      dateRaised: row.dateRaised,
      deliveryStatus: row.deliveryStatus,
      ...verdict,
    }
  })

  const counts = {
    autoImport: verifications.filter((v) => v.recommendation === 'AUTO-IMPORT').length,
    manualReview: verifications.filter((v) => v.recommendation === 'MANUAL-REVIEW').length,
    quarantine: verifications.filter((v) => v.recommendation === 'QUARANTINE').length,
  }

  const report = {
    generatedAt: '2026-04-28T15:00:00.000Z',
    purpose: 'W4-D.8 Phase 1 Mastersheet backfill verification table. Read-only; no data mutation. Anish reviews before mutation script (Phase 2) runs.',
    canonicalActiveSource: 'Hardcoded CANONICAL_51_LIST (W4-C.7 source-of-truth snapshot from mous.json on 2026-04-28).',
    canonicalArchivedSource: 'mous.json filtered cohortStatus=archived (raw upstream; not subject to operational curation).',
    matchingMetric: 'Jaccard token overlap with stop-word filtering. Independent code path from W4-C.4 positional indexing.',
    rowCount: verifications.length,
    summary: counts,
    rows: verifications,
  }

  writeFileSync(REPORT_JSON, JSON.stringify(report, null, 2) + '\n', 'utf-8')

  // CSV: human-readable, one row per Mastersheet row.
  const headers = [
    'sheet', 'rowNumber', 'schoolRaw', 'totalStudents', 'lineItemSummary',
    'dateRaised',
    'activeCandidateId', 'activeCandidateName', 'activeJaccard',
    'archivedCandidateId', 'archivedCandidateName', 'archivedJaccard',
    'hasIntake', 'hasDispatch',
    'recommendation', 'targetMouId', 'targetCanonicalName',
    'confidence', 'reasoning',
  ]
  const lines = [headers.join(',')]
  for (const v of verifications) {
    const lineItemSummary = v.lineItems.map((it) => {
      if (it.kind === 'flat') return `${it.skuName}:${it.quantity}`
      return `${it.skuName}:[${it.gradeAllocations.map((a) => `G${a.grade}=${a.quantity}`).join(';')}]`
    }).join('|')
    lines.push([
      v.sheet,
      v.rowNumber,
      csvEscape(v.schoolRaw),
      v.totalStudents ?? '',
      csvEscape(lineItemSummary),
      v.dateRaised ? v.dateRaised.slice(0, 10) : '',
      v.activeCandidate?.id ?? '',
      csvEscape(v.activeCandidate?.schoolName ?? ''),
      v.activeCandidate?.score?.toFixed(2) ?? '',
      v.archivedCandidate?.id ?? '',
      csvEscape(v.archivedCandidate?.schoolName ?? ''),
      v.archivedCandidate?.score?.toFixed(2) ?? '',
      v.hasIntake ? 'true' : 'false',
      v.hasDispatch ? 'true' : 'false',
      v.recommendation,
      v.targetMouId ?? '',
      csvEscape(v.targetCanonicalName ?? ''),
      csvEscape(v.confidence),
      csvEscape(v.reasoning),
    ].join(','))
  }
  writeFileSync(REPORT_CSV, lines.join('\n') + '\n', 'utf-8')

  console.log(`[w4d.8.verify] rows:           ${verifications.length}`)
  console.log(`[w4d.8.verify] AUTO-IMPORT:    ${counts.autoImport}`)
  console.log(`[w4d.8.verify] MANUAL-REVIEW:  ${counts.manualReview}`)
  console.log(`[w4d.8.verify] QUARANTINE:     ${counts.quarantine}`)
  console.log(`[w4d.8.verify] json:           ${REPORT_JSON}`)
  console.log(`[w4d.8.verify] csv:            ${REPORT_CSV}`)
}

main()
