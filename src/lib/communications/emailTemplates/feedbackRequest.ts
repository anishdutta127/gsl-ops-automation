/*
 * Feedback-request email template (Phase D3).
 *
 * Pure function: returns { subject, html, text }. No I/O, no
 * Resend coupling, no React. Mail clients strip stylesheets, so
 * the HTML uses inline CSS with brand hex values from DESIGN.md
 * (`--brand-navy: #073393`, `--brand-teal: #00D8B9`). These are
 * NOT raw arbitrary hex; they are the design tokens, exact match.
 *
 * Plain-text fallback parallels the HTML content. Some mail clients
 * (corporate filters, terminal mail readers, accessibility tools)
 * prefer text/plain; including both is best practice.
 *
 * British English throughout (programme, organise, recognised).
 */

export interface FeedbackRequestEmailInput {
  spocName: string
  schoolName: string
  programme: string
  programmeSubType: string | null
  installmentSeq: number
  feedbackUrl: string
  gslSenderName: string
  gslContactEmail: string
}

export interface FeedbackRequestEmail {
  subject: string
  html: string
  text: string
}

const BRAND_NAVY = '#073393'
const BRAND_TEAL = '#00D8B9'
const SLATE_700 = '#334155'
const SLATE_500 = '#64748B'

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function programmeLabel(programme: string, subType: string | null): string {
  return subType ? `${programme} (${subType})` : programme
}

export function renderFeedbackRequestEmail(
  input: FeedbackRequestEmailInput,
): FeedbackRequestEmail {
  const programme = programmeLabel(input.programme, input.programmeSubType)
  const subject = `Your feedback on the ${input.programme} sessions at ${input.schoolName}`

  const text = [
    `Dear ${input.spocName},`,
    '',
    `We have wrapped up instalment ${input.installmentSeq} of the ${programme} programme at ${input.schoolName}. We would value your feedback on training quality, kit condition, delivery timing, and trainer rapport.`,
    '',
    'It takes about two minutes. You can skip any question you do not have a view on.',
    '',
    `Open the form: ${input.feedbackUrl}`,
    '',
    'The link is valid for 48 hours and can be used once.',
    '',
    'If anything looks off, please reply to this email and we will sort it out.',
    '',
    'Best regards,',
    input.gslSenderName,
    input.gslContactEmail,
  ].join('\n')

  const safeName = escapeHtml(input.spocName)
  const safeSchool = escapeHtml(input.schoolName)
  const safeProgramme = escapeHtml(programme)
  const safeProgrammeShort = escapeHtml(input.programme)
  const safeSenderName = escapeHtml(input.gslSenderName)
  const safeSenderEmail = escapeHtml(input.gslContactEmail)
  const safeUrl = escapeHtml(input.feedbackUrl)

  const html = `<!DOCTYPE html>
<html lang="en-IN">
<head>
<meta charset="utf-8">
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background-color:#F8FAFC;font-family:'Open Sans',Arial,sans-serif;color:${SLATE_700};">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#F8FAFC;padding:24px 16px;">
    <tr>
      <td style="text-align:center;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;background-color:#FFFFFF;border-radius:8px;border:1px solid #E2E8F0;">
          <tr>
            <td style="padding:24px 24px 8px 24px;">
              <h1 style="margin:0;font-family:'Montserrat',Arial,sans-serif;font-size:20px;font-weight:700;color:${BRAND_NAVY};">
                Your feedback on instalment ${input.installmentSeq}
              </h1>
              <p style="margin:8px 0 0 0;font-size:14px;color:${SLATE_500};">
                ${safeProgrammeShort} programme &middot; ${safeSchool}
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 24px;">
              <p style="margin:0 0 16px 0;font-size:15px;line-height:1.5;color:${SLATE_700};">
                Dear ${safeName},
              </p>
              <p style="margin:0 0 16px 0;font-size:15px;line-height:1.5;color:${SLATE_700};">
                We have wrapped up instalment ${input.installmentSeq} of the ${safeProgramme} programme at ${safeSchool}. We would value your feedback on training quality, kit condition, delivery timing, and trainer rapport.
              </p>
              <p style="margin:0 0 24px 0;font-size:15px;line-height:1.5;color:${SLATE_700};">
                It takes about two minutes. You can skip any question you do not have a view on.
              </p>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td bgcolor="${BRAND_TEAL}" style="border-radius:6px;">
                    <a href="${safeUrl}" style="display:inline-block;padding:14px 28px;font-family:'Montserrat',Arial,sans-serif;font-size:15px;font-weight:600;color:${BRAND_NAVY};text-decoration:none;border-radius:6px;">
                      Share your feedback
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:24px 0 0 0;font-size:13px;color:${SLATE_500};">
                Or paste this link into your browser:<br>
                <a href="${safeUrl}" style="color:${BRAND_NAVY};word-break:break-all;">${safeUrl}</a>
              </p>
              <p style="margin:16px 0 0 0;font-size:13px;color:${SLATE_500};">
                The link is valid for 48 hours and can be used once.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 24px 24px 24px;border-top:1px solid #E2E8F0;">
              <p style="margin:0;font-size:14px;color:${SLATE_700};">
                If anything looks off, please reply to this email and we will sort it out.
              </p>
              <p style="margin:16px 0 0 0;font-size:14px;color:${SLATE_700};">
                Best regards,<br>
                <strong style="color:${BRAND_NAVY};">${safeSenderName}</strong><br>
                <a href="mailto:${safeSenderEmail}" style="color:${BRAND_NAVY};">${safeSenderEmail}</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`

  return { subject, html, text }
}

/*
 * WhatsApp parallel content for the same feedback request. Per
 * DESIGN.md "Surface 4 / WhatsApp-prose constraints": conversational
 * tone, no HTML, under 400 characters where practical, magic link
 * inline, single sign-off line. The Copy WhatsApp button (existing
 * Surface 4 affordance) reads this body and writes a Communication
 * record with channel='whatsapp-draft-copied' on click.
 */
export function renderFeedbackRequestWhatsApp(
  input: FeedbackRequestEmailInput,
): string {
  const programme = programmeLabel(input.programme, input.programmeSubType)
  return [
    `Hi ${input.spocName},`,
    '',
    `Please share feedback on the ${programme} sessions at ${input.schoolName}:`,
    input.feedbackUrl,
    '',
    'Takes 2 minutes. Link is valid for 48 hours.',
    '',
    'Thanks.',
    'GSL Ops team',
  ].join('\n')
}
