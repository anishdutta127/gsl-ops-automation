/*
 * W4-H.3 download-audit dedup helper.
 *
 * Pure function. Given a Dispatch's existing auditLog plus a candidate
 * download event (userId + action + now), return:
 *   - shouldAppend = true  when no matching entry exists within the
 *                          dedup window
 *   - shouldAppend = false when a matching entry exists within the
 *                          window (idempotent re-click suppression)
 *
 * Match key: (user, action) tuple. Different users get separate entries
 * (we want to know who downloaded and when); the same user clicking
 * twice within DEDUP_WINDOW_MS lands one entry.
 *
 * Mirrors the W4-E.5 createNotification 60s dedup pattern.
 */

import type { AuditAction, AuditEntry } from '@/lib/types'

export const DOWNLOAD_DEDUP_WINDOW_MS = 60_000

export interface DedupCheckArgs {
  auditLog: AuditEntry[]
  user: string
  action: Extract<
    AuditAction,
    'handover-worksheet-downloaded' | 'dispatch-note-downloaded'
  >
  now: Date
}

export function shouldAppendDownloadAudit(args: DedupCheckArgs): boolean {
  const cutoffMs = args.now.getTime() - DOWNLOAD_DEDUP_WINDOW_MS
  for (let i = args.auditLog.length - 1; i >= 0; i--) {
    const entry = args.auditLog[i]!
    if (entry.action !== args.action) continue
    if (entry.user !== args.user) continue
    const entryMs = new Date(entry.timestamp).getTime()
    if (Number.isNaN(entryMs)) continue
    if (entryMs >= cutoffMs) return false
  }
  return true
}
