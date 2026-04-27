import { describe, expect, it } from 'vitest'
import { composeThankYou } from './composeThankYou'
import type { IntakeRecord, MOU, Programme, SalesPerson, School, User } from '@/lib/types'

const FIXED_NOW = new Date('2026-04-27T12:00:00Z')

function intake(overrides: Partial<IntakeRecord> = {}): IntakeRecord {
  return {
    id: 'IR-1', mouId: 'MOU-X', completedAt: '2026-04-27T10:00:00Z',
    completedBy: 'misba.m', salesOwnerId: 'sp-vikram',
    location: 'Test City', grades: '4-8',
    recipientName: 'Father V T Jose', recipientDesignation: 'Principal',
    recipientEmail: 'principal@example.test',
    studentsAtIntake: 350, durationYears: 3,
    startDate: '2026-04-01', endDate: '2029-03-31',
    physicalSubmissionStatus: 'Pending', softCopySubmissionStatus: 'Pending',
    productConfirmed: 'STEAM' as Programme, gslTrainingMode: 'GSL Trainer',
    schoolPointOfContactName: 'Dominic', schoolPointOfContactPhone: '+919999999999',
    signedMouUrl: 'https://drive.google.com/test',
    thankYouEmailSentAt: null, auditLog: [],
    ...overrides,
  }
}

function mou(): MOU {
  return {
    id: 'MOU-X', schoolId: 'SCH-X', schoolName: 'Don Bosco',
    programme: 'STEAM' as Programme, programmeSubType: null,
    schoolScope: 'SINGLE', schoolGroupId: null,
    status: 'Active', cohortStatus: 'active',
    academicYear: '2026-27', startDate: '2026-04-01', endDate: '2029-03-31',
    studentsMou: 350, studentsActual: null, studentsVariance: null, studentsVariancePct: null,
    spWithoutTax: 1000, spWithTax: 1180, contractValue: 1000000, received: 0, tds: 0,
    balance: 1000000, receivedPct: 0, paymentSchedule: '', trainerModel: 'GSL-T',
    salesPersonId: 'sp-vikram', templateVersion: null, generatedAt: null, notes: null,
    delayNotes: null, daysToExpiry: null, auditLog: [],
  }
}

function school(): School {
  return {
    id: 'SCH-X', name: 'Don Bosco Krishnanagar', legalEntity: null,
    city: 'Krishnanagar', state: 'West Bengal', region: 'East', pinCode: null,
    contactPerson: null, email: null, phone: null,
    billingName: null, pan: null, gstNumber: null,
    notes: null, active: true, createdAt: '', auditLog: [],
  }
}

function salesPerson(): SalesPerson {
  return {
    id: 'sp-vikram', name: 'Vikram Singh', email: 'vikram@getsetlearn.info',
    phone: null, territories: ['East'], programmes: ['STEAM'],
    active: true, joinedDate: '2025-04-01',
  }
}

function user(): User {
  return {
    id: 'misba.m', name: 'Misba M.', email: 'misba.m@getsetlearn.info',
    role: 'Admin', testingOverride: false, active: true, passwordHash: 'X',
    createdAt: '', auditLog: [],
  }
}

describe('composeThankYou', () => {
  it('renders subject with school name placeholder substituted', () => {
    const out = composeThankYou({
      intake: intake(), mou: mou(), school: school(),
      salesOwner: salesPerson(), sender: user(), now: FIXED_NOW,
    })
    expect(out.subject).toBe('Welcome to GSL: Don Bosco Krishnanagar')
  })

  it('renders body with all placeholders substituted; no {{...}} markers remain', () => {
    const out = composeThankYou({
      intake: intake(), mou: mou(), school: school(),
      salesOwner: salesPerson(), sender: user(), now: FIXED_NOW,
    })
    expect(out.body).toContain('Father V T Jose')
    expect(out.body).toContain('Don Bosco Krishnanagar')
    expect(out.body).toContain('STEAM')
    expect(out.body).toContain('3-year')
    expect(out.body).toContain('Vikram Singh')
    expect(out.body).toContain('https://drive.google.com/test')
    expect(out.body).toContain('Misba M.')
    expect(out.body).toContain('27 April 2026')
    expect(out.body).not.toMatch(/\{\{\w+\}\}/)
  })

  it('falls back to a generic sales contact name when salesOwner is null', () => {
    const out = composeThankYou({
      intake: intake(), mou: mou(), school: school(),
      salesOwner: null, sender: user(), now: FIXED_NOW,
    })
    expect(out.body).toContain('Your sales contact')
  })

  it('to address comes from intake.recipientEmail', () => {
    const out = composeThankYou({
      intake: intake({ recipientEmail: 'custom@school.test' }),
      mou: mou(), school: school(),
      salesOwner: salesPerson(), sender: user(), now: FIXED_NOW,
    })
    expect(out.to).toBe('custom@school.test')
  })

  it('CC list deduplicates anish.d + sender (Phase 1 hardcoded; W4-E swaps to CC rules)', () => {
    const out = composeThankYou({
      intake: intake(), mou: mou(), school: school(),
      salesOwner: salesPerson(), sender: user(), now: FIXED_NOW,
    })
    expect(out.ccEmails).toContain('anish.d@getsetlearn.info')
    expect(out.ccEmails).toContain('misba.m@getsetlearn.info')
    // De-dup: when sender is Anish, the CC list shouldn't repeat Anish.
    const out2 = composeThankYou({
      intake: intake(), mou: mou(), school: school(),
      salesOwner: salesPerson(),
      sender: { ...user(), email: 'anish.d@getsetlearn.info' },
      now: FIXED_NOW,
    })
    expect(out2.ccEmails.filter((e) => e === 'anish.d@getsetlearn.info')).toHaveLength(1)
  })
})
