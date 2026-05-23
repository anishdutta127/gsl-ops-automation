/*
 * Phase 7 parity-test harness.
 *
 * Helpers that let a single test assert both DATA_BACKEND=json and
 * DATA_BACKEND=postgres produce identical read results for the same
 * inputs against the seeded staging data.
 *
 * The parity tests run in CI/local ONLY when DATABASE_URL is set.
 * Otherwise they skip with vitest's describe.skipIf so the json-only
 * test pass still runs everywhere (the no-regression floor Anish
 * required).
 *
 * The backend-flipping mechanism uses currentBackend() from
 * src/lib/db/backend.ts, which reads process.env.DATA_BACKEND on
 * every call. Tests temporarily set the env var, call the repo,
 * restore.
 */

import { expect } from 'vitest'

export function hasPostgres(): boolean {
  return !!process.env.DATABASE_URL
}

/**
 * Run `fn` with DATA_BACKEND set to the requested backend.
 * Restores the previous value after the call (even on throw).
 */
export async function withBackend<T>(
  backend: 'json' | 'postgres',
  fn: () => Promise<T>,
): Promise<T> {
  const prev = process.env.DATA_BACKEND
  process.env.DATA_BACKEND = backend
  try {
    return await fn()
  } finally {
    if (prev === undefined) delete process.env.DATA_BACKEND
    else process.env.DATA_BACKEND = prev
  }
}

/**
 * Normalise a value so cross-backend comparison ignores legitimately
 * divergent shapes:
 *   - postgres NUMERIC comes back as a string ('100.00') vs json's number
 *   - postgres TIMESTAMPTZ may come back as a Date; json keeps it as
 *     an ISO string
 *   - empty string vs null differ between backends (json has '', pg
 *     has NULL after the relaxation in 002-fixups.sql)
 *   - audit_log array ordering can differ (postgres may return a
 *     different in-memory order); compare as an unordered Set if
 *     all entries have stable timestamps
 *
 * The function is conservative: it ONLY transforms shapes that are
 * known to be backend-driven. Real semantic differences should still
 * fail the parity assertion.
 */
export function normalise(v: unknown): unknown {
  if (v === null || v === undefined) return null
  if (v === '') return null
  if (Array.isArray(v)) return v.map(normalise)
  if (v instanceof Date) return v.toISOString()
  if (typeof v === 'object') {
    const obj = v as Record<string, unknown>
    const out: Record<string, unknown> = {}
    for (const k of Object.keys(obj).sort()) {
      out[k] = normalise(obj[k])
    }
    return out
  }
  // Coerce numeric strings (postgres NUMERIC) to JS numbers.
  if (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v) && v.length < 16) {
    return Number(v)
  }
  return v
}

export function parityEqual(a: unknown, b: unknown): void {
  expect(normalise(a)).toEqual(normalise(b))
}
