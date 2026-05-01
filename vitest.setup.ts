/*
 * vitest.setup.ts
 *
 * Project-wide Vitest setup. Loaded once before each test file via the
 * `test.setupFiles` hook in vitest.config.ts. Use sparingly; per-test
 * mocks remain the right tool for behaviour that's specific to a
 * particular suite.
 *
 * What lives here:
 *
 *   1. TopNav mock. <TopNav> is an async Server Component that calls
 *      getCurrentUser() at render time. renderToStaticMarkup() in our
 *      test environment cannot resolve the Promise it returns, so the
 *      output ends up containing "[object Promise]" and tests asserting
 *      on page content fail. The mock returns null, which is safe
 *      because TopNav is purely chrome (no test asserts on its output
 *      from a page-wiring test; TopNav has its own dedicated suite).
 *
 *      Without this central mock, every page test that renders a page
 *      using TopNav has to add the mock locally. Phase 4 P4C3 saw 15+
 *      admin test files repeating it; centralising matches the same
 *      "factor when used 3+ times" rule that drove OpsButton + StatusChip.
 *
 *      Suites that DO want to assert on TopNav output (TopNav.test.tsx
 *      itself) override this mock by importing the real component
 *      directly via the un-mocked path. vi.unmock can also restore
 *      the real implementation in a specific test if needed.
 */

import { vi } from 'vitest'

vi.mock('@/components/ops/TopNav', () => ({
  TopNav: () => null,
}))
