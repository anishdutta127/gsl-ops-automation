/*
 * /dispatch/kits/[mouId] (Gate 3 Steps 3-8 detail page).
 *
 * One surface, multiple sections gated by record state:
 *   - Allocation section (Step 3): always visible; editable when
 *     canAllocateKits + (status is 'Pending' or 'Rejected' or no
 *     record yet).
 *   - Sales approval section (Step 4): visible when allocations exist.
 *     Approve / Reject actions when canApproveDispatch and
 *     salesApprovalStatus === 'Pending'.
 *   - Dispatch summary section (Step 5): visible after approval.
 *     School details editable by Sales; kits-requirement table
 *     read-only.
 *   - Accounts execution section (Step 6): visible after summary
 *     created. Editable by Finance.
 *   - Shipment tracking + POD (Step 8): visible once Accounts records
 *     dispatch; editable by Ops.
 *
 * Routing by mouId (the natural key) rather than KitDispatch.id since
 * the record is minted lazily on first allocation submit.
 */

import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { mouRepo } from '@/lib/db/repos/mou'
import { kitDispatchRepo } from '@/lib/db/repos/kitDispatch'
import { inventoryItemRepo } from '@/lib/db/repos/inventoryItem'
import { paymentRepo } from '@/lib/db/repos/payment'
import { schoolRepo } from '@/lib/db/repos/school'
import { TopNav } from '@/components/ops/TopNav'
import { PageHeader } from '@/components/ops/PageHeader'
import { StatusChip, type StatusChipTone } from '@/components/ops/StatusChip'
import { getCurrentUser } from '@/lib/auth/session'
import {
  canAllocateKits,
  canApproveDispatch,
  canExecuteDispatch,
  canUploadPOD,
} from '@/lib/access'
import {
  isMouEligibleForKitDispatch,
  aggregatePaymentStatusForMou,
} from '@/lib/kitDispatch/derive'
import { findKitDispatch, eligibleSkusForMou } from '@/lib/kitDispatch/lookup'
import { AllocationForm } from './AllocationForm'
import { SalesApprovalActions } from './SalesApprovalActions'
import { DispatchSummaryEditor } from './DispatchSummaryEditor'
import { AccountsExecutionForm } from './AccountsExecutionForm'
import { ShipmentTrackingForm } from './ShipmentTrackingForm'

const DISPATCH_STATUS_TONE: Record<string, StatusChipTone> = {
  'Not Started': 'neutral',
  Pending: 'attention',
  'In Transit': 'navy',
  Delivered: 'ok',
}

const APPROVAL_TONE: Record<string, StatusChipTone> = {
  Pending: 'attention',
  Approved: 'ok',
  Rejected: 'alert',
}

interface PageProps {
  params: Promise<{ mouId: string }>
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

export default async function KitDispatchDetailPage({
  params,
  searchParams,
}: PageProps) {
  const { mouId } = await params
  const sp = (await searchParams) ?? {}

  const user = await getCurrentUser()
  if (!user) {
    redirect(`/login?next=${encodeURIComponent(`/dispatch/kits/${mouId}`)}`)
  }

  const [mous, kitDispatches, inventory, payments, schools] = await Promise.all([
    mouRepo.findAll(),
    kitDispatchRepo.findAll(),
    inventoryItemRepo.findAll(),
    paymentRepo.findAll(),
    schoolRepo.findAll(),
  ])

  const mou = mous.find((m) => m.id === mouId)
  if (!mou || !isMouEligibleForKitDispatch(mou)) notFound()

  const school = schools.find((s) => s.id === mou.schoolId) ?? null
  const kd = findKitDispatch({ kitDispatches, mouId })
  const paymentStatus = aggregatePaymentStatusForMou(mou.id, payments)

  // Hardware kit dispatches do not belong to the Sales pre-allocation
  // flow, so we coerce them to null here. The TinkRworks/Cretile/Both
  // trio is what the pre-allocation UI knows how to render.
  const productSelectionRaw =
    (mou.productSelection as 'TinkRworks' | 'Cretile' | 'Both' | null | undefined) ??
    (kd?.productSelected ?? null)
  const productSelection: 'TinkRworks' | 'Cretile' | 'Both' | null =
    productSelectionRaw === 'Hardware' ? null : (productSelectionRaw ?? null)

  const eligibleSkus = eligibleSkusForMou({ inventory, productSelection })

  const canAllocate = canAllocateKits(user)
  const canApprove = canApproveDispatch(user)
  const canExecute = canExecuteDispatch(user)
  const canPod = canUploadPOD(user)

  const allocationEditable =
    canAllocate
    && (!kd || kd.salesApprovalStatus === 'Pending' || kd.salesApprovalStatus === 'Rejected')

  const showSalesSection = kd !== null && kd.allocations.length > 0
  const salesActionable =
    canApprove && kd !== null && kd.salesApprovalStatus === 'Pending'
  const showSummarySection = kd?.salesApprovalStatus === 'Approved'
  const showAccountsSection = !!kd?.dispatchSummary
  const showTrackingSection =
    kd !== null && (kd.dispatchStatus === 'In Transit' || kd.dispatchStatus === 'Delivered')

  const errorKey = typeof sp.error === 'string' ? sp.error : null
  const noticeKey = typeof sp.notice === 'string' ? sp.notice : null

  const errorMessages: Record<string, string> = {
    'invalid-rows': 'One or more allocation rows are invalid. Check grade, kits qty, kit type, and product.',
    'inventory-insufficient': 'One SKU is over-allocated against current stock. Reduce kits qty or pick a different SKU.',
    'sku-mismatch-product': 'A SKU was chosen that is not part of the MOU product selection.',
    'unknown-sku': 'A SKU was chosen that is not in inventory.',
    forbidden: 'You do not have permission for that action.',
    'rejection-reason-required': 'A rejection reason is required.',
  }
  const noticeMessages: Record<string, string> = {
    allocated: 'Allocation submitted. Sales rep will receive a notification within 5 minutes.',
    approved: 'Dispatch approved. Saved. Will reflect everywhere within ~5 minutes.',
    rejected: 'Allocation rejected. Ops can revise and resubmit.',
    'summary-saved': 'Summary saved. School master updated within ~5 minutes.',
    'accounts-saved': 'Dispatch saved. Status will update within ~5 minutes and the warehouse will be notified.',
    'shipment-saved': 'Shipment tracking saved. Will reflect everywhere within ~5 minutes.',
    'pod-uploaded': 'POD uploaded. Status flipped to Delivered.',
  }

  return (
    <>
      <TopNav currentPath="/dispatch" />
      <main id="main-content">
        <PageHeader
          title={`${mou.schoolName} · Kits dispatch`}
          subtitle={`${mou.id} · ${mou.programme}`}
          breadcrumb={[
            { label: 'Dispatch', href: '/dispatch' },
            { label: 'Kits for Dispatch', href: '/dispatch/kits' },
            { label: mou.schoolName },
          ]}
        />
        <div className="mx-auto max-w-screen-xl space-y-6 px-4 py-6">
          {errorKey && (
            <div className="rounded-md border border-signal-alert/40 bg-red-50 px-4 py-2.5 text-sm text-signal-alert" data-testid="kits-error">
              {errorMessages[errorKey] ?? errorKey}
            </div>
          )}
          {noticeKey && (
            <div className="rounded-md border border-emerald-500/40 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-900" data-testid="kits-notice">
              {noticeMessages[noticeKey] ?? noticeKey}
            </div>
          )}

          <section className="rounded-md border border-border bg-card p-4" data-testid="kits-detail-summary">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm text-slate-700">
                Payment:&nbsp;
                <span className="font-semibold">{paymentStatus}</span>
              </span>
              <span className="text-sm text-slate-700">
                Dispatch:&nbsp;
                <StatusChip
                  tone={DISPATCH_STATUS_TONE[kd?.dispatchStatus ?? 'Not Started'] ?? 'neutral'}
                  label={kd?.dispatchStatus ?? 'Not Started'}
                  withDot={false}
                  testId="dispatch-status-chip"
                />
              </span>
              {kd && (
                <span className="text-sm text-slate-700">
                  Sales approval:&nbsp;
                  <StatusChip
                    tone={APPROVAL_TONE[kd.salesApprovalStatus] ?? 'neutral'}
                    label={kd.salesApprovalStatus}
                    withDot={false}
                    testId="approval-status-chip"
                  />
                </span>
              )}
              <span className="text-sm text-slate-700">
                Product:&nbsp;
                <span className="font-semibold">
                  {productSelection ?? 'not yet set'}
                </span>
              </span>
            </div>
            {productSelection === null && (
              <p className="mt-2 text-xs text-slate-600">
                Product selection not yet captured.&nbsp;
                <Link
                  href={`/mous/${mou.id}/kits-details`}
                  className="text-brand-navy underline-offset-2 hover:underline"
                >
                  Set it on the MOU.
                </Link>
              </p>
            )}
          </section>

          <section className="rounded-md border border-border bg-card p-4" data-testid="kits-allocation-section">
            <h2 className="font-heading text-lg font-semibold text-brand-navy">
              Grade-wise allocation
            </h2>
            <p className="mt-1 text-xs text-slate-600">
              {kd && kd.allocations.length > 0 && mou.gradewiseDistribution
                ? <>Sales pre-filled the grade-wise data on the MOU.&nbsp;<Link href={`/mous/${mou.id}/kits-details`} className="text-brand-navy underline-offset-2 hover:underline">Edit on MOU.</Link></>
                : 'Enter students + kit type + product per grade. Allocation cannot exceed available inventory.'}
            </p>
            <AllocationForm
              mouId={mou.id}
              initialAllocations={kd?.allocations ?? null}
              initialGradewiseDistribution={mou.gradewiseDistribution ?? null}
              productSelection={productSelection}
              eligibleSkus={eligibleSkus.map((s) => ({
                skuName: s.skuName,
                category: s.category,
                currentStock: s.currentStock,
              }))}
              editable={allocationEditable}
              rejectionReason={kd?.salesRejectionReason ?? null}
              initialVersion={kd?.version ?? null}
            />
          </section>

          {showSalesSection && kd && (
            <section className="rounded-md border border-border bg-card p-4" data-testid="kits-sales-section">
              <h2 className="font-heading text-lg font-semibold text-brand-navy">
                Sales approval
              </h2>
              {kd.salesApprovalStatus === 'Pending' && (
                <p className="mt-1 text-xs text-slate-600">
                  Sales reviews the allocation. Approve to generate the dispatch summary, or reject with a reason.
                </p>
              )}
              {kd.salesApprovalStatus === 'Approved' && (
                <p className="mt-1 text-xs text-emerald-700">
                  Approved by {kd.salesApprovedBy ?? 'unknown'} on{' '}
                  {kd.salesApprovedAt?.slice(0, 10) ?? '-'}.
                </p>
              )}
              {kd.salesApprovalStatus === 'Rejected' && kd.salesRejectionReason && (
                <p className="mt-1 text-xs text-signal-alert">
                  Rejection reason: {kd.salesRejectionReason}
                </p>
              )}
              {salesActionable && <SalesApprovalActions mouId={mou.id} />}
            </section>
          )}

          {showSummarySection && kd && (
            <section className="rounded-md border border-border bg-card p-4" data-testid="kits-summary-section">
              <h2 className="font-heading text-lg font-semibold text-brand-navy">
                Dispatch summary
              </h2>
              <p className="mt-1 text-xs text-slate-600">
                Sales can edit school details; the kit-requirement table is read-only after approval.
              </p>
              <DispatchSummaryEditor
                mouId={mou.id}
                allocations={kd.allocations}
                dispatchSummary={kd.dispatchSummary}
                editable={canApprove}
                fallback={{
                  schoolName: school?.name ?? mou.schoolName,
                  shippingAddress: [school?.city, school?.state, school?.pinCode]
                    .filter((v) => !!v)
                    .join(', '),
                  contactPerson: school?.contactPerson ?? '',
                  contactNumber: school?.phone ?? '',
                }}
              />
            </section>
          )}

          {showAccountsSection && kd && kd.dispatchSummary && (
            <section className="rounded-md border border-border bg-card p-4" data-testid="kits-accounts-section">
              <h2 className="font-heading text-lg font-semibold text-brand-navy">
                Accounts execution
              </h2>
              <p className="mt-1 text-xs text-slate-600">
                Fill in Actual Dispatched per row. Partial dispatch is allowed when stock is short.
              </p>
              <AccountsExecutionForm
                mouId={mou.id}
                allocations={kd.allocations}
                dispatchSummary={kd.dispatchSummary}
                editable={canExecute}
              />
            </section>
          )}

          {showTrackingSection && kd && (
            <section className="rounded-md border border-border bg-card p-4" data-testid="kits-tracking-section">
              <h2 className="font-heading text-lg font-semibold text-brand-navy">
                Shipment tracking + POD
              </h2>
              <p className="mt-1 text-xs text-slate-600">
                Courier metadata + POD upload. POD upload flips the dispatch to Delivered.
              </p>
              <ShipmentTrackingForm
                mouId={mou.id}
                tracking={kd.shipmentTracking}
                pod={kd.pod}
                dispatchStatus={kd.dispatchStatus}
                editable={canPod}
              />
            </section>
          )}
        </div>
      </main>
    </>
  )
}
