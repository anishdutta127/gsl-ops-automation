import { describe, it, expect } from 'vitest'
import {
  computeFreshnessState,
  formatAgeMinutes,
} from './freshnessState'
import type { PendingUpdate } from '@/lib/types'
import type { SyncHealthEntry } from '@/lib/syncHealth/appendEntry'

const NOW = new Date('2026-05-12T12:00:00.000Z')

function pending(queuedAt: string): PendingUpdate {
  return {
    id: `pu-${queuedAt}`,
    queuedAt,
    queuedBy: 'misba.m',
    entity: 'mou',
    operation: 'update',
    payload: { id: 'MOU-1' },
    retryCount: 0,
  }
}

function syncEntry(at: string, ok: boolean = true): SyncHealthEntry {
  return {
    at,
    kind: 'sync',
    ok,
    triggeredBy: 'github-actions',
    importSummary: null,
    healthChecks: null,
    anomalies: [],
  }
}

describe('computeFreshnessState', () => {
  it('returns synced when queue empty and last sync within 15 min', () => {
    const state = computeFreshnessState({
      pending: [],
      history: [syncEntry('2026-05-12T11:55:00.000Z')],
      now: NOW,
    })
    expect(state.bucket).toBe('synced')
    expect(state.queueDepth).toBe(0)
    expect(state.ageMinutes).toBe(5)
  })

  it('returns pending when queue has items even if last sync is recent', () => {
    const state = computeFreshnessState({
      pending: [pending('2026-05-12T11:58:00.000Z')],
      history: [syncEntry('2026-05-12T11:59:00.000Z')],
      now: NOW,
    })
    expect(state.bucket).toBe('pending')
    expect(state.queueDepth).toBe(1)
    expect(state.oldestPendingMinutes).toBe(2)
  })

  it('returns stalled when last sync older than 15 min and queue empty', () => {
    const state = computeFreshnessState({
      pending: [],
      history: [syncEntry('2026-05-12T11:30:00.000Z')],
      now: NOW,
    })
    expect(state.bucket).toBe('stalled')
    expect(state.ageMinutes).toBe(30)
  })

  it('returns stalled when no sync history at all', () => {
    const state = computeFreshnessState({
      pending: [],
      history: [],
      now: NOW,
    })
    expect(state.bucket).toBe('stalled')
    expect(state.lastDrainAt).toBeNull()
    expect(state.ageMinutes).toBeNull()
  })

  it('picks the most recent sync entry as the heartbeat', () => {
    const state = computeFreshnessState({
      pending: [],
      history: [
        syncEntry('2026-05-12T10:00:00.000Z'),
        syncEntry('2026-05-12T11:50:00.000Z'),
        { ...syncEntry('2026-05-12T11:55:00.000Z'), kind: 'health' },
      ],
      now: NOW,
    })
    expect(state.bucket).toBe('synced')
    expect(state.lastDrainAt).toBe('2026-05-12T11:50:00.000Z')
  })

  it('computes oldest pending minutes across multiple queue entries', () => {
    const state = computeFreshnessState({
      pending: [
        pending('2026-05-12T11:55:00.000Z'),
        pending('2026-05-12T11:40:00.000Z'),
        pending('2026-05-12T11:50:00.000Z'),
      ],
      history: [syncEntry('2026-05-12T11:59:00.000Z')],
      now: NOW,
    })
    expect(state.queueDepth).toBe(3)
    expect(state.oldestPendingMinutes).toBe(20)
  })
})

describe('formatAgeMinutes', () => {
  it('formats null as never', () => {
    expect(formatAgeMinutes(null)).toBe('never')
  })

  it('formats sub-minute as just now', () => {
    expect(formatAgeMinutes(0.5)).toBe('just now')
  })

  it('formats minutes', () => {
    expect(formatAgeMinutes(7)).toBe('7 min ago')
  })

  it('formats hours', () => {
    expect(formatAgeMinutes(120)).toBe('2h ago')
  })

  it('formats yesterday', () => {
    expect(formatAgeMinutes(24 * 60 + 30)).toBe('yesterday')
  })

  it('formats multi-day', () => {
    expect(formatAgeMinutes(3 * 24 * 60)).toBe('3d ago')
  })
})
