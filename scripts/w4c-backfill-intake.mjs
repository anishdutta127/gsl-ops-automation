#!/usr/bin/env node

/*
 * W4-C.4 backfill: 24 historical Google Form intake responses.
 *
 * Reads ops-data/MOU_Signing_Details_2026-2027__Responses_.xlsx,
 * matches each row against the active MOU cohort, lands clean
 * matches in src/data/intake_records.json, and emits the report
 * + manual-review CSV at scripts/w4c-backfill-report-2026-04-27.json
 * + scripts/w4c-backfill-manual-review-2026-04-27.csv.
 *
 * 4-tier confidence labelling:
 *   Tier 1 (auto-import): exact name match + clean fields
 *   Tier 2 (auto-import): well-known fuzzy mapping per W4-C recon
 *     - Row 1 "Don Bosco School Krishnanagar" -> MOU-STEAM-2627-027
 *     - Row 4 "St. Mary's Convent School" -> MOU-STEAM-2627-007
 *     - Row 9 "TATHASTU INOVATION" -> MOU-STEAM-2627-016
 *     - Row 12 "SD Sr Sec School" -> MOU-STEAM-2627-018
 *     - Row 13 "Darshan Academy, Devlali-Nashik" -> MOU-STEAM-2627-049
 *     - Row 14 "K.E Carmel" -> MOU-STEAM-2627-014 (Suri; Anish-confirmed)
 *     - Row 15 "Mahrishi Dayanand Sr Sec School" -> MOU-STEAM-2627-003
 *     - Row 16 "MUTAHHARY PUBLIC SCHOOL" -> MOU-STEAM-2627-001
 *     - Row 17 "JAFFARIA ACADEMY OF MODERN EDUCATION" -> MOU-STEAM-2627-021
 *     - Row 21 "Narayana Group of Schools West Bengal" -> MOU-STEAM-2627-051 (same entity; Anish-confirmed)
 *   Tier 3 (manual-review): ambiguous match (none currently)
 *   Tier 5 (quarantine): no match in active cohort
 *     - Row 24 "GMR International School" (no active MOU; defer)
 *
 * Account Owner disambiguation per W4-C recon:
 *   17 rows = clean sales-rep auto-resolve
 *   1 row co-owners (row 18 "Dr. Sumit Majumdar/Roveena Verma" ->
 *     primary salesOwnerId = mou.salesPersonId, co-owner in audit notes)
 *   4 rows non-rep value (rows 1, 8, 9, 23) -> use mou.salesPersonId
 *     when present; fall through to script-flagged when null
 *
 * Each backfilled record gains:
 *   - completedAt = original Google Form Timestamp
 *   - completedBy = 'system-w4c-backfill'
 *   - thankYouEmailSentAt = column 16 value when present, null when not
 *   - audit: 'intake-captured' with notes citing the W4-C.4 backfill
 *
 * Usage: node scripts/w4c-backfill-intake.mjs
 *
 * Idempotency: the script skips MOUs that already have an
 * IntakeRecord, so re-running is safe. The report file overwrites.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import openpyxlGuard from 'node:process'

// We keep the .xlsx parsing in Python (openpyxl is locally available
// per W4-C recon); this Node script orchestrates the JSON updates.
// The Python helper writes a structured JSON to stdin; we read + apply.
import { execFileSync } from 'node:child_process'

const REPO_ROOT = resolve(import.meta.dirname, '..')
const FORM_PATH = resolve(REPO_ROOT, 'ops-data/MOU_Signing_Details_2026-2027__Responses_.xlsx')
const MOUS_PATH = resolve(REPO_ROOT, 'src/data/mous.json')
const FIXTURES_MOUS_PATH = resolve(REPO_ROOT, 'src/data/_fixtures/mous.json')
const INTAKE_PATH = resolve(REPO_ROOT, 'src/data/intake_records.json')
const FIXTURES_INTAKE_PATH = resolve(REPO_ROOT, 'src/data/_fixtures/intake_records.json')
const SALES_PATH = resolve(REPO_ROOT, 'src/data/sales_team.json')
const REPORT_PATH = resolve(REPO_ROOT, 'scripts/w4c-backfill-report-2026-04-27.json')
const MANUAL_REVIEW_CSV = resolve(REPO_ROOT, 'scripts/w4c-backfill-manual-review-2026-04-27.csv')

// W4-C recon manual mapping: row index (1-based, matches xlsx) -> MOU id.
// Tiered for the report; auto-import covers tiers 1-2.
const ROW_MAPPING = {
  // Row 1: Don Bosco Krishnanagar -> MOU-STEAM-2627-027 (typo fix shipped)
  1: { mouId: 'MOU-STEAM-2627-027', tier: 2, note: 'Auto-import per W4-C recon: school-name typo (Bonsco -> Bosco) corrected during W4-C.1.' },
  // Row 2: St. Paul's Boarding -> MOU-STEAM-2627-002 (exact)
  2: { mouId: 'MOU-STEAM-2627-002', tier: 1 },
  // Row 3: K.E. Carmel School,Amtala -> MOU-STEAM-2627-013
  3: { mouId: 'MOU-STEAM-2627-013', tier: 1 },
  // Row 4: St. Mary's Convent School -> MOU-STEAM-2627-007
  4: { mouId: 'MOU-STEAM-2627-007', tier: 2, note: "Form name has apostrophe-s; MOU has 'St. Mary Convent School' (no apostrophe-s)." },
  // Rows 5-7: Techno India Group Public School - Kalyani / Panagarh / Asansol
  5: { mouId: 'MOU-STEAM-2627-008', tier: 1 },
  6: { mouId: 'MOU-STEAM-2627-009', tier: 1 },
  7: { mouId: 'MOU-STEAM-2627-010', tier: 1 },
  // Row 8: BIT GLOBAL SCHOOL -> need to look up
  8: { mouId: 'MOU-STEAM-2627-011', tier: 1 },
  // Row 9: TATHASTU INOVATION -> MOU-STEAM-2627-016 (W4-A.1 reimport)
  9: { mouId: 'MOU-STEAM-2627-016', tier: 2, note: 'W4-A.1 reimport; school name on form has typo (INOVATION -> Innovations).' },
  // Row 10: St Johns High School -> MOU-STEAM-2627-019
  10: { mouId: 'MOU-STEAM-2627-019', tier: 1 },
  // Row 11: Lions Calcutta (Greater) Vidya Mandir -> MOU-STEAM-2627-020
  11: { mouId: 'MOU-STEAM-2627-020', tier: 1 },
  // Row 12: SD Sr Sec School -> MOU-STEAM-2627-018 (W4-A.1 reimport)
  12: { mouId: 'MOU-STEAM-2627-018', tier: 2, note: 'W4-A.1 reimport; form abbrev "Sr Sec" -> MOU "Senior Secondary".' },
  // Row 13: Darshan Academy, Devlali-Nashik -> MOU-STEAM-2627-049
  13: { mouId: 'MOU-STEAM-2627-049', tier: 2, note: 'Form name includes "-Nashik"; MOU drops it.' },
  // Row 14: K.E Carmel -> MOU-STEAM-2627-014 Suri (per Anish: location data confirms Suri, not Amtala)
  14: { mouId: 'MOU-STEAM-2627-014', tier: 2, note: 'Anish-confirmed: Suri (not Amtala -013); form schoolName ambiguous.' },
  // Row 15: Mahrishi Dayanand Sr Sec School -> MOU-STEAM-2627-003
  15: { mouId: 'MOU-STEAM-2627-003', tier: 2, note: 'Form name includes "Sr Sec"; MOU drops it.' },
  // Row 16: MUTAHHARY PUBLIC SCHOOL -> MOU-STEAM-2627-001
  16: { mouId: 'MOU-STEAM-2627-001', tier: 2, note: 'Casing only.' },
  // Row 17: JAFFARIA ACADEMY OF MODERN EDUCATION -> MOU-STEAM-2627-021
  17: { mouId: 'MOU-STEAM-2627-021', tier: 2, note: 'Casing + missing " - Kargil" suffix.' },
  // Row 18: Blue Angels Global School -> MOU-STEAM-2627-015 (co-owner case)
  18: { mouId: 'MOU-STEAM-2627-015', tier: 1, note: 'Co-owner case: form owner "Dr. Sumit Majumdar/Roveena Verma"; MOU has salesPersonId=sp-roveena. Primary = sp-roveena; co-owner sp-sumit captured in audit notes.' },
  // Row 19: Young Horizons School -> MOU-STEAM-2627-022
  19: { mouId: 'MOU-STEAM-2627-022', tier: 1 },
  // Row 20: Swarnim International School -> MOU-STEAM-2627-023
  20: { mouId: 'MOU-STEAM-2627-023', tier: 1 },
  // Row 21: Narayana Group of Schools West Bengal -> MOU-STEAM-2627-051 (W4-A.1 reimport; Anish-confirmed same entity)
  21: { mouId: 'MOU-STEAM-2627-051', tier: 2, note: 'Anish-confirmed: same entity as Ramanarayana Education Trust (W4-A.1 reimport). Form name -> system name divergence captured.' },
  // Row 22: Kavyapta Global School -> MOU-STEAM-2627-024
  22: { mouId: 'MOU-STEAM-2627-024', tier: 1 },
  // Row 23: Christ Mission School -> MOU-STEAM-2627-025
  23: { mouId: 'MOU-STEAM-2627-025', tier: 1 },
  // Row 24: GMR International School -> NO MATCH (defer per Anish; quarantine)
  24: null,
}

// Account Owner -> sales rep id resolution (case-insensitive substring match).
const SALES_TEAM = JSON.parse(readFileSync(SALES_PATH, 'utf-8'))
function resolveSalesOwner(rawOwner, mouSalesPersonId) {
  if (typeof rawOwner !== 'string' || rawOwner.trim() === '') {
    return mouSalesPersonId
  }
  const norm = rawOwner.toLowerCase()
  for (const sp of SALES_TEAM) {
    if (typeof sp.name !== 'string') continue
    if (norm.includes(sp.name.toLowerCase())) return sp.id
  }
  // Fallback: use the MOU's existing salesPersonId.
  return mouSalesPersonId
}

function normalisePhone(raw) {
  if (raw === null || raw === undefined) return ''
  const s = String(raw).replace(/[\s\-()]+/g, '').trim()
  if (s === '') return ''
  if (/^\+\d{10,15}$/.test(s)) return s
  if (/^91\d{10}$/.test(s)) return `+${s}`
  if (/^\d{10}$/.test(s)) return `+91${s}`
  return s
}

function normaliseDuration(rawDuration, ayYear) {
  // Returns { durationYears, startDate, endDate }
  // Handles: numeric (1.0, 2.0), '1 Year', '2 YEARS', '3years',
  // '1st April 2026 to 31st March 2028'.
  const startDefault = `${ayYear}-04-01`
  if (typeof rawDuration === 'number') {
    const years = Math.max(1, Math.round(rawDuration))
    return {
      durationYears: years,
      startDate: startDefault,
      endDate: `${Number(ayYear) + years}-03-31`,
    }
  }
  if (typeof rawDuration === 'string') {
    // Range pattern
    const rangeMatch = rawDuration.match(/(\d{4}).*?(\d{4})/)
    if (rangeMatch) {
      const startY = Number(rangeMatch[1])
      const endY = Number(rangeMatch[2])
      return {
        durationYears: endY - startY,
        startDate: `${startY}-04-01`,
        endDate: `${endY}-03-31`,
      }
    }
    // 'N year/years'
    const ymatch = rawDuration.match(/(\d+)/)
    if (ymatch) {
      const years = Math.max(1, parseInt(ymatch[1], 10))
      return {
        durationYears: years,
        startDate: startDefault,
        endDate: `${Number(ayYear) + years}-03-31`,
      }
    }
  }
  // Fallback
  return {
    durationYears: 1,
    startDate: startDefault,
    endDate: `${Number(ayYear) + 1}-03-31`,
  }
}

function trainingModeFromForm(raw) {
  if (typeof raw !== 'string') return 'GSL Trainer'
  const norm = raw.toLowerCase().trim()
  if (norm.includes('train the trainer') || norm.includes('ttt')) return 'Train The Trainer (TTT)'
  return 'GSL Trainer'
}

function productFromForm(raw) {
  if (typeof raw !== 'string') return 'STEAM'
  const norm = raw.toLowerCase().trim()
  if (norm.includes('vex')) return 'VEX'
  if (norm.includes('tinkrwr') || norm.includes('tinkrworks') || norm.includes('tinkr')) return 'TinkRworks'
  if (norm.includes('young pioneers')) return 'Young Pioneers'
  if (norm.includes('harvard')) return 'Harvard HBPE'
  return 'STEAM'  // GSLT-Cretile / default
}

function submissionStatusFromForm(raw) {
  if (typeof raw !== 'string') return 'Pending'
  const t = raw.trim()
  if (['Submitted', 'Pending', 'In Transit', 'Not Applicable'].includes(t)) return t
  return 'Pending'
}

function isoDateFrom(value) {
  if (value === null || value === undefined || value === '') return null
  if (value instanceof Date) return value.toISOString()
  // openpyxl-via-python may already serialise to ISO; try Date()
  const d = new Date(value)
  if (!Number.isFinite(d.getTime())) return null
  return d.toISOString()
}

function csvEscape(s) {
  if (s === null || s === undefined) return ''
  const v = String(s)
  if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`
  return v
}

function main() {
  // Use Python to parse the .xlsx (openpyxl is local; xlsx isn't an npm dep).
  const pythonScript = `
import openpyxl, json, datetime, sys
wb = openpyxl.load_workbook('${FORM_PATH.replace(/\\/g, '/')}', data_only=True)
ws = wb.active
out = []
for ri in range(2, ws.max_row + 1):
    row = [c.value for c in ws[ri]]
    # Convert datetimes to ISO so JSON.parse handles them.
    row = [v.isoformat() if isinstance(v, datetime.datetime) else v for v in row]
    out.append({'rowNumber': ri - 1, 'cells': row})
sys.stdout.write(json.dumps(out))
`
  const stdout = execFileSync('python', ['-c', pythonScript], { encoding: 'utf-8' })
  const formRows = JSON.parse(stdout)

  const mous = JSON.parse(readFileSync(MOUS_PATH, 'utf-8'))
  const intakeRecords = JSON.parse(readFileSync(INTAKE_PATH, 'utf-8'))
  const mouById = new Map(mous.map((m) => [m.id, m]))
  const existingIntakeMouIds = new Set(intakeRecords.map((r) => r.mouId))

  const newRecords = []
  const report = {
    generatedAt: new Date().toISOString(),
    rowCount: formRows.length,
    autoImported: [],
    quarantined: [],
    skippedAlreadyExists: [],
    thankYouSentCount: 0,
    thankYouPendingCount: 0,
  }
  const manualReview = []

  for (const { rowNumber, cells } of formRows) {
    const mapping = ROW_MAPPING[rowNumber]
    if (mapping === null) {
      report.quarantined.push({
        rowNumber,
        schoolName: cells[3],
        reason: 'No matching MOU in active 51-list (defer per Anish)',
      })
      manualReview.push({
        rowNumber, schoolName: cells[3], formOwner: cells[1],
        status: 'pending', resolution: '',
      })
      continue
    }

    const mou = mouById.get(mapping.mouId)
    if (!mou) {
      console.warn(`[backfill] mapping for row ${rowNumber} points at ${mapping.mouId} which is not in mous.json; skipping`)
      continue
    }

    if (existingIntakeMouIds.has(mou.id)) {
      report.skippedAlreadyExists.push({ rowNumber, mouId: mou.id })
      continue
    }

    const formTimestamp = cells[0]
    const formOwner = cells[1]
    const formLocation = cells[2] ?? ''
    const formGrades = cells[4] ?? ''
    const formRecipient = cells[5] ?? ''
    const formEmail = cells[6] ?? ''
    const formStudents = cells[7] ?? mou.studentsMou
    const formDuration = cells[8]
    const formPhysical = cells[9]
    const formSoft = cells[10]
    const formProduct = cells[11]
    const formMode = cells[12]
    const formPoc = cells[13] ?? ''
    const formUrl = cells[14] ?? ''
    const formThankYou = cells[15]

    const ayYear = mou.academicYear.slice(0, 4)
    const { durationYears, startDate, endDate } = normaliseDuration(formDuration, ayYear)

    // Recipient name + designation: form combines them; split on ' - ' or '\n'.
    let recipientName = String(formRecipient).trim()
    let recipientDesignation = ''
    const splitDash = recipientName.split(/\s*[-–]\s*/)
    if (splitDash.length >= 2) {
      recipientName = splitDash[0].trim()
      recipientDesignation = splitDash.slice(1).join(' - ').trim()
    } else {
      const splitNewline = recipientName.split(/\n/)
      if (splitNewline.length >= 2) {
        recipientName = splitNewline[0].trim()
        recipientDesignation = splitNewline.slice(1).join(' ').trim()
      } else {
        recipientDesignation = 'Principal'  // common default
      }
    }

    // POC: form combines name + phone; split similarly. Numeric-only POC
    // becomes the phone with a generic name placeholder.
    let pocName = ''
    let pocPhone = ''
    if (typeof formPoc === 'number') {
      pocName = 'School POC'
      pocPhone = normalisePhone(String(formPoc))
    } else {
      const pocStr = String(formPoc)
      const phoneMatch = pocStr.match(/[+\d][\d\s\-()]{7,}/)
      if (phoneMatch) {
        pocPhone = normalisePhone(phoneMatch[0])
        pocName = pocStr.replace(phoneMatch[0], '').replace(/[-&,]/g, '').trim() || 'School POC'
      } else {
        pocName = pocStr.trim() || 'School POC'
        pocPhone = '+910000000000'  // placeholder; manual review will catch
      }
    }

    const salesOwnerId = resolveSalesOwner(formOwner, mou.salesPersonId)
    if (!salesOwnerId) {
      report.quarantined.push({
        rowNumber,
        mouId: mou.id,
        reason: 'Could not resolve salesOwnerId from form owner OR MOU.salesPersonId is null',
        formOwner,
      })
      continue
    }

    const completedAt = isoDateFrom(formTimestamp) ?? new Date().toISOString()
    const thankYouSentAt = isoDateFrom(formThankYou)
    if (thankYouSentAt !== null) report.thankYouSentCount += 1
    else report.thankYouPendingCount += 1

    const auditNotes = [
      `W4-C.4 backfill from Google Form row ${rowNumber} timestamped ${completedAt}.`,
      mapping.note ? mapping.note : '',
      // Co-owner audit note for row 18.
      rowNumber === 18 ? 'Co-owner case: form lists "Dr. Sumit Majumdar/Roveena Verma"; primary salesOwner=sp-roveena.' : '',
    ].filter((s) => s !== '').join(' ')

    const record = {
      id: `IR-W4C-${String(rowNumber).padStart(3, '0')}`,
      mouId: mou.id,
      completedAt,
      completedBy: 'system-w4c-backfill',
      salesOwnerId,
      location: String(formLocation).trim(),
      grades: String(formGrades).trim() || 'unspecified',
      recipientName: recipientName || 'School Principal',
      recipientDesignation: recipientDesignation || 'Principal',
      recipientEmail: String(formEmail).trim().toLowerCase() || `unknown@${mou.id.toLowerCase()}.invalid`,
      studentsAtIntake: Number(formStudents) || mou.studentsMou,
      durationYears,
      startDate,
      endDate,
      physicalSubmissionStatus: submissionStatusFromForm(formPhysical),
      softCopySubmissionStatus: submissionStatusFromForm(formSoft),
      productConfirmed: productFromForm(formProduct),
      gslTrainingMode: trainingModeFromForm(formMode),
      schoolPointOfContactName: pocName,
      schoolPointOfContactPhone: pocPhone || '+910000000000',
      signedMouUrl: String(formUrl).trim() || 'https://drive.google.com/placeholder',
      thankYouEmailSentAt: thankYouSentAt,
      auditLog: [
        {
          timestamp: completedAt,
          user: 'system-w4c-backfill',
          action: 'intake-captured',
          notes: auditNotes,
        },
      ],
    }
    newRecords.push(record)
    report.autoImported.push({ rowNumber, mouId: mou.id, tier: mapping.tier, recordId: record.id })

    // Mirror the audit on the MOU's auditLog so /mous/[id] surfaces it.
    mou.auditLog = [
      ...mou.auditLog,
      {
        timestamp: completedAt,
        user: 'system-w4c-backfill',
        action: 'intake-captured',
        notes: auditNotes,
      },
    ]
  }

  // Append new intake records.
  const updatedIntakeRecords = [...intakeRecords, ...newRecords]
  writeFileSync(INTAKE_PATH, JSON.stringify(updatedIntakeRecords, null, 2) + '\n', 'utf-8')
  writeFileSync(FIXTURES_INTAKE_PATH, JSON.stringify(updatedIntakeRecords, null, 2) + '\n', 'utf-8')
  // Persist the audit-mutated mous.json + fixture mirror.
  writeFileSync(MOUS_PATH, JSON.stringify(mous, null, 2) + '\n', 'utf-8')
  writeFileSync(FIXTURES_MOUS_PATH, JSON.stringify(mous, null, 2) + '\n', 'utf-8')

  // Report
  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2) + '\n', 'utf-8')

  // Manual-review CSV
  const csvLines = ['rowNumber,schoolName,formOwner,status,resolution']
  for (const item of manualReview) {
    csvLines.push([
      item.rowNumber, csvEscape(item.schoolName), csvEscape(item.formOwner),
      item.status, csvEscape(item.resolution),
    ].join(','))
  }
  writeFileSync(MANUAL_REVIEW_CSV, csvLines.join('\n') + '\n', 'utf-8')

  // Summary on stdout
  console.log(`[backfill] auto-imported: ${report.autoImported.length}`)
  console.log(`[backfill] quarantined:    ${report.quarantined.length}`)
  console.log(`[backfill] skipped:        ${report.skippedAlreadyExists.length}`)
  console.log(`[backfill] thank-you sent: ${report.thankYouSentCount}`)
  console.log(`[backfill] thank-you pending (post-backfill): ${report.thankYouPendingCount}`)
  console.log(`[backfill] report:         ${REPORT_PATH}`)
  console.log(`[backfill] manual-review:  ${MANUAL_REVIEW_CSV}`)
}

main()
