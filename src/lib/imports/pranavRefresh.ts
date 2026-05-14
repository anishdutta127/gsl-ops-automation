/*
 * Gate 5A.8: Pranav refresh importer (parser + validator).
 *
 * Parses the FY26-27 STEAM sheet from a Pranav refresh Excel workbook
 * and produces a structured ParseResult. The output is consumed by the
 * diff step (compares against live src/data/*.json) and the admin apply
 * step (writes through the audit-logged update path).
 *
 * Schema audit and column-shift rationale: docs/gate-5a.8/PRANAV_IMPORT_AUDIT.md
 *
 * The parser is pure: it accepts an xlsx Sheet object so tests can build
 * sheets with xlsx.utils.aoa_to_sheet without touching the filesystem.
 * The thin CLI in scripts/import-pranav-refresh.mjs handles file IO.
 */

import xlsx from 'xlsx'
import {
  parseDuration,
  parseNumber,
  parseTrainerModel,
  slugify,
  type TrainerModelToken,
} from './fy2627Helpers'

export interface ParsedInstallment {
  seq: number
  pct: number | null
  amount: number | null
  monthRaw: string | null
  monthIso: string | null
  paymentReceivedRaw: string | null
  isReceived: boolean
}

export interface ParsedRow {
  rowNum: number
  srNo: number | null
  schoolName: string
  schoolSlug: string
  acquisitionStatus: string | null
  salesRepName: string | null
  physicalCopyScanned: boolean
  mouSigned: boolean
  kitsSent: string | null
  modelRaw: string | null
  trainerModel: TrainerModelToken
  duration: { start: string; end: string; fallback: boolean }
  city: string | null
  state: string | null
  studentsMou: number | null
  contractValue: number | null
  studentsActual: number | null
  spWithoutTax: number | null
  spWithTax: number | null
  received: number | null
  tds: number | null
  installments: ParsedInstallment[]
  needsReview: boolean
  isContinuationRow: boolean
  productLineKey: string
  rowWarnings: string[]
}

export interface ParseWarning {
  row: number
  message: string
}

export interface ParseError {
  row: number
  message: string
}

export interface ParseSkip {
  row: number
  reason: string
}

export interface ParseResult {
  rows: ParsedRow[]
  warnings: ParseWarning[]
  errors: ParseError[]
  skipped: ParseSkip[]
  summary: {
    totalRowsScanned: number
    parsed: number
    needsReview: number
    continuationRows: number
    multiProductSchools: { name: string; rowNums: number[] }[]
  }
  sourceMeta: {
    sheetName: string
    headerRow: number
    dataStartRow: number
    dataEndRow: number
  }
}

export interface ParseOpts {
  sheetName?: string
  dataStartRow?: number
}

const DEFAULT_DATA_START_ROW = 7

const COL = {
  srNo: 1,
  schoolName: 2,
  acquisitionStatus: 3,
  noOfSchools: 4,
  salesRep: 5,
  physicalCopy: 6,
  mouSigned: 7,
  kitsSent: 8,
  model: 9,
  duration: 10,
  city: 11,
  state: 12,
  studentsMou: 13,
  contractValue: 14,
  studentsActual: 15,
  spWithoutTax: 16,
  spWithTax: 17,
  salesAmount: 18,
  received: 19,
  tds: 20,
  balance: 21,
  pctReceived: 22,
} as const

const INSTALLMENT_BLOCKS = [
  { seq: 1, pct: 24, amount: 25, month: 26, paymentReceived: 27 },
  { seq: 2, pct: 28, amount: 29, month: 30, paymentReceived: 31 },
  { seq: 3, pct: 32, amount: 33, month: 34, paymentReceived: 35 },
  { seq: 4, pct: 36, amount: 37, month: 38, paymentReceived: 39 },
] as const

function cellLetters(col: number): string {
  let s = ''
  let n = col
  while (n > 0) {
    const r = (n - 1) % 26
    s = String.fromCharCode(65 + r) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

function rawCell(
  sheet: xlsx.WorkSheet,
  row: number,
  col: number,
): xlsx.CellObject | undefined {
  const addr = cellLetters(col) + row
  return sheet[addr] as xlsx.CellObject | undefined
}

function getValue(sheet: xlsx.WorkSheet, row: number, col: number): unknown {
  const cell = rawCell(sheet, row, col)
  if (!cell) return undefined
  // Excel error cells: xlsx encodes them with t==='e' and v as the error
  // code (7=#DIV/0!, 42=#N/A, etc.). We treat all error cells as null
  // upstream and let the parser tag the row as needs-review when it
  // matters (currently it does not, since # errors all live in derived
  // columns we ignore).
  if (cell.t === 'e') return null
  return cell.v
}

function trim(v: unknown): string {
  if (v === null || v === undefined) return ''
  return String(v).trim()
}

function isYesLike(v: unknown): boolean {
  if (v === null || v === undefined) return false
  return /^(y|yes|true|done)$/i.test(String(v).trim())
}

function parseMonthCell(value: unknown): { iso: string | null; raw: string | null } {
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
  if (isoMatch) {
    return { iso: `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`, raw }
  }
  const shortMonth = raw.match(/^([A-Za-z]{3,9})-(\d{2})$/)
  if (shortMonth) {
    const months: Record<string, string> = {
      jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
      jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
    }
    const m = months[shortMonth[1]!.slice(0, 3).toLowerCase()]
    if (m) {
      const yr = `20${shortMonth[2]!}`
      return { iso: `${yr}-${m}-01`, raw }
    }
  }
  return { iso: null, raw }
}

function detectIsReceived(value: unknown): boolean {
  if (value === null || value === undefined) return false
  if (value instanceof Date) return true
  if (typeof value === 'number' && value > 0) return true
  const s = String(value).trim()
  if (s === '') return false
  if (/^(y|yes|received|done|paid|true)$/i.test(s)) return true
  return false
}

function productLineKey(
  trainerModel: TrainerModelToken,
  studentsMou: number | null,
  contractValue: number | null,
): string {
  return [
    trainerModel ?? 'unknown',
    studentsMou ?? 'x',
    contractValue ?? 'x',
  ].join('|')
}

export function parsePranavRefresh(
  workbook: xlsx.WorkBook,
  opts: ParseOpts = {},
): ParseResult {
  const sheetName =
    opts.sheetName ??
    workbook.SheetNames.find((n) => n.trim() === '2026-27PD') ??
    workbook.SheetNames[0]!
  const sheet = workbook.Sheets[sheetName]
  if (!sheet) {
    throw new Error(`Sheet not found: ${sheetName}`)
  }

  const dataStartRow = opts.dataStartRow ?? DEFAULT_DATA_START_ROW
  const ref = sheet['!ref']
  const range = ref ? xlsx.utils.decode_range(ref) : null
  const dataEndRow = range ? range.e.r + 1 : dataStartRow

  const result: ParseResult = {
    rows: [],
    warnings: [],
    errors: [],
    skipped: [],
    summary: {
      totalRowsScanned: 0,
      parsed: 0,
      needsReview: 0,
      continuationRows: 0,
      multiProductSchools: [],
    },
    sourceMeta: {
      sheetName,
      headerRow: dataStartRow - 1,
      dataStartRow,
      dataEndRow,
    },
  }

  let lastSchoolName = ''
  const seenBySchool = new Map<string, number[]>()

  for (let r = dataStartRow; r <= dataEndRow; r++) {
    result.summary.totalRowsScanned += 1

    const srNoRaw = getValue(sheet, r, COL.srNo)
    const schoolNameRaw = getValue(sheet, r, COL.schoolName)
    const schoolName = trim(schoolNameRaw)

    if (schoolName === '') {
      const hasAnyValue = Array.from({ length: 40 }, (_, i) => i + 1).some(
        (c) => getValue(sheet, r, c) !== undefined && getValue(sheet, r, c) !== null && trim(getValue(sheet, r, c)) !== '',
      )
      if (hasAnyValue) {
        result.skipped.push({ row: r, reason: 'school name blank but row has values' })
      } else {
        result.skipped.push({ row: r, reason: 'empty row' })
      }
      continue
    }

    const isContinuationRow =
      (srNoRaw === null || srNoRaw === undefined || trim(srNoRaw) === '') &&
      trim(lastSchoolName).toLowerCase() === schoolName.toLowerCase()

    const rowWarnings: string[] = []
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
    if (duration.fallback) {
      rowWarnings.push('duration unparseable, using FY default 2026-04-01..2027-03-31')
    }

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

    const installments: ParsedInstallment[] = []
    for (const blk of INSTALLMENT_BLOCKS) {
      const pct = parseNumber(getValue(sheet, r, blk.pct))
      const amount = parseNumber(getValue(sheet, r, blk.amount))
      const monthValue = getValue(sheet, r, blk.month)
      const paymentReceivedValue = getValue(sheet, r, blk.paymentReceived)

      const allBlank =
        pct === null &&
        amount === null &&
        (monthValue === null || monthValue === undefined || trim(monthValue) === '') &&
        (paymentReceivedValue === null ||
          paymentReceivedValue === undefined ||
          trim(paymentReceivedValue) === '')
      if (allBlank) continue

      const monthParsed = parseMonthCell(monthValue)
      if (monthValue && !monthParsed.iso) {
        rowWarnings.push(`installment ${blk.seq} month not ISO-parseable: ${JSON.stringify(monthParsed.raw)}`)
        needsReview = true
      }

      const paymentReceivedTrimmed =
        paymentReceivedValue === null || paymentReceivedValue === undefined
          ? null
          : trim(paymentReceivedValue) || null

      installments.push({
        seq: blk.seq,
        pct,
        amount,
        monthRaw: monthParsed.raw,
        monthIso: monthParsed.iso,
        paymentReceivedRaw: paymentReceivedTrimmed,
        isReceived: detectIsReceived(paymentReceivedValue),
      })
    }

    const pctSum = installments.reduce((s, i) => s + (i.pct ?? 0), 0)
    if (pctSum > 0 && Math.abs(pctSum - 1) > 0.01) {
      rowWarnings.push(`installment % sum ${pctSum.toFixed(3)} != 1.0`)
    }

    const slug = slugify(schoolName)
    const plk = productLineKey(trainerModel, studentsMou, contractValue)

    const parsedRow: ParsedRow = {
      rowNum: r,
      srNo:
        srNoRaw === null || srNoRaw === undefined
          ? null
          : parseNumber(srNoRaw),
      schoolName,
      schoolSlug: slug,
      acquisitionStatus,
      salesRepName,
      physicalCopyScanned,
      mouSigned,
      kitsSent,
      modelRaw,
      trainerModel,
      duration,
      city,
      state,
      studentsMou,
      contractValue,
      studentsActual,
      spWithoutTax,
      spWithTax,
      received,
      tds,
      installments,
      needsReview,
      isContinuationRow,
      productLineKey: plk,
      rowWarnings,
    }

    result.rows.push(parsedRow)
    if (isContinuationRow) result.summary.continuationRows += 1
    if (needsReview) result.summary.needsReview += 1
    for (const w of rowWarnings) {
      result.warnings.push({ row: r, message: w })
    }

    const slugKey = slug
    if (!seenBySchool.has(slugKey)) seenBySchool.set(slugKey, [])
    seenBySchool.get(slugKey)!.push(r)

    lastSchoolName = schoolName
  }

  for (const [slug, rowNums] of Array.from(seenBySchool.entries())) {
    if (rowNums.length > 1) {
      const name = result.rows.find((row) => row.schoolSlug === slug)?.schoolName ?? slug
      result.summary.multiProductSchools.push({ name, rowNums })
    }
  }

  result.summary.parsed = result.rows.length
  return result
}

export function parsePranavRefreshFromFile(
  filePath: string,
  opts: ParseOpts = {},
): ParseResult {
  const wb = xlsx.readFile(filePath, { cellDates: true })
  return parsePranavRefresh(wb, opts)
}
