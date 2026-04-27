/*
 * deriveStage tests (W3-C C1).
 *
 * Pure-function coverage of the kanban stage adapter. Synthetic-inline
 * fixtures only; no disk dependency, future fixture refreshes leave
 * the suite green.
 */

import { describe, expect, it } from 'vitest'
import {
  deriveStage,
  hasDrift,
  KANBAN_COLUMNS,
  type DeriveStageDeps,
} from './deriveStage'
import type {
  Dispatch,
  Feedback,
  MOU,
  Payment,
  Programme,
} from '@/lib/types'

function mou(overrides: Partial<MOU> & Pick<MOU, 'id'>): MOU {
  return {
    schoolId: 'SCH-T',
    schoolName: 'Test School',
    programme: 'STEAM' as Programme,
    programmeSubType: null,
    schoolScope: 'SINGLE',
    schoolGroupId: null,
    status: 'Active',
    cohortStatus: 'active',
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
    received: 0,
    tds: 0,
    balance: 1_000_000,
    receivedPct: 0,
    paymentSchedule: '',
    trainerModel: null,
    salesPersonId: null,
    templateVersion: null,
    generatedAt: null,
    notes: null,
    daysToExpiry: null, delayNotes: null,
    auditLog: [],
    ...overrides,
  }
}

const emptyDeps: DeriveStageDeps = {
  dispatches: [],
  payments: [],
  communications: [],
  feedback: [],
}

describe('deriveStage', () => {
  it('Pending Signature MOU lands in Pre-Ops', () => {
    const m = mou({ id: 'M1', status: 'Pending Signature' })
    expect(deriveStage(m, emptyDeps)).toBe('pre-ops')
  })

  it('Draft MOU also lands in Pre-Ops', () => {
    const m = mou({ id: 'M2', status: 'Draft' })
    expect(deriveStage(m, emptyDeps)).toBe('pre-ops')
  })

  it('Active MOU with null startDate uses AY-start synthetic; lands at post-signing-intake when no IntakeRecord exists', () => {
    // W4-C.1: mou-signed completes via AY-fallback; without an IntakeRecord
    // the card sits at the new post-signing-intake stage (was actuals-confirmed pre-W4-C).
    const m = mou({ id: 'M3', startDate: null, studentsActual: null })
    expect(deriveStage(m, emptyDeps)).toBe('post-signing-intake')
  })

  it('Active MOU with malformed academicYear AND null startDate lands at mou-signed', () => {
    const m = mou({ id: 'M4', startDate: null, academicYear: 'malformed' })
    expect(deriveStage(m, emptyDeps)).toBe('mou-signed')
  })

  it('Active MOU with IntakeRecord but null studentsActual lands at actuals-confirmed (W4-C.1)', () => {
    const m = mou({ id: 'M5b', studentsActual: null })
    const intakeRecord = {
      id: 'IR-1', mouId: 'M5b', completedAt: '2026-04-15T10:00:00Z',
      completedBy: 'misba.m', salesOwnerId: 'sp-vikram',
      location: 'Test', grades: '1-8', recipientName: 'P', recipientDesignation: 'Principal',
      recipientEmail: 'p@example.test', studentsAtIntake: 200, durationYears: 2,
      startDate: '2026-04-01', endDate: '2028-03-31',
      physicalSubmissionStatus: 'Pending' as const, softCopySubmissionStatus: 'Pending' as const,
      productConfirmed: 'STEAM' as const, gslTrainingMode: 'GSL Trainer' as const,
      schoolPointOfContactName: 'P', schoolPointOfContactPhone: '+919999999999',
      signedMouUrl: 'https://drive.google.com/test', thankYouEmailSentAt: null, auditLog: [],
    }
    expect(deriveStage(m, { ...emptyDeps, intakeRecords: [intakeRecord] })).toBe('actuals-confirmed')
  })

  it('Active MOU with studentsActual!=null but no IntakeRecord halts at post-signing-intake (W4-C.1 gate)', () => {
    // W4-C.1: even with studentsActual set, the intake gate is mandatory
    // for active-cohort MOUs. Card sits at post-signing-intake until the
    // intake form is submitted.
    const m = mou({ id: 'M5', studentsActual: 200 })
    expect(deriveStage(m, emptyDeps)).toBe('post-signing-intake')
  })

  it('Archived MOU with studentsActual!=null auto-skips post-signing-intake (W4-C.1 inheritance)', () => {
    // Archived cohort MOUs predate W4-C; the intake gate inherits from
    // signedDate so the lifecycle visualisation continues to reflect the
    // post-actuals state.
    const m = mou({ id: 'M5a', cohortStatus: 'archived', studentsActual: 200 })
    expect(deriveStage(m, emptyDeps)).toBe('invoice-raised')
  })

  it('payment with piNumber advances past invoice-raised', () => {
    const m = mou({ id: 'M6', cohortStatus: 'archived', studentsActual: 200 })
    const payment: Payment = {
      id: 'P1', mouId: 'M6', schoolName: 'X', programme: 'STEAM',
      instalmentLabel: '1', instalmentSeq: 1, totalInstalments: 1, description: '',
      dueDateRaw: null, dueDateIso: '2026-05-01', expectedAmount: 1, receivedAmount: null,
      receivedDate: null, paymentMode: null, bankReference: null,
      piNumber: 'GSL/OPS/26-27/0001', taxInvoiceNumber: null,
      status: 'PI Sent', notes: null,
      piSentDate: '2026-04-15', piSentTo: null, piGeneratedAt: '2026-04-15',
      studentCountActual: null, partialPayments: null, auditLog: null,
    }
    expect(deriveStage(m, { ...emptyDeps, payments: [payment] })).toBe('payment-received')
  })

  it('received payment advances past payment-received', () => {
    const m = mou({ id: 'M7', cohortStatus: 'archived', studentsActual: 200 })
    const piPayment: Payment = {
      id: 'P1', mouId: 'M7', schoolName: 'X', programme: 'STEAM',
      instalmentLabel: '1', instalmentSeq: 1, totalInstalments: 1, description: '',
      dueDateRaw: null, dueDateIso: '2026-05-01', expectedAmount: 1, receivedAmount: null,
      receivedDate: null, paymentMode: null, bankReference: null,
      piNumber: 'GSL/OPS/26-27/0001', taxInvoiceNumber: null,
      status: 'PI Sent', notes: null,
      piSentDate: '2026-04-15', piSentTo: null, piGeneratedAt: '2026-04-15',
      studentCountActual: null, partialPayments: null, auditLog: null,
    }
    const recvPayment: Payment = { ...piPayment, id: 'P2', status: 'Received', receivedDate: '2026-05-10' }
    expect(deriveStage(m, { ...emptyDeps, payments: [piPayment, recvPayment] })).toBe('kit-dispatched')
  })

  it('dispatched but not delivered lands at delivery-acknowledged', () => {
    const m = mou({ id: 'M8', cohortStatus: 'archived', studentsActual: 200 })
    const piPayment: Payment = {
      id: 'P1', mouId: 'M8', schoolName: 'X', programme: 'STEAM',
      instalmentLabel: '1', instalmentSeq: 1, totalInstalments: 1, description: '',
      dueDateRaw: null, dueDateIso: '2026-05-01', expectedAmount: 1, receivedAmount: null,
      receivedDate: '2026-05-10', paymentMode: null, bankReference: null,
      piNumber: 'GSL/OPS/26-27/0001', taxInvoiceNumber: null,
      status: 'Received', notes: null,
      piSentDate: '2026-04-15', piSentTo: null, piGeneratedAt: '2026-04-15',
      studentCountActual: null, partialPayments: null, auditLog: null,
    }
    const dispatch: Dispatch = {
      id: 'D1', mouId: 'M8', schoolId: 'SCH-T', installmentSeq: 1,
      stage: 'dispatched', installment1Paid: true, overrideEvent: null,
      poRaisedAt: '2026-05-15', dispatchedAt: '2026-05-16',
      deliveredAt: null, acknowledgedAt: null,
      acknowledgementUrl: null, notes: null,
      lineItems: [{ kind: 'flat', skuName: 'Test SKU', quantity: 1 }],
      requestId: null, raisedBy: 'system-test', raisedFrom: 'ops-direct',
      auditLog: [],
    }
    expect(deriveStage(m, { ...emptyDeps, payments: [piPayment], dispatches: [dispatch] })).toBe('delivery-acknowledged')
  })

  it('feedback submitted is the terminal stage', () => {
    const m = mou({ id: 'M9', cohortStatus: 'archived', studentsActual: 200 })
    const recvPayment: Payment = {
      id: 'P1', mouId: 'M9', schoolName: 'X', programme: 'STEAM',
      instalmentLabel: '1', instalmentSeq: 1, totalInstalments: 1, description: '',
      dueDateRaw: null, dueDateIso: '2026-05-01', expectedAmount: 1, receivedAmount: 1,
      receivedDate: '2026-05-10', paymentMode: 'Bank Transfer', bankReference: null,
      piNumber: 'GSL/OPS/26-27/0001', taxInvoiceNumber: null,
      status: 'Received', notes: null,
      piSentDate: '2026-04-15', piSentTo: null, piGeneratedAt: '2026-04-15',
      studentCountActual: null, partialPayments: null, auditLog: null,
    }
    const ackedDispatch: Dispatch = {
      id: 'D1', mouId: 'M9', schoolId: 'SCH-T', installmentSeq: 1,
      stage: 'acknowledged', installment1Paid: true, overrideEvent: null,
      poRaisedAt: '2026-05-15', dispatchedAt: '2026-05-16',
      deliveredAt: '2026-05-20', acknowledgedAt: '2026-05-22',
      acknowledgementUrl: 'https://x', notes: null,
      lineItems: [{ kind: 'flat', skuName: 'Test SKU', quantity: 1 }],
      requestId: null, raisedBy: 'system-test', raisedFrom: 'ops-direct',
      auditLog: [],
    }
    const fb: Feedback = {
      id: 'F1', schoolId: 'SCH-T', mouId: 'M9', installmentSeq: 1,
      submittedAt: '2026-06-01', submittedBy: 'spoc', submitterEmail: null,
      ratings: [], overallComment: null, magicLinkTokenId: null, auditLog: [],
    }
    expect(deriveStage(m, { ...emptyDeps, payments: [recvPayment], dispatches: [ackedDispatch], feedback: [fb] })).toBe('feedback-submitted')
  })

  it('records linked to a different mouId are ignored', () => {
    const m = mou({ id: 'M10', cohortStatus: 'archived', studentsActual: 200 })
    const otherPayment: Payment = {
      id: 'P-OTHER', mouId: 'OTHER-MOU', schoolName: 'X', programme: 'STEAM',
      instalmentLabel: '1', instalmentSeq: 1, totalInstalments: 1, description: '',
      dueDateRaw: null, dueDateIso: '2026-05-01', expectedAmount: 1, receivedAmount: null,
      receivedDate: null, paymentMode: null, bankReference: null,
      piNumber: 'GSL/OPS/26-27/9999', taxInvoiceNumber: null,
      status: 'PI Sent', notes: null,
      piSentDate: '2026-04-15', piSentTo: null, piGeneratedAt: '2026-04-15',
      studentCountActual: null, partialPayments: null, auditLog: null,
    }
    expect(deriveStage(m, { ...emptyDeps, payments: [otherPayment] })).toBe('invoice-raised')
  })

  it('determinism: same inputs return same stage across calls', () => {
    const m = mou({ id: 'M11', studentsActual: 200 })
    expect(deriveStage(m, emptyDeps)).toBe(deriveStage(m, emptyDeps))
  })
})

describe('hasDrift', () => {
  it('returns false when studentsVariancePct is null', () => {
    expect(hasDrift(mou({ id: 'X', studentsVariancePct: null }))).toBe(false)
  })

  it('returns false within +/- 10%', () => {
    expect(hasDrift(mou({ id: 'X', studentsVariancePct: 0.05 }))).toBe(false)
    expect(hasDrift(mou({ id: 'X', studentsVariancePct: -0.10 }))).toBe(false)
  })

  it('returns true outside +/- 10%', () => {
    expect(hasDrift(mou({ id: 'X', studentsVariancePct: 0.11 }))).toBe(true)
    expect(hasDrift(mou({ id: 'X', studentsVariancePct: -0.25 }))).toBe(true)
  })
})

describe('KANBAN_COLUMNS', () => {
  it('Pre-Ops is the first column and the only muted variant', () => {
    expect(KANBAN_COLUMNS[0]?.key).toBe('pre-ops')
    expect(KANBAN_COLUMNS[0]?.variant).toBe('muted')
    const muted = KANBAN_COLUMNS.filter((c) => c.variant === 'muted')
    expect(muted).toHaveLength(1)
  })

  it('exactly 10 columns: Pre-Ops + 9 lifecycle stages (W4-C.1 added post-signing-intake)', () => {
    expect(KANBAN_COLUMNS).toHaveLength(10)
    expect(KANBAN_COLUMNS.find((c) => c.key === 'post-signing-intake')).toBeDefined()
  })

  it('post-signing-intake sits between mou-signed and actuals-confirmed', () => {
    const idx = KANBAN_COLUMNS.findIndex((c) => c.key === 'post-signing-intake')
    expect(KANBAN_COLUMNS[idx - 1]?.key).toBe('mou-signed')
    expect(KANBAN_COLUMNS[idx + 1]?.key).toBe('actuals-confirmed')
  })
})
