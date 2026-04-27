/*
 * /dispatch/request (W4-D.2 Sales-side).
 *
 * Sales submits a DispatchRequest by selecting an active-cohort MOU,
 * choosing an installment, listing line items (flat + per-grade), and
 * providing a request reason. Server-side validation runs in
 * createRequest.ts; warnings surface inline; hard errors block.
 *
 * Visible to every authenticated user (W3-B). The lib enforces the
 * 'dispatch-request:create' gate at submit time.
 */

import { redirect } from 'next/navigation'
import type { IntakeRecord, MOU } from '@/lib/types'
import mousJson from '@/data/mous.json'
import intakeRecordsJson from '@/data/intake_records.json'
import { getCurrentUser } from '@/lib/auth/session'
import { TopNav } from '@/components/ops/TopNav'
import { PageHeader } from '@/components/ops/PageHeader'
import { DispatchRequestForm } from '@/components/ops/DispatchRequestForm'

const allMous = mousJson as unknown as MOU[]
const allIntakeRecords = intakeRecordsJson as unknown as IntakeRecord[]

function totalInstallmentsFor(paymentSchedule: string): number {
  const numbers = paymentSchedule.match(/\d+/g)
  return numbers && numbers.length > 1 ? numbers.length : 1
}

export default async function DispatchRequestPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const user = await getCurrentUser()
  if (!user) redirect('/login?next=/dispatch/request')
  const sp = await searchParams

  const activeMous = allMous
    .filter((m) => m.cohortStatus === 'active')
    .slice()
    .sort((a, b) => a.id.localeCompare(b.id))

  const mouOptions = activeMous.map((m) => {
    const intake = allIntakeRecords.find((ir) => ir.mouId === m.id) ?? null
    return {
      id: m.id,
      schoolName: m.schoolName,
      programme: m.programme,
      programmeSubType: m.programmeSubType,
      totalInstallments: totalInstallmentsFor(m.paymentSchedule),
      hasIntake: intake !== null && intake.completedAt !== '',
      intakeGrades: intake?.grades ?? null,
      intakeRecipientName: intake?.recipientName ?? null,
      intakeRecipientEmail: intake?.recipientEmail ?? null,
    }
  })

  const defaultMouId = typeof sp.mouId === 'string' && activeMous.some((m) => m.id === sp.mouId)
    ? sp.mouId
    : null

  return (
    <>
      <TopNav currentPath="/dispatch/request" />
      <PageHeader
        title="Submit dispatch request"
        breadcrumb={[
          { label: 'Home', href: '/' },
          { label: 'Submit dispatch request' },
        ]}
      />
      <div className="mx-auto flex max-w-screen-md flex-col gap-4 px-4 py-6">
        <p className="text-sm text-muted-foreground">
          Submit a kit dispatch request for Ops review. Active-cohort MOUs only.
          Warnings surface inline; hard errors (V1 cohort, V2 sales-owner) block submission.
        </p>
        <DispatchRequestForm mouOptions={mouOptions} defaultMouId={defaultMouId} />
      </div>
    </>
  )
}
