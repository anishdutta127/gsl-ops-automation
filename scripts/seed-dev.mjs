#!/usr/bin/env node

/*
 * scripts/seed-dev.mjs
 *
 * Seeds the dev environment by copying src/data/_fixtures/*.json into
 * src/data/. Hashes the dev password GSL#123 to bcrypt at write time
 * for users.json (the fixture stores a placeholder marker, never
 * plaintext, never the bcrypt result; the bcrypt result is computed
 * on every seed:dev run and written to src/data/users.json directly).
 *
 * Production safety:
 *   Refuses to run when NODE_ENV === 'production'. Also refuses when
 *   GSL_QUEUE_GITHUB_TOKEN is set (a strong signal we are in a
 *   production-like context where the queue is configured).
 *
 * Idempotency:
 *   Byte-stable across runs. Non-user fixtures are byte-copies of the
 *   tracked _fixtures/ source so they cannot drift. For users.json,
 *   bcrypt is non-deterministic (random salt per call) so naive
 *   re-hashing would create noisy diffs in src/data/users.json on
 *   every run. The transformUsers() pass therefore reads the existing
 *   src/data/users.json before hashing: for each user, if a hash
 *   already exists AND verifies the dev password, the existing hash
 *   is preserved. Only users without a usable existing hash get
 *   freshly hashed.
 *
 *   Pattern chosen because MOU tracks src/data/*.json in git (verified
 *   2026-04-25 in gsl-mou-system); breaking consistency by gitignoring
 *   src/data/ in Ops would diverge inheritance. Option (b) of the
 *   three options surfaced at Item 13 close.
 *
 * Logged output:
 *   For each file: filename, record count, time elapsed. Total at
 *   the end.
 *
 * Wiring: package.json scripts.seed:dev points at this file.
 */

import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { resolve, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import bcrypt from 'bcryptjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = resolve(__filename, '..')
const REPO_ROOT = resolve(__dirname, '..')
const FIXTURES_DIR = resolve(REPO_ROOT, 'src/data/_fixtures')
const DATA_DIR = resolve(REPO_ROOT, 'src/data')

const DEV_PASSWORD = 'GSL#123'
const BCRYPT_COST = 12
const PASSWORD_PLACEHOLDER = 'REPLACE_WITH_BCRYPT_HASH'

// ----------------------------------------------------------------------------
// Production safety
// ----------------------------------------------------------------------------

function assertNotProduction() {
  if (process.env.NODE_ENV === 'production') {
    console.error(
      'seed:dev refusing to run: NODE_ENV is "production". This script overwrites src/data/*.json with fixture data and would obliterate any production state.',
    )
    process.exit(1)
  }
  if (process.env.GSL_QUEUE_GITHUB_TOKEN) {
    console.error(
      'seed:dev refusing to run: GSL_QUEUE_GITHUB_TOKEN is set. This is a production-like context (queue configured). Unset the env var to seed dev fixtures locally.',
    )
    process.exit(1)
  }
}

// ----------------------------------------------------------------------------
// Per-file transforms
// ----------------------------------------------------------------------------

async function transformUsers(records) {
  // Skip-if-already-hashed pattern (option b of the Item 13 close
  // discussion). Read the existing src/data/users.json once; for
  // each user.id, look up its existing hash. If the existing hash
  // still verifies the dev password, preserve it byte-identically.
  // Otherwise hash fresh with random salt.
  //
  // Net effect: re-running seed:dev produces no users.json diff
  // unless the dev password is rotated or a user is added/removed.

  const existingByUserId = new Map()
  try {
    const existingRaw = readFileSync(resolve(DATA_DIR, 'users.json'), 'utf-8')
    const existing = JSON.parse(existingRaw)
    if (Array.isArray(existing)) {
      for (const u of existing) {
        if (
          u && typeof u.id === 'string' && typeof u.passwordHash === 'string'
        ) {
          existingByUserId.set(u.id, u.passwordHash)
        }
      }
    }
  } catch {
    // First run, or file is unreadable / malformed; hash fresh below.
  }

  const out = []
  for (const user of records) {
    // Fixture already carries a real (non-placeholder) hash; uncommon
    // but trust it.
    if (user.passwordHash && user.passwordHash !== PASSWORD_PLACEHOLDER) {
      out.push(user)
      continue
    }

    const existingHash = existingByUserId.get(user.id)
    if (existingHash && existingHash !== PASSWORD_PLACEHOLDER) {
      const verifies = await bcrypt.compare(DEV_PASSWORD, existingHash).catch(() => false)
      if (verifies) {
        out.push({ ...user, passwordHash: existingHash })
        continue
      }
    }

    const hash = await bcrypt.hash(DEV_PASSWORD, BCRYPT_COST)
    out.push({ ...user, passwordHash: hash })
  }
  return out
}

const TRANSFORMS = {
  'users.json': transformUsers,
}

// ----------------------------------------------------------------------------
// Validation
// ----------------------------------------------------------------------------

function validateRecord(filename, value) {
  // Light structural check: most fixtures are arrays; a few are
  // single objects (pi_counter.json). Anything that parses is
  // accepted; the deeper TS-level shape check happens at the
  // consumer (the lib code that reads from src/data).
  if (filename === 'pi_counter.json') {
    if (
      typeof value !== 'object' ||
      value === null ||
      typeof value.fiscalYear !== 'string' ||
      typeof value.next !== 'number' ||
      typeof value.prefix !== 'string'
    ) {
      throw new Error(`pi_counter.json malformed: expected { fiscalYear, next, prefix }`)
    }
    return
  }
  if (!Array.isArray(value)) {
    throw new Error(`${filename}: expected an array, got ${typeof value}`)
  }
}

// ----------------------------------------------------------------------------
// Main
// ----------------------------------------------------------------------------

async function main() {
  assertNotProduction()

  const start = Date.now()
  const fixtureFiles = readdirSync(FIXTURES_DIR).filter((f) => f.endsWith('.json'))

  if (fixtureFiles.length === 0) {
    console.error(`seed:dev: no fixtures found in ${FIXTURES_DIR}`)
    process.exit(1)
  }

  let totalRecords = 0
  console.log(`seed:dev: copying ${fixtureFiles.length} fixture file(s) into src/data/`)
  console.log('')

  for (const filename of fixtureFiles) {
    const fileStart = Date.now()
    const srcPath = resolve(FIXTURES_DIR, filename)
    const dstPath = resolve(DATA_DIR, filename)

    let parsed
    try {
      parsed = JSON.parse(readFileSync(srcPath, 'utf-8'))
    } catch (err) {
      console.error(`  FAIL ${filename}: invalid JSON: ${err.message}`)
      process.exit(1)
    }

    try {
      validateRecord(filename, parsed)
    } catch (err) {
      console.error(`  FAIL ${filename}: ${err.message}`)
      process.exit(1)
    }

    let toWrite = parsed
    const transform = TRANSFORMS[filename]
    if (transform) {
      toWrite = await transform(parsed)
    }

    const recordCount = Array.isArray(toWrite) ? toWrite.length : 1
    totalRecords += recordCount

    writeFileSync(dstPath, JSON.stringify(toWrite, null, 2) + '\n', 'utf-8')

    const elapsed = Date.now() - fileStart
    const padded = basename(filename).padEnd(28)
    const countLabel = String(recordCount).padStart(4)
    console.log(`  ${padded} ${countLabel} record(s)  ${elapsed}ms`)
  }

  const totalElapsed = Date.now() - start
  console.log('')
  console.log(`seed:dev: wrote ${totalRecords} record(s) across ${fixtureFiles.length} files in ${totalElapsed}ms`)
  console.log(`seed:dev: dev password is "${DEV_PASSWORD}" for all ${countUsers()} test users.`)
}

function countUsers() {
  try {
    const data = JSON.parse(readFileSync(resolve(DATA_DIR, 'users.json'), 'utf-8'))
    return Array.isArray(data) ? data.length : 0
  } catch {
    return 0
  }
}

main().catch((err) => {
  console.error('seed:dev failed:', err)
  process.exit(1)
})
