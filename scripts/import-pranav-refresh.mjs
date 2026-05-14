#!/usr/bin/env node
/*
 * Gate 5A.8 Step 2: Pranav refresh parser CLI.
 *
 * Thin wrapper around src/lib/imports/pranavRefresh.ts that reads the
 * 2026-05-13 refresh workbook, parses it, and writes parsed.json next
 * to the source file. Pure parse, no diff, no apply.
 *
 * Usage:
 *   node scripts/import-pranav-refresh.mjs
 *   node scripts/import-pranav-refresh.mjs --file <path> --out <path>
 *
 * Idempotent: re-running on the same file produces an identical
 * parsed.json (sorted by rowNum, deterministic field order).
 */

import { fileURLToPath } from 'node:url'
import { dirname, resolve, join } from 'node:path'
import { readFileSync, writeFileSync } from 'node:fs'
import xlsxPkg from 'xlsx'

const xlsx = xlsxPkg

const __filename = fileURLToPath(import.meta.url)
const REPO_ROOT = resolve(dirname(__filename), '..')

const argv = process.argv.slice(2)
function flag(name, fallback) {
  const idx = argv.indexOf(name)
  if (idx >= 0 && argv[idx + 1]) return argv[idx + 1]
  return fallback
}

const DEFAULT_FILE = join(
  REPO_ROOT,
  'import-data',
  '2026-05-pranav-refresh',
  'pranav-refresh-2026-05-13.xlsx',
)
const DEFAULT_OUT = join(
  REPO_ROOT,
  'import-data',
  '2026-05-pranav-refresh',
  'parsed.json',
)

const filePath = flag('--file', DEFAULT_FILE)
const outPath = flag('--out', DEFAULT_OUT)

// ----------------------------------------------------------------------------
// Inline parser. The .ts at src/lib/imports/pranavRefresh.ts is the source of
// truth; this .mjs is a parallel JS copy (same discipline as import-fy2627.mjs
// vs fy2627Helpers.ts). If you edit one, edit both; the .ts has a vitest
// suite that catches drift.
// ----------------------------------------------------------------------------

const COL = {
  srNo: 1, schoolName: 2, acquisitionStatus: 3, noOfSchools: 4,
  salesRep: 5, physicalCopy: 6, mouSigned: 7, kitsSent: 8,
  model: 9, duration: 10, city: 11, state: 12,
  studentsMou: 13, contractValue: 14, studentsActual: 15,
  spWithoutTax: 16, spWithTax: 17, salesAmount: 18,
  received: 19, tds: 20, balance: 21, pctReceived: 22,
}

const INSTALLMENT_BLOCKS = [
  { seq: 1, pct: 24, amount: 25, month: 26, paymentReceived: 27 },
  { seq: 2, pct: 28, amount: 29, month: 30, paymentReceived: 31 },
  { seq: 3, pct: 32, amount: 33, month: 34, paymentReceived: 35 },
  { seq: 4, pct: 36, amount: 37, month: 38, paymentReceived: 39 },
]

function cellLetters(col) {
  let s = ''
  let n = col
  while (n > 0) {
    const r = (n - 1) % 26
    s = String.fromCharCode(65 + r) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

function getValue(sheet, row, col) {
  const cell = sheet[cellLetters(col) + row]
  if (!cell) return undefined
  if (cell.t === 'e') return null
  return cell.v
}

function trim(v) {
  if (v === null || v === undefined) return ''
  return String(v).trim()
}

function slugify(input) {
  if (input === null || input === undefined) return ''
  return String(input)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
}

function parseNumber(value) {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'number' && Number.isFinite(value)) return value
  const s = String(value).replace(/[Rs|INR|,\s]/gi, '').trim()
  if (s === '' || s === '-') return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

function isYesLike(v) {
  if (v === null || v === undefined) return false
  return /^(y|yes|true|done)$/i.test(String(v).trim())
}

function parseTrainerModel(value) {
  if (value === null || value === undefined) return null
  const v = String(value).trim().toUpperCase()
  if (v === '' || v === '-') return null
  if (v === 'TT') return 'TT'
  if (v === 'TTT' || v === 'GSL-T' || v === 'GSL_T' || v === 'GSLT') return 'GSL-T'
  if (v === 'BOOTCAMP') return 'Bootcamp'
  if (v === 'AIQ') return 'AIQ'
  return null
}

const MONTHS = {
  jan: '01', january: '01', feb: '02', february: '02',
  mar: '03', march: '03', apr: '04', april: '04',
  may: '05', jun: '06', june: '06', jul: '07', july: '07',
  aug: '08', august: '08', sep: '09', sept: '09', september: '09',
  oct: '10', october: '10', nov: '11', november: '11',
  dec: '12', december: '12',
}

function parseDuration(value) {
  if (!value) return { start: '2026-04-01', end: '2027-03-31', fallback: true }
  const text = String(value).trim()
  const re = /(\d{1,2})(?:st|nd|rd|th)?\s+([a-zA-Z]+)\s+(\d{4})\s*(?:to|-)\s*(\d{1,2})(?:st|nd|rd|th)?\s+([a-zA-Z]+)\s+(\d{4})/i
  const m = text.match(re)
  if (!m) return { start: '2026-04-01', end: '2027-03-31', fallback: true }
  const sDay = m[1].padStart(2, '0')
  const sMon = MONTHS[m[2].toLowerCase()] ?? '04'
  const eDay = m[4].padStart(2, '0')
  const eMon = MONTHS[m[5].toLowerCase()] ?? '03'
  return {
    start: `${m[3]}-${sMon}-${sDay}`,
    end: `${m[6]}-${eMon}-${eDay}`,
    fallback: false,
  }
}

function parseMonthCell(value) {
  if (value === null || value === undefined || value === '') {
    return { iso: null, raw: null }
  }
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return { iso: null, raw: null }
    return { iso: value.toISOString().slice(0, 10), raw: value.toISOString() }
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    const parsed = xlsx.SSF.parse_date_code(value)
    if (parsed) {
      const yr = String(parsed.y).padStart(4, '0')
      const mo = String(parsed.m).padStart(2, '0')
      const dy = String(parsed.d).padStart(2, '0')
      const iso = `${yr}-${mo}-${dy}`
      return { iso, raw: iso }
    }
    return { iso: null, raw: String(value) }
  }
  const raw = String(value).trim()
  if (raw === '') return { iso: null, raw: null }
  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (isoMatch) return { iso: `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`, raw }
  const short = raw.match(/^([A-Za-z]{3,9})-(\d{2})$/)
  if (short) {
    const m = MONTHS[short[1].slice(0, 3).toLowerCase()]
    if (m) return { iso: `20${short[2]}-${m}-01`, raw }
  }
  return { iso: null, raw }
}

function detectIsReceived(value) {
  if (value === null || value === undefined) return false
  if (value instanceof Date) return true
  if (typeof value === 'number' && value > 0) return true
  const s = String(value).trim()
  if (s === '') return false
  if (/^(y|yes|received|done|paid|true)$/i.test(s)) return true
  return false
}

function productLineKey(trainerModel, studentsMou, contractValue) {
  return [trainerModel ?? 'unknown', studentsMou ?? 'x', contractValue ?? 'x'].join('|')
}

function parsePranavRefresh(workbook, sheetName) {
  const targetName =
    sheetName ?? workbook.SheetNames.find((n) => n.trim() === '2026-27PD') ?? workbook.SheetNames[0]
  const sheet = workbook.Sheets[targetName]
  if (!sheet) throw new Error(`Sheet not found: ${targetName}`)

  const dataStartRow = 7
  const ref = sheet['!ref']
  const range = ref ? xlsx.utils.decode_range(ref) : null
  const dataEndRow = range ? range.e.r + 1 : dataStartRow

  const result = {
    rows: [],
    warnings: [],
    errors: [],
    skipped: [],
    summary: {
      totalRowsScanned: 0, parsed: 0, needsReview: 0,
      continuationRows: 0, multiProductSchools: [],
    },
    sourceMeta: {
      sheetName: targetName, headerRow: 6,
      dataStartRow, dataEndRow,
    },
  }

  let lastSchoolName = ''
  const seenBySchool = new Map()

  for (let r = dataStartRow; r <= dataEndRow; r++) {
    result.summary.totalRowsScanned += 1
    const srNoRaw = getValue(sheet, r, COL.srNo)
    const schoolName = trim(getValue(sheet, r, COL.schoolName))
    if (schoolName === '') {
      let hasAny = false
      for (let c = 1; c <= 40; c++) {
        const v = getValue(sheet, r, c)
        if (v !== undefined && v !== null && trim(v) !== '') {
          hasAny = true
          break
        }
      }
      result.skipped.push({ row: r, reason: hasAny ? 'school name blank but row has values' : 'empty row' })
      continue
    }

    const isContinuationRow =
      (srNoRaw === null || srNoRaw === undefined || trim(srNoRaw) === '') &&
      trim(lastSchoolName).toLowerCase() === schoolName.toLowerCase()

    const rowWarnings = []
    let needsReview = false

    const acquisitionStatus = trim(getValue(sheet, r, COL.acquisitionStatus)) || null
    const salesRepName = trim(getValue(sheet, r, COL.salesRep)) || null
    const physicalCopyScanned = isYesLike(getValue(sheet, r, COL.physicalCopy))
    const mouSigned = isYesLike(getValue(sheet, r, COL.mouSigned))
    const kitsSent = trim(getValue(sheet, r, COL.kitsSent)) || null
    const modelRaw = trim(getValue(sheet, r, COL.model)) || null
    const trainerModel = parseTrainerModel(modelRaw)
    if (modelRaw && trainerModel === null) {
      rowWarnings.push(`trainer model out of enum: ${modelRaw}`)
      needsReview = true
    }
    const duration = parseDuration(getValue(sheet, r, COL.duration))
    if (duration.fallback) rowWarnings.push('duration unparseable, using FY default 2026-04-01..2027-03-31')

    const city = trim(getValue(sheet, r, COL.city)) || null
    const state = trim(getValue(sheet, r, COL.state)) || null
    const studentsMou = parseNumber(getValue(sheet, r, COL.studentsMou))
    const contractValue = parseNumber(getValue(sheet, r, COL.contractValue))
    const studentsActual = parseNumber(getValue(sheet, r, COL.studentsActual))
    const spWithoutTax = parseNumber(getValue(sheet, r, COL.spWithoutTax))
    const spWithTax = parseNumber(getValue(sheet, r, COL.spWithTax))
    const received = parseNumber(getValue(sheet, r, COL.received))
    const tds = parseNumber(getValue(sheet, r, COL.tds))

    if (contractValue === null) {
      rowWarnings.push('contract value blank or unparseable')
      needsReview = true
    }
    if (contractValue !== null && contractValue === 0 && (kitsSent || (received ?? 0) > 0)) {
      rowWarnings.push('sale amount is 0 but kits-sent or received present, flag for review')
      needsReview = true
    }

    const installments = []
    for (const blk of INSTALLMENT_BLOCKS) {
      const pct = parseNumber(getValue(sheet, r, blk.pct))
      const amount = parseNumber(getValue(sheet, r, blk.amount))
      const monthVal = getValue(sheet, r, blk.month)
      const prVal = getValue(sheet, r, blk.paymentReceived)
      const allBlank =
        pct === null && amount === null &&
        (monthVal === null || monthVal === undefined || trim(monthVal) === '') &&
        (prVal === null || prVal === undefined || trim(prVal) === '')
      if (allBlank) continue
      const monthParsed = parseMonthCell(monthVal)
      if (monthVal && !monthParsed.iso) {
        rowWarnings.push(`installment ${blk.seq} month not ISO-parseable: ${JSON.stringify(monthParsed.raw)}`)
        needsReview = true
      }
      const prTrim = prVal === null || prVal === undefined ? null : (trim(prVal) || null)
      installments.push({
        seq: blk.seq,
        pct, amount,
        monthRaw: monthParsed.raw,
        monthIso: monthParsed.iso,
        paymentReceivedRaw: prTrim,
        isReceived: detectIsReceived(prVal),
      })
    }

    const pctSum = installments.reduce((s, i) => s + (i.pct ?? 0), 0)
    if (pctSum > 0 && Math.abs(pctSum - 1) > 0.01) {
      rowWarnings.push(`installment % sum ${pctSum.toFixed(3)} != 1.0`)
    }

    const slug = slugify(schoolName)
    const plk = productLineKey(trainerModel, studentsMou, contractValue)

    const parsed = {
      rowNum: r,
      srNo: srNoRaw === null || srNoRaw === undefined ? null : parseNumber(srNoRaw),
      schoolName, schoolSlug: slug,
      acquisitionStatus, salesRepName,
      physicalCopyScanned, mouSigned, kitsSent,
      modelRaw, trainerModel, duration,
      city, state, studentsMou, contractValue, studentsActual,
      spWithoutTax, spWithTax, received, tds,
      installments,
      needsReview, isContinuationRow,
      productLineKey: plk,
      rowWarnings,
    }
    result.rows.push(parsed)
    if (isContinuationRow) result.summary.continuationRows += 1
    if (needsReview) result.summary.needsReview += 1
    for (const w of rowWarnings) result.warnings.push({ row: r, message: w })
    if (!seenBySchool.has(slug)) seenBySchool.set(slug, [])
    seenBySchool.get(slug).push(r)
    lastSchoolName = schoolName
  }

  for (const [slug, rowNums] of seenBySchool) {
    if (rowNums.length > 1) {
      const name = result.rows.find((row) => row.schoolSlug === slug)?.schoolName ?? slug
      result.summary.multiProductSchools.push({ name, rowNums })
    }
  }

  result.summary.parsed = result.rows.length
  return result
}

// ----------------------------------------------------------------------------
// CLI
// ----------------------------------------------------------------------------

const wb = xlsx.readFile(filePath, { cellDates: true })
const result = parsePranavRefresh(wb)

const meta = {
  parsedAt: new Date().toISOString(),
  source: filePath.replace(REPO_ROOT.replace(/\\/g, '/'), '').replace(/\\/g, '/'),
  ...result,
}

writeFileSync(outPath, JSON.stringify(meta, null, 2) + '\n', 'utf-8')

console.log(`Parsed ${result.summary.parsed} rows from ${result.sourceMeta.sheetName}`)
console.log(`  needsReview     : ${result.summary.needsReview}`)
console.log(`  continuationRows: ${result.summary.continuationRows}`)
console.log(`  multi-product   : ${result.summary.multiProductSchools.length}`)
console.log(`  warnings        : ${result.warnings.length}`)
console.log(`  errors          : ${result.errors.length}`)
console.log(`  skipped         : ${result.skipped.length}`)
console.log(`Output written to ${outPath}`)
