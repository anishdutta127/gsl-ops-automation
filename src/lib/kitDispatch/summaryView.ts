/*
 * Gate 3 Step 9: Final Dispatch Summary derivation.
 *
 * Read-only flattened view across every KitDispatch record. Used by
 * /dispatch/kits/summary (list view) and the CSV export route.
 */

import type { KitDispatch, MOU, School } from '@/lib/types'

export interface SummaryRow {
  dispatchId: string
  schoolName: string
  mouId: string
  productSelected: 'TinkRworks' | 'Cretile' | 'Both'
  totalDispatchedQty: number
  dispatchStatus: string
  podPath: string | null
  lastUpdatedAt: string
  region: string | null
  salesPersonId: string | null
}

export function deriveSummaryRows(args: {
  kitDispatches: KitDispatch[]
  mous: MOU[]
  schools: School[]
}): SummaryRow[] {
  const mouById = new Map(args.mous.map((m) => [m.id, m]))
  const schoolById = new Map(args.schools.map((s) => [s.id, s]))
  return args.kitDispatches
    .map((kd) => {
      const totalDispatched =
        kd.dispatchSummary?.accountsEntries.reduce(
          (s, e) => s + e.qtyActualDispatched,
          0,
        ) ?? 0
      const mou = mouById.get(kd.mouId)
      const school = schoolById.get(kd.schoolId)
      const lastUpdatedAt =
        kd.auditLog.length > 0
          ? (kd.auditLog[kd.auditLog.length - 1]?.timestamp ?? kd.createdAt)
          : kd.createdAt
      return {
        dispatchId: kd.id,
        schoolName: kd.schoolName,
        mouId: kd.mouId,
        productSelected: kd.productSelected,
        totalDispatchedQty: totalDispatched,
        dispatchStatus: kd.dispatchStatus,
        podPath: kd.pod?.filePath ?? null,
        lastUpdatedAt,
        region: school?.region ?? null,
        salesPersonId: mou?.salesPersonId ?? null,
      }
    })
    .sort((a, b) => a.schoolName.localeCompare(b.schoolName))
}

const CSV_HEADERS = [
  'dispatchId',
  'schoolName',
  'mouId',
  'productSelected',
  'totalDispatchedQty',
  'dispatchStatus',
  'podPath',
  'lastUpdatedAt',
] as const

function csvEscape(value: string | number | null): string {
  if (value === null) return ''
  const str = String(value)
  if (/[",\n]/.test(str)) {
    return '"' + str.replace(/"/g, '""') + '"'
  }
  return str
}

export function rowsToCsv(rows: SummaryRow[]): string {
  const lines: string[] = []
  lines.push(CSV_HEADERS.join(','))
  for (const r of rows) {
    lines.push(
      [
        csvEscape(r.dispatchId),
        csvEscape(r.schoolName),
        csvEscape(r.mouId),
        csvEscape(r.productSelected),
        csvEscape(r.totalDispatchedQty),
        csvEscape(r.dispatchStatus),
        csvEscape(r.podPath),
        csvEscape(r.lastUpdatedAt),
      ].join(','),
    )
  }
  return lines.join('\n') + '\n'
}
