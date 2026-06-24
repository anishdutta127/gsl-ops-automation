/*
 * Product resolution (Phase 1.4). With the mous.programme CHECK dropped
 * (migration 014), validation moves here: a programme is valid iff it matches a
 * product's `name` (new MOUs) or one of a product's `legacyProgrammes`
 * (existing MOUs, e.g. 'STEAM' -> STEM - Robotics). Pure; callers pass the
 * product list they already loaded.
 */

import type { Product } from '@/lib/types'

export function resolveProduct(
  programme: string | null | undefined,
  products: Product[],
): Product | null {
  if (!programme) return null
  const byName = products.find((p) => p.name === programme)
  if (byName) return byName
  return products.find((p) => p.legacyProgrammes.includes(programme)) ?? null
}

/** Whether `programme` resolves to a known product (active or not). */
export function isKnownProgramme(programme: string, products: Product[]): boolean {
  return resolveProduct(programme, products) !== null
}
