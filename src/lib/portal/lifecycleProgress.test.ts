import { describe, expect, it } from 'vitest'
import { computeLifecycle, type LifecycleInput } from './lifecycleProgress'

const empty: LifecycleInput = {
  mouSignedDate: null, postSigningIntakeDate: null,
  actualsConfirmedDate: null,
  crossVerifiedDate: null,
  invoiceRaisedDate: null,
  invoiceNumber: null,
  paymentReceivedDate: null,
  dispatchedDate: null,
  deliveredDate: null,
  feedbackSubmittedDate: null,
  expectedNextActionDate: null,
}

describe('computeLifecycle', () => {
  it('produces 9 stages in fixed order (W4-C.1 added post-signing-intake)', () => {
    const stages = computeLifecycle(empty)
    expect(stages.map((s) => s.key)).toEqual([
      'mou-signed',
      'post-signing-intake',
      'actuals-confirmed',
      'cross-verification',
      'invoice-raised',
      'payment-received',
      'kit-dispatched',
      'delivery-acknowledged',
      'feedback-submitted',
    ])
  })

  it('all-empty input: stage 1 is current, others are future', () => {
    const stages = computeLifecycle(empty)
    expect(stages[0]?.status).toBe('current')
    for (let i = 1; i < stages.length; i++) {
      expect(stages[i]?.status).toBe('future')
    }
  })

  it('completed stages get their dates and stay completed', () => {
    const stages = computeLifecycle({
      ...empty,
      mouSignedDate: '2026-04-01',
      postSigningIntakeDate: '2026-04-08',
      actualsConfirmedDate: '2026-04-12',
    })
    expect(stages[0]?.status).toBe('completed')
    expect(stages[0]?.date).toBe('2026-04-01')
    expect(stages[1]?.status).toBe('completed')
    expect(stages[1]?.date).toBe('2026-04-08')
    expect(stages[2]?.status).toBe('completed')
    expect(stages[2]?.date).toBe('2026-04-12')
    expect(stages[3]?.status).toBe('current')
  })

  it('first not-completed stage becomes current; later stages future', () => {
    const stages = computeLifecycle({
      ...empty,
      mouSignedDate: '2026-04-01',
      postSigningIntakeDate: '2026-04-08',
      actualsConfirmedDate: '2026-04-12',
      crossVerifiedDate: '2026-04-13',
    })
    // Index 4 is invoice-raised post-W4-C.1 (was index 3 pre-W4-C).
    expect(stages[4]?.status).toBe('current')
    expect(stages[4]?.key).toBe('invoice-raised')
    expect(stages[5]?.status).toBe('future')
    expect(stages[8]?.status).toBe('future')
  })

  it('expectedNextActionDate attaches to the current stage', () => {
    const stages = computeLifecycle({
      ...empty,
      mouSignedDate: '2026-04-01', postSigningIntakeDate: null,
      expectedNextActionDate: '2026-05-01',
    })
    const current = stages.find((s) => s.status === 'current')
    expect(current?.date).toBe('2026-05-01')
  })

  it('invoice-raised stage carries invoice number as detail when set', () => {
    const stages = computeLifecycle({
      ...empty,
      mouSignedDate: '2026-04-01', postSigningIntakeDate: null,
      actualsConfirmedDate: '2026-04-12',
      crossVerifiedDate: '2026-04-13',
      invoiceRaisedDate: '2026-04-14',
      invoiceNumber: 'GSL/OPS/26-27/0001',
    })
    const invoice = stages.find((s) => s.key === 'invoice-raised')
    expect(invoice?.status).toBe('completed')
    expect(invoice?.date).toBe('2026-04-14')
    expect(invoice?.detail).toBe('GSL/OPS/26-27/0001')
  })

  it('all-completed input: every stage is completed; no current', () => {
    const stages = computeLifecycle({
      mouSignedDate: '2026-04-01',
      postSigningIntakeDate: '2026-04-08',
      actualsConfirmedDate: '2026-04-12',
      crossVerifiedDate: '2026-04-13',
      invoiceRaisedDate: '2026-04-14',
      invoiceNumber: 'GSL/OPS/26-27/0001',
      paymentReceivedDate: '2026-04-25',
      dispatchedDate: '2026-04-28',
      deliveredDate: '2026-05-02',
      feedbackSubmittedDate: '2026-05-15',
      expectedNextActionDate: null,
    })
    expect(stages.every((s) => s.status === 'completed')).toBe(true)
  })

  it('future stages have null dates', () => {
    const stages = computeLifecycle({
      ...empty,
      mouSignedDate: '2026-04-01', postSigningIntakeDate: null,
    })
    const future = stages.filter((s) => s.status === 'future')
    for (const s of future) {
      expect(s.date).toBe(null)
    }
  })
})
