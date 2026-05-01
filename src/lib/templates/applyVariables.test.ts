import { describe, expect, it } from 'vitest'
import {
  applyVariables,
  availableVariablesFor,
  buildVariableValues,
  placeholderFor,
} from './applyVariables'
import type {
  Dispatch,
  IntakeRecord,
  MOU,
  Payment,
  SalesPerson,
  School,
  User,
} from '@/lib/types'

const FIXED_NOW = new Date('2026-05-08T10:00:00.000Z')

function mou(overrides: Partial<MOU> = {}): MOU {
  return {
    id: 'MOU-X', schoolId: 'SCH-X', schoolName: 'Sample School',
    programme: 'STEAM', programmeSubType: null, schoolScope: 'SINGLE',
    schoolGroupId: null, status: 'Active', cohortStatus: 'active',
    academicYear: '2026-27', startDate: '2026-04-01', endDate: '2027-03-31',
    studentsMou: 100, studentsActual: null, studentsVariance: null,
    studentsVariancePct: null, spWithoutTax: 4000, spWithTax: 5000,
    contractValue: 500000, received: 0, tds: 0, balance: 500000,
    receivedPct: 0, paymentSchedule: '', trainerModel: 'GSL-T',
    salesPersonId: null, templateVersion: null, generatedAt: null,
    notes: null, delayNotes: null, daysToExpiry: null, auditLog: [],
    ...overrides,
  }
}

function school(overrides: Partial<School> = {}): School {
  return {
    id: 'SCH-X', name: 'Sample School', legalEntity: null,
    city: 'Pune', state: 'MH', region: 'South-West', pinCode: null,
    contactPerson: 'Mr. Rao', email: 'rao@school.test', phone: null,
    billingName: null, pan: null, gstNumber: null, notes: null,
    active: true, createdAt: '', auditLog: [],
    ...overrides,
  }
}

function intake(overrides: Partial<IntakeRecord> = {}): IntakeRecord {
  return {
    id: 'IR-X', mouId: 'MOU-X', completedAt: '', completedBy: '',
    salesOwnerId: 'sp-x', location: 'Pune', grades: '1-8',
    recipientName: 'Father V T Jose', recipientDesignation: 'Principal',
    recipientEmail: 'principal@school.test', studentsAtIntake: 200,
    durationYears: 3, startDate: '2026-04-01', endDate: '2029-03-31',
    physicalSubmissionStatus: 'Pending', softCopySubmissionStatus: 'Pending',
    productConfirmed: 'STEAM', gslTrainingMode: 'GSL Trainer',
    schoolPointOfContactName: 'Vice Principal',
    schoolPointOfContactPhone: '+919999999999',
    signedMouUrl: 'https://drive.google.com/x',
    thankYouEmailSentAt: null, gradeBreakdown: null,
    rechargeableBatteries: null, auditLog: [],
    ...overrides,
  }
}

function rep(overrides: Partial<SalesPerson> = {}): SalesPerson {
  return {
    id: 'sp-x', name: 'Roveena Mendes', email: 'roveena@gsl.test',
    phone: null, territories: [], programmes: [], active: true,
    joinedDate: '2026-01-01',
    ...overrides,
  }
}

function user(overrides: Partial<User> = {}): User {
  return {
    id: 'misba.m', name: 'Misba Mehta', email: 'misba@gsl.test',
    role: 'OpsHead', testingOverride: false, active: true,
    passwordHash: 'X', createdAt: '', auditLog: [],
    ...overrides,
  }
}

describe('placeholderFor', () => {
  it('uppercases camelCase with spaces', () => {
    expect(placeholderFor('recipientName')).toBe('[RECIPIENT NAME]')
    expect(placeholderFor('signedMouUrl')).toBe('[SIGNED MOU URL]')
    expect(placeholderFor('schoolName')).toBe('[SCHOOL NAME]')
  })

  it('handles single-word names', () => {
    expect(placeholderFor('programme')).toBe('[PROGRAMME]')
  })
})

describe('availableVariablesFor', () => {
  it('welcome surfaces 8 variables', () => {
    const v = availableVariablesFor('welcome')
    expect(v).toContain('schoolName')
    expect(v).toContain('salesOwnerName')
    expect(v).not.toContain('instalmentLabel')
  })

  it('payment-reminder includes instalmentLabel + piNumber', () => {
    const v = availableVariablesFor('payment-reminder')
    expect(v).toContain('instalmentLabel')
    expect(v).toContain('piNumber')
    expect(v).toContain('expectedAmount')
  })

  it('custom is the union (most variables)', () => {
    const custom = availableVariablesFor('custom')
    const welcome = availableVariablesFor('welcome')
    for (const v of welcome) expect(custom).toContain(v)
  })
})

describe('applyVariables', () => {
  it('substitutes all available variables from full context', () => {
    const result = applyVariables(
      'Hello {{recipientName}}, welcome to {{programme}} at {{schoolName}}.',
      {
        mou: mou(), school: school(), intake: intake(),
        salesOwner: rep(), sender: user(), now: FIXED_NOW,
      },
    )
    expect(result.rendered).toBe('Hello Father V T Jose, welcome to STEAM at Sample School.')
    expect(result.filled.sort()).toEqual(['programme', 'recipientName', 'schoolName'])
    expect(result.missing).toEqual([])
  })

  it('renders missing variables as [VARIABLE NAME]', () => {
    const result = applyVariables(
      'Order {{dispatchId}} for {{schoolName}}.',
      { mou: mou(), school: school(), now: FIXED_NOW },  // no dispatch
    )
    expect(result.rendered).toBe('Order [DISPATCH ID] for Sample School.')
    expect(result.missing).toContain('dispatchId')
    expect(result.filled).toContain('schoolName')
  })

  it('formats expectedAmount as INR currency', () => {
    const payment: Payment = {
      id: 'X', mouId: 'MOU-X', schoolName: 'X', programme: 'STEAM',
      instalmentLabel: '1 of 4', instalmentSeq: 1, totalInstalments: 4,
      description: '', dueDateRaw: null, dueDateIso: null,
      expectedAmount: 125000, receivedAmount: null, receivedDate: null,
      paymentMode: null, bankReference: null, piNumber: 'GSL/OPS/26-27/0001',
      taxInvoiceNumber: null, status: 'Pending', notes: null,
      piSentDate: null, piSentTo: null, piGeneratedAt: null,
      studentCountActual: null, partialPayments: null, auditLog: null,
    }
    const result = applyVariables(
      'Amount due: {{expectedAmount}} for {{instalmentLabel}}.',
      { payment, now: FIXED_NOW },
    )
    // Indian rupee formatting: ?1,25,000 (lakh-grouped) - we don't lock the
    // exact glyph since Intl format varies subtly across runtimes; just
    // assert the digits + label appear.
    expect(result.rendered).toMatch(/1,25,000/)
    expect(result.rendered).toContain('1 of 4')
  })

  it('formats currentDate via en-GB long form', () => {
    const result = applyVariables(
      'Date: {{currentDate}}',
      { now: new Date('2026-05-08T10:00:00.000Z') },
    )
    expect(result.rendered).toBe('Date: 8 May 2026')
  })

  it('expectedDelivery = dispatchedAt + 7 days', () => {
    const dispatch: Dispatch = {
      id: 'DSP-X', mouId: 'MOU-X', schoolId: 'SCH-X', installmentSeq: 1,
      stage: 'dispatched', installment1Paid: true, overrideEvent: null,
      poRaisedAt: null, dispatchedAt: '2026-05-01T00:00:00Z',
      deliveredAt: null, acknowledgedAt: null, acknowledgementUrl: null,
      notes: null, lineItems: [], requestId: null, raisedBy: 'u',
      raisedFrom: 'ops-direct', auditLog: [],
    }
    const result = applyVariables(
      'Expected delivery: {{expectedDelivery}}',
      { dispatch, now: FIXED_NOW },
    )
    expect(result.rendered).toBe('Expected delivery: 2026-05-08')
  })

  it('falls back to school.contactPerson when intake recipient is missing', () => {
    const result = applyVariables(
      'Hello {{recipientName}}.',
      { school: school({ contactPerson: 'School Coord' }), now: FIXED_NOW },
    )
    expect(result.rendered).toBe('Hello School Coord.')
  })

  it('placeholders for variables not declared in context', () => {
    const result = applyVariables(
      '{{undeclaredCustom}} test',
      { now: FIXED_NOW },
    )
    expect(result.rendered).toBe('[UNDECLARED CUSTOM] test')
    expect(result.missing).toEqual(['undeclaredCustom'])
  })

  it('handles a template with no placeholders cleanly', () => {
    const result = applyVariables('Static text only.', { now: FIXED_NOW })
    expect(result.rendered).toBe('Static text only.')
    expect(result.filled).toEqual([])
    expect(result.missing).toEqual([])
  })

  it('repeated variable counts as a single fill', () => {
    const result = applyVariables(
      '{{schoolName}} ({{schoolName}})',
      { school: school(), now: FIXED_NOW },
    )
    expect(result.rendered).toBe('Sample School (Sample School)')
    expect(result.filled).toEqual(['schoolName'])
  })
})

describe('buildVariableValues', () => {
  it('returns undefined for variables without context source', () => {
    const values = buildVariableValues({ now: FIXED_NOW })
    expect(values.schoolName).toBeUndefined()
    expect(values.programme).toBeUndefined()
    expect(values.currentDate).toBe('8 May 2026')
  })

  it('intake values take precedence over MOU baseline', () => {
    const m = mou({ startDate: '2025-04-01' })
    const i = intake({ startDate: '2026-04-01' })
    const values = buildVariableValues({ mou: m, intake: i, now: FIXED_NOW })
    expect(values.startDate).toBe('2026-04-01')
  })
})
