/*
 * QueueFreshnessIndicator (Gate 5A.5 Step 2).
 *
 * Top-nav badge that surfaces the live state of the write queue and
 * the time since the last successful drain. Three states:
 *
 *   synced  -> green dot, "Synced Nm ago"
 *   pending -> amber dot, "Pending N writes"
 *   stalled -> red dot, "Sync stalled Nm"
 *
 * The badge is a server component (reads sync_health.json +
 * pending_updates.json at request time) wrapping the client
 * component that owns the dropdown + Sync-now action. Reading on
 * the server means every page render reflects the live queue state
 * without client-side polling.
 *
 * Click opens a dropdown with: last drain timestamp, count of
 * pending writes, "Sync now" button, link to /admin/queue-status.
 */

import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type { PendingUpdate } from '@/lib/types'
import type { SyncHealthEntry } from '@/lib/syncHealth/appendEntry'
import { computeFreshnessState } from '@/lib/sync/freshnessState'
import { QueueFreshnessIndicatorClient } from './QueueFreshnessIndicatorClient'

const PENDING_PATH = 'src/data/pending_updates.json'
const HEALTH_PATH = 'src/data/sync_health.json'

async function readJson<T>(relPath: string): Promise<T | null> {
  try {
    const full = path.join(process.cwd(), relPath)
    const raw = await readFile(full, 'utf-8')
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

export interface QueueFreshnessIndicatorProps {
  /** Override now() for tests. */
  now?: Date
}

export async function QueueFreshnessIndicator({
  now,
}: QueueFreshnessIndicatorProps = {}) {
  const pending = (await readJson<PendingUpdate[]>(PENDING_PATH)) ?? []
  const history = (await readJson<SyncHealthEntry[]>(HEALTH_PATH)) ?? []

  const state = computeFreshnessState({
    pending,
    history,
    now: now ?? new Date(),
  })

  return (
    <QueueFreshnessIndicatorClient
      bucket={state.bucket}
      lastDrainAt={state.lastDrainAt}
      ageMinutes={state.ageMinutes}
      queueDepth={state.queueDepth}
      oldestPendingMinutes={state.oldestPendingMinutes}
    />
  )
}
