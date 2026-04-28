#!/usr/bin/env node

/*
 * W4-E.2 Phase 2: SPOC DB import MUTATION.
 *
 * Reads scripts/w4e-spoc-import-verification-2026-04-28.json (the
 * Phase 1 read-only verification table Anish row-by-row signed off
 * on 2026-04-28) and writes SchoolSPOC records into
 * src/data/school_spocs.json plus the _fixtures mirror. Mirrors a
 * 'school-spoc-imported-from-db' audit entry on the new SchoolSPOC
 * and on the parent School.
 *
 * Inputs to the row-disposition logic:
 *   - The verification table's recommendation per row (AUTO-IMPORT,
 *     MANUAL-REVIEW, QUARANTINE).
 *   - ANISH_RESOLUTIONS: hardcoded per-row overrides keyed by
 *     `${sheet}#${sourceRowLabel}`. The W4-E.2 review email enumerated:
 *
 *       Q1 contingency-1 (Shivam SW7+SW8): both schools.json records
 *         exist (SCH-SHIVAM_EDUACTIONAL_A Indraprastha,
 *         SCH-SHIVAM_EDUACTIONAL_A_2 Bhatagaon). Both AUTO-IMPORT
 *         valid; no demotion needed.
 *       Q1 contingency-2 (East11 St. John's School): two distinct
 *         schools.json records exist
 *         (SCH-ST_JOHN_S_SCHOOL archived 2526,
 *          SCH-ST_JOHNS_HIGH_SCHOOL active 2627 with W4-C IntakeRecord
 *          + W4-D Cretile Dispatch).
 *         The SPOC DB row name "St. John's School" matches the
 *         archived record verbatim, but the active record carries
 *         the operational MOU + intake + dispatch. Demoting East11
 *         to QUARANTINE per Anish's contingency rule (potential
 *         schools.json deduplication issue OR the SPOC may belong
 *         to the active record). D-019 captures the round 2 decision.
 *
 *       Q2(a) city-spelling cluster (7 rows): SW17, SW18, SW29,
 *         East12, East17, East18, North13. Source-data city typos
 *         (Secunderbad / Dugrapur / Bangalore) prevented the
 *         location-token confirmation; names were operationally
 *         clean (>=0.7 jaccard). Bulk-approve to matcher's top pick.
 *         (Anish suggested "10 rows"; I could identify 7 with clean
 *         name matches; the remaining 3 candidates were SW9 Xavier
 *         (empty schools.json city; ambiguous) plus the 2 Carmels
 *         that already lift to one record. Surfaced in commit body.)
 *
 *       Q2(b) Chennai cluster (4 rows): SW22, SW24, SW25, SW26.
 *         Anish-confirmed: 4 distinct schools, none in schools.json.
 *         QUARANTINE -> D-019.
 *
 *       Q2(c) East9 R.N. Singh Memorial Academy: distinct from
 *         East22 Sri Ram Narayan Singh High School per Anish.
 *         QUARANTINE -> D-019.
 *
 *       Q2(d) re-run-match (4 rows): East15 St. Monforts ->
 *         SCH-ST_MONTFORT_S_SR_SEC; East16 St. Pauls Mission ->
 *         SCH-ST_PAUL_S_MISSION_SC; North11 BIT Global Meerut ->
 *         SCH-B_I_T_GLOBAL_SCHOOL; North15 Tathastu Innovation ->
 *         SCH-TATHASTU_INNOVATIONS. The original matcher missed
 *         these because of stem-only-difference (Monforts vs
 *         Montfort's; Pauls vs Paul's; Innovation vs Innovations)
 *         OR space-tokenisation (BIT vs B I T -> length-1 tokens
 *         filtered). All 4 verified by direct schoolId lookup;
 *         AUTO-IMPORT to the named records.
 *
 *       Q2(d) genuinely-ambiguous (5 rows): East13 Morden HIgh
 *         (sic), East19 Haryana International, North7 Kautilya,
 *         North8 BGS Vijnatham, North9 Shreeji Faridabad.
 *         Anish-confirmed: not in schools.json. QUARANTINE -> D-019.
 *
 *       Q4 Jaffaria multi-POC (North 18.1/.2/.3): Feroz Ahmad
 *         primary; subsequent secondary. D-020 captures the parser
 *         issue (Hassan + Fiza smashed in one cell; source data has
 *         4 POCs but verification table emitted 3).
 *
 *   - SW9 St.Xavier Bhilai: not in Anish's explicit decision; my
 *     conservative call is QUARANTINE -> D-019 because the schools.json
 *     record has empty city + partial name match. Anish flags in
 *     round 2 if he wants it imported.
 *
 * Output:
 *   - 44 SchoolSPOC records written to school_spocs.json
 *   - 16 rows quarantined -> D-019 register in W4-DEFERRED-ITEMS.md
 *     (post-script edit; this script does NOT auto-edit the deferred
 *      items doc, the commit appends the 16-row D-019 entry by hand)
 *   - parent School.auditLog gains a 'school-spoc-imported-from-db'
 *     entry per imported SPOC
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const REPO_ROOT = resolve(import.meta.dirname, '..')
const VERIFICATION_PATH = resolve(REPO_ROOT, 'scripts/w4e-spoc-import-verification-2026-04-28.json')
const SCHOOLS_PATH = resolve(REPO_ROOT, 'src/data/schools.json')
const FIXTURES_SCHOOLS_PATH = resolve(REPO_ROOT, 'src/data/_fixtures/schools.json')
const SPOCS_PATH = resolve(REPO_ROOT, 'src/data/school_spocs.json')
const FIXTURES_SPOCS_PATH = resolve(REPO_ROOT, 'src/data/_fixtures/school_spocs.json')
const REPORT_PATH = resolve(REPO_ROOT, 'scripts/w4e-spoc-import-mutation-report-2026-04-28.json')
const TS = '2026-04-28T16:00:00.000Z'

// ------------------------------------------------------------------
// Anish's row-by-row resolutions (locked sign-off 2026-04-28).
// Keyed by `${sheet}#${sourceRowLabel}`. Decisions:
//   - 'IMPORT' with explicit targetSchoolId  -> mutate to that school
//   - 'IMPORT'                                 -> use verification's best.id
//   - 'QUARANTINE' with reason                 -> register in D-019
// ------------------------------------------------------------------
const ANISH_RESOLUTIONS = {
  // Q1 contingency-2: East11 St. John's School demoted (operational
  // record likely SCH-ST_JOHNS_HIGH_SCHOOL active 2627, but matcher
  // picked archived SCH-ST_JOHN_S_SCHOOL; D-019 round 2 decides).
  'East#11': {
    decision: 'QUARANTINE',
    reason: 'Q1 contingency-2 demote: SPOC DB row "St. John\'s School" matches both archived SCH-ST_JOHN_S_SCHOOL (2526) and active SCH-ST_JOHNS_HIGH_SCHOOL (2627 with intake + dispatch); ambiguous; D-019 round 2 picks the operational target.',
  },

  // Q2(a) city-spelling bulk-approve (7 rows): import to verification
  // matcher's top pick despite locationConfirmation gating.
  'South-West#17': { decision: 'IMPORT', reason: 'Q2(a) city-spelling: Secunderbad source-typo vs Hyderabad city in schools.json; name matches "Secunderabad Public School/St.Ann\'s Grammar School".' },
  'South-West#18': { decision: 'IMPORT', reason: 'Q2(a) city-spelling: Secunderbad source-typo; name matches "Clever Minds School" (jaccard 0.700).' },
  'South-West#29': { decision: 'IMPORT', reason: 'Q2(a) city-spelling: Bangalore vs Bengaluru; name matches "Frank Public School" (jaccard 0.700).' },
  'East#12': { decision: 'IMPORT', reason: 'Q2(a) city-spelling: Kolkata sub-location "EM Bypass" not in school city "Medinpur" but name matches "Young Horizons School" (jaccard 0.700).' },
  'East#17': {
    decision: 'IMPORT',
    targetSchoolId: 'SCH-CARMEL_CONVENT_HIGH_',
    reason: 'Q2(a) city-spelling: Dugrapur source-typo vs Durgapur; "Carmel Steel Durgapur" -> SCH-CARMEL_CONVENT_HIGH_ (matcher\'s pick; could also be SCH-CARMEL_SCHOOL_DURGAP, round 2 confirms).',
  },
  'East#18': {
    decision: 'IMPORT',
    targetSchoolId: 'SCH-CARMEL_CONVENT_HIGH_',
    reason: 'Q2(a) city-spelling: Dugrapur source-typo vs Durgapur; "Carmel MAMC Durgapur" -> SCH-CARMEL_CONVENT_HIGH_ (matcher\'s pick; second SPOC on same school, round 2 may reassign to SCH-CARMEL_SCHOOL_DURGAP).',
  },
  'North#13': { decision: 'IMPORT', reason: 'Q2(a) city-spelling: Mahendargarh source vs Mhendragadh schools.json; name matches "GR International School" (jaccard 0.700).' },

  // Q2(b) Chennai cluster: 4 distinct schools not in schools.json.
  'South-West#22': { decision: 'QUARANTINE', reason: 'Q2(b) Chennai cluster: Sagayamadha matriculation school not in schools.json. D-019.' },
  'South-West#24': { decision: 'QUARANTINE', reason: 'Q2(b) Chennai cluster: PGS CBSE school not in schools.json. D-019.' },
  'South-West#25': { decision: 'QUARANTINE', reason: 'Q2(b) Chennai cluster: Donbosco matriculation school not in schools.json. D-019.' },
  'South-West#26': { decision: 'QUARANTINE', reason: 'Q2(b) Chennai cluster: Nabicrescent school not in schools.json. D-019.' },

  // Q2(c) East9
  'East#9': { decision: 'QUARANTINE', reason: 'Q2(c) Anish-confirmed distinct from East22 Sri Ram Narayan Singh High School; R.N. Singh Memorial Academy not in schools.json. D-019.' },

  // Q2(d) re-run-match: 4 rows resolved to specific schoolIds.
  'East#15': {
    decision: 'IMPORT',
    targetSchoolId: 'SCH-ST_MONTFORT_S_SR_SEC',
    reason: 'Q2(d) re-run: stemmed name match (Monforts vs Montfort\'s); SCH-ST_MONTFORT_S_SR_SEC exists (mou-2627-031 active + 2526-018 archived).',
  },
  'East#16': {
    decision: 'IMPORT',
    targetSchoolId: 'SCH-ST_PAUL_S_MISSION_SC',
    reason: 'Q2(d) re-run: stemmed name match (Pauls vs Paul\'s); SCH-ST_PAUL_S_MISSION_SC exists (mou-2627-038 active).',
  },
  'North#11': {
    decision: 'IMPORT',
    targetSchoolId: 'SCH-B_I_T_GLOBAL_SCHOOL',
    reason: 'Q2(d) re-run: tokenisation difference (BIT vs B I T -> length-1 tokens filtered); SCH-B_I_T_GLOBAL_SCHOOL exists (mou-2627-026 active).',
  },
  'North#15': {
    decision: 'IMPORT',
    targetSchoolId: 'SCH-TATHASTU_INNOVATIONS',
    reason: 'Q2(d) re-run: stemmed name match (Innovation vs Innovations); SCH-TATHASTU_INNOVATIONS exists (mou-2627-016 active).',
  },

  // Q2(d) genuinely-ambiguous (5 rows): not in schools.json per Anish.
  'East#13': { decision: 'QUARANTINE', reason: 'Q2(d) ambiguous: "Morden HIgh School International" (sic) not in schools.json. D-019.' },
  'East#19': { decision: 'QUARANTINE', reason: 'Q2(d) ambiguous: "Haryana international school" not in schools.json. D-019.' },
  'North#7': { decision: 'QUARANTINE', reason: 'Q2(d) ambiguous: "Kautilya World Academy, Gurugram" not in schools.json. D-019.' },
  'North#8': { decision: 'QUARANTINE', reason: 'Q2(d) ambiguous: "BGS Vijnatham" Noida not in schools.json. D-019.' },
  'North#9': { decision: 'QUARANTINE', reason: 'Q2(d) ambiguous: "The Shreeji School, Fariabaad" not in schools.json. D-019.' },

  // SW9 conservative call (not in Anish\'s explicit decisions).
  'South-West#9': { decision: 'QUARANTINE', reason: 'Conservative: "St.Xavier School Bhilai" -> SCH-ST_XAVIER_S_SR_SEC_S has empty schools.json city + partial name match (Sr. Sec. suffix mismatch). Round 2 confirms whether this is the same school. D-019.' },

  // North 18.1/.2/.3 multi-POC: import all 3; Feroz Ahmad primary.
  'North#18.1': { decision: 'IMPORT', reason: 'Q4 Jaffaria multi-POC: Feroz Ahmad primary per Anish.' },
  'North#18.2': { decision: 'IMPORT', reason: 'Q4 Jaffaria multi-POC: 2nd entry "Mr.Hassan (junr wing) Fiza Banoo" smashed in source cell; D-020 captures the round 2 split fix.' },
  'North#18.3': { decision: 'IMPORT', reason: 'Q4 Jaffaria multi-POC: Mohd Amin (higher wing).' },
}

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------
function sheetCode(sheet) {
  if (sheet === 'South-West') return 'SW'
  if (sheet === 'East') return 'E'
  if (sheet === 'North') return 'N'
  throw new Error(`Unknown sheet: ${sheet}`)
}

function spocIdFor(row) {
  const code = sheetCode(row.sheet)
  if (row.subPosition) return `SSP-W4E-${code}-r${row.rowNumber}-${row.subPosition}`
  return `SSP-W4E-${code}-r${row.rowNumber}`
}

function buildSchoolSpoc(row, schoolId, confidence) {
  const audit = {
    timestamp: TS,
    user: 'system-w4e-import',
    action: 'school-spoc-imported-from-db',
    after: {
      schoolId,
      sheet: row.sheet,
      rowNumber: row.rowNumber,
      subPosition: row.subPosition ?? null,
      confidence,
      source: 'W4-E.2 verification table Anish-signed 2026-04-28',
    },
    notes: `Imported from SCHOOL_SPOC_DATABASE.xlsx ${row.sheet} sheet row ${row.subPosition ? `${row.rowNumber}.${row.subPosition}` : row.rowNumber}. Confidence: ${confidence}.`,
  }

  return {
    id: spocIdFor(row),
    schoolId,
    name: String(row.pocName ?? '').trim(),
    designation: row.designation ? String(row.designation).trim() : null,
    email: row.emailNormalised ?? (row.emailRaw ? String(row.emailRaw).trim() : null),
    phone: row.phoneNormalised ?? (row.phoneRaw ? String(row.phoneRaw).trim() : null),
    role: row.role,
    active: true,
    sourceSheet: row.sheet,
    sourceRow: row.rowNumber,
    createdAt: TS,
    createdBy: 'system-w4e-import',
    auditLog: [audit],
  }
}

function mirroredSchoolAudit(row, spocId, confidence) {
  return {
    timestamp: TS,
    user: 'system-w4e-import',
    action: 'school-spoc-imported-from-db',
    after: {
      spocId,
      sheet: row.sheet,
      rowNumber: row.rowNumber,
      subPosition: row.subPosition ?? null,
      pocName: String(row.pocName ?? '').trim(),
      role: row.role,
      confidence,
    },
    notes: `SPOC DB import landed ${row.role} SPOC (${row.sheet} sheet row ${row.subPosition ? `${row.rowNumber}.${row.subPosition}` : row.rowNumber}).`,
  }
}

// ------------------------------------------------------------------
// Main
// ------------------------------------------------------------------
function main() {
  const verification = JSON.parse(readFileSync(VERIFICATION_PATH, 'utf-8'))
  const schools = JSON.parse(readFileSync(SCHOOLS_PATH, 'utf-8'))
  const spocs = JSON.parse(readFileSync(SPOCS_PATH, 'utf-8'))
  const schoolById = new Map(schools.map((s) => [s.id, s]))

  const result = {
    generatedAt: TS,
    purpose: 'W4-E.2 Phase 2 mutation report. Anish-signed Phase 1 verification table drives every decision; ANISH_RESOLUTIONS hardcodes the 25 MANUAL-REVIEW + 1 contingency-demote row-level decisions.',
    contingencyOutcomes: {
      shivamSchools: 'PASS: SCH-SHIVAM_EDUACTIONAL_A (Indraprastha) and SCH-SHIVAM_EDUACTIONAL_A_2 (Bhatagaon) are 2 distinct records; SW7 + SW8 both AUTO-IMPORT.',
      stJohnsSchools: 'DEMOTE: SCH-ST_JOHN_S_SCHOOL (archived 2526) and SCH-ST_JOHNS_HIGH_SCHOOL (active 2627 with intake + dispatch) are 2 distinct records, but the SPOC DB row name "St. John\'s School" is ambiguous between them. East11 demoted to QUARANTINE; D-019 round 2 picks the target.',
    },
    rerunMatchOutcomes: [],
    created: [],
    quarantined: [],
  }

  const existingSpocIds = new Set(spocs.map((sp) => sp.id))
  const schoolAuditQueue = new Map() // schoolId -> array of audit entries to push

  for (const row of verification.rows) {
    const key = `${row.sheet}#${row.sourceRowLabel}`
    const resolution = ANISH_RESOLUTIONS[key] ?? null

    let disposition = null
    let targetSchoolId = null
    let confidence = row.confidenceLabel ?? 'medium'
    let reason = ''

    if (resolution) {
      disposition = resolution.decision
      targetSchoolId = resolution.targetSchoolId ?? row.best?.id ?? null
      reason = resolution.reason
    } else if (row.recommendation === 'AUTO-IMPORT') {
      disposition = 'IMPORT'
      targetSchoolId = row.best.id
      reason = `verification AUTO-IMPORT (${row.confidenceLabel})`
    } else if (row.recommendation === 'QUARANTINE') {
      disposition = 'QUARANTINE'
      reason = row.reason ?? 'verification QUARANTINE'
    } else {
      disposition = 'QUARANTINE'
      reason = `MANUAL-REVIEW with no Anish-resolution; defensive quarantine. ${row.reason ?? ''}`
      console.warn(`[w4e.2.mut] WARN ${key} MANUAL-REVIEW with no resolution; quarantining defensively`)
    }

    if (disposition === 'QUARANTINE') {
      result.quarantined.push({
        sheet: row.sheet,
        sourceRowLabel: row.sourceRowLabel,
        sourceSchoolName: row.sourceSchoolName,
        sourceLocation: row.sourceLocation,
        sourceSubLocation: row.sourceSubLocation,
        pocName: row.pocName,
        reason,
      })
      continue
    }

    // disposition === 'IMPORT'
    const school = schoolById.get(targetSchoolId)
    if (!school) {
      throw new Error(`Resolution targets schoolId ${targetSchoolId} not in schools.json (${key})`)
    }

    const spocId = spocIdFor(row)
    if (existingSpocIds.has(spocId)) {
      throw new Error(`SchoolSPOC id ${spocId} already exists; bailing to avoid duplicate.`)
    }
    existingSpocIds.add(spocId)

    if (resolution?.targetSchoolId && resolution.targetSchoolId !== row.best?.id) {
      // Re-run-match override: record the outcome.
      result.rerunMatchOutcomes.push({
        sheet: row.sheet,
        sourceRowLabel: row.sourceRowLabel,
        sourceSchoolName: row.sourceSchoolName,
        originalMatchId: row.best?.id ?? null,
        originalMatchScore: row.best?.score ?? null,
        rerunTargetId: resolution.targetSchoolId,
        rerunSchoolName: school.name,
        outcome: 'CONFIRMED-VIA-ANISH-RESOLUTION',
      })
      confidence = 'high-rerun-match'
    } else if (resolution) {
      confidence = `anish-resolved (${row.confidenceLabel ?? 'medium'})`
    }

    const spoc = buildSchoolSpoc(row, targetSchoolId, confidence)
    spocs.push(spoc)

    if (!schoolAuditQueue.has(targetSchoolId)) schoolAuditQueue.set(targetSchoolId, [])
    schoolAuditQueue.get(targetSchoolId).push(mirroredSchoolAudit(row, spocId, confidence))

    result.created.push({
      spocId,
      schoolId: targetSchoolId,
      schoolName: school.name,
      sheet: row.sheet,
      sourceRowLabel: row.sourceRowLabel,
      pocName: spoc.name,
      role: spoc.role,
      confidence,
      hasIntake: row.crossRefs.hasIntake,
      hasDispatch: row.crossRefs.hasDispatch,
    })
  }

  // Push audit entries onto the parent schools.
  for (const [schoolId, entries] of schoolAuditQueue.entries()) {
    const s = schoolById.get(schoolId)
    s.auditLog = s.auditLog ?? []
    for (const e of entries) s.auditLog.push(e)
  }

  // Cross-reference statistics
  result.crossRefStats = {
    intakeOnly: result.created.filter((c) => c.hasIntake && !c.hasDispatch).length,
    dispatchOnly: result.created.filter((c) => !c.hasIntake && c.hasDispatch).length,
    both: result.created.filter((c) => c.hasIntake && c.hasDispatch).length,
    none: result.created.filter((c) => !c.hasIntake && !c.hasDispatch).length,
  }

  writeFileSync(SPOCS_PATH, JSON.stringify(spocs, null, 2) + '\n', 'utf-8')
  writeFileSync(FIXTURES_SPOCS_PATH, JSON.stringify(spocs, null, 2) + '\n', 'utf-8')
  writeFileSync(SCHOOLS_PATH, JSON.stringify(schools, null, 2) + '\n', 'utf-8')
  writeFileSync(FIXTURES_SCHOOLS_PATH, JSON.stringify(schools, null, 2) + '\n', 'utf-8')
  writeFileSync(REPORT_PATH, JSON.stringify(result, null, 2) + '\n', 'utf-8')

  console.log('')
  console.log(`[w4e.2.mut] created:     ${result.created.length} SchoolSPOC records`)
  console.log(`[w4e.2.mut] quarantined: ${result.quarantined.length} rows -> D-019`)
  console.log(`[w4e.2.mut] re-run-match outcomes: ${result.rerunMatchOutcomes.length} rows`)
  console.log(`[w4e.2.mut] cross-ref:   intake=${result.crossRefStats.intakeOnly} dispatch=${result.crossRefStats.dispatchOnly} both=${result.crossRefStats.both} none=${result.crossRefStats.none}`)
  console.log(`[w4e.2.mut] contingency-1 Shivam:    ${result.contingencyOutcomes.shivamSchools}`)
  console.log(`[w4e.2.mut] contingency-2 St.John\'s: ${result.contingencyOutcomes.stJohnsSchools}`)
  console.log(`[w4e.2.mut] report: ${REPORT_PATH}`)
}

main()
