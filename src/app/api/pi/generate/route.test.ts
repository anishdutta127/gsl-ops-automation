/*
 * /api/pi/generate route handler tests.
 *
 * Mocks generatePi + getCurrentSession. Asserts: success returns
 * 200 + .docx Content-Disposition; user-facing failures redirect
 * 303 with error param; template-missing returns 500 JSON; auth
 * failures redirect to /login.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/lib/pi/generatePi', () => ({
  generatePi: vi.fn(),
}))

vi.mock('@/lib/auth/session', () => ({
  getCurrentSession: vi.fn(),
}))

import { POST } from './route'
import { generatePi } from '@/lib/pi/generatePi'
import { getCurrentSession } from '@/lib/auth/session'
import { TemplateMissingError } from '@/lib/pi/templates'

const generateMock = generatePi as ReturnType<typeof vi.fn>
const sessionMock = getCurrentSession as ReturnType<typeof vi.fn>

function buildRequest(body: Record<string, string>): Request {
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(body)) params.set(k, v)
  return new Request('http://localhost/api/pi/generate', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  })
}

// Existing tests assume the route is ACTIVE. Disable the parallel-build
// lock for the full suite; the lock-default-on case is covered by the
// dedicated 'parallel-build lock' describe block at the bottom.
const ORIGINAL_LOCK = process.env.PI_PARALLEL_BUILD_LOCK
beforeEach(() => {
  vi.clearAllMocks()
  sessionMock.mockResolvedValue({
    sub: 'shubhangi.g', email: 's@example.test', name: 'Shubhangi', role: 'Finance',
  })
  process.env.PI_PARALLEL_BUILD_LOCK = 'false'
})

afterEach(() => {
  if (ORIGINAL_LOCK === undefined) {
    delete process.env.PI_PARALLEL_BUILD_LOCK
  } else {
    process.env.PI_PARALLEL_BUILD_LOCK = ORIGINAL_LOCK
  }
})

describe('POST /api/pi/generate', () => {
  it('happy path: 200 with .docx Content-Disposition + filename derived from PI number', async () => {
    const fakeBytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00, 0x00, 0x00])
    generateMock.mockResolvedValue({
      ok: true,
      piNumber: 'GSL/OPS/26-27/0001',
      payment: { id: 'MOU-X-i1' },
      docxBytes: fakeBytes,
    })
    const res = await POST(buildRequest({ mouId: 'MOU-X', instalmentSeq: '1' }))
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('wordprocessingml')
    const disposition = res.headers.get('content-disposition') ?? ''
    expect(disposition).toContain('attachment')
    expect(disposition).toContain('GSL_OPS_26-27_0001.docx')
  })

  it('lib failure (wrong-status) -> 303 to /mous/<id>/installments with error param', async () => {
    // W4-A.6: gstin-required no longer exists as a failure reason; use
    // wrong-status as the representative non-template failure path.
    generateMock.mockResolvedValue({ ok: false, reason: 'wrong-status' })
    const res = await POST(buildRequest({ mouId: 'MOU-X', instalmentSeq: '1' }))
    expect(res.status).toBe(303)
    const loc = res.headers.get('location') ?? ''
    expect(loc).toContain('/mous/MOU-X/installments')
    expect(loc).toContain('error=wrong-status')
  })

  it('permission denied -> 303 with error=permission', async () => {
    generateMock.mockResolvedValue({ ok: false, reason: 'permission' })
    const res = await POST(buildRequest({ mouId: 'MOU-X', instalmentSeq: '1' }))
    expect(res.headers.get('location')).toContain('error=permission')
  })

  it('template-missing -> 303 with error=template-missing (logs detail to server console)', async () => {
    // 2026-05-19 stabilisation: template-missing was previously a 500
    // JSON; that dropped the user on raw JSON because /mous/[id]/pi
    // submits the form via a browser POST, not a fetch. Now redirects
    // to the page with an error param so the operator sees friendly
    // copy; the missing template path is still logged server-side.
    const consoleErrMock = vi.spyOn(console, 'error').mockImplementation(() => {})
    generateMock.mockResolvedValue({
      ok: false,
      reason: 'template-missing',
      templateError: new TemplateMissingError('pi-v1', 'public/ops-templates/pi-template.docx'),
    })
    const res = await POST(buildRequest({ mouId: 'MOU-X', instalmentSeq: '1' }))
    expect(res.status).toBe(303)
    const loc = res.headers.get('location') ?? ''
    expect(loc).toContain('/mous/MOU-X/installments')
    expect(loc).toContain('error=template-missing')
    expect(consoleErrMock).toHaveBeenCalled()
    consoleErrMock.mockRestore()
  })

  it('missing mouId -> 303 to / (kanban) with error=missing-mou (no lib call)', async () => {
    const res = await POST(buildRequest({ instalmentSeq: '1' }))
    expect(res.headers.get('location')).toContain('error=missing-mou')
    expect(generateMock).not.toHaveBeenCalled()
  })

  it('non-numeric instalmentSeq -> 303 with error=invalid-instalment-seq (no lib call)', async () => {
    const res = await POST(buildRequest({ mouId: 'MOU-X', instalmentSeq: 'abc' }))
    expect(res.headers.get('location')).toContain('error=invalid-instalment-seq')
    expect(generateMock).not.toHaveBeenCalled()
  })

  it('rejects unauthenticated request to /login with next preserved', async () => {
    sessionMock.mockResolvedValue(null)
    const res = await POST(buildRequest({ mouId: 'MOU-X', instalmentSeq: '1' }))
    const loc = res.headers.get('location') ?? ''
    expect(loc).toContain('/login')
    expect(loc).toContain('next=%2Fmous%2FMOU-X')
  })
})

describe('POST /api/pi/generate: parallel-build lock', () => {
  // These tests deliberately do NOT inherit the suite-level beforeEach
  // that disables the lock; they manage the env var themselves.
  const SAVE_LOCK = process.env.PI_PARALLEL_BUILD_LOCK

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    if (SAVE_LOCK === undefined) {
      delete process.env.PI_PARALLEL_BUILD_LOCK
    } else {
      process.env.PI_PARALLEL_BUILD_LOCK = SAVE_LOCK
    }
  })

  it('redirects with error=parallel-build-locked when lock env is unset (fail-closed default)', async () => {
    // 2026-05-19 stabilisation: lock used to return 503 JSON which
    // dropped the user on raw JSON when the form was browser-POSTed.
    // Now redirects to the page-level lock banner instead. The
    // counter is still never advanced (generatePi is not invoked).
    delete process.env.PI_PARALLEL_BUILD_LOCK
    const res = await POST(buildRequest({ mouId: 'MOU-X', instalmentSeq: '1' }))
    expect(res.status).toBe(303)
    const loc = res.headers.get('location') ?? ''
    expect(loc).toContain('/mous/MOU-X/installments')
    expect(loc).toContain('error=parallel-build-locked')
    expect(generateMock).not.toHaveBeenCalled()
  })

  it('redirects with error=parallel-build-locked when lock env is empty (fail-closed)', async () => {
    process.env.PI_PARALLEL_BUILD_LOCK = ''
    const res = await POST(buildRequest({ mouId: 'MOU-X', instalmentSeq: '1' }))
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toContain('error=parallel-build-locked')
    expect(generateMock).not.toHaveBeenCalled()
  })

  it("redirects with error=parallel-build-locked when lock env is 'true' (explicit lock-on)", async () => {
    process.env.PI_PARALLEL_BUILD_LOCK = 'true'
    const res = await POST(buildRequest({ mouId: 'MOU-X', instalmentSeq: '1' }))
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toContain('error=parallel-build-locked')
    expect(generateMock).not.toHaveBeenCalled()
  })

  it("does NOT advance counter when locked (generatePi never invoked)", async () => {
    delete process.env.PI_PARALLEL_BUILD_LOCK
    await POST(buildRequest({ mouId: 'MOU-X', instalmentSeq: '1' }))
    expect(generateMock).not.toHaveBeenCalled()
  })

  it("activates the route at Gate 5 cutover (PI_PARALLEL_BUILD_LOCK=false)", async () => {
    process.env.PI_PARALLEL_BUILD_LOCK = 'false'
    sessionMock.mockResolvedValue({
      sub: 'shubhangi.g', email: 's@example.test', name: 'Shubhangi', role: 'Finance',
    })
    generateMock.mockResolvedValue({
      ok: true,
      piNumber: 'MTPL/UP/26-27/0017',
      payment: { id: 'MOU-X-i1' },
      docxBytes: new Uint8Array([0x50, 0x4b]),
    })
    const res = await POST(buildRequest({ mouId: 'MOU-X', instalmentSeq: '1' }))
    expect(res.status).toBe(200)
    expect(generateMock).toHaveBeenCalledTimes(1)
  })

  it('lock check fires BEFORE auth (no session leak via 401 timing)', async () => {
    delete process.env.PI_PARALLEL_BUILD_LOCK
    sessionMock.mockResolvedValue(null)
    const res = await POST(buildRequest({ mouId: 'MOU-X', instalmentSeq: '1' }))
    // Locked redirect goes to /mous/<id>/installments?error=parallel-build-locked,
    // NOT to /login. Lock check is the first gate; an unauthenticated
    // caller learns the route is locked before learning they need to
    // log in.
    expect(res.status).toBe(303)
    const loc = res.headers.get('location') ?? ''
    expect(loc).toContain('/mous/MOU-X/installments')
    expect(loc).toContain('error=parallel-build-locked')
    expect(loc).not.toContain('/login')
  })
})
