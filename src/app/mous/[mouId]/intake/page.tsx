/*
 * /mous/[mouId]/intake (W4-C.2).
 *
 * Post-signing intake form. 22 fields:
 *   - salesOwnerId (dropdown of 19 sales reps)
 *   - location (text)
 *   - grades (text)
 *   - recipientName + recipientDesignation + recipientEmail (text + email)
 *   - studentsAtIntake (number; warning when differs from MOU.studentsMou)
 *   - durationYears (1/2/3/Custom) + startDate + endDate (date pickers)
 *   - physical / softCopy submission status (dropdown)
 *   - productConfirmed (dropdown of Programme; warning when differs from MOU.programme)
 *   - gslTrainingMode (dropdown; warning when MOU.trainerModel differs)
 *   - schoolPointOfContactName + schoolPointOfContactPhone (split from form's POC field)
 *   - signedMouUrl (URL paste; allow-listed hosts)
 *
 * After save: card advances out of post-signing-intake; the thank-you
 * compose-and-copy panel surfaces (W4-C.3).
 */

import Link from 'next/link'
import { notFound } from 'next/navigation'
import type {
  IntakeRecord,
  MOU,
  SalesPerson,
  School,
  User,
} from '@/lib/types'
import mousJson from '@/data/mous.json'
import schoolsJson from '@/data/schools.json'
import salesTeamJson from '@/data/sales_team.json'
import intakeRecordsJson from '@/data/intake_records.json'
import { getCurrentUser } from '@/lib/auth/session'
import { TopNav } from '@/components/ops/TopNav'
import { PageHeader } from '@/components/ops/PageHeader'
import { DetailHeaderCard } from '@/components/ops/DetailHeaderCard'

const allMous = mousJson as unknown as MOU[]
const allSchools = schoolsJson as unknown as School[]
const allSalesTeam = salesTeamJson as unknown as SalesPerson[]
const allIntakeRecords = intakeRecordsJson as unknown as IntakeRecord[]

interface PageProps {
  params: Promise<{ mouId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

const ERROR_MESSAGES: Record<string, string> = {
  'unknown-user': 'Session user not found. Please log in again.',
  'mou-not-found': 'MOU not found.',
  'unknown-sales-owner': 'Pick a sales rep from the dropdown.',
  'invalid-email': 'Recipient email is not a valid address.',
  'invalid-url': 'Signed-MOU URL must be a Drive / SharePoint / Dropbox link.',
  'invalid-students': 'Students at intake must be a positive number.',
  'invalid-duration': 'Duration must be a whole number between 1 and 10.',
  'invalid-date': 'Start and end dates must be in yyyy-mm-dd format.',
  'date-order': 'End date must be after start date.',
  'invalid-mode': 'Pick a training mode from the dropdown.',
  'invalid-product': 'Pick a product from the dropdown.',
  'invalid-status': 'Pick a submission status from the dropdown.',
  'missing-text': 'One or more required text fields are empty.',
  'already-recorded': 'Intake has already been recorded for this MOU. Edit-mode lands in a future batch.',
}

const FIELD_INPUT_CLASS =
  'block w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy'
const FIELD_LABEL_CLASS = 'block text-sm font-medium text-brand-navy mb-1'

const SUBMISSION_STATUSES = ['Submitted', 'Pending', 'In Transit', 'Not Applicable'] as const
const TRAINING_MODES = ['GSL Trainer', 'Train The Trainer (TTT)'] as const
const PROGRAMMES = ['STEAM', 'TinkRworks', 'Young Pioneers', 'Harvard HBPE', 'VEX'] as const

function isVisibleToUser(mou: MOU, user: User | null): boolean {
  if (!user) return false
  if (user.role === 'SalesRep') return mou.salesPersonId === user.id
  return true
}

export default async function IntakePage({ params, searchParams }: PageProps) {
  const { mouId } = await params
  const sp = await searchParams
  const user = await getCurrentUser()
  const mou = allMous.find((m) => m.id === mouId)
  if (!mou || !isVisibleToUser(mou, user)) notFound()

  const school = allSchools.find((s) => s.id === mou.schoolId)
  const existing = allIntakeRecords.find((r) => r.mouId === mou.id) ?? null

  const errorKey = typeof sp.error === 'string' ? sp.error : null
  const errorMessage = errorKey ? ERROR_MESSAGES[errorKey] ?? `Failed: ${errorKey}` : null
  const recordedId = typeof sp.recorded === 'string' ? sp.recorded : null
  const studentsVariance = typeof sp.studentsVariance === 'string' ? Number(sp.studentsVariance) : 0
  const productMismatch = sp.productMismatch === '1'
  const trainingModeMismatch = sp.trainingModeMismatch === '1'

  // Default startDate: AY-start (e.g., '2026-04-01' for AY 2026-27).
  const ayYear = mou.academicYear.slice(0, 4)
  const defaultStartDate = `${ayYear}-04-01`
  const defaultDurationYears = 2
  const defaultEndDate = `${Number(ayYear) + defaultDurationYears}-03-31`

  return (
    <>
      <TopNav currentPath="/mous" />
      <main id="main-content">
        <PageHeader
          title={`${mou.schoolName} intake`}
          breadcrumb={[
            { label: 'MOUs', href: '/mous' },
            { label: mou.id, href: `/mous/${mou.id}` },
            { label: 'Intake' },
          ]}
        />
        <div className="mx-auto flex max-w-screen-xl flex-col gap-4 px-4 py-6">
          <DetailHeaderCard
            title={mou.id}
            subtitle="Capture the post-signing intake form (22 fields)"
            metadata={[
              { label: 'School', value: school?.name ?? mou.schoolName },
              { label: 'Programme', value: `${mou.programme}${mou.programmeSubType ? ' / ' + mou.programmeSubType : ''}` },
              { label: 'Students MOU baseline', value: String(mou.studentsMou) },
              { label: 'Trainer model (MOU)', value: mou.trainerModel ?? 'not set' },
            ]}
          />

          {recordedId !== null ? (
            <p
              role="status"
              data-testid="intake-recorded-flash"
              className="rounded-md border border-signal-ok bg-card p-3 text-sm text-foreground"
            >
              Intake recorded ({recordedId}). Card advances out of post-signing-intake.
              {studentsVariance !== 0 ? (
                <>
                  {' '}Students variance {studentsVariance >= 0 ? '+' : ''}{studentsVariance} captured in audit log.
                </>
              ) : null}
              {productMismatch ? <> Product mismatch flagged.</> : null}
              {trainingModeMismatch ? <> Training-mode mismatch flagged.</> : null}
            </p>
          ) : null}
          {errorMessage !== null ? (
            <p
              role="alert"
              data-testid="intake-error-flash"
              className="rounded-md border border-signal-alert bg-card p-3 text-sm text-signal-alert"
            >
              {errorMessage}
            </p>
          ) : null}
          {existing !== null && recordedId === null ? (
            <p
              role="status"
              data-testid="intake-already-recorded"
              className="rounded-md border border-signal-attention bg-card p-3 text-xs text-foreground"
            >
              Intake already recorded on {existing.completedAt.slice(0, 10)} by {existing.completedBy}.
              Edit-mode for intake records lands in a future batch; reach out to Anish
              if a correction is needed before then.
            </p>
          ) : null}

          <form
            action={`/api/mou/${mou.id}/intake`}
            method="POST"
            className="space-y-4 rounded-lg border border-border bg-card p-4 sm:p-6"
            data-testid="intake-form"
          >
            <fieldset className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <legend className="sr-only">Account ownership</legend>
              <div>
                <label htmlFor="salesOwnerId" className={FIELD_LABEL_CLASS}>Sales owner</label>
                <select id="salesOwnerId" name="salesOwnerId" required className={FIELD_INPUT_CLASS} defaultValue={mou.salesPersonId ?? ''} data-testid="intake-sales-owner">
                  <option value="">Select a sales rep</option>
                  {allSalesTeam.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="location" className={FIELD_LABEL_CLASS}>Location</label>
                <input id="location" name="location" type="text" required className={FIELD_INPUT_CLASS} placeholder="City, district, state" data-testid="intake-location" />
              </div>
            </fieldset>

            <fieldset className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <legend className="sr-only">Cohort</legend>
              <div>
                <label htmlFor="grades" className={FIELD_LABEL_CLASS}>Grades</label>
                <input id="grades" name="grades" type="text" required className={FIELD_INPUT_CLASS} placeholder="e.g., 1-8 or 4-8" data-testid="intake-grades" />
              </div>
              <div>
                <label htmlFor="studentsAtIntake" className={FIELD_LABEL_CLASS}>Students at intake</label>
                <input id="studentsAtIntake" name="studentsAtIntake" type="number" min="1" step="1" required defaultValue={mou.studentsMou} className={FIELD_INPUT_CLASS} data-testid="intake-students" />
                <p className="mt-1 text-xs text-muted-foreground">MOU baseline: {mou.studentsMou}. Different value will be saved with audit warning.</p>
              </div>
            </fieldset>

            <fieldset className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <legend className="sr-only">MOU duration</legend>
              <div>
                <label htmlFor="durationYears" className={FIELD_LABEL_CLASS}>Duration (years)</label>
                <input id="durationYears" name="durationYears" type="number" min="1" max="10" step="1" required defaultValue={defaultDurationYears} className={FIELD_INPUT_CLASS} data-testid="intake-duration" />
              </div>
              <div>
                <label htmlFor="startDate" className={FIELD_LABEL_CLASS}>Start date</label>
                <input id="startDate" name="startDate" type="date" required defaultValue={defaultStartDate} className={FIELD_INPUT_CLASS} data-testid="intake-start-date" />
              </div>
              <div>
                <label htmlFor="endDate" className={FIELD_LABEL_CLASS}>End date</label>
                <input id="endDate" name="endDate" type="date" required defaultValue={defaultEndDate} className={FIELD_INPUT_CLASS} data-testid="intake-end-date" />
              </div>
            </fieldset>

            <fieldset className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <legend className="sr-only">Thank-you recipient</legend>
              <div>
                <label htmlFor="recipientName" className={FIELD_LABEL_CLASS}>Recipient name</label>
                <input id="recipientName" name="recipientName" type="text" required className={FIELD_INPUT_CLASS} data-testid="intake-recipient-name" />
              </div>
              <div>
                <label htmlFor="recipientDesignation" className={FIELD_LABEL_CLASS}>Designation</label>
                <input id="recipientDesignation" name="recipientDesignation" type="text" required className={FIELD_INPUT_CLASS} placeholder="e.g., Principal" data-testid="intake-recipient-designation" />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="recipientEmail" className={FIELD_LABEL_CLASS}>Recipient email</label>
                <input id="recipientEmail" name="recipientEmail" type="email" required className={FIELD_INPUT_CLASS} data-testid="intake-recipient-email" />
              </div>
            </fieldset>

            <fieldset className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <legend className="sr-only">School point of contact</legend>
              <div>
                <label htmlFor="schoolPointOfContactName" className={FIELD_LABEL_CLASS}>POC name</label>
                <input id="schoolPointOfContactName" name="schoolPointOfContactName" type="text" required className={FIELD_INPUT_CLASS} data-testid="intake-poc-name" />
              </div>
              <div>
                <label htmlFor="schoolPointOfContactPhone" className={FIELD_LABEL_CLASS}>POC phone</label>
                <input id="schoolPointOfContactPhone" name="schoolPointOfContactPhone" type="tel" required className={FIELD_INPUT_CLASS} placeholder="+91 9999999999" data-testid="intake-poc-phone" />
              </div>
            </fieldset>

            <fieldset className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <legend className="sr-only">Submission tracking</legend>
              <div>
                <label htmlFor="physicalSubmissionStatus" className={FIELD_LABEL_CLASS}>Physical copy</label>
                <select id="physicalSubmissionStatus" name="physicalSubmissionStatus" required defaultValue="Pending" className={FIELD_INPUT_CLASS} data-testid="intake-physical-status">
                  {SUBMISSION_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="softCopySubmissionStatus" className={FIELD_LABEL_CLASS}>Soft copy</label>
                <select id="softCopySubmissionStatus" name="softCopySubmissionStatus" required defaultValue="Pending" className={FIELD_INPUT_CLASS} data-testid="intake-softcopy-status">
                  {SUBMISSION_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </fieldset>

            <fieldset className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <legend className="sr-only">Product and training mode</legend>
              <div>
                <label htmlFor="productConfirmed" className={FIELD_LABEL_CLASS}>Product confirmed</label>
                <select id="productConfirmed" name="productConfirmed" required defaultValue={mou.programme} className={FIELD_INPUT_CLASS} data-testid="intake-product">
                  {PROGRAMMES.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="gslTrainingMode" className={FIELD_LABEL_CLASS}>GSL training mode</label>
                <select id="gslTrainingMode" name="gslTrainingMode" required className={FIELD_INPUT_CLASS} data-testid="intake-training-mode">
                  {TRAINING_MODES.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
            </fieldset>

            <div>
              <label htmlFor="signedMouUrl" className={FIELD_LABEL_CLASS}>Signed MOU URL</label>
              <input id="signedMouUrl" name="signedMouUrl" type="url" required className={FIELD_INPUT_CLASS} placeholder="https://drive.google.com/..." data-testid="intake-signed-url" />
              <p className="mt-1 text-xs text-muted-foreground">Allow-listed hosts: drive.google.com, sharepoint.com, dropbox.com, onedrive.live.com.</p>
            </div>

            <div className="flex flex-wrap gap-2 border-t border-border pt-3">
              <button
                type="submit"
                disabled={existing !== null}
                className="inline-flex min-h-11 items-center rounded-md bg-brand-teal px-4 py-2 text-sm font-medium text-brand-navy hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy disabled:opacity-50"
                data-testid="intake-submit"
              >
                Capture intake details
              </button>
              <Link
                href={`/mous/${mou.id}`}
                className="inline-flex min-h-11 items-center rounded-md border border-border bg-card px-4 py-2 text-sm font-medium hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
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
