/*
 * /feedback/link-expired (Phase C6).
 *
 * Static expired/used-token redirect target. Single canonical "this
 * link does not work" page so we do not leak whether the link was
 * never valid, expired, or already used. The SPOC's path forward is
 * the same in any case: contact ops to receive a fresh link.
 */

export default function FeedbackLinkExpiredPage() {
  return (
    <div className="mx-auto w-full max-w-xl px-4 py-12 sm:px-6">
      <h1 className="text-2xl font-bold text-[var(--brand-navy)]">
        This link is no longer active.
      </h1>
      <p className="mt-3 text-base text-foreground">
        Feedback links are valid for 48 hours and can be used once. If
        you still have feedback to share, reply to the email you
        received from the GSL ops team and we will send a fresh link.
      </p>
    </div>
  )
}
