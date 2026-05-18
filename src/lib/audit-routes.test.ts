/*
 * Regression test for the route-existence audit.
 *
 * Runs scripts/audit-routes.mjs and asserts that no internal `<Link>` /
 * `router.push` / `redirect` / `<a href>` declaration in src/ points at a
 * Next.js route that does not exist. The audit is a static structural
 * check; runtime gate mismatches (e.g. a page that calls notFound() for
 * some users) are not detected here.
 *
 * The audit script also writes docs/hotfix-mou-new/ROUTE_AUDIT.md with the
 * full matrix; this test only consumes the exit code (0 = ok, 1 = broken).
 *
 * Origin: hotfix-mou-new Step 5. The /mous/new 404 that Pranav hit was a
 * different class (gate mismatch, not missing route), but the same week we
 * agreed every CTA-to-route pair should be statically verified.
 */

import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

describe('route audit (static structural)', () => {
  it('every internal link in src/ points at a real Next.js route', () => {
    const scriptPath = resolve(__dirname, '..', '..', 'scripts', 'audit-routes.mjs')
    const result = spawnSync(process.execPath, [scriptPath], {
      encoding: 'utf8',
      cwd: resolve(__dirname, '..', '..'),
    })
    if (result.status !== 0) {
      const detail = result.stderr || result.stdout || '(no output)'
      throw new Error(
        `audit-routes exited with code ${result.status}. Stderr:\n${detail}`,
      )
    }
    expect(result.status).toBe(0)
  })
})
