/*
 * Phase 6C FY 2025-26 importer tests.
 *
 * Three importer tests per the brief: skip-existing schools, create-new
 * schools, instalment append. Plus a few invariants the production data
 * surfaced during planning (orphan-payment detection, name-collision
 * conflict, instalment-month parsing).
 */

import { describe, expect, it } from 'vitest'
import type { MOU, Payment, School } from '@/lib/types'
import {
  buildImportPlan,
  parseInstalmentMonth,
  deriveSchoolId,
  normalizeSchoolName,
  type ImportRecord,
} from './fy2526Import'

const FIXED_TS = '2026-05-21T00:00:00.000Z'
const now = () => new Date(FIXED_TS)

function makeRecord(over: Partial<ImportRecord>): ImportRecord {
  return {
    srNo: 1,
    schoolName: 'Test School',
    salesRep: null,
    schoolCount: 1,
    mouStatusText: 'Existing School',
    kitsSent: 'NO',
    duration: '01st April 2025 to 31st march 2026',
    city: 'Pune',
    state: 'Maharashtra',
    studentsMou: 100,
    studentsActual: 100,
    spPerStudentWithoutTax: 1000,
    spPerStudentWithTax: 1180,
    salesAmountWithTax: 118000,
    amountReceived: 0,
    tdsAmount: 0,
    balanceOutstanding: 118000,
    amtRecdIn2627: null,
    tds2627: null,
    pctReceivedOverall: 0,
    instalments: [
      { instalmentNo: 1, pctShare: 0.5, amount: 59000, month: 'Jun-25', paymentReceived: 'No' },
      { instalmentNo: 2, pctShare: 0.5, amount: 59000, month: 'Sep-25', paymentReceived: 'No' },
    ],
    ownerName: 'Pratik',
    piNotRaisedPaymentReceived: 0,
    piRaisedPaymentReceived: 0,
    piRaisedPaymentNotReceived: 0,
    piNotRaisedPaymentNotReceived: 118000,
    ...over,
  }
}

function makeSchool(over: Partial<School>): School {
  return {
    id: 'SCH-TEST',
    name: 'Test School',
    legalEntity: null,
    city: 'Pune',
    state: 'Maharashtra',
    region: 'South-West',
    pinCode: null,
    contactPerson: null,
    email: null,
    phone: null,
    billingName: null,
    pan: null,
    gstNumber: null,
    notes: null,
    active: true,
    createdAt: FIXED_TS,
    auditLog: [],
    ...over,
  }
}

describe('parseInstalmentMonth', () => {
  it('parses "Jun-25" to 2025-06-01', () => {
    expect(parseInstalmentMonth('Jun-25')).toEqual({ iso: '2025-06-01', raw: 'Jun-25' })
  })
  it('parses "Mar-26" to 2026-03-01 (FY 25-26 spans into 2026)', () => {
    expect(parseInstalmentMonth('Mar-26')).toEqual({ iso: '2026-03-01', raw: 'Mar-26' })
  })
  it('returns null iso on unparseable input but preserves raw', () => {
    expect(parseInstalmentMonth('Unknown')).toEqual({ iso: null, raw: 'Unknown' })
  })
  it('returns nulls on empty', () => {
    expect(parseInstalmentMonth(null)).toEqual({ iso: null, raw: null })
  })
})

describe('normalizeSchoolName + deriveSchoolId', () => {
  it('matches names case-insensitively and trims whitespace', () => {
    expect(normalizeSchoolName('  Foo  Bar  ')).toBe('foo bar')
    expect(normalizeSchoolName('FOO BAR')).toBe('foo bar')
  })

  it('derives SCH-FOO_BAR ids with truncation and collision handling', () => {
    const set = new Set<string>()
    const a = deriveSchoolId('Foo Bar School', set)
    expect(a).toBe('SCH-FOO_BAR_SCHOOL')
    set.add(a)
    const b = deriveSchoolId('Foo Bar School', set)
    expect(b).toBe('SCH-FOO_BAR_SCHOOL_2')
  })

  it('truncates long names to 20 chars after SCH-', () => {
    const id = deriveSchoolId('Some Very Long School Name That Wraps Past Twenty Chars', new Set())
    expect(id.startsWith('SCH-')).toBe(true)
    expect(id.length).toBe(24) // 'SCH-' + 20
  })
})

describe('buildImportPlan: skip-existing schools', () => {
  it('skips a school whose name matches an existing record (case-insensitive)', () => {
    const plan = buildImportPlan({
      records: [makeRecord({ schoolName: 'TEST SCHOOL' })],
      existingSchools: [makeSchool({ id: 'SCH-EX', name: 'Test School' })],
      existingMous: [],
      existingPayments: [],
      programme: 'STEAM',
      now,
      createdBy: 'anish.d',
    })
    expect(plan.totals.schoolsSkipped).toBe(1)
    expect(plan.totals.schoolsToCreate).toBe(0)
    expect(plan.schools[0]?.kind).toBe('skip-existing')
  })

  it('flags a city/state conflict instead of silently merging', () => {
    const plan = buildImportPlan({
      records: [makeRecord({ schoolName: 'Test School', city: 'Mumbai', state: 'Maharashtra' })],
      existingSchools: [makeSchool({ id: 'SCH-EX', name: 'Test School', city: 'Pune', state: 'Maharashtra' })],
      existingMous: [],
      existingPayments: [],
      programme: 'STEAM',
      now,
      createdBy: 'anish.d',
    })
    expect(plan.totals.schoolsConflict).toBe(1)
    expect(plan.totals.schoolsSkipped).toBe(0)
    const conflict = plan.schools[0]
    expect(conflict).toBeDefined()
    if (!conflict) return
    expect(conflict.kind).toBe('conflict-city-state')
    if (conflict.kind === 'conflict-city-state') {
      expect(conflict.importCity).toBe('Mumbai')
      expect(conflict.existingCity).toBe('Pune')
    }
  })
})

describe('buildImportPlan: create-new schools', () => {
  it('creates a new school + MOU + instalments + payments when no match', () => {
    const plan = buildImportPlan({
      records: [
        makeRecord({
          schoolName: 'Brand New School',
          city: 'Patna',
          state: 'Bihar',
          studentsMou: 200,
          studentsActual: 200,
          salesAmountWithTax: 100000,
          amountReceived: 50000,
          instalments: [
            { instalmentNo: 1, pctShare: 0.5, amount: 50000, month: 'Jun-25', paymentReceived: 'Yes' },
            { instalmentNo: 2, pctShare: 0.5, amount: 50000, month: 'Sep-25', paymentReceived: 'No' },
          ],
        }),
      ],
      existingSchools: [],
      existingMous: [],
      existingPayments: [],
      programme: 'STEAM',
      now,
      createdBy: 'anish.d',
    })
    expect(plan.totals.schoolsToCreate).toBe(1)
    expect(plan.totals.mousToCreate).toBe(1)
    expect(plan.totals.instalmentsToCreate).toBe(2)
    // One paid instalment in the fixture, so paymentsToCreate should be 1.
    expect(plan.totals.paymentsToCreate).toBe(1)
    const sp = plan.schools[0]
    expect(sp).toBeDefined()
    if (!sp) return
    expect(sp.kind).toBe('create')
    if (sp.kind === 'create') {
      expect(sp.school.region).toBe('East') // Bihar -> East per the regionForState taxonomy
      expect(sp.school.id.startsWith('SCH-BRAND_NEW_SCHOOL')).toBe(true)
    }
    const mp = plan.mous[0]
    expect(mp).toBeDefined()
    if (!mp) return
    expect(mp.kind).toBe('create')
    if (mp.kind === 'create') {
      expect(mp.mou.programme).toBe('STEAM')
      expect(mp.mou.academicYear).toBe('2025-26')
      expect(mp.mou.cohortStatus).toBe('archived')
      expect(mp.mou.contractValue).toBe(100000)
      expect(mp.instalments[0]?.status).toBe('Received')
      expect(mp.instalments[0]?.receivedAmount).toBe(50000)
      expect(mp.instalments[1]?.status).toBe('Pending')
      expect(mp.instalments[1]?.receivedAmount).toBe(null)
    }
  })

  it('allocates MOU sequence past existing IDs of the same programme/FY', () => {
    const plan = buildImportPlan({
      records: [makeRecord({ schoolName: 'New A' }), makeRecord({ schoolName: 'New B' })],
      existingSchools: [],
      existingMous: [
        { id: 'MOU-STEAM-2526-027' } as MOU,
        { id: 'MOU-STEAM-2526-028' } as MOU,
      ],
      existingPayments: [],
      programme: 'STEAM',
      now,
      createdBy: 'anish.d',
    })
    expect(plan.totals.mousToCreate).toBe(2)
    const created = plan.mous.filter((m) => m.kind === 'create') as Array<
      Extract<typeof plan.mous[number], { kind: 'create' }>
    >
    expect(created[0]?.mou.id).toBe('MOU-STEAM-2526-029')
    expect(created[1]?.mou.id).toBe('MOU-STEAM-2526-030')
  })
})

describe('buildImportPlan: instalment append discipline', () => {
  it('skips MOU creation when a 2025-26 MOU already exists for that school', () => {
    const plan = buildImportPlan({
      records: [makeRecord({ schoolName: 'Test School' })],
      existingSchools: [makeSchool({ id: 'SCH-EX', name: 'Test School' })],
      existingMous: [
        {
          id: 'MOU-STEAM-2526-001',
          schoolId: 'SCH-EX',
          academicYear: '2025-26',
        } as MOU,
      ],
      existingPayments: [],
      programme: 'STEAM',
      now,
      createdBy: 'anish.d',
    })
    expect(plan.totals.mousToCreate).toBe(0)
    expect(plan.totals.mousSkipped).toBe(1)
    expect(plan.totals.instalmentsToCreate).toBe(0)
    const mp = plan.mous[0]
    expect(mp?.kind).toBe('skip-existing')
  })

  it('flags orphan-payment situation when payments.json references a missing MOU for the school', () => {
    const plan = buildImportPlan({
      records: [makeRecord({ schoolName: 'Test School' })],
      existingSchools: [makeSchool({ id: 'SCH-EX', name: 'Test School' })],
      existingMous: [],
      existingPayments: [
        {
          id: 'MOU-STEAM-2526-001-i1',
          mouId: 'MOU-STEAM-2526-001',
          schoolName: 'Test School',
        } as Payment,
      ],
      programme: 'STEAM',
      now,
      createdBy: 'anish.d',
    })
    expect(plan.totals.mousOrphanWarnings).toBe(1)
    expect(plan.totals.mousToCreate).toBe(0)
    const mp = plan.mous[0]
    expect(mp).toBeDefined()
    if (!mp) return
    expect(mp.kind).toBe('orphan-payments-detected')
    if (mp.kind === 'orphan-payments-detected') {
      expect(mp.orphanMouIds).toContain('MOU-STEAM-2526-001')
    }
  })
})
