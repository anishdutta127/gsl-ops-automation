/*
 * /mous/[mouId]/send-template/[templateId] (W4-I.5 P3C4).
 *
 * Template launcher: loads MOU + School + IntakeRecord + sales rep +
 * sender + the chosen CommunicationTemplate. Resolves variables via
 * applyVariables; renders a preview of subject + body with missing
 * variables surfaced as [PLACEHOLDER] copy. The "Send via Outlook"
 * button is a mailto: link that pre-fills To / CC / Subject / Body;
 * a sibling form posts to the audit endpoint to mark the send.
 *
 * E2 send model: opening mailto: hands off to the operator's default
 * mail client. We cannot guarantee they hit Send in Outlook, so the
 * audit captures the operator's intent at click-time. SMTP-confirmed
 * delivery is a Phase 1.1 upgrade (per composeFeedbackRequest's
 * "compose-and-copy beats automated SMTP" rationale).
 */

import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft, AlertTriangle, Send } from 'lucide-react'
import type {
  CommunicationTemplate,
  Dispatch,
  IntakeRecord,
  MOU,
  Payment,
  SalesPerson,
  School,
  TemplateRecipient,
  User,
} from '@/lib/types'
import mousJson from '@/data/mous.json'
import schoolsJson from '@/data/schools.json'
import intakeRecordsJson from '@/data/intake_records.json'
import dispatchesJson from '@/data/dispatches.json'
import paymentsJson from '@/data/payments.json'
import salesTeamJson from '@/data/sales_team.json'
import templatesJson from '@/data/communication_templates.json'
import { getCurrentUser } from '@/lib/auth/session'
import { TopNav } from '@/components/ops/TopNav'
import { PageHeader } from '@/components/ops/PageHeader'
import { applyVariables } from '@/lib/templates/applyVariables'

const allMous = mousJson as unknown as MOU[]
const allSchools = schoolsJson as unknown as School[]
const allIntakeRecords = intakeRecordsJson as unknown as IntakeRecord[]
const allDispatches = dispatchesJson as unknown as Dispatch[]
const allPayments = paymentsJson as unknown as Payment[]
const allSalesTeam = salesTeamJson as unknown as SalesPerson[]
const allTemplates = templatesJson as unknown as CommunicationTemplate[]

interface PageProps {
  params: Promise<{ mouId: string; templateId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

function isVisibleToUser(mou: MOU, user: User | null): boolean {
  if (!user) return false
  if (user.role === 'SalesRep') return mou.salesPersonId === user.id
  return true
}

function resolveRecipient(
  defaultRecipient: TemplateRecipient,
  intake: IntakeRecord | null,
  school: School | null,
  salesOwner: SalesPerson | null,
): string {
  if (defaultRecipient === 'spoc') {
    return intake?.recipientEmail ?? school?.email ?? ''
  }
  if (defaultRecipient === 'sales-owner') return salesOwner?.email ?? ''
  if (defaultRecipient === 'school-email') return school?.email ?? ''
  return ''
}

function pickPayment(payments: Payment[], mouId: string): Payment | null {
  // Prefer the oldest unpaid (PI Sent / Pending / Overdue) for
  // payment-reminder context; fall back to the first instalment.
  const unpaid = payments
    .filter((p) => p.mouId === mouId)
    .filter((p) => p.status === 'PI Sent' || p.status === 'Pending' || p.status === 'Overdue')
    .sort((a, b) => a.instalmentSeq - b.instalmentSeq)
  return unpaid[0] ?? payments.find((p) => p.mouId === mouId) ?? null
}

function pickDispatch(dispatches: Dispatch[], mouId: string): Dispatch | null {
  // Latest dispatched-or-later for dispatch-confirmation context.
  const candidates = dispatches
    .filter((d) => d.mouId === mouId)
    .filter((d) => d.dispatchedAt !== null)
    .sort((a, b) => (a.dispatchedAt! < b.dispatchedAt! ? 1 : -1))
  return candidates[0] ?? dispatches.find((d) => d.mouId === mouId) ?? null
}

export default async function SendTemplatePage({ params, searchParams }: PageProps) {
  const { mouId, templateId } = await params
  const sp = await searchParams
  const user = await getCurrentUser()
  if (!user) {
    redirect(`/login?next=%2Fmous%2F${encodeURIComponent(mouId)}%2Fsend-template%2F${encodeURIComponent(templateId)}`)
  }

  const mou = allMous.find((m) => m.id === mouId)
  if (!mou || !isVisibleToUser(mou, user)) notFound()

  const template = allTemplates.find((t) => t.id === templateId)
  if (!template || !template.active) notFound()

  const school = allSchools.find((s) => s.id === mou.schoolId) ?? null
  const intake = allIntakeRecords.find((r) => r.mouId === mou.id) ?? null
  const dispatch = pickDispatch(allDispatches, mou.id)
  const payment = pickPayment(allPayments, mou.id)
  const salesOwner = mou.salesPersonId
    ? allSalesTeam.find((s) => s.id === mou.salesPersonId) ?? null
    : null

  const ctx = {
    mou, school, intake, dispatch, payment, salesOwner, sender: user,
    now: new Date(),
  }
  const subjectResult = applyVariables(template.subject, ctx)
  const bodyResult = applyVariables(template.bodyMarkdown, ctx)

  const recipient = resolveRecipient(template.defaultRecipient, intake, school, salesOwner)
  const ccEmails = ['anish.d@getsetlearn.info']
  if (user.email !== 'anish.d@getsetlearn.info') ccEmails.push(user.email)

  const mailtoUrl = (() => {
    const params = new URLSearchParams()
    params.set('subject', subjectResult.rendered)
    params.set('body', bodyResult.rendered)
    if (ccEmails.length > 0) params.set('cc', ccEmails.join(','))
    return `mailto:${encodeURIComponent(recipient)}?${params.toString()}`
  })()

  const sentFlash = sp.sent === '1'
  const allMissing = Array.from(new Set([...subjectResult.missing, ...bodyResult.missing]))
  const recipientMissing = recipient === ''

  return (
    <>
      <TopNav currentPath="/mous" />
      <main id="main-content">
        <PageHeader
          title={`Send: ${template.name}`}
          breadcrumb={[
            { label: 'Dashboard', href: '/' },
            { label: 'MOUs', href: '/mous' },
            { label: mou.id, href: `/mous/${mou.id}` },
            { label: 'Send template' },
          ]}
        />
        <div className="mx-auto flex max-w-screen-md flex-col gap-4 px-4 py-6">
          <Link
            href={`/mous/${encodeURIComponent(mou.id)}`}
            className="inline-flex items-center gap-1 text-sm text-brand-navy hover:underline"
          >
            <ArrowLeft aria-hidden className="size-4" /> Back to MOU
          </Link>

          {sentFlash ? (
            <p
              role="status"
              data-testid="send-template-flash"
              className="rounded-md border border-signal-ok bg-card p-3 text-sm text-foreground"
            >
              Send marked. Audit log updated on this MOU.
            </p>
          ) : null}

          {allMissing.length > 0 ? (
            <p
              role="alert"
              data-testid="send-template-missing"
              className="flex items-start gap-2 rounded-md border border-signal-attention bg-signal-attention/10 p-3 text-sm text-signal-attention"
            >
              <AlertTriangle aria-hidden className="size-4 shrink-0" />
              <span>
                Missing variables (rendered as bracketed placeholders): {allMissing.join(', ')}.
                Edit before sending.
              </span>
            </p>
          ) : null}

          {recipientMissing ? (
            <p
              role="alert"
              data-testid="send-template-no-recipient"
              className="flex items-start gap-2 rounded-md border border-signal-alert bg-signal-alert/10 p-3 text-sm text-signal-alert"
            >
              <AlertTriangle aria-hidden className="size-4 shrink-0" />
              <span>
                Default recipient ({template.defaultRecipient}) resolved to empty.
                Capture the email on the relevant entity before sending.
              </span>
            </p>
          ) : null}

          <section
            aria-label="Email preview"
            data-testid="send-template-preview"
            className="rounded-xl border border-border bg-card p-4 sm:p-6"
          >
            <dl className="grid gap-2 text-sm">
              <div className="grid grid-cols-[80px_1fr] gap-2">
                <dt className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">To</dt>
                <dd className="break-all" data-testid="preview-to">{recipient || '(none)'}</dd>
              </div>
              <div className="grid grid-cols-[80px_1fr] gap-2">
                <dt className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">CC</dt>
                <dd className="break-all" data-testid="preview-cc">{ccEmails.join(', ')}</dd>
              </div>
              <div className="grid grid-cols-[80px_1fr] gap-2">
                <dt className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Subject</dt>
                <dd data-testid="preview-subject">{subjectResult.rendered}</dd>
              </div>
            </dl>
            <div className="mt-4 border-t border-border pt-4">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Body</p>
              <pre
                data-testid="preview-body"
                className="whitespace-pre-wrap rounded-md border border-border bg-muted/30 p-3 font-sans text-sm text-foreground"
              >
                {bodyResult.rendered}
              </pre>
            </div>
          </section>

          <div className="flex flex-wrap gap-2">
            <a
              href={mailtoUrl}
              data-testid="send-template-mailto"
              className="inline-flex min-h-11 items-center gap-1.5 rounded-md bg-brand-teal px-4 py-2 text-sm font-semibold text-brand-navy hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
            >
              <Send aria-hidden className="size-4" />
              Send via Outlook
            </a>
            <form
              action={`/api/mou/${encodeURIComponent(mou.id)}/communication-sent`}
              method="POST"
              className="inline-flex"
            >
              <input type="hidden" name="templateId" value={template.id} />
              <input type="hidden" name="recipient" value={recipient} />
              <input type="hidden" name="subject" value={subjectResult.rendered} />
              <input type="hidden" name="filledVariables" value={subjectResult.filled.concat(bodyResult.filled).join(',')} />
              <button
                type="submit"
                data-testid="send-template-mark-sent"
                className="inline-flex min-h-11 items-center rounded-md border border-border bg-card px-4 py-2 text-sm font-medium text-brand-navy hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
              >
                Mark as sent (logs audit)
              </button>
            </form>
            <Link
              href={`/mous/${encodeURIComponent(mou.id)}`}
              className="inline-flex min-h-11 items-center rounded-md border border-border bg-card px-4 py-2 text-sm font-medium hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
            >
              Cancel
            </Link>
          </div>

          <p className="text-xs text-muted-foreground">
            Send via Outlook opens your default mail client with the message
            pre-filled. After sending in Outlook, click <strong>Mark as sent</strong>
            so this MOU&apos;s audit log records the communication.
          </p>
        </div>
      </main>
    </>
  )
}
