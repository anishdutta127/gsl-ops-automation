/*
 * pending_updates.json queue writer.
 *
 * API routes call this to append a write intent. The self-hosted sync
 * runner consumes the queue on its next tick: applies each entry to the
 * master Excel via openpyxl, writes the result back out to JSON, and
 * clears the entry. Failed entries (retryCount >= 5) move to
 * data/failed_updates.json with their last error.
 *
 * Persistence goes through the GitHub Contents API (see githubQueue.ts);
 * Vercel's serverless filesystem is read-only outside /tmp so direct
 * fs.writeFile is not viable. The trade-off is a 500ms-2s round-trip
 * per write, acceptable for a 5-person internal tool.
 */

import crypto from 'node:crypto'
import { appendToQueue } from './githubQueue'
import type { PendingUpdate, PendingUpdateEntity } from './types'

export async function enqueueUpdate(params: {
  queuedBy: string
  entity: PendingUpdateEntity
  operation: 'update' | 'create' | 'delete'
  payload: Record<string, unknown>
}): Promise<PendingUpdate> {
  const entry: PendingUpdate = {
    id: crypto.randomUUID(),
    queuedAt: new Date().toISOString(),
    queuedBy: params.queuedBy,
    entity: params.entity,
    operation: params.operation,
    payload: params.payload,
    retryCount: 0,
  }
  await appendToQueue(entry)
  return entry
}
