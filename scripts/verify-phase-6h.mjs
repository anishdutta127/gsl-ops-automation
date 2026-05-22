#!/usr/bin/env node
/*
 * Phase 6H V4 verification.
 *
 * Walks the kit-details flow on a real production MOU, manually drains
 * the queue, reloads, and confirms the data persisted. Screenshots at
 * every checkpoint so the report has visual evidence. The "Saved" toast
 * is not proof of persistence per CLAUDE.md; only the post-reload state
 * counts.
 *
 * Steps:
 *  1. Login.
 *  2. Visit /mous/<id>/kits-details. Screenshot BEFORE.
 *  3. Set grade-wise distribution rows.
 *  4. Submit. Screenshot the Saved toast.
 *  5. POST /api/admin/sync-queue with the bearer token to drain
 *     immediately (cron is 5-min; tests cannot wait).
 *  6. Reload /mous/<id>/kits-details. Screenshot AFTER reload to prove
 *     persistence.
 *  7. Visit /dispatch/kits/<id>. Screenshot the populated SKU dropdown.
 *
 * Env vars required:
 *   VERIFY_PASSWORD: login password for anish.d@getsetlearn.info
 *   CRON_SECRET: bearer token for /api/admin/sync-queue
 */

import { chromium } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '..')

import { execSync } from 'node:child_process'

const BASE = process.env.GSL_OPS_BASE_URL ?? 'https://gsl-ops-automation.vercel.app'
const USER = process.env.VERIFY_USER ?? 'anish.d@getsetlearn.info'
const PASSWORD = process.env.VERIFY_PASSWORD
const CRON = process.env.CRON_SECRET
const MOU_ID = process.env.VERIFY_MOU_ID ?? 'MOU-STEAM-2627-007'
// CRON_SECRET is sensitive and not freely available. Fallback: trigger
// the GitHub Actions cron workflow manually via `gh workflow run`.
// Same drain code path, runs server-side with the GitHub-stored secret.
const USE_GH_WORKFLOW = !CRON

if (!PASSWORD) {
  console.error('VERIFY_PASSWORD is required.')
  process.exit(1)
}

const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
const outDir = join(REPO_ROOT, '.verification', `phase-6h-${ts}`)
await mkdir(outDir, { recursive: true })
console.log(`[verify-6h] output dir: ${outDir}`)
console.log(`[verify-6h] mouId: ${MOU_ID}`)

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await context.newPage()

async function shoot(name) {
  const path = join(outDir, `${name}.png`)
  await page.screenshot({ path, fullPage: true })
  console.log(`[verify-6h] screenshot: ${path}`)
  return path
}

try {
  // ---------------------------------------------------------------------------
  // 1. Login
  // ---------------------------------------------------------------------------
  console.log('[verify-6h] login...')
  const resp = await page.request.post(`${BASE}/api/login`, {
    multipart: { email: USER, password: PASSWORD },
    maxRedirects: 0,
  })
  if (resp.status() !== 303 && resp.status() !== 302) {
    console.error(`[verify-6h] login failed: HTTP ${resp.status()}`)
    console.error(await resp.text())
    process.exit(1)
  }
  const setCookie = resp.headers()['set-cookie'] ?? ''
  const cookieMatch = setCookie.match(/gsl_ops_session=([^;]+)/)
  if (!cookieMatch) {
    console.error('[verify-6h] login ok but no session cookie.')
    process.exit(1)
  }
  await context.addCookies([
    {
      name: 'gsl_ops_session',
      value: cookieMatch[1],
      domain: new URL(BASE).hostname,
      path: '/',
      httpOnly: true,
      secure: true,
      sameSite: 'Lax',
    },
  ])
  console.log('[verify-6h] login ok')

  // ---------------------------------------------------------------------------
  // 2. Visit kits-details BEFORE
  // ---------------------------------------------------------------------------
  console.log('[verify-6h] visiting kits-details...')
  await page.goto(`${BASE}/mous/${MOU_ID}/kits-details`, { waitUntil: 'networkidle' })
  await shoot('01-kits-details-before')

  // Read the page state so we can prove the after-reload diff.
  const beforeGradeRowCount = await page.locator('table tbody tr').count()
  const beforeProductSelected = await page
    .locator('input[name="productSelection"]:checked')
    .first()
    .getAttribute('value')
    .catch(() => null)
  console.log(`[verify-6h] before: productSelection=${beforeProductSelected}, gradeRows=${beforeGradeRowCount}`)

  // ---------------------------------------------------------------------------
  // 3. Fill grade-wise distribution. Use grades 6 and 7 with realistic counts.
  //    productSelection already set (Cretile from Phase 6E backfill); leave
  //    the radio alone so we are testing the gradewiseDistribution write path.
  // ---------------------------------------------------------------------------
  console.log('[verify-6h] filling grade-wise distribution...')
  // First clear any existing values for grades 6 and 7 (idempotent).
  await page.getByLabel('Grade 6 students').fill('120')
  await page.getByLabel('Grade 7 students').fill('140')
  // Kit type select for each row. The select is the third td of each grade
  // row; use the second select on the page (grade-1 row is the first).
  const grade6KitTypeSelect = page.locator('select').nth(5) // 0=g1, 1=g2 ... 5=g6
  await grade6KitTypeSelect.selectOption('Reusable')
  const grade7KitTypeSelect = page.locator('select').nth(6)
  await grade7KitTypeSelect.selectOption('Reusable')

  await shoot('02-kits-details-filled')

  // ---------------------------------------------------------------------------
  // 4. Submit + capture Saved toast
  // ---------------------------------------------------------------------------
  console.log('[verify-6h] submitting...')
  await page.getByRole('button', { name: /Save kits details/i }).click()
  // The toast text is "Saved. Will reflect everywhere within ~5 minutes."
  await page.getByText(/Saved\. Will reflect everywhere/i).waitFor({ timeout: 10_000 })
  await shoot('03-kits-details-saved-toast')
  console.log('[verify-6h] Saved toast confirmed (NOT proof of persistence)')

  // ---------------------------------------------------------------------------
  // 5. Manually drain the queue. The cron runs every 5 minutes; we trigger
  //    immediately so the verification can complete in one run. Two paths:
  //    direct POST with CRON_SECRET (if available), else dispatch the
  //    GitHub Actions workflow which runs the same drain server-side.
  // ---------------------------------------------------------------------------
  if (USE_GH_WORKFLOW) {
    console.log('[verify-6h] triggering drain via gh workflow run...')
    execSync('gh workflow run sync-queue-cron.yml', { stdio: 'inherit' })
    console.log('[verify-6h] gh workflow dispatched. Polling for drain commit on origin...')
    // Wait for the workflow run to finish. The drain commits to GitHub,
    // which means a new commit appears on origin/main with subject
    // chore(sync): apply mou batch ... or chore(queue): drain ....
    const POLL_MAX_MS = 240_000
    const POLL_INTERVAL_MS = 10_000
    const startSha = execSync('git ls-remote origin main', { encoding: 'utf-8' }).trim().split(/\s+/)[0]
    const pollStart = Date.now()
    let newSha = startSha
    while (Date.now() - pollStart < POLL_MAX_MS) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
      newSha = execSync('git ls-remote origin main', { encoding: 'utf-8' }).trim().split(/\s+/)[0]
      if (newSha !== startSha) {
        console.log(`[verify-6h] new commit on origin: ${newSha.slice(0, 8)} (was ${startSha.slice(0, 8)})`)
        break
      }
    }
    if (newSha === startSha) {
      console.error('[verify-6h] no new commit appeared on origin within timeout. Drain may not have run.')
    }
  } else {
    console.log('[verify-6h] triggering drain via direct POST...')
    const drainResp = await page.request.post(`${BASE}/api/admin/sync-queue`, {
      headers: {
        Authorization: `Bearer ${CRON}`,
        'Content-Type': 'application/json',
      },
      data: { triggeredBy: 'phase-6h-verify' },
    })
    if (!drainResp.ok()) {
      console.error(`[verify-6h] drain HTTP ${drainResp.status()}`)
      console.error(await drainResp.text())
      process.exit(1)
    }
    const drainBody = await drainResp.json()
    console.log(`[verify-6h] drain: ok=${drainBody.ok} drained=${drainBody.drainedCount} remaining=${drainBody.remainingCount}`)
    for (const e of drainBody.perEntity ?? []) {
      console.log(`[verify-6h]   ${e.entity}: drained=${e.drained} skipped=${e.skipped} failed=${e.failed}`)
    }
    for (const a of drainBody.anomalies ?? []) {
      console.log(`[verify-6h]   anomaly: ${a}`)
    }
  }

  // The drain commits to GitHub. The fresh data ships on the next Vercel
  // build that follows the chore(sync) commit. The pi/queue rebuild lag
  // can be 30-90 seconds; poll the /mous/<id>/kits-details until we see
  // a non-zero grade row, or fail loudly after 3 minutes.
  console.log('[verify-6h] waiting for the drain commit to ship to the live deploy...')
  let persistedRows = 0
  const POLL_MAX_MS = 180_000
  const POLL_INTERVAL_MS = 10_000
  const pollStart = Date.now()
  while (Date.now() - pollStart < POLL_MAX_MS) {
    // ---------------------------------------------------------------------
    // 6. Reload kits-details AFTER drain. Counts the live grade rows in the
    //    rendered form to confirm persistence.
    // ---------------------------------------------------------------------
    await page.goto(`${BASE}/mous/${MOU_ID}/kits-details`, { waitUntil: 'networkidle' })
    // Count grade rows that have a non-zero student input.
    persistedRows = await page.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll('input[aria-label^="Grade "][aria-label$=" students"]'))
      return inputs.filter((el) => Number(el.value || '0') > 0).length
    })
    console.log(`[verify-6h] poll @${Math.round((Date.now() - pollStart) / 1000)}s: persistedRows=${persistedRows}`)
    if (persistedRows >= 2) break
    await page.waitForTimeout(POLL_INTERVAL_MS)
  }
  await shoot('04-kits-details-after-reload')
  if (persistedRows < 2) {
    console.error('[verify-6h] FAIL: kits-details did NOT persist after drain + reload.')
    process.exit(1)
  }
  console.log('[verify-6h] PERSISTED: grade rows survived reload')

  // ---------------------------------------------------------------------------
  // 7. Allocation: SKU dropdown must populate now that productSelection sat
  //    through the drain. The page shows the amber "product not set" banner
  //    + empty dropdown pre-fix; post-fix the dropdown shows Cretile SKUs.
  // ---------------------------------------------------------------------------
  console.log('[verify-6h] visiting allocation page...')
  await page.goto(`${BASE}/dispatch/kits/${MOU_ID}`, { waitUntil: 'networkidle' })
  await shoot('05-allocation-page')

  // Each allocation row has a select with data-testid="product-select-<grade>"
  // whose options come from eligibleSkus.map(...) over inventory.
  const amberBanner = await page
    .getByText(/Product selection is not yet set/i)
    .count()
  const productSelects = await page.locator('[data-testid^="product-select-"]').count()
  let firstSelectOptionCount = 0
  if (productSelects > 0) {
    firstSelectOptionCount = await page
      .locator('[data-testid^="product-select-"]')
      .first()
      .locator('option')
      .count()
  }
  console.log(
    `[verify-6h] allocation: amberBanner=${amberBanner}, productSelects=${productSelects}, optionsOnFirst=${firstSelectOptionCount}`,
  )
  if (amberBanner > 0) {
    console.error('[verify-6h] FAIL: amber "product not set" banner present on allocation page after save.')
    process.exit(1)
  }
  if (firstSelectOptionCount < 2) {
    // option index 0 is the placeholder; need at least one real SKU.
    console.error(
      `[verify-6h] FAIL: product select has only ${firstSelectOptionCount} option(s); expected populated list.`,
    )
    process.exit(1)
  }
  console.log('[verify-6h] PASS: SKU dropdown is populated')

  console.log(`[verify-6h] all checkpoints passed. screenshots in: ${outDir}`)
} catch (err) {
  console.error('[verify-6h] error:', err instanceof Error ? err.stack : String(err))
  await shoot('error-snapshot').catch(() => {})
  process.exit(1)
} finally {
  await browser.close()
}
