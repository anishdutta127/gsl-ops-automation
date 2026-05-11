/*
 * CSV cell helpers (Gate 5A Step 1).
 *
 * RFC 4180-ish escaping: wrap in double quotes when the cell contains
 * a comma, double quote, CR, or LF; escape embedded quotes by doubling.
 * Null renders as the empty string.
 */

export function csvCell(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return ''
  const s = typeof v === 'number' ? String(v) : v
  if (s === '') return ''
  const needsQuoting = /[",\r\n]/.test(s)
  if (!needsQuoting) return s
  return '"' + s.replace(/"/g, '""') + '"'
}

export function csvRow(cells: Array<string | number | null | undefined>): string {
  return cells.map((c) => csvCell(c)).join(',')
}

export function buildCsv(header: string[], rows: Array<Array<string | number | null>>): string {
  const lines: string[] = [csvRow(header)]
  for (const r of rows) lines.push(csvRow(r))
  return lines.join('\n')
}
