/*
 * Ops dashboard augmentation helpers (Gate 4.95 Session 3 Step 3).
 *
 * Adds three new filter dimensions on top of the existing Ops dashboard
 * filter chrome (DashboardHeader + DashboardFilterRow): region (with
 * NE/SW super-region overlay), sales rep, and ops owner. The lib is
 * deliberately a separate parse / apply pass; it does NOT replace
 * parseDashboardFilters from dashboardData.ts because the existing
 * tests + URL conventions (?fiscalYear, ?programme, ?fromDate, ?toDate)
 * stay intact.
 *
 * The page composes the two filter passes: first the existing
 * computeSlices narrows by FY/programme/date, then this lib intersects
 * by region/rep/owner to produce a final filtered MOU id set.
 *
 * Also hosts computeOpsProgrammeBreakdown for the Row-N programme
 * breakdown component the brief calls for.
 */

import type {
  KitDispatch,
  MOU,
  Programme,
  School,
  StageResponsibility,
  User,
} from '@/lib/types'
import {
  regionsForSuperRegion,
  type SuperRegion,
  SUPER_REGION_MEMBERS,
} from '@/lib/regions'
import { computeStage, type LifecycleStage } from '@/lib/statusTracker'

// ===========================================================================
// Filter parsing
// ===========================================================================

const VALID_SUPER_REGIONS: ReadonlyArray<SuperRegion> = ['NE', 'SW']
const VALID_PRIMARY_REGIONS: ReadonlyArray<string> = [
  'East',
  'North',
  'South-West',
  'South',
  'West',
  'Central',
]

export interface OpsAugmentFilters {
  regions: string[]
  superRegions: SuperRegion[]
  salesRepIds: string[]
  opsOwnerIds: string[]
}

export const EMPTY_OPS_AUGMENT_FILTERS: OpsAugmentFilters = {
  regions: [],
  superRegions: [],
  salesRepIds: [],
  opsOwnerIds: [],
}

function toCsvList(v: string | string[] | undefined): string[] {
  if (v === undefined) return []
  if (Array.isArray(v)) return v.flatMap((s) => s.split(',')).filter(Boolean)
  return v.split(',').filter(Boolean)
}

/**
 * Reads search params for the augmentation dimensions only. Unknown
 * values drop silently so a stray URL param does not crash the page.
 */
export function parseOpsAugmentFilters(
  searchParams: Record<string, string | string[] | undefined>,
): OpsAugmentFilters {
  const regions = toCsvList(searchParams.region).filter((r) =>
    VALID_PRIMARY_REGIONS.includes(r),
  )
  const superRegions = toCsvList(searchParams.sr).filter((s): s is SuperRegion =>
    VALID_SUPER_REGIONS.includes(s as SuperRegion),
  )
  const salesRepIds = toCsvList(searchParams.rep)
  const opsOwnerIds = toCsvList(searchParams.owner)
  return { regions, superRegions, salesRepIds, opsOwnerIds }
}

/** True when no augmentation dimension is active (page can short-circuit). */
export function isOpsAugmentFiltersEmpty(f: OpsAugmentFilters): boolean {
  return (
    f.regions.length === 0
    && f.superRegions.length === 0
    && f.salesRepIds.length === 0
    && f.opsOwnerIds.length === 0
  )
}

// ===========================================================================
// Apply
// ===========================================================================

export interface ApplyOpsAugmentArgs {
  mous: MOU[]
  schools: School[]
  payments?: never // kept off the signature so callers do not accidentally pass payments here; the existing slice already filtered
  filters: OpsAugmentFilters
  /** Stage responsibility map (Gate 4.9). Used to resolve "ops owner" filter. */
  stageResponsibility?: StageResponsibility[]
  /** Pass dispatches if you want the ops-owner filter to consider the
   *  CURRENT stage of each MOU. When omitted the filter is a no-op for
   *  any owner-filter selection that depends on stage. */
  dispatches?: KitDispatch[]
  /** Pass payments so the stage computation matches the dashboard's
   *  current view. When omitted, ops-owner stage filtering is best-effort. */
  paymentsForStage?: Array<{
    mouId: string
    instalmentSeq: number
    status: string
    dueDateIso: string | null
    piGeneratedAt: string | null
  }>
  now?: Date
}

export interface OpsAugmentApplyResult {
  /** Subset of input MOU ids that pass all augmentation dimensions. */
  filteredMouIds: Set<string>
  /** True when no augmentation dimension was active (i.e. result is the input). */
  passthrough: boolean
}

/**
 * Intersect the augmentation dimensions with the caller-provided MOU set.
 * Pure function; safe to call on each page render.
 */
export function applyOpsAugmentFilters(args: ApplyOpsAugmentArgs): OpsAugmentApplyResult {
  const { mous, schools, filters, stageResponsibility, dispatches, paymentsForStage, now } = args
  if (isOpsAugmentFiltersEmpty(filters)) {
    return {
      filteredMouIds: new Set(mous.map((m) => m.id)),
      passthrough: true,
    }
  }

  const schoolRegionById = new Map(schools.map((s) => [s.id, s.region]))

  // Region dimension: union of selected primary regions + members of
  // selected super-regions.
  const regionsAllowed = new Set<string>(filters.regions)
  for (const sr of filters.superRegions) {
    for (const r of regionsForSuperRegion(sr)) regionsAllowed.add(r)
  }
  const filterByRegion = regionsAllowed.size > 0

  const filterBySalesRep = filters.salesRepIds.length > 0
  const salesRepSet = new Set(filters.salesRepIds)

  const filterByOpsOwner = filters.opsOwnerIds.length > 0
  const opsOwnerSet = new Set(filters.opsOwnerIds)

  // Build stage → responsibleUserId lookup once. Falls back to null
  // when stageResponsibility is not provided.
  const stageOwnerById = new Map<LifecycleStage, string | null>()
  if (stageResponsibility) {
    for (const entry of stageResponsibility) {
      stageOwnerById.set(entry.stage as LifecycleStage, entry.responsibleUserId)
    }
  }

  // Group inputs for stage computation if filtering by ops owner.
  const paymentsByMou = new Map<string, ApplyOpsAugmentArgs['paymentsForStage'] extends infer T
    ? T extends Array<infer U> ? U[] : never
    : never>()
  if (filterByOpsOwner && paymentsForStage) {
    for (const p of paymentsForStage) {
      const list = paymentsByMou.get(p.mouId) ?? []
      list.push(p)
      paymentsByMou.set(p.mouId, list)
    }
  }
  const dispatchesByMou = new Map<string, KitDispatch[]>()
  if (filterByOpsOwner && dispatches) {
    for (const d of dispatches) {
      const list = dispatchesByMou.get(d.mouId) ?? []
      list.push(d)
      dispatchesByMou.set(d.mouId, list)
    }
  }
  const stageNow = now ?? new Date()

  const filteredMouIds = new Set<string>()
  for (const m of mous) {
    if (filterByRegion) {
      const r = schoolRegionById.get(m.schoolId)
      if (!r || !regionsAllowed.has(r)) continue
    }
    if (filterBySalesRep) {
      if (!m.salesPersonId || !salesRepSet.has(m.salesPersonId)) continue
    }
    if (filterByOpsOwner) {
      // Compute the MOU's current lifecycle stage and look up the
      // responsible user. When stageResponsibility seed has null user
      // (department-broadcast), the MOU does NOT match any specific
      // owner filter selection.
      const mouPayments = (paymentsByMou.get(m.id) ?? []) as Array<{
        mouId: string
        instalmentSeq: number
        status: string
        dueDateIso: string | null
        piGeneratedAt: string | null
      }>
      const stage = computeStage({
        mou: m,
        // computeStage signature wants Payment[]; the structural cast
        // works because the function only reads the fields above.
        payments: mouPayments as unknown as Parameters<typeof computeStage>[0]['payments'],
        dispatches: dispatchesByMou.get(m.id) ?? [],
        now: stageNow,
      })
      const responsibleUserId = stageOwnerById.get(stage) ?? null
      if (!responsibleUserId || !opsOwnerSet.has(responsibleUserId)) continue
    }
    filteredMouIds.add(m.id)
  }

  return { filteredMouIds, passthrough: false }
}

// ===========================================================================
// Programme breakdown
// ===========================================================================

export type OpsProgrammeBreakdownKey = Programme | 'VEX'

export interface OpsProgrammeBreakdownRow {
  programme: OpsProgrammeBreakdownKey
  mouCount: number
  studentsCount: number
  /** Sum of contractValue across MOUs in this programme that have
   *  a non-Delivered dispatch. Proxy for "active dispatch value"
   *  because the Dispatch entity has no per-row monetary value field. */
  activeDispatchValue: number
  barPct: number
  /** Click-through destination; drills to /mous (or /dispatch/kits for
   *  VEX, which lives outside the canonical Programme enum). */
  href: string
}

const PROGRAMME_ROW_ORDER: ReadonlyArray<OpsProgrammeBreakdownKey> = [
  'STEAM',
  'Young Pioneers',
  'Harvard HBPE',
  'Robotics',
  'VEX',
]

export function computeOpsProgrammeBreakdown(args: {
  mous: MOU[]
  kitDispatches: KitDispatch[]
}): OpsProgrammeBreakdownRow[] {
  const { mous, kitDispatches } = args

  const activeMouIds = new Set<string>()
  for (const d of kitDispatches) {
    if (d.dispatchStatus !== 'Delivered') activeMouIds.add(d.mouId)
  }

  const counts = new Map<
    OpsProgrammeBreakdownKey,
    { mouCount: number; students: number; activeValue: number }
  >()
  for (const p of PROGRAMME_ROW_ORDER) {
    counts.set(p, { mouCount: 0, students: 0, activeValue: 0 })
  }

  for (const m of mous) {
    // VEX detection mirrors Finance's forward-compatible OR check
    // (Programme==='VEX' or productSelection==='VEX'). Neither is in
    // the current enums today; lights up when enums widen.
    const isVex =
      (m.programme as unknown as string) === 'VEX'
      || ((m.productSelection as unknown as string) ?? '') === 'VEX'
    const key: OpsProgrammeBreakdownKey = isVex ? 'VEX' : (m.programme as Programme)
    const slot = counts.get(key)
    if (!slot) continue
    slot.mouCount += 1
    slot.students += m.studentsActual ?? m.studentsMou ?? 0
    if (activeMouIds.has(m.id)) {
      slot.activeValue += m.contractValue ?? 0
    }
  }

  let maxCount = 0
  for (const slot of Array.from(counts.values())) {
    if (slot.mouCount > maxCount) maxCount = slot.mouCount
  }

  const rows: OpsProgrammeBreakdownRow[] = []
  for (const key of PROGRAMME_ROW_ORDER) {
    const slot = counts.get(key)!
    rows.push({
      programme: key,
      mouCount: slot.mouCount,
      studentsCount: slot.students,
      activeDispatchValue: slot.activeValue,
      barPct: maxCount > 0 ? Math.round((slot.mouCount / maxCount) * 100) : 0,
      href: key === 'VEX'
        ? '/dispatch/kits?product=VEX'
        : `/mous?programme=${encodeURIComponent(key)}`,
    })
  }
  return rows
}

// ===========================================================================
// Misc helpers
// ===========================================================================

/** Re-export so callers building the filter UI don't have to import twice. */
export { SUPER_REGION_MEMBERS }

/** The 3-value primary region list per CLAUDE.md School schema. */
export const OPS_PRIMARY_REGIONS: ReadonlyArray<string> = [
  'East',
  'North',
  'South-West',
]

/** Lightweight pickers for the OpsFilterBar's sales rep + ops owner selects. */
export interface OpsRepOption {
  id: string
  name: string
}
export function buildSalesRepOptions(salesTeam: Array<{ id: string; name: string; active: boolean }>): OpsRepOption[] {
  return salesTeam
    .filter((sp) => sp.active)
    .map((sp) => ({ id: sp.id, name: sp.name }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

export function buildOpsOwnerOptions(users: User[]): OpsRepOption[] {
  return users
    .filter((u) => u.active && (u.department === 'ops' || u.department === null))
    .map((u) => ({ id: u.id, name: u.name }))
    .sort((a, b) => a.name.localeCompare(b.name))
}
