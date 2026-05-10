/*
 * /mous/[mouId]/pi
 *
 * PI generation form. Phase D-wired: docxtemplater + PI template
 * online; the submit endpoint streams the rendered .docx.
 *
 * Roles: Admin + Finance per 'mou:generate-pi'.
 *
 * W4-I.4 MM2: targeted re-gate of the W3-B "every authenticated user
 * sees every page" baseline. Misba (OpsHead) reported PI generation as
 * out-of-role for Implementation; the matrix already restricted the
 * action to Finance + Admin but the page rendered for everyone. The
 * page now 404s for users who lack the action grant. Server-side
 * canPerform() in lib/pi/generatePi.ts continues to enforce at submit
 * time as defence in depth.
 *
 * W4-A.6: GSTIN-missing no longer blocks PI generation. The DOCX
 * renders the literal "To be added" placeholder for SCHOOL_GSTIN
 * when school.gstNumber is null or whitespace; an inline note on the
 * form tells operators that Finance can backfill via
 * /schools/[id]/edit. Pre-W4-A.6 the page rendered a hard-block alert
 * with "GSTIN required" copy; that alert is gone.
 */

import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { Info } from 'lucide-react'
import type { MOU, Payment, School, User } from '@/lib/types'
import mousJson from '@/data/mous.json'
import schoolsJson from '@/data/schools.json'
import paymentsJson from '@/data/payments.json'
import { getCurrentUser } from '@/lib/auth/session'
import { canGeneratePI } from '@/lib/access'
import { TopNav } from '@/components/ops/TopNav'
import { PageHeader } from '@/components/ops/PageHeader'
import { DetailHeaderCard } from '@/components/ops/DetailHeaderCard'
import { formatRs } from '@/lib/format'
import { getEntity, getEntityForProgramme } from '@/lib/mouSystem/company'

const allMous = mousJson as unknown as MOU[]
const allSchools = schoolsJson as unknown as School[]
const allPayments = paymentsJson as unknown as Payment[]

interface PageProps {
  params: Promise<{ mouId: string }>
}

function isVisibleToUser(mou: MOU, user: User | null): boolean {
  if (!user) return false
  if (user.role === 'SalesRep') return mou.salesPersonId === user.id
  return true
}

const FIELD_INPUT_CLASS =
  'block w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand-navy'
const FIELD_LABEL_CLASS = 'block text-sm font-medium text-brand-navy mb-1'

export default async function PiPage({ params }: PageProps) {
  const { mouId } = await params
  const user = await getCurrentUser()
  const mou = allMous.find((m) => m.id === mouId)
  if (!mou || !isVisibleToUser(mou, user)) notFound()
  // Gate 1 Step 4 (MM2): Ops/SalesRep/etc. cannot generate PI.
  // canGeneratePI from lib/access.ts (department-scoped) blocks
  // Admin-role users with department='ops' too (Misba's case): the
  // canPerform layer-2 wildcard would let her reach this page, but
  // layer-1 department gating fires first. Server-side canPerform
  // gate at lib/pi/generatePi.ts continues as defence in depth.
  if (!user) notFound()
  if (!canGeneratePI(user)) {
    redirect(`/mous/${mou.id}?notice=pi-finance-only`)
  }

  const school = allSchools.find((s) => s.id === mou.schoolId)
  const pendingInstallments = allPayments.filter(
    (p) => p.mouId === mou.id && (p.status === 'Pending' || p.status === 'PI Sent' || p.status === 'Due Soon' || p.status === 'Overdue'),
  )
  // W4-A.6: GSTIN-missing surfaces an inline note (not a block).
  const gstinMissing = !school || school.gstNumber === null || (school.gstNumber ?? '').trim() === ''
  // Step 5 re-wire: surface which GST entity (MH / UP) the PI will be
  // raised under so Finance sees the routing before clicking Generate.
  // Routing comes from config/company.json's programmeRouting block.
  const entityKey = getEntityForProgramme(mou.programme)
  const billingEntity = getEntity(entityKey)

  return (
    <>
      <TopNav currentPath="/mous" />
      <main id="main-content">
        <PageHeader
          title={`${mou.schoolName} PI`}
          breadcrumb={[
            { label: 'MOUs', href: '/mous' },
            { label: mou.id, href: `/mous/${mou.id}` },
            { label: 'PI' },
          ]}
        />
        <div className="mx-auto flex max-w-screen-xl flex-col gap-4 px-4 py-6">

          <DetailHeaderCard
            title={mou.id}
            subtitle="Generate proforma invoice for the next pending instalment"
            metadata={[
              { label: 'School', value: school?.name ?? mou.schoolName },
              { label: 'GSTIN (school)', value: gstinMissing ? <span className="text-muted-foreground">To be added</span> : <span className="font-mono text-xs">{school?.gstNumber}</span> },
              {
                label: 'Issuing entity',
                value: (
                  <span className="font-mono text-xs">
                    {billingEntity.label} {'·'} {billingEntity.gstin} {'·'} prefix {billingEntity.piPrefix}
                  </span>
                ),
              },
              { label: 'Programme', value: `${mou.programme}${mou.programmeSubType ? ' / ' + mou.programmeSubType : ''}` },
              { label: 'Pending instalments', value: String(pendingInstallments.length) },
            ]}
          />

          {gstinMissing ? (
            <p
              role="status"
              data-testid="gstin-missing-note"
              className="flex items-start gap-2 rounded-md border border-border bg-card p-3 text-xs text-muted-foreground"
            >
              <Info aria-hidden className="size-4 shrink-0 text-muted-foreground" />
              <span>
                School GSTIN is not on file. The PI document will render &quot;To be added&quot; for the GSTIN field; Finance can backfill via{' '}
                <Link href={`/schools/${mou.schoolId}/edit`} className="text-brand-navy hover:underline">
                  /schools/{mou.schoolId}/edit
                </Link>
                {' '}before GST filing if needed.
              </span>
            </p>
          ) : null}

          <form
            action="/api/pi/generate"
            method="POST"
            className="space-y-4 rounded-lg border border-border bg-card p-4 sm:p-6"
          >
            <input type="hidden" name="mouId" value={mou.id} />
            <div>
              <label htmlFor="installmentSeq" className={FIELD_LABEL_CLASS}>Instalment</label>
              <select id="installmentSeq" name="installmentSeq" required className={FIELD_INPUT_CLASS}>
                {pendingInstallments.length === 0 ? (
                  <option value="">No pending instalments</option>
                ) : (
                  pendingInstallments.map((p) => (
                    <option key={p.id} value={p.instalmentSeq}>
                      {p.instalmentLabel} - {formatRs(p.expectedAmount)} ({p.status})
                    </option>
                  ))
                )}
              </select>
            </div>
            <div className="flex flex-wrap gap-2 border-t border-border pt-4">
              <button
                type="submit"
                disabled={pendingInstallments.length === 0}
                className="inline-flex min-h-11 items-center rounded-md bg-brand-teal px-4 py-2 text-sm font-medium text-brand-navy hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-brand-navy disabled:opacity-50"
              >
                Generate PI
              </button>
              <Link
                href={`/mous/${mou.id}`}
                className="inline-flex min-h-11 items-center rounded-md border border-border bg-card px-4 py-2 text-sm font-medium hover:bg-muted focus:outline-none focus:ring-2 focus:ring-brand-navy"
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
