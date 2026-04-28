/*
 * /admin/reminders/[reminderId] (W4-E.4 compose-and-copy page).
 *
 * Two states:
 *   - No ?communicationId in URL: re-detect the reminder, render a
 *     preview (subject + body + recipient + cc list) and a Compose
 *     form that calls composeReminderAction.
 *   - With ?communicationId: load the persisted Communication row
 *     (status='queued-for-manual'), render the rendered email with
 *     copy-to-clipboard and a "Mark as sent" form that calls
 *     markReminderSentAction.
 *
 * The Communication row carries the rendered subject + body so the
 * second state never has to re-render the template.
 */

import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Mail } from 'lucide-react'
import { getCurrentUser } from '@/lib/auth/session'
import { detectDueReminders } from '@/lib/reminders/detectDueReminders'
import { renderReminder } from '@/lib/reminders/composeReminder'
import communicationsJson from '@/data/communications.json'
import type { Communication } from '@/lib/types'
import { TopNav } from '@/components/ops/TopNav'
import { PageHeader } from '@/components/ops/PageHeader'
import { composeReminderAction, markReminderSentAction } from '../actions'

const allCommunications = communicationsJson as unknown as Communication[]

interface PageProps {
  params: Promise<{ reminderId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function RemindersComposePage({ params, searchParams }: PageProps) {
  const { reminderId } = await params
  const sp = await searchParams
  const user = await getCurrentUser()
  if (!user) redirect(`/login?next=%2Fadmin%2Freminders%2F${encodeURIComponent(reminderId)}`)

  const communicationId = typeof sp.communicationId === 'string' ? sp.communicationId : null

  if (communicationId) {
    return renderPostComposePanel(reminderId, communicationId)
  }
  return await renderPreviewPanel(reminderId, user.id)
}

function renderPostComposePanel(reminderId: string, communicationId: string) {
  const comm = allCommunications.find((c) => c.id === communicationId)
  if (!comm) return notFound()

  return (
    <>
      <TopNav currentPath="/admin" />
      <PageHeader
        title="Compose reminder"
        breadcrumb={[
          { label: 'Admin', href: '/admin' },
          { label: 'Reminders', href: '/admin/reminders' },
          { label: reminderId },
        ]}
      />
      <div className="mx-auto flex max-w-screen-md flex-col gap-4 px-4 py-6">
        <Link
          href="/admin/reminders"
          className="inline-flex items-center gap-1 text-sm text-brand-navy hover:underline"
        >
          <ArrowLeft aria-hidden className="size-4" /> Back to reminders
        </Link>

        <p className="flex items-start gap-2 rounded-md border border-emerald-300 bg-emerald-50 p-3 text-xs text-emerald-900">
          <Mail aria-hidden className="size-4 shrink-0" />
          <span>
            Reminder composed. Copy the content below into Outlook, send it, then click <strong>I sent it</strong>.
          </span>
        </p>

        <section className="rounded-md border border-border bg-card p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-brand-navy">To</h2>
          <p className="mt-1 font-mono text-sm" data-testid="compose-to">{comm.toEmail}</p>

          {comm.ccEmails.length > 0 ? (
            <>
              <h2 className="mt-4 text-sm font-semibold uppercase tracking-wide text-brand-navy">CC</h2>
              <p className="mt-1 font-mono text-xs" data-testid="compose-cc">
                {comm.ccEmails.join(', ')}
              </p>
            </>
          ) : null}

          <h2 className="mt-4 text-sm font-semibold uppercase tracking-wide text-brand-navy">Subject</h2>
          <p className="mt-1 text-sm" data-testid="compose-subject">{comm.subject}</p>

          <h2 className="mt-4 text-sm font-semibold uppercase tracking-wide text-brand-navy">Body</h2>
          <pre
            className="mt-1 whitespace-pre-wrap rounded-md border border-slate-200 bg-slate-50 p-3 text-sm font-sans"
            data-testid="compose-body"
          >
            {comm.bodyEmail ?? ''}
          </pre>
        </section>

        <form action={markReminderSentAction} className="flex flex-wrap items-center gap-3">
          <input type="hidden" name="communicationId" value={comm.id} />
          <button
            type="submit"
            data-testid="rem-mark-sent"
            className="inline-flex min-h-11 items-center rounded-md bg-brand-navy px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-navy"
          >
            I sent it
          </button>
          <Link
            href="/admin/reminders"
            className="inline-flex min-h-11 items-center rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted focus:outline-none focus:ring-2 focus:ring-brand-navy"
          >
            Cancel
          </Link>
        </form>
      </div>
    </>
  )
}

async function renderPreviewPanel(reminderId: string, userId: string) {
  const reminder = detectDueReminders().find((r) => r.id === reminderId)
  if (!reminder) return notFound()

  // Render preview without side-effects (renderReminder is pure; no
  // Communication is persisted until the operator clicks Compose &
  // copy and the form action calls composeReminder).
  let preview:
    | { subject: string; body: string; to: string; cc: string[] }
    | null = null
  let previewError: string | null = null
  const rendered = renderReminder({
    reminderId: reminder.id,
    composedBy: userId,
    reminder,
  })
  if (rendered.ok) {
    preview = {
      subject: rendered.composed.subject,
      body: rendered.composed.body,
      to: rendered.composed.to,
      cc: rendered.composed.ccEmails,
    }
  } else {
    previewError = rendered.reason
  }

  return (
    <>
      <TopNav currentPath="/admin" />
      <PageHeader
        title="Compose reminder"
        breadcrumb={[
          { label: 'Admin', href: '/admin' },
          { label: 'Reminders', href: '/admin/reminders' },
          { label: reminderId },
        ]}
      />
      <div className="mx-auto flex max-w-screen-md flex-col gap-4 px-4 py-6">
        <Link
          href="/admin/reminders"
          className="inline-flex items-center gap-1 text-sm text-brand-navy hover:underline"
        >
          <ArrowLeft aria-hidden className="size-4" /> Back to reminders
        </Link>

        <section className="rounded-md border border-border bg-card p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-brand-navy">Reminder</h2>
          <p className="mt-1 text-sm">
            <span className="font-medium">{reminder.schoolName}</span>{' '}
            <span className="text-muted-foreground">·</span>{' '}
            {reminder.kind} ·{' '}
            <span className="text-muted-foreground">
              {reminder.daysOverdue} days overdue {reminder.anchorEventLabel}
            </span>
          </p>
          <p className="mt-1 text-xs text-slate-500">{reminder.context}</p>
        </section>

        {preview ? (
          <section className="rounded-md border border-border bg-card p-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-brand-navy">Preview</h2>
            <p className="mt-1 text-xs text-slate-600">
              To: <span className="font-mono">{preview.to}</span>
              {preview.cc.length > 0 ? (
                <>
                  {' '}
                  · CC: <span className="font-mono">{preview.cc.join(', ')}</span>
                </>
              ) : null}
            </p>
            <p className="mt-2 text-sm" data-testid="preview-subject">
              <span className="font-semibold">Subject:</span> {preview.subject}
            </p>
            <pre
              className="mt-1 whitespace-pre-wrap rounded-md border border-slate-200 bg-slate-50 p-3 text-sm font-sans"
              data-testid="preview-body"
            >
              {preview.body}
            </pre>
          </section>
        ) : previewError ? (
          <p
            role="alert"
            className="rounded-md border border-rose-300 bg-rose-50 p-3 text-xs text-rose-900"
          >
            Preview failed: {previewError}. Check the reminder&apos;s recipient on the list page.
          </p>
        ) : null}

        <form action={composeReminderAction} className="flex flex-wrap items-center gap-3">
          <input type="hidden" name="reminderId" value={reminder.id} />
          <button
            type="submit"
            data-testid="rem-compose-confirm"
            className="inline-flex min-h-11 items-center rounded-md bg-brand-navy px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-navy"
          >
            Compose &amp; copy
          </button>
          <Link
            href="/admin/reminders"
            className="inline-flex min-h-11 items-center rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted focus:outline-none focus:ring-2 focus:ring-brand-navy"
          >
            Cancel
          </Link>
        </form>
      </div>
    </>
  )
}
