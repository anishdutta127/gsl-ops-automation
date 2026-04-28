/*
 * W4-F.2 createOpportunity: minimal-container Sales Pipeline write.
 *
 * Validates the 12 SalesOpportunity fields per the W4-F.1 schema,
 * generates the OPP-AY-### id (sequential per academic year), enqueues
 * the create, and writes a single 'opportunity-created' audit entry
 * naming the sales rep who created the row.
 *
 * No state machine, no approval workflow. Status / recceStatus /
 * gslModel / approvalNotes are free-text per Anish option C; the lib
 * only enforces "status non-empty on create".
 *
 * Permission gate: 'sales-opportunity:create' (Admin + SalesHead +
 * SalesRep). Lib does not enforce per-rep ownership at create time;
 * the create form auto-fills `salesRepId` to the session user (when
 * SalesRep) or accepts a dropdown pick (when SalesHead/Admin).
 */

import crypto from 'node:crypto'
import type {
  AuditEntry,
  PendingUpdate,
  Programme,
  SalesOpportunity,
  SalesPerson,
  User,
} from '@/lib/types'
import salesOpportunitiesJson from '@/data/sales_opportunities.json'
import salesTeamJson from '@/data/sales_team.json'
import usersJson from '@/data/users.json'
import { canPerform } from '@/lib/auth/permissions'
import { enqueueUpdate } from '@/lib/pendingUpdates'

const VALID_PROGRAMMES: ReadonlyArray<Programme> = [
  'STEAM',
  'TinkRworks',
  'Young Pioneers',
  'Harvard HBPE',
  'VEX',
]

/**
 * 6 region values per the W4-F.2 brief: forward-looking pipeline data
 * may scout schools in regions where MOUs do not yet exist. Existing
 * schools.json carries only 3 (East / North / South-West) but the
 * pipeline form accepts 6 so a Mumbai / Pune region rep can log
 * opportunities ahead of the first MOU there.
 */
export const REGION_OPTIONS: ReadonlyArray<string> = [
  'South-West',
  'East',
  'North',
  'Central',
  'West',
  'South',
]

export interface CreateOpportunityArgs {
  schoolName: string
  schoolId: string | null
  city: string
  state: string
  region: string
  salesRepId: string
  programmeProposed: Programme | null
  gslModel: string | null
  commitmentsMade: string | null
  outOfScopeRequirements: string | null
  recceStatus: string | null
  recceCompletedAt: string | null
  status: string
  approvalNotes: string | null
  createdBy: string                 // User.id from session
}

export type CreateOpportunityFailureReason =
  | 'permission'
  | 'unknown-user'
  | 'unknown-sales-rep'
  | 'missing-school-name'
  | 'missing-city'
  | 'missing-state'
  | 'invalid-region'
  | 'invalid-programme'
  | 'missing-status'
  | 'invalid-recce-completed-at'

export type CreateOpportunityResult =
  | { ok: true; opportunity: SalesOpportunity }
  | { ok: false; reason: CreateOpportunityFailureReason }

export interface CreateOpportunityDeps {
  opportunities: SalesOpportunity[]
  salesPersons: SalesPerson[]
  users: User[]
  enqueue: (params: {
    queuedBy: string
    entity: import('@/lib/types').PendingUpdateEntity
    operation: 'create' | 'update' | 'delete'
    payload: Record<string, unknown>
  }) => Promise<PendingUpdate>
  uuid: () => string
  now: () => Date
}

const defaultDeps: CreateOpportunityDeps = {
  opportunities: salesOpportunitiesJson as unknown as SalesOpportunity[],
  salesPersons: salesTeamJson as unknown as SalesPerson[],
  users: usersJson as unknown as User[],
  enqueue: enqueueUpdate,
  uuid: () => crypto.randomUUID(),
  now: () => new Date(),
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function nextOpportunityId(existing: SalesOpportunity[], academicYearShort: string): string {
  const prefix = `OPP-${academicYearShort}-`
  const max = existing
    .filter((o) => o.id.startsWith(prefix))
    .map((o) => Number.parseInt(o.id.slice(prefix.length), 10))
    .filter((n) => Number.isFinite(n))
    .reduce((acc, n) => (n > acc ? n : acc), 0)
  const next = max + 1
  return `${prefix}${String(next).padStart(3, '0')}`
}

function academicYearShort(now: Date): string {
  const month = now.getUTCMonth() + 1
  const fullYear = now.getUTCFullYear()
  // GSL AY runs April-March; April..December -> AY = current..current+1; Jan..March -> previous..current
  const startYear = month >= 4 ? fullYear : fullYear - 1
  const endYear = startYear + 1
  return `${String(startYear).slice(-2)}${String(endYear).slice(-2)}`
}

export async function createOpportunity(
  args: CreateOpportunityArgs,
  deps: CreateOpportunityDeps = defaultDeps,
): Promise<CreateOpportunityResult> {
  const user = deps.users.find((u) => u.id === args.createdBy)
  if (!user) return { ok: false, reason: 'unknown-user' }
  if (!canPerform(user, 'sales-opportunity:create')) {
    return { ok: false, reason: 'permission' }
  }

  const schoolName = args.schoolName.trim()
  if (schoolName === '') return { ok: false, reason: 'missing-school-name' }
  const city = args.city.trim()
  if (city === '') return { ok: false, reason: 'missing-city' }
  const state = args.state.trim()
  if (state === '') return { ok: false, reason: 'missing-state' }
  if (!REGION_OPTIONS.includes(args.region)) {
    return { ok: false, reason: 'invalid-region' }
  }
  if (
    args.programmeProposed !== null
    && !VALID_PROGRAMMES.includes(args.programmeProposed)
  ) {
    return { ok: false, reason: 'invalid-programme' }
  }
  const status = args.status.trim()
  if (status === '') return { ok: false, reason: 'missing-status' }
  if (
    args.recceCompletedAt !== null
    && args.recceCompletedAt !== ''
    && !ISO_DATE_RE.test(args.recceCompletedAt)
  ) {
    return { ok: false, reason: 'invalid-recce-completed-at' }
  }

  const sp = deps.salesPersons.find((s) => s.id === args.salesRepId)
  if (!sp) return { ok: false, reason: 'unknown-sales-rep' }

  const ts = deps.now()
  const tsIso = ts.toISOString()
  const id = nextOpportunityId(deps.opportunities, academicYearShort(ts))

  const audit: AuditEntry = {
    timestamp: tsIso,
    user: args.createdBy,
    action: 'opportunity-created',
    after: {
      schoolName,
      city,
      state,
      region: args.region,
      salesRepId: args.salesRepId,
      programmeProposed: args.programmeProposed,
      status,
    },
    notes: `Created by ${user.name} for sales rep ${sp.name}.`,
  }

  const opportunity: SalesOpportunity = {
    id,
    schoolName,
    schoolId: args.schoolId,
    city,
    state,
    region: args.region,
    salesRepId: args.salesRepId,
    programmeProposed: args.programmeProposed,
    gslModel: args.gslModel ? args.gslModel.trim() || null : null,
    commitmentsMade: args.commitmentsMade ? args.commitmentsMade.trim() || null : null,
    outOfScopeRequirements: args.outOfScopeRequirements
      ? args.outOfScopeRequirements.trim() || null
      : null,
    recceStatus: args.recceStatus ? args.recceStatus.trim() || null : null,
    recceCompletedAt: args.recceCompletedAt && args.recceCompletedAt !== ''
      ? args.recceCompletedAt
      : null,
    status,
    approvalNotes: args.approvalNotes ? args.approvalNotes.trim() || null : null,
    conversionMouId: null,
    lossReason: null,
    schoolMatchDismissed: false,
    createdAt: tsIso,
    createdBy: args.createdBy,
    auditLog: [audit],
  }

  await deps.enqueue({
    queuedBy: args.createdBy,
    entity: 'salesOpportunity',
    operation: 'create',
    payload: opportunity as unknown as Record<string, unknown>,
  })

  return { ok: true, opportunity }
}
