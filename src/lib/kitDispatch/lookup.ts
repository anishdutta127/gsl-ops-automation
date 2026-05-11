/*
 * KitDispatch lookup helpers.
 *
 * The detail page at /dispatch/kits/[dispatchId] is addressed by the
 * mouId (the natural key) rather than the KitDispatch.id because the
 * id is minted lazily at first-allocation-submit time. Routing by
 * mouId means the URL is stable even before the record exists; the
 * lookup helper resolves either form.
 */

import type { KitDispatch, MOU } from '@/lib/types'

export function findKitDispatch(args: {
  kitDispatches: KitDispatch[]
  mouId: string
}): KitDispatch | null {
  return args.kitDispatches.find((kd) => kd.mouId === args.mouId) ?? null
}

export function mintDispatchId(mouId: string): string {
  return `DISPATCH-${mouId}`
}

/**
 * Inventory eligibility filter used by the Step 3 product dropdown.
 * Returns SKUs from the inventory list matching the MOU's productSelection.
 * Inactive SKUs are excluded (Sunset SKUs cannot be allocated fresh).
 */
export function eligibleSkusForMou<T extends { active: boolean; category: string }>(args: {
  inventory: T[]
  productSelection: 'TinkRworks' | 'Cretile' | 'Both' | null
}): T[] {
  if (!args.productSelection) return []
  return args.inventory.filter((item) => {
    if (!item.active) return false
    if (args.productSelection === 'Both') {
      return item.category === 'TinkRworks' || item.category === 'Cretile'
    }
    return item.category === args.productSelection
  })
}

/**
 * Resolve the school identifier from either a real KitDispatch or its
 * parent MOU. Used by the detail-page server when only the MOU exists.
 */
export function deriveSchoolMetadata(args: {
  mou: MOU
  kitDispatch: KitDispatch | null
}): { schoolId: string; schoolName: string } {
  if (args.kitDispatch) {
    return {
      schoolId: args.kitDispatch.schoolId,
      schoolName: args.kitDispatch.schoolName,
    }
  }
  return { schoolId: args.mou.schoolId, schoolName: args.mou.schoolName }
}
