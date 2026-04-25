import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { CopyWhatsAppButton } from './CopyWhatsAppButton'

describe('CopyWhatsAppButton', () => {
  it('renders the default label "Copy WhatsApp draft" with MessageCircle icon', () => {
    const html = renderToStaticMarkup(
      <CopyWhatsAppButton
        schoolName="Don Bosco Bandel"
        installmentSeq={2}
        draftText="Hi SPOC, just a reminder..."
        onLog={async () => {}}
      />,
    )
    expect(html).toContain('Copy WhatsApp draft')
    // Lucide icons render as <svg> in static markup
    expect(html).toContain('<svg')
  })

  it('aria-label names the school and installment for screen readers', () => {
    const html = renderToStaticMarkup(
      <CopyWhatsAppButton
        schoolName="Carmel Birla"
        installmentSeq={3}
        draftText="x"
        onLog={async () => {}}
      />,
    )
    expect(html).toMatch(
      /aria-label="Copy WhatsApp draft message for Carmel Birla, installment 3"/,
    )
  })

  it('exposes an aria-live="polite" status region for the post-copy announcement', () => {
    const html = renderToStaticMarkup(
      <CopyWhatsAppButton
        schoolName="x"
        installmentSeq={1}
        draftText="x"
        onLog={async () => {}}
      />,
    )
    expect(html).toContain('aria-live="polite"')
    expect(html).toContain('role="status"')
  })

  it('uses brand-teal border, brand-teal text, and white bg in default state', () => {
    const html = renderToStaticMarkup(
      <CopyWhatsAppButton
        schoolName="x"
        installmentSeq={1}
        draftText="x"
        onLog={async () => {}}
      />,
    )
    expect(html).toContain('border-[var(--brand-teal)]')
    expect(html).toContain('text-[var(--brand-teal)]')
    expect(html).toContain('bg-white')
  })

  it('uses CSS variables only, no raw hex', () => {
    const html = renderToStaticMarkup(
      <CopyWhatsAppButton
        schoolName="x"
        installmentSeq={1}
        draftText="x"
        onLog={async () => {}}
      />,
    )
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,6}/)
  })

  it('40px height per DESIGN.md Surface 4 (h-10 = 40px)', () => {
    const html = renderToStaticMarkup(
      <CopyWhatsAppButton
        schoolName="x"
        installmentSeq={1}
        draftText="x"
        onLog={async () => {}}
      />,
    )
    expect(html).toContain('h-10')
  })
})
