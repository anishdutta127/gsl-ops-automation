/*
 * Generic dimension-filter parsing for /mous, /schools,
 * /escalations list pages.
 *
 * Each list page declares its known filter dimensions (string keys
 * matching query-param names). parseDimensions reads the search
 * params and returns a stable Record<key, string[]> shape. Empty
 * arrays for dimensions not present.
 *
 * applyDimensionFilters applies a Record<key, string[]> against an
 * arbitrary row type via a Record<key, selector> map. AND across
 * dimensions; OR within a single dimension's value list.
 *
 * Search-param parsing is intentionally permissive: comma-separated
 * values; values are trimmed; empty values dropped.
 */

export function parseDimensions(
  searchParams: Record<string, string | string[] | undefined>,
  dimensionKeys: string[],
): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  for (const key of dimensionKeys) {
    const raw = searchParams[key]
    const value = Array.isArray(raw) ? raw.join(',') : raw
    out[key] = typeof value === 'string'
      ? value.split(',').map((s) => s.trim()).filter((s) => s.length > 0)
      : []
  }
  return out
}

export function applyDimensionFilters<T>(
  rows: T[],
  active: Record<string, string[]>,
  selectors: Record<string, (row: T) => string | string[] | null>,
): T[] {
  return rows.filter((row) => {
    for (const key of Object.keys(active)) {
      const selected = active[key] ?? []
      if (selected.length === 0) continue
      const sel = selectors[key]
      if (!sel) continue
      const rowValue = sel(row)
      if (rowValue === null) return false
      if (Array.isArray(rowValue)) {
        // OR within: any of rowValue is in selected
        if (!rowValue.some((v) => selected.includes(v))) return false
      } else {
        if (!selected.includes(rowValue)) return false
      }
    }
    return true
  })
}

export function applyTextSearch<T>(
  rows: T[],
  query: string | undefined,
  fields: (row: T) => string[],
): T[] {
  if (!query) return rows
  const q = query.trim().toLowerCase()
  if (q === '') return rows
  return rows.filter((row) =>
    fields(row).some((f) => typeof f === 'string' && f.toLowerCase().includes(q)),
  )
}
