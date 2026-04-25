'use client'

/*
 * CopyWhatsAppButton (DESIGN.md "Surface 4 / WhatsApp-draft-copied button").
 *
 * Secondary button rendered next to the primary "Send email"
 * affordance on each of 8 outbound-communication screens. On click:
 *   1. Browser clipboard write of the WhatsApp-prose draft.
 *   2. Server log via onLog() that writes a Communication record
 *      with channel: 'whatsapp-draft-copied' (caller wires the API
 *      call to /api/communications/log-copy).
 *   3. UI feedback: button morphs in place for 2 seconds. Text
 *      becomes "Copied", icon becomes Check, background flips to
 *      teal solid with white text. 200ms ease-out transition; no
 *      scaling, no bouncing per DESIGN.md "Surface 4 / Copy-
 *      confirmation pattern" (understated per ops tone).
 *   4. Reverts to default state after 2 seconds.
 *
 * Surveillance-mitigation tooltip from step 7 Fix 5: deferred to
 * Phase 1.1 (the localStorage-backed first-session tooltip is
 * non-trivial and not blocking for Item 11 placeholder use). The
 * underlying anonymisation guarantee is delivered by the
 * canViewAuditEntry permissions matrix in src/lib/auth/
 * permissions.ts; the dashboard tile aggregates per-school not
 * per-user.
 */

import { useCallback, useState } from 'react'
import { Check, MessageCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

interface CopyWhatsAppButtonProps {
  schoolName: string
  installmentSeq: number
  draftText: string
  onLog: () => Promise<void>
}

const COPY_REVERT_MS = 2000

export function CopyWhatsAppButton({
  schoolName,
  installmentSeq,
  draftText,
  onLog,
}: CopyWhatsAppButtonProps) {
  const [copied, setCopied] = useState(false)

  const handleClick = useCallback(async () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(draftText)
      }
    } catch {
      // Clipboard fallback is Phase 1.1 (modal with pre-selected
      // text). Even on failure, log the copy attempt below so the
      // 'draft-copied' signal is preserved.
    }

    try {
      await onLog()
    } catch {
      // Logging failure is non-fatal to UX.
    }

    setCopied(true)
    setTimeout(() => setCopied(false), COPY_REVERT_MS)
  }, [draftText, onLog])

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        aria-label={`Copy WhatsApp draft message for ${schoolName}, installment ${installmentSeq}`}
        className={cn(
          'inline-flex h-10 items-center gap-2 rounded-md border px-3 text-sm font-semibold',
          'transition-colors duration-200 ease-out',
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2',
          'focus-visible:outline-[var(--brand-navy)]',
          copied
            ? 'border-[var(--brand-teal)] bg-[var(--brand-teal)] text-white'
            : 'border-[var(--brand-teal)] bg-white text-[var(--brand-teal)] hover:bg-teal-50',
        )}
      >
        {copied ? (
          <Check aria-hidden className="size-4" />
        ) : (
          <MessageCircle aria-hidden className="size-4" />
        )}
        <span>{copied ? 'Copied' : 'Copy WhatsApp draft'}</span>
      </button>
      <div role="status" aria-live="polite" className="sr-only">
        {copied ? 'WhatsApp draft copied to clipboard.' : ''}
      </div>
    </>
  )
}
