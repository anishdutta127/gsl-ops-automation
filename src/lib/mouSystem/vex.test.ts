import { describe, it, expect } from 'vitest'
import { matchSchool, mapCsvToDraftRows, parseCsv, vexFunnelCounts } from './vex'
import type { School, VexOrder } from './types'

function sc(id: string, name: string, state = 'Maharashtra'): School {
  return {
    id,
    name,
    legalEntity: null,
    city: 'Mumbai',
    state,
    pinCode: null,
    contactPerson: null,
    email: null,
    phone: null,
    billingName: null,
    pan: null,
    gstNumber: null,
    activeMous: 0,
    totalLifetimeValue: 0,
    notes: null,
  }
}

describe('parseCsv', () => {
  it('handles quoted fields with commas', () => {
    const out = parseCsv('a,b,"c, d"\n1,2,3\n')
    expect(out).toEqual([
      ['a', 'b', 'c, d'],
      ['1', '2', '3'],
    ])
  })
  it('handles escaped quotes', () => {
    const out = parseCsv('a,"b""c",d\n')
    expect(out).toEqual([['a', 'b"c', 'd']])
  })
})

describe('matchSchool', () => {
  const roster = [sc('SCH-1', 'Mahatma Gandhi International School'), sc('SCH-2', 'Acme Public School')]
  it('returns exact match with confidence 1', () => {
    const m = matchSchool('Mahatma Gandhi International School', roster)
    expect(m?.school.id).toBe('SCH-1')
    expect(m?.confidence).toBe(1)
  })
  it('returns high confidence for substring match', () => {
    const m = matchSchool('Mahatma Gandhi Intl School', roster)
    expect(m?.school.id).toBe('SCH-1')
    expect(m?.confidence).toBeGreaterThanOrEqual(0.3)
  })
  it('returns null for totally unrelated name', () => {
    const m = matchSchool('Xyz Zzz', roster)
    expect(m).toBeNull()
  })
})

describe('mapCsvToDraftRows', () => {
  it('maps a Tally-like export', () => {
    const rows = parseCsv(
      [
        'Date,Party Ledger,Voucher No,Item Name,Qty,Rate,Amount,Total,Status',
        '2026-04-15,Mahatma Gandhi School,MTPL/UP/26-27/001,VEX GO KIT,2,12000,24000,28320,Dispatched',
      ].join('\n'),
    )
    const out = mapCsvToDraftRows(rows)
    expect(out).toHaveLength(1)
    expect(out[0]!.schoolName).toBe('Mahatma Gandhi School')
    expect(out[0]!.quantity).toBe(2)
    expect(out[0]!.dispatchStatus).toBe('Dispatched')
    expect(out[0]!.paymentReceived).toBe(true)
  })
})

describe('vexFunnelCounts', () => {
  it('counts by dispatch status', () => {
    const orders = [
      { dispatchStatus: 'Proforma Sent' } as VexOrder,
      { dispatchStatus: 'Dispatched' } as VexOrder,
      { dispatchStatus: 'Dispatched' } as VexOrder,
    ]
    const counts = vexFunnelCounts(orders)
    expect(counts.Dispatched).toBe(2)
    expect(counts['Proforma Sent']).toBe(1)
  })
})
