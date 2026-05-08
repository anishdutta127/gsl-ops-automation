/*
 * formatSkuBreakdown: render Dispatch / DispatchRequest line items as
 * a comma-separated SKU summary (Step 2 of the Swati-feedback batch).
 *
 * Per Swati: dispatch rows should show the SKU breakdown ("STEAM Kit
 * Class 6 x 50, Robotics Starter x 10") rather than only a total qty.
 * Per-grade lines flatten to one entry per (skuName, grade) pair so the
 * grade context survives in the row caption.
 */

import type { DispatchLineItem } from '@/lib/types'

export function formatSkuBreakdown(items: DispatchLineItem[]): string {
  if (items.length === 0) return ''
  const parts: string[] = []
  for (const item of items) {
    if (item.kind === 'flat') {
      parts.push(`${item.skuName} x ${item.quantity}`)
      continue
    }
    for (const allocation of item.gradeAllocations) {
      parts.push(`${item.skuName} Class ${allocation.grade} x ${allocation.quantity}`)
    }
  }
  return parts.join(', ')
}
