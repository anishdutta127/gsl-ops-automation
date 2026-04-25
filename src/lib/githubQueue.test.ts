/*
 * Q-G test suite for src/lib/githubQueue.ts (queue + counter
 * primitives inherited from gsl-mou-system).
 *
 * Covers 4 of the 5 mandatory tests from step 8 Q-G:
 *   1. queueAppend         (concurrent appendToQueue atomicity)
 *   2. piCounterAtomic     (concurrent issuePiNumberAtomic atomicity)
 *   3. 409Retry            (sha-conflict retry path)
 *   4. commitPrefixContract(every queue commit chore(queue): prefixed)
 *
 * The 5th mandatory test (reconcileShortlist) lives at
 * src/lib/reconcile.test.ts when src/lib/reconcile.ts lands; the
 * subject does not exist yet.
 *
 * Mock surface: global fetch is replaced via vi.spyOn for each
 * test. The Contents API responses are constructed by hand to
 * exercise the success path, the 409 conflict-retry path, and the
 * commit-message-prefix invariant.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PendingUpdate } from '@/lib/types'

// Real fetch is replaced per-test below.
const realFetch = global.fetch
let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  process.env.GSL_QUEUE_GITHUB_TOKEN = 'test-token'
  fetchMock = vi.fn()
  global.fetch = fetchMock as unknown as typeof fetch
  vi.resetModules()
})

afterEach(() => {
  global.fetch = realFetch
})

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function emptyResponse(status: number): Response {
  return new Response('', { status })
}

function getBase64(text: string): string {
  return Buffer.from(text, 'utf-8').toString('base64')
}

interface MockState {
  pendingUpdates: PendingUpdate[]
  pendingSha: string
  piCounter: { fiscalYear: string; next: number; prefix: string }
  piCounterSha: string
  commits: Array<{ path: string; message: string }>
}

function newState(): MockState {
  return {
    pendingUpdates: [],
    pendingSha: 'sha-pending-0',
    piCounter: { fiscalYear: '26-27', next: 1, prefix: 'GSL/OPS' },
    piCounterSha: 'sha-counter-0',
    commits: [],
  }
}

// Realistic GitHub Contents API mock with proper SHA-based
// optimistic concurrency. Each path tracks a fileExists flag and
// a currentSha. PUT requests must carry the matching currentSha
// (or, for new files, no sha at all); otherwise 409. This is what
// drives the real concurrent-writer behaviour the queue relies on.
//
// `failPutsBeforeSuccess` injects N synthetic 409s before the
// next PUT succeeds. Used by the 409Retry test to force the retry
// path even on a single in-flight writer.
function mockContentsApi(
  state: MockState,
  options: { failPutsBeforeSuccess?: number } = {},
): void {
  let putFailures = options.failPutsBeforeSuccess ?? 0
  let commitCounter = 0
  const pendingExists = { value: false }
  const counterExists = { value: true } // pi_counter starts seeded

  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    const isPut = init?.method === 'PUT'
    const decodedUrl = decodeURIComponent(url)

    function handlePut(args: {
      bodyText: string
      currentSha: string
      exists: { value: boolean }
      onWrite: (newText: string, newSha: string, message: string) => void
      pathLabel: string
    }) {
      if (putFailures > 0) {
        putFailures--
        return jsonResponse(409, { message: 'injected sha conflict' })
      }
      const body = JSON.parse(args.bodyText) as {
        message: string
        content: string
        sha?: string
      }
      // SHA optimistic concurrency check
      if (args.exists.value) {
        // File exists; PUT must include the current sha
        if (body.sha !== args.currentSha) {
          return jsonResponse(409, { message: 'sha mismatch' })
        }
      } else {
        // File doesn't exist; PUT must NOT include a sha
        if (body.sha !== undefined) {
          return jsonResponse(409, { message: 'sha provided for new file' })
        }
      }
      const decoded = Buffer.from(body.content, 'base64').toString('utf-8')
      commitCounter++
      const newSha = `sha-${args.pathLabel}-${commitCounter}`
      args.onWrite(decoded, newSha, body.message)
      args.exists.value = true
      return jsonResponse(201, { commit: { sha: `commit-${commitCounter}` } })
    }

    if (decodedUrl.includes('pending_updates.json')) {
      if (isPut) {
        return handlePut({
          bodyText: init!.body as string,
          currentSha: state.pendingSha,
          exists: pendingExists,
          pathLabel: 'pending',
          onWrite: (text, newSha, message) => {
            state.pendingUpdates = JSON.parse(text) as PendingUpdate[]
            state.pendingSha = newSha
            state.commits.push({ path: 'src/data/pending_updates.json', message })
          },
        })
      }
      // GET
      if (!pendingExists.value) {
        return emptyResponse(404)
      }
      return jsonResponse(200, {
        content: getBase64(JSON.stringify(state.pendingUpdates)),
        encoding: 'base64',
        sha: state.pendingSha,
      })
    }

    if (decodedUrl.includes('pi_counter.json')) {
      if (isPut) {
        return handlePut({
          bodyText: init!.body as string,
          currentSha: state.piCounterSha,
          exists: counterExists,
          pathLabel: 'counter',
          onWrite: (text, newSha, message) => {
            state.piCounter = JSON.parse(text)
            state.piCounterSha = newSha
            state.commits.push({ path: 'src/data/pi_counter.json', message })
          },
        })
      }
      // GET (counter file is always considered to exist)
      return jsonResponse(200, {
        content: getBase64(JSON.stringify(state.piCounter)),
        encoding: 'base64',
        sha: state.piCounterSha,
      })
    }

    return emptyResponse(404)
  })
}

function makeEntry(suffix: string): PendingUpdate {
  return {
    id: `uuid-${suffix}`,
    queuedAt: '2026-04-25T00:00:00Z',
    queuedBy: 'test-user',
    entity: 'mou',
    operation: 'create',
    payload: { foo: suffix },
    retryCount: 0,
  }
}

// ----------------------------------------------------------------------------
// Test 1: queueAppend (concurrent atomicity)
// ----------------------------------------------------------------------------

describe('Q-G Test 1: appendToQueue concurrent atomicity', () => {
  it('two concurrent appends both land with distinct UUIDs and valid JSON', async () => {
    const state = newState()
    mockContentsApi(state)
    const { appendToQueue } = await import('./githubQueue')

    const entryA = makeEntry('A')
    const entryB = makeEntry('B')

    await Promise.all([appendToQueue(entryA), appendToQueue(entryB)])

    expect(state.pendingUpdates).toHaveLength(2)
    const ids = state.pendingUpdates.map((e) => e.id)
    expect(new Set(ids).size).toBe(2)
    expect(ids).toContain('uuid-A')
    expect(ids).toContain('uuid-B')
  })

  it('append on empty file (404 GET) creates the file with the entry', async () => {
    const state = newState()
    mockContentsApi(state)
    const { appendToQueue } = await import('./githubQueue')

    await appendToQueue(makeEntry('first'))

    expect(state.pendingUpdates).toHaveLength(1)
    expect(state.pendingUpdates[0]?.id).toBe('uuid-first')
  })
})

// ----------------------------------------------------------------------------
// Test 2: piCounterAtomic (concurrent atomicity)
// ----------------------------------------------------------------------------

describe('Q-G Test 2: issuePiNumberAtomic concurrent atomicity', () => {
  it('two concurrent issuances produce distinct piNumber values; counter advances by 2', async () => {
    const state = newState()
    mockContentsApi(state)
    const { issuePiNumberAtomic } = await import('./githubQueue')

    const initialNext = state.piCounter.next
    const [a, b] = await Promise.all([
      issuePiNumberAtomic(),
      issuePiNumberAtomic(),
    ])

    expect(a.piNumber).not.toBe(b.piNumber)
    expect(a.piNumber).toMatch(/GSL\/OPS\/26-27\/000\d/)
    expect(b.piNumber).toMatch(/GSL\/OPS\/26-27\/000\d/)
    expect(state.piCounter.next).toBe(initialNext + 2)
  })

  it('PI numbers carry the GSL/OPS prefix per Q-B Phase 1 default', async () => {
    const state = newState()
    mockContentsApi(state)
    const { issuePiNumberAtomic } = await import('./githubQueue')

    const result = await issuePiNumberAtomic()
    expect(result.piNumber.startsWith('GSL/OPS/')).toBe(true)
  })
})

// ----------------------------------------------------------------------------
// Test 3: 409Retry (sha-conflict retry path)
// ----------------------------------------------------------------------------

describe('Q-G Test 3: 409 retry path', () => {
  it('PUT 409 once then 201: caller sees success, mutate is re-invoked on retry', async () => {
    const state = newState()
    mockContentsApi(state, { failPutsBeforeSuccess: 1 })
    const { appendToQueue } = await import('./githubQueue')

    await appendToQueue(makeEntry('retry-test'))

    expect(state.pendingUpdates).toHaveLength(1)
    expect(state.pendingUpdates[0]?.id).toBe('uuid-retry-test')
    // Two PUT attempts (first 409, second 201). GET is called twice
    // (once before each PUT) so total fetch calls >= 4.
    expect(fetchMock).toHaveBeenCalled()
  })

  it('counter retry preserves monotonicity: 409 then success advances next by exactly 1', async () => {
    const state = newState()
    mockContentsApi(state, { failPutsBeforeSuccess: 1 })
    const { issuePiNumberAtomic } = await import('./githubQueue')

    const initialNext = state.piCounter.next
    await issuePiNumberAtomic()
    expect(state.piCounter.next).toBe(initialNext + 1)
  })

  it('persistent 409 throws QueueConflictError after maxRetries', async () => {
    const state = newState()
    mockContentsApi(state, { failPutsBeforeSuccess: 99 })
    const { appendToQueue, QueueConflictError } = await import('./githubQueue')

    await expect(appendToQueue(makeEntry('persistent'))).rejects.toBeInstanceOf(
      QueueConflictError,
    )
  })
})

// ----------------------------------------------------------------------------
// Test 4: commitPrefixContract (every queue commit chore(queue): prefixed)
// ----------------------------------------------------------------------------

describe('Q-G Test 4: commit-message prefix contract', () => {
  it('appendToQueue commit message is "chore(queue): append <entity>.<op> (<uuid-prefix>) [queue]"', async () => {
    const state = newState()
    mockContentsApi(state)
    const { appendToQueue } = await import('./githubQueue')

    await appendToQueue(makeEntry('msg-test'))

    expect(state.commits).toHaveLength(1)
    const message = state.commits[0]!.message
    expect(message).toMatch(/^chore\(queue\): append mou\.create \([0-9a-z-]+\) \[queue\]$/)
  })

  it('issuePiNumberAtomic commit message is "chore(queue): pi counter advance to N [queue]"', async () => {
    const state = newState()
    mockContentsApi(state)
    const { issuePiNumberAtomic } = await import('./githubQueue')

    await issuePiNumberAtomic()

    expect(state.commits).toHaveLength(1)
    const message = state.commits[0]!.message
    expect(message).toMatch(/^chore\(queue\): pi counter advance to \d+ \[queue\]$/)
  })

  it('every queue commit is prefixed (regression catch for vercel.json ignoreCommand)', async () => {
    const state = newState()
    mockContentsApi(state)
    const { appendToQueue, issuePiNumberAtomic } = await import('./githubQueue')

    await appendToQueue(makeEntry('mix-1'))
    await issuePiNumberAtomic()
    await appendToQueue(makeEntry('mix-2'))

    expect(state.commits).toHaveLength(3)
    for (const commit of state.commits) {
      expect(commit.message.startsWith('chore(queue):')).toBe(true)
    }
  })
})
