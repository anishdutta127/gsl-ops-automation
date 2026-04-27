#!/usr/bin/env node

/*
 * W4-C.7 INDEPENDENT VERIFICATION (post-correction).
 *
 * Cross-checks the 23 W4-C-prefixed IntakeRecords against a HARDCODED
 * snapshot of the active 51-list canonical names. Read-only: emits a
 * JSON report with a 23-row verification table; no data mutations.
 *
 * Independence axes:
 *  1. The W4-C.4 backfill (the script that produced the 11 mismaps) used
 *     positional row indexing inside an unverified ROW_MAPPING constant
 *     (the bug). This script uses canonical-name token comparison instead.
 *  2. The W4-C.7 audit (which authored the 11 corrections) read canonical
 *     names from mous.json. This script reads canonical names from a
 *     hardcoded constant to guard against the (unlikely) case that
 *     mous.json itself drifted from Anish's records.
 *  3. Matching metric is Jaccard token-overlap, NOT the symmetric token
 *     equality used in the W4-C.7 audit. A different metric guards
 *     against any hidden coupling between author and verifier.
 *
 * Provenance of CANONICAL_51_LIST: snapshotted from src/data/mous.json
 * (cohortStatus = 'active') on 2026-04-28. Anish reviews this list as
 * part of the verification gate; if any line disagrees with Anish's
 * own records, that disagreement is a data-drift signal we want
 * surfaced before W4-D backfill begins.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { execFileSync } from 'node:child_process'

const REPO_ROOT = resolve(import.meta.dirname, '..')
const FORM_PATH = resolve(REPO_ROOT, 'ops-data/MOU_Signing_Details_2026-2027__Responses_.xlsx')
const INTAKE_PATH = resolve(REPO_ROOT, 'src/data/intake_records.json')
const REPORT_PATH = resolve(REPO_ROOT, 'scripts/w4c7-independent-verification-2026-04-27.json')

// --- HARDCODED CANONICAL 51-LIST (Anish review gate) ----------------------
//
// Each line is one active MOU. Sourced one-time from mous.json on
// 2026-04-28; from this script's perspective, this constant IS the
// source of truth.
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

// Anish-confirmed aliases (form school != canonical, but verified by Anish
// during W4-C recon). Surface as 'matches with minor variation' regardless
// of Jaccard score. Each entry records the W4-C disambiguation context.
const ANISH_CONFIRMED_ALIASES = new Map([
  // form-school normalised -> { mouId, note }
  ['narayana group of schools west bengal', {
    mouId: 'MOU-STEAM-2627-051',
    note: 'Anish W4-C recon: same entity as Ramanarayana Education Trust',
  }],
  ['tathastu inovation', {
    mouId: 'MOU-STEAM-2627-016',
    note: 'Anish W4-C recon: form typo (Inovation vs Innovations) + omitted city qualifier (Meerut)',
  }],
])

function normalize(s) {
  if (!s) return ''
  return String(s)
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function tokens(s) {
  // Multi-char tokens only; drop very common noise words.
  const STOP = new Set([
    'school', 'schools', 'the', 'of', 'and', 'group',
    'public', 'sr', 'secondary', 'sec', 'senior', 'high', 'hr',
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
  const union = a.size + b.size - intersect
  return intersect / union
}

function assess(formSchool, canonicalName, irId) {
  const formNorm = normalize(formSchool)
  const canonNorm = normalize(canonicalName)

  if (formNorm === '' || canonNorm === '') {
    return { verdict: 'does not match', score: 0, reason: 'empty input' }
  }
  if (formNorm === canonNorm) {
    return { verdict: 'matches', score: 1, reason: 'normalised exact match' }
  }
  // Anish-confirmed alias short-circuit
  const aliased = ANISH_CONFIRMED_ALIASES.get(formNorm)
  if (aliased !== undefined) {
    return {
      verdict: 'matches with minor variation',
      score: -1,
      reason: `Anish-confirmed alias: ${aliased.note}`,
    }
  }
  const ta = tokens(formSchool)
  const tb = tokens(canonicalName)
  const score = jaccard(ta, tb)

  // Subset rule: every distinctive form token appears in canonical (or vice
  // versa). Catches cases like "Techno India Kalyani" vs "Techno India Group
  // Public School Kalyani" where every form token survives in canonical.
  let subset = false
  if (ta.size > 0 && tb.size > 0) {
    let aInB = true
    for (const t of ta) if (!tb.has(t)) { aInB = false; break }
    let bInA = true
    for (const t of tb) if (!ta.has(t)) { bInA = false; break }
    subset = aInB || bInA
  }

  if (score >= 0.8) {
    return { verdict: 'matches', score, reason: `jaccard ${score.toFixed(2)} >= 0.80` }
  }
  if (score >= 0.4 || subset) {
    return {
      verdict: 'matches with minor variation',
      score,
      reason: subset
        ? `token subset (jaccard ${score.toFixed(2)})`
        : `jaccard ${score.toFixed(2)} in [0.4, 0.8)`,
    }
  }
  return { verdict: 'does not match', score, reason: `jaccard ${score.toFixed(2)} < 0.40` }
}

function readFormSchoolNames() {
  // IR-W4C-NNN -> form row (NNN+1) col 4 'School Name'.
  const py = `
import openpyxl, json, sys
wb = openpyxl.load_workbook('${FORM_PATH.replace(/\\/g, '/')}', data_only=True)
ws = wb.active
out = {}
for ri in range(2, ws.max_row + 1):
    out[f'IR-W4C-{ri-1:03d}'] = ws.cell(ri, 4).value
sys.stdout.write(json.dumps(out, ensure_ascii=False))
`
  const stdout = execFileSync('python', ['-c', py], { encoding: 'utf-8' })
  return JSON.parse(stdout)
}

function main() {
  const intakeRecords = JSON.parse(readFileSync(INTAKE_PATH, 'utf-8'))
  const formByIr = readFormSchoolNames()

  // Sanity: ensure 51 hardcoded canonical names.
  const canonCount = Object.keys(CANONICAL_51_LIST).length
  if (canonCount !== 51) {
    throw new Error(`CANONICAL_51_LIST has ${canonCount} entries; expected 51`)
  }

  const rows = []
  let matches = 0
  let minorVariation = 0
  let doesNotMatch = 0

  // Sort by IR id for deterministic output.
  const sorted = [...intakeRecords].sort((a, b) => a.id.localeCompare(b.id))
  for (const ir of sorted) {
    const formSchool = formByIr[ir.id] ?? null
    const mappedMouId = ir.mouId
    const canonicalName = CANONICAL_51_LIST[mappedMouId] ?? null
    const inActiveList = canonicalName !== null

    const a = canonicalName === null
      ? { verdict: 'does not match', score: 0, reason: `mapped MOU ${mappedMouId} not in active 51-list` }
      : assess(formSchool, canonicalName, ir.id)

    const wasW4c7Corrected = ir.auditLog.some(
      (e) => e.action === 'intake-record-corrected-w4c7',
    )

    rows.push({
      irId: ir.id,
      formSchool,
      mappedMouId,
      canonicalNameFrom51List: canonicalName,
      mappedMouInActive51List: inActiveList,
      verdict: a.verdict,
      jaccardScore: a.score === -1 ? null : Number(a.score.toFixed(3)),
      reason: a.reason,
      w4c7Corrected: wasW4c7Corrected,
    })

    if (a.verdict === 'matches') matches++
    else if (a.verdict === 'matches with minor variation') minorVariation++
    else doesNotMatch++
  }

  const report = {
    generatedAt: '2026-04-28T11:00:00.000Z',
    purpose:
      'Independent verification of W4-C.7 corrections. Read-only; no data mutations.',
    canonicalSource:
      'Hardcoded CANONICAL_51_LIST in this script (snapshot from mous.json on 2026-04-28).',
    matchingMetric:
      'Jaccard token overlap (>=0.8 matches; [0.4, 0.8) or token-subset = minor variation; <0.4 does not match).',
    recordCount: rows.length,
    summary: {
      matches,
      matchesWithMinorVariation: minorVariation,
      doesNotMatch,
    },
    rows,
  }

  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2) + '\n', 'utf-8')

  console.log(`[w4c7-verify] records:                  ${rows.length}`)
  console.log(`[w4c7-verify] matches:                  ${matches}`)
  console.log(`[w4c7-verify] matches with variation:   ${minorVariation}`)
  console.log(`[w4c7-verify] does not match:           ${doesNotMatch}`)
  console.log(`[w4c7-verify] report:                   ${REPORT_PATH}`)
}

main()
