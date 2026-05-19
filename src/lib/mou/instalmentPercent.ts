/*
 * Per-instalment percent share formatter.
 *
 * Pranav's review item #2: instalment rows should show the % share
 * alongside the expected amount. Helper centralises the
 * (expectedAmount / contractValue) * 100 computation + the
 * display-formatting rule so the table view and the right-column
 * collapsible card on /mous/[id] stay consistent.
 */

/**
 * Returns the percent share of an instalment vs the MOU contract value,
 * formatted as a short display string. Returns `null` (caller renders
 * '-') when the contract value is zero or negative, which can happen
 * for unsigned MOUs that have no schedule yet.
 *
 * Examples:
 *   format(25000, 100000)  -> '25%'
 *   format(12500, 100000)  -> '12.5%'
 *   format(33333, 100000)  -> '33.33%'
 *   format(10000, 0)       -> null
 */
export function formatInstalmentPercent(
  expectedAmount: number,
  contractValue: number,
): string | null {
  if (!Number.isFinite(contractValue) || contractValue <= 0) return null
  const raw = (expectedAmount / contractValue) * 100
  // Round to two decimal places, then strip trailing zeros so 25.00%
  // shows as 25% and 12.50% shows as 12.5%.
  const rounded = Math.round(raw * 100) / 100
  const display = rounded
    .toFixed(2)
    .replace(/\.?0+$/, '')
  return `${display}%`
}
