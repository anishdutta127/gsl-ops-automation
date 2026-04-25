import { describe, expect, it } from 'vitest'
import { POST } from './route'

describe('POST /api/logout', () => {
  it('303 redirects to /login and clears the session cookie', async () => {
    const req = new Request('http://localhost/api/logout', { method: 'POST' })
    const res = await POST(req)
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toBe('http://localhost/login')
    const setCookie = res.headers.get('set-cookie') ?? ''
    expect(setCookie).toContain('gsl_ops_session=')
    expect(setCookie.toLowerCase()).toMatch(/max-age=0|expires=/)
  })
})
