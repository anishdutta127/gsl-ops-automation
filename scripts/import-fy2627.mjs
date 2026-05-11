#!/usr/bin/env node
/*
 * Gate 4.5 Excel import (Steps 2 + 3 combined).
 *
 * Reads:
 *   phase-pranav-misba-imports/Pratik_-_School_Invoicing_Summary_2026-27.xlsx
 *     -> STEAM 2026-27PD  + YP_2026-27 sheets
 *   phase-pranav-misba-imports/Kit_Delivery_2026.xlsx
 *     -> TW + Cretile + Hardware sheets (+ Pratik for cross-validation)
 *
 * Writes everything to src/data/_imports/fy2627/<entity>.json (staging,
 * not promoted to production until cutover in Gate 5).
 *
 * CLI flags:
 *   --pranav-only      run only the Pratik file portion
 *   --misba-only       run only the Kit Delivery file portion
 *   --dry-run          compute outputs without writing JSON
 *   --strict           exit code 1 when warnings exist (not just errors)
 *
 * Idempotent: re-running merges by id; counters distinguish
 * "inserted" vs "updated" vs "unchanged" per entity per run.
 *
 * See docs/gate-4.5/EXCEL_MAPPING.md for the column-by-column mapping
 * and the decision archive.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import xlsxPkg from 'xlsx'
const xlsx = xlsxPkg

// Helpers below are mirrored verbatim from src/lib/imports/fy2627Helpers.ts
// where they live as the typed + tested source of truth. Node.js cannot
// import .ts at runtime without a loader, so this script keeps a small
// JS copy. If the helper logic changes, update BOTH files (the .ts test
// will catch drift on the next vitest run).

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url)
const REPO_ROOT = resolve(dirname(__filename), '..')
const PRANAV_FILE = join(
  REPO_ROOT,
  'phase-pranav-misba-imports',
  'Pratik_-_School_Invoicing_Summary_2026-27.xlsx',
)
const MISBA_FILE = join(
  REPO_ROOT,
  'phase-pranav-misba-imports',
  'Kit_Delivery_2026.xlsx',
)
const OUT_DIR = join(REPO_ROOT, 'src', 'data', '_imports', 'fy2627')
const EXISTING_SCHOOLS_PATH = join(REPO_ROOT, 'src', 'data', 'schools.json')
const EXISTING_SALES_TEAM_PATH = join(
  REPO_ROOT,
  'src',
  'data',
  'sales_team.json',
)

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

const argv = new Set(process.argv.slice(2))
const DRY_RUN = argv.has('--dry-run')
const STRICT = argv.has('--strict')
const PRANAV_ONLY = argv.has('--pranav-only')
const MISBA_ONLY = argv.has('--misba-only')

// ---------------------------------------------------------------------------
// Helpers: parsing + normalisation
// ---------------------------------------------------------------------------

export function slugify(input) {
  if (input === null || input === undefined) return ''
  return String(input)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
}

export function parseNumber(value) {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'number' && Number.isFinite(value)) return value
  const s = String(value).replace(/[Rs|INR|,\s]/gi, '').trim()
  if (s === '' || s === '-') return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

export function isYes(value) {
  if (value === null || value === undefined) return false
  return /^(y|yes|true)$/i.test(String(value).trim())
}

export function parseTrainerModel(value) {
  if (value === null || value === undefined) return null
  const v = String(value).trim().toUpperCase()
  if (v === '' || v === '-') return null
  if (v === 'TT') return 'TT'
  if (v === 'TTT' || v === 'GSL-T' || v === 'GSL_T' || v === 'GSLT') return 'GSL-T'
  if (v === 'BOOTCAMP') return 'Bootcamp'
  // Gate 4.7 Step 6b: 'AIQ' confirmed as a real GSL trainer model.
  if (v === 'AIQ') return 'AIQ'
  return null
}

export function parseDuration(value) {
  // Patterns: "01st April 2026 to 31st march 2027" or "01st April 2026 to 31st march 2028"
  if (!value) return { start: '2026-04-01', end: '2027-03-31', fallback: true }
  const text = String(value).trim()
  const re = /(\d{1,2})(?:st|nd|rd|th)?\s+([a-zA-Z]+)\s+(\d{4})\s*(?:to|-)\s*(\d{1,2})(?:st|nd|rd|th)?\s+([a-zA-Z]+)\s+(\d{4})/i
  const m = text.match(re)
  if (!m) return { start: '2026-04-01', end: '2027-03-31', fallback: true }
  const months = {
    jan: '01', january: '01',
    feb: '02', february: '02',
    mar: '03', march: '03',
    apr: '04', april: '04',
    may: '05',
    jun: '06', june: '06',
    jul: '07', july: '07',
    aug: '08', august: '08',
    sep: '09', sept: '09', september: '09',
    oct: '10', october: '10',
    nov: '11', november: '11',
    dec: '12', december: '12',
  }
  const sDay = m[1].padStart(2, '0')
  const sMon = months[m[2].toLowerCase()] ?? '04'
  const sYr = m[3]
  const eDay = m[4].padStart(2, '0')
  const eMon = months[m[5].toLowerCase()] ?? '03'
  const eYr = m[6]
  return {
    start: `${sYr}-${sMon}-${sDay}`,
    end: `${eYr}-${eMon}-${eDay}`,
    fallback: false,
  }
}

export function parseDateCell(value) {
  if (!value) return null
  if (value instanceof Date) {
    const iso = value.toISOString()
    return iso.slice(0, 10)
  }
  // xlsx returns dates as JS Date instances when cellDates option is set;
  // otherwise as serial numbers. Use xlsx.SSF to format if number.
  if (typeof value === 'number' && Number.isFinite(value)) {
    const d = xlsx.SSF.parse_date_code(value)
    if (!d) return null
    const yr = String(d.y).padStart(4, '0')
    const mo = String(d.m).padStart(2, '0')
    const dy = String(d.d).padStart(2, '0')
    return `${yr}-${mo}-${dy}`
  }
  // Free-text fallback
  const s = String(value).trim()
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null
}

function trim(v) {
  if (v === null || v === undefined) return ''
  return String(v).trim()
}

function lower(v) {
  return trim(v).toLowerCase()
}

// ---------------------------------------------------------------------------
// Cell access helpers (1-indexed column letters -> values)
// ---------------------------------------------------------------------------

function cellLetters(col) {
  // 1-indexed: 1 -> A, 2 -> B, 27 -> AA
  let s = ''
  let n = col
  while (n > 0) {
    const r = (n - 1) % 26
    s = String.fromCharCode(65 + r) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

function getCellValue(sheet, row, col) {
  const addr = cellLetters(col) + row
  const cell = sheet[addr]
  return cell ? cell.v : undefined
}

// ---------------------------------------------------------------------------
// Meta accumulator
// ---------------------------------------------------------------------------

function newMeta() {
  return {
    runStartedAt: new Date().toISOString(),
    dryRun: DRY_RUN,
    strict: STRICT,
    sources: {},
    counts: {
      mous: { inserted: 0, updated: 0, unchanged: 0 },
      schools: { inserted: 0, updated: 0, unchanged: 0 },
      salesTeam: { inserted: 0, updated: 0, unchanged: 0 },
      payments: { inserted: 0, updated: 0, unchanged: 0 },
      kitDispatches: { inserted: 0, updated: 0, unchanged: 0 },
      inventoryItems: { inserted: 0, updated: 0, unchanged: 0 },
    },
    skipped: [],
    errors: [],
    warnings: [],
    chainMouCandidates: [],
    crossValidationGaps: [],
    autoCreatedSalesReps: [],
    autoCreatedSchools: [],
  }
}

// ---------------------------------------------------------------------------
// Pranav import (STEAM + YP)
// ---------------------------------------------------------------------------

function importPranav(meta, registries) {
  const wb = xlsx.readFile(PRANAV_FILE, { cellDates: true })
  meta.sources.pranav = {
    path: PRANAV_FILE,
    sheets: wb.SheetNames,
    importedAt: new Date().toISOString(),
  }

  // STEAM sheet: header row 4, data rows 5+
  const steamName = wb.SheetNames.find((n) => n.trim() === 'STEAM 2026-27PD')
  if (!steamName) {
    meta.errors.push({ stage: 'pranav', message: 'STEAM sheet not found' })
  } else {
    importSteamSheet(wb.Sheets[steamName], meta, registries)
  }

  // YP sheet: header row 5, data rows 6+
  const ypName = wb.SheetNames.find((n) => n.trim() === 'YP_2026-27')
  if (!ypName) {
    meta.errors.push({ stage: 'pranav', message: 'YP_2026-27 sheet not found' })
  } else {
    importYpSheet(wb.Sheets[ypName], meta, registries)
  }
}

function importSteamSheet(sheet, meta, registries) {
  const ref = sheet['!ref']
  if (!ref) return
  const range = xlsx.utils.decode_range(ref)
  for (let row = 5; row <= range.e.r + 1; row++) {
    const schoolName = trim(getCellValue(sheet, row, 2))
    if (schoolName === '') {
      // Row entirely empty: silent skip.
      continue
    }

    const acquisitionStatus = trim(getCellValue(sheet, row, 3))
    const salesRepName = trim(getCellValue(sheet, row, 5))
    const physicalCopyScanned = isYes(getCellValue(sheet, row, 6))
    const mouSigned = isYes(getCellValue(sheet, row, 7))
    const modelRaw = trim(getCellValue(sheet, row, 10))
    const trainerModel = parseTrainerModel(modelRaw)
    const duration = parseDuration(getCellValue(sheet, row, 11))
    const city = trim(getCellValue(sheet, row, 12))
    const state = trim(getCellValue(sheet, row, 13))
    const studentsMou = parseNumber(getCellValue(sheet, row, 14)) ?? 0
    const contractValue = parseNumber(getCellValue(sheet, row, 15))
    const studentsActual = parseNumber(getCellValue(sheet, row, 16))
    const spWithoutTax = parseNumber(getCellValue(sheet, row, 17))
    const spWithTax = parseNumber(getCellValue(sheet, row, 18))
    const received = parseNumber(getCellValue(sheet, row, 20)) ?? 0
    const tds = parseNumber(getCellValue(sheet, row, 21)) ?? 0

    if (modelRaw !== '' && modelRaw !== '-' && trainerModel === null) {
      meta.warnings.push({
        stage: 'pranav.steam',
        row,
        message: `trainer model out of enum: ${modelRaw}`,
      })
    }
    // Gate 4.7 Step 6a: loud-fail rows no longer skip entirely. Import
    // the school + sales rep + students etc., set contractValue=null,
    // and stamp importNotes.loudFail so the admin status surface can
    // flag them for Pranav to fill in.
    const isLoudFail = contractValue === null
    if (isLoudFail) {
      meta.errors.push({
        stage: 'pranav.steam',
        row,
        school: schoolName,
        message: 'sale amount missing or unparseable; imported with contractValue=null',
      })
    }

    // School upsert
    const schoolId = `sch-${slugify(schoolName)}`
    const existingSchool = registries.schools.get(schoolId)
    if (!existingSchool) {
      registries.schools.set(schoolId, {
        id: schoolId,
        name: schoolName,
        legalEntity: null,
        city: city || null,
        state: state || null,
        region: null,
        pinCode: null,
        contactPerson: null,
        email: null,
        phone: null,
        billingName: null,
        pan: null,
        gstNumber: null,
        notes: 'Created during Pranav FY26-27 import.',
        active: true,
        createdAt: new Date().toISOString(),
        auditLog: [],
      })
      meta.counts.schools.inserted += 1
      meta.autoCreatedSchools.push({ id: schoolId, name: schoolName, source: 'pranav.steam' })
    } else {
      meta.counts.schools.unchanged += 1
    }

    // Sales rep upsert
    let salesPersonId = null
    if (salesRepName !== '') {
      const repSlug = slugify(salesRepName)
      const repId = `sp-${repSlug}`
      if (!registries.salesTeam.has(repId)) {
        registries.salesTeam.set(repId, {
          id: repId,
          name: salesRepName,
          email: null,
          phone: null,
          territories: [],
          active: true,
          notes: 'Auto-created during Pranav FY26-27 import.',
          createdAt: new Date().toISOString(),
        })
        meta.counts.salesTeam.inserted += 1
        meta.autoCreatedSalesReps.push({ id: repId, name: salesRepName })
      } else {
        meta.counts.salesTeam.unchanged += 1
      }
      salesPersonId = repId
    }

    // MOU upsert
    const programmeNum = `STEAM-${duration.start.slice(0, 4)}-${slugify(schoolName).slice(0, 12)}`
    const mouId = `MOU-${programmeNum}`
    const importNotes = [
      acquisitionStatus && `acquisitionStatus=${acquisitionStatus}`,
      modelRaw && trainerModel === null && `trainerModelRaw=${modelRaw}`,
      duration.fallback && 'durationFallback=true',
      isLoudFail && 'loudFail=missing-contract-value',
    ]
      .filter(Boolean)
      .join('; ')

    // For loud-fail rows we keep contractValue as 0 (not null) so the
    // MOU type stays a strict `number`; the importNotes.loudFail flag
    // is the source of truth that "this record is incomplete and the
    // sale amount is unknown". Downstream admin surfacing reads the
    // flag, not the zero.
    const safeContractValue = contractValue ?? 0
    const mou = {
      id: mouId,
      schoolId,
      schoolName,
      programme: 'STEAM',
      programmeSubType: null,
      schoolScope: 'SINGLE',
      schoolGroupId: null,
      status: mouSigned ? 'Active' : 'Pending Signature',
      cohortStatus: 'active',
      academicYear: '2026-27',
      startDate: duration.start,
      endDate: duration.end,
      studentsMou,
      studentsActual,
      studentsVariance: null,
      studentsVariancePct: null,
      spWithoutTax: spWithoutTax ?? 0,
      spWithTax: spWithTax ?? 0,
      contractValue: safeContractValue,
      received,
      tds,
      balance: safeContractValue - received,
      receivedPct: safeContractValue > 0 ? Math.round((received / safeContractValue) * 100) : 0,
      paymentSchedule: '',
      trainerModel,
      salesPersonId,
      templateVersion: null,
      generatedAt: null,
      notes: null,
      delayNotes: null,
      daysToExpiry: null,
      auditLog: [],
      effectiveDate: duration.start,
      signedMouPdfPath: physicalCopyScanned ? `imports/fy2627/stubs/${mouId}.pdf` : null,
      importNotes: importNotes || null,
    }

    if (registries.mous.has(mouId)) {
      meta.counts.mous.updated += 1
    } else {
      meta.counts.mous.inserted += 1
    }
    registries.mous.set(mouId, mou)

    // Installment / Payment rows (up to 4)
    // Columns: Y=25, Z=26, AA=27, AB=28 (instalment 1)
    //          AC=29, AD=30, AE=31, AF=32 (instalment 2)
    //          AG=33, AH=34, AI=35, AJ=36 (instalment 3)
    //          AK=37, AL=38, AM=39, AN=40 (instalment 4)
    let pctSum = 0
    for (let inst = 0; inst < 4; inst++) {
      const base = 25 + inst * 4
      const pct = parseNumber(getCellValue(sheet, row, base))
      const amount = parseNumber(getCellValue(sheet, row, base + 1))
      const month = getCellValue(sheet, row, base + 2)
      const paymentReceived = getCellValue(sheet, row, base + 3)
      if (pct === null && amount === null && !month) continue
      pctSum += pct ?? 0
      const paymentId = `${mouId}-i${inst + 1}`
      const dueDateIso = parseDateCell(month)
      const isReceived = paymentReceived !== null && paymentReceived !== undefined && trim(paymentReceived) !== ''
      const receivedAmount = isReceived ? (parseNumber(paymentReceived) ?? amount) : null
      const payment = {
        id: paymentId,
        mouId,
        schoolName,
        programme: 'STEAM',
        instalmentLabel: `${inst + 1} of 4`,
        instalmentSeq: inst + 1,
        totalInstalments: 4,
        description: '',
        dueDateRaw: month ? String(month) : null,
        dueDateIso,
        expectedAmount: amount ?? 0,
        receivedAmount,
        receivedDate: isReceived && dueDateIso ? dueDateIso : null,
        paymentMode: null,
        bankReference: null,
        piNumber: null,
        taxInvoiceNumber: null,
        status: isReceived ? 'Received' : (dueDateIso ? 'Pending' : 'Pending'),
        notes: null,
        piSentDate: null,
        piSentTo: null,
        piGeneratedAt: null,
        studentCountActual: null,
        partialPayments: null,
        auditLog: null,
      }
      if (registries.payments.has(paymentId)) {
        meta.counts.payments.updated += 1
      } else {
        meta.counts.payments.inserted += 1
      }
      registries.payments.set(paymentId, payment)
    }

    if (pctSum > 0 && Math.abs(pctSum - 1) > 0.01) {
      meta.warnings.push({
        stage: 'pranav.steam',
        row,
        school: schoolName,
        message: `installment % sum ${pctSum.toFixed(3)} != 1.0`,
      })
    }
  }
}

function importYpSheet(sheet, meta, registries) {
  const ref = sheet['!ref']
  if (!ref) return
  const range = xlsx.utils.decode_range(ref)
  for (let row = 6; row <= range.e.r + 1; row++) {
    const schoolName = trim(getCellValue(sheet, row, 2))
    if (schoolName === '') continue

    const city = trim(getCellValue(sheet, row, 3))
    const state = trim(getCellValue(sheet, row, 4))
    const ypLevel = trim(getCellValue(sheet, row, 5))
    const piNumber = trim(getCellValue(sheet, row, 6))
    const taxInvoiceNumber = trim(getCellValue(sheet, row, 7))
    const mouSignedRaw = trim(getCellValue(sheet, row, 8))
    const signingDate = parseDateCell(getCellValue(sheet, row, 10))
    const academicYear = trim(getCellValue(sheet, row, 11)) || '2026-27'
    const termination = trim(getCellValue(sheet, row, 12))
    const studentsMou = parseNumber(getCellValue(sheet, row, 13)) ?? 0
    const studentsActual = parseNumber(getCellValue(sheet, row, 14))
    const spWithoutTax = parseNumber(getCellValue(sheet, row, 15)) ?? 0
    const spWithTax = parseNumber(getCellValue(sheet, row, 17)) ?? 0
    const contractValue = parseNumber(getCellValue(sheet, row, 18)) ?? 0
    const received = parseNumber(getCellValue(sheet, row, 19)) ?? 0
    const paymentDate = parseDateCell(getCellValue(sheet, row, 20))
    const tds = parseNumber(getCellValue(sheet, row, 21)) ?? 0

    const schoolId = `sch-${slugify(schoolName)}`
    if (!registries.schools.has(schoolId)) {
      registries.schools.set(schoolId, {
        id: schoolId,
        name: schoolName,
        legalEntity: null,
        city: city || null,
        state: state || null,
        region: null,
        pinCode: null,
        contactPerson: null,
        email: null,
        phone: null,
        billingName: null,
        pan: null,
        gstNumber: null,
        notes: 'Created during Pranav FY26-27 import.',
        active: true,
        createdAt: new Date().toISOString(),
        auditLog: [],
      })
      meta.counts.schools.inserted += 1
      meta.autoCreatedSchools.push({ id: schoolId, name: schoolName, source: 'pranav.yp' })
    } else {
      meta.counts.schools.unchanged += 1
      // Flag chain-MOU candidate: school exists in STEAM too.
      meta.chainMouCandidates.push({
        schoolId,
        name: schoolName,
        appearsIn: ['STEAM', 'YP'],
      })
    }

    const mouId = `MOU-YP-2026-${slugify(schoolName).slice(0, 12)}`
    const importNotes = [
      ypLevel && `ypLevel=${ypLevel}`,
      termination && `termination=${termination}`,
      mouSignedRaw && `mouSignedRaw=${mouSignedRaw}`,
    ]
      .filter(Boolean)
      .join('; ')

    const mou = {
      id: mouId,
      schoolId,
      schoolName,
      programme: 'Young Pioneers',
      programmeSubType: null,
      schoolScope: 'SINGLE',
      schoolGroupId: null,
      status: mouSignedRaw !== '' ? 'Active' : 'Pending Signature',
      cohortStatus: 'active',
      academicYear,
      startDate: signingDate ?? '2026-04-01',
      endDate: '2027-03-31',
      studentsMou,
      studentsActual,
      studentsVariance: null,
      studentsVariancePct: null,
      spWithoutTax,
      spWithTax,
      contractValue,
      received,
      tds,
      balance: contractValue - received,
      receivedPct: contractValue > 0 ? Math.round((received / contractValue) * 100) : 0,
      paymentSchedule: '',
      trainerModel: null,
      salesPersonId: null,
      templateVersion: null,
      generatedAt: null,
      notes: null,
      delayNotes: null,
      daysToExpiry: null,
      auditLog: [],
      effectiveDate: signingDate ?? null,
      signedMouPdfPath: null,
      importNotes: importNotes || null,
    }

    if (registries.mous.has(mouId)) {
      meta.counts.mous.updated += 1
    } else {
      meta.counts.mous.inserted += 1
    }
    registries.mous.set(mouId, mou)

    // Single Payment record (seq=1) if a PI exists or receipt exists.
    if (piNumber !== '' || received > 0 || paymentDate) {
      const paymentId = `${mouId}-i1`
      const payment = {
        id: paymentId,
        mouId,
        schoolName,
        programme: 'Young Pioneers',
        instalmentLabel: '1 of 1',
        instalmentSeq: 1,
        totalInstalments: 1,
        description: '',
        dueDateRaw: null,
        dueDateIso: signingDate ?? null,
        expectedAmount: contractValue,
        receivedAmount: received > 0 ? received : null,
        receivedDate: paymentDate,
        paymentMode: null,
        bankReference: null,
        piNumber: piNumber || null,
        taxInvoiceNumber: taxInvoiceNumber || null,
        status: received >= contractValue && contractValue > 0 ? 'Paid' : 'Pending',
        notes: null,
        piSentDate: null,
        piSentTo: null,
        piGeneratedAt: piNumber !== '' ? new Date().toISOString() : null,
        studentCountActual: studentsActual,
        partialPayments: null,
        auditLog: null,
      }
      if (registries.payments.has(paymentId)) {
        meta.counts.payments.updated += 1
      } else {
        meta.counts.payments.inserted += 1
      }
      registries.payments.set(paymentId, payment)
    }
  }
}

// ---------------------------------------------------------------------------
// Misba import (TW + Cretile + Hardware)
// ---------------------------------------------------------------------------

function importMisba(meta, registries) {
  const wb = xlsx.readFile(MISBA_FILE, { cellDates: true })
  meta.sources.misba = {
    path: MISBA_FILE,
    sheets: wb.SheetNames,
    importedAt: new Date().toISOString(),
  }

  const twSheet = wb.Sheets[wb.SheetNames.find((n) => n.trim() === 'TW')]
  if (twSheet) importMisbaSheet(twSheet, 'TW', 'TinkRworks', meta, registries)

  const cretileSheet = wb.Sheets[wb.SheetNames.find((n) => n.trim() === 'Cretile')]
  if (cretileSheet) importMisbaSheet(cretileSheet, 'Cretile', 'Cretile', meta, registries)

  const hardwareSheet = wb.Sheets[wb.SheetNames.find((n) => n.trim() === 'Hardware')]
  if (hardwareSheet) importMisbaSheet(hardwareSheet, 'Hardware', 'Hardware', meta, registries)

  // Cross-validation against the Pratik summary sheet (top table only).
  const pratikSheet = wb.Sheets[wb.SheetNames.find((n) => n.trim() === 'Pratik')]
  if (pratikSheet) crossValidatePratik(pratikSheet, meta, registries)
}

function importMisbaSheet(sheet, kind, productLine, meta, registries) {
  // Header row index + column layout depend on the sheet kind.
  // All three Misba sheets: header at row 2, data from row 3.
  const ref = sheet['!ref']
  if (!ref) return
  const range = xlsx.utils.decode_range(ref)

  // Read the header row once to map column -> SKU label.
  const headers = {}
  for (let col = 1; col <= range.e.c + 1; col++) {
    const v = trim(getCellValue(sheet, 2, col))
    if (v !== '') headers[col] = v
  }

  // Per-sheet column boundaries.
  // TW: SKU columns 5-22 (E-V), dispatchedAt 23 (W), DC 24 (X),
  //     eway 25 (Y), billing 26 (Z), students 27 (AA), kitReturn 28 (AB).
  // Cretile: grade columns 5-14 (E-N), dispatchedAt 15 (O), DC 16 (P),
  //          eway 17 (Q), billing 18 (R), students 19 (S), kitReturn 20 (T).
  // Hardware: SKU columns 5-14 (E-N), price 15 (O).
  let skuColStart = 5
  let skuColEnd, dispatchedAtCol, dcCol, ewayCol, billingCol, studentsCol, kitReturnCol, priceCol
  if (kind === 'TW') {
    skuColEnd = 22
    dispatchedAtCol = 23
    dcCol = 24
    ewayCol = 25
    billingCol = 26
    studentsCol = 27
    kitReturnCol = 28
  } else if (kind === 'Cretile') {
    skuColEnd = 14
    dispatchedAtCol = 15
    dcCol = 16
    ewayCol = 17
    billingCol = 18
    studentsCol = 19
    kitReturnCol = 20
  } else {
    skuColEnd = 14
    priceCol = 15
  }

  for (let row = 3; row <= range.e.r + 1; row++) {
    const schoolName = trim(getCellValue(sheet, row, 2))
    if (schoolName === '') continue
    const concernPerson = trim(getCellValue(sheet, row, 3))
    const salesPersonName = trim(getCellValue(sheet, row, 4))
    const dispatchedAt = dispatchedAtCol ? parseDateCell(getCellValue(sheet, row, dispatchedAtCol)) : null
    const dcRaw = dcCol ? trim(getCellValue(sheet, row, dcCol)) : ''
    const dcNumber = dcRaw || ''
    const eway = ewayCol ? trim(getCellValue(sheet, row, ewayCol)) : ''
    const billing = billingCol ? trim(getCellValue(sheet, row, billingCol)) : ''
    const studentsServed = studentsCol ? parseNumber(getCellValue(sheet, row, studentsCol)) : null
    const kitReturn = kitReturnCol ? trim(getCellValue(sheet, row, kitReturnCol)) : ''
    const price = priceCol ? parseNumber(getCellValue(sheet, row, priceCol)) : null

    // School match (existing or new)
    const schoolId = `sch-${slugify(schoolName)}`
    if (!registries.schools.has(schoolId)) {
      registries.schools.set(schoolId, {
        id: schoolId,
        name: schoolName,
        legalEntity: null,
        city: null,
        state: null,
        region: null,
        pinCode: null,
        contactPerson: concernPerson || null,
        email: null,
        phone: null,
        billingName: null,
        pan: null,
        gstNumber: null,
        notes: 'Created during Misba kit dispatch import.',
        active: true,
        createdAt: new Date().toISOString(),
        auditLog: [],
      })
      meta.counts.schools.inserted += 1
      meta.autoCreatedSchools.push({
        id: schoolId,
        name: schoolName,
        source: `misba.${kind.toLowerCase()}`,
      })
    } else {
      const existing = registries.schools.get(schoolId)
      if (concernPerson && !existing.contactPerson) {
        existing.contactPerson = concernPerson
        meta.counts.schools.updated += 1
      } else {
        meta.counts.schools.unchanged += 1
      }
    }

    // Match MOU (cross-Excel reconciliation)
    let matchedMouId = null
    for (const mou of registries.mous.values()) {
      if (mou.schoolId === schoolId) {
        matchedMouId = mou.id
        break
      }
    }
    if (!matchedMouId) {
      meta.crossValidationGaps.push({
        stage: `misba.${kind.toLowerCase()}`,
        row,
        school: schoolName,
        dcNumber,
        message: 'no matching MOU found in Pranav import',
      })
    }

    // Allocations: build from per-column quantities.
    const allocations = []
    for (let col = skuColStart; col <= skuColEnd; col++) {
      const qty = parseNumber(getCellValue(sheet, row, col))
      if (qty === null || qty === 0) continue
      const skuLabel = headers[col] || `col-${col}`
      const grade = kind === 'Cretile' ? extractCretileGrade(skuLabel) : 0
      const productName =
        kind === 'Cretile' ? `Cretile Grade-band kit ${skuLabel}` : skuLabel
      allocations.push({
        grade,
        students: kind === 'Cretile' ? qty : 0,
        kitsQty: qty,
        kitType: kind === 'Cretile' ? 'Consumable' : 'Reusable',
        productName,
      })

      // Inventory upsert
      const invId = inventoryItemId(productName, kind, grade)
      if (!registries.inventoryItems.has(invId)) {
        registries.inventoryItems.set(invId, {
          id: invId,
          skuName: productName,
          category: kind === 'TW' ? 'TinkRworks' : kind === 'Cretile' ? 'Cretile' : 'Hardware',
          cretileGrade: kind === 'Cretile' ? grade : null,
          mastersheetSourceName: null,
          currentStock: 0,
          reorderThreshold: null,
          notes: null,
          active: true,
          lastUpdatedAt: new Date().toISOString(),
          lastUpdatedBy: 'gate4.5-import',
          auditLog: [],
          importNotes: `source=misba.${kind.toLowerCase()}`,
        })
        meta.counts.inventoryItems.inserted += 1
      } else {
        meta.counts.inventoryItems.unchanged += 1
      }
    }

    if (allocations.length === 0) {
      meta.warnings.push({
        stage: `misba.${kind.toLowerCase()}`,
        row,
        school: schoolName,
        message: 'no SKU allocations parsed (row may be metadata only)',
      })
      continue
    }

    // KitDispatch upsert
    const dispatchId = matchedMouId
      ? `DISPATCH-${matchedMouId}-${slugify(dcNumber) || 'unknown-dc'}`
      : `DISPATCH-ORPHAN-${kind.toLowerCase()}-${slugify(schoolName).slice(0, 16)}-${slugify(dcNumber) || row}`
    const importNotes = [
      eway && `ewayBill=${eway}`,
      billing && `billing=${billing}`,
      studentsServed !== null && `studentsServed=${studentsServed}`,
      kitReturn && `kitReturn=${kitReturn}`,
      price !== null && `hardwarePrice=${price}`,
      `source=misba.${kind.toLowerCase()}`,
      `row=${row}`,
    ]
      .filter(Boolean)
      .join('; ')

    const kd = {
      id: dispatchId,
      mouId: matchedMouId ?? 'UNMAPPED',
      schoolId,
      schoolName,
      productSelected: productLine,
      dispatchStatus: 'Delivered',
      allocations,
      salesApprovalStatus: 'Approved',
      salesApprovedBy: salesPersonName ? `sp-${slugify(salesPersonName)}` : null,
      salesApprovedAt: dispatchedAt ?? null,
      salesRejectionReason: null,
      dispatchSummary: {
        dispatchedAt: dispatchedAt ? `${dispatchedAt}T00:00:00Z` : new Date().toISOString(),
        deliveryChallanNumber: dcNumber || null,
        actualDispatchedQty: allocations.reduce((s, a) => s + a.kitsQty, 0),
        executedBy: 'gate4.5-import',
      },
      shipmentTracking: null,
      pod: null,
      auditLog: [],
      createdAt: dispatchedAt ? `${dispatchedAt}T00:00:00Z` : new Date().toISOString(),
      importNotes,
    }

    if (registries.kitDispatches.has(dispatchId)) {
      meta.counts.kitDispatches.updated += 1
    } else {
      meta.counts.kitDispatches.inserted += 1
    }
    registries.kitDispatches.set(dispatchId, kd)
  }
}

function extractCretileGrade(label) {
  const m = String(label).match(/(\d{1,2})/)
  return m ? Number(m[1]) : 0
}

function inventoryItemId(productName, kind, grade) {
  if (kind === 'Cretile') return `INV-CRETILE-G${grade || 'x'}`
  if (kind === 'TW') return `INV-TW-${slugify(productName).toUpperCase()}`
  return `INV-HW-${slugify(productName).toUpperCase()}`
}

function crossValidatePratik(sheet, meta, registries) {
  // Pratik top table rows 3-23: column H is the DC number.
  const ref = sheet['!ref']
  if (!ref) return
  const range = xlsx.utils.decode_range(ref)
  const knownDcs = new Set()
  for (let row = 3; row <= Math.min(range.e.r + 1, 25); row++) {
    const dc = trim(getCellValue(sheet, row, 8))
    if (dc !== '') knownDcs.add(dc)
  }
  for (const kd of registries.kitDispatches.values()) {
    const dc = kd.dispatchSummary?.deliveryChallanNumber
    if (dc && !knownDcs.has(dc)) {
      meta.crossValidationGaps.push({
        stage: 'cross-validation',
        message: `DC ${dc} from Misba sheet not found in Pratik summary`,
        school: kd.schoolName,
      })
    }
  }
}

// ---------------------------------------------------------------------------
// Write outputs
// ---------------------------------------------------------------------------

function writeOutputs(meta, registries) {
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true })
  const writes = {
    'sales_team.json': Array.from(registries.salesTeam.values()),
    'schools.json': Array.from(registries.schools.values()),
    'school_groups.json': [],
    'mous.json': Array.from(registries.mous.values()),
    'payments.json': Array.from(registries.payments.values()),
    'installments.json': Array.from(registries.payments.values()),
    'kit_dispatches.json': Array.from(registries.kitDispatches.values()),
    'inventory_items.json': Array.from(registries.inventoryItems.values()),
    '_meta.json': meta,
  }
  for (const [name, contents] of Object.entries(writes)) {
    const path = join(OUT_DIR, name)
    if (!DRY_RUN) {
      writeFileSync(path, JSON.stringify(contents, null, 2), 'utf-8')
    }
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const meta = newMeta()
  const registries = {
    schools: new Map(),
    salesTeam: new Map(),
    mous: new Map(),
    payments: new Map(),
    kitDispatches: new Map(),
    inventoryItems: new Map(),
  }

  // Seed registries from existing canonical schools + sales_team so the
  // import respects pre-existing ids rather than always inserting new
  // records.
  if (existsSync(EXISTING_SCHOOLS_PATH)) {
    try {
      const existing = JSON.parse(readFileSync(EXISTING_SCHOOLS_PATH, 'utf-8'))
      for (const s of existing) registries.schools.set(s.id, s)
    } catch {
      meta.warnings.push({ stage: 'seed', message: 'failed to read existing schools.json' })
    }
  }
  if (existsSync(EXISTING_SALES_TEAM_PATH)) {
    try {
      const existing = JSON.parse(readFileSync(EXISTING_SALES_TEAM_PATH, 'utf-8'))
      for (const s of existing) registries.salesTeam.set(s.id, s)
    } catch {
      // ignore
    }
  }

  if (!MISBA_ONLY) importPranav(meta, registries)
  if (!PRANAV_ONLY) importMisba(meta, registries)

  writeOutputs(meta, registries)

  meta.runFinishedAt = new Date().toISOString()

  // Console summary
  console.log('Gate 4.5 import summary')
  console.log('=======================')
  console.log(`Mode: ${DRY_RUN ? 'DRY-RUN' : 'WRITE'}${STRICT ? ' (strict)' : ''}`)
  for (const [entity, counts] of Object.entries(meta.counts)) {
    console.log(
      `  ${entity.padEnd(18)} inserted=${counts.inserted}  updated=${counts.updated}  unchanged=${counts.unchanged}`,
    )
  }
  console.log(`Skipped rows:          ${meta.skipped.length}`)
  console.log(`Errors:                ${meta.errors.length}`)
  console.log(`Warnings:              ${meta.warnings.length}`)
  console.log(`Cross-validation gaps: ${meta.crossValidationGaps.length}`)
  console.log(`Chain MOU candidates:  ${meta.chainMouCandidates.length}`)
  console.log(`Auto-created sales reps: ${meta.autoCreatedSalesReps.length}`)
  console.log(`Auto-created schools:  ${meta.autoCreatedSchools.length}`)

  const exitCode = meta.errors.length > 0 || (STRICT && meta.warnings.length > 0) ? 1 : 0
  process.exit(exitCode)
}

// Guard: only run when invoked as the entry script. Tests import this
// module to exercise the helpers and must not trigger a full import.
const isEntryPoint = process.argv[1] && process.argv[1].endsWith('import-fy2627.mjs')
if (isEntryPoint) {
  main().catch((err) => {
    console.error('Import failed:', err)
    process.exit(2)
  })
}
