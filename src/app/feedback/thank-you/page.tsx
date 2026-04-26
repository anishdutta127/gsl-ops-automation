/*
 * /feedback/thank-you (Phase C6).
 *
 * Static post-submit confirmation. Per DESIGN.md "Surface 2 /
 * Internal-only auto-escalation": the copy reads identically
 * regardless of whether the SPOC's ratings triggered an internal
 * Escalation. We do not surface escalation status to the SPOC.
 */

export default function FeedbackThankYouPage() {
  return (
    <div className="mx-auto w-full max-w-xl px-4 py-12 sm:px-6">
      <h1 className="text-2xl font-bold text-[var(--brand-navy)]">
        Thanks for your feedback.
      </h1>
      <p className="mt-3 text-base text-foreground">
        We have received your responses. The GSL ops team will follow up
        if any of your answers need a closer look.
      </p>
      <p className="mt-6 text-sm text-slate-600">
        You can close this page now.
      </p>
    </div>
  )
}
