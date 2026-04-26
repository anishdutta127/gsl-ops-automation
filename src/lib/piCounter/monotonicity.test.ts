import { describe, expect, it } from 'vitest'
import { checkMonotonicity } from './monotonicity'
import type { Communication } from '@/lib/types'

function comm(overrides: Partial<Communication> = {}): Communication {
  return {
    id: 'COM-X', type: 'pi-sent', schoolId: 'SCH-X', mouId: 'MOU-X',
    installmentSeq: 1, channel: 'email',
    subject: 'Proforma Invoice GSL/OPS/26-27/0001', bodyEmail: null,
    bodyWhatsApp: null, toEmail: null, toPhone: null, ccEmails: [],
    queuedAt: '2026-04-15T10:00:00Z', queuedBy: 'system',
    sentAt: null, copiedAt: null, status: 'queued', bounceDetail: null,
    auditLog: [],
    ...overrides,
  }
}

describe('checkMonotonicity', () => {
  it('returns ok=true for a single pi-sent', () => {
    const result = checkMonotonicity([
      comm({ id: 'COM-1', subject: 'PI GSL/OPS/26-27/0001' }),
    ])
    expect(result.ok).toBe(true)
    expect(result.issuedCount).toBe(1)
    expect(result.highestSeq).toBe(1)
  })

  it('returns ok=true for strictly increasing sequence (gaps OK)', () => {
    const result = checkMonotonicity([
      comm({ id: 'COM-1', subject: 'PI GSL/OPS/26-27/0001', queuedAt: '2026-04-15T10:00:00Z' }),
      comm({ id: 'COM-5', subject: 'PI GSL/OPS/26-27/0005', queuedAt: '2026-04-20T11:00:00Z' }),
    ])
    expect(result.ok).toBe(true)
    expect(result.issuedCount).toBe(2)
    expect(result.highestSeq).toBe(5)
    expect(result.firstViolation).toBeNull()
  })

  it('flags duplicate seq as a violation', () => {
    const result = checkMonotonicity([
      comm({ id: 'COM-1', subject: 'PI GSL/OPS/26-27/0001', queuedAt: '2026-04-15T10:00:00Z' }),
      comm({ id: 'COM-1-DUP', subject: 'PI GSL/OPS/26-27/0001', queuedAt: '2026-04-16T10:00:00Z' }),
    ])
    expect(result.ok).toBe(false)
    expect(result.firstViolation).toEqual({
      previousSeq: 1,
      currentSeq: 1,
      communicationId: 'COM-1-DUP',
    })
  })

  it('flags non-increasing seq as a violation', () => {
    const result = checkMonotonicity([
      comm({ id: 'COM-5', subject: 'PI GSL/OPS/26-27/0005', queuedAt: '2026-04-15T10:00:00Z' }),
      comm({ id: 'COM-3', subject: 'PI GSL/OPS/26-27/0003', queuedAt: '2026-04-16T10:00:00Z' }),
    ])
    expect(result.ok).toBe(false)
    expect(result.firstViolation?.previousSeq).toBe(5)
    expect(result.firstViolation?.currentSeq).toBe(3)
  })

  it('skips comms whose body cannot be parsed; still ok if rest is monotonic', () => {
    const result = checkMonotonicity([
      comm({ id: 'COM-NULL', subject: null, bodyEmail: null, bodyWhatsApp: null, queuedAt: '2026-04-15T10:00:00Z' }),
      comm({ id: 'COM-1', subject: 'PI GSL/OPS/26-27/0001', queuedAt: '2026-04-16T10:00:00Z' }),
    ])
    expect(result.ok).toBe(true)
    expect(result.issuedCount).toBe(1)
    expect(result.skippedCount).toBe(1)
  })

  it('ignores non-pi-sent communications', () => {
    const result = checkMonotonicity([
      comm({ id: 'COM-WLC', type: 'welcome-note', subject: 'Welcome' }),
      comm({ id: 'COM-1', subject: 'PI GSL/OPS/26-27/0001' }),
    ])
    expect(result.ok).toBe(true)
    expect(result.issuedCount).toBe(1)
  })

  it('parses the seq from bodyWhatsApp when subject is null (whatsapp-draft channel)', () => {
    const result = checkMonotonicity([
      comm({
        id: 'COM-WA',
        channel: 'whatsapp-draft-copied',
        subject: null,
        bodyEmail: null,
        bodyWhatsApp: 'Hi, your PI is GSL/OPS/26-27/0007. Pay in 30 days.',
      }),
    ])
    expect(result.ok).toBe(true)
    expect(result.highestSeq).toBe(7)
  })
})
