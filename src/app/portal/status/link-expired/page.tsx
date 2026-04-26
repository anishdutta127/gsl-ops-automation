/*
 * /portal/status/link-expired (Phase C6).
 *
 * Static expired/invalid-token redirect target for the status portal.
 * Single canonical "this link does not work" page so the SPOC's path
 * forward is the same regardless of failure mode (HMAC mismatch,
 * expired, or token does not exist).
 */

export default function StatusLinkExpiredPage() {
  return (
    <div className="mx-auto w-full max-w-xl px-4 py-12 sm:px-6">
      <h1 className="text-2xl font-bold text-[var(--brand-navy)]">
        This status link is no longer active.
      </h1>
      <p className="mt-3 text-base text-foreground">
        Status links are valid for 30 days from the latest update email.
        Reply to the most recent email from the GSL ops team and we
        will send a fresh link.
      </p>
    </div>
  )
}
