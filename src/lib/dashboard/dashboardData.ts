/*
 * W4-I.5 Phase 2: Operations Control Dashboard data aggregation.
 *
 * Powers every number on the new dashboard at /dashboard (and / once
 * P2C5 swaps routes). Pure functions; deps-injected; no Date.now()
 * inside scoring (callers pass `now` and the URL searchParams via
 * `filters` so the page re-renders deterministically per request).
 *
 * Filter semantics (matches reference layout):
 *   - fiscalYear: matches MOU.academicYear (e.g. '2026-27'). Cards
 *     that count MOUs / dispatches / payments respect this filter.
 *     Schools and inventory are global (the "Active Schools" card
 *     filters by "has at least one MOU in the FY" so the FY filter
 *     still narrows it).
 *   - programme: matches MOU.programme. Cards downstream of MOU
 *     follow the same filter; school count narrows to schools with
 *     MOUs in the matching programme.
 *   - fromDate / toDate: filters MOU.startDate (kanban-style "MOUs
 *     active in this window") and Dispatch.poRaisedAt (orders raised
 *     in window). Schools.createdAt for the "added this month"
 *     subtitle. Open-ended ranges supported (either bound nullable).
 *
 * Delayed-shipment threshold: dispatched > 7d ago AND no
 * acknowledgedAt. Tracked as D-XXX (round 2 confirmation with
 * Misba/Pradeep on the threshold value).
 */

import type {
  Dispatch,
  DispatchRequest,
  Escalation,
  InventoryItem,
  MOU,
  Programme,
  SalesPerson,
  School,
} from '@/lib/types'

// ----------------------------------------------------------------------------
// Filter contract
// ----------------------------------------------------------------------------

export interface DashboardFilters {
  fiscalYear: string | null      // 'all' or e.g. '2026-27'; null = no filter
  programme: Programme | null    // null = no filter
  fromDate: string | null        // ISO yyyy-mm-dd or null (open-ended)
  toDate: string | null          // ISO yyyy-mm-dd or null (open-ended)
}

export const PROGRAMME_OPTIONS: ReadonlyArray<Programme> = [
  'STEAM',
  'TinkRworks',
  'Young Pioneers',
  'Harvard HBPE',
  'VEX',
]

const DELAYED_SHIPMENT_DAYS = 7
const DAY_MS = 24 * 60 * 60 * 1000

// ----------------------------------------------------------------------------
// Filter parsing from URL searchParams
// ----------------------------------------------------------------------------

export function parseDashboardFilters(
  sp: Record<string, string | string[] | undefined>,
): DashboardFilters {
  const fiscalYear = typeof sp.fiscalYear === 'string' && sp.fiscalYear !== 'all'
    ? sp.fiscalYear
    : null
  const rawProgramme = typeof sp.programme === 'string' ? sp.programme : null
  const programme = (PROGRAMME_OPTIONS as ReadonlyArray<string>).includes(rawProgramme ?? '')
    ? (rawProgramme as Programme)
    : null
  const fromDate = typeof sp.fromDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(sp.fromDate)
    ? sp.fromDate
    : null
  const toDate = typeof sp.toDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(sp.toDate)
    ? sp.toDate
    : null
  return { fiscalYear, programme, fromDate, toDate }
}

// ----------------------------------------------------------------------------
// Filtered slices (cached per render)
// ----------------------------------------------------------------------------

export interface DashboardSlices {
  filteredMous: MOU[]
  filteredSchoolIds: Set<string>
  filteredDispatches: Dispatch[]
  filteredEscalations: Escalation[]
}

export interface DashboardSliceInputs {
  mous: MOU[]
  schools: School[]
  dispatches: Dispatch[]
  escalations: Escalation[]
  filters: DashboardFilters
}

function withinDateRange(
  iso: string | null,
  from: string | null,
  to: string | null,
): boolean {
  if (iso === null) return from === null && to === null ? true : false
  const date = iso.slice(0, 10)
  if (from !== null && date < from) return false
  if (to !== null && date > to) return false
  return true
}

export function computeSlices(input: DashboardSliceInputs): DashboardSlices {
  const { mous, dispatches, escalations, filters } = input

  const filteredMous = mous.filter((m) => {
    if (m.cohortStatus !== 'active') return false
    if (filters.fiscalYear !== null && m.academicYear !== filters.fiscalYear) return false
    if (filters.programme !== null && m.programme !== filters.programme) return false
    // Open-ended date range: a MOU passes when its startDate falls in the window.
    // Null startDate passes only when no range is set (avoids dropping data the
    // operator hasn't filtered against).
    if (filters.fromDate !== null || filters.toDate !== null) {
      if (!withinDateRange(m.startDate, filters.fromDate, filters.toDate)) return false
    }
    return true
  })

  const filteredMouIds = new Set(filteredMous.map((m) => m.id))
  const filteredSchoolIds = new Set(filteredMous.map((m) => m.schoolId))

  // Dispatches inherit MOU's filter scope (filtered MOU id), and additionally
  // gate on poRaisedAt within the date range when one is set.
  const filteredDispatches = dispatches.filter((d) => {
    if (d.mouId === null) return false
    if (!filteredMouIds.has(d.mouId)) return false
    if (filters.fromDate !== null || filters.toDate !== null) {
      if (!withinDateRange(d.poRaisedAt, filters.fromDate, filters.toDate)) {
        // Allow dispatches without a poRaisedAt only when no range is set.
        if (d.poRaisedAt !== null) return false
      }
    }
    return true
  })

  // Escalations: filter by school OR mou matching the filtered scope. An
  // escalation tied to a filtered MOU stays in scope; one tied only to a
  // school in scope (mouId === null) also stays.
  const filteredEscalations = escalations.filter((e) => {
    if (e.mouId !== null && filteredMouIds.has(e.mouId)) return true
    if (e.mouId === null && filteredSchoolIds.has(e.schoolId)) return true
    // No FY/programme filter applied = include all open escalations.
    if (filters.fiscalYear === null && filters.programme === null) return true
    return false
  })

  return { filteredMous, filteredSchoolIds, filteredDispatches, filteredEscalations }
}

// ----------------------------------------------------------------------------
// Stat-card builders (one per card in the reference layout)
// ----------------------------------------------------------------------------

export interface StatCardData {
  key: string
  label: string
  primary: number | string
  primaryUnit: string
  subtitle: string
  ctaLabel: string
  ctaHref: string
  /** 'navy' | 'teal' | 'alert'; drives the CTA button colour. */
  ctaVariant: 'navy' | 'teal' | 'alert'
  iconKey: 'mous' | 'schools' | 'orders' | 'shipments' | 'escalations' | 'inventory'
}

export interface BuildStatCardsInputs {
  slices: DashboardSlices
  schools: School[]
  inventoryItems: InventoryItem[]
  now: Date
}

function startOfMonthIso(now: Date): string {
  return `${now.toISOString().slice(0, 7)}-01`
}

export function buildStatCards(input: BuildStatCardsInputs): StatCardData[] {
  const { slices, schools, inventoryItems, now } = input
  const { filteredMous, filteredDispatches, filteredEscalations } = slices

  // 1. MOU Registry
  const totalMous = filteredMous.length
  const pendingSignature = filteredMous.filter((m) => m.status === 'Pending Signature').length
  const mouRegistry: StatCardData = {
    key: 'mou-registry',
    label: 'MOU Registry',
    primary: totalMous,
    primaryUnit: totalMous === 1 ? 'School' : 'Schools',
    subtitle: pendingSignature === 0
      ? 'All signed'
      : `${pendingSignature} pending signature`,
    ctaLabel: 'View MOUs',
    ctaHref: '/mous',
    ctaVariant: 'navy',
    iconKey: 'mous',
  }

  // 2. Active Schools
  const activeSchoolIds = new Set(
    filteredMous.filter((m) => m.status === 'Active').map((m) => m.schoolId),
  )
  const monthStart = startOfMonthIso(now)
  const activeAddedThisMonth = schools.filter((s) =>
    activeSchoolIds.has(s.id) && s.createdAt.slice(0, 10) >= monthStart,
  ).length
  const activeSchools: StatCardData = {
    key: 'active-schools',
    label: 'Active Schools',
    primary: activeSchoolIds.size,
    primaryUnit: 'Active',
    subtitle: activeAddedThisMonth === 0
      ? 'No new this month'
      : `${activeAddedThisMonth} added this month`,
    ctaLabel: 'View Schools',
    ctaHref: '/schools',
    ctaVariant: 'teal',
    iconKey: 'schools',
  }

  // 3. Orders Raised / Pending
  const totalOrders = filteredDispatches.length
  const pendingOrders = filteredDispatches.filter((d) => d.stage === 'pending').length
  const ordersRaised: StatCardData = {
    key: 'orders-raised',
    label: 'Orders Raised',
    primary: totalOrders,
    primaryUnit: 'Raised',
    subtitle: pendingOrders === 0 ? 'None pending' : `${pendingOrders} Pending`,
    ctaLabel: 'View Orders',
    ctaHref: '/admin/dispatch-requests',
    ctaVariant: 'teal',
    iconKey: 'orders',
  }

  // 4. Track Shipment
  const inTransitDispatches = filteredDispatches.filter(
    (d) => d.stage === 'dispatched' || d.stage === 'in-transit',
  )
  const delayedDispatches = filteredDispatches.filter((d) => isDelayed(d, now))
  const trackShipment: StatCardData = {
    key: 'track-shipment',
    label: 'Track Shipment',
    primary: inTransitDispatches.length,
    primaryUnit: 'In Transit',
    subtitle: delayedDispatches.length === 0
      ? 'On schedule'
      : `${delayedDispatches.length} Delayed`,
    ctaLabel: 'Track Now',
    ctaHref: '/admin/dispatch-requests',
    ctaVariant: 'teal',
    iconKey: 'shipments',
  }

  // 5. Escalations
  const openEscalations = filteredEscalations.filter((e) => e.status === 'Open')
  const highPriorityEscalations = openEscalations.filter((e) => e.severity === 'high')
  const escalations: StatCardData = {
    key: 'escalations',
    label: 'Escalations',
    primary: openEscalations.length,
    primaryUnit: 'Open',
    subtitle: highPriorityEscalations.length === 0
      ? 'None high priority'
      : `${highPriorityEscalations.length} High Priority`,
    ctaLabel: 'Resolve Issues',
    ctaHref: '/escalations',
    ctaVariant: 'alert',
    iconKey: 'escalations',
  }

  // 6. Inventory Record
  const totalUnits = inventoryItems.reduce((s, i) => s + i.currentStock, 0)
  const lowStockItems = inventoryItems.filter(
    (i) => i.reorderThreshold !== null && i.currentStock <= i.reorderThreshold,
  )
  const inventory: StatCardData = {
    key: 'inventory',
    label: 'Inventory Record',
    primary: totalUnits.toLocaleString('en-IN'),
    primaryUnit: 'Units',
    subtitle: lowStockItems.length === 0
      ? 'All above threshold'
      : `${lowStockItems.length} Low Stock`,
    ctaLabel: 'View Inventory',
    ctaHref: '/admin/inventory',
    ctaVariant: 'teal',
    iconKey: 'inventory',
  }

  return [mouRegistry, activeSchools, ordersRaised, trackShipment, escalations, inventory]
}

/**
 * A dispatch is delayed when it was dispatched (PO raised + sent on its way)
 * more than 7 days ago AND has not been acknowledged at the receiving end.
 * Currently 7d; D-XXX flags this for round-2 confirmation with Misba/Pradeep.
 */
export function isDelayed(d: Dispatch, now: Date): boolean {
  if (d.acknowledgedAt !== null) return false
  if (d.dispatchedAt === null) return false
  const ageMs = now.getTime() - new Date(d.dispatchedAt).getTime()
  return ageMs > DELAYED_SHIPMENT_DAYS * DAY_MS
}

// ----------------------------------------------------------------------------
// Fiscal year option list
// ----------------------------------------------------------------------------

/**
 * Distinct academicYear values across the cohort, sorted desc. Used to
 * populate the FY dropdown in the dashboard header. Falls back to a
 * single-entry list when no MOUs exist yet.
 */
export function fiscalYearOptions(mous: MOU[]): string[] {
  const set = new Set<string>()
  for (const m of mous) {
    if (m.academicYear) set.add(m.academicYear)
  }
  if (set.size === 0) return []
  return Array.from(set).sort().reverse()
}

// ----------------------------------------------------------------------------
// Recent MOU Updates (P2C2: middle row, left column)
// ----------------------------------------------------------------------------

export interface RecentMouUpdate {
  mouId: string
  schoolId: string
  schoolName: string
  programme: Programme
  status: MOU['status']
  /** ISO yyyy-mm-dd of the most recent meaningful activity. */
  updateDate: string
  /** Last action recorded on the MOU's auditLog (or 'created' fallback). */
  lastAction: string
  /** Sales owner name + initials for the Owner avatar column. */
  ownerName: string
  ownerInitials: string
}

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter((p) => p.length > 0)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase()
}

function lastUpdateDate(mou: MOU): { iso: string; action: string } {
  if (mou.auditLog.length > 0) {
    const last = mou.auditLog[mou.auditLog.length - 1]!
    return { iso: last.timestamp.slice(0, 10), action: last.action }
  }
  if (mou.startDate) return { iso: mou.startDate.slice(0, 10), action: 'created' }
  return { iso: '0000-00-00', action: 'created' }
}

export interface BuildRecentMouUpdatesInputs {
  slices: DashboardSlices
  salesTeam: SalesPerson[]
  /** Number of rows to return; default 6 to match the reference layout. */
  limit?: number
}

export function buildRecentMouUpdates(
  input: BuildRecentMouUpdatesInputs,
): RecentMouUpdate[] {
  const { slices, salesTeam, limit = 6 } = input
  const repById = new Map(salesTeam.map((s) => [s.id, s]))
  const rows = slices.filteredMous.map((m) => {
    const { iso, action } = lastUpdateDate(m)
    const rep = m.salesPersonId ? repById.get(m.salesPersonId) ?? null : null
    const ownerName = rep?.name ?? (m.salesPersonId ?? 'unassigned')
    return {
      mouId: m.id,
      schoolId: m.schoolId,
      schoolName: m.schoolName,
      programme: m.programme,
      status: m.status,
      updateDate: iso,
      lastAction: action,
      ownerName,
      ownerInitials: initialsFor(ownerName),
    } satisfies RecentMouUpdate
  })
  rows.sort((a, b) => (a.updateDate < b.updateDate ? 1 : a.updateDate > b.updateDate ? -1 : 0))
  return rows.slice(0, limit)
}

// ----------------------------------------------------------------------------
// Action Center (P2C2: middle row, right column)
// ----------------------------------------------------------------------------

export interface ActionCenterTile {
  key: string
  count: number
  label: string
  href: string
  /** Tailwind colour class for the leading icon background. */
  iconTint: string
  iconKey: 'mous' | 'orders' | 'shipments' | 'escalations' | 'inventory'
}

export interface ActionCenterData {
  totalOpen: number
  tiles: ActionCenterTile[]
}

export interface BuildActionCenterInputs {
  slices: DashboardSlices
  dispatchRequests: DispatchRequest[]
  inventoryItems: InventoryItem[]
  now: Date
}

/**
 * 5 action tiles matching the reference layout, sourced from current
 * data state. The aggregate badge ("X open") sums the underlying tile
 * counts so operators see a single attention number at a glance.
 *
 * Tile semantics:
 *   1. MOUs pending signature (status === 'Pending Signature' in the
 *      filtered slice)
 *   2. Orders awaiting approval (DispatchRequest with status
 *      'pending-approval'; not filtered by FY/programme since the
 *      request entity does not carry programme directly)
 *   3. Shipments delayed (isDelayed within filtered dispatches)
 *   4. Escalations unresolved (status === 'Open' in filtered scope)
 *   5. Inventory units low stock (count of items at/under threshold;
 *      inventory is global, not filterable by FY/programme)
 */
export function buildActionCenter(input: BuildActionCenterInputs): ActionCenterData {
  const { slices, dispatchRequests, inventoryItems, now } = input

  const pendingSignatureCount = slices.filteredMous.filter(
    (m) => m.status === 'Pending Signature',
  ).length
  const ordersAwaitingApproval = dispatchRequests.filter(
    (r) => r.status === 'pending-approval',
  ).length
  const shipmentsDelayed = slices.filteredDispatches.filter((d) => isDelayed(d, now)).length
  const escalationsUnresolved = slices.filteredEscalations.filter(
    (e) => e.status === 'Open',
  ).length
  const inventoryLowStock = inventoryItems.filter(
    (i) => i.reorderThreshold !== null && i.currentStock <= i.reorderThreshold,
  ).length

  const tiles: ActionCenterTile[] = [
    {
      key: 'pending-signature',
      count: pendingSignatureCount,
      label: pendingSignatureCount === 1 ? 'MOU pending signature' : 'MOUs pending signature',
      href: '/mous?status=Pending+Signature',
      iconTint: 'bg-signal-attention/15 text-signal-attention',
      iconKey: 'mous',
    },
    {
      key: 'orders-awaiting-approval',
      count: ordersAwaitingApproval,
      label: ordersAwaitingApproval === 1
        ? 'Order awaiting approval'
        : 'Orders awaiting approval',
      href: '/admin/dispatch-requests',
      iconTint: 'bg-brand-teal/15 text-brand-navy',
      iconKey: 'orders',
    },
    {
      key: 'shipments-delayed',
      count: shipmentsDelayed,
      label: shipmentsDelayed === 1 ? 'Shipment delayed' : 'Shipments delayed',
      href: '/admin/dispatch-requests',
      iconTint: 'bg-brand-navy/15 text-brand-navy',
      iconKey: 'shipments',
    },
    {
      key: 'escalations-unresolved',
      count: escalationsUnresolved,
      label: escalationsUnresolved === 1
        ? 'Escalation unresolved'
        : 'Escalations unresolved',
      href: '/escalations?status=Open',
      iconTint: 'bg-signal-alert/15 text-signal-alert',
      iconKey: 'escalations',
    },
    {
      key: 'inventory-low-stock',
      count: inventoryLowStock,
      label: inventoryLowStock === 1
        ? 'Inventory item low stock'
        : 'Inventory items low stock',
      href: '/admin/inventory',
      iconTint: 'bg-foreground/15 text-foreground',
      iconKey: 'inventory',
    },
  ]

  const totalOpen = tiles.reduce((sum, t) => sum + t.count, 0)
  return { totalOpen, tiles }
}
