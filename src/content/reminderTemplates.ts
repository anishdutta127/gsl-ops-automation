/*
 * W4-E.4 reminder email templates.
 *
 * Single edit point so non-developers can refine copy without touching
 * the compose lib. Mustache-style `{{KEY}}` placeholders consumed by
 * composeReminder.ts. Tone: warm, plain-language, British English. No
 * em-dash; lists use commas; clauses join with semicolons. Suitable
 * for the Indian school context (Rs / Lakh / school-Principal salutation).
 *
 * One pair per reminder kind:
 *   intake          -> internal-facing (Sales rep). "Please complete the
 *                       intake form" chase.
 *   payment         -> school-facing. "Friendly payment reminder" chase.
 *   delivery-ack    -> school-facing. "Confirm receipt" chase.
 *   feedback-chase  -> school-facing. "Reminder: feedback link" chase.
 *
 * Placeholders used across templates:
 *   {{recipientName}}    e.g. 'Vikram T.' (sales rep) or 'Father V T Jose' (SPOC)
 *   {{schoolName}}       e.g. 'Don Bosco Krishnanagar'
 *   {{programme}}        'STEAM' / 'TinkRworks' etc.
 *   {{instalmentSeq}}    '1', '2', '3', '4'
 *   {{piNumber}}         'GSL/OPS/26-27/0001' (payment template)
 *   {{expectedAmount}}   formatted Rs amount (payment template)
 *   {{dueDateOrIssued}}  ISO yyyy-mm-dd (payment template)
 *   {{deliveredOn}}      ISO yyyy-mm-dd (delivery-ack template)
 *   {{linkUrl}}          feedback magic link or acknowledgement URL (when relevant)
 *   {{daysOverdue}}      integer count
 *   {{anchorEventLabel}} human-readable anchor (e.g., "since the MOU went active")
 *   {{senderName}}       the operator who clicks Compose
 *   {{currentDate}}      today as 'd MMMM yyyy' (en-GB)
 */

export interface ReminderTemplate {
  subject: string
  body: string
}

export const INTAKE_REMINDER: ReminderTemplate = {
  subject: 'Reminder: complete intake for {{schoolName}}',
  body: `Hello {{recipientName}},

A quick reminder that the post-signing intake form for {{schoolName}} ({{programme}}) has not been submitted yet, {{daysOverdue}} days {{anchorEventLabel}}. The intake captures the academic-year setup details (recipient contact, student count, signed MOU URL, training mode) that the operations team uses to confirm the dispatch schedule.

When you have five minutes free, please complete the intake form on the MOU detail page. If something at the school side is blocking the submission, drop a note on the MOU's status notes and the operations team will help unblock.

Thank you for keeping the school's setup on track.

Warm regards,
{{senderName}}
{{currentDate}}
GetSetLearn (https://getsetlearn.info)
`,
}

export const PAYMENT_REMINDER: ReminderTemplate = {
  subject: 'Payment reminder: instalment {{instalmentSeq}} for {{schoolName}}',
  body: `Dear {{recipientName}},

A friendly reminder regarding the proforma invoice {{piNumber}} sent for {{schoolName}} ({{programme}}). The expected amount is Rs {{expectedAmount}}, originally raised on {{dueDateOrIssued}}. As of today the instalment {{instalmentSeq}} has not been reconciled at our end ({{daysOverdue}} days {{anchorEventLabel}}).

If the payment has been processed, please share the bank reference or transaction details and we will reconcile the instalment immediately. If there is a query on the invoice or you need a fresh copy, please reply to this email and our finance team will follow up.

Thank you for your attention.

Warm regards,
{{senderName}}
{{currentDate}}
GetSetLearn (https://getsetlearn.info)
`,
}

export const DELIVERY_ACK_REMINDER: ReminderTemplate = {
  subject: 'Confirm delivery: kit dispatch for {{schoolName}}',
  body: `Dear {{recipientName}},

Our records show that the kit dispatch for {{schoolName}} ({{programme}}, instalment {{instalmentSeq}}) was delivered on {{deliveredOn}}, {{daysOverdue}} days ago, but we have not yet received the signed delivery acknowledgement form from your end.

Please open the form, sign it once the kit contents are verified, and share a scanned or photographed copy by reply. The acknowledgement closes the dispatch loop and unlocks the next instalment workflow on our side.

If anything is missing or damaged, please flag it in the same reply and our operations team will address it immediately.

Thank you for the prompt confirmation.

Warm regards,
{{senderName}}
{{currentDate}}
GetSetLearn (https://getsetlearn.info)
`,
}

export const FEEDBACK_CHASE: ReminderTemplate = {
  subject: 'Reminder: feedback for {{programme}} instalment {{instalmentSeq}}',
  body: `Dear {{recipientName}},

A gentle reminder that the feedback form for {{schoolName}} ({{programme}}, instalment {{instalmentSeq}}) was sent to you {{daysOverdue}} days ago and has not yet been submitted. Your feedback drives the academic-year review for the school and the trainer's onward planning.

The form takes about three minutes and accepts ratings on training quality, kit condition, delivery timing, and trainer rapport. If the original link has expired, please reply and we will re-issue a fresh link.

Thank you for taking the time.

Warm regards,
{{senderName}}
{{currentDate}}
GetSetLearn (https://getsetlearn.info)
`,
}

export type ReminderKind = 'intake' | 'payment' | 'delivery-ack' | 'feedback-chase'

export const REMINDER_TEMPLATES: Record<ReminderKind, ReminderTemplate> = {
  intake: INTAKE_REMINDER,
  payment: PAYMENT_REMINDER,
  'delivery-ack': DELIVERY_ACK_REMINDER,
  'feedback-chase': FEEDBACK_CHASE,
}
