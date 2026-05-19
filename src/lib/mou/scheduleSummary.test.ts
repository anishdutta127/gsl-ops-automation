import { describe, expect, it } from 'vitest'
import { deriveScheduleSummary } from './scheduleSummary'
import type { Payment } from '@/lib/types'

function payment(seq: number, expectedAmount: number): Payment {
  return {
    id: `MOU-T-i${seq}`,
    mouId: 'MOU-T',
    schoolName: 'Test',
    programme: 'STEAM',
    instalmentLabel: `${seq} of N`,
    instalmentSeq: seq,
    totalInstalments: 0,
    description: '',
    dueDateRaw: null,
    dueDateIso: null,
    expectedAmount,
    receivedAmount: null,
    receivedDate: null,
    paymentMode: null,
    bankReference: null,
    piNumber: null,
    taxInvoiceNumber: null,
    status: 'Pending',
    notes: null,
    piSentDate: null,
    piSentTo: null,
    piGeneratedAt: null,
    studentCountActual: null,
    partialPayments: null,
    auditLog: null,
  }
}

describe('deriveScheduleSummary', () => {
  it('returns stored fallback when there are zero installments', () => {
    expect(deriveScheduleSummary([], 100000, '50-50 half-yearly')).toBe('50-50 half-yearly')
    expect(deriveScheduleSummary([], 100000, '')).toBe('')
  })

  it('returns "100%" for a single installment', () => {
    expect(deriveScheduleSummary([payment(1, 100000)], 100000, 'ignored')).toBe('100%')
  })

  it('returns "50-50 half-yearly" for an even 50-50 split', () => {
    const payments = [payment(1, 50000), payment(2, 50000)]
    expect(deriveScheduleSummary(payments, 100000, 'ignored')).toBe('50-50 half-yearly')
  })

  it('returns generic "X-Y" for a two-installment uneven split', () => {
    const payments = [payment(1, 40000), payment(2, 60000)]
    expect(deriveScheduleSummary(payments, 100000, 'ignored')).toBe('40-60')
  })

  it('returns "25-25-25-25 quarterly" for an even four-way split', () => {
    const payments = [
      payment(1, 25000),
      payment(2, 25000),
      payment(3, 25000),
      payment(4, 25000),
    ]
    expect(deriveScheduleSummary(payments, 100000, 'ignored')).toBe('25-25-25-25 quarterly')
  })

  it('returns "10-30-30-30" for the Pranav-reported uneven four-way split', () => {
    const payments = [
      payment(1, 10000),
      payment(2, 30000),
      payment(3, 30000),
      payment(4, 30000),
    ]
    expect(deriveScheduleSummary(payments, 100000, '50-50 half-yearly')).toBe('10-30-30-30')
  })

  it('last row absorbs the rounding remainder', () => {
    const payments = [
      payment(1, 33333),
      payment(2, 33333),
      payment(3, 33334),
    ]
    expect(deriveScheduleSummary(payments, 100000, 'ignored')).toBe('33-33-34')
  })
})
