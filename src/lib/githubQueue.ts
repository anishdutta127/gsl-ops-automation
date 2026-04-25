/*
 * GitHub-backed persistence for write paths that can't touch the Vercel
 * serverless filesystem (read-only outside /tmp). Appends to
 * src/data/pending_updates.json via the GitHub Contents API so the
 * self-hosted sync runner can pick the queue up on its next tick.
 *
 * Why the Contents API and not a database: the sync runner already reads
 * from the repo, the team already has GitHub access, and the write rate
 * from a 5-person internal tool (< 100 writes/day peak) fits comfortably
 * inside GitHub's 5000 req/hour PAT limit. No Vercel KV, no external DB.
 *
 * Commits are tagged `[queue]` so vercel.json's ignoreCommand skips
 * rebuilds on queue-only churn; the runner's sync commits (no prefix)
 * trigger the build that surfaces the updated data in the app.
 *
 * 409 semantics: two concurrent writers will both fetch sha S1, both
 * try to PUT with S1, and the second PUT 409s. We refetch and retry
 * with the fresh sha, up to maxRetries with jittered backoff. For
 * counters (pi_counter.json) the mutate callback is re-invoked on each
 * retry so the incremented value reflects the latest state; never
 * re-use a stale N.
 */

import type { PendingUpdate, PiCounter } from './types'

const DEFAULT_REPO = 'anishdutta127/gsl-ops-automation'
const DEFAULT_BRANCH = 'main'

export class QueueNotConfiguredError extends Error {
  constructor() {
    super(
      'GSL_QUEUE_GITHUB_TOKEN is not set. Writes cannot persist without it. ' +
        'Add a fine-grained PAT with Contents:read+write scope in Vercel env and redeploy.',
    )
    this.name = 'QueueNotConfiguredError'
  }
}

export class QueueConflictError extends Error {
  constructor(public readonly path: string, public readonly attempts: number) {
    super(
      `Persistent 409 conflict writing ${path} after ${attempts} attempts. ` +
        `Another writer keeps beating us to the commit; try again in a moment.`,
    )
    this.name = 'QueueConflictError'
  }
}

export class QueueUpstreamError extends Error {
  constructor(
    public readonly path: string,
    public readonly status: number,
    public readonly body: string,
  ) {
    super(`GitHub Contents API ${status} on ${path}: ${body.slice(0, 200)}`)
    this.name = 'QueueUpstreamError'
  }
}

interface GithubContentsGet {
  content: string
  encoding: 'base64'
  sha: string
}

function githubRepo(): string {
  return process.env.GSL_QUEUE_REPO ?? DEFAULT_REPO
}

function githubBranch(): string {
  return process.env.GSL_QUEUE_BRANCH ?? DEFAULT_BRANCH
}

function githubToken(): string {
  const tok = process.env.GSL_QUEUE_GITHUB_TOKEN
  if (!tok) throw new QueueNotConfiguredError()
  return tok
}

function authHeaders(): HeadersInit {
  return {
    Authorization: `Bearer ${githubToken()}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'gsl-ops-automation-queue',
  }
}

async function getFile(path: string): Promise<{ text: string; sha: string } | null> {
  const url =
    `https://api.github.com/repos/${githubRepo()}/contents/${encodeURIComponent(path)}` +
    `?ref=${encodeURIComponent(githubBranch())}`
  const res = await fetch(url, { headers: authHeaders(), cache: 'no-store' })
  if (res.status === 404) return null
  if (!res.ok) {
    throw new QueueUpstreamError(path, res.status, await res.text())
  }
  const body = (await res.json()) as GithubContentsGet
  // atob is available in the Vercel Node runtime; Buffer works too.
  const text = Buffer.from(body.content, 'base64').toString('utf-8')
  return { text, sha: body.sha }
}

async function putFile(
  path: string,
  newText: string,
  sha: string | null,
  message: string,
): Promise<{ status: number; body: string }> {
  const url = `https://api.github.com/repos/${githubRepo()}/contents/${encodeURIComponent(path)}`
  const payload: Record<string, string> = {
    message,
    content: Buffer.from(newText, 'utf-8').toString('base64'),
    branch: githubBranch(),
  }
  if (sha) payload.sha = sha
  const res = await fetch(url, {
    method: 'PUT',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return { status: res.status, body: await res.text() }
}

function jitterMs(): number {
  return 150 + Math.floor(Math.random() * 100) // 150-250ms
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Read-modify-write a JSON file at `path` in the repo. `mutate` is called
 * fresh on every attempt with the current parsed value (or `defaultValue`
 * if the file does not yet exist). Retries up to `maxRetries` on 409.
 */
export async function atomicUpdateJson<T>(
  path: string,
  mutate: (current: T) => { next: T; commitMessage: string },
  options: {
    defaultValue: T
    maxRetries?: number
  },
): Promise<{ next: T; commitSha: string }> {
  const max = options.maxRetries ?? 3
  for (let attempt = 1; attempt <= max; attempt++) {
    const existing = await getFile(path)
    const currentText = existing?.text ?? JSON.stringify(options.defaultValue, null, 2)
    let parsed: T
    try {
      parsed = JSON.parse(currentText) as T
    } catch {
      parsed = options.defaultValue
    }
    const { next, commitMessage } = mutate(parsed)
    const newText = JSON.stringify(next, null, 2) + '\n'
    const { status, body } = await putFile(
      path,
      newText,
      existing?.sha ?? null,
      `${commitMessage} [queue]`,
    )
    if (status === 200 || status === 201) {
      const parsedBody = JSON.parse(body) as { commit?: { sha?: string } }
      return { next, commitSha: parsedBody.commit?.sha ?? '' }
    }
    if (status === 409 || status === 422) {
      // 409 = sha conflict from concurrent writer. 422 surfaces with
      // "does not match" when the sha went stale between fetches.
      if (attempt < max) {
        await sleep(jitterMs())
        continue
      }
      throw new QueueConflictError(path, attempt)
    }
    throw new QueueUpstreamError(path, status, body)
  }
  throw new QueueConflictError(path, max)
}

const PENDING_UPDATES_PATH = 'src/data/pending_updates.json'

/**
 * Append a single entry to the pending_updates queue. Idempotency: the
 * sync runner already dedupes by `entry.id`, so an at-most-once semantic
 * is not required here. Returns the commit sha so the caller can log it.
 */
export async function appendToQueue(entry: PendingUpdate): Promise<{ commitSha: string }> {
  const { commitSha } = await atomicUpdateJson<PendingUpdate[]>(
    PENDING_UPDATES_PATH,
    (current) => {
      const list = Array.isArray(current) ? current : []
      const next = [...list, entry]
      const label = `${entry.entity}.${entry.operation}`
      return {
        next,
        commitMessage: `chore(queue): append ${label} (${entry.id.slice(0, 8)})`,
      }
    },
    { defaultValue: [] as PendingUpdate[], maxRetries: 3 },
  )
  return { commitSha }
}

const PI_COUNTER_PATH = 'src/data/pi_counter.json'
const PI_COUNTER_DEFAULT: PiCounter = { fiscalYear: '26-27', next: 1, prefix: 'GSL/OPS' }

/**
 * Atomic increment of pi_counter.next. The returned piNumber is derived
 * from the value we successfully committed; if the function returns
 * without throwing, that number has not been handed out to anyone else.
 *
 * Retries up to 3 times on 409 with jittered backoff per user policy;
 * PI duplication is a financial-data bug and cheap retries are worth it.
 */
export async function issuePiNumberAtomic(): Promise<{ piNumber: string; counter: PiCounter }> {
  let issuedSeq = 0
  let issuedPrefix = ''
  let issuedFiscal = ''
  const { next } = await atomicUpdateJson<PiCounter>(
    PI_COUNTER_PATH,
    (current) => {
      const c: PiCounter = {
        fiscalYear: current?.fiscalYear ?? PI_COUNTER_DEFAULT.fiscalYear,
        prefix: current?.prefix ?? PI_COUNTER_DEFAULT.prefix,
        next: typeof current?.next === 'number' ? current.next : 1,
      }
      issuedSeq = c.next
      issuedPrefix = c.prefix
      issuedFiscal = c.fiscalYear
      return {
        next: { ...c, next: c.next + 1 },
        commitMessage: `chore(queue): pi counter advance to ${c.next + 1}`,
      }
    },
    { defaultValue: PI_COUNTER_DEFAULT, maxRetries: 3 },
  )
  const piNumber = `${issuedPrefix}/${issuedFiscal}/${String(issuedSeq).padStart(4, '0')}`
  return { piNumber, counter: next }
}
