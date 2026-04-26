/*
 * Compose feedback-request (Phase D3 manual-send pattern).
 *
 * Phase 1 directive: GSL sends transactional email through Outlook
 * manually. The system's job is to ensure the SPOC experience is
 * consistent (right content, right magic link, audit trail). This
 * lib generates the email + WhatsApp content and writes a
 * Communication record with status='queued-for-manual'; an
 * operator copies the content via clipboard and sends from their
 * Outlook, then clicks "Mark as sent" to flip status to 'sent'.
 *
 * Why this beats automated SMTP for Phase 1:
 *  - Tester sender reputation preserved (SPOCs know pratik.d@; not
 *    onboarding@resend.dev)
 *  - Zero DNS / domain-verification setup
 *  - Instant audit trail in Outlook Sent folder
 *  - Existing GSL email workflow unchanged
 *
 * Phase 1.1 upgrade trigger: when GSL wants automated sending, swap
 * the operator-copy button for a "Send via <provider>" button that
 * calls a new dispatch route. Compose code stays unchanged.
 *
 * Failure modes:
 *  - permission           not Admin or OpsHead
 *  - unknown-user         session.sub not in users.json
 *  - mou-not-found
 *  - school-not-found
 *  - school-email-missing school.email is null (operator must
 *                         capture SPOC email at /schools/[id]/edit
 *                         before composing)
 *  - missing-app-url      NEXT_PUBLIC_APP_URL env var not set
 */

import crypto from 'node:crypto'
import type {
  AuditEntry,
  Communication,
  MOU,
  MagicLinkToken,
  School,
  User,
} from '@/lib/types'
import mousJson from '@/data/mous.json'
import schoolsJson from '@/data/schools.json'
import usersJson from '@/data/users.json'
import { enqueueUpdate } from '@/lib/pendingUpdates'
import { canPerform } from '@/lib/auth/permissions'
import { signMagicLink } from '@/lib/magicLink'
import {
  renderFeedbackRequestEmail,
  renderFeedbackRequestWhatsApp,
  type FeedbackRequestEmail,
} from './emailTemplates/feedbackRequest'

const TOKEN_TTL_MS = 48 * 60 * 60 * 1000  // 48 hours per Q-G

export interface ComposeFeedbackRequestArgs {
  mouId: string
  installmentSeq: number
  composedBy: string
}

export type ComposeFeedbackRequestFailureReason =
  | 'permission'
  | 'unknown-user'
  | 'mou-not-found'
  | 'school-not-found'
  | 'school-email-missing'
  | 'missing-app-url'

export type ComposeFeedbackRequestResult =
  | {
      ok: true
      communication: Communication
      magicLinkToken: MagicLinkToken
      email: FeedbackRequestEmail
      whatsapp: string
      magicLinkUrl: string
    }
  | { ok: false; reason: ComposeFeedbackRequestFailureReason }

export interface ComposeFeedbackRequestDeps {
  mous: MOU[]
  schools: School[]
  users: User[]
  enqueue: typeof enqueueUpdate
  uuid: () => string
  now: () => Date
  appUrl: () => string | undefined
}

const defaultDeps: ComposeFeedbackRequestDeps = {
  mous: mousJson as unknown as MOU[],
  schools: schoolsJson as unknown as School[],
  users: usersJson as unknown as User[],
  enqueue: enqueueUpdate,
  uuid: () => crypto.randomUUID(),
  now: () => new Date(),
  appUrl: () => process.env.NEXT_PUBLIC_APP_URL,
}

export async function composeFeedbackRequest(
  args: ComposeFeedbackRequestArgs,
  deps: ComposeFeedbackRequestDeps = defaultDeps,
): Promise<ComposeFeedbackRequestResult> {
  const user = deps.users.find((u) => u.id === args.composedBy)
  if (!user) return { ok: false, reason: 'unknown-user' }
  if (!canPerform(user, 'mou:send-feedback-request')) {
    return { ok: false, reason: 'permission' }
  }

  const mou = deps.mous.find((m) => m.id === args.mouId)
  if (!mou) return { ok: false, reason: 'mou-not-found' }

  const school = deps.schools.find((s) => s.id === mou.schoolId)
  if (!school) return { ok: false, reason: 'school-not-found' }
  if (!school.email || school.email.trim() === '') {
    return { ok: false, reason: 'school-email-missing' }
  }

  const appUrl = deps.appUrl()
  if (!appUrl || appUrl.trim() === '') {
    return { ok: false, reason: 'missing-app-url' }
  }

  const ts = deps.now().toISOString()
  const expiresAt = new Date(deps.now().getTime() + TOKEN_TTL_MS).toISOString()
  const tokenId = `MLT-FB-${deps.uuid().slice(0, 8)}`
  const communicationId = `COM-FBR-${deps.uuid().slice(0, 8)}`

  const tokenPayload = {
    purpose: 'feedback-submit' as const,
    mouId: mou.id,
    installmentSeq: args.installmentSeq,
    spocEmail: school.email,
    issuedAt: ts,
  }
  const hmac = signMagicLink(tokenPayload)
  const magicLinkUrl = `${appUrl.replace(/\/$/, '')}/feedback/${tokenId}?h=${hmac}`

  const spocName = school.contactPerson?.trim() || school.name

  const emailInput = {
    spocName,
    schoolName: school.name,
    programme: mou.programme,
    programmeSubType: mou.programmeSubType,
    installmentSeq: args.installmentSeq,
    feedbackUrl: magicLinkUrl,
    gslSenderName: user.name,
    gslContactEmail: user.email,
  }
  const email = renderFeedbackRequestEmail(emailInput)
  const whatsapp = renderFeedbackRequestWhatsApp(emailInput)

  const magicLinkToken: MagicLinkToken = {
    id: tokenId,
    purpose: 'feedback-submit',
    mouId: mou.id,
    installmentSeq: args.installmentSeq,
    spocEmail: school.email,
    issuedAt: ts,
    expiresAt,
    usedAt: null,
    usedByIp: null,
    lastViewedAt: null,
    viewCount: 0,
    communicationId,
  }

  const composeAudit: AuditEntry = {
    timestamp: ts,
    user: args.composedBy,
    action: 'create',
    after: {
      type: 'feedback-request',
      mouId: mou.id,
      installmentSeq: args.installmentSeq,
      magicLinkTokenId: tokenId,
      status: 'queued-for-manual',
    },
    notes: `Composed feedback-request email + WhatsApp draft for instalment ${args.installmentSeq}; awaiting manual send.`,
  }

  const communication: Communication = {
    id: communicationId,
    type: 'feedback-request',
    schoolId: school.id,
    mouId: mou.id,
    installmentSeq: args.installmentSeq,
    channel: 'email',
    subject: email.subject,
    bodyEmail: email.html,
    bodyWhatsApp: whatsapp,
    toEmail: school.email,
    toPhone: school.phone,
    ccEmails: [],
    queuedAt: ts,
    queuedBy: args.composedBy,
    sentAt: null,
    copiedAt: null,
    status: 'queued-for-manual',
    bounceDetail: null,
    auditLog: [composeAudit],
  }

  await deps.enqueue({
    queuedBy: args.composedBy,
    entity: 'magicLinkToken',
    operation: 'create',
    payload: magicLinkToken as unknown as Record<string, unknown>,
  })
  await deps.enqueue({
    queuedBy: args.composedBy,
    entity: 'communication',
    operation: 'create',
    payload: communication as unknown as Record<string, unknown>,
  })

  return {
    ok: true,
    communication,
    magicLinkToken,
    email,
    whatsapp,
    magicLinkUrl,
  }
}
