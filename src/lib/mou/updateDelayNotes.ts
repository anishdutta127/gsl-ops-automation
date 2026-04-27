/*
 * MOU.delayNotes mutator (W4-B.3).
 *
 * Updates the persistent "Status notes" textarea on the MOU detail
 * page. Auto-save fires on textarea blur with a 600ms debounce; the
 * route handler at /api/mou/delay-notes calls into this lib.
 *
 * Permission: every authenticated user can edit (no role gate;
 * W3-B principle). Attribution is captured in the audit entry so
 * the trail of who-said-what stays clean even though the surface
 * is open. unknown-user is the only short-circuit.
 *
 * No-change semantics: if the trimmed target equals the current
 * value (after empty / whitespace-only normalisation to null),
 * returns failure 'no-change' so the route can suppress the audit
 * write rather than spam the log with empty saves.
 *
 * Audit anchor: writes a 'mou-delay-notes-updated' AuditEntry. The
 * before / after capture both notes truncated to ~200 chars with
 * the suffix " ... [truncated; full notes on MOU]" when over the
 * limit; full text always lives on mou.delayNotes.
 */

import type { AuditEntry, MOU, User } from '@/lib/types'
import mousJson from '@/data/mous.json'
import usersJson from '@/data/users.json'
import { enqueueUpdate } from '@/lib/pendingUpdates'

const AUDIT_TRUNCATE_LIMIT = 200
const AUDIT_TRUNCATE_SUFFIX = ' ... [truncated; full notes on MOU]'

export interface UpdateDelayNotesArgs {
  mouId: string
  /** Raw textarea value; trimmed + null-normalised inside. */
  rawNotes: string
  changedBy: string
}

export type UpdateDelayNotesFailureReason =
  | 'unknown-user'
  | 'mou-not-found'
  | 'no-change'

export type UpdateDelayNotesResult =
  | { ok: true; mou: MOU }
  | { ok: false; reason: UpdateDelayNotesFailureReason }

export interface UpdateDelayNotesDeps {
  mous: MOU[]
  users: User[]
  enqueue: typeof enqueueUpdate
  now: () => Date
}

const defaultDeps: UpdateDelayNotesDeps = {
  mous: mousJson as unknown as MOU[],
  users: usersJson as unknown as User[],
  enqueue: enqueueUpdate,
  now: () => new Date(),
}

/**
 * Truncate to ~200 chars suffix-flagged. Exported for the audit-log
 * formatter that may want to do its own paging.
 */
export function truncateForAudit(value: string | null): string | null {
  if (value === null) return null
  if (value.length <= AUDIT_TRUNCATE_LIMIT) return value
  // Reserve room for the suffix so the resulting string is exactly
  // AUDIT_TRUNCATE_LIMIT + suffix.length, not "limit + bonus".
  const head = value.slice(0, AUDIT_TRUNCATE_LIMIT)
  return head + AUDIT_TRUNCATE_SUFFIX
}

function normalise(raw: string): string | null {
  const trimmed = raw.trim()
  return trimmed === '' ? null : trimmed
}

export async function updateDelayNotes(
  args: UpdateDelayNotesArgs,
  deps: UpdateDelayNotesDeps = defaultDeps,
): Promise<UpdateDelayNotesResult> {
  const user = deps.users.find((u) => u.id === args.changedBy)
  if (!user) return { ok: false, reason: 'unknown-user' }

  const mou = deps.mous.find((m) => m.id === args.mouId)
  if (!mou) return { ok: false, reason: 'mou-not-found' }

  const next = normalise(args.rawNotes)
  if (next === mou.delayNotes) {
    return { ok: false, reason: 'no-change' }
  }

  const ts = deps.now().toISOString()

  const auditEntry: AuditEntry = {
    timestamp: ts,
    user: args.changedBy,
    action: 'mou-delay-notes-updated',
    before: { delayNotes: truncateForAudit(mou.delayNotes) },
    after: { delayNotes: truncateForAudit(next) },
  }

  const updated: MOU = {
    ...mou,
    delayNotes: next,
    auditLog: [...mou.auditLog, auditEntry],
  }

  await deps.enqueue({
    queuedBy: args.changedBy,
    entity: 'mou',
    operation: 'update',
    payload: updated as unknown as Record<string, unknown>,
  })

  return { ok: true, mou: updated }
}
