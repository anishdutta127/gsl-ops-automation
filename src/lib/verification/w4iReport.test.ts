/*
 * W4-I.1 verification report shape tests.
 *
 * Asserts the report at scripts/w4i-verification-report-2026-04-28.json
 * (committed alongside this batch) has the structural invariants the
 * round 2 close criteria expect: present categories, well-formed
 * findings, tally matches finding count.
 *
 * If the verification script is re-run with new findings, the report
 * file regenerates; these tests stay valid as long as the structural
 * invariants hold.
 */

import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const REPORT_PATH = path.resolve(
  process.cwd(),
  'scripts',
  'w4i-verification-report-2026-04-28.json',
)

interface Finding {
  category: 'PASS' | 'SMALL-FIX' | 'LARGER-FIX' | 'DEFERRED'
  area: string
  detail: string
}

interface Report {
  generatedAt: string
  scope: string
  tally: Record<string, number>
  findings: Finding[]
}

function loadReport(): Report {
  const text = fs.readFileSync(REPORT_PATH, 'utf8')
  return JSON.parse(text) as Report
}

describe('W4-I.1 verification report', () => {
  it('exists and parses as JSON with the expected envelope', () => {
    const report = loadReport()
    expect(report.scope).toContain('W4-I.1 final verification pass')
    expect(typeof report.generatedAt).toBe('string')
    expect(Array.isArray(report.findings)).toBe(true)
    expect(report.findings.length).toBeGreaterThan(0)
    expect(typeof report.tally).toBe('object')
  })

  it('every finding has the required fields and a known category', () => {
    const report = loadReport()
    const categories = new Set(['PASS', 'SMALL-FIX', 'LARGER-FIX', 'DEFERRED'])
    for (const f of report.findings) {
      expect(typeof f.category).toBe('string')
      expect(categories.has(f.category)).toBe(true)
      expect(typeof f.area).toBe('string')
      expect(f.area.length).toBeGreaterThan(0)
      expect(typeof f.detail).toBe('string')
      expect(f.detail.length).toBeGreaterThan(0)
    }
  })

  it('tally counts reconcile to the findings array', () => {
    const report = loadReport()
    const computed: Record<string, number> = {}
    for (const f of report.findings) {
      computed[f.category] = (computed[f.category] ?? 0) + 1
    }
    for (const [category, count] of Object.entries(report.tally)) {
      expect(computed[category] ?? 0).toBe(count)
    }
    // No blocking issues at round-2 close: zero LARGER-FIX, SMALL-FIX
    // entries can exist if surfaced post-run but should be addressed
    // before round 2 ships.
    expect(report.tally['LARGER-FIX'] ?? 0).toBe(0)
  })
})
