/*
 * /mous/[mouId]/delivery-ack
 *
 * Delivery acknowledgement form (signed handover URL upload). Per
 * Phase C4 hybrid: form renders + role gates, but submit is a 501
 * stub. Real implementation lands in Phase D when the
 * acknowledgement docx template + Dispatch.acknowledgementUrl write
 * come online.
 *
 * Roles: Admin + OpsHead per 'mou:upload-delivery-ack'.
 */

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Info } from 'lucide-react'
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

export default async function DeliveryAckPage({ params }: PageProps) {
  const { mouId } = await params
  const user = await getCurrentUser()
  const mou = allMous.find((m) => m.id === mouId)
  if (!mou || !isVisibleToUser(mou, user)) notFound()

  const eligible = allDispatches.filter(
    (d) => d.mouId === mou.id && d.stage === 'delivered' && d.acknowledgedAt === null,
  )
  const allowed = user ? canPerform(user, 'mou:upload-delivery-ack') : false

  return (
    <>
      <TopNav currentPath="/mous" />
      <main id="main-content">
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
            subtitle="Record signed handover form for a delivered instalment"
            metadata={[
              { label: 'School', value: mou.schoolName },
              { label: 'Delivered + unack instalments', value: String(eligible.length) },
            ]}
          />

          <p className="flex items-start gap-2 rounded-md border border-signal-attention bg-card p-3 text-xs text-foreground">
            <Info aria-hidden className="size-4 shrink-0 text-signal-attention" />
            <span>
              Phase 1 note: this submit endpoint is wired in Phase D. The acknowledgement docx render plus the Dispatch.acknowledgementUrl write land alongside the API.
            </span>
          </p>

          {allowed ? (
            <form
              action="/api/delivery-ack/generate"
              method="POST"
              className="space-y-4 rounded-lg border border-border bg-card p-4 sm:p-6"
            >
              <input type="hidden" name="mouId" value={mou.id} />
              <div>
                <label htmlFor="installmentSeq" className={FIELD_LABEL_CLASS}>Instalment</label>
                <select id="installmentSeq" name="installmentSeq" required className={FIELD_INPUT_CLASS}>
                  {eligible.length === 0 ? (
                    <option value="">No eligible instalments</option>
                  ) : (
                    eligible.map((d) => (
                      <option key={d.id} value={d.installmentSeq}>
                        Inst {d.installmentSeq}
                      </option>
                    ))
                  )}
                </select>
              </div>
              <div>
                <label htmlFor="acknowledgementUrl" className={FIELD_LABEL_CLASS}>Signed handover URL</label>
                <input
                  id="acknowledgementUrl"
                  name="acknowledgementUrl"
                  type="url"
                  placeholder="https://drive.google.com/..."
                  required
                  className={FIELD_INPUT_CLASS}
                />
              </div>
              <div className="flex flex-wrap gap-2 border-t border-border pt-4">
                <button
                  type="submit"
                  disabled={eligible.length === 0}
                  className="inline-flex min-h-11 items-center rounded-md bg-brand-teal px-4 py-2 text-sm font-medium text-brand-navy hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-brand-navy disabled:opacity-50"
                >
                  Record acknowledgement
                </button>
                <Link
                  href={`/mous/${mou.id}`}
                  className="inline-flex min-h-11 items-center rounded-md border border-border bg-card px-4 py-2 text-sm font-medium hover:bg-muted focus:outline-none focus:ring-2 focus:ring-brand-navy"
                >
                  Cancel
                </Link>
              </div>
            </form>
          ) : (
            <p role="status" className="rounded-md border border-border bg-muted/30 p-3 text-sm text-foreground">
              Recording delivery acknowledgement requires the OpsHead or Admin role.
            </p>
          )}

        </div>
      </main>
    </>
  )
}
