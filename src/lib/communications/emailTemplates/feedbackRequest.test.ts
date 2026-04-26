import { describe, expect, it } from 'vitest'
import {
  renderFeedbackRequestEmail,
  renderFeedbackRequestWhatsApp,
} from './feedbackRequest'

const baseInput = {
  spocName: 'Priya R.',
  schoolName: 'Greenfield Academy',
  programme: 'STEAM',
  programmeSubType: null,
  installmentSeq: 1,
  feedbackUrl: 'https://ops.example.test/feedback/MLT-FB-001?h=abc123',
  gslSenderName: 'GSL Ops',
  gslContactEmail: 'ops@getsetlearn.info',
}

describe('renderFeedbackRequestEmail', () => {
  it('returns subject + html + text with the school + programme threaded through', () => {
    const out = renderFeedbackRequestEmail(baseInput)
    expect(out.subject).toBe('Your feedback on the STEAM sessions at Greenfield Academy')
    expect(out.html).toContain('Greenfield Academy')
    expect(out.text).toContain('Greenfield Academy')
  })

  it('shows programme sub-type in HTML when present', () => {
    const out = renderFeedbackRequestEmail({
      ...baseInput,
      programme: 'STEAM',
      programmeSubType: 'GSLT-Cretile',
    })
    expect(out.html).toContain('STEAM (GSLT-Cretile)')
    expect(out.text).toContain('STEAM (GSLT-Cretile)')
  })

  it('omits sub-type parens when programmeSubType is null', () => {
    const out = renderFeedbackRequestEmail(baseInput)
    expect(out.html).not.toContain('(null)')
    expect(out.html).not.toContain('()')
  })

  it('includes the feedback URL in both HTML link and plain-text body', () => {
    const out = renderFeedbackRequestEmail(baseInput)
    expect(out.html).toContain('href="https://ops.example.test/feedback/MLT-FB-001?h=abc123"')
    expect(out.text).toContain('https://ops.example.test/feedback/MLT-FB-001?h=abc123')
  })

  it('uses brand navy + teal hex from DESIGN.md tokens (no arbitrary hex)', () => {
    const out = renderFeedbackRequestEmail(baseInput)
    expect(out.html).toContain('#073393')  // brand-navy
    expect(out.html).toContain('#00D8B9')  // brand-teal
  })

  it('escapes HTML in user-provided values (XSS guard for SPOC name etc.)', () => {
    const out = renderFeedbackRequestEmail({
      ...baseInput,
      spocName: '<script>alert(1)</script>',
      schoolName: 'A & B School',
    })
    expect(out.html).not.toContain('<script>alert(1)</script>')
    expect(out.html).toContain('&lt;script&gt;')
    expect(out.html).toContain('A &amp; B School')
  })

  it('plain-text body covers the same content as HTML for accessibility / corporate filters', () => {
    const out = renderFeedbackRequestEmail(baseInput)
    expect(out.text).toContain('Dear Priya R.')
    expect(out.text).toContain('48 hours')
    expect(out.text).toContain('Open the form:')
    expect(out.text).toContain('Best regards')
    expect(out.text).toContain('GSL Ops')
  })

  it('uses British spellings (programme, instalment) in copy', () => {
    const out = renderFeedbackRequestEmail(baseInput)
    expect(out.html).toContain('programme')
    expect(out.html).toContain('instalment')
    expect(out.text).toContain('programme')
    expect(out.text).toContain('instalment')
    expect(out.html).not.toContain('program ')  // American "program" should not appear
  })

  it('subject line is plain ASCII without em-dash or curly quotes', () => {
    const out = renderFeedbackRequestEmail(baseInput)
    // U+2014 em-dash, U+2018/2019 curly singles, U+201C/201D curly doubles.
    // Unicode-escaped to satisfy docs-lint zero-em-dash policy in tests.
    expect(out.subject).not.toMatch(/[\u2014\u2018\u2019\u201c\u201d]/)
  })
})

describe('renderFeedbackRequestWhatsApp', () => {
  it('returns conversational text with the magic link inline + 48h expiry note', () => {
    const out = renderFeedbackRequestWhatsApp(baseInput)
    expect(out).toContain('Hi Priya R.')
    expect(out).toContain('Greenfield Academy')
    expect(out).toContain('STEAM')
    expect(out).toContain(baseInput.feedbackUrl)
    expect(out).toContain('48 hours')
    expect(out).toContain('GSL Ops team')
  })

  it('includes programme sub-type when present', () => {
    const out = renderFeedbackRequestWhatsApp({
      ...baseInput,
      programmeSubType: 'GSLT-Cretile',
    })
    expect(out).toContain('STEAM (GSLT-Cretile)')
  })

  it('contains no em-dash, no HTML markup', () => {
    const out = renderFeedbackRequestWhatsApp(baseInput)
    expect(out).not.toMatch(/[\u2014]/)
    expect(out).not.toContain('<')
    expect(out).not.toContain('&lt;')
  })

  it('keeps the message under 400 characters per DESIGN.md WhatsApp prose constraints', () => {
    const out = renderFeedbackRequestWhatsApp(baseInput)
    expect(out.length).toBeLessThan(400)
  })
})
