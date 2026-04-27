import { describe, expect, it } from 'vitest'
import { importPayment, type RawUpstreamPayment } from './fromPayments'

const TS = '2026-04-27T10:00:00.000Z'

function raw(overrides: Partial<RawUpstreamPayment> = {}): RawUpstreamPayment {
  return {
    id: 'MOU-STEAM-2627-001-i1',
    mouId: 'MOU-STEAM-2627-001',
    schoolName: 'Test School',
    programme: 'STEAM',
    instalmentLabel: '1 of 4',
    instalmentSeq: 1,
    totalInstalments: 4,
    description: 'Instalment I',
    expectedAmount: 100000,
    status: 'Pending',
    ...overrides,
  }
}

describe('importPayment', () => {
  it('passes through canonical statuses verbatim', () => {
    expect(importPayment(raw({ status: 'Received' }), TS).payment.status).toBe('Received')
    expect(importPayment(raw({ status: 'Overdue' }), TS).payment.status).toBe('Overdue')
    expect(importPayment(raw({ status: 'Partial' }), TS).payment.status).toBe('Partial')
  })

  it('surfaces unknown-status anomaly and defaults to Pending', () => {
    const result = importPayment(raw({ status: 'Mystery' }), TS)
    expect(result.payment.status).toBe('Pending')
    const anomaly = result.anomalies.find(a => a.kind === 'unknown-status')
    expect(anomaly?.detail).toContain('Mystery')
  })

  it('passes through canonical paymentMode values', () => {
    expect(importPayment(raw({ paymentMode: 'Bank Transfer' }), TS).payment.paymentMode).toBe('Bank Transfer')
    expect(importPayment(raw({ paymentMode: 'UPI' }), TS).payment.paymentMode).toBe('UPI')
  })

  it('nulls unknown paymentMode values and surfaces an anomaly', () => {
    const result = importPayment(raw({ paymentMode: 'Crypto' }), TS)
    expect(result.payment.paymentMode).toBeNull()
    const anomaly = result.anomalies.find(a => a.kind === 'unknown-mode')
    expect(anomaly?.detail).toContain('Crypto')
  })

  it('stamps piGeneratedAt to import timestamp when piNumber is set + surfaces anomaly', () => {
    const result = importPayment(raw({ piNumber: 'GSL/OPS/26-27/0042' }), TS)
    expect(result.payment.piGeneratedAt).toBe(TS)
    const anomaly = result.anomalies.find(a => a.kind === 'pi-without-date')
    expect(anomaly).toBeDefined()
  })

  it('leaves piGeneratedAt null when piNumber is not set', () => {
    const result = importPayment(raw({ piNumber: null }), TS)
    expect(result.payment.piGeneratedAt).toBeNull()
  })

  it('records a single create-action audit entry on import', () => {
    const result = importPayment(raw(), TS)
    expect(result.payment.auditLog).not.toBeNull()
    expect(result.payment.auditLog?.length).toBe(1)
    expect(result.payment.auditLog?.[0]?.action).toBe('create')
  })

  it('defaults Ops-only fields (piSentDate, piSentTo, studentCountActual, partialPayments) to null', () => {
    const result = importPayment(raw(), TS)
    expect(result.payment.piSentDate).toBeNull()
    expect(result.payment.piSentTo).toBeNull()
    expect(result.payment.studentCountActual).toBeNull()
    expect(result.payment.partialPayments).toBeNull()
  })
})
