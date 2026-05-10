/*
 * Round 3 Step 10b : pure rupee-value dispatch gate.
 *
 * Pranav reported the dispatch was "comparing the amount received with
 * qty." The previous error message said "dispatch 3 exceeds pending 0"
 * which used "pending" ambiguously (qty pending vs Rs pending). This
 * helper makes the rupee-vs-rupee math explicit, and lives in lib/ so
 * the route stays a pure Next.js route file (route files can only
 * export a fixed set of symbols).
 *
 * Returns null on success, or a precise error string with units.
 */

export interface VexDispatchGateInput {
  paymentReceivedRs: number
  alreadyDispatchedValueRs: number
  proposedItems: Array<{
    partNumber: string
    qty: number
    unitPriceRs: number
    pendingQty: number
  }>
}

export function checkVexDispatchGate(input: VexDispatchGateInput): string | null {
  if (input.paymentReceivedRs <= 0) {
    return 'No payment received yet (Rs 0). Cannot dispatch any qty until at least one payment is logged.'
  }
  for (const it of input.proposedItems) {
    if (!Number.isFinite(it.qty) || it.qty <= 0) {
      return `${it.partNumber}: enter a positive qty.`
    }
    if (it.qty > it.pendingQty) {
      return `${it.partNumber}: dispatch qty ${it.qty} exceeds pending qty ${it.pendingQty} on this PI (units, not rupees).`
    }
  }
  const proposedRs = input.proposedItems.reduce(
    (s, it) => s + it.qty * it.unitPriceRs,
    0,
  )
  const dispatchableRs = input.paymentReceivedRs - input.alreadyDispatchedValueRs
  if (proposedRs > dispatchableRs + 0.01) {
    return (
      `Proposed dispatch value Rs ${proposedRs.toLocaleString('en-IN')} ` +
      `exceeds available Rs ${dispatchableRs.toLocaleString('en-IN')} ` +
      `(received Rs ${input.paymentReceivedRs.toLocaleString('en-IN')} ` +
      `− already dispatched Rs ${input.alreadyDispatchedValueRs.toLocaleString('en-IN')}). ` +
      `Log additional payment to unlock more dispatch value, or send fewer kits in this dispatch.`
    )
  }
  return null
}
