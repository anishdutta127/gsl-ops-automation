#!/usr/bin/env node
/*
 * NON-DESTRUCTIVE prod walk: confirm a Finance/Admin user can reach PI
 * generation from the installments page (the affordance that moved off the
 * MOU detail page). It logs in, opens a real eligible MOU, and ASSERTS the
 * inline Generate-PI form renders. It does NOT submit the form, so NO real
 * PI is minted (no counter bump, no document).
 *
 * Proves the user-facing claim behind the "all 23 failures are stale" verdict:
 * PI generation is reachable + gated correctly on the installments page in prod.
 *
 * Usage (keep the password out of stored tool calls; run via the `!` prefix):
 *   VERIFY_PASSWORD='<pw>' node scripts/walk-pi-affordance.mjs
 *   (optional) --user <email>  --mou <MOU-ID>  --base <url>
 */
import { chromium } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { writeFileSync } from 'node:fs'
import { resolve, join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '..')
const args = process.argv.slice(2)
const flag = (n, d) => { const i = args.indexOf(`--${n}`); return i < 0 ? d : args[i + 1] }

const BASE = flag('base', 'https://gsl-ops-automation.vercel.app')
const USER = flag('user', process.env.VERIFY_USER ?? 'anish.d@getsetlearn.info')
const PASSWORD = flag('password', process.env.VERIFY_PASSWORD ?? '')
const MOU = flag('mou', 'MOU-STEAM-2627-001')
if (!PASSWORD) { console.error('error: set VERIFY_PASSWORD (or --password).'); process.exit(1) }

const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
const outDir = join(REPO_ROOT, '.verification', `pi-walk-${ts}`)
await mkdir(outDir, { recursive: true })

const checks = []
const ok = (label, cond, detail) => { checks.push({ label, pass: !!cond, detail }); console.log(`  [${cond ? 'PASS' : 'FAIL'}] ${label}${detail ? `  (${detail})` : ''}`) }

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await context.newPage()
try {
  // --- login ---
  const resp = await page.request.post(`${BASE}/api/login`, { multipart: { email: USER, password: PASSWORD }, maxRedirects: 0 })
  if (resp.status() !== 303 && resp.status() !== 302) { console.error(`login failed: HTTP ${resp.status()}`); console.error(await resp.text()); process.exit(1) }
  const m = (resp.headers()['set-cookie'] ?? '').match(/gsl_ops_session=([^;]+)/)
  if (!m) { console.error('login ok but no session cookie'); process.exit(1) }
  await context.addCookies([{ name: 'gsl_ops_session', value: m[1], domain: new URL(BASE).hostname, path: '/', httpOnly: true, secure: true, sameSite: 'Lax' }])
  console.log(`login ok as ${USER}\n`)

  // --- 1) MOU detail page: PI affordance should NOT be here; should link to installments ---
  console.log(`detail page /mous/${MOU}:`)
  const detResp = await page.goto(`${BASE}/mous/${MOU}`, { waitUntil: 'networkidle', timeout: 30000 })
  const detHtml = await page.content()
  await page.screenshot({ path: join(outDir, 'mou-detail.png'), fullPage: true })
  ok('detail page renders (HTTP 200, no crash)', detResp?.status() === 200, `HTTP ${detResp?.status()}`)
  ok('detail page links to /installments (PI generation moved there)', detHtml.includes(`/mous/${MOU}/installments`))
  ok('detail page has NO inline PI-generate form (affordance relocated)', !detHtml.includes('inline-pi-form-'))

  // --- 2) Installments page: the Generate-PI form must render for this authorized user ---
  console.log(`\ninstallments page /mous/${MOU}/installments:`)
  const insResp = await page.goto(`${BASE}/mous/${MOU}/installments`, { waitUntil: 'networkidle', timeout: 30000 })
  const insHtml = await page.content()
  await page.screenshot({ path: join(outDir, 'mou-installments.png'), fullPage: true })
  const piForms = (insHtml.match(/data-testid="inline-pi-form-/g) ?? []).length
  const genButtons = (insHtml.match(/Generate PI/g) ?? []).length
  ok('installments page renders (HTTP 200, no crash)', insResp?.status() === 200, `HTTP ${insResp?.status()}`)
  ok('inline Generate-PI form present (canGeneratePI affordance reachable)', piForms > 0, `${piForms} form(s)`)
  ok('"Generate PI" button label present', genButtons > 0, `${genButtons} occurrence(s)`)
  ok('NO error banner on a clean load (?error= gap fix is dormant)', !insHtml.includes('data-testid="installment-pi-error"'))

  // --- 2b) confirm the friendly ?error= banner DOES surface when redirected with an error (the gap fix) ---
  console.log(`\ninstallments page with ?error=parallel-build-locked:`)
  await page.goto(`${BASE}/mous/${MOU}/installments?error=parallel-build-locked`, { waitUntil: 'networkidle', timeout: 30000 })
  const errHtml = await page.content()
  await page.screenshot({ path: join(outDir, 'mou-installments-error-banner.png'), fullPage: true })
  ok('?error= shows the friendly PI-failure banner (gap fix live)', errHtml.includes('data-testid="installment-pi-error"') && errHtml.includes('locked during the parallel-build window'))

  console.log('\nNOTE: the Generate-PI form was NEVER submitted; no real PI was minted.')
} finally {
  await context.close(); await browser.close()
}

const failed = checks.filter(c => !c.pass)
writeFileSync(join(outDir, 'summary.json'), JSON.stringify({ ts, base: BASE, user: USER, mou: MOU, checks }, null, 2) + '\n')
console.log(`\n${failed.length === 0 ? 'ALL CHECKS PASS' : `${failed.length} CHECK(S) FAILED`} (${checks.length - failed.length}/${checks.length})`)
console.log(`screenshots + summary: ${outDir}`)
process.exit(failed.length ? 1 : 0)
