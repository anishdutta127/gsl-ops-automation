/*
 * CSV parser + fuzzy school matcher for /finance/payments/bulk.
 *
 * Zero external dependencies; the parser handles quoted fields with
 * embedded commas + escaped quotes + BOM. Date accepts DD/MM/YYYY and
 * YYYY-MM-DD; both normalise to ISO. Currency accepts '12,000',
 * '12000', '12000.50', 'Rs 12,000'.
 *
 * Fuzzy match: exact name first (case-insensitive trim); else best-
 * match by token overlap. Returns confidence label: 'exact' | 'high' |
 * 'none'.
 */

export interface ParsedRow {
  rowIndex: number              // 0-based index of the data row (excluding header)
  bankRef: string
  amount: number | null
  amountRaw: string
  dateIso: string | null
  dateRaw: string
  bankName: string
  schoolHint: string
  notes: string
  errors: string[]
}

export interface BulkParseResult {
  rows: ParsedRow[]
  headerErrors: string[]
}

const REQUIRED_HEADERS = [
  'bank_ref',
  'amount',
  'date',
  'bank_name',
  'school_hint',
  'notes',
] as const

export function parseBulkCsv(text: string): BulkParseResult {
  // Strip UTF-8 BOM if present.
  const stripped = text.replace(/^﻿/, '')
  const records = splitCsv(stripped)
  if (records.length === 0) {
    return { rows: [], headerErrors: ['CSV is empty.'] }
  }
  const header = records[0]!.map((c) => c.trim().toLowerCase())
  const headerErrors: string[] = []
  for (const required of REQUIRED_HEADERS) {
    if (!header.includes(required)) {
      headerErrors.push(`Missing column: ${required}`)
    }
  }
  if (headerErrors.length > 0) {
    return { rows: [], headerErrors }
  }
  const colIndex = (name: typeof REQUIRED_HEADERS[number]): number =>
    header.indexOf(name)

  const rows: ParsedRow[] = []
  for (let i = 1; i < records.length; i++) {
    const r = records[i]!
    // Skip wholly-empty rows (trailing newline).
    if (r.every((c) => c.trim() === '')) continue

    const bankRef = (r[colIndex('bank_ref')] ?? '').trim()
    const amountRaw = (r[colIndex('amount')] ?? '').trim()
    const dateRaw = (r[colIndex('date')] ?? '').trim()
    const bankName = (r[colIndex('bank_name')] ?? '').trim()
    const schoolHint = (r[colIndex('school_hint')] ?? '').trim()
    const notes = (r[colIndex('notes')] ?? '').trim()

    const errors: string[] = []
    const amount = parseAmount(amountRaw)
    if (amount === null || amount <= 0) errors.push('Amount must be a positive number')
    const dateIso = parseDate(dateRaw)
    if (dateIso === null) errors.push('Date must be DD/MM/YYYY or YYYY-MM-DD')
    if (!bankRef) errors.push('Bank reference required')

    rows.push({
      rowIndex: i - 1,
      bankRef,
      amount,
      amountRaw,
      dateIso,
      dateRaw,
      bankName,
      schoolHint,
      notes,
      errors,
    })
  }

  return { rows, headerErrors: [] }
}

/**
 * Minimal RFC-4180-ish CSV splitter that handles quoted fields with
 * embedded commas, escaped quotes (""), CRLF / LF line endings.
 */
export function splitCsv(text: string): string[][] {
  const records: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  let i = 0
  while (i < text.length) {
    const ch = text[i]!
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i += 2
          continue
        }
        inQuotes = false
        i += 1
        continue
      }
      field += ch
      i += 1
      continue
    }
    if (ch === '"') {
      inQuotes = true
      i += 1
      continue
    }
    if (ch === ',') {
      row.push(field)
      field = ''
      i += 1
      continue
    }
    if (ch === '\n' || ch === '\r') {
      row.push(field)
      records.push(row)
      row = []
      field = ''
      // Skip CRLF as one separator.
      if (ch === '\r' && text[i + 1] === '\n') i += 2
      else i += 1
      continue
    }
    field += ch
    i += 1
  }
  // Push trailing field + row.
  if (field.length > 0 || row.length > 0) {
    row.push(field)
    records.push(row)
  }
  return records
}

export function parseAmount(raw: string): number | null {
  if (!raw) return null
  // Strip 'Rs', currency commas, whitespace.
  const cleaned = raw
    .replace(/rs\s*/i, '')
    .replace(/[,\s]/g, '')
    .replace(/[^0-9.\-]/g, '')
  if (cleaned === '') return null
  const n = Number(cleaned)
  if (!Number.isFinite(n)) return null
  // Round to 2dp to avoid floating-point noise.
  return Math.round(n * 100) / 100
}

export function parseDate(raw: string): string | null {
  if (!raw) return null
  const trimmed = raw.trim()
  // ISO yyyy-mm-dd
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const [y, m, d] = trimmed.split('-').map(Number) as [number, number, number]
    if (!isValidYmd(y, m, d)) return null
    return trimmed
  }
  // DD/MM/YYYY or D/M/YYYY (with -, /, or . separators).
  const match = trimmed.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/)
  if (match) {
    const d = Number(match[1])
    const m = Number(match[2])
    const y = Number(match[3])
    if (!isValidYmd(y, m, d)) return null
    return `${y.toString().padStart(4, '0')}-${m.toString().padStart(2, '0')}-${d.toString().padStart(2, '0')}`
  }
  return null
}

function isValidYmd(y: number, m: number, d: number): boolean {
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return false
  if (m < 1 || m > 12) return false
  if (d < 1 || d > 31) return false
  // Coarse month-length check.
  const monthDays = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  return d <= monthDays[m - 1]!
}

/**
 * Token-overlap similarity between two strings, on a 0..1 scale.
 * Tokenises by non-word boundary, lowercases. Symmetric:
 * |intersection| / |union|.
 */
export function tokenOverlap(a: string, b: string): number {
  const toks = (s: string) =>
    new Set(
      s
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((t) => t.length > 1),
    )
  const A = toks(a)
  const B = toks(b)
  if (A.size === 0 || B.size === 0) return 0
  let intersect = 0
  Array.from(A).forEach((t) => {
    if (B.has(t)) intersect += 1
  })
  const union = A.size + B.size - intersect
  return union === 0 ? 0 : intersect / union
}

export type MatchConfidence = 'exact' | 'high' | 'none'

export interface SchoolMatchCandidate {
  schoolId: string
  schoolName: string
  confidence: MatchConfidence
  score: number
}

export function matchSchool(
  hint: string,
  schools: { id: string; name: string }[],
): SchoolMatchCandidate | null {
  if (!hint.trim()) return null
  const lc = hint.trim().toLowerCase()
  const exact = schools.find((s) => s.name.trim().toLowerCase() === lc)
  if (exact) {
    return {
      schoolId: exact.id,
      schoolName: exact.name,
      confidence: 'exact',
      score: 1,
    }
  }
  let best: SchoolMatchCandidate | null = null
  for (const s of schools) {
    const score = tokenOverlap(hint, s.name)
    if (best === null || score > best.score) {
      best = {
        schoolId: s.id,
        schoolName: s.name,
        confidence: score >= 0.7 ? 'high' : 'none',
        score,
      }
    }
  }
  if (best && best.score < 0.4) return null
  return best
}
