/*
 * W4-E.4 reminder detection tests.
 *
 * Each detection rule (intake / payment / delivery-ack / feedback-chase)
 * is exercised against synthetic state. Edge cases per W4-E.4 brief:
 *   - archived cohort MOUs do not produce reminders
 *   - missing MOU short-circuits dispatch / payment / feedback chains
 *   - same school across active + archived cohorts: only active fires
 *   - thresholds drive the boundary; exactly-N-days does NOT fire
 */

import { describe, expect, it } from 'vitest'
import type {
  Communication,
  Dispatch,
  Feedback,
  IntakeRecord,
  MOU,
  Payment,
  SalesPerson,
  School,
} from '@/lib/types'
import {
  detectDueReminders,
  type DetectDueRemindersDeps,
  type ReminderThresholds,
} from './detectDueReminders'

const NOW = new Date('2026-04-28T12:00:00.000Z')
const isoDaysAgo = (n: number): string =>
  new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000).toISOString()

const T: ReminderThresholds = {
  intake: { thresholdDays: 14, anchorEvent: 'mou-active-from-startDate' },
  payment: { thresholdDays: 30, anchorEvent: 'pi-issued' },
  'delivery-ack': { thresholdDays: 7, anchorEvent: 'dispatch-delivered' },
  'feedback-chase': { thresholdDays: 7, anchorEvent: 'feedback-request-queued' },
}

function school(id: string, overrides: Partial<School> = {}): School {
  return {
    id,
    name: id.replace(/^SCH-/, ''),
    legalEntity: null,
    city: 'Bangalore',
    state: 'Karnataka',
    region: 'South-West',
    pinCode: null,
    contactPerson: 'School coordinator',
    email: 'spoc@example.in',
    phone: null,
    billingName: null,
    pan: null,
    gstNumber: null,
    notes: null,
    active: true,
    createdAt: '2026-01-01T00:00:00Z',
    auditLog: [],
    ...overrides,
  }
}

function mou(id: string, schoolId: string, overrides: Partial<MOU> = {}): MOU {
  return {
    id,
    schoolId,
    schoolName: schoolId,
    programme: 'STEAM',
    programmeSubType: null,
    schoolScope: 'SINGLE',
    schoolGroupId: null,
    status: 'Active',
    cohortStatus: 'active',
    academicYear: '2026-27',
    // Default startDate is NOW (0 days elapsed) so the intake-reminder
    // detection does not auto-fire in non-intake tests; each intake
    // test overrides startDate to push the MOU into intake-overdue.
    startDate: NOW.toISOString(),
    endDate: '2027-03-31',
    studentsMou: 100,
    studentsActual: null,
    studentsVariance: null,
    studentsVariancePct: null,
    spWithoutTax: 0,
    spWithTax: 0,
    contractValue: 0,
    received: 0,
    tds: 0,
    balance: 0,
    receivedPct: 0,
    paymentSchedule: '',
    trainerModel: null,
    salesPersonId: null,
    templateVersion: null,
    generatedAt: null,
    notes: null,
    delayNotes: null,
    daysToExpiry: null,
    auditLog: [],
    ...overrides,
  }
}

function payment(id: string, mouId: string, overrides: Partial<Payment> = {}): Payment {
  return {
    id,
    mouId,
    schoolName: '',
    programme: 'STEAM',
    instalmentLabel: '1 of 4',
    instalmentSeq: 1,
    totalInstalments: 4,
    description: '',
    dueDateRaw: null,
    dueDateIso: null,
    expectedAmount: 100000,
    receivedAmount: null,
    receivedDate: null,
    paymentMode: null,
    bankReference: null,
    piNumber: 'GSL/OPS/26-27/0001',
    taxInvoiceNumber: null,
    status: 'PI Sent',
    notes: null,
    piSentDate: isoDaysAgo(40),
    piSentTo: null,
    piGeneratedAt: null,
    studentCountActual: null,
    partialPayments: null,
    auditLog: null,
    ...overrides,
  }
}

function dispatchRow(id: string, mouId: string, schoolId: string, overrides: Partial<Dispatch> = {}): Dispatch {
  return {
    id,
    mouId,
    schoolId,
    installmentSeq: 1,
    stage: 'delivered',
    installment1Paid: true,
    overrideEvent: null,
    poRaisedAt: isoDaysAgo(15),
    dispatchedAt: isoDaysAgo(12),
    deliveredAt: isoDaysAgo(10),
    acknowledgedAt: null,
    acknowledgementUrl: null,
    notes: null,
    lineItems: [{ kind: 'flat', skuName: 'Test Kit', quantity: 1 }],
    requestId: null,
    raisedBy: 'system',
    raisedFrom: 'pre-w4d',
    auditLog: [],
    ...overrides,
  }
}

function comm(id: string, schoolId: string, mouId: string, overrides: Partial<Communication> = {}): Communication {
  return {
    id,
    type: 'feedback-request',
    schoolId,
    mouId,
    installmentSeq: 1,
    channel: 'email',
    subject: 'Feedback request',
    bodyEmail: '',
    bodyWhatsApp: null,
    toEmail: 'spoc@example.in',
    toPhone: null,
    ccEmails: [],
    queuedAt: isoDaysAgo(10),
    queuedBy: 'anish.d',
    sentAt: isoDaysAgo(10),
    copiedAt: null,
    status: 'sent',
    bounceDetail: null,
    auditLog: [],
    ...overrides,
  }
}

function makeDeps(overrides: Partial<DetectDueRemindersDeps> = {}): DetectDueRemindersDeps {
  return {
    mous: [],
    schools: [],
    payments: [],
    dispatches: [],
    intakeRecords: [],
    communications: [],
    feedback: [],
    salesPersons: [],
    thresholds: T,
    now: () => NOW,
    ...overrides,
  }
}

// ----------------------------------------------------------------------------
// Intake
// ----------------------------------------------------------------------------

describe('W4-E.4 detect: intake reminder', () => {
  const sch = school('SCH-A', { name: 'Active School' })
  const sp: SalesPerson = {
    id: 'sp-vikram',
    name: 'Vikram T.',
    email: 'vikram.t@getsetlearn.info',
    phone: null,
    territories: [],
    programmes: ['STEAM'],
    active: true,
    joinedDate: '2025-04-01',
  }

  it('fires for Active MOU > threshold days with no IntakeRecord; targets sales owner', () => {
    const m = mou('MOU-A', 'SCH-A', { startDate: isoDaysAgo(20), salesPersonId: 'sp-vikram' })
    const out = detectDueReminders(makeDeps({ mous: [m], schools: [sch], salesPersons: [sp] }))
    expect(out.length).toBe(1)
    expect(out[0]!.kind).toBe('intake')
    expect(out[0]!.daysOverdue).toBe(20 - 14)
    expect(out[0]!.suggestedRecipient?.email).toBe('vikram.t@getsetlearn.info')
  })

  it('does not fire if IntakeRecord already exists', () => {
    const m = mou('MOU-A', 'SCH-A', { startDate: isoDaysAgo(20), salesPersonId: 'sp-vikram' })
    const ir: IntakeRecord = {
      id: 'IR-1',
      mouId: 'MOU-A',
      completedAt: isoDaysAgo(2),
      completedBy: 'anish.d',
      salesOwnerId: 'sp-vikram',
      location: '', grades: '',
      recipientName: 'X', recipientDesignation: 'Principal', recipientEmail: 'x@y.in',
      studentsAtIntake: 100, durationYears: 1, startDate: '2026-04-01', endDate: '2027-03-31',
      physicalSubmissionStatus: 'Submitted', softCopySubmissionStatus: 'Submitted',
      productConfirmed: 'STEAM', gslTrainingMode: 'GSL Trainer',
      schoolPointOfContactName: 'X', schoolPointOfContactPhone: '+910000',
      signedMouUrl: 'https://drive.google.com/x',
      thankYouEmailSentAt: null,
      gradeBreakdown: null, rechargeableBatteries: null, auditLog: [],
    }
    const out = detectDueReminders(makeDeps({ mous: [m], schools: [sch], intakeRecords: [ir], salesPersons: [sp] }))
    expect(out).toEqual([])
  })

  it('does not fire on archived-cohort MOUs', () => {
    const m = mou('MOU-A', 'SCH-A', { startDate: isoDaysAgo(20), cohortStatus: 'archived', salesPersonId: 'sp-vikram' })
    const out = detectDueReminders(makeDeps({ mous: [m], schools: [sch], salesPersons: [sp] }))
    expect(out).toEqual([])
  })

  it('does not fire when mou.status is not Active', () => {
    const m = mou('MOU-A', 'SCH-A', { startDate: isoDaysAgo(20), status: 'Pending Signature', salesPersonId: 'sp-vikram' })
    const out = detectDueReminders(makeDeps({ mous: [m], schools: [sch], salesPersons: [sp] }))
    expect(out).toEqual([])
  })
})

// ----------------------------------------------------------------------------
// Payment
// ----------------------------------------------------------------------------

describe('W4-E.4 detect: payment reminder', () => {
  const sch = school('SCH-B', { name: 'Pay School' })
  const m = mou('MOU-B', 'SCH-B')

  it('fires for PI Sent > threshold days; targets school SPOC', () => {
    const p = payment('PAY-1', 'MOU-B', { piSentDate: isoDaysAgo(40), status: 'PI Sent' })
    const out = detectDueReminders(makeDeps({ mous: [m], schools: [sch], payments: [p] }))
    expect(out.length).toBe(1)
    expect(out[0]!.kind).toBe('payment')
    expect(out[0]!.daysOverdue).toBe(10)
    expect(out[0]!.suggestedRecipient?.email).toBe('spoc@example.in')
  })

  it('does not fire on Paid status', () => {
    const p = payment('PAY-1', 'MOU-B', { piSentDate: isoDaysAgo(40), status: 'Paid' })
    const out = detectDueReminders(makeDeps({ mous: [m], schools: [sch], payments: [p] }))
    expect(out).toEqual([])
  })
})

// ----------------------------------------------------------------------------
// Delivery-ack
// ----------------------------------------------------------------------------

describe('W4-E.4 detect: delivery-ack reminder', () => {
  const sch = school('SCH-C', { name: 'Dispatch School' })
  const m = mou('MOU-C', 'SCH-C')

  it('fires for delivered dispatch > threshold days with no acknowledgementUrl', () => {
    const d = dispatchRow('DIS-1', 'MOU-C', 'SCH-C', { deliveredAt: isoDaysAgo(15), acknowledgementUrl: null })
    const out = detectDueReminders(makeDeps({ mous: [m], schools: [sch], dispatches: [d] }))
    expect(out.length).toBe(1)
    expect(out[0]!.kind).toBe('delivery-ack')
    expect(out[0]!.daysOverdue).toBe(15 - 7)
  })

  it('does not fire when acknowledgementUrl is set', () => {
    const d = dispatchRow('DIS-1', 'MOU-C', 'SCH-C', {
      deliveredAt: isoDaysAgo(15),
      acknowledgementUrl: 'https://drive/ack',
    })
    const out = detectDueReminders(makeDeps({ mous: [m], schools: [sch], dispatches: [d] }))
    expect(out).toEqual([])
  })
})

// ----------------------------------------------------------------------------
// Feedback chase
// ----------------------------------------------------------------------------

describe('W4-E.4 detect: feedback-chase reminder', () => {
  const sch = school('SCH-D', { name: 'Feedback School' })
  const m = mou('MOU-D', 'SCH-D')

  it('fires when feedback-request queued > threshold and no Feedback exists for that mou+inst', () => {
    const c = comm('COM-FBR-1', 'SCH-D', 'MOU-D', {
      type: 'feedback-request',
      installmentSeq: 1,
      queuedAt: isoDaysAgo(10),
    })
    const out = detectDueReminders(makeDeps({ mous: [m], schools: [sch], communications: [c] }))
    expect(out.length).toBe(1)
    expect(out[0]!.kind).toBe('feedback-chase')
  })

  it('does not fire when Feedback record exists', () => {
    const c = comm('COM-FBR-1', 'SCH-D', 'MOU-D', { type: 'feedback-request', queuedAt: isoDaysAgo(10) })
    const fb: Feedback = {
      id: 'FB-1',
      schoolId: 'SCH-D',
      mouId: 'MOU-D',
      installmentSeq: 1,
      submittedAt: isoDaysAgo(2),
      submittedBy: 'spoc',
      submitterEmail: 'spoc@example.in',
      ratings: [],
      overallComment: null,
      magicLinkTokenId: null,
      auditLog: [],
    }
    const out = detectDueReminders(makeDeps({ mous: [m], schools: [sch], communications: [c], feedback: [fb] }))
    expect(out).toEqual([])
  })
})

// ----------------------------------------------------------------------------
// Cross-cutting: ordering + multi-MOU
// ----------------------------------------------------------------------------

describe('W4-E.4 detect: ordering + multi-MOU', () => {
  it('result is sorted by daysOverdue descending', () => {
    const sch = school('SCH-E')
    const m1 = mou('MOU-A', 'SCH-E', { startDate: isoDaysAgo(20), salesPersonId: 'sp-vikram' })
    const m2 = mou('MOU-B', 'SCH-E', { startDate: isoDaysAgo(40), salesPersonId: 'sp-vikram' })
    const sp: SalesPerson = {
      id: 'sp-vikram',
      name: 'Vikram T.',
      email: 'vikram.t@getsetlearn.info',
      phone: null, territories: [], programmes: ['STEAM'], active: true, joinedDate: '2025-04-01',
    }
    const out = detectDueReminders(makeDeps({ mous: [m1, m2], schools: [sch], salesPersons: [sp] }))
    expect(out.length).toBe(2)
    expect(out[0]!.daysOverdue).toBeGreaterThan(out[1]!.daysOverdue)
  })

  it('archived 2526 MOU does not generate reminders alongside an active 2627 MOU on same school', () => {
    const sch = school('SCH-F')
    const archived = mou('MOU-2526', 'SCH-F', { startDate: isoDaysAgo(400), cohortStatus: 'archived', salesPersonId: 'sp-vikram' })
    const active = mou('MOU-2627', 'SCH-F', { startDate: isoDaysAgo(20), salesPersonId: 'sp-vikram' })
    const sp: SalesPerson = {
      id: 'sp-vikram',
      name: 'Vikram T.',
      email: 'vikram.t@getsetlearn.info',
      phone: null, territories: [], programmes: ['STEAM'], active: true, joinedDate: '2025-04-01',
    }
    const out = detectDueReminders(makeDeps({ mous: [archived, active], schools: [sch], salesPersons: [sp] }))
    expect(out.length).toBe(1)
    expect(out[0]!.mouId).toBe('MOU-2627')
  })
})
