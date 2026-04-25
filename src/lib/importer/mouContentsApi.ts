/*
 * MOU Contents API GET helper (production deps for fromMou).
 *
 * Reads mous.json + schools.json from the gsl-mou-system repository
 * via the GitHub Contents API. Used as the default
 * `fetchMouMous` / `fetchMouSchools` deps in fromMou.ts; tests inject
 * stubbed loaders directly so this helper itself is not exercised by
 * fromMou.test.ts.
 *
 * Read-only against the upstream repo. Auth via the same
 * GSL_QUEUE_GITHUB_TOKEN that gates the Ops queue's writes (the PAT
 * has read access on both repos in production).
 *
 * Phase 1.1 deferred: SHA pinning + ETag-based conditional GET to
 * reduce rate-limit pressure. At today's <50-MOU/month volume the
 * naive GET-each-tick is fine.
 */

import type { RawMou, RawMouSchool } from './fromMou'

const SOURCE_REPO = 'anishdutta127/gsl-mou-system'
const API_BASE = 'https://api.github.com/repos'

interface ContentsApiResponse {
  content: string
  encoding: string
}

async function fetchContentsJson<T>(path: string): Promise<T> {
  const url = `${API_BASE}/${SOURCE_REPO}/contents/${path}`
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'gsl-ops-automation-importer',
  }
  const token = process.env.GSL_QUEUE_GITHUB_TOKEN
  if (token) headers.Authorization = `Bearer ${token}`

  const res = await fetch(url, { headers })
  if (!res.ok) {
    throw new Error(
      `MOU Contents API ${path}: HTTP ${res.status} ${res.statusText}`,
    )
  }
  const body = (await res.json()) as ContentsApiResponse
  if (body.encoding !== 'base64') {
    throw new Error(
      `MOU Contents API ${path}: unexpected encoding "${body.encoding}" (expected base64)`,
    )
  }
  const decoded = Buffer.from(body.content, 'base64').toString('utf-8')
  return JSON.parse(decoded) as T
}

export async function fetchMouMous(): Promise<RawMou[]> {
  return fetchContentsJson<RawMou[]>('src/data/mous.json')
}

export async function fetchMouSchools(): Promise<RawMouSchool[]> {
  return fetchContentsJson<RawMouSchool[]>('src/data/schools.json')
}
