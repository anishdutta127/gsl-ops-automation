/*
 * Ops workflow Kanban (Gate 4.95 Session 3 Step 6).
 *
 * The 6-column dispatch-focused Kanban behind /dashboard/ops/kanban.
 * Distinct from the legacy 9-column MOU pipeline Kanban at /kanban
 * (W4-I.5): this one tracks each MOU's progress through the KitDispatch
 * lifecycle and is the operational answer to "which MOUs are stuck and
 * who owns the next move?".
 *
 * Server-safe pure module: no I/O, no React, no Date.now(). Callers
 * pass `now`; the page hydrates from the JSON fixtures and the
 * augmentation filters (region / super-region / sales rep / ops owner)
 * narrow the MOU set before bucketing.
 */

import type {
  KitDispatch,
  MOU,
  Payment,
  Programme,
  StageResponsibility,
  User,
} from '@/lib/types'
import type { ProductSelection } from '@/lib/mouSystem/types'
import {
  applyOpsAugmentFilters,
  type OpsAugmentFilters,
} from '@/lib/dashboard/opsAugmentData'
import { computeStage, type LifecycleStage } from '@/lib/statusTracker'

// ===========================================================================
// Columns
// ===========================================================================

export type OpsWorkflowColumn =
  | 'awaiting-actuals'
  | 'allocation-in-progress'
  | 'pending-sales-approval'
  | 'ready-for-dispatch'
  | 'in-transit'
  | 'delivered'

export interface OpsWorkflowColumnDef {
  key: OpsWorkflowColumn
  label: string
  /** Mobile accordion collapses Delivered by default to keep the active
   *  workflow at the top of the viewport. */
  collapsedByDefault?: boolean
}

export const OPS_WORKFLOW_COLUMNS: ReadonlyArray<OpsWorkflowColumnDef> = [
  { key: 'awaiting-actuals', label: 'Awaiting actuals' },
  { key: 'allocation-in-progress', label: 'Allocation in progress' },
  { key: 'pending-sales-approval', label: 'Pending Sales approval' },
  { key: 'ready-for-dispatch', label: 'Ready for dispatch' },
  { key: 'in-transit', label: 'In transit' },
  { key: 'delivered', label: 'Delivered', collapsedByDefault: true },
]

/** Max cards rendered per column; overflow links surface "+N more". */
export const OPS_WORKFLOW_CARD_CAP = 100

/** Day thresholds for the aging colour ladder. */
export const OPS_WORKFLOW_AMBER_DAYS = 7
export const OPS_WORKFLOW_RED_DAYS = 14

// ===========================================================================
// Column mapping
// ===========================================================================

export interface ComputeOpsWorkflowColumnArgs {
  mou: MOU
  payments: Payment[]
  dispatches: KitDispatch[]
  now: Date
}

/**
 * Returns the workflow column for an MOU, or null when the MOU should
 * not appear on this Kanban at all (pipeline-stage MOUs are filtered
 * out per spec).
 */
export function computeOpsWorkflowColumn(
  args: ComputeOpsWorkflowColumnArgs,
): OpsWorkflowColumn | null {
  const { mou, payments, dispatches, now } = args

  // Pipeline MOUs (Draft / Pending Signature) never appear on the
  // dispatch Kanban; they sit on /mous or the MOU pipeline Kanban.
  if (mou.status === 'Draft' || mou.status === 'Pending Signature') {
    return null
  }

  const stage = computeStage({ mou, payments, dispatches, now })

  // 6. Delivered first: terminal state, takes priority even when other
  //    KitDispatch records sit in earlier states (multi-dispatch is rare
  //    today but the rule keeps the column terminal).
  if (
    stage === 'delivered'
    || stage === 'closed'
    || (dispatches.length > 0
      && dispatches.every((d) => d.dispatchStatus === 'Delivered'))
  ) {
    return 'delivered'
  }

  // 5. In transit: any KitDispatch is currently shipping.
  if (dispatches.some((d) => d.dispatchStatus === 'In Transit')) {
    return 'in-transit'
  }

  // 4. Ready for dispatch: Sales has approved and dispatch summary
  //    is populated but the dispatch has not left the warehouse yet.
  if (
    dispatches.some(
      (d) =>
        d.salesApprovalStatus === 'Approved'
        && d.dispatchSummary !== null
        && d.dispatchStatus === 'Pending',
    )
  ) {
    return 'ready-for-dispatch'
  }

  // 2. Allocation in progress: a KitDispatch record exists but no
  //    allocations yet, OR dispatchStatus is 'Not Started'. Checked
  //    before pending-sales-approval so a 'Not Started' dispatch with
  //    allocations still reads as allocation-in-progress (the workflow
  //    has not yet handed off to Sales).
  if (
    dispatches.some(
      (d) => (d.allocations?.length ?? 0) === 0 || d.dispatchStatus === 'Not Started',
    )
  ) {
    return 'allocation-in-progress'
  }

  // 3. Pending Sales approval: allocations exist and approval is in flight.
  if (
    dispatches.some(
      (d) =>
        (d.allocations?.length ?? 0) > 0 && d.salesApprovalStatus === 'Pending',
    )
  ) {
    return 'pending-sales-approval'
  }

  // 1. Awaiting actuals: pre-dispatch lifecycle stages (MOU signed but
  //    no KitDispatch record yet). Maps to mou-uploaded, active,
  //    payment-pending, installment-1-received, pi-generated. The
  //    statusTracker may also return 'dispatch-requested' when a
  //    KitDispatch exists with allocations; those cases are handled
  //    above, so we only land here when no dispatch record exists.
  if (
    stage === 'mou-uploaded'
    || stage === 'active'
    || stage === 'payment-pending'
    || stage === 'installment-1-received'
    || stage === 'pi-generated'
  ) {
    if (dispatches.length === 0) return 'awaiting-actuals'
    // Defensive: stage said pre-dispatch but a dispatch record exists
    // with no allocations. Treat as allocation-in-progress.
    return 'allocation-in-progress'
  }

  // 'dispatch-requested' without allocations is impossible by the
  // statusTracker rule, but if a future refactor breaks that, fall back
  // to allocation-in-progress.
  if (stage === 'dispatch-requested') return 'allocation-in-progress'

  // Unreachable: 'shipment-in-progress' already handled by the
  // dispatchStatus === 'In Transit' branch above. Default to awaiting.
  return 'awaiting-actuals'
}

// ===========================================================================
// Card shape
// ===========================================================================

export interface OpsWorkflowCard {
  mouId: string
  schoolId: string
  schoolName: string
  /** Any registry product name (MOU.programme widened to string). */
  programme: string
  productSelection: string | null
  daysAtStatus: number
  /** True when daysAtStatus > OPS_WORKFLOW_RED_DAYS. */
  isOverdue: boolean
  /** True when daysAtStatus > OPS_WORKFLOW_AMBER_DAYS and not overdue. */
  isAging: boolean
  salesRepName: string | null
  salesRepInitials: string | null
  opsOwnerName: string | null
  opsOwnerInitials: string | null
  /** Most recent activity timestamp surfaced on the card hover tooltip. */
  lastActivityTimestamp: string | null
  /** Card click destination; KitDispatch detail if one exists, otherwise MOU. */
  href: string
}

// ===========================================================================
// Build cards + grouping
// ===========================================================================

/** Two-letter initials from a name; falls back to single letter or null. */
export function initialsFromName(name: string | null | undefined): string | null {
  if (!name) return null
  const trimmed = name.trim()
  if (!trimmed) return null
  const parts = trimmed.split(/\s+/)
  if (parts.length === 1) {
    return parts[0]!.charAt(0).toUpperCase()
  }
  const first = parts[0]!.charAt(0)
  const last = parts[parts.length - 1]!.charAt(0)
  return (first + last).toUpperCase()
}

function differenceInDays(fromIso: string | null, now: Date): number {
  if (!fromIso) return 0
  const fromMs = new Date(fromIso).getTime()
  if (Number.isNaN(fromMs)) return 0
  const diff = now.getTime() - fromMs
  if (diff <= 0) return 0
  return Math.floor(diff / (1000 * 60 * 60 * 24))
}

function latestAuditTimestamp(dispatches: KitDispatch[]): string | null {
  let latest: string | null = null
  for (const d of dispatches) {
    for (const entry of d.auditLog ?? []) {
      if (!latest || entry.timestamp > latest) latest = entry.timestamp
    }
  }
  return latest
}

interface BuildCardArgs {
  mou: MOU
  dispatches: KitDispatch[]
  salesPersonNameById: Map<string, string>
  responsibleUserById: Map<LifecycleStage, string | null>
  userById: Map<string, User>
  payments: Payment[]
  now: Date
}

function buildCard(args: BuildCardArgs): OpsWorkflowCard {
  const { mou, dispatches, salesPersonNameById, responsibleUserById, userById, payments, now } = args

  const auditTs = latestAuditTimestamp(dispatches)
  const lastActivityTimestamp =
    auditTs ?? mou.startDate ?? mou.generatedAt ?? null
  const daysAtStatus = differenceInDays(lastActivityTimestamp, now)
  const isOverdue = daysAtStatus > OPS_WORKFLOW_RED_DAYS
  const isAging = !isOverdue && daysAtStatus > OPS_WORKFLOW_AMBER_DAYS

  const salesRepName = mou.salesPersonId
    ? salesPersonNameById.get(mou.salesPersonId) ?? null
    : null
  const stage = computeStage({ mou, payments, dispatches, now })
  const responsibleUserId = responsibleUserById.get(stage) ?? null
  const opsOwner = responsibleUserId ? userById.get(responsibleUserId) ?? null : null

  const dispatch = dispatches.find((d) => d.dispatchStatus !== 'Delivered') ?? dispatches[0]
  const href = dispatch ? `/dispatch/kits/${dispatch.id}` : `/mous/${mou.id}`

  return {
    mouId: mou.id,
    schoolId: mou.schoolId,
    schoolName: mou.schoolName,
    programme: mou.programme,
    productSelection: (mou.productSelection as ProductSelection | null) ?? null,
    daysAtStatus,
    isOverdue,
    isAging,
    salesRepName,
    salesRepInitials: initialsFromName(salesRepName),
    opsOwnerName: opsOwner?.name ?? null,
    opsOwnerInitials: initialsFromName(opsOwner?.name ?? null),
    lastActivityTimestamp,
    href,
  }
}

export interface GroupByColumnArgs {
  mous: MOU[]
  payments: Payment[]
  dispatches: KitDispatch[]
  users: User[]
  salesTeam: Array<{ id: string; name: string }>
  stageResponsibility: StageResponsibility[]
  now: Date
}

export type ColumnBuckets = Record<OpsWorkflowColumn, OpsWorkflowCard[]>

export function emptyBuckets(): ColumnBuckets {
  return {
    'awaiting-actuals': [],
    'allocation-in-progress': [],
    'pending-sales-approval': [],
    'ready-for-dispatch': [],
    'in-transit': [],
    delivered: [],
  }
}

/**
 * Bucket every MOU into its workflow column. MOUs that map to null
 * (pipeline stage) are silently dropped. Cards inside a column are
 * sorted by daysAtStatus DESC so the stalest sits at the top.
 */
export function groupByColumn(args: GroupByColumnArgs): ColumnBuckets {
  const { mous, payments, dispatches, users, salesTeam, stageResponsibility, now } = args

  const paymentsByMou = new Map<string, Payment[]>()
  for (const p of payments) {
    const list = paymentsByMou.get(p.mouId) ?? []
    list.push(p)
    paymentsByMou.set(p.mouId, list)
  }

  const dispatchesByMou = new Map<string, KitDispatch[]>()
  for (const d of dispatches) {
    const list = dispatchesByMou.get(d.mouId) ?? []
    list.push(d)
    dispatchesByMou.set(d.mouId, list)
  }

  const salesPersonNameById = new Map<string, string>()
  for (const sp of salesTeam) salesPersonNameById.set(sp.id, sp.name)

  const userById = new Map<string, User>()
  for (const u of users) userById.set(u.id, u)

  const responsibleUserById = new Map<LifecycleStage, string | null>()
  for (const r of stageResponsibility) {
    responsibleUserById.set(r.stage as LifecycleStage, r.responsibleUserId)
  }

  const buckets = emptyBuckets()
  for (const mou of mous) {
    const mouPayments = paymentsByMou.get(mou.id) ?? []
    const mouDispatches = dispatchesByMou.get(mou.id) ?? []
    const column = computeOpsWorkflowColumn({
      mou,
      payments: mouPayments,
      dispatches: mouDispatches,
      now,
    })
    if (!column) continue
    const card = buildCard({
      mou,
      dispatches: mouDispatches,
      salesPersonNameById,
      responsibleUserById,
      userById,
      payments: mouPayments,
      now,
    })
    buckets[column].push(card)
  }
  for (const key of Object.keys(buckets) as OpsWorkflowColumn[]) {
    buckets[key].sort((a, b) => b.daysAtStatus - a.daysAtStatus)
  }
  return buckets
}

// ===========================================================================
// Kanban-specific filter parsing (programme + date range)
// ===========================================================================

const VALID_PROGRAMMES: ReadonlyArray<Programme> = [
  'STEAM',
  'Young Pioneers',
  'Harvard HBPE',
  'Robotics',
]

export interface KanbanFilters {
  programmes: Programme[]
  /** ISO yyyy-mm-dd inclusive lower bound on MOU.startDate. */
  fromDate: string | null
  /** ISO yyyy-mm-dd inclusive upper bound on MOU.startDate. */
  toDate: string | null
}

export const EMPTY_KANBAN_FILTERS: KanbanFilters = {
  programmes: [],
  fromDate: null,
  toDate: null,
}

function csvList(v: string | string[] | undefined): string[] {
  if (v === undefined) return []
  if (Array.isArray(v)) return v.flatMap((s) => s.split(',')).filter(Boolean)
  return v.split(',').filter(Boolean)
}

function isIsoDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s)
}

export function parseKanbanFilters(
  searchParams: Record<string, string | string[] | undefined>,
): KanbanFilters {
  const programmes = csvList(searchParams.p).filter((p): p is Programme =>
    (VALID_PROGRAMMES as ReadonlyArray<string>).includes(p),
  )
  const fromRaw = typeof searchParams.from === 'string' ? searchParams.from : null
  const toRaw = typeof searchParams.to === 'string' ? searchParams.to : null
  return {
    programmes,
    fromDate: fromRaw && isIsoDate(fromRaw) ? fromRaw : null,
    toDate: toRaw && isIsoDate(toRaw) ? toRaw : null,
  }
}

export function isKanbanFiltersEmpty(f: KanbanFilters): boolean {
  return (
    f.programmes.length === 0 && f.fromDate === null && f.toDate === null
  )
}

/**
 * Apply the Kanban-specific filters (programme + date range). Region /
 * sales rep / ops owner come from the existing applyOpsAugmentFilters
 * pass; the caller composes the two.
 */
export function applyKanbanFilters(args: {
  mous: MOU[]
  filters: KanbanFilters
}): MOU[] {
  const { mous, filters } = args
  if (isKanbanFiltersEmpty(filters)) return mous
  const allowedProgrammes = new Set<string>(filters.programmes)
  return mous.filter((m) => {
    if (filters.programmes.length > 0 && !allowedProgrammes.has(m.programme)) return false
    if (filters.fromDate && (!m.startDate || m.startDate < filters.fromDate)) return false
    if (filters.toDate && (!m.startDate || m.startDate > filters.toDate)) return false
    return true
  })
}

// ===========================================================================
// Capped column slice
// ===========================================================================

export interface CappedColumn {
  visible: OpsWorkflowCard[]
  overflowCount: number
}

export function capColumn(cards: OpsWorkflowCard[]): CappedColumn {
  if (cards.length <= OPS_WORKFLOW_CARD_CAP) {
    return { visible: cards, overflowCount: 0 }
  }
  return {
    visible: cards.slice(0, OPS_WORKFLOW_CARD_CAP),
    overflowCount: cards.length - OPS_WORKFLOW_CARD_CAP,
  }
}

// ===========================================================================
// One-shot helper for the page
// ===========================================================================

export interface BuildKanbanArgs {
  mous: MOU[]
  payments: Payment[]
  dispatches: KitDispatch[]
  users: User[]
  salesTeam: Array<{ id: string; name: string; active: boolean }>
  stageResponsibility: StageResponsibility[]
  schools: import('@/lib/types').School[]
  augmentFilters: OpsAugmentFilters
  kanbanFilters: KanbanFilters
  now: Date
}

export interface BuildKanbanResult {
  buckets: ColumnBuckets
  /** Total cards across all columns (post-filter). */
  totalCards: number
  /** True when any augmentation or kanban filter is active. */
  filterActive: boolean
}

/**
 * Page-level convenience: intersects the augmentation filters + the
 * Kanban-specific filters, then buckets. Pure; no I/O.
 */
export function buildOpsWorkflowKanban(args: BuildKanbanArgs): BuildKanbanResult {
  const {
    mous,
    payments,
    dispatches,
    users,
    salesTeam,
    stageResponsibility,
    schools,
    augmentFilters,
    kanbanFilters,
    now,
  } = args

  // Drop archived cohorts before anything else; the Kanban is the live
  // dispatch view.
  const activeMous = mous.filter((m) => m.cohortStatus === 'active')

  const augmentResult = applyOpsAugmentFilters({
    mous: activeMous,
    schools,
    filters: augmentFilters,
    stageResponsibility,
    dispatches,
    paymentsForStage: payments.map((p) => ({
      mouId: p.mouId,
      instalmentSeq: p.instalmentSeq,
      status: p.status,
      dueDateIso: p.dueDateIso,
      piGeneratedAt: p.piGeneratedAt,
    })),
    now,
  })
  const augmented = augmentResult.passthrough
    ? activeMous
    : activeMous.filter((m) => augmentResult.filteredMouIds.has(m.id))

  const filtered = applyKanbanFilters({ mous: augmented, filters: kanbanFilters })

  const buckets = groupByColumn({
    mous: filtered,
    payments,
    dispatches,
    users,
    salesTeam: salesTeam.filter((sp) => sp.active),
    stageResponsibility,
    now,
  })

  let totalCards = 0
  for (const list of Object.values(buckets)) totalCards += list.length

  const filterActive =
    !augmentResult.passthrough || !isKanbanFiltersEmpty(kanbanFilters)

  return { buckets, totalCards, filterActive }
}
