/*
 * /mous/[mouId]/delivery-ack (Phase D4 manual-upload pattern).
 *
 * Per dispatch on this MOU, two-step UI:
 *   Step 1: "Print blank handover form" - POSTs to
 *           /api/delivery-ack/template, returns blank docx for
 *           printing.
 *   Step 2: "Record signed form URL" - text input + button POSTing
 *           to /api/delivery-ack/acknowledge. Records URL on the
 *           Dispatch + advances stage to 'acknowledged'.
 *
 * State-aware: dispatches in 'pending' state are not eligible (must
 * raise dispatch first via D2). Dispatches in 'acknowledged' state
 * show the recorded URL with a "View signed form" link, no edit
 * affordance. Phase 1.1 may add an "amend URL" flow if testers ask.
 *
 * Roles: Admin + OpsHead per 'mou:upload-delivery-ack'. Other roles
 * see a read-only summary.
 */

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { AlertTriangle, CheckCircle, Info } from 'lucide-react'
import type { Dispatch, MOU, User } from '@/lib/types'
import mousJson from '@/data/mous.json'
import dispatchesJson from '@/data/dispatches.json'
import { getCurrentUser } from '@/lib/auth/session'
import { canPerform } from '@/lib/auth/permissions'
import { TopNav } from '@/components/ops/TopNav'
import { PageHeader } from '@/components/ops/PageHeader'
import { DetailHeaderCard } from '@/components/ops/DetailHeaderCard'

const allMous = mousJson as unknown as MOU[]
const allDispatches = dispatchesJson as unknown as Dispatch[]

const ELIGIBLE_FOR_ACK: ReadonlyArray<Dispatch['stage']> = [
  'po-raised',
  'dispatched',
  'in-transit',
  'delivered',
]

const ERROR_MESSAGES: Record<string, string> = {
  permission: 'You do not have permission to record delivery acknowledgements.',
  'unknown-user': 'Session user not found. Please log in again.',
  'dispatch-not-found': 'Dispatch record not found.',
  'mou-not-found': 'MOU record not found.',
  'school-not-found': 'School record missing for this MOU; flag to Anish.',
  'wrong-stage': 'Dispatch is not eligible for acknowledgement (must be raised first; not already acknowledged).',
  'already-acknowledged': 'This dispatch is already acknowledged.',
  'invalid-url': 'URL is not valid. Use a Drive / SharePoint / Dropbox link starting with https://.',
  'template-missing': 'Delivery acknowledgement template is not yet authored. Flag to Anish.',
  'missing-dispatch': 'Dispatch id missing from the form submission.',
  'missing-url': 'Signed handover form URL is required.',
}

interface PageProps {
  params: Promise<{ mouId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

function isVisibleToUser(mou: MOU, user: User | null): boolean {
  if (!user) return false
  if (user.role === 'SalesRep') return mou.salesPersonId === user.id
  return true
}

const FIELD_INPUT_CLASS =
  'block w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand-navy'
const FIELD_LABEL_CLASS = 'block text-sm font-medium text-brand-navy mb-1'

export default async function DeliveryAckPage({ params, searchParams }: PageProps) {
  const { mouId } = await params
  const sp = await searchParams
  const user = await getCurrentUser()
  const mou = allMous.find((m) => m.id === mouId)
  if (!mou || !isVisibleToUser(mou, user)) notFound()

  const allowed = user ? canPerform(user, 'mou:upload-delivery-ack') : false
  const dispatches = allDispatches.filter((d) => d.mouId === mou.id)
  const eligible = dispatches.filter((d) => ELIGIBLE_FOR_ACK.includes(d.stage))
  const acknowledged = dispatches.filter((d) => d.stage === 'acknowledged')

  const errorKey = typeof sp.error === 'string' ? sp.error : null
  const errorMessage = errorKey ? ERROR_MESSAGES[errorKey] ?? `Failed: ${errorKey}` : null
  const ackedDispatchId = typeof sp.acknowledged === 'string' ? sp.acknowledged : null

  return (
    <>
      <TopNav currentPath="/mous" />
      <PageHeader
        title={`${mou.schoolName} delivery acknowledgement`}
        breadcrumb={[
          { label: 'MOUs', href: '/mous' },
          { label: mou.id, href: `/mous/${mou.id}` },
          { label: 'Delivery ack' },
        ]}
      />
      <div className="mx-auto flex max-w-screen-xl flex-col gap-4 px-4 py-6">

        <DetailHeaderCard
          title={mou.id}
          subtitle="Print blank handover form, get it signed at the school, paste the scan URL"
          metadata={[
            { label: 'School', value: mou.schoolName },
            { label: 'Eligible (raised, not yet acked)', value: String(eligible.length) },
            { label: 'Acknowledged', value: String(acknowledged.length) },
          ]}
        />

        {errorMessage ? (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-md border border-signal-alert bg-card p-3 text-sm text-foreground"
          >
            <AlertTriangle aria-hidden className="size-4 shrink-0 text-signal-alert" />
            <span>{errorMessage}</span>
          </p>
        ) : null}

        {ackedDispatchId ? (
          <p
            role="status"
            className="flex items-start gap-2 rounded-md border border-signal-ok bg-card p-3 text-sm text-foreground"
          >
            <CheckCircle aria-hidden className="size-4 shrink-0 text-signal-ok" />
            <span>
              Dispatch <strong>{ackedDispatchId}</strong> recorded as acknowledged with signed form URL on file.
            </span>
          </p>
        ) : null}

        <p className="flex items-start gap-2 rounded-md border border-border bg-card p-3 text-xs text-foreground">
          <Info aria-hidden className="size-4 shrink-0" />
          <span>
            Phase 1: print the blank form, take it to the school, get it stamped + signed by the responsible person, scan or photograph it, upload to GSL Drive (or equivalent), then paste the resulting URL into the Record signed form field below.
          </span>
        </p>

        {eligible.length === 0 && acknowledged.length === 0 ? (
          <p className="rounded-md border border-border bg-muted/30 p-3 text-sm text-foreground">
            No dispatches raised for this MOU yet. Raise a dispatch first via the dispatch surface.
          </p>
        ) : null}

        {eligible.map((d) => (
          <section
            key={d.id}
            className="rounded-lg border border-border bg-card p-4 sm:p-6"
          >
            <header className="mb-3">
              <h2 className="text-base font-semibold text-brand-navy">
                Instalment {d.installmentSeq} ({d.id})
              </h2>
              <p className="text-xs text-muted-foreground">
                Stage: {d.stage}
                {d.deliveredAt ? ` · delivered ${d.deliveredAt.slice(0, 10)}` : ''}
              </p>
            </header>

            {allowed ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <form action="/api/delivery-ack/template" method="POST">
                  <input type="hidden" name="dispatchId" value={d.id} />
                  <input type="hidden" name="mouId" value={mou.id} />
                  <button
                    type="submit"
                    className="inline-flex min-h-11 w-full items-center justify-center rounded-md border border-brand-navy bg-card px-4 py-2 text-sm font-medium text-brand-navy hover:bg-muted focus:outline-none focus:ring-2 focus:ring-brand-navy"
                  >
                    Print blank handover form
                  </button>
                </form>

                <form action="/api/delivery-ack/acknowledge" method="POST" className="space-y-2">
                  <input type="hidden" name="dispatchId" value={d.id} />
                  <input type="hidden" name="mouId" value={mou.id} />
                  <div>
                    <label
                      htmlFor={`url-${d.id}`}
                      className={FIELD_LABEL_CLASS}
                    >
                      Signed form URL
                    </label>
                    <input
                      id={`url-${d.id}`}
                      name="signedHandoverFormUrl"
                      type="url"
                      required
                      placeholder="https://drive.google.com/..."
                      className={FIELD_INPUT_CLASS}
                    />
                  </div>
                  <button
                    type="submit"
                    className="inline-flex min-h-11 w-full items-center justify-center rounded-md bg-brand-teal px-4 py-2 text-sm font-medium text-brand-navy hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-brand-navy"
                  >
                    Record signed form
                  </button>
                </form>
              </div>
            ) : (
              <p role="status" className="text-sm text-muted-foreground">
                Recording delivery acknowledgement requires the OpsHead or Admin role.
              </p>
            )}
          </section>
        ))}

        {acknowledged.length > 0 ? (
          <section className="mt-2">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Acknowledged
            </h2>
            <ul className="divide-y divide-border rounded-md border border-border bg-card">
              {acknowledged.map((d) => (
                <li key={d.id} className="flex items-baseline justify-between gap-3 px-4 py-3 text-sm">
                  <div>
                    <span className="font-medium text-brand-navy">Inst {d.installmentSeq}</span>
                    <span className="ml-2 text-xs text-muted-foreground">{d.id}</span>
                    {d.acknowledgedAt ? (
                      <span className="ml-2 text-xs text-muted-foreground">
                        on {d.acknowledgedAt.slice(0, 10)}
                      </span>
                    ) : null}
                  </div>
                  {d.acknowledgementUrl ? (
                    <a
                      href={d.acknowledgementUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-medium text-brand-navy underline-offset-2 hover:underline"
                    >
                      View signed form
                    </a>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <Link
          href={`/mous/${mou.id}`}
          className="inline-flex w-fit min-h-11 items-center rounded-md border border-border bg-card px-4 py-2 text-sm font-medium hover:bg-muted focus:outline-none focus:ring-2 focus:ring-brand-navy"
        >
          Back to MOU
        </Link>

      </div>
    </>
  )
}
