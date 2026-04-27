import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { computeLifecycle } from '@/lib/portal/lifecycleProgress'
import { StatusBlock } from './StatusBlock'

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

describe('StatusBlock', () => {
  it('renders the section header copy', () => {
    const stages = computeLifecycle(empty)
    const html = renderToStaticMarkup(<StatusBlock stages={stages} />)
    expect(html).toContain('Where your MOU is today')
  })

  it('uses inline CSS with email-safe hex codes (Surface 3 exception to no-hex rule)', () => {
    const stages = computeLifecycle(empty)
    const html = renderToStaticMarkup(<StatusBlock stages={stages} />)
    // Per DESIGN.md Surface 3, hex codes are required for email-
    // client compatibility (CSS vars do not work in email).
    expect(html).toContain('#073393') // navy header
    expect(html).toContain('#1E293B') // stage row text
    expect(html).toContain('Open Sans')
    expect(html).toContain('Arial')
  })

  it('completed stages render with check char and signal-ok green hex', () => {
    const stages = computeLifecycle({
      ...empty,
      mouSignedDate: '2026-04-01', postSigningIntakeDate: null,
      actualsConfirmedDate: '2026-04-12',
    })
    const html = renderToStaticMarkup(<StatusBlock stages={stages} />)
    expect(html).toContain('✓') // ✓
    expect(html).toContain('#22C55E')
    expect(html).toContain('on 01-Apr-2026')
    expect(html).toContain('on 12-Apr-2026')
  })

  it('current stage renders bullet char with signal-attention amber hex', () => {
    const stages = computeLifecycle({
      ...empty,
      mouSignedDate: '2026-04-01', postSigningIntakeDate: null,
      expectedNextActionDate: '2026-05-01',
    })
    const html = renderToStaticMarkup(<StatusBlock stages={stages} />)
    expect(html).toContain('•') // •
    expect(html).toContain('#F59E0B')
    expect(html).toContain('due by 01-May-2026')
  })

  it('future stages render outline-circle char with neutral slate hex and "(TBD)"', () => {
    const stages = computeLifecycle({ ...empty, mouSignedDate: '2026-04-01' })
    const html = renderToStaticMarkup(<StatusBlock stages={stages} />)
    expect(html).toContain('○') // ○
    expect(html).toContain('#64748B')
    expect(html).toContain('(TBD)')
  })

  it('invoice detail (PI number) renders as a parenthesised suffix on the completed row', () => {
    const stages = computeLifecycle({
      ...empty,
      mouSignedDate: '2026-04-01', postSigningIntakeDate: null,
      actualsConfirmedDate: '2026-04-12',
      crossVerifiedDate: '2026-04-13',
      invoiceRaisedDate: '2026-04-14',
      invoiceNumber: 'GSL/OPS/26-27/0001',
    })
    const html = renderToStaticMarkup(<StatusBlock stages={stages} />)
    expect(html).toContain('Invoice raised')
    expect(html).toContain('on 14-Apr-2026')
    expect(html).toContain('(GSL/OPS/26-27/0001)')
  })

  it('top + bottom borders use slate hex (email-safe)', () => {
    const stages = computeLifecycle(empty)
    const html = renderToStaticMarkup(<StatusBlock stages={stages} />)
    expect(html).toContain('#E2E8F0')
    expect(html).toContain('border-top:1px solid #E2E8F0')
    expect(html).toContain('border-bottom:1px solid #E2E8F0')
  })
})
