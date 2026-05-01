import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Feedback, FeedbackCategory } from '@/lib/types'
import { feedbackAutoEscalation } from './autoEscalation'

interface RatingSpec {
  category: FeedbackCategory
  rating: 1 | 2 | 3 | 4 | 5 | null
  comment?: string | null
}

function makeFeedback(ratings: RatingSpec[]): Feedback {
  return {
    id: 'FBK-TEST',
    schoolId: 'SCH-TEST',
    mouId: 'MOU-TEST',
    installmentSeq: 1,
    submittedAt: '2026-04-25T00:00:00Z',
    submittedBy: 'spoc',
    submitterEmail: 'test@example.test',
    ratings: ratings.map((r) => ({
      category: r.category,
      rating: r.rating,
      comment: r.comment ?? null,
    })),
    overallComment: null,
    magicLinkTokenId: null,
    auditLog: [],
  }
}

let enqueue: ReturnType<typeof vi.fn>
const fixedNow = new Date('2026-04-25T12:00:00Z')

beforeEach(() => {
  enqueue = vi.fn(async () => ({
    id: 'pu-mock',
    queuedAt: fixedNow.toISOString(),
    queuedBy: 'system',
    entity: 'escalation' as const,
    operation: 'create' as const,
    payload: {},
    retryCount: 0,
  }))
})

describe('feedbackAutoEscalation: no-trigger paths', () => {
  it('returns null when no rating is <= 2', async () => {
    const fb = makeFeedback([
      { category: 'training-quality', rating: 5 },
      { category: 'kit-condition', rating: 4 },
      { category: 'delivery-timing', rating: 5 },
      { category: 'trainer-rapport', rating: 4 },
    ])
    const result = await feedbackAutoEscalation(fb, { now: fixedNow, enqueue })
    expect(result).toBe(null)
    expect(enqueue).not.toHaveBeenCalled()
  })

  it('null ratings are ignored; all-null returns null', async () => {
    const fb = makeFeedback([
      { category: 'training-quality', rating: null },
      { category: 'kit-condition', rating: null },
      { category: 'delivery-timing', rating: null },
      { category: 'trainer-rapport', rating: null },
    ])
    const result = await feedbackAutoEscalation(fb, { now: fixedNow, enqueue })
    expect(result).toBe(null)
  })
})

describe('feedbackAutoEscalation: severity', () => {
  it('any rating === 1 -> severity high', async () => {
    const fb = makeFeedback([
      { category: 'training-quality', rating: 1 },
      { category: 'kit-condition', rating: 5 },
      { category: 'delivery-timing', rating: 5 },
      { category: 'trainer-rapport', rating: 5 },
    ])
    const result = await feedbackAutoEscalation(fb, { now: fixedNow, enqueue })
    expect(result?.severity).toBe('high')
  })

  it('only rating === 2 (no 1s) -> severity medium', async () => {
    const fb = makeFeedback([
      { category: 'delivery-timing', rating: 2 },
      { category: 'training-quality', rating: 5 },
      { category: 'kit-condition', rating: 5 },
      { category: 'trainer-rapport', rating: 5 },
    ])
    const result = await feedbackAutoEscalation(fb, { now: fixedNow, enqueue })
    expect(result?.severity).toBe('medium')
  })

  it('mix of 1 and 2 -> severity high (any === 1 wins)', async () => {
    const fb = makeFeedback([
      { category: 'training-quality', rating: 2 },
      { category: 'kit-condition', rating: 1 },
      { category: 'delivery-timing', rating: 4 },
      { category: 'trainer-rapport', rating: 5 },
    ])
    const result = await feedbackAutoEscalation(fb, { now: fixedNow, enqueue })
    expect(result?.severity).toBe('high')
  })
})

describe('feedbackAutoEscalation: lane mapping', () => {
  it('training-quality low -> ACADEMICS lane', async () => {
    const fb = makeFeedback([
      { category: 'training-quality', rating: 1 },
      { category: 'kit-condition', rating: 5 },
      { category: 'delivery-timing', rating: 5 },
      { category: 'trainer-rapport', rating: 5 },
    ])
    const result = await feedbackAutoEscalation(fb, { now: fixedNow, enqueue })
    expect(result?.lane).toBe('ACADEMICS')
  })

  it('trainer-rapport low -> ACADEMICS lane', async () => {
    const fb = makeFeedback([
      { category: 'training-quality', rating: 5 },
      { category: 'kit-condition', rating: 5 },
      { category: 'delivery-timing', rating: 5 },
      { category: 'trainer-rapport', rating: 2 },
    ])
    const result = await feedbackAutoEscalation(fb, { now: fixedNow, enqueue })
    expect(result?.lane).toBe('ACADEMICS')
  })

  it('delivery-timing low -> OPS lane', async () => {
    const fb = makeFeedback([
      { category: 'training-quality', rating: 5 },
      { category: 'kit-condition', rating: 5 },
      { category: 'delivery-timing', rating: 2 },
      { category: 'trainer-rapport', rating: 5 },
    ])
    const result = await feedbackAutoEscalation(fb, { now: fixedNow, enqueue })
    expect(result?.lane).toBe('OPS')
  })

  it('kit-condition low -> OPS lane', async () => {
    const fb = makeFeedback([
      { category: 'training-quality', rating: 5 },
      { category: 'kit-condition', rating: 1 },
      { category: 'delivery-timing', rating: 5 },
      { category: 'trainer-rapport', rating: 5 },
    ])
    const result = await feedbackAutoEscalation(fb, { now: fixedNow, enqueue })
    expect(result?.lane).toBe('OPS')
  })

  it('worst rating wins lane assignment when multiple categories are low', async () => {
    // training-quality=2 (ACADEMICS) and delivery-timing=1 (OPS).
    // delivery-timing has the worst rating; lane is OPS.
    const fb = makeFeedback([
      { category: 'training-quality', rating: 2 },
      { category: 'kit-condition', rating: 5 },
      { category: 'delivery-timing', rating: 1 },
      { category: 'trainer-rapport', rating: 5 },
    ])
    const result = await feedbackAutoEscalation(fb, { now: fixedNow, enqueue })
    expect(result?.lane).toBe('OPS')
    expect(result?.severity).toBe('high')
  })

  it('tie at lowest rating: earlier category in canonical order wins', async () => {
    // training-quality=2 and delivery-timing=2: both rating 2.
    // training-quality is index 0 in canonical order (earlier);
    // delivery-timing is index 2. training-quality wins.
    const fb = makeFeedback([
      { category: 'training-quality', rating: 2 },
      { category: 'kit-condition', rating: 5 },
      { category: 'delivery-timing', rating: 2 },
      { category: 'trainer-rapport', rating: 5 },
    ])
    const result = await feedbackAutoEscalation(fb, { now: fixedNow, enqueue })
    expect(result?.lane).toBe('ACADEMICS')
  })
})

describe('feedbackAutoEscalation: Escalation shape', () => {
  it('returns Escalation with origin=feedback, originId=feedback.id, stage=feedback-escalation, level=L1, createdBy=system', async () => {
    const fb = makeFeedback([
      { category: 'training-quality', rating: 1 },
      { category: 'kit-condition', rating: 5 },
      { category: 'delivery-timing', rating: 5 },
      { category: 'trainer-rapport', rating: 5 },
    ])
    const result = await feedbackAutoEscalation(fb, { now: fixedNow, enqueue })
    expect(result?.origin).toBe('feedback')
    expect(result?.originId).toBe('FBK-TEST')
    expect(result?.stage).toBe('feedback-escalation')
    expect(result?.level).toBe('L1')
    expect(result?.createdBy).toBe('system')
    expect(result?.status).toBe('Open')
    expect(result?.schoolId).toBe('SCH-TEST')
    expect(result?.mouId).toBe('MOU-TEST')
  })

  it('description contains worst category, rating, installment, and comment if present', async () => {
    const fb = makeFeedback([
      { category: 'training-quality', rating: 1, comment: 'Trainer cancelled twice' },
      { category: 'kit-condition', rating: 5 },
      { category: 'delivery-timing', rating: 5 },
      { category: 'trainer-rapport', rating: 5 },
    ])
    const result = await feedbackAutoEscalation(fb, { now: fixedNow, enqueue })
    expect(result?.description).toContain('training-quality')
    expect(result?.description).toContain('1')
    expect(result?.description).toContain('Trainer cancelled twice')
    expect(result?.description).toContain('installment 1')
  })

  it('auditLog has exactly one entry with action auto-create-from-feedback', async () => {
    const fb = makeFeedback([
      { category: 'training-quality', rating: 2 },
      { category: 'kit-condition', rating: 5 },
      { category: 'delivery-timing', rating: 5 },
      { category: 'trainer-rapport', rating: 5 },
    ])
    const result = await feedbackAutoEscalation(fb, { now: fixedNow, enqueue })
    expect(result?.auditLog).toHaveLength(1)
    const entry = result!.auditLog[0]!
    expect(entry.action).toBe('auto-create-from-feedback')
    expect(entry.user).toBe('system')
    expect(entry.notes).toContain('FBK-TEST')
    expect(entry.timestamp).toBe(fixedNow.toISOString())
  })

  it('id has the ESC-AUTO- prefix to distinguish auto-created from manual', async () => {
    const fb = makeFeedback([
      { category: 'training-quality', rating: 1 },
      { category: 'kit-condition', rating: 5 },
      { category: 'delivery-timing', rating: 5 },
      { category: 'trainer-rapport', rating: 5 },
    ])
    const result = await feedbackAutoEscalation(fb, { now: fixedNow, enqueue })
    expect(result?.id).toMatch(/^ESC-AUTO-/)
  })
})

describe('feedbackAutoEscalation: queue write', () => {
  it('writes through enqueue with operation=create + entity=escalation', async () => {
    const fb = makeFeedback([
      { category: 'training-quality', rating: 1 },
      { category: 'kit-condition', rating: 5 },
      { category: 'delivery-timing', rating: 5 },
      { category: 'trainer-rapport', rating: 5 },
    ])
    await feedbackAutoEscalation(fb, { now: fixedNow, enqueue })
    expect(enqueue).toHaveBeenCalledOnce()
    const call = enqueue.mock.calls[0]![0]
    expect(call.queuedBy).toBe('system')
    expect(call.entity).toBe('escalation')
    expect(call.operation).toBe('create')
    expect(call.payload).toMatchObject({
      origin: 'feedback',
      originId: 'FBK-TEST',
      stage: 'feedback-escalation',
    })
  })

  it('does not call enqueue when no rating is <= 2', async () => {
    const fb = makeFeedback([
      { category: 'training-quality', rating: 4 },
      { category: 'kit-condition', rating: 5 },
      { category: 'delivery-timing', rating: 4 },
      { category: 'trainer-rapport', rating: 5 },
    ])
    await feedbackAutoEscalation(fb, { now: fixedNow, enqueue })
    expect(enqueue).not.toHaveBeenCalled()
  })
})
