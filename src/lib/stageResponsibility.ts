/*
 * Stage responsibility (Gate 4.9).
 *
 * Leadership-configurable mapping from each of the 10 master lifecycle
 * stages (see src/lib/statusTracker.ts) to a responsible party.
 *
 * Design:
 *   - One owner per stage. Department by default, user override available.
 *   - One escalation department per stage (where stalls route).
 *   - Append-only audit log per stage; leadership can change any time.
 *
 * Storage:
 *   src/data/stage_responsibility.json - persisted Map<LifecycleStage, StageResponsibility>.
 *   Mutations go through enqueueUpdate('stageResponsibility') so the queue
 *   sync (5-min cron) writes the file. The lib's `defaultDeps.responsibility`
 *   accessor reads the file at lib-load time; tests inject their own.
 */

import type {
  AuditEntry,
  KitDispatch,
  MOU,
  Payment,
  PendingUpdate,
  ResponsibilityDepartment,
  StageResponsibility,
} from '@/lib/types'
import { computeStage, type LifecycleStage, STAGE_ORDER } from './statusTracker'
import { enqueueUpdate } from './pendingUpdates'
import responsibilityJson from '@/data/stage_responsibility.json'

const seededArray = responsibilityJson as unknown as StageResponsibility[]
const seededMap: Partial<Record<LifecycleStage, StageResponsibility>> = {}
for (const row of seededArray) {
  seededMap[row.stage] = row
}

// ---------------------------------------------------------------------------
// Defaults
//
// Used as the fallback when a stage row is absent from the persisted JSON
// (e.g. a future stage added before leadership configures it). The default
// mapping mirrors the Gate 4.9 spec verbatim.
// ---------------------------------------------------------------------------

const DEFAULT_RESPONSIBILITY: Record<
  LifecycleStage,
  Pick<
    StageResponsibility,
    'responsibleDepartment' | 'escalationDepartment' | 'notes'
  >
> = {
  pipeline: {
    responsibleDepartment: 'sales',
    escalationDepartment: 'leadership',
    notes: 'Sales drafting MOU',
  },
  'mou-uploaded': {
    responsibleDepartment: 'sales',
    escalationDepartment: 'ops',
    notes: 'Sales submits signed MOU',
  },
  active: {
    responsibleDepartment: 'ops',
    escalationDepartment: 'sales',
    notes: 'Ops validates data, kits config',
  },
  'payment-pending': {
    responsibleDepartment: 'finance',
    escalationDepartment: 'sales',
    notes: 'Finance generates PI',
  },
  'installment-1-received': {
    responsibleDepartment: 'finance',
    escalationDepartment: 'leadership',
    notes: 'Finance reconciles payment',
  },
  'pi-generated': {
    responsibleDepartment: 'finance',
    escalationDepartment: 'ops',
    notes: 'Finance issues PI for that installment',
  },
  'dispatch-requested': {
    responsibleDepartment: 'ops',
    escalationDepartment: 'sales',
    notes: 'Ops allocates kits',
  },
  'shipment-in-progress': {
    responsibleDepartment: 'ops',
    escalationDepartment: 'finance',
    notes: 'Ops tracks shipment + uploads POD',
  },
  delivered: {
    responsibleDepartment: 'ops',
    escalationDepartment: 'leadership',
    notes: 'Ops confirms delivery + POD',
  },
  closed: {
    responsibleDepartment: 'finance',
    escalationDepartment: 'leadership',
    notes: 'Finance closes books on completed MOU',
  },
}

function fallback(stage: LifecycleStage, now: Date): StageResponsibility {
  const seed = DEFAULT_RESPONSIBILITY[stage]
  return {
    stage,
    responsibleDepartment: seed.responsibleDepartment,
    responsibleUserId: null,
    escalationDepartment: seed.escalationDepartment,
    notes: seed.notes,
    updatedAt: now.toISOString(),
    updatedBy: 'gate4.9-fallback',
    audit: [],
  }
}

// ---------------------------------------------------------------------------
// Deps + accessors
// ---------------------------------------------------------------------------

export interface StageResponsibilityDeps {
  /** Map keyed by stage. Tests pass any partial subset; the lib
   *  back-fills the rest from DEFAULT_RESPONSIBILITY. */
  responsibility: Partial<Record<LifecycleStage, StageResponsibility>>
  enqueue: (params: {
    queuedBy: string
    entity: import('@/lib/types').PendingUpdateEntity
    operation: 'create' | 'update' | 'delete'
    payload: Record<string, unknown>
  }) => Promise<PendingUpdate>
  now: () => Date
}

const defaultDeps: StageResponsibilityDeps = {
  responsibility: seededMap,
  enqueue: enqueueUpdate,
  now: () => new Date(),
}

// ---------------------------------------------------------------------------
// Read helpers
// ---------------------------------------------------------------------------

export function getStageResponsibility(
  stage: LifecycleStage,
  deps: StageResponsibilityDeps = defaultDeps,
): StageResponsibility {
  return deps.responsibility[stage] ?? fallback(stage, deps.now())
}

export function getResponsibilityMatrix(
  deps: StageResponsibilityDeps = defaultDeps,
): Record<LifecycleStage, StageResponsibility> {
  const out = {} as Record<LifecycleStage, StageResponsibility>
  for (const stage of STAGE_ORDER) {
    out[stage] = getStageResponsibility(stage, deps)
  }
  return out
}

export interface ResponsiblePartyForMou {
  stage: LifecycleStage
  responsibleDepartment: ResponsibilityDepartment
  responsibleUserId: string | null
  escalationDepartment: ResponsibilityDepartment
  notes: string | null
}

export function getResponsiblePartyForMou(args: {
  mou: MOU
  payments: Payment[]
  dispatches: KitDispatch[]
  now: Date
  deps?: StageResponsibilityDeps
}): ResponsiblePartyForMou {
  const stage = computeStage({
    mou: args.mou,
    payments: args.payments,
    dispatches: args.dispatches,
    now: args.now,
  })
  const responsibility = getStageResponsibility(stage, args.deps ?? defaultDeps)
  return {
    stage,
    responsibleDepartment: responsibility.responsibleDepartment,
    responsibleUserId: responsibility.responsibleUserId,
    escalationDepartment: responsibility.escalationDepartment,
    notes: responsibility.notes,
  }
}

// ---------------------------------------------------------------------------
// Write helper
// ---------------------------------------------------------------------------

export interface UpdateStageResponsibilityArgs {
  stage: LifecycleStage
  patch: Partial<
    Pick<
      StageResponsibility,
      | 'responsibleDepartment'
      | 'responsibleUserId'
      | 'escalationDepartment'
      | 'notes'
    >
  >
  actorUserId: string
  changeNotes?: string | null
}

export type UpdateStageResponsibilityFailureReason =
  | 'unknown-stage'
  | 'invalid-department'
  | 'no-changes'

export type UpdateStageResponsibilityResult =
  | { ok: true; stage: LifecycleStage; updated: StageResponsibility; changedFields: string[] }
  | { ok: false; reason: UpdateStageResponsibilityFailureReason }

const VALID_DEPARTMENTS: ReadonlyArray<ResponsibilityDepartment> = [
  'sales',
  'ops',
  'finance',
  'leadership',
  'admin',
]

export async function updateStageResponsibility(
  args: UpdateStageResponsibilityArgs,
  deps: StageResponsibilityDeps = defaultDeps,
): Promise<UpdateStageResponsibilityResult> {
  if (!(STAGE_ORDER as ReadonlyArray<string>).includes(args.stage)) {
    return { ok: false, reason: 'unknown-stage' }
  }
  if (
    args.patch.responsibleDepartment !== undefined
    && !VALID_DEPARTMENTS.includes(args.patch.responsibleDepartment)
  ) {
    return { ok: false, reason: 'invalid-department' }
  }
  if (
    args.patch.escalationDepartment !== undefined
    && !VALID_DEPARTMENTS.includes(args.patch.escalationDepartment)
  ) {
    return { ok: false, reason: 'invalid-department' }
  }

  const ts = deps.now().toISOString()
  const existing = getStageResponsibility(args.stage, deps)
  const next: StageResponsibility = { ...existing }
  const before: Record<string, unknown> = {}
  const after: Record<string, unknown> = {}
  const changedFields: string[] = []

  const keys: Array<keyof typeof args.patch> = [
    'responsibleDepartment',
    'responsibleUserId',
    'escalationDepartment',
    'notes',
  ]
  for (const key of keys) {
    if (args.patch[key] === undefined) continue
    if (existing[key] === args.patch[key]) continue
    before[key] = existing[key]
    after[key] = args.patch[key]
    changedFields.push(String(key))
    // Narrow assignment: each branch is type-safe because the patch's
    // key types match the StageResponsibility shape.
    if (key === 'responsibleDepartment') {
      next.responsibleDepartment = args.patch.responsibleDepartment as ResponsibilityDepartment
    } else if (key === 'responsibleUserId') {
      next.responsibleUserId = args.patch.responsibleUserId ?? null
    } else if (key === 'escalationDepartment') {
      next.escalationDepartment = args.patch.escalationDepartment as ResponsibilityDepartment
    } else if (key === 'notes') {
      const raw = args.patch.notes
      next.notes = raw === undefined || raw === null || String(raw).trim() === '' ? null : String(raw)
    }
  }

  if (changedFields.length === 0) {
    return { ok: false, reason: 'no-changes' }
  }

  next.updatedAt = ts
  next.updatedBy = args.actorUserId
  const audit: AuditEntry = {
    timestamp: ts,
    user: args.actorUserId,
    action: 'update',
    before,
    after,
    notes: args.changeNotes ?? `Stage responsibility for ${args.stage}: ${changedFields.join(', ')}.`,
  }
  next.audit = [...(existing.audit ?? []), audit]

  // Persist as an array element with id=stage. The drain (entityRegistry
  // path stage_responsibility.json) upserts by `id` for arrays of
  // objects; we synthesise the canonical id field below so the merge
  // matches by stage name.
  await deps.enqueue({
    queuedBy: args.actorUserId,
    entity: 'stageResponsibility',
    operation: 'update',
    payload: { ...next, id: args.stage } as Record<string, unknown>,
  })

  return { ok: true, stage: args.stage, updated: next, changedFields }
}

// ---------------------------------------------------------------------------
// Convenience: count stages with user override set
// ---------------------------------------------------------------------------

export function userOverrideCount(
  matrix: Record<LifecycleStage, StageResponsibility>,
): number {
  return STAGE_ORDER.reduce(
    (sum, s) => sum + (matrix[s].responsibleUserId !== null ? 1 : 0),
    0,
  )
}

export const __testing__ = {
  DEFAULT_RESPONSIBILITY,
  VALID_DEPARTMENTS,
  fallback,
}
