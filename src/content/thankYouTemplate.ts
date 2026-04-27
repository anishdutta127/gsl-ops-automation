/*
 * Thank-you email template (W4-C.3).
 *
 * Single-file edit point so non-developers can refine copy without
 * touching the compose lib. Placeholder syntax is mustache-like
 * `{{KEY}}` so the renderer in composeThankYou.ts can substitute
 * directly.
 *
 * Tone: warm, plain-language, British English. No em-dash; lists use
 * commas; clauses join with semicolons.
 *
 * Placeholders:
 *   {{recipientName}}        e.g. 'Father V T Jose'
 *   {{recipientDesignation}} e.g. 'Principal'
 *   {{schoolName}}           e.g. 'Don Bosco Krishnanagar'
 *   {{programme}}            e.g. 'STEAM' or 'TinkRworks'
 *   {{durationYears}}        '1', '2', '3'
 *   {{startDate}}            ISO date 'yyyy-mm-dd'
 *   {{endDate}}              ISO date
 *   {{salesOwnerName}}       resolved from salesOwnerId
 *   {{signedMouUrl}}         operator-pasted Drive link
 *   {{senderName}}           operator who clicks "send" (Misba / Anish)
 *   {{currentDate}}          today's date as 'd MMMM yyyy'
 */

export const THANK_YOU_SUBJECT = 'Welcome to GSL: {{schoolName}}'

export const THANK_YOU_BODY = `Dear {{recipientName}},

Thank you for partnering with Get Set Learn. We are delighted to confirm the start of our {{durationYears}}-year {{programme}} engagement at {{schoolName}}, running from {{startDate}} to {{endDate}}.

The signed MOU is on file at {{signedMouUrl}}. {{salesOwnerName}} from our team will be your primary point of contact for the academic-year setup; please feel free to reach out with any questions about kit dispatch, training schedules, or feedback windows.

Our operations team (in copy) will be in touch over the next few weeks to confirm the intake details, finalise the dispatch schedule, and walk you through the first instalment invoice.

Welcome aboard, and we look forward to a strong partnership.

Warm regards,
{{senderName}}
{{currentDate}}
GetSetLearn (https://getsetlearn.info)
`
