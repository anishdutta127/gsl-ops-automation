/*
 * Duplicate-receipt guard (root-cause fix for the VEX over-count class).
 *
 * A bank reference (NEFT/IMPS UTR, cheque no, UPI ref) uniquely identifies ONE
 * transaction. The same reference + amount logged twice is the SAME receipt
 * double-entered, regardless of the date the operator typed.
 *
 * VEXPI-UP-26-27-013 (Funscholar) was over-counted to 2x precisely because the
 * same NEFT (ref INF/INFT/044632377521/...) was logged on two consecutive days:
 * same reference, same amount, DIFFERENT date. The pre-existing finance dedup
 * keyed on (reference, amount, DATE), so the differing date let it through; the
 * VEX payment route had no dedup at all. This helper keys on reference+amount
 * (NOT date) and is shared by both routes.
 *
 * Placeholder references ('NA', '-', blank, ...) do NOT identify a transaction,
 * so two receipts that both carry a placeholder are never treated as duplicates
 * (e.g. multiple cash receipts with no UTR, or the 'NA' the recovery scripts use).
 */

export const PLACEHOLDER_REFERENCES = new Set([
  '',
  'na',
  'n/a',
  '-',
  '--',
  'nil',
  'none',
  'null',
])

/** True when `ref` is a real bank reference (not blank / a placeholder). */
export function isRealBankReference(ref: string | null | undefined): boolean {
  return !PLACEHOLDER_REFERENCES.has((ref ?? '').trim().toLowerCase())
}

export interface ReceiptLike {
  reference?: string | null
  amount?: number | null
}

/**
 * True when `candidate` duplicates a receipt already in `existing`: it shares
 * a real (non-placeholder) bank reference AND the same amount (within 1 paisa).
 * Date is deliberately NOT part of the key.
 */
export function isDuplicateReceipt(
  existing: ReadonlyArray<ReceiptLike>,
  candidate: { reference: string | null | undefined; amount: number },
): boolean {
  if (!isRealBankReference(candidate.reference)) return false
  const ref = (candidate.reference ?? '').trim().toLowerCase()
  return existing.some(
    (l) =>
      isRealBankReference(l.reference) &&
      (l.reference ?? '').trim().toLowerCase() === ref &&
      Math.abs((l.amount ?? 0) - candidate.amount) < 0.01,
  )
}
