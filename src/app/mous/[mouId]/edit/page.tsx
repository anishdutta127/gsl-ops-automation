/*
 * /mous/[mouId]/edit (Gate 5A.6 Step 9).
 *
 * Post-sign MOU field edits. Field-level permission split:
 *   - Sales + Admin (canEditMOU): trainerModel, productSelection,
 *     importNotes (acquisition status free-text), notes
 *   - Admin (department null) only: schoolId, programme,
 *     programmeSubType, effectiveDate, startDate, endDate
 *
 * Admin-only fields render disabled for Sales users with a tooltip.
 * The API enforces per-field permission on submit and reports any
 * rejected edits via ?warnings=.
 */

import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import type { MOU, User } from '@/lib/types'
import { mouRepo } from '@/lib/db/repos/mou'
import { schoolRepo } from '@/lib/db/repos/school'
import { paymentRepo } from '@/lib/db/repos/payment'
import { salesTeamRepo } from '@/lib/db/repos/salesTeam'
import { TopNav } from '@/components/ops/TopNav'
import { PageHeader } from '@/components/ops/PageHeader'
import { DetailHeaderCard } from '@/components/ops/DetailHeaderCard'
import { getCurrentUser } from '@/lib/auth/session'
import { canEditMOU } from '@/lib/access'

interface PageProps {
  params: Promise<{ mouId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

const ERROR_MESSAGES: Record<string, string> = {
  permission: 'You do not have permission to edit this MOU.',
  'unknown-user': 'Session expired. Sign in again.',
  'mou-not-found': 'MOU not found.',
  'no-changes': 'No editable fields were supplied.',
  'queue-failure': 'Failed to persist the edit. Retry.',
}

const FIELD_LABEL_CLASS = 'block text-sm font-medium text-brand-navy mb-1'
const FIELD_INPUT_CLASS =
  'block w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy disabled:bg-muted disabled:text-muted-foreground disabled:cursor-not-allowed'

const PROGRAMMES = ['STEAM', 'Young Pioneers', 'Harvard HBPE', 'Robotics'] as const
const TRAINER_MODELS = ['Bootcamp', 'GSL-T', 'TT', 'AIQ', 'Other'] as const
const PRODUCT_SELECTIONS = ['TinkRworks', 'Cretile', 'Both'] as const

function isVisibleToUser(mou: MOU, user: User | null): boolean {
  if (!user) return false
  if (user.role === 'SalesRep') return mou.salesPersonId === user.id
  return true
}

function isAdminWildcard(u: User): boolean {
  return u.role === 'Admin' && (u.department ?? null) === null
}

export default async function MouEditPage({ params, searchParams }: PageProps) {
  const { mouId } = await params
  const sp = await searchParams
  const user = await getCurrentUser()
  if (!user) redirect(`/login?next=${encodeURIComponent(`/mous/${mouId}/edit`)}`)
  const [allMous, allSchools, allPayments, allSalesPeople] = await Promise.all([
    mouRepo.findAll(),
    schoolRepo.findAll(),
    paymentRepo.findAll(),
    salesTeamRepo.findActive(),
  ])
  const mou = allMous.find((m) => m.id === mouId)
  if (!mou || !isVisibleToUser(mou, user)) notFound()
  if (!canEditMOU(user)) {
    redirect(`/mous/${mou.id}?error=permission`)
  }

  const isAdmin = isAdminWildcard(user)
  const errorKey = typeof sp.error === 'string' ? sp.error : null
  const errorMessage = errorKey
    ? ERROR_MESSAGES[errorKey] ?? `Failed: ${errorKey}`
    : null
  const saved = typeof sp.saved === 'string' && sp.saved === '1'
  const fieldsSaved = typeof sp.fields === 'string' ? sp.fields : ''
  const warningsRaw = typeof sp.warnings === 'string' ? sp.warnings : ''
  const warnings = warningsRaw === '' ? [] : warningsRaw.split(',')

  const piIssued = allPayments.some((p) => p.mouId === mou.id && p.piNumber !== null)

  const sortedSchools = allSchools
    .filter((s) => s.active !== false)
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
  const sortedSalesPeople = allSalesPeople
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))

  return (
    <>
      <TopNav currentPath="/mous" />
      <main id="main-content">
        <PageHeader
          title={`Edit ${mou.id}`}
          breadcrumb={[
            { label: 'MOUs', href: '/mous' },
            { label: mou.id, href: `/mous/${mou.id}` },
            { label: 'Edit' },
          ]}
        />
        <div className="mx-auto flex max-w-screen-xl flex-col gap-4 px-4 py-6">
          <DetailHeaderCard
            title={mou.schoolName}
            subtitle="Post-sign field edits. Admin-only fields are disabled for non-Admin users; the server enforces per-field permission on submit."
            metadata={[
              { label: 'Status', value: mou.status },
              { label: 'Programme', value: mou.programme },
              { label: 'Contract value', value: `Rs ${mou.contractValue.toLocaleString('en-IN')}` },
              { label: 'PIs issued', value: piIssued ? 'yes' : 'no' },
            ]}
          />

          {saved ? (
            <p
              role="status"
              data-testid="mou-edit-saved-flash"
              className="rounded-md border border-signal-ok bg-card p-3 text-sm text-foreground"
            >
              Saved {fieldsSaved}. Will reflect everywhere within ~5 minutes.
            </p>
          ) : null}
          {warnings.length > 0 ? (
            <p
              role="alert"
              data-testid="mou-edit-warnings"
              className="rounded-md border border-signal-attention bg-card p-3 text-sm text-foreground"
            >
              Some edits were rejected: {warnings.join(', ')}.
            </p>
          ) : null}
          {errorMessage !== null ? (
            <p
              role="alert"
              data-testid="mou-edit-error"
              className="rounded-md border border-signal-alert bg-card p-3 text-sm text-signal-alert"
            >
              {errorMessage}
            </p>
          ) : null}

          {piIssued ? (
            <p
              role="status"
              data-testid="mou-edit-warning-pi-issued"
              className="rounded-md border border-signal-attention bg-card p-3 text-sm text-foreground"
            >
              <strong>Warning.</strong> This MOU has at least one PI issued. Edits
              to programme, dates, or school will not retroactively recompute
              issued PIs. Use the schedule editor override or create an
              adjustment if the change should affect already-paid amounts.
            </p>
          ) : null}

          <form
            method="POST"
            action={`/api/mou/${mou.id}/edit`}
            className="space-y-4 rounded-lg border border-border bg-card p-4 sm:p-6"
            data-testid="mou-edit-form"
          >
            <fieldset className="space-y-4">
              <legend className="font-heading text-base font-semibold text-brand-navy">
                Sales-editable fields
              </legend>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="trainerModel" className={FIELD_LABEL_CLASS}>
                    Trainer model
                  </label>
                  <select
                    id="trainerModel"
                    name="trainerModel"
                    defaultValue={mou.trainerModel ?? ''}
                    className={FIELD_INPUT_CLASS}
                    data-testid="trainer-model-select"
                  >
                    <option value="">– no change –</option>
                    <option value="null">(clear)</option>
                    {TRAINER_MODELS.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="productSelection" className={FIELD_LABEL_CLASS}>
                    Product selection
                  </label>
                  <select
                    id="productSelection"
                    name="productSelection"
                    defaultValue={mou.productSelection ?? ''}
                    className={FIELD_INPUT_CLASS}
                    data-testid="product-selection-select"
                  >
                    <option value="">– no change –</option>
                    <option value="null">(clear)</option>
                    {PRODUCT_SELECTIONS.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label htmlFor="salesPersonId" className={FIELD_LABEL_CLASS}>
                  Salesperson
                </label>
                <select
                  id="salesPersonId"
                  name="salesPersonId"
                  defaultValue={mou.salesPersonId ?? ''}
                  className={FIELD_INPUT_CLASS}
                  data-testid="salesperson-select"
                >
                  <option value="">(none)</option>
                  {sortedSalesPeople.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-muted-foreground" data-testid="mou-region-line">
                  Region (derived from salesperson, set on save):{' '}
                  <strong>{mou.region ? mou.region : 'not set'}</strong>. If a chosen
                  salesperson has no territory, the region is not saved and the edit is flagged.
                </p>
              </div>
              <div>
                <label htmlFor="importNotes" className={FIELD_LABEL_CLASS}>
                  Acquisition / status free-text (importNotes)
                </label>
                <textarea
                  id="importNotes"
                  name="importNotes"
                  rows={2}
                  defaultValue={mou.importNotes ?? ''}
                  placeholder="e.g., acquisitionStatus=Retained; ypLevel=L2"
                  className={FIELD_INPUT_CLASS}
                  data-testid="import-notes-input"
                />
              </div>
              <div>
                <label htmlFor="notes" className={FIELD_LABEL_CLASS}>
                  Notes
                </label>
                <textarea
                  id="notes"
                  name="notes"
                  rows={3}
                  defaultValue={mou.notes ?? ''}
                  className={FIELD_INPUT_CLASS}
                  data-testid="notes-input"
                />
              </div>
            </fieldset>

            <fieldset className="space-y-4 border-t border-border pt-4">
              <legend className="font-heading text-base font-semibold text-brand-navy">
                Admin-only fields
                {!isAdmin ? (
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    (read-only for non-Admin users)
                  </span>
                ) : null}
              </legend>
              <div>
                <label htmlFor="schoolId" className={FIELD_LABEL_CLASS}>
                  School
                </label>
                <select
                  id="schoolId"
                  name="schoolId"
                  defaultValue={mou.schoolId}
                  disabled={!isAdmin}
                  className={FIELD_INPUT_CLASS}
                  data-testid="school-id-select"
                >
                  {sortedSchools.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.id})
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="programme" className={FIELD_LABEL_CLASS}>
                    Programme
                  </label>
                  <select
                    id="programme"
                    name="programme"
                    defaultValue={mou.programme}
                    disabled={!isAdmin}
                    className={FIELD_INPUT_CLASS}
                    data-testid="programme-select"
                  >
                    {PROGRAMMES.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="programmeSubType" className={FIELD_LABEL_CLASS}>
                    Programme subtype
                  </label>
                  <input
                    id="programmeSubType"
                    name="programmeSubType"
                    type="text"
                    defaultValue={mou.programmeSubType ?? ''}
                    disabled={!isAdmin}
                    placeholder="e.g., GSLT-Cretile"
                    className={FIELD_INPUT_CLASS}
                    data-testid="programme-subtype-input"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label htmlFor="startDate" className={FIELD_LABEL_CLASS}>
                    Start date
                  </label>
                  <input
                    id="startDate"
                    name="startDate"
                    type="date"
                    defaultValue={mou.startDate ?? ''}
                    disabled={!isAdmin}
                    className={FIELD_INPUT_CLASS}
                    data-testid="start-date-input"
                  />
                </div>
                <div>
                  <label htmlFor="effectiveDate" className={FIELD_LABEL_CLASS}>
                    Effective date
                  </label>
                  <input
                    id="effectiveDate"
                    name="effectiveDate"
                    type="date"
                    defaultValue={mou.effectiveDate ?? ''}
                    disabled={!isAdmin}
                    className={FIELD_INPUT_CLASS}
                    data-testid="effective-date-input"
                  />
                </div>
                <div>
                  <label htmlFor="endDate" className={FIELD_LABEL_CLASS}>
                    End date
                  </label>
                  <input
                    id="endDate"
                    name="endDate"
                    type="date"
                    defaultValue={mou.endDate ?? ''}
                    disabled={!isAdmin}
                    className={FIELD_INPUT_CLASS}
                    data-testid="end-date-input"
                  />
                </div>
              </div>
            </fieldset>

            <div className="flex flex-wrap gap-2 border-t border-border pt-3">
              <button
                type="submit"
                className="inline-flex min-h-11 items-center rounded-md bg-brand-teal px-4 py-2 text-sm font-semibold text-brand-navy hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
                data-testid="save-mou-button"
              >
                Save changes
              </button>
              <Link
                href={`/mous/${mou.id}`}
                className="inline-flex min-h-11 items-center rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
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
