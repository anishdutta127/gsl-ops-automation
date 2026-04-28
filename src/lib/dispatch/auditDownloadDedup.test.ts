import { describe, expect, it } from 'vitest'
import type { AuditEntry } from '@/lib/types'
import {
  shouldAppendDownloadAudit,
  DOWNLOAD_DEDUP_WINDOW_MS,
} from './auditDownloadDedup'

const NOW = new Date('2026-04-29T10:00:00.000Z')

function entry(overrides: Partial<AuditEntry> = {}): AuditEntry {
  return {
    timestamp: '2026-04-29T09:50:00.000Z',
    user: 'misba.m',
    action: 'handover-worksheet-downloaded',
    ...overrides,
  } as AuditEntry
}

describe('shouldAppendDownloadAudit', () => {
  it('appends when log is empty', () => {
    expect(
      shouldAppendDownloadAudit({
        auditLog: [],
        user: 'misba.m',
        action: 'handover-worksheet-downloaded',
        now: NOW,
      }),
    ).toBe(true)
  })

  it('appends when no entry matches user+action', () => {
    expect(
      shouldAppendDownloadAudit({
        auditLog: [entry({ user: 'pradeep.r' })],
        user: 'misba.m',
        action: 'handover-worksheet-downloaded',
        now: NOW,
      }),
    ).toBe(true)
  })

  it('appends when same-user same-action entry is older than 60s', () => {
    const old = new Date(NOW.getTime() - DOWNLOAD_DEDUP_WINDOW_MS - 1).toISOString()
    expect(
      shouldAppendDownloadAudit({
        auditLog: [entry({ timestamp: old })],
        user: 'misba.m',
        action: 'handover-worksheet-downloaded',
        now: NOW,
      }),
    ).toBe(true)
  })

  it('suppresses when same-user same-action entry is within 60s', () => {
    const recent = new Date(NOW.getTime() - 30_000).toISOString()
    expect(
      shouldAppendDownloadAudit({
        auditLog: [entry({ timestamp: recent })],
        user: 'misba.m',
        action: 'handover-worksheet-downloaded',
        now: NOW,
      }),
    ).toBe(false)
  })

  it('different actions do not collide', () => {
    const recent = new Date(NOW.getTime() - 30_000).toISOString()
    expect(
      shouldAppendDownloadAudit({
        auditLog: [entry({ timestamp: recent, action: 'dispatch-note-downloaded' })],
        user: 'misba.m',
        action: 'handover-worksheet-downloaded',
        now: NOW,
      }),
    ).toBe(true)
  })

  it('different users do not collide (separate audit entry per user)', () => {
    const recent = new Date(NOW.getTime() - 30_000).toISOString()
    expect(
      shouldAppendDownloadAudit({
        auditLog: [entry({ timestamp: recent, user: 'pradeep.r' })],
        user: 'misba.m',
        action: 'handover-worksheet-downloaded',
        now: NOW,
      }),
    ).toBe(true)
  })

  it('rolls correctly when multiple historical entries exist (most-recent wins)', () => {
    const old = new Date(NOW.getTime() - 600_000).toISOString()
    const recent = new Date(NOW.getTime() - 10_000).toISOString()
    expect(
      shouldAppendDownloadAudit({
        auditLog: [
          entry({ timestamp: old }),
          entry({ timestamp: recent }),
        ],
        user: 'misba.m',
        action: 'handover-worksheet-downloaded',
        now: NOW,
      }),
    ).toBe(false)
  })
})
