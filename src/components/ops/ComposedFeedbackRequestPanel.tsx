'use client'

/*
 * ComposedFeedbackRequestPanel (Phase D3 manual-send pattern).
 *
 * Client Component rendered inside the Server Component
 * /mous/[mouId]/feedback-request page when ?communicationId=... is
 * present. Shows the composed email + WhatsApp content and three
 * action affordances:
 *
 *   1. Copy email content - clipboard write of subject + bodyEmail.
 *      Operator pastes into Outlook (rich-text mode) and sends.
 *   2. Copy WhatsApp message - reuses the existing surface 4
 *      CopyWhatsAppButton; logs a Communication record with
 *      channel='whatsapp-draft-copied' on click.
 *   3. Mark as sent - server-form POST to
 *      /api/communications/[id]/mark-sent. Flips status to 'sent'
 *      and appends an audit entry.
 *
 * The panel is a simple in-line stack on Phase 1; the surveillance-
 * mitigation tooltip on the WhatsApp button surfaces from the
 * existing component (no new wiring here).
 */

import { useCallback, useState } from 'react'
import { Check, Copy as CopyIcon, Send } from 'lucide-react'
import { cn } from '@/lib/utils'
import { CopyWhatsAppButton } from './CopyWhatsAppButton'

interface Props {
  communicationId: string
  mouId: string
  schoolName: string
  installmentSeq: number
  subject: string
  bodyEmailHtml: string
  bodyWhatsApp: string
  alreadySent: boolean
}

export function ComposedFeedbackRequestPanel({
  communicationId,
  mouId,
  schoolName,
  installmentSeq,
  subject,
  bodyEmailHtml,
  bodyWhatsApp,
  alreadySent,
}: Props) {
  const [emailCopied, setEmailCopied] = useState(false)

  const handleCopyEmail = useCallback(async () => {
    const text = `Subject: ${subject}\n\n${bodyEmailHtml}`
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text)
      }
    } catch {
      // Clipboard API can fail in non-secure contexts; Phase 1.1 may
      // add a textarea fallback. Phase 1 testers run on https / localhost
      // where the API works.
    }
    setEmailCopied(true)
    setTimeout(() => setEmailCopied(false), 2000)
  }, [subject, bodyEmailHtml])

  const logWhatsappCopy = useCallback(async () => {
    try {
      await fetch('/api/communications/log-copy', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          schoolId: undefined,  // resolved from mouId server-side
          mouId,
          installmentSeq,
          bodyWhatsApp,
        }),
      })
    } catch {
      // log-copy failures are non-blocking; the user gets the
      // clipboard write either way.
    }
  }, [mouId, installmentSeq, bodyWhatsApp])

  return (
    <section className="space-y-4">
      <div className="rounded-lg border border-border bg-card p-4 sm:p-6">
        <h2 className="text-base font-semibold text-[var(--brand-navy)]">
          Email draft
        </h2>
        <dl className="mt-3 space-y-2 text-sm">
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-500">
              Subject
            </dt>
            <dd className="mt-0.5 text-[var(--brand-navy)]">{subject}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-500">
              Body (HTML preview)
            </dt>
            <dd className="mt-1 max-h-80 overflow-auto rounded-md border border-slate-200 bg-white p-3">
              <div dangerouslySetInnerHTML={{ __html: bodyEmailHtml }} />
            </dd>
          </div>
        </dl>
      </div>

      <div className="rounded-lg border border-border bg-card p-4 sm:p-6">
        <h2 className="text-base font-semibold text-[var(--brand-navy)]">
          WhatsApp draft
        </h2>
        <pre className="mt-3 max-h-60 overflow-auto whitespace-pre-wrap rounded-md border border-slate-200 bg-white p-3 text-sm text-slate-800">
{bodyWhatsApp}
        </pre>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-4 sm:p-6">
        <button
          type="button"
          onClick={handleCopyEmail}
          aria-live="polite"
          className={cn(
            'inline-flex min-h-11 items-center gap-2 rounded-md px-4 py-2 text-sm font-medium',
            'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-navy)]',
            emailCopied
              ? 'bg-[var(--brand-teal)] text-[var(--brand-navy)]'
              : 'border border-[var(--brand-navy)] bg-white text-[var(--brand-navy)] hover:bg-slate-50',
          )}
        >
          {emailCopied ? <Check className="size-4" aria-hidden /> : <CopyIcon className="size-4" aria-hidden />}
          {emailCopied ? 'Copied' : 'Copy email content'}
        </button>

        <CopyWhatsAppButton
          schoolName={schoolName}
          installmentSeq={installmentSeq}
          draftText={bodyWhatsApp}
          onLog={logWhatsappCopy}
        />

        <form
          method="POST"
          action={`/api/communications/${encodeURIComponent(communicationId)}/mark-sent`}
        >
          <input type="hidden" name="mouId" value={mouId} />
          <button
            type="submit"
            disabled={alreadySent}
            className={cn(
              'inline-flex min-h-11 items-center gap-2 rounded-md bg-[var(--brand-navy)] px-4 py-2 text-sm font-medium text-white',
              'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-navy)]',
              'hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50',
            )}
          >
            <Send className="size-4" aria-hidden />
            {alreadySent ? 'Marked as sent' : 'Mark as sent'}
          </button>
        </form>
      </div>
    </section>
  )
}
