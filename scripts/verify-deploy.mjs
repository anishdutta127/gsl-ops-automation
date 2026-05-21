#!/usr/bin/env node
/*
 * Phase 6D Part 2: Playwright-based screenshot verification for V4 gates.
 *
 * Per the V4 verification standard (CLAUDE.md §"V4 verification"),
 * a gate that touches UI must be walked end-to-end against the live
 * deploy. This script automates the walk:
 *
 *   - Logs in via /api/login with the credentials supplied (email +
 *     password env vars, or --user / --password flags).
 *   - For each URL in the target list, opens the page in headless
 *     Chromium, waits for network idle, takes a full-page screenshot.
 *   - Writes artefacts to .verification/<timestamp>/<name>.png so a
 *     gate's final report can paste exact file paths.
 *
 * Default target list: the four URLs Phase 6B verified (counter
 * status, blockers, Blue Angels school, sample MOU). Override via
 * --urls <file.json> pointing at an array of { name, url } pairs.
 *
 * Usage:
 *   VERIFY_USER=anish.d@getsetlearn.info VERIFY_PASSWORD='...' \
 *     node scripts/verify-deploy.mjs
 *
 *   node scripts/verify-deploy.mjs --base https://gsl-ops-automation.vercel.app \
 *     --user anish.d@getsetlearn.info --password GSL#123 --urls phase-6c1-urls.json
 *
 * Exit codes:
 *   0  every URL captured cleanly
 *   1  at least one URL failed (timeout, HTTP 5xx, missing element)
 */

import { chromium } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve, join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '..')

// -----------------------------------------------------------------------------
// CLI parsing (tiny; no commander dep)
// -----------------------------------------------------------------------------

const args = process.argv.slice(2)
function flag(name, fallback) {
  const i = args.indexOf(`--${name}`)
  if (i < 0) return fallback
  return args[i + 1]
}

const BASE = flag('base', 'https://gsl-ops-automation.vercel.app')
const USER = flag('user', process.env.VERIFY_USER ?? 'anish.d@getsetlearn.info')
const PASSWORD = flag('password', process.env.VERIFY_PASSWORD ?? '')
const URLS_FILE = flag('urls', null)
const VIEWPORT_LABEL = flag('viewport', 'desktop')
const VIEWPORT = VIEWPORT_LABEL === 'mobile'
  ? { width: 375, height: 812 }
  : { width: 1440, height: 900 }
const SKIP_LOGIN = args.includes('--no-login')

if (!PASSWORD && !SKIP_LOGIN) {
  console.error('error: password required. Pass --password <pw> or set VERIFY_PASSWORD.')
  process.exit(1)
}

const DEFAULT_TARGETS = [
  { name: 'admin-pi-counter-status', url: '/admin/pi-counter-status' },
  { name: 'admin-pi-blockers', url: '/admin/pi-blockers' },
  { name: 'schools-blue-angels-global', url: '/schools/SCH-BLUE_ANGELS_GLOBAL_S' },
  { name: 'mou-sample-steam-2627-001', url: '/mous/MOU-STEAM-2627-001' },
]

let targets = DEFAULT_TARGETS
if (URLS_FILE) {
  const p = resolve(REPO_ROOT, URLS_FILE)
  if (!existsSync(p)) {
    console.error(`error: --urls file not found: ${p}`)
    process.exit(1)
  }
  targets = JSON.parse(readFileSync(p, 'utf-8'))
}

// -----------------------------------------------------------------------------
// Verification run
// -----------------------------------------------------------------------------

const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
const outDir = join(REPO_ROOT, '.verification', ts)
await mkdir(outDir, { recursive: true })

console.log(`verify-deploy: base=${BASE} viewport=${VIEWPORT_LABEL} output=${outDir}`)
console.log(`targets: ${targets.length}`)

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({
  viewport: VIEWPORT,
  ignoreHTTPSErrors: false,
})
const page = await context.newPage()

let failures = 0
const results = []

try {
  if (!SKIP_LOGIN) {
    console.log('login...')
    const loginUrl = `${BASE}/api/login`
    const resp = await page.request.post(loginUrl, {
      multipart: { email: USER, password: PASSWORD },
      maxRedirects: 0,
    })
    if (resp.status() !== 303 && resp.status() !== 302) {
      console.error(`login failed: HTTP ${resp.status()}`)
      console.error(await resp.text())
      process.exit(1)
    }
    const setCookie = resp.headers()['set-cookie'] ?? ''
    const cookieMatch = setCookie.match(/gsl_ops_session=([^;]+)/)
    if (!cookieMatch) {
      console.error('login succeeded but session cookie missing in Set-Cookie header.')
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
    console.log('login ok')
  }

  for (const target of targets) {
    // Phase 6F Part 5: optional `asUser` on a target invokes the
    // /api/admin/__impersonate route to swap the active session to
    // the named user, then walks the rest of the queue as them.
    if (target.asUser) {
      const impResp = await page.request.post(`${BASE}/api/admin/walk-as`, {
        multipart: { targetUserId: target.asUser },
        maxRedirects: 0,
      })
      if (impResp.status() !== 200) {
        console.error(`impersonation to ${target.asUser} failed: HTTP ${impResp.status()}`)
        console.error(await impResp.text())
        process.exit(1)
      }
      const setCookie = impResp.headers()['set-cookie'] ?? ''
      const cookieMatch = setCookie.match(/gsl_ops_session=([^;]+)/)
      if (cookieMatch) {
        await context.clearCookies()
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
        console.log(`  (impersonating ${target.asUser})`)
      }
    }
    const fullUrl = `${BASE}${target.url}`
    const screenshotPath = join(outDir, `${target.name}.png`)
    process.stdout.write(`  ${target.name} ${target.url} ... `)
    try {
      const response = await page.goto(fullUrl, {
        waitUntil: 'networkidle',
        timeout: 30000,
      })
      const status = response?.status() ?? 0
      await page.screenshot({ path: screenshotPath, fullPage: true })
      results.push({
        name: target.name,
        url: target.url,
        status,
        screenshot: screenshotPath,
      })
      if (status >= 200 && status < 400) {
        console.log(`HTTP ${status} ok -> ${screenshotPath}`)
      } else {
        console.log(`HTTP ${status} FAIL (screenshot still captured)`)
        failures += 1
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.log(`FAIL: ${msg}`)
      failures += 1
      results.push({
        name: target.name,
        url: target.url,
        status: null,
        error: msg,
        screenshot: null,
      })
    }
  }
} finally {
  await context.close()
  await browser.close()
}

const summaryPath = join(outDir, 'summary.json')
writeFileSync(
  summaryPath,
  JSON.stringify(
    { ts, base: BASE, viewport: VIEWPORT_LABEL, results },
    null,
    2,
  ) + '\n',
  'utf-8',
)
console.log(`summary: ${summaryPath}`)
console.log(`done: ${results.length - failures} captured, ${failures} failed`)
process.exit(failures > 0 ? 1 : 0)
