/*
 * /mous/[mouId]/upload-signed (Gate 5A.6 Step 6).
 *
 * Sales-facing surface for uploading the signed MOU PDF after the
 * school countersigns. Triggers a status transition to 'Active' and
 * records signedMouPdfPath + effectiveDate on the MOU.
 *
 * Permission gate: canEditMOU. Non-Sales submits hit ?error=permission.
 */

import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import type { MOU, User } from '@/lib/types'
import mousJson from '@/data/mous.json'
import { TopNav } from '@/components/ops/TopNav'
import { PageHeader } from '@/components/ops/PageHeader'
import { DetailHeaderCard } from '@/components/ops/DetailHeaderCard'
import { getCurrentUser } from '@/lib/auth/session'
import { canEditMOU } from '@/lib/access'
import { formatDate } from '@/lib/format'

const allMous = mousJson as unknown as MOU[]

interface PageProps {
  params: Promise<{ mouId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

const ERROR_MESSAGES: Record<string, string> = {
  permission: 'Only Sales and Admin can upload a signed MOU.',
  'mou-not-found': 'MOU not found.',
  'invalid-form': 'The upload payload was malformed. Retry.',
  'no-file': 'Select a PDF to upload.',
  'too-large': 'File exceeds the 10MB limit.',
  'pdf-only': 'Only PDF files are accepted.',
  'invalid-date': 'Sign date must be in yyyy-mm-dd format.',
  'sign-date-future': 'Sign date cannot be in the future.',
  'sign-date-before-start': 'Sign date cannot precede the MOU start date.',
  'write-failed': 'Failed to save the uploaded file. Retry.',
  'queue-failure': 'Failed to persist the upload. Retry.',
}

const FIELD_INPUT_CLASS =
  'block w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy'
const FIELD_LABEL_CLASS = 'block text-sm font-medium text-brand-navy mb-1'

function isVisibleToUser(mou: MOU, user: User | null): boolean {
  if (!user) return false
  if (user.role === 'SalesRep') return mou.salesPersonId === user.id
  return true
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

export default async function UploadSignedMouPage({ params, searchParams }: PageProps) {
  const { mouId } = await params
  const sp = await searchParams
  const user = await getCurrentUser()
  if (!user) redirect(`/login?next=${encodeURIComponent(`/mous/${mouId}/upload-signed`)}`)
  const mou = allMous.find((m) => m.id === mouId)
  if (!mou || !isVisibleToUser(mou, user)) notFound()

  const errorKey = typeof sp.error === 'string' ? sp.error : null
  const errorMessage = errorKey
    ? ERROR_MESSAGES[errorKey] ?? `Failed: ${errorKey}`
    : null
  const uploaded = typeof sp.uploaded === 'string' && sp.uploaded === '1'
  const canEdit = canEditMOU(user)

  return (
    <>
      <TopNav currentPath="/mous" />
      <main id="main-content">
        <PageHeader
          title={`${mou.schoolName} – Upload signed MOU`}
          breadcrumb={[
            { label: 'MOUs', href: '/mous' },
            { label: mou.id, href: `/mous/${mou.id}` },
            { label: 'Upload signed MOU' },
          ]}
        />
        <div className="mx-auto flex max-w-screen-xl flex-col gap-4 px-4 py-6">
          <DetailHeaderCard
            title={mou.id}
            subtitle="Attach the school's countersigned PDF. The MOU will transition to Active once uploaded."
            metadata={[
              { label: 'School', value: mou.schoolName },
              { label: 'Current status', value: mou.status },
              { label: 'Sign date on file', value: mou.effectiveDate ? formatDate(mou.effectiveDate) : 'not set' },
              { label: 'Signed PDF on file', value: mou.signedMouPdfPath ?? 'none' },
            ]}
          />

          {uploaded ? (
            <p
              role="status"
              data-testid="upload-flash"
              className="rounded-md border border-signal-ok bg-card p-3 text-sm text-foreground"
            >
              Signed MOU uploaded. MOU status moved to Active. Will reflect everywhere within ~5 minutes.
            </p>
          ) : null}
          {errorMessage !== null ? (
            <p
              role="alert"
              data-testid="upload-error-flash"
              className="rounded-md border border-signal-alert bg-card p-3 text-sm text-signal-alert"
            >
              {errorMessage}
            </p>
          ) : null}

          {!canEdit ? (
            <p
              role="alert"
              className="rounded-md border border-signal-attention bg-card p-3 text-sm text-foreground"
            >
              You do not have permission to upload the signed MOU. Only Sales and Admin can.
            </p>
          ) : (
            <form
              method="POST"
              action={`/api/mou/${mou.id}/signed-mou/upload`}
              encType="multipart/form-data"
              className="space-y-4 rounded-lg border border-border bg-card p-4 sm:p-6"
              data-testid="upload-signed-form"
            >
              <div>
                <label htmlFor="file" className={FIELD_LABEL_CLASS}>
                  Signed PDF (max 10MB)
                </label>
                <input
                  id="file"
                  name="file"
                  type="file"
                  required
                  accept="application/pdf"
                  className={FIELD_INPUT_CLASS}
                  data-testid="file-input"
                />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="signDate" className={FIELD_LABEL_CLASS}>
                    Sign date
                  </label>
                  <input
                    id="signDate"
                    name="signDate"
                    type="date"
                    required
                    max={todayIso()}
                    defaultValue={mou.effectiveDate ?? todayIso()}
                    className={FIELD_INPUT_CLASS}
                    data-testid="sign-date-input"
                  />
                </div>
                <div>
                  <label htmlFor="notes" className={FIELD_LABEL_CLASS}>
                    Notes (optional)
                  </label>
                  <input
                    id="notes"
                    name="notes"
                    type="text"
                    placeholder="e.g., Countersigned with revised termination clause."
                    className={FIELD_INPUT_CLASS}
                    data-testid="notes-input"
                  />
                </div>
              </div>
              <div className="flex flex-wrap gap-2 border-t border-border pt-3">
                <button
                  type="submit"
                  className="inline-flex min-h-11 items-center rounded-md bg-brand-teal px-4 py-2 text-sm font-semibold text-brand-navy hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
                  data-testid="upload-submit"
                >
                  Upload signed MOU
                </button>
                <Link
                  href={`/mous/${mou.id}`}
                  className="inline-flex min-h-11 items-center rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
                >
                  Cancel
                </Link>
              </div>
            </form>
          )}
        </div>
      </main>
    </>
  )
}
