/*
 * Unified inventory SKU resolution (Step 1 product-portfolio rework).
 *
 * Single source of truth for "given an allocation/dispatch line, which
 * InventoryItem does it refer to?". This kills the skuName-keyed Map
 * collision in allocate.ts where all 8 Cretile grade-band rows share the
 * identical skuName "Cretile Grade-band kit" and collapsed to one
 * (last-wins), losing the grade dimension and the per-grade stock.
 *
 * Matching rule (mirrors the proven decrementInventory.ts logic):
 *  - Cretile is grade-banded: resolve by (category='Cretile',
 *    cretileGrade=grade). NEVER by skuName.
 *  - Everything else (TinkRworks, Other): resolve by skuName.
 *
 * Cretile is detected from the generic skuName so callers do not have to
 * thread the MOU brand through; the grade comes from the allocation row
 * (KitAllocation.grade / AccountsDispatchEntry.grade), which every row
 * already carries.
 */

import type { InventoryItem } from '@/lib/types'

export const CRETILE_CATEGORY = 'Cretile'
/** The shared generic skuName every Cretile grade-band row uses. */
export const CRETILE_GENERIC_SKU = 'Cretile Grade-band kit'

/** True when this product line is a grade-banded Cretile kit. */
export function isGradeBandedCretile(productName: string, category?: string | null): boolean {
  return category === CRETILE_CATEGORY || productName === CRETILE_GENERIC_SKU
}

/**
 * Resolve the InventoryItem a line refers to. Returns null when no item
 * matches (unknown SKU, or a Cretile grade with no stocked grade-band kit
 * - e.g. G1/G2, which are not in inventory).
 *
 * `inventory` should be pre-filtered to active items by the caller when
 * fresh allocation is intended; this function does not filter on `active`
 * so read/display paths can resolve sunset SKUs too.
 */
export function resolveInventoryItem(
  inventory: InventoryItem[],
  args: { productName: string; grade?: number | null; category?: string | null },
): InventoryItem | null {
  if (isGradeBandedCretile(args.productName, args.category)) {
    if (args.grade == null) return null
    return (
      inventory.find(
        (it) => it.category === CRETILE_CATEGORY && it.cretileGrade === args.grade,
      ) ?? null
    )
  }
  return inventory.find((it) => it.skuName === args.productName) ?? null
}
