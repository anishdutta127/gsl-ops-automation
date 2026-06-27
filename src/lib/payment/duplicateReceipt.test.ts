import { describe, expect, it } from 'vitest'
import {
  isDuplicateReceipt,
  isRealBankReference,
  PLACEHOLDER_REFERENCES,
} from './duplicateReceipt'

describe('isRealBankReference', () => {
  it('accepts a genuine NEFT/IMPS reference', () => {
    expect(isRealBankReference('INF/INFT/044632377521/Maf Technologies')).toBe(true)
    expect(isRealBankReference('AXISCN1358400464')).toBe(true)
  })

  it('rejects blank and placeholder references', () => {
    for (const p of PLACEHOLDER_REFERENCES) expect(isRealBankReference(p)).toBe(false)
    expect(isRealBankReference(null)).toBe(false)
    expect(isRealBankReference(undefined)).toBe(false)
    expect(isRealBankReference('  NA  ')).toBe(false)
    expect(isRealBankReference('N/A')).toBe(false)
  })
})

describe('isDuplicateReceipt', () => {
  const existing = [
    { reference: 'INF/INFT/044632377521/Maf Technologies Advance', amount: 410516 },
    { reference: 'AXISCN1358400464', amount: 153400.01 },
  ]

  it('flags the Funscholar case: same reference + amount, DIFFERENT date is still a duplicate', () => {
    // The two Funscholar logs differed only in the typed date; date is not in the key.
    expect(
      isDuplicateReceipt(existing, {
        reference: 'INF/INFT/044632377521/Maf Technologies Advance',
        amount: 410516,
      }),
    ).toBe(true)
  })

  it('is case- and whitespace-insensitive on the reference', () => {
    expect(
      isDuplicateReceipt(existing, {
        reference: '  inf/inft/044632377521/maf technologies advance  ',
        amount: 410516,
      }),
    ).toBe(true)
  })

  it('tolerates sub-paisa amount differences', () => {
    expect(
      isDuplicateReceipt(existing, { reference: 'AXISCN1358400464', amount: 153400.014 }),
    ).toBe(true)
  })

  it('does NOT flag a different amount on the same reference', () => {
    expect(
      isDuplicateReceipt(existing, {
        reference: 'INF/INFT/044632377521/Maf Technologies Advance',
        amount: 99999,
      }),
    ).toBe(false)
  })

  it('does NOT flag a different reference', () => {
    expect(
      isDuplicateReceipt(existing, { reference: 'SOME-OTHER-UTR', amount: 410516 }),
    ).toBe(false)
  })

  it('never flags placeholder references (multiple NA/cash receipts are allowed)', () => {
    const withNa = [
      { reference: 'NA', amount: 5000 },
      { reference: '', amount: 5000 },
    ]
    expect(isDuplicateReceipt(withNa, { reference: 'NA', amount: 5000 })).toBe(false)
    expect(isDuplicateReceipt(withNa, { reference: '', amount: 5000 })).toBe(false)
    expect(isDuplicateReceipt(withNa, { reference: null, amount: 5000 })).toBe(false)
  })

  it('handles a null amount on an existing log without throwing', () => {
    expect(
      isDuplicateReceipt([{ reference: 'X', amount: null }], { reference: 'X', amount: 0 }),
    ).toBe(true)
  })
})
