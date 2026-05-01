/*
 * /mous/[mouId]/intake/edit (W4-I.4 MM3).
 *
 * Backfill form for the kit allocation table fields: gradeBreakdown
 * (per-grade student counts) and rechargeableBatteries. Also lets
 * operators correct the SPOC contact fields surfaced on the kit
 * allocation row. The 22-field create form lives at /mous/[id]/intake;
 * this edit form is intentionally narrower (the MM3 backfill use
 * case) so the audit log focuses on the operator's intent rather than
 * accidental changes to unrelated fields.
 */

import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import type { IntakeRecord, MOU, School, User } from '@/lib/types'
import mousJson from '@/data/mous.json'
import schoolsJson from '@/data/schools.json'
import intakeRecordsJson from '@/data/intake_records.json'
import { getCurrentUser } from '@/lib/auth/session'
import { TopNav } from '@/components/ops/TopNav'
import { PageHeader } from '@/components/ops/PageHeader'

const allMous = mousJson as unknown as MOU[]
const allSchools = schoolsJson as unknown as School[]
const allIntakeRecords = intakeRecordsJson as unknown as IntakeRecord[]

interface PageProps {
  params: Promise<{ mouId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

const ERROR_MESSAGES: Record<string, string> = {
  'unknown-user': 'Session user not found. Please log in again.',
  'intake-not-found': 'No intake record exists for this MOU yet. Capture intake first.',
  'missing-text': 'A required text field is empty.',
  'invalid-students': 'Students at intake must be a positive number.',
  'invalid-grade-breakdown': 'Grade-wise counts must be whole numbers between 0 and the cohort size.',
  'invalid-batteries': 'Rechargeable batteries count cannot be negative.',
  'no-changes': 'No fields changed.',
}

const FIELD_INPUT_CLASS =
  'block w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy'
const FIELD_LABEL_CLASS = 'block text-sm font-medium text-brand-navy mb-1'

function isVisibleToUser(mou: MOU, user: User | null): boolean {
  if (!user) return false
  if (user.role === 'SalesRep') return mou.salesPersonId === user.id
  return true
}

function gradeValueFor(record: IntakeRecord, grade: number): string {
  const row = record.gradeBreakdown?.find((g) => g.grade === grade)
  return row ? String(row.students) : ''
}

export default async function IntakeEditPage({ params, searchParams }: PageProps) {
  const { mouId } = await params
  const sp = await searchParams
  const user = await getCurrentUser()
  if (!user) redirect(`/login?next=%2Fmous%2F${encodeURIComponent(mouId)}%2Fintake%2Fedit`)
  const mou = allMous.find((m) => m.id === mouId)
  if (!mou || !isVisibleToUser(mou, user)) notFound()

  const intake = allIntakeRecords.find((r) => r.mouId === mouId)
  if (!intake) {
    // No record to edit yet; redirect to the create form.
    redirect(`/mous/${encodeURIComponent(mouId)}/intake`)
  }

  const school = allSchools.find((s) => s.id === mou.schoolId)
  const errorKey = typeof sp.error === 'string' ? sp.error : null
  const errorMessage = errorKey ? ERROR_MESSAGES[errorKey] ?? `Failed: ${errorKey}` : null

  return (
    <>
      <TopNav currentPath="/mous" />
      <main id="main-content">
        <PageHeader
          title={`Edit intake for ${mou.schoolName}`}
          breadcrumb={[
            { label: 'MOUs', href: '/mous' },
            { label: mou.id, href: `/mous/${mou.id}` },
            { label: 'Intake', href: `/mous/${mou.id}/intake` },
            { label: 'Edit' },
          ]}
        />
        <div className="mx-auto flex max-w-screen-md flex-col gap-4 px-4 py-6">
          <p className="text-sm text-muted-foreground">
            Backfill the kit allocation fields ({school?.name ?? mou.schoolName}). Per-grade
            student counts power the kit allocation table on{' '}
            <Link href={`/mous/${mou.id}/dispatch`} className="text-brand-navy hover:underline">
              the dispatch page
            </Link>
            . Leave a grade blank to omit it.
          </p>

          {errorMessage ? (
            <p
              role="alert"
              data-testid="intake-edit-error"
              className="rounded-md border border-signal-alert bg-signal-alert/10 px-3 py-2 text-sm text-signal-alert"
            >
              {errorMessage}
            </p>
          ) : null}

          <form
            action={`/api/mou/${mou.id}/intake-edit`}
            method="POST"
            className="space-y-4 rounded-lg border border-border bg-card p-4 sm:p-6"
            data-testid="intake-edit-form"
          >
            <fieldset className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <legend className="sr-only">Kit allocation contact</legend>
              <div>
                <label htmlFor="schoolPointOfContactName" className={FIELD_LABEL_CLASS}>SPOC name</label>
                <input
                  id="schoolPointOfContactName" name="schoolPointOfContactName" type="text"
                  required defaultValue={intake.schoolPointOfContactName}
                  className={FIELD_INPUT_CLASS}
                  data-testid="edit-poc-name"
                />
              </div>
              <div>
                <label htmlFor="schoolPointOfContactPhone" className={FIELD_LABEL_CLASS}>SPOC phone</label>
                <input
                  id="schoolPointOfContactPhone" name="schoolPointOfContactPhone" type="tel"
                  required defaultValue={intake.schoolPointOfContactPhone}
                  className={FIELD_INPUT_CLASS} placeholder="+91 9999999999"
                  data-testid="edit-poc-phone"
                />
              </div>
            </fieldset>

            <fieldset className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <legend className="sr-only">Location and cohort</legend>
              <div>
                <label htmlFor="location" className={FIELD_LABEL_CLASS}>Location</label>
                <input
                  id="location" name="location" type="text"
                  required defaultValue={intake.location}
                  className={FIELD_INPUT_CLASS}
                  data-testid="edit-location"
                />
              </div>
              <div>
                <label htmlFor="grades" className={FIELD_LABEL_CLASS}>Grades (free text)</label>
                <input
                  id="grades" name="grades" type="text"
                  required defaultValue={intake.grades}
                  className={FIELD_INPUT_CLASS} placeholder="e.g., 1-8"
                  data-testid="edit-grades"
                />
              </div>
            </fieldset>

            <fieldset className="space-y-3">
              <legend className="block text-sm font-medium text-brand-navy">
                Per-grade student count (kit allocation)
              </legend>
              <p className="text-xs text-muted-foreground">
                Enter the count per grade. Blank fields are omitted. Use 0 to record a grade
                that ships zero kits.
              </p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                {Array.from({ length: 10 }, (_, i) => i + 1).map((g) => (
                  <div key={g}>
                    <label htmlFor={`grade${g}`} className="block text-xs font-medium text-brand-navy">
                      Grade {g}
                    </label>
                    <input
                      id={`grade${g}`} name={`grade${g}`} type="number" min="0" step="1"
                      defaultValue={gradeValueFor(intake, g)}
                      className={FIELD_INPUT_CLASS}
                      data-testid={`edit-grade-${g}`}
                    />
                  </div>
                ))}
              </div>
            </fieldset>

            <div>
              <label htmlFor="rechargeableBatteries" className={FIELD_LABEL_CLASS}>
                Rechargeable batteries
              </label>
              <input
                id="rechargeableBatteries" name="rechargeableBatteries" type="number" min="0" step="1"
                defaultValue={intake.rechargeableBatteries === null ? '' : String(intake.rechargeableBatteries)}
                className={FIELD_INPUT_CLASS}
                data-testid="edit-batteries"
                placeholder="Blank to leave unset"
              />
              <p className="mt-1 text-xs text-muted-foreground">Leave blank for programmes that do not ship batteries.</p>
            </div>

            <div className="flex flex-wrap gap-2 border-t border-border pt-3">
              <button
                type="submit"
                data-testid="edit-submit"
                className="inline-flex min-h-11 items-center rounded-md bg-brand-teal px-4 py-2 text-sm font-medium text-brand-navy hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
              >
                Save kit allocation
              </button>
              <Link
                href={`/mous/${mou.id}/dispatch`}
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
