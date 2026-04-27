/*
 * /admin/mou-import-review (Phase C5a-2).
 *
 * Server Component. Lists every quarantined MouImportReviewItem with
 * an inline Reject form and an Import button stub. Reject is REAL
 * (RejectionReason enum + optional notes; lib/api wired). Import is
 * STUBBED with an inline note; per-quarantine-type forms + the
 * school-groups dependency for chain-MOU classification land in
 * Phase D.
 *
 * Permission gate: Admin or OpsHead. Other viewers redirect to
 * /dashboard.
 *
 * Resolved items are still displayed (collapsed) so reviewers can
 * see their decision history; the queue length is "unresolved" only.
 */

import { redirect } from 'next/navigation'
import type { MouImportReviewItem } from '@/lib/types'
import mouImportReviewJson from '@/data/mou_import_review.json'
import { getCurrentUser } from '@/lib/auth/session'

const items = mouImportReviewJson as unknown as MouImportReviewItem[]

const REJECTION_REASON_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'data-quality-issue', label: 'Data quality issue' },
  { value: 'duplicate-of-existing', label: 'Duplicate of an existing record' },
  { value: 'out-of-scope', label: 'Out of scope (legacy / wrong programme / wrong year)' },
  { value: 'awaiting-source-correction', label: 'Awaiting source correction' },
  { value: 'other', label: 'Other (notes required)' },
]

const ERROR_MESSAGES: Record<string, string> = {
  permission: 'You do not have permission to resolve import-review items.',
  'unknown-user': 'Session user not found. Please log in again.',
  'item-not-found': 'Item not found in the queue.',
  'already-resolved': 'Item has already been resolved.',
  'invalid-rejection-reason': 'Pick a rejection reason.',
  'notes-required': 'Notes are required when rejecting with reason "other".',
  'missing-queued-at': 'Queue timestamp missing from the form.',
  'missing-raw-record-id': 'Source record id missing from the form.',
}

function rawRecordId(item: MouImportReviewItem): string {
  if (typeof item.rawRecord !== 'object' || item.rawRecord === null) return ''
  const id = (item.rawRecord as { id?: unknown }).id
  return typeof id === 'string' ? id : ''
}

function rawSchoolName(item: MouImportReviewItem): string {
  if (typeof item.rawRecord !== 'object' || item.rawRecord === null) return ''
  const name = (item.rawRecord as { schoolName?: unknown }).schoolName
  return typeof name === 'string' ? name : ''
}

export default async function MouImportReviewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = await searchParams
  const user = await getCurrentUser()
  if (!user) redirect('/login?next=%2Fadmin%2Fmou-import-review')

  const errorKey = typeof sp.error === 'string' ? sp.error : null
  const errorMessage = errorKey ? ERROR_MESSAGES[errorKey] ?? `Failed: ${errorKey}` : null

  const unresolved = items.filter((i) => i.resolution === null)
  const resolved = items.filter((i) => i.resolution !== null)

  return (
    <div className="p-6 max-w-4xl">
      <h1 className="text-2xl font-bold text-[var(--brand-navy)]">MOU import review</h1>
      <p className="mt-1 text-sm text-slate-700">
        {unresolved.length} unresolved, {resolved.length} resolved.
      </p>

      {errorMessage ? (
        <p
          role="alert"
          className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
        >
          {errorMessage}
        </p>
      ) : null}

      <section className="mt-6">
        <h2 className="text-lg font-semibold text-[var(--brand-navy)]">Queue</h2>
        {unresolved.length === 0 ? (
          <p className="mt-2 rounded-md border border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-600">
            Queue is empty.
          </p>
        ) : (
          <ul className="mt-2 space-y-4">
            {unresolved.map((item) => (
              <QueueRow key={`${item.queuedAt}-${rawRecordId(item)}`} item={item} />
            ))}
          </ul>
        )}
      </section>

      {resolved.length > 0 ? (
        <section className="mt-10">
          <h2 className="text-lg font-semibold text-[var(--brand-navy)]">Resolved</h2>
          <ul className="mt-2 divide-y divide-slate-200 rounded-md border border-slate-200 bg-white">
            {resolved.map((item) => (
              <li key={`${item.queuedAt}-${rawRecordId(item)}`} className="px-3 py-2 text-xs">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-medium text-[var(--brand-navy)]">
                    {rawRecordId(item)}{rawSchoolName(item) ? `: ${rawSchoolName(item)}` : ''}
                  </span>
                  <span className="text-slate-500">
                    {item.resolution} by {item.resolvedBy ?? '?'} at {item.resolvedAt?.slice(0, 10) ?? '?'}
                  </span>
                </div>
                {item.rejectionReason ? (
                  <div className="mt-0.5 text-slate-700">
                    Reason: {item.rejectionReason}
                    {item.rejectionNotes ? ` (${item.rejectionNotes})` : ''}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}

function QueueRow({ item }: { item: MouImportReviewItem }) {
  const id = rawRecordId(item)
  const schoolName = rawSchoolName(item)
  const formIdPrefix = `qr-${id}`

  return (
    <li className="rounded-md border border-slate-200 bg-white p-4">
      <header className="mb-2">
        <h3 className="text-sm font-semibold text-[var(--brand-navy)]">
          {id}
          {schoolName ? <span className="ml-2 text-slate-700">: {schoolName}</span> : null}
        </h3>
        <p className="mt-0.5 text-xs text-slate-600">
          Queued {item.queuedAt.slice(0, 10)}
          {item.validationFailed ? ` · validation: ${item.validationFailed}` : ''}
        </p>
        <p className="mt-1 text-xs text-slate-700">{item.quarantineReason}</p>
      </header>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <form
          method="POST"
          action="/api/mou/import-review/reject"
          className="rounded-md border border-slate-200 bg-slate-50 p-3"
        >
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-700">
            Reject
          </h4>
          <input type="hidden" name="queuedAt" value={item.queuedAt} />
          <input type="hidden" name="rawRecordId" value={id} />
          <div className="mt-2">
            <label
              htmlFor={`${formIdPrefix}-reason`}
              className="block text-xs font-medium text-slate-700"
            >
              Reason
            </label>
            <select
              id={`${formIdPrefix}-reason`}
              name="rejectionReason"
              required
              defaultValue=""
              className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-navy)]"
            >
              <option value="" disabled>
                Choose a reason
              </option>
              {REJECTION_REASON_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="mt-2">
            <label
              htmlFor={`${formIdPrefix}-notes`}
              className="block text-xs font-medium text-slate-700"
            >
              Notes <span className="text-slate-500">(required for &quot;Other&quot;)</span>
            </label>
            <textarea
              id={`${formIdPrefix}-notes`}
              name="rejectionNotes"
              rows={2}
              className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-navy)]"
            />
          </div>
          <button
            type="submit"
            className="mt-3 inline-flex items-center rounded-md bg-[var(--brand-navy)] px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-navy)] min-h-[44px]"
          >
            Reject this record
          </button>
        </form>

        <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-700">
            Import
          </h4>
          <p className="mt-2 text-xs text-slate-700">
            Phase 1 note: import resolution is wired in Phase D when school-groups
            infrastructure lands. Phase D will add per-case forms for
            validation-failed, zero-match, multi-candidate, and chain-MOU
            resolution paths.
          </p>
          <button
            type="button"
            disabled
            aria-disabled="true"
            className="mt-3 inline-flex items-center rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-500 min-h-[44px]"
          >
            Import (wired in Phase D)
          </button>
        </div>
      </div>
    </li>
  )
}
