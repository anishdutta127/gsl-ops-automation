import { describe, expect, it } from 'vitest'
import type { PaymentLog } from '@/lib/types'
import { suggestMatches } from './matchSuggestion'

function plog(overrides: Partial<PaymentLog>): PaymentLog {
  return {
    id: 'PL-X',
    date: '2026-05-15',
    amount: 100000,
    mode: 'Bank Transfer',
    reference: null,
    narration: null,
    salesPersonId: null,
    matchedInstallmentIds: [],
    unmatched: true,
    loggedBy: 'shubhangi.g',
    loggedAt: '2026-05-15T10:00:00Z',
    notes: null,
    ...overrides,
  }
}

describe('suggestMatches', () => {
  it('returns empty when no candidates', () => {
    expect(
      suggestMatches({
        totalBankAmount: 100000,
        bankReference: 'UTR-X',
        receivedDate: '2026-05-15',
        candidates: [],
      }),
    ).toEqual([])
  })

  it('tier 1: matches on bank-reference equality (case-insensitive trim)', () => {
    const pl = plog({ id: 'PL-1', reference: '  UTR-Match  ', amount: 999 })
    const out = suggestMatches({
      totalBankAmount: 100000, // amount irrelevant when reference matches
      bankReference: 'utr-match',
      receivedDate: '2026-05-15',
      candidates: [pl],
    })
    expect(out).toHaveLength(1)
    expect(out[0]?.reason).toBe('reference-match')
    expect(out[0]?.paymentLog.id).toBe('PL-1')
  })

  it('tier 2: matches on exact amount + within 14 days', () => {
    const pl = plog({ id: 'PL-2', amount: 150000, date: '2026-05-12', reference: 'OTHER' })
    const out = suggestMatches({
      totalBankAmount: 150000,
      bankReference: null,
      receivedDate: '2026-05-15',
      candidates: [pl],
    })
    expect(out).toHaveLength(1)
    expect(out[0]?.reason).toBe('amount-and-date')
    expect(out[0]?.daysApart).toBe(3)
  })

  it('tier 3: matches within 1 Rs tolerance + within 14 days', () => {
    const pl = plog({ id: 'PL-3', amount: 149999.5, date: '2026-05-14' })
    const out = suggestMatches({
      totalBankAmount: 150000,
      bankReference: null,
      receivedDate: '2026-05-15',
      candidates: [pl],
    })
    expect(out).toHaveLength(1)
    expect(out[0]?.reason).toBe('amount-only')
  })

  it('skips already-matched PaymentLog rows', () => {
    const pl = plog({ id: 'PL-4', amount: 150000, unmatched: false })
    expect(
      suggestMatches({
        totalBankAmount: 150000,
        bankReference: null,
        receivedDate: '2026-05-15',
        candidates: [pl],
      }),
    ).toEqual([])
  })

  it('skips amount matches outside the 14-day window', () => {
    const pl = plog({ id: 'PL-5', amount: 150000, date: '2026-04-01' }) // ~44 days apart
    expect(
      suggestMatches({
        totalBankAmount: 150000,
        bankReference: null,
        receivedDate: '2026-05-15',
        candidates: [pl],
      }),
    ).toEqual([])
  })

  it('does not double-suggest the same PaymentLog on multiple tiers', () => {
    const pl = plog({ id: 'PL-6', reference: 'UTR-X', amount: 150000, date: '2026-05-15' })
    const out = suggestMatches({
      totalBankAmount: 150000,
      bankReference: 'UTR-X',
      receivedDate: '2026-05-15',
      candidates: [pl],
    })
    expect(out).toHaveLength(1)
    expect(out[0]?.reason).toBe('reference-match')
  })

  it('caps at 3 suggestions', () => {
    const candidates = [
      plog({ id: 'PL-A', amount: 100000, date: '2026-05-14' }),
      plog({ id: 'PL-B', amount: 100000, date: '2026-05-13' }),
      plog({ id: 'PL-C', amount: 100000, date: '2026-05-12' }),
      plog({ id: 'PL-D', amount: 100000, date: '2026-05-11' }),
      plog({ id: 'PL-E', amount: 100000, date: '2026-05-10' }),
    ]
    const out = suggestMatches({
      totalBankAmount: 100000,
      bankReference: null,
      receivedDate: '2026-05-15',
      candidates,
    })
    expect(out).toHaveLength(3)
  })

  it('blank bank reference is not used for tier 1 matching', () => {
    const pl = plog({ id: 'PL-7', reference: '', amount: 999 })
    const out = suggestMatches({
      totalBankAmount: 100000,
      bankReference: '   ',
      receivedDate: '2026-05-15',
      candidates: [pl],
    })
    expect(out).toEqual([])
  })
})
