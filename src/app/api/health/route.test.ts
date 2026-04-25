import { describe, expect, it } from 'vitest'
import { GET } from './route'

describe('GET /api/health', () => {
  it('returns 200 with status, timestamp, and version', async () => {
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe('ok')
    expect(typeof body.timestamp).toBe('string')
    expect(body.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(typeof body.version).toBe('string')
    expect(body.version).toMatch(/^\d+\.\d+\.\d+/)
  })

  it('returns valid JSON content-type', async () => {
    const res = await GET()
    expect(res.headers.get('content-type')).toContain('application/json')
  })
})
