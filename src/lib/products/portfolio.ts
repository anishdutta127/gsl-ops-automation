/*
 * Product-portfolio helpers (Step 1 rework).
 *
 * The structured MOU.products[] supersedes the brand-only
 * MOU.productSelection, but productSelection stays in place during the
 * transition so every reader catalogued in Part A keeps working. This
 * module derives the legacy brand enum from the new portfolio so the two
 * never drift when products[] is written.
 *
 * DISPATCH TRACKING ONLY - nothing here is read by pricing/PI.
 */

import type { MouProduct, ProductSelection } from '@/lib/mouSystem/types'

/**
 * Derive the legacy `productSelection` brand enum from a structured
 * portfolio. TinkRworks + Cretile present -> 'Both'; a single brand ->
 * that brand; empty / only non-brand products -> null.
 */
export function deriveProductSelection(
  products: MouProduct[] | null | undefined,
): ProductSelection | null {
  if (!products || products.length === 0) return null
  const brands = new Set(products.map((p) => p.product))
  const hasTinkRworks = brands.has('TinkRworks')
  const hasCretile = brands.has('Cretile')
  if (hasTinkRworks && hasCretile) return 'Both'
  if (hasTinkRworks) return 'TinkRworks'
  if (hasCretile) return 'Cretile'
  return null
}
