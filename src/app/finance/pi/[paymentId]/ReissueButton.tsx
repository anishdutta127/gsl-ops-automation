'use client'

/*
 * Client wrapper for the PI re-issue button (Gate 2 Step 6).
 *
 * The PI view page is otherwise a Server Component. The re-issue
 * action is destructive (voids the old PI number, advances the
 * per-entity counter) so we surface a confirm dialog before the
 * form submits. Native confirm() is fine for a 5-person internal
 * tool; a styled dialog can land in Phase 1.1 if testers ask.
 *
 * Form posts to /api/finance/pi/[paymentId]/reissue. The server
 * route handles auth + lock-check + counter advance.
 */

import { useState } from 'react'

interface Props {
  paymentId: string
  oldPiNumber: string | null
}

export function ReissueButton({ paymentId, oldPiNumber }: Props) {
  const [busy, setBusy] = useState(false)

  const message =
    oldPiNumber !== null
      ? `Re-issuing will void PI ${oldPiNumber} and advance the per-entity counter. The new PI carries a new number. Are you sure?`
      : 'Re-issuing will advance the per-entity counter and stamp a new PI number on this instalment. Are you sure?'

  return (
    <form
      method="POST"
      action={`/api/finance/pi/${encodeURIComponent(paymentId)}/reissue`}
      onSubmit={(e) => {
        if (!window.confirm(message)) {
          e.preventDefault()
          return
        }
        setBusy(true)
      }}
    >
      <button
        type="submit"
        disabled={busy}
        data-testid="pi-reissue-button"
        className="inline-flex min-h-11 items-center rounded-md bg-brand-navy px-4 py-2 text-sm font-semibold text-white hover:bg-brand-navy/90 focus:outline-none focus:ring-2 focus:ring-brand-navy disabled:opacity-50"
      >
        {busy ? 'Re-issuing…' : 'Re-issue PI'}
      </button>
    </form>
  )
}
