/*
 * Gate 4.5 Excel-import helpers (pure functions).
 *
 * Imported by scripts/import-fy2627.mjs at run-time AND by the vitest
 * test suite. Keeping the helpers in src/lib/ lets vitest discover the
 * test file without scanning scripts/ (which the existing config does
 * not include) and lets the import script stay small and procedural.
 */

export function slugify(input: unknown): string {
  if (input === null || input === undefined) return ''
  return String(input)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
}

export function parseNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'number' && Number.isFinite(value)) return value
  const s = String(value).replace(/[Rs|INR|,\s]/gi, '').trim()
  if (s === '' || s === '-') return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

export function isYes(value: unknown): boolean {
  if (value === null || value === undefined) return false
  return /^(y|yes|true)$/i.test(String(value).trim())
}

// Gate 4.7 Step 6b: 'AIQ' is a real GSL trainer model added to the
// enum after the Pranav FY26-27 import flagged it (locked by Anish).
export type TrainerModelToken = 'TT' | 'GSL-T' | 'Bootcamp' | 'AIQ' | null

export function parseTrainerModel(value: unknown): TrainerModelToken {
  if (value === null || value === undefined) return null
  const v = String(value).trim().toUpperCase()
  if (v === '' || v === '-') return null
  if (v === 'TT') return 'TT'
  if (v === 'TTT' || v === 'GSL-T' || v === 'GSL_T' || v === 'GSLT') return 'GSL-T'
  if (v === 'BOOTCAMP') return 'Bootcamp'
  if (v === 'AIQ') return 'AIQ'
  return null
}

export interface DurationResult {
  start: string
  end: string
  fallback: boolean
}

const MONTHS: Record<string, string> = {
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

export function parseDuration(value: unknown): DurationResult {
  if (!value) return { start: '2026-04-01', end: '2027-03-31', fallback: true }
  const text = String(value).trim()
  const re = /(\d{1,2})(?:st|nd|rd|th)?\s+([a-zA-Z]+)\s+(\d{4})\s*(?:to|-)\s*(\d{1,2})(?:st|nd|rd|th)?\s+([a-zA-Z]+)\s+(\d{4})/i
  const m = text.match(re)
  if (!m) return { start: '2026-04-01', end: '2027-03-31', fallback: true }
  const sDay = m[1]!.padStart(2, '0')
  const sMon = MONTHS[m[2]!.toLowerCase()] ?? '04'
  const sYr = m[3]!
  const eDay = m[4]!.padStart(2, '0')
  const eMon = MONTHS[m[5]!.toLowerCase()] ?? '03'
  const eYr = m[6]!
  return {
    start: `${sYr}-${sMon}-${sDay}`,
    end: `${eYr}-${eMon}-${eDay}`,
    fallback: false,
  }
}

export function parseDateCell(value: unknown): string | null {
  if (!value) return null
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10)
  }
  // xlsx returns dates as JS Date instances when cellDates is set.
  // Free-text fallback: pull an ISO prefix if present.
  const s = String(value).trim()
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null
}

export function extractCretileGrade(label: unknown): number {
  const m = String(label).match(/(\d{1,2})/)
  return m ? Number(m[1]) : 0
}

export function inventoryItemId(
  productName: string,
  kind: 'TW' | 'Cretile' | 'Hardware',
  grade: number,
): string {
  if (kind === 'Cretile') return `INV-CRETILE-G${grade || 'x'}`
  if (kind === 'TW') return `INV-TW-${slugify(productName).toUpperCase()}`
  return `INV-HW-${slugify(productName).toUpperCase()}`
}
