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
import { TopNav } from '@/components/ops/TopNav'
import { PageHeader } from '@/components/ops/PageHeader'
import { OpsButton } from '@/components/ops/OpsButton'

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
    <>
      <TopNav currentPath="/admin" />
      <main id="main-content">
        <PageHeader
          title="MOU import review"
          subtitle={`${unresolved.length} unresolved, ${resolved.length} resolved.`}
          breadcrumb={[
            { label: 'Dashboard', href: '/' },
            { label: 'Admin', href: '/admin' },
            { label: 'Import review' },
          ]}
        />
        <div className="mx-auto max-w-screen-md px-4 py-6">

      {errorMessage ? (
        <p
          role="alert"
          className="mt-4 rounded-md border border-signal-alert bg-signal-alert/10 px-3 py-2 text-sm text-signal-alert"
        >
          {errorMessage}
        </p>
      ) : null}

      <section className="mt-6">
        <h2 className="text-lg font-semibold text-brand-navy">Queue</h2>
        {unresolved.length === 0 ? (
          <p className="mt-2 rounded-md border border-border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
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
          <h2 className="text-lg font-semibold text-brand-navy">Resolved</h2>
          <ul className="mt-2 divide-y divide-border rounded-md border border-border bg-card">
            {resolved.map((item) => (
              <li key={`${item.queuedAt}-${rawRecordId(item)}`} className="px-3 py-2 text-xs">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-medium text-brand-navy">
                    {rawRecordId(item)}{rawSchoolName(item) ? `: ${rawSchoolName(item)}` : ''}
                  </span>
                  <span className="text-muted-foreground">
                    {item.resolution} by {item.resolvedBy ?? '?'} at {item.resolvedAt?.slice(0, 10) ?? '?'}
                  </span>
                </div>
                {item.rejectionReason ? (
                  <div className="mt-0.5 text-foreground">
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
      </main>
    </>
  )
}

function QueueRow({ item }: { item: MouImportReviewItem }) {
  const id = rawRecordId(item)
  const schoolName = rawSchoolName(item)
  const formIdPrefix = `qr-${id}`

  return (
    <li className="rounded-md border border-border bg-card p-4">
      <header className="mb-2">
        <h3 className="text-sm font-semibold text-brand-navy">
          {id}
          {schoolName ? <span className="ml-2 text-foreground">: {schoolName}</span> : null}
        </h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Queued {item.queuedAt.slice(0, 10)}
          {item.validationFailed ? ` · validation: ${item.validationFailed}` : ''}
        </p>
        <p className="mt-1 text-xs text-foreground">{item.quarantineReason}</p>
      </header>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <form
          method="POST"
          action="/api/mou/import-review/reject"
          className="rounded-md border border-border bg-muted/30 p-3"
        >
          <h4 className="text-xs font-semibold uppercase tracking-wide text-foreground">
            Reject
          </h4>
          <input type="hidden" name="queuedAt" value={item.queuedAt} />
          <input type="hidden" name="rawRecordId" value={id} />
          <div className="mt-2">
            <label
              htmlFor={`${formIdPrefix}-reason`}
              className="block text-xs font-medium text-foreground"
            >
              Reason
            </label>
            <select
              id={`${formIdPrefix}-reason`}
              name="rejectionReason"
              required
              defaultValue=""
              className="mt-1 w-full min-h-9 rounded-md border border-input bg-card px-2 py-1.5 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
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
              className="block text-xs font-medium text-foreground"
            >
              Notes <span className="text-muted-foreground">(required for &quot;Other&quot;)</span>
            </label>
            <textarea
              id={`${formIdPrefix}-notes`}
              name="rejectionNotes"
              rows={2}
              className="mt-1 w-full rounded-md border border-input bg-card px-2 py-1.5 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
            />
          </div>
          <OpsButton type="submit" variant="primary" size="sm" className="mt-3">
            Reject this record
          </OpsButton>
        </form>

        <div className="rounded-md border border-border bg-muted/30 p-3">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-foreground">
            Import
          </h4>
          <p className="mt-2 text-xs text-foreground">
            Phase 1 note: import resolution is wired in Phase D when school-groups
            infrastructure lands. Phase D will add per-case forms for
            validation-failed, zero-match, multi-candidate, and chain-MOU
            resolution paths.
          </p>
          <OpsButton variant="outline" size="sm" disabled aria-disabled="true" className="mt-3">
            Import (wired in Phase D)
          </OpsButton>
        </div>
      </div>
    </li>
  )
}
