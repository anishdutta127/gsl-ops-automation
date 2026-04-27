import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { computeLifecycle } from '@/lib/portal/lifecycleProgress'
import { LifecycleProgress } from './LifecycleProgress'

const empty = {
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

describe('LifecycleProgress', () => {
  it('renders all 8 stage labels', () => {
    const stages = computeLifecycle(empty)
    const html = renderToStaticMarkup(<LifecycleProgress stages={stages} />)
    expect(html).toContain('MOU signed')
    expect(html).toContain('Actuals confirmed')
    expect(html).toContain('Cross-verification')
    expect(html).toContain('Invoice raised')
    expect(html).toContain('Payment received')
    expect(html).toContain('Kit dispatched')
    expect(html).toContain('Delivery acknowledged')
    expect(html).toContain('Feedback submitted')
  })

  it('aria-label on the ordered list names "MOU lifecycle progress"', () => {
    const stages = computeLifecycle(empty)
    const html = renderToStaticMarkup(<LifecycleProgress stages={stages} />)
    expect(html).toMatch(/<ol[^>]*aria-label="MOU lifecycle progress"/)
  })

  it('completed stages render with brand-teal circle and date', () => {
    const stages = computeLifecycle({
      ...empty,
      mouSignedDate: '2026-04-01', postSigningIntakeDate: null,
      actualsConfirmedDate: '2026-04-12',
    })
    const html = renderToStaticMarkup(<LifecycleProgress stages={stages} />)
    expect(html).toContain('var(--brand-teal)')
    // Date format: DD-MMM-YYYY
    expect(html).toMatch(/\d{2}-[A-Z][a-z]{2}-\d{4}/)
  })

  it('current stage renders amber circle, "In progress" label, and amber-700 text', () => {
    const stages = computeLifecycle({
      ...empty,
      mouSignedDate: '2026-04-01', postSigningIntakeDate: null,
      expectedNextActionDate: '2026-05-01',
    })
    const html = renderToStaticMarkup(<LifecycleProgress stages={stages} />)
    expect(html).toContain('var(--signal-attention)')
    expect(html).toContain('In progress')
    expect(html).toContain('text-amber-700')
  })

  it('future stages render outline circle and "TBD" placeholder', () => {
    const stages = computeLifecycle({ ...empty, mouSignedDate: '2026-04-01' })
    const html = renderToStaticMarkup(<LifecycleProgress stages={stages} />)
    expect(html).toContain('TBD')
    expect(html).toContain('border-slate-300')
  })

  it('uses CSS variables, no raw hex', () => {
    const stages = computeLifecycle({
      ...empty,
      mouSignedDate: '2026-04-01', postSigningIntakeDate: null,
      expectedNextActionDate: '2026-05-01',
    })
    const html = renderToStaticMarkup(<LifecycleProgress stages={stages} />)
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,6}/)
  })

  it('per-stage aria-label names the stage and its status', () => {
    const stages = computeLifecycle({ ...empty, mouSignedDate: '2026-04-01' })
    const html = renderToStaticMarkup(<LifecycleProgress stages={stages} />)
    expect(html).toMatch(/aria-label="MOU signed: Completed[^"]*"/)
    // W4-C.1: post-signing-intake is now the in-progress stage when only
    // mouSignedDate is set; actuals-confirmed shifts to "future".
    expect(html).toMatch(/aria-label="Post-signing intake: In progress[^"]*"/)
  })
})
