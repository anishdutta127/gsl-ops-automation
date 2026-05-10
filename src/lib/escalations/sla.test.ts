import { describe, expect, it } from 'vitest'
import {
  computeSlaTargetDate,
  isSlaBreached,
  slaDaysRemaining,
  slaHoursRemaining,
  slaWindowHours,
} from './sla'

describe('sla: slaWindowHours', () => {
  it('maps each severity to the Misba ticketing-system window', () => {
    expect(slaWindowHours('critical')).toBe(24)
    expect(slaWindowHours('high')).toBe(72)
    expect(slaWindowHours('medium')).toBe(7 * 24)
    expect(slaWindowHours('low')).toBe(30 * 24)
  })
})

describe('sla: computeSlaTargetDate', () => {
  it('adds 24h for critical (P0)', () => {
    expect(
      computeSlaTargetDate({ createdAt: '2026-05-10T10:00:00.000Z', severity: 'critical' }),
    ).toBe('2026-05-11T10:00:00.000Z')
  })

  it('adds 72h for high (P1)', () => {
    expect(
      computeSlaTargetDate({ createdAt: '2026-05-10T10:00:00.000Z', severity: 'high' }),
    ).toBe('2026-05-13T10:00:00.000Z')
  })

  it('adds 7 days for medium (P2)', () => {
    expect(
      computeSlaTargetDate({ createdAt: '2026-04-23T16:30:00.000Z', severity: 'medium' }),
    ).toBe('2026-04-30T16:30:00.000Z')
  })

  it('adds 30 days for low (P3)', () => {
    expect(
      computeSlaTargetDate({ createdAt: '2026-04-22T11:15:00.000Z', severity: 'low' }),
    ).toBe('2026-05-22T11:15:00.000Z')
  })
})

describe('sla: isSlaBreached', () => {
  it('returns true when target is before now and status is not Closed', () => {
    expect(
      isSlaBreached({
        status: 'Open',
        slaTargetDate: '2026-05-09T00:00:00.000Z',
        now: new Date('2026-05-10T00:00:00.000Z'),
      }),
    ).toBe(true)
  })

  it('returns false when target is after now', () => {
    expect(
      isSlaBreached({
        status: 'Open',
        slaTargetDate: '2026-05-15T00:00:00.000Z',
        now: new Date('2026-05-10T00:00:00.000Z'),
      }),
    ).toBe(false)
  })

  it('returns false for Closed escalations regardless of target', () => {
    expect(
      isSlaBreached({
        status: 'Closed',
        slaTargetDate: '2026-04-01T00:00:00.000Z',
        now: new Date('2026-05-10T00:00:00.000Z'),
      }),
    ).toBe(false)
  })
})

describe('sla: slaHoursRemaining and slaDaysRemaining', () => {
  it('returns positive hours when target is in the future', () => {
    const hrs = slaHoursRemaining({
      status: 'Open',
      slaTargetDate: '2026-05-12T00:00:00.000Z',
      now: new Date('2026-05-10T00:00:00.000Z'),
    })
    expect(hrs).toBe(48)
  })

  it('returns negative hours when target is in the past', () => {
    const hrs = slaHoursRemaining({
      status: 'Open',
      slaTargetDate: '2026-05-08T00:00:00.000Z',
      now: new Date('2026-05-10T00:00:00.000Z'),
    })
    expect(hrs).toBe(-48)
  })

  it('returns 0 for Closed escalations', () => {
    expect(
      slaHoursRemaining({
        status: 'Closed',
        slaTargetDate: '2026-04-01T00:00:00.000Z',
        now: new Date('2026-05-10T00:00:00.000Z'),
      }),
    ).toBe(0)
    expect(
      slaDaysRemaining({
        status: 'Closed',
        slaTargetDate: '2026-04-01T00:00:00.000Z',
        now: new Date('2026-05-10T00:00:00.000Z'),
      }),
    ).toBe(0)
  })

  it('rounds to whole days', () => {
    const days = slaDaysRemaining({
      status: 'Open',
      slaTargetDate: '2026-05-15T00:00:00.000Z',
      now: new Date('2026-05-10T00:00:00.000Z'),
    })
    expect(days).toBe(5)
  })
})
