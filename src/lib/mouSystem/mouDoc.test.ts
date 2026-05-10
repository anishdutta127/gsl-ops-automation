import { describe, it, expect } from 'vitest'
import {
  buildDurationLabel,
  computeNumberOfYears,
  renderMouDoc,
  type MouDocInputs,
} from './mouDoc'
import type { MouBillingBlock, YearPaymentSchedule } from './types'

describe('computeNumberOfYears', () => {
  it('returns 0 for empty / invalid dates', () => {
    expect(computeNumberOfYears('', '')).toBe(0)
    expect(computeNumberOfYears('2026-04-01', '')).toBe(0)
    expect(computeNumberOfYears('2026-04-01', '2026-04-01')).toBe(0)
  })
  it('returns 1 for a 12-month MOU', () => {
    expect(computeNumberOfYears('2026-04-01', '2027-03-31')).toBe(1)
  })
  it('returns 2 for a 24-month MOU', () => {
    expect(computeNumberOfYears('2026-04-01', '2028-03-31')).toBe(2)
  })
  it('rounds up partial years', () => {
    expect(computeNumberOfYears('2026-04-01', '2027-04-15')).toBe(2)
    expect(computeNumberOfYears('2026-04-01', '2026-09-30')).toBe(1)
  })
})

describe('buildDurationLabel', () => {
  it('formats both ends of the range', () => {
    expect(buildDurationLabel('2026-04-01', '2027-03-31')).toMatch(/April/)
    expect(buildDurationLabel('2026-04-01', '2027-03-31')).toMatch(/2027/)
  })
})

describe('renderMouDoc', () => {
  const billing: MouBillingBlock = {
    billingName: 'Test Trust',
    billingAddress: 'Mumbai',
    billingCityState: 'Mumbai, MH',
    shipToName: 'Test School',
    shipToAddress: 'Mumbai',
    shipToCityState: 'Mumbai, MH',
    schoolEmail: 'school@example.com',
    contactPersonName: 'Pranav',
    designation: 'Principal',
    mobileNo: '9999999999',
    contactEmail: 'pranav@example.com',
    schoolContactNo: '9999999999',
    pan: 'AAACA1234B',
    gst: '27AAACA1234B1Z5',
  }
  const schedule: YearPaymentSchedule[] = [
    { year: 1, instalments: [{ month: 'Apr', pctDue: 25 }, { month: 'Jul', pctDue: 25 }, { month: 'Oct', pctDue: 25 }, { month: 'Jan', pctDue: 25 }] },
  ]
  const baseInputs: MouDocInputs = {
    mouId: 'MOU-STEAM-2627-DRAFT-001',
    programme: 'STEAM',
    templateDisplayName: 'STEAM / Robotics MOU',
    effectiveDate: '2026-04-01',
    schoolName: 'Test School',
    startDate: '2026-04-01',
    endDate: '2027-03-31',
    numberOfYears: 1,
    durationLabel: '01 April 2026 to 31 March 2027',
    salesChannel: 'School Programs (Course)',
    trainerModelLabel: 'Train the Trainer (TTT)',
    paymentSchedules: schedule,
    billingBlock: billing,
    annexureLines: ['Scope: STEAM kits + lab sessions for Year 1.'],
  }

  it('returns a non-empty .docx Buffer with zip magic bytes', async () => {
    const buf = await renderMouDoc(baseInputs)
    expect(Buffer.isBuffer(buf)).toBe(true)
    expect(buf.length).toBeGreaterThan(2000)
    expect(buf[0]).toBe(0x50)
    expect(buf[1]).toBe(0x4b)
  })

  it('handles two-year multi-schedule input without throwing', async () => {
    const buf = await renderMouDoc({
      ...baseInputs,
      numberOfYears: 2,
      durationLabel: '01 April 2026 to 31 March 2028',
      endDate: '2028-03-31',
      paymentSchedules: [
        schedule[0]!,
        { year: 2, instalments: [{ month: 'Apr Y2', pctDue: 50 }, { month: 'Oct Y2', pctDue: 50 }] },
      ],
    })
    expect(buf.length).toBeGreaterThan(2000)
  })
})
