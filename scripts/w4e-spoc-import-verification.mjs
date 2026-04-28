#!/usr/bin/env node

/*
 * W4-E.2 Phase 1: SPOC DB import VERIFICATION TABLE.
 *
 * READ-ONLY. No data mutation. Produces a per-row verification table
 * for Anish to review before any SchoolSPOC entries land in
 * src/data/school_spocs.json.
 *
 *   Input:
 *     ops-data/SCHOOL_SPOC_DATABASE.xlsx
 *       - South-West sheet (header row 6; 23 data rows)
 *       - East sheet (header row 3; 19 data rows)
 *       - North sheet (header row 4; 15 data rows)
 *     Total: 57 source rows.
 *
 *   Independence axes vs the original W4-C.7 + W4-D.8 verification
 *   scripts:
 *     1. City+location-weighted token match (NOT pure-name jaccard like
 *        W4-C.7; NOT sheet-aware AY heuristic like W4-D.8). Combined
 *        score blends name token overlap with location-confirmation:
 *        a school whose city or sub-location matches the SPOC DB row's
 *        Location / Sub Location text earns a confirmation bonus, and
 *        a row with NO location match is gated to MANUAL-REVIEW or
 *        QUARANTINE regardless of name jaccard. This guards against
 *        false positives like "RBSM-Main, Gurugram" matching some
 *        unrelated "RBSM Public School" without location confirmation.
 *     2. Cross-reference signal stack: matches earn 'high' confidence
 *        when an IntakeRecord OR Dispatch exists on the matched school
 *        (layered verification independent of the matching score).
 *     3. Multi-POC row expansion: a single source row whose POC fields
 *        carry comma- / newline- / semicolon-delimited content expands
 *        into N verification entries (sub-position .1 / .2 / ...).
 *        First entry tagged role='primary'; subsequent 'secondary'.
 *
 *   Output (read-only):
 *     scripts/w4e-spoc-import-verification-2026-04-28.json
 *     scripts/w4e-spoc-import-verification-2026-04-28.csv
 *
 * Anish reviews the table; resolutions feed
 *   scripts/w4e-spoc-import-mutation.mjs (Phase 2; not run yet).
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { execFileSync } from 'node:child_process'

const REPO_ROOT = resolve(import.meta.dirname, '..')
const SPOC_DB_PATH = resolve(REPO_ROOT, 'ops-data/SCHOOL_SPOC_DATABASE.xlsx')
const SCHOOLS_PATH = resolve(REPO_ROOT, 'src/data/schools.json')
const MOUS_PATH = resolve(REPO_ROOT, 'src/data/mous.json')
const INTAKE_PATH = resolve(REPO_ROOT, 'src/data/intake_records.json')
const DISPATCHES_PATH = resolve(REPO_ROOT, 'src/data/dispatches.json')
const REPORT_JSON = resolve(REPO_ROOT, 'scripts/w4e-spoc-import-verification-2026-04-28.json')
const REPORT_CSV = resolve(REPO_ROOT, 'scripts/w4e-spoc-import-verification-2026-04-28.csv')

// ------------------------------------------------------------------
// Tokenisation + matching helpers
// ------------------------------------------------------------------
const STOPWORDS = new Set([
  'school', 'schools', 'public', 'academy', 'academic', 'international',
  'global', 'memorial', 'sr', 'jr', 'senior', 'junior', 'secondary',
  'higher', 'high', 'primary', 'mission', 'convent', 'group', 'limited',
  'pvt', 'ltd', 'and', 'the', 'of', 'for', 'in', 'on', 'at', 'a', 'an',
  'mr', 'ms', 'mrs', 'st', 'class', 'grade', 'with', 'from', 'to',
  'edu', 'educational', 'trust', 'institute', 'institution', 'institutions',
])

function tokens(s) {
  if (!s) return new Set()
  return new Set(
    String(s)
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length >= 2 && !STOPWORDS.has(t)),
  )
}

function locationTokens(...parts) {
  // Locations don't go through STOPWORDS; place names are short and
  // we want every meaningful token retained.
  const out = new Set()
  for (const p of parts) {
    if (!p) continue
    const cleaned = String(p)
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length >= 3)
    for (const t of cleaned) out.add(t)
  }
  return out
}

function jaccard(a, b) {
  if (a.size === 0 && b.size === 0) return 1
  if (a.size === 0 || b.size === 0) return 0
  let intersect = 0
  for (const t of a) if (b.has(t)) intersect++
  return intersect / (a.size + b.size - intersect)
}

function locationOverlap(rowTokens, schoolTokens) {
  let count = 0
  for (const t of rowTokens) if (schoolTokens.has(t)) count++
  return count
}

// ------------------------------------------------------------------
// Phone normalisation + email validation
// ------------------------------------------------------------------
function normalisePhone(raw) {
  if (raw == null) return { normalised: null, raw: null }
  const rawStr = String(raw).trim()
  if (rawStr === '') return { normalised: null, raw: null }
  const digits = rawStr.replace(/\D+/g, '')
  if (digits.length === 10) return { normalised: `+91${digits}`, raw: rawStr }
  if (digits.length === 12 && digits.startsWith('91')) {
    return { normalised: `+${digits}`, raw: rawStr }
  }
  if (digits.length === 11 && digits.startsWith('0')) {
    return { normalised: `+91${digits.slice(1)}`, raw: rawStr }
  }
  return { normalised: null, raw: rawStr }
}

const EMAIL_RE = /^[^\s,@]+@[^\s,@]+\.[^\s,@]+$/

function validateEmail(raw) {
  if (raw == null) return { valid: false, normalised: null, raw: null }
  const rawStr = String(raw).trim()
  if (rawStr === '') return { valid: false, normalised: null, raw: null }
  const collapsed = rawStr.replace(/\s+/g, '').replace(/ /g, '')
  if (EMAIL_RE.test(collapsed)) return { valid: true, normalised: collapsed, raw: rawStr }
  return { valid: false, normalised: null, raw: rawStr }
}

// ------------------------------------------------------------------
// SPOC DB xlsx reader (Python child process)
// ------------------------------------------------------------------
function readSpocDb() {
  const py = `
import openpyxl, json, sys
wb = openpyxl.load_workbook(r'${SPOC_DB_PATH.replace(/\\/g, '/')}', data_only=True)

out = []
sheet_rules = {}

for ws in wb.worksheets:
    sheet = ws.title
    # find header row by scanning column 1 for "Sr No"
    header_row = None
    for r in range(1, ws.max_row+1):
        v = ws.cell(r, 1).value
        if v and str(v).strip().lower() == 'sr no':
            header_row = r
            break
    # Capture top-of-sheet free-text CC rules (rows 1..header_row-1 in column 2 or 3).
    rules = []
    for r in range(1, header_row):
        for c in (2, 3):
            v = ws.cell(r, c).value
            if v and str(v).strip():
                rules.append({'rowNumber': r, 'col': c, 'text': str(v).strip()})
    sheet_rules[sheet] = rules

    # Data rows
    for r in range(header_row+1, ws.max_row+1):
        school = ws.cell(r, 2).value
        if not school or not str(school).strip(): continue
        out.append({
            'sheet': sheet,
            'rowNumber': r,
            'srNo': ws.cell(r, 1).value,
            'schoolName': str(school).strip(),
            'location': ws.cell(r, 3).value,
            'subLocation': ws.cell(r, 4).value,
            'trainerAssigned': ws.cell(r, 5).value,
            'pocName': ws.cell(r, 6).value,
            'designation': ws.cell(r, 7).value,
            'phone': ws.cell(r, 8).value,
            'email': ws.cell(r, 9).value,
            'remark': ws.cell(r, 10).value,
        })

sys.stdout.write(json.dumps({'rows': out, 'sheetRules': sheet_rules}, ensure_ascii=False))
`
  const stdout = execFileSync('python', ['-c', py], {
    encoding: 'utf-8',
    maxBuffer: 50 * 1024 * 1024,
  })
  return JSON.parse(stdout)
}

// ------------------------------------------------------------------
// Multi-POC expansion
// ------------------------------------------------------------------
function expandMultiPoc(row) {
  const name = row.pocName ? String(row.pocName).trim() : ''
  if (name === '') {
    return [{ ...row, subPosition: null, isMultiPoc: false, multiPocReason: null }]
  }
  // Multi-POC heuristic: pocName carries comma OR semicolon OR newline
  // delimiters AND yields >= 2 plausible name tokens.
  const splits = name.split(/[,;\n]/).map((s) => s.trim()).filter((s) => s.length >= 2)
  if (splits.length < 2) {
    return [{ ...row, subPosition: null, isMultiPoc: false, multiPocReason: null }]
  }
  const phoneSplits = row.phone
    ? String(row.phone).split(/[,;\n]/).map((s) => s.trim()).filter((s) => s.length >= 2)
    : []
  const emailSplits = row.email
    ? String(row.email).split(/[,;\n]/).map((s) => s.trim()).filter((s) => s.length >= 2)
    : []

  return splits.map((n, i) => ({
    ...row,
    subPosition: i + 1,
    isMultiPoc: true,
    multiPocReason: `pocName cell carries ${splits.length} delimited names`,
    pocName: n,
    phone: phoneSplits[i] ?? row.phone,
    email: emailSplits[i] ?? row.email,
  }))
}

// ------------------------------------------------------------------
// Per-row classifier
// ------------------------------------------------------------------
const SCORE_AUTO = 0.50
const SCORE_QUARANTINE = 0.20
const NAME_MARGIN = 0.10

function classifyRow(row, ctx) {
  const { schools, schoolsBySheetRegion, intakeBySchoolId, dispatchBySchoolId } = ctx

  const rowNameTok = tokens(row.schoolName)
  const rowLocTok = locationTokens(row.location, row.subLocation)
  const rowAllLoc = new Set([...rowLocTok])

  const candidates = []
  for (const s of schools) {
    const nameTok = tokens(s.name)
    const cityTok = locationTokens(s.city, s.state)
    const nameJ = jaccard(rowNameTok, nameTok)
    const locOverlapCount = locationOverlap(rowAllLoc, cityTok)
    // Sub-location may appear inside the school name (e.g., "Gurugram"
    // inside "RBSM-Main, Gurugram"). Boost when row location tokens
    // appear inside the candidate school name.
    let nameLocBonus = 0
    for (const t of rowLocTok) if (nameTok.has(t)) nameLocBonus++
    const locationConfirmed = locOverlapCount > 0 || nameLocBonus > 0
    // Combined score: 0.7 * nameJ + 0.3 * locationConfirmed flag
    const score = 0.7 * nameJ + (locationConfirmed ? 0.3 : 0)
    candidates.push({
      id: s.id,
      name: s.name,
      city: s.city,
      state: s.state,
      region: s.region,
      nameJ,
      locOverlapCount,
      nameLocBonus,
      locationConfirmed,
      score,
    })
  }

  candidates.sort((a, b) => b.score - a.score)
  const top1 = candidates[0] ?? null
  const top2 = candidates[1] ?? null

  if (!top1 || top1.score < SCORE_QUARANTINE) {
    return {
      recommendation: 'QUARANTINE',
      confidenceLabel: 'no-plausible-match',
      best: null,
      runnerUp: top2,
      crossRefs: { hasIntake: false, hasDispatch: false, intakeMouIds: [], dispatchIds: [] },
      reason: top1
        ? `top score ${top1.score.toFixed(3)} below quarantine threshold ${SCORE_QUARANTINE} (no name+location signal)`
        : 'no schools loaded',
    }
  }

  const intakeMouIds = (intakeBySchoolId.get(top1.id) ?? []).map((ir) => ir.mouId)
  const dispatchIds = (dispatchBySchoolId.get(top1.id) ?? []).map((d) => d.id)
  const hasIntake = intakeMouIds.length > 0
  const hasDispatch = dispatchIds.length > 0

  // AUTO-IMPORT requires:
  //   - score >= SCORE_AUTO
  //   - location confirmed (gates against name-only false positives)
  //   - clear margin over runner-up (>= NAME_MARGIN), OR cross-reference
  //     evidence (IntakeRecord / Dispatch) layered onto the top match
  const margin = top2 ? top1.score - top2.score : top1.score
  const crossConfirmed = hasIntake || hasDispatch
  const passesScore = top1.score >= SCORE_AUTO
  const passesLocation = top1.locationConfirmed
  const passesMargin = margin >= NAME_MARGIN || crossConfirmed

  let recommendation = 'MANUAL-REVIEW'
  let confidenceLabel = 'medium'
  let reason = ''

  if (passesScore && passesLocation && passesMargin && !row.isMultiPoc) {
    recommendation = 'AUTO-IMPORT'
    confidenceLabel = crossConfirmed ? 'high-cross-confirmed' : 'high'
    const bits = [
      `score=${top1.score.toFixed(3)}`,
      `nameJ=${top1.nameJ.toFixed(3)}`,
      `locOverlap=${top1.locOverlapCount}+${top1.nameLocBonus}`,
      `margin=${margin.toFixed(3)}`,
    ]
    if (hasIntake) bits.push(`intake=${intakeMouIds.length}`)
    if (hasDispatch) bits.push(`dispatch=${dispatchIds.length}`)
    reason = bits.join(' ')
  } else if (row.isMultiPoc && passesScore && passesLocation && passesMargin) {
    // School match is high-confidence but the per-POC splits need
    // human eyeballs (the parser may have missed delimiters; e.g.,
    // Jaffaria North row with two names smashed without a comma).
    confidenceLabel = 'multi-poc-school-confirmed'
    const bits = [
      `multi-poc school match high (${top1.score.toFixed(3)}, ${top1.name})`,
      `${row.multiPocReason}; verify per-POC splits in the source row`,
    ]
    if (hasIntake) bits.push(`intake=${intakeMouIds.length}`)
    if (hasDispatch) bits.push(`dispatch=${dispatchIds.length}`)
    reason = bits.join('; ')
  } else {
    const why = []
    if (!passesScore) why.push(`score ${top1.score.toFixed(3)} < ${SCORE_AUTO}`)
    if (!passesLocation) why.push('no location confirmation (city / sub-location did not match school city)')
    if (!passesMargin) why.push(`margin ${margin.toFixed(3)} < ${NAME_MARGIN} and no cross-ref`)
    if (top1.score < SCORE_AUTO && top2 && top2.score >= SCORE_QUARANTINE) {
      why.push(`runner-up close: ${top2.name} (${top2.score.toFixed(3)})`)
    }
    confidenceLabel = top1.score >= SCORE_AUTO ? 'medium' : 'low'
    reason = why.join('; ')
  }

  return {
    recommendation,
    confidenceLabel,
    best: top1,
    runnerUp: top2,
    crossRefs: { hasIntake, hasDispatch, intakeMouIds, dispatchIds },
    reason,
  }
}

// ------------------------------------------------------------------
// Cross-sheet duplicate detection
// ------------------------------------------------------------------
function detectCrossSheetDuplicates(rows) {
  const bySchool = new Map()
  for (const r of rows) {
    const key = String(r.schoolName ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
    if (!key) continue
    if (!bySchool.has(key)) bySchool.set(key, [])
    bySchool.get(key).push(r)
  }
  const dups = []
  for (const [key, rs] of bySchool.entries()) {
    const sheets = new Set(rs.map((r) => r.sheet))
    if (sheets.size > 1) dups.push({ key, sheets: [...sheets], rows: rs })
  }
  return dups
}

// ------------------------------------------------------------------
// Main
// ------------------------------------------------------------------
function csvCell(v) {
  if (v == null) return ''
  const s = String(v)
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

function main() {
  const schools = JSON.parse(readFileSync(SCHOOLS_PATH, 'utf-8'))
  const mous = JSON.parse(readFileSync(MOUS_PATH, 'utf-8'))
  const intakes = JSON.parse(readFileSync(INTAKE_PATH, 'utf-8'))
  const dispatches = JSON.parse(readFileSync(DISPATCHES_PATH, 'utf-8'))

  const mouById = new Map(mous.map((m) => [m.id, m]))
  const intakeBySchoolId = new Map()
  for (const ir of intakes) {
    const m = mouById.get(ir.mouId)
    if (!m) continue
    if (!intakeBySchoolId.has(m.schoolId)) intakeBySchoolId.set(m.schoolId, [])
    intakeBySchoolId.get(m.schoolId).push(ir)
  }
  const dispatchBySchoolId = new Map()
  for (const d of dispatches) {
    if (!d.schoolId) continue
    if (!dispatchBySchoolId.has(d.schoolId)) dispatchBySchoolId.set(d.schoolId, [])
    dispatchBySchoolId.get(d.schoolId).push(d)
  }

  const { rows: rawRows, sheetRules } = readSpocDb()
  console.log(`Loaded ${rawRows.length} source rows; ${schools.length} schools; ${intakes.length} intakes; ${dispatches.length} dispatches`)

  // Multi-POC expansion
  const expanded = []
  for (const r of rawRows) {
    for (const e of expandMultiPoc(r)) expanded.push(e)
  }

  // Cross-sheet duplicate detection (against the raw rows, not the
  // multi-POC-expanded set).
  const crossDuplicates = detectCrossSheetDuplicates(rawRows)

  // Phone + email normalisation; classification
  const ctx = { schools, intakeBySchoolId, dispatchBySchoolId }
  const verified = expanded.map((row) => {
    const phone = normalisePhone(row.phone)
    const email = validateEmail(row.email)
    const cls = classifyRow(row, ctx)
    return {
      sheet: row.sheet,
      rowNumber: row.rowNumber,
      subPosition: row.subPosition,
      sourceRowLabel: row.subPosition ? `${row.rowNumber}.${row.subPosition}` : String(row.rowNumber),
      isMultiPoc: row.isMultiPoc,
      multiPocReason: row.multiPocReason,
      role: row.subPosition === 1 || !row.isMultiPoc ? 'primary' : 'secondary',
      srNo: row.srNo,
      sourceSchoolName: row.schoolName,
      sourceLocation: row.location,
      sourceSubLocation: row.subLocation,
      trainerAssigned: row.trainerAssigned,
      pocName: row.pocName,
      designation: row.designation,
      phoneRaw: phone.raw,
      phoneNormalised: phone.normalised,
      emailRaw: email.raw,
      emailNormalised: email.normalised,
      emailValid: email.valid,
      remark: row.remark,
      ...cls,
    }
  })

  // Counts
  const summary = {
    totalSourceRows: rawRows.length,
    totalVerificationEntries: verified.length,
    multiPocExpansionDelta: verified.length - rawRows.length,
    autoImport: verified.filter((v) => v.recommendation === 'AUTO-IMPORT').length,
    manualReview: verified.filter((v) => v.recommendation === 'MANUAL-REVIEW').length,
    quarantine: verified.filter((v) => v.recommendation === 'QUARANTINE').length,
    crossRefIntake: verified.filter((v) => v.crossRefs.hasIntake).length,
    crossRefDispatch: verified.filter((v) => v.crossRefs.hasDispatch).length,
    crossRefBoth: verified.filter((v) => v.crossRefs.hasIntake && v.crossRefs.hasDispatch).length,
    invalidEmails: verified.filter((v) => v.emailRaw && !v.emailValid).length,
    unparseablePhones: verified.filter((v) => v.phoneRaw && !v.phoneNormalised).length,
    multiPocSourceRows: rawRows.filter((r) => expandMultiPoc(r).length > 1).length,
    crossSheetDuplicates: crossDuplicates.length,
  }

  const report = {
    generatedAt: new Date().toISOString(),
    inputPath: 'ops-data/SCHOOL_SPOC_DATABASE.xlsx',
    summary,
    sheetRules,
    crossSheetDuplicates: crossDuplicates.map((d) => ({
      key: d.key,
      sheets: d.sheets,
      rowReferences: d.rows.map((r) => ({ sheet: r.sheet, rowNumber: r.rowNumber, schoolName: r.schoolName })),
    })),
    rows: verified,
  }

  writeFileSync(REPORT_JSON, JSON.stringify(report, null, 2) + '\n', 'utf-8')

  const headers = [
    'sheet', 'sourceRowLabel', 'srNo', 'sourceSchoolName',
    'sourceLocation', 'sourceSubLocation', 'pocName', 'designation',
    'phoneNormalised', 'emailNormalised', 'isMultiPoc', 'role',
    'recommendation', 'confidenceLabel',
    'matchSchoolId', 'matchSchoolName', 'matchScore',
    'matchNameJ', 'matchLocOverlap',
    'runnerUpId', 'runnerUpScore',
    'hasIntake', 'hasDispatch', 'intakeMouIds', 'dispatchIds',
    'reason',
  ]
  const lines = [headers.join(',')]
  for (const v of verified) {
    lines.push([
      csvCell(v.sheet),
      csvCell(v.sourceRowLabel),
      csvCell(v.srNo),
      csvCell(v.sourceSchoolName),
      csvCell(v.sourceLocation),
      csvCell(v.sourceSubLocation),
      csvCell(v.pocName),
      csvCell(v.designation),
      csvCell(v.phoneNormalised),
      csvCell(v.emailNormalised),
      csvCell(v.isMultiPoc),
      csvCell(v.role),
      csvCell(v.recommendation),
      csvCell(v.confidenceLabel),
      csvCell(v.best?.id ?? ''),
      csvCell(v.best?.name ?? ''),
      csvCell(v.best ? v.best.score.toFixed(3) : ''),
      csvCell(v.best ? v.best.nameJ.toFixed(3) : ''),
      csvCell(v.best ? `${v.best.locOverlapCount}+${v.best.nameLocBonus}` : ''),
      csvCell(v.runnerUp?.id ?? ''),
      csvCell(v.runnerUp ? v.runnerUp.score.toFixed(3) : ''),
      csvCell(v.crossRefs.hasIntake),
      csvCell(v.crossRefs.hasDispatch),
      csvCell(v.crossRefs.intakeMouIds.join('|')),
      csvCell(v.crossRefs.dispatchIds.join('|')),
      csvCell(v.reason),
    ].join(','))
  }
  writeFileSync(REPORT_CSV, lines.join('\n') + '\n', 'utf-8')

  console.log('')
  console.log('Verification table summary:')
  console.log(`  Source rows: ${summary.totalSourceRows}`)
  console.log(`  Verification entries (after multi-POC expansion): ${summary.totalVerificationEntries}`)
  console.log(`    AUTO-IMPORT  ${summary.autoImport}`)
  console.log(`    MANUAL-REVIEW ${summary.manualReview}`)
  console.log(`    QUARANTINE   ${summary.quarantine}`)
  console.log(`  Multi-POC source rows: ${summary.multiPocSourceRows} (delta +${summary.multiPocExpansionDelta} entries)`)
  console.log(`  Cross-ref signals: intake=${summary.crossRefIntake} dispatch=${summary.crossRefDispatch} both=${summary.crossRefBoth}`)
  console.log(`  Invalid emails: ${summary.invalidEmails}`)
  console.log(`  Unparseable phones: ${summary.unparseablePhones}`)
  console.log(`  Cross-sheet duplicate schools: ${summary.crossSheetDuplicates}`)
  console.log('')
  console.log(`Wrote ${REPORT_JSON}`)
  console.log(`Wrote ${REPORT_CSV}`)
}

main()
