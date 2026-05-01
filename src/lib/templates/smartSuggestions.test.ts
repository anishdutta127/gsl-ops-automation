import { describe, expect, it } from 'vitest'
import { getSmartTemplateSuggestions } from './smartSuggestions'
import type {
  CommunicationTemplate,
  Dispatch,
  IntakeRecord,
  MOU,
  Payment,
  TemplateUseCase,
} from '@/lib/types'

const FIXED_NOW = new Date('2026-05-08T10:00:00.000Z')

function template(useCase: TemplateUseCase, overrides: Partial<CommunicationTemplate> = {}): CommunicationTemplate {
  return {
    id: `TPL-${useCase}`, name: useCase, useCase, subject: 'X',
    bodyMarkdown: 'X', defaultRecipient: 'spoc', defaultCcRules: [],
    variables: [], createdBy: 'u', createdAt: '', lastEditedBy: 'u',
    lastEditedAt: '', active: true, auditLog: [],
    ...overrides,
  }
}

function mou(overrides: Partial<MOU> = {}): MOU {
  return {
    id: 'MOU-X', schoolId: 'SCH-X', schoolName: 'Sample',
    programme: 'STEAM', programmeSubType: null, schoolScope: 'SINGLE',
    schoolGroupId: null, status: 'Active', cohortStatus: 'active',
    academicYear: '2026-27', startDate: '2026-04-01', endDate: '2027-03-31',
    studentsMou: 100, studentsActual: null, studentsVariance: null,
    studentsVariancePct: null, spWithoutTax: 0, spWithTax: 0,
    contractValue: 0, received: 0, tds: 0, balance: 0, receivedPct: 0,
    paymentSchedule: '', trainerModel: 'GSL-T', salesPersonId: null,
    templateVersion: null, generatedAt: null, notes: null,
    delayNotes: null, daysToExpiry: null, auditLog: [],
    ...overrides,
  }
}

function payment(overrides: Partial<Payment> = {}): Payment {
  return {
    id: 'P-X', mouId: 'MOU-X', schoolName: 'Sample', programme: 'STEAM',
    instalmentLabel: '1 of 4', instalmentSeq: 1, totalInstalments: 4,
    description: '', dueDateRaw: null, dueDateIso: null,
    expectedAmount: 100000, receivedAmount: null, receivedDate: null,
    paymentMode: null, bankReference: null, piNumber: 'GSL/OPS/26-27/0001',
    taxInvoiceNumber: null, status: 'PI Sent', notes: null,
    piSentDate: '2026-04-15', piSentTo: null, piGeneratedAt: null,
    studentCountActual: null, partialPayments: null, auditLog: null,
    ...overrides,
  }
}

function dispatch(overrides: Partial<Dispatch> = {}): Dispatch {
  return {
    id: 'DSP-X', mouId: 'MOU-X', schoolId: 'SCH-X', installmentSeq: 1,
    stage: 'dispatched', installment1Paid: true, overrideEvent: null,
    poRaisedAt: null, dispatchedAt: '2026-04-25T00:00:00Z',
    deliveredAt: null, acknowledgedAt: null, acknowledgementUrl: null,
    notes: null, lineItems: [], requestId: null, raisedBy: 'u',
    raisedFrom: 'ops-direct', auditLog: [],
    ...overrides,
  }
}

const intake: IntakeRecord | null = null

describe('getSmartTemplateSuggestions', () => {
  it('Pending Signature MOU triggers welcome (highest weight)', () => {
    const suggestions = getSmartTemplateSuggestions({
      mou: mou({ status: 'Pending Signature' }),
      templates: [template('welcome'), template('thank-you')],
      intake, dispatches: [], payments: [], now: FIXED_NOW,
    })
    expect(suggestions).toHaveLength(1)
    expect(suggestions[0]!.useCase).toBe('welcome')
    expect(suggestions[0]!.weight).toBe(100)
  })

  it('PI sent > 14 days ago + payment awaited triggers payment-reminder', () => {
    const suggestions = getSmartTemplateSuggestions({
      mou: mou(),
      templates: [template('payment-reminder')],
      intake,
      dispatches: [],
      payments: [payment({ piSentDate: '2026-04-15', status: 'PI Sent' })],
      now: FIXED_NOW,
    })
    // 2026-05-08 - 2026-04-15 = 23 days, > 14
    expect(suggestions).toHaveLength(1)
    expect(suggestions[0]!.useCase).toBe('payment-reminder')
    expect(suggestions[0]!.reason).toContain('23 days ago')
  })

  it('PI sent < 14 days ago does NOT trigger payment-reminder', () => {
    const suggestions = getSmartTemplateSuggestions({
      mou: mou(),
      templates: [template('payment-reminder')],
      intake,
      dispatches: [],
      payments: [payment({ piSentDate: '2026-05-01', status: 'PI Sent' })],
      now: FIXED_NOW,
    })
    expect(suggestions).toHaveLength(0)
  })

  it('Paid status suppresses payment-reminder even if PI > 14d ago', () => {
    const suggestions = getSmartTemplateSuggestions({
      mou: mou(),
      templates: [template('payment-reminder')],
      intake,
      dispatches: [],
      payments: [payment({ piSentDate: '2026-04-01', status: 'Received' })],
      now: FIXED_NOW,
    })
    expect(suggestions).toHaveLength(0)
  })

  it('Dispatch shipped > 7d ago without delivery triggers dispatch-confirmation', () => {
    const suggestions = getSmartTemplateSuggestions({
      mou: mou(),
      templates: [template('dispatch-confirmation')],
      intake,
      dispatches: [dispatch({ dispatchedAt: '2026-04-25T00:00:00Z', deliveredAt: null })],
      payments: [], now: FIXED_NOW,
    })
    expect(suggestions[0]!.useCase).toBe('dispatch-confirmation')
  })

  it('Delivered dispatch suppresses dispatch-confirmation suggestion', () => {
    const suggestions = getSmartTemplateSuggestions({
      mou: mou(),
      templates: [template('dispatch-confirmation')],
      intake,
      dispatches: [dispatch({
        dispatchedAt: '2026-04-25T00:00:00Z', deliveredAt: '2026-05-01T00:00:00Z',
      })],
      payments: [], now: FIXED_NOW,
    })
    expect(suggestions).toHaveLength(0)
  })

  it('Programme live + 30d post-start + delivered dispatch -> feedback-request', () => {
    const suggestions = getSmartTemplateSuggestions({
      mou: mou({ status: 'Active', startDate: '2026-04-01' }),
      templates: [template('feedback-request')],
      intake,
      dispatches: [dispatch({ stage: 'delivered', deliveredAt: '2026-04-20T00:00:00Z' })],
      payments: [], now: FIXED_NOW,
    })
    // 2026-05-08 - 2026-04-01 = 37 days
    expect(suggestions[0]!.useCase).toBe('feedback-request')
  })

  it('Programme live but no delivered dispatch suppresses feedback-request', () => {
    const suggestions = getSmartTemplateSuggestions({
      mou: mou({ status: 'Active', startDate: '2026-04-01' }),
      templates: [template('feedback-request')],
      intake,
      dispatches: [dispatch({ stage: 'dispatched' })],
      payments: [], now: FIXED_NOW,
    })
    expect(suggestions).toHaveLength(0)
  })

  it('Inactive template skipped even when rule matches', () => {
    const suggestions = getSmartTemplateSuggestions({
      mou: mou({ status: 'Pending Signature' }),
      templates: [template('welcome', { active: false })],
      intake, dispatches: [], payments: [], now: FIXED_NOW,
    })
    expect(suggestions).toHaveLength(0)
  })

  it('Multiple matches sort by weight desc', () => {
    const suggestions = getSmartTemplateSuggestions({
      mou: mou({ status: 'Active', startDate: '2026-04-01' }),
      templates: [
        template('welcome'),
        template('payment-reminder'),
        template('dispatch-confirmation'),
        template('feedback-request'),
      ],
      intake,
      dispatches: [
        dispatch({ id: 'D1', stage: 'dispatched', dispatchedAt: '2026-04-25T00:00:00Z' }),
        dispatch({ id: 'D2', stage: 'delivered', deliveredAt: '2026-04-20T00:00:00Z' }),
      ],
      payments: [payment({ piSentDate: '2026-04-15', status: 'PI Sent' })],
      now: FIXED_NOW,
    })
    // payment-reminder (80) > dispatch-confirmation (70) > feedback-request (60)
    expect(suggestions.map((s) => s.useCase)).toEqual([
      'payment-reminder', 'dispatch-confirmation', 'feedback-request',
    ])
  })
})
