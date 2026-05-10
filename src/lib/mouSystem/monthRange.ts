/*
 * Month range helpers for the MOU draft form.
 *
 * Round 3 Step 9: payment schedule month inputs are now dropdowns
 * computed from the MOU's start/end dates so users can only pick
 * months that fall inside the contract duration. Months are stored
 * as canonical 'YYYY-MM'.
 */

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

export function monthsInRange(startIso: string, endIso: string): string[] {
  if (!startIso || !endIso) return []
  const s = new Date(startIso)
  const e = new Date(endIso)
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return []
  if (e <= s) return []
  const out: string[] = []
  const cur = new Date(s.getFullYear(), s.getMonth(), 1)
  const stop = new Date(e.getFullYear(), e.getMonth(), 1)
  while (cur <= stop) {
    out.push(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}`)
    cur.setMonth(cur.getMonth() + 1)
  }
  return out
}

export function monthsForYear(startIso: string, year: number, endIso: string): string[] {
  const all = monthsInRange(startIso, endIso)
  if (all.length === 0) return []
  const sliceStart = (year - 1) * 12
  return all.slice(sliceStart, sliceStart + 12)
}

export function formatMonthLabel(yyyymm: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(yyyymm)
  if (!m) return yyyymm
  const idx = parseInt(m[2]!, 10) - 1
  return `${MONTH_NAMES[idx] ?? yyyymm} ${m[1]}`
}
