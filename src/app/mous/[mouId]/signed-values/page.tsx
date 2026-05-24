/*
 * /mous/[mouId]/signed-values (Step 5).
 *
 * Signed values capture. Form takes signedDate, signedBy (auto-fills
 * to current user), pricePerStudent, studentCount, duration,
 * signedScanUrl, notes. Writes to src/data/signed_values.json via the
 * queue (`upsertSignedValues` in src/lib/mouSystem/entityWriters.ts).
 *
 * Mirrors gsl-mou-system's SignedValuesPanel: same field order, same
 * placeholders, same draft-vs-signed diff table once captured.
 *
 * Server-side gate: canEditMOU.
 */

import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { MOU, User } from '@/lib/types'
import type { SignedValues } from '@/lib/mouSystem/types'
import { mouRepo } from '@/lib/db/repos/mou'
import { signedValueRepo } from '@/lib/db/repos/leafRepos'
import { TopNav } from '@/components/ops/TopNav'
import { PageHeader } from '@/components/ops/PageHeader'
import { DetailHeaderCard } from '@/components/ops/DetailHeaderCard'
import { opsButtonClass } from '@/components/ops/OpsButton'
import { getCurrentUser } from '@/lib/auth/session'
import { canEditMOU } from '@/lib/access'
import { formatRs, formatDate } from '@/lib/format'

interface PageProps {
  params: Promise<{ mouId: string }>
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

function isVisibleToUser(mou: MOU, user: User | null): boolean {
  if (!user) return false
  if (user.role === 'SalesRep') return mou.salesPersonId === user.id
  return true
}

const ERROR_COPY: Record<string, string> = {
  'invalid-price': 'Enter a valid price per student.',
  'invalid-students': 'Enter a valid student count.',
  'missing-duration': 'Duration is required.',
  'missing-date': 'Signed date is required.',
  permission: 'You do not have permission to capture signed values.',
}

const FIELD_INPUT_CLASS =
  'block w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand-navy'
const FIELD_LABEL_CLASS = 'block text-sm font-medium text-brand-navy mb-1'

export default async function SignedValuesPage({ params, searchParams }: PageProps) {
  const { mouId } = await params
  const sp = (await searchParams) ?? {}
  const user = await getCurrentUser()
  const [allMous, allSignedValues] = await Promise.all([
    mouRepo.findAll(),
    signedValueRepo.findAll() as unknown as Promise<SignedValues[]>,
  ])
  const mou = allMous.find((m) => m.id === mouId)
  if (!mou || !isVisibleToUser(mou, user)) notFound()
  if (!user || !canEditMOU(user)) notFound()

  const signed = allSignedValues.find((s) => s.mouId === mou.id) ?? null
  const errorKey = typeof sp.error === 'string' ? sp.error : null
  const errorMessage = errorKey ? ERROR_COPY[errorKey] ?? null : null
  const noticeKey = typeof sp.notice === 'string' ? sp.notice : null

  const today = new Date().toISOString().slice(0, 10)

  // Draft vs signed diff (matches SignedValuesPanel.tsx logic).
  const diffs: Array<[string, string, string]> = []
  if (signed) {
    if (signed.pricePerStudent !== mou.spWithTax) {
      diffs.push(['Price per student', formatRs(mou.spWithTax), formatRs(signed.pricePerStudent)])
    }
    if (signed.studentCount !== mou.studentsMou) {
      diffs.push([
        'Student count',
        mou.studentsMou.toLocaleString('en-IN'),
        signed.studentCount.toLocaleString('en-IN'),
      ])
    }
    if (signed.duration && signed.duration !== mou.paymentSchedule) {
      diffs.push(['Duration', '-', signed.duration])
    }
  }

  return (
    <>
      <TopNav currentPath="/mous" />
      <main id="main-content">
        <PageHeader
          title={`${mou.schoolName} {'·'} Signed values`}
          breadcrumb={[
            { label: 'MOUs', href: '/mous' },
            { label: mou.id, href: `/mous/${mou.id}` },
            { label: 'Signed values' },
          ]}
        />
        <div className="mx-auto flex max-w-screen-md flex-col gap-4 px-4 py-6">
          <DetailHeaderCard
            title={mou.id}
            subtitle="Capture what the school actually signed"
            metadata={[
              { label: 'Draft price/student (with GST)', value: formatRs(mou.spWithTax) },
              {
                label: 'Draft student count',
                value: mou.studentsMou.toLocaleString('en-IN'),
              },
              {
                label: 'Captured by',
                value: signed?.signedBy ?? <span className="text-muted-foreground">-</span>,
              },
              {
                label: 'Last signed date',
                value: signed?.signedDate ? formatDate(signed.signedDate) : '-',
              },
            ]}
          />

          {noticeKey === 'saved' ? (
            <p
              role="status"
              data-testid="signed-values-saved-notice"
              className="rounded-md border border-emerald-300 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-900"
            >
              Signed values captured. Visible to Finance + Leadership.
            </p>
          ) : null}

          {errorMessage ? (
            <p
              role="alert"
              className="rounded-md border border-signal-alert/40 bg-red-50 px-4 py-2.5 text-sm text-signal-alert"
            >
              {errorMessage}
            </p>
          ) : null}

          {signed && diffs.length > 0 ? (
            <section
              className="rounded-lg border border-border bg-card p-4 sm:p-6"
              data-testid="signed-values-diff"
            >
              <h3 className="mb-2 font-heading text-sm font-semibold text-brand-navy">
                Draft vs signed
              </h3>
              <table className="w-full text-xs">
                <thead className="text-muted-foreground">
                  <tr>
                    <th className="pb-1 text-left font-medium">Field</th>
                    <th className="pb-1 text-left font-medium">Draft</th>
                    <th className="pb-1 text-left font-medium">Signed</th>
                  </tr>
                </thead>
                <tbody>
                  {diffs.map(([field, draft, sign]) => (
                    <tr key={field} className="border-t border-border">
                      <td className="py-1 text-foreground">{field}</td>
                      <td className="py-1 tabular-nums text-muted-foreground">{draft}</td>
                      <td className="py-1 font-semibold tabular-nums text-foreground">{sign}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ) : signed ? (
            <p
              className="rounded-md border border-border bg-card px-4 py-3 text-xs text-muted-foreground"
              data-testid="signed-values-no-diff"
            >
              No variances {'-'} signed MOU matches draft.
            </p>
          ) : null}

          <form
            action="/api/mou/signed-values/save"
            method="POST"
            className="space-y-4 rounded-lg border border-border bg-card p-4 sm:p-6"
          >
            <input type="hidden" name="mouId" value={mou.id} />
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="pricePerStudent" className={FIELD_LABEL_CLASS}>
                  Price per student (signed)
                </label>
                <input
                  id="pricePerStudent"
                  name="pricePerStudent"
                  type="number"
                  step="0.01"
                  min={0}
                  required
                  defaultValue={signed?.pricePerStudent ?? mou.spWithTax}
                  className={FIELD_INPUT_CLASS}
                />
              </div>
              <div>
                <label htmlFor="studentCount" className={FIELD_LABEL_CLASS}>
                  Student count (signed)
                </label>
                <input
                  id="studentCount"
                  name="studentCount"
                  type="number"
                  min={1}
                  required
                  defaultValue={signed?.studentCount ?? mou.studentsMou}
                  className={FIELD_INPUT_CLASS}
                />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="duration" className={FIELD_LABEL_CLASS}>
                  Duration (signed)
                </label>
                <input
                  id="duration"
                  name="duration"
                  type="text"
                  required
                  defaultValue={signed?.duration ?? ''}
                  placeholder="1st April 2026 to 31st March 2027"
                  className={FIELD_INPUT_CLASS}
                />
              </div>
              <div>
                <label htmlFor="signedDate" className={FIELD_LABEL_CLASS}>
                  Signed date
                </label>
                <input
                  id="signedDate"
                  name="signedDate"
                  type="date"
                  required
                  defaultValue={signed?.signedDate ?? today}
                  className={FIELD_INPUT_CLASS}
                />
              </div>
              <div>
                <label htmlFor="signedBy" className={FIELD_LABEL_CLASS}>
                  Signed by
                </label>
                <input
                  id="signedBy"
                  name="signedBy"
                  type="text"
                  defaultValue={user.name}
                  readOnly
                  className={FIELD_INPUT_CLASS + ' opacity-70'}
                />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="signedScanUrl" className={FIELD_LABEL_CLASS}>
                  Signed scan link (OneDrive / SharePoint)
                </label>
                <input
                  id="signedScanUrl"
                  name="signedScanUrl"
                  type="url"
                  defaultValue={signed?.signedScanUrl ?? ''}
                  placeholder="https://..."
                  className={FIELD_INPUT_CLASS}
                />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="notes" className={FIELD_LABEL_CLASS}>
                  Notes
                </label>
                <input
                  id="notes"
                  name="notes"
                  type="text"
                  defaultValue={signed?.notes ?? ''}
                  className={FIELD_INPUT_CLASS}
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-2 border-t border-border pt-4">
              <button
                type="submit"
                className="inline-flex min-h-11 items-center rounded-md bg-brand-navy px-4 py-2 text-sm font-semibold text-white hover:bg-brand-navy/90 focus:outline-none focus:ring-2 focus:ring-brand-navy"
              >
                {signed ? 'Update signed values' : 'Capture signed values'}
              </button>
              <Link
                href={`/mous/${mou.id}`}
                className={opsButtonClass({ variant: 'outline', size: 'md' })}
              >
                Cancel
              </Link>
            </div>
          </form>
        </div>
      </main>
    </>
  )
}
