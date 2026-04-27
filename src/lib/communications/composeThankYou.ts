/*
 * Thank-you email compose (W4-C.3).
 *
 * Builds the rendered email body + subject from an IntakeRecord +
 * MOU + School + sender. Pattern matches composeFeedbackRequest.ts
 * (compose-and-copy via Outlook clipboard); a future iteration will
 * pair this with a ComposedThankYouPanel UI + mark-sent flow.
 *
 * Returns the composed Communication payload and the rendered text;
 * does NOT enqueue. The route handler that wraps this lib decides
 * whether to enqueue a draft Communication row or only render.
 */

import type {
  IntakeRecord,
  MOU,
  SalesPerson,
  School,
  User,
} from '@/lib/types'
import { THANK_YOU_BODY, THANK_YOU_SUBJECT } from '@/content/thankYouTemplate'

export interface ComposeThankYouArgs {
  intake: IntakeRecord
  mou: MOU
  school: School
  salesOwner: SalesPerson | null
  sender: User
  /** Defaults to new Date(); test injects a fixed instance. */
  now?: Date
}

export interface ComposedThankYou {
  subject: string
  body: string
  to: string
  ccEmails: string[]
}

const D_MONTH_YEAR = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

function applyPlaceholders(
  template: string,
  values: Record<string, string>,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => values[key] ?? `{{${key}}}`)
}

/**
 * Compose a thank-you email from an IntakeRecord. Returns the rendered
 * subject / body / to / cc; the calling route is responsible for
 * persisting the Communication row + clipboard panel.
 */
export function composeThankYou(args: ComposeThankYouArgs): ComposedThankYou {
  const now = args.now ?? new Date()
  const values: Record<string, string> = {
    recipientName: args.intake.recipientName,
    recipientDesignation: args.intake.recipientDesignation,
    schoolName: args.school.name,
    programme: args.intake.productConfirmed,
    durationYears: String(args.intake.durationYears),
    startDate: args.intake.startDate,
    endDate: args.intake.endDate,
    salesOwnerName: args.salesOwner?.name ?? 'Your sales contact',
    signedMouUrl: args.intake.signedMouUrl,
    senderName: args.sender.name,
    currentDate: D_MONTH_YEAR.format(now),
  }
  const subject = applyPlaceholders(THANK_YOU_SUBJECT, values)
  const body = applyPlaceholders(THANK_YOU_BODY, values)
  return {
    subject,
    body,
    to: args.intake.recipientEmail,
    // CC: Phase 1 hardcoded fallback to Anish + the sender; W4-E swaps
    // this to CC-rule routing on the 'welcome-note' context.
    ccEmails: ['anish.d@getsetlearn.info', args.sender.email].filter(
      (e, i, arr) => arr.indexOf(e) === i,
    ),
  }
}
