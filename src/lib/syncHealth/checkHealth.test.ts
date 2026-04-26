import { describe, expect, it } from 'vitest'
import { checkHealth } from './checkHealth'
import type { PendingUpdate, PiCounter } from '@/lib/types'

const FIXED_NOW = new Date('2026-04-26T10:00:00.000Z')

function counter(overrides: Partial<PiCounter> = {}): PiCounter {
  return { fiscalYear: '26-27', next: 5, prefix: 'GSL/OPS', ...overrides }
}

function pending(overrides: Partial<PendingUpdate> = {}): PendingUpdate {
  return {
    id: 'p-1', queuedAt: '2026-04-26T09:50:00.000Z', queuedBy: 'system',
    entity: 'mou', operation: 'update', payload: {}, retryCount: 0,
    ...overrides,
  }
}

describe('checkHealth', () => {
  it('clean state: returns ok=true with no anomalies', () => {
    const report = checkHealth({
      piCounter: counter({ next: 5 }),
      piCounterRaw: '{"next":5}',
      pendingUpdates: [],
      pendingUpdatesRaw: '[]',
      priorCounter: counter({ next: 5 }),
      now: FIXED_NOW,
    })
    expect(report.ok).toBe(true)
    expect(report.anomalies).toEqual([])
    expect(report.checks.jsonValid).toBe(true)
    expect(report.checks.counterMonotonic).toBe(true)
    expect(report.checks.queueDepth).toBe(0)
    expect(report.checks.oldestPendingMinutes).toBeNull()
  })

  it('flags JSON parse failure on pi_counter', () => {
    const report = checkHealth({
      piCounter: null,
      piCounterRaw: '{not-json',
      pendingUpdates: [],
      pendingUpdatesRaw: '[]',
      priorCounter: null,
      now: FIXED_NOW,
    })
    expect(report.ok).toBe(false)
    expect(report.checks.jsonValid).toBe(false)
    expect(report.anomalies.some((a) => a.includes('pi_counter.json failed to parse'))).toBe(true)
  })

  it('flags JSON parse failure on pending_updates', () => {
    const report = checkHealth({
      piCounter: counter(),
      piCounterRaw: '{}',
      pendingUpdates: null,
      pendingUpdatesRaw: 'broken',
      priorCounter: null,
      now: FIXED_NOW,
    })
    expect(report.ok).toBe(false)
    expect(report.checks.jsonValid).toBe(false)
    expect(report.anomalies.some((a) => a.includes('pending_updates.json failed to parse'))).toBe(true)
  })

  it('flags counter regression vs prior snapshot (same fiscal-year + prefix)', () => {
    const report = checkHealth({
      piCounter: counter({ next: 3 }),
      piCounterRaw: '{}',
      pendingUpdates: [],
      pendingUpdatesRaw: '[]',
      priorCounter: counter({ next: 5 }),
      now: FIXED_NOW,
    })
    expect(report.ok).toBe(false)
    expect(report.checks.counterMonotonic).toBe(false)
    expect(report.anomalies.some((a) => a.includes('regression: prior 5, current 3'))).toBe(true)
  })

  it('does not flag counter when fiscalYear changed (year rollover is not a regression)', () => {
    const report = checkHealth({
      piCounter: counter({ fiscalYear: '27-28', next: 1 }),
      piCounterRaw: '{}',
      pendingUpdates: [],
      pendingUpdatesRaw: '[]',
      priorCounter: counter({ fiscalYear: '26-27', next: 50 }),
      now: FIXED_NOW,
    })
    expect(report.ok).toBe(true)
    expect(report.checks.counterMonotonic).toBe(true)
  })

  it('flags queue depth above threshold', () => {
    const updates = Array.from({ length: 60 }, (_, i) => pending({ id: `p-${i}` }))
    const report = checkHealth({
      piCounter: counter(),
      piCounterRaw: '{}',
      pendingUpdates: updates,
      pendingUpdatesRaw: '[]',
      priorCounter: counter(),
      now: FIXED_NOW,
    })
    expect(report.ok).toBe(false)
    expect(report.checks.queueDepth).toBe(60)
    expect(report.anomalies.some((a) => a.includes('queue depth 60 exceeds threshold 50'))).toBe(true)
  })

  it('flags stale pending update (>24h old)', () => {
    const old = pending({ queuedAt: '2026-04-24T09:50:00.000Z' })  // ~48h before FIXED_NOW
    const report = checkHealth({
      piCounter: counter(),
      piCounterRaw: '{}',
      pendingUpdates: [old],
      pendingUpdatesRaw: '[]',
      priorCounter: counter(),
      now: FIXED_NOW,
    })
    expect(report.ok).toBe(false)
    expect(report.checks.oldestPendingMinutes).toBeGreaterThan(24 * 60)
    expect(report.anomalies.some((a) => a.includes('exceeds stale threshold'))).toBe(true)
  })

  it('does not flag fresh pending updates', () => {
    const fresh = pending({ queuedAt: '2026-04-26T09:50:00.000Z' })  // 10 min before FIXED_NOW
    const report = checkHealth({
      piCounter: counter(),
      piCounterRaw: '{}',
      pendingUpdates: [fresh],
      pendingUpdatesRaw: '[]',
      priorCounter: counter(),
      now: FIXED_NOW,
    })
    expect(report.ok).toBe(true)
    expect(report.checks.oldestPendingMinutes).toBe(10)
  })

  it('honours custom thresholds via options', () => {
    const updates = Array.from({ length: 5 }, (_, i) => pending({ id: `p-${i}` }))
    const report = checkHealth(
      {
        piCounter: counter(),
        piCounterRaw: '{}',
        pendingUpdates: updates,
        pendingUpdatesRaw: '[]',
        priorCounter: counter(),
        now: FIXED_NOW,
      },
      { queueDepthThreshold: 3 },
    )
    expect(report.ok).toBe(false)
    expect(report.anomalies.some((a) => a.includes('exceeds threshold 3'))).toBe(true)
  })
})
