import { describe, it, expect } from 'vitest'
import PizZip from 'pizzip'
import {
  fillTemplate,
  TemplateMissingError,
  UnknownTemplateError,
} from './generator'

function extractText(buf: Buffer): string {
  const zip = new PizZip(buf)
  const xml = zip.file('word/document.xml')!.asText()
  return xml
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
}

describe('generator', () => {
  it('throws UnknownTemplateError for unknown template ids', async () => {
    await expect(fillTemplate('DOES-NOT-EXIST', {})).rejects.toBeInstanceOf(UnknownTemplateError)
  })

  it('renders a valid .docx Buffer for STEAM-v3 happy path', async () => {
    const buf = await fillTemplate('STEAM-v3', {
      EFFECTIVE_DATE: '01-Apr-2026',
      TRUST_NAME: 'Test Trust',
      SCHOOL_NAME: 'Test School',
      SCHOOL_CITY: 'Mumbai',
      SCHOOL_STATE: 'Maharashtra',
      START_DATE: '2026-04-01',
      END_DATE: '2027-03-31',
      STUDENT_COUNT: '150',
      PRICE_PER_STUDENT: 'Rs 2,360',
    })
    expect(Buffer.isBuffer(buf)).toBe(true)
    // .docx is a zip archive; zip magic bytes are 0x50 0x4B (PK)
    expect(buf[0]).toBe(0x50)
    expect(buf[1]).toBe(0x4b)
    expect(buf.length).toBeGreaterThan(1000)
  })

  it('TemplateMissingError carries an actionable message', () => {
    const err = new TemplateMissingError('STEAM-v3', 'public/mou-templates/STEAM-v2.1.docx')
    expect(err.message).toMatch(/STEAM-v3\.docx not yet deployed/)
    expect(err.message).toMatch(/public\/mou-templates/)
  })

  it('rendered STEAM template carries every approved Cretile clause', async () => {
    // Round 3 Step 3 regression guard. Round 2 swapped the renderer
    // to a stripped-down body that dropped the legal clauses, which
    // Pranav flagged as "not as per the template given." This test
    // pins the approved template's headings + key sentences.
    const buf = await fillTemplate('STEAM-v3', {
      EFFECTIVE_DATE: '01-Apr-2026',
      TRUST_NAME: 'Pranav Test Trust',
      SCHOOL_NAME: 'Pranav Test School',
      SCHOOL_CITY: 'Mumbai',
      SCHOOL_STATE: 'Maharashtra',
      SCHOOL_PAN: 'AAAAA1234A',
      SCHOOL_GST: '27AAAAA1234A1Z9',
      START_DATE: '2026-04-01',
      END_DATE: '2027-03-31',
      STUDENT_COUNT: '150',
      PRICE_PER_STUDENT: 'Rs 2,360',
      DURATION: '01 April 2026 to 31 March 2027 (1 year)',
      PAYMENT_SCHEDULE: 'Year 1: Apr-2026 25%, Jul-2026 25%, Oct-2026 25%, Jan-2027 25%',
      DISCOUNT: 'Nil',
    })
    const text = extractText(buf)
    expect(text).toMatch(/MEMORANDUM OF UNDERSTANDING/i)
    expect(text).toMatch(/Duties & Obligation of Company/i)
    expect(text).toMatch(/Lab Infrastructure Requirements/i)
    expect(text).toMatch(/Robotic Kits Delivery/i)
    expect(text).toMatch(/Confidentiality/i)
    expect(text).toMatch(/Termination/i)
    expect(text).toMatch(/Governing Law and Dispute Resolution/i)
    expect(text).toMatch(/Annexure-1/i)
    expect(text).toMatch(/Annexure-2/i)
    expect(text).toMatch(/Pranav Test Trust/)
    expect(text).toMatch(/Pranav Test School/)
    expect(text).toMatch(/01-Apr-2026|01 April 2026/)
    // No remaining {{TOKEN}} anywhere in the rendered body.
    expect(text).not.toMatch(/\{\{[A-Z_]+\}\}/)
  })
})
