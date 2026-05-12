/*
 * DispatchOverrideSection (Gate 5A.5 Step 4).
 *
 * MOU detail page section between the master status tracker and the
 * workflow banner. Surfaces the current dispatchOverride state and
 * the appropriate action affordances:
 *
 *   - status 'none'      -> "Request dispatch override" button for
 *                           users with canRequestDispatchOverride.
 *   - status 'requested' -> request banner with reason + requestor;
 *                           approve / reject inline forms for users
 *                           with canApproveDispatchOverride.
 *   - status 'approved'  -> approval banner with approver + notes;
 *                           visible to all viewers.
 *   - status 'rejected'  -> rejection banner with reason; allows
 *                           re-request for users with canRequest.
 *
 * Server component: takes pre-computed booleans + the resolved override
 * approver name so the MOU page does the data wiring once.
 */

import { CheckCircle2, CircleAlert, ShieldAlert, ShieldCheck } from 'lucide-react'
import type { MouDispatchOverride } from '@/lib/types'

interface Props {
  mouId: string
  override: MouDispatchOverride
  approverUserId: string
  approverDisplayName: string
  requesterDisplayName: string | null
  responderDisplayName: string | null
  canRequest: boolean
  canApprove: boolean
}

export function DispatchOverrideSection({
  mouId,
  override,
  // approverUserId is on the Props for future use (link the approver
  // pill to /admin/users/[id] in Phase 1.1); not consumed yet.
  approverUserId: _approverUserId,
  approverDisplayName,
  requesterDisplayName,
  responderDisplayName,
  canRequest,
  canApprove,
}: Props) {
  if (override.status === 'none') {
    if (!canRequest) return null
    return (
      <section
        aria-labelledby="dispatch-override-heading"
        data-testid="dispatch-override-section"
        data-override-status="none"
        className="rounded-lg border border-border bg-card p-4"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3
              id="dispatch-override-heading"
              className="font-heading text-sm font-semibold text-brand-navy"
            >
              Dispatch override
            </h3>
            <p className="mt-1 text-xs text-slate-600">
              Bypass the payment gate for trial, pilot, or urgent partnerships. The request goes to {approverDisplayName} for approval; on approval the kit dispatch flow proceeds without waiting for PI generation or payment.
            </p>
          </div>
        </div>
        <details className="mt-3 group" data-testid="dispatch-override-request-details">
          <summary className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-md border border-brand-teal bg-white px-3 text-sm font-semibold text-brand-navy hover:bg-brand-teal/10 focus:outline-none focus:ring-2 focus:ring-brand-navy">
            <ShieldAlert aria-hidden className="size-4" />
            Request dispatch override
          </summary>
          <form
            method="POST"
            action={`/api/mou/${encodeURIComponent(mouId)}/dispatch-override/request`}
            className="mt-3 space-y-2"
          >
            <label
              htmlFor="override-request-reason"
              className="block text-xs font-medium text-brand-navy"
            >
              Reason for override (required)
            </label>
            <textarea
              id="override-request-reason"
              name="reason"
              required
              minLength={1}
              rows={3}
              placeholder="Trial batch ships Monday; PI takes 3 working days."
              className="w-full rounded-md border border-border bg-white p-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-navy"
              data-testid="override-request-reason"
            />
            <button
              type="submit"
              className="inline-flex min-h-11 items-center gap-2 rounded-md bg-brand-teal px-4 text-sm font-semibold text-brand-navy hover:bg-brand-teal/90 focus:outline-none focus:ring-2 focus:ring-brand-navy"
              data-testid="override-request-submit"
            >
              Submit request to {approverDisplayName}
            </button>
          </form>
        </details>
      </section>
    )
  }

  if (override.status === 'requested') {
    return (
      <section
        aria-labelledby="dispatch-override-heading"
        data-testid="dispatch-override-section"
        data-override-status="requested"
        className="rounded-lg border border-amber-300 bg-amber-50 p-4"
      >
        <div className="flex items-start gap-3">
          <CircleAlert aria-hidden className="mt-0.5 size-5 shrink-0 text-amber-700" />
          <div className="min-w-0 flex-1">
            <h3
              id="dispatch-override-heading"
              className="font-heading text-sm font-semibold text-amber-900"
            >
              Dispatch override requested
            </h3>
            <p className="mt-0.5 text-xs text-amber-800">
              Requested by {requesterDisplayName ?? override.requestedBy ?? 'unknown'}
              {' on '}
              {override.requestedAt ? override.requestedAt.slice(0, 10) : 'unknown date'}
              . Awaiting {approverDisplayName}.
            </p>
            {override.requestReason ? (
              <blockquote
                className="mt-2 border-l-2 border-amber-400 pl-3 text-sm text-amber-900"
                data-testid="override-request-reason-display"
              >
                {override.requestReason}
              </blockquote>
            ) : null}

            {canApprove ? (
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2" data-testid="override-approval-actions">
                <details className="group rounded-md border border-emerald-500/40 bg-white">
                  <summary className="inline-flex min-h-11 w-full cursor-pointer items-center gap-2 rounded-md px-3 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 focus:outline-none focus:ring-2 focus:ring-emerald-500">
                    <ShieldCheck aria-hidden className="size-4" />
                    Approve
                  </summary>
                  <form
                    method="POST"
                    action={`/api/mou/${encodeURIComponent(mouId)}/dispatch-override/approve`}
                    className="space-y-2 p-3"
                  >
                    <label
                      htmlFor="override-approve-notes"
                      className="block text-xs font-medium text-emerald-900"
                    >
                      Approval notes (optional)
                    </label>
                    <textarea
                      id="override-approve-notes"
                      name="notes"
                      rows={2}
                      placeholder="Approved for the pilot batch."
                      className="w-full rounded-md border border-emerald-300 bg-white p-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      data-testid="override-approve-notes"
                    />
                    <button
                      type="submit"
                      className="inline-flex min-h-11 items-center gap-2 rounded-md bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      data-testid="override-approve-submit"
                    >
                      Confirm approval
                    </button>
                  </form>
                </details>

                <details className="group rounded-md border border-signal-alert/40 bg-white">
                  <summary className="inline-flex min-h-11 w-full cursor-pointer items-center gap-2 rounded-md px-3 text-sm font-semibold text-signal-alert hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-signal-alert">
                    <ShieldAlert aria-hidden className="size-4" />
                    Reject
                  </summary>
                  <form
                    method="POST"
                    action={`/api/mou/${encodeURIComponent(mouId)}/dispatch-override/reject`}
                    className="space-y-2 p-3"
                  >
                    <label
                      htmlFor="override-reject-reason"
                      className="block text-xs font-medium text-signal-alert"
                    >
                      Rejection reason (required)
                    </label>
                    <textarea
                      id="override-reject-reason"
                      name="reason"
                      required
                      minLength={1}
                      rows={2}
                      placeholder="Please raise the PI first."
                      className="w-full rounded-md border border-signal-alert/40 bg-white p-2 text-sm focus:outline-none focus:ring-2 focus:ring-signal-alert"
                      data-testid="override-reject-reason"
                    />
                    <button
                      type="submit"
                      className="inline-flex min-h-11 items-center gap-2 rounded-md bg-signal-alert px-4 text-sm font-semibold text-white hover:bg-signal-alert/90 focus:outline-none focus:ring-2 focus:ring-signal-alert"
                      data-testid="override-reject-submit"
                    >
                      Confirm rejection
                    </button>
                  </form>
                </details>
              </div>
            ) : (
              <p className="mt-3 text-xs text-amber-800" data-testid="override-not-approver-hint">
                Only {approverDisplayName} (or an Admin wildcard) can approve or reject this request.
              </p>
            )}
          </div>
        </div>
      </section>
    )
  }

  if (override.status === 'approved') {
    return (
      <section
        aria-labelledby="dispatch-override-heading"
        data-testid="dispatch-override-section"
        data-override-status="approved"
        className="rounded-lg border border-emerald-500/40 bg-emerald-50 p-4"
      >
        <div className="flex items-start gap-3">
          <CheckCircle2 aria-hidden className="mt-0.5 size-5 shrink-0 text-emerald-700" />
          <div className="min-w-0 flex-1">
            <h3
              id="dispatch-override-heading"
              className="font-heading text-sm font-semibold text-emerald-900"
            >
              Dispatch override approved
            </h3>
            <p className="mt-0.5 text-xs text-emerald-800">
              Approved by {responderDisplayName ?? override.approvedBy ?? 'unknown'}
              {' on '}
              {override.approvedAt ? override.approvedAt.slice(0, 10) : 'unknown date'}
              . The status tracker now skips payment-pending and 1st instalment received; kits can dispatch without PI generation or payment.
            </p>
            {override.approvalNotes ? (
              <blockquote
                className="mt-2 border-l-2 border-emerald-400 pl-3 text-sm text-emerald-900"
                data-testid="override-approval-notes-display"
              >
                {override.approvalNotes}
              </blockquote>
            ) : null}
            {override.requestReason ? (
              <p className="mt-2 text-xs text-emerald-800">
                Original reason: <span className="italic">{override.requestReason}</span>
              </p>
            ) : null}
          </div>
        </div>
      </section>
    )
  }

  if (override.status === 'rejected') {
    return (
      <section
        aria-labelledby="dispatch-override-heading"
        data-testid="dispatch-override-section"
        data-override-status="rejected"
        className="rounded-lg border border-signal-alert/40 bg-red-50 p-4"
      >
        <div className="flex items-start gap-3">
          <ShieldAlert aria-hidden className="mt-0.5 size-5 shrink-0 text-signal-alert" />
          <div className="min-w-0 flex-1">
            <h3
              id="dispatch-override-heading"
              className="font-heading text-sm font-semibold text-signal-alert"
            >
              Dispatch override rejected
            </h3>
            <p className="mt-0.5 text-xs text-red-800">
              Rejected by {responderDisplayName ?? override.rejectedBy ?? 'unknown'}
              {' on '}
              {override.rejectedAt ? override.rejectedAt.slice(0, 10) : 'unknown date'}.
            </p>
            {override.rejectionReason ? (
              <blockquote
                className="mt-2 border-l-2 border-signal-alert/60 pl-3 text-sm text-red-900"
                data-testid="override-rejection-reason-display"
              >
                {override.rejectionReason}
              </blockquote>
            ) : null}
            {canRequest ? (
              <details className="mt-3 group" data-testid="dispatch-override-rerequest-details">
                <summary className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-md border border-brand-teal bg-white px-3 text-sm font-semibold text-brand-navy hover:bg-brand-teal/10 focus:outline-none focus:ring-2 focus:ring-brand-navy">
                  <ShieldAlert aria-hidden className="size-4" />
                  Submit a new override request
                </summary>
                <form
                  method="POST"
                  action={`/api/mou/${encodeURIComponent(mouId)}/dispatch-override/request`}
                  className="mt-3 space-y-2"
                >
                  <label
                    htmlFor="override-request-reason"
                    className="block text-xs font-medium text-brand-navy"
                  >
                    Updated reason (required)
                  </label>
                  <textarea
                    id="override-request-reason"
                    name="reason"
                    required
                    minLength={1}
                    rows={3}
                    placeholder="Updated rationale addressing the earlier rejection."
                    className="w-full rounded-md border border-border bg-white p-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-navy"
                    data-testid="override-rerequest-reason"
                  />
                  <button
                    type="submit"
                    className="inline-flex min-h-11 items-center gap-2 rounded-md bg-brand-teal px-4 text-sm font-semibold text-brand-navy hover:bg-brand-teal/90 focus:outline-none focus:ring-2 focus:ring-brand-navy"
                  >
                    Re-submit request to {approverDisplayName}
                  </button>
                </form>
              </details>
            ) : null}
          </div>
        </div>
      </section>
    )
  }

  return null
}
