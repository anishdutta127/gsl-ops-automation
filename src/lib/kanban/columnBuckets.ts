/*
 * Column bucketing single source of truth (Gate 5A.7 Step 2).
 *
 * Two functions, two axes. The /kanban route hosts both Kanbans behind
 * a view toggle ("Full lifecycle" vs "Active operations"); both share
 * the same fixture set but classify cards on different axes:
 *
 *   - bucketByLifecycle: 10-column MOU lifecycle pipeline. Reads the
 *     first-non-null-date across the lifecycle (mou-signed,
 *     post-signing-intake, actuals-confirmed, ...). See deriveStage.ts
 *     for the full derivation contract.
 *   - bucketByOperations: 6-column KitDispatch workflow view. Reads
 *     KitDispatch state (allocations, salesApprovalStatus,
 *     dispatchStatus). See opsWorkflowKanban.ts for the full mapping.
 *
 * They cannot collapse into one function (different axes). This module
 * re-exports them so future consumers have one obvious place to find
 * both, per the Step 1 audit at docs/gate-5a.7/KANBAN_AUDIT.md.
 */

import { deriveStage, type DeriveStageDeps, type KanbanStageKey } from './deriveStage'
import {
  computeOpsWorkflowColumn,
  type ComputeOpsWorkflowColumnArgs,
  type OpsWorkflowColumn,
} from './opsWorkflowKanban'
import type { MOU } from '@/lib/types'

export type { KanbanStageKey, OpsWorkflowColumn }

/**
 * Lifecycle bucketing: thin wrapper around deriveStage. Returns the
 * lifecycle column key the card belongs in.
 */
export function bucketByLifecycle(mou: MOU, deps: DeriveStageDeps): KanbanStageKey {
  return deriveStage(mou, deps)
}

/**
 * Operations bucketing: thin wrapper around computeOpsWorkflowColumn.
 * Returns null for MOUs that should not appear on the operations
 * Kanban (Draft / Pending Signature pipeline MOUs).
 */
export function bucketByOperations(
  args: ComputeOpsWorkflowColumnArgs,
): OpsWorkflowColumn | null {
  return computeOpsWorkflowColumn(args)
}
