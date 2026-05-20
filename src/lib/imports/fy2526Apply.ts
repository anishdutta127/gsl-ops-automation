/*
 * Phase 6C FY 2025-26 importer apply layer.
 *
 * Walks the plan from buildImportPlan and enqueues one pendingUpdate
 * per create. Skips and conflicts are no-ops (the plan already
 * captures them for the report).
 *
 * Discipline: any thrown error is caught and packed into the result so
 * the page can render a useful error rather than a 500.
 */

import type { ImportPlan } from './fy2526Import'
import { enqueueUpdate } from '@/lib/pendingUpdates'

export interface ApplyImportPlanArgs {
  plan: ImportPlan
  queuedBy: string
  enqueue?: typeof enqueueUpdate
}

export interface ApplyImportPlanResult {
  schoolsCreated: number
  mousCreated: number
  instalmentsCreated: number
  paymentsCreated: number
  errors: Array<{ at: string; message: string }>
}

export async function applyImportPlan(
  args: ApplyImportPlanArgs,
): Promise<ApplyImportPlanResult> {
  const { plan, queuedBy } = args
  const enqueue = args.enqueue ?? enqueueUpdate
  const result: ApplyImportPlanResult = {
    schoolsCreated: 0,
    mousCreated: 0,
    instalmentsCreated: 0,
    paymentsCreated: 0,
    errors: [],
  }

  // Schools first (MOUs reference school ids).
  for (const sp of plan.schools) {
    if (sp.kind !== 'create') continue
    try {
      await enqueue({
        queuedBy,
        entity: 'school',
        operation: 'create',
        payload: sp.school as unknown as Record<string, unknown>,
      })
      result.schoolsCreated += 1
    } catch (e) {
      result.errors.push({
        at: `school ${sp.school.id}`,
        message: e instanceof Error ? e.message : String(e),
      })
    }
  }

  // MOUs + instalments + payments.
  for (const mp of plan.mous) {
    if (mp.kind !== 'create') continue
    try {
      await enqueue({
        queuedBy,
        entity: 'mou',
        operation: 'create',
        payload: mp.mou as unknown as Record<string, unknown>,
      })
      result.mousCreated += 1
    } catch (e) {
      result.errors.push({
        at: `mou ${mp.mou.id}`,
        message: e instanceof Error ? e.message : String(e),
      })
      continue
    }
    for (const inst of mp.instalments) {
      try {
        await enqueue({
          queuedBy,
          entity: 'payment',
          operation: 'create',
          payload: inst as unknown as Record<string, unknown>,
        })
        result.instalmentsCreated += 1
        if (inst.receivedAmount !== null) result.paymentsCreated += 1
      } catch (e) {
        result.errors.push({
          at: `payment ${inst.id}`,
          message: e instanceof Error ? e.message : String(e),
        })
      }
    }
  }

  return result
}
