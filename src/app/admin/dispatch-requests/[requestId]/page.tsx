/*
 * /admin/dispatch-requests/[requestId] (W4-D.3 detail).
 *
 * Renders the full DispatchRequest with three forms:
 *   - Approve (POST /api/dispatch-requests/[id]/approve)
 *     Specific B path (b): Ops can edit lineItems via the form;
 *     server-side reviewRequest treats override as authoritative.
 *   - Reject (POST .../reject)  with rejectionReason text.
 *   - Cancel (POST .../cancel)  surfaced when the request is still
 *     pending; visible to requester (own DR) and Ops.
 *
 * Visible to every authenticated user (W3-B); server-side gates run
 * inside the lib mutators.
 */

import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import type {
  DispatchRequest,
  MOU,
  School,
  User,
} from '@/lib/types'
import dispatchRequestsJson from '@/data/dispatch_requests.json'
import mousJson from '@/data/mous.json'
import schoolsJson from '@/data/schools.json'
import usersJson from '@/data/users.json'
import { getCurrentUser } from '@/lib/auth/session'
import { TopNav } from '@/components/ops/TopNav'
import { PageHeader } from '@/components/ops/PageHeader'
import { DetailHeaderCard } from '@/components/ops/DetailHeaderCard'

const allRequests = dispatchRequestsJson as unknown as DispatchRequest[]
const allMous = mousJson as unknown as MOU[]
const allSchools = schoolsJson as unknown as School[]
const allUsers = usersJson as unknown as User[]

interface PageProps {
  params: Promise<{ requestId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

const ERROR_MESSAGES: Record<string, string> = {
  permission: 'You do not have permission for that action.',
  'unknown-user': 'Session user not found. Please log in again.',
  'request-not-found': 'Dispatch request not found.',
  'request-not-pending': 'This request is no longer pending review.',
  'mou-not-found': 'MOU not found.',
  'school-not-found': 'School not found.',
  'dispatch-already-exists': 'A Dispatch with this MOU + installment already exists.',
  'invalid-line-items': 'Add at least one line item before approving.',
  'missing-rejection-reason': 'Rejection reason is required.',
}

const SUCCESS_MESSAGES: Record<string, string> = {
  approved: 'Approved and converted to a Dispatch.',
  rejected: 'Rejected.',
  cancelled: 'Cancelled.',
}

export default async function DispatchRequestDetailPage({ params, searchParams }: PageProps) {
  const user = await getCurrentUser()
  if (!user) redirect('/login?next=/admin/dispatch-requests')

  const { requestId } = await params
  const sp = await searchParams

  const request = allRequests.find((r) => r.id === requestId)
  if (!request) notFound()

  const mou = allMous.find((m) => m.id === request.mouId) ?? null
  const school = allSchools.find((s) => s.id === request.schoolId) ?? null
  const requester = allUsers.find((u) => u.id === request.requestedBy) ?? null

  const errorKey = typeof sp.error === 'string' ? sp.error : null
  const errorMessage = errorKey ? ERROR_MESSAGES[errorKey] ?? `Failed: ${errorKey}` : null
  const successKey = typeof sp.ok === 'string' ? sp.ok : null
  const successMessage = successKey ? SUCCESS_MESSAGES[successKey] ?? `Done: ${successKey}` : null

  const isPending = request.status === 'pending-approval'
  const isRequester = user.id === request.requestedBy

  return (
    <>
      <TopNav currentPath="/admin" />
      <PageHeader
        title={`Dispatch request ${request.id}`}
        breadcrumb={[
          { label: 'Admin', href: '/admin' },
          { label: 'Dispatch requests', href: '/admin/dispatch-requests' },
          { label: request.id },
        ]}
      />
      <div className="mx-auto flex max-w-screen-lg flex-col gap-4 px-4 py-6">
        {errorMessage ? (
          <div role="alert" className="rounded-md border border-signal-alert bg-signal-alert/10 px-3 py-2 text-sm text-signal-alert">
            {errorMessage}
          </div>
        ) : null}
        {successMessage ? (
          <div role="status" className="rounded-md border border-signal-ok bg-signal-ok/10 px-3 py-2 text-sm text-signal-ok">
            {successMessage}
            {request.conversionDispatchId ? (
              <>
                {' '}
                <Link href={`/mous/${request.mouId}/dispatch`} className="underline">
                  View dispatch {request.conversionDispatchId}
                </Link>
              </>
            ) : null}
          </div>
        ) : null}

        <DetailHeaderCard
          title={request.id}
          subtitle={`Status: ${request.status}`}
          metadata={[
            { label: 'School', value: mou?.schoolName ?? request.mouId },
            { label: 'MOU', value: request.mouId },
            { label: 'Installment', value: String(request.installmentSeq) },
            { label: 'Requester', value: requester?.name ?? request.requestedBy },
            {
              label: 'Submitted',
              value: new Date(request.requestedAt).toLocaleString('en-IN'),
            },
            { label: 'Reason', value: request.requestReason },
          ]}
        />

        <section aria-labelledby="line-items-heading" className="rounded-lg border border-border bg-card p-4 sm:p-6">
          <h3 id="line-items-heading" className="mb-3 font-heading text-base font-semibold text-brand-navy">
            Line items as requested
          </h3>
          <ul className="divide-y divide-border">
            {request.lineItems.map((it, idx) => (
              <li key={idx} className="py-2 text-sm">
                <span className="font-medium">{it.skuName}</span>{' '}
                <span className="rounded-sm bg-muted px-1.5 py-0.5 text-[11px]">{it.kind}</span>{' '}
                {it.kind === 'flat' ? (
                  <span>qty {it.quantity}</span>
                ) : (
                  <span>
                    {it.gradeAllocations.map((a) => `Grade ${a.grade}: ${a.quantity}`).join(', ')}
                  </span>
                )}
              </li>
            ))}
          </ul>
          {school !== null ? (
            <p className="mt-3 text-xs text-muted-foreground">
              Ship to: {school.name} · {school.city}, {school.state}
              {school.pinCode ? ` ${school.pinCode}` : ''}
            </p>
          ) : null}
        </section>

        {isPending ? (
          <>
            <section aria-labelledby="approve-heading" className="rounded-lg border border-border bg-card p-4 sm:p-6">
              <h3 id="approve-heading" className="mb-3 font-heading text-base font-semibold text-brand-navy">
                Approve & convert to Dispatch
              </h3>
              <p className="mb-3 text-sm text-muted-foreground">
                Specific B (b): Ops can edit line items during conversion. Approving without
                edits creates a Dispatch with the items shown above. To edit, paste an updated
                JSON line items array below; leave empty to approve as submitted.
              </p>
              <form
                action={`/api/dispatch-requests/${request.id}/approve`}
                method="POST"
                className="space-y-3"
              >
                <div>
                  <label htmlFor="lineItemsOverride" className="block text-sm font-medium text-brand-navy mb-1">
                    Edited line items (optional JSON)
                  </label>
                  <textarea
                    id="lineItemsOverride"
                    name="lineItemsOverride"
                    rows={4}
                    placeholder='Leave empty to approve as submitted, or paste e.g. [{"kind":"flat","skuName":"...","quantity":80}]'
                    className="block w-full rounded-md border border-input bg-card px-3 py-2 font-mono text-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
                  />
                </div>
                <div>
                  <label htmlFor="approveNotes" className="block text-sm font-medium text-brand-navy mb-1">
                    Notes (optional)
                  </label>
                  <input
                    id="approveNotes"
                    name="notes"
                    type="text"
                    className="block w-full rounded-md border border-input bg-card px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
                  />
                </div>
                <button
                  type="submit"
                  data-testid="dr-approve-submit"
                  className="inline-flex min-h-11 items-center rounded-md bg-brand-teal px-4 py-2 text-sm font-medium text-brand-navy hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-brand-navy"
                >
                  Approve & convert
                </button>
              </form>
            </section>

            <section aria-labelledby="reject-heading" className="rounded-lg border border-border bg-card p-4 sm:p-6">
              <h3 id="reject-heading" className="mb-3 font-heading text-base font-semibold text-brand-navy">
                Reject
              </h3>
              <form
                action={`/api/dispatch-requests/${request.id}/reject`}
                method="POST"
                className="space-y-3"
              >
                <div>
                  <label htmlFor="rejectionReason" className="block text-sm font-medium text-brand-navy mb-1">
                    Rejection reason (required)
                  </label>
                  <textarea
                    id="rejectionReason"
                    name="rejectionReason"
                    rows={2}
                    required
                    placeholder="Wrong programme / pre-payment dispute / etc."
                    className="block w-full rounded-md border border-input bg-card px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
                  />
                </div>
                <button
                  type="submit"
                  data-testid="dr-reject-submit"
                  className="inline-flex min-h-11 items-center rounded-md border border-signal-alert bg-card px-4 py-2 text-sm font-medium text-signal-alert hover:bg-signal-alert/10 focus:outline-none focus:ring-2 focus:ring-brand-navy"
                >
                  Reject
                </button>
              </form>
            </section>

            <section aria-labelledby="cancel-heading" className="rounded-lg border border-border bg-card p-4 sm:p-6">
              <h3 id="cancel-heading" className="mb-3 font-heading text-base font-semibold text-brand-navy">
                Cancel
              </h3>
              <p className="mb-3 text-sm text-muted-foreground">
                {isRequester
                  ? 'You submitted this request. Cancelling withdraws it from review.'
                  : 'Ops can cancel a pending request when the requester is unavailable.'}
              </p>
              <form
                action={`/api/dispatch-requests/${request.id}/cancel`}
                method="POST"
                className="space-y-3"
              >
                <div>
                  <label htmlFor="cancelNotes" className="block text-sm font-medium text-brand-navy mb-1">
                    Reason (optional)
                  </label>
                  <input
                    id="cancelNotes"
                    name="notes"
                    type="text"
                    className="block w-full rounded-md border border-input bg-card px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
                  />
                </div>
                <button
                  type="submit"
                  data-testid="dr-cancel-submit"
                  className="inline-flex min-h-11 items-center rounded-md border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-muted focus:outline-none focus:ring-2 focus:ring-brand-navy"
                >
                  Cancel request
                </button>
              </form>
            </section>
          </>
        ) : (
          <section className="rounded-lg border border-border bg-muted/30 p-4 sm:p-6">
            <p className="text-sm">
              This request is no longer pending. Status: <strong>{request.status}</strong>.
              {request.rejectionReason ? <> Rejection reason: {request.rejectionReason}.</> : null}
              {request.conversionDispatchId ? (
                <> Converted to <Link href={`/mous/${request.mouId}/dispatch`} className="underline">{request.conversionDispatchId}</Link>.</>
              ) : null}
            </p>
          </section>
        )}

        <section aria-labelledby="audit-heading" className="rounded-lg border border-border bg-card p-4 sm:p-6">
          <h3 id="audit-heading" className="mb-3 font-heading text-base font-semibold text-brand-navy">
            Audit log
          </h3>
          {request.auditLog.length === 0 ? (
            <p className="text-sm text-muted-foreground">No audit entries yet.</p>
          ) : (
            <ul className="space-y-1.5 text-xs">
              {request.auditLog.map((e, i) => (
                <li key={i} className="rounded-sm border border-border bg-muted/30 p-2">
                  <span className="font-mono text-muted-foreground">
                    {new Date(e.timestamp).toLocaleString('en-IN')}
                  </span>{' '}
                  <span className="font-medium">{e.action}</span> by {e.user}
                  {e.notes ? <span className="text-muted-foreground"> · {e.notes}</span> : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  )
}
