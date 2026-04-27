import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MouCard } from './MouCard'
import type { MOU, Programme } from '@/lib/types'

function mou(overrides: Partial<MOU> & Pick<MOU, 'id'>): MOU {
  return {
    schoolId: 'SCH-X',
    schoolName: 'Test School',
    programme: 'STEAM' as Programme,
    programmeSubType: null,
    schoolScope: 'SINGLE',
    schoolGroupId: null,
    status: 'Active',
    academicYear: '2026-27',
    startDate: '2026-04-01',
    endDate: '2027-03-31',
    studentsMou: 200,
    studentsActual: null,
    studentsVariance: null,
    studentsVariancePct: null,
    spWithoutTax: 4237,
    spWithTax: 5000,
    contractValue: 1_000_000,
    received: 0, tds: 0, balance: 1_000_000, receivedPct: 0,
    paymentSchedule: '', trainerModel: null, salesPersonId: null,
    templateVersion: null, generatedAt: null, notes: null,
    daysToExpiry: null, auditLog: [],
    ...overrides,
  }
}

describe('MouCard', () => {
  it('renders school name + MOU id + programme + click target href', () => {
    const html = renderToStaticMarkup(<MouCard mou={mou({ id: 'MOU-T-1' })} />)
    expect(html).toContain('Test School')
    expect(html).toContain('MOU-T-1')
    expect(html).toContain('STEAM')
    expect(html).toContain('href="/mous/MOU-T-1"')
  })

  it('truncates long school names with ellipsis and preserves full name in title attribute', () => {
    const longName = 'A Very Long School Name That Exceeds The Display Maximum Length Setting'
    const html = renderToStaticMarkup(<MouCard mou={mou({ id: 'X', schoolName: longName })} />)
    expect(html).toContain('…')
    expect(html).toContain(`title="${longName}"`)
  })

  it('shows programme + sub-type when sub-type is set', () => {
    const html = renderToStaticMarkup(<MouCard mou={mou({ id: 'X', programmeSubType: 'GSLT-Cretile' })} />)
    expect(html).toContain('STEAM / GSLT-Cretile')
  })

  it('shows drift badge when studentsVariancePct exceeds +/- 10%', () => {
    const html = renderToStaticMarkup(<MouCard mou={mou({ id: 'X', studentsVariancePct: 0.20 })} />)
    expect(html).toContain('Drift')
  })

  it('hides drift badge within tolerance', () => {
    const html = renderToStaticMarkup(<MouCard mou={mou({ id: 'X', studentsVariancePct: 0.05 })} />)
    expect(html).not.toContain('Drift')
  })

  it('shows status badge for non-Active MOUs', () => {
    const html = renderToStaticMarkup(<MouCard mou={mou({ id: 'X', status: 'Pending Signature' })} />)
    expect(html).toContain('Pending Signature')
  })

  it('omits status badge for Active MOUs (the default state needs no chrome)', () => {
    const html = renderToStaticMarkup(<MouCard mou={mou({ id: 'X', status: 'Active' })} />)
    // The status word "Active" should not surface as a badge; status badge container is absent.
    expect(html).not.toContain('>Active<')
  })

  it('contains no raw hex codes (token discipline)', () => {
    const html = renderToStaticMarkup(<MouCard mou={mou({ id: 'X', studentsVariancePct: 0.20, status: 'Pending Signature' })} />)
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,6}\b/)
  })

  it('has min-h ≥ 44px (touch target spec)', () => {
    const html = renderToStaticMarkup(<MouCard mou={mou({ id: 'X' })} />)
    expect(html).toContain('min-h-[88px]')
  })
})
