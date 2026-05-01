import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { KitAllocationTable } from './KitAllocationTable'
import type { IntakeRecord, School } from '@/lib/types'

function school(overrides: Partial<School> = {}): School {
  return {
    id: 'SCH-X', name: 'Sample School', legalEntity: null,
    city: 'Pune', state: 'MH', region: 'South-West', pinCode: '411001',
    contactPerson: 'School Coord', email: null, phone: '+919000000000',
    billingName: null, pan: null, gstNumber: null, notes: null,
    active: true, createdAt: '', auditLog: [],
    ...overrides,
  }
}

function intake(overrides: Partial<IntakeRecord> = {}): IntakeRecord {
  return {
    id: 'IR-X', mouId: 'MOU-X', completedAt: '', completedBy: '',
    salesOwnerId: '', location: '', grades: '1-8',
    recipientName: '', recipientDesignation: '', recipientEmail: '',
    studentsAtIntake: 100, durationYears: 1,
    startDate: '2026-04-01', endDate: '2027-03-31',
    physicalSubmissionStatus: 'Pending', softCopySubmissionStatus: 'Pending',
    productConfirmed: 'STEAM', gslTrainingMode: 'GSL Trainer',
    schoolPointOfContactName: 'Mr. MK Bansal',
    schoolPointOfContactPhone: '+919456838281',
    signedMouUrl: '', thankYouEmailSentAt: null,
    gradeBreakdown: null, rechargeableBatteries: null,
    auditLog: [],
    ...overrides,
  }
}

describe('KitAllocationTable (W4-I.4 MM3)', () => {
  it('renders the Misba ticketing-derived 15-column header', () => {
    const html = renderToStaticMarkup(
      <KitAllocationTable school={school()} schoolName="Sample School" intake={intake()} />,
    )
    expect(html).toContain('School Name')
    expect(html).toContain('Address')
    expect(html).toContain('SPOC Name')
    expect(html).toContain('Contact Number')
    for (let g = 1; g <= 10; g++) {
      expect(html).toContain(`>G${g}<`)
    }
    expect(html).toContain('Batteries')
  })

  it('renders Misba KOLKATA WB sample row faithfully', () => {
    const breakdown = [
      { grade: 1, students: 17 }, { grade: 2, students: 21 },
      { grade: 3, students: 20 }, { grade: 4, students: 15 },
      { grade: 5, students: 24 }, { grade: 6, students: 25 },
      { grade: 7, students: 26 }, { grade: 8, students: 25 },
      { grade: 9, students: 0 }, { grade: 10, students: 0 },
    ]
    const html = renderToStaticMarkup(
      <KitAllocationTable
        school={school({ name: 'Sample School', city: 'KOLKATA', state: 'WB', pinCode: null })}
        schoolName="Sample School"
        intake={intake({ gradeBreakdown: breakdown, rechargeableBatteries: 25 })}
      />,
    )
    // Rendered phone + name from intake (preferred over school)
    expect(html).toContain('Mr. MK Bansal')
    expect(html).toContain('+919456838281')
    // Grade values present in cells
    for (const row of breakdown) {
      expect(html).toContain(`data-testid="kit-grade-${row.grade}"`)
    }
    expect(html).toContain('data-testid="kit-batteries"')
    // Address renders with the city + state
    expect(html).toContain('KOLKATA, WB')
  })

  it('renders dashes for grades not in the breakdown (partial backfill)', () => {
    const breakdown = [
      { grade: 1, students: 10 },
      { grade: 5, students: 30 },
    ]
    const html = renderToStaticMarkup(
      <KitAllocationTable
        school={school()} schoolName="Sample"
        intake={intake({ gradeBreakdown: breakdown, rechargeableBatteries: 5 })}
      />,
    )
    // Grade 2 should render '-' (no data)
    expect(html).toMatch(/data-testid="kit-grade-2"[^>]*>-</)
    expect(html).toMatch(/data-testid="kit-grade-5"[^>]*>30</)
  })

  it('falls back to school contact + phone when intake SPOC is empty', () => {
    const html = renderToStaticMarkup(
      <KitAllocationTable
        school={school({ contactPerson: 'School Coord', phone: '+918000000000' })}
        schoolName="Sample"
        intake={intake({ schoolPointOfContactName: '', schoolPointOfContactPhone: '' })}
      />,
    )
    expect(html).toContain('School Coord')
    expect(html).toContain('+918000000000')
  })

  it('renders dash for batteries when rechargeableBatteries is null', () => {
    const html = renderToStaticMarkup(
      <KitAllocationTable
        school={school()} schoolName="Sample"
        intake={intake({ rechargeableBatteries: null })}
      />,
    )
    expect(html).toMatch(/data-testid="kit-batteries"[^>]*>-</)
  })

  it('renders 0 batteries (not dash) when value is 0', () => {
    const html = renderToStaticMarkup(
      <KitAllocationTable
        school={school()} schoolName="Sample"
        intake={intake({ rechargeableBatteries: 0 })}
      />,
    )
    expect(html).toMatch(/data-testid="kit-batteries"[^>]*>0</)
  })

  it('renders even when intake is null (placeholder row from school only)', () => {
    const html = renderToStaticMarkup(
      <KitAllocationTable school={school()} schoolName="Sample" intake={null} />,
    )
    expect(html).toContain('Sample School')
  })
})
