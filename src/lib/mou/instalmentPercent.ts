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

/**
 * Raw percent share of an instalment amount vs the contract value, as a
 * number. Returns 0 when the contract value is zero or negative, matching
 * the Add MOU form rule:
 *   percent = contractValue > 0 ? (amount / contractValue) * 100 : 0
 * The Add MOU schedule renders this with a fixed single decimal place.
 */
export function instalmentSharePct(amountRs: number, contractValueRs: number): number {
  if (!Number.isFinite(contractValueRs) || contractValueRs <= 0) return 0
  if (!Number.isFinite(amountRs)) return 0
  return (amountRs / contractValueRs) * 100
}

/**
 * Whether a schedule's summed amount lands on the contract value within a
 * percentage tolerance (default 0.1%). Gates the "schedule does not add up"
 * warning so a few rupees of rounding does not trip it. Returns false (does
 * not add up) when the contract value is unknown.
 */
export function scheduleAddsUp(
  scheduledTotalRs: number,
  contractValueRs: number,
  tolerancePct = 0.1,
): boolean {
  if (!Number.isFinite(contractValueRs) || contractValueRs <= 0) return false
  return Math.abs(instalmentSharePct(scheduledTotalRs, contractValueRs) - 100) <= tolerancePct
}
