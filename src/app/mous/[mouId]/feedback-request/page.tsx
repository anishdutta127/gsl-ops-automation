/*
 * /mous/[mouId]/feedback-request (Phase D3 manual-send pattern).
 *
 * Two display states:
 *
 *   1. No `?communicationId=` in query: render the install-pick
 *      compose form. Submit posts to /api/communications/compose
 *      which calls composeFeedbackRequest, writes a Communication
 *      record with status='queued-for-manual', and redirects back
 *      to this page with the new communicationId.
 *
 *   2. `?communicationId=...` in query: look up the Communication
 *      record, render preview cards (email + WhatsApp drafts) plus
 *      three operator affordances (Copy email, Copy WhatsApp, Mark
 *      as sent) via ComposedFeedbackRequestPanel.
 *
 * Permission gate: Admin or OpsHead per 'mou:send-feedback-request'.
 * Phase 1 sends emails manually through Outlook; this page is the
 * compose-and-track surface, not a dispatch surface. See RUNBOOK
 * section 10 for the manual-send rationale.
 */

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { AlertTriangle, Info, CheckCircle } from 'lucide-react'
import type {
  Communication,
  Dispatch,
  MOU,
  School,
  User,
} from '@/lib/types'
import mousJson from '@/data/mous.json'
import schoolsJson from '@/data/schools.json'
import dispatchesJson from '@/data/dispatches.json'
import communicationsJson from '@/data/communications.json'
import { getCurrentUser } from '@/lib/auth/session'
import { canPerform } from '@/lib/auth/permissions'
import { TopNav } from '@/components/ops/TopNav'
import { PageHeader } from '@/components/ops/PageHeader'
import { DetailHeaderCard } from '@/components/ops/DetailHeaderCard'
import { ComposedFeedbackRequestPanel } from '@/components/ops/ComposedFeedbackRequestPanel'

const allMous = mousJson as unknown as MOU[]
const allSchools = schoolsJson as unknown as School[]
const allDispatches = dispatchesJson as unknown as Dispatch[]
const allCommunications = communicationsJson as unknown as Communication[]

interface PageProps {
  params: Promise<{ mouId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

function isVisibleToUser(mou: MOU, user: User | null): boolean {
  if (!user) return false
  if (user.role === 'SalesRep') return mou.salesPersonId === user.id
  return true
}

const ERROR_MESSAGES: Record<string, string> = {
  permission: 'You do not have permission to send feedback requests.',
  'unknown-user': 'Session user not found. Please log in again.',
  'mou-not-found': 'MOU not found.',
  'school-not-found': 'School record missing for this MOU; flag to Anish.',
  'school-email-missing': 'SPOC email is missing on the school record. Add it via Edit school before composing.',
  'missing-app-url': 'NEXT_PUBLIC_APP_URL is not configured; magic link cannot be built.',
  'missing-mou': 'MOU id missing from the form submission.',
  'invalid-installment-seq': 'Instalment number is invalid.',
  'communication-not-found': 'Composed draft not found.',
  'already-sent': 'This draft has already been marked as sent.',
  'wrong-status': 'Draft is not in queued-for-manual state; cannot mark as sent.',
}

const FIELD_INPUT_CLASS =
  'block w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand-navy'
const FIELD_LABEL_CLASS = 'block text-sm font-medium text-brand-navy mb-1'

export default async function FeedbackRequestPage({ params, searchParams }: PageProps) {
  const { mouId } = await params
  const sp = await searchParams
  const user = await getCurrentUser()
  const mou = allMous.find((m) => m.id === mouId)
  if (!mou || !isVisibleToUser(mou, user)) notFound()

  const school = allSchools.find((s) => s.id === mou.schoolId)
  const deliveredDispatches = allDispatches.filter(
    (d) => d.mouId === mou.id && (d.stage === 'delivered' || d.stage === 'acknowledged'),
  )
  const allowed = user ? canPerform(user, 'mou:send-feedback-request') : false
  const emailMissing = !school?.email

  const errorKey = typeof sp.error === 'string' ? sp.error : null
  const errorMessage = errorKey ? ERROR_MESSAGES[errorKey] ?? `Failed: ${errorKey}` : null
  const markedSent = sp.marked === 'sent'
  const communicationId = typeof sp.communicationId === 'string' ? sp.communicationId : null

  const composedComm = communicationId
    ? allCommunications.find((c) => c.id === communicationId && c.mouId === mou.id)
    : null

  return (
    <>
      <TopNav currentPath="/mous" />
      <PageHeader
        title={`${mou.schoolName} feedback request`}
        breadcrumb={[
          { label: 'MOUs', href: '/mous' },
          { label: mou.id, href: `/mous/${mou.id}` },
          { label: 'Feedback request' },
        ]}
      />
      <div className="mx-auto flex max-w-screen-xl flex-col gap-4 px-4 py-6">

        <DetailHeaderCard
          title={mou.id}
          subtitle="Compose a feedback magic link, copy via clipboard, send manually from Outlook"
          metadata={[
            { label: 'School', value: mou.schoolName },
            { label: 'SPOC contact', value: school?.contactPerson ?? 'not set' },
            { label: 'SPOC email', value: emailMissing ? <span className="text-signal-alert">Missing</span> : school?.email },
            { label: 'Delivered instalments eligible', value: String(deliveredDispatches.length) },
          ]}
        />

        {errorMessage ? (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-md border border-signal-alert bg-card p-3 text-sm text-foreground"
          >
            <AlertTriangle aria-hidden className="size-4 shrink-0 text-signal-alert" />
            <span>{errorMessage}</span>
          </p>
        ) : null}

        {markedSent ? (
          <p
            role="status"
            className="flex items-start gap-2 rounded-md border border-signal-ok bg-card p-3 text-sm text-foreground"
          >
            <CheckCircle aria-hidden className="size-4 shrink-0 text-signal-ok" />
            <span>Marked as sent. The audit log records the operator and timestamp.</span>
          </p>
        ) : null}

        {composedComm ? (
          <>
            <p className="flex items-start gap-2 rounded-md border border-border bg-card p-3 text-xs text-foreground">
              <Info aria-hidden className="size-4 shrink-0" />
              <span>
                Phase 1: send this email manually through Outlook so SPOCs receive it from your familiar address. Click <strong>Mark as sent</strong> after sending so the audit trail captures the timestamp.
              </span>
            </p>
            <ComposedFeedbackRequestPanel
              communicationId={composedComm.id}
              mouId={mou.id}
              schoolName={mou.schoolName}
              installmentSeq={composedComm.installmentSeq ?? 0}
              subject={composedComm.subject ?? ''}
              bodyEmailHtml={composedComm.bodyEmail ?? ''}
              bodyWhatsApp={composedComm.bodyWhatsApp ?? ''}
              alreadySent={composedComm.status === 'sent'}
            />
          </>
        ) : emailMissing ? (
          <div role="alert" className="flex items-start gap-2 rounded-md border border-signal-alert bg-card p-3 text-sm text-foreground">
            <AlertTriangle aria-hidden className="size-4 shrink-0 text-signal-alert" />
            <div>
              <p className="font-medium text-brand-navy">SPOC email required</p>
              <p className="text-xs text-muted-foreground">
                Capture the school&apos;s SPOC email at <Link href={`/schools/${mou.schoolId}/edit`} className="text-brand-navy underline">/schools/{mou.schoolId}/edit</Link> before composing a feedback request.
              </p>
            </div>
          </div>
        ) : allowed ? (
          <form
            action="/api/communications/compose"
            method="POST"
            className="space-y-4 rounded-lg border border-border bg-card p-4 sm:p-6"
          >
            <input type="hidden" name="mouId" value={mou.id} />
            <div>
              <label htmlFor="installmentSeq" className={FIELD_LABEL_CLASS}>Instalment</label>
              <select id="installmentSeq" name="installmentSeq" required className={FIELD_INPUT_CLASS}>
                {deliveredDispatches.length === 0 ? (
                  <option value="">No delivered instalments eligible</option>
                ) : (
                  deliveredDispatches.map((d) => (
                    <option key={d.id} value={d.installmentSeq}>
                      Inst {d.installmentSeq} (delivered {d.deliveredAt?.slice(0, 10) ?? ''})
                    </option>
                  ))
                )}
              </select>
            </div>
            <div className="flex flex-wrap gap-2 border-t border-border pt-4">
              <button
                type="submit"
                disabled={deliveredDispatches.length === 0}
                className="inline-flex min-h-11 items-center rounded-md bg-brand-teal px-4 py-2 text-sm font-medium text-brand-navy hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-brand-navy disabled:opacity-50"
              >
                Compose feedback request
              </button>
              <Link
                href={`/mous/${mou.id}`}
                className="inline-flex min-h-11 items-center rounded-md border border-border bg-card px-4 py-2 text-sm font-medium hover:bg-muted focus:outline-none focus:ring-2 focus:ring-brand-navy"
              >
                Cancel
              </Link>
            </div>
          </form>
        ) : (
          <p role="status" className="rounded-md border border-border bg-muted/30 p-3 text-sm text-foreground">
            Sending a feedback request requires the OpsHead or Admin role.
          </p>
        )}

      </div>
    </>
  )
}
